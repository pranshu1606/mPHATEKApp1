data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

# Latest Canonical Ubuntu 24.04 LTS for Arm (Graviton). Includes the SSM agent.
data "aws_ami" "ubuntu_arm" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

# AWS-managed list of the IP ranges CloudFront uses to reach origins.
data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# ---------------------------------------------------------------------------
# Network: HTTPS only from CloudFront; port 80 open only for Let's Encrypt
# HTTP-01 challenges (Caddy redirects everything else). No SSH — use SSM.
# ---------------------------------------------------------------------------

resource "aws_security_group" "origin" {
  name        = "${var.project}-origin"
  description = "Origin VM: HTTPS from CloudFront only, HTTP for ACME"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "https_from_cloudfront" {
  security_group_id = aws_security_group.origin.id
  description       = "HTTPS from CloudFront edge (managed prefix list)"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_ingress_rule" "http_acme_v4" {
  security_group_id = aws_security_group.origin.id
  description       = "Let's Encrypt HTTP-01 challenge"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "all_v4" {
  security_group_id = aws_security_group.origin.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ---------------------------------------------------------------------------
# Instance role: SSM (shell access + deploys without SSH) and backup uploads
# ---------------------------------------------------------------------------

resource "aws_iam_role" "origin" {
  name = "${var.project}-origin"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "origin_ssm" {
  role       = aws_iam_role.origin.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "origin_backups" {
  name = "write-backups"
  role = aws_iam_role.origin.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = "${aws_s3_bucket.backups.arn}/*"
    }]
  })
}

resource "aws_iam_instance_profile" "origin" {
  name = "${var.project}-origin"
  role = aws_iam_role.origin.name
}

# ---------------------------------------------------------------------------
# The VM
# ---------------------------------------------------------------------------

resource "aws_instance" "origin" {
  ami                    = data.aws_ami.ubuntu_arm.id
  instance_type          = var.instance_type
  iam_instance_profile   = aws_iam_instance_profile.origin.name
  vpc_security_group_ids = [aws_security_group.origin.id]

  # Never pay for burst: throttle to baseline instead of buying extra CPU credits.
  credit_specification {
    cpu_credits = "standard"
  }

  # IMDSv2 only; hop limit 2 so containers (backup uploader) can use the instance role.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    duckdns_subdomain = var.duckdns_subdomain
    duckdns_token     = var.duckdns_token
    repo_url          = "https://github.com/${var.github_repo}.git"
    repo_ref          = var.repo_ref
  })
  user_data_replace_on_change = false

  tags = {
    Name = "${var.project}-origin"
  }

  lifecycle {
    # A newer Ubuntu AMI must not silently replace the running server.
    ignore_changes = [ami, user_data]
  }
}

# Stable public IP so DNS and CloudFront keep pointing at the same address.
resource "aws_eip" "origin" {
  instance = aws_instance.origin.id
  domain   = "vpc"

  tags = {
    Name = "${var.project}-origin"
  }
}

# ---------------------------------------------------------------------------
# Off-instance backups
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "backups" {
  bucket        = "${var.project}-backups-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"

    filter {}

    expiration {
      days = 14
    }
  }
}

output "public_url" {
  description = "Set as PUBLIC_URL in the VM's .env and as the PUBLIC_URL GitHub variable."
  value       = "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "oauth_callback_urls" {
  description = "Register these in the GitHub / Google OAuth app settings."
  value = [
    "https://${aws_cloudfront_distribution.app.domain_name}/api/auth/callback/github",
    "https://${aws_cloudfront_distribution.app.domain_name}/api/auth/callback/google",
  ]
}

output "origin_host" {
  description = "Set as ORIGIN_HOST in the VM's .env and as the ORIGIN_HOST GitHub variable."
  value       = local.origin_domain
}

output "origin_public_ip" {
  description = "Elastic IP of the origin VM (DuckDNS should resolve to this)."
  value       = aws_eip.origin.public_ip
}

output "ec2_instance_id" {
  description = "Set as the EC2_INSTANCE_ID GitHub variable."
  value       = aws_instance.origin.id
}

output "aws_region" {
  description = "Set as the AWS_REGION GitHub variable."
  value       = var.aws_region
}

output "github_deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN GitHub variable."
  value       = aws_iam_role.github_deploy.arn
}

output "backup_s3_uri" {
  description = "Set as BACKUP_S3_URI in the VM's .env."
  value       = "s3://${aws_s3_bucket.backups.id}"
}

output "distribution_id" {
  description = "CloudFront distribution ID (for manual invalidations or the AWS console)."
  value       = aws_cloudfront_distribution.app.id
}

output "ssm_session_command" {
  description = "Open a shell on the VM without SSH."
  value       = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.origin.id}"
}

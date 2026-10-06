locals {
  origin_id     = "ec2-origin"
  origin_domain = "${var.duckdns_subdomain}.duckdns.org"
}

# ---------------------------------------------------------------------------
# AWS-managed cache / origin request policies
# ---------------------------------------------------------------------------

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards cookies, query strings and all viewer headers (plus CloudFront-Viewer-*
# geo headers) but keeps Host as the origin's own name so TLS/SNI to Caddy matches.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# ---------------------------------------------------------------------------
# Edge response headers: security headers + Server-Timing (shows edge POP and
# cache hit/miss in browser DevTools)
# ---------------------------------------------------------------------------

resource "aws_cloudfront_response_headers_policy" "edge" {
  name    = "${var.project}-edge-headers"
  comment = "Security headers and Server-Timing added at the edge"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    xss_protection {
      protection = true
      mode_block = true
      override   = true
    }
  }

  server_timing_headers_config {
    enabled       = true
    sampling_rate = 100
  }

  remove_headers_config {
    items {
      header = "x-powered-by"
    }
  }
}

# ---------------------------------------------------------------------------
# Edge compute: block scanner probes before they reach the origin
# ---------------------------------------------------------------------------

resource "aws_cloudfront_function" "edge_guard" {
  name    = "${var.project}-edge-guard"
  runtime = "cloudfront-js-2.0"
  comment = "Rejects common exploit/scanner paths at the edge"
  publish = true
  code    = file("${path.module}/../cloudfront-function.js")
}

# ---------------------------------------------------------------------------
# Distribution
# ---------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = var.price_class
  comment         = "${var.project} — EC2 origin"

  origin {
    origin_id   = local.origin_id
    domain_name = local.origin_domain

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = var.origin_read_timeout
      origin_keepalive_timeout = 5
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_verify_secret
    }
  }

  # Hashed, immutable Next.js build assets: cache at the edge for as long as the
  # origin allows (Next sends max-age=31536000, immutable).
  ordered_cache_behavior {
    path_pattern               = "/_next/static/*"
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.edge.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.edge_guard.arn
    }
  }

  # API routes: never cached, every method, cookies + query strings forwarded.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.edge.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.edge_guard.arn
    }
  }

  # Pages: server-rendered per session, so not cached — but still terminated at
  # the nearest edge (TLS, HTTP/3, compression) and carried over AWS's backbone.
  default_cache_behavior {
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.edge.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.edge_guard.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = var.geo_restriction_type
      locations        = var.geo_restriction_locations
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# ---------------------------------------------------------------------------
# Cost guardrail
# ---------------------------------------------------------------------------

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = var.budget_limit_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Measure gross usage (credits excluded) so alerts show how fast credits burn.
  cost_types {
    include_credit = false
    include_refund = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

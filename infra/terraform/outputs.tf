output "cloudfront_domain" {
  description = "The public *.cloudfront.net hostname."
  value       = aws_cloudfront_distribution.app.domain_name
}

output "public_url" {
  description = "Set this as PUBLIC_URL in the VM's .env and use it for OAuth callbacks."
  value       = "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "distribution_id" {
  description = "Distribution ID (for manual invalidations or the AWS console)."
  value       = aws_cloudfront_distribution.app.id
}

output "oauth_callback_urls" {
  description = "Register these in the GitHub / Google OAuth app settings."
  value = [
    "https://${aws_cloudfront_distribution.app.domain_name}/api/auth/callback/github",
    "https://${aws_cloudfront_distribution.app.domain_name}/api/auth/callback/google",
  ]
}

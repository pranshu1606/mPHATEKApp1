variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "resume-portal"
}

variable "aws_region" {
  description = "Region for the AWS provider (CloudFront control plane is us-east-1)."
  type        = string
  default     = "us-east-1"
}

variable "origin_domain" {
  description = "Public hostname of the origin VM (CloudFront does not accept raw IPs), e.g. yourapp.duckdns.org."
  type        = string
}

variable "origin_verify_secret" {
  description = "Shared secret sent as X-Origin-Verify to the origin; must match ORIGIN_VERIFY_SECRET on the VM."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.origin_verify_secret) >= 32
    error_message = "Use at least 32 characters (e.g. `openssl rand -hex 32`)."
  }
}

variable "price_class" {
  description = "Edge locations to use: PriceClass_All (every edge), PriceClass_200, or PriceClass_100 (NA/EU only)."
  type        = string
  default     = "PriceClass_All"
}

variable "origin_read_timeout" {
  description = "Seconds CloudFront waits for the origin. Resume parsing + embedding can be slow; 60 is the max without a quota increase."
  type        = number
  default     = 60
}

variable "geo_restriction_type" {
  description = "none, whitelist, or blacklist."
  type        = string
  default     = "none"
}

variable "geo_restriction_locations" {
  description = "ISO 3166-1 alpha-2 country codes for the geo restriction (ignored when type is none)."
  type        = list(string)
  default     = []
}

variable "budget_limit_usd" {
  description = "Monthly AWS budget; alerts fire on any actual spend and when forecast exceeds this."
  type        = string
  default     = "1.0"
}

variable "alert_email" {
  description = "Email that receives budget alerts."
  type        = string
}

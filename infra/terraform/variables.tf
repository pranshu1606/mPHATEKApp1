variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "resume-portal"
}

variable "aws_region" {
  description = "Region for the EC2 origin (ap-south-1 = Mumbai)."
  type        = string
  default     = "ap-south-1"
}

# --- Origin VM ---------------------------------------------------------------

variable "instance_type" {
  description = "EC2 instance type. t4g.small (2 vCPU / 2 GB, Arm) fits the stack; t4g.micro (1 GB) is cheaper but tight."
  type        = string
  default     = "t4g.small"
}

variable "root_volume_gb" {
  description = "Root EBS volume size (gp3)."
  type        = number
  default     = 20
}

variable "github_repo" {
  description = "GitHub repository (owner/name) the VM clones and that is allowed to deploy via OIDC."
  type        = string
  default     = "pranshu1606/mPHATEKApp1"
}

variable "repo_ref" {
  description = "Branch the VM checks out on first boot."
  type        = string
  default     = "main"
}

variable "duckdns_subdomain" {
  description = "DuckDNS subdomain (the part before .duckdns.org) pointing at the VM."
  type        = string
}

variable "duckdns_token" {
  description = "DuckDNS account token, used by the VM to keep its DNS record updated."
  type        = string
  sensitive   = true
}

# --- Edge ----------------------------------------------------------------------

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

# --- Cost guardrail ------------------------------------------------------------

variable "budget_limit_usd" {
  description = "Expected monthly spend BEFORE credits. Alerts at 80% actual and 100% forecast so you can track credit burn."
  type        = string
  default     = "15"
}

variable "alert_email" {
  description = "Email that receives budget alerts."
  type        = string
}

variable "project_name" {
  type        = string
  description = "Name of the project used for S3 bucket naming"

  validation {
    condition     = length(var.project_name) <= 30
    error_message = "Project name must be 30 characters or less"
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment (production, staging, development)"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development"
  }
}

variable "region" {
  type        = string
  description = "AWS region for S3 bucket deployment"
  default     = "us-east-1"
}

variable "force_destroy" {
  type        = bool
  description = "Allow destruction of non-empty bucket"
  default     = false
}

variable "versioning_enabled" {
  type        = bool
  description = "Enable versioning for S3 bucket"
  default     = true
}

variable "lifecycle_rules" {
  type = map(object({
    days_to_transition  = number
    days_to_expiration = number
  }))
  description = "Lifecycle rules for call recordings"
  default = {
    call_recordings = {
      days_to_transition  = 90  # Move to cheaper storage after 90 days
      days_to_expiration = 1095 # Delete after 3 years (1095 days)
    }
  }
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for S3 bucket"
  default = {
    Project    = "DocShield-Voice-Agent"
    ManagedBy  = "Terraform"
  }
}
# Core Application Variables
variable "app_name" {
  type        = string
  description = "Base name for the DocShield Voice Agent application"
  validation {
    condition     = length(var.app_name) <= 30
    error_message = "App name must be 30 characters or less"
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

# AWS Configuration
variable "aws_region" {
  type        = string
  description = "AWS region for S3 bucket deployment"
  default     = "us-east-1"
}

# Heroku Configuration
variable "heroku_dyno_size" {
  type        = string
  description = "Size of Heroku worker dynos"
  default     = "eco"
  validation {
    condition     = contains(["eco", "basic", "standard-1x", "standard-2x"], var.heroku_dyno_size)
    error_message = "Invalid dyno size specified"
  }
}

variable "heroku_dyno_quantity" {
  type        = number
  description = "Number of worker dynos to run"
  default     = 1
  validation {
    condition     = var.heroku_dyno_quantity > 0 && var.heroku_dyno_quantity <= 10
    error_message = "Dyno quantity must be between 1 and 10"
  }
}

# MongoDB Atlas Configuration
variable "mongodb_project_id" {
  type        = string
  description = "MongoDB Atlas project identifier"
  sensitive   = true
}

variable "mongodb_instance_size" {
  type        = string
  description = "MongoDB Atlas cluster instance size"
  default     = "M10"
  validation {
    condition     = contains(["M10", "M20", "M30"], var.mongodb_instance_size)
    error_message = "Instance size must be one of: M10, M20, M30"
  }
}

variable "mongodb_version" {
  type        = string
  description = "MongoDB version for Atlas cluster"
  default     = "6.0"
}

# Redis Cloud Configuration
variable "redis_memory_limit_mb" {
  type        = number
  description = "Redis Cloud instance memory limit in MB"
  default     = 100
  validation {
    condition     = var.redis_memory_limit_mb >= 100
    error_message = "Redis memory limit must be at least 100MB"
  }
}

# S3 Storage Configuration
variable "s3_bucket_prefix" {
  type        = string
  description = "Prefix for S3 bucket name"
  default     = "docshield-voice-recordings"
}

# Security Configuration
variable "allowed_cidr_blocks" {
  type        = list(string)
  description = "List of CIDR blocks allowed to access MongoDB and Redis"
  default     = []
}

# Resource Tagging
variable "tags" {
  type        = map(string)
  description = "Common resource tags"
  default = {
    Project    = "DocShield-Voice-Agent"
    ManagedBy  = "Terraform"
  }
}
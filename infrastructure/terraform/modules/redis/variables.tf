# Redis Cloud subscription name variable
variable "redis_name" {
  type        = string
  description = "Name of the Redis Cloud subscription"
  
  validation {
    condition     = length(var.redis_name) <= 40
    error_message = "Redis subscription name must be 40 characters or less"
  }
}

# Deployment environment variable
variable "environment" {
  type        = string
  description = "Deployment environment (production, staging, development)"
  
  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development"
  }
}

# Redis memory limit variable
variable "redis_memory_limit" {
  type        = number
  description = "Memory limit in MB for Redis Cloud instance"
  default     = 100 # Default 100MB as per technical spec
  
  validation {
    condition     = var.redis_memory_limit >= 100
    error_message = "Redis memory limit must be at least 100MB"
  }
}

# AWS account ID for VPC peering
variable "aws_account_id" {
  type        = string
  description = "AWS account ID for VPC peering"
  sensitive   = true # Marked sensitive to prevent exposure in logs
  
  validation {
    condition     = can(regex("^\\d{12}$", var.aws_account_id))
    error_message = "AWS account ID must be 12 digits"
  }
}

# VPC ID for Redis Cloud VPC peering
variable "vpc_id" {
  type        = string
  description = "VPC ID for Redis Cloud VPC peering"
  
  validation {
    condition     = can(regex("^vpc-[a-f0-9]{8,17}$", var.vpc_id))
    error_message = "Invalid VPC ID format"
  }
}

# VPC CIDR block for Redis Cloud VPC peering
variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block for Redis Cloud VPC peering"
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "Invalid CIDR block format"
  }
}
# Backend Configuration for Terraform State Management
# Configures S3 for state storage and DynamoDB for state locking
# Version: 1.0.0
# Last Updated: 2024

terraform {
  backend "s3" {
    # S3 bucket for state storage with environment-specific naming
    bucket = "docshield-terraform-state-${var.environment}"
    
    # State file path within the bucket
    key = "voice-agent/terraform.tfstate"
    
    # AWS region for the backend resources
    region = "${var.aws_region}"
    
    # Enable encryption at rest for state file
    encrypt = true
    
    # DynamoDB table for state locking
    dynamodb_table = "docshield-terraform-locks-${var.environment}"
    
    # Environment-specific workspace management
    workspace_key_prefix = "${var.environment}"
    
    # Enable versioning for state history
    versioning = true
    
    # Additional security configurations
    force_path_style = false
    sse_algorithm    = "AES256"
    
    # Access logging configuration
    access_log {
      target_bucket = "docshield-terraform-logs-${var.environment}"
      target_prefix = "state-access-logs/"
    }
  }
}
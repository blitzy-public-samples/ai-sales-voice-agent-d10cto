# Application Configuration
app_name = "docshield-voice-agent-dev"
environment = "development"

# AWS Configuration
aws_region = "us-east-1"

# Heroku Configuration 
heroku_dyno_size = "eco"
heroku_dyno_quantity = 1

# MongoDB Configuration
mongodb_instance_size = "M10"
mongodb_version = "6.0"

# Redis Configuration
redis_memory_limit_mb = 100

# S3 Configuration
s3_bucket_prefix = "docshield-voice-recordings-dev"

# Network Configuration
allowed_cidr_blocks = ["0.0.0.0/0"]

# Resource Tags
tags = {
  Project     = "DocShield-Voice-Agent"
  Environment = "development"
  ManagedBy   = "Terraform"
}
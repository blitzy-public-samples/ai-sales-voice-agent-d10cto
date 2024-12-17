# AWS Provider version ~> 4.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Main S3 bucket for storing call recordings and transcripts
resource "aws_s3_bucket" "recordings_bucket" {
  bucket = "${var.project_name}-${var.environment}-recordings"
  
  # Allow bucket destruction only in non-production environments
  force_destroy = var.environment != "production" ? var.force_destroy : false

  # Comprehensive tagging for resource management
  tags = merge(
    var.tags,
    {
      Name           = "${var.project_name}-${var.environment}-recordings"
      Environment    = var.environment
      Purpose        = "Call recordings storage"
      SecurityLevel  = "Sensitive"
      DataRetention  = "3-years"
      DataType       = "Voice Recordings & Transcripts"
      Encryption     = "AES-256"
      Compliance     = "HIPAA-Eligible"
    }
  )
}

# Enable versioning for data protection and recovery
resource "aws_s3_bucket_versioning" "recordings_versioning" {
  bucket = aws_s3_bucket.recordings_bucket.id
  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}

# Configure server-side encryption with AES-256
resource "aws_s3_bucket_server_side_encryption_configuration" "recordings_encryption" {
  bucket = aws_s3_bucket.recordings_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block all public access for security
resource "aws_s3_bucket_public_access_block" "recordings_public_access" {
  bucket = aws_s3_bucket.recordings_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Configure lifecycle rules for cost optimization and data retention
resource "aws_s3_bucket_lifecycle_configuration" "recordings_lifecycle" {
  bucket = aws_s3_bucket.recordings_bucket.id

  # Dynamic lifecycle rules based on variable input
  dynamic "rule" {
    for_each = var.lifecycle_rules
    content {
      id     = rule.key
      status = "Enabled"

      # Transition to cheaper storage class
      transition {
        days          = rule.value.days_to_transition
        storage_class = "STANDARD_IA"
      }

      # Object expiration
      expiration {
        days = rule.value.days_to_expiration
      }

      # Clean up incomplete multipart uploads
      abort_incomplete_multipart_upload {
        days_after_initiation = 7
      }

      # Expire old versions
      noncurrent_version_expiration {
        noncurrent_days = 90
      }
    }
  }
}

# Configure CORS if needed for web access
resource "aws_s3_bucket_cors_configuration" "recordings_cors" {
  bucket = aws_s3_bucket.recordings_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["https://*.${var.project_name}.com"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Enable bucket logging for audit purposes
resource "aws_s3_bucket_logging" "recordings_logging" {
  bucket = aws_s3_bucket.recordings_bucket.id

  target_bucket = aws_s3_bucket.recordings_bucket.id
  target_prefix = "access-logs/"
}

# Output the bucket details for other modules
output "bucket_id" {
  description = "The ID of the S3 bucket"
  value       = aws_s3_bucket.recordings_bucket.id
}

output "bucket_arn" {
  description = "The ARN of the S3 bucket"
  value       = aws_s3_bucket.recordings_bucket.arn
}

output "bucket_domain_name" {
  description = "The domain name of the S3 bucket"
  value       = aws_s3_bucket.recordings_bucket.bucket_domain_name
}
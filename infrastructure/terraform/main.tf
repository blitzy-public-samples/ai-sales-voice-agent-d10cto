# DocShield AI Voice Agent Infrastructure
# Terraform configuration for deploying core infrastructure components
# Version: 1.0.0

# Required provider versions
terraform {
  required_providers {
    heroku = {
      source  = "heroku/heroku"
      version = "~> 5.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    rediscloud = {
      source  = "rediscloud/rediscloud"
      version = "~> 1.0"
    }
  }
  required_version = ">= 1.0.0"
}

# Local variables for common tags and naming
locals {
  common_tags = {
    Environment = var.environment
    Project     = "DocShield-Voice-Agent"
    ManagedBy   = "Terraform"
  }

  name_prefix = "${var.app_name}-${var.environment}"
}

# Heroku Worker Application
resource "heroku_app" "worker" {
  name   = local.name_prefix
  region = var.region
  stack  = "container"

  config_vars = {
    NODE_ENV   = var.environment
    LOG_LEVEL  = "info"
    APP_NAME   = var.app_name
  }

  sensitive_config_vars = {
    MONGODB_URI = mongodbatlas_cluster.main.connection_strings[0].standard
    REDIS_URL   = rediscloud_subscription.queue.database_password
  }

  tags = local.common_tags
}

# Heroku Worker Formation
resource "heroku_formation" "worker" {
  app      = heroku_app.worker.name
  type     = "worker"
  quantity = 1
  size     = "eco"

  depends_on = [heroku_app.worker]
}

# MongoDB Atlas Cluster
resource "mongodbatlas_cluster" "main" {
  project_id   = var.mongodb_project_id
  name         = local.name_prefix
  cluster_type = "REPLICASET"

  # Provider Settings
  provider_name               = "AWS"
  provider_instance_size_name = "M10"
  provider_region_name        = var.region

  # Backup Configuration
  backup_enabled = true
  pit_enabled    = true

  # Advanced Configuration
  auto_scaling_disk_gb_enabled = true
  mongo_db_major_version      = "5.0"

  # Replication Configuration
  replication_specs {
    num_shards = 1
    regions_config {
      region_name     = var.region
      electable_nodes = 3
      priority        = 7
      read_only_nodes = 0
    }
  }

  tags = local.common_tags
}

# Redis Cloud Subscription
resource "rediscloud_subscription" "queue" {
  name              = local.name_prefix
  memory_storage    = "100"
  payment_method    = "credit_card"
  cloud_provider    = "AWS"
  cloud_provider_region = var.region

  database {
    name                = "queue"
    protocol           = "redis"
    memory_limit_in_gb = 0.1
    data_persistence   = "aof-every-1-second"
    throughput_measurement_by = "operations-per-second"
    throughput_measurement_value = 1000
  }
}

# AWS S3 Bucket for Call Recordings
resource "aws_s3_bucket" "recordings" {
  bucket = "${local.name_prefix}-recordings"
  acl    = "private"

  versioning {
    enabled = true
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  lifecycle_rule {
    enabled = true

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }

  tags = local.common_tags
}

# S3 Bucket Policy
resource "aws_s3_bucket_policy" "recordings" {
  bucket = aws_s3_bucket.recordings.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceHTTPS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [
          aws_s3_bucket.recordings.arn,
          "${aws_s3_bucket.recordings.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport": "false"
          }
        }
      }
    ]
  })
}

# Output Values
output "s3_bucket_name" {
  description = "Name of the S3 bucket for call recordings"
  value       = aws_s3_bucket.recordings.id
}

output "mongodb_connection_string" {
  description = "MongoDB Atlas connection string"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis Cloud endpoint"
  value       = rediscloud_subscription.queue.database_endpoint
  sensitive   = true
}

output "heroku_app_name" {
  description = "Heroku application name"
  value       = heroku_app.worker.name
}
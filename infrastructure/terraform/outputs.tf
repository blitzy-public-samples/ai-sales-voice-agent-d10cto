# S3 Storage Outputs
output "s3_bucket_name" {
  description = "Name of the S3 bucket used for storing call recordings and transcripts"
  value       = module.s3.bucket_name
  sensitive   = false
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket used for storing call recordings and transcripts"
  value       = module.s3.bucket_arn
  sensitive   = false
}

# MongoDB Atlas Outputs
output "mongodb_connection_string" {
  description = "MongoDB Atlas connection string for accessing the campaign database"
  value       = module.mongodb.connection_string
  sensitive   = true # Marked sensitive to prevent exposure in logs
}

output "mongodb_database_name" {
  description = "Name of the MongoDB database storing campaign data"
  value       = module.mongodb.database_name
  sensitive   = false
}

# Redis Cloud Outputs
output "redis_connection_string" {
  description = "Redis Cloud connection string for job queue management"
  value       = module.redis.connection_string
  sensitive   = true # Marked sensitive to prevent exposure in logs
}

output "redis_port" {
  description = "Redis Cloud port number for queue connections"
  value       = module.redis.port
  sensitive   = false
}

# General Infrastructure Outputs
output "deployment_region" {
  description = "AWS region where the infrastructure is deployed"
  value       = module.s3.region
  sensitive   = false
}

# Tags Output
output "resource_tags" {
  description = "Common tags applied to all resources"
  value = {
    Environment = "production"
    Project     = "docshield-voice-agent"
    ManagedBy   = "terraform"
  }
  sensitive = false
}

# Monitoring Outputs
output "monitoring_endpoints" {
  description = "Endpoints for infrastructure monitoring"
  value = {
    mongodb_monitoring = module.mongodb.monitoring_endpoint
    redis_monitoring   = module.redis.monitoring_endpoint
    s3_monitoring     = module.s3.monitoring_endpoint
  }
  sensitive = false
}

# Backup Configuration Outputs
output "backup_config" {
  description = "Backup configuration details for data stores"
  value = {
    mongodb_backup_enabled = module.mongodb.backup_enabled
    mongodb_backup_schedule = module.mongodb.backup_schedule
    redis_backup_enabled = module.redis.backup_enabled
    s3_versioning_enabled = module.s3.versioning_enabled
  }
  sensitive = false
}

# Security Configuration Outputs
output "security_config" {
  description = "Security configuration status for infrastructure components"
  value = {
    mongodb_encryption_at_rest = module.mongodb.encryption_enabled
    redis_encryption_enabled = module.redis.encryption_enabled
    s3_encryption_enabled = module.s3.encryption_enabled
    tls_enabled = true
  }
  sensitive = false
}
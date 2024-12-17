# Application Configuration
app_name = "docshield-voice-agent-staging"
environment = "staging"
aws_region = "us-east-1"

# Heroku Worker Configuration
heroku_dyno_size = "eco"
heroku_dyno_quantity = 2

# MongoDB Atlas Configuration
mongodb_instance_size = "M10"
mongodb_version = "6.0"
mongodb_backup_enabled = true
mongodb_auto_scaling_enabled = true
mongodb_connection_limit = 100
mongodb_retention_days = 7

# Redis Cloud Configuration
redis_memory_limit_mb = 100
redis_persistence_enabled = true
redis_high_availability = true
redis_backup_enabled = true
redis_eviction_policy = "volatile-lru"
redis_connection_pool_size = 50

# AWS S3 Configuration
s3_bucket_prefix = "docshield-voice-recordings-staging"
s3_versioning_enabled = true
s3_lifecycle_rules = {
  transition_glacier = 90
  expiration_days = 365
}
s3_encryption_algorithm = "AES256"

# Network Security
allowed_cidr_blocks = [
  "10.0.0.0/16",    # VPC CIDR
  "172.16.0.0/12"   # Office Network
]

vpc_config = {
  cidr_block = "10.0.0.0/16"
  private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnet_cidrs = ["10.0.3.0/24", "10.0.4.0/24"]
}

# Monitoring and Logging
logtail_retention_days = 30
metrics_retention_days = 90
alert_notification_email = "ops-staging@docshield.com"

# Resource Tags
tags = {
  Project = "DocShield-Voice-Agent"
  Environment = "staging"
  ManagedBy = "Terraform"
  CostCenter = "Engineering"
  SecurityLevel = "Restricted"
  DataClassification = "Sensitive"
}

# Security Controls
security_controls = {
  enable_waf = true
  enable_ddos_protection = true
  enable_ssl = true
  minimum_tls_version = "TLS1.2"
  enable_audit_logging = true
}

# Backup Configuration
backup_config = {
  mongodb_backup_window = "03:00-04:00"
  redis_backup_window = "02:00-03:00"
  s3_backup_frequency = "daily"
}

# Performance Configuration
performance_config = {
  mongodb_connection_timeout = 5000
  redis_connection_timeout = 3000
  api_rate_limit = 1000
  max_concurrent_calls = 50
}

# Compliance Settings
compliance_config = {
  enable_hipaa_controls = true
  enable_audit_trail = true
  enable_encryption_at_rest = true
  enable_encryption_in_transit = true
}

# Auto-scaling Configuration
autoscaling_config = {
  min_dynos = 1
  max_dynos = 3
  scale_up_threshold = 80
  scale_down_threshold = 20
  cooldown_period = 300
}

# Feature Flags
feature_flags = {
  enable_voice_recording = true
  enable_transcription = true
  enable_sales_coach = true
  enable_calendar_integration = true
}

# Integration Settings
integration_config = {
  livekit_region = "us-east-1"
  openai_model = "gpt-4"
  calendar_sync_interval = 300
}
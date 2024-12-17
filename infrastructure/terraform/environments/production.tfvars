# Core Application Settings
app_name = "docshield-voice-agent-prod"
environment = "production"
aws_region = "us-east-1"

# Heroku Worker Configuration
heroku_dyno_size = "eco"
heroku_dyno_quantity = 2
heroku_config_vars = {
  NODE_ENV = "production"
  LOG_LEVEL = "info"
  MEMORY_LIMIT = "512"
  MAX_CONCURRENT_CALLS = "1"
  ERROR_THRESHOLD = "5"
  RETRY_DELAY = "2000"
}

# MongoDB Atlas Configuration
mongodb_instance_size = "M10"
mongodb_version = "6.0"
mongodb_cluster_config = {
  cluster_type = "REPLICASET"
  num_shards = 1
  replication_factor = 3
  auto_scaling_disk_gb_enabled = true
  encryption_at_rest = true
  backup_enabled = true
  pit_enabled = true
}

# Redis Cloud Settings
redis_memory_limit_mb = 100
redis_config = {
  persistence_enabled = true
  aof_policy = "everysec"
  maxmemory_policy = "allkeys-lru"
  timeout = 300
  notify_keyspace_events = "Ex"
}

# AWS S3 Storage Configuration
s3_bucket_prefix = "docshield-voice-recordings-prod"
s3_config = {
  versioning = true
  encryption = "AES256"
  lifecycle_rules = {
    transition_glacier_days = 90
    expiration_days = 1095  # 3 years retention
  }
  cors_rules = {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT"]
    allowed_origins = ["https://*.docshield.com"]
    max_age_seconds = 3600
  }
}

# Network Security
allowed_cidr_blocks = [
  "10.0.0.0/8",     # Private network range
  "172.16.0.0/12",  # Private network range
  "192.168.0.0/16"  # Private network range
]

# VPC Configuration
vpc_config = {
  enable_dns_hostnames = true
  enable_dns_support = true
  instance_tenancy = "default"
}

# Monitoring Configuration
monitoring_config = {
  log_retention_days = 90
  metrics_retention_days = 30
  alert_notification_threshold = 5
  error_rate_threshold = 0.05  # 5%
  memory_threshold = 450       # MB
  queue_length_threshold = 100
}

# Resource Tags
tags = {
  Project = "DocShield-Voice-Agent"
  Environment = "Production"
  ManagedBy = "Terraform"
  SecurityLevel = "High"
  DataClassification = "Sensitive"
  BackupFrequency = "Daily"
  CostCenter = "Sales-Tech"
}

# Security Configuration
security_config = {
  ssl_enforcement = true
  min_tls_version = "1.3"
  enable_audit_logging = true
  require_secure_transport = true
  ip_whitelist_enabled = true
}

# Backup Configuration
backup_config = {
  enabled = true
  retention_period_days = 30
  start_time = "02:00"
  frequency_hours = 24
  encryption_enabled = true
}

# Performance Configuration
performance_config = {
  connection_pool_size = 50
  max_connections = 100
  idle_timeout_seconds = 300
  statement_timeout_seconds = 30
}

# Worker Scaling Configuration
worker_scaling_config = {
  min_workers = 1
  max_workers = 5
  target_memory_utilization = 0.8
  scale_up_cooldown = 300
  scale_down_cooldown = 600
  queue_length_threshold = 100
}
# Provider Configuration
terraform {
  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.10.0"  # Latest stable version for production use
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5.0"  # Latest stable version for secure password generation
    }
  }
  required_version = ">= 1.0.0"
}

# MongoDB Atlas Cluster Configuration
resource "mongodbatlas_cluster" "voice_agent_cluster" {
  project_id = var.project_id
  name       = var.cluster_name

  # Cluster Specifications
  cluster_type = "REPLICASET"
  replication_specs {
    num_shards = 1
    regions_config {
      region_name     = "US_EAST_1"
      electable_nodes = 3
      priority        = 7
      read_only_nodes = 0
    }
  }

  # Provider Settings
  provider_name               = "AWS"
  provider_instance_size_name = var.instance_size  # M10 as specified
  mongo_db_major_version     = var.mongodb_version

  # Performance and Scaling
  auto_scaling_disk_gb_enabled = true
  auto_scaling_compute_enabled = true
  auto_scaling_compute_scale_down_enabled = true

  # Backup Configuration
  backup_enabled               = var.backup_enabled
  pit_enabled                 = var.backup_enabled
  provider_backup_enabled     = var.backup_enabled
  provider_disk_iops          = 1000  # Recommended IOPS for M10
  provider_volume_type        = "STANDARD"

  # Security Configuration
  encryption_at_rest_provider = "AWS"
  advanced_configuration {
    javascript_enabled                   = false
    minimum_enabled_tls_protocol        = "TLS1_2"
    no_table_scan                       = false
    oplog_size_mb                       = 2048
    sample_size_bi_connector           = 1000
    sample_refresh_interval_bi_connector = 300
  }

  # Tags for resource management
  tags {
    key   = "Environment"
    value = "Production"
  }
  tags {
    key   = "Application"
    value = "DocShield-VoiceAgent"
  }
}

# Secure Password Generation
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
  min_special      = 2
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
}

# Database User Configuration
resource "mongodbatlas_database_user" "voice_agent_user" {
  project_id         = var.project_id
  auth_database_name = "admin"
  username          = "docshield_voice_agent"
  password          = random_password.db_password.result

  # Role Configuration
  roles {
    role_name     = "readWrite"
    database_name = "voice_agent"
  }
  roles {
    role_name     = "backup"
    database_name = "admin"
  }

  # Scoping user to specific cluster
  scopes {
    name = mongodbatlas_cluster.voice_agent_cluster.name
    type = "CLUSTER"
  }

  # Label for user management
  labels {
    key   = "environment"
    value = "production"
  }
}

# Network Access Configuration
resource "mongodbatlas_project_ip_access_list" "ip_access_list" {
  project_id = var.project_id
  
  dynamic "ip_access_list" {
    for_each = var.allowed_cidr_blocks
    content {
      cidr_block = ip_access_list.value
      comment    = "Allowed CIDR block for DocShield Voice Agent"
    }
  }

  depends_on = [mongodbatlas_cluster.voice_agent_cluster]
}

# Collection-Level Encryption Configuration
resource "mongodbatlas_encryption_at_rest" "voice_agent_encryption" {
  count      = var.encryption_at_rest ? 1 : 0
  project_id = var.project_id

  aws_kms_config {
    enabled                = true
    customer_master_key_id = "aws:kms:key-id"  # Replace with actual KMS key ID
    region                = "us-east-1"
  }
}

# Auditing Configuration
resource "mongodbatlas_auditing" "voice_agent_audit" {
  project_id                  = var.project_id
  audit_filter               = "{}"  # Audit all operations
  enabled                    = true
  audit_authorization_success = true
}

# Alerts Configuration
resource "mongodbatlas_alert_configuration" "cluster_alerts" {
  project_id = var.project_id
  
  event_type = "CLUSTER"
  enabled    = true

  notification {
    type_name     = "EMAIL"
    delay_min     = 0
    interval_min  = 5
    email_enabled = true
  }

  matcher {
    field_name = "CLUSTER_NAME"
    operator   = "EQUALS"
    value      = mongodbatlas_cluster.voice_agent_cluster.name
  }
}

# Local Variables for Connection String Management
locals {
  mongodb_connection_string = mongodbatlas_cluster.voice_agent_cluster.connection_strings[0].standard
  mongodb_srv_string       = mongodbatlas_cluster.voice_agent_cluster.connection_strings[0].standard_srv
}
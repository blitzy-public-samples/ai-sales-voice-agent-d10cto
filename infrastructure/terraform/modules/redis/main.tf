# Redis Cloud Provider Configuration
# Version: ~> 1.0
terraform {
  required_providers {
    rediscloud = {
      source  = "rediscloud/rediscloud"
      version = "~> 1.0"
    }
  }
}

# Redis Cloud Subscription Resource
# Creates a dedicated Redis instance for the DocShield AI Voice Agent queue system
resource "rediscloud_subscription" "docshield_queue" {
  name = "${var.redis_name}-${var.environment}"
  
  # Payment and storage configuration
  payment_method                 = "credit-card"
  memory_storage                = "ram"
  persistent_storage_encryption = true

  # Database configuration
  database {
    name                          = "queue"
    protocol                      = "redis"
    memory_limit_in_mb           = var.redis_memory_limit
    support_oss_cluster_api      = true
    data_persistence             = "aof-every-1-second"
    throughput_measurement_by    = "operations-per-second"
    throughput_measurement_value = 10000 # Configured for high throughput job processing
    
    # Security configuration
    password      = "random" # Auto-generated secure password
    replication   = true    # Enable replication for high availability
    tls_enabled   = true    # Enable TLS for in-transit encryption
  }

  lifecycle {
    prevent_destroy = true # Prevent accidental destruction of production queue
    
    ignore_changes = [
      payment_method, # Prevent payment method changes during updates
    ]
  }
}

# VPC Peering Configuration
# Establishes secure network connection between Redis Cloud and AWS VPC
resource "rediscloud_subscription_peering" "docshield_vpc_peering" {
  subscription_id = rediscloud_subscription.docshield_queue.id
  provider_name   = "AWS"
  aws_account_id  = var.aws_account_id
  vpc_id         = var.vpc_id
  vpc_cidr       = var.vpc_cidr

  depends_on = [
    rediscloud_subscription.docshield_queue
  ]

  lifecycle {
    prevent_destroy = true # Prevent accidental destruction of VPC peering
  }
}

# Route Table Configuration for VPC Peering
# Ensures proper routing between Redis Cloud and AWS VPC
resource "rediscloud_subscription_peering_route" "docshield_peering_route" {
  subscription_id = rediscloud_subscription.docshield_queue.id
  peering_id     = rediscloud_subscription_peering.docshield_vpc_peering.id
  route          = var.vpc_cidr

  depends_on = [
    rediscloud_subscription_peering.docshield_vpc_peering
  ]
}
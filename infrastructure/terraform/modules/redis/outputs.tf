# Redis Cloud subscription ID output
# Used for referencing the subscription in other resources and configurations
output "subscription_id" {
  description = "Redis Cloud subscription ID for reference and peering"
  value       = rediscloud_subscription.docshield_queue.id
}

# Redis connection host output
# Provides the hostname for worker service to connect to Redis
output "redis_host" {
  description = "Redis database hostname for worker service connection"
  value       = rediscloud_subscription.docshield_queue.database[0].public_endpoint
}

# Redis connection port output
# Provides the port number for worker service to connect to Redis
output "redis_port" {
  description = "Redis database port for worker service connection"
  value       = rediscloud_subscription.docshield_queue.database[0].port
}

# Redis authentication password output
# Provides the secure password for Redis authentication
# Marked as sensitive to prevent exposure in logs and outputs
output "redis_password" {
  description = "Redis database password for authentication"
  value       = rediscloud_subscription.docshield_queue.database[0].password
  sensitive   = true
}

# Redis TLS configuration output
# Indicates whether TLS encryption is enabled for Redis connections
output "redis_ssl_enabled" {
  description = "Boolean indicating if TLS is enabled for Redis connection"
  value       = rediscloud_subscription.docshield_queue.database[0].tls_enabled
}
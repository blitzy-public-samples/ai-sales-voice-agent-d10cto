# MongoDB Atlas Cluster Connection String
output "cluster_connection_string" {
  description = "MongoDB Atlas cluster connection string for application configuration"
  value       = mongodbatlas_cluster.voice_agent_cluster.connection_strings[0].standard
  sensitive   = true # Marked sensitive to prevent exposure in logs
}

# Database User Credentials
output "database_user" {
  description = "Database username for application authentication"
  value       = mongodbatlas_database_user.voice_agent_user.username
  sensitive   = true # Marked sensitive to prevent exposure in logs
}

output "database_password" {
  description = "Generated database password for application authentication"
  value       = random_password.db_password.result
  sensitive   = true # Marked sensitive to prevent exposure in logs
}

# Additional Connection Details
output "cluster_srv_connection_string" {
  description = "MongoDB Atlas cluster SRV connection string for application configuration"
  value       = mongodbatlas_cluster.voice_agent_cluster.connection_strings[0].standard_srv
  sensitive   = true
}

output "cluster_id" {
  description = "MongoDB Atlas cluster identifier for reference"
  value       = mongodbatlas_cluster.voice_agent_cluster.cluster_id
}

output "cluster_state" {
  description = "Current state of the MongoDB Atlas cluster"
  value       = mongodbatlas_cluster.voice_agent_cluster.state_name
}

output "mongodb_version" {
  description = "MongoDB version running on the cluster"
  value       = mongodbatlas_cluster.voice_agent_cluster.mongo_db_version
}

output "connection_strings" {
  description = "All available connection strings for the cluster"
  value = {
    standard     = mongodbatlas_cluster.voice_agent_cluster.connection_strings[0].standard
    standard_srv = mongodbatlas_cluster.voice_agent_cluster.connection_strings[0].standard_srv
    private      = mongodbatlas_cluster.voice_agent_cluster.connection_strings[0].private
    private_srv  = mongodbatlas_cluster.voice_agent_cluster.connection_strings[0].private_srv
  }
  sensitive = true
}

output "backup_enabled" {
  description = "Indicates if backup is enabled for the cluster"
  value       = mongodbatlas_cluster.voice_agent_cluster.backup_enabled
}

output "bi_connector" {
  description = "BI Connector configuration details"
  value = {
    enabled = mongodbatlas_cluster.voice_agent_cluster.bi_connector_config != null
    port    = mongodbatlas_cluster.voice_agent_cluster.bi_connector_config != null ? mongodbatlas_cluster.voice_agent_cluster.bi_connector_config[0].read_preference : null
  }
}
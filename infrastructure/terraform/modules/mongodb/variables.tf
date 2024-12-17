# MongoDB Atlas Project Configuration
variable "project_id" {
  type        = string
  description = "MongoDB Atlas project identifier"
  sensitive   = true
  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID cannot be empty"
  }
}

# Cluster Configuration
variable "cluster_name" {
  type        = string
  description = "Name of the MongoDB Atlas cluster for voice agent application"
  default     = "voice-agent-cluster"
  validation {
    condition     = can(regex("^[a-zA-Z0-9-]+$", var.cluster_name))
    error_message = "Cluster name must only contain alphanumeric characters and hyphens"
  }
}

variable "instance_size" {
  type        = string
  description = "MongoDB Atlas cluster instance size (M10 recommended for production, M20/M30 for higher workloads)"
  default     = "M10"
  validation {
    condition     = contains(["M10", "M20", "M30"], var.instance_size)
    error_message = "Instance size must be one of: M10 (standard), M20 (high performance), M30 (dedicated)"
  }
}

variable "mongodb_version" {
  type        = string
  description = "MongoDB version for Atlas cluster (6.0 recommended for latest features)"
  default     = "6.0"
  validation {
    condition     = contains(["5.0", "6.0"], var.mongodb_version)
    error_message = "MongoDB version must be either 5.0 (legacy) or 6.0 (recommended)"
  }
}

# Security Configuration
variable "allowed_cidr_blocks" {
  type        = list(string)
  description = "List of CIDR blocks allowed to access the MongoDB cluster (must be specific and restricted)"
  default     = []
  validation {
    condition     = alltrue([for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))])
    error_message = "All CIDR blocks must be valid and follow security best practices"
  }
}

variable "encryption_at_rest" {
  type        = bool
  description = "Enable encryption at rest for data security"
  default     = true
}

# Backup Configuration
variable "backup_enabled" {
  type        = bool
  description = "Enable continuous backup with point-in-time recovery"
  default     = true
}

variable "retention_days" {
  type        = number
  description = "Number of days to retain backup snapshots"
  default     = 7
  validation {
    condition     = var.retention_days >= 1 && var.retention_days <= 30
    error_message = "Backup retention must be between 1 and 30 days"
  }
}
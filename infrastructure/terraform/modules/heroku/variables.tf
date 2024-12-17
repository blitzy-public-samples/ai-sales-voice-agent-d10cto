# Application name variable for Heroku resources
variable "app_name" {
  type        = string
  description = "Name of the Heroku application for the DocShield Voice Agent worker"

  validation {
    condition     = length(var.app_name) <= 30
    error_message = "App name must be 30 characters or less"
  }
}

# Environment specification for deployment
variable "environment" {
  type        = string
  description = "Deployment environment (production, staging, development)"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development"
  }
}

# Heroku worker dyno size configuration
variable "dyno_size" {
  type        = string
  description = "Size of Heroku worker dynos (eco, basic, standard-1x, standard-2x)"
  default     = "eco" # Default to eco dyno as per technical spec requirement of 512MB RAM

  validation {
    condition     = contains(["eco", "basic", "standard-1x", "standard-2x"], var.dyno_size)
    error_message = "Invalid dyno size specified"
  }
}

# Number of worker dynos to provision
variable "dyno_quantity" {
  type        = number
  description = "Number of worker dynos to run"
  default     = 1 # Start with 1 dyno and scale based on metrics

  validation {
    condition     = var.dyno_quantity > 0 && var.dyno_quantity <= 10
    error_message = "Dyno quantity must be between 1 and 10"
  }
}
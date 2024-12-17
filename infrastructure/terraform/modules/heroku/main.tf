# Configure Heroku provider
terraform {
  required_providers {
    heroku = {
      source  = "hashicorp/heroku"
      version = "~> 5.0"
    }
  }
}

# Main Heroku application resource for worker deployment
resource "heroku_app" "worker" {
  name   = "${var.app_name}-${var.environment}"
  region = "us"
  stack  = "heroku-22"

  buildpacks = [
    "heroku/nodejs"
  ]

  # Configure environment variables for the worker application
  config_vars = {
    # Environment and logging configuration
    NODE_ENV              = var.environment
    LOG_LEVEL            = "info"
    NPM_CONFIG_PRODUCTION = "true"

    # Worker process configuration
    MAX_MEMORY_RESTART    = "512M"  # Memory limit as per technical spec
    WORKER_CONCURRENCY    = "1"     # Single call per worker as per spec
    QUEUE_MONITOR_INTERVAL = "30000" # 30s monitoring interval

    # Error handling configuration
    ERROR_THRESHOLD      = "5"      # Circuit breaker threshold
    RETRY_DELAY         = "1000"    # Base retry delay in ms

    # Additional environment-specific settings
    ENABLE_DEBUG_LOGGING = var.environment != "production" ? "true" : "false"
  }

  # Sensitive config vars to be set post-deployment
  sensitive_config_vars = {
    # These will be set manually through Heroku CLI or dashboard
    # LIVEKIT_API_KEY     = null
    # OPENAI_API_KEY      = null
    # GOOGLE_CALENDAR_KEY = null
    # AWS_ACCESS_KEY_ID   = null
    # MONGODB_URI         = null
    # REDIS_URL          = null
  }
}

# Worker dyno formation configuration
resource "heroku_formation" "worker" {
  app      = heroku_app.worker.name
  type     = "worker"
  quantity = var.dyno_quantity
  size     = var.dyno_size

  depends_on = [heroku_app.worker]
}

# Heroku metrics addon for monitoring
resource "heroku_addon" "metrics" {
  app  = heroku_app.worker.name
  plan = "metrics-basic"

  depends_on = [heroku_app.worker]
}

# LogTail addon for centralized logging
resource "heroku_addon" "logtail" {
  app  = heroku_app.worker.name
  plan = "logtail:pro"

  depends_on = [heroku_app.worker]
}

# Auto-scaling configuration using Heroku Platform API
# Note: Terraform doesn't directly support Heroku autoscaling
# This needs to be configured via Heroku CLI or dashboard post-deployment
# Based on these metrics:
# - Queue length > 100 jobs
# - Memory usage > 450MB
# - Error rate > 5%
# - CPU usage > 80%

# Output values for use in other modules
output "app_name" {
  value       = heroku_app.worker.name
  description = "Name of the Heroku application"
}

output "web_url" {
  value       = heroku_app.worker.web_url
  description = "URL of the Heroku application"
}

output "worker_formation" {
  value = {
    size     = heroku_formation.worker.size
    quantity = heroku_formation.worker.quantity
  }
  description = "Worker formation details"
}

output "metrics_url" {
  value       = heroku_addon.metrics.web_url
  description = "URL for Heroku metrics dashboard"
}

output "logtail_url" {
  value       = heroku_addon.logtail.web_url
  description = "URL for LogTail dashboard"
}
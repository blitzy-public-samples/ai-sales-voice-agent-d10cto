# Application name output
output "app_name" {
  value       = heroku_app.worker.name
  description = "Name of the provisioned Heroku application"
  sensitive   = false
}

# Application URL output
output "app_url" {
  value       = heroku_app.worker.web_url
  description = "URL of the Heroku application"
  sensitive   = false
}

# Worker dyno size output
output "worker_size" {
  value       = heroku_formation.worker.size
  description = "Size of the worker dynos (eco, basic, standard-1x, standard-2x)"
  sensitive   = false
}

# Worker dyno count output
output "worker_count" {
  value       = heroku_formation.worker.quantity
  description = "Number of worker dynos running"
  sensitive   = false
}

# Metrics dashboard URL output
output "metrics_url" {
  value       = heroku_addon_metrics.web_url
  description = "URL for the Heroku metrics dashboard"
  sensitive   = false
}

# LogTail dashboard URL output
output "logtail_url" {
  value       = heroku_addon_logtail.web_url
  description = "URL for the LogTail logging dashboard"
  sensitive   = false
}
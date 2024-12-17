# Output the S3 bucket identifier for reference by other resources
output "bucket_id" {
  value       = aws_s3_bucket.recordings_bucket.id
  description = "ID of the S3 bucket used for storing call recordings and transcripts"
}

# Output the S3 bucket ARN for use in IAM policies and resource permissions
output "bucket_arn" {
  value       = aws_s3_bucket.recordings_bucket.arn
  description = "ARN of the S3 bucket for IAM policy configuration"
}

# Output the S3 bucket name for client application configuration
output "bucket_name" {
  value       = aws_s3_bucket.recordings_bucket.bucket
  description = "Name of the S3 bucket for client application configuration"
}
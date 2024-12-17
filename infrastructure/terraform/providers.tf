# Configure required providers and versions
terraform {
  required_version = ">= 1.0.0"
  required_providers {
    # Heroku provider for worker deployment
    # Version: 5.0.0 - Latest stable version with eco dyno support
    heroku = {
      source  = "heroku/heroku"
      version = "~> 5.0"
    }

    # MongoDB Atlas provider for database cluster
    # Version: 1.0.0 - Latest stable version with M10 cluster support
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.0"
    }

    # AWS provider for S3 storage
    # Version: 4.0.0 - Latest stable version with full S3 support
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }

    # Redis Cloud provider for job queue
    # Version: 1.0.0 - Latest stable version with dedicated memory support
    rediscloud = {
      source  = "rediscloud/rediscloud"
      version = "~> 1.0"
    }
  }
}

# Configure Heroku provider for worker deployment
provider "heroku" {
  # Authentication handled via environment variables:
  # HEROKU_API_KEY - API key for Heroku account
  # HEROKU_EMAIL - Email associated with Heroku account
}

# Configure MongoDB Atlas provider for M10 cluster deployment
provider "mongodbatlas" {
  # Authentication handled via environment variables:
  # MONGODB_ATLAS_PUBLIC_KEY - Public key for Atlas account
  # MONGODB_ATLAS_PRIVATE_KEY - Private key for Atlas account
}

# Configure AWS provider for S3 storage with regional settings
provider "aws" {
  region = var.aws_region

  # Authentication handled via environment variables:
  # AWS_ACCESS_KEY_ID - AWS access key
  # AWS_SECRET_ACCESS_KEY - AWS secret key

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "DocShield-Voice-Agent"
      ManagedBy   = "Terraform"
    }
  }
}

# Configure Redis Cloud provider for job queue management
provider "rediscloud" {
  # Authentication handled via environment variables:
  # REDISCLOUD_ACCESS_KEY - Redis Cloud access key
  # REDISCLOUD_SECRET_KEY - Redis Cloud secret key
}
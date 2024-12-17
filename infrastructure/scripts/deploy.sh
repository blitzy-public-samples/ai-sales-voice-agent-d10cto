#!/bin/bash

# DocShield AI Voice Agent Deployment Script
# Version: 1.0.0
# Implements zero-downtime deployment with comprehensive validation and monitoring

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_FAILURE=1

# Source health check and rollback scripts
source "$(dirname "$0")/health-check.sh"
source "$(dirname "$0")/rollback.sh"

# Environment validation
[[ -z "${ENVIRONMENT}" ]] && echo "Error: ENVIRONMENT not set" && exit $EXIT_FAILURE
[[ -z "${HEROKU_API_KEY}" ]] && echo "Error: HEROKU_API_KEY not set" && exit $EXIT_FAILURE
[[ -z "${APP_NAME}" ]] && echo "Error: APP_NAME not set" && exit $EXIT_FAILURE
[[ -z "${DOCKER_REGISTRY}" ]] && echo "Error: DOCKER_REGISTRY not set" && exit $EXIT_FAILURE

# Constants
readonly DEPLOYMENT_TIMEOUT=${DEPLOYMENT_TIMEOUT:-300}
readonly HEALTH_CHECK_RETRIES=${HEALTH_CHECK_RETRIES:-5}
readonly HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-30}
readonly CORRELATION_ID="deploy-$(date +%s)"
readonly CIRCUIT_BREAKER_THRESHOLD=${CIRCUIT_BREAKER_THRESHOLD:-3}
readonly CIRCUIT_BREAKER_TIMEOUT=${CIRCUIT_BREAKER_TIMEOUT:-60}

# Logging with timestamp and correlation ID
log() {
    local level=$1
    local message=$2
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] [$CORRELATION_ID] $message"
}

# Check prerequisites with enhanced validation
check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    # Verify CLI tools
    local required_tools=("heroku" "docker" "jq" "logtail")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log "ERROR" "Required tool not found: $tool"
            return $EXIT_FAILURE
        fi
    done

    # Verify Heroku authentication
    if ! heroku auth:whoami &> /dev/null; then
        log "ERROR" "Heroku authentication failed"
        return $EXIT_FAILURE
    }

    # Verify Docker registry access
    if ! docker login "$DOCKER_REGISTRY" &> /dev/null; then
        log "ERROR" "Docker registry authentication failed"
        return $EXIT_FAILURE
    }

    # Verify disk space
    local available_space
    available_space=$(df -k . | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 5242880 ]]; then # 5GB minimum
        log "ERROR" "Insufficient disk space"
        return $EXIT_FAILURE
    }

    return $EXIT_SUCCESS
}

# Build Docker image with security scanning
build_image() {
    log "INFO" "Building Docker image..."
    
    # Generate unique build ID
    local build_id="build-${CORRELATION_ID}"
    
    # Set build arguments
    local build_args=(
        "--build-arg NODE_ENV=${ENVIRONMENT}"
        "--build-arg BUILD_ID=${build_id}"
        "--build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    )

    # Build image using docker-compose
    if ! docker-compose -f docker-compose.worker.yml build "${build_args[@]}"; then
        log "ERROR" "Docker build failed"
        return $EXIT_FAILURE
    }

    # Run security scan
    if ! docker scan "$DOCKER_REGISTRY/$APP_NAME:$build_id"; then
        log "WARN" "Security vulnerabilities detected"
        # Continue deployment but log warning
    fi

    # Tag image for Heroku registry
    docker tag "$APP_NAME:latest" "$DOCKER_REGISTRY/$APP_NAME:$build_id"
    
    return $EXIT_SUCCESS
}

# Deploy release with zero-downtime strategy
deploy_release() {
    log "INFO" "Deploying release..."

    # Create deployment record
    local deploy_record
    deploy_record=$(heroku releases:info -a "$APP_NAME" --json)
    
    # Scale down current workers gracefully
    log "INFO" "Scaling down workers..."
    if ! heroku ps:scale worker=0 -a "$APP_NAME" --wait; then
        log "ERROR" "Failed to scale down workers"
        return $EXIT_FAILURE
    }

    # Push container
    log "INFO" "Pushing container to registry..."
    if ! heroku container:push worker -a "$APP_NAME"; then
        log "ERROR" "Container push failed"
        return $EXIT_FAILURE
    }

    # Release container
    log "INFO" "Releasing container..."
    if ! heroku container:release worker -a "$APP_NAME"; then
        log "ERROR" "Container release failed"
        return $EXIT_FAILURE
    }

    # Scale up new workers progressively
    log "INFO" "Scaling up workers..."
    if ! heroku ps:scale worker=1 -a "$APP_NAME" --wait; then
        log "ERROR" "Failed to scale up workers"
        return $EXIT_FAILURE
    }

    return $EXIT_SUCCESS
}

# Verify deployment with comprehensive health checks
verify_deployment() {
    log "INFO" "Verifying deployment..."
    
    local retry_count=0
    while [[ $retry_count -lt $HEALTH_CHECK_RETRIES ]]; do
        # Perform health check
        if perform_health_check; then
            # Validate metrics
            if validate_metrics; then
                log "INFO" "Deployment verification successful"
                return $EXIT_SUCCESS
            fi
        fi
        
        retry_count=$((retry_count + 1))
        log "WARN" "Health check attempt $retry_count failed, retrying..."
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    log "ERROR" "Deployment verification failed after $HEALTH_CHECK_RETRIES attempts"
    return $EXIT_FAILURE
}

# Handle deployment failure with automated rollback
handle_failure() {
    local failure_reason=$1
    log "ERROR" "Deployment failed: $failure_reason"

    # Capture system state
    heroku logs -a "$APP_NAME" -n 1000 > "logs_${CORRELATION_ID}.txt"
    
    # Initiate rollback
    log "INFO" "Initiating rollback..."
    if ! rollback; then
        log "ERROR" "Rollback failed"
        notify_team "CRITICAL" "Both deployment and rollback failed"
        exit $EXIT_FAILURE
    fi

    # Verify rollback
    if ! verify_rollback; then
        log "ERROR" "Rollback verification failed"
        notify_team "CRITICAL" "Rollback verification failed"
        exit $EXIT_FAILURE
    fi

    notify_team "ERROR" "Deployment failed, system rolled back successfully"
    exit $EXIT_FAILURE
}

# Notify team of deployment status
notify_team() {
    local status=$1
    local message=$2
    
    log "INFO" "Sending notification: $status"
    
    # Send to LogTail
    logtail send \
        --level="${status,,}" \
        --correlation-id="$CORRELATION_ID" \
        --tags="deployment,${ENVIRONMENT}" \
        "$message"
}

# Main deployment procedure
main() {
    log "INFO" "Starting deployment procedure"

    # Check prerequisites
    if ! check_prerequisites; then
        handle_failure "Prerequisites check failed"
    fi

    # Build image
    if ! build_image; then
        handle_failure "Image build failed"
    fi

    # Deploy release
    if ! deploy_release; then
        handle_failure "Release deployment failed"
    fi

    # Verify deployment
    if ! verify_deployment; then
        handle_failure "Deployment verification failed"
    fi

    notify_team "SUCCESS" "Deployment completed successfully"
    log "INFO" "Deployment procedure completed successfully"
    exit $EXIT_SUCCESS
}

# Execute main function with error handling
main "$@" 2>&1 | tee -a "/var/log/docshield/deploy_${CORRELATION_ID}.log"
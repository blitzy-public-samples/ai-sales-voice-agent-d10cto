#!/bin/bash

# DocShield AI Voice Agent Rollback Script
# Version: 1.0.0
# Implements automated rollback procedures with enhanced reliability and monitoring

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_FAILURE=1

# Source health check script
source "$(dirname "$0")/health-check.sh"

# Environment validation
[[ -z "${ENVIRONMENT}" ]] && echo "Error: ENVIRONMENT not set" && exit $EXIT_FAILURE
[[ -z "${HEROKU_API_KEY}" ]] && echo "Error: HEROKU_API_KEY not set" && exit $EXIT_FAILURE
[[ -z "${APP_NAME}" ]] && echo "Error: APP_NAME not set" && exit $EXIT_FAILURE
[[ -z "${DOCKER_REGISTRY}" ]] && echo "Error: DOCKER_REGISTRY not set" && exit $EXIT_FAILURE

# Constants
readonly ROLLBACK_TIMEOUT=${ROLLBACK_TIMEOUT:-300}
readonly MAX_ROLLBACK_ATTEMPTS=${MAX_ROLLBACK_ATTEMPTS:-3}
readonly CORRELATION_ID="rollback-$(date +%s)"
readonly CIRCUIT_BREAKER_THRESHOLD=${CIRCUIT_BREAKER_THRESHOLD:-5}
readonly DRAIN_TIMEOUT=${DRAIN_TIMEOUT:-60}
readonly PARALLEL_HEALTH_CHECKS=${PARALLEL_HEALTH_CHECKS:-3}

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

    return $EXIT_SUCCESS
}

# Get previous release with validation
get_previous_release() {
    log "INFO" "Retrieving previous release..."
    
    local releases
    releases=$(heroku releases -a "$APP_NAME" --json)
    if [[ $? -ne 0 ]]; then
        log "ERROR" "Failed to retrieve releases"
        return $EXIT_FAILURE
    }

    # Get last successful release version
    local previous_version
    previous_version=$(echo "$releases" | jq -r '[.[] | select(.status == "succeeded")] | .[1].version')
    
    if [[ -z "$previous_version" ]]; then
        log "ERROR" "No previous successful release found"
        return $EXIT_FAILURE
    }

    echo "$previous_version"
    return $EXIT_SUCCESS
}

# Scale down workers with connection draining
scale_down_workers() {
    log "INFO" "Scaling down workers..."

    # Get current worker count
    local current_workers
    current_workers=$(heroku ps -a "$APP_NAME" | grep "worker" | wc -l)

    # Enable maintenance mode
    heroku maintenance:on -a "$APP_NAME"

    # Enable connection draining
    log "INFO" "Enabling connection draining"
    heroku features:enable log-runtime-metrics -a "$APP_NAME"

    # Gradually scale down workers
    while [[ $current_workers -gt 0 ]]; do
        heroku ps:scale worker=$((current_workers-1)) -a "$APP_NAME"
        sleep "$DRAIN_TIMEOUT"
        current_workers=$((current_workers-1))
    done

    return $EXIT_SUCCESS
}

# Execute rollback with comprehensive verification
rollback_release() {
    local release_version=$1
    log "INFO" "Rolling back to version: $release_version"

    # Create rollback snapshot
    heroku releases:info "$release_version" -a "$APP_NAME" > "rollback_snapshot_${CORRELATION_ID}.json"

    # Execute rollback
    if ! heroku rollback "$release_version" -a "$APP_NAME"; then
        log "ERROR" "Rollback failed"
        return $EXIT_FAILURE
    }

    # Verify deployment integrity
    if ! heroku releases:info -a "$APP_NAME" | grep -q "$release_version"; then
        log "ERROR" "Rollback verification failed"
        return $EXIT_FAILURE
    }

    return $EXIT_SUCCESS
}

# Scale up workers with health monitoring
scale_up_workers() {
    local worker_count=$1
    log "INFO" "Scaling up workers to: $worker_count"

    # Gradually scale up workers
    local current=0
    while [[ $current -lt $worker_count ]]; do
        heroku ps:scale worker=$((current+1)) -a "$APP_NAME"
        
        # Wait for worker health check
        sleep 5
        if ! perform_health_check; then
            log "ERROR" "Worker health check failed during scale up"
            return $EXIT_FAILURE
        fi
        
        current=$((current+1))
    done

    # Disable maintenance mode
    heroku maintenance:off -a "$APP_NAME"

    return $EXIT_SUCCESS
}

# Verify rollback with parallel health checks
verify_rollback() {
    log "INFO" "Verifying rollback..."

    # Run parallel health checks
    local check_results=()
    for i in $(seq 1 $PARALLEL_HEALTH_CHECKS); do
        parallel_health_check &
        check_results+=($!)
    done

    # Wait for all checks to complete
    local failed=0
    for pid in "${check_results[@]}"; do
        wait "$pid" || failed=$((failed+1))
    done

    if [[ $failed -gt 0 ]]; then
        log "ERROR" "Rollback verification failed: $failed checks failed"
        return $EXIT_FAILURE
    fi

    return $EXIT_SUCCESS
}

# Notify team of rollback status
notify_team() {
    local status=$1
    local details=$2
    
    log "INFO" "Sending notification: $status"
    
    # Send to LogTail
    logtail send \
        --level="${status,,}" \
        --correlation-id="$CORRELATION_ID" \
        --tags="rollback,${ENVIRONMENT}" \
        "$details"
}

# Main rollback procedure
main() {
    log "INFO" "Starting rollback procedure"

    # Check prerequisites
    if ! check_prerequisites; then
        notify_team "ERROR" "Rollback failed: Prerequisites check failed"
        exit $EXIT_FAILURE
    fi

    # Get previous release
    local previous_version
    previous_version=$(get_previous_release)
    if [[ $? -ne 0 ]]; then
        notify_team "ERROR" "Rollback failed: Could not determine previous version"
        exit $EXIT_FAILURE
    fi

    # Scale down workers
    if ! scale_down_workers; then
        notify_team "ERROR" "Rollback failed: Worker scale down failed"
        exit $EXIT_FAILURE
    fi

    # Execute rollback
    if ! rollback_release "$previous_version"; then
        notify_team "ERROR" "Rollback failed: Release rollback failed"
        exit $EXIT_FAILURE
    fi

    # Scale up workers
    if ! scale_up_workers 1; then
        notify_team "ERROR" "Rollback failed: Worker scale up failed"
        exit $EXIT_FAILURE
    fi

    # Verify rollback
    if ! verify_rollback; then
        notify_team "ERROR" "Rollback failed: Verification failed"
        exit $EXIT_FAILURE
    fi

    notify_team "SUCCESS" "Rollback completed successfully to version $previous_version"
    log "INFO" "Rollback procedure completed successfully"
    exit $EXIT_SUCCESS
}

# Execute main function with error handling
main "$@" 2>&1 | tee -a "/var/log/docshield/rollback_${CORRELATION_ID}.log"
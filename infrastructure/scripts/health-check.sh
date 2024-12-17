#!/bin/bash

# DocShield AI Voice Agent Health Check Script
# Version: 1.0.0
# Implements comprehensive health monitoring with business hours awareness,
# enhanced security measures, and detailed metric validation.

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_FAILURE=1

# Health check intervals and thresholds
readonly HEALTH_CHECK_INTERVAL=30
readonly MAX_RETRIES=3
readonly RETRY_DELAY=5
readonly MEMORY_THRESHOLD_MB=450
readonly CPU_THRESHOLD_PERCENT=80
readonly ERROR_RATE_THRESHOLD=5
readonly QUEUE_LENGTH_THRESHOLD=100

# Business hours configuration (24-hour format)
readonly BUSINESS_HOURS_START=9
readonly BUSINESS_HOURS_END=17

# Generate correlation ID for request tracing
CORRELATION_ID="health-$(date +%s)"

# Log message with timestamp and correlation ID
log() {
    local level=$1
    local message=$2
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] [$CORRELATION_ID] $message"
}

# Check if current time is within business hours
is_business_hours() {
    local current_hour=$(date +%H)
    if [ $current_hour -ge $BUSINESS_HOURS_START ] && [ $current_hour -lt $BUSINESS_HOURS_END ]; then
        return 0
    else
        return 1
    fi
}

# Validate worker process existence and state
check_worker_health() {
    local worker_id=$1
    local retry_count=0
    local max_retries=$MAX_RETRIES

    while [ $retry_count -lt $max_retries ]; do
        log "INFO" "Checking worker health: $worker_id (Attempt $((retry_count + 1)))"
        
        # Check process existence
        if ! pgrep -f "worker-$worker_id" > /dev/null; then
            log "ERROR" "Worker process not found: $worker_id"
            retry_count=$((retry_count + 1))
            sleep $RETRY_DELAY
            continue
        fi

        # Check memory usage
        local memory_usage=$(ps -o rss= -p $(pgrep -f "worker-$worker_id") | awk '{print $1/1024}')
        if [ $(echo "$memory_usage > $MEMORY_THRESHOLD_MB" | bc -l) -eq 1 ]; then
            log "WARN" "Memory usage above threshold: ${memory_usage}MB"
        fi

        # Check CPU usage
        local cpu_usage=$(ps -o %cpu= -p $(pgrep -f "worker-$worker_id") | awk '{print $1}')
        if [ $(echo "$cpu_usage > $CPU_THRESHOLD_PERCENT" | bc -l) -eq 1 ]; then
            log "WARN" "CPU usage above threshold: ${cpu_usage}%"
        fi

        # Check error rate from logs
        local error_count=$(grep -c "ERROR" /var/log/docshield/worker-$worker_id.log)
        local total_logs=$(wc -l < /var/log/docshield/worker-$worker_id.log)
        local error_rate=$(echo "scale=2; $error_count / $total_logs * 100" | bc)
        
        if [ $(echo "$error_rate > $ERROR_RATE_THRESHOLD" | bc -l) -eq 1 ]; then
            log "WARN" "Error rate above threshold: ${error_rate}%"
        fi

        return $EXIT_SUCCESS
    done

    return $EXIT_FAILURE
}

# Check system-wide metrics
check_system_metrics() {
    log "INFO" "Checking system metrics"

    # Check system memory
    local total_memory=$(free -m | awk '/^Mem:/{print $2}')
    local used_memory=$(free -m | awk '/^Mem:/{print $3}')
    local memory_usage=$(echo "scale=2; $used_memory / $total_memory * 100" | bc)

    if [ $(echo "$memory_usage > 90" | bc -l) -eq 1 ]; then
        log "WARN" "System memory usage high: ${memory_usage}%"
        return $EXIT_FAILURE
    fi

    # Check system CPU load
    local cpu_load=$(uptime | awk -F'load average:' '{ print $2 }' | awk -F',' '{ print $1 }')
    if [ $(echo "$cpu_load > 0.8" | bc -l) -eq 1 ]; then
        log "WARN" "System CPU load high: $cpu_load"
        return $EXIT_FAILURE
    fi

    # Check disk space
    local disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ $disk_usage -gt 90 ]; then
        log "WARN" "Disk usage high: ${disk_usage}%"
        return $EXIT_FAILURE
    fi

    return $EXIT_SUCCESS
}

# Check service health and connections
check_service_health() {
    log "INFO" "Checking service health"

    # Check Redis connection
    if ! redis-cli ping > /dev/null 2>&1; then
        log "ERROR" "Redis connection failed"
        return $EXIT_FAILURE
    fi

    # Check MongoDB connection
    if ! mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        log "ERROR" "MongoDB connection failed"
        return $EXIT_FAILURE
    fi

    # Check S3 access
    if ! aws s3 ls > /dev/null 2>&1; then
        log "ERROR" "S3 access failed"
        return $EXIT_FAILURE
    fi

    # Check LiveKit service
    if ! curl -s "http://localhost:7880/health" > /dev/null; then
        log "ERROR" "LiveKit service health check failed"
        return $EXIT_FAILURE
    fi

    return $EXIT_SUCCESS
}

# Main health check execution
main() {
    log "INFO" "Starting health check (Correlation ID: $CORRELATION_ID)"

    # Check if running during business hours
    if is_business_hours; then
        log "INFO" "Running during business hours - applying stricter thresholds"
        MEMORY_THRESHOLD_MB=400
        ERROR_RATE_THRESHOLD=3
    fi

    # Check system metrics
    if ! check_system_metrics; then
        log "ERROR" "System metrics check failed"
        exit $EXIT_FAILURE
    fi

    # Check service health
    if ! check_service_health; then
        log "ERROR" "Service health check failed"
        exit $EXIT_FAILURE
    fi

    # Check each worker process
    for worker_id in $(pgrep -f "worker-" | xargs); do
        if ! check_worker_health $worker_id; then
            log "ERROR" "Worker health check failed: $worker_id"
            exit $EXIT_FAILURE
        fi
    done

    log "INFO" "Health check completed successfully"
    exit $EXIT_SUCCESS
}

# Execute main function with error handling
main "$@" 2>&1 | tee -a /var/log/docshield/health-check.log
#!/bin/bash

# DocShield Restore Script v1.0
# Restores MongoDB databases and S3 recordings from backup archives
# Required tools: aws-cli v2.x, mongodb-database-tools v100.x
# Security: HIPAA-compliant with AES-256 encryption and audit logging

set -euo pipefail

# Global Configuration
RESTORE_ROOT="/tmp/docshield_restore"
BACKUP_BUCKET="${project_name}-${environment}-backups"
LOG_FILE="/var/log/docshield/restore.log"
RESTORE_LOCK_FILE="/var/run/docshield/restore.lock"
MAX_RETRIES=3
RETRY_DELAY=5

# Logging Configuration
log_restore_status() {
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local message="[$timestamp] [$1] $2: $3"
    echo "$message" >> "$LOG_FILE"
    
    # Send to LogTail with structured metadata
    curl -s -X POST "https://logtail.com/api/v1/logs" \
        -H "Authorization: Bearer $LOGTAIL_TOKEN" \
        -H "Content-Type: application/json" \
        -d @- << EOF
{
    "timestamp": "$timestamp",
    "level": "$1",
    "operation": "$2",
    "details": "$3",
    "service": "restore",
    "environment": "${environment}"
}
EOF
}

# Environment Setup and Validation
setup_restore_environment() {
    log_restore_status "INFO" "SETUP" "Initializing restore environment"
    
    # Create restore directory with secure permissions
    if ! mkdir -p "$RESTORE_ROOT"; then
        log_restore_status "ERROR" "SETUP" "Failed to create restore directory"
        return 1
    fi
    chmod 700 "$RESTORE_ROOT"
    
    # Verify AWS credentials and permissions
    if ! aws sts get-caller-identity &>/dev/null; then
        log_restore_status "ERROR" "SETUP" "Invalid AWS credentials"
        return 1
    fi
    
    # Create and validate lock file
    if [ -f "$RESTORE_LOCK_FILE" ]; then
        log_restore_status "ERROR" "SETUP" "Restore already in progress"
        return 6
    fi
    touch "$RESTORE_LOCK_FILE"
    
    return 0
}

# Backup Validation
validate_backup() {
    local backup_path="$1"
    log_restore_status "INFO" "VALIDATE" "Validating backup at $backup_path"
    
    # Verify backup manifest
    if [ ! -f "$backup_path/manifest.json" ]; then
        log_restore_status "ERROR" "VALIDATE" "Missing backup manifest"
        return 2
    }
    
    # Check backup checksums
    if ! sha256sum -c "$backup_path/checksums.txt"; then
        log_restore_status "ERROR" "VALIDATE" "Checksum verification failed"
        return 2
    }
    
    return 0
}

# MongoDB Restore
restore_mongodb() {
    local backup_path="$1"
    local connection_string="$2"
    local attempt=1
    
    log_restore_status "INFO" "MONGODB" "Starting MongoDB restore"
    
    # Stop worker processes
    systemctl stop docshield-worker || {
        log_restore_status "ERROR" "MONGODB" "Failed to stop workers"
        return 3
    }
    
    while [ $attempt -le $MAX_RETRIES ]; do
        if mongorestore --uri="$connection_string" \
            --dir="$backup_path/mongodb" \
            --oplogReplay \
            --preserveUUID \
            --gzip; then
            log_restore_status "INFO" "MONGODB" "Restore completed successfully"
            break
        else
            log_restore_status "WARN" "MONGODB" "Restore attempt $attempt failed"
            ((attempt++))
            [ $attempt -le $MAX_RETRIES ] && sleep $((RETRY_DELAY * attempt))
        fi
    done
    
    # Restart workers
    systemctl start docshield-worker
    
    [ $attempt -gt $MAX_RETRIES ] && return 3
    return 0
}

# S3 Recordings Restore
restore_s3_recordings() {
    local backup_bucket="$1"
    local target_bucket="$2"
    
    log_restore_status "INFO" "S3" "Starting S3 recordings restore"
    
    # Sync recordings with server-side encryption
    if ! aws s3 sync \
        "s3://$backup_bucket/recordings" \
        "s3://$target_bucket/recordings" \
        --sse aws:kms \
        --sse-kms-key-id "$KMS_KEY_ID" \
        --only-show-errors; then
        log_restore_status "ERROR" "S3" "Failed to restore recordings"
        return 4
    fi
    
    return 0
}

# Post-restore Verification
verify_restore() {
    log_restore_status "INFO" "VERIFY" "Starting restore verification"
    
    # Verify MongoDB collections
    if ! mongosh --eval "db.adminCommand('dbCheck')" "$MONGODB_URI"; then
        log_restore_status "ERROR" "VERIFY" "MongoDB verification failed"
        return 5
    }
    
    # Verify S3 objects
    if ! aws s3api list-objects-v2 --bucket "$TARGET_BUCKET" --max-items 1; then
        log_restore_status "ERROR" "VERIFY" "S3 verification failed"
        return 5
    }
    
    return 0
}

# Cleanup Function
cleanup() {
    local exit_code=$?
    
    # Remove lock file
    rm -f "$RESTORE_LOCK_FILE"
    
    # Cleanup restore directory
    rm -rf "$RESTORE_ROOT"
    
    # Log final status
    if [ $exit_code -eq 0 ]; then
        log_restore_status "INFO" "CLEANUP" "Restore completed successfully"
    else
        log_restore_status "ERROR" "CLEANUP" "Restore failed with exit code $exit_code"
    fi
    
    exit $exit_code
}

# Main Execution
main() {
    # Register cleanup handler
    trap cleanup EXIT
    
    # Setup restore environment
    setup_restore_environment || exit $?
    
    # Download and validate backup
    aws s3 cp "s3://$BACKUP_BUCKET/latest" "$RESTORE_ROOT" --recursive
    validate_backup "$RESTORE_ROOT" || exit $?
    
    # Perform MongoDB restore
    restore_mongodb "$RESTORE_ROOT" "$MONGODB_URI" || exit $?
    
    # Perform S3 recordings restore
    restore_s3_recordings "$BACKUP_BUCKET" "$TARGET_BUCKET" || exit $?
    
    # Verify restore
    verify_restore || exit $?
    
    return 0
}

# Script entry point
main "$@"
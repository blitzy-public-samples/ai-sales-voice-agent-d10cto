#!/bin/bash

# DocShield Backup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.x
# - mongodb-database-tools v100.x
# - openssl v3.x
# - curl v7.x

set -euo pipefail

# Global Configuration
BACKUP_ROOT="/tmp/docshield_backups"
RETENTION_DAYS=90
BACKUP_BUCKET="${BACKUP_BUCKET:-docshield-prod-backups}"
BACKUP_REGIONS="us-east-1,us-west-2"
ENCRYPTION_KEY="/etc/docshield/backup_key.enc"
LOG_FILE="/var/log/docshield/backup.log"
MANIFEST_FILE="backup_manifest.json"
MAX_RETRIES=3
BACKUP_TIMEOUT=3600
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

# Logging function with LogTail integration
log_backup_status() {
    local operation=$1
    local status=$2
    local details=$3
    local level=${4:-INFO}
    
    local message="{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"operation\":\"${operation}\",\"status\":\"${status}\",\"details\":${details},\"level\":\"${level}\"}"
    
    # Local logging
    echo "[$(date)] [${level}] ${message}" >> "${LOG_FILE}"
    
    # LogTail integration
    if [[ -n "${LOGTAIL_API_KEY:-}" ]]; then
        curl -s -X POST "https://in.logtail.com/" \
            -H "Authorization: Bearer ${LOGTAIL_API_KEY}" \
            -H "Content-Type: application/json" \
            -d "${message}" || true
    fi
}

# Environment setup and validation
setup_backup_environment() {
    # Verify running as backup service user
    if [[ $(id -u) != $(id -u backup) ]]; then
        log_backup_status "setup" "ERROR" "{\"message\":\"Must run as backup user\"}" "ERROR"
        return 1
    fi
    
    # Create backup directory with secure permissions
    mkdir -p "${BACKUP_DIR}"
    chmod 0700 "${BACKUP_DIR}"
    
    # Validate AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        log_backup_status "setup" "ERROR" "{\"message\":\"AWS credentials validation failed\"}" "ERROR"
        return 1
    }
    
    # Verify encryption key
    if [[ ! -f "${ENCRYPTION_KEY}" ]] || [[ ! -r "${ENCRYPTION_KEY}" ]]; then
        log_backup_status "setup" "ERROR" "{\"message\":\"Encryption key not accessible\"}" "ERROR"
        return 1
    }
    
    log_backup_status "setup" "SUCCESS" "{\"backup_dir\":\"${BACKUP_DIR}\"}"
    return 0
}

# MongoDB backup function
backup_mongodb() {
    local conn_string=$1
    local backup_path=$2
    local encryption_key=$3
    local retry_count=0
    
    while [[ ${retry_count} -lt ${MAX_RETRIES} ]]; do
        log_backup_status "mongodb_backup" "STARTED" "{\"attempt\":$((retry_count + 1))}"
        
        if mongodump --uri="${conn_string}" \
            --out="${backup_path}/mongodb" \
            --oplog \
            --gzip; then
            
            # Calculate checksums
            find "${backup_path}/mongodb" -type f -exec sha256sum {} \; > "${backup_path}/mongodb_checksums.txt"
            
            # Encrypt backup
            tar czf - -C "${backup_path}" mongodb mongodb_checksums.txt | \
                openssl enc -aes-256-gcm -salt -pbkdf2 \
                -pass file:"${encryption_key}" \
                -out "${backup_path}/mongodb_backup.enc"
            
            log_backup_status "mongodb_backup" "SUCCESS" "{\"path\":\"${backup_path}/mongodb_backup.enc\"}"
            return 0
        else
            retry_count=$((retry_count + 1))
            log_backup_status "mongodb_backup" "RETRY" "{\"attempt\":${retry_count}}" "WARN"
            sleep $((2 ** retry_count))
        fi
    done
    
    log_backup_status "mongodb_backup" "FAILED" "{\"max_retries\":${MAX_RETRIES}}" "ERROR"
    return 2
}

# S3 recordings backup function
backup_s3_recordings() {
    local source_bucket=$1
    local backup_bucket=$2
    local regions=$3
    
    log_backup_status "s3_backup" "STARTED" "{\"source\":\"${source_bucket}\"}"
    
    # Sync to primary backup location
    if ! aws s3 sync "s3://${source_bucket}" "s3://${backup_bucket}/recordings/${TIMESTAMP}" \
        --sse aws:kms \
        --metadata "backup_date=${TIMESTAMP}" \
        --metadata-directive REPLACE; then
        log_backup_status "s3_backup" "FAILED" "{\"stage\":\"primary_sync\"}" "ERROR"
        return 3
    fi
    
    # Cross-region replication
    IFS=',' read -ra REGION_ARRAY <<< "${regions}"
    for region in "${REGION_ARRAY[@]}"; do
        if [[ "${region}" != "$(aws configure get region)" ]]; then
            log_backup_status "s3_backup" "REPLICATION" "{\"region\":\"${region}\"}"
            
            if ! aws s3 sync "s3://${backup_bucket}/recordings/${TIMESTAMP}" \
                "s3://${backup_bucket}-${region}/recordings/${TIMESTAMP}" \
                --source-region "$(aws configure get region)" \
                --region "${region}" \
                --sse aws:kms; then
                log_backup_status "s3_backup" "FAILED" "{\"stage\":\"replication\",\"region\":\"${region}\"}" "ERROR"
                return 7
            fi
        fi
    done
    
    log_backup_status "s3_backup" "SUCCESS" "{\"timestamp\":\"${TIMESTAMP}\"}"
    return 0
}

# Cleanup old backups
cleanup_old_backups() {
    local retention_days=$1
    local regions=$2
    local cutoff_date=$(date -d "${retention_days} days ago" +%Y%m%d)
    
    log_backup_status "cleanup" "STARTED" "{\"retention_days\":${retention_days}}"
    
    # Clean local backups
    find "${BACKUP_ROOT}" -maxdepth 1 -type d -mtime "+${retention_days}" -exec rm -rf {} \;
    
    # Clean S3 backups in all regions
    IFS=',' read -ra REGION_ARRAY <<< "${regions}"
    for region in "${REGION_ARRAY[@]}"; do
        local bucket="${BACKUP_BUCKET}"
        [[ "${region}" != "$(aws configure get region)" ]] && bucket="${BACKUP_BUCKET}-${region}"
        
        aws s3 ls "s3://${bucket}/recordings/" | while read -r line; do
            local backup_date=$(echo "${line}" | awk '{print $2}' | cut -d'/' -f1)
            if [[ "${backup_date}" < "${cutoff_date}" ]]; then
                aws s3 rm "s3://${bucket}/recordings/${backup_date}" --recursive --region "${region}"
            fi
        done
    done
    
    log_backup_status "cleanup" "SUCCESS" "{\"cutoff_date\":\"${cutoff_date}\"}"
    return 0
}

# Main backup process
main() {
    local exit_code=0
    
    # Setup environment
    if ! setup_backup_environment; then
        exit 1
    fi
    
    # Start backup timer
    SECONDS=0
    
    # MongoDB backup
    if ! backup_mongodb "${MONGODB_URI}" "${BACKUP_DIR}" "${ENCRYPTION_KEY}"; then
        exit_code=2
    fi
    
    # S3 recordings backup
    if ! backup_s3_recordings "${S3_SOURCE_BUCKET}" "${BACKUP_BUCKET}" "${BACKUP_REGIONS}"; then
        exit_code=3
    fi
    
    # Cleanup old backups
    if ! cleanup_old_backups "${RETENTION_DAYS}" "${BACKUP_REGIONS}"; then
        exit_code=4
    fi
    
    # Generate backup manifest
    jq -n \
        --arg timestamp "${TIMESTAMP}" \
        --arg duration "${SECONDS}" \
        --arg status "$([[ ${exit_code} -eq 0 ]] && echo 'SUCCESS' || echo 'PARTIAL_FAILURE')" \
        --arg exit_code "${exit_code}" \
        '{timestamp: $timestamp, duration: $duration, status: $status, exit_code: $exit_code}' \
        > "${BACKUP_DIR}/${MANIFEST_FILE}"
    
    # Upload manifest to S3
    aws s3 cp "${BACKUP_DIR}/${MANIFEST_FILE}" "s3://${BACKUP_BUCKET}/manifests/${TIMESTAMP}_${MANIFEST_FILE}"
    
    log_backup_status "backup" "COMPLETE" "{\"duration\":${SECONDS},\"exit_code\":${exit_code}}"
    
    return ${exit_code}
}

# Execute main function with timeout
timeout ${BACKUP_TIMEOUT} main
exit_code=$?

if [[ ${exit_code} -eq 124 ]]; then
    log_backup_status "backup" "TIMEOUT" "{\"timeout\":${BACKUP_TIMEOUT}}" "ERROR"
    exit 8
else
    exit ${exit_code}
fi
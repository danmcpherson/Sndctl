#!/bin/bash
# Auto-upgrade script for Sound Control
# This script is executed by systemd timer at 4am daily
# It checks for updates and applies them if available

set -e

SCRIPT_NAME="sndctl-upgrade"
LOG_TAG="sndctl-upgrade"
SNDCTL_API_URL="${SNDCTL_API_URL:-http://localhost:80}"

# Log to both stdout and syslog
log() {
    local level="$1"
    shift
    echo "[$level] $*"
    logger -t "$LOG_TAG" -p "user.$level" "$*" 2>/dev/null || true
}

log_info() { log "info" "$@"; }
log_warn() { log "warning" "$@"; }
log_error() { log "err" "$@"; }

# Check if the service is running
check_service_running() {
    if systemctl is-active --quiet sndctl; then
        return 0
    else
        return 1
    fi
}

# Call the local API to trigger an upgrade check and apply
trigger_upgrade() {
    log_info "Checking for available upgrades..."
    
    # First check if an upgrade is available
    local check_response
    check_response=$(curl -s -f -X POST "$SNDCTL_API_URL/upgrades/check" 2>&1) || {
        log_error "Failed to check for upgrades: $check_response"
        return 1
    }
    
    # Parse the response (using jq if available, otherwise basic grep)
    local update_available
    if command -v jq &>/dev/null; then
        update_available=$(echo "$check_response" | jq -r '.updateAvailable // false')
    else
        # Basic parsing without jq
        if echo "$check_response" | grep -q '"updateAvailable":\s*true'; then
            update_available="true"
        else
            update_available="false"
        fi
    fi
    
    if [ "$update_available" = "false" ]; then
        log_info "No update available, system is current"
        return 0
    fi
    
    log_info "Update available, applying upgrade..."
    
    # Trigger the upgrade
    local apply_response
    apply_response=$(curl -s -f -X POST "$SNDCTL_API_URL/upgrades/apply" 2>&1) || {
        log_error "Failed to apply upgrade: $apply_response"
        return 1
    }
    
    log_info "Upgrade triggered: $apply_response"
    
    # The service will restart itself after the upgrade
    # Wait a bit for the service to restart
    sleep 5
    
    # Verify the service is running
    local retry_count=0
    local max_retries=12
    while [ $retry_count -lt $max_retries ]; do
        if check_service_running; then
            log_info "Service restarted successfully after upgrade"
            return 0
        fi
        log_info "Waiting for service to restart... (attempt $((retry_count + 1))/$max_retries)"
        sleep 5
        retry_count=$((retry_count + 1))
    done
    
    log_error "Service failed to restart after upgrade"
    return 1
}

# Main execution
main() {
    log_info "Starting upgrade check"
    
    # Verify the service is running
    if ! check_service_running; then
        log_warn "sndctl service is not running, attempting to start..."
        systemctl start sndctl || {
            log_error "Failed to start sndctl service"
            exit 1
        }
        sleep 5
    fi
    
    # Run the upgrade check
    if trigger_upgrade; then
        log_info "Upgrade check completed successfully"
        exit 0
    else
        log_error "Upgrade check failed"
        exit 1
    fi
}

main "$@"

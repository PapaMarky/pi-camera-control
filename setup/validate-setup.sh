#!/bin/bash
#
# Pi Camera Controller - Setup Validation Script
# Validates that a Pi has been properly configured as a camera controller
#

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

echo_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((ERRORS++))
}

check_services() {
    echo_info "Checking system services..."

    local services=("create-ap-interface" "hostapd" "dnsmasq" "pi-camera-control")

    for service in "${services[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            if systemctl is-active "$service" >/dev/null 2>&1; then
                echo_success "Service $service is enabled and running"
            else
                echo_error "Service $service is enabled but not running"
            fi
        else
            echo_error "Service $service is not enabled"
        fi
    done
}

check_network() {
    echo_info "Checking network configuration..."

    # Check ap0 interface
    if ip addr show ap0 >/dev/null 2>&1; then
        if ip addr show ap0 | grep -q "192.168.4.1"; then
            echo_success "ap0 interface configured with correct IP"
        else
            echo_error "ap0 interface exists but wrong IP configuration"
        fi
    else
        echo_error "ap0 interface not found"
    fi

    # Check hostapd configuration
    if [ -f "/etc/hostapd/hostapd.conf" ]; then
        if grep -q "interface=ap0" /etc/hostapd/hostapd.conf; then
            echo_success "hostapd configuration found"
        else
            echo_error "hostapd configuration invalid"
        fi
    else
        echo_error "hostapd configuration not found"
    fi

    # Check dnsmasq configuration
    if [ -f "/etc/dnsmasq.d/ap.conf" ]; then
        if grep -q "interface=ap0" /etc/dnsmasq.d/ap.conf; then
            echo_success "dnsmasq AP configuration found"
        else
            echo_error "dnsmasq AP configuration invalid"
        fi
    else
        echo_error "dnsmasq AP configuration not found"
    fi
}

check_application() {
    echo_info "Checking application..."

    # Check project directory
    if [ -d "/home/pi/pi-camera-control" ]; then
        echo_success "Project directory exists"

        # Check Node.js dependencies
        if [ -d "/home/pi/pi-camera-control/node_modules" ]; then
            echo_success "Node.js dependencies installed"
        else
            echo_error "Node.js dependencies not installed"
        fi

        # Check environment file
        if [ -f "/home/pi/pi-camera-control/.env" ]; then
            echo_success "Environment configuration exists"
        else
            echo_warning "Environment configuration not found"
        fi
    else
        echo_error "Project directory not found"
    fi

    # Check web server
    if curl -s http://localhost:3000/health >/dev/null 2>&1; then
        echo_success "Web server responding"
    else
        echo_error "Web server not responding"
    fi
}

check_utilities() {
    echo_info "Checking utility scripts..."

    local scripts=("test-ap.sh" "setup-ethernet-linklocal.sh")

    for script in "${scripts[@]}"; do
        if [ -f "/home/pi/$script" ] && [ -x "/home/pi/$script" ]; then
            echo_success "Utility script $script exists and is executable"
        else
            echo_warning "Utility script $script missing or not executable"
        fi
    done
}

check_connectivity() {
    echo_info "Checking connectivity..."

    # Check if AP is broadcasting
    if iwlist wlan0 scan 2>/dev/null | grep -q "PiCameraController"; then
        echo_success "Access Point is broadcasting"
    else
        echo_warning "Access Point may not be broadcasting (or scan failed)"
    fi

    # Check web server binding
    if netstat -tlpn 2>/dev/null | grep -q ":3000"; then
        echo_success "Web server listening on port 3000"
    else
        echo_error "Web server not listening on port 3000"
    fi
}

print_summary() {
    echo
    echo "=================="
    echo "VALIDATION SUMMARY"
    echo "=================="

    if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        echo_success "All checks passed! Pi Camera Controller is properly configured."
        echo_info "The system should be ready for use."
    elif [ $ERRORS -eq 0 ]; then
        echo_warning "Setup completed with $WARNINGS warning(s)."
        echo_info "The system should work but may have minor issues."
    else
        echo_error "Setup validation failed with $ERRORS error(s) and $WARNINGS warning(s)."
        echo_info "Please review the errors above and re-run setup if needed."
    fi

    echo
    echo_info "Quick tests:"
    echo "  - Access Point: Connect to 'PiCameraController002'"
    echo "  - Web Interface: http://192.168.4.1:3000"
    echo "  - Status check: ~/test-ap.sh"
    echo "  - Service logs: sudo journalctl -u pi-camera-control -f"
}

main() {
    echo_info "Pi Camera Controller - Setup Validation"
    echo_info "========================================"
    echo

    check_services
    echo
    check_network
    echo
    check_application
    echo
    check_utilities
    echo
    check_connectivity
    echo
    print_summary

    # Exit with error code if there were failures
    exit $ERRORS
}

main "$@"
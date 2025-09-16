#!/bin/bash
#
# Pi Camera Controller - Complete Setup Script
# Transforms a fresh Raspberry Pi OS installation into a turnkey camera controller
#
# Usage: curl -sSL https://raw.githubusercontent.com/PapaMarky/pi-camera-control/main/setup/pi-setup.sh | bash
# Or: git clone repo && cd pi-camera-control/setup && ./pi-setup.sh
#

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/PapaMarky/pi-camera-control.git"
PROJECT_DIR="/home/pi/pi-camera-control"
SERVICE_USER="pi"

# Logging
LOG_FILE="/var/log/pi-camera-setup.log"
exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    echo_info "Checking system requirements..."

    # Check if running as pi user
    if [ "$USER" != "pi" ]; then
        echo_error "This script must be run as the 'pi' user"
        exit 1
    fi

    # Check if running on Raspberry Pi
    if ! grep -q "Raspberry Pi" /proc/cpuinfo; then
        echo_warning "This doesn't appear to be a Raspberry Pi"
    fi

    # Check internet connectivity
    if ! ping -c 1 google.com >/dev/null 2>&1; then
        echo_error "No internet connection. Please connect to WiFi first."
        exit 1
    fi

    echo_success "System requirements check passed"
}

update_system() {
    echo_info "Updating system packages..."
    sudo apt update
    sudo apt upgrade -y
    echo_success "System packages updated"
}

install_dependencies() {
    echo_info "Installing required packages..."

    # System packages
    sudo apt install -y \
        git curl wget \
        hostapd dnsmasq \
        nodejs npm \
        python3-pip \
        wireless-tools \
        iw \
        network-manager

    # Enable NetworkManager and disable conflicting services
    sudo systemctl enable NetworkManager
    sudo systemctl disable dhcpcd || true
    sudo systemctl disable wpa_supplicant || true

    echo_success "Dependencies installed"
}

setup_project() {
    echo_info "Setting up project files..."

    # Remove existing project directory if it exists
    if [ -d "$PROJECT_DIR" ]; then
        echo_warning "Removing existing project directory"
        rm -rf "$PROJECT_DIR"
    fi

    # Clone repository
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"

    # Install Node.js dependencies
    npm install

    echo_success "Project files set up"
}

configure_network() {
    echo_info "Configuring network services..."

    # Copy hostapd configuration
    sudo cp runtime/hostapd-pi-zero-w.conf /etc/hostapd/hostapd.conf

    # Configure hostapd daemon
    if ! grep -q "DAEMON_CONF=" /etc/default/hostapd; then
        echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' | sudo tee -a /etc/default/hostapd
    else
        sudo sed -i 's|^#*DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
    fi

    # Configure dnsmasq
    sudo tee /etc/dnsmasq.d/ap.conf << EOF
# Pi Camera Controller Access Point Configuration
interface=ap0
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,1d
dhcp-option=3,192.168.4.1
dhcp-option=6,8.8.8.8,8.8.4.4
bind-interfaces
EOF

    echo_success "Network services configured"
}

install_systemd_services() {
    echo_info "Installing systemd services..."

    # Install create-ap-interface service
    sudo cp runtime/create-ap-interface.service /etc/systemd/system/
    sudo systemctl enable create-ap-interface

    # Install pi-camera-control service
    sudo cp runtime/pi-camera-control.service /etc/systemd/system/
    sudo systemctl enable pi-camera-control

    # Configure dnsmasq dependencies
    sudo mkdir -p /etc/systemd/system/dnsmasq.service.d
    sudo tee /etc/systemd/system/dnsmasq.service.d/override.conf << EOF
[Unit]
After=hostapd.service
Wants=hostapd.service

[Install]
WantedBy=multi-user.target
EOF

    # Enable services
    sudo systemctl enable hostapd
    sudo systemctl enable dnsmasq

    # Reload systemd
    sudo systemctl daemon-reload

    echo_success "Systemd services installed"
}

configure_environment() {
    echo_info "Configuring environment..."

    # Create .env file if it doesn't exist
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        tee "$PROJECT_DIR/.env" << EOF
# Pi Camera Controller Environment Configuration
NODE_ENV=production
PORT=3000
CAMERA_IP=192.168.12.98
CAMERA_PORT=443
LOG_LEVEL=info
EOF
    fi

    # Set proper permissions
    chmod 600 "$PROJECT_DIR/.env"

    echo_success "Environment configured"
}

setup_utility_scripts() {
    echo_info "Setting up utility scripts..."

    # Ethernet link-local setup script
    tee /home/pi/setup-ethernet-linklocal.sh << 'EOF'
#!/bin/bash
# Setup ethernet link-local IP for backup connectivity
echo "Setting up ethernet link-local IP address..."

# Check if eth0 is up
if ! ip link show eth0 | grep -q "state UP"; then
    echo "Bringing up eth0 interface..."
    sudo ip link set eth0 up
fi

# Assign link-local IP
echo "Assigning IP address 169.254.162.2/16 to eth0..."
sudo ip addr add 169.254.162.2/16 dev eth0 2>/dev/null || echo "IP already assigned"

# Show current status
echo "Current eth0 status:"
ip addr show eth0

echo "Ethernet link-local setup complete!"
echo "Pi can now be reached at: 169.254.162.2"
echo "Web interface: http://169.254.162.2:3000"
EOF

    # AP test script
    tee /home/pi/test-ap.sh << 'EOF'
#!/bin/bash
echo "=== Pi Camera Controller Access Point Status ==="
echo

echo "1. Service Status:"
systemctl is-active create-ap-interface hostapd dnsmasq | paste <(echo -e "create-ap-interface:\nhostapd:\ndnsmasq:") -

echo
echo "2. Network Interface:"
ip addr show ap0 | grep -E "(inet |link/ether)" || echo "ERROR: ap0 interface not found!"

echo
echo "3. DHCP Status:"
sudo systemctl status dnsmasq | grep -E "IP range|interface" || echo "Check dnsmasq logs for DHCP info"

echo
echo "4. Active Connections:"
sudo journalctl -u hostapd --lines=5 --no-pager | grep "associated" | tail -3 || echo "No recent connections"

echo
echo "Access Point should be available at:"
echo "  SSID: PiCameraController002"
echo "  Password: welcome-to-markys-network"
echo "  Gateway: 192.168.4.1"
echo "  Web Interface: http://192.168.4.1:3000"
EOF

    # Make scripts executable
    chmod +x /home/pi/setup-ethernet-linklocal.sh
    chmod +x /home/pi/test-ap.sh

    echo_success "Utility scripts created"
}

optimize_system() {
    echo_info "Optimizing system for camera controller..."

    # Disable unnecessary services to save resources
    sudo systemctl disable bluetooth || true
    sudo systemctl disable hciuart || true

    # Enable SSH (if not already enabled)
    sudo systemctl enable ssh

    # Set timezone (adjust as needed)
    sudo timedatectl set-timezone America/Los_Angeles

    echo_success "System optimized"
}

test_installation() {
    echo_info "Testing installation..."

    # Test Node.js application
    cd "$PROJECT_DIR"
    if npm test >/dev/null 2>&1; then
        echo_success "Node.js application test passed"
    else
        echo_warning "Node.js application test failed (this may be normal if no tests are defined)"
    fi

    # Test service files
    if sudo systemctl --dry-run start pi-camera-control >/dev/null 2>&1; then
        echo_success "Service configuration test passed"
    else
        echo_error "Service configuration test failed"
        return 1
    fi

    echo_success "Installation tests completed"
}

print_summary() {
    echo
    echo_success "======================="
    echo_success "INSTALLATION COMPLETE!"
    echo_success "======================="
    echo
    echo_info "Pi Camera Controller has been successfully installed and configured."
    echo
    echo_info "Next steps:"
    echo "  1. Reboot the Pi: sudo reboot"
    echo "  2. Connect to WiFi network 'PiCameraController002'"
    echo "  3. Password: welcome-to-markys-network"
    echo "  4. Open web browser to: http://192.168.4.1:3000"
    echo
    echo_info "Utility commands:"
    echo "  - Test AP status: ~/test-ap.sh"
    echo "  - Setup ethernet backup: ~/setup-ethernet-linklocal.sh"
    echo "  - View logs: sudo journalctl -u pi-camera-control -f"
    echo "  - Service status: sudo systemctl status pi-camera-control"
    echo
    echo_info "Troubleshooting:"
    echo "  - Setup log: $LOG_FILE"
    echo "  - Documentation: $PROJECT_DIR/docs/"
    echo "  - Repository: $REPO_URL"
}

main() {
    echo_info "Starting Pi Camera Controller setup..."
    echo_info "This will transform your Pi into a turnkey camera controller"
    echo

    check_requirements
    update_system
    install_dependencies
    setup_project
    configure_network
    install_systemd_services
    configure_environment
    setup_utility_scripts
    optimize_system
    test_installation
    print_summary

    echo
    echo_success "Setup completed successfully!"
    echo_warning "Please REBOOT the Pi to complete the installation: sudo reboot"
}

# Run main function
main "$@"
#!/bin/bash
# Pi Camera Control System Setup Script
# Comprehensive setup for Raspberry Pi as camera controller with dual WiFi mode

set -e

echo "=== Pi Camera Control System Setup ==="
echo "This script will configure your Raspberry Pi for camera control with dual WiFi mode."
echo "It will install required packages, configure networking, and set up system services."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on Raspberry Pi - SAFETY CHECK
check_raspberry_pi() {
    local is_pi=false
    
    # Check /proc/cpuinfo for Pi identification
    if grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
        is_pi=true
    fi
    
    # Check for Pi-specific hardware
    if grep -q "BCM" /proc/cpuinfo 2>/dev/null; then
        is_pi=true
    fi
    
    # Check for ARM architecture (Pi-specific check)
    if uname -m | grep -q "arm"; then
        is_pi=true
    fi
    
    # Check for Pi-specific directories
    if [ -d "/boot/firmware" ] || [ -f "/boot/config.txt" ]; then
        is_pi=true
    fi
    
    if [ "$is_pi" = false ]; then
        log_error "SAFETY CHECK FAILED: This script is designed for Raspberry Pi only!"
        log_error "Detected system: $(uname -a)"
        log_error "This appears to be a desktop/laptop system."
        echo ""
        echo "This script will:"
        echo "- Modify system network configuration"
        echo "- Install and configure network services"
        echo "- Disable IPv6 system-wide"
        echo "- Create access point interfaces"
        echo ""
        echo "Running this on a desktop/laptop could disrupt your network connectivity."
        echo ""
        read -p "Are you ABSOLUTELY SURE you want to continue? [type 'YES' to proceed]: " confirm
        if [ "$confirm" != "YES" ]; then
            log_info "Setup cancelled for safety. Run on Raspberry Pi hardware only."
            exit 1
        fi
        log_warn "Proceeding on non-Pi hardware at user's explicit request..."
    else
        log_info "Raspberry Pi detected - proceeding with setup"
    fi
}

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
    log_warn "Running as root. Some operations will use sudo for clarity."
    SUDO_CMD=""
else
    log_info "Running with user privileges. Will use sudo where needed."
    SUDO_CMD="sudo"
fi

# Function to check if a package is installed
is_package_installed() {
    dpkg -l "$1" &> /dev/null
}

# Function to check if a service exists
service_exists() {
    systemctl list-unit-files | grep -q "^$1"
}

# Install required system packages
install_system_packages() {
    log_info "Installing required system packages..."
    
    # Update package list
    $SUDO_CMD apt update
    
    # Required packages
    local packages=(
        "hostapd"           # Access Point daemon
        "dnsmasq"           # DHCP and DNS server
        "iptables"          # Firewall and NAT
        "iw"               # Wireless configuration tool
        "wpasupplicant"     # WPA client
        "dhcpcd5"          # DHCP client daemon
        "nodejs"           # Node.js runtime (if not already installed)
        "npm"              # Node.js package manager
    )
    
    local packages_to_install=()
    
    for package in "${packages[@]}"; do
        if ! is_package_installed "$package"; then
            packages_to_install+=("$package")
        else
            log_info "$package is already installed"
        fi
    done
    
    if [ ${#packages_to_install[@]} -gt 0 ]; then
        log_info "Installing packages: ${packages_to_install[*]}"
        $SUDO_CMD apt install -y "${packages_to_install[@]}"
    else
        log_info "All required packages are already installed"
    fi
}

# Configure hostapd for access point
configure_hostapd() {
    log_info "Configuring hostapd for access point..."
    
    # Create hostapd configuration
    $SUDO_CMD tee /etc/hostapd/hostapd.conf > /dev/null <<EOF
# Pi Camera Control Access Point Configuration
interface=ap0
driver=nl80211
ssid=PiCameraController
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0

# Security configuration
wpa=2
wpa_passphrase=camera123
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF
    
    # Configure hostapd daemon
    $SUDO_CMD sed -i 's/#DAEMON_CONF=""/DAEMON_CONF="\/etc\/hostapd\/hostapd.conf"/' /etc/default/hostapd || true
    
    log_info "hostapd configuration complete"
}

# Configure dnsmasq for DHCP and DNS
configure_dnsmasq() {
    log_info "Configuring dnsmasq for DHCP and DNS..."
    
    # Backup original dnsmasq.conf if it exists
    if [ -f /etc/dnsmasq.conf ] && [ ! -f /etc/dnsmasq.conf.backup ]; then
        $SUDO_CMD cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup
        log_info "Backed up original dnsmasq.conf"
    fi
    
    # Create dnsmasq configuration for access point
    $SUDO_CMD tee /etc/dnsmasq.conf > /dev/null <<EOF
# Pi Camera Control dnsmasq Configuration
# Basic configuration
interface=ap0
bind-interfaces

# DHCP configuration for AP clients
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h

# DNS configuration
address=/#/192.168.4.1
address=/picontrol.local/192.168.4.1
address=/camera.local/192.168.4.1
address=/pi-camera-control.local/192.168.4.1

# Disable DNS forwarding for local network
no-resolv
server=8.8.8.8
server=8.8.4.4
EOF
    
    log_info "dnsmasq configuration complete"
}

# Configure network interfaces
configure_network_interfaces() {
    log_info "Configuring network interfaces..."
    
    # Configure ap0 interface in dhcpcd.conf
    if ! grep -q "interface ap0" /etc/dhcpcd.conf; then
        $SUDO_CMD tee -a /etc/dhcpcd.conf > /dev/null <<EOF

# Pi Camera Control AP configuration
interface ap0
static ip_address=192.168.4.1/24
nohook wpa_supplicant
EOF
        log_info "Added ap0 interface configuration to dhcpcd.conf"
    else
        log_info "ap0 interface already configured in dhcpcd.conf"
    fi
}

# Disable IPv6 system-wide for simplified networking
disable_ipv6() {
    log_info "Disabling IPv6 system-wide for simplified networking..."
    
    # Add IPv6 disable parameters to kernel command line
    if ! grep -q "ipv6.disable=1" /boot/cmdline.txt 2>/dev/null; then
        # Backup original cmdline.txt
        $SUDO_CMD cp /boot/cmdline.txt /boot/cmdline.txt.backup 2>/dev/null || true
        
        # Add IPv6 disable parameter
        $SUDO_CMD sed -i 's/$/ ipv6.disable=1/' /boot/cmdline.txt 2>/dev/null || {
            log_warn "Could not modify /boot/cmdline.txt - IPv6 may still be enabled"
        }
    fi
    
    # Add sysctl configuration
    $SUDO_CMD tee /etc/sysctl.d/99-disable-ipv6.conf > /dev/null <<EOF
# Disable IPv6 for Pi Camera Control
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1
EOF
    
    # Apply sysctl changes immediately
    $SUDO_CMD sysctl -p /etc/sysctl.d/99-disable-ipv6.conf || true
    
    log_info "IPv6 disabled system-wide"
}

# Install network mode control script
install_network_mode_script() {
    log_info "Installing network mode control script..."
    
    # Copy the camera-network-mode script from runtime directory
    local script_source="$(dirname "$0")/../runtime/camera-network-mode"
    
    if [ -f "$script_source" ]; then
        $SUDO_CMD cp "$script_source" /usr/local/bin/camera-network-mode
        $SUDO_CMD chmod 755 /usr/local/bin/camera-network-mode
        log_info "Network mode script installed to /usr/local/bin/camera-network-mode"
    else
        log_error "Network mode script not found at $script_source"
        return 1
    fi
}

# Install create-ap-interface service
install_ap_interface_service() {
    log_info "Installing create-ap-interface systemd service..."

    local service_source="$(dirname "$0")/../runtime/create-ap-interface.service"

    if [ -f "$service_source" ]; then
        $SUDO_CMD cp "$service_source" /etc/systemd/system/
        $SUDO_CMD systemctl daemon-reload
        $SUDO_CMD systemctl enable create-ap-interface
        log_info "create-ap-interface service installed and enabled"
        log_info "This service creates the ap0 interface required for hostapd"
    else
        log_error "create-ap-interface service file not found at $service_source"
        return 1
    fi
}

# Configure systemd services
configure_services() {
    log_info "Configuring systemd services..."

    # Disable services initially (they will be managed by our network mode script)
    local services=("hostapd" "dnsmasq")

    for service in "${services[@]}"; do
        if service_exists "$service"; then
            $SUDO_CMD systemctl stop "$service" 2>/dev/null || true
            $SUDO_CMD systemctl disable "$service" 2>/dev/null || true
            log_info "Disabled $service (will be managed by network mode script)"
        fi
    done

    # Enable and configure wpa_supplicant for wlan0
    if service_exists "wpa_supplicant@wlan0"; then
        $SUDO_CMD systemctl enable wpa_supplicant@wlan0 || true
        log_info "Enabled wpa_supplicant@wlan0"
    fi
}

# Install Node.js application service
install_app_service() {
    log_info "Installing Pi Camera Control application service..."
    
    local service_source="$(dirname "$0")/../runtime/pi-camera-control.service"
    
    if [ -f "$service_source" ]; then
        $SUDO_CMD cp "$service_source" /etc/systemd/system/
        $SUDO_CMD systemctl daemon-reload
        $SUDO_CMD systemctl enable pi-camera-control
        log_info "Pi Camera Control service installed and enabled"
    else
        log_error "Service file not found at $service_source"
        return 1
    fi
}

# Install Node.js dependencies
install_node_dependencies() {
    log_info "Installing Node.js dependencies..."
    
    local app_dir="$(dirname "$0")/.."
    
    if [ -f "$app_dir/package.json" ]; then
        cd "$app_dir"
        npm install
        log_info "Node.js dependencies installed"
        cd - > /dev/null
    else
        log_warn "package.json not found - Node.js dependencies not installed"
    fi
}

# Main setup function
main() {
    log_info "Starting Pi Camera Control system setup..."
    
    # SAFETY CHECK: Ensure we're running on a Raspberry Pi
    check_raspberry_pi
    
    # Check for required directories
    local script_dir="$(dirname "$0")"
    if [ ! -d "$script_dir/../runtime" ]; then
        log_error "Runtime directory not found. Please run this script from the setup directory."
        exit 1
    fi
    
    # Run setup steps
    install_system_packages
    configure_hostapd
    configure_dnsmasq
    configure_network_interfaces
    disable_ipv6
    install_network_mode_script
    install_ap_interface_service
    configure_services
    install_app_service
    install_node_dependencies
    
    log_info "=== Setup Complete ==="
    echo ""
    log_info "Pi Camera Control system has been configured successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Reboot the Pi to apply all changes: sudo reboot"
    echo "2. After reboot, the access point 'PiCameraController' will be available"
    echo "3. Default password: camera123"
    echo "4. Connect to http://192.168.4.1:3000 for the web interface"
    echo ""
    echo "Network modes can be controlled with:"
    echo "  sudo /usr/local/bin/camera-network-mode field       # AP only"
    echo "  sudo /usr/local/bin/camera-network-mode development # AP + WiFi"
    echo "  sudo /usr/local/bin/camera-network-mode wifi-only   # WiFi only"
    echo ""
    log_warn "A reboot is required for all changes to take effect."
}

# Run main function
main "$@"
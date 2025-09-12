#!/bin/bash
# Disable IPv6 system-wide on Raspberry Pi for simplified networking

# SAFETY CHECK: Ensure we're running on a Raspberry Pi
if ! grep -q "Raspberry Pi\|BCM" /proc/cpuinfo 2>/dev/null && ! uname -m | grep -q "arm" && [ ! -f "/boot/config.txt" ]; then
    echo "ERROR: This script is designed for Raspberry Pi only!"
    echo "Detected system: $(uname -a)"
    echo "This script modifies system network configuration and should not be run on desktop/laptop systems."
    echo ""
    read -p "Are you ABSOLUTELY SURE you want to continue? [type 'YES' to proceed]: " confirm
    if [ "$confirm" != "YES" ]; then
        echo "Setup cancelled for safety."
        exit 1
    fi
fi

echo "=== Disabling IPv6 on Raspberry Pi ==="

# 1. Disable IPv6 in kernel via sysctl
echo "Configuring sysctl to disable IPv6..."
sudo tee -a /etc/sysctl.conf > /dev/null <<EOF

# Pi Camera Control - Disable IPv6 for simplified networking
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1
net.ipv6.conf.wlan0.disable_ipv6 = 1
net.ipv6.conf.ap0.disable_ipv6 = 1
EOF

# 2. Disable IPv6 in kernel boot parameters
echo "Adding IPv6 disable to boot cmdline..."
CMDLINE_FILE="/boot/firmware/cmdline.txt"
if [ ! -f "$CMDLINE_FILE" ]; then
    CMDLINE_FILE="/boot/cmdline.txt"
fi

if [ -f "$CMDLINE_FILE" ]; then
    if ! grep -q "ipv6.disable=1" "$CMDLINE_FILE"; then
        sudo cp "$CMDLINE_FILE" "${CMDLINE_FILE}.backup"
        sudo sed -i 's/$/ ipv6.disable=1/' "$CMDLINE_FILE"
        echo "Added ipv6.disable=1 to $CMDLINE_FILE"
    else
        echo "IPv6 already disabled in boot cmdline"
    fi
else
    echo "Warning: Could not find boot cmdline file"
fi

# 3. Configure SSH to use IPv4 only
echo "Configuring SSH for IPv4 only..."
if ! grep -q "AddressFamily inet" /etc/ssh/sshd_config; then
    echo "AddressFamily inet" | sudo tee -a /etc/ssh/sshd_config
    echo "Configured SSH for IPv4 only"
else
    echo "SSH already configured for IPv4"
fi

# 4. Configure Avahi (mDNS) for IPv4 only
echo "Configuring Avahi for IPv4 only..."
if [ -f /etc/avahi/avahi-daemon.conf ]; then
    sudo sed -i 's/#use-ipv6=yes/use-ipv6=no/' /etc/avahi/avahi-daemon.conf
    sudo sed -i 's/use-ipv6=yes/use-ipv6=no/' /etc/avahi/avahi-daemon.conf
    echo "Configured Avahi for IPv4 only"
fi

# 5. Apply sysctl settings immediately (for current session)
echo "Applying sysctl settings..."
sudo sysctl -p

# 6. Restart services to apply changes
echo "Restarting services..."
sudo systemctl restart ssh
if systemctl is-active --quiet avahi-daemon; then
    sudo systemctl restart avahi-daemon
fi

echo ""
echo "=== IPv6 Disable Complete ==="
echo ""
echo "Changes made:"
echo "  ✓ Kernel sysctl settings added to /etc/sysctl.conf"
echo "  ✓ Boot parameter ipv6.disable=1 added to /boot/cmdline.txt"
echo "  ✓ SSH configured for IPv4 only"
echo "  ✓ Avahi configured for IPv4 only (if installed)"
echo ""
echo "IMPORTANT: A reboot is required for all changes to take effect:"
echo "  sudo reboot"
echo ""
echo "After reboot, verify with:"
echo "  cat /proc/sys/net/ipv6/conf/all/disable_ipv6  # Should show '1'"
echo "  sudo netstat -tunlp                           # Should show only IPv4 addresses"
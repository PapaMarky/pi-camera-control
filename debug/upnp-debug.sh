#!/bin/bash

# Debug script for UPnP/SSDP multicast reception
echo "=== UPnP/SSDP Debug Script ==="
echo "Date: $(date)"
echo

echo "=== Network Interface Status ==="
ip addr show ap0 2>/dev/null || echo "ap0 interface not found"
ip addr show wlan0 2>/dev/null || echo "wlan0 interface not found"
echo

echo "=== Multicast Route Table ==="
ip route show table all | grep 224.0.0.0 || echo "No multicast routes found"
echo

echo "=== Test Multicast Reception ==="
echo "Listening for SSDP multicast traffic on 239.255.255.250:1900 for 10 seconds..."
echo "This should show UPnP advertisements from cameras and other devices."
echo

# Listen for multicast traffic
timeout 10 tcpdump -i any -n host 239.255.255.250 and port 1900 2>/dev/null || echo "tcpdump not available"
echo

echo "=== Test Manual M-SEARCH ==="
echo "Sending M-SEARCH to discover UPnP devices..."

# Send M-SEARCH and listen for responses
{
echo -e "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 3\r\nST: upnp:rootdevice\r\n\r\n" | nc -u -w 5 239.255.255.250 1900
} &

# Listen for responses
timeout 5 tcpdump -i any -n host 239.255.255.250 and port 1900 2>/dev/null || echo "No responses detected"
echo

echo "=== Check Firewall Rules ==="
iptables -L | grep -i multicast || echo "No multicast-specific firewall rules"
echo

echo "=== Test Interface-Specific Multicast ==="
for iface in ap0 wlan0; do
    if ip addr show $iface >/dev/null 2>&1; then
        echo "Testing multicast on $iface..."
        timeout 3 tcpdump -i $iface -n host 239.255.255.250 2>/dev/null | head -5 || echo "No traffic on $iface"
    fi
done
echo

echo "=== Check if Camera is Reachable ==="
if [ -n "$1" ]; then
    CAMERA_IP="$1"
    echo "Testing camera connectivity at $CAMERA_IP..."
    ping -c 3 "$CAMERA_IP" 2>/dev/null || echo "Camera not reachable via ping"

    echo "Testing CCAPI endpoint..."
    curl -k -m 5 "https://$CAMERA_IP:443/ccapi" 2>/dev/null && echo "CCAPI endpoint accessible" || echo "CCAPI endpoint not accessible"
else
    echo "No camera IP provided - skipping camera connectivity test"
    echo "Usage: $0 [camera_ip]"
fi
echo

echo "=== Multicast Group Memberships ==="
netstat -gn 2>/dev/null | grep 239.255.255.250 && echo "Pi is member of SSDP multicast group" || echo "Pi is NOT member of SSDP multicast group"
echo

echo "=== Debug complete ==="
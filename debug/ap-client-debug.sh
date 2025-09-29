#!/bin/bash

# Debug script for AP client detection issues
# Run this script to diagnose AP client connectivity and discovery problems

echo "=== AP Client Debug Script ==="
echo "Date: $(date)"
echo

echo "=== Network Interface Status ==="
ip addr show ap0 2>/dev/null || echo "ap0 interface not found"
ip addr show wlan0 2>/dev/null || echo "wlan0 interface not found"
echo

echo "=== Service Status ==="
systemctl is-active hostapd
systemctl is-active dnsmasq
systemctl is-active NetworkManager
echo

echo "=== hostapd_cli clients ==="
hostapd_cli list_sta 2>/dev/null || echo "hostapd_cli failed"
echo

echo "=== Neighbor Table (192.168.4.x) ==="
/sbin/ip neigh show | grep 192.168.4
echo

echo "=== Full Neighbor Table ==="
/sbin/ip neigh show
echo

echo "=== ARP Table ==="
arp -a 2>/dev/null | grep 192.168.4 || echo "No 192.168.4.x entries in ARP table"
echo

echo "=== Network Scanner (nmap) ==="
# Quick ping scan of AP network
if command -v nmap >/dev/null 2>&1; then
    nmap -sn 192.168.4.0/24 2>/dev/null | grep "Nmap scan report"
else
    echo "nmap not available"
fi
echo

echo "=== DHCP Leases ==="
if [ -f /var/lib/dhcp/dhcpd.leases ]; then
    echo "dhcpd.leases:"
    cat /var/lib/dhcp/dhcpd.leases | grep -A5 -B1 "192.168.4"
elif [ -f /var/lib/dhcpcd5/dhcpcd.leases ]; then
    echo "dhcpcd.leases:"
    cat /var/lib/dhcpcd5/dhcpcd.leases
else
    echo "No DHCP lease files found"
fi
echo

echo "=== dnsmasq lease info ==="
if [ -f /var/lib/dhcp/dhcpd.leases ]; then
    tail -20 /var/lib/dhcp/dhcpd.leases
elif [ -f /var/lib/dnsmasq/dnsmasq.leases ]; then
    echo "dnsmasq.leases:"
    cat /var/lib/dnsmasq/dnsmasq.leases
else
    echo "No dnsmasq lease file found"
fi
echo

echo "=== UPnP Discovery Test ==="
# Listen for SSDP broadcasts briefly
timeout 5 tcpdump -i any -n port 1900 2>/dev/null | head -10 || echo "tcpdump not available or no UPnP traffic"
echo

echo "=== Process Status ==="
ps aux | grep -E "(hostapd|dnsmasq|NetworkManager)" | grep -v grep
echo

echo "=== Debug complete ==="
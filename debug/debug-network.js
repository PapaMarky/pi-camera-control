#!/usr/bin/env node

// Simple network diagnostic script to test the commands used by NetworkManager
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('=== Network Diagnostic Script ===\n');

async function runCommand(description, command) {
    console.log(`${description}:`);
    console.log(`Command: ${command}`);
    try {
        const { stdout, stderr } = await execAsync(command);
        if (stderr && !stderr.includes('Warning')) {
            console.log(`STDERR: ${stderr}`);
        }
        console.log(`OUTPUT:\n${stdout || '(no output)'}`);
    } catch (error) {
        console.log(`ERROR: ${error.message}`);
    }
    console.log('---\n');
}

async function main() {
    // Test basic network interface commands
    await runCommand('List network interfaces', 'ip addr show');
    
    // Test WiFi client status
    await runCommand('WiFi client status (wlan0)', 'ip addr show wlan0 2>/dev/null || echo "wlan0 not found"');
    
    // Test Access Point status 
    await runCommand('Access Point status (ap0)', 'ip addr show ap0 2>/dev/null || echo "ap0 not found"');
    
    // Test service status
    await runCommand('hostapd service status', 'systemctl is-active hostapd 2>/dev/null || echo "inactive"');
    await runCommand('dnsmasq service status', 'systemctl is-active dnsmasq 2>/dev/null || echo "inactive"');
    await runCommand('wpa_supplicant service status', 'systemctl is-active wpa_supplicant@wlan0 2>/dev/null || echo "inactive"');
    
    // Test NetworkManager access
    await runCommand('NetworkManager status', 'nmcli -t -f NAME,TYPE,DEVICE con show --active 2>/dev/null || echo "NetworkManager failed"');
    
    // Test hostapd client list (may need different approach)
    await runCommand('hostapd clients', 'hostapd_cli list_sta 2>/dev/null || echo "hostapd_cli not available"');
    
    // Check if network mode script exists
    await runCommand('Network mode script exists', 'ls -l /usr/local/bin/camera-network-mode 2>/dev/null || echo "script not found"');
    
    console.log('=== Diagnostic Complete ===');
}

main().catch(console.error);
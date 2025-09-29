#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

class NetworkDebuggingAgent {
    constructor() {
        this.results = {};
        this.isLinux = process.platform === 'linux';

        if (!this.isLinux) {
            console.warn('⚠️  Warning: This agent is designed for Linux/Raspberry Pi systems');
        }
    }

    async runDiagnostic(diagnosticType, options = {}) {
        console.log(`\n🔍 Running Network Diagnostic: ${diagnosticType.toUpperCase()}`);
        console.log('=' .repeat(50));

        try {
            switch (diagnosticType.toLowerCase()) {
                case 'wifi':
                    return await this.diagnoseWiFi(options);
                case 'access-point':
                case 'ap':
                    return await this.diagnoseAccessPoint(options);
                case 'interfaces':
                    return await this.diagnoseInterfaces(options);
                case 'networkmanager':
                case 'nm':
                    return await this.diagnoseNetworkManager(options);
                case 'comprehensive':
                    return await this.runComprehensiveDiagnostic(options);
                default:
                    throw new Error(`Unknown diagnostic type: ${diagnosticType}`);
            }
        } catch (error) {
            console.error(`❌ Diagnostic failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async diagnoseWiFi(options = {}) {
        const results = {
            scan: { status: 'pending' },
            connection: { status: 'pending' },
            connectivity: { status: 'pending' },
            recommendations: []
        };

        console.log('📡 Analyzing WiFi Configuration...');

        // Check WiFi interface status
        try {
            console.log('   Checking WiFi interface status...');
            const interfaceStatus = await this.getInterfaceStatus('wlan0');
            results.interface = interfaceStatus;

            if (!interfaceStatus.exists) {
                console.log('   ❌ wlan0 interface not found');
                results.scan.status = 'interface_missing';
                return results;
            }

            console.log(`   ✅ wlan0: ${interfaceStatus.state} (${interfaceStatus.type})`);
        } catch (error) {
            console.log(`   ❌ Interface check failed: ${error.message}`);
            results.interface = { status: 'error', error: error.message };
        }

        // Test WiFi scanning
        try {
            console.log('   Testing WiFi network scanning...');
            const scanResults = await this.performWiFiScan();
            results.scan = scanResults;

            if (scanResults.networks.length > 0) {
                console.log(`   ✅ Scan: Found ${scanResults.networks.length} networks`);
                if (options.ssid) {
                    const targetNetwork = scanResults.networks.find(n => n.ssid === options.ssid);
                    if (targetNetwork) {
                        console.log(`   ✅ Target network "${options.ssid}" found (${targetNetwork.signal}% signal)`);
                        results.targetNetwork = targetNetwork;
                    } else {
                        console.log(`   ⚠️  Target network "${options.ssid}" not found`);
                    }
                }
            } else {
                console.log('   ⚠️  Scan: No networks found');
            }
        } catch (error) {
            console.log(`   ❌ WiFi scan failed: ${error.message}`);
            results.scan.status = 'failed';
            results.scan.error = error.message;
        }

        // Check current connection
        try {
            console.log('   Checking current WiFi connection...');
            const connectionStatus = await this.getCurrentWiFiConnection();
            results.connection = connectionStatus;

            if (connectionStatus.connected) {
                console.log(`   ✅ Connected to: ${connectionStatus.ssid}`);
                console.log(`   📶 Signal: ${connectionStatus.signal}% (${connectionStatus.signalDbm} dBm)`);
                console.log(`   🌐 IP: ${connectionStatus.ip}`);
            } else {
                console.log('   ⚠️  Not connected to any WiFi network');
            }
        } catch (error) {
            console.log(`   ❌ Connection check failed: ${error.message}`);
            results.connection.status = 'error';
            results.connection.error = error.message;
        }

        // Test internet connectivity
        if (results.connection.connected) {
            try {
                console.log('   Testing internet connectivity...');
                const connectivityTest = await this.testInternetConnectivity();
                results.connectivity = connectivityTest;

                if (connectivityTest.hasInternet) {
                    console.log(`   ✅ Internet: Connected (${connectivityTest.latency}ms to 8.8.8.8)`);
                } else {
                    console.log('   ❌ Internet: No connectivity');
                }
            } catch (error) {
                results.connectivity.status = 'error';
                results.connectivity.error = error.message;
            }
        }

        // Test specific network connection if requested
        if (options.ssid && options.testConnection) {
            try {
                console.log(`   Testing connection to "${options.ssid}"...`);
                const connectionTest = await this.testWiFiConnection(options.ssid, options.password);
                results.connectionTest = connectionTest;
            } catch (error) {
                results.connectionTest = { status: 'failed', error: error.message };
            }
        }

        this.generateWiFiRecommendations(results, options);
        this.printWiFiDiagnosticReport(results, options);

        return results;
    }

    async diagnoseAccessPoint(options = {}) {
        const results = {
            services: { status: 'pending' },
            interface: { status: 'pending' },
            configuration: { status: 'pending' },
            clients: { status: 'pending' },
            recommendations: []
        };

        console.log('📡 Analyzing Access Point Configuration...');

        // Check service status
        try {
            console.log('   Checking access point services...');
            const services = await this.checkAccessPointServices();
            results.services = services;

            console.log(`   hostapd: ${services.hostapd.active ? '✅ ACTIVE' : '❌ INACTIVE'}`);
            console.log(`   dnsmasq: ${services.dnsmasq.active ? '✅ ACTIVE' : '❌ INACTIVE'}`);
            console.log(`   NetworkManager: ${services.networkmanager.active ? '✅ ACTIVE' : '❌ INACTIVE'}`);
        } catch (error) {
            console.log(`   ❌ Service check failed: ${error.message}`);
            results.services.status = 'error';
            results.services.error = error.message;
        }

        // Check AP interface
        try {
            console.log('   Checking access point interface (ap0)...');
            const interfaceStatus = await this.getInterfaceStatus('ap0');
            results.interface = interfaceStatus;

            if (interfaceStatus.exists) {
                console.log(`   ✅ ap0: ${interfaceStatus.state} (${interfaceStatus.ip || 'no IP'})`);
            } else {
                console.log('   ❌ ap0 interface not found');
            }
        } catch (error) {
            console.log(`   ❌ Interface check failed: ${error.message}`);
            results.interface.status = 'error';
            results.interface.error = error.message;
        }

        // Check configuration files
        try {
            console.log('   Validating configuration files...');
            const configValidation = await this.validateAccessPointConfig();
            results.configuration = configValidation;

            console.log(`   hostapd.conf: ${configValidation.hostapd.valid ? '✅ VALID' : '❌ INVALID'}`);
            console.log(`   dnsmasq.conf: ${configValidation.dnsmasq.valid ? '✅ VALID' : '❌ INVALID'}`);

            if (configValidation.hostapd.ssid) {
                console.log(`   AP SSID: ${configValidation.hostapd.ssid}`);
                console.log(`   Channel: ${configValidation.hostapd.channel || 'auto'}`);
            }
        } catch (error) {
            console.log(`   ❌ Configuration validation failed: ${error.message}`);
            results.configuration.status = 'error';
            results.configuration.error = error.message;
        }

        // Check connected clients
        try {
            console.log('   Checking connected clients...');
            const clientInfo = await this.getAccessPointClients();
            results.clients = clientInfo;

            console.log(`   Connected clients: ${clientInfo.count}`);
            if (clientInfo.clients.length > 0) {
                clientInfo.clients.forEach(client => {
                    console.log(`   - ${client.mac} (${client.ip || 'no IP'})`);
                });
            }
        } catch (error) {
            console.log(`   ⚠️  Client check failed: ${error.message}`);
            results.clients.status = 'error';
            results.clients.error = error.message;
        }

        this.generateAccessPointRecommendations(results);
        this.printAccessPointDiagnosticReport(results);

        return results;
    }

    async diagnoseInterfaces(options = {}) {
        const results = {
            interfaces: {},
            routing: { status: 'pending' },
            conflicts: { status: 'pending' },
            recommendations: []
        };

        console.log('🔌 Analyzing Network Interfaces...');

        // Check all network interfaces
        try {
            console.log('   Checking interface states...');
            const interfaces = ['wlan0', 'ap0', 'eth0', 'lo'];

            for (const iface of interfaces) {
                try {
                    const status = await this.getInterfaceStatus(iface);
                    results.interfaces[iface] = status;

                    if (status.exists) {
                        console.log(`   ${iface}: ${status.state} (${status.ip || 'no IP'})`);
                        if (status.type === 'wifi' && status.connected) {
                            console.log(`     └─ Connected to: ${status.network || 'unknown'}`);
                        }
                    } else {
                        console.log(`   ${iface}: not present`);
                    }
                } catch (error) {
                    results.interfaces[iface] = { status: 'error', error: error.message };
                    console.log(`   ${iface}: error - ${error.message}`);
                }
            }
        } catch (error) {
            console.log(`   ❌ Interface analysis failed: ${error.message}`);
        }

        // Analyze routing table
        try {
            console.log('   Analyzing routing configuration...');
            const routingAnalysis = await this.analyzeRouting();
            results.routing = routingAnalysis;

            console.log(`   Default route: ${routingAnalysis.defaultRoute || 'none'}`);
            console.log(`   Route count: ${routingAnalysis.routes.length}`);

            if (routingAnalysis.conflicts.length > 0) {
                console.log(`   ⚠️  ${routingAnalysis.conflicts.length} routing conflicts detected`);
            } else {
                console.log('   ✅ No routing conflicts detected');
            }
        } catch (error) {
            console.log(`   ❌ Routing analysis failed: ${error.message}`);
            results.routing.status = 'error';
            results.routing.error = error.message;
        }

        // Check for interface conflicts
        try {
            console.log('   Checking for interface conflicts...');
            const conflicts = await this.detectInterfaceConflicts(results.interfaces);
            results.conflicts = conflicts;

            if (conflicts.found.length > 0) {
                console.log(`   ⚠️  ${conflicts.found.length} conflicts detected`);
                conflicts.found.forEach(conflict => {
                    console.log(`     - ${conflict.description}`);
                });
            } else {
                console.log('   ✅ No interface conflicts detected');
            }
        } catch (error) {
            results.conflicts.status = 'error';
            results.conflicts.error = error.message;
        }

        this.generateInterfaceRecommendations(results);
        this.printInterfaceDiagnosticReport(results);

        return results;
    }

    async diagnoseNetworkManager(options = {}) {
        const results = {
            service: { status: 'pending' },
            connections: { status: 'pending' },
            devices: { status: 'pending' },
            logs: { status: 'pending' },
            recommendations: []
        };

        console.log('⚙️ Analyzing NetworkManager...');

        // Check NetworkManager service
        try {
            console.log('   Checking NetworkManager service status...');
            const serviceStatus = await this.getServiceStatus('NetworkManager');
            results.service = serviceStatus;

            console.log(`   Service: ${serviceStatus.active ? '✅ ACTIVE' : '❌ INACTIVE'}`);
            console.log(`   Uptime: ${serviceStatus.uptime || 'unknown'}`);

            if (!serviceStatus.active) {
                console.log('   ❌ NetworkManager is not running - this will cause major issues');
            }
        } catch (error) {
            console.log(`   ❌ Service check failed: ${error.message}`);
            results.service.status = 'error';
            results.service.error = error.message;
        }

        // Check connections
        try {
            console.log('   Checking NetworkManager connections...');
            const connections = await this.getNetworkManagerConnections();
            results.connections = connections;

            console.log(`   Total connections: ${connections.all.length}`);
            console.log(`   Active connections: ${connections.active.length}`);

            if (connections.active.length > 0) {
                connections.active.forEach(conn => {
                    console.log(`   - ${conn.name} (${conn.device}) - ${conn.type}`);
                });
            }
        } catch (error) {
            console.log(`   ❌ Connection check failed: ${error.message}`);
            results.connections.status = 'error';
            results.connections.error = error.message;
        }

        // Check devices
        try {
            console.log('   Checking NetworkManager devices...');
            const devices = await this.getNetworkManagerDevices();
            results.devices = devices;

            console.log(`   Managed devices: ${devices.managed.length}`);
            console.log(`   Unmanaged devices: ${devices.unmanaged.length}`);

            devices.managed.forEach(device => {
                console.log(`   - ${device.device}: ${device.type} (${device.state})`);
            });
        } catch (error) {
            console.log(`   ❌ Device check failed: ${error.message}`);
            results.devices.status = 'error';
            results.devices.error = error.message;
        }

        // Analyze recent logs
        try {
            console.log('   Analyzing recent NetworkManager logs...');
            const logAnalysis = await this.analyzeNetworkManagerLogs();
            results.logs = logAnalysis;

            console.log(`   Recent entries: ${logAnalysis.entries.length}`);
            console.log(`   Errors: ${logAnalysis.errors.length}`);
            console.log(`   Warnings: ${logAnalysis.warnings.length}`);

            if (logAnalysis.errors.length > 0) {
                console.log('   Recent errors:');
                logAnalysis.errors.slice(0, 3).forEach(error => {
                    console.log(`     - ${error.message}`);
                });
            }
        } catch (error) {
            console.log(`   ⚠️  Log analysis failed: ${error.message}`);
            results.logs.status = 'error';
            results.logs.error = error.message;
        }

        this.generateNetworkManagerRecommendations(results);
        this.printNetworkManagerDiagnosticReport(results);

        return results;
    }

    async runComprehensiveDiagnostic(options = {}) {
        console.log('🔬 Running Comprehensive Network Diagnostic...');

        const results = {
            networkManager: null,
            interfaces: null,
            wifi: null,
            accessPoint: null,
            performance: {
                startTime: new Date().toISOString(),
                endTime: null,
                duration: null
            }
        };

        console.log('\n--- NETWORKMANAGER ANALYSIS ---');
        results.networkManager = await this.diagnoseNetworkManager();

        console.log('\n--- INTERFACE ANALYSIS ---');
        results.interfaces = await this.diagnoseInterfaces();

        console.log('\n--- WIFI ANALYSIS ---');
        results.wifi = await this.diagnoseWiFi();

        console.log('\n--- ACCESS POINT ANALYSIS ---');
        results.accessPoint = await this.diagnoseAccessPoint();

        results.performance.endTime = new Date().toISOString();
        results.performance.duration = Date.now() - new Date(results.performance.startTime).getTime();

        this.printComprehensiveReport(results);
        return results;
    }

    // Utility methods for network operations
    async getInterfaceStatus(interfaceName) {
        try {
            // Check if interface exists
            const { stdout: ipOutput } = await execAsync(`ip addr show ${interfaceName} 2>/dev/null || echo "not_found"`);

            if (ipOutput.includes('not_found') || !ipOutput.trim()) {
                return { exists: false, interface: interfaceName };
            }

            // Parse IP address
            const ipMatch = ipOutput.match(/inet (\d+\.\d+\.\d+\.\d+\/\d+)/);
            const ip = ipMatch ? ipMatch[1] : null;

            // Check if interface is up
            const isUp = ipOutput.includes('state UP') || ipOutput.includes('<UP,');

            // Determine interface type and additional info
            let type = 'unknown';
            let connected = false;
            let network = null;
            let signal = null;

            if (interfaceName.startsWith('wlan') || interfaceName.startsWith('ap')) {
                type = 'wifi';

                // Get WiFi-specific info if this is a WiFi interface
                if (interfaceName === 'wlan0') {
                    try {
                        const { stdout: iwOutput } = await execAsync(`iwconfig ${interfaceName} 2>/dev/null || echo ""`);
                        if (iwOutput.includes('ESSID:')) {
                            const essidMatch = iwOutput.match(/ESSID:"([^"]+)"/);
                            network = essidMatch ? essidMatch[1] : null;
                            connected = network && network !== 'off/any';

                            const signalMatch = iwOutput.match(/Signal level=(-?\d+) dBm/);
                            if (signalMatch) {
                                const dbm = parseInt(signalMatch[1]);
                                signal = Math.max(0, Math.min(100, (dbm + 100) * 2));
                            }
                        }
                    } catch (error) {
                        // iwconfig not available or failed
                    }
                }
            } else if (interfaceName.startsWith('eth')) {
                type = 'ethernet';
                connected = isUp && ip !== null;
            }

            return {
                exists: true,
                interface: interfaceName,
                state: isUp ? 'UP' : 'DOWN',
                ip: ip,
                type: type,
                connected: connected,
                network: network,
                signal: signal
            };

        } catch (error) {
            throw new Error(`Failed to get interface status: ${error.message}`);
        }
    }

    async performWiFiScan() {
        try {
            const { stdout } = await execAsync('nmcli -t -f SSID,SIGNAL,SECURITY,CHAN dev wifi list 2>/dev/null || echo ""');

            const networks = [];
            const lines = stdout.trim().split('\n');

            for (const line of lines) {
                if (!line || line === '') continue;

                const parts = line.split(':');
                if (parts.length >= 4) {
                    networks.push({
                        ssid: parts[0] || 'Hidden',
                        signal: parseInt(parts[1]) || 0,
                        security: parts[2] || 'Open',
                        channel: parseInt(parts[3]) || 0
                    });
                }
            }

            return {
                status: 'success',
                networks: networks.filter(n => n.ssid !== '--'),
                count: networks.length
            };

        } catch (error) {
            throw new Error(`WiFi scan failed: ${error.message}`);
        }
    }

    async getCurrentWiFiConnection() {
        try {
            // Get active connection info
            const { stdout: connOutput } = await execAsync(`nmcli -t -f NAME,TYPE,DEVICE con show --active | grep wifi || echo ""`);

            if (!connOutput.trim()) {
                return { connected: false };
            }

            const connParts = connOutput.trim().split(':');
            const connectionName = connParts[0];

            // Get interface details
            const wlan0Status = await this.getInterfaceStatus('wlan0');

            // Get signal strength and additional info
            let signalDbm = null;
            try {
                const { stdout: iwOutput } = await execAsync('iwconfig wlan0 2>/dev/null || echo ""');
                const signalMatch = iwOutput.match(/Signal level=(-?\d+) dBm/);
                if (signalMatch) {
                    signalDbm = parseInt(signalMatch[1]);
                }
            } catch (error) {
                // iwconfig not available
            }

            return {
                connected: true,
                ssid: wlan0Status.network || connectionName,
                ip: wlan0Status.ip,
                signal: wlan0Status.signal,
                signalDbm: signalDbm,
                interface: 'wlan0'
            };

        } catch (error) {
            throw new Error(`Failed to get WiFi connection status: ${error.message}`);
        }
    }

    async testInternetConnectivity() {
        try {
            const start = Date.now();
            await execAsync('ping -c 1 -W 5 8.8.8.8');
            const latency = Date.now() - start;

            return {
                hasInternet: true,
                latency: latency,
                testHost: '8.8.8.8'
            };

        } catch (error) {
            return {
                hasInternet: false,
                error: error.message
            };
        }
    }

    async testWiFiConnection(ssid, password) {
        try {
            console.log(`     Attempting connection to "${ssid}"...`);

            // Create a temporary connection
            const connectCmd = password ?
                `nmcli dev wifi connect "${ssid}" password "${password}"` :
                `nmcli dev wifi connect "${ssid}"`;

            const { stdout, stderr } = await execAsync(connectCmd);

            // Wait a moment for connection to establish
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Verify connection
            const connectionStatus = await this.getCurrentWiFiConnection();

            if (connectionStatus.connected && connectionStatus.ssid === ssid) {
                console.log(`     ✅ Successfully connected to "${ssid}"`);
                return {
                    status: 'success',
                    ssid: ssid,
                    ip: connectionStatus.ip,
                    signal: connectionStatus.signal
                };
            } else {
                throw new Error('Connection established but verification failed');
            }

        } catch (error) {
            console.log(`     ❌ Connection to "${ssid}" failed: ${error.message}`);
            return {
                status: 'failed',
                ssid: ssid,
                error: error.message
            };
        }
    }

    async checkAccessPointServices() {
        const services = ['hostapd', 'dnsmasq', 'NetworkManager'];
        const results = {};

        for (const service of services) {
            try {
                const status = await this.getServiceStatus(service);
                results[service.toLowerCase().replace('-', '')] = status;
            } catch (error) {
                results[service.toLowerCase().replace('-', '')] = {
                    active: false,
                    error: error.message
                };
            }
        }

        return results;
    }

    async getServiceStatus(serviceName) {
        try {
            const { stdout } = await execAsync(`systemctl show ${serviceName} --property=ActiveState,SubState,ExecMainStartTimestamp --no-pager`);

            const lines = stdout.trim().split('\n');
            const properties = {};

            lines.forEach(line => {
                const [key, value] = line.split('=');
                properties[key] = value;
            });

            const isActive = properties.ActiveState === 'active';
            const startTime = properties.ExecMainStartTimestamp;

            let uptime = null;
            if (isActive && startTime && startTime !== '') {
                const startDate = new Date(startTime);
                uptime = Math.floor((Date.now() - startDate.getTime()) / 1000);
            }

            return {
                active: isActive,
                state: properties.ActiveState,
                subState: properties.SubState,
                uptime: uptime
            };

        } catch (error) {
            throw new Error(`Failed to get service status: ${error.message}`);
        }
    }

    async validateAccessPointConfig() {
        const results = {
            hostapd: { valid: false },
            dnsmasq: { valid: false }
        };

        // Check hostapd configuration
        try {
            const hostapdConfigPath = '/etc/hostapd/hostapd.conf';
            const hostapdConfig = await fs.readFile(hostapdConfigPath, 'utf8');

            results.hostapd.valid = true;
            results.hostapd.configPath = hostapdConfigPath;

            // Parse key settings
            const ssidMatch = hostapdConfig.match(/^ssid=(.+)$/m);
            const channelMatch = hostapdConfig.match(/^channel=(\d+)$/m);
            const interfaceMatch = hostapdConfig.match(/^interface=(.+)$/m);

            results.hostapd.ssid = ssidMatch ? ssidMatch[1] : null;
            results.hostapd.channel = channelMatch ? parseInt(channelMatch[1]) : null;
            results.hostapd.interface = interfaceMatch ? interfaceMatch[1] : null;

        } catch (error) {
            results.hostapd.error = error.message;
        }

        // Check dnsmasq configuration
        try {
            const dnsmasqConfigPath = '/etc/dnsmasq.conf';
            const dnsmasqConfig = await fs.readFile(dnsmasqConfigPath, 'utf8');

            results.dnsmasq.valid = true;
            results.dnsmasq.configPath = dnsmasqConfigPath;

            // Parse key settings
            const interfaceMatch = dnsmasqConfig.match(/^interface=(.+)$/m);
            const dhcpRangeMatch = dnsmasqConfig.match(/^dhcp-range=(.+)$/m);

            results.dnsmasq.interface = interfaceMatch ? interfaceMatch[1] : null;
            results.dnsmasq.dhcpRange = dhcpRangeMatch ? dhcpRangeMatch[1] : null;

        } catch (error) {
            results.dnsmasq.error = error.message;
        }

        return results;
    }

    async getAccessPointClients() {
        try {
            // Try to get DHCP leases
            let clients = [];

            try {
                const { stdout: dhcpOutput } = await execAsync('cat /var/lib/dhcp/dhcpd.leases 2>/dev/null || cat /var/lib/dhcpcd5/dhcpcd.leases 2>/dev/null || echo ""');

                // Parse DHCP leases (basic parsing)
                const leases = dhcpOutput.match(/lease ([0-9.]+) {[^}]*binding state active[^}]*client-hardware-ethernet ([0-9a-f:]+)/g);

                if (leases) {
                    clients = leases.map(lease => {
                        const ipMatch = lease.match(/lease ([0-9.]+)/);
                        const macMatch = lease.match(/client-hardware-ethernet ([0-9a-f:]+)/);

                        return {
                            ip: ipMatch ? ipMatch[1] : null,
                            mac: macMatch ? macMatch[1] : null
                        };
                    });
                }
            } catch (error) {
                // DHCP lease check failed
            }

            // Try to get connected WiFi clients via hostapd if available
            try {
                const { stdout: hostapdOutput } = await execAsync('hostapd_cli all_sta 2>/dev/null || echo ""');

                if (hostapdOutput.trim()) {
                    const macAddresses = hostapdOutput.match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/g);

                    if (macAddresses) {
                        macAddresses.forEach(mac => {
                            if (!clients.find(c => c.mac === mac)) {
                                clients.push({ mac: mac, ip: null });
                            }
                        });
                    }
                }
            } catch (error) {
                // hostapd_cli not available
            }

            return {
                count: clients.length,
                clients: clients
            };

        } catch (error) {
            throw new Error(`Failed to get AP clients: ${error.message}`);
        }
    }

    async analyzeRouting() {
        try {
            const { stdout } = await execAsync('ip route show');

            const routes = stdout.trim().split('\n').filter(line => line.trim());
            const defaultRouteMatch = stdout.match(/^default via ([0-9.]+) dev (\w+)/m);

            const conflicts = [];
            const networkRanges = {};

            // Analyze routes for conflicts
            routes.forEach(route => {
                const networkMatch = route.match(/^([0-9.]+\/\d+)/);
                if (networkMatch) {
                    const network = networkMatch[1];
                    if (networkRanges[network]) {
                        conflicts.push({
                            type: 'duplicate_network',
                            description: `Network ${network} has multiple routes`,
                            routes: [networkRanges[network], route]
                        });
                    } else {
                        networkRanges[network] = route;
                    }
                }
            });

            return {
                routes: routes,
                defaultRoute: defaultRouteMatch ? `${defaultRouteMatch[1]} via ${defaultRouteMatch[2]}` : null,
                conflicts: conflicts,
                status: 'success'
            };

        } catch (error) {
            throw new Error(`Routing analysis failed: ${error.message}`);
        }
    }

    async detectInterfaceConflicts(interfaces) {
        const conflicts = [];

        // Check for IP conflicts
        const ipAddresses = {};
        Object.entries(interfaces).forEach(([name, info]) => {
            if (info.ip && info.exists) {
                const baseIp = info.ip.split('/')[0];
                if (ipAddresses[baseIp]) {
                    conflicts.push({
                        type: 'ip_conflict',
                        description: `IP address ${baseIp} used by multiple interfaces: ${ipAddresses[baseIp]} and ${name}`
                    });
                } else {
                    ipAddresses[baseIp] = name;
                }
            }
        });

        // Check for WiFi interface conflicts
        const wifiInterfaces = Object.entries(interfaces).filter(([name, info]) =>
            info.type === 'wifi' && info.exists
        );

        if (wifiInterfaces.length > 2) {
            conflicts.push({
                type: 'too_many_wifi',
                description: `${wifiInterfaces.length} WiFi interfaces detected - may cause conflicts`
            });
        }

        return {
            found: conflicts,
            status: conflicts.length > 0 ? 'conflicts_detected' : 'no_conflicts'
        };
    }

    async getNetworkManagerConnections() {
        try {
            // Get all connections
            const { stdout: allOutput } = await execAsync('nmcli -t -f NAME,TYPE,DEVICE con show');
            const allConnections = allOutput.trim().split('\n').map(line => {
                const parts = line.split(':');
                return {
                    name: parts[0] || '',
                    type: parts[1] || '',
                    device: parts[2] || 'none'
                };
            }).filter(conn => conn.name !== '');

            // Get active connections
            const { stdout: activeOutput } = await execAsync('nmcli -t -f NAME,TYPE,DEVICE con show --active');
            const activeConnections = activeOutput.trim().split('\n').map(line => {
                const parts = line.split(':');
                return {
                    name: parts[0] || '',
                    type: parts[1] || '',
                    device: parts[2] || 'none'
                };
            }).filter(conn => conn.name !== '');

            return {
                all: allConnections,
                active: activeConnections,
                status: 'success'
            };

        } catch (error) {
            throw new Error(`Failed to get NetworkManager connections: ${error.message}`);
        }
    }

    async getNetworkManagerDevices() {
        try {
            const { stdout } = await execAsync('nmcli -t -f DEVICE,TYPE,STATE dev');

            const devices = stdout.trim().split('\n').map(line => {
                const parts = line.split(':');
                return {
                    device: parts[0] || '',
                    type: parts[1] || '',
                    state: parts[2] || ''
                };
            }).filter(dev => dev.device !== '');

            const managed = devices.filter(dev => dev.state !== 'unmanaged');
            const unmanaged = devices.filter(dev => dev.state === 'unmanaged');

            return {
                all: devices,
                managed: managed,
                unmanaged: unmanaged,
                status: 'success'
            };

        } catch (error) {
            throw new Error(`Failed to get NetworkManager devices: ${error.message}`);
        }
    }

    async analyzeNetworkManagerLogs() {
        try {
            const { stdout } = await execAsync('journalctl -u NetworkManager --since "1 hour ago" --no-pager -o short');

            const entries = stdout.trim().split('\n').filter(line => line.trim());
            const errors = entries.filter(line => line.includes('ERROR') || line.includes('error'));
            const warnings = entries.filter(line => line.includes('WARN') || line.includes('warning'));

            return {
                entries: entries,
                errors: errors.map(line => ({ message: line.substring(line.indexOf(']') + 1).trim() })),
                warnings: warnings.map(line => ({ message: line.substring(line.indexOf(']') + 1).trim() })),
                status: 'success'
            };

        } catch (error) {
            throw new Error(`Failed to analyze NetworkManager logs: ${error.message}`);
        }
    }

    // Recommendation generators
    generateWiFiRecommendations(results, options) {
        results.recommendations = [];

        if (!results.interface?.exists) {
            results.recommendations.push('❌ WiFi interface (wlan0) not found - check hardware');
            return;
        }

        if (results.scan.status === 'success' && results.scan.networks.length === 0) {
            results.recommendations.push('⚠️ No WiFi networks found - check antenna connection');
        }

        if (results.connection.connected) {
            if (results.connection.signal < 50) {
                results.recommendations.push('⚠️ Weak WiFi signal - consider moving closer to router');
            }
            if (!results.connectivity?.hasInternet) {
                results.recommendations.push('🔧 Connected to WiFi but no internet - check router settings');
            }
        } else {
            results.recommendations.push('🔧 Not connected to any WiFi network');
        }

        if (options.ssid && !results.targetNetwork) {
            results.recommendations.push(`❌ Target network "${options.ssid}" not found in scan`);
        }
    }

    generateAccessPointRecommendations(results) {
        results.recommendations = [];

        if (!results.services.hostapd?.active) {
            results.recommendations.push('❌ hostapd service not running - access point will not work');
        }

        if (!results.services.dnsmasq?.active) {
            results.recommendations.push('❌ dnsmasq service not running - DHCP will not work');
        }

        if (!results.interface?.exists) {
            results.recommendations.push('❌ ap0 interface not found - check hostapd configuration');
        }

        if (results.configuration.hostapd?.valid && results.configuration.dnsmasq?.valid) {
            results.recommendations.push('✅ Access point configuration appears valid');
        }

        if (results.clients.count === 0) {
            results.recommendations.push('ℹ️ No clients connected - test with a device');
        }
    }

    generateInterfaceRecommendations(results) {
        results.recommendations = [];

        const activeInterfaces = Object.values(results.interfaces).filter(i => i.exists && i.state === 'UP');

        if (activeInterfaces.length === 0) {
            results.recommendations.push('❌ No network interfaces are active');
        }

        if (results.conflicts.status === 'conflicts_detected') {
            results.recommendations.push(`⚠️ ${results.conflicts.found.length} network conflicts detected`);
        }

        if (results.routing.conflicts?.length > 0) {
            results.recommendations.push('⚠️ Routing conflicts detected - may cause connectivity issues');
        }
    }

    generateNetworkManagerRecommendations(results) {
        results.recommendations = [];

        if (!results.service?.active) {
            results.recommendations.push('❌ NetworkManager service not running - restart immediately');
        }

        if (results.logs.errors?.length > 0) {
            results.recommendations.push(`⚠️ ${results.logs.errors.length} recent errors in NetworkManager logs`);
        }

        if (results.devices.unmanaged?.length > 0) {
            results.recommendations.push(`ℹ️ ${results.devices.unmanaged.length} unmanaged devices detected`);
        }
    }

    // Report printing methods
    printWiFiDiagnosticReport(results, options) {
        console.log(`\n📋 WiFi Diagnostic Report`);
        console.log('=' .repeat(40));

        if (results.connection.connected) {
            console.log(`Status: ✅ CONNECTED to ${results.connection.ssid}`);
            console.log(`Signal: ${results.connection.signal}% (${results.connection.signalDbm} dBm)`);
            console.log(`IP Address: ${results.connection.ip}`);
        } else {
            console.log('Status: ❌ NOT CONNECTED');
        }

        console.log(`\nScan Results: ${results.scan.networks?.length || 0} networks found`);

        if (results.connectivity?.hasInternet) {
            console.log(`Internet: ✅ Connected (${results.connectivity.latency}ms)`);
        } else {
            console.log('Internet: ❌ No connectivity');
        }

        if (results.recommendations.length > 0) {
            console.log('\nRecommendations:');
            results.recommendations.forEach(rec => console.log(`  ${rec}`));
        }
    }

    printAccessPointDiagnosticReport(results) {
        console.log(`\n📋 Access Point Diagnostic Report`);
        console.log('=' .repeat(40));

        const hostapdStatus = results.services.hostapd?.active ? '✅' : '❌';
        const dnsmasqStatus = results.services.dnsmasq?.active ? '✅' : '❌';

        console.log(`Services:`);
        console.log(`  hostapd: ${hostapdStatus} ${results.services.hostapd?.active ? 'RUNNING' : 'STOPPED'}`);
        console.log(`  dnsmasq: ${dnsmasqStatus} ${results.services.dnsmasq?.active ? 'RUNNING' : 'STOPPED'}`);

        if (results.configuration.hostapd?.ssid) {
            console.log(`\nConfiguration:`);
            console.log(`  SSID: ${results.configuration.hostapd.ssid}`);
            console.log(`  Channel: ${results.configuration.hostapd.channel || 'auto'}`);
        }

        console.log(`\nClients: ${results.clients.count} connected`);

        if (results.recommendations.length > 0) {
            console.log('\nRecommendations:');
            results.recommendations.forEach(rec => console.log(`  ${rec}`));
        }
    }

    printInterfaceDiagnosticReport(results) {
        console.log(`\n📋 Interface Diagnostic Report`);
        console.log('=' .repeat(40));

        console.log('Interface Status:');
        Object.entries(results.interfaces).forEach(([name, info]) => {
            if (info.exists) {
                const status = info.state === 'UP' ? '✅' : '⚠️';
                console.log(`  ${name}: ${status} ${info.state} (${info.ip || 'no IP'})`);
            }
        });

        if (results.routing.defaultRoute) {
            console.log(`\nDefault Route: ${results.routing.defaultRoute}`);
        }

        if (results.conflicts.found?.length > 0) {
            console.log('\nConflicts Detected:');
            results.conflicts.found.forEach(conflict => {
                console.log(`  ⚠️ ${conflict.description}`);
            });
        }
    }

    printNetworkManagerDiagnosticReport(results) {
        console.log(`\n📋 NetworkManager Diagnostic Report`);
        console.log('=' .repeat(40));

        const serviceStatus = results.service?.active ? '✅ ACTIVE' : '❌ INACTIVE';
        console.log(`Service: ${serviceStatus}`);

        if (results.connections.active?.length > 0) {
            console.log('\nActive Connections:');
            results.connections.active.forEach(conn => {
                console.log(`  - ${conn.name} (${conn.device})`);
            });
        }

        if (results.logs.errors?.length > 0) {
            console.log(`\nRecent Errors: ${results.logs.errors.length}`);
        }

        if (results.recommendations.length > 0) {
            console.log('\nRecommendations:');
            results.recommendations.forEach(rec => console.log(`  ${rec}`));
        }
    }

    printComprehensiveReport(results) {
        console.log(`\n📊 COMPREHENSIVE NETWORK DIAGNOSTIC REPORT`);
        console.log('=' .repeat(50));

        const duration = Math.round(results.performance.duration / 1000);
        console.log(`\nTest Duration: ${duration} seconds`);
        console.log(`Completed: ${results.performance.endTime}`);

        // Summary of all diagnostic results
        const summaries = [];

        if (results.networkManager.service?.active) {
            summaries.push('✅ NetworkManager: Running');
        } else {
            summaries.push('❌ NetworkManager: Issues detected');
        }

        if (results.wifi.connection?.connected) {
            summaries.push('✅ WiFi: Connected');
        } else {
            summaries.push('⚠️ WiFi: Not connected');
        }

        if (results.accessPoint.services?.hostapd?.active) {
            summaries.push('✅ Access Point: Active');
        } else {
            summaries.push('❌ Access Point: Issues detected');
        }

        console.log('\nSystem Status:');
        summaries.forEach(summary => console.log(`  ${summary}`));

        // Collect all recommendations
        const allRecommendations = [
            ...results.networkManager.recommendations,
            ...results.wifi.recommendations,
            ...results.accessPoint.recommendations,
            ...results.interfaces.recommendations
        ];

        if (allRecommendations.length > 0) {
            console.log('\nAll Recommendations:');
            allRecommendations.forEach(rec => console.log(`  ${rec}`));
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Network Debugging Agent - Network Diagnostic Tool

Usage: node network-debugging-agent.js <command> [options]

Commands:
  wifi [--ssid NETWORK] [--test-connection] [--password PASS]
  access-point                  - Diagnose access point configuration
  interfaces                    - Analyze network interfaces
  networkmanager               - Check NetworkManager status
  comprehensive                - Run all diagnostics

Examples:
  node network-debugging-agent.js wifi
  node network-debugging-agent.js wifi --ssid "MyNetwork" --test-connection
  node network-debugging-agent.js access-point
  node network-debugging-agent.js interfaces
  node network-debugging-agent.js comprehensive
        `);
        process.exit(1);
    }

    const agent = new NetworkDebuggingAgent();

    try {
        let result;
        const options = {};

        // Parse command line options
        for (let i = 1; i < args.length; i += 2) {
            const option = args[i];
            const value = args[i + 1];

            if (option === '--ssid') {
                options.ssid = value;
            } else if (option === '--password') {
                options.password = value;
            } else if (option === '--test-connection') {
                options.testConnection = true;
                i--; // No value for this flag
            }
        }

        switch (command.toLowerCase()) {
            case 'wifi':
                result = await agent.runDiagnostic('wifi', options);
                break;

            case 'access-point':
            case 'ap':
                result = await agent.runDiagnostic('access-point', options);
                break;

            case 'interfaces':
                result = await agent.runDiagnostic('interfaces', options);
                break;

            case 'networkmanager':
            case 'nm':
                result = await agent.runDiagnostic('networkmanager', options);
                break;

            case 'comprehensive':
                result = await agent.runDiagnostic('comprehensive', options);
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }

        // Output JSON result for programmatic use
        if (process.env.OUTPUT_JSON) {
            console.log('\n' + JSON.stringify(result, null, 2));
        }

    } catch (error) {
        console.error(`\n❌ Agent Error: ${error.message}`);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export default NetworkDebuggingAgent;
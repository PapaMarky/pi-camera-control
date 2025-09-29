#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

class DeploymentHelperAgent {
    constructor() {
        this.results = {};
        this.isLinux = process.platform === 'linux';
        this.targetHost = null;
        this.sourceDir = process.cwd();
    }

    async runDeployment(deploymentType, options = {}) {
        console.log(`\n🚀 Running Deployment: ${deploymentType.toUpperCase()}`);
        console.log('=' .repeat(50));

        try {
            this.targetHost = options.target;
            if (options.sourceDir) {
                this.sourceDir = options.sourceDir;
            }

            switch (deploymentType.toLowerCase()) {
                case 'setup':
                    return await this.setupSystem(options);
                case 'network':
                    return await this.configureNetwork(options);
                case 'service':
                    return await this.deployService(options);
                case 'validate':
                    return await this.validateDeployment(options);
                case 'comprehensive':
                    return await this.runComprehensiveDeployment(options);
                default:
                    throw new Error(`Unknown deployment type: ${deploymentType}`);
            }
        } catch (error) {
            console.error(`❌ Deployment failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async setupSystem(options = {}) {
        const results = {
            hardware: { status: 'pending' },
            updates: { status: 'pending' },
            nodejs: { status: 'pending' },
            dependencies: { status: 'pending' },
            users: { status: 'pending' },
            directories: { status: 'pending' }
        };

        console.log('🔧 Setting up base system...');

        // Hardware validation
        try {
            console.log('   [1/6] Validating hardware compatibility...');
            const hardwareCheck = await this.validateHardware();
            results.hardware = hardwareCheck;

            if (hardwareCheck.compatible) {
                console.log(`   ✅ Hardware: ${hardwareCheck.model} (${hardwareCheck.memory}MB RAM)`);
            } else {
                console.log(`   ⚠️  Hardware: ${hardwareCheck.issues.join(', ')}`);
            }
        } catch (error) {
            console.log(`   ❌ Hardware check failed: ${error.message}`);
            results.hardware.status = 'failed';
            results.hardware.error = error.message;
        }

        // System updates
        try {
            console.log('   [2/6] Updating system packages...');
            const updateResults = await this.updateSystem();
            results.updates = updateResults;

            console.log(`   ✅ System updated: ${updateResults.packagesUpdated} packages`);
            if (updateResults.rebootRequired) {
                console.log('   ⚠️  Reboot required after package updates');
            }
        } catch (error) {
            console.log(`   ❌ System update failed: ${error.message}`);
            results.updates.status = 'failed';
            results.updates.error = error.message;
        }

        // Node.js installation
        try {
            console.log('   [3/6] Installing Node.js...');
            const nodejsResults = await this.installNodeJS();
            results.nodejs = nodejsResults;

            console.log(`   ✅ Node.js: ${nodejsResults.version} installed`);
            console.log(`   ✅ npm: ${nodejsResults.npmVersion} available`);
        } catch (error) {
            console.log(`   ❌ Node.js installation failed: ${error.message}`);
            results.nodejs.status = 'failed';
            results.nodejs.error = error.message;
        }

        // System dependencies
        try {
            console.log('   [4/6] Installing system dependencies...');
            const depsResults = await this.installSystemDependencies();
            results.dependencies = depsResults;

            console.log(`   ✅ Dependencies: ${depsResults.installed.length} packages installed`);
        } catch (error) {
            console.log(`   ❌ Dependencies installation failed: ${error.message}`);
            results.dependencies.status = 'failed';
            results.dependencies.error = error.message;
        }

        // User setup
        try {
            console.log('   [5/6] Setting up service user...');
            const userResults = await this.setupServiceUser();
            results.users = userResults;

            console.log(`   ✅ User: ${userResults.username} created with proper permissions`);
        } catch (error) {
            console.log(`   ❌ User setup failed: ${error.message}`);
            results.users.status = 'failed';
            results.users.error = error.message;
        }

        // Directory structure
        try {
            console.log('   [6/6] Creating directory structure...');
            const dirResults = await this.createDirectories();
            results.directories = dirResults;

            console.log(`   ✅ Directories: ${dirResults.created.length} directories created`);
        } catch (error) {
            console.log(`   ❌ Directory creation failed: ${error.message}`);
            results.directories.status = 'failed';
            results.directories.error = error.message;
        }

        this.printSetupReport(results);
        return results;
    }

    async configureNetwork(options = {}) {
        const results = {
            networkManager: { status: 'pending' },
            hostapd: { status: 'pending' },
            dnsmasq: { status: 'pending' },
            accessPoint: { status: 'pending' },
            validation: { status: 'pending' }
        };

        console.log('🌐 Configuring network services...');

        const apConfig = {
            ssid: options.apSsid || 'Pi-Camera-Control',
            password: options.apPassword || 'camera123',
            channel: options.apChannel || '7',
            interface: 'ap0'
        };

        // Configure NetworkManager
        try {
            console.log('   Configuring NetworkManager for dual WiFi...');
            const nmResults = await this.configureNetworkManager();
            results.networkManager = nmResults;

            console.log('   ✅ NetworkManager configured for dual WiFi operation');
        } catch (error) {
            console.log(`   ❌ NetworkManager configuration failed: ${error.message}`);
            results.networkManager.status = 'failed';
            results.networkManager.error = error.message;
        }

        // Install and configure hostapd
        try {
            console.log('   Installing and configuring hostapd...');
            const hostapdResults = await this.configureHostapd(apConfig);
            results.hostapd = hostapdResults;

            console.log(`   ✅ hostapd configured for SSID: ${apConfig.ssid}`);
        } catch (error) {
            console.log(`   ❌ hostapd configuration failed: ${error.message}`);
            results.hostapd.status = 'failed';
            results.hostapd.error = error.message;
        }

        // Install and configure dnsmasq
        try {
            console.log('   Installing and configuring dnsmasq...');
            const dnsmasqResults = await this.configureDnsmasq(apConfig);
            results.dnsmasq = dnsmasqResults;

            console.log('   ✅ dnsmasq configured for DHCP (192.168.4.2-20)');
        } catch (error) {
            console.log(`   ❌ dnsmasq configuration failed: ${error.message}`);
            results.dnsmasq.status = 'failed';
            results.dnsmasq.error = error.message;
        }

        // Start and test access point
        try {
            console.log('   Starting access point services...');
            const apResults = await this.startAccessPoint();
            results.accessPoint = apResults;

            console.log('   ✅ Access point started and broadcasting');
        } catch (error) {
            console.log(`   ❌ Access point startup failed: ${error.message}`);
            results.accessPoint.status = 'failed';
            results.accessPoint.error = error.message;
        }

        // Validate network configuration
        try {
            console.log('   Validating network configuration...');
            const validationResults = await this.validateNetworkConfig();
            results.validation = validationResults;

            console.log('   ✅ Network configuration validated');
        } catch (error) {
            console.log(`   ⚠️  Network validation: ${error.message}`);
            results.validation.status = 'warning';
            results.validation.error = error.message;
        }

        this.printNetworkConfigReport(results, apConfig);
        return results;
    }

    async deployService(options = {}) {
        const results = {
            codeDeployment: { status: 'pending' },
            dependencies: { status: 'pending' },
            serviceConfig: { status: 'pending' },
            serviceStart: { status: 'pending' },
            validation: { status: 'pending' }
        };

        console.log('📦 Deploying pi-camera-control service...');

        const deployConfig = {
            sourceDir: options.sourceDir || this.sourceDir,
            targetDir: '/opt/pi-camera-control',
            serviceUser: 'pi-camera',
            servicePort: options.port || '3000'
        };

        // Deploy source code
        try {
            console.log('   Deploying source code...');
            const codeResults = await this.deploySourceCode(deployConfig);
            results.codeDeployment = codeResults;

            console.log(`   ✅ Source deployed: ${codeResults.filesCopied} files`);
        } catch (error) {
            console.log(`   ❌ Code deployment failed: ${error.message}`);
            results.codeDeployment.status = 'failed';
            results.codeDeployment.error = error.message;
        }

        // Install dependencies
        try {
            console.log('   Installing Node.js dependencies...');
            const depsResults = await this.installServiceDependencies(deployConfig);
            results.dependencies = depsResults;

            console.log('   ✅ Dependencies installed successfully');
        } catch (error) {
            console.log(`   ❌ Dependency installation failed: ${error.message}`);
            results.dependencies.status = 'failed';
            results.dependencies.error = error.message;
        }

        // Configure systemd service
        try {
            console.log('   Configuring systemd service...');
            const serviceResults = await this.configureSystemdService(deployConfig);
            results.serviceConfig = serviceResults;

            console.log('   ✅ systemd service configured');
        } catch (error) {
            console.log(`   ❌ Service configuration failed: ${error.message}`);
            results.serviceConfig.status = 'failed';
            results.serviceConfig.error = error.message;
        }

        // Start and enable service
        try {
            console.log('   Starting pi-camera-control service...');
            const startResults = await this.startService();
            results.serviceStart = startResults;

            console.log('   ✅ Service started and enabled for auto-start');
        } catch (error) {
            console.log(`   ❌ Service startup failed: ${error.message}`);
            results.serviceStart.status = 'failed';
            results.serviceStart.error = error.message;
        }

        // Validate service operation
        try {
            console.log('   Validating service operation...');
            const validationResults = await this.validateService(deployConfig);
            results.validation = validationResults;

            console.log(`   ✅ Service validation: ${validationResults.healthCheck.status}`);
            console.log(`   📊 Memory usage: ${validationResults.performance.memoryMB}MB`);
        } catch (error) {
            console.log(`   ⚠️  Service validation: ${error.message}`);
            results.validation.status = 'warning';
            results.validation.error = error.message;
        }

        this.printServiceDeploymentReport(results, deployConfig);
        return results;
    }

    async validateDeployment(options = {}) {
        const results = {
            system: { status: 'pending' },
            network: { status: 'pending' },
            service: { status: 'pending' },
            api: { status: 'pending' },
            websocket: { status: 'pending' },
            camera: { status: 'pending' },
            performance: { status: 'pending' }
        };

        console.log('✅ Validating complete deployment...');

        // System validation
        try {
            console.log('   Checking system health...');
            const systemCheck = await this.validateSystemHealth();
            results.system = systemCheck;

            console.log(`   ✅ System: ${systemCheck.status} (Load: ${systemCheck.load})`);
        } catch (error) {
            console.log(`   ❌ System validation failed: ${error.message}`);
            results.system.status = 'failed';
            results.system.error = error.message;
        }

        // Network validation
        try {
            console.log('   Checking network configuration...');
            const networkCheck = await this.validateNetworkDeployment();
            results.network = networkCheck;

            console.log(`   ✅ Network: ${networkCheck.wlan0.status}/${networkCheck.ap0.status}`);
        } catch (error) {
            console.log(`   ❌ Network validation failed: ${error.message}`);
            results.network.status = 'failed';
            results.network.error = error.message;
        }

        // Service validation
        try {
            console.log('   Checking service status...');
            const serviceCheck = await this.validateServiceStatus();
            results.service = serviceCheck;

            console.log(`   ✅ Service: ${serviceCheck.status} (${serviceCheck.uptime}s uptime)`);
        } catch (error) {
            console.log(`   ❌ Service validation failed: ${error.message}`);
            results.service.status = 'failed';
            results.service.error = error.message;
        }

        // API validation
        try {
            console.log('   Testing API endpoints...');
            const apiCheck = await this.validateAPIEndpoints();
            results.api = apiCheck;

            console.log(`   ✅ API: ${apiCheck.working}/${apiCheck.total} endpoints working`);
        } catch (error) {
            console.log(`   ❌ API validation failed: ${error.message}`);
            results.api.status = 'failed';
            results.api.error = error.message;
        }

        // WebSocket validation
        try {
            console.log('   Testing WebSocket connectivity...');
            const wsCheck = await this.validateWebSocket();
            results.websocket = wsCheck;

            console.log(`   ✅ WebSocket: ${wsCheck.connected ? 'Connected' : 'Failed'}`);
        } catch (error) {
            console.log(`   ❌ WebSocket validation failed: ${error.message}`);
            results.websocket.status = 'failed';
            results.websocket.error = error.message;
        }

        // Camera discovery validation
        try {
            console.log('   Testing camera discovery...');
            const cameraCheck = await this.validateCameraDiscovery();
            results.camera = cameraCheck;

            console.log(`   ✅ Camera: Discovery ${cameraCheck.upnpWorking ? 'working' : 'limited'}`);
        } catch (error) {
            console.log(`   ⚠️  Camera validation: ${error.message}`);
            results.camera.status = 'warning';
            results.camera.error = error.message;
        }

        // Performance validation
        try {
            console.log('   Checking performance metrics...');
            const perfCheck = await this.validatePerformance();
            results.performance = perfCheck;

            console.log(`   ✅ Performance: ${perfCheck.score}/100 (${perfCheck.grade})`);
        } catch (error) {
            console.log(`   ⚠️  Performance check: ${error.message}`);
            results.performance.status = 'warning';
            results.performance.error = error.message;
        }

        this.printValidationReport(results);
        return results;
    }

    async runComprehensiveDeployment(options = {}) {
        console.log('🔬 Running Comprehensive Deployment...');

        const results = {
            setup: null,
            network: null,
            service: null,
            validation: null,
            performance: {
                startTime: new Date().toISOString(),
                endTime: null,
                duration: null
            }
        };

        console.log('\n--- SYSTEM SETUP ---');
        results.setup = await this.setupSystem(options);

        if (results.setup.hardware.compatible) {
            console.log('\n--- NETWORK CONFIGURATION ---');
            results.network = await this.configureNetwork(options);

            console.log('\n--- SERVICE DEPLOYMENT ---');
            results.service = await this.deployService(options);

            console.log('\n--- DEPLOYMENT VALIDATION ---');
            results.validation = await this.validateDeployment(options);
        }

        results.performance.endTime = new Date().toISOString();
        results.performance.duration = Date.now() - new Date(results.performance.startTime).getTime();

        this.printComprehensiveReport(results);
        return results;
    }

    // Implementation methods
    async validateHardware() {
        try {
            const cpuInfo = await fs.readFile('/proc/cpuinfo', 'utf8');
            const memInfo = await fs.readFile('/proc/meminfo', 'utf8');

            const isRaspberryPi = cpuInfo.includes('Raspberry Pi');
            const modelMatch = cpuInfo.match(/Model\s*:\s*([^\n]+)/);
            const model = modelMatch ? modelMatch[1].trim() : 'Unknown';

            const memMatch = memInfo.match(/MemTotal:\s*(\d+)\s*kB/);
            const memoryKB = memMatch ? parseInt(memMatch[1]) : 0;
            const memoryMB = Math.round(memoryKB / 1024);

            const issues = [];
            if (!isRaspberryPi) {
                issues.push('Not a Raspberry Pi');
            }
            if (memoryMB < 256) {
                issues.push(`Low memory: ${memoryMB}MB (minimum 256MB)`);
            }

            return {
                compatible: issues.length === 0,
                isRaspberryPi: isRaspberryPi,
                model: model,
                memory: memoryMB,
                issues: issues,
                status: 'success'
            };

        } catch (error) {
            throw new Error(`Hardware validation failed: ${error.message}`);
        }
    }

    async updateSystem() {
        try {
            console.log('     Updating package index...');
            await this.runCommand('apt update');

            console.log('     Upgrading packages...');
            const { stdout } = await this.runCommand('apt list --upgradable 2>/dev/null | wc -l');
            const upgradableCount = parseInt(stdout.trim()) - 1; // Subtract header line

            if (upgradableCount > 0) {
                await this.runCommand('DEBIAN_FRONTEND=noninteractive apt upgrade -y');
            }

            // Check if reboot is required
            const rebootRequired = await fs.access('/var/run/reboot-required').then(() => true).catch(() => false);

            return {
                status: 'success',
                packagesUpdated: upgradableCount,
                rebootRequired: rebootRequired
            };

        } catch (error) {
            throw new Error(`System update failed: ${error.message}`);
        }
    }

    async installNodeJS() {
        try {
            // Check if Node.js is already installed
            try {
                const { stdout: nodeVersion } = await this.runCommand('node --version');
                const { stdout: npmVersion } = await this.runCommand('npm --version');

                const nodeVer = nodeVersion.trim();
                const npmVer = npmVersion.trim();

                // Check if version is acceptable (16+)
                const majorVersion = parseInt(nodeVer.replace('v', '').split('.')[0]);
                if (majorVersion >= 16) {
                    return {
                        status: 'already_installed',
                        version: nodeVer,
                        npmVersion: npmVer
                    };
                }
            } catch (error) {
                // Node.js not installed or wrong version
            }

            // Install Node.js via NodeSource repository
            console.log('     Adding NodeSource repository...');
            await this.runCommand('curl -fsSL https://deb.nodesource.com/setup_18.x | bash -');

            console.log('     Installing Node.js...');
            await this.runCommand('apt install -y nodejs');

            // Verify installation
            const { stdout: nodeVersion } = await this.runCommand('node --version');
            const { stdout: npmVersion } = await this.runCommand('npm --version');

            return {
                status: 'installed',
                version: nodeVersion.trim(),
                npmVersion: npmVersion.trim()
            };

        } catch (error) {
            throw new Error(`Node.js installation failed: ${error.message}`);
        }
    }

    async installSystemDependencies() {
        const packages = [
            'git',
            'curl',
            'wget',
            'build-essential',
            'network-manager',
            'hostapd',
            'dnsmasq',
            'iptables-persistent'
        ];

        try {
            console.log(`     Installing ${packages.length} packages...`);
            await this.runCommand(`apt install -y ${packages.join(' ')}`);

            return {
                status: 'success',
                installed: packages
            };

        } catch (error) {
            throw new Error(`Dependencies installation failed: ${error.message}`);
        }
    }

    async setupServiceUser() {
        const username = 'pi-camera';

        try {
            // Check if user already exists
            try {
                await this.runCommand(`id ${username}`);
                return {
                    status: 'already_exists',
                    username: username
                };
            } catch (error) {
                // User doesn't exist, create it
            }

            // Create system user
            await this.runCommand(`useradd --system --create-home --shell /bin/bash ${username}`);

            // Add to necessary groups
            await this.runCommand(`usermod -a -G sudo,netdev ${username}`);

            // Configure sudo access for network operations
            const sudoRule = `${username} ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/nmcli, /sbin/ip, /usr/bin/hostapd_cli`;
            await fs.writeFile(`/etc/sudoers.d/${username}`, sudoRule);

            return {
                status: 'created',
                username: username
            };

        } catch (error) {
            throw new Error(`User setup failed: ${error.message}`);
        }
    }

    async createDirectories() {
        const directories = [
            '/opt/pi-camera-control',
            '/opt/pi-camera-control/src',
            '/opt/pi-camera-control/logs',
            '/opt/pi-camera-control/data',
            '/opt/pi-camera-control/data/reports',
            '/var/log/pi-camera-control'
        ];

        try {
            const created = [];

            for (const dir of directories) {
                try {
                    await fs.mkdir(dir, { recursive: true });
                    created.push(dir);
                } catch (error) {
                    if (error.code !== 'EEXIST') {
                        throw error;
                    }
                }
            }

            // Set ownership
            await this.runCommand('chown -R pi-camera:pi-camera /opt/pi-camera-control');
            await this.runCommand('chown -R pi-camera:pi-camera /var/log/pi-camera-control');

            return {
                status: 'success',
                created: created
            };

        } catch (error) {
            throw new Error(`Directory creation failed: ${error.message}`);
        }
    }

    async configureNetworkManager() {
        try {
            // Create NetworkManager configuration for dual WiFi
            const nmConfig = `[main]
plugins=ifupdown,keyfile

[ifupdown]
managed=false

[device]
wifi.scan-rand-mac-address=no

[connection]
wifi.powersave=2`;

            await fs.writeFile('/etc/NetworkManager/NetworkManager.conf', nmConfig);

            // Restart NetworkManager
            await this.runCommand('systemctl restart NetworkManager');

            return { status: 'success' };

        } catch (error) {
            throw new Error(`NetworkManager configuration failed: ${error.message}`);
        }
    }

    async configureHostapd(apConfig) {
        try {
            const hostapdConf = `interface=${apConfig.interface}
driver=nl80211
ssid=${apConfig.ssid}
hw_mode=g
channel=${apConfig.channel}
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${apConfig.password}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP`;

            await fs.writeFile('/etc/hostapd/hostapd.conf', hostapdConf);

            // Configure hostapd daemon
            const hostapdDefault = `DAEMON_CONF="/etc/hostapd/hostapd.conf"`;
            await fs.writeFile('/etc/default/hostapd', hostapdDefault);

            return {
                status: 'success',
                configPath: '/etc/hostapd/hostapd.conf'
            };

        } catch (error) {
            throw new Error(`hostapd configuration failed: ${error.message}`);
        }
    }

    async configureDnsmasq(apConfig) {
        try {
            // Backup original config
            try {
                await this.runCommand('cp /etc/dnsmasq.conf /etc/dnsmasq.conf.orig');
            } catch (error) {
                // Backup already exists or failed
            }

            const dnsmasqConf = `interface=${apConfig.interface}
dhcp-range=192.168.4.2,192.168.4.20,255.255.255.0,24h
domain=local
address=/gw.local/192.168.4.1
dhcp-option=3,192.168.4.1
dhcp-option=6,192.168.4.1
server=8.8.8.8
log-queries
log-dhcp
listen-address=192.168.4.1`;

            await fs.writeFile('/etc/dnsmasq.conf', dnsmasqConf);

            return {
                status: 'success',
                configPath: '/etc/dnsmasq.conf'
            };

        } catch (error) {
            throw new Error(`dnsmasq configuration failed: ${error.message}`);
        }
    }

    async startAccessPoint() {
        try {
            // Enable services
            await this.runCommand('systemctl enable hostapd');
            await this.runCommand('systemctl enable dnsmasq');

            // Start services
            await this.runCommand('systemctl start hostapd');
            await this.runCommand('systemctl start dnsmasq');

            // Wait for services to start
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Verify services are running
            const hostapdStatus = await this.runCommand('systemctl is-active hostapd');
            const dnsmasqStatus = await this.runCommand('systemctl is-active dnsmasq');

            return {
                status: 'success',
                hostapd: hostapdStatus.stdout.trim() === 'active',
                dnsmasq: dnsmasqStatus.stdout.trim() === 'active'
            };

        } catch (error) {
            throw new Error(`Access point startup failed: ${error.message}`);
        }
    }

    async deploySourceCode(deployConfig) {
        try {
            // Create temporary script for file copying
            const copyScript = `#!/bin/bash
rsync -av --exclude='node_modules' --exclude='.git' --exclude='logs/*' --exclude='data/*' "${deployConfig.sourceDir}/" "${deployConfig.targetDir}/"
echo "Copied \$(find "${deployConfig.targetDir}" -type f | wc -l) files"`;

            await fs.writeFile('/tmp/deploy_source.sh', copyScript);
            await this.runCommand('chmod +x /tmp/deploy_source.sh');

            const { stdout } = await this.runCommand('/tmp/deploy_source.sh');
            const fileCountMatch = stdout.match(/Copied (\d+) files/);
            const filesCopied = fileCountMatch ? parseInt(fileCountMatch[1]) : 0;

            // Set ownership
            await this.runCommand(`chown -R ${deployConfig.serviceUser}:${deployConfig.serviceUser} ${deployConfig.targetDir}`);

            return {
                status: 'success',
                filesCopied: filesCopied,
                targetDir: deployConfig.targetDir
            };

        } catch (error) {
            throw new Error(`Source deployment failed: ${error.message}`);
        }
    }

    async installServiceDependencies(deployConfig) {
        try {
            // Change to target directory and install dependencies
            const installCmd = `cd ${deployConfig.targetDir} && npm install --production`;
            await this.runCommand(installCmd);

            return { status: 'success' };

        } catch (error) {
            throw new Error(`Service dependencies installation failed: ${error.message}`);
        }
    }

    async configureSystemdService(deployConfig) {
        try {
            const serviceContent = `[Unit]
Description=Pi Camera Control Service
After=network.target

[Service]
Type=simple
User=${deployConfig.serviceUser}
WorkingDirectory=${deployConfig.targetDir}
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=${deployConfig.servicePort}

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pi-camera-control

[Install]
WantedBy=multi-user.target`;

            await fs.writeFile('/etc/systemd/system/pi-camera-control.service', serviceContent);

            // Reload systemd
            await this.runCommand('systemctl daemon-reload');

            // Enable service
            await this.runCommand('systemctl enable pi-camera-control');

            return {
                status: 'success',
                servicePath: '/etc/systemd/system/pi-camera-control.service'
            };

        } catch (error) {
            throw new Error(`systemd service configuration failed: ${error.message}`);
        }
    }

    async startService() {
        try {
            // Start service
            await this.runCommand('systemctl start pi-camera-control');

            // Wait for startup
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Check status
            const { stdout } = await this.runCommand('systemctl is-active pi-camera-control');
            const isActive = stdout.trim() === 'active';

            if (!isActive) {
                throw new Error('Service failed to start properly');
            }

            return {
                status: 'success',
                active: isActive
            };

        } catch (error) {
            throw new Error(`Service startup failed: ${error.message}`);
        }
    }

    async validateService(deployConfig) {
        try {
            // Check service status
            const { stdout: statusOutput } = await this.runCommand('systemctl status pi-camera-control --no-pager -l');

            // Test health endpoint
            let healthCheck = { status: 'failed' };
            try {
                const { stdout: curlOutput } = await this.runCommand(`curl -s http://localhost:${deployConfig.servicePort}/health`);
                const healthData = JSON.parse(curlOutput);
                healthCheck = {
                    status: healthData.status === 'ok' ? 'healthy' : 'unhealthy',
                    uptime: healthData.uptime
                };
            } catch (error) {
                healthCheck.error = error.message;
            }

            // Get performance metrics
            const { stdout: psOutput } = await this.runCommand('ps aux | grep "node.*server.js" | grep -v grep');
            const memoryMatch = psOutput.match(/\s+[\d.]+\s+([\d.]+)\s+/);
            const memoryPercent = memoryMatch ? parseFloat(memoryMatch[1]) : 0;

            return {
                status: 'success',
                healthCheck: healthCheck,
                performance: {
                    memoryPercent: memoryPercent,
                    memoryMB: Math.round(memoryPercent * 5.12) // Rough estimate for 512MB Pi
                }
            };

        } catch (error) {
            throw new Error(`Service validation failed: ${error.message}`);
        }
    }

    async validateNetworkConfig() {
        try {
            // Check interface status
            const { stdout: ipOutput } = await this.runCommand('ip addr show');

            const hasWlan0 = ipOutput.includes('wlan0');
            const hasAp0 = ipOutput.includes('ap0');

            // Check service status
            const { stdout: hostapdStatus } = await this.runCommand('systemctl is-active hostapd');
            const { stdout: dnsmasqStatus } = await this.runCommand('systemctl is-active dnsmasq');

            return {
                status: 'success',
                interfaces: {
                    wlan0: hasWlan0,
                    ap0: hasAp0
                },
                services: {
                    hostapd: hostapdStatus.trim() === 'active',
                    dnsmasq: dnsmasqStatus.trim() === 'active'
                }
            };

        } catch (error) {
            throw new Error(`Network validation failed: ${error.message}`);
        }
    }

    async validateSystemHealth() {
        try {
            const { stdout: loadOutput } = await this.runCommand('cat /proc/loadavg');
            const load = parseFloat(loadOutput.split(' ')[0]);

            const { stdout: memOutput } = await this.runCommand('free -m');
            const memLines = memOutput.split('\n');
            const memLine = memLines[1];
            const memParts = memLine.split(/\s+/);
            const memUsed = parseInt(memParts[2]);
            const memTotal = parseInt(memParts[1]);
            const memPercent = (memUsed / memTotal) * 100;

            return {
                status: load < 1.0 && memPercent < 80 ? 'healthy' : 'stressed',
                load: load,
                memory: {
                    used: memUsed,
                    total: memTotal,
                    percent: Math.round(memPercent)
                }
            };

        } catch (error) {
            throw new Error(`System health check failed: ${error.message}`);
        }
    }

    async validateNetworkDeployment() {
        try {
            const { stdout: ipOutput } = await this.runCommand('ip addr show');

            const wlan0Match = ipOutput.match(/wlan0:.*?inet ([0-9.]+).*?state UP/s);
            const ap0Match = ipOutput.match(/ap0:.*?inet ([0-9.]+).*?state UP/s);

            return {
                status: 'success',
                wlan0: {
                    status: wlan0Match ? 'up' : 'down',
                    ip: wlan0Match ? wlan0Match[1] : null
                },
                ap0: {
                    status: ap0Match ? 'up' : 'down',
                    ip: ap0Match ? ap0Match[1] : '192.168.4.1'
                }
            };

        } catch (error) {
            throw new Error(`Network deployment validation failed: ${error.message}`);
        }
    }

    async validateServiceStatus() {
        try {
            const { stdout: statusOutput } = await this.runCommand('systemctl show pi-camera-control --property=ActiveState,ExecMainStartTimestamp --no-pager');

            const isActive = statusOutput.includes('ActiveState=active');
            const uptimeMatch = statusOutput.match(/ExecMainStartTimestamp=(.+)/);

            let uptime = 0;
            if (uptimeMatch && uptimeMatch[1] !== '') {
                const startTime = new Date(uptimeMatch[1]);
                uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
            }

            return {
                status: isActive ? 'active' : 'inactive',
                uptime: uptime
            };

        } catch (error) {
            throw new Error(`Service status validation failed: ${error.message}`);
        }
    }

    async validateAPIEndpoints() {
        const endpoints = [
            '/health',
            '/api/system/status',
            '/api/camera/status',
            '/api/network/status'
        ];

        let working = 0;

        for (const endpoint of endpoints) {
            try {
                await this.runCommand(`curl -s -f http://localhost:3000${endpoint} > /dev/null`);
                working++;
            } catch (error) {
                // Endpoint failed
            }
        }

        return {
            status: 'success',
            working: working,
            total: endpoints.length,
            coverage: Math.round((working / endpoints.length) * 100)
        };
    }

    async validateWebSocket() {
        try {
            // Simple WebSocket connection test using Node.js
            const testScript = `
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000');
ws.on('open', () => {
    console.log('connected');
    ws.close();
});
ws.on('error', (error) => {
    console.log('error');
    process.exit(1);
});
`;

            await fs.writeFile('/tmp/ws_test.js', testScript);
            const { stdout } = await this.runCommand('cd /opt/pi-camera-control && timeout 10 node /tmp/ws_test.js');

            return {
                status: 'success',
                connected: stdout.includes('connected')
            };

        } catch (error) {
            return {
                status: 'failed',
                connected: false,
                error: error.message
            };
        }
    }

    async validateCameraDiscovery() {
        try {
            // Test if UPnP discovery can start
            const testScript = `
const dgram = require('dgram');
const socket = dgram.createSocket('udp4');

socket.bind(() => {
    console.log('upnp_ready');
    socket.close();
});

socket.on('error', (error) => {
    console.log('upnp_failed');
    process.exit(1);
});
`;

            await fs.writeFile('/tmp/upnp_test.js', testScript);
            const { stdout } = await this.runCommand('cd /opt/pi-camera-control && timeout 5 node /tmp/upnp_test.js');

            return {
                status: 'success',
                upnpWorking: stdout.includes('upnp_ready')
            };

        } catch (error) {
            return {
                status: 'warning',
                upnpWorking: false,
                error: error.message
            };
        }
    }

    async validatePerformance() {
        try {
            // Run a basic performance test
            const start = Date.now();

            // Test API response times
            const { stdout: healthResponse } = await this.runCommand('curl -w "%{time_total}" -s -o /dev/null http://localhost:3000/health');
            const responseTime = parseFloat(healthResponse) * 1000; // Convert to ms

            // Test system performance
            const { stdout: loadOutput } = await this.runCommand('cat /proc/loadavg');
            const load = parseFloat(loadOutput.split(' ')[0]);

            const { stdout: memOutput } = await this.runCommand('free -m | grep "Mem:" | awk \'{print $3/$2 * 100}\'');
            const memUsage = parseFloat(memOutput);

            // Calculate performance score
            let score = 100;
            if (responseTime > 100) score -= 20;
            if (responseTime > 500) score -= 30;
            if (load > 0.5) score -= 15;
            if (load > 1.0) score -= 25;
            if (memUsage > 60) score -= 15;
            if (memUsage > 80) score -= 25;

            const grade = score >= 90 ? 'Excellent' :
                         score >= 80 ? 'Good' :
                         score >= 70 ? 'Fair' :
                         score >= 60 ? 'Poor' : 'Critical';

            return {
                status: 'success',
                score: Math.max(0, score),
                grade: grade,
                metrics: {
                    responseTime: responseTime,
                    load: load,
                    memoryUsage: memUsage
                }
            };

        } catch (error) {
            return {
                status: 'warning',
                score: 0,
                grade: 'Unknown',
                error: error.message
            };
        }
    }

    // Utility methods
    async runCommand(command) {
        if (this.targetHost) {
            return await execAsync(`ssh ${this.targetHost} "${command}"`);
        } else {
            return await execAsync(command);
        }
    }

    // Report printing methods
    printSetupReport(results) {
        console.log(`\n📋 System Setup Report`);
        console.log('=' .repeat(40));

        const steps = [
            ['Hardware', results.hardware.compatible ? '✅' : '❌'],
            ['Updates', results.updates.status === 'success' ? '✅' : '❌'],
            ['Node.js', results.nodejs.status !== 'failed' ? '✅' : '❌'],
            ['Dependencies', results.dependencies.status === 'success' ? '✅' : '❌'],
            ['Users', results.users.status !== 'failed' ? '✅' : '❌'],
            ['Directories', results.directories.status === 'success' ? '✅' : '❌']
        ];

        steps.forEach(([step, status]) => {
            console.log(`${status} ${step}`);
        });

        const successCount = steps.filter(([, status]) => status === '✅').length;
        console.log(`\nSetup Status: ${successCount}/${steps.length} completed successfully`);
    }

    printNetworkConfigReport(results, apConfig) {
        console.log(`\n📋 Network Configuration Report`);
        console.log('=' .repeat(40));

        console.log(`Access Point: ${apConfig.ssid}`);
        console.log(`Channel: ${apConfig.channel}`);
        console.log(`Password: ${apConfig.password}`);

        const components = [
            ['NetworkManager', results.networkManager.status === 'success' ? '✅' : '❌'],
            ['hostapd', results.hostapd.status === 'success' ? '✅' : '❌'],
            ['dnsmasq', results.dnsmasq.status === 'success' ? '✅' : '❌'],
            ['AP Services', results.accessPoint.status === 'success' ? '✅' : '❌']
        ];

        console.log('\nComponents:');
        components.forEach(([component, status]) => {
            console.log(`${status} ${component}`);
        });
    }

    printServiceDeploymentReport(results, deployConfig) {
        console.log(`\n📋 Service Deployment Report`);
        console.log('=' .repeat(40));

        console.log(`Target: ${deployConfig.targetDir}`);
        console.log(`User: ${deployConfig.serviceUser}`);
        console.log(`Port: ${deployConfig.servicePort}`);

        const steps = [
            ['Code Deployment', results.codeDeployment.status === 'success' ? '✅' : '❌'],
            ['Dependencies', results.dependencies.status === 'success' ? '✅' : '❌'],
            ['Service Config', results.serviceConfig.status === 'success' ? '✅' : '❌'],
            ['Service Start', results.serviceStart.status === 'success' ? '✅' : '❌'],
            ['Validation', results.validation.status !== 'failed' ? '✅' : '❌']
        ];

        console.log('\nDeployment Steps:');
        steps.forEach(([step, status]) => {
            console.log(`${status} ${step}`);
        });
    }

    printValidationReport(results) {
        console.log(`\n📋 Deployment Validation Report`);
        console.log('=' .repeat(40));

        const checks = [
            ['System Health', results.system.status !== 'failed' ? '✅' : '❌'],
            ['Network Config', results.network.status !== 'failed' ? '✅' : '❌'],
            ['Service Status', results.service.status !== 'failed' ? '✅' : '❌'],
            ['API Endpoints', results.api.status !== 'failed' ? '✅' : '❌'],
            ['WebSocket', results.websocket.status !== 'failed' ? '✅' : '❌'],
            ['Camera Discovery', results.camera.status !== 'failed' ? '✅' : '⚠️'],
            ['Performance', results.performance.status !== 'failed' ? '✅' : '⚠️']
        ];

        console.log('Validation Results:');
        checks.forEach(([check, status]) => {
            console.log(`${status} ${check}`);
        });

        if (results.api.working !== undefined) {
            console.log(`\nAPI Coverage: ${results.api.working}/${results.api.total} endpoints`);
        }

        if (results.performance.score !== undefined) {
            console.log(`Performance Score: ${results.performance.score}/100 (${results.performance.grade})`);
        }
    }

    printComprehensiveReport(results) {
        console.log(`\n📊 COMPREHENSIVE DEPLOYMENT REPORT`);
        console.log('=' .repeat(50));

        const duration = Math.round(results.performance.duration / 1000);
        console.log(`\nDeployment Duration: ${duration} seconds`);
        console.log(`Completed: ${results.performance.endTime}`);

        // Overall status summary
        const phases = [
            ['System Setup', results.setup ? '✅' : '❌'],
            ['Network Config', results.network ? '✅' : '❌'],
            ['Service Deploy', results.service ? '✅' : '❌'],
            ['Validation', results.validation ? '✅' : '❌']
        ];

        console.log('\nDeployment Phases:');
        phases.forEach(([phase, status]) => {
            console.log(`${status} ${phase}`);
        });

        if (results.validation?.performance?.score) {
            console.log(`\nFinal Performance Score: ${results.validation.performance.score}/100`);
        }

        console.log('\nDeployment Status: ✅ COMPLETE');
        console.log('Your pi-camera-control system is ready for use!');
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Deployment Helper Agent - Pi Camera Control Deployment Tool

Usage: node deployment-helper-agent.js <command> [options]

Commands:
  setup [--target HOST]                     - Setup base system
  network --ap-ssid SSID --ap-password PASS - Configure network
  service [--source-dir PATH] [--port PORT] - Deploy service
  validate [--full-test]                    - Validate deployment
  comprehensive [all options]               - Complete deployment

Examples:
  node deployment-helper-agent.js setup
  node deployment-helper-agent.js network --ap-ssid "Pi-Camera" --ap-password "camera123"
  node deployment-helper-agent.js service --source-dir /Users/mark/git/pi-camera-control
  node deployment-helper-agent.js validate --full-test
  node deployment-helper-agent.js comprehensive --ap-ssid "Pi-Camera" --ap-password "camera123"

Remote deployment:
  node deployment-helper-agent.js setup --target pi@picontrol-002.local
        `);
        process.exit(1);
    }

    const agent = new DeploymentHelperAgent();

    try {
        let result;
        const options = {};

        // Parse command line options
        for (let i = 1; i < args.length; i += 2) {
            const option = args[i];
            const value = args[i + 1];

            switch (option) {
                case '--target':
                    options.target = value;
                    break;
                case '--source-dir':
                    options.sourceDir = value;
                    break;
                case '--port':
                    options.port = value;
                    break;
                case '--ap-ssid':
                    options.apSsid = value;
                    break;
                case '--ap-password':
                    options.apPassword = value;
                    break;
                case '--ap-channel':
                    options.apChannel = value;
                    break;
                case '--full-test':
                    options.fullTest = true;
                    i--; // No value for this flag
                    break;
            }
        }

        switch (command.toLowerCase()) {
            case 'setup':
                result = await agent.runDeployment('setup', options);
                break;

            case 'network':
                if (!options.apSsid || !options.apPassword) {
                    console.error('Error: --ap-ssid and --ap-password are required for network configuration');
                    process.exit(1);
                }
                result = await agent.runDeployment('network', options);
                break;

            case 'service':
                result = await agent.runDeployment('service', options);
                break;

            case 'validate':
                result = await agent.runDeployment('validate', options);
                break;

            case 'comprehensive':
                result = await agent.runDeployment('comprehensive', options);
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

export default DeploymentHelperAgent;
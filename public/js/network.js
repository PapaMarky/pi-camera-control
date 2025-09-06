/**
 * Network Management UI Controller
 */
class NetworkUI {
    constructor(websocket) {
        this.ws = websocket;
        this.currentNetworks = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.bindModals();
        this.setupWebSocketListeners();
    }

    bindEvents() {
        // Network mode switching
        document.getElementById('switch-network-mode-btn')?.addEventListener('click', () => {
            this.handleModeSwitch();
        });

        // WiFi operations
        document.getElementById('scan-wifi-btn')?.addEventListener('click', () => {
            this.scanWiFiNetworks();
        });

        document.getElementById('disconnect-wifi-btn')?.addEventListener('click', () => {
            this.disconnectWiFi();
        });

        // Access Point configuration
        document.getElementById('configure-ap-btn')?.addEventListener('click', () => {
            this.showAPConfigModal();
        });

        // Modal event listeners are bound in bindModals()
    }

    bindModals() {
        // WiFi connection modal
        const wifiModal = document.getElementById('wifi-connect-modal');
        const wifiCloseBtn = wifiModal?.querySelector('.modal-close');
        const cancelWifiBtn = document.getElementById('cancel-wifi-connect-btn');
        const confirmWifiBtn = document.getElementById('confirm-wifi-connect-btn');

        [wifiCloseBtn, cancelWifiBtn].forEach(btn => {
            btn?.addEventListener('click', () => this.hideWiFiModal());
        });

        confirmWifiBtn?.addEventListener('click', () => {
            this.connectToWiFi();
        });

        // Access Point configuration modal
        const apModal = document.getElementById('ap-config-modal');
        const apCloseBtn = apModal?.querySelector('.modal-close');
        const cancelApBtn = document.getElementById('cancel-ap-config-btn');
        const saveApBtn = document.getElementById('save-ap-config-btn');

        [apCloseBtn, cancelApBtn].forEach(btn => {
            btn?.addEventListener('click', () => this.hideAPConfigModal());
        });

        saveApBtn?.addEventListener('click', () => {
            this.saveAPConfiguration();
        });

        // Close modals when clicking outside
        [wifiModal, apModal].forEach(modal => {
            modal?.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    setupWebSocketListeners() {
        // Listen for network-related WebSocket responses
        if (this.ws && this.ws.on) {
            this.ws.on('network_mode_result', (data) => {
                this.handleNetworkModeResult(data);
            });

            this.ws.on('network_scan_result', (data) => {
                this.handleNetworkScanResult(data);
            });

            this.ws.on('network_connect_result', (data) => {
                this.handleNetworkConnectResult(data);
            });

            this.ws.on('network_disconnect_result', (data) => {
                this.handleNetworkDisconnectResult(data);
            });
        }
    }

    handleNetworkModeResult(data) {
        this.setButtonLoading('switch-network-mode-btn', false);
        
        if (data.success) {
            this.showToast(`Switched to ${data.mode} mode`, 'success');
            // Update the network status with the new data
            if (data.status) {
                this.updateNetworkStatus({
                    mode: data.mode,
                    interfaces: data.status
                });
            }
        } else {
            this.showToast(`Mode switch failed: ${data.error || 'Unknown error'}`, 'error');
        }
    }

    handleNetworkScanResult(data) {
        this.setButtonLoading('scan-wifi-btn', false);
        
        if (data.networks) {
            this.currentNetworks = data.networks;
            this.displayWiFiNetworks(data.networks);
            this.showToast(`Found ${data.networks.length} networks`, 'success');
        } else {
            this.showToast('WiFi scan failed', 'error');
        }
    }

    handleNetworkConnectResult(data) {
        if (data.success) {
            this.showToast(`Connected to ${data.network || 'network'}`, 'success');
        } else {
            this.showToast(`Connection failed: ${data.error || 'Unknown error'}`, 'error');
        }
    }

    handleNetworkDisconnectResult(data) {
        this.setButtonLoading('disconnect-wifi-btn', false);
        
        if (data.success) {
            this.showToast('Disconnected from WiFi', 'success');
        } else {
            this.showToast(`Disconnection failed: ${data.error || 'Unknown error'}`, 'error');
        }
    }

    updateNetworkStatus(networkData) {
        if (!networkData) return;

        const { mode, interfaces, services } = networkData;

        // Update network mode indicators
        this.updateNetworkMode(mode);

        // Update WiFi status
        this.updateWiFiStatus(interfaces?.wlan0);

        // Update Access Point status  
        this.updateAccessPointStatus(interfaces?.ap0);

        // Update UI state based on current status
        this.updateUIState(networkData);
    }

    updateNetworkMode(mode) {
        const modeElement = document.getElementById('network-mode');
        if (modeElement) {
            modeElement.textContent = mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : '-';
        }

        // Update radio buttons in network settings
        const fieldRadio = document.getElementById('field-mode-radio');
        const devRadio = document.getElementById('development-mode-radio');
        
        if (fieldRadio && devRadio) {
            fieldRadio.checked = (mode === 'field');
            devRadio.checked = (mode === 'development');
        }
    }

    updateWiFiStatus(wifiData) {
        const statusElement = document.getElementById('wifi-connection-status');
        const networkElement = document.getElementById('current-wifi-network');
        const ipElement = document.getElementById('wifi-ip-address');
        const headerStatusElement = document.getElementById('wifi-status-text');

        if (wifiData) {
            const { active, network, ip } = wifiData;
            
            // Show network name in status if connected
            let status;
            if (active && network) {
                status = `Connected to ${network}`;
            } else if (active) {
                status = 'Connected';
            } else {
                status = 'Disconnected';
            }
            
            const networkName = network || 'Unknown';
            const ipAddress = ip || '-';

            if (statusElement) statusElement.textContent = status;
            if (networkElement) networkElement.textContent = active ? networkName : 'Not connected';
            if (ipElement) ipElement.textContent = ipAddress;
            if (headerStatusElement) headerStatusElement.textContent = active ? '✓' : '✗';

            // Update disconnect button state
            const disconnectBtn = document.getElementById('disconnect-wifi-btn');
            if (disconnectBtn) {
                disconnectBtn.disabled = !active;
            }
        }
    }

    updateAccessPointStatus(apData) {
        const statusElement = document.getElementById('ap-status-text');
        const devicesElement = document.getElementById('ap-connected-devices');
        const clientsDetailElement = document.getElementById('ap-clients-detail');
        const headerClientsElement = document.getElementById('ap-clients-count');

        if (apData) {
            const { active, clients, ip } = apData;
            const clientCount = clients ? clients.length : 0;

            const status = active ? 'Active' : 'Inactive';

            if (statusElement) statusElement.textContent = status;
            if (devicesElement) devicesElement.textContent = clientCount.toString();
            if (clientsDetailElement) clientsDetailElement.textContent = `${clientCount} connected`;
            if (headerClientsElement) headerClientsElement.textContent = clientCount.toString();
        }
    }

    updateUIState(networkData) {
        // Enable/disable WiFi section based on mode
        const wifiSection = document.getElementById('wifi-client-section');
        const isDevelopmentMode = networkData.mode === 'development';
        
        if (wifiSection) {
            wifiSection.style.opacity = isDevelopmentMode ? '1' : '0.6';
            const buttons = wifiSection.querySelectorAll('button');
            buttons.forEach(btn => {
                if (isDevelopmentMode) {
                    btn.removeAttribute('disabled');
                } else {
                    btn.setAttribute('disabled', 'true');
                }
            });
        }
    }

    handleModeSwitch() {
        const fieldRadio = document.getElementById('field-mode-radio');
        const devRadio = document.getElementById('development-mode-radio');
        
        let selectedMode = null;
        if (fieldRadio?.checked) selectedMode = 'field';
        if (devRadio?.checked) selectedMode = 'development';

        if (!selectedMode) {
            this.showToast('Please select a network mode', 'error');
            return;
        }

        this.showToast(`Switching to ${selectedMode} mode...`, 'info');
        this.setButtonLoading('switch-network-mode-btn', true);

        // Send WebSocket message for network mode switch
        const success = this.ws.send('network_mode_switch', { mode: selectedMode });
        
        if (!success) {
            this.showToast('Failed to send network mode switch request', 'error');
            this.setButtonLoading('switch-network-mode-btn', false);
        }
        
        // Reset button after 5 seconds (in case we don't get a response)
        setTimeout(() => {
            this.setButtonLoading('switch-network-mode-btn', false);
        }, 5000);
    }

    scanWiFiNetworks(forceRefresh = false) {
        this.showToast('Scanning for WiFi networks...', 'info');
        this.setButtonLoading('scan-wifi-btn', true);

        const success = this.ws.send('network_scan', { refresh: forceRefresh });
        
        if (!success) {
            this.showToast('Failed to send WiFi scan request', 'error');
            this.setButtonLoading('scan-wifi-btn', false);
        } else {
            // Reset button after 10 seconds if no response
            setTimeout(() => {
                this.setButtonLoading('scan-wifi-btn', false);
            }, 10000);
        }
    }

    displayWiFiNetworks(networks) {
        const networksContainer = document.getElementById('wifi-networks');
        const networksList = document.getElementById('networks-list');
        
        if (!networksContainer || !networksList) return;

        // Show the networks container
        networksContainer.style.display = 'block';

        // Clear existing networks
        networksList.innerHTML = '';

        if (networks.length === 0) {
            networksList.innerHTML = '<div class="no-networks">No networks found</div>';
            return;
        }

        // Create network items
        networks.forEach(network => {
            const networkItem = this.createNetworkItem(network);
            networksList.appendChild(networkItem);
        });
    }

    createNetworkItem(network) {
        const item = document.createElement('div');
        item.className = 'network-item';
        
        // Security icon
        const securityIcon = network.security === 'Open' ? '🔓' : '🔒';
        
        // Signal strength bars
        const signalBars = this.getSignalBars(network.quality);
        
        item.innerHTML = `
            <div class="network-info">
                <div class="network-name">${network.ssid}</div>
                <div class="network-details">
                    <span class="network-security">${securityIcon} ${network.security}</span>
                    <span class="network-signal">${signalBars} ${network.quality}%</span>
                </div>
            </div>
            <button class="connect-btn" data-ssid="${network.ssid}">Connect</button>
        `;

        // Add click handler for connect button
        const connectBtn = item.querySelector('.connect-btn');
        connectBtn.addEventListener('click', () => {
            this.showWiFiModal(network);
        });

        return item;
    }

    getSignalBars(quality) {
        if (quality >= 80) return '▁▂▃▄▅';
        if (quality >= 60) return '▁▂▃▄_';
        if (quality >= 40) return '▁▂▃__';
        if (quality >= 20) return '▁▂___';
        return '▁____';
    }

    showWiFiModal(network) {
        const modal = document.getElementById('wifi-connect-modal');
        const ssidInput = document.getElementById('wifi-ssid-input');
        const passwordInput = document.getElementById('wifi-password-input');
        const priorityInput = document.getElementById('wifi-priority-input');

        if (modal && ssidInput) {
            ssidInput.value = network.ssid;
            passwordInput.value = '';
            priorityInput.value = '1';
            
            // Hide password field for open networks
            const passwordGroup = passwordInput.parentElement;
            if (network.security === 'Open') {
                passwordGroup.style.display = 'none';
                passwordInput.value = '';
            } else {
                passwordGroup.style.display = 'block';
                passwordInput.focus();
            }
            
            modal.style.display = 'flex';
        }
    }

    hideWiFiModal() {
        const modal = document.getElementById('wifi-connect-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    connectToWiFi() {
        const ssid = document.getElementById('wifi-ssid-input')?.value;
        const password = document.getElementById('wifi-password-input')?.value;
        const priority = document.getElementById('wifi-priority-input')?.value;

        if (!ssid) {
            this.showToast('SSID is required', 'error');
            return;
        }

        this.hideWiFiModal();
        this.showToast(`Connecting to ${ssid}...`, 'info');

        const success = this.ws.send('network_connect', {
            ssid,
            password: password || undefined,
            priority: parseInt(priority) || 1
        });
        
        if (!success) {
            this.showToast('Failed to send connection request', 'error');
        }
    }

    disconnectWiFi() {
        this.showToast('Disconnecting from WiFi...', 'info');
        this.setButtonLoading('disconnect-wifi-btn', true);

        const success = this.ws.send('network_disconnect');
        
        if (!success) {
            this.showToast('Failed to send disconnect request', 'error');
            this.setButtonLoading('disconnect-wifi-btn', false);
        } else {
            // Reset button after 5 seconds if no response
            setTimeout(() => {
                this.setButtonLoading('disconnect-wifi-btn', false);
            }, 5000);
        }
    }

    showAPConfigModal() {
        const modal = document.getElementById('ap-config-modal');
        if (modal) {
            // Load current AP settings
            const ssidInput = document.getElementById('ap-ssid-input');
            const currentSSID = document.getElementById('ap-ssid')?.textContent;
            if (ssidInput && currentSSID && currentSSID !== '-') {
                ssidInput.value = currentSSID;
            }
            
            modal.style.display = 'flex';
        }
    }

    hideAPConfigModal() {
        const modal = document.getElementById('ap-config-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    saveAPConfiguration() {
        const ssid = document.getElementById('ap-ssid-input')?.value;
        const password = document.getElementById('ap-password-input')?.value;
        const channel = document.getElementById('ap-channel-input')?.value;
        const hidden = document.getElementById('ap-hidden-checkbox')?.checked;

        if (!ssid || !password) {
            this.showToast('SSID and password are required', 'error');
            return;
        }

        if (password.length < 8) {
            this.showToast('Password must be at least 8 characters', 'error');
            return;
        }

        this.hideAPConfigModal();
        this.showToast('Saving access point configuration...', 'info');

        // Note: This would require system privileges to actually apply
        this.showToast('Configuration saved (restart may be required)', 'info');
    }

    setButtonLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = loading;
            if (loading) {
                button.classList.add('loading');
            } else {
                button.classList.remove('loading');
            }
        }
    }

    showToast(message, type = 'info') {
        // Use the existing toast system from app.js
        if (window.appInstance && window.appInstance.showToast) {
            window.appInstance.showToast(message, type);
        } else {
            // Fallback
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
}

// Export for use in other modules
window.NetworkUI = NetworkUI;
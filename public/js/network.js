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

        // WiFi connectivity warning modal
        const warningModal = document.getElementById('wifi-connectivity-warning-modal');
        const warningCloseBtn = warningModal?.querySelector('.modal-close');
        const cancelWarningBtn = document.getElementById('cancel-wifi-setup-btn');
        const proceedWarningBtn = document.getElementById('proceed-wifi-setup-btn');

        [warningCloseBtn, cancelWarningBtn].forEach(btn => {
            btn?.addEventListener('click', () => this.hideConnectivityWarningModal());
        });

        proceedWarningBtn?.addEventListener('click', () => {
            console.log('Proceed WiFi Setup button clicked, pendingWiFiAction:', this.pendingWiFiAction);

            // Execute pending action BEFORE hiding modal (which clears the action)
            if (this.pendingWiFiAction) {
                console.log('Executing pending WiFi action...');
                const actionToExecute = this.pendingWiFiAction;
                this.hideConnectivityWarningModal(); // This clears pendingWiFiAction
                actionToExecute(); // Execute the saved action
            } else {
                console.error('No pending WiFi action found!');
                this.hideConnectivityWarningModal();
            }
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
        [wifiModal, apModal, warningModal].forEach(modal => {
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
        console.log('Network scan result received:', data);
        this.setButtonLoading('scan-wifi-btn', false);

        if (data.networks) {
            console.log(`Found ${data.networks.length} networks:`, data.networks);
            this.currentNetworks = data.networks;
            this.displayWiFiNetworks(data.networks);
            this.showToast(`Found ${data.networks.length} networks`, 'success');
        } else {
            console.error('WiFi scan failed - no networks in response:', data);
            this.showToast('WiFi scan failed', 'error');
        }
    }

    handleNetworkConnectResult(data) {
        if (data.success) {
            this.showToast(`Connected to ${data.network || 'network'}`, 'success');

            // Hide the WiFi networks list after successful connection
            const networksContainer = document.getElementById('wifi-networks');
            if (networksContainer) {
                networksContainer.style.display = 'none';
                console.log('WiFi networks list hidden after successful connection');
            }
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
                status = network; // Just show the network name
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
        // Settings page elements
        const statusElement = document.getElementById('ap-status-text');
        const clientsDetailElement = document.getElementById('ap-clients-detail');
        // Main page elements
        const mainStatusElement = document.getElementById('ap-connection-status');
        const headerClientsElement = document.getElementById('ap-clients-count');
        // SSID display elements
        const ssidElement = document.getElementById('ap-ssid');

        if (apData) {
            const { active, clients, ip, ssid } = apData;
            const clientCount = clients ? clients.length : 0;

            const status = active ? 'Active' : 'Inactive';

            // Update settings page
            if (statusElement) statusElement.textContent = status;
            if (clientsDetailElement) clientsDetailElement.textContent = `${clientCount} connected`;

            // Update main page
            if (mainStatusElement) mainStatusElement.textContent = status;
            if (headerClientsElement) headerClientsElement.textContent = clientCount.toString();

            // Update SSID if element exists
            if (ssidElement && ssid) ssidElement.textContent = ssid;
        }
    }

    updateUIState(networkData) {
        // Enable/disable WiFi section based on mode
        const wifiSection = document.getElementById('wifi-client-section');
        // WiFi controls should be enabled in both 'development' and 'field' modes
        // (wifi-only mode should not exist - camera controller always has AP)
        const wifiControlsEnabled = networkData.mode === 'development' || networkData.mode === 'field';

        if (wifiSection) {
            wifiSection.style.opacity = wifiControlsEnabled ? '1' : '0.6';
            const buttons = wifiSection.querySelectorAll('button');
            buttons.forEach(btn => {
                if (wifiControlsEnabled) {
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

    async scanWiFiNetworks(forceRefresh = false) {
        // Check if client is connected via WiFi and show warning if needed
        const isViaWiFi = await this.isClientConnectedViaWiFi();
        if (isViaWiFi) {
            this.showConnectivityWarning(() => {
                this.performWiFiScan(forceRefresh);
            });
        } else {
            this.performWiFiScan(forceRefresh);
        }
    }

    performWiFiScan(forceRefresh = false) {
        console.log('performWiFiScan called with forceRefresh:', forceRefresh);
        this.showToast('Scanning for WiFi networks...', 'info');
        this.setButtonLoading('scan-wifi-btn', true);

        console.log('Sending network_scan WebSocket message...');
        const success = this.ws.send('network_scan', { refresh: forceRefresh });
        console.log('WebSocket send result:', success);

        if (!success) {
            this.showToast('Failed to send WiFi scan request', 'error');
            this.setButtonLoading('scan-wifi-btn', false);
        } else {
            console.log('WiFi scan request sent successfully, waiting for response...');
            // Reset button after 10 seconds if no response
            setTimeout(() => {
                this.setButtonLoading('scan-wifi-btn', false);
            }, 10000);
        }
    }

    /**
     * Detect if client is connected via WiFi (not Access Point)
     * Access Point clients will have IP in 192.168.4.x range
     */
    async isClientConnectedViaWiFi() {
        // Get client IP from various sources
        const clientIP = await this.getClientIP();

        if (!clientIP) {
            // If we can't determine IP, assume WiFi connection for safety
            return true;
        }

        // Access Point subnet is 192.168.4.x
        const apSubnetRegex = /^192\.168\.4\./;

        // If client IP is NOT in AP subnet, they're connected via WiFi
        return !apSubnetRegex.test(clientIP);
    }

    /**
     * Get client IP address
     */
    getClientIP() {
        // Try WebRTC method first
        return new Promise((resolve) => {
            try {
                const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;

                if (!RTCPeerConnection) {
                    resolve(null);
                    return;
                }

                const pc = new RTCPeerConnection({ iceServers: [] });

                pc.createDataChannel('');
                pc.createOffer().then(offer => pc.setLocalDescription(offer));

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        const candidate = event.candidate.candidate;
                        const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
                        if (ipMatch) {
                            pc.close();
                            resolve(ipMatch[1]);
                        }
                    }
                };

                // Timeout after 3 seconds
                setTimeout(() => {
                    pc.close();
                    resolve(null);
                }, 3000);

            } catch (error) {
                console.error('Error getting client IP:', error);
                resolve(null);
            }
        });
    }

    displayWiFiNetworks(networks) {
        console.log('displayWiFiNetworks called with:', networks);
        const networksContainer = document.getElementById('wifi-networks');
        const networksList = document.getElementById('networks-list');

        if (!networksContainer || !networksList) {
            console.error('Missing WiFi networks container elements');
            return;
        }

        // Show the networks container
        networksContainer.style.display = 'block';
        console.log('WiFi networks container shown');

        // Clear existing networks
        networksList.innerHTML = '';

        if (networks.length === 0) {
            networksList.innerHTML = '<div class="no-networks">No networks found</div>';
            return;
        }

        // Get current AP SSID to filter out
        const currentAPSSID = document.getElementById('ap-ssid')?.textContent || 'PiCameraController';
        console.log('Current AP SSID for filtering:', currentAPSSID);

        // Filter out the AP SSID, deduplicate by SSID (keep strongest), and sort by signal strength
        const networkMap = new Map();

        networks
            .filter(network =>
                network.ssid !== currentAPSSID &&
                network.ssid &&
                network.ssid !== '00:00:00:00:00:00' &&
                !network.ssid.match(/^[0-9A-Fa-f:]+$/)) // Filter out MAC addresses used as SSIDs
            .forEach(network => {
                const existing = networkMap.get(network.ssid);
                if (!existing || (network.quality || 0) > (existing.quality || 0)) {
                    networkMap.set(network.ssid, network);
                }
            });

        const filteredNetworks = Array.from(networkMap.values())
            .sort((a, b) => (b.quality || 0) - (a.quality || 0));

        console.log(`Filtered networks (removed ${networks.length - filteredNetworks.length}):`, filteredNetworks);

        if (filteredNetworks.length === 0) {
            networksList.innerHTML = '<div class="no-networks">No other networks found</div>';
            return;
        }

        // Create network items
        filteredNetworks.forEach(network => {
            const networkItem = this.createNetworkItem(network);
            networksList.appendChild(networkItem);
        });

        console.log(`Added ${filteredNetworks.length} network items to list`);

        // Scroll the networks container into view for better UX
        networksContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    createNetworkItem(network) {
        const item = document.createElement('div');
        item.className = 'network-item';

        console.log('Creating network item for:', network); // Debug log

        // Security icon - only show lock for secured networks
        const securityIcon = network.security === 'Open' ? ' ' : '🔒';

        // Signal strength - convert dBm to percentage
        let signalStrength = 0;
        let qualityText = 'Unknown';

        if (network.quality !== undefined) {
            // Already a percentage
            signalStrength = network.quality;
            qualityText = `${signalStrength}%`;
        } else if (network.signal !== undefined) {
            // Convert dBm to percentage (typical range: -30 dBm = 100%, -90 dBm = 0%)
            const dbm = network.signal;
            signalStrength = Math.max(0, Math.min(100, Math.round((dbm + 90) * 100 / 60)));
            qualityText = `${signalStrength}%`;
        } else if (network.strength !== undefined) {
            signalStrength = network.strength;
            qualityText = `${signalStrength}%`;
        }

        const signalBars = this.getSignalBars(signalStrength);

        item.innerHTML = `
            <div class="network-info">
                <div class="network-name">${network.ssid}</div>
                <div class="network-details">
                    <span class="network-security">${securityIcon} ${network.security}</span>
                    <span class="network-signal">${signalBars} ${qualityText}</span>
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

    /**
     * Show connectivity warning modal with current AP SSID
     */
    showConnectivityWarning(onProceed) {
        const modal = document.getElementById('wifi-connectivity-warning-modal');
        const apSSIDElement = document.getElementById('warning-ap-ssid');

        if (modal && apSSIDElement) {
            // Get current AP SSID from network status, with better fallback logic
            let currentAPSSID = document.getElementById('ap-ssid')?.textContent;

            // If SSID is empty or dash, try to request fresh status
            if (!currentAPSSID || currentAPSSID === '-' || currentAPSSID === 'Unknown') {
                currentAPSSID = 'PiCameraController'; // Default fallback

                // Request fresh network status
                if (this.ws && this.ws.send) {
                    this.ws.send('get_status');

                    // Retry after a moment to see if we got updated data
                    setTimeout(() => {
                        const updatedSSID = document.getElementById('ap-ssid')?.textContent;
                        if (updatedSSID && updatedSSID !== '-' && updatedSSID !== 'Unknown') {
                            apSSIDElement.textContent = updatedSSID;
                        }
                    }, 1000);
                }
            }

            apSSIDElement.textContent = currentAPSSID;

            // Store the action to perform if user proceeds
            console.log('Setting pendingWiFiAction:', onProceed);
            this.pendingWiFiAction = onProceed;

            modal.style.display = 'flex';
        }
    }

    hideConnectivityWarningModal() {
        const modal = document.getElementById('wifi-connectivity-warning-modal');
        if (modal) {
            modal.style.display = 'none';
            this.pendingWiFiAction = null;
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
        const channel = document.getElementById('ap-channel-input')?.value || '7';
        const hidden = document.getElementById('ap-hidden-checkbox')?.checked || false;

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

        // Send configuration to backend via API
        fetch('/api/network/accesspoint/configure', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ssid: ssid.trim(),
                passphrase: password,
                channel: parseInt(channel),
                hidden: hidden
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.showToast(`Access point configured successfully! SSID: ${data.config.ssid}`, 'success');
                
                // Update the UI with new settings
                setTimeout(() => {
                    // Refresh network status to show updated AP info
                    if (this.ws && this.ws.send) {
                        this.ws.send('get_status');
                    }
                }, 2000);
            } else {
                this.showToast(`Configuration failed: ${data.error || 'Unknown error'}`, 'error');
            }
        })
        .catch(error => {
            console.error('AP configuration error:', error);
            this.showToast('Failed to save configuration - check network connection', 'error');
        });
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
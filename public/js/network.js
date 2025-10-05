/**
 * Network Management UI Controller
 */
class NetworkUI {
  constructor(websocket) {
    this.ws = websocket;
    this.currentNetworks = [];
    this.clientConnectionInfo = {
      ip: null,
      isViaWiFi: null,
      lastChecked: null,
      cacheTimeout: 30000, // 30 seconds
    };
    this.wifiState = {
      enabled: false,
      connected: false,
      network: null,
    };
    this.init();
  }

  /**
   * Helper to extract error message from API response
   * @param {Response} response - Fetch API response object
   * @returns {Promise<string>} Error message from response body or generic message
   */
  async extractErrorMessage(response) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error && errorData.error.message) {
        errorMessage = errorData.error.message;
      }
    } catch (e) {
      // If parsing fails, use the generic message
    }
    return errorMessage;
  }

  init() {
    this.bindEvents();
    this.bindModals();
    this.setupWebSocketListeners();
    this.checkWiFiStatus();
    this.loadCurrentCountry();
  }

  bindEvents() {
    // WiFi operations
    document.getElementById("scan-wifi-btn")?.addEventListener("click", () => {
      this.scanWiFiNetworks();
    });

    document
      .getElementById("wifi-toggle-btn")
      ?.addEventListener("click", () => {
        this.handleWiFiToggle();
      });

    // Access Point configuration
    document
      .getElementById("configure-ap-btn")
      ?.addEventListener("click", () => {
        this.showAPConfigModal();
      });

    // WiFi Country management
    document
      .getElementById("change-country-btn")
      ?.addEventListener("click", () => {
        this.showCountrySelection();
      });

    document
      .getElementById("close-country-btn")
      ?.addEventListener("click", () => {
        this.hideCountrySelection();
      });

    // Modal event listeners are bound in bindModals()
  }

  bindModals() {
    // WiFi connection modal
    const wifiModal = document.getElementById("wifi-connect-modal");
    const wifiCloseBtn = wifiModal?.querySelector(".modal-close");
    const cancelWifiBtn = document.getElementById("cancel-wifi-connect-btn");
    const confirmWifiBtn = document.getElementById("confirm-wifi-connect-btn");

    [wifiCloseBtn, cancelWifiBtn].forEach((btn) => {
      btn?.addEventListener("click", () => this.hideWiFiModal());
    });

    confirmWifiBtn?.addEventListener("click", () => {
      this.connectToWiFi();
    });

    // WiFi connectivity warning modal
    const warningModal = document.getElementById(
      "wifi-connectivity-warning-modal",
    );
    const warningCloseBtn = warningModal?.querySelector(".modal-close");
    const cancelWarningBtn = document.getElementById("cancel-wifi-setup-btn");
    const proceedWarningBtn = document.getElementById("proceed-wifi-setup-btn");

    [warningCloseBtn, cancelWarningBtn].forEach((btn) => {
      btn?.addEventListener("click", () => this.hideConnectivityWarningModal());
    });

    proceedWarningBtn?.addEventListener("click", () => {
      console.log(
        "Proceed WiFi Setup button clicked, pendingWiFiAction:",
        this.pendingWiFiAction,
      );

      // Execute pending action BEFORE hiding modal (which clears the action)
      if (this.pendingWiFiAction) {
        console.log("Executing pending WiFi action...");
        const actionToExecute = this.pendingWiFiAction;
        this.hideConnectivityWarningModal(); // This clears pendingWiFiAction
        actionToExecute(); // Execute the saved action
      } else {
        console.error("No pending WiFi action found!");
        this.hideConnectivityWarningModal();
      }
    });

    // Access Point configuration modal
    const apModal = document.getElementById("ap-config-modal");
    const apCloseBtn = apModal?.querySelector(".modal-close");
    const cancelApBtn = document.getElementById("cancel-ap-config-btn");
    const saveApBtn = document.getElementById("save-ap-config-btn");

    [apCloseBtn, cancelApBtn].forEach((btn) => {
      btn?.addEventListener("click", () => this.hideAPConfigModal());
    });

    saveApBtn?.addEventListener("click", () => {
      this.saveAPConfiguration();
    });

    // Close networks list button
    const closeNetworksBtn = document.getElementById("close-networks-btn");
    closeNetworksBtn?.addEventListener("click", () => {
      this.hideWiFiNetworks();
    });

    // Close modals when clicking outside
    [wifiModal, apModal, warningModal].forEach((modal) => {
      modal?.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.style.display = "none";
        }
      });
    });
  }

  setupWebSocketListeners() {
    // Listen for network-related WebSocket responses
    if (this.ws && this.ws.on) {
      this.ws.on("wifi_enable_result", (data) => {
        this.handleWiFiEnableResult(data);
      });

      this.ws.on("wifi_disable_result", (data) => {
        this.handleWiFiDisableResult(data);
      });

      this.ws.on("network_scan_result", (data) => {
        this.handleNetworkScanResult(data);
      });

      // network_connect_result is now handled automatically by sendOperation method

      this.ws.on("network_disconnect_result", (data) => {
        this.handleNetworkDisconnectResult(data);
      });

      // Listen for general status updates that include network information
      this.ws.on("status", (data) => {
        this.handleStatusUpdate(data);
      });

      // Listen for welcome messages that include initial status
      this.ws.on("welcome", (data) => {
        this.handleStatusUpdate(data);
      });
    }
  }

  handleWiFiEnableResult(data) {
    this.setButtonLoading("wifi-toggle-btn", false);

    if (data.success) {
      this.showToast("WiFi enabled successfully", "success");
      this.wifiState.enabled = true;
      this.updateWiFiToggleButton();

      // Force refresh of all network status after a brief delay
      setTimeout(() => {
        this.checkWiFiStatus();
        // Request updated network status from server
        if (this.ws && this.ws.send) {
          this.ws.send("get_status");
        }

        // Auto-open WiFi networks list to help user connect
        // Add extra delay to let NetworkManager fully initialize saved connections
        setTimeout(() => {
          try {
            this.scanWiFiNetworks();
          } catch (scanError) {
            console.error(
              "Auto-scan failed, but WiFi enable succeeded:",
              scanError,
            );
          }
        }, 1000);
      }, 1000);
    } else {
      this.showToast(
        `WiFi enable failed: ${data.error || "Unknown error"}`,
        "error",
      );
    }
  }

  handleWiFiDisableResult(data) {
    this.setButtonLoading("wifi-toggle-btn", false);

    if (data.success) {
      this.showToast("WiFi turned off successfully", "success");
      this.wifiState.enabled = false;
      this.wifiState.connected = false;
      this.wifiState.network = null;
      this.updateWiFiToggleButton();

      // Close SSID list when WiFi is turned off
      const networksContainer = document.getElementById("wifi-networks");
      if (networksContainer) {
        networksContainer.style.display = "none";
        console.log("SSID list hidden after WiFi turned off");
      }

      // Update WiFi status display when disabled
      this.updateWiFiStatus({ active: false, network: null, ip: null });

      // Force refresh of all network status after a brief delay
      setTimeout(() => {
        this.checkWiFiStatus();
        // Request updated network status from server
        if (this.ws && this.ws.send) {
          this.ws.send("get_status");
        }
      }, 1000);
    } else {
      this.showToast(
        `WiFi disable failed: ${data.error || "Unknown error"}`,
        "error",
      );
    }
  }

  handleNetworkScanResult(data) {
    console.log("Network scan result received:", data);
    this.setButtonLoading("scan-wifi-btn", false);

    if (data.networks) {
      console.log(`Found ${data.networks.length} networks:`, data.networks);
      this.currentNetworks = data.networks;
      this.displayWiFiNetworks(data.networks);
      this.showToast(`Found ${data.networks.length} networks`, "success");
    } else {
      console.error("WiFi scan failed - no networks in response:", data);
      this.showToast("WiFi scan failed", "error");
    }
  }

  // handleNetworkConnectResult removed - now handled by universal WebSocket sendOperation method

  handleNetworkDisconnectResult(data) {
    this.setButtonLoading("wifi-toggle-btn", false);

    if (data.success) {
      this.showToast("Disconnected from WiFi", "success");
      this.wifiState.connected = false;
      this.wifiState.network = null;
      this.updateWiFiToggleButton();

      // Update WiFi status display when disconnected
      this.updateWiFiStatus({ active: false, network: null, ip: null });

      // Force refresh of all network status after a brief delay
      setTimeout(() => {
        this.checkWiFiStatus();
        // Request updated network status from server
        if (this.ws && this.ws.send) {
          this.ws.send("get_status");
        }
      }, 1000);
    } else {
      this.showToast(
        `Disconnection failed: ${data.error || "Unknown error"}`,
        "error",
      );
    }
  }

  updateNetworkStatus(networkData) {
    if (!networkData) return;

    const { interfaces, services } = networkData;

    // Update WiFi status
    this.updateWiFiStatus(interfaces?.wlan0);

    // Update Access Point status
    this.updateAccessPointStatus(interfaces?.ap0);
  }

  updateWiFiStatus(wifiData) {
    console.log("updateWiFiStatus called with:", wifiData);
    const statusElement = document.getElementById("wifi-connection-status");
    const networkElement = document.getElementById("current-wifi-network");
    const ipElement = document.getElementById("wifi-ip-address");
    const headerStatusElement = document.getElementById("wifi-status-text");
    const wifiStatusElement = document.getElementById("wifi-status");

    console.log("DOM elements found:", {
      statusElement: !!statusElement,
      networkElement: !!networkElement,
      ipElement: !!ipElement,
      headerStatusElement: !!headerStatusElement,
    });

    if (wifiData) {
      const { active, network, ip } = wifiData;
      console.log("Processing WiFi data:", { active, network, ip });

      // Update our internal state
      this.wifiState.connected = active || false;
      this.wifiState.network = network || null;

      // Show network name in status if connected
      let status;
      if (active && network) {
        status = network; // Just show the network name
      } else if (active) {
        status = "Connected";
      } else {
        status = "Disconnected";
      }

      const networkName = network || "Unknown";
      // Strip subnet mask from IP address (e.g., "192.168.1.100/24" -> "192.168.1.100")
      const ipAddress = ip ? ip.split("/")[0] : "-";

      console.log("Updating display with:", { status, networkName, ipAddress });

      if (statusElement) statusElement.textContent = status;
      if (networkElement) {
        const displayText = active ? networkName : "Not connected";
        networkElement.textContent = displayText;
        console.log("Updated network element to:", displayText);
      }
      if (ipElement) {
        ipElement.textContent = ipAddress;
        console.log("Updated IP element to:", ipAddress);
      }
      if (headerStatusElement)
        headerStatusElement.textContent = active ? "✓" : "✗";

      // Update WiFi Status field - this will be set by checkWiFiStatus()
      // Don't set it here as we need to check the actual enabled state from API

      // Also check WiFi enabled state when updating status
      this.checkWiFiStatus();
    } else {
      console.log("No WiFi data provided to updateWiFiStatus");
    }
  }

  updateAccessPointStatus(apData) {
    // Settings page elements
    const statusElement = document.getElementById("ap-status-text");
    const clientsDetailElement = document.getElementById("ap-clients-detail");
    // Main page elements
    const mainStatusElement = document.getElementById("ap-connection-status");
    const headerClientsElement = document.getElementById("ap-clients-count");
    // SSID display elements
    const ssidElement = document.getElementById("ap-ssid");

    if (apData) {
      const { active, clients, ip, ssid, status } = apData;
      const clientCount = clients ? clients.length : 0;

      // Use backend-provided status if available, otherwise derive from active state
      const displayStatus = status || (active ? "Active" : "Inactive");

      // Update settings page - Status shows active/inactive, SSID shows SSID
      if (statusElement) statusElement.textContent = displayStatus;
      if (clientsDetailElement)
        clientsDetailElement.textContent = `${clientCount} connected`;

      // Update main page - show SSID for AP status (main page shows SSID, not status)
      if (mainStatusElement) mainStatusElement.textContent = ssid || "Unknown";
      if (headerClientsElement)
        headerClientsElement.textContent = clientCount.toString();

      // Update SSID if element exists
      if (ssidElement && ssid) ssidElement.textContent = ssid;
    }
  }

  async enableWiFi() {
    this.setButtonLoading("wifi-toggle-btn", true, {
      progressText: "Enabling WiFi...",
      timeout: 20000, // 20 second timeout protection
    });
    this.showToast("Enabling WiFi...", "info");

    try {
      const response = await fetch("/api/network/wifi/enable", {
        method: "POST",
      });
      const data = await response.json();
      this.handleWiFiEnableResult(data);
    } catch (error) {
      console.error("WiFi enable failed:", error);
      this.showToast("Failed to enable WiFi", "error");
      this.setButtonLoading("wifi-toggle-btn", false);
    }
  }

  async disableWiFi() {
    this.setButtonLoading("wifi-toggle-btn", true, {
      progressText: "Turning off WiFi...",
      timeout: 15000, // 15 second timeout protection
    });
    this.showToast("Turning off WiFi...", "info");

    try {
      const response = await fetch("/api/network/wifi/disable", {
        method: "POST",
      });
      const data = await response.json();
      this.handleWiFiDisableResult(data);
    } catch (error) {
      console.error("WiFi disable failed:", error);
      this.showToast("Failed to disable WiFi", "error");
      this.setButtonLoading("wifi-toggle-btn", false);
    }
  }

  async checkWiFiStatus() {
    try {
      const response = await fetch("/api/network/wifi/enabled");
      const data = await response.json();

      if (data.enabled !== undefined) {
        this.wifiState.enabled = data.enabled;
        this.updateWiFiToggleButton();

        // Update Status field
        const wifiStatusElement = document.getElementById("wifi-status");
        if (wifiStatusElement) {
          wifiStatusElement.textContent = data.enabled ? "On" : "Off";
        }

        // Update Switch Network button state
        const scanWiFiBtn = document.getElementById("scan-wifi-btn");
        if (scanWiFiBtn) {
          scanWiFiBtn.disabled = !data.enabled;
          scanWiFiBtn.style.opacity = data.enabled ? "1" : "0.5";
        }
      }
    } catch (error) {
      console.error("Failed to check WiFi status:", error);
      // Default to checking... state
    }
  }

  async fetchNetworkStatus() {
    try {
      console.log("Fetching network status...");
      const response = await fetch("/api/network/status");
      const data = await response.json();

      console.log("Network status response:", data);
      if (data && data.interfaces && data.interfaces.wlan0) {
        console.log("Updating WiFi status with:", data.interfaces.wlan0);
        // Update WiFi connection info (Current Network, IP Address)
        this.updateWiFiStatus(data.interfaces.wlan0);
      } else {
        console.log("No wlan0 interface data found in response");
      }
    } catch (error) {
      console.error("Failed to fetch network status:", error);
    }
  }

  handleWiFiToggle() {
    const toggleBtn = document.getElementById("wifi-toggle-btn");
    if (toggleBtn?.disabled) return;

    if (this.wifiState.enabled) {
      // If WiFi is enabled (whether connected or not), disable it
      this.disableWiFi();
    } else {
      // If disabled, enable WiFi
      this.enableWiFi();
    }
  }

  updateWiFiToggleButton() {
    const toggleBtn = document.getElementById("wifi-toggle-btn");
    const toggleIcon = document.getElementById("wifi-toggle-icon");
    const toggleText = document.getElementById("wifi-toggle-text");

    if (!toggleBtn || !toggleIcon || !toggleText) return;

    if (!this.wifiState.enabled) {
      // WiFi is disabled
      toggleBtn.className = "secondary-btn";
      toggleBtn.disabled = false;
      toggleIcon.textContent = "🛜";
      toggleText.textContent = "Enable WiFi";
    } else if (this.wifiState.connected) {
      // WiFi is enabled and connected
      toggleBtn.className = "danger-btn";
      toggleBtn.disabled = false;
      toggleIcon.textContent = "❌";
      toggleText.textContent = "Turn Off WiFi";
    } else {
      // WiFi is enabled but not connected
      toggleBtn.className = "danger-btn";
      toggleBtn.disabled = false;
      toggleIcon.textContent = "❌";
      toggleText.textContent = "Turn Off WiFi";
    }
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
    console.log("performWiFiScan called with forceRefresh:", forceRefresh);
    this.showToast("Scanning for WiFi networks...", "info");
    this.setButtonLoading("scan-wifi-btn", true, {
      progressText: "Scanning...",
      timeout: 15000, // 15 second timeout protection
    });

    console.log("Sending network_scan WebSocket message...");
    const success = this.ws.send("network_scan", { refresh: forceRefresh });
    console.log("WebSocket send result:", success);

    if (!success) {
      this.showToast("Failed to send WiFi scan request", "error");
      this.setButtonLoading("scan-wifi-btn", false);
    }
    // Note: Successful scan completion will be handled by WebSocket response
    // which will call this.setButtonLoading('scan-wifi-btn', false)
  }

  /**
   * Detect if client is connected via WiFi (not Access Point)
   * Access Point clients will have IP in 192.168.4.x range
   * Uses caching to avoid slow WebRTC detection on every call
   */
  async isClientConnectedViaWiFi() {
    const now = Date.now();
    const cache = this.clientConnectionInfo;

    // Check if we have cached data that's still valid
    if (
      cache.isViaWiFi !== null &&
      cache.lastChecked !== null &&
      now - cache.lastChecked < cache.cacheTimeout
    ) {
      console.debug("Using cached client connection info:", cache.isViaWiFi);
      return cache.isViaWiFi;
    }

    // First check if we're accessing via the AP IP (192.168.4.1)
    const hostname = window.location.hostname;
    if (hostname === "192.168.4.1") {
      cache.isViaWiFi = false;
      cache.lastChecked = now;
      console.debug("Client connected via AP (hostname check):", {
        hostname,
        isViaWiFi: false,
      });
      return false;
    }

    // Get client IP from various sources
    const clientIP = await this.getClientIP();

    // Update cache with IP
    cache.ip = clientIP;
    cache.lastChecked = now;

    if (!clientIP) {
      // If we can't determine IP, check hostname as fallback
      // If hostname is AP IP, assume AP connection; otherwise assume WiFi
      const isViaWiFi = hostname !== "192.168.4.1";
      cache.isViaWiFi = isViaWiFi;
      console.debug("Client connection fallback (no IP detected):", {
        hostname,
        isViaWiFi,
      });
      return isViaWiFi;
    }

    // Access Point subnet is 192.168.4.x
    const apSubnetRegex = /^192\.168\.4\./;

    // If client IP is NOT in AP subnet, they're connected via WiFi
    const isViaWiFi = !apSubnetRegex.test(clientIP);

    // Cache the result
    cache.isViaWiFi = isViaWiFi;

    console.debug("Client connection detected:", {
      ip: clientIP,
      hostname,
      isViaWiFi,
    });
    return isViaWiFi;
  }

  /**
   * Get client IP address
   */
  getClientIP() {
    // Try WebRTC method first
    return new Promise((resolve) => {
      try {
        const RTCPeerConnection =
          window.RTCPeerConnection ||
          window.webkitRTCPeerConnection ||
          window.mozRTCPeerConnection;

        if (!RTCPeerConnection) {
          resolve(null);
          return;
        }

        const pc = new RTCPeerConnection({ iceServers: [] });

        pc.createDataChannel("");
        pc.createOffer().then((offer) => pc.setLocalDescription(offer));

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

        // Timeout after 1 second for faster response
        setTimeout(() => {
          pc.close();
          resolve(null);
        }, 1000);
      } catch (error) {
        console.error("Error getting client IP:", error);
        resolve(null);
      }
    });
  }

  async displayWiFiNetworks(networks) {
    console.log("displayWiFiNetworks called with:", networks);
    const networksContainer = document.getElementById("wifi-networks");
    const networksList = document.getElementById("networks-list");

    // Fetch saved networks to show which ones have stored passwords
    let savedNetworks = [];
    console.log("Starting saved networks fetch process...");
    try {
      console.log("Fetching saved networks...");
      const response = await fetch("/api/network/wifi/saved");
      console.log("Saved networks response status:", response.status);

      if (!response.ok) {
        const errorMessage = await this.extractErrorMessage(response);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log(
        "Saved networks response data:",
        JSON.stringify(data, null, 2),
      );
      savedNetworks = data.networks || [];
      console.log(
        "Parsed saved networks:",
        JSON.stringify(savedNetworks, null, 2),
      );
    } catch (error) {
      console.error("Failed to fetch saved networks:", error);
      console.error("Error details:", error.message);
    }

    if (!networksContainer || !networksList) {
      console.error("Missing WiFi networks container elements");
      return;
    }

    // Show the networks container
    networksContainer.style.display = "block";
    console.log("WiFi networks container shown");

    // Clear existing networks
    networksList.innerHTML = "";

    if (networks.length === 0) {
      networksList.innerHTML =
        '<div class="no-networks">No networks found</div>';
      return;
    }

    // Get current AP SSID to filter out
    const currentAPSSID =
      document.getElementById("ap-ssid")?.textContent || "PiCameraController";
    console.log("Current AP SSID for filtering:", currentAPSSID);

    // Filter out the AP SSID, deduplicate by SSID (keep strongest), and sort by signal strength
    const networkMap = new Map();

    networks
      .filter(
        (network) =>
          network.ssid !== currentAPSSID &&
          network.ssid &&
          network.ssid !== "00:00:00:00:00:00" &&
          !network.ssid.match(/^[0-9A-Fa-f:]+$/),
      ) // Filter out MAC addresses used as SSIDs
      .forEach((network) => {
        const existing = networkMap.get(network.ssid);

        // Get signal strength for comparison (quality > signal > strength)
        const getSignalStrength = (net) => {
          return net.quality || net.signal || net.strength || -100;
        };

        if (
          !existing ||
          getSignalStrength(network) > getSignalStrength(existing)
        ) {
          networkMap.set(network.ssid, network);
        }
      });

    const filteredNetworks = Array.from(networkMap.values()).sort((a, b) => {
      const getSignalStrength = (net) => {
        return net.quality || net.signal || net.strength || -100;
      };
      return getSignalStrength(b) - getSignalStrength(a);
    });

    console.log(
      `Filtered networks (removed ${networks.length - filteredNetworks.length}):`,
      filteredNetworks,
    );

    if (filteredNetworks.length === 0) {
      networksList.innerHTML =
        '<div class="no-networks">No other networks found</div>';
      return;
    }

    // Create network items
    filteredNetworks.forEach((network) => {
      const isSaved = savedNetworks.some(
        (saved) => saved.name === network.ssid,
      );
      console.log(
        `Creating network item for: ${network.ssid} isSaved: ${isSaved}`,
      );
      const networkItem = this.createNetworkItem(network, isSaved);
      networksList.appendChild(networkItem);
    });

    console.log(`Added ${filteredNetworks.length} network items to list`);

    // Scroll the networks container into view for better UX
    networksContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  createNetworkItem(network, isSaved = false) {
    const item = document.createElement("div");
    item.className = "network-item";

    console.log("Creating network item for:", network, "isSaved:", isSaved); // Debug log

    // Security icon - only show lock for secured networks
    const securityIcon = network.security === "Open" ? " " : "🔒";

    // Saved network indicator
    const savedIndicator = isSaved ? " ⭐" : "";

    // Signal strength - convert dBm to percentage
    let signalStrength = 0;
    let qualityText = "Unknown";

    if (network.quality !== undefined) {
      // Already a percentage
      signalStrength = network.quality;
      qualityText = `${signalStrength}%`;
    } else if (network.signal !== undefined) {
      // NetworkManager provides signal as percentage (0-100), not dBm
      signalStrength = Math.max(0, Math.min(100, network.signal));
      console.log(
        `Signal strength for ${network.ssid}: ${network.signal}% (from NetworkManager)`,
      );
      qualityText = `${signalStrength}%`;
    } else if (network.strength !== undefined) {
      signalStrength = network.strength;
      qualityText = `${signalStrength}%`;
    }

    item.innerHTML = `
            <div class="network-info">
                <div class="network-name">${network.ssid}${savedIndicator}</div>
                <div class="network-details">
                    <span class="network-security">${securityIcon} ${network.security}</span>
                    <span class="network-signal">${qualityText}</span>
                </div>
            </div>
            <button class="connect-btn" data-ssid="${network.ssid}">${isSaved && network.security !== "Open" ? "Connect ⭐" : "Connect"}</button>
        `;

    // Add click handler for connect button
    const connectBtn = item.querySelector(".connect-btn");
    connectBtn.addEventListener("click", () => {
      this.showWiFiModal(network, isSaved);
    });

    return item;
  }

  getSignalBars(quality) {
    if (quality >= 80) return "▏▎▍▌▋";
    if (quality >= 60) return "▏▎▍▌░";
    if (quality >= 40) return "▏▎▍░░";
    if (quality >= 20) return "▏▎░░░";
    return "▏░░░░";
  }

  showWiFiModal(network, isSaved = false) {
    const modal = document.getElementById("wifi-connect-modal");
    const ssidInput = document.getElementById("wifi-ssid-input");
    const passwordInput = document.getElementById("wifi-password-input");
    const priorityInput = document.getElementById("wifi-priority-input");

    if (modal && ssidInput) {
      ssidInput.value = network.ssid;
      passwordInput.value = "";
      priorityInput.value = "1";

      // Show helpful text for saved networks
      if (isSaved && network.security !== "Open") {
        passwordInput.placeholder = "Enter if changed";
        passwordInput.style.borderColor = "#28a745";
      } else {
        passwordInput.placeholder = "Enter WiFi password";
        passwordInput.style.borderColor = "";
      }

      // Hide password field for open networks
      const passwordGroup = passwordInput.parentElement;
      if (network.security === "Open") {
        passwordGroup.style.display = "none";
        passwordInput.value = "";
      } else {
        passwordGroup.style.display = "block";
        passwordInput.focus();
      }

      // Hide any previous error messages
      this.hideWiFiConnectionError();

      modal.style.display = "flex";
    }
  }

  hideWiFiModal() {
    const modal = document.getElementById("wifi-connect-modal");
    if (modal) {
      modal.style.display = "none";
    }
    // Hide error when modal is closed
    this.hideWiFiConnectionError();
  }

  showWiFiConnectionError(message) {
    const errorDiv = document.getElementById("wifi-connect-error");
    const errorMessage = document.getElementById("wifi-connect-error-message");

    if (errorDiv && errorMessage) {
      errorMessage.textContent = message;
      errorDiv.style.display = "block";
    }
  }

  hideWiFiConnectionError() {
    const errorDiv = document.getElementById("wifi-connect-error");
    if (errorDiv) {
      errorDiv.style.display = "none";
    }
  }

  /**
   * Show connectivity warning modal with current AP SSID
   */
  showConnectivityWarning(onProceed) {
    const modal = document.getElementById("wifi-connectivity-warning-modal");
    const apSSIDElement = document.getElementById("warning-ap-ssid");

    if (modal && apSSIDElement) {
      // Get current AP SSID from network status, with better fallback logic
      let currentAPSSID = document.getElementById("ap-ssid")?.textContent;

      // If SSID is empty or dash, try to request fresh status
      if (
        !currentAPSSID ||
        currentAPSSID === "-" ||
        currentAPSSID === "Unknown"
      ) {
        currentAPSSID = "PiCameraController"; // Default fallback

        // Request fresh network status
        if (this.ws && this.ws.send) {
          this.ws.send("get_status");

          // Retry after a moment to see if we got updated data
          setTimeout(() => {
            const updatedSSID = document.getElementById("ap-ssid")?.textContent;
            if (
              updatedSSID &&
              updatedSSID !== "-" &&
              updatedSSID !== "Unknown"
            ) {
              apSSIDElement.textContent = updatedSSID;
            }
          }, 1000);
        }
      }

      apSSIDElement.textContent = currentAPSSID;

      // Store the action to perform if user proceeds
      console.log("Setting pendingWiFiAction:", onProceed);
      this.pendingWiFiAction = onProceed;

      modal.style.display = "flex";
    }
  }

  hideConnectivityWarningModal() {
    const modal = document.getElementById("wifi-connectivity-warning-modal");
    if (modal) {
      modal.style.display = "none";
      this.pendingWiFiAction = null;
    }
  }

  hideWiFiNetworks() {
    const networksContainer = document.getElementById("wifi-networks");
    if (networksContainer) {
      networksContainer.style.display = "none";
    }
  }

  async connectToWiFi() {
    const ssid = document.getElementById("wifi-ssid-input")?.value;
    const password = document.getElementById("wifi-password-input")?.value;
    const priority = document.getElementById("wifi-priority-input")?.value;

    if (!ssid) {
      this.showToast("SSID is required", "error");
      return;
    }

    // Don't hide modal yet - wait for connection result
    this.showToast(`Connecting to ${ssid}...`, "info");

    try {
      // Use the universal sendOperation method for automatic UI state management
      const result = await this.ws.sendOperation(
        "network_connect",
        {
          ssid,
          password: password || undefined,
          priority: parseInt(priority) || 1,
        },
        {
          elementId: "confirm-wifi-connect-btn",
          progressText: "Connecting...",
          timeout: 30000,
          onSuccess: (result) => {
            this.showToast(`Connected to ${result.network || ssid}`, "success");
            this.hideWiFiModal();
            // Hide the WiFi networks list after successful connection
            const networksContainer = document.getElementById("wifi-networks");
            if (networksContainer) {
              networksContainer.style.display = "none";
            }
          },
          onError: (error) => {
            this.showWiFiConnectionError(error.message);
            this.showToast(`Connection failed: ${error.message}`, "error");
          },
        },
      );
    } catch (error) {
      // Error already handled by onError callback
      console.error("WiFi connection failed:", error);
    }
  }

  disconnectWiFi() {
    this.showToast("Disconnecting from WiFi...", "info");

    // Use UIStateManager with timeout protection
    window.uiStateManager.setInProgress("wifi-toggle-btn", {
      progressText: "Disconnecting...",
      progressIcon: "🔄",
      timeout: 10000, // 10 second timeout protection
    });

    const success = this.ws.send("network_disconnect");

    if (!success) {
      this.showToast("Failed to send disconnect request", "error");
      window.uiStateManager.restore("wifi-toggle-btn");
    }
    // Note: Successful disconnection will be handled by WebSocket response
    // which will call window.uiStateManager.restore('wifi-toggle-btn')
  }

  showAPConfigModal() {
    const modal = document.getElementById("ap-config-modal");
    if (modal) {
      // Load current AP settings
      const ssidInput = document.getElementById("ap-ssid-input");
      const currentSSID = document.getElementById("ap-ssid")?.textContent;
      if (ssidInput && currentSSID && currentSSID !== "-") {
        ssidInput.value = currentSSID;
      }

      modal.style.display = "flex";
    }
  }

  hideAPConfigModal() {
    const modal = document.getElementById("ap-config-modal");
    if (modal) {
      modal.style.display = "none";
    }
  }

  saveAPConfiguration() {
    const ssid = document.getElementById("ap-ssid-input")?.value;
    const password = document.getElementById("ap-password-input")?.value;
    const channel = document.getElementById("ap-channel-input")?.value || "7";
    const hidden =
      document.getElementById("ap-hidden-checkbox")?.checked || false;

    if (!ssid || !password) {
      this.showToast("SSID and password are required", "error");
      return;
    }

    if (password.length < 8) {
      this.showToast("Password must be at least 8 characters", "error");
      return;
    }

    this.hideAPConfigModal();
    this.showToast("Saving access point configuration...", "info");

    // Send configuration to backend via API
    fetch("/api/network/accesspoint/configure", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ssid: ssid.trim(),
        passphrase: password,
        channel: parseInt(channel),
        hidden: hidden,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          this.showToast(
            `Access point configured successfully! SSID: ${data.config.ssid}`,
            "success",
          );

          // Immediately update the UI with new settings
          const ssidElement = document.getElementById("ap-ssid");
          const statusElement = document.getElementById("ap-status-text");

          if (ssidElement) ssidElement.textContent = data.config.ssid;
          if (statusElement) statusElement.textContent = "Active";

          // Also refresh network status for complete data
          setTimeout(() => {
            if (this.ws && this.ws.send) {
              this.ws.send("get_status");
            }
          }, 1000);
        } else {
          this.showToast(
            `Configuration failed: ${data.error || "Unknown error"}`,
            "error",
          );
        }
      })
      .catch((error) => {
        console.error("AP configuration error:", error);
        this.showToast(
          "Failed to save configuration - check network connection",
          "error",
        );
      });
  }

  setButtonLoading(buttonId, loading, options = {}) {
    // Migrate to UIStateManager for consistent state handling
    if (loading) {
      const { progressText = "Loading...", timeout = 15000 } = options;
      window.uiStateManager.setInProgress(buttonId, {
        progressText,
        progressIcon: "⏳",
        timeout,
      });
    } else {
      window.uiStateManager.restore(buttonId);
    }
  }

  showToast(message, type = "info") {
    // Use the existing toast system from app.js
    if (window.appInstance && window.appInstance.showToast) {
      window.appInstance.showToast(message, type);
    } else {
      // Fallback
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  // WiFi Country Management Methods
  async loadCurrentCountry() {
    try {
      const response = await fetch("/api/network/wifi/country");
      const data = await response.json();

      if (data.country) {
        const countryElement = document.getElementById("current-wifi-country");

        if (countryElement) {
          countryElement.textContent = this.getCountryName(data.country);
        }
      }
    } catch (error) {
      console.error("Failed to load current country:", error);
      const countryElement = document.getElementById("current-wifi-country");
      if (countryElement) {
        countryElement.textContent = "Error loading";
      }
    }
  }

  async loadAvailableCountries() {
    try {
      const response = await fetch("/api/network/wifi/countries");
      const data = await response.json();

      if (data.countries) {
        this.availableCountries = data.countries;
        this.renderCountryList();
      }
    } catch (error) {
      console.error("Failed to load available countries:", error);
      this.showToast("Failed to load country list", "error");
    }
  }

  renderCountryList() {
    const countryList = document.getElementById("country-list");
    if (!countryList || !this.availableCountries) return;

    countryList.innerHTML = "";

    // Define common countries first (US and JP for your use case)
    const commonCountryCodes = ["US", "JP"];
    const commonCountries = [];
    const otherCountries = [];

    // Separate common and other countries
    this.availableCountries.forEach((country) => {
      if (commonCountryCodes.includes(country.code)) {
        commonCountries.push(country);
      } else {
        otherCountries.push(country);
      }
    });

    // Sort common countries by the order in commonCountryCodes
    commonCountries.sort((a, b) => {
      return (
        commonCountryCodes.indexOf(a.code) - commonCountryCodes.indexOf(b.code)
      );
    });

    // Sort other countries alphabetically by name
    otherCountries.sort((a, b) => a.name.localeCompare(b.name));

    // Render common countries first, then other countries
    [...commonCountries, ...otherCountries].forEach((country) => {
      this.renderCountryItem(countryList, country);
    });
  }

  renderCountryItem(container, country) {
    const item = document.createElement("div");
    item.className = "country-item";
    item.innerHTML = `
            <div class="country-name">${country.name}</div>
        `;

    item.addEventListener("click", () => {
      this.selectCountry(country);
    });

    container.appendChild(item);
  }

  async selectCountry(country) {
    const confirmMessage = `Change WiFi country to ${country.name} (${country.code})?\n\n⚠️ This will:\n• Apply new regulatory limits\n• Restart network services\n• May affect WiFi range and power`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.hideCountrySelection();
    this.showToast(`Changing WiFi country to ${country.name}...`, "info");

    try {
      const response = await fetch("/api/network/wifi/country", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          country: country.code,
        }),
      });

      const data = await response.json();

      if (data.success) {
        this.showToast(`WiFi country changed to ${country.name}`, "success");

        // Update UI immediately
        const countryElement = document.getElementById("current-wifi-country");

        if (countryElement) {
          countryElement.textContent = country.name;
        }

        // Refresh network status after change
        setTimeout(() => {
          if (this.ws && this.ws.send) {
            this.ws.send("get_status");
          }
        }, 2000);
      } else {
        this.showToast(
          `Failed to change country: ${data.error || "Unknown error"}`,
          "error",
        );
      }
    } catch (error) {
      console.error("Country change error:", error);
      this.showToast(
        "Failed to change WiFi country - check network connection",
        "error",
      );
    }
  }

  showCountrySelection() {
    const countrySelection = document.getElementById("country-selection");
    if (countrySelection) {
      // Load countries if not already loaded
      if (!this.availableCountries) {
        this.loadAvailableCountries();
      }
      countrySelection.style.display = "block";
    }
  }

  hideCountrySelection() {
    const countrySelection = document.getElementById("country-selection");
    if (countrySelection) {
      countrySelection.style.display = "none";
    }
  }

  getCountryName(countryCode) {
    if (!this.availableCountries) return countryCode;
    const country = this.availableCountries.find((c) => c.code === countryCode);
    return country ? country.name : countryCode;
  }

  handleStatusUpdate(data) {
    // Update country information if present in network status
    if (data.network && data.network.wifiCountry) {
      this.updateCountryDisplay(data.network.wifiCountry);
    }
  }

  updateCountryDisplay(wifiCountryData) {
    if (!wifiCountryData || !wifiCountryData.country) return;

    const countryElement = document.getElementById("current-wifi-country");

    if (countryElement) {
      const countryName = this.getCountryName(wifiCountryData.country);
      countryElement.textContent = countryName;
    }
  }
}

// Export for use in other modules
window.NetworkUI = NetworkUI;

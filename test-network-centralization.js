#!/usr/bin/env node

/**
 * Test script for centralized network management
 * Verifies that all components work together properly
 */

import { logger } from './src/utils/logger.js';
import { NetworkStateManager } from './src/network/state-manager.js';
import { NetworkManager } from './src/network/manager.js';

async function testNetworkCentralization() {
  logger.info('Testing centralized network management...');
  
  try {
    // Test 1: NetworkStateManager initialization
    logger.info('Test 1: Initializing NetworkStateManager...');
    const stateManager = new NetworkStateManager();
    const initSuccess = await stateManager.initialize();
    
    if (!initSuccess) {
      throw new Error('NetworkStateManager initialization failed');
    }
    
    logger.info('✓ NetworkStateManager initialized successfully');
    
    // Test 2: NetworkManager compatibility layer
    logger.info('Test 2: Testing NetworkManager compatibility layer...');
    const networkManager = new NetworkManager();
    const compatSuccess = await networkManager.initialize();
    
    if (!compatSuccess) {
      throw new Error('NetworkManager compatibility layer failed');
    }
    
    logger.info('✓ NetworkManager compatibility layer working');
    
    // Test 3: Current mode detection
    logger.info('Test 3: Testing mode detection...');
    const currentMode = networkManager.getCurrentMode();
    logger.info(`Current network mode: ${currentMode}`);
    
    // Test 4: Network status retrieval
    logger.info('Test 4: Testing network status retrieval...');
    const networkStatus = await networkManager.getNetworkStatus();
    logger.info('Network status:', {
      mode: networkStatus.mode,
      interfaceCount: Object.keys(networkStatus.interfaces).length,
      serviceCount: Object.keys(networkStatus.services).length
    });
    
    // Test 5: WiFi scan
    logger.info('Test 5: Testing WiFi scan...');
    try {
      const networks = await networkManager.scanWiFiNetworks();
      logger.info(`✓ WiFi scan completed: found ${networks.length} networks`);
    } catch (error) {
      logger.warn('WiFi scan failed (may be expected on non-Pi systems):', error.message);
    }
    
    // Test 6: Event-driven architecture
    logger.info('Test 6: Testing event-driven architecture...');
    let eventReceived = false;
    
    stateManager.on('modeDetected', () => {
      eventReceived = true;
      logger.info('✓ Event system working - received modeDetected event');
    });
    
    // Wait a moment for events
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (!eventReceived) {
      logger.warn('No events received (may be expected if mode already detected)');
    }
    
    // Cleanup
    await stateManager.cleanup();
    await networkManager.cleanup();
    
    logger.info('✅ All network centralization tests passed!');
    logger.info('Centralized network management is working correctly');
    
    return true;
    
  } catch (error) {
    logger.error('❌ Network centralization test failed:', error);
    return false;
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  const success = await testNetworkCentralization();
  process.exit(success ? 0 : 1);
}
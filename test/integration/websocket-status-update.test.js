/**
 * WebSocket Status Update Integration Tests
 *
 * Tests that status_update messages include all required fields including
 * the complete intervalometer object with overtime statistics.
 */

import { MessageSchemas } from "../schemas/websocket-message-schemas.js";
import { validateSchema } from "../schemas/websocket-messages.test.js";

describe("WebSocket status_update with intervalometer", () => {
  test("status_update includes complete intervalometer data", () => {
    const statusUpdate = {
      type: "status_update",
      timestamp: new Date().toISOString(),
      camera: {
        connected: true,
        ip: "192.168.4.2",
        model: "EOS R50",
      },
      discovery: {
        isDiscovering: true,
        cameras: 1,
      },
      power: {
        isRaspberryPi: true,
        battery: { capacity: 85 },
        thermal: { temperature: 45.2 },
        uptime: 3600,
      },
      network: {
        interfaces: {
          wlan0: { connected: true },
        },
      },
      intervalometer: {
        running: true,
        state: "running",
        stats: {
          startTime: "2024-01-01T20:00:00.000Z",
          shotsTaken: 5,
          shotsSuccessful: 5,
          shotsFailed: 0,
          currentShot: 6,
          nextShotTime: "2024-01-01T20:05:00.000Z",
          overtimeShots: 2,
          totalOvertimeSeconds: 3.5,
          maxOvertimeSeconds: 1.5,
          lastShotDuration: 3.2,
          totalShotDurationSeconds: 14.0,
        },
        options: {
          interval: 5,
          totalShots: 10,
          stopCondition: "shots",
        },
        averageShotDuration: 2.8,
      },
    };

    const errors = validateSchema(
      statusUpdate,
      MessageSchemas.serverMessages.status_update,
    );
    expect(errors).toEqual([]);
  });

  test("status_update without intervalometer is valid", () => {
    const statusUpdate = {
      type: "status_update",
      timestamp: new Date().toISOString(),
      camera: {
        connected: true,
        ip: "192.168.4.2",
      },
      discovery: {
        isDiscovering: true,
        cameras: 1,
      },
      power: {
        battery: { capacity: 85 },
        thermal: { temperature: 45.2 },
      },
      network: {
        interfaces: {},
      },
    };

    const errors = validateSchema(
      statusUpdate,
      MessageSchemas.serverMessages.status_update,
    );
    expect(errors).toEqual([]);
  });

  test("status_update with intervalometer includes all overtime stats", () => {
    const statusUpdate = {
      type: "status_update",
      timestamp: new Date().toISOString(),
      camera: { connected: true },
      discovery: { isDiscovering: true, cameras: 1 },
      power: {
        battery: { capacity: 85 },
        thermal: { temperature: 45.2 },
      },
      network: { interfaces: {} },
      intervalometer: {
        running: true,
        state: "running",
        stats: {
          startTime: "2024-01-01T20:00:00.000Z",
          shotsTaken: 10,
          shotsSuccessful: 9,
          shotsFailed: 1,
          currentShot: 11,
          nextShotTime: "2024-01-01T20:10:00.000Z",
          overtimeShots: 3,
          totalOvertimeSeconds: 45.7,
          maxOvertimeSeconds: 18.2,
          lastShotDuration: 48.3,
          totalShotDurationSeconds: 432.7,
        },
        options: {
          interval: 60,
          stopCondition: "unlimited",
        },
        averageShotDuration: 48.08,
      },
    };

    const errors = validateSchema(
      statusUpdate,
      MessageSchemas.serverMessages.status_update,
    );
    expect(errors).toEqual([]);

    // Verify overtime stats are present
    expect(statusUpdate.intervalometer.stats.overtimeShots).toBe(3);
    expect(statusUpdate.intervalometer.stats.totalOvertimeSeconds).toBe(45.7);
    expect(statusUpdate.intervalometer.stats.maxOvertimeSeconds).toBe(18.2);
    expect(statusUpdate.intervalometer.stats.lastShotDuration).toBe(48.3);
    expect(statusUpdate.intervalometer.stats.totalShotDurationSeconds).toBe(
      432.7,
    );
    expect(statusUpdate.intervalometer.averageShotDuration).toBe(48.08);
  });

  test("status_update with stop-after condition includes totalShots", () => {
    const statusUpdate = {
      type: "status_update",
      timestamp: new Date().toISOString(),
      camera: { connected: true },
      discovery: { isDiscovering: true, cameras: 1 },
      power: {
        battery: { capacity: 85 },
        thermal: { temperature: 45.2 },
      },
      network: { interfaces: {} },
      intervalometer: {
        running: true,
        state: "running",
        stats: {
          startTime: "2024-01-01T20:00:00.000Z",
          shotsTaken: 25,
          shotsSuccessful: 24,
          shotsFailed: 1,
          currentShot: 26,
          nextShotTime: "2024-01-01T20:12:30.000Z",
          overtimeShots: 0,
          totalOvertimeSeconds: 0,
          maxOvertimeSeconds: 0,
          lastShotDuration: 2.5,
          totalShotDurationSeconds: 60.0,
        },
        options: {
          interval: 30,
          totalShots: 100,
          stopCondition: "shots",
        },
        averageShotDuration: 2.5,
      },
    };

    const errors = validateSchema(
      statusUpdate,
      MessageSchemas.serverMessages.status_update,
    );
    expect(errors).toEqual([]);
    expect(statusUpdate.intervalometer.options.totalShots).toBe(100);
  });

  test("status_update with stop-at condition includes stopTime", () => {
    const statusUpdate = {
      type: "status_update",
      timestamp: new Date().toISOString(),
      camera: { connected: true },
      discovery: { isDiscovering: true, cameras: 1 },
      power: {
        battery: { capacity: 85 },
        thermal: { temperature: 45.2 },
      },
      network: { interfaces: {} },
      intervalometer: {
        running: true,
        state: "running",
        stats: {
          startTime: "2024-01-01T20:00:00.000Z",
          shotsTaken: 15,
          shotsSuccessful: 15,
          shotsFailed: 0,
          currentShot: 16,
          nextShotTime: "2024-01-01T20:15:00.000Z",
          overtimeShots: 0,
          totalOvertimeSeconds: 0,
          maxOvertimeSeconds: 0,
          lastShotDuration: 1.8,
          totalShotDurationSeconds: 27.0,
        },
        options: {
          interval: 60,
          stopTime: "23:30",
          stopCondition: "time",
        },
        averageShotDuration: 1.8,
      },
    };

    const errors = validateSchema(
      statusUpdate,
      MessageSchemas.serverMessages.status_update,
    );
    expect(errors).toEqual([]);
    expect(statusUpdate.intervalometer.options.stopTime).toBe("23:30");
  });

  test("status_update includes timesync field matching welcome message", () => {
    const statusUpdate = {
      type: "status_update",
      timestamp: new Date().toISOString(),
      camera: { connected: true, ip: "192.168.4.2" },
      discovery: { isDiscovering: true, cameras: 1 },
      power: {
        battery: { capacity: 85 },
        thermal: { temperature: 45.2 },
        uptime: 3600,
      },
      network: { interfaces: {} },
      timesync: {
        pi: {
          isSynchronized: true,
          reliability: "high",
          lastSyncTime: "2024-01-01T12:00:00.000Z",
        },
        camera: {
          isSynchronized: true,
          lastSyncTime: "2024-01-01T12:00:30.000Z",
        },
        piProxyState: {
          state: "ap0-device",
          valid: true,
          acquiredAt: "2024-01-01T12:00:00.000Z",
          ageSeconds: 45,
          clientIP: "192.168.4.2",
        },
        connectedClients: {
          ap0Count: 1,
          wlan0Count: 0,
        },
      },
    };

    const errors = validateSchema(
      statusUpdate,
      MessageSchemas.serverMessages.status_update,
    );
    expect(errors).toEqual([]);

    // Verify timesync structure matches welcome message
    expect(statusUpdate.timesync).toBeDefined();
    expect(statusUpdate.timesync.pi).toBeDefined();
    expect(statusUpdate.timesync.camera).toBeDefined();
    expect(statusUpdate.timesync.piProxyState).toBeDefined();
    expect(statusUpdate.timesync.connectedClients).toBeDefined();
  });

  test("status_update with no timesync service includes null timesync", () => {
    const statusUpdate = {
      type: "status_update",
      timestamp: new Date().toISOString(),
      camera: { connected: true },
      discovery: { isDiscovering: true, cameras: 1 },
      power: {
        battery: { capacity: 85 },
        thermal: { temperature: 45.2 },
      },
      network: { interfaces: {} },
      timesync: null,
    };

    const errors = validateSchema(
      statusUpdate,
      MessageSchemas.serverMessages.status_update,
    );
    expect(errors).toEqual([]);
  });
});

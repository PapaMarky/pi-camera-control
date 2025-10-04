# WebSocket Sequence Diagrams

This document provides detailed sequence diagrams for all major WebSocket-based operations in the Pi Camera Control system. These diagrams show the complete flow of messages between client, WebSocket handler, managers, and hardware components.

## Connection and Initial Setup

### Client Connection and Welcome Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant CM as Camera Manager
    participant NM as Network Manager
    participant PM as Power Manager
    participant DM as Discovery Manager

    C->>WS: WebSocket Connection

    Note over WS: Client connected
    WS->>CM: Get camera status
    CM-->>WS: Camera state

    WS->>NM: Get network status
    NM-->>WS: Network interfaces

    WS->>PM: Get power status
    PM-->>WS: Power state

    WS->>DM: Get discovery status
    DM-->>WS: Discovery state

    WS->>C: Welcome Message
    Note over C: {type: "welcome", camera: {...}, network: {...}, power: {...}}

    loop Every 10 seconds
        WS->>C: Status Update
        Note over C: {type: "status_update", ...}
    end
```

## Intervalometer Operations

### Start Intervalometer with Title (Complete Flow)

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant ISM as Intervalometer State Manager
    participant TS as Timelapse Session
    participant CM as Camera Manager
    participant CAM as Camera Hardware

    C->>WS: Start Intervalometer Request
    Note over C: {type: "start_intervalometer_with_title", data: {interval: 30, shots: 100, title: "Night Sky"}}

    WS->>ISM: handleStartIntervalometer(data)

    alt Has unsaved session
        ISM->>WS: Emit unsavedSessionFound
        WS->>C: Timelapse Event
        Note over C: {type: "timelapse_event", eventType: "unsavedSessionFound"}

        C->>WS: User decision (save/discard)
        WS->>ISM: Handle user choice
    end

    ISM->>TS: Create new session
    Note over TS: Session ID generated

    ISM->>CM: Validate camera connection
    CM-->>ISM: Camera status

    alt Camera not available
        ISM->>WS: Emit sessionError
        WS->>C: Error Response
        Note over C: {type: "error", data: {message: "Camera not available"}}
    else Camera available
        ISM->>TS: Start session
        TS->>ISM: Emit sessionStarted

        ISM->>WS: Forward sessionStarted event
        WS->>C: Timelapse Event
        Note over C: {type: "timelapse_event", eventType: "sessionStarted", data: {sessionId, title, interval}}

        WS->>C: Operation Result
        Note over C: {type: "operation_result", success: true}

        loop Every interval (30 seconds)
            TS->>CM: Take photo
            CM->>CAM: HTTP POST /ccapi/shooting/liveview/shutterbutton/manual

            alt Photo successful
                CAM-->>CM: 200 OK
                CM->>TS: Photo taken successfully
                TS->>ISM: Emit photo_taken
                ISM->>WS: Forward photo_taken event
                WS->>C: Event Notification
                Note over C: {type: "event", eventType: "photo_taken", data: {success: true, shotNumber: X}}
            else Photo failed
                CAM-->>CM: Error response
                CM->>TS: Photo failed
                TS->>ISM: Emit photo_taken (with error)
                ISM->>WS: Forward photo_taken event
                WS->>C: Event Notification
                Note over C: {type: "event", eventType: "photo_taken", data: {success: false, error: "..."}}
            end
        end

        alt Session completes naturally
            TS->>ISM: Emit sessionCompleted
            ISM->>WS: Forward sessionCompleted event
            WS->>C: Timelapse Event
            Note over C: {type: "timelapse_event", eventType: "sessionCompleted"}
        end
    end
```

### Stop Intervalometer Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant ISM as Intervalometer State Manager
    participant TS as Timelapse Session

    C->>WS: Stop Intervalometer Request
    Note over C: {type: "stop_intervalometer", data: {}}

    WS->>ISM: handleStopIntervalometer()

    alt Session is running
        ISM->>TS: Stop session
        TS->>ISM: Emit sessionStopped

        ISM->>WS: Forward sessionStopped event
        WS->>C: Timelapse Event
        Note over C: {type: "timelapse_event", eventType: "sessionStopped"}

        WS->>C: Operation Result
        Note over C: {type: "operation_result", success: true}
    else No active session
        WS->>C: Error Response
        Note over C: {type: "error", data: {message: "No active session"}}
    end
```

### Session Save/Discard Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant ISM as Intervalometer State Manager
    participant FS as File System

    C->>WS: Save Session Request
    Note over C: {type: "save_session_as_report", data: {sessionId: "...", title: "Updated Title"}}

    WS->>ISM: handleSaveSessionAsReport(sessionId, title)

    ISM->>FS: Write report file
    Note over FS: /reports/session-uuid.json

    FS-->>ISM: Write success

    ISM->>WS: Emit reportSaved
    WS->>C: Timelapse Event
    Note over C: {type: "timelapse_event", eventType: "reportSaved", data: {reportId, title}}

    WS->>C: Operation Result
    Note over C: {type: "operation_result", success: true}

    alt User chooses to discard instead
        C->>WS: Discard Session Request
        Note over C: {type: "discard_session", data: {sessionId: "..."}}

        WS->>ISM: handleDiscardSession(sessionId)
        ISM->>WS: Emit sessionDiscarded
        WS->>C: Timelapse Event
        Note over C: {type: "timelapse_event", eventType: "sessionDiscarded"}
    end
```

## Network Operations

### WiFi Connection Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant NSM as Network State Manager
    participant NSV as Network Service Manager
    participant NM as NetworkManager
    participant DM as Discovery Manager
    participant CM as Camera Manager

    C->>WS: Network Connect Request
    Note over C: {type: "network_connect", data: {ssid: "ExternalWiFi", password: "..."}}

    WS->>NSM: handleNetworkConnect(ssid, password)

    NSM->>WS: Emit wifiConnectionStarted
    WS->>C: Network Event
    Note over C: {type: "network_event", eventType: "wifi_connection_started", data: {ssid}}

    NSM->>NSV: connectToWiFi(ssid, password)
    NSV->>NM: nmcli dev wifi connect "ExternalWiFi" password "..."

    Note over NM: Attempting connection...

    alt Connection successful
        NM-->>NSV: Connection established
        NSV-->>NSM: Connection success

        NSM->>NSM: Verify connectivity (5 second delay)

        NSM->>WS: Emit wifi_connected
        WS->>C: Network Event
        Note over C: {type: "network_event", eventType: "wifi_connected", data: {ssid, ip, signal}}

        Note over DM,CM: Camera may change IP address
        DM->>CM: Detect camera IP change
        alt Camera IP changed
            CM->>WS: Emit cameraIPChanged
            WS->>C: Discovery Event
            Note over C: {type: "discovery_event", eventType: "cameraIPChanged", data: {oldIP, newIP}}
        end

    else Connection failed
        NM-->>NSV: Connection failed
        NSV-->>NSM: Connection error

        NSM->>WS: Emit wifiConnectionFailed
        WS->>C: Network Event
        Note over C: {type: "network_event", eventType: "wifi_connection_failed", data: {ssid, error}}
    end
```

### WiFi Scan Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant NSM as Network State Manager
    participant NSV as Network Service Manager
    participant NM as NetworkManager

    C->>WS: Network Scan Request
    Note over C: {type: "network_scan", data: {refresh: true}}

    WS->>NSM: handleNetworkScan(refresh)

    alt refresh=true
        NSM->>NSV: Force rescan
        NSV->>NM: nmcli dev wifi rescan
        Note over NM: Scanning for networks...
    end

    NSM->>NSV: Get available networks
    NSV->>NM: nmcli dev wifi list

    NM-->>NSV: Network list with signal strength
    NSV-->>NSM: Parsed network data

    NSM->>WS: Send scan results
    WS->>C: Operation Result
    Note over C: {type: "operation_result", success: true, data: {networks: [...]}}
```

## Camera Discovery and Connection

### UPnP Camera Discovery Flow

```mermaid
sequenceDiagram
    participant UPNP as UPnP Service
    participant DM as Discovery Manager
    participant CSM as Camera State Manager
    participant WS as WebSocket Handler
    participant C as Client
    participant CAM as Camera Hardware

    Note over UPNP: Periodic UPnP discovery
    UPNP->>DM: cameraDiscovered event
    Note over DM: Device info with IP, UUID, model

    DM->>CSM: registerCamera(deviceInfo)
    CSM->>CSM: Add to camera registry

    DM->>CAM: Test connection (HTTPS /ccapi)

    alt Camera responds
        CAM-->>DM: CCAPI endpoints available

        DM->>CSM: updateCameraStatus(uuid, connected: true)
        CSM->>DM: Emit cameraConnected

        DM->>WS: broadcastDiscoveryEvent('cameraDiscovered')
        WS->>C: Discovery Event
        Note over C: {type: "discovery_event", eventType: "cameraDiscovered", data: {uuid, modelName, ipAddress}}

        alt No primary camera set
            DM->>CSM: setPrimaryCamera(uuid)
            CSM->>DM: Emit primaryCameraChanged

            DM->>WS: broadcastDiscoveryEvent('primaryCameraChanged')
            WS->>C: Discovery Event
            Note over C: {type: "discovery_event", eventType: "primaryCameraChanged", data: {uuid}}
        end

    else Camera unreachable
        DM->>WS: broadcastDiscoveryEvent('cameraOffline')
        WS->>C: Discovery Event
        Note over C: {type: "discovery_event", eventType: "cameraOffline", data: {uuid}}
    end
```

### Manual Camera Connection Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant DM as Discovery Manager
    participant CSM as Camera State Manager
    participant CAM as Camera Hardware

    C->>WS: Manual Connection Request
    Note over C: {type: "connect_to_ip", data: {ip: "192.168.4.2", port: "443"}}

    WS->>DM: handleConnectToIP(ip, port)

    DM->>CAM: Test connection (HTTPS)
    Note over CAM: /ccapi endpoint test

    alt Connection successful
        CAM-->>DM: CCAPI available

        DM->>CSM: registerManualCamera(ip, port)
        CSM->>CSM: Create camera entry

        DM->>WS: broadcastDiscoveryEvent('cameraConnected')
        WS->>C: Discovery Event
        Note over C: {type: "discovery_event", eventType: "cameraConnected", data: {ip, port}}

        WS->>C: Operation Result
        Note over C: {type: "operation_result", success: true}

    else Connection failed
        WS->>C: Error Response
        Note over C: {type: "error", data: {message: "Failed to connect to camera at IP"}}
    end
```

### Camera IP Change Detection

```mermaid
sequenceDiagram
    participant DM as Discovery Manager
    participant CSM as Camera State Manager
    participant WS as WebSocket Handler
    participant C as Client
    participant CAM as Camera Hardware

    Note over DM: Periodic camera health check

    loop Every 10 seconds
        DM->>CAM: Health check (old IP)

        alt Camera unreachable at old IP
            CAM-->>DM: Connection timeout

            DM->>DM: Scan for camera on new networks

            DM->>CAM: Test new IP addresses

            alt Camera found at new IP
                CAM-->>DM: CCAPI responds at new IP

                DM->>CSM: updateCameraIP(uuid, newIP)
                CSM->>DM: Emit cameraIPChanged

                DM->>WS: broadcastDiscoveryEvent('cameraIPChanged')
                WS->>C: Discovery Event
                Note over C: {type: "discovery_event", eventType: "cameraIPChanged", data: {uuid, oldIP, newIP}}

                DM->>WS: broadcastDiscoveryEvent('primaryCameraReconnected')
                WS->>C: Discovery Event
                Note over C: {type: "discovery_event", eventType: "primaryCameraReconnected", data: {uuid, newIP}}

            else Camera not found
                DM->>CSM: markCameraOffline(uuid)

                DM->>WS: broadcastDiscoveryEvent('primaryCameraDisconnected')
                WS->>C: Discovery Event
                Note over C: {type: "discovery_event", eventType: "primaryCameraDisconnected", data: {uuid}}
            end
        end
    end
```

## Time Synchronization

### Client Time Synchronization Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant TSS as TimeSyncService
    participant SYS as System Time

    Note over WS: Client connects
    WS->>TSS: initializeTimeSync()

    TSS->>WS: Request client time
    WS->>C: Time Sync Request
    Note over C: {type: "time-sync-request", data: {requestId: "...", serverTime: 1640995200000}}

    C->>WS: Time Sync Response
    Note over C: {type: "time-sync-response", data: {clientTime: 1640995201500, serverTime: 1640995200000, requestId: "..."}}

    WS->>TSS: processTimeSyncResponse(data)

    TSS->>TSS: Calculate offset and reliability
    Note over TSS: offset = clientTime - serverTime<br/>reliability = "high" if offset < 2000ms

    alt Large time difference (> 5 seconds)
        TSS->>SYS: Update system time
        SYS-->>TSS: Time updated

        TSS->>WS: Emit pi-sync event
        WS->>C: Time Sync Event
        Note over C: {type: "event", eventType: "pi-sync", data: {synchronized: true, source: "client", offset: 1500, reliability: "high"}}

    else Small difference
        TSS->>WS: Emit pi-sync event (no change)
        WS->>C: Time Sync Event
        Note over C: {type: "event", eventType: "pi-sync", data: {synchronized: true, source: "client", offset: 1500, reliability: "high"}}
    end
```

### Camera Time Synchronization Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant TSS as TimeSyncService
    participant CM as Camera Manager
    participant CAM as Camera Hardware

    C->>WS: Manual Camera Sync Request
    Note over C: {type: "manual_camera_sync", data: {}}

    WS->>TSS: syncCameraTime()

    TSS->>CM: Get current camera time
    CM->>CAM: GET /ccapi/ver100/functions/datetime
    CAM-->>CM: Current camera time
    CM-->>TSS: Camera time response

    TSS->>TSS: Calculate time difference
    Note over TSS: Compare camera time vs system time

    alt Time difference > 2 seconds
        TSS->>CM: Set camera time
        CM->>CAM: POST /ccapi/ver100/functions/datetime
        Note over CAM: {datetime: "2024-01-01T12:00:00"}

        alt Camera accepts time change
            CAM-->>CM: 200 OK
            CM-->>TSS: Time sync successful

            TSS->>WS: Emit camera-sync event
            WS->>C: Time Sync Event
            Note over C: {type: "event", eventType: "camera-sync", data: {success: true, previousTime: "...", newTime: "...", offset: 2500}}

        else Camera rejects time change
            CAM-->>CM: Error response
            CM-->>TSS: Time sync failed

            TSS->>WS: Emit sync-failed event
            WS->>C: Time Sync Event
            Note over C: {type: "event", eventType: "sync-failed", data: {component: "camera", error: "Camera rejected time change"}}
        end

    else Time difference acceptable
        TSS->>WS: Emit camera-sync event (no change needed)
        WS->>C: Time Sync Event
        Note over C: {type: "event", eventType: "camera-sync", data: {success: true, previousTime: "...", newTime: "...", offset: 500}}
    end
```

### GPS Time Synchronization Flow

```mermaid
sequenceDiagram
    participant C as Client (Mobile)
    participant WS as WebSocket Handler
    participant TSS as TimeSyncService
    participant SYS as System Time

    Note over C: Client has GPS access
    C->>WS: GPS Time Data
    Note over C: {type: "gps-response", data: {timestamp: 1640995200000, accuracy: "high", source: "gps"}}

    WS->>TSS: processGPSTime(data)

    TSS->>TSS: Validate GPS time quality
    Note over TSS: Check accuracy, staleness

    alt GPS time is high quality
        TSS->>TSS: Calculate system time offset

        alt Significant offset (> 5 seconds)
            TSS->>SYS: Update system time to GPS time
            SYS-->>TSS: System time updated

            TSS->>WS: Emit pi-sync event
            WS->>C: Time Sync Event
            Note over C: {type: "event", eventType: "pi-sync", data: {synchronized: true, source: "gps", offset: 5500, reliability: "high"}}

        else Small offset
            TSS->>WS: Emit pi-sync event (no change)
            WS->>C: Time Sync Event
            Note over C: {type: "event", eventType: "pi-sync", data: {synchronized: true, source: "gps", offset: 1200, reliability: "high"}}
        end

    else GPS time poor quality
        TSS->>WS: Emit reliability-lost event
        WS->>C: Time Sync Event
        Note over C: {type: "event", eventType: "reliability-lost", data: {source: "gps", reason: "Poor GPS accuracy"}}
    end
```

## Error Handling and Recovery

### Connection Error Recovery Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant DM as Discovery Manager
    participant CM as Camera Manager

    Note over WS: Periodic status check
    WS->>CM: Get camera status

    alt Camera connection lost
        CM-->>WS: Camera disconnected

        WS->>C: Status Update
        Note over C: {type: "status_update", camera: {connected: false}}

        WS->>DM: Trigger reconnection attempt

        loop Retry with exponential backoff
            DM->>CM: Attempt reconnection

            alt Reconnection successful
                CM-->>DM: Camera reconnected

                DM->>WS: broadcastDiscoveryEvent('primaryCameraReconnected')
                WS->>C: Discovery Event
                Note over C: {type: "discovery_event", eventType: "primaryCameraReconnected"}
                break

            else Reconnection failed
                Note over DM: Wait backoff period (5s, 10s, 20s, ...)
            end
        end
    end
```

### WebSocket Error Handling Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant LOG as Logger

    C->>WS: Invalid Message
    Note over C: {type: "invalid_type", malformed_data}

    WS->>WS: Message validation fails

    WS->>LOG: Log error
    Note over LOG: Structured error logging

    WS->>C: Error Response
    Note over C: {type: "error", timestamp: "...", data: {message: "Invalid message format"}}

    alt Client sends too many invalid messages
        WS->>WS: Rate limit triggered
        WS->>C: Connection closed
        Note over C: WebSocket connection terminated
    end
```

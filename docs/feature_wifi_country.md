# WiFi Country Management Feature

## Overview

The WiFi Country Management feature allows users to change the regulatory domain settings when traveling internationally with the pi-camera-controller. This ensures compliance with local WiFi regulations and optimizes power/channel usage.

## ✅ Implementation Status: COMPLETED

### Frontend Implementation
- ✅ **Country Display**: Shows current WiFi country in Network Settings
- ✅ **Country Selection UI**: Modal with searchable country list
- ✅ **Popular Countries**: US and JP highlighted for quick access
- ✅ **Real-time Updates**: WebSocket integration for status updates
- ✅ **User Confirmation**: Warning dialog explaining regulatory impact

### Backend Implementation
- ✅ **API Endpoints**: Complete REST API for country management
- ✅ **Multiple Methods**: Uses `iw`, `raspi-config`, and `wpa_supplicant.conf`
- ✅ **NetworkManager Integration**: Automatic service restart
- ✅ **Input Validation**: Comprehensive validation and error handling
- ✅ **WebSocket Broadcasting**: Real-time status updates

### System Integration
- ✅ **Setup Scripts**: Updated with wireless tools requirements
- ✅ **Service Dependencies**: `iw`, `wireless-tools`, `rfkill` packages
- ✅ **Documentation**: Complete API and usage documentation

## User Interface

### Network Settings Display
- **Current Country**: Shows code and name (e.g., "US - United States")
- **Regulatory Domain**: Shows 2-letter country code
- **Change Country Button**: Opens country selection modal

### Country Selection Modal
- **Popular Countries**: US and JP displayed prominently
- **Full Country List**: All supported ISO 3166-1 alpha-2 codes
- **Search/Filter**: Easy country selection
- **Regulatory Warning**: Clear explanation of implications

## API Endpoints

### Get Current Country
```bash
GET /api/network/wifi/country
# Response: {"country": "US"}
```

### Set WiFi Country
```bash
POST /api/network/wifi/country
Content-Type: application/json
{"country": "JP"}
# Response: {"success": true, "country": "JP", "message": "WiFi country changed to JP"}
```

### Get Available Countries
```bash
GET /api/network/wifi/countries
# Response: {"countries": [{"code": "US", "name": "United States"}, ...]}
```

## Technical Implementation

### Country Setting Process
1. **Immediate Effect**: `iw reg set` for instant regulatory change
2. **Persistent Config**: `raspi-config` for boot persistence
3. **Legacy Support**: Updates `wpa_supplicant.conf`
4. **Service Restart**: NetworkManager restart to apply settings
5. **Verification**: Confirms change was applied successfully

### Regulatory Differences

**US vs Japan Key Differences:**
- **Power Limits**: US allows 30 dBm, Japan limits to 10 dBm (100x difference)
- **Channels**: Japan allows channel 14 (illegal in US)
- **Range Impact**: Significant reduction in WiFi range when using Japan settings

### Validation & Error Handling
- **Format Validation**: Ensures 2-letter ISO country codes
- **Supported Countries**: Validates against built-in country list
- **System Errors**: Graceful handling of command failures
- **User Feedback**: Clear error messages and success confirmation

## Usage Examples

### For International Travel
1. **Before Travel**: Check current country setting
2. **At Destination**: Open Network Settings → Change Country
3. **Select Country**: Choose destination country (e.g., JP for Japan)
4. **Confirm Change**: Accept regulatory compliance warning
5. **Automatic Apply**: System restarts network services

### API Testing
```bash
# Check current setting
curl http://picontrol-002.local:3000/api/network/wifi/country

# Change to Japan for travel
curl -X POST http://picontrol-002.local:3000/api/network/wifi/country \
  -H "Content-Type: application/json" \
  -d '{"country": "JP"}'

# Verify change
curl http://picontrol-002.local:3000/api/network/wifi/country
```

## Compliance & Legal Notes

⚠️ **Important**: Users are responsible for ensuring compliance with local regulations. This feature assists with technical compliance but does not constitute legal advice.

- **US Operation**: Full power allowed, channels 1-11 standard
- **Japan Operation**: Reduced power, additional channel 14 available
- **Other Countries**: Varies by jurisdiction, consult local regulations
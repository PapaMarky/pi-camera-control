# Canon EOS R50 WiFi Compatibility Notes

## Error 64 "Cannot connect to wireless lan terminal"

The Canon EOS R50 can be particular about access point configurations. Known working settings:

### hostapd.conf optimizations for EOS R50:
```
# Basic settings
interface=ap0
driver=nl80211
ssid=PiCameraController002
hw_mode=g
channel=6              # Use channel 6 (most compatible)
ieee80211n=1           # Enable 802.11n
ht_capab=[SHORT-GI-20] # Short guard interval for better compatibility

# Security (must be WPA2-PSK for Canon cameras)
wpa=2
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP CCMP
rsn_pairwise=CCMP

# Canon-specific optimizations
wmm_enabled=1           # Enable WMM for Canon cameras
max_num_sta=5           # Limit connections for stability
beacon_int=100          # Standard beacon interval
dtim_period=2           # Data delivery interval
```

### Troubleshooting steps:
1. Power cycle camera completely (remove battery 30 seconds)
2. Use channel 6 or 11 (avoid 1-5 which can have interference)
3. Ensure WPA2-PSK only (not WPA3 or mixed mode)
4. Enable WMM (Canon cameras expect this)
5. Check for firmware updates on camera

### Error patterns:
- Err 64: Usually network configuration incompatibility
- Connection + immediate disconnect: Missing DHCP server
- SSID not found: Channel interference or power issues
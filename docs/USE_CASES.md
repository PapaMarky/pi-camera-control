# Use Cases For Pi-Camera-Controller

## Physical Environment

* Raspberry Pi Zero 2W
  * Power bank connected to Pi via USB
* Canon EOS R50 Camera
  * Power bank connected to Pi via USB

* The Camera connects to the Raspberry Pi's access point
* The Raspberry Pi discovers the Camera using UPnP
* The Raspberry Pi controls the Camera via the Camera's on-board rest api server (ccapi)

## Use Cases

### Use While Travelling
The user will use the pi-camera-controller when travelling.

When arriving at a new location, the user will need to "localize" the system by synching the following from client 
to server:

| Setting | Pi usage                                                | Camera usage                         |
|---|---------------------------------------------------------|--------------------------------------|
| time, date, TZ | logging messages, start-at, etc should be in local time | Set camera's clock for EXIF metadata |
| location | Not needed (cache to detect change?)                    | (camera, but cached on pi)           |

When travelling internationally, the user may need to change the WiFi Country Setting.

**Best User Experience**: 

When the client connects to the server, automatically compare client time to server time.

We should automatically update the server time and TZ or prompt the user. Note that in linux, ntp updates the time without prompting. Maybe make a settable boolean configuration option that the user can select?

**FUTURE**: Implement a "User Settings" feature. Add a setting for "Auto sync from device"

**GAPS**:
* We do not synchronize location
* We do not set camera time or gps from pi-camera-controller.
* We do not manage "User Settings" on the pi-camera-controller.
* The UI does not have a way to set the WiFi country. 
  * NOTE: I need to understand differences between Japan and US settings in order to priorize this work.
  * If one is a subset of the other, I might be able to simply use one legally in both countries.
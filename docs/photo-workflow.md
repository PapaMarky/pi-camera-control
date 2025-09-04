# Photography Workflow

Simply stated, the workflow for photography is _set up camera_ -> _take pictures_.

The _set up camera_ stage could be further broken down to
* Modify setttings
* Take picture
* View results
* repeat until satisfied

# Controller Interface Screen Layout
## Header Area
The header area should be as small as possible to preserve screen real estate. In mobile landscape the 
header should move to the right side of the screen instead of the top.

### Status indicators
#### Controller Status Indicator 
* Greyed out if the controller is not connected. (should it have an X when not connected?)
* Red, yellow or green to indicate the status of the controller. (P1: Only Green)
  * (color selection criteria TBD: Disk space, temperature, ??? )
#### Camera Status Indicator
If the controller is not connected, the camera status indicators are hidden.
  * Camera Icon: indicates camera is connected
If the camera is not connected, other indicators are hidden
  * Camera Battery Icon: Battery status
  * Camera Storage Icon: Remaining space on SD card
  * Stopwatch Icon: indicates Intervalometer / Timelapse is running. Might use color to indicate errors.

### Function Menu
* menu pulldown (far right)
  * Controller Status
  * Camera Set Up (Grey out if camera not connected)
  * Test Shot (Grey out if camera not connected)
  * Timelapse (Grey out if camera not connected)
  * Red Light (Grey out if camera not connected)

## Function Area
When connection to camera or controller is lost, The function area reverts
to the Controller Status. If the controller is not connected

### Controller Status
* Camera Status
  * Battery detail
  * Card space detail
  * ???
* Controller connection and info
  * Temp
  * Mode (wifi, access point)
* Activity Log (?)
* button to open controller settings (settings menu?)

### Controller Settings
* Connect / Disconnect WiFi
* Access Point Settings
* WiFi Settings

### Test Shot
* See preview
* Take picture
* View / Download Image
* Delete image from camera?

### Camera Settings
This section needs more thinking. The camera settings are very complicated.
* Logical Sections - TBD
  * individual settings within sections
* Save / Load / Delete camera configurations configuration

### Run Timelapse
The Intervalometer will actually be two cards, but only one will show at a time
* Intervalometer: Setup
* Intervalometer: Progress
When Intervalometer finishes, it should stay on the progress card showing final results with a "dismiss" button

### Red Light
* mobile only (?)
* A screen that is all red. Use as a night vision saving flashlight.
* Slider for adjusting brightness
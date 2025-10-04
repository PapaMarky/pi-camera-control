# Photography Workflow

Simply stated, the workflow for photography is _setup controller_ -> _set up camera_ -> _take pictures_.

The _set up camera_ stage could be further broken down to

## Set up the PiController

### Start Up

In the field the Pi Controller will be headless and I might not have a laptop
that I can use to ssh in and set things up.

There _must_ be service that starts up the server so that it is ready for
connections from the client or the camera.

### Network

In the field, there will be no WiFi router to connect to. Everything depends
on the Pi Controller to provide WiFi.

Hopefully the access point feature of the Pi will be fully set up and operational
before leave for the field, but in case there are problems, The Access Point
setup UI on the server / client must be robust and fully functional.

In an emergency, rebooting the Pi can be accomplished by disconnecting from
battery, but it would be preferable to have a "Restart" button on the access
point setup screen that would restart the networking services required to
for the access point to function.

## Set Up Camera

### Set Up the Shot

For Phase 1 this will be done manually using the controls on the camera.

In the future I hope to automate more of this process using the ccapi.

### Connect to WiFi

The camera can be preloaded with the details of multiple networks.

#### Configure WiFi Connection

This can be done before going into the field and the camera will store the
configuration for later use. The following information is needed for setting up
a WiFi connection on the camera, and the Pi Camera Controller client must make
the information available.

- SSID
- password
  - The password should not be visible on client, but there should be an indication that a password is or is not required.

#### Connect to WiFi

This is done from the camera's _menu_.

## Take Pictures

### Single Shot

Nice to have, but not essential for field work.

### Timelapse

This feature is essential for field work.

#### Set Up

The

#### Monitoring

A timelapse could take hours to finish. During This time, the client (iPhone)
could be closed or even powered off to save battery life.

It is essential that when the client connects with the server that the client
connects to the server the client's user interface reflects the current state
of the Pi Controller.

- If a timelapse is running on the server and all clients disconnect,
  the server should continue running the timelapse.
- When clients connect to the server, they would correctly reflect whether or
  not a timeplapse is running on the server.
  - If no timelapse is running, the client's Intervalometer screen should
    display the set up panel and all controls should be fully functional.
  - If a timelapse is running, the client's Intervalometer screen should
    display the monitoring panel and all controls should be fully functional.

#### Future

- **Savable Configurations**:
  - The setup panel should include a `[SAVE]` button that allows the user to
    name and save the current configuration on the server.
  - The setup panel should include a `[LOAD]` button that allows the user to
    select and load a named configuration.
  - There will need to be a way to delete saved configurations.
  - We might want to limit the number of saved configurations.
  - Configuration files on the pi should persist across server version
    upgrades.

# Controller Interface Screen Layout

## Header Area

The header area should be as small as possible to preserve screen real estate. In mobile landscape the
header should move to the right side of the screen instead of the top.

### Status indicators

#### Controller Status Indicator

- Greyed out if the controller is not connected. (should it have an X when not connected?)
- Red, yellow or green to indicate the status of the controller. (P1: Only Green)
  - (color selection criteria TBD: Disk space, temperature, ??? )

#### Camera Status Indicator

If the controller is not connected, the camera status indicators are hidden.

- Camera Icon: indicates camera is connected
  If the camera is not connected, other indicators are hidden
- Camera Battery Icon: Battery status
- Camera Storage Icon: Remaining space on SD card
- Stopwatch Icon: indicates Intervalometer / Timelapse is running. Might use color to indicate errors.

### Function Menu

- menu pulldown (far right)
  - Controller Status
  - Camera Set Up (Grey out if camera not connected)
  - Test Shot (Grey out if camera not connected)
  - Timelapse (Grey out if camera not connected)
  - Red Light (Grey out if camera not connected)

## Function Area

When connection to camera or controller is lost, The function area reverts
to the Controller Status. If the controller is not connected

### Controller Status

- Camera Status
  - Battery detail
  - Card space detail
  - ???
- Controller connection and info
  - Temp
  - Mode (wifi, access point)
- Activity Log (?)
- button to open controller settings (settings menu?)

### Controller Settings

- Connect / Disconnect WiFi
- Access Point Settings
- WiFi Settings

### Test Shot

- See preview
- Take picture
- View / Download Image
- Delete image from camera?

### Camera Settings

This section needs more thinking. The camera settings are very complicated.

- Logical Sections - TBD
  - individual settings within sections
- Save / Load / Delete camera configurations configuration

### Run Timelapse

The Intervalometer will actually be two cards, but only one will show at a time

- Intervalometer: Setup
- Intervalometer: Progress
  When Intervalometer finishes, it should stay on the progress card showing final results with a "dismiss" button

### Red Light

- mobile only (?)
- A screen that is all red. Use as a night vision saving flashlight.
- Slider for adjusting brightness

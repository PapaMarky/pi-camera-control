# Feature: Test Shot

## Use Case

As a timelapse photographer, while preparing to start a timelapse, I want to be able to adjust the settings on the
camera and see how the changes in setting affect the images.

## Workflow

- User opens the Camera Settings page.
- pi-camera-controller (PCC) displays current camera settings in a form that can be edited
  - The settings can be adjusted will depend on the mode of the camera. While in "Camera Settings", PCC should use the
    "event polling" feature of the camera to detect changes to the mode of the camera. **Further research required**
  - The Camera Settings page should have a "Test Shot" button that grabs a live view image from the camera.
  - When the user changes the settings, PCC updates the settings on the camera.
    - **Further research required** If the ccapi is responsive enough we should apply changes immediately. Otherwise we should have an "unsaved changes" indicator and a "save" button.
    - **Further research required** If getting a live image is fast enough, we may want to have a live image on the settings page and update it with every settings change for instant feedback to the user.
- User adjusts camera settings and then presses "Test Shot" button.
  - PCC downloads "live view" image from camera
  - When image is downloaded successfully, PCC transits to "Live View Image" page which displays the image and the settings
    used to generate the image as static text.
    - It should be possible to view the image in "fullscreen" mode to see details.
    - It should be possible to download a "live view" image to the users device.
    - It should be possible to easily move back and forth between "fullscreen image" and "image with settings" views.
    - It should be possible to have multiple live view images and quickly navigate back and forth between them so that
      the user can compare images taken with different settings.
    - From any live view image in a series the user should be able to delete the image from the series
    - From any live view image in a series the user should be able to navigate back to the Camera Settings to adjust
      settings and create another image.
    - There should be an easy way for the user to clear all live view images from PCC
    - The user should be able to navigate directly to the live view image set using the menu.
- Once the user is satisfied with the settings, the user will want to actually take a photo to get an actual image
  because live views do not use the full capablities of the camera. (ex for night images an actual photo will keep the shutter open for as much as 30 seccond. Live view estimates the final image digitally.)
  - The Camera Settings page should include a "take photo" button that takes a full photo using current settings and then transitions to the "View Photo" page for that photo.
    - PCC should support "Photos" as a list, similar to the treatment of the "Live Views"
      - For the test Photo, the size / quality settings should be temporarily overridden to create the smallest file size.
        - Save the current size / quality settings
        - set the lowest size / quality settings on the camera
        - take the photo
        - restore the previous size /quality settings on the camera.
      - Photos should be taken using the sequence documented in [6.2.27. Event handling > Add contents](../CameraControlAPI_Reference_v140/6.2.%20CCAPI%20Sequences.md#add-contents)
        - NOTE: We should use this opportunity to experiment with using this sequence for timelapse photos because it gives us better feedback about 1) how long the photos actually take and 2) the name of the created image file.
          - It would be valuable to include names of first and last images in a timelapse photo set.
          - It would be valuable for the PCC to know that we are waiting for a photo to complete for orchestrating other operations
          - It would be valuable for the PPC to know how long photos are actually taking (ie shutter speed) to report to user
            - Someday we might consider adjusting settings (ex ISO) if photo time is approaching timelapse interval to prevent loss of frames. NOT FOR CONSIDERATION DURING CURRENT DEVELOPMENT.
      - After taking the photo, the PCC should download the image using the path in the `addedcontents` field of the response
      - Settings information for the photo should be extracted from the metadate in the downloaded image file.
      - Note: image file names from the camera should not be considered unique. When storing on the Pi they should include a date and time prefix:
        - YYYYMMDD*HHMMSS*<imagefile name> where the timestamp comes from the metadata in the image file indicating when the photo was taken. If the metadata does not include a timestamp, use the download time with a "dl" appended.

### Settings

NOTE: The settings that can be adjusted will depend on the mode of the camera.

NOTE: There is a ccapi that will retrieve all possible settings, their current values and their legal values (which are called "ability" or "ability values" in the document and the json response)

There are many settings on the camera and displaying them must be done in a way that does not overwhelm the user.

To accomplish this, the Settings page should show the most common settings at the top, and less
common settings should be in grouped by function further down. Individual functional groups (including "common setting")
should have the ability to be hidden so that the user can control screen clutter by hiding and displaying groups.

**Requires more research**:

- List common settings
- determine functional groupings
- determine which settings apply to which camera modes.
- Experiment:
  - Set camera to mode "M"
  - query complete list of settings
  - Set camera to mode "Av"
  - query complete list of settings
  - see if the list of settings changes based on mode, if it does repeat for all modes and create a json file with settings by mode.
- What is the best way to indicate settings controlled by the camera: grey out or hidden or something else.

**Common Settings**

These are the settings I work with the most. Depending on the camera mode, sometimes these are set by the
user but sometimes they are managed automatically by the camera.

- ISO
- Shutter Speed
- color temperature (`shooting/settings/colortemperature`)
- LIST NOT COMPLETE

## References:

### Settings

Get all settings along with legal values (called "ability" in the response json)

[4.9.1. Get all shooting parameters](../CameraControlAPI_Reference_v140/4.9.%20Shooting%20Settings%20A.md#491-get-all-shooting-parameters)

### Live View

**Sequences**

Note: I do not understand the difference between "flip" and "scroll" so we may need to do experiments to determine
which is better for this feature

- [6.2.20. Get Live View image (flip)](../CameraControlAPI_Reference_v140/6.2.%20CCAPI%20Sequences.md#6220-get-live-view-image-flip)
- [6.2.21. Get Live View image (scroll)](../CameraControlAPI_Reference_v140/6.2.%20CCAPI%20Sequences.md#6221-get-live-view-image-scroll)

### Photos

**Sequences**

- [6.2.27. Event handling > Add contents](../CameraControlAPI_Reference_v140/6.2.%20CCAPI%20Sequences.md#add-contents)

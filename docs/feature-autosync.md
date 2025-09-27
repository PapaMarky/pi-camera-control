# Feature: Automatic Time Synchronization

We currently have a feature that allows the user to manually sync the datetime of the client device
to the Raspberry Pi. 

* We should automate the syncing process so that it does not require manual intervention from the user. 
* We should extend the syncing process so that it also synchronizes the camera's time from the Pi
* We should further extend the syncing process so that it synchronizes GPS from the client device -> Pi.
  * There is no way to set the camera's location via CCAPI. The best we can do is get the GPS data from the client when we start a timelapse, and add that to the timelapse report.
* We do not need a complicated system that guarantees that the components are
  synchronize. If there is a failure, the failure should be logged, added to the activity log and optionally displayed to the user.

## Design

### Time Synchronization
* **Client Device -> Pi**
* Only sync automatically to devices that are connected to the access point (`ap0`). Devices connecting via wlan0 can do manual time sync, but not automatic.
* When a new client connection is made to the pi:
  * The server should automatically compare the time on the pi to the time on the client device. 
  * If the pi's time varies by more than 1 seconds, the server should set the time of the Pi to the time of the client.
  * If getting the client's current time or the pi's current time fails, a warning should be displayed to the user.
  * After setting the Pi's time from a client device, the Pi's time should be considered reliable for 30 minutes.
  * After setting the Pi's time from a client device, if a camera is connected it should also be synchronized.
  * The Pi's time should be considered unreliable unless the pi has synced with a client device within the last 30 minutes


* **Pi -> Camera**
* When a camera is discovered and connected, we should get the camera's time and compare to the pi's
  * We should only set the Camera from the Pi when the pi's time is considered reliable.
  * If the camera time varies by more than 1 second, the server should set the time of the camera from the time of the pi
  * If this fails, any connected clients should display a warning.
  * The clock in the camera is probably very reliable. The purpose of setting the camera's clock to keep the clock on correct localtime when travelling. Client devices will automatically update their time. The Pi and the Camera need to be adjusted.


* **Start of timelapse**
* When the timelapse setup page (intervalometer page) is opened and the client is connected via the access point, the server should first sync time with the client and then with the camera.
* After syncing the time the server should try to get location information from the client.
  * If available, the location information should be added to the timelapse report.


* **Time Synchronization Utility**
* The manual time synchronization utility should sync the camera's time from the pi after syncing the pi's time 
  from the clients.
  * Should we disable camera timesync during timelapses? We should design and perform experiments to determine feasibility.


* **Hourly Synchronization**
* Once per hour, if there is a client connected via ap0, the server should check the Pi's time and update it
  if it is more than 1 second off. 
  * If no client is available the server should start checking every minute until one is available and then go back to
    hourly checks.
  * After waiting an hour if no client is available, a message should be logged to activity log. Once a client becomes 
    available, a second message should be logged.

* **Determine Intervals by Experimentation**
* For values such as how long the Pi's time should be considered reliable after synchronization we should design and perform experiments
* experiments should create logs that can be used for analysis and to determine appropriate intervals.
  * **Pi Time Reliability**
    * We should write a simple program that runs on a MacBook.
    * The program should start by setting the pi's time (TBD: Write a simple server for the Pi side? Use ssh commands?)
    * After setting the Pi's time the program should periodically 
  * **Camera Time Reliability**
    * We should write a simple program that runs on a MacBook.
    * The program should start by connecting to the camera via ccapi. 
    * Once connected, the camera should check the camera's time and compare to the laptop's time.
    * If the times vary be more than one second, the program should set the camera's time
    * Periodically the program should check the camera's time. If it varies by more than a second, the camera's time should be set.

## References

[4.5.5. Date and time](<../CameraControlAPI_Reference_v140/4.5. Camera Settings A.md#455-date-and-time>)
* CCAPI documentation for getting and setting the camera's date and time.

[6.2.3. Get/change date and time settings](<../CameraControlAPI_Reference_v140/6.2. CCAPI Sequences.md#623-getchange-date-and-time-settings>)
* Sequence documentation for getting and setting the camera's date and time.

## Claude Prompt

I want to make things easy for users of pi-camera-controller. We already have a feature that manually sets the time on
the pi from the time of a client device. However, this still requires the user to remember to manually synchronize the 
time. We should automate this process.

Read the document `doc/feature-autosync.md`. It outlines how I want to implement automatic time synchronization between the
client device, the Pi and the camera. Of the three, the client device should be considered the most reliable time source
and the Pi should be considered least reliable. 

Based on this document, come up with a plan for 
1. Experiments to determine rate of clock drift, especially for the Pi.
2. Modifications to the existing pi-camera-controller architecture to incorporate automatic syncronization.

IMPORTANT: Pi-camera-controller is a tool for hobbiests, not a mission critical application. We do not need an overengineered solution. 
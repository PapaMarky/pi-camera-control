
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='*.log' --exclude='.DS_Store' .  pi@picontrol-002.local:/home/pi/pi-camera-control/

iw reg set JP

# Boot a bricked Pi
For Raspberry Pi, you can add these parameters to /boot/cmdline.txt to boot in safe mode or recovery mode:

Safe mode options:
- init=/bin/bash - Boot to a basic shell
- single - Boot to single-user mode
- 3 - Boot to runlevel 3 (text mode, no GUI)

For your specific situation (WiFi issue):
- systemd.mask=hostapd.service - Prevent hostapd from starting
- systemd.mask=NetworkManager.service - Prevent NetworkManager from starting
- net.ifnames=0 - Use old-style interface names

Most common safe boot:
Add init=/bin/bash to the end of the existing line in /boot/cmdline.txt

This will boot you to a root shell where you can fix the WiFi configuration before normal services start.


console=serial0,115200 console=tty1 root=PARTUUID=6152dc80-02 rootfstype=ext4 fsck.repair=yes rootwait ipv6.disable\
=1 cfg80211.ieee80211_regdom=JP

Wi-Fi is currently blocked by rfkill.
Use raspi-config to set the country before ues.
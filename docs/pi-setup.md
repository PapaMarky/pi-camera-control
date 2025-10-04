# Set Up a Raspberry Pi To Use With PiCameraControl

## Flash SD card

## Setup Interfaces

- `sudo raspi-config`
  - Set up WiFi - Even if I set this up when I flash the SD card, I have to do this again to enable `wlan0`
  - Enable ssh
- Set up ssh without password
  - Create key if you don't have one.
    - `ssh-keygen -t rsa -b 4096`
  - Copy key to pi
    - `ssh-copy-id pi@picontrol-002.local`
  - On Mac: Modify `~/.ssh/config`
    - Add line: `Host`

## Update Packages

```commandline
sudo apt update -y
sudo apt full-upgrade -y
```

### Required Packages

```commandline
sudo apt install screen avahi-utils npm hostapd dnsmasq -y
npm install
```

### System Setup

For complete Pi Camera Control setup (Access Point, services, dependencies):

```commandline
# Run the consolidated system setup script
cd setup/
sudo ./configure-system.sh
```

This single script handles all setup requirements:

- Installs required packages (hostapd, dnsmasq, nodejs, etc.)
- Configures access point and networking
- Sets up systemd services
- Installs Node.js dependencies

## Deploy / Setup PiCameraControl

`rsync -avz --exclude node_modules --exclude .git --exclude logs . pi@picontrol-002.local:~/pi-camera-control/`

## Start Server

### Devel

```commandline
screen -S PiCameraControl
cd pi-camera-control
npm run dev
```

### Prod

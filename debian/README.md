# Debian Package Files

This directory contains the Debian packaging configuration for Pi Camera Control.

## Package Building

### Prerequisites
```bash
# Install required tools
sudo apt install build-essential debhelper dh-make devscripts

# For building on non-Debian systems (like macOS):
# Use docker or a Debian/Ubuntu VM
```

### Building the Package
```bash
# From the project root directory:
debuild -us -uc

# Or with signed package:
debuild -sa
```

### Installing the Package
```bash
# Install locally built package:
sudo dpkg -i ../pi-camera-control_1.0.0-1_all.deb

# Fix any dependency issues:
sudo apt-get install -f
```

## Package Files

### Core Package Files
- **`control`** - Package metadata, dependencies, description
- **`changelog`** - Version history and changes
- **`copyright`** - License and copyright information
- **`compat`** - Debhelper compatibility level
- **`rules`** - Build instructions (Makefile)

### Installation Files
- **`pi-camera-control.install`** - Maps source files to installation paths
- **`postinst`** - Post-installation configuration script
- **`prerm`** - Pre-removal cleanup script

### Source Configuration
- **`source/format`** - Source package format specification

## Installation Process

When the package is installed via `apt install` or `dpkg -i`, the following happens:

1. **Files are copied** according to `pi-camera-control.install`
2. **Dependencies are resolved** automatically by APT
3. **`postinst` script runs** to configure the system:
   - Creates pi-camera-control user
   - Configures hostapd and dnsmasq
   - Sets up network interfaces
   - Disables IPv6 system-wide
   - Enables systemd services
   - Installs Node.js dependencies

## Removal Process

When the package is removed via `apt remove`, the following happens:

1. **`prerm` script runs** to clean up:
   - Stops pi-camera-control service
   - Stops network services
   - Removes ap0 interface
   - Provides information about backup files
2. **Files are removed** (except configuration files)
3. **User and service remain** (use `apt purge` to remove completely)

## Package Information

- **Package Name**: pi-camera-control
- **Version**: 1.0.0-1
- **Architecture**: all (platform independent)
- **Section**: electronics
- **Priority**: optional

## Distribution

The built package can be:
- **Installed locally** with `dpkg -i`
- **Added to APT repository** for easy distribution
- **Distributed as `.deb` file** for direct installation
- **Published to Debian/Ubuntu repositories** (requires approval process)
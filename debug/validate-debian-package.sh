#!/bin/bash
# Validate Debian package structure and files

set -e

echo "=== Pi Camera Control - Debian Package Validation ==="
echo

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_ok() {
    echo -e "${GREEN}✓${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check required files exist
echo "Checking required Debian package files..."

required_files=(
    "debian/control"
    "debian/changelog" 
    "debian/copyright"
    "debian/compat"
    "debian/rules"
    "debian/pi-camera-control.install"
    "debian/postinst"
    "debian/prerm"
    "debian/source/format"
)

all_files_exist=true
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        check_ok "Found $file"
    else
        check_error "Missing $file"
        all_files_exist=false
    fi
done

echo

# Check file permissions
echo "Checking file permissions..."
if [ -x "debian/rules" ]; then
    check_ok "debian/rules is executable"
else
    check_error "debian/rules is not executable"
fi

if [ -x "debian/postinst" ]; then
    check_ok "debian/postinst is executable"
else
    check_error "debian/postinst is not executable"  
fi

if [ -x "debian/prerm" ]; then
    check_ok "debian/prerm is executable"
else
    check_error "debian/prerm is not executable"
fi

echo

# Check control file format
echo "Validating debian/control format..."
if grep -q "^Source: pi-camera-control$" debian/control; then
    check_ok "Source package name is correct"
else
    check_error "Source package name issue"
fi

if grep -q "^Package: pi-camera-control$" debian/control; then
    check_ok "Binary package name is correct"
else
    check_error "Binary package name issue"
fi

if grep -q "^Architecture: all$" debian/control; then
    check_ok "Architecture is set to 'all' (platform independent)"
else
    check_warn "Architecture not set to 'all'"
fi

# Check for required dependencies
echo
echo "Checking dependencies in control file..."
required_deps=("nodejs" "hostapd" "dnsmasq" "systemd")
for dep in "${required_deps[@]}"; do
    if grep -q "$dep" debian/control; then
        check_ok "Dependency '$dep' is listed"
    else
        check_warn "Dependency '$dep' might be missing"
    fi
done

echo

# Check install file
echo "Validating debian/pi-camera-control.install..."
if grep -q "src/\* opt/pi-camera-control/src/" debian/pi-camera-control.install; then
    check_ok "Application source files will be installed"
else
    check_error "Application source files not configured for installation"
fi

if grep -q "runtime/pi-camera-control.service etc/systemd/system/" debian/pi-camera-control.install; then
    check_ok "Systemd service file will be installed"
else
    check_error "Systemd service file not configured for installation"
fi

if grep -q "runtime/camera-network-mode usr/local/bin/" debian/pi-camera-control.install; then
    check_ok "Network mode script will be installed"
else
    check_error "Network mode script not configured for installation"
fi

echo

# Check for source files that will be installed
echo "Checking source files availability..."
install_paths=(
    "src"
    "public" 
    "package.json"
    "runtime/pi-camera-control.service"
    "runtime/camera-network-mode"
)

for path in "${install_paths[@]}"; do
    if [ -e "$path" ]; then
        check_ok "Found $path"
    else
        check_error "Missing $path (required for installation)"
        all_files_exist=false
    fi
done

echo

# Final summary
if [ "$all_files_exist" = true ]; then
    echo -e "${GREEN}=== Validation Complete: Package structure looks good! ===${NC}"
    echo
    echo "To build the package (on Debian/Ubuntu system):"
    echo "  debuild -us -uc"
    echo
    echo "To install the built package:"
    echo "  sudo dpkg -i ../pi-camera-control_1.0.0-1_all.deb"
    echo "  sudo apt-get install -f  # Fix any dependencies"
else
    echo -e "${RED}=== Validation Failed: Please fix the issues above ===${NC}"
    exit 1
fi
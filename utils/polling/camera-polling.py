#!/usr/bin/env python3
"""
Simple script to check if a Canon camera is available on the network via CCAPI.
"""

import sys
import logging
import requests
import urllib3
from argparse import ArgumentParser

# Disable SSL warnings since camera uses self-signed certificate
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_camera(camera_ip):
    """Check if camera is available on the network."""
    url = f"https://{camera_ip}/ccapi"

    try:
        response = requests.get(url, verify=False, timeout=5)
        if response.status_code == 200:
            logger.info(f"Camera is available at {camera_ip}")
            return True
        else:
            logger.warning(f"Camera responded with unexpected status code: {response.status_code}")
            return False
    except requests.exceptions.Timeout:
        logger.error(f"Timeout connecting to camera at {camera_ip}")
        return False
    except requests.exceptions.ConnectionError:
        logger.error(f"Cannot connect to camera at {camera_ip}")
        return False
    except Exception as e:
        logger.error(f"Error checking camera: {e}")
        return False

def run_monitor(camera_ip):
    """
    Run in monitor mode - continuously poll for camera events.

    Uses CCAPI event polling with timeout parameter to efficiently
    wait for camera events without busy-waiting.
    """
    logger.info("Starting MONITOR mode - polling for camera events")
    logger.info("Press Ctrl+C to stop")

    # Use ver110 polling endpoint with timeout for efficient polling
    # timeout=long waits ~30 seconds for an event before returning
    polling_url = f"https://{camera_ip}/ccapi/ver110/event/polling?timeout=long"

    event_number = 0
    try:
        while True:
            try:
                # Poll for events with long timeout (~30 seconds)
                # This blocks until an event occurs or timeout expires
                event_number += 1
                response = requests.get(polling_url, verify=False, timeout=35)

                if response.status_code == 200:
                    events = response.json()

                    # Only log if events were received
                    if events:
                        # Log each event field that changed
                        for event_name in events.keys():
                            logger.info(f"Mon: {event_number:8} : {event_name}")
                    # Empty {} response means no events (timeout expired)

                else:
                    logger.warning(f"Unexpected response code: {response.status_code}")

            except requests.exceptions.Timeout:
                # Timeout on our end - this shouldn't happen with timeout=long
                # which should return before our 35 second timeout
                logger.warning("HTTP request timeout - retrying")
                continue

            except requests.exceptions.ConnectionError as e:
                logger.error(f"Connection lost to camera: {e}")
                logger.info("Waiting 5 seconds before retry...")
                import time
                time.sleep(5)
                continue

    except KeyboardInterrupt:
        logger.info("Monitor mode stopped by user")

def run_tester(camera_ip):
    """Run in tester mode."""
    logger.info("Running in TESTER mode")

def main():
    parser = ArgumentParser(description="Check if Canon camera is available on network")
    parser.add_argument("--camera-ip", help="IP address of the camera", default="192.168.12.98")
    parser.add_argument("--mode", choices=["monitor", "tester"], default="monitor",
                        help="Mode to run in: monitor or tester")

    args = parser.parse_args()

    if not check_camera(args.camera_ip):
        sys.exit(1)

    if args.mode == "monitor":
        run_monitor(args.camera_ip)
    elif args.mode == "tester":
        run_tester(args.camera_ip)
    else:
        logger.error(f"unsupported mode: {args.mode}")
        sys.exit(1)


if __name__ == "__main__":
    main()
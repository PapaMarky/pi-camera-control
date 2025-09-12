# save as r50_interval.py
# Requires: pip install requests
import requests, time, sys, logging, argparse
from datetime import datetime, timedelta
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Initial logger setup - level will be configured later based on args
logger = logging.getLogger(__name__)

CAMERA_IP = "192.168.12.98"   # <- put your camera IP (or discovered IP)
PORT = 443                 # try 8080 first; Canon menu can change port
BASE = f"https://{CAMERA_IP}:{PORT}"

def discover_ccapi():
    url = f"{BASE}/ccapi/"
    logger.info(f'Connecting to camera API: {url}')
    r = requests.get(url, verify=False)
    r.raise_for_status()
    idx = r.json()
    logger.debug(f"CCAPI root JSON keys: {list(idx.keys())}")
    # Many cameras return available versions under "versions" or similar,
    # but we'll just print the full JSON for inspection.
    from pprint import pformat
    logger.debug(f"Full API response:\n{pformat(idx)}")
    return idx

def find_shooting_endpoints(idx):
    # Look for shutter button control endpoints
    # Canon CCAPI provides multiple shutter control endpoints
    endpoints = []
    
    # Search through all API versions for shutter endpoints
    for version, endpoints_list in idx.items():
        if isinstance(endpoints_list, list):
            for endpoint in endpoints_list:
                if isinstance(endpoint, dict) and 'path' in endpoint:
                    path = endpoint['path']
                    # Look for shutter button control endpoints
                    if 'shutterbutton' in path and endpoint.get('post', False):
                        endpoints.append(path)
    
    # Prefer manual shutter endpoint over regular one
    manual_endpoint = None
    regular_endpoint = None
    
    for endpoint in endpoints:
        if 'manual' in endpoint:
            manual_endpoint = endpoint
        elif 'shutterbutton' in endpoint and not manual_endpoint:
            regular_endpoint = endpoint
    
    # Return the best endpoint found
    if manual_endpoint:
        logger.info(f"Found manual shutter endpoint: {manual_endpoint}")
        return manual_endpoint
    elif regular_endpoint:
        logger.info(f"Found regular shutter endpoint: {regular_endpoint}")
        return regular_endpoint
    
    return None

def post_shutter_action(path, action_payload):
    """Send a single shutter action to the camera"""
    url = f"{BASE}{path}"
    try:
        r = requests.post(url, json=action_payload, timeout=5, verify=False)
        logger.debug(f"POST {url} payload {action_payload} => {r.status_code}")
        try:
            response_data = r.json()
            if response_data:
                logger.debug(f"Response: {response_data}")
        except Exception:
            response_text = r.text[:400]
            if response_text.strip():
                logger.debug(f"Response text: {response_text}")
        return r
    except Exception as e:
        logger.error(f"Error posting: {e}")
        return None

def release_shutter(path):
    """Release the shutter button if it's stuck in pressed state"""
    logger.warning("Attempting to release stuck shutter...")
    # Based on test results, {"af": False, "action": "release"} works
    release_payloads = [
        {"af": False, "action": "release"},
        {"action": "release"},
        {"press": "release"},
        {"button": "release"}
    ]
    
    for payload in release_payloads:
        r = post_shutter_action(path, payload)
        if r and r.status_code in (200, 201, 202):
            logger.warning("Shutter released successfully")
            return True
    
    logger.error("Could not release shutter - camera may need manual reset")
    return False

def take_photo(path):
    """Take a single photo using proper press/release sequence"""
    # For manual night sky photography - no autofocus
    # Based on test results, we'll try without AF first
    press_payload = {"af": False, "action": "full_press"}  # Manual focus mode
    release_payload = {"af": False, "action": "release"}   # Release
    
    logger.debug(f"Pressing shutter: {press_payload}")
    r_press = post_shutter_action(path, press_payload)
    
    # If that fails, try with AF=True since that worked in tests
    if not r_press or r_press.status_code not in (200, 201, 202):
        logger.warning("Press failed, Retrying with AF=True payload...")
        press_payload = {"af": True, "action": "full_press"}
        r_press = post_shutter_action(path, press_payload)
    
    if r_press and r_press.status_code in (200, 201, 202):
        # Wait a moment for the camera to process
        time.sleep(0.5)
        
        logger.debug(f"Releasing shutter: {release_payload}")
        r_release = post_shutter_action(path, release_payload)
        
        if r_release and r_release.status_code in (200, 201, 202):
            logger.debug("Photo taken successfully!")
            return True
        else:
            logger.warning("Press successful but release failed - attempting recovery")
            # Try to release anyway
            if release_shutter(path):
                logger.warning("Recovery successful - photo may have been taken")
                return True
            return False
    else:
        logger.error("Shutter press failed")
        return False

def post_shutter(path):
    """Take a photo - wrapper for compatibility"""
    return take_photo(path)

def get_camera_settings():
    """Get camera shooting settings to check shutter speed"""
    url = f"{BASE}/ccapi/v100/shooting/settings"
    try:
        logger.info(f"Getting camera settings: {url}")
        r = requests.get(url, verify=False, timeout=5)
        logger.info(f"GET {url} => {r.status_code}")
        
        if r.status_code in (200, 201, 202):
            settings = r.json()
            from pprint import pformat
            logger.info(f"Camera settings:\n{pformat(settings)}")
            return settings
        else:
            logger.error(f"Failed to get camera settings: {r.status_code}")
            try:
                error_data = r.json()
                logger.error(f"Error response: {error_data}")
            except:
                logger.error(f"Error response text: {r.text[:400]}")
            return None
    except Exception as e:
        logger.error(f"Error getting camera settings: {e}")
        return None

def parse_shutter_speed(settings):
    """Parse shutter speed from camera settings and return in seconds"""
    if not settings:
        return None
    
    # Look for TV (Time Value / Shutter Speed) setting
    tv_setting = settings.get('tv', {})
    if isinstance(tv_setting, dict):
        current_value = tv_setting.get('value')
        if current_value:
            logger.info(f"Camera shutter speed setting: {current_value}")
            # Convert Canon TV values to seconds
            return convert_tv_to_seconds(current_value)
    
    logger.warning("Could not find shutter speed in camera settings")
    return None

def convert_tv_to_seconds(tv_value):
    """Convert Canon TV (shutter speed) values to seconds"""
    # Canon TV values are typically strings like "1/60", "1", "2", "1/250", etc.
    try:
        if isinstance(tv_value, str):
            if '/' in tv_value:
                # Fractional shutter speed like "1/60"
                numerator, denominator = tv_value.split('/')
                return float(numerator) / float(denominator)
            else:
                # Whole number shutter speed like "2" (2 seconds)
                return float(tv_value)
        elif isinstance(tv_value, (int, float)):
            return float(tv_value)
    except Exception as e:
        logger.error(f"Error parsing shutter speed '{tv_value}': {e}")
    
    return None

def validate_interval(interval_seconds, shutter_speed_seconds):
    """Validate that interval is longer than shutter speed"""
    if shutter_speed_seconds is None:
        logger.warning("Could not determine camera shutter speed - skipping validation")
        return True
    
    if interval_seconds <= shutter_speed_seconds:
        logger.error(f"Interval ({interval_seconds}s) must be longer than shutter speed ({shutter_speed_seconds}s)")
        return False
    
    logger.info(f"✓ Interval validation passed: {interval_seconds}s > {shutter_speed_seconds}s")
    return True

def setup_logging(level_name):
    """Configure logging with the specified level"""
    level = getattr(logging, level_name.upper())
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler('timelapse.log')
        ]
    )
    logger.setLevel(level)
    logger.info(f"Logging level set to {level_name}")

def parse_stop_time(stop_time_str):
    """Parse HH:MM time string and return datetime object for today"""
    try:
        # Parse the time string
        stop_time = datetime.strptime(stop_time_str, '%H:%M').time()
        
        # Get today's date and combine with the stop time
        today = datetime.now().date()
        stop_datetime = datetime.combine(today, stop_time)
        
        # Only assume tomorrow if the stop time is significantly earlier (more than 1 minute ago)
        # This allows for testing with times just a few seconds/minutes in the future
        current_time = datetime.now()
        time_diff = stop_datetime - current_time
        
        if time_diff.total_seconds() < -60:  # More than 1 minute in the past
            stop_datetime += timedelta(days=1)
            logger.info(f"Stop time is more than 1 minute in the past, assuming tomorrow: {stop_datetime.strftime('%Y-%m-%d %H:%M')}")
        
        return stop_datetime
    except ValueError:
        raise argparse.ArgumentTypeError(f"Invalid time format '{stop_time_str}'. Use HH:MM format (e.g., '23:30')")

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Canon Camera Timelapse Controller')
    parser.add_argument('--interval', '-i', type=float, default=10.0,
                        help='Interval between shots in seconds (default: 10)')
    parser.add_argument('--stop-at', type=parse_stop_time,
                        help='Stop time in HH:MM format (e.g., --stop-at 06:30). If earlier than current time, assumes tomorrow.')
    parser.add_argument('--level', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], default='INFO',
                        help='Set the logging level (default: INFO)')
    parser.add_argument('--test-settings', action='store_true',
                        help='Test camera settings API and exit')
    
    return parser.parse_args()

if __name__ == "__main__":
    # Parse command line arguments
    args = parse_arguments()
    
    # Set up logging with the specified level
    setup_logging(args.level)
    
    logger.info("=== Canon Camera Timelapse Script Started ===")
    if args.stop_at:
        logger.info(f"Parameters: interval={args.interval}s, stop_at={args.stop_at.strftime('%Y-%m-%d %H:%M')}")
    else:
        logger.info(f"Parameters: interval={args.interval}s, no stop time specified (will run indefinitely)")
    
    try:
        # Connect to camera and discover endpoints
        idx = discover_ccapi()
        
        # Test camera settings if requested
        if args.test_settings:
            logger.info("=== Testing camera settings API ===")
            settings = get_camera_settings()
            if settings:
                shutter_speed = parse_shutter_speed(settings)
                if shutter_speed:
                    logger.info(f"Detected shutter speed: {shutter_speed} seconds")
                else:
                    logger.warning("Could not parse shutter speed from settings")
            else:
                logger.error("Could not retrieve camera settings")
            logger.info("Test complete - exiting")
            sys.exit(0)
        
        # Find shutter control endpoint
        path = find_shooting_endpoints(idx)
        if not path:
            logger.error("Couldn't auto-detect a shutter button endpoint. Available endpoints are listed above.")
            logger.error("Make sure the camera is in a shooting mode (not playback) and try again.")
            sys.exit(1)

        # Get camera settings and validate interval
        logger.info("Checking camera settings...")
        settings = get_camera_settings()
        shutter_speed = parse_shutter_speed(settings)
        
        if not validate_interval(args.interval, shutter_speed):
            logger.error("Interval validation failed - exiting")
            sys.exit(1)

        # First, try to recover from any stuck shutter state
        logger.info("Checking camera state and releasing any stuck shutter...")
        release_shutter(path)
        time.sleep(1)

        # Start timelapse sequence
        if args.stop_at:
            logger.info(f"Using endpoint {path}. Taking shots every {args.interval}s until {args.stop_at.strftime('%H:%M')}")
        else:
            logger.info(f"Using endpoint {path}. Taking shots every {args.interval}s indefinitely (Ctrl+C to stop)")
        
        successful_shots = 0
        shot_number = 1
        
        while True:
            # Check if we should stop
            if args.stop_at and datetime.now() >= args.stop_at:
                logger.info(f"Stop time reached: {args.stop_at.strftime('%H:%M')}")
                break
            
            current_time = datetime.now().strftime('%H:%M:%S')
            if args.stop_at:
                time_remaining = args.stop_at - datetime.now()
                time_remaining = str(time_remaining).split('.')[0]
                logger.info(f"=== Shot {shot_number} at {current_time} (time remaining: {time_remaining}) ===")
            else:
                logger.info(f"=== Shot {shot_number} at {current_time} ===")
            
            if take_photo(path):
                successful_shots += 1
                logger.debug(f"✓ Shot {shot_number} completed successfully")
            else:
                logger.error(f"✗ Shot {shot_number} failed")
                # Try to recover for next shot
                release_shutter(path)
            
            shot_number += 1
            
            # Check if we should stop before waiting
            if args.stop_at and datetime.now() >= args.stop_at:
                logger.info(f"Stop time reached: {args.stop_at.strftime('%H:%M')}")
                break
            
            logger.debug(f"Waiting {args.interval} seconds until next shot...")
            time.sleep(args.interval)
        
        total_shots = shot_number - 1
        logger.info(f"=== Completed: {successful_shots}/{total_shots} shots taken successfully ===")
    
    except KeyboardInterrupt:
        logger.info("Script interrupted by user")
    except Exception as e:
        logger.error(f"Script failed with error: {e}")
        sys.exit(1)
#!/usr/bin/env python3
"""
Simple utility to explore Canon CCAPI endpoints.
Usage: python3 ccapi_explore.py <endpoint>
Example: python3 ccapi_explore.py ver
"""

import sys
import requests
import json
from urllib3.exceptions import InsecureRequestWarning

# Disable SSL warnings since camera uses self-signed certificates
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

BASE_URL = "https://192.168.12.98:443/ccapi/"

def explore_endpoint(endpoint):
    """Fetch and display CCAPI endpoint response."""
    url = BASE_URL + endpoint.lstrip('/')
    
    try:
        print(f"URL: {url}")
        response = requests.get(url, verify=False, timeout=10)
        
        print(f"Status: {response.status_code} - {response.reason}")
        print("-" * 50)
        
        if response.status_code == 200:
            try:
                # Try to parse as JSON for pretty printing
                data = response.json()
                print(json.dumps(data, indent=2))
            except json.JSONDecodeError:
                # If not JSON, print as text
                print(response.text)
        else:
            print(f"Error: {response.status_code}")
            print(response.text)
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 ccapi_explore.py <endpoint>")
        print("Example: python3 ccapi_explore.py ver")
        print("Example: python3 ccapi_explore.py shooting/settings")
        endpoint = ''
    else:
        endpoint = sys.argv[1]

    explore_endpoint(endpoint)
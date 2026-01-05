#!/usr/bin/env python3
"""
Scan for Sonos speakers and create soco-cli speaker cache.
This is needed because Docker Desktop doesn't support multicast discovery.
"""

import os
import pickle
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

def scan_ip(ip):
    """Check if a Sonos speaker exists at the given IP."""
    try:
        result = subprocess.run(
            ["curl", "-s", "--connect-timeout", "1", f"http://{ip}:1400/status/zp"],
            capture_output=True,
            text=True,
            timeout=3
        )
        if "ZPSupportInfo" in result.stdout:
            # Extract zone name
            import re
            match = re.search(r'<ZoneName>([^<]+)</ZoneName>', result.stdout)
            model_match = re.search(r'<ModelName>([^<]+)</ModelName>', result.stdout)
            if match:
                return {
                    "ip": ip,
                    "name": match.group(1),
                    "model": model_match.group(1) if model_match else "Unknown"
                }
    except Exception:
        pass
    return None

def main():
    # Determine subnet to scan (default 192.168.1.x)
    subnet = os.environ.get("SONOS_SUBNET", "192.168.1")
    
    print(f"Scanning {subnet}.1-254 for Sonos speakers...")
    
    speakers = []
    ips_to_scan = [f"{subnet}.{i}" for i in range(1, 255)]
    
    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = {executor.submit(scan_ip, ip): ip for ip in ips_to_scan}
        for future in as_completed(futures):
            result = future.result()
            if result:
                print(f"  Found: {result['name']} at {result['ip']} ({result['model']})")
                speakers.append(result)
    
    if not speakers:
        print("No Sonos speakers found. Make sure you're on the same network.")
        print("Set SONOS_SUBNET environment variable if your network isn't 192.168.1.x")
        return 1
    
    # Import SonosDevice from soco-cli to ensure pickle compatibility
    try:
        from soco_cli.speakers import SonosDevice
    except ImportError:
        # Fallback: find pipx venv
        import glob
        venv_paths = glob.glob(os.path.expanduser("~/.local/pipx/venvs/soco-cli/lib/python*/site-packages"))
        if venv_paths:
            sys.path.insert(0, venv_paths[0])
            from soco_cli.speakers import SonosDevice
        else:
            print("Error: soco-cli not installed via pipx")
            return 1
    
    # Convert to SonosDevice namedtuples
    sonos_devices = [
        SonosDevice(
            household_id="",
            ip_address=s["ip"],
            speaker_name=s["name"],
            is_visible=True,
            model_name=s["model"],
            display_version=""
        )
        for s in speakers
    ]
    
    # Save cache
    save_dir = os.path.expanduser("~/.soco-cli/")
    os.makedirs(save_dir, exist_ok=True)
    cache_file = os.path.join(save_dir, "speakers_v2.pickle")
    
    with open(cache_file, "wb") as f:
        pickle.dump(sonos_devices, f)
    
    print(f"\nCreated speaker cache with {len(sonos_devices)} speakers at {cache_file}")
    print("Use 'sonos -l <speaker-name> <command>' to control speakers.")
    return 0

if __name__ == "__main__":
    sys.exit(main())

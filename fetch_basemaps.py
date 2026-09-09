import math
import urllib.request
import os
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

FACILITIES = {
    "jamnagar_refinery": (22.4707, 69.8331),
    "iocl_paradip": (20.2829, 86.6190),
    "ongc_mumbai_high": (19.4167, 71.3333),
    "bhilai_steel_plant": (21.1895, 81.3976),
    "tata_jamshedpur": (22.7844, 86.1950),
    "gail_pata": (26.5989, 79.5292),
    "ntpc_singrauli": (24.1011, 82.6844),
    "disaster_baghjan": (27.5925, 95.3417),
    "punjab_stubble_sample": (30.2458, 75.8421)
}

def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

os.makedirs("backend/app/assets/basemaps", exist_ok=True)
zoom = 15

for key, (lat, lon) in FACILITIES.items():
    x, y = deg2num(lat, lon, zoom)
    url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{zoom}/{y}/{x}"
    out_path = f"backend/app/assets/basemaps/{key}.png"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = response.read()
            with open(out_path, 'wb') as f:
                f.write(data)
        print(f"Downloaded basemap for {key}")
    except Exception as e:
        print(f"Failed {key}: {e}")

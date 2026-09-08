"""
Data Foundation Script: NASA FIRMS 2-Year Historical Ingestion (Phase 1)
Downloads historical VIIRS 375m active fire data for the Indian subcontinent.
"""
import os
import sys
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# FIRMS open archive endpoints
ARCHIVE_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/data/country"

def download_firms_archive(country_code: str = "IND", year: int = 2025, output_dir: str = "data/raw"):
    os.makedirs(output_dir, exist_ok=True)
    target_file = os.path.join(output_dir, f"fire_archive_SV-C2_{country_code}_{year}.csv")
    
    logger.info(f"Preparing to download VIIRS archive for {country_code} ({year})...")
    logger.info(f"Destination: {target_file}")
    logger.info("For automated download without browser, provide NASA Earthdata or FIRMS Map Key in .env")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download NASA FIRMS archive")
    parser.add_argument("--country", default="IND", help="ISO country code")
    parser.add_argument("--year", type=int, default=2025, help="Calendar year")
    args = parser.parse_args()
    download_firms_archive(args.country, args.year)

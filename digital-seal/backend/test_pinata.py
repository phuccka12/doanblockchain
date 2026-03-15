"""Test Pinata API connection và upload ảnh thử."""
import requests
import io
from PIL import Image

API_KEY = "4cdf5c25d77c65fdfc40"
SECRET   = "4203655197473df22420c5e392ef564accffebc0cf5fa07d8812cb1ea0caf1a9"
HEADERS  = {"pinata_api_key": API_KEY, "pinata_secret_api_key": SECRET}

print("1. Test Authentication...")
try:
    r = requests.get(
        "https://api.pinata.cloud/data/testAuthentication",
        headers=HEADERS,
        timeout=15
    )
    print(f"   HTTP {r.status_code}: {r.text}")
except Exception as e:
    print(f"   ERROR: {e}")

print("\n2. Upload ảnh test nhỏ lên IPFS...")
try:
    # Tạo ảnh 10x10 đơn giản
    img = Image.new("RGB", (10, 10), color=(99, 102, 241))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    buf.seek(0)

    r2 = requests.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        files={"file": ("test.png", buf, "image/png")},
        headers=HEADERS,
        timeout=20
    )
    print(f"   HTTP {r2.status_code}: {r2.text[:300]}")
    if r2.status_code == 200:
        cid = r2.json()["IpfsHash"]
        print(f"\n   ✅ IPFS OK! CID: {cid}")
        print(f"   Link: https://gateway.pinata.cloud/ipfs/{cid}")
except Exception as e:
    print(f"   ERROR: {e}")

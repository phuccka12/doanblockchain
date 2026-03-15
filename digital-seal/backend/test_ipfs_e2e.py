"""Test IPFS upload end-to-end qua /seal API."""
import requests, io, time
from PIL import Image, ImageDraw
import sqlite3

BASE = "http://127.0.0.1:8000"

# Tạo ảnh test
img = Image.new("RGB", (300, 200), (30, 20, 80))
d = ImageDraw.Draw(img)
d.text((10, 10), f"IPFS TEST {int(time.time())}", fill=(200, 200, 255))
buf = io.BytesIO()
img.save(buf, "PNG")
buf.seek(0)

print("Gọi /seal (bao gồm IPFS upload)...")
r = requests.post(f"{BASE}/seal",
    files={"file": ("ipfs_test.png", buf.read(), "image/png")},
    data={"watermark_id": "IPFS_TEST_001", "registrant_name": "Test IPFS"},
    timeout=60  # IPFS upload có thể mất 15-20s
)
print(f"HTTP: {r.status_code}")
print(f"X-Image-SHA256: {r.headers.get('X-Image-SHA256', '?')}")
print(f"X-IPFS-Link:    {r.headers.get('X-IPFS-Link', '(trống)')}")

ipfs = r.headers.get("X-IPFS-Link", "")
if ipfs and ipfs.startswith("ipfs://"):
    # Chuyển sang gateway để kiểm tra
    cid = ipfs.replace("ipfs://", "")
    gw = f"https://gateway.pinata.cloud/ipfs/{cid}"
    print(f"\n✅ IPFS thành công!")
    print(f"   tokenURI: {ipfs}")
    print(f"   Gateway:  {gw}")
    # Thử fetch metadata để xác nhận
    try:
        meta = requests.get(gw, timeout=10).json()
        print(f"   name:     {meta.get('name')}")
        print(f"   image:    {meta.get('image')}")
        print(f"   attrs:    {[a['value'] for a in meta.get('attributes', [])]}")
    except Exception as e:
        print(f"   (Không fetch được metadata từ gateway: {e})")
elif r.status_code == 409:
    print("⚠️ Ảnh đã tồn tại trong DB (409) - xóa và thử lại")
    conn = sqlite3.connect("seal.db")
    conn.execute("DELETE FROM sealed_records WHERE watermark_id='IPFS_TEST_001'")
    conn.commit(); conn.close()
    print("Đã xóa record test. Chạy lại để test IPFS.")
else:
    print(f"❌ IPFS link trống! r.status={r.status_code} - kiểm tra uvicorn logs")

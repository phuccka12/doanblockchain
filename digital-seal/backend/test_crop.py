"""
Test crop detection fallback - verify cropped images are found in DB.
"""
import io, requests, time
import numpy as np
import cv2
from PIL import Image, ImageDraw

BASE = "http://127.0.0.1:8000"

def make_img(size=(600, 400)):
    """Ảnh có nhiều texture để crop dễ nhận ra."""
    img = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    # Vẽ các ô màu đa dạng
    colors = [(200,50,50),(50,200,50),(50,50,200),(200,200,50),(50,200,200),(200,50,200)]
    for i, c in enumerate(colors):
        x1, y1 = (i % 3) * 200, (i // 3) * 200
        img[y1:y1+200, x1:x1+200] = c
    # Text
    cv2.putText(img, "ORIGINAL IMAGE", (50, 380), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255,255,255), 3)
    _, buf = cv2.imencode('.png', img)
    return buf.tobytes()

def crop_image(img_bytes, x, y, w, h):
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    crop = img[y:y+h, x:x+w]
    _, buf = cv2.imencode('.png', crop)
    return buf.tobytes()

import sqlite3
conn = sqlite3.connect('seal.db')
existing = conn.execute('SELECT COUNT(*) FROM sealed_records WHERE registered=1').fetchone()[0]
conn.close()
print(f'DB: {existing} registered records (sẽ giữ nguyên)')

# Seal ảnh gốc
img_orig = make_img()
r = requests.post(f"{BASE}/seal",
    files={'file': ('orig.png', img_orig, 'image/png')},
    data={'watermark_id': 'CROP_TEST_001', 'registrant_name': 'TestCrop'})
print(f'\n[1] Seal ảnh gốc 600x400: HTTP {r.status_code}', '✅' if r.status_code==200 else f'❌ {r.json()}')
if r.status_code != 200:
    exit()
sealed_bytes = r.content

time.sleep(2)  # chờ server reload nếu cần

# Verify ảnh gốc (phải match)
rv = requests.post(f"{BASE}/verify", files={'file': ('s.png', sealed_bytes, 'image/png')})
d = rv.json()
bm = d.get('best_match')
print(f'[2] Verify ảnh gốc: best_match={bm is not None}', '✅' if bm else '❌')
if bm:
    print(f'    matched_by={bm.get("matched_by")} dist={bm.get("distance")}')

# Crop nhỏ: 200x200 từ góc trên trái (màu đỏ)
crop1 = crop_image(sealed_bytes, 0, 0, 200, 200)
rv2 = requests.post(f"{BASE}/verify", files={'file': ('c1.png', crop1, 'image/png')})
d2 = rv2.json(); bm2 = d2.get('best_match')
print(f'[3] Verify crop 200x200 (33% ảnh gốc): best_match={bm2 is not None}',
      '✅ tìm thấy' if bm2 else '❌ MISS')
if bm2:
    print(f'    matched_by={bm2.get("matched_by")} wm={bm2.get("watermark_id")}')

# Crop lớn: 400x300
crop2 = crop_image(sealed_bytes, 100, 50, 400, 300)
rv3 = requests.post(f"{BASE}/verify", files={'file': ('c2.png', crop2, 'image/png')})
d3 = rv3.json(); bm3 = d3.get('best_match')
print(f'[4] Verify crop 400x300 (50% ảnh gốc): best_match={bm3 is not None}',
      '✅ tìm thấy' if bm3 else '❌ MISS')
if bm3:
    print(f'    matched_by={bm3.get("matched_by")} wm={bm3.get("watermark_id")}')

# Cleanup record test
conn = sqlite3.connect('seal.db')
conn.execute("DELETE FROM sealed_records WHERE watermark_id='CROP_TEST_001'")
conn.commit()
conn.close()
print('\n[cleanup] Record test đã xóa.')
print('Done.')

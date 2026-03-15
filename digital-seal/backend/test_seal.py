"""
Test nhanh: verify từng case sau khi reload server.
"""
import sqlite3, time, requests, io
from PIL import Image, ImageDraw

# --- Clear DB ---
conn = sqlite3.connect('seal.db')
conn.execute('DELETE FROM sealed_records')
conn.execute('DELETE FROM alerts')
conn.commit()
conn.close()
print('DB cleared')

# --- Check server ---
try:
    r = requests.get('http://127.0.0.1:8000/records', timeout=5)
    print(f'Server OK, records: {r.json().get("total")}')
except Exception as e:
    print(f'Server ERROR: {e}'); exit(1)

# --- Tạo ảnh ---
def make_img(color_top, color_bot, label, size=(300, 200)):
    img = Image.new('RGB', size)
    d = ImageDraw.Draw(img)
    for y in range(size[1]):
        t = y / size[1]
        rc = int(color_top[0]*(1-t) + color_bot[0]*t)
        gc = int(color_top[1]*(1-t) + color_bot[1]*t)
        bc = int(color_top[2]*(1-t) + color_bot[2]*t)
        d.rectangle([(0, y), (size[0], y+1)], fill=(rc, gc, bc))
    d.text((10, 10), label, fill=(255, 255, 255))
    buf = io.BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
    return buf.read()

img1 = make_img((20, 80, 200), (80, 20, 100), 'TEST A - Blue gradient')
img2 = make_img((200, 60, 10), (10, 180, 80), 'TEST B - Red/green gradient')  # màu khác hẳn
buf = io.BytesIO(); Image.new('RGB', (200, 200), (200, 100, 50)).save(buf, 'PNG')
img_random = buf.getvalue()

# === Test 1: Seal img1 ===
r = requests.post('http://127.0.0.1:8000/seal',
    files={'file': ('a.png', img1, 'image/png')},
    data={'watermark_id': 'WM_A', 'registrant_name': 'Alice'})
sealed1 = r.content if r.status_code == 200 else None
print(f'\n[1] Seal img1: HTTP {r.status_code}', '✅' if r.status_code == 200 else f'❌ {r.json()}')

# === Test 2: Seal img2 (khác màu hẳn) ===
r2 = requests.post('http://127.0.0.1:8000/seal',
    files={'file': ('b.png', img2, 'image/png')},
    data={'watermark_id': 'WM_B', 'registrant_name': 'Bob'})
print(f'[2] Seal img2 (khác): HTTP {r2.status_code}', '✅ OK 200' if r2.status_code == 200 else f'❌ WRONG: {r2.json()}')

# === Test 3: Seal img1 lại (duplicate) ===
r3 = requests.post('http://127.0.0.1:8000/seal',
    files={'file': ('a2.png', img1, 'image/png')},
    data={'watermark_id': 'WM_A_dup', 'registrant_name': 'Eve'})
print(f'[3] Seal img1 lại: HTTP {r3.status_code}', '✅ OK 409' if r3.status_code == 409 else f'❌ WRONG (should 409)')

# === Test 4: Verify ảnh sealed ===
if sealed1:
    rv = requests.post('http://127.0.0.1:8000/verify',
        files={'file': ('s.png', sealed1, 'image/png')})
    d = rv.json()
    bm = d.get('best_match')
    wm = d.get('watermark_id_extracted', '')
    conf = d.get('watermark_confidence')
    print(f'[4] Verify sealed: wm="{wm}" conf={conf}% dist={bm.get("distance") if bm else None}',
          '✅ nhận ra' if bm else '❌ không tìm thấy')

# === Test 5: Verify random (solid orange) ===
rv2 = requests.post('http://127.0.0.1:8000/verify',
    files={'file': ('rnd.png', img_random, 'image/png')})
d2 = rv2.json()
bm2 = d2.get('best_match')
if bm2:
    metrics = f'dist={bm2.get("distance")} matched={bm2.get("matched_by")} ssim={bm2.get("ssim_score")}'
    forgery = bool(bm2.get('forgery_image'))
    print(f'[5] Verify random: ❌ FALSE POSITIVE! best_match found. forgery={forgery}  {metrics}')
else:
    print(f'[5] Verify random: ✅ Đúng - không match, wm="{d2.get("watermark_id_extracted")}"')

print('\nDone.')

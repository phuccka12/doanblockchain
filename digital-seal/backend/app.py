import sqlite3
import time
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import Response, JSONResponse
import numpy as np
import cv2
import hashlib
import imagehash 
from PIL import Image
import io
import base64
import requests
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TrustLens - Level 5 (Super Vision)")

origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Image-SHA256", "X-Watermark-Id", "X-Image-DHASH", "X-IPFS-Link"],
)

DB_PATH = "seal.db"
# Cấu hình Pinata (Giữ nguyên của bạn)
PINATA_API_KEY = "YOUR_PINATA_KEY" 
PINATA_SECRET_API_KEY = "YOUR_SECRET_KEY"

def db_conn():
    return sqlite3.connect(DB_PATH)

def db_init():
    with db_conn() as con:
        con.execute("""
        CREATE TABLE IF NOT EXISTS sealed_records (
            sha256 TEXT PRIMARY KEY,
            dhash TEXT NOT NULL,
            watermark_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            original_blob BLOB 
        )
        """)
db_init()

# --- CÁC HÀM TIỆN ÍCH CƠ BẢN ---
def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def calc_dhash(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes))
    return str(imagehash.dhash(img))

def hamming_distance(s1: str, s2: str) -> int:
    return sum(c1 != c2 for c1, c2 in zip(s1, s2))

def embed_lsb_manual(img, text_id):
    # (Giữ nguyên hàm embed cũ của bạn)
    binary_id = ''.join(format(ord(i), '08b') for i in text_id) + '11111111'
    data_len = len(binary_id)
    flat_img = img.flatten()
    if data_len > len(flat_img): return img
    for i in range(data_len):
        flat_img[i] = (flat_img[i] & 254) | int(binary_id[i])
    return flat_img.reshape(img.shape)

def extract_lsb_manual(img):
    # (Giữ nguyên hàm extract cũ của bạn)
    flat_img = img.flatten()
    binary_data = ""
    for i in range(min(len(flat_img), 2000)): 
        binary_data += str(flat_img[i] & 1)
        if binary_data.endswith('11111111'):
            binary_data = binary_data[:-8]
            break
    chars = []
    for i in range(0, len(binary_data), 8):
        byte = binary_data[i:i+8]
        if len(byte) == 8: chars.append(chr(int(byte, 2)))
    return "".join(chars)

def upload_to_ipfs(file_bytes):
    # (Giữ nguyên hàm upload IPFS cũ của bạn)
    if "YOUR" in PINATA_API_KEY: return None
    url = "https://api.pinata.cloud/pinning/pinFileToIPFS"
    headers = {"pinata_api_key": PINATA_API_KEY, "pinata_secret_api_key": PINATA_SECRET_API_KEY}
    files = {'file': ('image.png', file_bytes)}
    try:
        res = requests.post(url, files=files, headers=headers)
        if res.status_code == 200: return f"https://gateway.pinata.cloud/ipfs/{res.json()['IpfsHash']}"
    except: pass
    return None

# --- [NÂNG CẤP LEVEL 5] SUPER VISION: ALIGN IMAGES ---
# Hàm này tự động xoay, nắn chỉnh ảnh Fake cho khớp với ảnh Gốc
def align_images(img_fake, img_real):
    # Chuyển sang ảnh xám
    gray_fake = cv2.cvtColor(img_fake, cv2.COLOR_BGR2GRAY)
    gray_real = cv2.cvtColor(img_real, cv2.COLOR_BGR2GRAY)

    # Dùng thuật toán ORB (Oriented FAST and Rotated BRIEF) để tìm điểm đặc trưng
    # Đây là "Mắt thần" giúp nhận diện ảnh dù bị xoay
    orb = cv2.ORB_create(500)
    kp1, des1 = orb.detectAndCompute(gray_fake, None)
    kp2, des2 = orb.detectAndCompute(gray_real, None)

    # Khớp các điểm đặc trưng
    matcher = cv2.DescriptorMatcher_create(cv2.DESCRIPTOR_MATCHER_BRUTEFORCE_HAMMING)
    matches = matcher.match(des1, des2, None)

    # Sắp xếp lấy các điểm khớp nhất (Top 15%)
    matches.sort(key=lambda x: x.distance, reverse=False)
    numGoodMatches = int(len(matches) * 0.15)
    matches = matches[:numGoodMatches]

    # Nếu tìm thấy đủ điểm giống nhau
    if len(matches) > 10:
        # Trích xuất tọa độ các điểm
        points1 = np.zeros((len(matches), 2), dtype=np.float32)
        points2 = np.zeros((len(matches), 2), dtype=np.float32)

        for i, match in enumerate(matches):
            points1[i, :] = kp1[match.queryIdx].pt
            points2[i, :] = kp2[match.trainIdx].pt

        # Tìm ma trận biến đổi (Homography)
        h, mask = cv2.findHomography(points1, points2, cv2.RANSAC)

        # Nắn chỉnh ảnh Fake theo ảnh Real
        height, width, channels = img_real.shape
        img_fake_aligned = cv2.warpPerspective(img_fake, h, (width, height))
        
        return img_fake_aligned
    else:
        # Nếu không tìm thấy đủ điểm khớp, trả về resize thường (fallback)
        h, w, _ = img_fake.shape
        return cv2.resize(img_real, (w, h))

def detect_forgery(img_fake_bgr, img_real_bgr):
    # [NÂNG CẤP] Bước 1: Nắn chỉnh ảnh thông minh
    try:
        img_fake_aligned = align_images(img_fake_bgr, img_real_bgr)
    except:
        # Fallback nếu lỗi
        h, w, _ = img_fake_bgr.shape
        img_fake_aligned = cv2.resize(img_fake_bgr, (w, h)) # Chỉ resize ảnh fake về size real thì sai logic so sánh

    # Đảm bảo 2 ảnh cùng kích thước để trừ
    h, w, _ = img_fake_aligned.shape
    img_real_resized = cv2.resize(img_real_bgr, (w, h))

    # Bước 2: Trừ ảnh (Image Differencing)
    diff = cv2.absdiff(img_fake_aligned, img_real_resized)
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    
    # Bước 3: Lọc nhiễu (Threshold & Morph)
    _, thresh = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY)
    kernel = np.ones((5,5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

    # Bước 4: Khoanh vùng
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    img_result = img_fake_aligned.copy() # Vẽ lên ảnh đã nắn chỉnh
    has_forgery = False
    
    for cnt in contours:
        if cv2.contourArea(cnt) > 400: # Lọc vùng nhỏ
            has_forgery = True
            x, y, w, h = cv2.boundingRect(cnt)
            cv2.rectangle(img_result, (x, y), (x + w, y + h), (0, 0, 255), 3)

    return has_forgery, img_result

# --- API ENDPOINTS ---

@app.post("/seal")
async def seal(file: UploadFile = File(...), watermark_id: str = Form(...)):
    raw = await file.read()
    nparr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    sealed_img = embed_lsb_manual(img, watermark_id)
    _, img_png = cv2.imencode(".png", sealed_img)
    sealed_bytes = img_png.tobytes()
    
    image_hash = sha256_hex(sealed_bytes)
    dhash_str = calc_dhash(sealed_bytes)
    ipfs_link = upload_to_ipfs(sealed_bytes)

    try:
        with db_conn() as con:
            con.execute(
                "INSERT OR REPLACE INTO sealed_records (sha256, dhash, watermark_id, created_at, original_blob) VALUES (?, ?, ?, ?, ?)",
                (image_hash, dhash_str, watermark_id, int(time.time()), sealed_bytes)
            )
            con.commit()
    except Exception as e: print("DB Error:", e)

    headers = {
        "X-Image-SHA256": image_hash,
        "X-Image-DHASH": dhash_str,
        "X-IPFS-Link": ipfs_link if ipfs_link else ""
    }
    return Response(content=sealed_bytes, media_type="image/png", headers=headers)

class UrlRequest(BaseModel):
    image_url: str

@app.post("/verify-url")
async def verify_url(item: UrlRequest):
    try:
        url = item.image_url
        raw = None
        if url.startswith("data:image"):
            header, encoded = url.split(",", 1)
            raw = base64.b64decode(encoded)
        elif url.startswith("http"):
            headers = {'User-Agent': 'Mozilla/5.0'}
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code != 200: return JSONResponse({"error": "Load failed"}, status_code=400)
            raw = response.content
        else: return JSONResponse({"error": "Invalid URL"}, status_code=400)
        return process_verification(raw)
    except Exception as e: return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/verify")
async def verify(file: UploadFile = File(...)):
    raw = await file.read()
    return process_verification(raw)

def process_verification(raw_bytes):
    image_hash = sha256_hex(raw_bytes)
    current_dhash = calc_dhash(raw_bytes)
    
    nparr = np.frombuffer(raw_bytes, np.uint8)
    img_upload = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    try: wm = extract_lsb_manual(img_upload)
    except: wm = ""

    best_match = None
    min_dist = 999
    
    with db_conn() as con:
        rows = con.execute("SELECT sha256, dhash, watermark_id, original_blob FROM sealed_records").fetchall()
        for row in rows:
            db_sha, db_dhash, db_wm, db_blob = row
            dist = hamming_distance(current_dhash, db_dhash)
            
            if dist < min_dist:
                min_dist = dist
                forgery_b64 = None
                
                # Logic thông minh: Chỉ check Forgery nếu khoảng cách nhỏ
                if 0 < dist < 25 and db_blob:
                    nparr_db = np.frombuffer(db_blob, np.uint8)
                    img_real = cv2.imdecode(nparr_db, cv2.IMREAD_COLOR)
                    
                    # [GỌI HÀM NÂNG CẤP]
                    is_forged, img_result = detect_forgery(img_upload, img_real)
                    
                    if is_forged:
                        _, buf = cv2.imencode('.png', img_result)
                        forgery_b64 = base64.b64encode(buf).decode('utf-8')

                best_match = {
                    "sha256": db_sha,
                    "distance": dist,
                    "watermark_id": db_wm,
                    "forgery_image": forgery_b64
                }

    # Lọc ảnh lạ
    if best_match and best_match['distance'] > 25:
        best_match = None 

    return JSONResponse({
        "sha256": image_hash,
        "dhash": current_dhash,
        "watermark_id_extracted": wm,
        "best_match": best_match
    })
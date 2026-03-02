import sqlite3
import time
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import Response, JSONResponse
import numpy as np
import cv2
import hashlib
import imagehash 
from PIL import Image, ImageChops, ImageEnhance
import io
import base64
import requests
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TrustLens - Hệ thống Bảo vệ Bản quyền (Blockchain & AI)")

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

# ==========================================
# 1. CÁC HÀM TIỆN ÍCH CƠ BẢN (HASH & IPFS)
# ==========================================
def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def calc_dhash(image_bytes: bytes) -> str:
    img = Image.open(io.BytesIO(image_bytes))
    return str(imagehash.dhash(img))

def hamming_distance(s1: str, s2: str) -> int:
    return sum(c1 != c2 for c1, c2 in zip(s1, s2))

def upload_to_ipfs(file_bytes):
    if "YOUR" in PINATA_API_KEY: return None
    url = "https://api.pinata.cloud/pinning/pinFileToIPFS"
    headers = {"pinata_api_key": PINATA_API_KEY, "pinata_secret_api_key": PINATA_SECRET_API_KEY}
    files = {'file': ('image.png', file_bytes)}
    try:
        res = requests.post(url, files=files, headers=headers)
        if res.status_code == 200: return f"https://gateway.pinata.cloud/ipfs/{res.json()['IpfsHash']}"
    except: pass
    return None

# ==========================================
# 2. LÕI KỸ THUẬT: THỦY VÂN TẦN SỐ (DCT) 
# Chống nén ảnh JPEG, Resize, Cắt xén
# ==========================================
Q = 30 # Hệ số lượng tử hóa. Q càng lớn -> Càng khó bị xóa nhưng ảnh gốc hơi nhiễu

def embed_dct_blind(img, text_id):
    """Giấu ID bản quyền vào miền tần số DCT"""
    binary_id = ''.join(format(ord(i), '08b') for i in text_id) + '1111111111111111'
    
    img_yuv = cv2.cvtColor(img, cv2.COLOR_BGR2YUV)
    y, u, v = cv2.split(img_yuv)
    
    y_dct = cv2.dct(np.float32(y))
    
    start_idx = 20 
    for i, bit in enumerate(binary_id):
        row, col = start_idx + i, start_idx + i
        if row >= y_dct.shape[0] or col >= y_dct.shape[1]: break
        
        val = y_dct[row, col]
        quotient = round(val / Q)
        
        if int(bit) == 1:
            if quotient % 2 == 0: quotient += 1 
        else:
            if quotient % 2 != 0: quotient += 1 
            
        y_dct[row, col] = quotient * Q
        
    y_idct = cv2.idct(y_dct)
    y_idct = np.clip(y_idct, 0, 255).astype(np.uint8)
    
    return cv2.cvtColor(cv2.merge((y_idct, u, v)), cv2.COLOR_YUV2BGR)

def extract_dct_blind(img):
    """Trích xuất ID bản quyền từ miền tần số (Không cần ảnh gốc)"""
    img_yuv = cv2.cvtColor(img, cv2.COLOR_BGR2YUV)
    y, _, _ = cv2.split(img_yuv)
    y_dct = cv2.dct(np.float32(y))
    
    extracted_bits = ""
    start_idx = 20
    
    for i in range(2000):
        row, col = start_idx + i, start_idx + i
        if row >= y_dct.shape[0] or col >= y_dct.shape[1]: break
        
        val = y_dct[row, col]
        quotient = round(val / Q)
        
        if quotient % 2 == 0: extracted_bits += '0'
        else: extracted_bits += '1'
            
        if extracted_bits.endswith('1111111111111111'):
            extracted_bits = extracted_bits[:-16]
            break
            
    chars = []
    for i in range(0, len(extracted_bits), 8):
        byte = extracted_bits[i:i+8]
        if len(byte) == 8:
            try: chars.append(chr(int(byte, 2)))
            except: pass
            
    res = "".join(chars)
    return ''.join(filter(lambda x: x.isprintable(), res))

# ==========================================
# 3. LÕI KỸ THUẬT AI: PHÁT HIỆN GIẢ MẠO (ELA)
# Tự động soi vết Photoshop cắt ghép
# ==========================================
def perform_ela(image_bytes, quality=90):
    """Thuật toán ELA (Error Level Analysis) tìm vùng khác biệt mức độ nén"""
    original_img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    
    temp_io = io.BytesIO()
    original_img.save(temp_io, 'JPEG', quality=quality)
    temp_io.seek(0)
    compressed_img = Image.open(temp_io)
    
    ela_image = ImageChops.difference(original_img, compressed_img)
    
    extrema = ela_image.getextrema()
    max_diff = max([ex[1] for ex in extrema])
    if max_diff == 0: max_diff = 1
    scale = 255.0 / max_diff
    ela_image = ImageEnhance.Brightness(ela_image).enhance(scale)
    
    ela_cv = cv2.cvtColor(np.array(ela_image), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(ela_cv, cv2.COLOR_BGR2GRAY)
    
    _, thresh = cv2.threshold(gray, 120, 255, cv2.THRESH_BINARY)
    kernel = np.ones((5,5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    img_upload_cv = cv2.cvtColor(np.array(original_img), cv2.COLOR_RGB2BGR)
    has_forgery = False
    
    for cnt in contours:
        if cv2.contourArea(cnt) > 300: 
            has_forgery = True
            x, y, w, h = cv2.boundingRect(cnt)
            cv2.rectangle(img_upload_cv, (x, y), (x + w, y + h), (0, 0, 255), 3)
            cv2.putText(img_upload_cv, "AI: Fake Detected", (x, y - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    return has_forgery, img_upload_cv

# ==========================================
# 4. API ENDPOINTS
# ==========================================
@app.post("/seal")
async def seal(file: UploadFile = File(...), watermark_id: str = Form(...)):
    raw = await file.read()
    nparr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Đóng dấu DCT
    sealed_img = embed_dct_blind(img, watermark_id)
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
    
    # Trích xuất bản quyền bằng DCT
    try: wm = extract_dct_blind(img_upload)
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
                
                # LOGIC AI THÔNG MINH KÉP (Trừ ảnh vật lý + ELA)
                if dist <= 25 and image_hash != db_sha:
                    is_forged = False
                    img_result = img_upload.copy()
                    
                    # CHIẾN THUẬT 1: Trừ điểm ảnh (Bắt lỗi vẽ bậy, chèn chữ siêu chuẩn)
                    if db_blob:
                            nparr_db = np.frombuffer(db_blob, np.uint8)
                            img_real = cv2.imdecode(nparr_db, cv2.IMREAD_COLOR)
                            
                            h, w, _ = img_upload.shape
                            img_real_resized = cv2.resize(img_real, (w, h))
                            
                            diff = cv2.absdiff(img_upload, img_real_resized)
                            gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
                            
                            # Hạ Threshold xuống 20 để nhạy hơn với các nét bút mờ
                            _, thresh = cv2.threshold(gray, 20, 255, cv2.THRESH_BINARY)
                            
                            # [SỬA Ở ĐÂY] Tăng size kernel và dùng DILATE để nối các nét chữ rời rạc thành 1 khối
                            kernel = np.ones((15, 15), np.uint8) 
                            thresh = cv2.dilate(thresh, kernel, iterations=2) 
                            
                            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                            
                            for cnt in contours:
                                if cv2.contourArea(cnt) > 200: # Tăng diện tích lọc nhiễu lên một chút
                                    is_forged = True
                                    x, y, bw, bh = cv2.boundingRect(cnt)
                                    # Vẽ khung to hơn vùng phát hiện 5 pixel cho đẹp mắt
                                    cv2.rectangle(img_result, (x - 5, y - 5), (x + bw + 5, y + bh + 5), (0, 0, 255), 3)
                                    cv2.putText(img_result, "Fake Detected", (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

                    # CHIẾN THUẬT 2: Nếu trừ ảnh không bắt được vết, dùng ELA quét lớp nén
                    if not is_forged:
                        is_forged, img_result = perform_ela(raw_bytes)

                    # Đóng gói ảnh báo cáo gửi về Frontend
                    if is_forged:
                        _, buf = cv2.imencode('.png', img_result)
                        forgery_b64 = base64.b64encode(buf).decode('utf-8')

                best_match = {
                    "sha256": db_sha,
                    "distance": dist,
                    "watermark_id": db_wm,
                    "forgery_image": forgery_b64
                }

    if best_match and best_match['distance'] > 25:
        best_match = None

    with db_conn() as con:
        total = con.execute("SELECT COUNT(*) FROM sealed_records").fetchone()[0]

    return JSONResponse({
        "sha256": image_hash,
        "dhash": current_dhash,
        "watermark_id_extracted": wm,
        "best_match": best_match,
        "total_in_db": total
    })

@app.get("/records")
def get_records(limit: int = 20):
    """Return recent sealed records and total count for dashboard use."""
    with db_conn() as con:
        rows = con.execute("SELECT sha256, dhash, watermark_id, created_at FROM sealed_records ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        total = con.execute("SELECT COUNT(*) FROM sealed_records").fetchone()[0]

    records = []
    for r in rows:
        records.append({
            "sha256": r[0],
            "dhash": r[1],
            "watermark_id": r[2],
            "created_at": r[3]
        })

    return JSONResponse({"total": total, "records": records})
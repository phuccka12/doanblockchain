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
import re
import base64
import requests
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from reedsolo import RSCodec, ReedSolomonError
from skimage.metrics import structural_similarity as ssim

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
            orig_dhash TEXT DEFAULT '',
            watermark_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            original_blob BLOB,
            registrant_name TEXT DEFAULT '',
            registrant_age INTEGER DEFAULT NULL,
            registered INTEGER DEFAULT 0,
            tx_hash TEXT DEFAULT '',
            owner TEXT DEFAULT '',
            ipfs_link TEXT DEFAULT ''
        )
        """)
        # Ensure columns exist for older DBs (migration)
        cur = con.execute("PRAGMA table_info(sealed_records)").fetchall()
        cols = [c[1] for c in cur]
        if 'registrant_name' not in cols:
            try:
                con.execute("ALTER TABLE sealed_records ADD COLUMN registrant_name TEXT DEFAULT ''")
            except Exception:
                pass
        if 'orig_dhash' not in cols:
            try:
                con.execute("ALTER TABLE sealed_records ADD COLUMN orig_dhash TEXT DEFAULT ''")
            except Exception:
                pass
        if 'registered' not in cols:
            try:
                con.execute("ALTER TABLE sealed_records ADD COLUMN registered INTEGER DEFAULT 0")
            except Exception:
                pass
        if 'tx_hash' not in cols:
            try:
                con.execute("ALTER TABLE sealed_records ADD COLUMN tx_hash TEXT DEFAULT ''")
            except Exception:
                pass
        if 'owner' not in cols:
            try:
                con.execute("ALTER TABLE sealed_records ADD COLUMN owner TEXT DEFAULT ''")
            except Exception:
                pass
        if 'registrant_age' not in cols:
            try:
                con.execute("ALTER TABLE sealed_records ADD COLUMN registrant_age INTEGER DEFAULT NULL")
            except Exception:
                pass
        if 'ipfs_link' not in cols:
            try:
                con.execute("ALTER TABLE sealed_records ADD COLUMN ipfs_link TEXT DEFAULT ''")
            except Exception:
                pass
        # Alerts table for recording AI-detected issues
        con.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_sha TEXT,
            message TEXT,
            severity TEXT,
            created_at INTEGER
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
Q = 50 # Hệ số lượng tử hóa. Q càng lớn -> Càng khó bị xóa nhưng ảnh gốc hơi nhiễu

def embed_dct_blind(img, text_id, rs_nsym: int = 32):
    """Giấu ID bản quyền vào miền tần số DCT với Reed-Solomon ECC.

    text_id is encoded as UTF-8 bytes, RS-encoded (nsym parity bytes), then embedded bitwise.
    A 16-bit terminator of '1's is appended to mark the end of the stream.
    """
    # Encode with Reed-Solomon to add error-correction parity
    try:
        rs = RSCodec(rs_nsym)
        msg_bytes = text_id.encode('utf-8')
        if len(msg_bytes) > 255:
            # limit: 1-byte length prefix supports up to 255 bytes message
            msg_bytes = msg_bytes[:255]
        # Prefix with 1-byte length to avoid using an in-band terminator
        prefixed = bytes([len(msg_bytes)]) + msg_bytes
        encoded = rs.encode(prefixed)
    except Exception:
        # Fallback: if RS fails, embed raw UTF-8 bytes (no prefix)
        encoded = text_id.encode('utf-8')

    # Convert to bit string
    binary_id = ''.join(format(b, '08b') for b in encoded) + '1111111111111111'

    img_yuv = cv2.cvtColor(img, cv2.COLOR_BGR2YUV)
    y, u, v = cv2.split(img_yuv)

    y_dct = cv2.dct(np.float32(y))

    start_idx = 20
    for i, bit in enumerate(binary_id):
        row, col = start_idx + i, start_idx + i
        if row >= y_dct.shape[0] or col >= y_dct.shape[1]:
            break

        val = y_dct[row, col]
        quotient = round(val / Q)

        if int(bit) == 1:
            if quotient % 2 == 0:
                quotient += 1
        else:
            if quotient % 2 != 0:
                quotient += 1

        y_dct[row, col] = quotient * Q

    y_idct = cv2.idct(y_dct)
    y_idct = np.clip(y_idct, 0, 255).astype(np.uint8)

    return cv2.cvtColor(cv2.merge((y_idct, u, v)), cv2.COLOR_YUV2BGR)

def extract_dct_blind(img, rs_nsym: int = 32):
    """Trích xuất ID bản quyền từ miền tần số và thử decode Reed-Solomon.

    Returns a string (latin-1 mapping of raw bytes) so downstream sanitization can operate as before.
    """
    img_yuv = cv2.cvtColor(img, cv2.COLOR_BGR2YUV)
    y, _, _ = cv2.split(img_yuv)
    y_dct = cv2.dct(np.float32(y))

    extracted_bits = ""
    start_idx = 20

    for i in range(2000):
        row, col = start_idx + i, start_idx + i
        if row >= y_dct.shape[0] or col >= y_dct.shape[1]:
            break

        val = y_dct[row, col]
        quotient = round(val / Q)

        if quotient % 2 == 0:
            extracted_bits += '0'
        else:
            extracted_bits += '1'

        if extracted_bits.endswith('1111111111111111'):
            extracted_bits = extracted_bits[:-16]
            break

    # convert bits to bytes
    b_arr = bytearray()
    for i in range(0, len(extracted_bits), 8):
        byte = extracted_bits[i:i+8]
        if len(byte) == 8:
            try:
                b_arr.append(int(byte, 2))
            except Exception:
                pass

    # First try Reed-Solomon decode
    try:
        rs = RSCodec(rs_nsym)
        decoded = rs.decode(bytes(b_arr))
        # reedsolo may return a tuple (msg, ecc) depending on version
        if isinstance(decoded, tuple):
            decoded_msg = decoded[0]
        else:
            decoded_msg = decoded

        # If we embedded with a 1-byte length prefix, parse it
        if len(decoded_msg) >= 1:
            length = decoded_msg[0]
            payload = decoded_msg[1:1+length]
            try:
                res = payload.decode('utf-8', errors='replace')
            except Exception:
                res = payload.decode('latin-1', errors='replace')
        else:
            # no length prefix: try decode whole
            try:
                res = decoded_msg.decode('utf-8', errors='replace')
            except Exception:
                res = decoded_msg.decode('latin-1', errors='replace')
    except Exception:
        # If RS fails, fallback to a best-effort printable string from raw bytes
        try:
            raw_str = ''.join(chr(b) for b in b_arr)
            res = ''.join(filter(lambda x: x.isprintable(), raw_str))
        except Exception:
            res = ''

    return res

# ==========================================
# 3. LÕI KỸ THUẬT AI: PHÁT HIỆN GIẢ MẠO (ELA)
# Tự động soi vết Photoshop cắt ghép
# ==========================================
def detect_crop_region(img_upload, img_original):
    """Detect where img_upload (a crop/derivative) fits inside img_original.

    Uses template matching to locate the crop region, then does a pixel-diff
    between the upload and the corresponding area of the original to highlight
    any extra drawings / modifications (e.g. hand-drawn strokes) on top of the crop.

    Returns:
      - found (bool)
      - annotated_upload (ndarray): the UPLOAD image with:
            * orange outer border  (CROP DETECTED)
            * red bounding boxes   around any drawn/modified regions
      - annotated_original (ndarray): the ORIGINAL image with the crop region
            highlighted (red bounding box)
    """
    annotated_original = img_original.copy()
    annotated_upload   = img_upload.copy()
    try:
        h_up, w_up = img_upload.shape[:2]
        h_or, w_or = img_original.shape[:2]

        # Only makes sense when upload is smaller than original
        if w_up >= w_or and h_up >= h_or:
            return False, annotated_upload, annotated_original

        gray_orig = cv2.cvtColor(img_original, cv2.COLOR_BGR2GRAY)
        gray_up   = cv2.cvtColor(img_upload,   cv2.COLOR_BGR2GRAY)

        # Template must be <= source; scale down if needed
        template = gray_up
        tw, th = w_up, h_up
        if tw > w_or or th > h_or:
            scale = min(w_or / tw, h_or / th) * 0.95
            tw = int(tw * scale)
            th = int(th * scale)
            template = cv2.resize(gray_up, (tw, th), interpolation=cv2.INTER_AREA)

        result_map = cv2.matchTemplate(gray_orig, template, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result_map)

        if max_val >= 0.40:
            x, y = max_loc
            conf_pct = f"{max_val*100:.0f}%"

            # ── LEFT panel: annotate ORIGINAL with crop region box ──────────
            cv2.rectangle(annotated_original, (x, y), (x + tw, y + th), (0, 0, 255), 4)
            cv2.putText(annotated_original, f"CROP REGION ({conf_pct})",
                        (x, max(0, y - 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)

            # ── RIGHT panel: annotate UPLOAD ─────────────────────────────────
            # 1) Orange outer border: marks the whole image as a detected crop
            cv2.rectangle(annotated_upload, (2, 2), (w_up - 2, h_up - 2), (0, 165, 255), 4)
            cv2.putText(annotated_upload, f"CROP DETECTED ({conf_pct})",
                        (10, 36), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 165, 255), 2)

            # 2) Red boxes: pixel-diff between upload and the matching crop patch
            #    to highlight drawings / extra content added on top of the crop.
            try:
                # Extract the matching region from the original at the same size as upload
                patch_orig = img_original[y: y + th, x: x + tw]
                # Resize both to the upload's native resolution for a fair diff
                patch_resized = cv2.resize(patch_orig, (w_up, h_up), interpolation=cv2.INTER_LINEAR)

                diff = cv2.absdiff(img_upload, patch_resized)
                diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)

                # Threshold – 30 catches visible strokes but ignores minor JPEG noise
                _, diff_thresh = cv2.threshold(diff_gray, 30, 255, cv2.THRESH_BINARY)

                # Clean up tiny noise
                kernel = np.ones((5, 5), np.uint8)
                diff_thresh = cv2.morphologyEx(diff_thresh, cv2.MORPH_OPEN,  kernel)
                diff_thresh = cv2.dilate(diff_thresh, kernel, iterations=2)

                contours, _ = cv2.findContours(diff_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                draw_count = 0
                for cnt in contours:
                    if cv2.contourArea(cnt) > 150:
                        bx, by, bw, bh = cv2.boundingRect(cnt)
                        cv2.rectangle(annotated_upload,
                                      (max(0, bx - 4), max(0, by - 4)),
                                      (min(w_up - 1, bx + bw + 4), min(h_up - 1, by + bh + 4)),
                                      (0, 0, 255), 3)
                        cv2.putText(annotated_upload, "MODIFIED",
                                    (max(0, bx - 4), max(18, by - 8)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)
                        draw_count += 1
            except Exception as de:
                print("[detect_crop_region] diff error:", de)

            return True, annotated_upload, annotated_original

    except Exception as e:
        print("[detect_crop_region] error:", e)

    return False, annotated_upload, annotated_original


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
async def seal(file: UploadFile = File(...), watermark_id: str = Form(...), registrant_name: str = Form(''), registrant_age: int = Form(None)):
    raw = await file.read()
    nparr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    # compute original dhash (before embedding) so we can accurately match originals later
    try:
        orig_dhash = calc_dhash(raw)
    except Exception:
        orig_dhash = ''

    # ── Duplicate / derivative guard ─────────────────────────────────────────
    # Before sealing, check if this image (or a visually similar one) already
    # exists in DB.  We compare the raw upload against:
    #   • the stored sealed blob  (catches re-upload of the exact sealed image)
    #   • orig_dhash string       (catches re-upload of the original before sealing)
    # Thresholds are intentionally wider here than in /verify so minor JPEG
    # compression or small crops are still caught at seal time.
    SEAL_DHASH_TH  = 12   # very tight: same image even after JPEG re-save
    SEAL_PHASH_TH  = 10
    SEAL_SSIM_TH   = 0.80  # 80%+ structural similarity → treat as duplicate
    SEAL_ORIG_DH_TH = 8   # orig_dhash string comparison (pre-watermark)

    try:
        # Re-encode upload as PNG for fair comparison with stored PNG blobs
        _, _enc = cv2.imencode('.png', img)
        upload_png_bytes = _enc.tobytes()

        with db_conn() as con:
            existing = con.execute(
                "SELECT sha256, watermark_id, registrant_name, registered, orig_dhash, original_blob FROM sealed_records"
            ).fetchall()

        for ex_sha, ex_wm, ex_name, ex_reg, ex_orig_dh, ex_blob in existing:
            # Fast check: compare orig_dhash strings first (very cheap)
            if orig_dhash and ex_orig_dh:
                od = hamming_distance(orig_dhash, ex_orig_dh)
                if od <= SEAL_ORIG_DH_TH:
                    owner_info = f"Người đăng ký: {ex_name}. " if ex_name else ""
                    status = "đã đăng ký on-chain" if ex_reg else "đã được seal"
                    return JSONResponse(
                        {"error": f"Ảnh này {status} trước đó ({owner_info}Định danh: {ex_wm}). Không thể seal lại.",
                         "duplicate_sha": ex_sha, "registered": bool(ex_reg)},
                        status_code=409
                    )

            # Slower check: full metrics against stored blob
            if ex_blob:
                try:
                    metrics = compare_two_images_bytes(upload_png_bytes, bytes(ex_blob))
                    dh = metrics.get('dhash_distance')
                    ph = metrics.get('phash_distance')
                    ss = metrics.get('ssim')

                    is_dup = (
                        (dh is not None and dh <= SEAL_DHASH_TH) or
                        (ph is not None and ph <= SEAL_PHASH_TH) or
                        (ss is not None and ss >= SEAL_SSIM_TH)
                    )
                    if is_dup:
                        owner_info = f"Người đăng ký: {ex_name}. " if ex_name else ""
                        status = "đã đăng ký on-chain" if ex_reg else "đã được seal"
                        return JSONResponse(
                            {"error": f"Ảnh tương tự {status} trước đó ({owner_info}Định danh: {ex_wm}). "
                                      f"dHash={dh} pHash={ph} SSIM={round(ss,2) if ss else None}",
                             "duplicate_sha": ex_sha, "registered": bool(ex_reg),
                             "metrics": {"dhash": dh, "phash": ph, "ssim": ss}},
                            status_code=409
                        )
                except Exception:
                    pass
    except Exception as guard_err:
        print(f"[SEAL] duplicate guard error: {guard_err}")
    # ─────────────────────────────────────────────────────────────────────────

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
                "INSERT OR REPLACE INTO sealed_records (sha256, dhash, orig_dhash, watermark_id, created_at, original_blob, registrant_name, registrant_age, registered, tx_hash, owner, ipfs_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (image_hash, dhash_str, orig_dhash or '', watermark_id, int(time.time()), sealed_bytes, registrant_name or '', registrant_age, 0, '', '', ipfs_link or '')
            )
            con.commit()
    except Exception as e:
        print("DB Error:", e)
    # Debug log: announce new sealed SHA to server logs
    try:
        print(f"[SEAL] sha={image_hash} watermark_id={watermark_id} registrant_name={registrant_name}")
    except Exception:
        pass

    headers = {
        "X-Image-SHA256": image_hash,
        "X-Image-DHASH": dhash_str,
        "X-IPFS-Link": ipfs_link if ipfs_link else ""
    }
    return Response(content=sealed_bytes, media_type="image/png", headers=headers)

class UrlRequest(BaseModel):
    image_url: str


class ConfirmRegistration(BaseModel):
    sha: str
    tx_hash: str
    owner: str | None = None
    registrant_name: str | None = None


@app.post("/confirm_registration")
def confirm_registration(item: ConfirmRegistration):
    """Mark a sealed record as registered on-chain and attach tx/owner info. Optionally update registrant name."""
    try:
        with db_conn() as con:
            # Update registration fields and optionally registrant_name
            if item.registrant_name is not None:
                con.execute(
                    "UPDATE sealed_records SET registered = 1, tx_hash = ?, owner = ?, registrant_name = ? WHERE sha256 = ?",
                    (item.tx_hash or '', item.owner or '', item.registrant_name or '', item.sha)
                )
            else:
                con.execute(
                    "UPDATE sealed_records SET registered = 1, tx_hash = ?, owner = ? WHERE sha256 = ?",
                    (item.tx_hash or '', item.owner or '', item.sha)
                )
            con.commit()
        print(f"[CONFIRM] sha={item.sha} tx={item.tx_hash} owner={item.owner} registrant_name={item.registrant_name}")
        return JSONResponse({"ok": True})
    except Exception as e:
        print("[CONFIRM] error:", e)
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

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
    # (phash and ssim grayscale frames are computed per-candidate inside compare_two_images_bytes)
    
    # Trích xuất bản quyền bằng DCT
    try:
        raw_wm = extract_dct_blind(img_upload)
    except:
        raw_wm = ""

    # Sanitization: remove noisy characters that come from bit errors
    # We'll produce a cleaned ASCII-only watermark id, a confidence score, and a small raw preview
    watermark_confidence = None
    watermark_raw_preview = None
    wm = ""
    if raw_wm:
        try:
            raw_len = len(raw_wm)
            # Preview: make non-printable visible as '?', limit length
            watermark_raw_preview = ''.join((ch if 32 <= ord(ch) < 127 else '?') for ch in raw_wm)[:128]
            # Keep only ASCII letters, numbers, space, underscore and hyphen
            wm_clean = re.sub(r"[^A-Za-z0-9 _\-]", "", raw_wm)
            wm = wm_clean.strip()[:128]
            # Confidence: based on how many expected characters were recovered cleanly.
            # Count printable ASCII chars in raw (before cleaning) vs total raw length —
            # this is a better proxy for "how much of the RS-decoded payload is readable"
            # than comparing cleaned vs raw (which penalises underscores etc.)
            printable_raw = sum(1 for ch in raw_wm if 32 <= ord(ch) < 127)
            if raw_len > 0:
                watermark_confidence = int((printable_raw / raw_len) * 100)
            else:
                watermark_confidence = 0
        except Exception:
            wm = ""
            watermark_confidence = None
            watermark_raw_preview = None

    # thresholds for multi-metric matching
    # Wider than the /compare endpoint so JPEG-compressed or lightly-cropped
    # derivatives are still detected as related works.
    DHASH_THRESHOLD = 30   # was 25 — catches minor JPEG noise & slight crop
    PHASH_THRESHOLD = 15   # was 12
    SSIM_THRESHOLD  = 0.40 # was 0.45 — lower = easier to match (more sensitive)

    best_match = None

    # -----------------------------------------------------------------
    # Re-encode the uploaded image as PNG so comparisons are consistent
    # (DB blobs are stored as sealed PNG; comparing raw upload bytes directly
    # would include JPEG artefacts that inflate all distances artificially)
    try:
        _arr = np.frombuffer(raw_bytes, np.uint8)
        _img = cv2.imdecode(_arr, cv2.IMREAD_COLOR)
        if _img is not None:
            _, _enc = cv2.imencode('.png', _img)
            compare_upload_bytes = _enc.tobytes()
        else:
            compare_upload_bytes = raw_bytes
    except Exception:
        compare_upload_bytes = raw_bytes

    candidates = []
    with db_conn() as con:
        rows = con.execute("SELECT sha256, dhash, orig_dhash, watermark_id, original_blob, registered FROM sealed_records").fetchall()
        for row in rows:
            db_sha, db_dhash, db_orig_dhash, db_wm, db_blob, db_registered = row
            # try to get the blob bytes
            if not db_blob:
                continue

            # Use helper to compute dhash/phash/ssim between uploaded image and db blob
            # We compare the re-encoded upload bytes so format differences don't skew metrics
            try:
                metrics = compare_two_images_bytes(compare_upload_bytes, db_blob)
            except Exception:
                metrics = {'dhash_distance': None, 'phash_distance': None, 'ssim': None}

            dhash_dist = metrics.get('dhash_distance')
            phash_dist = metrics.get('phash_distance')
            ssim_score = metrics.get('ssim')

            # Also compare against the pre-watermark orig_dhash so that uploading
            # the original (before sealing) is still detected as a derivative.
            orig_dhash_dist = None
            if db_orig_dhash:
                try:
                    upload_dhash_str = calc_dhash(compare_upload_bytes)
                    orig_dhash_dist = hamming_distance(upload_dhash_str, db_orig_dhash)
                    # If orig_dhash matches but sealed blob dhash didn't, override dhash_dist
                    if orig_dhash_dist <= DHASH_THRESHOLD:
                        if dhash_dist is None or dhash_dist > orig_dhash_dist:
                            dhash_dist = orig_dhash_dist
                except Exception:
                    pass

            matched_by = []
            if dhash_dist is not None and dhash_dist <= DHASH_THRESHOLD:
                matched_by.append('dhash')
            if phash_dist is not None and phash_dist <= PHASH_THRESHOLD:
                matched_by.append('phash')
            if ssim_score is not None and ssim_score >= SSIM_THRESHOLD:
                matched_by.append('ssim')

            candidates.append({
                'sha': db_sha,
                'dhash': dhash_dist,
                'phash': phash_dist,
                'ssim': ssim_score,
                'watermark_id': db_wm,
                'blob': db_blob,
                'matched_by': matched_by,
                'registered': bool(db_registered),
            })

    # Rank candidates: prefer more matching metrics, higher SSIM, lower phash, lower dhash
    def rank_key(c):
        score_count = len(c.get('matched_by', []))
        ssim_val = c.get('ssim') if c.get('ssim') is not None else -1.0
        phash_val = c.get('phash') if c.get('phash') is not None else 9999
        dhash_val = c.get('dhash') if c.get('dhash') is not None else 9999
        # We want descending score_count, descending ssim, ascending phash, ascending dhash
        return (-score_count, -ssim_val, phash_val, dhash_val)

    candidates = [c for c in candidates if c.get('matched_by')]
    if candidates:
        candidates.sort(key=rank_key)
        best = candidates[0]
        forgery_b64 = None
        forgery_original_b64 = None

        # Run forgery detection pipeline for chosen best candidate
        if best and image_hash != best['sha']:
            is_forged = False
            img_result         = img_upload.copy()   # shown on RIGHT (annotated upload)
            img_result_orig    = None                 # shown on LEFT  (annotated original, crop only)
            try:
                nparr_db = np.frombuffer(best['blob'], np.uint8)
                img_real = cv2.imdecode(nparr_db, cv2.IMREAD_COLOR)

                # --- Strategy 1: Crop/derivative detection via template matching ---
                # Returns annotated_upload (right panel) and annotated_original (left panel)
                crop_found, ann_upload, ann_orig = detect_crop_region(img_upload, img_real)
                if crop_found:
                    is_forged       = True
                    img_result      = ann_upload   # RIGHT: uploaded image with orange border
                    img_result_orig = ann_orig     # LEFT:  original with red crop-region box
                else:
                    # --- Strategy 2: Pixel-diff (for same-size tampered images) ---
                    # Detect drawings, signatures, text overlay, or any pixel-level edit.
                    # We already know image_hash != best['sha'], so images ARE different.
                    # Key: use kernel=3x3 (NOT 9x9) + NO morphologyEx OPEN — large kernels
                    # or OPEN operations erase thin strokes like handwritten signatures.
                    h, w, _ = img_upload.shape
                    img_real_resized = cv2.resize(img_real, (w, h))
                    diff = cv2.absdiff(img_upload, img_real_resized)
                    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
                    _, thresh = cv2.threshold(gray, 25, 255, cv2.THRESH_BINARY)
                    kernel = np.ones((3, 3), np.uint8)   # small kernel preserves thin strokes
                    thresh = cv2.dilate(thresh, kernel, iterations=2)
                    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    for cnt in contours:
                        if cv2.contourArea(cnt) > 200:   # 200 px² filters JPEG noise, catches signatures
                            is_forged = True
                            x, y, bw, bh = cv2.boundingRect(cnt)
                            cv2.rectangle(img_result, (max(0,x-5), max(0,y-5)),
                                          (min(w-1,x+bw+5), min(h-1,y+bh+5)), (0, 0, 255), 3)
                            cv2.putText(img_result, "MODIFIED", (max(0,x-5), max(18,y-8)),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)

            except Exception:
                pass

            # --- Strategy 3: ELA (Photoshop / JPEG re-save artifacts) ---
            # ELA only makes sense for JPEG images; running it on PNG (which uses
            # lossless compression) produces random high-amplitude differences that
            # look like forgeries even on untouched images.  Skip ELA for PNG.
            if not is_forged:
                try:
                    import imghdr as _imghdr
                    _fmt = _imghdr.what(None, h=raw_bytes[:32])
                except Exception:
                    _fmt = None
                if _fmt != 'png':
                    is_forged, img_result = perform_ela(raw_bytes)

            if is_forged:
                _, buf = cv2.imencode('.png', img_result)
                forgery_b64 = base64.b64encode(buf).decode('utf-8')
                # For crop case: also encode the annotated original separately
                if img_result_orig is not None:
                    _, buf_orig = cv2.imencode('.png', img_result_orig)
                    forgery_original_b64 = base64.b64encode(buf_orig).decode('utf-8')
                else:
                    forgery_original_b64 = None
            else:
                forgery_original_b64 = None

        # Compute a distance value that keeps compatibility with frontend logic
        # Frontend (Studio.jsx) currently only shows the provenance tree when
        # `distance <= DHASH_THRESHOLD`. To avoid forcing a frontend change,
        # if the candidate matched by phash/ssim but its raw dhash is > DHASH_THRESHOLD,
        # we clamp the reported distance to DHASH_THRESHOLD so the UI will show the tree.
        raw_dhash = best.get('dhash')
        reported_distance = None
        try:
            if raw_dhash is None:
                reported_distance = DHASH_THRESHOLD
            else:
                # if dhash is already within threshold, keep it; otherwise clamp to threshold
                reported_distance = raw_dhash if raw_dhash <= DHASH_THRESHOLD else DHASH_THRESHOLD
        except Exception:
            reported_distance = DHASH_THRESHOLD

        # Build a compact thumbnail of the original DB image (max 480px) for display
        db_thumb_b64 = None
        try:
            if best.get('blob'):
                _nb = np.frombuffer(best['blob'], np.uint8)
                _ti = cv2.imdecode(_nb, cv2.IMREAD_COLOR)
                if _ti is not None:
                    _th, _tw = _ti.shape[:2]
                    _scale = min(1.0, 480 / max(_tw, _th))
                    _ti = cv2.resize(_ti, (int(_tw*_scale), int(_th*_scale)), interpolation=cv2.INTER_AREA)
                    _, _tbuf = cv2.imencode('.jpg', _ti, [cv2.IMWRITE_JPEG_QUALITY, 82])
                    db_thumb_b64 = base64.b64encode(_tbuf).decode('utf-8')
        except Exception:
            pass

        best_match = {
            'sha256': best['sha'],
            'distance': reported_distance,
            'watermark_id': best.get('watermark_id'),
            'registered': best.get('registered', False),  # whether this record is already on-chain
            'forgery_image': forgery_b64,            # RIGHT panel: annotated upload
            'forgery_original': forgery_original_b64, # LEFT panel: annotated original (crop box)
            'phash_distance': best.get('phash'),
            'ssim_score': best.get('ssim'),
            'matched_by': best.get('matched_by'),
            # Compact thumbnail of the actual original image stored in DB (no annotations)
            'db_thumbnail': db_thumb_b64,
        }
    else:
        best_match = None

    # If the best_match wasn't actually matched by any metric, discard it.
    # (We no longer rely solely on dhash distance; phash or ssim may indicate a match)
    if best_match and (not best_match.get('matched_by')):
        best_match = None

    with db_conn() as con:
        total = con.execute("SELECT COUNT(*) FROM sealed_records").fetchone()[0]

    # If verification found a forgery image for the best match, persist an alert
    try:
        if best_match and best_match.get('forgery_image'):
            with db_conn() as con:
                con.execute(
                    "INSERT INTO alerts (record_sha, message, severity, created_at) VALUES (?, ?, ?, ?)",
                    (best_match.get('sha256'), f"Phát hiện giả mạo cho watermark {best_match.get('watermark_id')}", 'high', int(time.time()))
                )
                con.commit()
    except Exception:
        pass

    # ── Recalculate confidence using known watermark_id from best_match ──────
    # If the DB record's watermark_id is available, compute similarity between
    # the extracted (cleaned) string and the stored ID using character overlap.
    # This gives a much more meaningful "confidence" than the raw-char-ratio above.
    if best_match and best_match.get('watermark_id') and wm:
        try:
            db_wm_id = best_match['watermark_id']
            # Normalise both to the same charset used in watermark extraction
            db_clean = re.sub(r"[^A-Za-z0-9 _\-]", "", db_wm_id).strip()
            # Longest Common Subsequence ratio (simple char-level similarity)
            shorter = min(len(wm), len(db_clean))
            longer  = max(len(wm), len(db_clean))
            if longer > 0:
                # count matching characters at same positions (simplest LCS proxy)
                match_chars = sum(1 for a, b in zip(wm.lower(), db_clean.lower()) if a == b)
                lcs_ratio = match_chars / longer
                # Boost: if extracted string is a substring of db_id or vice-versa, give high score
                if db_clean.lower() in wm.lower() or wm.lower() in db_clean.lower():
                    lcs_ratio = max(lcs_ratio, shorter / longer)
                watermark_confidence = int(lcs_ratio * 100)
        except Exception:
            pass  # keep original confidence

    return JSONResponse({
        "sha256": image_hash,
        "dhash": current_dhash,
        "watermark_id_extracted": wm,
        "watermark_confidence": watermark_confidence,
        "watermark_raw_preview": watermark_raw_preview,
        "best_match": best_match,
        "total_in_db": total
    })

def compare_two_images_bytes(a_bytes: bytes, b_bytes: bytes):
    """Compute dhash distance, phash distance and SSIM between two image byte blobs.

    Returns a dict: {dhash_distance, phash_distance, ssim}
    """
    result = {
        'dhash_distance': None,
        'phash_distance': None,
        'ssim': None
    }
    # dhash (string-based)
    try:
        dh1 = calc_dhash(a_bytes)
        dh2 = calc_dhash(b_bytes)
        result['dhash_distance'] = hamming_distance(dh1, dh2)
    except Exception:
        result['dhash_distance'] = None

    # phash (imagehash.ImageHash)
    try:
        ph1 = imagehash.phash(Image.open(io.BytesIO(a_bytes)).convert('RGB'))
        ph2 = imagehash.phash(Image.open(io.BytesIO(b_bytes)).convert('RGB'))
        result['phash_distance'] = int(ph1 - ph2)
    except Exception:
        result['phash_distance'] = None

    # SSIM (structural similarity) on 256x256 grayscale
    try:
        na = np.frombuffer(a_bytes, np.uint8)
        nb = np.frombuffer(b_bytes, np.uint8)
        ia = cv2.imdecode(na, cv2.IMREAD_COLOR)
        ib = cv2.imdecode(nb, cv2.IMREAD_COLOR)
        if ia is not None and ib is not None:
            ga = cv2.cvtColor(ia, cv2.COLOR_BGR2GRAY)
            gb = cv2.cvtColor(ib, cv2.COLOR_BGR2GRAY)
            ra = cv2.resize(ga, (256, 256), interpolation=cv2.INTER_AREA)
            rb = cv2.resize(gb, (256, 256), interpolation=cv2.INTER_AREA)
            result['ssim'] = float(ssim(ra, rb))
    except Exception:
        result['ssim'] = None

    return result


@app.post("/compare")
async def compare(sha1: str = Form(None), sha2: str = Form(None), file1: UploadFile = File(None), file2: UploadFile = File(None)):
    """Compare two images (by SHA from DB or by uploaded files).

    Provide either (sha1 & sha2) OR (file1 & file2). Returns dhash, phash and ssim values and a suggested match boolean.
    """
    a_bytes = None
    b_bytes = None
    try:
        if sha1 and sha2:
            with db_conn() as con:
                ra = con.execute("SELECT original_blob FROM sealed_records WHERE sha256=?", (sha1,)).fetchone()
                rb = con.execute("SELECT original_blob FROM sealed_records WHERE sha256=?", (sha2,)).fetchone()
            if not ra or not ra[0] or not rb or not rb[0]:
                return JSONResponse({"error": "One or both SHAs not found"}, status_code=404)
            a_bytes = ra[0]
            b_bytes = rb[0]
        else:
            # read uploaded files
            if file1 is None or file2 is None:
                return JSONResponse({"error": "Provide either sha1 & sha2 or file1 & file2"}, status_code=400)
            a_bytes = await file1.read()
            b_bytes = await file2.read()

        metrics = compare_two_images_bytes(a_bytes, b_bytes)

        # heuristics to decide if images are derived versions of each other
        DHASH_THRESHOLD = 25
        PHASH_THRESHOLD = 12
        SSIM_THRESHOLD = 0.45

        matched = False
        matched_by = []
        if metrics.get('dhash_distance') is not None and metrics['dhash_distance'] <= DHASH_THRESHOLD:
            matched = True
            matched_by.append('dhash')
        if metrics.get('phash_distance') is not None and metrics['phash_distance'] <= PHASH_THRESHOLD:
            matched = True
            matched_by.append('phash')
        if metrics.get('ssim') is not None and metrics['ssim'] >= SSIM_THRESHOLD:
            matched = True
            matched_by.append('ssim')

        return JSONResponse({
            "metrics": metrics,
            "matched": matched,
            "matched_by": matched_by
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/records")
def get_records(limit: int = 20, registered_only: bool = False):
    """Return recent sealed records and total counts for dashboard use.

    Query params:
      - limit: max records to return (default 20, use 0 for unlimited)
      - registered_only: if true, only return records that have been confirmed on-chain
    Returns:
      - total: total rows in DB (all, including unregistered)
      - registered_total: rows with registered=1 (confirmed on-chain)
      - records: list of records (filtered if registered_only=True)
    """
    with db_conn() as con:
        # Always compute both totals
        total = con.execute("SELECT COUNT(*) FROM sealed_records").fetchone()[0]
        registered_total = con.execute("SELECT COUNT(*) FROM sealed_records WHERE registered = 1").fetchone()[0]

        # Build query
        where = "WHERE registered = 1" if registered_only else ""
        limit_clause = f"LIMIT {int(limit)}" if limit and limit > 0 else ""
        try:
            rows = con.execute(
                f"SELECT sha256, dhash, watermark_id, created_at, registrant_name, registrant_age, registered, tx_hash, owner, ipfs_link "
                f"FROM sealed_records {where} ORDER BY created_at DESC {limit_clause}"
            ).fetchall()
        except Exception:
            rows = con.execute(
                f"SELECT sha256, dhash, watermark_id, created_at FROM sealed_records {where} ORDER BY created_at DESC {limit_clause}"
            ).fetchall()

    records = []
    for r in rows:
        rec = {
            "sha256": r[0],
            "dhash": r[1],
            "watermark_id": r[2],
            "created_at": r[3]
        }
        if len(r) >= 5:
            rec["registrant_name"] = r[4]
        else:
            rec["registrant_name"] = ""
        if len(r) >= 6:
            rec["registrant_age"] = r[5]
        else:
            rec["registrant_age"] = None
        if len(r) >= 9:
            rec["registered"] = bool(r[6])
            rec["tx_hash"] = r[7]
            rec["owner"] = r[8]
        else:
            rec["registered"] = False
            rec["tx_hash"] = ""
            rec["owner"] = ""
        rec["ipfs_link"] = r[9] if len(r) >= 10 else ""
        records.append(rec)

    return JSONResponse({"total": total, "registered_total": registered_total, "records": records})


@app.get("/thumbnail")
def thumbnail(sha: str, size: int = 220):
    """Return a small JPEG thumbnail for a sealed record stored in DB.

    Params:
      - sha: image sha256 to look up
      - size: maximum width/height in pixels (keeps aspect)
    """
    try:
        with db_conn() as con:
            row = con.execute("SELECT original_blob FROM sealed_records WHERE sha256=?", (sha,)).fetchone()
            if not row or not row[0]:
                return Response(status_code=404)
            blob = row[0]

        nparr = np.frombuffer(blob, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return Response(status_code=500)

        h, w = img.shape[:2]
        scale = float(size) / max(w, h) if max(w, h) > 0 else 1.0
        # compute target size (allow upscaling a bit to avoid browser upscaling blur)
        neww = max(1, int(w * scale))
        newh = max(1, int(h * scale))
        if neww != w or newh != h:
            # Choose interpolation depending on up/down scaling
            if scale < 1.0:
                interp = cv2.INTER_AREA
            else:
                interp = cv2.INTER_CUBIC
            img = cv2.resize(img, (neww, newh), interpolation=interp)

        # Encode as PNG (lossless) to preserve sharpness in thumbnails, using low compression for speed
        ok, buf = cv2.imencode('.png', img, [int(cv2.IMWRITE_PNG_COMPRESSION), 3])
        if not ok:
            return Response(status_code=500)
        return Response(content=buf.tobytes(), media_type='image/png', headers={"Cache-Control": "public, max-age=86400"})
    except Exception:
        return Response(status_code=500)


@app.get("/exists")
def exists(sha: str):
    """Check whether a sealed image sha exists in DB and return the record if found."""
    # Debug log
    try:
        print(f"[EXISTS] query sha={sha}")
    except Exception:
        pass
    with db_conn() as con:
        row = con.execute("SELECT sha256, dhash, watermark_id, created_at, registrant_name, registrant_age, registered, tx_hash, owner FROM sealed_records WHERE sha256 = ?", (sha,)).fetchone()
    if not row:
        return JSONResponse({"exists": False})
    # Only consider it an existing registered record if `registered` is truthy (1)
    registered = bool(row[6]) if len(row) > 6 else False
    if not registered:
        return JSONResponse({"exists": False})
    rec = {
        "sha256": row[0],
        "dhash": row[1],
        "watermark_id": row[2],
        "created_at": row[3],
        "registrant_name": row[4] if len(row) > 4 else "",
        "registrant_age": row[5] if len(row) > 5 else None,
        "tx_hash": row[7] if len(row) > 7 else "",
        "owner": row[8] if len(row) > 8 else "",
    }
    return JSONResponse({"exists": True, "record": rec})


@app.get("/alerts")
def get_alerts(limit: int = 10):
    """Return recent alerts detected by AI."""
    with db_conn() as con:
        rows = con.execute("SELECT id, record_sha, message, severity, created_at FROM alerts ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()

    alerts = []
    for r in rows:
        alerts.append({
            "id": r[0],
            "record_sha": r[1],
            "message": r[2],
            "severity": r[3],
            "created_at": r[4]
        })

    return JSONResponse({"alerts": alerts})


@app.get("/my-assets")
def my_assets(owner: str):
    """Return wallet-centric asset stats for a given owner address.

    Returns:
      - nft_count: number of NFTs registered on-chain owned by this address
      - original_count: works with no parent/derivative link (orig_dhash is empty)
      - derivative_count: works with a parent link
      - protection_events: AI forgery alerts triggered for works owned by this address
      - original_score: percentage of owned works that are originals (0-100)
      - records: full list of owned records (with ipfs_link, sha256, etc.)
    """
    if not owner:
        return JSONResponse({"error": "owner parameter required"}, status_code=400)
    addr = owner.lower().strip()
    try:
        with db_conn() as con:
            rows = con.execute(
                "SELECT sha256, dhash, watermark_id, created_at, registrant_name, registrant_age, "
                "registered, tx_hash, owner, orig_dhash, ipfs_link "
                "FROM sealed_records WHERE registered = 1 AND lower(owner) = ?",
                (addr,)
            ).fetchall()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

    records = []
    sha_list = []
    for r in rows:
        sha_list.append(r[0])
        records.append({
            "sha256":          r[0],
            "dhash":           r[1],
            "watermark_id":    r[2],
            "created_at":      r[3],
            "registrant_name": r[4] or "",
            "registrant_age":  r[5],
            "registered":      bool(r[6]),
            "tx_hash":         r[7] or "",
            "owner":           r[8] or "",
            "orig_dhash":      r[9] or "",
            "ipfs_link":       r[10] or "",
        })

    # Count AI protection events for this owner's works
    protection_events = 0
    if sha_list:
        try:
            with db_conn() as con:
                placeholders = ",".join("?" * len(sha_list))
                protection_events = con.execute(
                    f"SELECT COUNT(*) FROM alerts WHERE record_sha IN ({placeholders})",
                    sha_list
                ).fetchone()[0]
        except Exception:
            protection_events = 0

    nft_count       = len(records)
    # Original = no parent derivative link (orig_dhash empty means user uploaded a fresh image)
    original_count  = sum(1 for r in records if not r["orig_dhash"])
    derivative_count = nft_count - original_count
    original_score  = round((original_count / nft_count * 100) if nft_count > 0 else 0)

    return JSONResponse({
        "owner":             addr,
        "nft_count":         nft_count,
        "original_count":    original_count,
        "derivative_count":  derivative_count,
        "protection_events": protection_events,
        "original_score":    original_score,
        "records":           records,
    })
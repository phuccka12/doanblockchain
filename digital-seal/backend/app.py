import sqlite3
import time
import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse, Response
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
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
# Ethereum wallet signature verification
try:
    from eth_account import Account
    from eth_account.messages import encode_defunct
    ETH_ACCOUNT_AVAILABLE = True
except ImportError:
    ETH_ACCOUNT_AVAILABLE = False
    print("[WARN] eth-account not installed. Wallet signature verification disabled.")

# Initialize Limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="TrustLens - Hệ thống Bảo vệ Bản quyền (Blockchain & AI)")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
PINATA_API_KEY = "4cdf5c25d77c65fdfc40"
PINATA_SECRET_API_KEY = "4203655197473df22420c5e392ef564accffebc0cf5fa07d8812cb1ea0caf1a9"  # ← cần thêm Secret API Key từ Pinata dashboard


# ── Blockchain config ─────────────────────────────────────────────────────────
# Public Sepolia JSON-RPC (không cần API key)
SEPOLIA_RPC_URL    = "https://ethereum-sepolia.blockpi.network/v1/rpc/public"
CONTRACT_ADDRESS   = "0x393eC4498280cB0F75e0edd1e1AE0cc7F3bD3711"
# Function selector: keccak256("getRecordByHash(string)")[:4]
# Verified bằng: from eth_hash.auto import keccak; keccak(b"getRecordByHash(string)").hex()[:8]
FUNC_SELECTOR_GET_RECORD = "cb8370b8"
# ──────────────────────────────────────────────────────────────────────────────


def verify_wallet_signature(wallet_address: str, message: str, signature: str) -> bool:
    """Xác minh chữ ký MetaMask (personal_sign / eth_sign).

    MetaMask dùng `personal_sign` — có prefix: "\x19Ethereum Signed Message:\n{len}"
    Điều này tương đương với EIP-191.

    Returns True nếu signer khớp với wallet_address, False nếu không khớp hoặc lỗi.
    """
    if not ETH_ACCOUNT_AVAILABLE:
        print("[WARN] eth-account không có — bỏ qua xác minh chữ ký")
        return True  # fallback: không chặn nếu thư viện chưa cài
    try:
        msg = encode_defunct(text=message)
        recovered = Account.recover_message(msg, signature=signature)
        return recovered.lower() == wallet_address.lower()
    except Exception as e:
        print(f"[WALLET-SIG] verify error: {e}")
        return False

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
        if 'parent_hash' not in cols:
            try:
                con.execute("ALTER TABLE sealed_records ADD COLUMN parent_hash TEXT DEFAULT ''")
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

def upload_to_ipfs(file_bytes: bytes, watermark_id: str = "", sha256_hex: str = "", registrant_name: str = "") -> str | None:
    """Upload ảnh và metadata JSON lên IPFS qua Pinata.

    Flow chuẩn ERC-721:
      1. Upload ảnh → image_cid
      2. Tạo metadata JSON { name, description, image: ipfs://{image_cid}, attributes }
      3. Upload metadata JSON → metadata_cid
      4. Trả về "ipfs://{metadata_cid}" làm tokenURI cho Smart Contract

    Nếu Pinata chưa cấu hình → trả về None (bỏ qua bước IPFS).
    """
    if "YOUR" in PINATA_API_KEY or "YOUR" in PINATA_SECRET_API_KEY:
        print("[IPFS] Pinata chưa cấu hình – bỏ qua IPFS upload")
        return None

    headers = {
        "pinata_api_key":        PINATA_API_KEY,
        "pinata_secret_api_key": PINATA_SECRET_API_KEY,
    }

    try:
        # ── Bước 1: Upload ảnh ──────────────────────────────────────────────
        res_img = requests.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            files={"file": (f"trustlens_{sha256_hex[:8] or 'image'}.png", file_bytes, "image/png")},
            headers=headers,
            timeout=30,
        )
        if res_img.status_code != 200:
            print(f"[IPFS] Upload ảnh thất bại: HTTP {res_img.status_code} – {res_img.text[:120]}")
            return None

        image_cid = res_img.json()["IpfsHash"]
        image_ipfs_url = f"ipfs://{image_cid}"
        print(f"[IPFS] ✅ Ảnh đã upload: {image_ipfs_url}")

        # ── Bước 2: Tạo metadata JSON chuẩn ERC-721 ─────────────────────────
        import json
        metadata = {
            "name":        f"TrustLens – {watermark_id or sha256_hex[:12]}",
            "description": (
                f"Tác phẩm được đăng ký bản quyền trên TrustLens "
                f"(Blockchain + AI Digital Watermarking).\n"
                f"Người đăng ký: {registrant_name or 'Không rõ'}."
            ),
            "image":       image_ipfs_url,
            "external_url": "https://trustlens.app",
            "attributes": [
                {"trait_type": "Watermark ID",    "value": watermark_id or ""},
                {"trait_type": "SHA-256",         "value": sha256_hex or ""},
                {"trait_type": "Người đăng ký",  "value": registrant_name or ""},
                {"trait_type": "Nền tảng",        "value": "TrustLens"},
            ],
        }
        metadata_bytes = json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8")

        # ── Bước 3: Upload metadata JSON ────────────────────────────────────
        res_meta = requests.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            files={"file": ("metadata.json", metadata_bytes, "application/json")},
            headers=headers,
            timeout=30,
        )
        if res_meta.status_code != 200:
            print(f"[IPFS] Upload metadata thất bại: HTTP {res_meta.status_code} – bỏ qua")
            # Fallback: trả về link ảnh thay vì metadata
            return f"https://gateway.pinata.cloud/ipfs/{image_cid}"

        meta_cid = res_meta.json()["IpfsHash"]
        token_uri = f"ipfs://{meta_cid}"
        print(f"[IPFS] ✅ Metadata đã upload: {token_uri}")
        print(f"[IPFS]    Gateway: https://gateway.pinata.cloud/ipfs/{meta_cid}")
        return token_uri

    except requests.exceptions.Timeout:
        print("[IPFS] Timeout khi upload lên Pinata")
    except Exception as e:
        print(f"[IPFS] Lỗi: {e}")
    return None


# ==========================================
# 2. LÕI KỸ THUẬT: THỦY VÂN TẦN SỐ (DCT) 
# Chống nén ảnh JPEG, Resize, Cắt xén
# ==========================================
Q = 50 # Hệ số lượng tử hóa. Q càng lớn -> Càng khó bị xóa nhưng ảnh gốc hơi nhiễu
MIN_IMG_SIZE_FOR_WATERMARK = 64  # Kích thước tối thiểu (px) để embed DCT watermark

def embed_dct_blind(img, text_id, rs_nsym: int = 32):
    """Giấu ID bản quyền vào miền tần số DCT với Reed-Solomon ECC.

    text_id is encoded as UTF-8 bytes, RS-encoded (nsym parity bytes), then embedded bitwise.
    A 16-bit terminator of '1's is appended to mark the end of the stream.
    Returns the original image unchanged if it is too small to safely embed a watermark.
    """
    # Guard: ảnh quá nhỏ không thể chứa đủ DCT coefficients
    h_img, w_img = img.shape[:2]
    if h_img < MIN_IMG_SIZE_FOR_WATERMARK or w_img < MIN_IMG_SIZE_FOR_WATERMARK:
        print(f"[EMBED] Ảnh quá nhỏ ({w_img}x{h_img}) để embed watermark – trả về ảnh gốc.")
        return img

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

    # Tính số bit tối đa có thể chứa trên đường chéo (trừ vùng bắt đầu start_idx)
    max_bits = min(y_dct.shape[0], y_dct.shape[1]) - 20
    if len(binary_id) > max_bits:
        print(f"[EMBED] Cảnh báo: watermark ({len(binary_id)} bits) vượt quá dung lượng ({max_bits} bits) – sẽ bị cắt.")

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

        if max_val >= 0.62:  # Ngưỡng tin cậy: ≥62% tránh false positive. Trước đây là 0.40 (quá thấp).
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

                # Dùng kernel NHỎ (3×3) + KHÔNG có MORPH_OPEN để giữ nét chữ ký mỏng.
                # Kernel 5×5 + OPEN sẽ xóa mất các nét vẽ tay mỏng (bút ký, viết tay).
                # Cùng chiến lược với Strategy 2 (Pixel Diff cho ảnh full-size).
                kernel = np.ones((3, 3), np.uint8)
                diff_thresh = cv2.dilate(diff_thresh, kernel, iterations=2)

                contours, _ = cv2.findContours(diff_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                draw_count = 0
                for cnt in contours:
                    if cv2.contourArea(cnt) > 80:  # 80px² bắt được nét bút mỏng (trước: 150)
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
@limiter.limit("5/minute")
async def seal(
    request: Request,
    file: UploadFile = File(...),
    watermark_id: str = Form(...),
    registrant_name: str = Form(''),
    registrant_age: int = Form(None),
    # Wallet signature (tùy chọn – bắt buộc khi gọi từ frontend chính thức)
    wallet_address: str = Form(''),
    signature: str = Form(''),
):
    """Đóng dấu bản quyền DCT và lưu vào DB.

    Nếu wallet_address + signature được cung cấp → xác minh EIP-191 signature trước.
    Message phải có format: "TrustLens|{watermark_id}|{wallet_address}"
    Nếu không cung cấp (test local / backwards compat) → bỏ qua kiểm tra.
    """
    # ── Xác minh chữ ký MetaMask (nếu có) ────────────────────────────────────
    if wallet_address and signature:
        expected_msg = f"TrustLens|{watermark_id}|{wallet_address}"
        if not verify_wallet_signature(wallet_address, expected_msg, signature):
            print(f"[SEAL][AUTH] Chữ ký không hợp lệ: wallet={wallet_address} wm={watermark_id}")
            return JSONResponse(
                {"error": "Chữ ký ví không hợp lệ. Vui lòng ký lại bằng MetaMask."},
                status_code=401
            )
        print(f"[SEAL][AUTH] ✓ Chữ ký hợp lệ: wallet={wallet_address[:10]}... wm={watermark_id}")
    else:
        print(f"[SEAL] Không có chữ ký wallet → tiếp tục (backwards compat / test mode)")
    # ─────────────────────────────────────────────────────────────────────────

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
    SEAL_DHASH_TH   = 8    # ≤8/64 bits khác nhau → gần như cùng ảnh (trước đây 12, quá rộng)
    SEAL_PHASH_TH   = 8    # tương tự
    SEAL_SSIM_TH    = 0.92 # ≥92% cấu trúc giống nhau mới là duplicate (trước đây 0.80, quá thấp)
    SEAL_ORIG_DH_TH = 4    # orig_dhash: chỉ bắt ảnh gần như y hệt (trước đây 8, gây false positive)
    # Yêu cầu ít nhất 2/3 metric đồng thuận → tránh false positive từ 1 metric nhiễu

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
            # Chỉ dùng orig_dhash khi khoảng cách RẤT nhỏ (≤4) để tránh false positive
            if orig_dhash and ex_orig_dh:
                od = hamming_distance(orig_dhash, ex_orig_dh)
                if od <= SEAL_ORIG_DH_TH:
                    # ── Logic mới: nếu record cũ CHƯA lên chain (registered=0)
                    # → xóa và cho phép seal lại (người dùng cần thử lại luồng)
                    # → chỉ chặn nếu đã đăng ký on-chain (registered=1)
                    if not ex_reg:
                        print(f"[SEAL] Record matched orig_dhash (dist={od}) nhưng registered=0 "
                              f"→ xóa và cho phép re-seal: sha={ex_sha[:12]}... wm={ex_wm}")
                        with db_conn() as _del_con:
                            _del_con.execute("DELETE FROM sealed_records WHERE sha256=?", (ex_sha,))
                            _del_con.commit()
                        continue  # cho phép tiếp tục seal
                    owner_info = f"Người đăng ký: {ex_name}. " if ex_name else ""
                    print(f"[SEAL][DUPLICATE] orig_dhash match: dist={od} vs sha={ex_sha[:12]}... wm={ex_wm}")
                    return JSONResponse(
                        {"error": f"Ảnh này đã đăng ký on-chain ({owner_info}Định danh: {ex_wm}). Không thể seal lại.",
                         "duplicate_sha": ex_sha, "registered": True},
                        status_code=409
                    )

            # Slower check: full metrics against stored blob
            # Yêu cầu ÍT NHẤT 2/3 metric khớp để tránh false positive từ 1 metric nhiễu
            if ex_blob:
                try:
                    metrics = compare_two_images_bytes(upload_png_bytes, bytes(ex_blob))
                    dh = metrics.get('dhash_distance')
                    ph = metrics.get('phash_distance')
                    ss = metrics.get('ssim')

                    hit_dh = (dh is not None and dh <= SEAL_DHASH_TH)
                    hit_ph = (ph is not None and ph <= SEAL_PHASH_TH)
                    hit_ss = (ss is not None and ss >= SEAL_SSIM_TH)
                    hit_count = sum([hit_dh, hit_ph, hit_ss])

                    # Debug log mọi lúc để chẩn đoán
                    print(f"[SEAL][CHECK] vs sha={ex_sha[:12]}... dH={dh}({'✓' if hit_dh else '✗'}) "
                          f"pH={ph}({'✓' if hit_ph else '✗'}) SSIM={round(ss,3) if ss else None}({'✓' if hit_ss else '✗'}) "
                          f"hits={hit_count}/3")

                    # Cần tối thiểu 2 metric đồng thuận mới báo duplicate
                    is_dup = (hit_count >= 2)
                    if is_dup:
                        owner_info = f"Người đăng ký: {ex_name}. " if ex_name else ""
                        matched_metrics = (["dHash" if hit_dh else None,
                                            "pHash" if hit_ph else None,
                                            "SSIM"  if hit_ss else None])
                        matched_metrics = [m for m in matched_metrics if m]
                        print(f"[SEAL][DUPLICATE] blob match ({', '.join(matched_metrics)}): dH={dh} pH={ph} SSIM={round(ss,3) if ss else None}")

                        # ── Logic mới: nếu record cũ CHƯA lên chain → xóa, cho re-seal ──
                        if not ex_reg:
                            print(f"[SEAL] Blob match nhưng registered=0 → xóa và cho phép re-seal: sha={ex_sha[:12]}...")
                            with db_conn() as _del_con:
                                _del_con.execute("DELETE FROM sealed_records WHERE sha256=?", (ex_sha,))
                                _del_con.commit()
                            continue  # tiếp tục seal mới

                        return JSONResponse(
                            {"error": f"Ảnh tương tự đã đăng ký on-chain ({owner_info}Định danh: {ex_wm}). "
                                      f"Khớp theo: {', '.join(matched_metrics)} – dHash={dh} pHash={ph} SSIM={round(ss,2) if ss else None}",
                             "duplicate_sha": ex_sha, "registered": True,
                             "metrics": {"dhash": dh, "phash": ph, "ssim": ss}},
                            status_code=409
                        )
                except Exception as _ce:
                    print(f"[SEAL][CHECK] error comparing vs {ex_sha[:12]}: {_ce}")
    except Exception as guard_err:
        print(f"[SEAL] duplicate guard error: {guard_err}")
    # ─────────────────────────────────────────────────────────────────────────

    # Đóng dấu DCT
    sealed_img = embed_dct_blind(img, watermark_id)
    _, img_png = cv2.imencode(".png", sealed_img)
    sealed_bytes = img_png.tobytes()
    
    image_hash = sha256_hex(sealed_bytes)
    dhash_str = calc_dhash(sealed_bytes)
    ipfs_link = upload_to_ipfs(
        sealed_bytes,
        watermark_id=watermark_id,
        sha256_hex=image_hash,
        registrant_name=registrant_name or '',
    )

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
    parent_hash: str | None = None


@app.post("/confirm_registration")
def confirm_registration(item: ConfirmRegistration):
    """Mark a sealed record as registered on-chain and attach tx/owner/parent info."""
    try:
        with db_conn() as con:
            con.execute(
                "UPDATE sealed_records SET registered = 1, tx_hash = ?, owner = ?, registrant_name = COALESCE(?, registrant_name), parent_hash = COALESCE(?, parent_hash) WHERE sha256 = ?",
                (item.tx_hash or '', item.owner or '', item.registrant_name, item.parent_hash, item.sha)
            )
            con.commit()
        print(f"[CONFIRM] sha={item.sha} tx={item.tx_hash} owner={item.owner} parent={item.parent_hash}")
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

    # Ngưỡng phát hiện ảnh derivative/giả mạo.
    # Tighten để giảm false positive: cần ≥2/3 metric đồng thuận mới báo là match.
    DHASH_THRESHOLD = 20   # ≤20/64 bit khác = 69% giống trở lên (trước: 30, quá rộng)
    PHASH_THRESHOLD = 12   # tương đương
    SSIM_THRESHOLD  = 0.55 # ≥55% cấu trúc (trước: 0.40, quá thấp → false positive)
    # Yêu cầu ít nhất 2/3 metric khớp mới xem là candidate liên quan

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

            hit_dh_v = (dhash_dist is not None and dhash_dist <= DHASH_THRESHOLD)
            hit_ph_v = (phash_dist is not None and phash_dist <= PHASH_THRESHOLD)
            hit_ss_v = (ssim_score is not None and ssim_score >= SSIM_THRESHOLD)
            hit_count_v = sum([hit_dh_v, hit_ph_v, hit_ss_v])

            # ── pHash Guard ──────────────────────────────────────────────────────
            # dHash và SSIM đều cho kết quả ÂM SAI DƯƠNG trên ảnh uniform/smooth:
            #   - dHash chỉ đo gradient ngang → ảnh nào đồng nhất theo chiều ngang đều cho dist ≈ 0
            #   - SSIM cao khi variance ≈ 0 (ảnh ít texture) → metric không đáng tin
            # pHash dùng biến đổi tần số (DCT) nhiều hướng → đáng tin hơn.
            # Guard: nếu pHash cho thấy 2 ảnh RẤT khác nhau (dist > 20) nhưng
            # dHash + SSIM vẫn match → hạ số hit về 1 (không đủ để match).
            PHASH_UNRELIABLE_GUARD = 20  # pHash khoảng cách > này → ảnh khác hẳn
            if (hit_count_v >= 2 and not hit_ph_v
                    and phash_dist is not None and phash_dist > PHASH_UNRELIABLE_GUARD):
                print(f"[VERIFY][PHASH-GUARD] pHash dist={phash_dist} > {PHASH_UNRELIABLE_GUARD} "
                      f"→ dHash+SSIM unreliable on uniform image, demoting to 1 hit")
                hit_count_v = 1  # cần cả 3 metric khi pHash chênh lớn

            # Debug log
            print(f"[VERIFY][CHECK] vs sha={db_sha[:12]}... dH={dhash_dist}({'✓' if hit_dh_v else '✗'}) "
                  f"pH={phash_dist}({'✓' if hit_ph_v else '✗'}) SSIM={round(ssim_score,3) if ssim_score else None}({'✓' if hit_ss_v else '✗'}) "
                  f"hits={hit_count_v}/3")

            matched_by = []
            # Cần ≥2 metric đồng thuận (sau pHash guard) mới là candidate hợp lệ
            if hit_count_v >= 2:
                if hit_dh_v: matched_by.append('dhash')
                if hit_ph_v: matched_by.append('phash')
                if hit_ss_v: matched_by.append('ssim')

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

    # ── Fallback: Template Matching cho ảnh bị crop nặng ────────────────────
    # Ảnh bị crop nhiều sẽ có dHash/pHash/SSIM rất khác gốc → không qua được
    # ngưỡng metric. Template matching không bị ảnh hưởng bởi crop vì nó tìm
    # vùng con bên trong ảnh gốc. Chạy pass này SAU khi metric pass không tìm ra.
    #
    # Cách hoạt động: với mỗi record trong DB lớn hơn ảnh upload, dùng OpenCV
    # matchTemplate để kiểm tra ảnh upload có phải crop của record đó không.
    # Nếu match ≥ 50% confidence → thêm vào candidates với matched_by=['crop'].
    metric_candidates_found = [c for c in candidates if c.get('matched_by')]
    if not metric_candidates_found:
        print("[VERIFY][CROP-FALLBACK] Không tìm thấy candidate bằng metrics → thử template matching...")
        for row in rows:
            db_sha_t, _, _, db_wm_t, db_blob_t, db_reg_t = row
            if not db_blob_t:
                continue
            try:
                nparr_t = np.frombuffer(db_blob_t, np.uint8)
                img_db_t = cv2.imdecode(nparr_t, cv2.IMREAD_COLOR)
                if img_db_t is None:
                    continue

                h_up, w_up = img_upload.shape[:2]
                h_db, w_db = img_db_t.shape[:2]

                # Chỉ chạy nếu ảnh upload NHỎ HƠN record (điều kiện cần của crop)
                if w_up >= w_db or h_up >= h_db:
                    continue

                # Template matching trên grayscale
                gray_db = cv2.cvtColor(img_db_t, cv2.COLOR_BGR2GRAY)
                gray_up = cv2.cvtColor(img_upload, cv2.COLOR_BGR2GRAY)

                # Scale template nếu cần (template phải ≤ source)
                tw, th = w_up, h_up
                template = gray_up
                if tw > w_db or th > h_db:
                    scale = min(w_db / tw, h_db / th) * 0.95
                    tw, th = int(tw * scale), int(th * scale)
                    template = cv2.resize(gray_up, (tw, th), interpolation=cv2.INTER_AREA)

                result_map = cv2.matchTemplate(gray_db, template, cv2.TM_CCOEFF_NORMED)
                _, max_val, _, _ = cv2.minMaxLoc(result_map)

                print(f"[VERIFY][CROP-FALLBACK] vs sha={db_sha_t[:12]}... template_conf={max_val:.3f}")
                if max_val >= 0.50:  # 50% đủ để là crop candidate khi no metric match
                    candidates.append({
                        'sha': db_sha_t,
                        'dhash': None,
                        'phash': None,
                        'ssim': float(max_val),  # dùng template confidence thay ssim
                        'watermark_id': db_wm_t,
                        'blob': db_blob_t,
                        'matched_by': ['crop'],
                        'registered': bool(db_reg_t),
                    })
                    print(f"[VERIFY][CROP-FALLBACK] ✓ Crop candidate added: wm={db_wm_t} conf={max_val:.3f}")
            except Exception as _te:
                print(f"[VERIFY][CROP-FALLBACK] error: {_te}")

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
                # Kiểm tra định dạng ảnh bằng magic bytes (thay thế imghdr bị deprecated từ Python 3.11+
                # và bị xóa hoàn toàn trong Python 3.13)
                try:
                    _fmt = 'png' if raw_bytes[:4] == b'\x89PNG' else 'jpeg'
                except Exception:
                    _fmt = 'jpeg'  # fallback: chạy ELA
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


# ============================================================
# ON-CHAIN CHECK  (g\u1ecdi Sepolia JSON-RPC, kh\u00f4ng c\u1ea7n ethers.js)
# ============================================================

def _abi_encode_string(s: str) -> str:
    """ABI-encode m\u1ed9t string argument (t\u01b0\u01a1ng \u0111\u01b0\u01a1ng abi.encode(string)).

    Format:
      offset (32 bytes)   \u2013 v\u1ecb tr\u00ed b\u1eaft \u0111\u1ea7u c\u1ee7a string data (= 32)
      length (32 bytes)   \u2013 s\u1ed1 byte c\u1ee7a string
      data   (\u00d7 32-byte)  \u2013 UTF-8 bytes padding ph\u1ea3i \u0111\u1ebfn b\u1ed9i 32

    Return: hex string (kh\u00f4ng c\u00f3 0x prefix), \u0111\u1ed3ng b\u1ed9 v\u1edbi calldata sau selector.
    """
    encoded_bytes = s.encode('utf-8')
    length = len(encoded_bytes)
    padded_len = ((length + 31) // 32) * 32      # l\u00e0m tr\u00f2n l\u00ean b\u1ed9i 32

    offset_hex = format(32, '064x')               # offset = 32 (always)
    length_hex = format(length, '064x')
    data_hex   = encoded_bytes.hex().ljust(padded_len * 2, '0')

    return offset_hex + length_hex + data_hex


def _abi_decode_string(hex_data: str, offset: int) -> str:
    """Decode m\u1ed9t ABI-encoded dynamic string t\u1ea1i v\u1ecb tr\u00ed offset trong hex_data."""
    try:
        # \u0110\u1ecdc offset con tr\u1ecf (th\u01b0\u1eddng l\u00e0 vị trí b\u1eaft \u0111\u1ea7u c\u1ee7a string block t\u00ednh t\u1eeb byte0)
        ptr = int(hex_data[offset*2: offset*2 + 64], 16)
        length = int(hex_data[ptr*2: ptr*2 + 64], 16)
        data_start = (ptr + 32) * 2
        raw = bytes.fromhex(hex_data[data_start: data_start + length * 2])
        return raw.decode('utf-8', errors='replace')
    except Exception:
        return ""


@app.get("/onchain-check")
def onchain_check(sha: str):
    """G\u1ecdi smart contract `getRecordByHash(sha256_hex)` tr\u00ean Sepolia qua JSON-RPC.

    Tr\u1ea3 v\u1ec1:
      - exists (bool)
      - owner  (address string)
      - watermark_id (string)
      - parent_hash  (string)
      - timestamp    (int)
      - etherscan_url (string link \u0111\u1ebfn token)

    Kh\u00f4ng c\u1ea7n ethers.js hay web3 \u2014 ch\u1ec9 d\u00f9ng requests + ABI encode th\u1ee7 c\u00f4ng.
    """
    if not sha:
        return JSONResponse({"error": "sha parameter required"}, status_code=400)

    try:
        # ABI-encode calldata = selector + encoded string argument
        calldata = "0x" + FUNC_SELECTOR_GET_RECORD + _abi_encode_string(sha)

        payload = {
            "jsonrpc": "2.0",
            "method":  "eth_call",
            "params":  [
                {"to": CONTRACT_ADDRESS, "data": calldata},
                "latest"
            ],
            "id": 1
        }
        resp = requests.post(SEPOLIA_RPC_URL, json=payload, timeout=10)
        resp.raise_for_status()
        rpc_result = resp.json()

        if "error" in rpc_result:
            return JSONResponse({"error": rpc_result["error"].get("message", "RPC error")}, status_code=502)

        raw_hex = rpc_result.get("result", "0x")
        if not raw_hex or raw_hex == "0x":
            return JSONResponse({"exists": False, "owner": None, "watermark_id": None,
                                 "parent_hash": None, "timestamp": None})

        # X\u00f3a prefix 0x
        hex_data = raw_hex[2:]

        # ABI decode: (bool exists, address owner, string watermarkId, string parentHash, uint256 timestamp)
        # Word 0 (bytes 0-31)  : bool exists
        # Word 1 (bytes 32-63) : address owner (20 bytes, right-padded to 32)
        # Word 2 (bytes 64-95) : offset \u0111\u1ebfn watermarkId string
        # Word 3 (bytes 96-127): offset \u0111\u1ebfn parentHash string
        # Word 4 (bytes128-159): uint256 timestamp

        exists    = int(hex_data[0:64], 16) == 1
        owner_raw = hex_data[64:128]
        owner     = "0x" + owner_raw[-40:]  # L\u1ea5y 20 byte cu\u1ed1i = address
        wm_offset = int(hex_data[128:192], 16)   # byte offset c\u1ee7a watermarkId string
        ph_offset = int(hex_data[192:256], 16)   # byte offset c\u1ee7a parentHash string
        timestamp = int(hex_data[256:320], 16)

        watermark_id = _abi_decode_string(hex_data, wm_offset)
        parent_hash  = _abi_decode_string(hex_data, ph_offset)

        etherscan_url = (
            f"https://sepolia.etherscan.io/address/{owner}"
            if exists else None
        )

        print(f"[ONCHAIN-CHECK] sha={sha[:16]}... exists={exists} owner={owner[:12]}... wm={watermark_id}")

        return JSONResponse({
            "exists":       exists,
            "owner":        owner if exists else None,
            "watermark_id": watermark_id if exists else None,
            "parent_hash":  parent_hash  if exists else None,
            "timestamp":    timestamp    if exists else None,
            "etherscan_url": etherscan_url,
        })

    except requests.exceptions.Timeout:
        return JSONResponse({"error": "Timeout kết nối Sepolia RPC"}, status_code=504)
    except Exception as e:
        print(f"[ONCHAIN-CHECK] error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

# ============================================================
# DIGITAL PROVENANCE (Gia Phả Số)
# ============================================================
@app.get("/provenance")
def get_provenance(sha: str):
    """Trả về cây gia phả số (digital provenance tree) của một ảnh."""
    if not sha:
        return JSONResponse({"error": "Missing sha parameter"}, status_code=400)

    try:
        with db_conn() as con:
            # 1. Tìm record hiện tại
            cur = con.execute(
                "SELECT sha256, watermark_id, registrant_name, parent_hash, created_at, owner, registered, ipfs_link FROM sealed_records WHERE sha256 = ?",
                (sha,)
            )
            row = cur.fetchone()
            if not row:
                return JSONResponse({"error": "Record not found"}, status_code=404)

            def row_to_dict(r):
                return {
                    "sha": r[0], "watermark_id": r[1], "registrant_name": r[2] or "",
                    "parent_hash": r[3] or "", "created_at": r[4], "owner": r[5] or "",
                    "registered": bool(r[6]), "ipfs_link": r[7] or "",
                    "thumbnail": f"/thumbnail?sha={r[0]}&size=120"
                }

            start_node = row_to_dict(row)

            # 2. Truy ngược lên tìm Root (tổ tiên xa nhất)
            root_node = start_node
            visited_shas = {root_node["sha"]}
            
            while root_node["parent_hash"]:
                p_cur = con.execute(
                    "SELECT sha256, watermark_id, registrant_name, parent_hash, created_at, owner, registered, ipfs_link FROM sealed_records WHERE sha256 = ?",
                    (root_node["parent_hash"],)
                )
                p_row = p_cur.fetchone()
                if not p_row:
                    break # Không thấy parent trong DB (mất dấu)
                root_node = row_to_dict(p_row)
                if root_node["sha"] in visited_shas:
                    break # Chống lặp vòng
                visited_shas.add(root_node["sha"])

            # 3. Quét BFS (chiều sâu xuống) từ root_node để lấy toàn bộ con cháu
            all_nodes = {}
            edges = []
            
            queue = [root_node["sha"]]
            all_nodes[root_node["sha"]] = root_node
            visited_bfs = {root_node["sha"]}

            while queue:
                curr_sha = queue.pop(0)
                # Tìm tất cả node con mà parent_hash = curr_sha
                child_cur = con.execute(
                    "SELECT sha256, watermark_id, registrant_name, parent_hash, created_at, owner, registered, ipfs_link FROM sealed_records WHERE parent_hash = ?",
                    (curr_sha,)
                )
                for c_row in child_cur.fetchall():
                    c_node = row_to_dict(c_row)
                    c_sha = c_node["sha"]
                    edges.append({"from": curr_sha, "to": c_sha})
                    
                    if c_sha not in visited_bfs:
                        visited_bfs.add(c_sha)
                        all_nodes[c_sha] = c_node
                        queue.append(c_sha)

            return JSONResponse({
                "query_sha": sha,
                "root_sha": root_node["sha"],
                "nodes": list(all_nodes.values()),
                "edges": edges
            })
    except Exception as e:
        print("[PROVENANCE] err:", e)
        return JSONResponse({"error": str(e)}, status_code=500)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "trustlens-check",
    title: "🔍 Kiểm tra thật/giả với TrustLens",
    contexts: ["image"]
  });
});

// URL backend local (thay đổi nếu deploy production)
const BACKEND = "http://127.0.0.1:8000";

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "trustlens-check") return;

  // Hiện toast "đang xử lý"
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const old = document.getElementById('trustlens-toast');
      if (old) old.remove();
      const div = document.createElement('div');
      div.id = 'trustlens-toast';
      div.style.cssText = 'position:fixed;top:20px;right:20px;background:#1e1b4b;color:#a5b4fc;'
        + 'padding:14px 18px;z-index:99999;border-radius:10px;font-family:sans-serif;'
        + 'box-shadow:0 4px 20px rgba(0,0,0,.6);border:1px solid rgba(99,102,241,.4);font-size:14px;';
      div.innerText = '⏳ TrustLens: Đang phân tích ảnh...';
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 8000);
    }
  });

  // Lấy blob ảnh từ trang
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [info.srcUrl],
    func: async (srcUrl) => {
      try {
        const response = await fetch(srcUrl);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (err) { return null; }
    }
  }).then(async (results) => {
    const base64Data = results[0].result;
    if (!base64Data) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert("❌ Không thể truy cập ảnh này (CORS hoặc bảo mật trang web).")
      });
      return;
    }

    try {
      // 1. Gọi /verify-url để phân tích AI
      const res = await fetch(`${BACKEND}/verify-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: base64Data })
      });
      const data = await res.json();

      // 2. Gọi /onchain-check nếu có sha256 (từ best_match hoặc sha của ảnh upload)
      let onchain = null;
      const shaToCheck = data.sha256 || data.best_match?.sha256;
      if (shaToCheck) {
        try {
          const ocRes = await fetch(`${BACKEND}/onchain-check?sha=${encodeURIComponent(shaToCheck)}`);
          if (ocRes.ok) {
            const ocData = await ocRes.json();
            if (ocData.exists) onchain = ocData;
          }
          // Nếu chưa tìm thấy, thử sha của bản gốc (trường hợp crop/derivative)
          if (!onchain && data.best_match?.sha256 && data.best_match.sha256 !== shaToCheck) {
            const ocRes2 = await fetch(`${BACKEND}/onchain-check?sha=${encodeURIComponent(data.best_match.sha256)}`);
            if (ocRes2.ok) {
              const ocData2 = await ocRes2.json();
              if (ocData2.exists) onchain = ocData2;
            }
          }
        } catch (_) {}
      }

      // 3. Hiện kết quả trên trang
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showResultOnPage,
        args: [data, onchain]
      });
    } catch (err) {
      console.error(err);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert("❌ Lỗi kết nối TrustLens Backend! Đảm bảo uvicorn đang chạy.")
      });
    }
  });
});

function showResultOnPage(data, onchain) {
  // Xóa toast cũ
  const old = document.getElementById('trustlens-toast');
  if (old) old.remove();

  const bm = data.best_match;

  // ── Xác định verdict ──────────────────────────────────────────────────────
  let icon, title, detail;

  if (!bm) {
    icon  = "⚪";
    title = "KHÔNG RÕ NGUỒN GỐC";
    detail = "Không tìm thấy ảnh tương tự trong cơ sở dữ liệu TrustLens.";
  } else if (bm.forgery_image) {
    icon  = "🚨";
    title = "PHÁT HIỆN GIẢ MẠO / CAN THIỆP";
    detail = `Ảnh khớp với bản gốc của "${bm.watermark_id}" nhưng bị phát hiện chỉnh sửa (crop / vẽ thêm).`;
  } else if (bm.distance === 0) {
    icon  = "✅";
    title = "CHÍNH HÃNG — Nguyên bản";
    detail = `Watermark: ${bm.watermark_id}`;
  } else if (bm.distance <= 10) {
    icon  = "✅";
    title = "CHÍNH CHỦ (Có thể bị resize/nén nhẹ)";
    detail = `Watermark: ${bm.watermark_id}  |  Khoảng cách hash: ${bm.distance} bit`;
  } else {
    icon  = "⚠️";
    title = "NGHI VẤN — Cần kiểm tra thêm";
    detail = `Tương tự ảnh "${bm.watermark_id}" (khoảng cách: ${bm.distance} bit)`;
  }

  // ── Thông tin on-chain ────────────────────────────────────────────────────
  let chainLine = "";
  if (onchain) {
    const owner = onchain.owner
      ? onchain.owner.slice(0, 10) + "..." + onchain.owner.slice(-6)
      : "?";
    const ts = onchain.timestamp
      ? new Date(onchain.timestamp * 1000).toLocaleDateString("vi-VN")
      : "?";
    chainLine = `\n⛓️  Đã đăng ký on-chain\n   Owner: ${owner}\n   Watermark: ${onchain.watermark_id || "?"}\n   Ngày: ${ts}`;
  }

  alert(`TrustLens — Kết quả kiểm tra\n${"─".repeat(36)}\n${icon}  ${title}\n\n${detail}${chainLine}`);
}
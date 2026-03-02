chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "trustlens-check",
    title: "🔍 Kiểm tra thật/giả với TrustLens",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "trustlens-check") {
    
    // Bắn thông báo chờ
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const div = document.createElement('div');
        div.id = 'trustlens-toast';
        div.style.cssText = 'position:fixed; top:20px; right:20px; background:#333; color:#fff; padding:15px; z-index:99999; border-radius:8px; font-family:sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.5);';
        div.innerText = '⏳ TrustLens: Đang trích xuất ảnh và phân tích...';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 5000);
      }
    });

    // --- LOGIC MỚI: XỬ LÝ BLOB & DATA URL ---
    // Chúng ta bơm một hàm vào trang web để nó tự tải ảnh về thành Base64
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [info.srcUrl],
      func: async (srcUrl) => {
        try {
          // 1. Dùng fetch của trình duyệt để tải dữ liệu blob/url
          const response = await fetch(srcUrl);
          const blob = await response.blob();
          
          // 2. Chuyển Blob thành Base64
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          return null;
        }
      }
    }).then((results) => {
      // Nhận kết quả Base64 từ trang web
      const base64Data = results[0].result;
      
      if (!base64Data) {
        alert("Lỗi: Không thể truy cập dữ liệu ảnh này (Do bảo mật của trang web).");
        return;
      }

      // Gửi Base64 về cho Python
      fetch("http://127.0.0.1:8000/verify-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: base64Data }) // Gửi cả chuỗi data:image...
      })
      .then(res => res.json())
      .then(data => {
        // Hiển thị kết quả
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: showResultOnPage,
          args: [data]
        });
      })
      .catch(err => {
        console.error(err);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => alert("❌ Lỗi kết nối Server Python!")
        });
      });
    });
  }
});

function showResultOnPage(data) {
  // Xóa thông báo cũ nếu có
  const oldToast = document.getElementById('trustlens-toast');
  if(oldToast) oldToast.remove();

  let message = "";
  if (data.best_match && data.best_match.distance === 0) {
    message = "✅ CHÍNH HÃNG! (Authentic)\nID: " + data.best_match.watermark_id;
  } else if (data.best_match && data.best_match.distance < 10) {
    message = "⚠️ CHÍNH CHỦ (Đã bị nén/Resize)\nID: " + data.best_match.watermark_id;
  } else if (data.best_match && data.best_match.forgery_image) {
    message = "🚨 PHÁT HIỆN ẢNH FAKE!\nCó vùng bị chỉnh sửa.";
  } else {
    message = "🔴 KHÔNG RÕ NGUỒN GỐC.";
  }
  alert("TrustLens Result:\n" + message);
}
// --- KHỞI CHẠY HỆ THỐNG MẬT MÃ CLIENT - SẾP (BOB) ---

let bobKeys = null; // Lưu trữ cặp khóa ECDH của Bob
let currentScenario = 'normal'; // Chế độ kiểm thử đường truyền: 'normal', 'tamper'
let messageIndexCounter = 0; // Đếm số tin nhắn nhận được
let receivedEnvelopes = {}; // Bộ nhớ tạm lưu trữ các phong bì mã hóa trước khi giải mã

// --- CÁC HÀM TRỢ GIÚP CHUYỂN ĐỔI DỮ LIỆU ---

// Chuyển ArrayBuffer sang chuỗi Hex
function bufToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Chuyển chuỗi Hex về dạng bytes gốc
function hexToBuf(hexString) {
    const matches = hexString.match(/.{1,2}/g) || [];
    return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

// Chuyển chuỗi Base64 sang ArrayBuffer để phục vụ tạo Blob tải xuống
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Chuyển ArrayBuffer sang Base64
function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Định dạng chuỗi Base64 thành các dòng 64 ký tự chuẩn PEM
function formatBase64(b64) {
    return b64.match(/.{1,64}/g).join("\n");
}

// Xuất khóa công khai ECDH sang PEM
async function exportPublicKeyPEM(publicKey) {
    const exported = await window.crypto.subtle.exportKey("spki", publicKey);
    const exportedAsBase64 = arrayBufferToBase64(exported);
    return `-----BEGIN PUBLIC KEY-----\n${formatBase64(exportedAsBase64)}\n-----END PUBLIC KEY-----`;
}

// Nhập khóa công khai PEM của đối phương sang Object Web Crypto
async function importPublicKeyPEM(pem) {
    const pemHeader = "-----BEGIN PUBLIC KEY-----";
    const pemFooter = "-----END PUBLIC KEY-----";
    const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length).replace(/\s/g, "");
    
    const binaryDerString = window.atob(pemContents);
    const binaryLen = binaryDerString.length;
    const bytes = new Uint8Array(binaryLen);
    for (let i = 0; i < binaryLen; i++) {
        bytes[i] = binaryDerString.charCodeAt(i);
    }
    
    return await window.crypto.subtle.importKey(
        "spki",
        bytes.buffer,
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
    );
}

// Cập nhật thông báo trạng thái
function showStatus(message, type = 'info') {
    const box = document.getElementById('status-alert-box');
    box.className = `alert alert-${type}`;
    box.textContent = message;
}

// --- ĐIỀU KHIỂN CHẾ ĐỘ KIỂM THỬ ĐƯỜNG TRUYỀN (SANDBOX) ---

document.getElementById('btn-scenario-normal').addEventListener('click', () => {
    currentScenario = 'normal';
    document.getElementById('btn-scenario-normal').classList.add('active');
    document.getElementById('btn-scenario-tamper').classList.remove('active');
    showStatus("Đang kiểm thử: Gói tin truyền tải nguyên vẹn", 'success');
});

document.getElementById('btn-scenario-tamper').addEventListener('click', () => {
    currentScenario = 'tamper';
    document.getElementById('btn-scenario-normal').classList.remove('active');
    document.getElementById('btn-scenario-tamper').classList.add('active');
    showStatus("Đang kiểm thử: Kích hoạt sửa đổi Ciphertext trên đường truyền (Tamper Attack)", 'warning');
});

// --- KHỞI TẠO CẶP KHÓA VÀ ĐĂNG KÝ VỚI SERVER ---

async function initializeClient() {
    showStatus("Đang sinh khóa ECDH secp256r1 bảo mật...", 'info');
    
    try {
        // 1. Sinh cặp khóa bất đối xứng ECDH cho Bob
        bobKeys = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
        );
        
        const publicPEM = await exportPublicKeyPEM(bobKeys.publicKey);
        
        // Cập nhật thông số lên giao diện
        document.getElementById('bob-pub-key-display').textContent = publicPEM.substring(0, 24) + "...";
        
        // 2. Đăng ký người dùng "bob" (Sếp) trên Server trung gian
        await fetch('/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: 'bob', password: 'bobpassword123'})
        });
        
        // 3. Tải khóa công khai của Bob lên Server
        await fetch('/upload-public-key', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: 'bob', public_key_pem: publicPEM})
        });
        
        showStatus("Khởi tạo khóa và đăng ký Sếp (Bob) thành công!", 'success');
        
    } catch (e) {
        showStatus("Lỗi kết nối Server. Vui lòng đảm bảo backend đang chạy!", 'danger');
    }
}

// --- KIỂM TRA HÀNG CHỜ TIN NHẮN TỪ SERVER ---

document.getElementById('btn-fetch').addEventListener('click', async () => {
    showStatus("Đang truy vấn các gói tin chờ từ Server trung gian...", 'info');
    
    try {
        const res = await fetch('/fetch-reports/bob');
        const data = await res.json();
        const reports = data.reports;
        
        if (reports && reports.length > 0) {
            showStatus(`Tải về thành công ${reports.length} gói tin mã hóa!`, 'success');
            
            // Xử lý hiển thị từng gói tin mã hóa vào khung chat
            reports.forEach(envelope => {
                const messageId = `msg-envelope-${messageIndexCounter++}`;
                receivedEnvelopes[messageId] = envelope; // Lưu tạm envelope để giải mã sau
                
                appendEncryptedMessage(envelope.sender, messageId, envelope.ciphertext);
            });
        } else {
            showStatus("Hàng chờ trống. Chưa có tin nhắn/tài liệu mới nào.", 'info');
        }
        
    } catch (e) {
        showStatus(`Lỗi khi tải hàng chờ: ${e.message}`, 'danger');
    }
});

// Hiển thị tin nhắn mã hóa (Chưa giải mã) trong khung chat
function appendEncryptedMessage(sender, messageId, ciphertextHex) {
    const chatBox = document.getElementById('chat-messages');
    const wrapper = document.createElement('div');
    wrapper.className = "message-bubble-wrapper received";
    
    // Tạo cấu trúc card tin nhắn bị khóa
    wrapper.innerHTML = `
        <div class="message-meta-info">Nhân viên (Alice) - Mã hóa đầu cuối</div>
        <div class="message-bubble" id="${messageId}" style="background-color: #f3f4f6; border: 1px solid var(--border-color); color: var(--text-secondary);">
            <div style="font-size: 15px; margin-bottom: 6px; font-weight:600;"><i class='bx bxs-lock-alt' style='color: var(--color-primary); font-size:16px; vertical-align:middle; margin-right:4px;'></i> Gói tin E2EE khóa</div>
            <div class="font-mono" style="font-size: 11px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 8px;">
                Ciphertext: ${ciphertextHex}
            </div>
            <button class="btn-file-action" onclick="triggerBiometricAuth('${messageId}')">
                <i class='bx bx-key' style='vertical-align:middle; margin-right:4px;'></i> Giải mã & Đọc
            </button>
        </div>
    `;
    
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- GIẢI MÃ PHONG BÌ VÀ TẢI TỆP TIN ---

async function decryptEnvelope(messageId) {
    const envelope = receivedEnvelopes[messageId];
    if (!envelope) return;
    
    showStatus("Đang truy vấn khóa công khai của Nhân viên (Alice)...", 'info');
    
    try {
        // 1. Lấy khóa công khai của Người gửi trực tiếp từ phong bì tệp tin
        const alicePubPEM = envelope.sender_public_key;
        
        // 2. Thỏa thuận khóa đối xứng phiên ECDH
        showStatus("Đang thiết lập thỏa thuận ECDH phục hồi khóa đối xứng...", 'info');
        
        const t0 = performance.now(); // Bấm giờ bắt đầu giải mã E2EE
        const alicePublicKeyObj = await importPublicKeyPEM(alicePubPEM);
        const aesKeyObj = await window.crypto.subtle.deriveKey(
            { name: "ECDH", public: alicePublicKeyObj },
            bobKeys.privateKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        // Cập nhật khóa phiên lên giao diện (masked)
        const rawKey = await window.crypto.subtle.exportKey("raw", aesKeyObj);
        document.getElementById('bob-derived-key-display').textContent = bufToHex(rawKey).substring(0, 24) + "...";
        // Cấu hình tham số giải mã
        let ciphertextHex = envelope.ciphertext;
        let tagHex = envelope.tag;
        // 3. Nếu kích hoạt mô phỏng Tấn công Sửa đổi (Tamper Attack)
        if (currentScenario === 'tamper') {
            showStatus("Mô phỏng Hacker can thiệp sửa đổi Ciphertext!", 'warning');
            ciphertextHex = ciphertextHex.substring(0, ciphertextHex.length - 2) + "ff"; // Thay đổi byte cuối cùng
        }
        // 4. Tiến hành giải mã AES-GCM và kiểm tra toàn vẹn
        showStatus("Đang tiến hành giải mã AES-GCM...", 'info');
        const ciphertext = hexToBuf(ciphertextHex);
        const nonce = hexToBuf(envelope.nonce);
        const tag = hexToBuf(tagHex);
        // Gộp bản mã và tag để giải mã
        const concatenated = new Uint8Array(ciphertext.length + tag.length);
        concatenated.set(ciphertext, 0);
        concatenated.set(tag, ciphertext.length);
        try {
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: nonce },
                aesKeyObj,
                concatenated.buffer
            );
            const t1 = performance.now(); // Bấm giờ kết thúc giải mã E2EE
            console.log(`[PERFORMANCE] Thời gian giải mã AES-GCM-256 (bao gồm ECDH): ${(t1 - t0).toFixed(3)} ms`);
            const decryptedText = new TextDecoder().decode(decrypted);
            const dataObj = JSON.parse(decryptedText);
            showStatus("Giải mã và xác thực tính toàn vẹn thành công!", 'success');
            // Tìm khung chat bubble cần hiển thị
            const bubble = document.getElementById(messageId);
            
            if (dataObj.type === 'file') {
                // Nếu là tệp tin Excel/Văn bản đính kèm
                bubble.style.backgroundColor = "var(--color-success-bg)";
                bubble.style.borderColor = "#a7f3d0";
                bubble.style.color = "#065f46";
                
                bubble.innerHTML = `
                    <div style="font-size: 15px; margin-bottom: 6px; font-weight:600;"><i class='bx bxs-spreadsheet' style='font-size: 18px; color: var(--color-success); vertical-align: middle; margin-right:4px;'></i> Báo cáo tài liệu</div>
                    <div style="font-weight: 700; font-size: 13.5px; word-break: break-all;">${dataObj.filename}</div>
                    <div style="font-size: 11px; opacity: 0.8; margin-top:2px;">
                        Kích thước: ${Math.round(dataObj.fileSize / 1024)} KB
                    </div>
                    <button class="btn-file-action" style="color: var(--color-success); margin-top: 8px;" onclick="downloadDecryptedFile('${messageId}')">
                        <i class='bx bx-download' style='vertical-align:middle; margin-right:4px;'></i> Tải tệp giải mã về máy
                    </button>
                `;
                
                // Lưu trữ metadata tệp đã giải mã để tải về sau khi người dùng bấm
                receivedEnvelopes[messageId].decryptedFile = dataObj;
                
            } else {
                // Nếu là tin nhắn văn bản thường
                bubble.style.backgroundColor = "#ffffff";
                bubble.style.color = "var(--text-primary)";
                bubble.innerHTML = dataObj.content;
            }
            
        } catch (decryptErr) {
            showStatus("CẢNH BÁO BẢO MẬT: Nhãn Tag không trùng khớp! Gói tin đã bị sửa đổi trái phép.", 'danger');
            
            const bubble = document.getElementById(messageId);
            bubble.style.backgroundColor = "var(--color-danger-bg)";
            bubble.style.borderColor = "#fca5a5";
            bubble.style.color = "#991b1b";
            bubble.innerHTML = `
                <div style="font-size: 14px; margin-bottom: 6px; font-weight:600; color: var(--color-danger);"><i class='bx bx-error-circle' style='font-size: 16px; vertical-align: middle; margin-right:4px;'></i> Lỗi Bảo Mật</div>
                <div style="font-size: 12px; line-height: 1.4;">
                    Giải mã thất bại! Nhãn xác thực AES-GCM Tag bị sai lệch. File/Tin nhắn đã bị can thiệp trái phép trên đường truyền hoặc server.
                </div>
            `;
        }
        
    } catch (e) {
        showStatus(`Lỗi giải mã: ${e.message}`, 'danger');
    }
}

// --- HÀM TẠO BLOB VÀ TẢI FILE VỀ MÁY CỦA SẾP ---

function downloadDecryptedFile(messageId) {
    const envelope = receivedEnvelopes[messageId];
    if (!envelope || !envelope.decryptedFile) return;
    
    const file = envelope.decryptedFile;
    
    // Chuyển đổi dữ liệu Base64 đã giải mã về dạng ArrayBuffer nhị phân
    const arrayBuffer = base64ToArrayBuffer(file.fileData);
    
    // Tạo Blob nhị phân với đúng định dạng tệp gốc
    const blob = new Blob([arrayBuffer], { type: file.fileType });
    
    // Tạo đường dẫn tạm thời trong trình duyệt để tải xuống
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename; // Gán đúng tên tệp tin ban đầu
    document.body.appendChild(a);
    a.click(); // Trigger click để tải file về máy
    
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showStatus(`Đã tải tệp tin '${file.filename}' về máy cục bộ.`, 'success');
}

// --- XỬ LÝ BIOMETRIC WEB-AUTHN & MOCK SCANNER ---

let pendingMessageId = null;

// Kích hoạt Modal Sinh trắc học
function triggerBiometricAuth(messageId) {
    pendingMessageId = messageId;
    
    const modal = document.getElementById('biometric-modal');
    modal.classList.remove('hidden');
    
    // Reset scanner state
    const scanner = document.getElementById('scanner-box');
    scanner.className = "scanner-container";
    document.getElementById('biometric-status').textContent = "Sẵn sàng quét vân tay...";
}

// Hủy giao dịch modal
document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('biometric-modal').classList.add('hidden');
    showStatus("Đã hủy giao dịch giải mã báo cáo.", 'info');
});

// Xử lý quét vân tay Giả Lập
document.getElementById('btn-scan-simulated').addEventListener('click', () => {
    const scanner = document.getElementById('scanner-box');
    const statusText = document.getElementById('biometric-status');
    
    scanner.className = "scanner-container scanning";
    statusText.textContent = "Đang phân tích vân tay... (Vui lòng chạm thiết bị)";
    
    setTimeout(() => {
        scanner.className = "scanner-container scan-success";
        statusText.textContent = "Xác thực thành công! Đang tiến hành giải mã...";
        
        setTimeout(() => {
            document.getElementById('biometric-modal').classList.add('hidden');
            decryptEnvelope(pendingMessageId);
        }, 800);
    }, 1500);
});

// Xử lý xác thực Windows Hello (FIDO2 WebAuthn Thật)
document.getElementById('btn-scan-native').addEventListener('click', async () => {
    const scanner = document.getElementById('scanner-box');
    const statusText = document.getElementById('biometric-status');
    
    if (!window.PublicKeyCredential) {
        statusText.textContent = "Thiết bị hoặc trình duyệt không hỗ trợ WebAuthn!";
        scanner.className = "scanner-container scan-error";
        return;
    }
    
    try {
        statusText.textContent = "Đang kích hoạt khóa bảo mật Windows Hello...";
        
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        
        // Gọi API sinh chứng chỉ WebAuthn của trình duyệt
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: { name: "ZKRS Enterprise App" },
                user: {
                    id: window.crypto.getRandomValues(new Uint8Array(16)),
                    name: "bob@company.com",
                    displayName: "Sếp (Bob)"
                },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }], // Thuật toán ES256
                authenticatorSelection: { authenticatorAttachment: "platform" }, // Ưu tiên sinh trắc học thiết bị
                timeout: 60000
            }
        });
        
        scanner.className = "scanner-container scan-success";
        statusText.textContent = "Windows Hello xác thực thành công! Đang giải mã...";
        
        setTimeout(() => {
            document.getElementById('biometric-modal').classList.add('hidden');
            decryptEnvelope(pendingMessageId);
        }, 800);
        
    } catch (err) {
        console.warn("WebAuthn Error/Cancelled:", err);
        scanner.className = "scanner-container scan-error";
        
        let errorMsg = "Lỗi xác thực thiết bị";
        if (err.name === "NotAllowedError") {
            errorMsg = "Giao dịch bị từ chối / Hủy quét vân tay";
        } else {
            errorMsg = "Thiết bị chưa cấu hình vân tay / Windows Hello";
        }
        
        statusText.textContent = `Lỗi: ${errorMsg}. Vui lòng sử dụng Quét Giả Lập!`;
        
        setTimeout(() => {
            scanner.className = "scanner-container";
        }, 3000);
    }
});

// Khởi chạy
window.addEventListener('DOMContentLoaded', () => {
    initializeClient();
});

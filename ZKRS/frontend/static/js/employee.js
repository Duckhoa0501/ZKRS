// --- KHỞI CHẠY HỆ THỐNG MẬT MÃ CLIENT - NHÂN VIÊN (ALICE) ---

let aliceKeys = null; // Lưu trữ cặp khóa ECDH của Alice (Private & Public)
let alicePublicKeyPEM = null; // Khóa công khai PEM của Alice lưu trữ để đính kèm bản tin
let derivedAesKey = null; // Khóa đối xứng phiên AES-256 dẫn xuất được
let selectedFile = null; // Tệp tin được người dùng chọn đính kèm
let currentMode = 'normal'; // Chế độ kiểm thử: 'normal', 'expired', 'replay'

// --- CÁC HÀM TRỢ GIÚP CHUYỂN ĐỔI DỮ LIỆU ---

// Chuyển ArrayBuffer sang chuỗi Hex
function bufToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Chuyển ArrayBuffer sang Base64 để nhúng vào JSON E2EE
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

// Xuất khóa công khai ECDH sang định dạng PEM
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

// Cập nhật dòng thông báo trạng thái
function showStatus(message, type = 'info') {
    const box = document.getElementById('status-alert-box');
    box.className = `alert alert-${type}`;
    box.textContent = message;
}

// --- ĐIỀU KHIỂN CHẾ ĐỘ KIỂM THỬ BẢO MẬT (SANDBOX) ---

document.getElementById('btn-mode-normal').addEventListener('click', () => {
    currentMode = 'normal';
    resetModeButtons();
    document.getElementById('btn-mode-normal').classList.add('active');
    showStatus("Đã chuyển sang: Luồng gửi tài liệu bình thường", 'success');
});

document.getElementById('btn-mode-expired').addEventListener('click', () => {
    currentMode = 'expired';
    resetModeButtons();
    document.getElementById('btn-mode-expired').classList.add('active');
    showStatus("Đã chuyển sang: Gói tin có Timestamp trễ 10 phút (Kiểm tra chặn Replay)", 'warning');
});

document.getElementById('btn-mode-replay').addEventListener('click', () => {
    currentMode = 'replay';
    resetModeButtons();
    document.getElementById('btn-mode-replay').classList.add('active');
    showStatus("Đã chuyển sang: Mô phỏng phát lại trùng Nonce (Replay Attack)", 'warning');
});

function resetModeButtons() {
    document.querySelectorAll('.dev-buttons .btn').forEach(b => b.classList.remove('active'));
}

// --- KHỞI TẠO CẶP KHÓA VÀ ĐĂNG KÝ VỚI SERVER ---

async function initializeClient() {
    showStatus("Đang sinh khóa ECDH secp256r1 bảo mật...", 'info');
    
    try {
        // 1. Sinh cặp khóa bất đối xứng ECDH
        aliceKeys = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
        );
        
        // Xuất khóa công khai để tải lên Server
        const publicPEM = await exportPublicKeyPEM(aliceKeys.publicKey);
        alicePublicKeyPEM = publicPEM; // Lưu lại để gửi kèm tin nhắn
        
        // Cập nhật thông số lên giao diện
        document.getElementById('alice-pub-key-display').textContent = publicPEM.substring(0, 24) + "...";
        
        // 2. Đăng ký người dùng "alice" (Nhân viên) trên Server trung gian
        await fetch('/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: 'alice', password: 'alicepassword123'})
        });
        
        // 3. Tải khóa công khai của Alice lên Server
        await fetch('/upload-public-key', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: 'alice', public_key_pem: publicPEM})
        });
        
        showStatus("Khởi tạo khóa và đăng ký Nhân viên (Alice) thành công!", 'success');
        
    } catch (e) {
        showStatus("Lỗi kết nối Server. Vui lòng đảm bảo backend đang chạy!", 'danger');
    }
}

// --- XỬ LÝ ĐÍNH KÈM TỆP TIN ---

const fileInput = document.getElementById('attachment-input');
const fileBadge = document.getElementById('selected-file-badge');
const fileNameSpan = document.getElementById('selected-file-name');

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        fileNameSpan.textContent = `${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`;
        fileBadge.classList.remove('hidden');
        showStatus(`Đã đính kèm tệp tin: ${selectedFile.name}`, 'info');
    }
});

// Hủy đính kèm tệp
document.getElementById('btn-cancel-file').addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileBadge.classList.add('hidden');
    showStatus("Đã hủy đính kèm tệp tin.", 'info');
});

// --- MÃ HÓA VÀ GỬI BẢN TIN ---

document.getElementById('btn-send-message').addEventListener('click', async () => {
    const textInput = document.getElementById('message-text-input');
    const messageText = textInput.value;
    
    if (!selectedFile && !messageText.trim()) {
        showStatus("Vui lòng nhập tin nhắn hoặc đính kèm một tệp tin!", 'danger');
        return;
    }
    
    showStatus("Đang truy vấn khóa công khai của Sếp (Bob) từ Server...", 'info');
    
    try {
        // 1. Lấy khóa công khai của Bob (Sếp)
        const resKey = await fetch('/get-public-key/bob');
        if (resKey.status !== 200) {
            showStatus("Sếp (Bob) chưa online hoặc chưa tải khóa lên Server. Vui lòng mở cổng Sếp trước!", 'danger');
            return;
        }
        const keyData = await resKey.json();
        const bobPubPEM = keyData.public_key_pem;
        
        // 2. Thỏa thuận khóa đối xứng phiên qua ECDH
        const bobPublicKeyObj = await importPublicKeyPEM(bobPubPEM);
        const aesKeyObj = await window.crypto.subtle.deriveKey(
            { name: "ECDH", public: bobPublicKeyObj },
            aliceKeys.privateKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        
        // Hiển thị khóa đối xứng dẫn xuất được lên giao diện (masked)
        const rawKey = await window.crypto.subtle.exportKey("raw", aesKeyObj);
        document.getElementById('alice-aes-key-display').textContent = bufToHex(rawKey).substring(0, 24) + "...";
        
        // 3. Đóng gói dữ liệu bản rõ (Plaintext) thành cấu trúc JSON E2EE
        let plaintextData = "";
        let displayMessage = "";
        
        if (selectedFile) {
            // Đọc tệp tin thành bytes
            showStatus(`Đang đọc tệp tin ${selectedFile.name}...`, 'info');
            const fileBytes = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsArrayBuffer(selectedFile);
            });
            
            // Đóng gói cấu trúc tệp tin
            plaintextData = JSON.stringify({
                type: 'file',
                filename: selectedFile.name,
                fileSize: selectedFile.size,
                fileType: selectedFile.type,
                fileData: arrayBufferToBase64(fileBytes) // Base64 hóa dữ liệu nhị phân
            });
            
            displayMessage = `[Tài liệu đính kèm]: ${selectedFile.name}`;
        } else {
            // Đóng gói tin nhắn văn bản thường
            plaintextData = JSON.stringify({
                type: 'text',
                content: messageText
            });
            
            displayMessage = messageText;
        }
        
        // 4. Tiến hành mã hóa liên hợp AES-GCM-256
        showStatus("Đang thực hiện mã hóa AES-GCM đầu cuối...", 'info');
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(plaintextData);
        
        const t0 = performance.now(); // Bấm giờ bắt đầu mã hóa
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            aesKeyObj,
            encodedData
        );
        const t1 = performance.now(); // Bấm giờ kết thúc mã hóa
        console.log(`[PERFORMANCE] Thời gian mã hóa AES-GCM-256: ${(t1 - t0).toFixed(3)} ms`);
        
        // Tách bản mã (Ciphertext) và nhãn xác thực (Tag) từ kết quả của Web Crypto
        const encryptedBytes = new Uint8Array(encrypted);
        const ciphertext = encryptedBytes.slice(0, -16);
        const tag = encryptedBytes.slice(-16);
        
        const ciphertextHex = bufToHex(ciphertext);
        const nonceHex = bufToHex(iv);
        const tagHex = bufToHex(tag);
        
        // 5. Đóng gói Envelope giao dịch chống Replay Attack
        const session_id = crypto.randomUUID();
        const request_nonce = crypto.randomUUID();
        let timestamp = Date.now() / 1000;
        
        if (currentMode === 'expired') {
            timestamp = timestamp - 600; // Lùi giờ 10 phút
        }
        
        const payload = {
            sender: 'alice',
            recipient: 'bob',
            ciphertext: ciphertextHex,
            nonce: nonceHex,
            tag: tagHex,
            sender_public_key: alicePublicKeyPEM, // Đính kèm khóa công khai sử dụng tại thời điểm gửi bản tin này
            session_id: session_id,
            timestamp: timestamp,
            request_nonce: request_nonce
        };
        
        // 6. Gửi dữ liệu mã hóa lên Server trung gian
        showStatus("Đang chuyển gói tin lên Relay Server...", 'info');
        const sendRes = await fetch('/send-report', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const sendData = await sendRes.json();
        
        if (sendRes.status === 200) {
            showStatus("Đã gửi gói tin mã hóa thành công!", 'success');
            
            // Cập nhật giao diện Chat hiển thị tin nhắn đã gửi
            appendMessageToChat('alice', selectedFile ? 'file' : 'text', displayMessage, selectedFile?.name, selectedFile?.size);
            
            // Reset input
            textInput.value = '';
            selectedFile = null;
            fileInput.value = '';
            fileBadge.classList.add('hidden');
            
            // Nếu kích hoạt tấn công phát lại Replay: Gửi lại y hệt
            if (currentMode === 'replay') {
                showStatus("Đang mô phỏng gửi lại gói tin lần 2 (Replay Attack)...", 'warning');
                setTimeout(async () => {
                    const repRes = await fetch('/send-report', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload)
                    });
                    const repData = await repRes.json();
                    if (repRes.status !== 200) {
                        showStatus(`[Replay Test OK]: Server phát hiện và từ chối gói tin trùng lặp! HTTP ${repRes.status} - ${repData.detail}`, 'success');
                    }
                }, 800);
            }
            
        } else {
            let errorMsg = sendData.detail;
            if (typeof errorMsg === 'object') {
                errorMsg = JSON.stringify(errorMsg);
            }
            showStatus(`Server từ chối: ${errorMsg}`, 'danger');
        }
        
    } catch (e) {
        showStatus(`Lỗi mật mã hóa: ${e.message}`, 'danger');
    }
});

// Thêm tin nhắn đã gửi vào khung chat
function appendMessageToChat(sender, type, content, fileName = "", fileSize = 0) {
    const chatBox = document.getElementById('chat-messages');
    const wrapper = document.createElement('div');
    wrapper.className = "message-bubble-wrapper sent";
    
    let bubbleContent = "";
    if (type === 'file') {
        bubbleContent = `
            <div class="file-card">
                <div class="file-icon"><i class='bx bxs-spreadsheet' style='font-size: 28px; vertical-align: middle; color: #ffffff;'></i></div>
                <div class="file-info">
                    <div class="file-name">${fileName}</div>
                    <div class="file-size">${Math.round(fileSize / 1024)} KB</div>
                    <div style="font-size: 10px; color: rgba(255,255,255,0.7); margin-top:2px;">[Mã hóa E2EE]</div>
                </div>
            </div>
        `;
    } else {
        bubbleContent = `<div class="message-bubble">${content}</div>`;
    }
    
    wrapper.innerHTML = `
        <div class="message-meta-info">Tôi (Nhân viên)</div>
        ${bubbleContent}
    `;
    
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Khởi chạy
window.addEventListener('DOMContentLoaded', () => {
    initializeClient();
});

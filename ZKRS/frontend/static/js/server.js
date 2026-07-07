// --- ĐIỀU KHIỂN BẢNG GIÁM SÁT SERVER VÀ TỰ ĐỘNG CẬP NHẬT (LIVE POLLING) ---

// Chuyển đổi qua lại giữa Tab Cơ sở dữ liệu Khóa
document.getElementById('btn-tab-keys').addEventListener('click', () => {
    document.getElementById('btn-tab-keys').classList.add('active');
    document.getElementById('btn-tab-nonces').classList.remove('active');
    document.getElementById('panel-keys').classList.remove('hidden');
    document.getElementById('panel-nonces').classList.add('hidden');
});

// Chuyển đổi qua lại giữa Tab Bộ nhớ đệm Nonce
document.getElementById('btn-tab-nonces').addEventListener('click', () => {
    document.getElementById('btn-tab-keys').classList.remove('active');
    document.getElementById('btn-tab-nonces').classList.add('active');
    document.getElementById('panel-keys').classList.add('hidden');
    document.getElementById('panel-nonces').classList.remove('hidden');
});

// --- HÀM TRUY VẤN LIÊN TỤC TRẠNG THÁI BACKEND (POLLING) ---

async function pollServerState() {
    try {
        // 1. Truy vấn các dòng nhật ký kiểm toán (Audit Logs) mới nhất
        const logsRes = await fetch('/api/logs');
        const logsData = await logsRes.json();
        const logs = logsData.logs;
        
        const monitor = document.getElementById('log-monitor-body');
        monitor.innerHTML = ''; // Làm trống log cũ
        
        logs.forEach(log => {
            const line = document.createElement('div');
            line.className = 'log-item';
            
            // Định dạng màu sắc tùy vào loại log thu được
            if (log.includes('AUDIT_SUCCESS')) {
                line.className = 'log-item success'; // Màu xanh lá cho giao dịch thành công
            } else if (log.includes('WARNING') || log.includes('Rejecting')) {
                line.className = 'log-item error'; // Màu đỏ cho các cảnh báo chặn đứng tấn công
            } else if (log.includes('AUDIT:')) {
                line.className = 'log-item info'; // Màu xanh dương cho thông tin cơ bản
            } else {
                line.className = 'log-item text-muted'; // Màu xám cho các log hệ thống
            }
            
            line.textContent = log;
            monitor.appendChild(line);
        });
        // Tự động cuộn terminal log xuống cuối cùng
        monitor.scrollTop = monitor.scrollHeight;
        
        // 2. Truy vấn danh sách khóa công khai đã được đăng ký
        const keysRes = await fetch('/api/keys');
        const keysData = await keysRes.json();
        const users = keysData.users;
        
        const keysTbody = document.getElementById('keys-table-body');
        keysTbody.innerHTML = '';
        
        if (users && users.length > 0) {
            users.forEach(user => {
                const tr = document.createElement('tr');
                
                // Trực quan hóa tên người dùng thân thiện trên công sở
                let userFriendlyName = "";
                if (user.username === 'alice') {
                    userFriendlyName = "Nhân viên (Alice)";
                } else if (user.username === 'bob') {
                    userFriendlyName = "Sếp (Bob)";
                } else {
                    userFriendlyName = user.username;
                }
                
                const keyPem = user.public_key_pem ? user.public_key_pem.substring(0, 35) + "..." : "Chưa tải lên";
                const statusStr = user.public_key_pem 
                    ? '<span class="text-green" style="color: var(--color-success); font-weight: 600;">Đang hoạt động</span>' 
                    : '<span style="color: var(--text-muted);">Ngoại tuyến</span>';
                
                tr.innerHTML = `
                    <td style="font-weight: 600; color: var(--text-primary);">${userFriendlyName}</td>
                    <td class="font-mono" style="color: var(--text-secondary);">${keyPem}</td>
                    <td>${statusStr}</td>
                `;
                keysTbody.appendChild(tr);
            });
        } else {
            keysTbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding: 20px;">Không có tài khoản nào được đăng ký.</td></tr>';
        }
        
        // 3. Truy vấn các Nonce đang chờ xóa (Active Nonces Cache)
        const noncesRes = await fetch('/api/nonces');
        const noncesData = await noncesRes.json();
        const nonces = noncesData.nonces;
        
        const noncesTbody = document.getElementById('nonces-table-body');
        noncesTbody.innerHTML = '';
        
        if (nonces && nonces.length > 0) {
            const now = Date.now() / 1000;
            nonces.forEach(n => {
                const tr = document.createElement('tr');
                const ttl = Math.max(0, Math.round(n.expiry - now)); // Tính thời gian sống còn lại (TTL)
                
                tr.innerHTML = `
                    <td class="font-mono text-cyan" style="color: var(--color-primary);">${n.nonce.substring(0, 18)}...</td>
                    <td>${ttl} giây</td>
                    <td><span class="badge" style="background: var(--color-primary-light); color: var(--color-primary); font-size: 11.5px; font-weight:600; padding:2px 8px; border-radius:10px;">Đang chặn trùng</span></td>
                `;
                noncesTbody.appendChild(tr);
            });
        } else {
            noncesTbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted" style="padding: 20px;">Không có Nonce nào hoạt động trong Cache.</td></tr>';
        }
        
    } catch (e) {
        console.error("Lỗi khi đồng bộ dữ liệu Server:", e);
    }
}

// Chạy truy vấn live lần đầu và lặp lại mỗi 1 giây (1000ms)
window.addEventListener('DOMContentLoaded', () => {
    pollServerState();
    setInterval(pollServerState, 1000);
});

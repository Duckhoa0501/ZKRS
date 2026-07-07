# Zero-Knowledge Relay Server (ZKRS) - Hệ thống truyền báo cáo E2EE doanh nghiệp bảo mật cao

Hệ thống **ZKRS** là một giải pháp truyền thông tin báo cáo nội bộ bảo mật mã hóa đầu cuối (End-to-End Encryption - E2EE) theo triết lý Không tri thức (Zero-Knowledge). Hệ thống tích hợp các tiêu chuẩn bảo mật hiện đại như trao đổi khóa ECDH P-256, mã hóa đối xứng xác thực AES-GCM-256, sinh trắc học FIDO2/WebAuthn và cơ chế chống tấn công phát lại (Replay Attack).

---

## 📂 Cấu trúc thư mục dự án

```text
ZKRS/
├── backend/
│   ├── app.py                 # FastAPI Web Server (Relay trung gian & Lưu logs)
│   └── logs/
│       └── audit.log          # File ghi vết nhật ký kiểm toán (tự động tạo)
├── frontend/
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css      # CSS styling và hoạt ảnh laze quét vân tay
│   │   └── js/
│   │       ├── employee.js    # Logic Client Nhân viên (Alice): Sinh khóa ECDH, mã hóa AES-GCM
│   │       └── boss.js        # Logic Client Sếp (Bob): Giải mã E2EE, gọi WebAuthn/Windows Hello
│   └── templates/
│       ├── portal.html        # Trang chủ điều hướng các phân hệ
│       ├── employee.html      # Giao diện Cổng Nhân viên gửi báo cáo
│       ├── boss.html          # Giao diện Cổng Sếp nhận & giải mã báo cáo
│       └── server.html        # Trang Dashboard giám sát Server & Live Audit Logs
├── .gitignore                 # Bỏ qua các file nhạy cảm khi push lên GitHub
├── requirements.txt           # Danh mục thư viện Python cần cài đặt
└── README.md                  # Hướng dẫn chi tiết sử dụng hệ thống (File này)
```

---

## 🛠️ Yêu cầu hệ thống & Cài đặt

### 1. Yêu cầu tiên quyết
*   **Python:** Phiên bản 3.8 trở lên.
*   **Trình duyệt khuyến nghị:** Google Chrome, Microsoft Edge, Brave, hoặc Safari (các trình duyệt hỗ trợ đầy đủ Web Crypto API và WebAuthn).

### 2. Cài đặt thư viện phụ trợ
Mở thư mục dự án trên cửa sổ dòng lệnh (Terminal / PowerShell) và chạy lệnh:
```bash
pip install -r requirements.txt
```
*(Các thư viện chính bao gồm: `fastapi`, `uvicorn`, `cryptography`, `bcrypt`, `python-dotenv`)*

---

## 🚀 Cách khởi chạy hệ thống

Chạy lệnh sau tại thư mục gốc của dự án để khởi động FastAPI Server:
```bash
python backend/app.py
```
Mặc định Server sẽ chạy tại địa chỉ: **`http://127.0.0.1:8000`**

### Các phân hệ truy cập trực tiếp:
*   **Cổng Điều Hướng Portal:** [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
*   **Cổng Nhân Viên :** [http://127.0.0.1:8000/employee](http://127.0.0.1:8000/employee)
*   **Cổng Sếp :** [http://127.0.0.1:8000/boss](http://127.0.0.1:8000/boss)
*   **Dashboard Giám Sát Server:** [http://127.0.0.1:8000/server](http://127.0.0.1:8000/server)

---

## 💡 Hướng dẫn kiểm thử & Demo chức năng

### Bước 1: Chuẩn bị môi trường demo
1.  Mở 3 tab trình duyệt song song: Tab 1 cho **Nhân viên**, Tab 2 cho **Sếp**, và Tab 3 cho **Server Dashboard**.
2.  Khi tải trang, hai máy khách Alice và Bob sẽ tự động sinh cặp khóa ECDH nội bộ và đăng ký khóa công khai lên Server. Trạng thái hoạt động và khóa PEM sẽ lập tức hiển thị trên **Server Dashboard**.

### Bước 2: Truyền nhận tin nhắn & Tệp đính kèm E2EE
1.  Tại cổng **Nhân viên (Alice)**: Nhập một tin nhắn hoặc đính kèm một file Excel/PDF bất kỳ. Nhấn **Gửi Báo Cáo**.
2.  Tại cổng **Sếp (Bob)**: Nhấn **Kiểm tra hàng chờ** để nạp gói tin E2EE.
3.  Bấm nút **🔑 Giải mã & Đọc**.
4.  Giao diện popup sinh trắc học sẽ hiển thị:
    *   **Thử nghiệm 1 (Giả lập):** Nhấn **Quét Vân Tay Giả Lập**, hoạt ảnh quét laze chạy 1.5 giây và giải mã tệp tin thô thành công.
    *   **Thử nghiệm 2 (Xác thực thật):** Nhấn **Xác thực Windows Hello (WebAuthn Thật)** để gọi popup vân tay/PIN phần cứng của máy tính đang chạy. Xác thực đúng sẽ mở khóa giải mã.
5.  *(Nếu là file đính kèm)* Bấm **Tải tệp giải mã về máy** để tải xuống file nhị phân gốc.

---

## 🛡️ Hướng dẫn Demo các kịch bản Tấn công Bảo mật

Hệ thống cung cấp sẵn các nút bấm kiểm thử an ninh ngay trên giao diện web để phục vụ trình diễn:

### 1. Tấn công sửa đổi dữ liệu (Tamper Attack)
*   **Cách test:** Tại cổng **Sếp (Bob)**, click chọn hộp kiểm **Sửa đổi Ciphertext (Tamper Attack)** ở danh mục bên phải, sau đó bấm **🔑 Giải mã & Đọc**.
*   **Kết quả:** Bản mã bị thay đổi 1 byte cuối cùng. Hàm giải mã phát hiện nhãn xác thực (GCM Tag) sai lệch, lập tức chặn đứng giải mã, đổi giao diện sang màu đỏ và phát ra cảnh báo an ninh.

### 2. Tấn công phát lại (Replay Attack)
*   **Cách test:** Tại cổng **Nhân viên (Alice)**, tích chọn **Gửi lặp gói tin (Replay Attack)** &rarr; Nhập tin nhắn &rarr; Bấm **Gửi Báo Cáo**.
*   **Kết quả:** Giao dịch lần 1 gửi đi thành công. Bản sao gửi lại sau 800ms lập tức bị FastAPI Server chặn lại và báo lỗi *HTTP 400 Bad Request* do phát hiện trùng nonce đã lưu trong RAM cache.

### 3. Tấn công quá hạn thời gian gửi (Expired Timestamp)
*   **Cách test:** Tại cổng **Nhân viên (Alice)**, tích chọn **Timestamp hết hạn (Chống Replay)** &rarr; Bấm **Gửi Báo Cáo**.
*   **Kết quả:** Trình duyệt tự động lùi thời gian gửi bản tin về 10 phút trước. Máy chủ so khớp thời gian thực tế phát hiện độ lệch lớn hơn cửa sổ trượt cho phép ($\Delta t > 60s$), lập tức từ chối và hủy gói tin.

### 4. Giám sát lịch sử kiểm toán (Audit Logs)
*   **Cách test:** Mở tab **Server Dashboard** song song trong lúc chạy các bài test trên.
*   **Kết quả:** Hệ thống hiển thị nhật ký theo thời gian thực (real-time polling) ghi lại chi tiết mọi hành vi đăng ký khóa, chuyển tiếp báo cáo thành công, lỗi giải mã vân tay hay các cảnh báo chặn Replay Attack có ghi nhận IP chi tiết bằng tiếng Việt.

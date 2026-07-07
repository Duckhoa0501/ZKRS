import os
import time
import logging
import uvicorn
from fastapi import FastAPI, HTTPException, status, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import bcrypt
from dotenv import load_dotenv

# --- NẠP CẤU HÌNH BIẾN MÔI TRƯỜNG ---
load_dotenv()

SERVER_HOST = os.getenv("SERVER_HOST", "127.0.0.1")
SERVER_PORT = int(os.getenv("SERVER_PORT", "8000"))
DELTA_T = int(os.getenv("DELTA_T", "60")) #Thời gian cửa sổ trượt chống Replay (60 giây)

# --- CẤU HÌNH NHẬT KÝ KIỂM TOÁN AN TOÀN (AUDIT LOGGING) ---
# Đảm bảo lưu lịch sử kiểm toán của Server trung gian vào tệp backend/logs/audit.log
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
log_dir = os.path.join(BASE_DIR, "logs")
os.makedirs(log_dir, exist_ok=True)
log_file_path = os.path.join(log_dir, "audit.log")

logging.basicConfig(
    filename=log_file_path,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    encoding="utf-8"
)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
logging.getLogger().addHandler(console_handler)

app = FastAPI(title="Zero-Knowledge Relay Server", version="1.0.0")

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Cấu hình nạp tệp giao diện HTML thông qua Jinja2Templates
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "..", "frontend", "templates"))

# --- CƠ SỞ DỮ LIỆU TẠM THỜI TRONG BỘ NHỚ RAM ---
users_db = {}
reports_db = {}
replay_cache = {}

# --- ĐIỀU KHIỂN ĐẦU VÀO PYDANTIC ---
class UserRegister(BaseModel):
    username: str
    password: str

class PublicKeyUpload(BaseModel):
    username: str
    public_key_pem: str

class ReportPayload(BaseModel):
    sender: str
    recipient: str
    ciphertext: str       # Bản mã Hex chứa nội dung báo cáo hoặc file đính kèm
    nonce: str            # Vector khởi tạo IV Hex (AES-GCM 96-bit)
    tag: str              # Nhãn xác thực Tag Hex (AES-GCM 128-bit)
    sender_public_key: str # Khóa công khai của người gửi tại thời điểm mã hóa bản tin này
    session_id: str       # ID phiên truyền tin
    timestamp: float      # Thời gian gửi gói tin của Client (Epoch)
    request_nonce: str    # Nonce duy nhất chặn tấn công phát lại

# --- GIẢI THUẬT PHÒNG VỆ CHỐNG PHÁT LẠI ---
def clean_expired_nonces():
    now = time.time()
    expired = [nonce for nonce, expiry in replay_cache.items() if now > expiry]
    for nonce in expired:
        del replay_cache[nonce]

def verify_replay(client_time: float, request_nonce: str) -> bool:
    now = time.time()
    if abs(now - client_time) >= DELTA_T:
        logging.warning(f"Bác bỏ gói tin: Timestamp bị lệch quá hạn. Client: {client_time}, Server: {now}")
        return False
        
    clean_expired_nonces()
    
    if request_nonce in replay_cache:
        logging.warning(f"PHÁT HIỆN TẤN CÔNG PHÁT LẠI (REPLAY ATTACK)! Nonce {request_nonce} đã được sử dụng.")
        return False
        
    replay_cache[request_nonce] = now + DELTA_T
    return True

# --- API ENDPOINTS CHO GIAO DỊCH MẬT MÃ ---

@app.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user: UserRegister):
    username_clean = user.username.strip().lower()
    if not username_clean or not user.password:
        raise HTTPException(status_code=400, detail="Tên đăng nhập hoặc mật khẩu không hợp lệ")
        
    if username_clean in users_db:
        return {"message": "Tài khoản đã đăng ký từ trước, tiếp tục..."}
        
    salt = bcrypt.gensalt(rounds=12)
    pw_hash = bcrypt.hashpw(user.password.encode("utf-8"), salt)
    
    users_db[username_clean] = {
        "password_hash": pw_hash,
        "public_key_pem": None
    }
    reports_db[username_clean] = []
    
    logging.info(f"AUDIT: Người dùng '{username_clean}' đăng ký thành công.")
    return {"message": "Đăng ký thành công"}

@app.post("/upload-public-key")
async def upload_public_key(payload: PublicKeyUpload):
    username_clean = payload.username.strip().lower()
    if username_clean not in users_db:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
        
    users_db[username_clean]["public_key_pem"] = payload.public_key_pem
    logging.info(f"AUDIT: Khóa công khai của '{username_clean}' đã được tải lên.")
    return {"message": "Tải khóa công khai lên thành công"}

@app.get("/get-public-key/{username}")
async def get_public_key(username: str):
    username_clean = username.strip().lower()
    if username_clean not in users_db or users_db[username_clean]["public_key_pem"] is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy khóa công khai")
        
    return {"username": username_clean, "public_key_pem": users_db[username_clean]["public_key_pem"]}

@app.post("/send-report")
async def send_report(payload: ReportPayload):
    sender_clean = payload.sender.strip().lower()
    recipient_clean = payload.recipient.strip().lower()
    
    if sender_clean not in users_db:
        raise HTTPException(status_code=404, detail="Người gửi chưa đăng ký")
    if recipient_clean not in users_db:
        raise HTTPException(status_code=404, detail="Người nhận chưa đăng ký")
        
    if not verify_replay(payload.timestamp, payload.request_nonce):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Yêu cầu không hợp lệ: Timestamp hết hạn hoặc phát hiện Replay."
        )
        
    envelope = {
        "sender": sender_clean,
        "ciphertext": payload.ciphertext,
        "nonce": payload.nonce,
        "tag": payload.tag,
        "sender_public_key": payload.sender_public_key,
        "session_id": payload.session_id,
        "timestamp": payload.timestamp
    }
    
    reports_db[recipient_clean].append(envelope)
    
    logging.info(f"AUDIT_SUCCESS: Chuyển tiếp báo cáo từ '{sender_clean}' sang '{recipient_clean}'. Session: {payload.session_id}")
    return {"status": "success", "message": "Gửi báo cáo mã hóa thành công"}

@app.get("/fetch-reports/{username}")
async def fetch_reports(username: str):
    username_clean = username.strip().lower()
    if username_clean not in users_db:
        raise HTTPException(status_code=404, detail="Người nhận chưa đăng ký")
        
    user_queue = reports_db.get(username_clean, [])
    reports_db[username_clean] = []
    
    if len(user_queue) > 0:
        logging.info(f"AUDIT: Người dùng '{username_clean}' lấy thành công {len(user_queue)} báo cáo.")
    return {"reports": user_queue}

# --- JSON API ENDPOINTS PHỤC VỤ DASHBOARD POLLING ---

@app.get("/api/logs")
async def get_logs():
    if os.path.exists(log_file_path):
        with open(log_file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            return {"logs": [line.strip() for line in lines[-50:]]}
    return {"logs": []}

@app.get("/api/keys")
async def get_keys():
    users_list = []
    for username, details in users_db.items():
        users_list.append({
            "username": username,
            "public_key_pem": details["public_key_pem"]
        })
    return {"users": users_list}

@app.get("/api/nonces")
async def get_nonces():
    clean_expired_nonces()
    nonces_list = []
    for nonce, expiry in replay_cache.items():
        nonces_list.append({
            "nonce": nonce,
            "expiry": expiry
        })
    return {"nonces": nonces_list}

# --- GIAO DIỆN WEB DÙNG JINJA2 TEMPLATES ---

@app.get("/employee")
async def get_employee_page(request: Request):
    """Trả về giao diện Cổng Nhân viên (Alice)."""
    return templates.TemplateResponse("employee.html", {"request": request})

@app.get("/boss")
async def get_boss_page(request: Request):
    """Trả về giao diện Cổng Sếp (Bob)."""
    return templates.TemplateResponse("boss.html", {"request": request})

@app.get("/server")
async def get_server_page(request: Request):
    """Trả về giao diện Cổng giám sát Server."""
    return templates.TemplateResponse("server.html", {"request": request})

@app.get("/")
async def read_root(request: Request):
    """Trả về giao diện trang chủ điều hướng Portal."""
    return templates.TemplateResponse("portal.html", {"request": request})

# Mount thư mục assets tĩnh (static/css/style.css, static/js/employee.js...)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "..", "frontend", "static")), name="static")

if __name__ == "__main__":
    print(f"Starting Zero-Knowledge Relay Server on {SERVER_HOST}:{SERVER_PORT}...")
    uvicorn.run("app:app", host=SERVER_HOST, port=SERVER_PORT, reload=False)

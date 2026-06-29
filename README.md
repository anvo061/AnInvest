# AnInvenst - Trình Phân Tích Thông Tin Thị Trường AI

Hệ thống Agent tự động quét tin tức tài chính, kinh tế từ các nguồn hàng đầu Việt Nam & Thế giới, phân tích tác động đối với thị trường chứng khoán và các mã cổ phiếu bằng mô hình Gemini AI thế hệ mới (Gemini 2.5 Flash).

Hệ thống được thiết kế hoàn toàn trên **PowerShell** và **HTML/CSS/JS** thuần, chạy ngay trên Windows mà **không cần cài đặt Node.js hay Python**.

---

## 🛠️ Thành phần hệ thống

1. **`run_agent.ps1`**: Script Agent chạy ẩn. Làm nhiệm vụ cào tin tức RSS định kỳ (mỗi 15 phút), lọc các tin trùng lặp, gọi Gemini API để phân tích tác động và lưu trữ kết quả.
2. **`start_dashboard.ps1`**: Server web mini bằng PowerShell để chạy giao diện Dashboard trên trình duyệt của bạn (tránh lỗi CORS của local file).
3. **`index.html` / `index.css` / `app.js`**: Giao diện Web Dashboard hiển thị các phân tích từ AI: điểm tâm lý thị trường, biểu đồ tỷ lệ, danh sách mã cổ phiếu bị tác động và dòng thời gian tin tức kèm phân tích chi tiết.
4. **`config.json`**: File cấu hình chứa khóa API Key, danh sách RSS Feeds, khoảng thời gian quét.
5. **Thư mục `data/`**: Nơi lưu trữ lịch sử quét (`history.json`) và các kết quả phân tích (`analysis_results.json`).

---

## 🚀 Hướng dẫn khởi chạy (Từng bước)

### Bước 1: Cấu hình Gemini API Key
Bạn cần có một API Key từ Google AI Studio (miễn phí).
1. Truy cập [Google AI Studio](https://aistudio.google.com/) và tạo API Key.
2. Mở file [config.json](file:///C:/Users/voquo/.gemini/antigravity/scratch/AnInvenst/config.json) bằng trình soạn thảo và thay thế `"YOUR_GEMINI_API_KEY"` bằng khóa API của bạn.
   *(Nếu bạn không chỉnh sửa file, trong lần đầu chạy script PowerShell sẽ hỏi và tự lưu khóa API này cho bạn).*

### Bước 2: Chạy Agent quét tin tức
Agent cần được chạy để liên tục thu thập và phân tích dữ liệu.
1. Nhấp chuột phải vào nút **Start (Windows)** chọn **Terminal** hoặc **PowerShell**.
2. Di chuyển vào thư mục dự án (hoặc chạy trực tiếp đường dẫn):
   ```powershell
   cd C:\Users\voquo\.gemini\antigravity\scratch\AnInvenst
   ```
3. Khởi chạy Agent bằng lệnh:
   ```powershell
   powershell -ExecutionPolicy Bypass -File run_agent.ps1
   ```
4. Agent sẽ bắt đầu quét phiên đầu tiên. Bạn có thể thu nhỏ cửa sổ này xuống thanh Taskbar để nó tiếp tục chạy ẩn định kỳ mỗi 15 phút.
   > **Mẹo Test nhanh:** Nếu bạn muốn chạy quét thử 1 lần rồi tắt ngay để kiểm tra kết nối, hãy chạy:
   > `powershell -ExecutionPolicy Bypass -File run_agent.ps1 -OneShot`

### Bước 3: Mở Web Dashboard giao diện
Để xem kết quả phân tích trực quan:
1. Mở một cửa sổ PowerShell mới.
2. Khởi chạy web server bằng lệnh:
   ```powershell
   powershell -ExecutionPolicy Bypass -File start_dashboard.ps1
   ```
3. Trình duyệt mặc định của bạn sẽ tự động mở trang: **`http://localhost:8000`**.
4. Giao diện Dashboard sẽ hiển thị kết quả phân tích. Trang web sẽ tự động làm mới (Auto-Refresh) dữ liệu mỗi 30 giây để cập nhật các tin tức mới nhất từ Agent.

---

## 📊 Các tính năng trên Dashboard

- **Tổ chức thông minh**: Nhấp vào bất kỳ mã cổ phiếu nào ở danh sách **"Theo dõi mã cổ phiếu"** (bên trái) hoặc các thẻ xanh/đỏ (ở tin tức) để lọc nhanh toàn bộ các tin liên quan đến mã đó.
- **Tìm kiếm**: Tìm kiếm từ khóa hoặc mã cổ phiếu trực tiếp tại thanh tìm kiếm.
- **Biểu đồ tỷ lệ**: Hiển thị tỷ trọng xu hướng tích cực/tiêu cực hiện tại của thị trường.
- **Độ ảnh hưởng**: Lọc nhanh các tin tức có tầm quan trọng "Cao", "Trung bình" hoặc "Thấp".
- **Auto-Update**: Tự động đồng bộ hóa với file dữ liệu quét từ Agent chạy ngầm.

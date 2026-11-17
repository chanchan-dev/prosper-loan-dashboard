# Prosper Loan Risk Dashboard — Gói bàn giao v1 (Người 1)

Dự án Dashboard Web tĩnh phân tích dữ liệu rủi ro tín dụng Prosper Loan thuộc đồ án môn **Nhà kho dữ liệu**.
Gói bàn giao v1 này do **Người 1** phụ trách, bao gồm:
1. Toàn bộ khung giao diện chung (Layout, Gradient theme, Responsive, Tab navigation, Chart.js v4).
2. Hoàn thiện **Trang 1: Tổng quan**.
3. Bộ khung và quy chuẩn module sẵn sàng cho **Người 2** tiếp nhận triển khai **Trang 2 (Phân cụm)**, **Trang 3 (Kết quả mô hình)** và deploy lên GitHub Pages.

---

## 1. Cấu trúc thư mục dự án

```text
prosper-dashboard/
│
├── index.html              # Khung giao diện chung, nhúng Chart.js v4, điều phối tab
├── style.css               # Bảng màu chủ đạo (#16487B -> #00ADE3), layout responsive
├── README.md               # Tài liệu hướng dẫn bàn giao và chạy dự án
├── .gitignore              # Chặn file dữ liệu thô (*.csv), file nhạy cảm (*.key.json, .env)
│
├── data/                   # Dữ liệu xuất từ Google BigQuery (Bảng gold.wide_prosper_credit_risk)
│   ├── tong_quan.json      # Chỉ số toàn kho (so_khoan: 55071, ty_le_vo_no: 30.9, tong_du_no: 344813600.0)
│   ├── theo_viec_lam.json  # Tỷ lệ vỡ nợ theo 8 nhóm việc làm (employment_status)
│   └── theo_bang.json      # Tỷ lệ vỡ nợ và dư nợ của 15 bang có nhiều hồ sơ nhất
│
└── js/                     # Các module JavaScript ES6
    ├── trang1.js           # Module hoàn chỉnh cho Trang 1 (Tổng quan & KPI & Biểu đồ cột ngang)
    ├── trang2.js           # Module giữ chỗ cho Trang 2 (Phân cụm) - Người 2 code tiếp
    └── trang3.js           # Module giữ chỗ cho Trang 3 (Kết quả mô hình) - Người 2 code tiếp
```

### Truy vấn SQL tạo `data/theo_bang.json` (15 bang có nhiều hồ sơ nhất)

```sql
SELECT
  borrower_state,
  COUNT(*) AS so_khoan,
  ROUND(AVG(is_default) * 100, 1) AS ty_le_vo_no,
  ROUND(SUM(loan_original_amount), 0) AS tong_du_no
FROM `gold.wide_prosper_credit_risk`
GROUP BY borrower_state
HAVING COUNT(*) >= 300
ORDER BY so_khoan DESC
LIMIT 15;
```

---

## 2. Hướng dẫn chạy thử nghiệm Local (Dành cho Người 2)

Do ứng dụng sử dụng ES Module (`import/export`) và hàm `fetch()` để đọc file JSON trong thư mục `data/`, bạn cần chạy qua một Web Server cục bộ thay vì click đúp mở file `file:///`.

### Cách 1: Sử dụng Python (Khuyến nghị)
Mở PowerShell hoặc Command Prompt tại thư mục dự án và chạy:
```bash
python -m http.server 8000
```
Sau đó mở trình duyệt truy cập: [http://localhost:8000](http://localhost:8000)

### Cách 2: Sử dụng VS Code Live Server
Nếu dùng Visual Studio Code, cài extension **Live Server**, click chuột phải vào `index.html` chọn **Open with Live Server**.

### Cách 3: Sử dụng Node.js (npx serve / http-server)
```bash
npx serve .
# hoặc
npx http-server -p 8000
```

---

## 3. Quy ước kỹ thuật & Hướng dẫn tiếp nhận cho Người 2

### 3.1. Các vùng chứa Tab (DOM Container ID)
Khung giao diện tại `index.html` đã định sẵn 3 container tương ứng cho 3 tab:
- `#tab1`: Đã được `js/trang1.js` render đầy đủ (KPI + 2 biểu đồ Chart.js + bộ lọc bang).
- `#tab2`: Vùng render cho **Trang 2 (Phân cụm)**. Người 2 viết mã nguồn trong `js/trang2.js`.
- `#tab3`: Vùng render cho **Trang 3 (Kết quả mô hình)**. Người 2 viết mã nguồn trong `js/trang3.js`.

### 3.2. Quy ước đặt tên hàm Export trong Module JS
- Trong `js/trang2.js`:
  ```javascript
  export function renderTrang2() {
    const container = document.getElementById('tab2');
    // Code hiển thị biểu đồ phân cụm (ví dụ Scatter Plot, Pie Chart, bảng cụm...)
  }
  ```
- Trong `js/trang3.js`:
  ```javascript
  export function renderTrang3() {
    const container = document.getElementById('tab3');
    // Code hiển thị ma trận nhầm lẫn (Confusion Matrix), ROC curve, Feature Importance...
  }
  ```
- Khi người dùng click vào tab tương ứng, `index.html` sẽ tự động gọi hàm `renderTrang2()` hoặc `renderTrang3()`.

### 3.3. Tái sử dụng Theme & Thư viện đã tích hợp sẵn
- **Chart.js v4**: Đã được nhúng sẵn ở `<head>` (`chart.umd.min.js`), Người 2 có thể sử dụng biến toàn cục `new Chart(...)` trực tiếp trong `trang2.js` và `trang3.js` mà không cần import lại Chart.js.
- **Bảng màu chuẩn trong `style.css`**:
  - Gradient thương hiệu: `linear-gradient(135deg, #16487B 0%, #00ADE3 100%)`
  - Màu nhấn rủi ro cao: `#E63946` (dành cho tỷ lệ vỡ nợ > 30,9%)
  - Màu an toàn: `#00ADE3` / `#16487B`
  - Nền trang: `#EEFCFF`
  - Thẻ card chuẩn: `.chart-card` hoặc `.kpi-card` với nền trắng, bo góc 12px, đổ bóng nhẹ.

### 3.4. Định dạng hiển thị số liệu chuẩn Việt Nam
Để đảm bảo tính nhất quán trên toàn bộ dashboard:
- Số nguyên / số lượng: `val.toLocaleString('vi-VN')` (ví dụ: `55.071`)
- Phần trăm: `val.toLocaleString('vi-VN', { minimumFractionDigits: 1 }) + '%'` (ví dụ: `30,9%`)
- Tiền tệ: `'$' + val.toLocaleString('vi-VN')` (ví dụ: `$344.813.600`)

---

## 4. Hướng dẫn Deploy lên GitHub Pages (Bước cuối của Người 2)

Sau khi Người 2 hoàn thiện Trang 2 và Trang 3:
1. Đẩy toàn bộ mã nguồn lên repository GitHub của đồ án.
2. Vào tab **Settings** của repository trên GitHub.
3. Chọn mục **Pages** ở thanh menu bên trái.
4. Tại phần **Build and deployment > Branch**, chọn branch `main` (hoặc `master`) và thư mục `/(root)`, nhấn **Save**.
5. Sau 1-2 phút, GitHub Pages sẽ cấp link website trực tiếp (ví dụ: `https://<username>.github.io/<repo-name>/`).


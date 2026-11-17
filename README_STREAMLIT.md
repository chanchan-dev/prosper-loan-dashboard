# Prosper Loan Risk Dashboard — Streamlit

## Cấu trúc repo (đẩy NGUYÊN thư mục này lên GitHub, app.py nằm ở gốc repo)

```text
├── app.py
├── requirements.txt
├── .gitignore
├── .streamlit/
│   ├── config.toml
│   └── secrets.toml.example     # chỉ là mẫu, KHÔNG chứa key thật
└── static/prosper-dashboard/    # index.html, style.css, js/, data/*.json, images/
```

## Chạy local
```powershell
pip install -r requirements.txt
streamlit run app.py
```

## Deploy Streamlit Community Cloud
1. Push code lên GitHub (app.py ở gốc repo).
2. share.streamlit.io > Create app > chọn repo, branch, Main file path = `app.py`.
3. (Tuỳ chọn, để Trang 1 đọc trực tiếp BigQuery) App > Settings > Secrets: dán nội dung
   theo mẫu `.streamlit/secrets.toml.example` với key thật của Service Account.
   Service Account cần 2 quyền: **BigQuery Data Viewer** và **BigQuery Job User**.
4. Không có secrets thì app tự dùng `data/cube.json` (snapshot) — vẫn chạy bình thường.

## Dữ liệu
- Trang 1 (cube): BigQuery trực tiếp (cache 1 giờ) hoặc snapshot `cube.json`.
- Trang 2, 3: `cum.json`, `pca_mau.json`, `mo_hinh.json` xuất từ notebook, nằm trong `static/prosper-dashboard/data/`.
  Muốn cập nhật: ghi đè file JSON rồi commit/push, Streamlit Cloud tự deploy lại.

## Bảo mật
Không commit `secrets.toml`, `.env`, file key `*.json` của Service Account (đã có trong `.gitignore`).

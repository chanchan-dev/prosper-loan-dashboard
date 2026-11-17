"""Prosper Loan Risk Dashboard - Streamlit.

Luồng hoạt động:
  1. Trang 1 (cube) lấy dữ liệu trực tiếp từ BigQuery nếu có cấu hình
     st.secrets["gcp_service_account"]; nếu không có / lỗi thì dùng file snapshot
     static/prosper-dashboard/data/cube.json.
  2. Trang 2, 3 dùng JSON xuất từ notebook (cum.json, pca_mau.json, mo_hinh.json).
  3. Toàn bộ HTML/CSS/JS/JSON/ảnh được gộp thành MỘT trang HTML rồi nhúng bằng
     components.html => không phụ thuộc static serving của Streamlit.
"""
import base64
import json
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(
    page_title="Prosper Loan Risk Dashboard",
    layout="wide",
    initial_sidebar_state="collapsed",
)

BASE_DIR = Path(__file__).resolve().parent / "static" / "prosper-dashboard"
DATA_DIR = BASE_DIR / "data"
IMG_DIR = BASE_DIR / "images"
JS_FILES = {"renderTrang1": "trang1.js", "renderTrang2": "trang2.js", "renderTrang3": "trang3.js"}

BQ_PROJECT = "baitapnhom-511504"
CUBE_SQL = f"""
SELECT
  IFNULL(borrower_state, 'Unknown') AS borrower_state,
  IFNULL(employment_status, 'Unknown') AS employment_status,
  CASE WHEN credit_score_lower IS NULL THEN 'Không rõ'
       WHEN credit_score_lower < 600 THEN '<600'
       WHEN credit_score_lower < 660 THEN '600-659'
       WHEN credit_score_lower < 700 THEN '660-699'
       WHEN credit_score_lower < 740 THEN '700-739'
       ELSE '740+' END AS nhom_diem_tin_dung,
  IF(prosper_score IS NULL, 'Thiếu', 'Có') AS prosper_score_status,
  CASE WHEN borrower_apr < 0.15 THEN '<15%'
       WHEN borrower_apr < 0.20 THEN '15-20%'
       WHEN borrower_apr < 0.25 THEN '20-25%'
       WHEN borrower_apr < 0.30 THEN '25-30%'
       ELSE '>=30%' END AS nhom_apr,
  COUNT(*) AS so_khoan,
  SUM(is_default) AS so_vo_no,
  SUM(loan_original_amount) AS tong_du_no
FROM `{BQ_PROJECT}.gold.wide_prosper_credit_risk`
GROUP BY 1, 2, 3, 4, 5
"""


# ----------------------------------------------------------------------------
# Dữ liệu
# ----------------------------------------------------------------------------
@st.cache_data(ttl=3600, show_spinner="Đang truy vấn BigQuery...")
def load_cube_from_bigquery():
    from google.cloud import bigquery
    from google.oauth2 import service_account

    creds = service_account.Credentials.from_service_account_info(
        dict(st.secrets["gcp_service_account"]),
        scopes=["https://www.googleapis.com/auth/bigquery"],
    )
    client = bigquery.Client(credentials=creds, project=BQ_PROJECT)
    rows = client.query(CUBE_SQL).result()
    # Giữ giá trị dạng chuỗi giống file JSON export của BigQuery để JS không phải sửa.
    return [{k: str(v) for k, v in dict(r).items()} for r in rows]


def get_cube():
    """Trả về (cube, nguon) - nguon cho biết dữ liệu đến từ đâu."""
    try:
        has_secret = "gcp_service_account" in st.secrets
    except Exception:  # chưa có secrets.toml -> dùng snapshot
        has_secret = False
    if has_secret:
        try:
            return load_cube_from_bigquery(), "BigQuery (trực tiếp)"
        except Exception as exc:  # noqa: BLE001
            st.session_state["bq_error"] = f"{type(exc).__name__}: {exc}"
    cube = json.loads((DATA_DIR / "cube.json").read_text(encoding="utf-8"))
    return cube, "File snapshot cube.json"


@st.cache_data(show_spinner=False)
def load_snapshot_json(name):
    return json.loads((DATA_DIR / f"{name}.json").read_text(encoding="utf-8"))


@st.cache_data(show_spinner=False)
def image_data_uris():
    out = {}
    for p in IMG_DIR.glob("*.png"):
        out[f"images/{p.name}"] = "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
    return out


# ----------------------------------------------------------------------------
# Gộp index.html + style.css + js/*.js + data + images thành 1 trang HTML
# ----------------------------------------------------------------------------
def _js_safe(obj):
    # Tránh chuỗi "</script>" trong dữ liệu làm hỏng thẻ <script>
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


@st.cache_data(show_spinner=False)
def build_html(cube_json_str: str) -> str:
    html = (BASE_DIR / "index.html").read_text(encoding="utf-8")

    # 1) CSS
    css = (BASE_DIR / "style.css").read_text(encoding="utf-8")
    html = re.sub(r'<link[^>]*href="style\.css"[^>]*>', lambda m: f"<style>{css}</style>", html)

    # 2) Dữ liệu nhúng + chặn fetch('data/xxx.json')
    data = {
        "cube": json.loads(cube_json_str),
        "cum": load_snapshot_json("cum"),
        "pca_mau": load_snapshot_json("pca_mau"),
        "mo_hinh": load_snapshot_json("mo_hinh"),
    }
    shim = (
        "<script>window.__DATA__=" + _js_safe(data) + ";"
        "(function(){var of=window.fetch.bind(window);"
        "window.fetch=function(u,o){var m=String(u).match(/data\\/([A-Za-z0-9_]+)\\.json/);"
        "if(m&&window.__DATA__[m[1]]!==undefined){"
        "return Promise.resolve(new Response(JSON.stringify(window.__DATA__[m[1]]),"
        "{status:200,headers:{'Content-Type':'application/json'}}));}"
        "return of(u,o);};})();</script>"
    )
    html = html.replace("</head>", shim + "</head>", 1)

    # 3) JS: bỏ ES module (import/export) -> gói mỗi file trong 1 hàm riêng
    imgs = image_data_uris()
    parts = []
    for fn_name, fname in JS_FILES.items():
        code = (BASE_DIR / "js" / fname).read_text(encoding="utf-8")
        code = re.sub(r"^\s*export\s+(async\s+function|function|const|let)", r"\1", code, flags=re.M)
        for rel, uri in imgs.items():
            code = code.replace(rel, uri)
        parts.append(f"const {fn_name} = (function(){{\n{code}\n;return {fn_name};}})();")
    bundle = "\n".join(parts)

    # 4) Thay <script type="module"> ... import ... </script> bằng script thường
    def repl(m):
        body = re.sub(r"^\s*import\s+\{[^}]*\}\s+from\s+'[^']+';\s*$", "", m.group(1), flags=re.M)
        return "<script>\n" + bundle.replace("</script>", "<\\/script>") + "\n" + body + "\n</script>"

    html = re.sub(r'<script type="module">(.*?)</script>', repl, html, flags=re.S)
    return html


# ----------------------------------------------------------------------------
# Giao diện
# ----------------------------------------------------------------------------
st.markdown(
    """
    <style>
      .block-container {padding: 0 !important; max-width: 100% !important;}
      header[data-testid="stHeader"] {height: 0;}
      footer {visibility: hidden;}
    </style>
    """,
    unsafe_allow_html=True,
)

cube, nguon = get_cube()
page_html = build_html(json.dumps(cube, ensure_ascii=False))
# st.iframe là API mới; components.html chỉ để dự phòng cho bản Streamlit cũ.
if hasattr(st, "iframe"):
    st.iframe(page_html, height=1150)
else:
    components.html(page_html, height=1150, scrolling=True)

st.caption(f"  Nguồn dữ liệu Trang 1: {nguon}")
if "bq_error" in st.session_state:
    st.caption(f"  Không kết nối được BigQuery, đang dùng snapshot. Lỗi: {st.session_state['bq_error']}")

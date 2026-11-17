/**
 * Module Trang 3: Dự báo rủi ro tín dụng
 * Đảm nhiệm: Người 2
 */

// Bộ nhớ đệm dữ liệu mô hình (chỉ fetch một lần duy nhất)
let cachedModelData = null;

// Các hàm định dạng số chuẩn tiếng Việt (vi-VN)
function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Number(val).toLocaleString('vi-VN');
}

function formatPercent(val, digits = 1) {
  if (val === null || val === undefined || isNaN(val)) return '0,0%';
  return Number(val).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }) + '%';
}

function formatDecimal(val, digits = 3) {
  if (val === null || val === undefined || isNaN(val)) return '0,000';
  return Number(val).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

/**
 * Tải dữ liệu kết quả mô hình từ data/mo_hinh.json (chỉ tải một lần)
 */
async function loadModelData() {
  if (cachedModelData) {
    return cachedModelData;
  }

  const res = await fetch('data/mo_hinh.json');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} khi đọc data/mo_hinh.json`);
  }

  cachedModelData = await res.json();
  return cachedModelData;
}

/**
 * Tìm giá trị lớn nhất của một trường số trong danh sách mô hình
 */
function getMaxMetric(list, key) {
  return Math.max(...list.map(item => Number(item[key])));
}

/**
 * Định dạng ô dữ liệu và in đậm nếu đạt giá trị tốt nhất cột
 */
function renderMetricCell(val, maxVal, formatter) {
  const formatted = formatter(val);
  const isBest = Math.abs(Number(val) - maxVal) < 1e-9;
  return isBest ? `<strong>${formatted}</strong>` : formatted;
}

/**
 * Hàm chính render Trang 3: Dự báo rủi ro tín dụng
 */
export async function renderTrang3() {
  const container = document.getElementById('tab3');
  if (!container) return;

  // Nếu đã được render nội dung rồi thì không ghi đè lại
  if (container.dataset.rendered === 'true') return;

  // Hiển thị trạng thái đang tải giống Trang 1 & Trang 2
  container.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Đang tải kết quả đánh giá mô hình dự báo...</p>
    </div>
  `;

  try {
    const data = await loadModelData();
    const { split, threshold, test, so_sanh_mac_dinh, so_sanh_nguong } = data;

    const thresholdStr = formatDecimal(threshold, 3);
    const totalActualDefaults = Number(test.tp) + Number(test.fn);
    const roundedPrecision = Math.round(Number(test.precision));

    // Giá trị lớn nhất của từng cột ở Bảng 1 (ngưỡng mặc định 0,5)
    const maxDefault = {
      accuracy: getMaxMetric(so_sanh_mac_dinh, 'accuracy'),
      precision: getMaxMetric(so_sanh_mac_dinh, 'precision'),
      recall: getMaxMetric(so_sanh_mac_dinh, 'recall'),
      f1: getMaxMetric(so_sanh_mac_dinh, 'f1'),
      roc_auc: getMaxMetric(so_sanh_mac_dinh, 'roc_auc'),
      pr_auc: getMaxMetric(so_sanh_mac_dinh, 'pr_auc')
    };

    // Giá trị lớn nhất của từng cột hiệu năng ở Bảng 2 (ngưỡng chỉnh để Recall ≥ 80%)
    const maxTuned = {
      precision: getMaxMetric(so_sanh_nguong, 'precision'),
      recall: getMaxMetric(so_sanh_nguong, 'recall'),
      f1: getMaxMetric(so_sanh_nguong, 'f1')
    };

    container.innerHTML = `
      <!-- Thanh tiêu đề Trang 3 -->
      <section class="trang1-header">
        <div class="section-title">
          <h2>Dự báo Rủi ro Tín dụng (XGBoost)</h2>
          <span>• Huấn luyện: ${formatNumber(split.train)} | Validation: ${formatNumber(split.validation)} | Test: ${formatNumber(split.test)} khoản</span>
        </div>
      </section>

      <!-- 1. Hàng 4 thẻ KPI cho tập TEST -->
      <section class="cluster-kpi-grid">
        <!-- KPI 1: ROC-AUC -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">ROC-AUC</span>
          </div>
          <div class="kpi-value">${formatDecimal(test.roc_auc, 3)}</div>
          <div class="kpi-meta">
            <span>Tập Test, ngưỡng ${thresholdStr}</span>
          </div>
        </div>

        <!-- KPI 2: Recall -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Recall (Độ nhạy)</span>
          </div>
          <div class="kpi-value">${formatPercent(test.recall, 1)}</div>
          <div class="kpi-meta">
            <span>Tập Test, ngưỡng ${thresholdStr}</span>
          </div>
        </div>

        <!-- KPI 3: Precision -->
        <div class="kpi-card risk-card">
          <div class="kpi-header">
            <span class="kpi-title">Precision (Độ chuẩn xác)</span>
          </div>
          <div class="kpi-value">${formatPercent(test.precision, 1)}</div>
          <div class="kpi-meta">
            <span>Tập Test, ngưỡng ${thresholdStr}</span>
          </div>
        </div>

        <!-- KPI 4: Accuracy -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Accuracy (Độ chính xác)</span>
          </div>
          <div class="kpi-value">${formatPercent(test.accuracy, 1)}</div>
          <div class="kpi-meta">
            <span>Tập Test, ngưỡng ${thresholdStr}</span>
          </div>
        </div>
      </section>

      <!-- 2. Hàng A: Bảng so sánh mặc định (trái) | Ảnh model_comparison.png (phải) -->
      <section class="t3-row-grid">
        <!-- Trái: Bảng So sánh 3 mô hình trên tập Validation (ngưỡng mặc định 0,5) -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">So sánh 3 mô hình trên tập Validation (ngưỡng mặc định 0,5)</h3>
            <p class="chart-card-subtitle">Giá trị tốt nhất ở mỗi cột được in đậm; dòng XGBoost được tô nền nhẹ vì là mô hình được chọn</p>
          </div>
          <div class="table-responsive">
            <table class="cluster-table model-table">
              <thead>
                <tr>
                  <th>Mô hình</th>
                  <th>Accuracy</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                  <th>ROC-AUC</th>
                  <th>PR-AUC</th>
                </tr>
              </thead>
              <tbody>
                ${so_sanh_mac_dinh.map(m => {
                  const isSelected = m.mo_hinh === 'XGBoost';
                  return `
                    <tr class="${isSelected ? 'model-row-selected' : ''}">
                      <td>
                        ${m.mo_hinh}
                        ${isSelected ? '<span class="model-selected-badge">Mô hình chọn</span>' : ''}
                      </td>
                      <td>${renderMetricCell(m.accuracy, maxDefault.accuracy, v => formatPercent(v, 1))}</td>
                      <td>${renderMetricCell(m.precision, maxDefault.precision, v => formatPercent(v, 1))}</td>
                      <td>${renderMetricCell(m.recall, maxDefault.recall, v => formatPercent(v, 1))}</td>
                      <td>${renderMetricCell(m.f1, maxDefault.f1, v => formatPercent(v, 1))}</td>
                      <td>${renderMetricCell(m.roc_auc, maxDefault.roc_auc, v => formatDecimal(v, 3))}</td>
                      <td>${renderMetricCell(m.pr_auc, maxDefault.pr_auc, v => formatDecimal(v, 3))}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Phải: Thẻ ảnh model_comparison.png -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">So sánh hiệu năng giữa các mô hình</h3>
            <p class="chart-card-subtitle">Trực quan hóa các chỉ số đánh giá giữa 3 mô hình trên tập Validation</p>
          </div>
          <div class="model-image-box">
            <img
              src="images/model_comparison.png"
              alt="So sánh hiệu năng giữa các mô hình"
              class="model-zoomable-img"
              data-caption="So sánh hiệu năng giữa các mô hình"
            >
            <div class="model-img-missing" hidden>Chưa có ảnh</div>
            <span class="model-img-hint">Bấm vào ảnh để phóng to</span>
          </div>
          <div class="chart-insight-box">
            <div>
              <strong>Nhận xét:</strong> XGBoost dẫn đầu ở ROC-AUC, PR-AUC, Recall và F1. Random Forest có Precision cao nhất nhưng Recall chỉ khoảng 51%.
            </div>
          </div>
        </div>
      </section>

      <!-- 3. Hàng B: Bảng sau khi chỉnh ngưỡng (trái) | Ảnh threshold_analysis.png (phải) -->
      <section class="t3-row-grid">
        <!-- Trái: Bảng So sánh sau khi chỉnh ngưỡng để Recall ≥ 80% kèm chú thích -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">So sánh sau khi chỉnh ngưỡng để Recall ≥ 80%</h3>
            <p class="chart-card-subtitle">Đánh giá trên tập Validation khi ưu tiên bắt tối thiểu 80% số khoản vỡ nợ</p>
          </div>
          <div class="table-responsive">
            <table class="cluster-table model-table">
              <thead>
                <tr>
                  <th>Mô hình</th>
                  <th>Ngưỡng</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                </tr>
              </thead>
              <tbody>
                ${so_sanh_nguong.map(m => {
                  const isSelected = m.mo_hinh === 'XGBoost';
                  return `
                    <tr class="${isSelected ? 'model-row-selected' : ''}">
                      <td>
                        ${m.mo_hinh}
                        ${isSelected ? '<span class="model-selected-badge">Mô hình chọn</span>' : ''}
                      </td>
                      <td>${formatDecimal(m.nguong, 3)}</td>
                      <td>${renderMetricCell(m.precision, maxTuned.precision, v => formatPercent(v, 1))}</td>
                      <td>${renderMetricCell(m.recall, maxTuned.recall, v => formatPercent(v, 1))}</td>
                      <td>${renderMetricCell(m.f1, maxTuned.f1, v => formatPercent(v, 1))}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <p class="chart-card-subtitle" style="margin-top: 0.75rem;">
            * Chú thích: Hai bảng sử dụng ngưỡng phân loại khác nhau — bảng ở Hàng A đánh giá tại ngưỡng mặc định 0,5; bảng này điều chỉnh ngưỡng riêng cho từng mô hình (0,442 và 0,338) để đảm bảo Recall ≥ 80% trên tập Validation.
          </p>
        </div>

        <!-- Phải: Thẻ ảnh threshold_analysis.png -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Chọn ngưỡng phân loại</h3>
            <p class="chart-card-subtitle">Sự đánh đổi giữa Precision, Recall và F1 theo ngưỡng dự báo</p>
          </div>
          <div class="model-image-box">
            <img
              src="images/threshold_analysis.png"
              alt="Chọn ngưỡng phân loại"
              class="model-zoomable-img"
              data-caption="Chọn ngưỡng phân loại"
            >
            <div class="model-img-missing" hidden>Chưa có ảnh</div>
            <span class="model-img-hint">Bấm vào ảnh để phóng to</span>
          </div>
          <div class="chart-insight-box">
            <div>
              <strong>Nhận xét:</strong> Nâng ngưỡng thì Precision tăng nhưng Recall giảm. Ngưỡng 0,442 là ngưỡng cao nhất vẫn giữ Recall ≥ 80% trên tập Validation (Precision 45,9%, F1 58,4%).
            </div>
          </div>
        </div>
      </section>

      <!-- 4. Hàng C: roc.png (trái) | confusion_matrix.png (phải) -->
      <section class="t3-row-grid">
        <!-- Trái: Đường cong ROC -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Đường cong ROC (ROC Curve)</h3>
            <p class="chart-card-subtitle">So sánh khả năng phân tách lớp vỡ nợ giữa các mô hình</p>
          </div>
          <div class="model-image-box">
            <img
              src="images/roc.png"
              alt="Đường cong ROC của mô hình"
              class="model-zoomable-img"
              data-caption="Đường cong ROC (ROC Curve)"
            >
            <div class="model-img-missing" hidden>Chưa có ảnh</div>
            <span class="model-img-hint">Bấm vào ảnh để phóng to</span>
          </div>
          <div class="chart-insight-box">
            <div>
              <strong>Nhận xét:</strong> XGBoost và Random Forest gần như ngang nhau (khoảng 0,76), cả hai cao hơn Logistic Regression (khoảng 0,74) trên tập Test.
            </div>
          </div>
        </div>

        <!-- Phải: Ma trận nhầm lẫn (Confusion Matrix) -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Ma trận nhầm lẫn (Confusion Matrix)</h3>
            <p class="chart-card-subtitle">Kết quả phân loại của XGBoost trên tập Test tại ngưỡng ${thresholdStr}</p>
          </div>
          <div class="model-image-box">
            <img
              src="images/confusion_matrix.png"
              alt="Ma trận nhầm lẫn trên tập Test"
              class="model-zoomable-img"
              data-caption="Ma trận nhầm lẫn (Confusion Matrix) — Tập Test, ngưỡng ${thresholdStr}"
            >
            <div class="model-img-missing" hidden>Chưa có ảnh</div>
            <span class="model-img-hint">Bấm vào ảnh để phóng to</span>
          </div>
          <div class="chart-insight-box warning-insight">
            <div>
              <strong>Nhận xét:</strong> Ở ngưỡng ${thresholdStr}, mô hình bắt được ${formatNumber(test.tp)} trên ${formatNumber(totalActualDefaults)} khoản vỡ nợ (Recall ${formatPercent(test.recall, 1)}), đổi lại có ${formatNumber(test.fp)} hồ sơ tốt bị cảnh báo nhầm (Precision ${formatPercent(test.precision, 1)}).
            </div>
          </div>
        </div>
      </section>

      <!-- 5. Hàng D: shap_summary.png (trái) | shap_waterfall.png (phải) -->
      <section class="t3-row-grid">
        <!-- Trái: SHAP Summary -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Phân tích Mức độ Ảnh hưởng của các Biến (SHAP Summary)</h3>
            <p class="chart-card-subtitle">Giải thích chiều hướng và mức độ tác động của từng đặc trưng lên dự báo vỡ nợ</p>
          </div>
          <div class="model-image-box">
            <img
              src="images/shap_summary.png"
              alt="Biểu đồ SHAP Summary"
              class="model-zoomable-img model-shap-img"
              data-caption="Phân tích SHAP Summary — Mức độ ảnh hưởng của các biến"
            >
            <div class="model-img-missing" hidden>Chưa có ảnh</div>
            <span class="model-img-hint">Bấm vào ảnh để phóng to</span>
          </div>
          <div class="chart-insight-box">
            <div>
              <strong>Nhận xét:</strong> Các biến ảnh hưởng mạnh nhất gồm lãi suất vay, việc thiếu prosper_score, tỷ lệ trả góp trên thu nhập (pti) và điểm tín dụng.
            </div>
          </div>
        </div>

        <!-- Phải: SHAP Waterfall -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Giải thích một hồ sơ cụ thể</h3>
            <p class="chart-card-subtitle">Biểu đồ SHAP Waterfall phân rã đóng góp của từng biến trên một hồ sơ mẫu</p>
          </div>
          <div class="model-image-box">
            <img
              src="images/shap_waterfall.png"
              alt="Giải thích một hồ sơ cụ thể (SHAP Waterfall)"
              class="model-zoomable-img model-shap-img"
              data-caption="Giải thích một hồ sơ cụ thể (SHAP Waterfall)"
            >
            <div class="model-img-missing" hidden>Chưa có ảnh</div>
            <span class="model-img-hint">Bấm vào ảnh để phóng to</span>
          </div>
          <div class="chart-insight-box">
            <div>
              <strong>Nhận xét:</strong> Hồ sơ ví dụ trong tập Test có xác suất vỡ nợ khoảng 25,5%, dưới ngưỡng 0,442 nên chưa bị cảnh báo. Tỷ lệ trả góp trên thu nhập (pti) thấp và việc có prosper_score là hai yếu tố kéo rủi ro xuống mạnh nhất. Giá trị trong hình đã được chuẩn hóa.
            </div>
          </div>
        </div>
      </section>

      <!-- 6. Khung "Kết luận và lưu ý" -->
      <section class="chart-card cluster-section-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Kết luận và lưu ý</h3>
          <p class="chart-card-subtitle">Tổng hợp kết quả mô hình dự báo và các lưu ý thực tiễn</p>
        </div>
        <ul class="cluster-quality-list">
          <li>Lãi suất vay cao, hồ sơ thiếu prosper_score và pti cao đều làm tăng xác suất vỡ nợ; điểm tín dụng cao làm giảm.</li>
          <li>Ngưỡng ${thresholdStr} được chọn để ưu tiên bắt khoản vỡ nợ (Recall ≥ 80% trên Validation). Cái giá là Precision thấp (khoảng ${formatNumber(roundedPrecision)}%), tức hơn một nửa số cảnh báo là báo nhầm.</li>
          <li>Lãi suất vay do Prosper định giá theo rủi ro, nên một phần sức dự báo đến từ chính đánh giá rủi ro của nền tảng.</li>
          <li>Dữ liệu chỉ gồm các khoản đã kết thúc (không có khoản đang trả) nên tỷ lệ vỡ nợ 30,9% cao hơn thực tế.</li>
        </ul>
      </section>

      <!-- Overlay phóng to ảnh (Lightbox) -->
      <div id="modelLightboxOverlay" class="image-lightbox-overlay" hidden role="dialog" aria-modal="true">
        <button type="button" id="modelLightboxCloseBtn" class="image-lightbox-close" aria-label="Đóng ảnh">×</button>
        <img id="modelLightboxImg" class="image-lightbox-content" src="" alt="Ảnh phóng to">
        <div id="modelLightboxCaption" class="image-lightbox-caption"></div>
      </div>
    `;

    // Thiết lập tương tác phóng to ảnh (Lightbox) và xử lý trường hợp thiếu file ảnh
    const overlay = document.getElementById('modelLightboxOverlay');
    const closeBtn = document.getElementById('modelLightboxCloseBtn');
    const lightboxImg = document.getElementById('modelLightboxImg');
    const lightboxCaption = document.getElementById('modelLightboxCaption');
    const zoomableImgs = container.querySelectorAll('.model-zoomable-img');

    function closeLightbox() {
      if (overlay && !overlay.hidden) {
        overlay.hidden = true;
        lightboxImg.src = '';
      }
    }

    zoomableImgs.forEach(img => {
      // Nếu thiếu ảnh thì ẩn thẻ img + gợi ý và hiện khung báo "Chưa có ảnh"
      img.addEventListener('error', () => {
        img.hidden = true;
        const box = img.closest('.model-image-box');
        if (box) {
          const missingBox = box.querySelector('.model-img-missing');
          const hintEl = box.querySelector('.model-img-hint');
          if (missingBox) missingBox.hidden = false;
          if (hintEl) hintEl.hidden = true;
        }
      });

      img.addEventListener('click', () => {
        if (img.hidden || !overlay || !lightboxImg) return;
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        if (lightboxCaption) {
          lightboxCaption.textContent = img.dataset.caption || img.alt;
        }
        overlay.hidden = false;
      });
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeLightbox);
    }

    // Bấm ra ngoài ảnh trong overlay để đóng
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target === lightboxCaption) {
          closeLightbox();
        }
      });
    }

    // Bấm phím Escape để đóng overlay
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    });

    container.dataset.rendered = 'true';

  } catch (err) {
    console.error('Lỗi khi tải hoặc hiển thị Trang 3:', err);
    container.innerHTML = `
      <div class="error-message">
        <strong>Không thể tải dữ liệu kết quả mô hình:</strong> ${err.message}.
        <br>Vui lòng đảm bảo bạn đang mở qua HTTP server (ví dụ: <code>python -m http.server 8000</code>) và file <code>data/mo_hinh.json</code> cùng thư mục <code>images/</code> tồn tại đầy đủ.
      </div>
    `;
  }
}

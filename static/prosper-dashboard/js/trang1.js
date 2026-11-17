/**
 * Module Trang 1: Tổng quan rủi ro tín dụng Prosper Loan (Dữ liệu đa chiều cube.json)
 * Đảm nhiệm: Người 1
 */

// Lưu trữ các Chart instance để hủy sạch sẽ khi re-render
let chartDonutInstance = null;
let chartEmploymentInstance = null;
let chartCreditInstance = null;
let chartStateInstance = null;
let chartAprInstance = null;
let chartProsperInstance = null;

// Bộ nhớ đệm dữ liệu cube.json (chỉ fetch một lần)
let cachedCubeRows = null;

// Thứ tự cố định cho nhóm điểm tín dụng, nhóm APR và trạng thái Prosper Score (giá trị gốc trong cube.json)
const CREDIT_SCORE_ORDER = ['<600', '600-659', '660-699', '700-739', '740+', 'Không rõ'];
const APR_ORDER = ['<15%', '15-20%', '20-25%', '25-30%', '>=30%'];
const PROSPER_SCORE_ORDER = ['Có', 'Thiếu'];

// Tên mở rộng của 50 bang và DC
const STATE_NAMES = {
  'AL': 'Alabama',
  'AK': 'Alaska',
  'AZ': 'Arizona',
  'AR': 'Arkansas',
  'CA': 'California',
  'CO': 'Colorado',
  'CT': 'Connecticut',
  'DE': 'Delaware',
  'DC': 'District of Columbia',
  'FL': 'Florida',
  'GA': 'Georgia',
  'HI': 'Hawaii',
  'ID': 'Idaho',
  'IL': 'Illinois',
  'IN': 'Indiana',
  'IA': 'Iowa',
  'KS': 'Kansas',
  'KY': 'Kentucky',
  'LA': 'Louisiana',
  'ME': 'Maine',
  'MD': 'Maryland',
  'MA': 'Massachusetts',
  'MI': 'Michigan',
  'MN': 'Minnesota',
  'MS': 'Mississippi',
  'MO': 'Missouri',
  'MT': 'Montana',
  'NE': 'Nebraska',
  'NV': 'Nevada',
  'NH': 'New Hampshire',
  'NJ': 'New Jersey',
  'NM': 'New Mexico',
  'NY': 'New York',
  'NC': 'North Carolina',
  'ND': 'North Dakota',
  'OH': 'Ohio',
  'OK': 'Oklahoma',
  'OR': 'Oregon',
  'PA': 'Pennsylvania',
  'RI': 'Rhode Island',
  'SC': 'South Carolina',
  'SD': 'South Dakota',
  'TN': 'Tennessee',
  'TX': 'Texas',
  'UT': 'Utah',
  'VT': 'Vermont',
  'VA': 'Virginia',
  'WA': 'Washington',
  'WV': 'West Virginia',
  'WI': 'Wisconsin',
  'WY': 'Wyoming'
};

/**
 * Các hàm ánh xạ nhãn hiển thị (giữ nguyên giá trị gốc khi lọc):
 * - borrower_state "Unknown" -> "Chưa rõ bang"
 * - employment_status "Unknown" -> "Chưa rõ việc làm"
 * - nhom_diem_tin_dung "Không rõ" -> "Chưa rõ điểm"
 * - nhom_apr ">=30%" -> "≥30%"
 */
function getStateLabel(code) {
  if (!code || code === 'Unknown') return 'Chưa rõ bang';
  return STATE_NAMES[code] ? `${code} - ${STATE_NAMES[code]}` : code;
}

function getEmploymentLabel(status) {
  if (!status || status === 'Unknown') return 'Chưa rõ việc làm';
  return status;
}

function getCreditLabel(group) {
  if (!group || group === 'Không rõ') return 'Chưa rõ điểm';
  return group;
}

function getAprLabel(aprGroup) {
  if (!aprGroup) return '';
  return aprGroup.replace('>=', '≥');
}

// Định dạng số tiếng Việt (vi-VN)
function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Number(val).toLocaleString('vi-VN');
}

function formatPercent(val) {
  if (val === null || val === undefined || isNaN(val)) return '0,0%';
  return Number(val).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '$0';
  return '$' + Math.round(Number(val)).toLocaleString('vi-VN');
}

/**
 * Custom Chart.js Plugin: Vẽ đường tham chiếu chuẩn toàn kho (hỗ trợ cả trục X và trục Y)
 */
const referenceLinePlugin = {
  id: 'referenceLine',
  afterDraw(chart, args, options) {
    if (!options || typeof options.value !== 'number') return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;

    const axis = options.axis || 'x';
    const scale = scales[axis];
    if (!scale) return;

    const { top, bottom, left, right } = chartArea;
    const pos = scale.getPixelForValue(options.value);

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = options.color || '#E63946';
    ctx.lineWidth = options.lineWidth || 2;
    ctx.setLineDash(options.lineDash || [5, 4]);

    if (axis === 'x') {
      if (pos < left || pos > right) {
        ctx.restore();
        return;
      }
      ctx.moveTo(pos, top);
      ctx.lineTo(pos, bottom);
      ctx.stroke();

      if (options.label) {
        ctx.fillStyle = options.labelColor || options.color || '#E63946';
        ctx.font = options.labelFont || '600 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(options.label, pos, top - 4);
      }
    } else {
      if (pos < top || pos > bottom) {
        ctx.restore();
        return;
      }
      ctx.moveTo(left, pos);
      ctx.lineTo(right, pos);
      ctx.stroke();

      if (options.label) {
        ctx.fillStyle = options.labelColor || options.color || '#E63946';
        ctx.font = options.labelFont || '600 11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(options.label, right - 4, pos - 4);
      }
    }
    ctx.restore();
  }
};

/**
 * Tải và cache dữ liệu đa chiều từ data/cube.json (chỉ fetch một lần)
 */
async function loadCubeData() {
  if (cachedCubeRows) {
    return cachedCubeRows;
  }

  const res = await fetch('data/cube.json');
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} khi đọc data/cube.json`);
  }

  const raw = await res.json();
  cachedCubeRows = (Array.isArray(raw) ? raw : [raw]).map(r => ({
    borrower_state: String(r.borrower_state || 'Unknown'),
    employment_status: String(r.employment_status || 'Unknown'),
    nhom_diem_tin_dung: String(r.nhom_diem_tin_dung || 'Không rõ'),
    prosper_score_status: String(r.prosper_score_status || 'Thiếu'),
    nhom_apr: String(r.nhom_apr || ''),
    so_khoan: Number(r.so_khoan) || 0,
    so_vo_no: Number(r.so_vo_no) || 0,
    tong_du_no: Number(r.tong_du_no) || 0
  }));

  return cachedCubeRows;
}

/**
 * Tính tổng số khoản, số vỡ nợ, tổng dư nợ và tỷ lệ vỡ nợ (= tổng so_vo_no / tổng so_khoan * 100)
 */
function sumMetrics(rows) {
  let so_khoan = 0;
  let so_vo_no = 0;
  let tong_du_no = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    so_khoan += r.so_khoan;
    so_vo_no += r.so_vo_no;
    tong_du_no += r.tong_du_no;
  }

  const ty_le_vo_no = so_khoan > 0 ? (so_vo_no / so_khoan) * 100 : 0;
  return { so_khoan, so_vo_no, tong_du_no, ty_le_vo_no };
}

/**
 * Gom nhóm dữ liệu theo một trường và tính tổng chuẩn xác
 */
function aggregateByField(rows, field, fixedKeys = null) {
  const map = new Map();
  if (Array.isArray(fixedKeys)) {
    fixedKeys.forEach(k => map.set(k, { key: k, so_khoan: 0, so_vo_no: 0, tong_du_no: 0 }));
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const k = r[field];
    if (!map.has(k)) {
      map.set(k, { key: k, so_khoan: 0, so_vo_no: 0, tong_du_no: 0 });
    }
    const entry = map.get(k);
    entry.so_khoan += r.so_khoan;
    entry.so_vo_no += r.so_vo_no;
    entry.tong_du_no += r.tong_du_no;
  }

  return Array.from(map.values()).map(item => ({
    ...item,
    ty_le_vo_no: item.so_khoan > 0 ? (item.so_vo_no / item.so_khoan) * 100 : 0
  }));
}

/**
 * Tạo màu nền và màu viền cho các cột biểu đồ (đỏ nếu > chuẩn toàn kho, xanh nếu <= chuẩn; làm mờ khi có mục khác đang được lọc)
 */
function buildBarColors(items, avgRate, activeKey = null) {
  const hasHighlight = activeKey !== null && activeKey !== 'ALL';
  const bgColors = [];
  const borderColors = [];
  const borderWidths = [];

  items.forEach(item => {
    const isHigh = item.ty_le_vo_no > avgRate;
    const rgb = isHigh ? '230, 57, 70' : '0, 173, 227';
    const solid = isHigh ? '#E63946' : '#00ADE3';

    if (!hasHighlight) {
      bgColors.push(`rgba(${rgb}, 0.88)`);
      borderColors.push(solid);
      borderWidths.push(1);
    } else if (item.key === activeKey) {
      bgColors.push(`rgba(${rgb}, 1)`);
      borderColors.push('#1C2D42');
      borderWidths.push(2.5);
    } else {
      bgColors.push(`rgba(${rgb}, 0.24)`);
      borderColors.push(`rgba(${rgb}, 0.35)`);
      borderWidths.push(1);
    }
  });

  return { bgColors, borderColors, borderWidths };
}

/**
 * Cập nhật 4 thẻ KPI ở Hàng 1
 */
function updateKPIs(metrics, globalAvgRate, stateFilter, empFilter, creditFilter) {
  const elKhoan = document.getElementById('kpi-so-khoan');
  const elTyLe = document.getElementById('kpi-ty-le-vo-no');
  const elVoNo = document.getElementById('kpi-so-vo-no');
  const elDuNo = document.getElementById('kpi-tong-du-no');

  const subKhoan = document.getElementById('kpi-sub-so-khoan');
  const subTyLe = document.getElementById('kpi-sub-ty-le-vo-no');
  const subVoNo = document.getElementById('kpi-sub-so-vo-no');
  const subDuNo = document.getElementById('kpi-sub-tong-du-no');

  if (elKhoan) elKhoan.textContent = formatNumber(metrics.so_khoan);
  if (elTyLe) elTyLe.textContent = formatPercent(metrics.ty_le_vo_no);
  if (elVoNo) elVoNo.textContent = formatNumber(metrics.so_vo_no);
  if (elDuNo) elDuNo.textContent = formatCurrency(metrics.tong_du_no);

  const scopeParts = [];
  if (stateFilter !== 'ALL') scopeParts.push(getStateLabel(stateFilter));
  if (empFilter !== 'ALL') scopeParts.push(getEmploymentLabel(empFilter));
  if (creditFilter !== 'ALL') scopeParts.push(`Điểm: ${getCreditLabel(creditFilter)}`);
  const scopeText = scopeParts.length > 0 ? scopeParts.join(' • ') : 'Toàn kho Prosper';

  if (subKhoan) subKhoan.textContent = scopeText;
  if (subVoNo) {
    const safeLoans = Math.max(0, metrics.so_khoan - metrics.so_vo_no);
    subVoNo.textContent = `Còn lại ${formatNumber(safeLoans)} khoản không vỡ nợ`;
  }
  if (subDuNo) {
    const avgLoan = metrics.so_khoan > 0 ? metrics.tong_du_no / metrics.so_khoan : 0;
    subDuNo.textContent = `Trung bình ${formatCurrency(avgLoan)}/khoản`;
  }

  if (subTyLe) {
    if (metrics.so_khoan === 0) {
      subTyLe.innerHTML = `<span class="kpi-badge">Không có hồ sơ</span>`;
    } else {
      const diffVal = metrics.ty_le_vo_no - globalAvgRate;
      const diffStr = Math.abs(diffVal).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      if (Math.abs(diffVal) < 0.05) {
        subTyLe.innerHTML = `<span class="kpi-badge">Mức chuẩn toàn kho (${formatPercent(globalAvgRate)})</span>`;
      } else if (diffVal > 0) {
        subTyLe.innerHTML = `<span class="kpi-badge risk-badge">+${diffStr}% so với toàn kho</span>`;
      } else {
        subTyLe.innerHTML = `<span class="kpi-badge">-${diffStr}% so với toàn kho</span>`;
      }
    }
  }

  const statusEl = document.getElementById('t1FilterStatus');
  if (statusEl) {
    statusEl.textContent = `Đang hiển thị: ${scopeText} (${formatNumber(metrics.so_khoan)} khoản)`;
  }
}

/**
 * (a) Vẽ Biểu đồ Donut: Vỡ nợ vs Không vỡ nợ
 */
function renderDonutChart(metrics, globalAvgRate) {
  const ctx = document.getElementById('chartDonut');
  if (!ctx) return;

  const defaultCount = metrics.so_vo_no;
  const safeCount = Math.max(0, metrics.so_khoan - metrics.so_vo_no);
  const defaultRate = metrics.ty_le_vo_no;
  const safeRate = metrics.so_khoan > 0 ? 100 - defaultRate : 0;

  if (chartDonutInstance) {
    chartDonutInstance.destroy();
  }

  chartDonutInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Vỡ nợ', 'Không vỡ nợ'],
      datasets: [{
        data: [defaultCount, safeCount],
        backgroundColor: ['#E63946', '#00ADE3'],
        hoverBackgroundColor: ['#C92A36', '#008AB5'],
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 11.5, weight: '600' },
            color: '#1C2D42',
            padding: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12.5, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const count = context.raw;
              const pct = context.dataIndex === 0 ? defaultRate : safeRate;
              return [
                ` Số lượng: ${formatNumber(count)} khoản`,
                ` Tỷ lệ: ${formatPercent(pct)}`
              ];
            }
          }
        }
      }
    }
  });

  const insightEl = document.getElementById('insightDonut');
  if (insightEl) {
    if (metrics.so_khoan === 0) {
      insightEl.innerHTML = `<div>Không có dữ liệu phù hợp với bộ lọc hiện tại.</div>`;
    } else {
      const cmpText = Math.abs(defaultRate - globalAvgRate) < 0.05
        ? `bằng mức chuẩn toàn kho (${formatPercent(globalAvgRate)})`
        : defaultRate > globalAvgRate
          ? `cao hơn chuẩn toàn kho (${formatPercent(globalAvgRate)})`
          : `thấp hơn chuẩn toàn kho (${formatPercent(globalAvgRate)})`;
      insightEl.innerHTML = `
        <div>
          Có <strong>${formatNumber(defaultCount)}</strong> khoản vỡ nợ (<strong>${formatPercent(defaultRate)}</strong>) và <strong>${formatNumber(safeCount)}</strong> khoản không vỡ nợ (<strong>${formatPercent(safeRate)}</strong>), ${cmpText}.
        </div>
      `;
    }
  }
}

/**
 * (b) Vẽ Biểu đồ Tình trạng việc làm (bỏ qua bộ lọc việc làm, tô đậm việc làm đang chọn)
 */
function renderEmploymentChart(rowsForEmp, globalAvgRate, selectedEmployment) {
  const ctx = document.getElementById('chartEmployment');
  if (!ctx) return;

  const grouped = aggregateByField(rowsForEmp, 'employment_status')
    .filter(d => d.so_khoan > 0)
    .sort((a, b) => b.ty_le_vo_no - a.ty_le_vo_no);

  const labels = grouped.map(d => getEmploymentLabel(d.key));
  const values = grouped.map(d => Number(d.ty_le_vo_no.toFixed(2)));
  const { bgColors, borderColors, borderWidths } = buildBarColors(grouped, globalAvgRate, selectedEmployment);

  if (chartEmploymentInstance) {
    chartEmploymentInstance.destroy();
  }

  chartEmploymentInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tỷ lệ vỡ nợ (%)',
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: borderWidths,
        borderRadius: 5,
        barPercentage: 0.72,
        categoryPercentage: 0.84
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 16, left: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12.5, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => `Việc làm: ${items[0].label}`,
            label: (context) => {
              const item = grouped[context.dataIndex];
              return [
                ` Tỷ lệ vỡ nợ: ${formatPercent(item.ty_le_vo_no)}`,
                ` Số khoản vay: ${formatNumber(item.so_khoan)} (${formatNumber(item.so_vo_no)} vỡ nợ)`,
                ` Tổng dư nợ: ${formatCurrency(item.tong_du_no)}`
              ];
            }
          }
        },
        referenceLine: {
          axis: 'x',
          value: globalAvgRate,
          label: `TB: ${formatPercent(globalAvgRate)}`,
          color: '#E63946'
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          suggestedMax: 50,
          ticks: {
            callback: (v) => `${v}%`,
            color: '#5A6E85',
            font: { family: 'Inter', size: 10.5 }
          },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        },
        y: {
          ticks: {
            color: '#1C2D42',
            font: { family: 'Inter', size: 11, weight: '600' }
          },
          grid: { display: false }
        }
      }
    },
    plugins: [referenceLinePlugin]
  });

  const insightEl = document.getElementById('insightEmployment');
  if (insightEl) {
    if (grouped.length === 0) {
      insightEl.innerHTML = `<div>Không có dữ liệu việc làm cho lựa chọn hiện tại.</div>`;
    } else {
      const highest = grouped[0];
      const lowest = grouped[grouped.length - 1];
      const activeItem = selectedEmployment !== 'ALL' ? grouped.find(g => g.key === selectedEmployment) : null;
      const highlightNote = activeItem
        ? ` Nhóm đang chọn <strong>${getEmploymentLabel(activeItem.key)}</strong> có tỷ lệ <strong>${formatPercent(activeItem.ty_le_vo_no)}</strong> (${formatNumber(activeItem.so_khoan)} khoản).`
        : '';
      insightEl.innerHTML = `
        <div>
          Cao nhất là <strong>${getEmploymentLabel(highest.key)}</strong> (<strong>${formatPercent(highest.ty_le_vo_no)}</strong>, ${formatNumber(highest.so_khoan)} khoản), thấp nhất là <strong>${getEmploymentLabel(lowest.key)}</strong> (<strong>${formatPercent(lowest.ty_le_vo_no)}</strong>).${highlightNote}
        </div>
      `;
    }
  }
}

/**
 * (c) Vẽ Biểu đồ Nhóm điểm tín dụng (thứ tự: <600, 600-659, 660-699, 700-739, 740+, Chưa rõ điểm)
 */
function renderCreditScoreChart(rowsForCredit, globalAvgRate, selectedCredit) {
  const ctx = document.getElementById('chartCreditScore');
  if (!ctx) return;

  const grouped = aggregateByField(rowsForCredit, 'nhom_diem_tin_dung', CREDIT_SCORE_ORDER);
  const labels = grouped.map(d => getCreditLabel(d.key));
  const values = grouped.map(d => Number(d.ty_le_vo_no.toFixed(2)));
  const { bgColors, borderColors, borderWidths } = buildBarColors(grouped, globalAvgRate, selectedCredit);

  if (chartCreditInstance) {
    chartCreditInstance.destroy();
  }

  chartCreditInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tỷ lệ vỡ nợ (%)',
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: borderWidths,
        borderRadius: 5,
        barPercentage: 0.65,
        categoryPercentage: 0.8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 10, left: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12.5, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => `Điểm tín dụng: ${items[0].label}`,
            label: (context) => {
              const item = grouped[context.dataIndex];
              return [
                ` Tỷ lệ vỡ nợ: ${formatPercent(item.ty_le_vo_no)}`,
                ` Số khoản vay: ${formatNumber(item.so_khoan)} (${formatNumber(item.so_vo_no)} vỡ nợ)`,
                ` Tổng dư nợ: ${formatCurrency(item.tong_du_no)}`
              ];
            }
          }
        },
        referenceLine: {
          axis: 'y',
          value: globalAvgRate,
          label: `TB: ${formatPercent(globalAvgRate)}`,
          color: '#E63946'
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#1C2D42',
            font: { family: 'Inter', size: 11, weight: '600' }
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 55,
          ticks: {
            callback: (v) => `${v}%`,
            color: '#5A6E85',
            font: { family: 'Inter', size: 10.5 }
          },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        }
      }
    },
    plugins: [referenceLinePlugin]
  });

  const insightEl = document.getElementById('insightCreditScore');
  if (insightEl) {
    const valid = grouped.filter(d => d.so_khoan > 0);
    if (valid.length === 0) {
      insightEl.innerHTML = `<div>Không có hồ sơ trong các nhóm điểm tín dụng.</div>`;
    } else {
      const sorted = [...valid].sort((a, b) => b.ty_le_vo_no - a.ty_le_vo_no);
      const high = sorted[0];
      const low = sorted[sorted.length - 1];
      const activeItem = selectedCredit !== 'ALL' ? grouped.find(g => g.key === selectedCredit) : null;
      const highlightNote = activeItem
        ? ` Nhóm đang chọn <strong>${getCreditLabel(activeItem.key)}</strong> có tỷ lệ <strong>${formatPercent(activeItem.ty_le_vo_no)}</strong> (${formatNumber(activeItem.so_khoan)} khoản).`
        : '';
      insightEl.innerHTML = `
        <div>
          Nhóm <strong>${getCreditLabel(high.key)}</strong> có rủi ro cao nhất (<strong>${formatPercent(high.ty_le_vo_no)}</strong>), thấp nhất ở nhóm <strong>${getCreditLabel(low.key)}</strong> (<strong>${formatPercent(low.ty_le_vo_no)}</strong>).${highlightNote}
        </div>
      `;
    }
  }
}

/**
 * (d) Vẽ Biểu đồ 15 bang có nhiều hồ sơ nhất (loại "Chưa rõ bang", bỏ qua bộ lọc bang, tô đậm bang đang chọn)
 */
function renderStateChart(rowsForState, globalAvgRate, selectedState) {
  const ctx = document.getElementById('chartState');
  if (!ctx) return;

  const allKnownStates = aggregateByField(
    rowsForState.filter(r => r.borrower_state !== 'Unknown'),
    'borrower_state'
  ).filter(d => d.so_khoan > 0);

  allKnownStates.sort((a, b) => b.so_khoan - a.so_khoan);
  const top15 = allKnownStates.slice(0, 15);

  if (selectedState !== 'ALL' && selectedState !== 'Unknown') {
    const inTop15 = top15.some(d => d.key === selectedState);
    if (!inTop15) {
      const found = allKnownStates.find(d => d.key === selectedState);
      if (found && top15.length > 0) {
        top15[top15.length - 1] = found;
      }
    }
  }

  const sorted = [...top15].sort((a, b) => b.ty_le_vo_no - a.ty_le_vo_no);
  const labels = sorted.map(d => getStateLabel(d.key));
  const values = sorted.map(d => Number(d.ty_le_vo_no.toFixed(2)));
  const { bgColors, borderColors, borderWidths } = buildBarColors(sorted, globalAvgRate, selectedState);

  if (chartStateInstance) {
    chartStateInstance.destroy();
  }

  chartStateInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tỷ lệ vỡ nợ (%)',
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: borderWidths,
        borderRadius: 5,
        barPercentage: 0.74,
        categoryPercentage: 0.86
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 18, left: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12.5, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => `Bang: ${items[0].label}`,
            label: (context) => {
              const item = sorted[context.dataIndex];
              return [
                ` Tỷ lệ vỡ nợ: ${formatPercent(item.ty_le_vo_no)}`,
                ` Số khoản vay: ${formatNumber(item.so_khoan)} (${formatNumber(item.so_vo_no)} vỡ nợ)`,
                ` Tổng dư nợ: ${formatCurrency(item.tong_du_no)}`
              ];
            }
          }
        },
        referenceLine: {
          axis: 'x',
          value: globalAvgRate,
          label: `TB: ${formatPercent(globalAvgRate)}`,
          color: '#E63946'
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          suggestedMax: 45,
          ticks: {
            callback: (v) => `${v}%`,
            color: '#5A6E85',
            font: { family: 'Inter', size: 10.5 }
          },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        },
        y: {
          ticks: {
            color: '#1C2D42',
            font: { family: 'Inter', size: 11, weight: '600' }
          },
          grid: { display: false }
        }
      }
    },
    plugins: [referenceLinePlugin]
  });

  const insightEl = document.getElementById('insightState');
  if (insightEl) {
    if (sorted.length === 0) {
      insightEl.innerHTML = `<div>Không có dữ liệu bang cho lựa chọn hiện tại.</div>`;
    } else {
      const aboveCount = sorted.filter(d => d.ty_le_vo_no > globalAvgRate).length;
      const highest = sorted[0];
      const lowest = sorted[sorted.length - 1];
      const activeStateObj = selectedState !== 'ALL' ? sorted.find(d => d.key === selectedState) : null;
      const selectedNote = activeStateObj
        ? ` Bang đang chọn <strong>${getStateLabel(activeStateObj.key)}</strong> có tỷ lệ <strong>${formatPercent(activeStateObj.ty_le_vo_no)}</strong> (${formatNumber(activeStateObj.so_khoan)} khoản).`
        : selectedState === 'Unknown'
          ? ` (Đang lọc nhóm <strong>Chưa rõ bang</strong>; nhóm này không tính trong top 15 bang).`
          : '';

      insightEl.innerHTML = `
        <div>
          Có <strong>${aboveCount}/${sorted.length}</strong> bang vượt chuẩn toàn kho (${formatPercent(globalAvgRate)}); cao nhất là <strong>${getStateLabel(highest.key)}</strong> (<strong>${formatPercent(highest.ty_le_vo_no)}</strong>), thấp nhất là <strong>${getStateLabel(lowest.key)}</strong> (<strong>${formatPercent(lowest.ty_le_vo_no)}</strong>).${selectedNote}
        </div>
      `;
    }
  }
}

/**
 * (e) Vẽ Biểu đồ Nhóm lãi suất APR (thứ tự: <15%, 15-20%, 20-25%, 25-30%, ≥30%)
 */
function renderAprChart(rowsFiltered, globalAvgRate) {
  const ctx = document.getElementById('chartApr');
  if (!ctx) return;

  const grouped = aggregateByField(rowsFiltered, 'nhom_apr', APR_ORDER);
  const labels = grouped.map(d => getAprLabel(d.key));
  const values = grouped.map(d => Number(d.ty_le_vo_no.toFixed(2)));
  const { bgColors, borderColors, borderWidths } = buildBarColors(grouped, globalAvgRate);

  if (chartAprInstance) {
    chartAprInstance.destroy();
  }

  chartAprInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tỷ lệ vỡ nợ (%)',
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: borderWidths,
        borderRadius: 5,
        barPercentage: 0.62,
        categoryPercentage: 0.78
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 10, left: 4, bottom: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => `Nhóm APR: ${items[0].label}`,
            label: (context) => {
              const item = grouped[context.dataIndex];
              return [
                ` Tỷ lệ vỡ nợ: ${formatPercent(item.ty_le_vo_no)}`,
                ` Số khoản vay: ${formatNumber(item.so_khoan)} (${formatNumber(item.so_vo_no)} vỡ nợ)`,
                ` Tổng dư nợ: ${formatCurrency(item.tong_du_no)}`
              ];
            }
          }
        },
        referenceLine: {
          axis: 'y',
          value: globalAvgRate,
          label: `TB: ${formatPercent(globalAvgRate)}`,
          color: '#E63946'
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#1C2D42',
            font: { family: 'Inter', size: 11, weight: '600' }
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 55,
          ticks: {
            callback: (v) => `${v}%`,
            color: '#5A6E85',
            font: { family: 'Inter', size: 10 }
          },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        }
      }
    },
    plugins: [referenceLinePlugin]
  });

  const insightEl = document.getElementById('insightApr');
  if (insightEl) {
    const valid = grouped.filter(d => d.so_khoan > 0);
    if (valid.length === 0) {
      insightEl.innerHTML = `<div>Không có dữ liệu theo nhóm APR.</div>`;
    } else {
      const sorted = [...valid].sort((a, b) => b.ty_le_vo_no - a.ty_le_vo_no);
      const high = sorted[0];
      const low = sorted[sorted.length - 1];
      insightEl.innerHTML = `
        <div>
          Nhóm APR <strong>${getAprLabel(high.key)}</strong> có tỷ lệ vỡ nợ cao nhất (<strong>${formatPercent(high.ty_le_vo_no)}</strong>), trong khi nhóm <strong>${getAprLabel(low.key)}</strong> thấp nhất (<strong>${formatPercent(low.ty_le_vo_no)}</strong>).
        </div>
      `;
    }
  }
}

/**
 * (f) Vẽ Biểu đồ So sánh hồ sơ Có và Thiếu prosper_score (2 cột)
 */
function renderProsperScoreChart(rowsFiltered, globalAvgRate) {
  const ctx = document.getElementById('chartProsperScore');
  if (!ctx) return;

  const grouped = aggregateByField(rowsFiltered, 'prosper_score_status', PROSPER_SCORE_ORDER);
  const labels = grouped.map(d => d.key === 'Có' ? 'Có Prosper Score' : 'Thiếu Prosper Score');
  const values = grouped.map(d => Number(d.ty_le_vo_no.toFixed(2)));
  const { bgColors, borderColors, borderWidths } = buildBarColors(grouped, globalAvgRate);

  if (chartProsperInstance) {
    chartProsperInstance.destroy();
  }

  chartProsperInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tỷ lệ vỡ nợ (%)',
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: borderWidths,
        borderRadius: 5,
        barPercentage: 0.48,
        categoryPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 10, left: 4, bottom: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => items[0].label,
            label: (context) => {
              const item = grouped[context.dataIndex];
              return [
                ` Tỷ lệ vỡ nợ: ${formatPercent(item.ty_le_vo_no)}`,
                ` Số khoản vay: ${formatNumber(item.so_khoan)} (${formatNumber(item.so_vo_no)} vỡ nợ)`,
                ` Tổng dư nợ: ${formatCurrency(item.tong_du_no)}`
              ];
            }
          }
        },
        referenceLine: {
          axis: 'y',
          value: globalAvgRate,
          label: `TB: ${formatPercent(globalAvgRate)}`,
          color: '#E63946'
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#1C2D42',
            font: { family: 'Inter', size: 11, weight: '600' }
          },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 45,
          ticks: {
            callback: (v) => `${v}%`,
            color: '#5A6E85',
            font: { family: 'Inter', size: 10 }
          },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        }
      }
    },
    plugins: [referenceLinePlugin]
  });

  const insightEl = document.getElementById('insightProsperScore');
  if (insightEl) {
    const coItem = grouped.find(d => d.key === 'Có');
    const thieuItem = grouped.find(d => d.key === 'Thiếu');
    if (!coItem || !thieuItem || (coItem.so_khoan === 0 && thieuItem.so_khoan === 0)) {
      insightEl.innerHTML = `<div>Không có dữ liệu Prosper Score.</div>`;
    } else {
      const diff = Math.abs(thieuItem.ty_le_vo_no - coItem.ty_le_vo_no).toLocaleString('vi-VN', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      });
      insightEl.innerHTML = `
        <div>
          Hồ sơ <strong>Thiếu Prosper Score</strong> có tỷ lệ vỡ nợ <strong>${formatPercent(thieuItem.ty_le_vo_no)}</strong> (${formatNumber(thieuItem.so_khoan)} khoản), chênh lệch <strong>${diff}%</strong> so với nhóm <strong>Có điểm</strong> (<strong>${formatPercent(coItem.ty_le_vo_no)}</strong>).
        </div>
      `;
    }
  }
}

/**
 * Hàm điều phối lọc và vẽ lại toàn bộ KPI + 6 biểu đồ của Trang 1
 */
function applyFiltersAndRender(cubeRows, globalAvgRate, stateFilter, empFilter, creditFilter) {
  const matchState = (r) => stateFilter === 'ALL' || r.borrower_state === stateFilter;
  const matchEmp = (r) => empFilter === 'ALL' || r.employment_status === empFilter;
  const matchCredit = (r) => creditFilter === 'ALL' || r.nhom_diem_tin_dung === creditFilter;

  const rowsAll = cubeRows.filter(r => matchState(r) && matchEmp(r) && matchCredit(r));
  const rowsForEmp = cubeRows.filter(r => matchState(r) && matchCredit(r));
  const rowsForCredit = cubeRows.filter(r => matchState(r) && matchEmp(r));
  const rowsForState = cubeRows.filter(r => matchEmp(r) && matchCredit(r));

  const allMetrics = sumMetrics(rowsAll);

  updateKPIs(allMetrics, globalAvgRate, stateFilter, empFilter, creditFilter);
  renderDonutChart(allMetrics, globalAvgRate);
  renderEmploymentChart(rowsForEmp, globalAvgRate, empFilter);
  renderCreditScoreChart(rowsForCredit, globalAvgRate, creditFilter);
  renderStateChart(rowsForState, globalAvgRate, stateFilter);
  renderAprChart(rowsAll, globalAvgRate);
  renderProsperScoreChart(rowsAll, globalAvgRate);
}

/**
 * Hàm chính khởi tạo và render Trang 1
 */
export async function renderTrang1() {
  const container = document.getElementById('tab1');
  if (!container) return;

  if (container.dataset.rendered === 'true') return;

  container.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Đang tải dữ liệu đa chiều từ data/cube.json...</p>
    </div>
  `;

  try {
    const cubeRows = await loadCubeData();
    const globalTotals = sumMetrics(cubeRows);
    const globalAvgRate = globalTotals.ty_le_vo_no;

    // 1. Danh sách Bang: sắp theo mã A-Z, hiển thị "mã - tên đầy đủ", "Chưa rõ bang" ("Unknown") xếp CUỐI CÙNG
    const allStates = aggregateByField(cubeRows, 'borrower_state');
    const knownStatesAZ = allStates
      .filter(s => s.key !== 'Unknown')
      .sort((a, b) => a.key.localeCompare(b.key));
    const unknownStateItem = allStates.find(s => s.key === 'Unknown');
    const stateOptions = unknownStateItem ? [...knownStatesAZ, unknownStateItem] : knownStatesAZ;

    // 2. Danh sách Việc làm: các nhóm đã rõ xếp trước, "Chưa rõ việc làm" ("Unknown") xếp CUỐI CÙNG
    const allEmps = aggregateByField(cubeRows, 'employment_status');
    const knownEmps = allEmps
      .filter(e => e.key !== 'Unknown')
      .sort((a, b) => b.so_khoan - a.so_khoan);
    const unknownEmpItem = allEmps.find(e => e.key === 'Unknown');
    const empOptions = unknownEmpItem ? [...knownEmps, unknownEmpItem] : knownEmps;

    // 3. Danh sách Nhóm điểm tín dụng: tăng dần theo điểm (<600 -> 740+), "Chưa rõ điểm" ("Không rõ") xếp CUỐI CÙNG
    const creditOptions = aggregateByField(cubeRows, 'nhom_diem_tin_dung', CREDIT_SCORE_ORDER);

    container.innerHTML = `
      <!-- Thanh lọc gọn (1 hàng, sát dưới header, sticky ~48px) -->
      <section class="t1-filter-bar" aria-label="Bộ lọc đa chiều Trang 1">
        <div class="t1-filter-controls">
          <label class="t1-filter-item" for="filterState">
            <span>Bang:</span>
            <select id="filterState" class="t1-select">
              <option value="ALL">Tất cả</option>
              ${stateOptions.map(s => `
                <option value="${s.key}">${getStateLabel(s.key)}</option>
              `).join('')}
            </select>
          </label>

          <label class="t1-filter-item" for="filterEmployment">
            <span>Tình trạng việc làm:</span>
            <select id="filterEmployment" class="t1-select">
              <option value="ALL">Tất cả</option>
              ${empOptions.map(e => `
                <option value="${e.key}">${getEmploymentLabel(e.key)}</option>
              `).join('')}
            </select>
          </label>

          <label class="t1-filter-item" for="filterCredit">
            <span>Nhóm điểm tín dụng:</span>
            <select id="filterCredit" class="t1-select">
              <option value="ALL">Tất cả</option>
              ${creditOptions.map(c => `
                <option value="${c.key}">${getCreditLabel(c.key)}</option>
              `).join('')}
            </select>
          </label>

          <button type="button" id="resetFiltersBtn" class="t1-reset-btn">Đặt lại</button>
        </div>
        <div class="t1-filter-status" id="t1FilterStatus"></div>
      </section>

      <!-- Hàng 1: 4 thẻ KPI -->
      <section class="t1-kpi-grid">
        <!-- KPI 1: Số khoản vay -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Số khoản vay</span>
          </div>
          <div class="kpi-value" id="kpi-so-khoan">0</div>
          <div class="kpi-meta"><span id="kpi-sub-so-khoan">Toàn kho Prosper</span></div>
        </div>

        <!-- KPI 2: Tỷ lệ vỡ nợ -->
        <div class="kpi-card risk-card">
          <div class="kpi-header">
            <span class="kpi-title">Tỷ lệ vỡ nợ</span>
          </div>
          <div class="kpi-value" id="kpi-ty-le-vo-no">0,0%</div>
          <div class="kpi-meta" id="kpi-sub-ty-le-vo-no"></div>
        </div>

        <!-- KPI 3: Số khoản vỡ nợ -->
        <div class="kpi-card risk-card">
          <div class="kpi-header">
            <span class="kpi-title">Số khoản vỡ nợ</span>
          </div>
          <div class="kpi-value" id="kpi-so-vo-no">0</div>
          <div class="kpi-meta"><span id="kpi-sub-so-vo-no"></span></div>
        </div>

        <!-- KPI 4: Tổng dư nợ gốc -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Tổng dư nợ gốc</span>
          </div>
          <div class="kpi-value" id="kpi-tong-du-no">$0</div>
          <div class="kpi-meta"><span id="kpi-sub-tong-du-no"></span></div>
        </div>
      </section>

      <!-- Hàng 2: 3 biểu đồ cạnh nhau (a: Donut, b: Việc làm, c: Nhóm điểm tín dụng) -->
      <section class="t1-row2-grid">
        <!-- (a) Biểu đồ tròn dạng Donut -->
        <div class="chart-card t1-chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Cơ cấu Vỡ nợ / Không vỡ nợ</h3>
            <p class="chart-card-subtitle">Tỷ trọng số khoản vay theo trạng thái rủi ro</p>
          </div>
          <div class="t1-canvas-sm">
            <canvas id="chartDonut"></canvas>
          </div>
          <div class="chart-insight-box" id="insightDonut"></div>
        </div>

        <!-- (b) Tỷ lệ vỡ nợ theo Tình trạng việc làm -->
        <div class="chart-card t1-chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Tỷ lệ vỡ nợ theo Tình trạng việc làm</h3>
            <p class="chart-card-subtitle">Giữ đủ các nhóm khi lọc việc làm; đường chuẩn TB ${formatPercent(globalAvgRate)}</p>
          </div>
          <div class="t1-canvas-sm">
            <canvas id="chartEmployment"></canvas>
          </div>
          <div class="chart-insight-box warning-insight" id="insightEmployment"></div>
        </div>

        <!-- (c) Tỷ lệ vỡ nợ theo Nhóm điểm tín dụng -->
        <div class="chart-card t1-chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Tỷ lệ vỡ nợ theo Nhóm điểm tín dụng</h3>
            <p class="chart-card-subtitle">Thứ tự: &lt;600 → 740+ và Chưa rõ điểm; chuẩn TB ${formatPercent(globalAvgRate)}</p>
          </div>
          <div class="t1-canvas-sm">
            <canvas id="chartCreditScore"></canvas>
          </div>
          <div class="chart-insight-box" id="insightCreditScore"></div>
        </div>
      </section>

      <!-- Hàng 3: (d) Top 15 bang chiếm 2 cột; cột phải xếp (e) Nhóm APR và (f) Prosper Score -->
      <section class="t1-row3-grid">
        <!-- (d) Tỷ lệ vỡ nợ theo Bang (15 bang có nhiều hồ sơ nhất) -->
        <div class="chart-card t1-chart-card t1-col-span-2">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Tỷ lệ vỡ nợ theo Bang (15 bang có nhiều hồ sơ nhất)</h3>
            <p class="chart-card-subtitle">Giữ 15 bang khi lọc theo bang và tô đậm bang đang chọn • Không tính hồ sơ chưa rõ bang</p>
          </div>
          <div class="t1-canvas-lg">
            <canvas id="chartState"></canvas>
          </div>
          <p class="t1-chart-note">* Ghi chú: Không tính hồ sơ chưa rõ bang trong danh sách 15 bang có nhiều hồ sơ nhất.</p>
          <div class="chart-insight-box warning-insight" id="insightState"></div>
        </div>

        <!-- Cột phải: Xếp dọc (e) Nhóm APR và (f) Prosper Score -->
        <div class="t1-right-stack">
          <!-- (e) Tỷ lệ vỡ nợ theo Nhóm lãi suất APR -->
          <div class="chart-card t1-chart-card">
            <div class="chart-card-header">
              <h3 class="chart-card-title">Tỷ lệ vỡ nợ theo Nhóm lãi suất APR</h3>
              <p class="chart-card-subtitle">Thứ tự: &lt;15% → ≥30% (Chuẩn TB ${formatPercent(globalAvgRate)})</p>
            </div>
            <div class="t1-canvas-xs">
              <canvas id="chartApr"></canvas>
            </div>
            <div class="chart-insight-box warning-insight" id="insightApr"></div>
          </div>

          <!-- (f) So sánh hồ sơ Có và Thiếu prosper_score -->
          <div class="chart-card t1-chart-card">
            <div class="chart-card-header">
              <h3 class="chart-card-title">So sánh hồ sơ Có và Thiếu prosper_score</h3>
              <p class="chart-card-subtitle">Đánh giá rủi ro khi khuyết điểm số nội bộ Prosper</p>
            </div>
            <div class="t1-canvas-xs">
              <canvas id="chartProsperScore"></canvas>
            </div>
            <div class="chart-insight-box" id="insightProsperScore"></div>
          </div>
        </div>
      </section>
    `;

    // Gắn sự kiện cho 3 bộ lọc và nút Đặt lại
    const stateSelect = document.getElementById('filterState');
    const empSelect = document.getElementById('filterEmployment');
    const creditSelect = document.getElementById('filterCredit');
    const resetBtn = document.getElementById('resetFiltersBtn');

    const triggerUpdate = () => {
      const sVal = stateSelect ? stateSelect.value : 'ALL';
      const eVal = empSelect ? empSelect.value : 'ALL';
      const cVal = creditSelect ? creditSelect.value : 'ALL';
      applyFiltersAndRender(cubeRows, globalAvgRate, sVal, eVal, cVal);
    };

    if (stateSelect) stateSelect.addEventListener('change', triggerUpdate);
    if (empSelect) empSelect.addEventListener('change', triggerUpdate);
    if (creditSelect) creditSelect.addEventListener('change', triggerUpdate);
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (stateSelect) stateSelect.value = 'ALL';
        if (empSelect) empSelect.value = 'ALL';
        if (creditSelect) creditSelect.value = 'ALL';
        triggerUpdate();
      });
    }

    // Khởi chạy hiển thị lần đầu (chưa lọc)
    triggerUpdate();
    container.dataset.rendered = 'true';

  } catch (err) {
    console.error('Lỗi khi tải hoặc hiển thị Trang 1:', err);
    container.innerHTML = `
      <div class="error-message">
        <strong>Không thể tải dữ liệu:</strong> ${err.message}.
        <br>Vui lòng đảm bảo bạn đang mở qua HTTP server (ví dụ: <code>python -m http.server 8000</code>) và file <code>data/cube.json</code> nằm đúng trong thư mục <code>data/</code>.
      </div>
    `;
  }
}

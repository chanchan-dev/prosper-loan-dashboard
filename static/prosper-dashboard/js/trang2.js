/**
 * Module Trang 2: Phân cụm khách hàng (K-Prototypes Clustering)
 * Đảm nhiệm: Người 2
 */

// Ngưỡng tỷ lệ vỡ nợ trung bình toàn kho (%)
const AVG_DEFAULT_RATE = 30.9;

// Bảng 4 sắc độ trong gam xanh chủ đạo của theme cho các cụm
const CLUSTER_PALETTE = [
  { hex: '#16487B', rgb: '22, 72, 123' },  // Cụm 0: Xanh đậm (Primary Dark)
  { hex: '#00ADE3', rgb: '0, 173, 227' },  // Cụm 1: Xanh sáng (Primary Light)
  { hex: '#0D9488', rgb: '13, 148, 136' }, // Cụm 2: Xanh cổ vịt (Teal)
  { hex: '#2563EB', rgb: '37, 99, 235' }   // Cụm 3: Xanh lam (Royal Blue)
];

// Cấu hình 8 trục đặc trưng cho biểu đồ Radar
const RADAR_AXES = [
  { key: 'diem_tin_dung', label: 'Điểm tín dụng', format: v => formatNumber(v) },
  { key: 'apr', label: 'APR (%)', format: v => formatPercent(v, 1) },
  { key: 'dti', label: 'DTI', format: v => formatDecimal(v, 2) },
  { key: 'thu_nhap', label: 'Thu nhập', format: v => formatCurrency(v) },
  { key: 'khoan_vay', label: 'Khoản vay', format: v => formatCurrency(v) },
  { key: 'lti', label: 'LTI', format: v => formatDecimal(v, 2) },
  { key: 'su_dung_the', label: 'Dùng thẻ (%)', format: v => formatPercent(v, 0) },
  { key: 'ty_le_chu_nha', label: 'Chủ nhà (%)', format: v => formatPercent(v, 0) }
];

// Lưu trữ các Chart instance để hủy sạch sẽ trước khi tạo mới
let chartCountInstance = null;
let chartRateInstance = null;
let chartRadarInstance = null;
let chartDonutInstance = null;
let chartPcaInstance = null;
let isPlotly3dRendered = false;

// Bộ nhớ đệm dữ liệu (chỉ fetch một lần), cụm đang chọn và chế độ 3D/2D
let cachedClusterData = null;
let selectedCluster = null;
let currentPcaMode = '3d';

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

function formatDecimal(val, digits = 2) {
  if (val === null || val === undefined || isNaN(val)) return '0,00';
  return Number(val).toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '$0';
  return '$' + Math.round(Number(val)).toLocaleString('vi-VN');
}

/**
 * Custom Chart.js Plugin: Vẽ đường tham chiếu trung bình nằm ngang trên trục Y
 */
const referenceLineYPlugin = {
  id: 'referenceLineY',
  afterDraw(chart, args, options) {
    if (!options || typeof options.value !== 'number') return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y) return;

    const { top, bottom, left, right } = chartArea;
    const yPos = scales.y.getPixelForValue(options.value);

    if (yPos < top || yPos > bottom) return;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = options.color || '#E63946';
    ctx.lineWidth = options.lineWidth || 2;
    ctx.setLineDash(options.lineDash || [6, 4]);
    ctx.moveTo(left, yPos);
    ctx.lineTo(right, yPos);
    ctx.stroke();

    if (options.label) {
      ctx.fillStyle = options.labelColor || options.color || '#E63946';
      ctx.font = options.labelFont || '600 11.5px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(options.label, right - 6, yPos - 5);
    }
    ctx.restore();
  }
};

/**
 * Custom Chart.js Plugin: Hiển thị tổng số khoản vay ở chính giữa biểu đồ Donut
 */
const donutCenterTextPlugin = {
  id: 'donutCenterText',
  afterDraw(chart, args, options) {
    if (!options || !options.totalText) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#5A6E85';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillText(options.subText || 'Tổng số khoản', centerX, centerY - 11);

    ctx.fillStyle = '#16487B';
    ctx.font = '800 18px Inter, sans-serif';
    ctx.fillText(options.totalText, centerX, centerY + 9);
    ctx.restore();
  }
};

/**
 * Tải dữ liệu phân cụm từ thư mục data/ (chỉ tải một lần duy nhất)
 */
async function loadClusterData() {
  if (cachedClusterData) {
    return cachedClusterData;
  }

  const [resCum, resPca] = await Promise.all([
    fetch('data/cum.json').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} khi đọc data/cum.json`);
      return r.json();
    }),
    fetch('data/pca_mau.json').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} khi đọc data/pca_mau.json`);
      return r.json();
    })
  ]);

  const cumList = (Array.isArray(resCum) ? resCum : [resCum])
    .slice()
    .sort((a, b) => Number(a.Risk_Cluster) - Number(b.Risk_Cluster));
  const pcaList = Array.isArray(resPca) ? resPca : [resPca];

  cachedClusterData = { cumList, pcaList };
  return cachedClusterData;
}

/**
 * Hàng 1 - Biểu đồ cột 1: Số khoản vay theo cụm
 */
function renderClusterCountChart(cumList) {
  const ctx = document.getElementById('chartClusterCount');
  if (!ctx) return;

  const totalLoans = cumList.reduce((sum, c) => sum + Number(c.so_khoan), 0);
  const labels = cumList.map(c => `Cụm ${c.Risk_Cluster}`);
  const values = cumList.map(c => Number(c.so_khoan));
  const bgColors = cumList.map((_, idx) => {
    const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
    return `rgba(${pal.rgb}, 0.88)`;
  });

  if (chartCountInstance) {
    chartCountInstance.destroy();
  }

  chartCountInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Số khoản vay',
        data: values,
        backgroundColor: bgColors,
        borderColor: cumList.map((_, idx) => CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length].hex),
        borderWidth: 1.5,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.76
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 14, right: 12, left: 6, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12.5, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              const item = cumList[items[0].dataIndex];
              return `Cụm ${item.Risk_Cluster}: ${item.Cluster_Name}`;
            },
            label: (context) => {
              const item = cumList[context.dataIndex];
              const share = totalLoans > 0 ? (Number(item.so_khoan) / totalLoans) * 100 : 0;
              return [
                ` Số khoản vay: ${formatNumber(item.so_khoan)} khoản`,
                ` Tỷ trọng: ${formatPercent(share, 1)} toàn kho`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#1C2D42', font: { family: 'Inter', size: 11.5, weight: '600' } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Số lượng khoản vay',
            color: '#5A6E85',
            font: { family: 'Inter', size: 11, weight: '600' }
          },
          ticks: {
            callback: (val) => formatNumber(val),
            color: '#5A6E85',
            font: { family: 'Inter', size: 10.5 }
          },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        }
      }
    }
  });

  const insightEl = document.getElementById('clusterCountInsight');
  if (insightEl && cumList.length > 0) {
    const sortedByCount = [...cumList].sort((a, b) => Number(b.so_khoan) - Number(a.so_khoan));
    const largest = sortedByCount[0];
    const smallest = sortedByCount[sortedByCount.length - 1];
    const largestShare = totalLoans > 0 ? (Number(largest.so_khoan) / totalLoans) * 100 : 0;
    const smallestShare = totalLoans > 0 ? (Number(smallest.so_khoan) / totalLoans) * 100 : 0;

    insightEl.innerHTML = `
      <div>
        <strong>Nhận xét:</strong> Cụm lớn nhất là <strong>Cụm ${largest.Risk_Cluster} (${largest.Cluster_Name})</strong> với <strong>${formatNumber(largest.so_khoan)}</strong> khoản (${formatPercent(largestShare, 1)}), nhỏ nhất là <strong>Cụm ${smallest.Risk_Cluster} (${smallest.Cluster_Name})</strong> với <strong>${formatNumber(smallest.so_khoan)}</strong> khoản (${formatPercent(smallestShare, 1)}).
      </div>
    `;
  }
}

/**
 * Hàng 1 - Biểu đồ cột 2: Tỷ lệ vỡ nợ theo cụm (kèm đường tham chiếu 30,9% trên trục Y)
 */
function renderClusterRateChart(cumList) {
  const ctx = document.getElementById('chartClusterRate');
  if (!ctx) return;

  const labels = cumList.map(c => `Cụm ${c.Risk_Cluster}`);
  const values = cumList.map(c => Number(c.ty_le_vo_no));
  const bgColors = values.map(v => v > AVG_DEFAULT_RATE ? 'rgba(230, 57, 70, 0.9)' : 'rgba(0, 173, 227, 0.9)');
  const borderColors = values.map(v => v > AVG_DEFAULT_RATE ? '#E63946' : '#00ADE3');

  if (chartRateInstance) {
    chartRateInstance.destroy();
  }

  chartRateInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tỷ lệ vỡ nợ (%)',
        data: values,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.76
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 18, right: 12, left: 6, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12.5, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              const item = cumList[items[0].dataIndex];
              return `Cụm ${item.Risk_Cluster}: ${item.Cluster_Name}`;
            },
            label: (context) => {
              const item = cumList[context.dataIndex];
              return [
                ` Tỷ lệ vỡ nợ: ${formatPercent(item.ty_le_vo_no)}`,
                ` Số khoản vay: ${formatNumber(item.so_khoan)} khoản`
              ];
            }
          }
        },
        referenceLineY: {
          value: AVG_DEFAULT_RATE,
          label: `TB: ${formatPercent(AVG_DEFAULT_RATE)}`,
          color: '#E63946',
          lineWidth: 2,
          lineDash: [6, 4]
        }
      },
      scales: {
        x: {
          ticks: { color: '#1C2D42', font: { family: 'Inter', size: 11.5, weight: '600' } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 45,
          title: {
            display: true,
            text: 'Tỷ lệ vỡ nợ (%)',
            color: '#5A6E85',
            font: { family: 'Inter', size: 11, weight: '600' }
          },
          ticks: {
            callback: (val) => `${val}%`,
            color: '#5A6E85',
            font: { family: 'Inter', size: 10.5 }
          },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        }
      }
    },
    plugins: [referenceLineYPlugin]
  });

  const insightEl = document.getElementById('clusterRateInsight');
  if (insightEl && cumList.length > 0) {
    const highRiskClusters = cumList.filter(c => Number(c.ty_le_vo_no) > AVG_DEFAULT_RATE);
    const lowRiskClusters = cumList.filter(c => Number(c.ty_le_vo_no) <= AVG_DEFAULT_RATE);

    const highText = highRiskClusters
      .map(c => `<strong>Cụm ${c.Risk_Cluster}</strong> (${formatPercent(c.ty_le_vo_no)})`)
      .join(' và ');
    const lowText = lowRiskClusters
      .map(c => `<strong>Cụm ${c.Risk_Cluster}</strong> (${formatPercent(c.ty_le_vo_no)})`)
      .join(' và ');

    insightEl.innerHTML = `
      <div>
        <strong>Nhận xét:</strong> Tách thành hai nhóm rủi ro rõ rệt so với chuẩn toàn kho (${formatPercent(AVG_DEFAULT_RATE)}): nhóm vượt ngưỡng gồm ${highText}; nhóm an toàn gồm ${lowText}.
      </div>
    `;
  }
}

/**
 * Hàng 2a - Biểu đồ Radar: Hồ sơ đặc trưng của từng cụm (chuẩn hóa min-max 0-100 giữa các cụm)
 */
function renderClusterRadarChart(cumList) {
  const ctx = document.getElementById('chartClusterRadar');
  if (!ctx) return;

  // Tính min và max của từng trục trên các cụm để chuẩn hóa về [0, 100]
  const bounds = RADAR_AXES.map(axis => {
    const vals = cumList.map(c => Number(c[axis.key]));
    return {
      min: Math.min(...vals),
      max: Math.max(...vals)
    };
  });

  const datasets = cumList.map((c, idx) => {
    const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
    const normValues = RADAR_AXES.map((axis, aIdx) => {
      const raw = Number(c[axis.key]);
      const { min, max } = bounds[aIdx];
      return max > min ? ((raw - min) / (max - min)) * 100 : 50;
    });

    return {
      clusterId: Number(c.Risk_Cluster),
      rawCluster: c,
      label: `Cụm ${c.Risk_Cluster}: ${c.Cluster_Name}`,
      data: normValues,
      backgroundColor: `rgba(${pal.rgb}, 0.15)`,
      borderColor: pal.hex,
      borderWidth: 2,
      pointBackgroundColor: pal.hex,
      pointBorderColor: '#FFFFFF',
      pointRadius: 3,
      pointHoverRadius: 5
    };
  });

  if (chartRadarInstance) {
    chartRadarInstance.destroy();
  }

  chartRadarInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: RADAR_AXES.map(a => a.label),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 11, weight: '600' },
            color: '#1C2D42',
            boxWidth: 12,
            padding: 10
          }
        },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12.5, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => items[0].dataset.label,
            label: (context) => {
              const axis = RADAR_AXES[context.dataIndex];
              const rawVal = context.dataset.rawCluster[axis.key];
              return ` ${axis.label}: ${axis.format(rawVal)}`;
            }
          }
        }
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 25,
            display: false
          },
          pointLabels: {
            color: '#1C2D42',
            font: { family: 'Inter', size: 11, weight: '600' }
          },
          grid: {
            color: 'rgba(0, 173, 227, 0.16)'
          },
          angleLines: {
            color: 'rgba(0, 173, 227, 0.16)'
          }
        }
      }
    }
  });

  // Nhận xét tự sinh từ cum.json cho biểu đồ Radar
  const insightEl = document.getElementById('clusterRadarInsight');
  if (insightEl && cumList.length > 0) {
    const topIncome = [...cumList].sort((a, b) => Number(b.thu_nhap) - Number(a.thu_nhap))[0];
    const topCard = [...cumList].sort((a, b) => Number(b.su_dung_the) - Number(a.su_dung_the))[0];
    const topDti = [...cumList].sort((a, b) => Number(b.dti) - Number(a.dti))[0];

    insightEl.innerHTML = `
      <div>
        <strong>Nhận xét:</strong> <strong>Cụm ${topIncome.Risk_Cluster}</strong> dẫn đầu về thu nhập (${formatCurrency(topIncome.thu_nhap)}) và sở hữu nhà (${formatPercent(topIncome.ty_le_chu_nha, 0)}); <strong>Cụm ${topCard.Risk_Cluster}</strong> cao nhất về dùng thẻ (${formatPercent(topCard.su_dung_the, 0)}) và APR (${formatPercent(topCard.apr, 1)}); <strong>Cụm ${topDti.Risk_Cluster}</strong> cao nhất về DTI (${formatDecimal(topDti.dti, 2)}) và LTI (${formatDecimal(topDti.lti, 2)}).
      </div>
    `;
  }
}

/**
 * Hàng 2b - Biểu đồ Donut: Tỷ trọng số khoản vay theo cụm (ở giữa hiện tổng số khoản)
 */
function renderClusterDonutChart(cumList) {
  const ctx = document.getElementById('chartClusterDonut');
  if (!ctx) return;

  const totalLoans = cumList.reduce((sum, c) => sum + Number(c.so_khoan), 0);
  const shares = cumList.map(c => (totalLoans > 0 ? (Number(c.so_khoan) / totalLoans) * 100 : 0));
  const labels = cumList.map((c, idx) => `Cụm ${c.Risk_Cluster}: ${c.Cluster_Name} (${formatPercent(shares[idx], 1)})`);
  const values = cumList.map(c => Number(c.so_khoan));
  const bgColors = cumList.map((_, idx) => {
    const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
    return `rgba(${pal.rgb}, 0.88)`;
  });

  if (chartDonutInstance) {
    chartDonutInstance.destroy();
  }

  chartDonutInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderColor: '#FFFFFF',
        borderWidth: 2,
        offset: cumList.map(() => 0)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      layout: { padding: { top: 8, bottom: 4, left: 8, right: 8 } },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 11, weight: '600' },
            color: '#1C2D42',
            boxWidth: 12,
            padding: 10,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12.5, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11.5 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => {
              const c = cumList[items[0].dataIndex];
              return `Cụm ${c.Risk_Cluster}: ${c.Cluster_Name}`;
            },
            label: (context) => {
              const c = cumList[context.dataIndex];
              const pct = shares[context.dataIndex];
              return [
                ` Số khoản vay: ${formatNumber(c.so_khoan)} khoản`,
                ` Tỷ trọng: ${formatPercent(pct, 1)} toàn kho`
              ];
            }
          }
        },
        donutCenterText: {
          subText: 'Tổng số khoản',
          totalText: formatNumber(totalLoans)
        }
      }
    },
    plugins: [donutCenterTextPlugin]
  });

  // Nhận xét tự sinh từ cum.json cho biểu đồ Donut
  const insightEl = document.getElementById('clusterDonutInsight');
  if (insightEl && cumList.length > 0) {
    const highRiskLoans = cumList
      .filter(c => Number(c.ty_le_vo_no) > AVG_DEFAULT_RATE)
      .reduce((s, c) => s + Number(c.so_khoan), 0);
    const lowRiskLoans = totalLoans - highRiskLoans;
    const highPct = totalLoans > 0 ? (highRiskLoans / totalLoans) * 100 : 0;
    const lowPct = totalLoans > 0 ? (lowRiskLoans / totalLoans) * 100 : 0;

    insightEl.innerHTML = `
      <div>
        <strong>Nhận xét:</strong> Trong tổng số <strong>${formatNumber(totalLoans)}</strong> khoản vay, hai cụm rủi ro cao chiếm <strong>${formatPercent(highPct, 1)}</strong> (${formatNumber(highRiskLoans)} khoản) và hai cụm rủi ro thấp chiếm <strong>${formatPercent(lowPct, 1)}</strong> (${formatNumber(lowRiskLoans)} khoản).
      </div>
    `;
  }
}

/**
 * Biểu đồ PCA 3D tương tác bằng Plotly.js (hỗ trợ xoay, thu phóng, tự fallback về 2D nếu lỗi)
 */
function renderPca3dChart(cumList, pcaList) {
  const container3d = document.getElementById('pca3dContainer');
  if (!container3d) return false;

  if (typeof window.Plotly === 'undefined') {
    return false;
  }

  try {
    // Giải phóng biểu đồ 3D cũ trước khi vẽ lại để tránh rò rỉ bộ nhớ
    window.Plotly.purge(container3d);

    const hasSelection = selectedCluster !== null;
    const traces = cumList.map((c, idx) => {
      const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
      const clusterId = Number(c.Risk_Cluster);
      const pts = pcaList.filter(p => Number(p.Risk_Cluster) === clusterId);

      const opacity = !hasSelection
        ? 0.6
        : clusterId === selectedCluster
          ? 0.9
          : 0.08;

      const size = !hasSelection
        ? 2.5
        : clusterId === selectedCluster
          ? 3.2
          : 2.0;

      return {
        type: 'scatter3d',
        mode: 'markers',
        name: `Cụm ${c.Risk_Cluster}: ${c.Cluster_Name}`,
        x: pts.map(p => Number(p.pca_1) || 0),
        y: pts.map(p => Number(p.pca_2) || 0),
        z: pts.map(p => Number(p.pca_3 !== undefined ? p.pca_3 : 0)),
        marker: {
          size,
          color: pal.hex,
          opacity
        },
        hovertemplate:
          `<b>Cụm ${c.Risk_Cluster}: ${c.Cluster_Name}</b><br>` +
          'PCA 1: %{x:.3f}<br>PCA 2: %{y:.3f}<br>PCA 3: %{z:.3f}<extra></extra>'
      };
    });

    const layout = {
      margin: { l: 0, r: 0, b: 0, t: 36 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Inter, sans-serif', color: '#1C2D42' },
      legend: {
        orientation: 'h',
        x: 0.5,
        xanchor: 'center',
        y: 1.02,
        font: { size: 12 }
      },
      scene: {
        bgcolor: 'rgba(0,0,0,0)',
        xaxis: {
          title: 'PCA 1',
          gridcolor: 'rgba(0, 173, 227, 0.2)',
          zerolinecolor: 'rgba(22, 72, 123, 0.3)'
        },
        yaxis: {
          title: 'PCA 2',
          gridcolor: 'rgba(0, 173, 227, 0.2)',
          zerolinecolor: 'rgba(22, 72, 123, 0.3)'
        },
        zaxis: {
          title: 'PCA 3',
          gridcolor: 'rgba(0, 173, 227, 0.2)',
          zerolinecolor: 'rgba(22, 72, 123, 0.3)'
        },
        camera: {
          eye: { x: 1.45, y: 1.45, z: 1.15 }
        }
      }
    };

    const config = {
      responsive: true,
      displaylogo: false
    };

    window.Plotly.newPlot(container3d, traces, layout, config);
    isPlotly3dRendered = true;
    return true;
  } catch (err) {
    console.warn('Không thể khởi tạo biểu đồ Plotly 3D, chuyển về 2D:', err);
    isPlotly3dRendered = false;
    return false;
  }
}

/**
 * Biểu đồ chấm 2D (Scatter): Phân bố mẫu hồ sơ trên 2 trục PCA (giữ nguyên code 2D cũ)
 */
function renderPcaScatterChart(cumList, pcaList) {
  const ctx = document.getElementById('chartClusterPca');
  if (!ctx) return;

  const hasSelection = selectedCluster !== null;
  const datasets = cumList.map((c, idx) => {
    const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
    const cId = Number(c.Risk_Cluster);
    const points = pcaList
      .filter(p => Number(p.Risk_Cluster) === cId)
      .map(p => ({ x: Number(p.pca_1), y: Number(p.pca_2) }));

    return {
      clusterId: cId,
      label: `Cụm ${c.Risk_Cluster}: ${c.Cluster_Name}`,
      data: points,
      backgroundColor: !hasSelection
        ? `rgba(${pal.rgb}, 0.5)`
        : cId === selectedCluster
          ? `rgba(${pal.rgb}, 0.85)`
          : `rgba(${pal.rgb}, 0.08)`,
      borderColor: !hasSelection
        ? `rgba(${pal.rgb}, 0.75)`
        : cId === selectedCluster
          ? `rgba(${pal.rgb}, 1)`
          : `rgba(${pal.rgb}, 0.12)`,
      borderWidth: 0.5,
      pointRadius: !hasSelection ? 2.5 : cId === selectedCluster ? 3 : 2,
      pointHoverRadius: 4.5
    };
  });

  if (chartPcaInstance) {
    chartPcaInstance.destroy();
  }

  chartPcaInstance = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 10, right: 16, left: 8, bottom: 8 } },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { family: 'Inter', size: 12, weight: '600' },
            color: '#1C2D42',
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: 'rgba(22, 72, 123, 0.95)',
          titleFont: { family: 'Inter', size: 12, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => items[0].dataset.label,
            label: (context) => {
              const pt = context.raw;
              return ` PCA 1: ${formatDecimal(pt.x, 3)} | PCA 2: ${formatDecimal(pt.y, 3)}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'PCA 1',
            color: '#5A6E85',
            font: { family: 'Inter', size: 12, weight: '600' }
          },
          ticks: { color: '#5A6E85', font: { family: 'Inter', size: 11 } },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        },
        y: {
          title: {
            display: true,
            text: 'PCA 2',
            color: '#5A6E85',
            font: { family: 'Inter', size: 12, weight: '600' }
          },
          ticks: { color: '#5A6E85', font: { family: 'Inter', size: 11 } },
          grid: { color: 'rgba(0, 173, 227, 0.1)' }
        }
      }
    }
  });
}

/**
 * Chuyển đổi chế độ hiển thị PCA 3D / 2D
 */
function setPcaViewMode(mode, cumList, pcaList) {
  const box3d = document.getElementById('pca3dContainer');
  const box2d = document.getElementById('pca2dContainer');
  const btn3d = document.getElementById('btnPca3d');
  const btn2d = document.getElementById('btnPca2d');
  const fallbackEl = document.getElementById('pcaFallbackNotice');

  if (mode === '3d') {
    if (box3d) box3d.hidden = false;
    if (box2d) box2d.hidden = true;
    const ok3d = renderPca3dChart(cumList, pcaList);
    if (!ok3d) {
      // Nếu Plotly lỗi hoặc không có mạng thì tự quay về 2D kèm thông báo nhỏ
      currentPcaMode = '2d';
      if (fallbackEl) fallbackEl.hidden = false;
      if (box3d) box3d.hidden = true;
      if (box2d) box2d.hidden = false;
      if (btn3d) btn3d.classList.remove('active');
      if (btn2d) btn2d.classList.add('active');
      renderPcaScatterChart(cumList, pcaList);
      return;
    }
    currentPcaMode = '3d';
    if (fallbackEl) fallbackEl.hidden = true;
    if (btn3d) btn3d.classList.add('active');
    if (btn2d) btn2d.classList.remove('active');
  } else {
    currentPcaMode = '2d';
    if (box3d) box3d.hidden = true;
    if (box2d) box2d.hidden = false;
    if (btn3d) btn3d.classList.remove('active');
    if (btn2d) btn2d.classList.add('active');
    renderPcaScatterChart(cumList, pcaList);
  }
}

/**
 * Cập nhật giao diện tương tác trên mọi biểu đồ và bảng khi chọn hoặc bỏ chọn một cụm
 */
function applyClusterSelection(cumList) {
  const hasSelection = selectedCluster !== null;

  // 1. Nút "Bỏ chọn"
  const clearBtn = document.getElementById('clearClusterBtn');
  if (clearBtn) {
    clearBtn.hidden = !hasSelection;
  }

  // 2. Làm nổi thẻ cụm được chọn, làm dịu các thẻ khác
  const cards = document.querySelectorAll('.cluster-card[data-cluster]');
  cards.forEach(card => {
    const cId = Number(card.dataset.cluster);
    card.classList.toggle('is-selected', hasSelection && cId === selectedCluster);
    card.classList.toggle('is-dimmed', hasSelection && cId !== selectedCluster);
  });

  // 3. Tô nền hàng tương ứng trong bảng hồ sơ cụm
  const rows = document.querySelectorAll('.cluster-table tbody tr[data-cluster]');
  rows.forEach(row => {
    const cId = Number(row.dataset.cluster);
    row.classList.toggle('is-selected', hasSelection && cId === selectedCluster);
  });

  // 4. Cập nhật Biểu đồ cột Số khoản vay
  if (chartCountInstance) {
    const ds = chartCountInstance.data.datasets[0];
    ds.backgroundColor = cumList.map((c, idx) => {
      const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
      if (!hasSelection) return `rgba(${pal.rgb}, 0.88)`;
      return Number(c.Risk_Cluster) === selectedCluster
        ? `rgba(${pal.rgb}, 1)`
        : `rgba(${pal.rgb}, 0.18)`;
    });
    ds.borderColor = cumList.map((c, idx) => {
      const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
      if (!hasSelection || Number(c.Risk_Cluster) === selectedCluster) return pal.hex;
      return `rgba(${pal.rgb}, 0.3)`;
    });
    chartCountInstance.update();
  }

  // 5. Cập nhật Biểu đồ cột Tỷ lệ vỡ nợ
  if (chartRateInstance) {
    const ds = chartRateInstance.data.datasets[0];
    ds.backgroundColor = cumList.map(c => {
      const isHigh = Number(c.ty_le_vo_no) > AVG_DEFAULT_RATE;
      const rgb = isHigh ? '230, 57, 70' : '0, 173, 227';
      if (!hasSelection) return `rgba(${rgb}, 0.9)`;
      return Number(c.Risk_Cluster) === selectedCluster
        ? `rgba(${rgb}, 1)`
        : `rgba(${rgb}, 0.18)`;
    });
    ds.borderColor = cumList.map(c => {
      const isHigh = Number(c.ty_le_vo_no) > AVG_DEFAULT_RATE;
      const rgb = isHigh ? '230, 57, 70' : '0, 173, 227';
      if (!hasSelection || Number(c.Risk_Cluster) === selectedCluster) {
        return isHigh ? '#E63946' : '#00ADE3';
      }
      return `rgba(${rgb}, 0.3)`;
    });
    chartRateInstance.update();
  }

  // 6. Cập nhật Biểu đồ Radar (cụm đang chọn viền dày hơn, các cụm khác mờ đi)
  if (chartRadarInstance) {
    chartRadarInstance.data.datasets.forEach((ds, idx) => {
      const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
      if (!hasSelection) {
        ds.backgroundColor = `rgba(${pal.rgb}, 0.15)`;
        ds.borderColor = pal.hex;
        ds.borderWidth = 2;
        ds.pointBackgroundColor = pal.hex;
        ds.pointRadius = 3;
      } else if (ds.clusterId === selectedCluster) {
        ds.backgroundColor = `rgba(${pal.rgb}, 0.28)`;
        ds.borderColor = pal.hex;
        ds.borderWidth = 3.5;
        ds.pointBackgroundColor = pal.hex;
        ds.pointRadius = 4;
      } else {
        ds.backgroundColor = `rgba(${pal.rgb}, 0.03)`;
        ds.borderColor = `rgba(${pal.rgb}, 0.2)`;
        ds.borderWidth = 1;
        ds.pointBackgroundColor = `rgba(${pal.rgb}, 0.2)`;
        ds.pointRadius = 1.5;
      }
    });
    chartRadarInstance.update();
  }

  // 7. Cập nhật Biểu đồ Donut (phần đang chọn nhô ra nhẹ, các phần khác mờ đi)
  if (chartDonutInstance) {
    const ds = chartDonutInstance.data.datasets[0];
    ds.backgroundColor = cumList.map((c, idx) => {
      const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
      if (!hasSelection) return `rgba(${pal.rgb}, 0.88)`;
      return Number(c.Risk_Cluster) === selectedCluster
        ? `rgba(${pal.rgb}, 1)`
        : `rgba(${pal.rgb}, 0.2)`;
    });
    ds.offset = cumList.map(c =>
      hasSelection && Number(c.Risk_Cluster) === selectedCluster ? 14 : 0
    );
    chartDonutInstance.update();
  }

  // 8. Cập nhật Biểu đồ PCA 3D bằng Plotly.restyle (cụm chọn 0.9, cụm khác 0.08)
  const box3d = document.getElementById('pca3dContainer');
  if (isPlotly3dRendered && box3d && typeof window.Plotly !== 'undefined') {
    const opacities = cumList.map(c => {
      if (!hasSelection) return 0.6;
      return Number(c.Risk_Cluster) === selectedCluster ? 0.9 : 0.08;
    });
    const sizes = cumList.map(c => {
      if (!hasSelection) return 2.5;
      return Number(c.Risk_Cluster) === selectedCluster ? 3.2 : 2.0;
    });
    window.Plotly.restyle(box3d, {
      'marker.opacity': opacities,
      'marker.size': sizes
    });
  }

  // 9. Cập nhật Biểu đồ PCA 2D
  if (chartPcaInstance) {
    chartPcaInstance.data.datasets.forEach((ds, idx) => {
      const pal = CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
      if (!hasSelection) {
        ds.backgroundColor = `rgba(${pal.rgb}, 0.5)`;
        ds.borderColor = `rgba(${pal.rgb}, 0.75)`;
        ds.pointRadius = 2.5;
      } else if (ds.clusterId === selectedCluster) {
        ds.backgroundColor = `rgba(${pal.rgb}, 0.85)`;
        ds.borderColor = `rgba(${pal.rgb}, 1)`;
        ds.pointRadius = 3;
      } else {
        ds.backgroundColor = `rgba(${pal.rgb}, 0.08)`;
        ds.borderColor = `rgba(${pal.rgb}, 0.12)`;
        ds.pointRadius = 2;
      }
    });
    chartPcaInstance.update();
  }
}

/**
 * Đảo trạng thái chọn cụm khi người dùng bấm vào thẻ hoặc hàng
 */
function toggleCluster(clusterId, cumList) {
  const numId = Number(clusterId);
  selectedCluster = selectedCluster === numId ? null : numId;
  applyClusterSelection(cumList);
}

/**
 * Hàm chính render Trang 2: Phân cụm khách hàng
 */
export async function renderTrang2() {
  const container = document.getElementById('tab2');
  if (!container) return;

  // Nếu đã render thành công trước đó thì giữ nguyên DOM và trạng thái hiện tại
  if (container.dataset.rendered === 'true') return;

  container.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Đang tải dữ liệu phân cụm K-Prototypes...</p>
    </div>
  `;

  try {
    const { cumList, pcaList } = await loadClusterData();

    container.innerHTML = `
      <!-- Thanh tiêu đề Trang 2 và nút Bỏ chọn -->
      <section class="trang1-header">
        <div class="section-title">
          <h2>Phân cụm Hồ sơ Vay (K-Prototypes)</h2>
          <span>• Bấm vào thẻ cụm hoặc hàng trong bảng để làm nổi cụm trên mọi biểu đồ</span>
        </div>
        <div class="filter-group">
          <button type="button" id="clearClusterBtn" class="clear-cluster-btn" hidden>
            Bỏ chọn
          </button>
        </div>
      </section>

      <!-- Hàng thẻ 4 cụm đọc động từ cum.json -->
      <section class="cluster-kpi-grid">
        ${cumList.map(c => {
          const isHighRisk = Number(c.ty_le_vo_no) > AVG_DEFAULT_RATE;
          return `
            <div class="kpi-card cluster-card ${isHighRisk ? 'risk-card' : ''}" data-cluster="${c.Risk_Cluster}" role="button" tabindex="0" aria-label="Chọn Cụm ${c.Risk_Cluster}: ${c.Cluster_Name}">
              <div>
                <div class="kpi-header">
                  <span class="kpi-title">Cụm ${c.Risk_Cluster}</span>
                  <span class="kpi-badge ${isHighRisk ? 'risk-badge' : ''}">
                    ${formatNumber(c.so_khoan)} khoản
                  </span>
                </div>
                <div class="cluster-name-title">${c.Cluster_Name}</div>
                <div class="kpi-value">${formatPercent(c.ty_le_vo_no)}</div>
                <div class="kpi-meta">
                  <span>Tỷ lệ vỡ nợ (${isHighRisk ? 'Cao hơn TB' : 'Thấp hơn TB'})</span>
                </div>
              </div>
              <div class="cluster-sub-metrics">
                <div>Thu nhập trung vị: <strong>${formatCurrency(c.thu_nhap)}/tháng</strong></div>
                <div>Khoản vay trung vị: <strong>${formatCurrency(c.khoan_vay)}</strong></div>
              </div>
            </div>
          `;
        }).join('')}
      </section>

      <!-- Hàng 1: "Số khoản vay theo cụm" | "Tỷ lệ vỡ nợ theo cụm" (2 cột từ 768px trở lên) -->
      <section class="t2-two-col-grid">
        <!-- Biểu đồ Số khoản vay theo cụm -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Số khoản vay theo Cụm</h3>
            <p class="chart-card-subtitle">Quy mô số lượng hồ sơ vay trong từng cụm khách hàng</p>
          </div>
          <div class="t2-bar-canvas">
            <canvas id="chartClusterCount"></canvas>
          </div>
          <div class="chart-insight-box" id="clusterCountInsight"></div>
        </div>

        <!-- Biểu đồ Tỷ lệ vỡ nợ theo cụm -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Tỷ lệ vỡ nợ theo Cụm</h3>
            <p class="chart-card-subtitle">So sánh tỷ lệ vỡ nợ của từng cụm với mức trung bình toàn kho (30,9%)</p>
            <div class="chart-legend-box">
              <span class="legend-item"><span class="legend-color" style="background:#E63946;"></span> Vượt mức TB (> 30,9%)</span>
              <span class="legend-item"><span class="legend-color" style="background:#00ADE3;"></span> An toàn (≤ 30,9%)</span>
              <span class="legend-item"><span class="legend-line"></span> Đường chuẩn TB: 30,9%</span>
            </div>
          </div>
          <div class="t2-bar-canvas">
            <canvas id="chartClusterRate"></canvas>
          </div>
          <div class="chart-insight-box warning-insight" id="clusterRateInsight"></div>
        </div>
      </section>

      <!-- Hàng 2: Radar hồ sơ cụm | Donut tỷ trọng cụm -->
      <section class="t2-two-col-grid">
        <!-- Biểu đồ Radar: Hồ sơ đặc trưng của từng cụm -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Hồ sơ đặc trưng của từng cụm</h3>
            <p class="chart-card-subtitle">So sánh đa giác 8 đặc trưng trung vị giữa các cụm (Tooltip hiển thị giá trị thật)</p>
          </div>
          <div class="t2-mid-canvas">
            <canvas id="chartClusterRadar"></canvas>
          </div>
          <p class="chart-card-subtitle" style="margin-top: 0.45rem; font-style: italic;">
            Các trục được chuẩn hóa tương đối giữa 4 cụm, dùng để so sánh hình dạng, không phải giá trị tuyệt đối. Giá trị thật xem ở bảng hồ sơ.
          </p>
          <div class="chart-insight-box" id="clusterRadarInsight"></div>
        </div>

        <!-- Biểu đồ Donut: Tỷ trọng số khoản vay theo cụm -->
        <div class="chart-card">
          <div class="chart-card-header">
            <h3 class="chart-card-title">Tỷ trọng số khoản vay theo cụm</h3>
            <p class="chart-card-subtitle">Cơ cấu phân bổ tổng số khoản vay giữa các cụm khách hàng</p>
          </div>
          <div class="t2-mid-canvas">
            <canvas id="chartClusterDonut"></canvas>
          </div>
          <div class="chart-insight-box" id="clusterDonutInsight"></div>
        </div>
      </section>

      <!-- Bảng hồ sơ đặc trưng các cụm -->
      <section class="chart-card cluster-section-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Bảng hồ sơ đặc trưng các Cụm (Giá trị trung vị)</h3>
          <p class="chart-card-subtitle">Các chỉ số đặc trưng hồ sơ khách vay được tính theo trung vị của từng cụm</p>
        </div>
        <div class="table-responsive">
          <table class="cluster-table">
            <thead>
              <tr>
                <th>Cụm</th>
                <th>Số khoản</th>
                <th>Vỡ nợ (%)</th>
                <th>Điểm tín dụng</th>
                <th>APR (%)</th>
                <th>DTI</th>
                <th>Thu nhập ($)</th>
                <th>Khoản vay ($)</th>
                <th>LTI</th>
                <th>Dùng thẻ (%)</th>
                <th>Chủ nhà (%)</th>
              </tr>
            </thead>
            <tbody>
              ${cumList.map(c => {
                const isHighRisk = Number(c.ty_le_vo_no) > AVG_DEFAULT_RATE;
                return `
                  <tr data-cluster="${c.Risk_Cluster}">
                    <td><strong>Cụm ${c.Risk_Cluster}</strong> — ${c.Cluster_Name}</td>
                    <td>${formatNumber(c.so_khoan)}</td>
                    <td style="color:${isHighRisk ? 'var(--danger-color)' : 'var(--primary-dark)'}; font-weight:700;">
                      ${formatPercent(c.ty_le_vo_no)}
                    </td>
                    <td>${formatNumber(c.diem_tin_dung)}</td>
                    <td>${formatPercent(c.apr)}</td>
                    <td>${formatDecimal(c.dti, 2)}</td>
                    <td>${formatCurrency(c.thu_nhap)}</td>
                    <td>${formatCurrency(c.khoan_vay)}</td>
                    <td>${formatDecimal(c.lti, 2)}</td>
                    <td>${formatPercent(c.su_dung_the, 0)}</td>
                    <td>${formatPercent(c.ty_le_chu_nha, 0)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Biểu đồ PCA 3D / 2D (chiếm cả chiều rộng) -->
      <section class="chart-card cluster-section-card">
        <div class="chart-card-header t2-pca-header-row">
          <div>
            <h3 class="chart-card-title">Phân bố Mẫu Hồ sơ trên Không gian Thành phần Chính (PCA 3D / 2D)</h3>
            <p class="chart-card-subtitle">Biểu diễn ${formatNumber(pcaList.length)} hồ sơ mẫu theo màu từng cụm (Kéo chuột để xoay và cuộn để thu phóng ở chế độ 3D)</p>
          </div>
          <div class="t2-mode-switch" role="group" aria-label="Chuyển đổi chế độ PCA 3D và 2D">
            <button type="button" id="btnPca3d" class="t2-mode-btn active">3D</button>
            <button type="button" id="btnPca2d" class="t2-mode-btn">2D</button>
          </div>
        </div>

        <div id="pcaFallbackNotice" class="t2-fallback-notice" hidden>
          Không tải được thư viện Plotly.js (kiểm tra kết nối mạng), hệ thống tự động chuyển về biểu đồ PCA 2D.
        </div>

        <!-- Vùng hiển thị PCA 3D (Plotly) -->
        <div id="pca3dContainer" class="t2-pca-3d-box"></div>

        <!-- Vùng hiển thị PCA 2D (Chart.js) -->
        <div id="pca2dContainer" class="t2-pca-2d-box" hidden>
          <canvas id="chartClusterPca"></canvas>
        </div>

        <div class="chart-insight-box">
          <div>
            <strong>Nhận xét:</strong> Các cụm chồng lấn nhiều trong không gian PCA vì mức độ khác biệt giữa các nhóm hồ sơ khách vay mang tính chuyển tiếp liên tục, không lớn (Silhouette = 0,20); biểu đồ chỉ mang tính minh họa trực quan.
          </div>
        </div>
      </section>

      <!-- Khung "Chất lượng phân cụm và lưu ý" -->
      <section class="chart-card cluster-section-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Chất lượng phân cụm và lưu ý</h3>
          <p class="chart-card-subtitle">Đánh giá thực nghiệm mô hình phân cụm và ý nghĩa sử dụng</p>
        </div>
        <ul class="cluster-quality-list">
          <li>Silhouette = 0,20; ARI ổn định trung bình = 0,707 (2 trong 3 lần chạy đạt 0,86-0,93, một lần chỉ 0,34).</li>
          <li>Cụm 0 và cụm 1 không khác nhau có ý nghĩa thống kê về tỷ lệ vỡ nợ (22,9% so với 22,6%, p = 0,633). Cụm 2 và 3 chênh lệch nhỏ (38,2% so với 39,6%, p = 0,0485). Vì vậy thực chất có 2 mức rủi ro (thấp và cao), 4 cụm khác nhau chủ yếu ở hồ sơ khách vay.</li>
          <li>AUC của cụm so với nhãn vỡ nợ chỉ 0,594: phân cụm dùng để mô tả nhóm khách hàng, không thay thế mô hình dự báo.</li>
          <li>Phương pháp: K-Prototypes (k = 4) trên 5 thành phần PCA (giữ 87,7% phương sai) cộng biến nhị phân sở hữu nhà.</li>
        </ul>
      </section>
    `;

    // Khởi tạo các biểu đồ Hàng 1, Hàng 2 và PCA (mặc định mở 3D)
    renderClusterCountChart(cumList);
    renderClusterRateChart(cumList);
    renderClusterRadarChart(cumList);
    renderClusterDonutChart(cumList);
    setPcaViewMode('3d', cumList, pcaList);

    // Gắn sự kiện cho nút chuyển đổi 3D / 2D
    const btn3d = document.getElementById('btnPca3d');
    const btn2d = document.getElementById('btnPca2d');
    if (btn3d) {
      btn3d.addEventListener('click', () => setPcaViewMode('3d', cumList, pcaList));
    }
    if (btn2d) {
      btn2d.addEventListener('click', () => setPcaViewMode('2d', cumList, pcaList));
    }

    // Gắn sự kiện click và bàn phím cho các thẻ cụm
    const cards = container.querySelectorAll('.cluster-card[data-cluster]');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        toggleCluster(card.dataset.cluster, cumList);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleCluster(card.dataset.cluster, cumList);
        }
      });
    });

    // Gắn sự kiện click cho các hàng trong bảng hồ sơ cụm
    const rows = container.querySelectorAll('.cluster-table tbody tr[data-cluster]');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        toggleCluster(row.dataset.cluster, cumList);
      });
    });

    // Gắn sự kiện cho nút "Bỏ chọn"
    const clearBtn = document.getElementById('clearClusterBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        selectedCluster = null;
        applyClusterSelection(cumList);
      });
    }

    container.dataset.rendered = 'true';

  } catch (err) {
    console.error('Lỗi khi tải hoặc hiển thị Trang 2:', err);
    container.innerHTML = `
      <div class="error-message">
        <strong>Không thể tải dữ liệu phân cụm:</strong> ${err.message}.
        <br>Vui lòng đảm bảo bạn đang mở qua HTTP server (ví dụ: <code>python -m http.server 8000</code>) và các file <code>data/cum.json</code>, <code>data/pca_mau.json</code> tồn tại đầy đủ.
      </div>
    `;
  }
}

/* =====================================================================
 *  charts.js — Chart.js charts (donut, income/expense bars, line, sparkline)
 * ===================================================================== */
(function () {
  'use strict';

  const PALETTE = [
    '#6366f1', '#10b981', '#ef4444', '#f59e0b', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
  ];

  const reg = {};
  function destroy(id) { if (reg[id]) { reg[id].destroy(); delete reg[id]; } }

  function fmtShort(n) {
    n = Math.round(n || 0);
    const a = Math.abs(n);
    if (a >= 1000000) { const v = n / 1000000; return (Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '')) + 'tr'; }
    if (a >= 1000) return Math.round(n / 1000) + 'k';
    return String(n);
  }
  function fmtVND(n) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Math.round(n || 0));
  }
  function cssVar(name, fb) {
    const v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fb;
  }
  function colors() { return { text: cssVar('--text-secondary', '#6b7280'), grid: cssVar('--border', '#e5e7eb') }; }
  const FONT = 'Be Vietnam Pro, system-ui, sans-serif';

  /* Donut + legend. labelFn maps a canonical category to its localized display label. */
  function donut(canvasId, legendId, byCat, onClick, labelFn) {
    labelFn = labelFn || ((x) => x);
    const labels = Object.keys(byCat).filter((k) => byCat[k] > 0); // canonical keys (used for click)
    const display = labels.map(labelFn);                            // localized labels (shown)
    const values = labels.map((k) => byCat[k]);
    const total = values.reduce((a, b) => a + b, 0);
    const ctx = document.getElementById(canvasId);
    if (ctx) {
      destroy(canvasId);
      if (labels.length) {
        reg[canvasId] = new Chart(ctx, {
          type: 'doughnut',
          data: { labels: display, datasets: [{ data: values, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 0, hoverOffset: 6 }] },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '70%',
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (it) => { const p = total ? Math.round(it.parsed / total * 100) : 0; return ' ' + it.label + ': ' + fmtVND(it.parsed) + ' (' + p + '%)'; } } },
            },
            onClick: (e, el) => { if (el.length && onClick) onClick(labels[el[0].index]); },
          },
        });
      }
    }
    const leg = document.getElementById(legendId);
    if (leg) {
      if (!labels.length) leg.innerHTML = '<div class="empty">' + (window.t ? window.t('noExpenseData') : 'Chưa có dữ liệu chi tiêu.') + '</div>';
      else {
        leg.innerHTML = labels.map((l, i) => {
          const p = total ? Math.round(values[i] / total * 100) : 0;
          return '<button class="legend-item" data-cat="' + l + '">' +
            '<span class="legend-dot" style="background:' + PALETTE[i % PALETTE.length] + '"></span>' +
            '<span class="legend-label">' + display[i] + '</span>' +
            '<span class="legend-val">' + fmtShort(values[i]) + '₫ · ' + p + '%</span></button>';
        }).join('');
        if (onClick) leg.querySelectorAll('.legend-item').forEach((b) => b.addEventListener('click', () => onClick(b.dataset.cat)));
      }
    }
    return total;
  }

  /* Multi-dataset bars (income/expense) */
  function bars(canvasId, labels, datasets) {
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    destroy(canvasId); const c = colors();
    reg[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: datasets.map((d) => ({ label: d.label, data: d.data, backgroundColor: d.color, borderRadius: 5, maxBarThickness: 18 })) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: c.text, boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle', font: { size: 11, family: FONT } } },
          tooltip: { callbacks: { label: (it) => ' ' + it.dataset.label + ': ' + fmtVND(it.parsed.y) } },
        },
        scales: {
          x: { ticks: { color: c.text, font: { size: 10, family: FONT }, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: c.text, font: { size: 10, family: FONT }, callback: (v) => fmtShort(v) }, grid: { color: c.grid }, border: { display: false } },
        },
      },
    });
  }

  /* Trend line */
  function line(canvasId, labels, data, color) {
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    destroy(canvasId); const c = colors();
    reg[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: color, backgroundColor: color + '22', fill: true, tension: 0.35, pointRadius: 2, pointHoverRadius: 4, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => ' ' + fmtVND(it.parsed.y) } } },
        scales: {
          x: { ticks: { color: c.text, font: { size: 10, family: FONT } }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: c.text, font: { size: 10, family: FONT }, callback: (v) => fmtShort(v) }, grid: { color: c.grid }, border: { display: false } },
        },
      },
    });
  }

  /* Multi-line chart (trend + forecast). datasets: [{label,data,color,dashed,fill}] */
  function lines(canvasId, labels, datasets) {
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    destroy(canvasId); const c = colors();
    reg[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: d.fill ? d.color + '22' : 'transparent',
          fill: !!d.fill,
          tension: 0.35,
          borderDash: d.dashed ? [6, 5] : [],
          pointRadius: d.dashed ? 3 : 2,
          pointHoverRadius: 5,
          borderWidth: 2,
          spanGaps: true,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: c.text, boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'line', font: { size: 11, family: FONT } } },
          tooltip: { callbacks: { label: (it) => it.parsed.y == null ? '' : ' ' + it.dataset.label + ': ' + fmtVND(it.parsed.y) } },
        },
        scales: {
          x: { ticks: { color: c.text, font: { size: 10, family: FONT } }, grid: { display: false }, border: { display: false } },
          y: { ticks: { color: c.text, font: { size: 10, family: FONT }, callback: (v) => fmtShort(v) }, grid: { color: c.grid }, border: { display: false } },
        },
      },
    });
  }

  /* Small sparkline (7 days) */
  function sparkline(canvasId, data, color) {
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    destroy(canvasId);
    reg[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: data.map((_, i) => i), datasets: [{ data, backgroundColor: color, borderRadius: 2, maxBarThickness: 9 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } },
    });
  }

  window.Charts = { donut, bars, line, lines, sparkline, fmtVND, fmtShort, PALETTE };
})();

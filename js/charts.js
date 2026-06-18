/* =====================================================================
 *  charts.js — Vẽ biểu đồ bằng Chart.js
 * ---------------------------------------------------------------------
 *  - donutChart    : chi tiêu theo danh mục
 *  - barChart      : thu/chi theo ngày trong tháng
 *  - budgetBars    : tiến độ ngân sách (HTML thuần, không dùng Chart.js)
 * ===================================================================== */

(function () {
  'use strict';

  const PALETTE = [
    '#4f46e5', '#10b981', '#ef4444', '#f59e0b', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
  ];

  let donut = null;
  let bar = null;

  function fmtShort(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 1 : 0).replace('.0', '') + 'tr';
    if (n >= 1000) return Math.round(n / 1000) + 'k';
    return String(n);
  }
  function fmtVND(n) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  }

  function themeColors() {
    const cs = getComputedStyle(document.body);
    return {
      text: cs.getPropertyValue('--text-primary').trim() || '#111',
      border: cs.getPropertyValue('--border').trim() || '#ddd',
    };
  }

  /* ---------------- Donut: chi tiêu theo danh mục ---------------- */
  function renderDonut(canvasId, byCategory, onSliceClick) {
    const labels = Object.keys(byCategory).filter((k) => byCategory[k] > 0);
    const values = labels.map((k) => byCategory[k]);
    const total = values.reduce((a, b) => a + b, 0);

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (donut) donut.destroy();

    if (!labels.length) {
      const c = ctx.getContext('2d');
      c.clearRect(0, 0, ctx.width, ctx.height);
      renderLegend('donutLegend', [], [], total, onSliceClick);
      return;
    }

    donut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const pct = total ? Math.round((item.parsed / total) * 100) : 0;
                return ' ' + item.label + ': ' + fmtVND(item.parsed) + ' (' + pct + '%)';
              },
            },
          },
        },
        onClick: (_evt, els) => {
          if (els.length && onSliceClick) onSliceClick(labels[els[0].index]);
        },
      },
    });

    renderLegend('donutLegend', labels, values, total, onSliceClick);
  }

  function renderLegend(elId, labels, values, total, onClick) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!labels.length) {
      el.innerHTML = '<div class="empty">Chưa có chi tiêu trong tháng này.</div>';
      return;
    }
    el.innerHTML = labels.map((label, i) => {
      const pct = total ? Math.round((values[i] / total) * 100) : 0;
      return (
        '<button class="legend-item" data-cat="' + label + '">' +
        '<span class="legend-dot" style="background:' + PALETTE[i % PALETTE.length] + '"></span>' +
        '<span class="legend-label">' + label + '</span>' +
        '<span class="legend-val">' + fmtShort(values[i]) + ' · ' + pct + '%</span>' +
        '</button>'
      );
    }).join('');
    if (onClick) {
      el.querySelectorAll('.legend-item').forEach((b) => {
        b.addEventListener('click', () => onClick(b.dataset.cat));
      });
    }
  }

  /* ---------------- Bar: thu/chi theo ngày ---------------- */
  function renderBar(canvasId, incomeByDay, expenseByDay, daysInMonth) {
    const labels = [];
    const inc = [];
    const exp = [];
    for (let d = 1; d <= daysInMonth; d++) {
      labels.push(d);
      inc.push(incomeByDay[d] || 0);
      exp.push(expenseByDay[d] || 0);
    }

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (bar) bar.destroy();
    const colors = themeColors();

    bar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Thu nhập', data: inc, backgroundColor: '#10b981', borderRadius: 3, maxBarThickness: 14 },
          { label: 'Chi tiêu', data: exp, backgroundColor: '#ef4444', borderRadius: 3, maxBarThickness: 14 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: colors.text, boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: { label: (i) => ' ' + i.dataset.label + ': ' + fmtVND(i.parsed.y) },
          },
        },
        scales: {
          x: { ticks: { color: colors.text, maxRotation: 0, autoSkip: true, font: { size: 9 } }, grid: { display: false } },
          y: {
            ticks: { color: colors.text, font: { size: 9 }, callback: (v) => fmtShort(v) },
            grid: { color: colors.border },
          },
        },
      },
    });
  }

  /* ---------------- Progress bars: ngân sách ---------------- */
  function renderBudgetBars(elId, byCategory, budgets) {
    const el = document.getElementById(elId);
    if (!el) return;
    const cats = Object.keys(budgets);
    if (!cats.length) {
      el.innerHTML = '<div class="empty">Chưa thiết lập ngân sách.</div>';
      return;
    }
    el.innerHTML = cats.map((cat) => {
      const limit = budgets[cat] || 0;
      const used = byCategory[cat] || 0;
      const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
      const rawPct = limit ? (used / limit) * 100 : 0;
      let color = 'var(--income)';
      if (rawPct >= 90) color = 'var(--expense)';
      else if (rawPct >= 70) color = 'var(--warning)';
      const over = limit && used > limit;
      return (
        '<div class="budget-row">' +
        '<div class="budget-top">' +
        '<span class="budget-cat">' + cat + '</span>' +
        '<span class="budget-nums' + (over ? ' over' : '') + '">' +
        fmtShort(used) + ' / ' + fmtShort(limit) + '</span>' +
        '</div>' +
        '<div class="budget-track">' +
        '<div class="budget-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
        '</div>' +
        '</div>'
      );
    }).join('');
  }

  window.Charts = { renderDonut, renderBar, renderBudgetBars, fmtShort, fmtVND };
})();

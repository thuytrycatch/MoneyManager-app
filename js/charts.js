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

  // ~3 significant digits, dot decimal: 1.5 · 12.4 · 125.
  function dec(v) {
    const av = Math.abs(v);
    let s = v.toFixed(av >= 100 ? 0 : av >= 10 ? 1 : 2);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  // Main money display: only numbers over 9 digits (>= 1 billion) are shortened (B);
  // everything up to 999,999,999 keeps its full digits (e.g. 125,000,000).
  function fmtShort(n) {
    n = Math.round(n || 0);
    if (Math.abs(n) >= 1000000000) return dec(n / 1000000000) + 'B';
    return n.toLocaleString('en-US'); // <= 9 digits: full, comma thousands separator
  }
  // Compact form for space-constrained chart axes only — keeps K/M/B so ticks stay short.
  function fmtAxis(n) {
    n = Math.round(n || 0);
    const a = Math.abs(n);
    if (a >= 1000000000) return dec(n / 1000000000) + 'B';
    if (a >= 1000000) return dec(n / 1000000) + 'M';
    if (a >= 1000) return Math.round(n / 1000) + 'K';
    return String(n);
  }
  function fmtVND(n) {
    return new Intl.NumberFormat('en-US').format(Math.round(n || 0));
  }
  function cssVar(name, fb) {
    const v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fb;
  }
  function colors() { return { text: cssVar('--text-secondary', '#6b7280'), grid: cssVar('--border', '#e5e7eb') }; }
  const FONT = 'Be Vietnam Pro, system-ui, sans-serif';

  /* ---- Direct labels for donuts --------------------------------------
   * Big slices get "name %" painted right on the ring; smaller ones get a
   * leader line pointing out to the label; the hole shows the period total.
   * Slices under 3% stay unlabeled — the tappable legend below lists them. */
  function truncate(ctx, text, maxW) {
    if (maxW <= 8) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  const donutLabels = {
    id: 'donutLabels',
    afterDatasetsDraw(chart, args, opts) {
      if (!opts || !opts.total) return;
      const meta = chart.getDatasetMeta(0);
      const arcs = (meta && meta.data) || [];
      if (!arcs.length) return;
      const ctx = chart.ctx;
      const area = chart.chartArea;
      const c = colors();
      ctx.save();

      // Period total in the hole.
      const p0 = arcs[0].getProps(['x', 'y', 'innerRadius'], true);
      if (p0.innerRadius >= 34) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = c.text; ctx.font = '600 10px ' + FONT;
        ctx.fillText(opts.totalLabel || '', p0.x, p0.y - 9);
        ctx.fillStyle = cssVar('--text-primary', '#111827');
        ctx.font = '700 ' + (p0.innerRadius >= 52 ? 15 : 12) + 'px ' + FONT;
        ctx.fillText(fmtShort(opts.total), p0.x, p0.y + 7);
      }

      const callouts = [];
      arcs.forEach((arc, i) => {
        const v = opts.values[i];
        const pct = v ? v / opts.total * 100 : 0;
        if (pct < 3) return; // tiny slice: legend only
        const p = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true);
        const mid = (p.startAngle + p.endAngle) / 2;
        const text = opts.labels[i] + ' ' + Math.round(pct) + '%';
        ctx.font = '700 10px ' + FONT;
        const rMid = (p.innerRadius + p.outerRadius) / 2;
        const chord = (p.endAngle - p.startAngle) * rMid - 8; // usable arc length
        if (pct >= 10 && p.outerRadius - p.innerRadius >= 15 && ctx.measureText(text).width <= chord) {
          // Fits on the ring → paint it directly on the slice.
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 3;
          ctx.fillText(text, p.x + Math.cos(mid) * rMid, p.y + Math.sin(mid) * rMid);
          ctx.shadowBlur = 0;
        } else {
          const bg = chart.data.datasets[0].backgroundColor;
          callouts.push({ p: p, mid: mid, text: text, color: bg[i % bg.length] });
        }
      });

      // Leader-line labels, spaced apart per side so they never overlap.
      const GAP = 13;
      [1, -1].forEach((s) => {
        const list = callouts.filter((l) => (Math.cos(l.mid) >= 0 ? 1 : -1) === s);
        if (!list.length) return;
        list.forEach((l) => { l.ty = l.p.y + Math.sin(l.mid) * (l.p.outerRadius + 12); });
        list.sort((a, b) => a.ty - b.ty);
        for (let i = 1; i < list.length; i++) if (list[i].ty < list[i - 1].ty + GAP) list[i].ty = list[i - 1].ty + GAP;
        const over = list[list.length - 1].ty - (area.bottom - 5);
        if (over > 0) list.forEach((l) => { l.ty -= over; });
        list.forEach((l) => {
          if (l.ty < area.top + 5) l.ty = area.top + 5;
          const sx = l.p.x + Math.cos(l.mid) * (l.p.outerRadius - 1);
          const sy = l.p.y + Math.sin(l.mid) * (l.p.outerRadius - 1);
          const ex = l.p.x + Math.cos(l.mid) * (l.p.outerRadius + 9);
          const hx = ex + s * 7;
          ctx.strokeStyle = l.color; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, l.ty); ctx.lineTo(hx, l.ty); ctx.stroke();
          ctx.textAlign = s > 0 ? 'left' : 'right'; ctx.textBaseline = 'middle';
          ctx.font = '600 9.5px ' + FONT;
          ctx.fillStyle = c.text;
          const maxW = s > 0 ? (area.right - hx - 4) : (hx - area.left - 4);
          const txt = truncate(ctx, l.text, maxW);
          if (txt) ctx.fillText(txt, hx + s * 3, l.ty);
        });
      });
      ctx.restore();
    },
  };

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
            responsive: true, maintainAspectRatio: false, cutout: '58%',
            // Side padding gives the leader-line labels room outside the ring.
            layout: { padding: { left: 72, right: 72, top: 16, bottom: 16 } },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (it) => { const p = total ? Math.round(it.parsed / total * 100) : 0; return ' ' + it.label + ': ' + fmtVND(it.parsed) + ' (' + p + '%)'; } } },
              donutLabels: {
                values: values, labels: display, total: total,
                totalLabel: (window.t ? window.t('totalLabel') : 'Tổng'),
              },
            },
            onClick: (e, el) => { if (el.length && onClick) onClick(labels[el[0].index]); },
          },
          plugins: [donutLabels],
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
            '<span class="legend-val">' + fmtShort(values[i]) + ' · ' + p + '%</span></button>';
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
          y: { ticks: { color: c.text, font: { size: 10, family: FONT }, callback: (v) => fmtAxis(v) }, grid: { color: c.grid }, border: { display: false } },
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
          y: { ticks: { color: c.text, font: { size: 10, family: FONT }, callback: (v) => fmtAxis(v) }, grid: { color: c.grid }, border: { display: false } },
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
          y: { ticks: { color: c.text, font: { size: 10, family: FONT }, callback: (v) => fmtAxis(v) }, grid: { color: c.grid }, border: { display: false } },
        },
      },
    });
  }

  /* Mixed bar + line chart (daily spending view).
   * datasets: [{type:'line'|'bar', label, data, color, dashed, fill, flat}]
   * `flat` marks a constant reference line (no points, no curve). */
  function mixed(canvasId, labels, datasets) {
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    destroy(canvasId); const c = colors();
    reg[canvasId] = new Chart(ctx, {
      data: {
        labels,
        datasets: datasets.map((d) => (d.type === 'bar'
          ? { type: 'bar', label: d.label, data: d.data, backgroundColor: d.color, borderRadius: 3, maxBarThickness: 12, order: 2 }
          : {
            type: 'line', label: d.label, data: d.data, borderColor: d.color,
            backgroundColor: d.fill ? d.color + '22' : 'transparent', fill: !!d.fill,
            tension: d.flat ? 0 : 0.3, borderDash: d.dashed ? [6, 5] : [],
            pointRadius: d.flat ? 0 : 2, pointHoverRadius: d.flat ? 0 : 4,
            borderWidth: 2, spanGaps: true, order: 1,
          })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: c.text, boxWidth: 9, boxHeight: 9, usePointStyle: true, font: { size: 11, family: FONT } } },
          tooltip: { callbacks: { label: (it) => it.parsed.y == null ? '' : ' ' + it.dataset.label + ': ' + fmtVND(it.parsed.y) } },
        },
        scales: {
          x: { ticks: { color: c.text, font: { size: 10, family: FONT }, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { display: false } },
          y: { beginAtZero: true, ticks: { color: c.text, font: { size: 10, family: FONT }, callback: (v) => fmtAxis(v) }, grid: { color: c.grid }, border: { display: false } },
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

  window.Charts = { donut, bars, line, lines, mixed, sparkline, fmtVND, fmtShort, PALETTE };
})();

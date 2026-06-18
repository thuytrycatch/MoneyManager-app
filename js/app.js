/* =====================================================================
 *  app.js — Quản lý Thu Chi Gia Đình
 *  Tổng quan · Báo cáo (Tuần/Tháng/Năm) · Giao dịch · Cài đặt
 * ===================================================================== */
(function () {
  'use strict';

  /* ============== Settings (localStorage) ============== */
  window.CONFIG = window.CONFIG || {
    GITHUB_TOKEN: '', GITHUB_OWNER: '', GITHUB_REPO: '',
    GITHUB_BRANCH: 'main', DATA_FILE_PATH: 'data/transactions.json',
    ANTHROPIC_API_KEY: '',
  };
  const SETTINGS_KEY = 'mm_settings';
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      Object.keys(s).forEach((k) => { if (s[k] != null && s[k] !== '') window.CONFIG[k] = s[k]; });
    } catch (e) { /* ignore */ }
  }
  function saveSettings(obj) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
    Object.assign(window.CONFIG, obj);
  }

  /* ============== SVG icons (Lucide-style) ============== */
  const ICONS = {
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    up: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    down: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
    trendUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    trendDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    left: '<polyline points="15 18 9 12 15 6"/>',
    right: '<polyline points="9 18 15 12 9 6"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    piggy: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5Z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
    spark: '<path d="M12 3v18"/><path d="M5 8l7-5 7 5"/><path d="M5 16l7 5 7-5"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    film: '<rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  const CAT_ICON = {
    'Ăn uống': 'utensils', 'Di chuyển': 'car', 'Mua sắm': 'bag', 'Giải trí': 'film',
    'Sức khỏe': 'heart', 'Hóa đơn': 'file', 'Thu nhập': 'trendUp', 'Khác': 'more',
  };
  function catIcon(cat) { return icon(CAT_ICON[cat] || 'more'); }

  /* ============== i18n ============== */
  const I18N = {
    vi: {
      appName: 'Sổ Thu Chi', overview: 'Tổng quan', reports: 'Báo cáo', add: 'Thêm', txs: 'Giao dịch', settings: 'Cài đặt',
      income: 'Thu nhập', expense: 'Chi tiêu', balance: 'Số dư hiện tại', savings: 'Tiết kiệm', savingsRate: 'Tỷ lệ tiết kiệm',
      thisMonth: 'Tháng này', remaining: 'Còn lại', budget: 'Ngân sách', spentToday: 'Chi hôm nay', avgPerDay: 'TB mỗi ngày',
      weekReview: 'Đánh giá tuần này', vsLastWeek: 'so với tuần trước', alerts: 'Cảnh báo & kiểm soát',
      recent: 'Giao dịch gần đây', seeAll: 'Xem tất cả', noTx: 'Chưa có giao dịch nào.',
      addTx: 'Thêm giao dịch', placeholder: 'ăn sáng 35k, lương 15 triệu, đổ xăng 80k…',
      week: 'Tuần', month: 'Tháng', year: 'Năm', byCategory: 'Chi theo danh mục', trend: 'Diễn biến thu chi',
      budgetProgress: 'Tiến độ ngân sách', topSpending: 'Khoản chi lớn nhất', summary: 'Tổng kết',
      save: 'Lưu', cancel: 'Hủy', delete: 'Xóa', edit: 'Sửa', category: 'Danh mục', note: 'Ghi chú', amount: 'Số tiền',
      allCats: 'Tất cả danh mục', allTypes: 'Thu & chi',
      saveBudget: 'Lưu ngân sách', budgetSaved: 'Đã lưu ngân sách', language: 'Ngôn ngữ', theme: 'Giao diện',
      connTitle: 'Kết nối GitHub', ghToken: 'GitHub Token', ghOwner: 'GitHub Owner (username)', ghRepo: 'Tên repo dữ liệu',
      ghBranch: 'Nhánh', anthropicKey: 'Claude API Key (tùy chọn)', saveConnect: 'Lưu & kết nối',
      connSaved: 'Đã lưu, đang kết nối…', connOk: 'Đã kết nối', configMissing: 'Chưa cấu hình — dữ liệu lưu cục bộ.',
      tokenHint: '🔒 Token chỉ lưu trên trình duyệt này (localStorage), không gửi đi đâu ngoài GitHub. Cần token quyền "repo".',
      added: 'Đã thêm', deleted: 'Đã xóa', confirmDelete: 'Xóa giao dịch này?',
      emptyInput: 'Vui lòng nhập nội dung.', cantParse: 'Không nhận diện được số tiền.',
      warn80: 'Sắp vượt ngân sách', warn100: 'Vượt ngân sách', parsing: 'Đang phân tích…',
      synced: 'Đã đồng bộ ✓', syncError: 'Lỗi đồng bộ', offline: 'Offline — sẽ đồng bộ sau', saving: 'Đang lưu…',
      paceFast: 'Chi nhanh hơn kế hoạch', paceOk: 'Chi tiêu trong tầm kiểm soát', overspentWeek: 'Tuần này chi nhiều hơn tuần trước',
      savedWell: 'Tuần này tiết kiệm tốt!', daysLeft: 'ngày còn lại trong tháng', biggestWeek: 'Khoản chi lớn nhất tuần',
      noAlerts: 'Mọi thứ ổn định. Tiếp tục duy trì nhé! 👍',
    },
    en: {
      appName: 'Sổ Thu Chi', overview: 'Overview', reports: 'Reports', add: 'Add', txs: 'Transactions', settings: 'Settings',
      income: 'Income', expense: 'Expense', balance: 'Current balance', savings: 'Savings', savingsRate: 'Savings rate',
      thisMonth: 'This month', remaining: 'Remaining', budget: 'Budget', spentToday: 'Spent today', avgPerDay: 'Avg / day',
      weekReview: 'This week review', vsLastWeek: 'vs last week', alerts: 'Alerts & control',
      recent: 'Recent transactions', seeAll: 'See all', noTx: 'No transactions yet.',
      addTx: 'Add transaction', placeholder: 'breakfast 35k, salary 15 million, gas 80k…',
      week: 'Week', month: 'Month', year: 'Year', byCategory: 'Spending by category', trend: 'Income & expense trend',
      budgetProgress: 'Budget progress', topSpending: 'Top spending', summary: 'Summary',
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', category: 'Category', note: 'Note', amount: 'Amount',
      allCats: 'All categories', allTypes: 'Income & expense',
      saveBudget: 'Save budget', budgetSaved: 'Budget saved', language: 'Language', theme: 'Theme',
      connTitle: 'GitHub connection', ghToken: 'GitHub Token', ghOwner: 'GitHub Owner (username)', ghRepo: 'Data repo name',
      ghBranch: 'Branch', anthropicKey: 'Claude API Key (optional)', saveConnect: 'Save & connect',
      connSaved: 'Saved, connecting…', connOk: 'Connected', configMissing: 'Not configured — data stored locally.',
      tokenHint: '🔒 The token is stored only in this browser (localStorage). Needs a token with "repo" scope.',
      added: 'Added', deleted: 'Deleted', confirmDelete: 'Delete this transaction?',
      emptyInput: 'Please enter something.', cantParse: 'Could not detect amount.',
      warn80: 'Near budget limit', warn100: 'Over budget', parsing: 'Parsing…',
      synced: 'Synced ✓', syncError: 'Sync error', offline: 'Offline — will sync later', saving: 'Saving…',
      paceFast: 'Spending faster than planned', paceOk: 'Spending under control', overspentWeek: 'Spent more than last week',
      savedWell: 'Great saving this week!', daysLeft: 'days left this month', biggestWeek: 'Biggest expense this week',
      noAlerts: 'All good. Keep it up! 👍',
    },
  };
  let lang = localStorage.getItem('lang') || 'vi';
  function t(k) { return (I18N[lang] && I18N[lang][k]) || k; }

  /* ============== State ============== */
  let DATA = { version: '1.0', budgets: {}, transactions: [] };
  let currentTab = 'overview';
  const CATS = window.Parser.CATEGORIES;
  // Filters (transactions tab)
  let filterMonth = monthKey(new Date());
  let filterCategory = '';
  let filterType = '';
  // Reports
  let reportPeriod = 'month'; // week | month | year
  let reportAnchor = new Date();

  const fmtVND = window.Charts.fmtVND;
  const fmtShort = window.Charts.fmtShort;

  /* ============== Date helpers ============== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x; }
  function endOfWeek(d) { const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); return e; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  }

  /* ============== Aggregations ============== */
  function inRange(s, e) { const a = ymd(s), b = ymd(e); return DATA.transactions.filter((tx) => tx.date >= a && tx.date <= b); }
  function totals(txs) {
    let income = 0, expense = 0;
    txs.forEach((tx) => { tx.type === 'income' ? income += tx.amount : expense += tx.amount; });
    return { income, expense, net: income - expense };
  }
  function byCategory(txs) {
    const o = {};
    txs.forEach((tx) => { if (tx.type === 'expense') o[tx.category] = (o[tx.category] || 0) + tx.amount; });
    return o;
  }
  function allTimeBalance() { return totals(DATA.transactions).net; }
  function totalBudget() { return Object.values(DATA.budgets).reduce((a, b) => a + (b || 0), 0); }

  /* ============== Toast ============== */
  let toastTimer = null;
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast show ' + (kind || 'info');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  /* ============== Persist ============== */
  function persist() {
    window.GitHubSync.writeDataFile(DATA);
    if (window.GitHubSync.isConfigured() && navigator.onLine) setStatus(t('saving'));
  }
  function setStatus(text, kind) {
    const el = document.getElementById('syncStatus');
    if (!el) return; el.textContent = text || ''; el.className = 'sync-status ' + (kind || '');
  }

  /* ============== Transaction actions ============== */
  async function addFromInput(raw, btnId) {
    if (!raw.trim()) { toast(t('emptyInput'), 'warn'); return; }
    const btn = btnId && document.getElementById(btnId);
    const old = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    let parsed;
    try { parsed = await window.Parser.parseTransaction(raw); }
    catch (e) { parsed = window.Parser.parseWithRegex(raw); }
    if (btn) { btn.disabled = false; btn.innerHTML = old; }
    if (!parsed.amount) { toast(t('cantParse'), 'warn'); return; }
    const now = new Date();
    DATA.transactions.unshift({
      id: uuid(), date: ymd(now), time: now.toTimeString().slice(0, 5),
      rawInput: raw, amount: parsed.amount, type: parsed.type,
      category: parsed.category, note: parsed.note, createdAt: now.toISOString(),
    });
    persist();
    toast(t('added') + ': ' + parsed.note + ' · ' + fmtVND(parsed.amount), 'success');
    if (parsed.type === 'expense') checkBudgetWarning(parsed.category);
    render();
  }
  function checkBudgetWarning(cat) {
    const limit = DATA.budgets[cat]; if (!limit) return;
    const used = byCategory(inRange(startOfMonth(new Date()), endOfMonth(new Date())))[cat] || 0;
    const pct = used / limit * 100;
    if (pct >= 100) toast('🚨 ' + t('warn100') + ': ' + cat + ' (' + Math.round(pct) + '%)', 'error');
    else if (pct >= 80) toast('⚠️ ' + t('warn80') + ': ' + cat + ' (' + Math.round(pct) + '%)', 'warn');
  }
  function deleteTx(id) {
    if (!confirm(t('confirmDelete'))) return;
    DATA.transactions = DATA.transactions.filter((x) => x.id !== id);
    persist(); toast(t('deleted'), 'info'); render();
  }

  /* ============== Escape ============== */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ============== Reusable bits ============== */
  function statTile(label, value, kind, ic) {
    return '<div class="tile ' + (kind || '') + '">' +
      '<div class="tile-top">' + (ic ? icon(ic) : '') + '<span>' + label + '</span></div>' +
      '<div class="tile-val">' + fmtShort(Math.abs(value)) + '₫</div></div>';
  }
  function txRow(tx) {
    const sign = tx.type === 'income' ? '+' : '−';
    return '<div class="tx-row" data-id="' + tx.id + '">' +
      '<div class="tx-ic ' + tx.type + '">' + catIcon(tx.category) + '</div>' +
      '<div class="tx-main"><div class="tx-note">' + esc(tx.note || tx.rawInput) + '</div>' +
      '<div class="tx-meta">' + esc(tx.category) + ' · ' + tx.date + (tx.time ? ' ' + tx.time : '') + '</div></div>' +
      '<div class="tx-right"><div class="tx-amount ' + tx.type + '">' + sign + fmtShort(tx.amount) + '₫</div>' +
      '<div class="tx-actions"><button class="icon-btn" data-act="edit" data-id="' + tx.id + '">' + icon('edit') + '</button>' +
      '<button class="icon-btn" data-act="del" data-id="' + tx.id + '">' + icon('trash') + '</button></div></div></div>';
  }
  function budgetBarsHtml(byCat, budgets) {
    const cats = Object.keys(budgets).filter((c) => budgets[c] > 0);
    if (!cats.length) return '<div class="empty">Chưa thiết lập ngân sách.</div>';
    return cats.map((cat) => {
      const limit = budgets[cat], used = byCat[cat] || 0;
      const raw = limit ? used / limit * 100 : 0, pct = Math.min(100, Math.round(raw));
      let cls = 'ok'; if (raw >= 90) cls = 'danger'; else if (raw >= 70) cls = 'warn';
      return '<div class="budget-row">' +
        '<div class="budget-top"><span class="budget-cat">' + catIcon(cat) + esc(cat) + '</span>' +
        '<span class="budget-nums ' + (used > limit ? 'over' : '') + '">' + fmtShort(used) + ' / ' + fmtShort(limit) + '₫</span></div>' +
        '<div class="budget-track"><div class="budget-fill ' + cls + '" style="width:' + pct + '%"></div></div></div>';
    }).join('');
  }

  /* ============== VIEW: Overview ============== */
  function viewOverview() {
    const now = new Date();
    const monthTx = inRange(startOfMonth(now), endOfMonth(now));
    const mt = totals(monthTx);
    const bal = allTimeBalance();
    const budget = totalBudget();
    const remain = budget - mt.expense;
    const daysInMonth = endOfMonth(now).getDate();
    const dayNow = now.getDate();
    const todayTx = DATA.transactions.filter((x) => x.date === ymd(now) && x.type === 'expense');
    const spentToday = todayTx.reduce((a, b) => a + b.amount, 0);
    const avgDay = dayNow ? mt.expense / dayNow : 0;

    // Weekly review
    const wkTx = inRange(startOfWeek(now), endOfWeek(now));
    const wkExp = totals(wkTx).expense;
    const lastWk = new Date(now); lastWk.setDate(lastWk.getDate() - 7);
    const lastWkExp = totals(inRange(startOfWeek(lastWk), endOfWeek(lastWk))).expense;
    const diffPct = lastWkExp ? Math.round((wkExp - lastWkExp) / lastWkExp * 100) : (wkExp ? 100 : 0);
    // sparkline 7 ngày
    const spark = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); spark.push(totals(DATA.transactions.filter((x) => x.date === ymd(d) && x.type === 'expense')).expense); }
    setTimeout(() => window.Charts.sparkline('weekSpark', spark, getComputedStyle(document.body).getPropertyValue('--expense').trim() || '#ef4444'), 0);

    const recent = DATA.transactions.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 5);

    return (
      '<div class="hero">' +
      '<div class="hero-label">' + icon('wallet') + ' ' + t('balance') + '</div>' +
      '<div class="hero-balance">' + fmtVND(bal) + '</div>' +
      '<div class="hero-chips">' +
      '<div class="hero-chip"><span>' + icon('down') + ' ' + t('thisMonth') + ' ' + t('income').toLowerCase() + '</span><b>' + fmtShort(mt.income) + '₫</b></div>' +
      '<div class="hero-chip"><span>' + icon('up') + ' ' + t('thisMonth') + ' ' + t('expense').toLowerCase() + '</span><b>' + fmtShort(mt.expense) + '₫</b></div>' +
      '</div></div>' +

      '<div class="tiles">' +
      statTile(t('remaining') + ' ' + t('budget').toLowerCase(), remain, remain >= 0 ? 'income' : 'expense', 'target') +
      statTile(t('savings') + ' ' + t('thisMonth').toLowerCase(), mt.net, mt.net >= 0 ? 'income' : 'expense', 'piggy') +
      statTile(t('spentToday'), spentToday, 'expense', 'up') +
      statTile(t('avgPerDay'), avgDay, 'neutral', 'chart') +
      '</div>' +

      // Weekly review card
      '<div class="card week-card">' +
      '<div class="card-title">' + icon('calendar') + ' ' + t('weekReview') + '</div>' +
      '<div class="week-body">' +
      '<div><div class="week-amount">' + fmtVND(wkExp) + '</div>' +
      '<div class="week-diff ' + (diffPct > 0 ? 'bad' : 'good') + '">' + icon(diffPct > 0 ? 'trendUp' : 'trendDown') +
      ' ' + (diffPct > 0 ? '+' : '') + diffPct + '% ' + t('vsLastWeek') + '</div></div>' +
      '<div class="spark-wrap"><canvas id="weekSpark"></canvas></div>' +
      '</div></div>' +

      // Alerts
      '<div class="section-title">' + t('alerts') + '</div>' +
      '<div class="alerts">' + buildAlerts(now, mt, budget, dayNow, daysInMonth, wkExp, lastWkExp, wkTx) + '</div>' +

      // Recent
      '<div class="section-row"><div class="section-title">' + t('recent') + '</div>' +
      '<button class="link-btn" data-goto="transactions">' + t('seeAll') + ' ' + icon('right') + '</button></div>' +
      '<div class="tx-list">' + (recent.length ? recent.map(txRow).join('') : '<div class="empty">' + t('noTx') + '</div>') + '</div>'
    );
  }

  function alertItem(kind, ic, text) {
    return '<div class="alert-item ' + kind + '">' + icon(ic) + '<span>' + text + '</span></div>';
  }
  function buildAlerts(now, mt, budget, dayNow, daysInMonth, wkExp, lastWkExp, wkTx) {
    const out = [];
    const byCat = byCategory(inRange(startOfMonth(now), endOfMonth(now)));
    // over-budget categories
    Object.keys(DATA.budgets).forEach((cat) => {
      const lim = DATA.budgets[cat]; if (!lim) return;
      const used = byCat[cat] || 0; const pct = Math.round(used / lim * 100);
      if (pct >= 100) out.push(alertItem('danger', 'alert', '<b>' + cat + '</b>: ' + t('warn100').toLowerCase() + ' (' + pct + '% — ' + fmtShort(used) + '/' + fmtShort(lim) + '₫)'));
      else if (pct >= 80) out.push(alertItem('warn', 'alert', '<b>' + cat + '</b>: ' + t('warn80').toLowerCase() + ' (' + pct + '%)'));
    });
    // pace
    if (budget > 0) {
      const expected = budget * dayNow / daysInMonth;
      if (mt.expense > expected * 1.1) out.push(alertItem('warn', 'trendUp', t('paceFast') + ' — ' + (daysInMonth - dayNow) + ' ' + t('daysLeft')));
      else out.push(alertItem('good', 'check', t('paceOk') + ' — ' + (daysInMonth - dayNow) + ' ' + t('daysLeft')));
    }
    // week comparison
    if (wkExp > lastWkExp && lastWkExp > 0) out.push(alertItem('warn', 'trendUp', t('overspentWeek')));
    else if (wkExp < lastWkExp) out.push(alertItem('good', 'piggy', t('savedWell')));
    // biggest expense this week
    const big = wkTx.filter((x) => x.type === 'expense').sort((a, b) => b.amount - a.amount)[0];
    if (big) out.push(alertItem('info', 'spark', t('biggestWeek') + ': <b>' + esc(big.note) + '</b> · ' + fmtShort(big.amount) + '₫'));
    if (!out.length) out.push(alertItem('good', 'check', t('noAlerts')));
    return out.join('');
  }

  /* ============== VIEW: Reports ============== */
  function reportRange() {
    const a = reportAnchor;
    if (reportPeriod === 'week') return { s: startOfWeek(a), e: endOfWeek(a) };
    if (reportPeriod === 'year') return { s: new Date(a.getFullYear(), 0, 1), e: new Date(a.getFullYear(), 11, 31) };
    return { s: startOfMonth(a), e: endOfMonth(a) };
  }
  function reportLabel() {
    const a = reportAnchor;
    if (reportPeriod === 'week') { const s = startOfWeek(a), e = endOfWeek(a); return pad(s.getDate()) + '/' + pad(s.getMonth() + 1) + ' – ' + pad(e.getDate()) + '/' + pad(e.getMonth() + 1) + '/' + e.getFullYear(); }
    if (reportPeriod === 'year') return t('year') + ' ' + a.getFullYear();
    return t('month') + ' ' + (a.getMonth() + 1) + '/' + a.getFullYear();
  }
  function shiftReport(dir) {
    const a = new Date(reportAnchor);
    if (reportPeriod === 'week') a.setDate(a.getDate() + dir * 7);
    else if (reportPeriod === 'year') a.setFullYear(a.getFullYear() + dir);
    else a.setMonth(a.getMonth() + dir);
    reportAnchor = a; render();
  }
  function trendData(txs, range) {
    let labels = [], inc = [], exp = [];
    if (reportPeriod === 'week') {
      labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      const s = startOfWeek(reportAnchor);
      for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(s.getDate() + i); const dt = ymd(d); const dd = txs.filter((x) => x.date === dt); inc.push(totals(dd).income); exp.push(totals(dd).expense); }
    } else if (reportPeriod === 'year') {
      for (let m = 0; m < 12; m++) { labels.push('T' + (m + 1)); const mk = reportAnchor.getFullYear() + '-' + pad(m + 1); const dd = txs.filter((x) => x.date.slice(0, 7) === mk); inc.push(totals(dd).income); exp.push(totals(dd).expense); }
    } else {
      const days = endOfMonth(reportAnchor).getDate(); const weeks = Math.ceil(days / 7);
      for (let w = 0; w < weeks; w++) { labels.push('Tuần ' + (w + 1)); inc.push(0); exp.push(0); }
      txs.forEach((x) => { const day = parseInt(x.date.slice(8, 10), 10); const wi = Math.min(weeks - 1, Math.floor((day - 1) / 7)); if (x.type === 'income') inc[wi] += x.amount; else exp[wi] += x.amount; });
    }
    return { labels, inc, exp };
  }
  function viewReports() {
    const { s, e } = reportRange();
    const txs = inRange(s, e);
    const tt = totals(txs);
    const byCat = byCategory(txs);
    const rate = tt.income ? Math.round(tt.net / tt.income * 100) : 0;
    const td = trendData(txs, { s, e });
    const incColor = getComputedStyle(document.body).getPropertyValue('--income').trim() || '#10b981';
    const expColor = getComputedStyle(document.body).getPropertyValue('--expense').trim() || '#ef4444';
    const top = txs.filter((x) => x.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);

    setTimeout(() => {
      window.Charts.donut('repDonut', 'repLegend', byCat, (cat) => { filterCategory = cat; filterMonth = monthKey(reportAnchor); currentTab = 'transactions'; render(); });
      window.Charts.bars('repTrend', td.labels, [
        { label: t('income'), data: td.inc, color: incColor },
        { label: t('expense'), data: td.exp, color: expColor },
      ]);
    }, 0);

    const periodBtn = (p, label) => '<button class="seg-btn ' + (reportPeriod === p ? 'active' : '') + '" data-period="' + p + '">' + label + '</button>';

    return (
      '<div class="seg period-seg">' + periodBtn('week', t('week')) + periodBtn('month', t('month')) + periodBtn('year', t('year')) + '</div>' +
      '<div class="period-nav"><button class="nav-arrow" data-shift="-1">' + icon('left') + '</button>' +
      '<span class="period-label">' + reportLabel() + '</span>' +
      '<button class="nav-arrow" data-shift="1">' + icon('right') + '</button></div>' +

      '<div class="summary-grid">' +
      '<div class="sum-cell income"><span>' + t('income') + '</span><b>' + fmtShort(tt.income) + '₫</b></div>' +
      '<div class="sum-cell expense"><span>' + t('expense') + '</span><b>' + fmtShort(tt.expense) + '₫</b></div>' +
      '<div class="sum-cell ' + (tt.net >= 0 ? 'income' : 'expense') + '"><span>' + t('savings') + '</span><b>' + fmtShort(tt.net) + '₫</b></div>' +
      '<div class="sum-cell neutral"><span>' + t('savingsRate') + '</span><b>' + rate + '%</b></div>' +
      '</div>' +

      '<div class="section-title">' + t('trend') + '</div>' +
      '<div class="card"><div class="chart-box tall"><canvas id="repTrend"></canvas></div></div>' +

      '<div class="section-title">' + t('byCategory') + '</div>' +
      '<div class="card"><div class="chart-box"><canvas id="repDonut"></canvas></div><div id="repLegend" class="legend"></div></div>' +

      (reportPeriod === 'month' ?
        '<div class="section-title">' + t('budgetProgress') + '</div><div class="budget-list">' + budgetBarsHtml(byCat, DATA.budgets) + '</div>' : '') +

      '<div class="section-title">' + t('topSpending') + '</div>' +
      '<div class="tx-list">' + (top.length ? top.map(txRow).join('') : '<div class="empty">' + t('noTx') + '</div>') + '</div>'
    );
  }

  /* ============== VIEW: Transactions ============== */
  function viewTransactions() {
    let list = DATA.transactions.filter((tx) => tx.date.slice(0, 7) === filterMonth);
    if (filterCategory) list = list.filter((tx) => tx.category === filterCategory);
    if (filterType) list = list.filter((tx) => tx.type === filterType);
    list.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

    // group by date
    const groups = {};
    list.forEach((tx) => { (groups[tx.date] = groups[tx.date] || []).push(tx); });

    const months = new Set(DATA.transactions.map((tx) => tx.date.slice(0, 7))); months.add(monthKey(new Date()));
    const monthOpts = Array.from(months).sort().reverse().map((m) => '<option value="' + m + '"' + (m === filterMonth ? ' selected' : '') + '>' + t('month') + ' ' + m + '</option>').join('');
    const catOpts = '<option value="">' + t('allCats') + '</option>' + CATS.map((c) => '<option value="' + c + '"' + (c === filterCategory ? ' selected' : '') + '>' + c + '</option>').join('');
    const typeOpts = '<option value="">' + t('allTypes') + '</option><option value="expense"' + (filterType === 'expense' ? ' selected' : '') + '>' + t('expense') + '</option><option value="income"' + (filterType === 'income' ? ' selected' : '') + '>' + t('income') + '</option>';

    let body = '';
    const dates = Object.keys(groups).sort().reverse();
    if (!dates.length) body = '<div class="empty">' + t('noTx') + '</div>';
    else dates.forEach((d) => {
      const dayExp = groups[d].filter((x) => x.type === 'expense').reduce((a, b) => a + b.amount, 0);
      body += '<div class="day-head"><span>' + d + '</span><span class="day-sum">−' + fmtShort(dayExp) + '₫</span></div>';
      body += groups[d].map(txRow).join('');
    });

    return (
      '<div class="quick-add"><input id="txInput" type="text" placeholder="' + t('placeholder') + '" autocomplete="off"/>' +
      '<button id="addBtn" class="add-btn-inline">' + icon('plus') + '</button></div>' +
      '<div class="filters">' +
      '<select id="fMonth">' + monthOpts + '</select>' +
      '<select id="fCat">' + catOpts + '</select>' +
      '<select id="fType">' + typeOpts + '</select>' +
      '</div>' +
      '<div class="tx-list grouped">' + body + '</div>'
    );
  }

  /* ============== VIEW: Add ============== */
  function viewAdd() {
    return '<div class="add-page">' +
      '<div class="section-title">' + t('addTx') + '</div>' +
      '<textarea id="txInputBig" rows="3" placeholder="' + t('placeholder') + '"></textarea>' +
      '<button id="addBtnBig" class="primary-btn">' + icon('plus') + ' ' + t('add') + '</button>' +
      '<div class="examples">' +
      ['ăn sáng 35k', 'lương 15 triệu', 'đổ xăng 80k', 'cafe 2 triệu rưỡi', 'grab 1tr2', 'tiền điện 500 nghìn', 'mua giày 800k', 'khám bệnh 250k']
        .map((ex) => '<button class="chip" data-ex="' + ex + '">' + ex + '</button>').join('') +
      '</div></div>';
  }

  /* ============== VIEW: Settings ============== */
  function viewSettings() {
    const budgetInputs = CATS.filter((c) => c !== 'Thu nhập').map((c) =>
      '<div class="budget-edit-row"><label>' + catIcon(c) + esc(c) + '</label>' +
      '<input type="number" inputmode="numeric" data-budget="' + c + '" value="' + (DATA.budgets[c] || 0) + '"/></div>').join('');
    const configured = window.GitHubSync.isConfigured();
    const C = window.CONFIG;
    const f = (id, label, val, type) => '<div class="conn-row"><label>' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false"/></div>';

    return (
      '<div class="section-title">' + t('budget') + ' (' + t('month').toLowerCase() + ')</div>' +
      '<div class="budget-edit">' + budgetInputs + '</div>' +
      '<button id="saveBudgetBtn" class="primary-btn">' + icon('target') + ' ' + t('saveBudget') + '</button>' +

      '<div class="section-title">' + t('language') + ' · ' + t('theme') + '</div>' +
      '<div class="settings-row"><div class="seg">' +
      '<button class="seg-btn ' + (lang === 'vi' ? 'active' : '') + '" data-lang="vi">🇻🇳 VI</button>' +
      '<button class="seg-btn ' + (lang === 'en' ? 'active' : '') + '" data-lang="en">🇬🇧 EN</button></div>' +
      '<button id="themeToggle2" class="ghost-btn">' + icon('moon') + ' ' + t('theme') + '</button></div>' +

      '<div class="section-title">' + t('connTitle') + '</div>' +
      '<div class="config-status ' + (configured ? 'ok' : 'warn') + '">' +
      (configured ? '✅ ' + (C.GITHUB_OWNER || '') + '/' + (C.GITHUB_REPO || '') + ' @ ' + (C.GITHUB_BRANCH || 'main') : '⚠️ ' + t('configMissing')) + '</div>' +
      '<div class="conn-form">' +
      f('cfgOwner', t('ghOwner'), C.GITHUB_OWNER) + f('cfgRepo', t('ghRepo'), C.GITHUB_REPO) +
      f('cfgBranch', t('ghBranch'), C.GITHUB_BRANCH || 'main') + f('cfgToken', t('ghToken'), C.GITHUB_TOKEN, 'password') +
      f('cfgAnthropic', t('anthropicKey'), C.ANTHROPIC_API_KEY, 'password') + '</div>' +
      '<button id="saveConfigBtn" class="primary-btn">' + icon('check') + ' ' + t('saveConnect') + '</button>' +
      '<div class="hint">' + t('tokenHint') + '</div>'
    );
  }

  /* ============== Edit modal ============== */
  function openEdit(id) {
    const tx = DATA.transactions.find((x) => x.id === id); if (!tx) return;
    const catOpts = CATS.map((c) => '<option value="' + c + '"' + (c === tx.category ? ' selected' : '') + '>' + c + '</option>').join('');
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon('edit') + ' ' + t('edit') + '</div>' +
      '<label>' + t('amount') + '</label><input id="eAmount" type="number" inputmode="numeric" value="' + tx.amount + '"/>' +
      '<label>' + t('category') + '</label><select id="eCat">' + catOpts + '</select>' +
      '<label>' + t('note') + '</label><input id="eNote" type="text" value="' + esc(tx.note) + '"/>' +
      '<div class="seg" style="margin-top:10px"><button class="seg-btn ' + (tx.type === 'expense' ? 'active' : '') + '" data-type="expense">' + t('expense') + '</button>' +
      '<button class="seg-btn ' + (tx.type === 'income' ? 'active' : '') + '" data-type="income">' + t('income') + '</button></div>' +
      '<div class="modal-actions"><button class="ghost-btn" id="eCancel">' + t('cancel') + '</button>' +
      '<button class="primary-btn" id="eSave">' + t('save') + '</button></div></div></div>';
    document.body.appendChild(wrap.firstChild);
    let newType = tx.type;
    document.querySelectorAll('#modalBackdrop .seg-btn').forEach((b) => b.addEventListener('click', () => {
      newType = b.dataset.type;
      document.querySelectorAll('#modalBackdrop .seg-btn').forEach((x) => x.classList.remove('active')); b.classList.add('active');
    }));
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    document.getElementById('eCancel').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    document.getElementById('eSave').addEventListener('click', () => {
      tx.amount = Math.round(Number(document.getElementById('eAmount').value) || 0);
      tx.category = document.getElementById('eCat').value;
      tx.note = document.getElementById('eNote').value.trim();
      tx.type = newType;
      persist(); close(); toast(t('save') + ' ✓', 'success'); render();
    });
  }

  /* ============== Nav ============== */
  function renderNav() {
    const nav = document.getElementById('bottomNav');
    if (!nav) return;
    const item = (tab, ic, label) => '<button class="nav-btn ' + (currentTab === tab ? 'active' : '') + '" data-tab="' + tab + '">' + icon(ic) + '<span>' + label + '</span></button>';
    nav.innerHTML =
      item('overview', 'wallet', t('overview')) +
      item('reports', 'chart', t('reports')) +
      '<button class="nav-fab ' + (currentTab === 'add' ? 'active' : '') + '" data-tab="add">' + icon('plus') + '</button>' +
      item('transactions', 'list', t('txs')) +
      item('settings', 'settings', t('settings'));
    nav.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { currentTab = b.dataset.tab; render(); }));
  }

  /* ============== Render + wire ============== */
  function render() {
    document.getElementById('appName').textContent = t('appName');
    const view = document.getElementById('view');
    const map = { overview: viewOverview, reports: viewReports, transactions: viewTransactions, add: viewAdd, settings: viewSettings };
    view.innerHTML = (map[currentTab] || viewOverview)();
    view.scrollTop = 0;
    renderNav();
    wire();
  }

  function wire() {
    // quick add (transactions)
    const ti = document.getElementById('txInput');
    if (ti) { document.getElementById('addBtn').addEventListener('click', () => addFromInput(ti.value, 'addBtn')); ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFromInput(ti.value, 'addBtn'); }); }
    // add page
    const tib = document.getElementById('txInputBig');
    if (tib) document.getElementById('addBtnBig').addEventListener('click', () => addFromInput(tib.value, 'addBtnBig'));
    document.querySelectorAll('.chip[data-ex]').forEach((c) => c.addEventListener('click', () => { if (tib) { tib.value = c.dataset.ex; tib.focus(); } }));
    // filters
    const fm = document.getElementById('fMonth'); if (fm) fm.addEventListener('change', () => { filterMonth = fm.value; render(); });
    const fc = document.getElementById('fCat'); if (fc) fc.addEventListener('change', () => { filterCategory = fc.value; render(); });
    const ft = document.getElementById('fType'); if (ft) ft.addEventListener('change', () => { filterType = ft.value; render(); });
    // tx actions
    document.querySelectorAll('.tx-actions .icon-btn').forEach((b) => b.addEventListener('click', () => { b.dataset.act === 'del' ? deleteTx(b.dataset.id) : openEdit(b.dataset.id); }));
    // goto links
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { currentTab = b.dataset.goto; render(); }));
    // reports period + nav
    document.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { reportPeriod = b.dataset.period; render(); }));
    document.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => shiftReport(parseInt(b.dataset.shift, 10))));
    // budgets
    const sb = document.getElementById('saveBudgetBtn');
    if (sb) sb.addEventListener('click', () => { document.querySelectorAll('[data-budget]').forEach((i) => { DATA.budgets[i.dataset.budget] = Math.round(Number(i.value) || 0); }); persist(); toast(t('budgetSaved'), 'success'); });
    // lang
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; localStorage.setItem('lang', lang); document.getElementById('langToggle').textContent = lang.toUpperCase(); render(); }));
    const tt2 = document.getElementById('themeToggle2'); if (tt2) tt2.addEventListener('click', toggleTheme);
    // connection
    const sc = document.getElementById('saveConfigBtn');
    if (sc) sc.addEventListener('click', async () => {
      saveSettings({
        GITHUB_OWNER: document.getElementById('cfgOwner').value.trim(),
        GITHUB_REPO: document.getElementById('cfgRepo').value.trim(),
        GITHUB_BRANCH: document.getElementById('cfgBranch').value.trim() || 'main',
        GITHUB_TOKEN: document.getElementById('cfgToken').value.trim(),
        ANTHROPIC_API_KEY: document.getElementById('cfgAnthropic').value.trim(),
      });
      toast(t('connSaved'), 'info');
      try { DATA = await window.GitHubSync.initRepo(); if (!DATA.budgets) DATA.budgets = {}; if (!DATA.transactions) DATA.transactions = []; toast(t('connOk') + ' ✓', 'success'); }
      catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
      render();
    });
  }

  /* ============== Theme + header ============== */
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#11131a' : '#6366f1');
  }
  function toggleTheme() { applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
  function wireHeader() {
    const lt = document.getElementById('langToggle');
    lt.textContent = lang.toUpperCase();
    lt.addEventListener('click', () => { lang = lang === 'vi' ? 'en' : 'vi'; localStorage.setItem('lang', lang); lt.textContent = lang.toUpperCase(); render(); });
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  }

  /* ============== Sync events ============== */
  window.addEventListener('gh-sync', (e) => {
    if (e.detail.ok) setStatus(t('synced'), 'ok');
    else if (e.detail.error === 'offline') setStatus(t('offline'), 'warn');
    else setStatus(t('syncError') + ': ' + e.detail.error, 'err');
    setTimeout(() => setStatus(''), 4000);
  });
  window.addEventListener('offline', () => setStatus(t('offline'), 'warn'));
  window.addEventListener('online', () => setStatus(''));

  /* ============== Init ============== */
  async function init() {
    applyTheme(localStorage.getItem('theme') || 'light');
    loadSettings();
    wireHeader();
    try { DATA = await window.GitHubSync.initRepo(); }
    catch (err) { DATA = JSON.parse(JSON.stringify(window.GitHubSync.DEFAULT_DATA)); toast(t('syncError') + ': ' + err.message, 'error'); }
    if (!DATA.budgets) DATA.budgets = {};
    if (!DATA.transactions) DATA.transactions = [];
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    if (!window.GitHubSync.isConfigured()) toast(t('configMissing'), 'warn');
    render();
    window.GitHubSync.syncIfDirty();
  }
  document.addEventListener('DOMContentLoaded', init);
})();

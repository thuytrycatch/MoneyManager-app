/* =====================================================================
 *  app.js — Logic chính của ứng dụng Quản lý Chi Tiêu
 * ===================================================================== */

(function () {
  'use strict';

  /* ============== Settings (localStorage, không hardcode) ============== */
  // Đảm bảo CONFIG tồn tại — trên GitHub Pages có thể không có config.js
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

  /* ============== i18n ============== */
  const I18N = {
    vi: {
      appName: 'Chi Tiêu Việt',
      home: 'Trang chủ', add: 'Thêm', stats: 'Thống kê', settings: 'Cài đặt',
      addTransaction: 'Thêm giao dịch', income: 'Thu nhập', expense: 'Chi tiêu',
      balance: 'Số dư', budget: 'Ngân sách',
      totalIncome: 'Tổng thu', totalExpense: 'Tổng chi', saved: 'Tiết kiệm',
      transactions: 'Giao dịch', noTransactions: 'Chưa có giao dịch nào.',
      inputPlaceholder: 'ăn sáng 35k, lương 15 triệu, đổ xăng 80k...',
      save: 'Lưu', cancel: 'Hủy', delete: 'Xóa', edit: 'Sửa',
      category: 'Danh mục', note: 'Ghi chú', amount: 'Số tiền',
      allMonths: 'Tất cả', allCats: 'Tất cả danh mục',
      byCategory: 'Chi tiêu theo danh mục', dailyFlow: 'Thu chi theo ngày',
      budgetProgress: 'Tiến độ ngân sách',
      saveBudget: 'Lưu ngân sách', budgetSaved: 'Đã lưu ngân sách',
      language: 'Ngôn ngữ', theme: 'Giao diện',
      configTitle: 'Kết nối GitHub', configHint: 'Điền thông tin trong file config.js',
      synced: 'Đã đồng bộ lên GitHub', syncError: 'Lỗi đồng bộ',
      offline: 'Đang offline — sẽ đồng bộ khi có mạng', saving: 'Đang lưu...',
      configMissing: 'Chưa cấu hình GitHub — dữ liệu lưu cục bộ (offline).',
      emptyInput: 'Vui lòng nhập nội dung giao dịch.',
      cantParse: 'Không nhận diện được số tiền. Hãy thử lại.',
      added: 'Đã thêm giao dịch', deleted: 'Đã xóa giao dịch',
      confirmDelete: 'Xóa giao dịch này?',
      warn80: 'Cảnh báo: đã dùng hơn 80% ngân sách',
      warn100: 'Vượt ngân sách', parsing: 'Đang phân tích...',
      monthLabel: 'Tháng', addedBy: 'phân tích bởi',
      connTitle: 'Kết nối GitHub', ghToken: 'GitHub Token', ghOwner: 'GitHub Owner (username)',
      ghRepo: 'Tên repo dữ liệu', ghBranch: 'Nhánh', anthropicKey: 'Claude API Key (tùy chọn)',
      saveConnect: 'Lưu & kết nối', connSaved: 'Đã lưu, đang kết nối…', connOk: 'Đã kết nối',
      tokenHint: '🔒 Token chỉ lưu trên trình duyệt này (localStorage), không bị gửi đi đâu ngoài GitHub. Cần token có quyền "repo".',
    },
    en: {
      appName: 'Chi Tiêu Việt',
      home: 'Home', add: 'Add', stats: 'Stats', settings: 'Settings',
      addTransaction: 'Add transaction', income: 'Income', expense: 'Expense',
      balance: 'Balance', budget: 'Budget',
      totalIncome: 'Income', totalExpense: 'Expense', saved: 'Saved',
      transactions: 'Transactions', noTransactions: 'No transactions yet.',
      inputPlaceholder: 'breakfast 35k, salary 15 million, gas 80k...',
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit',
      category: 'Category', note: 'Note', amount: 'Amount',
      allMonths: 'All', allCats: 'All categories',
      byCategory: 'Spending by category', dailyFlow: 'Daily income & expense',
      budgetProgress: 'Budget progress',
      saveBudget: 'Save budget', budgetSaved: 'Budget saved',
      language: 'Language', theme: 'Theme',
      configTitle: 'GitHub connection', configHint: 'Fill in config.js',
      synced: 'Synced to GitHub', syncError: 'Sync error',
      offline: 'Offline — will sync when online', saving: 'Saving...',
      configMissing: 'GitHub not configured — data stored locally (offline).',
      emptyInput: 'Please enter a transaction.',
      cantParse: 'Could not detect amount. Please try again.',
      added: 'Transaction added', deleted: 'Transaction deleted',
      confirmDelete: 'Delete this transaction?',
      warn80: 'Warning: over 80% of budget used',
      warn100: 'Over budget', parsing: 'Parsing...',
      monthLabel: 'Month', addedBy: 'parsed by',
      connTitle: 'GitHub connection', ghToken: 'GitHub Token', ghOwner: 'GitHub Owner (username)',
      ghRepo: 'Data repo name', ghBranch: 'Branch', anthropicKey: 'Claude API Key (optional)',
      saveConnect: 'Save & connect', connSaved: 'Saved, connecting…', connOk: 'Connected',
      tokenHint: '🔒 The token is stored only in this browser (localStorage), never sent anywhere except GitHub. Needs a token with "repo" scope.',
    },
  };

  let lang = localStorage.getItem('lang') || 'vi';
  function t(key) { return (I18N[lang] && I18N[lang][key]) || key; }

  /* ============== State ============== */
  let DATA = { version: '1.0', budgets: {}, transactions: [] };
  let currentTab = 'home';
  let filterMonth = monthKey(new Date()); // 'YYYY-MM'
  let filterCategory = '';
  const CATS = window.Parser.CATEGORIES;

  /* ============== Helpers ============== */
  const fmtVND = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
  const fmtShort = window.Charts.fmtShort;

  function monthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function nowTime() { return new Date().toTimeString().slice(0, 5); }
  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }));
  }

  function txOfMonth(mk) {
    return DATA.transactions.filter((tx) => (tx.date || '').slice(0, 7) === mk);
  }
  function availableMonths() {
    const set = new Set(DATA.transactions.map((tx) => (tx.date || '').slice(0, 7)).filter(Boolean));
    set.add(monthKey(new Date()));
    return Array.from(set).sort().reverse();
  }
  function spendingByCategory(txs) {
    const out = {};
    txs.forEach((tx) => {
      if (tx.type === 'expense') out[tx.category] = (out[tx.category] || 0) + tx.amount;
    });
    return out;
  }

  /* ============== Toast ============== */
  let toastTimer = null;
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || 'info');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  /* ============== Persist ============== */
  function save() {
    window.GitHubSync.writeDataFile(DATA);
    if (window.GitHubSync.isConfigured() && navigator.onLine) {
      setStatus(t('saving'));
    }
  }
  function setStatus(text, kind) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'sync-status ' + (kind || '');
  }

  /* ============== Budget warnings ============== */
  function checkBudgetWarning(category) {
    const limit = DATA.budgets[category];
    if (!limit) return;
    const used = spendingByCategory(txOfMonth(monthKey(new Date())))[category] || 0;
    const pct = (used / limit) * 100;
    if (pct >= 100) toast('🚨 ' + t('warn100') + ': ' + category + ' (' + Math.round(pct) + '%)', 'error');
    else if (pct >= 80) toast('⚠️ ' + t('warn80') + ': ' + category + ' (' + Math.round(pct) + '%)', 'warn');
  }

  /* ============== Transaction actions ============== */
  async function addFromInput(raw) {
    if (!raw.trim()) { toast(t('emptyInput'), 'warn'); return; }
    const btn = document.getElementById('addBtn');
    if (btn) { btn.disabled = true; btn.textContent = t('parsing'); }

    let parsed;
    try {
      parsed = await window.Parser.parseTransaction(raw);
    } catch (e) {
      parsed = window.Parser.parseWithRegex(raw);
    }

    if (btn) { btn.disabled = false; btn.textContent = '＋'; }

    if (!parsed.amount) { toast(t('cantParse'), 'warn'); return; }

    const tx = {
      id: uuid(),
      date: todayISO(),
      time: nowTime(),
      rawInput: raw,
      amount: parsed.amount,
      type: parsed.type,
      category: parsed.category,
      note: parsed.note,
      createdAt: new Date().toISOString(),
    };
    DATA.transactions.unshift(tx);
    save();
    toast(t('added') + ': ' + parsed.note + ' · ' + fmtVND(parsed.amount), 'success');
    if (tx.type === 'expense') checkBudgetWarning(tx.category);

    const input = document.getElementById('txInput');
    if (input) input.value = '';
    render();
  }

  function deleteTx(id) {
    if (!confirm(t('confirmDelete'))) return;
    DATA.transactions = DATA.transactions.filter((tx) => tx.id !== id);
    save();
    toast(t('deleted'), 'info');
    render();
  }

  function editTx(id) {
    const tx = DATA.transactions.find((x) => x.id === id);
    if (!tx) return;
    openEditModal(tx);
  }

  /* ============== Views ============== */
  function viewHome() {
    const txs = txOfMonth(filterMonth);
    let income = 0, expense = 0;
    txs.forEach((tx) => { tx.type === 'income' ? income += tx.amount : expense += tx.amount; });
    const balance = income - expense;

    let list = txs.slice();
    if (filterCategory) list = list.filter((tx) => tx.category === filterCategory);
    list.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

    const months = availableMonths();
    const monthOpts = months.map((m) =>
      '<option value="' + m + '"' + (m === filterMonth ? ' selected' : '') + '>' + t('monthLabel') + ' ' + m + '</option>'
    ).join('');
    const catOpts = '<option value="">' + t('allCats') + '</option>' +
      CATS.map((c) => '<option value="' + c + '"' + (c === filterCategory ? ' selected' : '') + '>' + c + '</option>').join('');

    return (
      '<div class="stats-cards">' +
      statCard(t('totalIncome'), income, 'income') +
      statCard(t('totalExpense'), expense, 'expense') +
      statCard(t('balance'), balance, balance >= 0 ? 'income' : 'expense') +
      '</div>' +

      '<div class="quick-add">' +
      '<input id="txInput" type="text" inputmode="text" placeholder="' + t('inputPlaceholder') + '" autocomplete="off" />' +
      '<button id="addBtn" class="add-btn-inline" aria-label="' + t('add') + '">＋</button>' +
      '</div>' +

      '<div class="filters">' +
      '<select id="filterMonth">' + monthOpts + '</select>' +
      '<select id="filterCat">' + catOpts + '</select>' +
      '</div>' +

      '<div class="section-title">' + t('transactions') + ' (' + list.length + ')</div>' +
      '<div class="tx-list">' +
      (list.length ? list.map(txRow).join('') : '<div class="empty">' + t('noTransactions') + '</div>') +
      '</div>'
    );
  }

  function statCard(label, value, kind) {
    return (
      '<div class="stat-card ' + kind + '">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-value">' + fmtShort(Math.abs(value)) + '₫</div>' +
      '</div>'
    );
  }

  function txRow(tx) {
    const sign = tx.type === 'income' ? '+' : '−';
    return (
      '<div class="tx-row" data-id="' + tx.id + '">' +
      '<div class="tx-main">' +
      '<div class="tx-note">' + escapeHtml(tx.note || tx.rawInput) + '</div>' +
      '<div class="tx-meta"><span class="tx-cat">' + tx.category + '</span> · ' + tx.date + (tx.time ? ' ' + tx.time : '') + '</div>' +
      '</div>' +
      '<div class="tx-amount ' + tx.type + '">' + sign + fmtShort(tx.amount) + '₫</div>' +
      '<div class="tx-actions">' +
      '<button class="icon-btn edit" data-act="edit" data-id="' + tx.id + '">✎</button>' +
      '<button class="icon-btn del" data-act="del" data-id="' + tx.id + '">🗑</button>' +
      '</div>' +
      '</div>'
    );
  }

  function viewAdd() {
    return (
      '<div class="add-page">' +
      '<div class="section-title">' + t('addTransaction') + '</div>' +
      '<textarea id="txInputBig" rows="3" placeholder="' + t('inputPlaceholder') + '"></textarea>' +
      '<button id="addBtnBig" class="primary-btn">＋ ' + t('add') + '</button>' +
      '<div class="examples">' +
      ['ăn sáng 35k', 'lương 15 triệu', 'đổ xăng 80k', 'cafe 2 triệu rưỡi', 'grab 1tr2', 'tiền điện 500 nghìn']
        .map((ex) => '<button class="chip" data-ex="' + ex + '">' + ex + '</button>').join('') +
      '</div>' +
      '</div>'
    );
  }

  function viewStats() {
    const txs = txOfMonth(filterMonth);
    const byCat = spendingByCategory(txs);

    const incomeByDay = {}, expenseByDay = {};
    txs.forEach((tx) => {
      const d = parseInt((tx.date || '').slice(8, 10), 10);
      if (!d) return;
      if (tx.type === 'income') incomeByDay[d] = (incomeByDay[d] || 0) + tx.amount;
      else expenseByDay[d] = (expenseByDay[d] || 0) + tx.amount;
    });
    const [y, m] = filterMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    setTimeout(() => {
      window.Charts.renderDonut('donutChart', byCat, (cat) => {
        filterCategory = cat; currentTab = 'home'; render();
      });
      window.Charts.renderBar('barChart', incomeByDay, expenseByDay, daysInMonth);
      window.Charts.renderBudgetBars('budgetBars', byCat, DATA.budgets);
    }, 0);

    const months = availableMonths();
    const monthOpts = months.map((mk) =>
      '<option value="' + mk + '"' + (mk === filterMonth ? ' selected' : '') + '>' + t('monthLabel') + ' ' + mk + '</option>'
    ).join('');

    return (
      '<div class="filters"><select id="filterMonth2">' + monthOpts + '</select></div>' +
      '<div class="section-title">' + t('byCategory') + '</div>' +
      '<div class="chart-box"><canvas id="donutChart"></canvas></div>' +
      '<div id="donutLegend" class="legend"></div>' +
      '<div class="section-title">' + t('dailyFlow') + '</div>' +
      '<div class="chart-box tall"><canvas id="barChart"></canvas></div>' +
      '<div class="section-title">' + t('budgetProgress') + '</div>' +
      '<div id="budgetBars" class="budget-list"></div>'
    );
  }

  function viewSettings() {
    const budgetInputs = CATS.filter((c) => c !== 'Thu nhập').map((c) =>
      '<div class="budget-edit-row">' +
      '<label>' + c + '</label>' +
      '<input type="number" inputmode="numeric" data-budget="' + c + '" value="' + (DATA.budgets[c] || 0) + '" />' +
      '</div>'
    ).join('');

    const configured = window.GitHubSync.isConfigured();

    return (
      '<div class="section-title">' + t('budget') + ' (' + t('monthLabel') + ')</div>' +
      '<div class="budget-edit">' + budgetInputs + '</div>' +
      '<button id="saveBudgetBtn" class="primary-btn">' + t('saveBudget') + '</button>' +

      '<div class="section-title">' + t('language') + ' / ' + t('theme') + '</div>' +
      '<div class="settings-row">' +
      '<div class="seg">' +
      '<button class="seg-btn ' + (lang === 'vi' ? 'active' : '') + '" data-lang="vi">VI</button>' +
      '<button class="seg-btn ' + (lang === 'en' ? 'active' : '') + '" data-lang="en">EN</button>' +
      '</div>' +
      '<button id="themeToggle2" class="ghost-btn">🌗 ' + t('theme') + '</button>' +
      '</div>' +

      '<div class="section-title">' + t('connTitle') + '</div>' +
      '<div class="config-status ' + (configured ? 'ok' : 'warn') + '">' +
      (configured
        ? '✅ ' + (CONFIG.GITHUB_OWNER || '') + '/' + (CONFIG.GITHUB_REPO || '') + ' @ ' + (CONFIG.GITHUB_BRANCH || 'main')
        : '⚠️ ' + t('configMissing')) +
      '</div>' +
      '<div class="conn-form">' +
      field('cfgOwner', t('ghOwner'), CONFIG.GITHUB_OWNER, 'text') +
      field('cfgRepo', t('ghRepo'), CONFIG.GITHUB_REPO, 'text') +
      field('cfgBranch', t('ghBranch'), CONFIG.GITHUB_BRANCH || 'main', 'text') +
      field('cfgToken', t('ghToken'), CONFIG.GITHUB_TOKEN, 'password') +
      field('cfgAnthropic', t('anthropicKey'), CONFIG.ANTHROPIC_API_KEY, 'password') +
      '</div>' +
      '<button id="saveConfigBtn" class="primary-btn">' + t('saveConnect') + '</button>' +
      '<div class="hint">' + t('tokenHint') + '</div>'
    );
  }

  /* ============== Edit modal ============== */
  function openEditModal(tx) {
    const catOpts = CATS.map((c) =>
      '<option value="' + c + '"' + (c === tx.category ? ' selected' : '') + '>' + c + '</option>').join('');
    const html =
      '<div class="modal-backdrop" id="modalBackdrop">' +
      '<div class="modal">' +
      '<div class="section-title">' + t('edit') + '</div>' +
      '<label>' + t('amount') + '</label>' +
      '<input id="editAmount" type="number" inputmode="numeric" value="' + tx.amount + '" />' +
      '<label>' + t('category') + '</label>' +
      '<select id="editCat">' + catOpts + '</select>' +
      '<label>' + t('note') + '</label>' +
      '<input id="editNote" type="text" value="' + escapeAttr(tx.note || '') + '" />' +
      '<div class="seg" style="margin-top:8px">' +
      '<button class="seg-btn ' + (tx.type === 'expense' ? 'active' : '') + '" data-type="expense">' + t('expense') + '</button>' +
      '<button class="seg-btn ' + (tx.type === 'income' ? 'active' : '') + '" data-type="income">' + t('income') + '</button>' +
      '</div>' +
      '<div class="modal-actions">' +
      '<button class="ghost-btn" id="editCancel">' + t('cancel') + '</button>' +
      '<button class="primary-btn" id="editSave">' + t('save') + '</button>' +
      '</div>' +
      '</div></div>';
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstChild);

    let newType = tx.type;
    document.querySelectorAll('#modalBackdrop .seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        newType = b.dataset.type;
        document.querySelectorAll('#modalBackdrop .seg-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
    function close() { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); }
    document.getElementById('editCancel').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modalBackdrop') close();
    });
    document.getElementById('editSave').addEventListener('click', () => {
      tx.amount = Math.round(Number(document.getElementById('editAmount').value) || 0);
      tx.category = document.getElementById('editCat').value;
      tx.note = document.getElementById('editNote').value.trim();
      tx.type = newType;
      save();
      close();
      toast(t('save') + ' ✓', 'success');
      render();
    });
  }

  /* ============== Escape ============== */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function field(id, label, value, type) {
    return '<div class="conn-row"><label>' + label + '</label>' +
      '<input id="' + id + '" type="' + (type || 'text') + '" value="' + escapeAttr(value || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false" /></div>';
  }

  /* ============== Render + wiring ============== */
  function render() {
    document.getElementById('appName').textContent = t('appName');
    const view = document.getElementById('view');
    if (currentTab === 'home') view.innerHTML = viewHome();
    else if (currentTab === 'add') view.innerHTML = viewAdd();
    else if (currentTab === 'stats') view.innerHTML = viewStats();
    else if (currentTab === 'settings') view.innerHTML = viewSettings();

    // nav active
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === currentTab);
    });

    wireView();
  }

  function wireView() {
    // Home quick add
    const addBtn = document.getElementById('addBtn');
    const txInput = document.getElementById('txInput');
    if (addBtn && txInput) {
      addBtn.addEventListener('click', () => addFromInput(txInput.value));
      txInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFromInput(txInput.value); });
    }

    // Add page
    const addBtnBig = document.getElementById('addBtnBig');
    const txInputBig = document.getElementById('txInputBig');
    if (addBtnBig && txInputBig) {
      addBtnBig.addEventListener('click', () => addFromInput(txInputBig.value));
    }
    document.querySelectorAll('.chip[data-ex]').forEach((c) => {
      c.addEventListener('click', () => { if (txInputBig) { txInputBig.value = c.dataset.ex; txInputBig.focus(); } });
    });

    // Filters (home)
    const fm = document.getElementById('filterMonth');
    if (fm) fm.addEventListener('change', () => { filterMonth = fm.value; render(); });
    const fc = document.getElementById('filterCat');
    if (fc) fc.addEventListener('change', () => { filterCategory = fc.value; render(); });
    // Filter (stats)
    const fm2 = document.getElementById('filterMonth2');
    if (fm2) fm2.addEventListener('change', () => { filterMonth = fm2.value; render(); });

    // Tx actions
    document.querySelectorAll('.tx-actions .icon-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        if (b.dataset.act === 'del') deleteTx(id);
        else editTx(id);
      });
    });

    // Settings: budgets
    const saveBudgetBtn = document.getElementById('saveBudgetBtn');
    if (saveBudgetBtn) {
      saveBudgetBtn.addEventListener('click', () => {
        document.querySelectorAll('[data-budget]').forEach((inp) => {
          DATA.budgets[inp.dataset.budget] = Math.round(Number(inp.value) || 0);
        });
        save();
        toast(t('budgetSaved'), 'success');
      });
    }
    // Settings: lang
    document.querySelectorAll('[data-lang]').forEach((b) => {
      b.addEventListener('click', () => {
        lang = b.dataset.lang; localStorage.setItem('lang', lang); render();
      });
    });
    const tt2 = document.getElementById('themeToggle2');
    if (tt2) tt2.addEventListener('click', toggleTheme);

    // Settings: kết nối GitHub
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    if (saveConfigBtn) {
      saveConfigBtn.addEventListener('click', async () => {
        saveSettings({
          GITHUB_OWNER: document.getElementById('cfgOwner').value.trim(),
          GITHUB_REPO: document.getElementById('cfgRepo').value.trim(),
          GITHUB_BRANCH: document.getElementById('cfgBranch').value.trim() || 'main',
          GITHUB_TOKEN: document.getElementById('cfgToken').value.trim(),
          ANTHROPIC_API_KEY: document.getElementById('cfgAnthropic').value.trim(),
        });
        toast(t('connSaved'), 'info');
        try {
          DATA = await window.GitHubSync.initRepo();
          if (!DATA.budgets) DATA.budgets = {};
          if (!DATA.transactions) DATA.transactions = [];
          toast(t('connOk') + ' ✓', 'success');
        } catch (err) {
          toast(t('syncError') + ': ' + err.message, 'error');
        }
        render();
      });
    }
  }

  /* ============== Theme ============== */
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1a1a2e' : '#4f46e5');
  }
  function toggleTheme() {
    applyTheme(document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }

  /* ============== Header (lang toggle in header) ============== */
  function wireHeader() {
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
      langToggle.addEventListener('click', () => {
        lang = lang === 'vi' ? 'en' : 'vi';
        localStorage.setItem('lang', lang);
        langToggle.textContent = lang.toUpperCase();
        render();
      });
      langToggle.textContent = lang.toUpperCase();
    }
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.addEventListener('click', () => { currentTab = b.dataset.tab; render(); });
    });
  }

  /* ============== Sync events ============== */
  window.addEventListener('gh-sync', (e) => {
    if (e.detail.ok) setStatus(t('synced') + ' ✓', 'ok');
    else if (e.detail.error === 'offline') setStatus(t('offline'), 'warn');
    else setStatus(t('syncError') + ': ' + e.detail.error, 'err');
    setTimeout(() => setStatus(''), 4000);
  });
  window.addEventListener('offline', () => setStatus(t('offline'), 'warn'));
  window.addEventListener('online', () => setStatus(''));

  /* ============== Init ============== */
  async function init() {
    applyTheme(localStorage.getItem('theme') || 'light');
    loadSettings(); // localStorage ghi đè config.js (nếu có)
    wireHeader();

    try {
      DATA = await window.GitHubSync.initRepo();
    } catch (err) {
      DATA = JSON.parse(JSON.stringify(window.GitHubSync.DEFAULT_DATA));
      toast(t('syncError') + ': ' + err.message, 'error');
    }
    if (!DATA.budgets) DATA.budgets = {};
    if (!DATA.transactions) DATA.transactions = [];

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');

    if (!window.GitHubSync.isConfigured()) {
      toast(t('configMissing'), 'warn');
    }
    render();
    window.GitHubSync.syncIfDirty();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

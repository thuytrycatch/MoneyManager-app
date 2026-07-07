/* =====================================================================
 *  app.js — Family Income & Expense Manager
 *  Overview · Reports (Week/Month/Year) · Transactions · Settings
 * ===================================================================== */
(function () {
  'use strict';

  /* ============== Settings (localStorage) ============== */
  window.CONFIG = window.CONFIG || {
    SUPABASE_URL: '', SUPABASE_ANON_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '',
  };
  const SETTINGS_KEY = 'mm_settings';
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      Object.keys(s).forEach((k) => { if (s[k] != null && s[k] !== '') window.CONFIG[k] = s[k]; });
    } catch (e) { /* ignore */ }
  }
  function saveSettings(obj) {
    // Merge into the stored blob — a partial save (e.g. AI keys only) must not
    // wipe the Supabase URL/key saved earlier under the same localStorage key.
    let cur = {};
    try { cur = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { /* ignore */ }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(cur, obj)));
    Object.assign(window.CONFIG, obj);
  }

  // Household-shared config (household_settings table, loaded as DATA.aiConfig).
  // Whitelisted merge into window.CONFIG: the DB row must never override the
  // Supabase connection itself (bootstrap credentials stay on this device).
  // An existing row is authoritative — an empty value means "key cleared".
  const DB_CONFIG_KEYS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY'];
  function applyDbConfig() {
    const s = DATA && DATA.aiConfig;
    if (!s) return; // no row / table yet → keep this browser's local values
    DB_CONFIG_KEYS.forEach((k) => { window.CONFIG[k] = String(s[k] || '').trim(); });
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
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    film: '<rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    bank: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    transfer: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    scale: '<path d="M16 16l3-8 3 8c-2 1.5-4 1.5-6 0Z"/><path d="M2 16l3-8 3 8c-2 1.5-4 1.5-6 0Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    crown: '<path d="M2 18h20l-2-9-5 4-3-7-3 7-5-4-2 9z"/>',
    paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    gold: '<path d="M9 4h6l2 5H7l2-5z"/><path d="M4.5 13h6l2 5h-10l2-5z"/><path d="M13.5 13h6l2 5h-10l2-5z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  const CAT_ICON = {
    'Ăn uống': 'utensils', 'Di chuyển': 'car', 'Mua sắm': 'bag', 'Giải trí': 'film',
    'Sức khỏe': 'heart', 'Hóa đơn': 'file', 'Thu nhập': 'trendUp', 'Khác': 'more',
  };
  function catIcon(cat) {
    // Custom categories carry an emoji; the built-in eight keep their SVG icon.
    const row = (DATA.categories || []).find((c) => c.name === cat);
    if (row && row.emoji) return '<span class="cat-emoji">' + esc(row.emoji) + '</span>';
    return icon(CAT_ICON[cat] || 'more');
  }

  /* ============== i18n ============== */
  const I18N = {
    vi: {
      appName: 'Sổ Thu Chi', overview: 'Tổng quan', reports: 'Báo cáo', add: 'Thêm', txs: 'Giao dịch', settings: 'Cài đặt',
      income: 'Thu nhập', expense: 'Chi tiêu', balance: 'Số dư hiện tại', savings: 'Tiết kiệm', savingsRate: 'Tỷ lệ tiết kiệm',
      balanceAvail: 'Số dư khả dụng', balanceTotal: 'Tổng số dư',
      thisMonth: 'Tháng này', remaining: 'Còn lại', budget: 'Ngân sách', spentToday: 'Chi hôm nay', avgPerDay: 'TB mỗi ngày',
      weekReview: 'Đánh giá tuần này', vsLastWeek: 'so với tuần trước',
      recent: 'Giao dịch gần đây', seeAll: 'Xem tất cả', noTx: 'Chưa có giao dịch nào.', refresh: 'Làm mới',
      addTx: 'Thêm giao dịch', placeholder: 'ăn sáng 35k, lương 15 triệu, đổ xăng 80k…',
      week: 'Tuần', month: 'Tháng', year: 'Năm', byCategory: 'Chi theo danh mục', trend: 'Diễn biến thu chi',
      budgetProgress: 'Tiến độ ngân sách', topSpending: 'Khoản chi lớn nhất', summary: 'Tổng kết',
      save: 'Lưu', cancel: 'Hủy', delete: 'Xóa', edit: 'Sửa', category: 'Danh mục', note: 'Ghi chú', amount: 'Số tiền',
      date: 'Ngày', time: 'Giờ', today: 'Hôm nay', yesterday: 'Hôm qua', pickDate: 'Chọn ngày',
      wallets: 'Ví / Tài khoản', wallet: 'Ví', walletCash: 'Tiền mặt', addWallet: 'Thêm ví',
      walletName: 'Tên ví', walletType: 'Loại', openingBalance: 'Số dư đầu kỳ',
      setDefaultWallet: 'Đặt làm ví mặc định', defaultWallet: 'Ví mặc định',
      typeCash: 'Tiền mặt', typeBank: 'Ngân hàng', typeEwallet: 'Ví điện tử', typeOther: 'Khác',
      totalBalance: 'Tổng số dư', walletSaved: 'Đã lưu ví', walletDeleted: 'Đã xóa ví',
      confirmDeleteWallet: 'Xóa ví này? Giao dịch cũ vẫn giữ nhưng sẽ không còn gắn ví.',
      noWallets: 'Chưa có ví nào.', unassignedWallet: 'Chưa gán ví', needWalletName: 'Nhập tên ví.',
      transfer: 'Chuyển khoản', transferBetween: 'Chuyển tiền giữa ví', fromWallet: 'Từ ví', toWallet: 'Đến ví',
      transferDone: 'Đã chuyển khoản', needTwoWallets: 'Cần ít nhất 2 ví để chuyển khoản.',
      sameWallet: 'Ví nguồn và ví đích phải khác nhau.', needAmount: 'Nhập số tiền.',
      adjustBalance: 'Đổi số dư', realBalance: 'Số dư thực tế', balanceAdjustLabel: 'Điều chỉnh số dư',
      balanceAdjusted: 'Đã cập nhật số dư', adjustHint: 'App sẽ ghi một khoản điều chỉnh cho phần chênh lệch.',
      walletHistory: 'Lịch sử ví', balanceAfter: 'Số dư sau', noWalletHistory: 'Ví chưa có giao dịch nào.',
      showBalance: 'Hiện số dư', hideBalance: 'Ẩn số dư',
      allCats: 'Tất cả danh mục', allTypes: 'Thu & chi',
      budgetNotSet: 'Chưa thiết lập ngân sách.', noExpenseData: 'Chưa có dữ liệu chi tiêu.',
      weekLabel: 'Tuần', moPrefix: 'T', dows: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
      errNotConfigured: 'Chưa cấu hình Supabase (thiếu URL hoặc anon key).',
      errLibNotLoaded: 'Chưa tải được thư viện Supabase — kiểm tra kết nối mạng.',
      errNotSignedIn: 'Chưa đăng nhập.', errEnterCode: 'Vui lòng nhập mã hộ.',
      errInvalidCode: 'Mã hộ không hợp lệ hoặc không tồn tại.', errReadHousehold: 'Không đọc được thông tin hộ.',
      errNoHousehold: 'Chưa có hộ.', errNotMember: 'Bạn không thuộc hộ này.',
      hhDefaultPrefix: 'Gia đình của', me: 'tôi',
      saveBudget: 'Lưu ngân sách', budgetSaved: 'Đã lưu ngân sách', language: 'Ngôn ngữ', theme: 'Giao diện',
      connTitle: 'Kết nối Supabase', supaUrl: 'Supabase URL', supaKey: 'Supabase anon key',
      anthropicKey: 'Claude API Key (tùy chọn)', saveConnect: 'Lưu & kết nối',
      geminiKey: 'Gemini API Key (miễn phí)', aiCategorize: 'AI tự phân loại chi tiêu',
      aiHint: '🤖 Nhập key để AI tự đoán danh mục từ câu bạn gõ. Gemini có gói miễn phí — lấy key tại aistudio.google.com/app/apikey. Bỏ trống thì app vẫn tự phân loại bằng từ khóa. Key lưu trong database của hộ — mọi thành viên, mọi thiết bị dùng chung.',
      aiSavedShared: 'Đã lưu vào database — cả hộ dùng chung trên mọi thiết bị.',
      aiSavedLocal: 'Chưa có bảng cấu hình trên database (chạy lại supabase-schema.sql). Key tạm lưu trên trình duyệt này.',
      supaWhyLocal: 'ℹ️ Riêng mục này luôn lưu trên thiết bị: app cần URL & anon key để kết nối database, nên không thể đọc chúng từ database.',
      connSaved: 'Đã lưu, đang kết nối…', connOk: 'Đã kết nối', configMissing: 'Chưa cấu hình Supabase.',
      tokenHint: '🔒 Thông tin lưu trên trình duyệt này (localStorage). anon key là khóa công khai, dữ liệu được bảo vệ bằng Row Level Security.',
      // Auth
      signIn: 'Đăng nhập', signUp: 'Tạo tài khoản', signOut: 'Đăng xuất', email: 'Email', password: 'Mật khẩu',
      authWelcome: 'Đăng nhập để quản lý thu chi gia đình', haveAccount: 'Đã có tài khoản? Đăng nhập',
      needAccount: 'Chưa có tài khoản? Tạo mới', editConfig: 'Đổi cấu hình Supabase',
      signedUp: 'Đã tạo tài khoản. Kiểm tra email nếu cần xác nhận, rồi đăng nhập.',
      authError: 'Lỗi đăng nhập', fillEmailPass: 'Vui lòng nhập email và mật khẩu.',
      invalidCreds: 'Email hoặc mật khẩu không đúng.', emailNotConfirmed: 'Email chưa được xác nhận — kiểm tra hộp thư của bạn.',
      authRateLimit: 'Bạn thử quá nhiều lần. Vui lòng đợi một lát rồi thử lại.', userExists: 'Email này đã được đăng ký. Hãy đăng nhập.',
      weakPassword: 'Mật khẩu quá ngắn (tối thiểu 6 ký tự).', invalidEmail: 'Email không hợp lệ.',
      configIntro: 'Nhập thông tin Supabase (Settings → API) để bắt đầu.',
      // Household
      household: 'Hộ gia đình', householdName: 'Tên hộ', inviteCode: 'Mã mời (chia sẻ để người thân cùng dùng)',
      copyCode: 'Sao chép mã', copied: 'Đã sao chép', joinHousehold: 'Tham gia hộ khác', joinCodePh: 'Dán mã mời vào đây',
      join: 'Tham gia', joined: 'Đã tham gia hộ', renameOk: 'Đã đổi tên hộ', account: 'Tài khoản',
      switchHousehold: 'Chọn hộ đang xem',
      grpAccount: 'Hộ gia đình & Tài khoản', grpMoney: 'Quản lý tiền', grpGeneral: 'Cài đặt chung', grpAdvanced: 'Nâng cao',
      chooseLanguage: 'Chọn ngôn ngữ', darkMode: 'Chế độ tối',
      members: 'Thành viên', roleOwner: 'Chủ hộ', roleAdmin: 'Quản trị viên', roleMember: 'Thành viên', you: 'bạn', unknownMember: '(chưa rõ email)',
      spentFor: 'Chi cho', spentForShort: 'cho', beneficiaryShared: 'Chung (cả nhà)', byBeneficiary: 'Chi theo thành viên',
      confirmRemoveMember: 'Xóa thành viên này khỏi hộ?', memberRemoved: 'Đã xóa thành viên',
      leaveHousehold: 'Rời hộ này', confirmLeave: 'Rời khỏi hộ này?', onlyOwnerRemove: 'Chỉ chủ hộ mới xóa được thành viên.',
      makeAdmin: 'Đặt làm quản trị viên', removeAdmin: 'Bỏ quyền quản trị', makeOwner: 'Chuyển quyền chủ hộ',
      confirmMakeAdmin: 'Cấp quyền quản trị viên cho thành viên này? Họ sẽ quản lý được ngân sách, ví, mục tiêu, khoản định kỳ và sửa mọi giao dịch.',
      confirmRemoveAdmin: 'Bỏ quyền quản trị của thành viên này?',
      confirmMakeOwner: 'Chuyển quyền chủ hộ cho thành viên này? Bạn sẽ trở thành quản trị viên và không thể hoàn tác.',
      roleChanged: 'Đã cập nhật vai trò', ownerTransferred: 'Đã chuyển quyền chủ hộ',
      ownerOnlyHint: 'Chỉ chủ hộ hoặc quản trị viên mới chỉnh sửa được mục này.',
      ownerOnlyRename: 'Chỉ chủ hộ mới đổi được tên hộ.',
      noPermission: 'Bạn không có quyền thực hiện thao tác này.',
      cantEditOthersTx: 'Chỉ chủ hộ hoặc quản trị viên mới sửa/xóa được giao dịch của người khác.',
      activity: 'Nhật ký hoạt động',
      activityHint: 'Lịch sử các thao tác thêm / sửa / xóa của thành viên trong hộ.',
      activityEmpty: 'Chưa có hoạt động nào.',
      searchAct: 'Tìm theo người, loại, nội dung…', activityDetail: 'Chi tiết hoạt động',
      noFieldChanges: 'Không có thay đổi trường nào.', noActMatch: 'Không tìm thấy hoạt động phù hợp.', role: 'Vai trò',
      actAdd: 'đã thêm', actEdit: 'đã sửa', actDel: 'đã xóa',
      entTransaction: 'giao dịch', entBudget: 'ngân sách', entAccount: 'ví',
      entGoal: 'mục tiêu', entRecurring: 'khoản định kỳ', entMember: 'thành viên', entHousehold: 'hộ gia đình',
      added: 'Đã thêm', deleted: 'Đã xóa', confirmDelete: 'Xóa giao dịch này?',
      confirmEntries: 'Xác nhận giao dịch', saveAll: 'Lưu tất cả', undo: 'Hoàn tác',
      unrecognizedLines: 'dòng chưa nhận diện được', maxEntries: 'Chỉ xử lý tối đa 20 dòng mỗi lần.',
      emptyInput: 'Vui lòng nhập nội dung.', cantParse: 'Không nhận diện được số tiền.',
      warn80: 'Sắp vượt ngân sách', warn100: 'Vượt ngân sách', parsing: 'Đang phân tích…',
      synced: 'Đã đồng bộ ✓', syncError: 'Lỗi đồng bộ', offline: 'Offline — sẽ đồng bộ sau', saving: 'Đang lưu…',
      // Income vs expense tile (overview)
      netDiff: 'Chênh lệch thu chi', netIncomeHigher: 'Thu nhiều hơn chi', netExpenseHigher: 'Chi nhiều hơn thu', netEven: 'Thu chi bằng nhau',
      // Reminders
      reminder: 'Nhắc ghi chép', reminderOn: 'Bật nhắc nhở', reminderTime: 'Giờ nhắc',
      reminderHint: '🔔 Tới giờ đã đặt, nếu hôm đó bạn chưa ghi khoản nào, app sẽ nhắc khi bạn mở app. Thông báo chỉ hiện trên thiết bị này và không kèm số tiền.',
      reminderTitle: 'Sổ Thu Chi', reminderBody: 'Hôm nay bạn chưa ghi khoản nào — ghi nhanh để theo dõi nhé!',
      reminderKeepStreak: '🔥 Giữ chuỗi {n} ngày — ghi một khoản hôm nay nhé!',
      reminderEnabled: 'Đã bật nhắc nhở', reminderDisabled: 'Đã tắt nhắc nhở',
      reminderDenied: 'Thông báo đang bị chặn — hãy cho phép trong cài đặt trình duyệt.', reminderUnsupported: 'Trình duyệt không hỗ trợ thông báo.',
      // Wrap-up & comparison
      wrapNoPrev: 'Chưa có dữ liệu kỳ trước để so sánh.', wrapMore: 'Chi nhiều hơn {n}% so với kỳ trước.',
      wrapLess: 'Chi ít hơn {n}% so với kỳ trước.', wrapSame: 'Chi tương đương kỳ trước.',
      wrapGood: '👏 Bạn tiết kiệm tốt hơn — giữ nhịp nhé!', wrapWatch: '⚠️ Chi tăng khá nhiều — để ý nhé.',
      wrapBiggest: 'Lớn nhất',
      // Quick templates
      quickTemplates: 'Mẫu chi nhanh', addTemplate: 'Thêm mẫu', templateName: 'Tên mẫu',
      noTemplates: 'Chưa có mẫu nào.', templatePrefix: 'Mẫu: ',
      templatesHint: 'Tạo mẫu cho khoản hay lặp lại (gửi xe, cơm trưa…). Ở trang Thêm, chạm 1 cái là ghi ngay (có thể Hoàn tác). Mẫu lưu trên thiết bị này.',
      // Auto insights & spending calendar
      insights: 'Nhận xét tự động', spendingCalendar: 'Lịch chi tiêu', less: 'Ít', more: 'Nhiều',
      insMoreAvg: 'Tháng này chi nhiều hơn {n}% so với trung bình gần đây.',
      insLessAvg: 'Tháng này chi ít hơn {n}% so với trung bình gần đây.',
      insWeekend: 'Cuối tuần bạn chi gấp {n} lần ngày thường.',
      insCatJump: '{c} tăng {n}% so với tháng trước.',
      // Savings goals
      savingsGoals: 'Mục tiêu tiết kiệm', addGoal: 'Thêm mục tiêu', goalName: 'Tên mục tiêu',
      targetAmount: 'Số tiền mục tiêu', linkedWallet: 'Ví tiết kiệm', dueDateOpt: 'Hạn (tùy chọn)',
      noGoals: 'Chưa có mục tiêu nào.', goalDone: 'Hoàn thành! 🎉',
      goalNeed: 'còn {m} tháng · để {a}/tháng', goalDueSoon: 'sắp đến hạn',
      goalsHint: 'Gắn mục tiêu với một ví Tiết kiệm — tiến độ tự tính theo số dư ví đó. Để trống ví nếu chỉ muốn ghi mục tiêu.',
      goalNone: '— Không gắn ví —',
      // Recurring
      recurring: 'Chi định kỳ', addRecurring: 'Thêm khoản định kỳ', recurringName: 'Tên khoản',
      dayOfMonth: 'Ngày hàng tháng', noRecurring: 'Chưa có khoản định kỳ.',
      recurringHint: 'App tự ghi khoản này mỗi tháng vào ngày đã chọn (khi bạn mở app). Hợp với tiền nhà, internet, thuê bao…',
      recurringCreated: 'Đã tự ghi {n} khoản định kỳ', recurringPrefix: 'Định kỳ: ',
      // Trends & forecast
      trendForecast: 'Xu hướng & Dự báo', actualLabel: 'Thực tế', trendLabel: 'Trung bình động', forecastLabel: 'Dự báo',
      forecastNote: '🔮 Ước tính dựa trên xu hướng các tháng gần đây — chỉ mang tính tham khảo.',
      needMoreData: 'Cần ít nhất 4 tháng dữ liệu để dự báo.', spikeMonth: 'Chi tiêu cao bất thường',
      trendEmpty: 'Chưa đủ dữ liệu để hiển thị xu hướng theo tháng — cần ít nhất 2 tháng có chi tiêu.',
      projectedOverspend: 'Dự kiến vượt ngân sách', perMonth: '/tháng',
      // Net worth / assets & liabilities
      netWorth: 'Tài sản ròng', netWorthNow: 'Hiện tại', totalAssets: 'Tổng tài sản', totalLiabilities: 'Tổng nợ',
      assets: 'Tài sản', liabilities: 'Nợ', noAccountsNw: 'Thêm ví / tài khoản để xem tài sản ròng.',
      typeSavings: 'Tiết kiệm', typeCredit: 'Thẻ tín dụng', typeLoan: 'Khoản vay',
      creditLimit: 'Hạn mức', statementDay: 'Ngày sao kê', dueDay: 'Ngày đến hạn',
      utilization: 'Đã dùng hạn mức', minPayment: 'Trả tối thiểu', dueDate: 'Đến hạn', owed: 'Đang nợ',
      dueInDays: 'còn {n} ngày', dueTodayLabel: 'đến hạn hôm nay',
      liabilityHint: 'Với thẻ tín dụng / khoản vay: nhập số dư âm nếu đang nợ (vd −4.500.000). Hạn mức và ngày sao kê/đến hạn là tùy chọn.',
      // Gold wallets
      typeGold: 'Vàng',
      goldWeight: 'Khối lượng', unitChi: 'chỉ', unitLuong: 'lượng',
      goldKind: 'Loại vàng', goldKindSjc: 'Vàng miếng SJC', goldKindRing: 'Nhẫn 9999 (24k)',
      goldKindJewelry: 'Vàng tây (18k…)', goldKindCustom: 'Tự nhập giá',
      goldFactor: 'Hệ số giá (%)', goldCustomBuy: 'Giá mua vào /chỉ', goldPerLuong: '/lượng',
      updateGoldPrice: 'Cập nhật giá vàng', priceUpdatedAt: 'Giá lúc', priceStale: 'Giá có thể đã cũ',
      goldValueNow: 'Giá trị hiện tại',
      goldNoPrice: 'Chưa có giá cho loại vàng này — bấm "Cập nhật giá vàng" hoặc chọn Tự nhập giá.',
      goldBuyPrice: 'Giá mua lúc đầu /chỉ', goldBuyDate: 'Ngày mua',
      unrealizedPnl: 'Lãi/lỗ tạm tính', goldPnlTotal: 'Lãi/lỗ vàng (tạm tính)',
      goldBuyHint: 'Giá thực trả cho 1 chỉ khi mua (đã gồm chênh lệch mua–bán); mua nhiều đợt thì nhập giá trung bình.',
      goldSpreadHint: 'Định giá dùng giá tiệm MUA VÀO, còn lúc mua bạn trả giá BÁN RA — nên ngay sau khi mua thường lỗ nhẹ do chênh lệch, là bình thường.',
      goldPriceUpdated: 'Đã cập nhật giá vàng', goldPriceUpdateFailed: 'Không lấy được giá vàng — đang dùng giá đã lưu.',
      goldSchemaHint: 'Lưu ví thất bại: database thiếu cột mới của ví. Hãy chạy lại TOÀN BỘ supabase-schema.sql trong Supabase SQL Editor rồi thử lại.',
      walletAllowTx: 'Cho phép giao dịch trực tiếp',
      walletAllowTxHint: 'Tắt với ví lưu trữ (tiết kiệm, vàng…): ví sẽ không hiện trong form nhập giao dịch — muốn chi tiêu phải Chuyển ví sang ví khác trước. Số dư và báo cáo không đổi.',
      // Attachments (photo evidence)
      evidence: 'Bằng chứng', addPhoto: 'Thêm ảnh', uploading: 'Đang tải lên…',
      removePhoto: 'Xóa ảnh', confirmRemovePhoto: 'Xóa ảnh này?',
      photoUploadFailed: 'Tải ảnh thất bại', txSavedPhotoFailed: 'Đã lưu giao dịch nhưng tải ảnh thất bại — thử lại trong phần Sửa.',
      noEvidence: 'Chưa có bằng chứng', viewEvidence: 'Xem bằng chứng', photoUnsupported: 'Định dạng ảnh không hỗ trợ',
      maxPhotos: 'Tối đa {n} ảnh mỗi giao dịch', needNetworkPhoto: 'Cần kết nối mạng để tải ảnh', photoCount: '{n} ảnh', optional: 'tùy chọn',
      scanReceipt: 'Quét hoá đơn → tự điền', scanning: 'Đang quét…',
      ocrFailed: 'Quét hoá đơn thất bại', ocrNoAmount: 'Không đọc được số tiền — vui lòng kiểm tra & nhập tay.',
      ocrNeedKey: 'Cần API key (Gemini hoặc Claude) trong Cài đặt để quét hoá đơn.',
      ocrDone: 'Đã điền từ hoá đơn — kiểm tra lại trước khi lưu.',
      checkAmount: 'Đã điền — số tiền chưa chắc chắn, hãy kiểm tra kỹ trước khi lưu.',
      // Monthly close (chốt sổ)
      monthlyClose: 'Chốt sổ tháng', closeThisMonth: 'Chốt sổ {m}', reclose: 'Chốt lại',
      closedOn: 'Đã chốt ngày {d}', notClosedYet: 'Tháng này chưa được chốt sổ.', viewReport: 'Xem báo cáo',
      monthOverview: 'Tổng quan tháng', closeReport: 'Đóng',
      vsPrevMonth: 'So tháng trước', vs3mAvg: 'So TB 3 tháng',
      movers: 'Biến động lớn nhất', recurringDetected: 'Khoản định kỳ (cân nhắc)', wins: 'Điểm sáng',
      aiReviewTitle: '🤖 Nhận xét & đề xuất từ AI', genAiReview: 'Tạo nhận xét AI', closeGenerating: 'Đang tạo nhận xét…',
      aiNeedKey: 'Cần API key (Gemini hoặc Claude) trong Cài đặt để tạo nhận xét AI.',
      aiPrivacyNote: 'Chỉ số liệu tổng hợp (không gồm ghi chú từng giao dịch) được gửi tới dịch vụ AI.',
      aiFailed: 'Không tạo được nhận xét AI.', noAiReview: 'Chưa có nhận xét AI cho tháng này.',
      closeSaved: 'Đã chốt sổ tháng.', estSaving: 'Ước tính tiết kiệm',
      prioHigh: 'Ưu tiên cao', prioMedium: 'Trung bình', prioLow: 'Thấp',
      winSavingsUp: 'Tỷ lệ tiết kiệm cao hơn tháng trước 🎉', winBelowAvg: 'Chi thấp hơn trung bình 3 tháng.', winCatDown: 'Giảm chi ở {c}.',
      // Monthly email report
      emailReport: 'Báo cáo email hàng tháng', emailReportOn: 'Gửi báo cáo qua email',
      emailReportDesc: 'Tự gửi tổng kết tháng đã chốt sổ tới email các thành viên. Chưa chốt tới ngày gửi thì owner/admin được nhắc qua mail.',
      emailSendDay: 'Gửi vào ngày (1–28)', emailOnBadge: 'Bật',
      emailPrivacyNote: 'Báo cáo tài chính tổng hợp của hộ sẽ được gửi qua email tới mọi thành viên.',
      emailTestSend: 'Gửi thử', emailTestSent: 'Đã gửi email thử tới {e}.',
      emailNeedClose: 'Chưa có tháng nào được chốt sổ — hãy chốt sổ trước.',
      emailSaved: 'Đã lưu cài đặt email.',
      // Custom categories
      categories: 'Danh mục', addCategory: 'Thêm danh mục', catName: 'Tên danh mục',
      catHide: 'Ẩn', catShow: 'Hiện lại',
      catInUse: 'Danh mục đang có giao dịch — chỉ có thể ẩn.',
      confirmRenameCat: 'Đổi tên "{a}" thành "{b}"?\nMọi giao dịch, ngân sách, khoản định kỳ sẽ đổi theo. Báo cáo tháng đã chốt giữ tên cũ.',
      catSaved: 'Đã lưu danh mục.', catDuplicate: 'Tên danh mục đã tồn tại.',
      catsHint: 'Danh mục dùng chung cho cả hộ. AI phân loại giao dịch theo danh sách này. Danh mục đã dùng chỉ có thể ẩn, không xóa được.',
      catsSchemaHint: 'Cần chạy lại supabase-schema.sql để bật danh mục tùy chỉnh.',
      manageCats: 'Quản lý danh mục', catEmoji: 'Icon', catType: 'Loại',
      emojiPickTitle: 'Chọn biểu tượng', emojiCustom: 'Hoặc gõ emoji khác',
      emojiDefault: 'Dùng mặc định',
      // Storage usage
      storageUsage: 'Dung lượng', storageDb: 'Database', storageFiles: 'Ảnh hóa đơn (Storage)',
      storageFilesCount: '{n} ảnh',
      storageHint: 'Hạn mức theo gói Supabase Free (Database 500 MB, Storage 1 GB). Số chính thức kèm băng thông xem tại Supabase Dashboard → Usage.',
      storageUnavailable: 'Chưa đọc được dung lượng — hãy chạy lại supabase-schema.sql để tạo hàm get_storage_usage.',
    },
    en: {
      appName: 'Money Manager', overview: 'Overview', reports: 'Reports', add: 'Add', txs: 'Transactions', settings: 'Settings',
      income: 'Income', expense: 'Expense', balance: 'Current balance', savings: 'Savings', savingsRate: 'Savings rate',
      balanceAvail: 'Available balance', balanceTotal: 'Total balance',
      thisMonth: 'This month', remaining: 'Remaining', budget: 'Budget', spentToday: 'Spent today', avgPerDay: 'Avg / day',
      weekReview: 'This week review', vsLastWeek: 'vs last week',
      recent: 'Recent transactions', seeAll: 'See all', noTx: 'No transactions yet.', refresh: 'Refresh',
      addTx: 'Add transaction', placeholder: 'breakfast 35k, salary 15 million, gas 80k…',
      week: 'Week', month: 'Month', year: 'Year', byCategory: 'Spending by category', trend: 'Income & expense trend',
      budgetProgress: 'Budget progress', topSpending: 'Top spending', summary: 'Summary',
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', category: 'Category', note: 'Note', amount: 'Amount',
      date: 'Date', time: 'Time', today: 'Today', yesterday: 'Yesterday', pickDate: 'Pick date',
      wallets: 'Wallets / Accounts', wallet: 'Wallet', walletCash: 'Cash', addWallet: 'Add wallet',
      walletName: 'Wallet name', walletType: 'Type', openingBalance: 'Opening balance',
      setDefaultWallet: 'Set as default wallet', defaultWallet: 'Default wallet',
      typeCash: 'Cash', typeBank: 'Bank', typeEwallet: 'E-wallet', typeOther: 'Other',
      totalBalance: 'Total balance', walletSaved: 'Wallet saved', walletDeleted: 'Wallet deleted',
      confirmDeleteWallet: 'Delete this wallet? Past transactions are kept but will no longer be linked to a wallet.',
      noWallets: 'No wallets yet.', unassignedWallet: 'No wallet', needWalletName: 'Enter a wallet name.',
      transfer: 'Transfer', transferBetween: 'Transfer between wallets', fromWallet: 'From wallet', toWallet: 'To wallet',
      transferDone: 'Transfer done', needTwoWallets: 'You need at least 2 wallets to transfer.',
      sameWallet: 'Source and destination must differ.', needAmount: 'Enter an amount.',
      adjustBalance: 'Adjust balance', realBalance: 'Actual balance', balanceAdjustLabel: 'Balance adjustment',
      balanceAdjusted: 'Balance updated', adjustHint: 'The app records an adjustment for the difference.',
      walletHistory: 'Wallet history', balanceAfter: 'Balance after', noWalletHistory: 'No transactions in this wallet yet.',
      showBalance: 'Show balances', hideBalance: 'Hide balances',
      allCats: 'All categories', allTypes: 'Income & expense',
      budgetNotSet: 'No budget set yet.', noExpenseData: 'No expense data yet.',
      weekLabel: 'Week', moPrefix: 'M', dows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      errNotConfigured: 'Supabase is not configured (missing URL or anon key).',
      errLibNotLoaded: 'Could not load the Supabase library — check your connection.',
      errNotSignedIn: 'Not signed in.', errEnterCode: 'Please enter a household code.',
      errInvalidCode: 'Invalid or non-existent household code.', errReadHousehold: 'Could not read household info.',
      errNoHousehold: 'No household yet.', errNotMember: 'You do not belong to this household.',
      hhDefaultPrefix: 'Family of', me: 'me',
      saveBudget: 'Save budget', budgetSaved: 'Budget saved', language: 'Language', theme: 'Theme',
      connTitle: 'Supabase connection', supaUrl: 'Supabase URL', supaKey: 'Supabase anon key',
      anthropicKey: 'Claude API Key (optional)', saveConnect: 'Save & connect',
      geminiKey: 'Gemini API Key (free)', aiCategorize: 'AI auto-categorization',
      aiHint: '🤖 Add a key so AI infers the category from what you type. Gemini has a free tier — get a key at aistudio.google.com/app/apikey. Leave blank and the app still categorizes by keywords. Keys are stored in the household database — shared by every member and device.',
      aiSavedShared: 'Saved to the database — shared with the whole household on every device.',
      aiSavedLocal: 'The settings table does not exist yet (re-run supabase-schema.sql). Keys were saved in this browser for now.',
      supaWhyLocal: 'ℹ️ This section always stays on this device: the app needs the URL & anon key to connect to the database, so they cannot be read from it.',
      connSaved: 'Saved, connecting…', connOk: 'Connected', configMissing: 'Supabase not configured.',
      tokenHint: '🔒 Stored only in this browser (localStorage). The anon key is public; data is protected by Row Level Security.',
      // Auth
      signIn: 'Sign in', signUp: 'Sign up', signOut: 'Sign out', email: 'Email', password: 'Password',
      authWelcome: 'Sign in to manage your family budget', haveAccount: 'Have an account? Sign in',
      needAccount: 'No account? Create one', editConfig: 'Change Supabase config',
      signedUp: 'Account created. Confirm via email if required, then sign in.',
      authError: 'Auth error', fillEmailPass: 'Please enter email and password.',
      invalidCreds: 'Incorrect email or password.', emailNotConfirmed: 'Email not confirmed — check your inbox.',
      authRateLimit: 'Too many attempts. Please wait a moment and try again.', userExists: 'This email is already registered. Please sign in.',
      weakPassword: 'Password too short (minimum 6 characters).', invalidEmail: 'Invalid email address.',
      configIntro: 'Enter your Supabase info (Settings → API) to start.',
      // Household
      household: 'Household', householdName: 'Household name', inviteCode: 'Invite code (share with family)',
      copyCode: 'Copy code', copied: 'Copied', joinHousehold: 'Join another household', joinCodePh: 'Paste invite code here',
      join: 'Join', joined: 'Joined household', renameOk: 'Household renamed', account: 'Account',
      switchHousehold: 'Active household',
      grpAccount: 'Household & Account', grpMoney: 'Money', grpGeneral: 'General', grpAdvanced: 'Advanced',
      chooseLanguage: 'Choose language', darkMode: 'Dark mode',
      members: 'Members', roleOwner: 'Owner', roleAdmin: 'Admin', roleMember: 'Member', you: 'you', unknownMember: '(email unknown)',
      spentFor: 'Spent for', spentForShort: 'for', beneficiaryShared: 'Shared (whole family)', byBeneficiary: 'Spending by member',
      confirmRemoveMember: 'Remove this member from the household?', memberRemoved: 'Member removed',
      leaveHousehold: 'Leave this household', confirmLeave: 'Leave this household?', onlyOwnerRemove: 'Only the owner can remove members.',
      makeAdmin: 'Make admin', removeAdmin: 'Remove admin', makeOwner: 'Transfer ownership',
      confirmMakeAdmin: 'Make this member an admin? They will be able to manage budgets, wallets, goals, recurring entries and edit any transaction.',
      confirmRemoveAdmin: 'Remove this member’s admin rights?',
      confirmMakeOwner: 'Transfer ownership to this member? You will become an admin and this cannot be undone.',
      roleChanged: 'Role updated', ownerTransferred: 'Ownership transferred',
      ownerOnlyHint: 'Only the household owner or an admin can edit this.',
      ownerOnlyRename: 'Only the owner can rename the household.',
      noPermission: 'You do not have permission to do this.',
      cantEditOthersTx: 'Only the owner or an admin can edit/delete other members’ transactions.',
      activity: 'Activity log',
      activityHint: 'History of add / edit / delete actions by household members.',
      activityEmpty: 'No activity yet.',
      searchAct: 'Search by person, type, content…', activityDetail: 'Activity detail',
      noFieldChanges: 'No field changes.', noActMatch: 'No matching activity found.', role: 'Role',
      actAdd: 'added', actEdit: 'edited', actDel: 'deleted',
      entTransaction: 'transaction', entBudget: 'budget', entAccount: 'wallet',
      entGoal: 'goal', entRecurring: 'recurring entry', entMember: 'member', entHousehold: 'household',
      added: 'Added', deleted: 'Deleted', confirmDelete: 'Delete this transaction?',
      confirmEntries: 'Confirm transactions', saveAll: 'Save all', undo: 'Undo',
      unrecognizedLines: 'line(s) not recognized', maxEntries: 'Up to 20 entries at a time.',
      emptyInput: 'Please enter something.', cantParse: 'Could not detect amount.',
      warn80: 'Near budget limit', warn100: 'Over budget', parsing: 'Parsing…',
      synced: 'Synced ✓', syncError: 'Sync error', offline: 'Offline — will sync later', saving: 'Saving…',
      // Income vs expense tile (overview)
      netDiff: 'Income vs expense', netIncomeHigher: 'Earned more than spent', netExpenseHigher: 'Spent more than earned', netEven: 'Break even',
      // Reminders
      reminder: 'Logging reminder', reminderOn: 'Enable reminders', reminderTime: 'Reminder time',
      reminderHint: '🔔 At the set time, if you have not logged anything that day, the app reminds you when you open it. Notifications stay on this device and never include amounts.',
      reminderTitle: 'Sổ Thu Chi', reminderBody: "You haven't logged anything today — add a quick entry!",
      reminderKeepStreak: '🔥 Keep your {n}-day streak — log something today!',
      reminderEnabled: 'Reminders on', reminderDisabled: 'Reminders off',
      reminderDenied: 'Notifications are blocked — allow them in your browser settings.', reminderUnsupported: 'Notifications are not supported in this browser.',
      // Wrap-up & comparison
      wrapNoPrev: 'No previous period to compare.', wrapMore: 'Spent {n}% more than last period.',
      wrapLess: 'Spent {n}% less than last period.', wrapSame: 'About the same as last period.',
      wrapGood: '👏 You saved more — keep it up!', wrapWatch: '⚠️ Spending jumped — keep an eye on it.',
      wrapBiggest: 'Biggest',
      // Quick templates
      quickTemplates: 'Quick templates', addTemplate: 'Add template', templateName: 'Template name',
      noTemplates: 'No templates yet.', templatePrefix: 'Template: ',
      templatesHint: 'Create templates for frequent entries (parking, lunch…). On the Add page, one tap logs it instantly (with Undo). Templates are stored on this device.',
      // Auto insights & spending calendar
      insights: 'Insights', spendingCalendar: 'Spending calendar', less: 'Less', more: 'More',
      insMoreAvg: 'This month is {n}% above your recent average.',
      insLessAvg: 'This month is {n}% below your recent average.',
      insWeekend: 'You spend {n}× more on weekends than weekdays.',
      insCatJump: '{c} is up {n}% vs last month.',
      // Savings goals
      savingsGoals: 'Savings goals', addGoal: 'Add goal', goalName: 'Goal name',
      targetAmount: 'Target amount', linkedWallet: 'Savings wallet', dueDateOpt: 'Deadline (optional)',
      noGoals: 'No goals yet.', goalDone: 'Reached! 🎉',
      goalNeed: '{m} months left · {a}/mo', goalDueSoon: 'due soon',
      goalsHint: 'Link a goal to a Savings wallet — progress tracks that wallet balance. Leave the wallet empty to just note a target.',
      goalNone: '— No wallet —',
      // Recurring
      recurring: 'Recurring', addRecurring: 'Add recurring', recurringName: 'Name',
      dayOfMonth: 'Day of month', noRecurring: 'No recurring items.',
      recurringHint: 'The app logs this every month on the chosen day (when you open the app). Great for rent, internet, subscriptions…',
      recurringCreated: 'Auto-logged {n} recurring item(s)', recurringPrefix: 'Recurring: ',
      // Trends & forecast
      trendForecast: 'Trends & Forecast', actualLabel: 'Actual', trendLabel: 'Moving average', forecastLabel: 'Forecast',
      forecastNote: '🔮 Estimate based on recent months — for reference only.',
      needMoreData: 'Need at least 4 months of data to forecast.', spikeMonth: 'Unusual spending spike',
      trendEmpty: 'Not enough data to show monthly trends yet — need at least 2 months with spending.',
      projectedOverspend: 'Projected to overspend', perMonth: '/mo',
      // Net worth / assets & liabilities
      netWorth: 'Net Worth', netWorthNow: 'Current', totalAssets: 'Total assets', totalLiabilities: 'Total liabilities',
      assets: 'Assets', liabilities: 'Liabilities', noAccountsNw: 'Add a wallet / account to see your net worth.',
      typeSavings: 'Savings', typeCredit: 'Credit card', typeLoan: 'Loan',
      creditLimit: 'Credit limit', statementDay: 'Statement day', dueDay: 'Due day',
      utilization: 'Utilization', minPayment: 'Min. payment', dueDate: 'Due', owed: 'Owed',
      dueInDays: 'in {n} days', dueTodayLabel: 'due today',
      liabilityHint: 'For credit cards / loans: enter a negative balance if you owe (e.g. −4,500,000). Limit and statement/due days are optional.',
      // Gold wallets
      typeGold: 'Gold',
      goldWeight: 'Weight', unitChi: 'chỉ', unitLuong: 'lượng',
      goldKind: 'Gold kind', goldKindSjc: 'SJC bullion', goldKindRing: '9999 ring (24k)',
      goldKindJewelry: 'Jewelry gold (18k…)', goldKindCustom: 'Custom price',
      goldFactor: 'Price factor (%)', goldCustomBuy: 'Buy-back price /chỉ', goldPerLuong: '/lượng',
      updateGoldPrice: 'Update gold price', priceUpdatedAt: 'Price as of', priceStale: 'Price may be stale',
      goldValueNow: 'Current value',
      goldNoPrice: 'No price for this kind yet — tap "Update gold price" or pick Custom price.',
      goldBuyPrice: 'Avg. buy price /chỉ', goldBuyDate: 'Purchase date',
      unrealizedPnl: 'Unrealized P&L', goldPnlTotal: 'Gold P&L (unrealized)',
      goldBuyHint: 'What you actually paid per chỉ (includes the buy/sell spread); for several purchases enter the average.',
      goldSpreadHint: 'Valuation uses the dealer BUY-BACK price while you bought at the SELL price, so a small loss right after buying is normal (the spread).',
      goldPriceUpdated: 'Gold prices updated', goldPriceUpdateFailed: 'Could not fetch gold prices — using saved prices.',
      goldSchemaHint: 'Save failed: the database is missing newer wallet columns. Re-run the ENTIRE supabase-schema.sql in the Supabase SQL Editor, then try again.',
      walletAllowTx: 'Allow direct transactions',
      walletAllowTxHint: 'Turn off for storage wallets (savings, gold…): the wallet disappears from entry forms — spending requires a wallet transfer first. Balances and reports are unchanged.',
      // Attachments (photo evidence)
      evidence: 'Evidence', addPhoto: 'Add photo', uploading: 'Uploading…',
      removePhoto: 'Remove photo', confirmRemovePhoto: 'Remove this photo?',
      photoUploadFailed: 'Photo upload failed', txSavedPhotoFailed: 'Transaction saved, but the photo failed to upload — try again from Edit.',
      noEvidence: 'No evidence yet', viewEvidence: 'View evidence', photoUnsupported: 'Unsupported image format',
      maxPhotos: 'Up to {n} photos per transaction', needNetworkPhoto: 'You need a connection to upload photos', photoCount: '{n} photos', optional: 'optional',
      scanReceipt: 'Scan receipt → auto-fill', scanning: 'Scanning…',
      ocrFailed: 'Receipt scan failed', ocrNoAmount: 'Couldn’t read the amount — please check & enter it manually.',
      ocrNeedKey: 'A Gemini or Claude API key (in Settings) is required to scan receipts.',
      ocrDone: 'Filled from the receipt — review before saving.',
      checkAmount: 'Filled — the amount is uncertain, double-check it before saving.',
      // Monthly close
      monthlyClose: 'Monthly close', closeThisMonth: 'Close {m}', reclose: 'Re-close',
      closedOn: 'Closed on {d}', notClosedYet: 'This month has not been closed yet.', viewReport: 'View report',
      monthOverview: 'Month overview', closeReport: 'Close',
      vsPrevMonth: 'vs last month', vs3mAvg: 'vs 3-mo avg',
      movers: 'Biggest movers', recurringDetected: 'Recurring items (review)', wins: 'Wins',
      aiReviewTitle: '🤖 AI review & suggestions', genAiReview: 'Generate AI review', closeGenerating: 'Generating…',
      aiNeedKey: 'A Gemini or Claude API key (in Settings) is required for AI review.',
      aiPrivacyNote: 'Only aggregated figures (no per-transaction notes) are sent to the AI service.',
      aiFailed: 'Could not generate AI review.', noAiReview: 'No AI review for this month yet.',
      closeSaved: 'Month closed.', estSaving: 'Est. saving',
      prioHigh: 'High', prioMedium: 'Medium', prioLow: 'Low',
      winSavingsUp: 'Savings rate up vs last month 🎉', winBelowAvg: 'Spending below the 3-month average.', winCatDown: 'Lower spending on {c}.',
      // Monthly email report
      emailReport: 'Monthly email report', emailReportOn: 'Send report by email',
      emailReportDesc: 'Emails the closed monthly summary to all members. If the month is not closed by the send day, owners/admins get a reminder instead.',
      emailSendDay: 'Send on day (1–28)', emailOnBadge: 'On',
      emailPrivacyNote: 'The household’s aggregated financial report will be emailed to all members.',
      emailTestSend: 'Send test', emailTestSent: 'Test email sent to {e}.',
      emailNeedClose: 'No closed month yet — close a month first.',
      emailSaved: 'Email settings saved.',
      // Custom categories
      categories: 'Categories', addCategory: 'Add category', catName: 'Name',
      catHide: 'Hide', catShow: 'Unhide',
      catInUse: 'This category has transactions — it can only be hidden.',
      confirmRenameCat: 'Rename "{a}" to "{b}"?\nAll transactions, budgets and recurring items will follow. Closed monthly reports keep the old name.',
      catSaved: 'Categories saved.', catDuplicate: 'Category name already exists.',
      catsHint: 'Categories are shared by the whole household. The AI classifies entries against this list. Categories in use can only be hidden, not deleted.',
      catsSchemaHint: 'Re-run supabase-schema.sql to enable custom categories.',
      manageCats: 'Manage categories', catEmoji: 'Icon', catType: 'Type',
      emojiPickTitle: 'Pick an icon', emojiCustom: 'Or type another emoji',
      emojiDefault: 'Use default',
      // Storage usage
      storageUsage: 'Storage', storageDb: 'Database', storageFiles: 'Receipt photos (Storage)',
      storageFilesCount: '{n} photos',
      storageHint: 'Limits shown are the Supabase Free plan (500 MB database, 1 GB storage). Official numbers incl. bandwidth: Supabase Dashboard → Usage.',
      storageUnavailable: 'Could not read usage — re-run supabase-schema.sql to create get_storage_usage.',
    },
  };
  let lang = localStorage.getItem('lang') || 'vi';
  function t(k) { return (I18N[lang] && I18N[lang][k]) || k; }
  window.t = t; // expose so store.js / charts.js can localize their messages

  // Category display labels per language (the underlying value stays canonical Vietnamese).
  const CAT_LABELS = {
    vi: {},
    en: {
      'Ăn uống': 'Food & Drink', 'Di chuyển': 'Transport', 'Mua sắm': 'Shopping',
      'Giải trí': 'Entertainment', 'Sức khỏe': 'Health', 'Hóa đơn': 'Bills',
      'Thu nhập': 'Income', 'Khác': 'Other',
    },
  };
  function catLabel(c) { return (CAT_LABELS[lang] && CAT_LABELS[lang][c]) || c; }

  /* ============== State ============== */
  let DATA = { household: null, budgets: {}, transactions: [], accounts: [], goals: [], recurring: [], attachments: [] };
  let attachByTx = {}; // { [transactionId]: [attachment] } — rebuilt each render
  let authMode = 'login'; // 'config' | 'login'
  let authIsSignup = false;
  let currentUserEmail = '';
  let currentUserId = '';
  let myHouseholds = []; // [{id, name}] households the user belongs to
  let householdMembers = []; // [{userId, email, role}] members of the household being viewed
  let myRole = 'member'; // current user's role in the active household: 'owner' | 'admin' | 'member'
  let activityLog = [];      // [{userEmail, action, entity, summary, createdAt}] — lazy-loaded for the Activity page
  let activityLoading = false;
  let activitySearch = '';   // client-side filter text for the Activity page
  let storageUsage = null;   // {dbBytes, receiptsBytes, receiptsFiles} — lazy-loaded for the Storage page
  let storageLoading = false;
  let catsSeedPending = false; // first open of the Categories page: seeding defaults into the DB
  let currentTab = 'overview';
  let settingsPage = null; // Settings sub-page key (null = root grouped menu)
  // Category source of truth: the household's registry (DATA.categories) when it
  // has rows; otherwise the built-in defaults — so the app works unchanged before
  // supabase-schema.sql is re-run. Names (text) remain the identity keys.
  const DEFAULT_CATS = window.Parser.CATEGORIES.map((n) => ({
    name: n, type: n === 'Thu nhập' ? 'income' : 'expense', emoji: null,
    archived: false, isSystem: n === 'Thu nhập',
  }));
  function catList() {  // full objects, active-only, sorted (registry or defaults)
    const rows = (DATA.categories || []).filter((c) => !c.archived);
    return rows.length ? rows : DEFAULT_CATS;
  }
  function cats(type) { // just the names; type: 'expense' | 'income' | undefined = all
    return catList().filter((c) => !type || c.type === type).map((c) => c.name);
  }
  // Push the live list into the parser (AI prompts + validation follow it).
  function syncParserCategories() {
    window.Parser.setCategories(catList().map((c) => ({ name: c.name, type: c.type })));
  }
  // <option> list for a category select. Keeps the row's CURRENT category in the
  // list even when it has been archived — otherwise opening the editor would
  // silently reassign the row to whatever option happened to be first.
  function catOptionsFor(current) {
    const list = cats();
    const all = (current && list.indexOf(current) < 0) ? [current].concat(list) : list;
    return all.map((c) => '<option value="' + esc(c) + '"' + (c === current ? ' selected' : '') + '>' + esc(catLabel(c)) + '</option>').join('');
  }
  // Filters (transactions tab)
  let filterMonth = monthKey(new Date());
  let filterCategory = '';
  let filterType = '';
  // Reports
  let reportPeriod = 'month'; // week | month | year
  let reportAnchor = new Date();

  const fmtVND = window.Charts.fmtVND;
  const fmtShort = window.Charts.fmtShort;

  /* ============== Money inputs ==============
   * Amount fields use type="text" + class="js-money": only digits are kept and
   * thousand separators ("." vi-VN) are inserted live while typing. Read the raw
   * integer back with readMoney(); render an initial value with groupMoney(). */
  function readMoney(elOrStr) {
    const s = typeof elOrStr === 'string' ? elOrStr : (elOrStr && elOrStr.value) || '';
    return Math.round(Number(String(s).replace(/\D/g, '')) || 0);
  }
  function groupMoney(v) {
    const d = String(v == null ? '' : v).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
  }
  // One delegated listener formats every .js-money field, including re-rendered views.
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('js-money')) return;
    const start = el.selectionStart, before = el.value;
    el.value = groupMoney(before);
    // Keep the caret roughly in place after separators shift the text.
    if (el.selectionStart != null) {
      const diff = el.value.length - before.length;
      const pos = Math.max(0, (start || 0) + diff);
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    }
  });

  // Privacy: hide balances/amounts behind dots until the user taps the eye icon. Default: hidden.
  let hideAmounts = (localStorage.getItem('hideAmounts') || '1') === '1';
  function mask(str) { return hideAmounts ? '••••••' : str; }
  // The two hero figures reveal INDEPENDENTLY (own eye each) — tapping one eye
  // no longer unmasks everything at once. hideAmounts keeps governing the rest.
  let hideBalAvail = (localStorage.getItem('hideBalAvail') || '1') === '1';
  let hideBalTotal = (localStorage.getItem('hideBalTotal') || '1') === '1';

  // Display name of whoever entered a transaction (from tx.userId → household member).
  function memberName(uid) {
    if (uid && uid === currentUserId) return t('you');
    const m = householdMembers.find((x) => x.userId === uid);
    if (m && m.email) return m.email.split('@')[0];
    return t('unknownMember');
  }

  /* ============== Permissions (role-based) ==============
   * Source of truth = the current user's row in household_members (role column),
   * with a fallback to the household creator being the owner. Mirrors the RLS
   * policies in supabase-schema.sql — the UI only hides what the server also blocks. */
  function computeMyRole() {
    const m = householdMembers.find((x) => x.userId === currentUserId);
    if (m && m.role) return m.role;
    if (DATA.household && DATA.household.createdBy && DATA.household.createdBy === currentUserId) return 'owner';
    return 'member';
  }
  function iAmOwner() { return myRole === 'owner'; }
  // Owners and admins can manage the household's shared config + edit any transaction.
  function canManageConfig() { return myRole === 'owner' || myRole === 'admin'; }
  // A member may edit/delete only their own transactions; managers may edit any.
  function canEditTx(tx) { return canManageConfig() || (!!tx && !!tx.userId && tx.userId === currentUserId); }
  function roleLabel(role) { return role === 'owner' ? t('roleOwner') : (role === 'admin' ? t('roleAdmin') : t('roleMember')); }

  /* ============== Date helpers ============== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x; }
  function endOfWeek(d) { const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); return e; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  // Whole days from today until a "YYYY-MM-DD" date (negative = already past).
  function daysUntil(ymdStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(ymdStr + 'T00:00:00') - today) / 86400000);
  }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  }

  /* ============== Aggregations ============== */
  // Balance-reconciliation entries: a normal income/expense whose only purpose is to snap a
  // wallet's balance to reality. They MUST stay in balance math (accountBalance/allTimeBalance)
  // but are excluded from every spending/income report so reconciliations don't distort stats.
  const ADJUST_CATEGORY = '__balance_adjust__';
  function isAdjust(tx) { return !!tx && tx.category === ADJUST_CATEGORY; }
  function inRange(s, e) { const a = ymd(s), b = ymd(e); return DATA.transactions.filter((tx) => tx.date >= a && tx.date <= b); }
  function totals(txs) {
    let income = 0, expense = 0;
    txs.forEach((tx) => {
      if (isAdjust(tx)) return;                         // balance adjustments aren't real income/expense
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
      // transfers move money between wallets — neither income nor expense
    });
    return { income, expense, net: income - expense };
  }
  function byCategory(txs) {
    const o = {};
    txs.forEach((tx) => { if (tx.type === 'expense' && !isAdjust(tx)) o[tx.category] = (o[tx.category] || 0) + tx.amount; });
    return o;
  }
  // Net of every transaction ever (for total balance). Includes balance adjustments (they DO
  // move money) but not transfers (net zero) — kept independent of totals() on purpose.
  function allTimeBalance() {
    let net = 0;
    DATA.transactions.forEach((tx) => {
      if (tx.type === 'income') net += tx.amount;
      else if (tx.type === 'expense') net -= tx.amount;
    });
    return net;
  }
  function totalBudget() { return Object.values(DATA.budgets).reduce((a, b) => a + (b || 0), 0); }

  /* ============== Streak & reminders ============== */
  // Consecutive days with at least one logged transaction, ending today (or
  // yesterday if today isn't logged yet — the streak is still "alive").
  function computeStreak() {
    const set = new Set(DATA.transactions.map((tx) => tx.date));
    const loggedToday = set.has(ymd(new Date()));
    let current = 0;
    let cursor = loggedToday ? new Date()
      : (set.has(ymd(addDays(new Date(), -1))) ? addDays(new Date(), -1) : null);
    while (cursor && set.has(ymd(cursor))) { current++; cursor = addDays(cursor, -1); }
    // Longest consecutive run across all history.
    let longest = 0, run = 0, prev = '';
    Array.from(set).sort().forEach((d) => {
      run = (prev && ymd(addDays(new Date(prev + 'T00:00:00'), 1)) === d) ? run + 1 : 1;
      if (run > longest) longest = run;
      prev = d;
    });
    return { current: current, longest: longest, loggedToday: loggedToday };
  }
  // Reminder config (localStorage). Notifications are LOCAL only (no server push):
  // they appear when you open/return to the app after the set time if not logged.
  function getReminderCfg() {
    try { return Object.assign({ enabled: false, time: '20:00' }, JSON.parse(localStorage.getItem('mm_reminder') || '{}')); }
    catch (e) { return { enabled: false, time: '20:00' }; }
  }
  function setReminderCfg(c) { try { localStorage.setItem('mm_reminder', JSON.stringify(c)); } catch (e) { /* ignore */ } }
  function getLastNotified() { try { return localStorage.getItem('mm_reminder_last') || ''; } catch (e) { return ''; } }
  function setLastNotified(d) { try { localStorage.setItem('mm_reminder_last', d); } catch (e) { /* ignore */ } }

  async function toggleReminder() {
    const cfg = getReminderCfg();
    if (!cfg.enabled) {
      if (!('Notification' in window)) { toast(t('reminderUnsupported'), 'warn'); return; }
      let perm = Notification.permission;
      if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
      if (perm !== 'granted') { toast(t('reminderDenied'), 'warn'); render(); return; }
      cfg.enabled = true; setReminderCfg(cfg); toast(t('reminderEnabled'), 'success');
    } else {
      cfg.enabled = false; setReminderCfg(cfg); toast(t('reminderDisabled'), 'info');
    }
    render();
  }

  async function showLocalNotification(title, body) {
    const opts = { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'sotc-reminder', lang: lang };
    // Prefer the service worker (so a tap can focus the app); fall back to a page Notification.
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      try { const reg = await navigator.serviceWorker.ready; await reg.showNotification(title, opts); return; }
      catch (e) { /* fall through */ }
    }
    try { new Notification(title, opts); } catch (e) { /* ignore */ }
  }
  // Fire a gentle reminder at most once per day, only after the set time and only if not logged.
  function maybeNotify() {
    const cfg = getReminderCfg();
    if (!cfg.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date(), today = ymd(now);
    if (getLastNotified() === today) return;
    const parts = (cfg.time || '20:00').split(':');
    const hh = parseInt(parts[0], 10) || 0, mm = parseInt(parts[1], 10) || 0;
    if (now.getHours() < hh || (now.getHours() === hh && now.getMinutes() < mm)) return;
    const s = computeStreak();
    if (s.loggedToday) return;
    setLastNotified(today);
    const body = s.current > 0 ? t('reminderKeepStreak').replace('{n}', s.current) : t('reminderBody');
    showLocalNotification(t('reminderTitle'), body);
  }

  /* ============== Quick templates (per-device, localStorage) ============== */
  function templatesKey() { return 'mm_templates_' + (DATA.household ? DATA.household.id : ''); }
  function getTemplates() {
    try { const a = JSON.parse(localStorage.getItem(templatesKey()) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function setTemplates(list) { try { localStorage.setItem(templatesKey(), JSON.stringify(list)); } catch (e) { /* ignore */ } }

  // Tap a template → log it immediately for today (with an Undo bar).
  async function addFromTemplate(id) {
    const tp = getTemplates().find((x) => x.id === id); if (!tp) return;
    const accountId = defaultAccountId() || '';
    const draft = {
      date: ymd(new Date()), time: new Date().toTimeString().slice(0, 5),
      rawInput: t('templatePrefix') + tp.label,
      amount: Math.round(tp.amount), type: tp.type === 'income' ? 'income' : 'expense',
      category: tp.category, note: tp.note || tp.label, accountId: accountId || null,
    };
    await saveDrafts([draft], accountId, { undo: true });
  }

  // Tappable chips on the Add page.
  function templateChipsHtml() {
    const tpls = getTemplates();
    if (!tpls.length) return '';
    return '<div class="section-title">' + t('quickTemplates') + '</div>' +
      '<div class="tpl-chips">' + tpls.map((tp) =>
        '<button class="tpl-chip" data-usetpl="' + esc(tp.id) + '">' + catIcon(tp.category) +
        '<span class="tpl-name">' + esc(tp.label) + '</span>' +
        '<span class="tpl-amt">' + (tp.type === 'income' ? '+' : '−') + fmtShort(tp.amount) + '</span></button>').join('') +
      '</div>';
  }

  // Editor row + editor (Settings → Quick templates).
  function templateEditRowHtml(tp) {
    const x = tp || { id: '', label: '', amount: '', type: 'expense', category: 'Ăn uống', note: '' };
    const catOpts = catOptionsFor(x.category);
    const typeOpts = '<option value="expense"' + (x.type !== 'income' ? ' selected' : '') + '>' + t('expense') + '</option>' +
      '<option value="income"' + (x.type === 'income' ? ' selected' : '') + '>' + t('income') + '</option>';
    return '<div class="tpl-edit-row" data-tpl="' + esc(x.id) + '">' +
      '<div class="tpl-edit-l1">' +
      '<input type="text" class="tp-label" value="' + esc(x.label) + '" placeholder="' + t('templateName') + '"/>' +
      (tp ? '<button type="button" class="icon-btn danger" data-deltpl="1" title="' + t('delete') + '">' + icon('trash') + '</button>' : '') +
      '</div>' +
      '<div class="tpl-edit-l2">' +
      '<input type="text" inputmode="numeric" class="tp-amount js-money" value="' + groupMoney(x.amount) + '" placeholder="' + t('amount') + '"/>' +
      '<select class="tp-type">' + typeOpts + '</select>' +
      '<select class="tp-cat">' + catOpts + '</select>' +
      '</div></div>';
  }
  function templatesEditorHtml() {
    const tpls = getTemplates();
    const rows = tpls.length ? tpls.map(templateEditRowHtml).join('') : '<div class="empty">' + t('noTemplates') + '</div>';
    return '<div class="tpl-edit" id="tplEdit">' + rows + '</div>' +
      '<div class="wallet-edit-actions">' +
      '<button id="addTplBtn" class="ghost-btn">' + icon('plus') + ' ' + t('addTemplate') + '</button>' +
      '<button id="saveTplBtn" class="primary-btn">' + icon('check') + ' ' + t('save') + '</button></div>';
  }

  // Recent distinct raw inputs → quick-add autocomplete (datalist).
  function inputSuggestions() {
    const seen = new Set(), out = [];
    for (const tx of DATA.transactions) {
      if (tx.type === 'transfer') continue;
      const v = (tx.rawInput || '').trim(); if (!v) continue;
      const k = v.toLowerCase(); if (seen.has(k)) continue;
      seen.add(k); out.push(v);
      if (out.length >= 15) break;
    }
    return out;
  }

  /* ============== Savings goals ============== */
  // Progress = balance of the linked savings wallet (0 if unlinked).
  function goalSaved(g) { return g.accountId ? accountBalance(g.accountId) : 0; }
  function goalEta(g, saved) {
    if (g.targetAmount > 0 && saved >= g.targetAmount) return { done: true, text: t('goalDone') };
    if (!g.dueDate) return { done: false, text: '' };
    const now = new Date();
    const due = new Date(g.dueDate + 'T00:00:00');
    const months = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());
    if (months <= 0) return { done: false, text: t('goalDueSoon') };
    const perMonth = Math.ceil(Math.max(0, g.targetAmount - saved) / months);
    return { done: false, text: t('goalNeed').replace('{m}', months).replace('{a}', fmtShort(perMonth)) };
  }
  function goalCardHtml(g) {
    const saved = goalSaved(g);
    const pct = g.targetAmount > 0 ? Math.min(100, Math.round(saved / g.targetAmount * 100)) : 0;
    const eta = goalEta(g, saved);
    return '<div class="goal-card">' +
      '<div class="goal-top"><span class="goal-name">' + icon('target') + ' ' + esc(g.name) + '</span>' +
      '<span class="goal-pct' + (eta.done ? ' done' : '') + '">' + pct + '%</span></div>' +
      '<div class="goal-track"><div class="goal-fill' + (eta.done ? ' done' : '') + '" style="width:' + pct + '%"></div></div>' +
      '<div class="goal-meta"><span>' + mask(fmtShort(saved)) + ' / ' + fmtShort(g.targetAmount) + '</span>' +
      (eta.text ? '<span class="goal-eta">' + eta.text + '</span>' : '') + '</div></div>';
  }
  function goalsSectionHtml() {
    const goals = DATA.goals || [];
    if (!goals.length) return '';
    return '<div class="section-title">' + t('savingsGoals') + '</div>' +
      '<div class="goal-list">' + goals.map(goalCardHtml).join('') + '</div>';
  }
  function goalEditRowHtml(g) {
    const x = g || { id: '', name: '', targetAmount: '', accountId: '', dueDate: '' };
    const acctOpts = '<option value="">' + t('goalNone') + '</option>' +
      activeAccounts().map((a) => '<option value="' + esc(a.id) + '"' + (a.id === x.accountId ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('');
    return '<div class="goal-edit-row" data-goal="' + esc(x.id) + '">' +
      '<div class="goal-edit-l1"><input type="text" class="g-name" value="' + esc(x.name) + '" placeholder="' + t('goalName') + '"/>' +
      (g ? '<button type="button" class="icon-btn danger" data-delgoal="' + esc(x.id) + '" title="' + t('delete') + '">' + icon('trash') + '</button>' : '') + '</div>' +
      '<div class="goal-edit-l2">' +
      '<input type="text" inputmode="numeric" class="g-target js-money" value="' + groupMoney(x.targetAmount) + '" placeholder="' + t('targetAmount') + '"/>' +
      '<select class="g-acct">' + acctOpts + '</select></div>' +
      '<div class="goal-edit-l3"><label>' + t('dueDateOpt') + '</label><input type="date" class="g-due" value="' + esc(x.dueDate || '') + '"/></div>' +
      '</div>';
  }
  function goalsEditorHtml() {
    const goals = DATA.goals || [];
    const rows = goals.length ? goals.map(goalEditRowHtml).join('') : '<div class="empty">' + t('noGoals') + '</div>';
    return '<div class="goal-edit" id="goalEdit">' + rows + '</div>' +
      '<div class="wallet-edit-actions">' +
      '<button id="addGoalBtn" class="ghost-btn">' + icon('plus') + ' ' + t('addGoal') + '</button>' +
      '<button id="saveGoalsBtn" class="primary-btn">' + icon('target') + ' ' + t('save') + '</button></div>';
  }

  /* ============== Recurring entries ============== */
  // Advance a "YYYY-MM-DD" by one period (monthly clamps to the chosen day-of-month).
  function advanceRecur(freq, dateStr, day) {
    const d = new Date(dateStr + 'T00:00:00');
    if (freq === 'weekly') { d.setDate(d.getDate() + 7); return ymd(d); }
    const y = d.getFullYear(), m = d.getMonth();
    const ny = m === 11 ? y + 1 : y, nm = (m + 1) % 12;
    const last = new Date(ny, nm + 1, 0).getDate();
    return ymd(new Date(ny, nm, Math.min(day || d.getDate(), last)));
  }
  // First occurrence on/after today for a given day-of-month.
  function nextOccurrence(day) {
    const now = new Date();
    const last = endOfMonth(now).getDate();
    const target = ymd(new Date(now.getFullYear(), now.getMonth(), Math.min(day, last)));
    return target < ymd(now) ? advanceRecur('monthly', target, day) : target;
  }
  // On app open: create any due recurring transactions, then advance their next_run.
  // The recurring_id tag + an in-memory dup check prevent creating the same one twice.
  async function runRecurring() {
    const list = DATA.recurring || [];
    if (!list.length) return;
    const today = ymd(new Date());
    let created = 0;
    for (const r of list) {
      if (!r.active) continue;
      let next = r.nextRun, guard = 0;
      while (next && next <= today && guard < 24) {
        guard++;
        const dup = DATA.transactions.some((tx) => tx.recurringId === r.id && tx.date === next);
        if (!dup) {
          try {
            const saved = await window.Store.addTransaction({
              date: next, time: '', amount: r.amount, type: r.type, category: r.category,
              note: r.name, accountId: r.accountId, recurringId: r.id, rawInput: t('recurringPrefix') + r.name,
            });
            DATA.transactions.unshift(saved); created++;
          } catch (e) { break; }
        }
        next = advanceRecur(r.freq, next, r.day);
      }
      if (next !== r.nextRun) { try { await window.Store.updateRecurring(r.id, { nextRun: next }); r.nextRun = next; } catch (e) { /* ignore */ } }
    }
    if (created) { toast(t('recurringCreated').replace('{n}', created), 'info'); render(); }
  }

  function recurringEditRowHtml(r) {
    const x = r || { id: '', name: '', amount: '', type: 'expense', category: 'Hóa đơn', accountId: '', day: 1 };
    const catOpts = catOptionsFor(x.category);
    const typeOpts = '<option value="expense"' + (x.type !== 'income' ? ' selected' : '') + '>' + t('expense') + '</option>' +
      '<option value="income"' + (x.type === 'income' ? ' selected' : '') + '>' + t('income') + '</option>';
    // Recurring items create transactions → offer tx-able wallets only, but keep
    // the row's current wallet listed even if its allowTx switch was turned off.
    let recAccs = txAccounts();
    const curAcc = x.accountId ? accountById(x.accountId) : null;
    if (curAcc && !recAccs.some((a) => a.id === curAcc.id)) recAccs = [curAcc].concat(recAccs);
    const acctOpts = '<option value="">' + t('goalNone') + '</option>' +
      recAccs.map((a) => '<option value="' + esc(a.id) + '"' + (a.id === x.accountId ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('');
    return '<div class="rec-edit-row" data-rec="' + esc(x.id) + '">' +
      '<div class="rec-edit-l1"><input type="text" class="r-name" value="' + esc(x.name) + '" placeholder="' + t('recurringName') + '"/>' +
      (r ? '<button type="button" class="icon-btn danger" data-delrec="' + esc(x.id) + '" title="' + t('delete') + '">' + icon('trash') + '</button>' : '') + '</div>' +
      '<div class="rec-edit-l2">' +
      '<input type="text" inputmode="numeric" class="r-amount js-money" value="' + groupMoney(x.amount) + '" placeholder="' + t('amount') + '"/>' +
      '<select class="r-type">' + typeOpts + '</select>' +
      '<select class="r-cat">' + catOpts + '</select></div>' +
      '<div class="rec-edit-l3">' +
      '<label class="rec-day">' + t('dayOfMonth') + '<input type="number" min="1" max="31" class="r-day" value="' + (x.day || 1) + '"/></label>' +
      '<select class="r-acct">' + acctOpts + '</select></div>' +
      '</div>';
  }
  function recurringEditorHtml() {
    const list = DATA.recurring || [];
    const rows = list.length ? list.map(recurringEditRowHtml).join('') : '<div class="empty">' + t('noRecurring') + '</div>';
    return '<div class="rec-edit" id="recEdit">' + rows + '</div>' +
      '<div class="wallet-edit-actions">' +
      '<button id="addRecBtn" class="ghost-btn">' + icon('plus') + ' ' + t('addRecurring') + '</button>' +
      '<button id="saveRecBtn" class="primary-btn">' + icon('refresh') + ' ' + t('save') + '</button></div>';
  }

  /* ============== Accounts (wallets) ============== */
  const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'savings', 'gold', 'credit_card', 'loan', 'other'];
  // Credit card & loan accounts are liabilities (money you owe); everything else is an asset.
  const LIABILITY_TYPES = ['credit_card', 'loan'];
  const ACCOUNT_TYPE_META = {
    cash: { icon: 'wallet', key: 'typeCash' },
    bank: { icon: 'bank', key: 'typeBank' },
    ewallet: { icon: 'phone', key: 'typeEwallet' },
    savings: { icon: 'piggy', key: 'typeSavings' },
    gold: { icon: 'gold', key: 'typeGold' },
    credit_card: { icon: 'card', key: 'typeCredit' },
    loan: { icon: 'file', key: 'typeLoan' },
    other: { icon: 'more', key: 'typeOther' },
  };
  const GOLD_KINDS = ['sjc', 'ring9999', 'jewelry', 'custom'];
  const GOLD_KIND_KEY = { sjc: 'goldKindSjc', ring9999: 'goldKindRing', jewelry: 'goldKindJewelry', custom: 'goldKindCustom' };
  function goldKindLabel(kind) { return t(GOLD_KIND_KEY[kind] || 'goldKindCustom'); }
  function accountTypeIcon(type) { return icon((ACCOUNT_TYPE_META[type] || ACCOUNT_TYPE_META.other).icon); }
  function accountTypeLabel(type) { return t((ACCOUNT_TYPE_META[type] || ACCOUNT_TYPE_META.other).key); }
  // An account's class: explicit `class` if set, else inferred from its type.
  function accountClass(acc) { return acc.class || (LIABILITY_TYPES.includes(acc.type) ? 'liability' : 'asset'); }
  function activeAccounts() { return (DATA.accounts || []).filter((a) => !a.archived); }
  // Wallets that can hold transactions — everything except gold, which is a
  // valuation-only asset (v1). This is the TRANSFER list (moving money out of a
  // storage wallet must stay possible); keep activeAccounts() for net worth & settings.
  function spendableAccounts() { return activeAccounts().filter((a) => a.type !== 'gold'); }
  // Wallets offered in the ENTRY forms (add/edit/recurring). Each wallet has a
  // user-set allowTx switch — storage wallets (e.g. savings) turn it off so
  // spending from them requires an explicit transfer first. Not hardcoded by type.
  function txAccounts() { return spendableAccounts().filter((a) => a.allowTx !== false); }
  function accountById(id) { return (DATA.accounts || []).find((a) => a.id === id) || null; }

  /* ---- Gold wallets: value = weight (chỉ) × market buy-back price × factor ---- */
  // Market buy-back price per chỉ for this wallet's kind (custom = user-entered).
  function goldBuyPerChi(acc) {
    if (acc.goldKind === 'custom') return acc.goldCustomBuy || 0;
    const p = (DATA.goldPrices || {})[acc.goldKind];
    return p ? p.buyPerChi : 0;
  }
  function goldValue(acc) {
    return Math.round((acc.goldWeightChi || 0) * goldBuyPerChi(acc) * (acc.goldFactor || 1));
  }
  // Cost basis = weight × price actually paid per chỉ. NO factor here — the paid
  // price already priced that specific gold; applying factor twice would skew P&L.
  function goldCostBasis(acc) {
    return Math.round((acc.goldWeightChi || 0) * (acc.goldBuyPerChi || 0));
  }
  // Unrealized P&L vs cost basis. pct is null when no cost basis was entered.
  function goldPnl(acc) {
    const cost = goldCostBasis(acc);
    const pnl = goldValue(acc) - cost;
    return { cost: cost, pnl: pnl, pct: cost > 0 ? pnl / cost : null };
  }
  function totalGoldPnl() {
    return activeAccounts().filter((a) => a.type === 'gold' && a.goldBuyPerChi)
      .reduce((s, a) => s + goldPnl(a).pnl, 0);
  }
  // Oldest fetched_at among the market kinds actually referenced by gold wallets
  // (custom excluded). Null when nothing applies — drives the stale-price badge.
  function goldPriceFetchedAt() {
    const used = {};
    activeAccounts().forEach((a) => { if (a.type === 'gold' && a.goldKind && a.goldKind !== 'custom') used[a.goldKind] = 1; });
    let oldest = null;
    Object.keys(used).forEach((k) => {
      const p = (DATA.goldPrices || {})[k];
      if (!p || !p.fetchedAt) return;
      const d = new Date(p.fetchedAt);
      if (!oldest || d < oldest) oldest = d;
    });
    return oldest;
  }
  // Trim to at most 3 decimals without trailing zeros (2.5 chỉ, 0.125 chỉ…).
  function fmtChi(n) { return String(Math.round((n || 0) * 1000) / 1000); }

  // Balance of one wallet = opening balance + incomes − expenses recorded against it.
  function accountBalance(id) {
    const acc = accountById(id); if (!acc) return 0;
    // Gold wallets are valued from weight × market price and take no transactions.
    if (acc.type === 'gold') return goldValue(acc);
    let bal = acc.openingBalance || 0;
    DATA.transactions.forEach((tx) => {
      if (tx.type === 'transfer') {
        if (tx.accountId === id) bal -= tx.amount;       // money left this wallet
        if (tx.toAccountId === id) bal += tx.amount;     // money arrived in this wallet
        return;
      }
      if (tx.accountId !== id) return;
      bal += tx.type === 'income' ? tx.amount : -tx.amount;
    });
    return bal;
  }
  // Total balance = sum of opening balances + net of every transaction (assigned or not).
  // Deliberately NOT accountBalance-based, so gold wallets are EXCLUDED: this figure
  // is spendable money (the Overview "Số dư"); gold only counts toward net worth.
  function totalBalance() {
    const opening = (DATA.accounts || []).reduce((s, a) => s + (a.openingBalance || 0), 0);
    return opening + allTimeBalance();
  }
  // Money that is actually AVAILABLE to spend: balances of wallets whose
  // "allow direct transactions" switch is on (storage wallets excluded).
  function txBalance() {
    return txAccounts().reduce((s, a) => s + accountBalance(a.id), 0);
  }
  // Net worth = total assets − total liabilities. Balances are kept in the "money held" frame,
  // so a liability you owe shows up as a negative balance; amount owed = −balance.
  function netWorth() {
    let assets = 0, liabilities = 0;
    activeAccounts().forEach((a) => {
      const b = accountBalance(a.id);
      if (accountClass(a) === 'liability') liabilities += Math.max(0, -b);
      else assets += b;
    });
    return { assets: assets, liabilities: liabilities, net: assets - liabilities };
  }
  // Next occurrence of a 1–31 "due day" on/after `from` (clamped to each month's last day).
  function nextDueDate(dueDay, from) {
    if (!dueDay) return null;
    const lastOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();
    let y = from.getFullYear(), m = from.getMonth();
    let d = new Date(y, m, Math.min(dueDay, lastOfMonth(y, m)));
    if (d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
      m += 1; if (m > 11) { m = 0; y += 1; }
      d = new Date(y, m, Math.min(dueDay, lastOfMonth(y, m)));
    }
    return d;
  }
  // Credit-card snapshot: amount owed, utilization, minimum payment, next due date.
  function cardCycle(acc) {
    const owed = Math.max(0, -accountBalance(acc.id));
    const limit = acc.creditLimit || 0;
    const minPct = acc.minPaymentPct != null ? acc.minPaymentPct : 5;
    const due = nextDueDate(acc.dueDay, new Date());
    return {
      owed: owed,
      utilization: limit > 0 ? Math.round(owed / limit * 100) : null,
      minPayment: owed > 0 ? Math.ceil(owed * minPct / 100) : 0,
      dueDate: due ? ymd(due) : null,
    };
  }
  // Pre-selected wallet for the entry forms: the household's default wallet if one
  // is set, otherwise the first active wallet. (No "last used" — the default always wins.)
  function defaultAccountId() {
    const accs = txAccounts(); if (!accs.length) return '';
    const def = accs.find((a) => a.isDefault);
    return def ? def.id : accs[0].id;
  }
  // <select> "Chi cho ai": first option = Chung (value ''), then each household member.
  // selectedId = the current beneficiaryId ('' / null = shared for the whole family).
  function beneficiarySelect(id, selectedId) {
    const sel = selectedId || '';
    let opts = '<option value=""' + (sel === '' ? ' selected' : '') + '>' + t('beneficiaryShared') + '</option>';
    opts += householdMembers.map((m) =>
      '<option value="' + esc(m.userId) + '"' + (m.userId === sel ? ' selected' : '') + '>' +
      esc(memberName(m.userId)) + '</option>').join('');
    return '<select id="' + id + '" class="acct-select">' + opts + '</select>';
  }
  // <select> of wallets for the entry forms; empty string when the household has no
  // (spendable) wallets. Gold wallets are excluded — they can't hold transactions.
  function accountSelect(id, selectedId) {
    let accs = txAccounts();
    // Keep the row's CURRENT wallet selectable even when its allowTx switch is
    // off — otherwise editing an old transaction would silently reassign it.
    const cur = selectedId ? accountById(selectedId) : null;
    if (cur && !accs.some((a) => a.id === cur.id)) accs = [cur].concat(accs);
    if (!accs.length) return '';
    const sel = selectedId || defaultAccountId();
    return '<select id="' + id + '" class="acct-select">' +
      accs.map((a) => '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') +
      '</select>';
  }

  /* ============== Toast ============== */
  let toastTimer = null;
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast show ' + (kind || 'info');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  /* ============== Status ============== */
  function setStatus(text, kind) {
    const el = document.getElementById('syncStatus');
    if (!el) return; el.textContent = text || ''; el.className = 'sync-status ' + (kind || '');
  }

  /* ============== Busy button ============== */
  // Wraps an async action tied to a button: disable + spinner while waiting,
  // restore when done. Swallows re-clicks while running (double-submit guard).
  // Safe when render() replaces the button before finally runs (restoring a
  // detached node is harmless).
  async function busy(btn, fn) {
    if (!btn) return fn();
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    btn.disabled = true;
    btn.classList.add('btn-busy');
    btn.setAttribute('aria-busy', 'true');
    try {
      return await fn();
    } finally {
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.classList.remove('btn-busy');
      btn.removeAttribute('aria-busy');
    }
  }

  /* ============== Transaction actions ============== */
  // busy() covers the whole flow (parse + save) so a double tap on slow
  // networks can't create duplicate transactions.
  async function addFromInput(raw, btnId, dateInputId, accountSelectId) {
    if (!raw.trim()) { toast(t('emptyInput'), 'warn'); return; }
    const btn = (btnId && document.getElementById(btnId)) || null;
    return busy(btn, () => addFromInputInner(raw, dateInputId, accountSelectId));
  }
  async function addFromInputInner(raw, dateInputId, accountSelectId) {
    // Parse one OR many entries ("ăn sáng 35k, cafe 20k, grab 1tr2" → 3 drafts).
    let parsedList;
    try { parsedList = await window.Parser.parseMany(raw); }
    catch (e) { parsedList = [{ ...window.Parser.parseWithRegex(raw), rawInput: raw.trim() }]; }

    const recognized = (parsedList || []).filter((p) => p && p.amount > 0);
    const dropped = (parsedList || []).length - recognized.length;
    if (!recognized.length) { toast(t('cantParse'), 'warn'); return; }
    if (window.Parser.splitEntries(raw).length > window.Parser.MAX_ENTRIES) toast(t('maxEntries'), 'warn');

    const today = ymd(new Date());
    // Date priority: a date the user picked in the date bar wins; otherwise a date
    // detected in each sentence ("hôm qua", "20/6"); otherwise today.
    const dateInput = dateInputId && document.getElementById(dateInputId);
    const picked = dateInput ? dateInput.value : '';
    const acctSel = accountSelectId && document.getElementById(accountSelectId);
    const accountId = (acctSel ? acctSel.value : defaultAccountId()) || '';
    const benSel = document.getElementById('txBeneficiaryBig');
    const beneficiaryId = (benSel ? benSel.value : '') || null;

    const drafts = recognized.map((p) => buildDraft(p, picked, today, accountId, beneficiaryId));

    // Single entry → fast save with an Undo bar. Multiple → confirm sheet first.
    if (drafts.length === 1) await saveDrafts(drafts, accountId, { undo: true });
    else openEntryPreview(drafts, accountId, dropped);
  }

  // Assemble a parsed result into a storable draft, applying the date priority.
  function buildDraft(parsed, picked, today, accountId, beneficiaryId) {
    let date = picked || today;
    if (parsed.date && (!picked || picked === today)) date = parsed.date;
    // Keep a real clock time only for today's entries; past days get no misleading time.
    const time = date === today ? new Date().toTimeString().slice(0, 5) : '';
    return {
      date: date, time: time, rawInput: parsed.rawInput || '',
      amount: Math.round(Number(parsed.amount) || 0),
      type: parsed.type === 'income' ? 'income' : 'expense',
      category: parsed.category, note: parsed.note,
      accountId: accountId || null,
      beneficiaryId: beneficiaryId || null,
    };
  }

  // Persist one or many drafts (batched), update state, and surface feedback.
  async function saveDrafts(drafts, accountId, opts) {
    opts = opts || {};
    setStatus(t('saving'));
    try {
      const saved = drafts.length === 1
        ? [await window.Store.addTransaction(drafts[0])]
        : await window.Store.addTransactions(drafts);
      DATA.transactions = saved.concat(DATA.transactions);
      // Attach any photos chosen on the Add page to the (first) new transaction.
      if (pendingAddFiles.length && saved.length) { setStatus(t('uploading')); await attachPendingTo(saved[0].id); }
      setStatus(t('synced'), 'ok'); setTimeout(() => setStatus(''), 2500);
      render();
      if (opts.undo && saved.length === 1) showUndoBar(saved[0]);
      else toast(addedSummary(saved), 'success');
      // Budget alerts for each distinct expense category touched.
      [...new Set(saved.filter((s) => s.type === 'expense').map((s) => s.category))]
        .forEach((c) => checkBudgetWarning(c));
      return saved;
    } catch (err) {
      setStatus(t('syncError'), 'err'); setTimeout(() => setStatus(''), 4000);
      toast(t('syncError') + ': ' + err.message, 'error');
      return null;
    }
  }

  function addedSummary(saved) {
    if (saved.length === 1) return t('added') + ': ' + saved[0].note + ' · ' + fmtVND(saved[0].amount);
    return '✓ ' + t('added') + ' ' + saved.length + ' ' + t('txs').toLowerCase();
  }

  // Transient "saved — Undo" bar (single-entry fast path). Auto-dismisses after 5s.
  let undoTimer = null;
  function showUndoBar(tx) {
    const prev = document.getElementById('undoBar'); if (prev) prev.remove();
    if (undoTimer) clearTimeout(undoTimer);
    const bar = document.createElement('div');
    bar.id = 'undoBar'; bar.className = 'action-toast';
    const sign = tx.type === 'income' ? '+' : '−';
    const ic = tx.type === 'transfer' ? icon('transfer') : catIcon(tx.category);
    bar.innerHTML =
      '<span class="at-ic ' + tx.type + '">' + ic + '</span>' +
      '<span class="at-text"><b>' + esc(tx.note || tx.rawInput || t('added')) + '</b>' +
      '<span class="at-sub">' + esc(catLabel(tx.category)) + ' · ' + sign + fmtShort(tx.amount) + '</span></span>' +
      '<button class="at-btn" data-undo="1">' + icon('refresh') + ' ' + t('undo') + '</button>';
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('show'));
    const close = () => { bar.classList.remove('show'); setTimeout(() => { if (bar.parentNode) bar.remove(); }, 250); };
    bar.querySelector('[data-undo]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      if (undoTimer) clearTimeout(undoTimer);
      close();
      try {
        await window.Store.deleteTransaction(tx.id);
        DATA.transactions = DATA.transactions.filter((x) => x.id !== tx.id);
        toast(t('deleted'), 'info'); render();
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    }));
    undoTimer = setTimeout(close, 5000);
  }

  // One editable row inside the multi-entry confirm sheet.
  function entryPreviewRow(d) {
    const catOpts = catOptionsFor(d.category);
    const isPast = d.date !== ymd(new Date());
    return '<div class="entry-row" data-date="' + esc(d.date) + '" data-time="' + esc(d.time || '') + '" data-raw="' + esc(d.rawInput || '') + '">' +
      '<div class="ep-line1">' +
      '<input type="text" class="ep-note" value="' + esc(d.note || '') + '" placeholder="' + t('note') + '"/>' +
      '<button type="button" class="icon-btn danger" data-eprm="1" title="' + t('delete') + '">' + icon('trash') + '</button>' +
      '</div>' +
      '<div class="ep-line2">' +
      '<input type="text" inputmode="numeric" class="ep-amount js-money" value="' + groupMoney(d.amount) + '"/>' +
      '<select class="ep-cat">' + catOpts + '</select>' +
      '</div>' +
      '<div class="seg ep-type" data-type="' + esc(d.type) + '">' +
      '<button type="button" class="seg-btn ' + (d.type === 'expense' ? 'active' : '') + '" data-type="expense">' + t('expense') + '</button>' +
      '<button type="button" class="seg-btn ' + (d.type === 'income' ? 'active' : '') + '" data-type="income">' + t('income') + '</button>' +
      (isPast ? '<span class="ep-date">' + esc(d.date) + '</span>' : '') +
      '</div></div>';
  }

  // Confirm sheet for a multi-entry add: review/edit each row, then save all.
  function openEntryPreview(drafts, accountId, dropped) {
    const rows = drafts.map((d) => entryPreviewRow(d)).join('');
    const epAcctSel = accountSelect('epAccount', accountId);
    const walletSel = epAcctSel ? '<label>' + t('wallet') + '</label>' + epAcctSel : '';
    const benSel = '<label>' + t('spentFor') + '</label>' + beneficiarySelect('epBeneficiary', drafts[0] ? drafts[0].beneficiaryId : '');
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal entry-modal">' +
      '<div class="card-title">' + icon('check') + ' ' + t('confirmEntries') + ' (' + drafts.length + ')</div>' +
      (dropped ? '<div class="warn-hint">' + icon('alert') + ' ' + dropped + ' ' + t('unrecognizedLines') + '</div>' : '') +
      '<div class="entry-list" id="entryList">' + rows + '</div>' + walletSel + benSel +
      '<div class="modal-actions"><button class="ghost-btn" id="epCancel">' + t('cancel') + '</button>' +
      '<button class="primary-btn" id="epSave">' + icon('check') + ' ' + t('saveAll') + ' (' + drafts.length + ')</button></div>' +
      '</div></div>';
    document.body.appendChild(wrap.firstChild);
    if (window.CustomSelect) window.CustomSelect.enhanceAll();
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    const refreshCount = () => {
      const n = document.querySelectorAll('#entryList .entry-row').length;
      if (!n) { close(); return; }
      const sv = document.getElementById('epSave');
      if (sv) sv.innerHTML = icon('check') + ' ' + t('saveAll') + ' (' + n + ')';
    };
    document.getElementById('epCancel').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    document.querySelectorAll('#entryList [data-eprm]').forEach((b) => b.addEventListener('click', () => {
      const row = b.closest('.entry-row'); if (row) row.remove(); refreshCount();
    }));
    document.querySelectorAll('#entryList .ep-type').forEach((seg) => seg.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active'); seg.dataset.type = b.dataset.type;
      })));
    const epSave = document.getElementById('epSave');
    epSave.addEventListener('click', () => busy(epSave, async () => {
      const acct = (document.getElementById('epAccount') ? document.getElementById('epAccount').value : accountId) || '';
      const ben = (document.getElementById('epBeneficiary') ? document.getElementById('epBeneficiary').value : '') || null;
      const out = [];
      Array.from(document.querySelectorAll('#entryList .entry-row')).forEach((r) => {
        const amount = readMoney(r.querySelector('.ep-amount'));
        if (amount <= 0) return;
        out.push({
          date: r.dataset.date, time: r.dataset.time || '', rawInput: r.dataset.raw || '',
          amount: amount, type: r.querySelector('.ep-type').dataset.type === 'income' ? 'income' : 'expense',
          category: r.querySelector('.ep-cat').value, note: (r.querySelector('.ep-note').value || '').trim(),
          accountId: acct || null,
          beneficiaryId: ben || null,
        });
      });
      if (!out.length) { toast(t('needAmount'), 'warn'); return; }
      close();
      await saveDrafts(out, acct, { undo: false });
    }));
  }
  function checkBudgetWarning(cat) {
    const limit = DATA.budgets[cat]; if (!limit) return;
    const used = byCategory(inRange(startOfMonth(new Date()), endOfMonth(new Date())))[cat] || 0;
    const pct = used / limit * 100;
    if (pct >= 100) toast('🚨 ' + t('warn100') + ': ' + cat + ' (' + Math.round(pct) + '%)', 'error');
    else if (pct >= 80) toast('⚠️ ' + t('warn80') + ': ' + cat + ' (' + Math.round(pct) + '%)', 'warn');
  }
  // `btn` (optional) is the button that triggered the delete — confirm() runs
  // first so the spinner only shows while the server call is in flight.
  async function deleteTx(id, btn) {
    const tx = DATA.transactions.find((x) => x.id === id);
    if (tx && !canEditTx(tx)) { toast(t('cantEditOthersTx'), 'warn'); return; }
    if (!confirm(t('confirmDelete'))) return;
    return busy(btn || null, async () => {
      try {
        await window.Store.deleteTransaction(id);
        DATA.transactions = DATA.transactions.filter((x) => x.id !== id);
        toast(t('deleted'), 'info'); render();
      } catch (err) {
        toast(t('syncError') + ': ' + err.message, 'error');
      }
    });
  }

  /* ============== Escape ============== */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ============== Reusable bits ============== */
  function statTile(label, value, kind, ic) {
    return '<div class="tile ' + (kind || '') + '">' +
      '<div class="tile-top">' + (ic ? icon(ic) : '') + '<span>' + label + '</span></div>' +
      '<div class="tile-val">' + fmtShort(Math.abs(value)) + '</div></div>';
  }
  // Income-vs-expense tile: signed amount + a sentence saying which side won
  // the month, so the meaning doesn't ride on the color alone.
  function netTileHtml(mt) {
    const zero = mt.net === 0;
    const pos = mt.net > 0;
    const kind = zero ? 'neutral' : (pos ? 'income' : 'expense');
    const state = zero ? t('netEven') : (pos ? t('netIncomeHigher') : t('netExpenseHigher'));
    const sign = zero ? '' : (pos ? '+' : '−');
    return '<div class="tile ' + kind + '">' +
      '<div class="tile-top">' + icon('scale') + '<span>' + t('netDiff') + '</span></div>' +
      '<div class="tile-val">' + sign + fmtShort(Math.abs(mt.net)) + '</div>' +
      '<div class="tile-sub ' + (zero ? '' : (pos ? 'good' : 'bad')) + '">' + state + '</div></div>';
  }
  // Edit/delete buttons — only for transactions the current user may change
  // (own rows for members; any row for owners/admins). Mirrors the transactions RLS.
  /* ============== Attachments (photo evidence) ============== */
  function rebuildAttachIndex() {
    attachByTx = {};
    (DATA.attachments || []).forEach((a) => {
      (attachByTx[a.transactionId] || (attachByTx[a.transactionId] = [])).push(a);
    });
  }
  function attachmentsFor(txId) { return attachByTx[txId] || []; }

  // Small "📎 n" badge shown on a transaction row when it has evidence.
  function attachBadge(txId) {
    const n = attachmentsFor(txId).length;
    if (!n) return '';
    return '<button type="button" class="tx-attach" data-attview="' + txId + '" title="' + t('viewEvidence') + '">' +
      icon('paperclip') + '<span>' + n + '</span></button>';
  }

  // Resize the longest edge to <= maxDim and re-encode as JPEG to shrink phone photos.
  // Returns { blob, width, height }. Throws Error('decode') if the file can't be decoded (e.g. HEIC).
  async function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1600; quality = quality || 0.82;
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (e) { throw new Error('decode'); }
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
    if (!blob) throw new Error('encode');
    return { blob: blob, width: w, height: h };
  }

  // Point an <img> at a private file via a signed URL, re-signing once on load error.
  function loadSignedImg(img, path) {
    let retried = false;
    img.addEventListener('error', () => {
      if (retried) return; retried = true;
      // Force a fresh signature (bypass cache) in case the served URL was stale/broken.
      window.Store.signedUrl(path, 3600, true).then((u) => { if (u) img.src = u; }).catch(() => {});
    });
    window.Store.signedUrl(path).then((u) => { if (u) img.src = u; }).catch(() => {});
  }

  // Full-screen viewer for a transaction's evidence (read-only; anyone in the household).
  function openAttachmentViewer(txId, startIdx) {
    const list = attachmentsFor(txId);
    if (!list.length) return;
    let idx = startIdx || 0;
    const multi = list.length > 1;
    const wrap = document.createElement('div');
    wrap.className = 'lightbox-backdrop'; wrap.id = 'lightbox';
    wrap.innerHTML =
      '<button type="button" class="lightbox-close" id="lbClose" aria-label="' + t('cancel') + '">' + icon('x') + '</button>' +
      (multi ? '<button type="button" class="lightbox-nav prev" id="lbPrev" aria-label="prev">‹</button>' : '') +
      '<img class="lightbox-img" id="lbImg" alt="' + t('evidence') + '"/>' +
      (multi ? '<button type="button" class="lightbox-nav next" id="lbNext" aria-label="next">›</button>' : '') +
      (multi ? '<div class="lightbox-count" id="lbCount"></div>' : '');
    document.body.appendChild(wrap);
    const img = wrap.querySelector('#lbImg');
    const countEl = wrap.querySelector('#lbCount');

    /* --- Zoom & pan state (pinch / double-tap / wheel + drag), vanilla, no library --- */
    let scale = 1, tx = 0, ty = 0;
    function applyT() {
      img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    }
    function clampPan() {
      const ox = Math.max(0, (img.offsetWidth * scale - window.innerWidth) / 2);
      const oy = Math.max(0, (img.offsetHeight * scale - window.innerHeight) / 2);
      tx = Math.max(-ox, Math.min(ox, tx));
      ty = Math.max(-oy, Math.min(oy, ty));
    }
    // Zoom to `ns` keeping the content point under (cx,cy) fixed on screen.
    function zoomAround(cx, cy, ns) {
      ns = Math.max(1, Math.min(5, ns));
      const r = img.getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2);
      const dy = cy - (r.top + r.height / 2);
      const k = ns / scale;
      tx -= dx * (k - 1); ty -= dy * (k - 1); scale = ns;
      if (scale <= 1.001) { scale = 1; tx = 0; ty = 0; }
      clampPan(); applyT();
    }
    function resetZoom() { scale = 1; tx = 0; ty = 0; applyT(); }

    const show = () => {
      idx = (idx + list.length) % list.length;
      resetZoom();
      loadSignedImg(img, list[idx].storagePath);
      if (countEl) countEl.textContent = (idx + 1) + ' / ' + list.length;
    };

    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    let mode = null, startDist = 0, startScale = 1, startX = 0, startY = 0, baseTx = 0, baseTy = 0, lastTap = 0;
    img.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        mode = 'pinch'; startDist = dist(e.touches[0], e.touches[1]) || 1; startScale = scale; e.preventDefault();
      } else if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 300) { // double-tap → toggle zoom at the tapped point
          zoomAround(e.touches[0].clientX, e.touches[0].clientY, scale > 1 ? 1 : 2.5);
          lastTap = 0; mode = null; e.preventDefault(); return;
        }
        lastTap = now;
        mode = scale > 1 ? 'pan' : null;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; baseTx = tx; baseTy = ty;
      }
    }, { passive: false });
    img.addEventListener('touchmove', (e) => {
      if (mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        zoomAround(mx, my, startScale * (dist(e.touches[0], e.touches[1]) / startDist));
      } else if (mode === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        tx = baseTx + (e.touches[0].clientX - startX);
        ty = baseTy + (e.touches[0].clientY - startY);
        clampPan(); applyT();
      }
    }, { passive: false });
    img.addEventListener('touchend', (e) => {
      if (!e.touches.length) { mode = null; }
      else if (e.touches.length === 1) { mode = scale > 1 ? 'pan' : null; startX = e.touches[0].clientX; startY = e.touches[0].clientY; baseTx = tx; baseTy = ty; }
    });
    img.addEventListener('wheel', (e) => { e.preventDefault(); zoomAround(e.clientX, e.clientY, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
    img.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAround(e.clientX, e.clientY, scale > 1 ? 1 : 2.5); });
    let dragging = false, dragX = 0, dragY = 0, dragTx = 0, dragTy = 0;
    img.addEventListener('mousedown', (e) => { if (scale <= 1) return; e.preventDefault(); dragging = true; dragX = e.clientX; dragY = e.clientY; dragTx = tx; dragTy = ty; img.style.cursor = 'grabbing'; });
    const onMouseMove = (e) => { if (!dragging) return; tx = dragTx + (e.clientX - dragX); ty = dragTy + (e.clientY - dragY); clampPan(); applyT(); };
    const onMouseUp = () => { if (!dragging) return; dragging = false; img.style.cursor = scale > 1 ? 'grab' : 'zoom-in'; };
    // On `wrap` (the full-viewport backdrop), not `window`, so they're removed with the
    // node and never leak even if the lightbox is torn down without calling close().
    wrap.addEventListener('mousemove', onMouseMove);
    wrap.addEventListener('mouseup', onMouseUp);

    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && multi) { idx--; show(); }
      else if (e.key === 'ArrowRight' && multi) { idx++; show(); }
    };
    function close() {
      const m = document.getElementById('lightbox'); if (m) m.remove();
      document.removeEventListener('keydown', onKey); // the only listener on a node that outlives the lightbox
    }
    // Close on backdrop tap OR anywhere inside the × button (covers taps landing on
    // the inner <svg>/<path>, which is why a plain target===button check missed them).
    // Tapping the image (zoom/pan target) never closes.
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || (e.target.closest && e.target.closest('#lbClose'))) close();
    });
    const prev = wrap.querySelector('#lbPrev'); if (prev) prev.addEventListener('click', () => { idx--; show(); });
    const next = wrap.querySelector('#lbNext'); if (next) next.addEventListener('click', () => { idx++; show(); });
    document.addEventListener('keydown', onKey);
    show();
  }

  // Render/refresh the evidence grid inside the Edit modal (caller has edit rights).
  const MAX_PHOTOS = 5;
  function fillEvidenceBox(tx) {
    const box = document.getElementById('evidenceBox');
    if (!box) return;
    const list = attachmentsFor(tx.id);
    const thumbs = list.map((a) =>
      '<div class="attach-thumb">' +
        '<img alt="" data-path="' + esc(a.storagePath) + '"/>' +
        '<button type="button" class="attach-del" data-delatt="' + a.id + '" title="' + t('removePhoto') + '">' + icon('x') + '</button>' +
      '</div>').join('');
    box.innerHTML =
      '<label>' + t('evidence') + '</label>' +
      '<div class="attach-grid">' + thumbs +
        '<button type="button" class="attach-add" id="attachAdd">' + icon('camera') + '<span>' + t('addPhoto') + '</span></button>' +
      '</div>' +
      '<input type="file" id="attachFile" accept="image/*" multiple hidden/>';
    box.querySelectorAll('img[data-path]').forEach((img, i) => {
      loadSignedImg(img, img.dataset.path);
      img.addEventListener('click', () => openAttachmentViewer(tx.id, i));
    });
    box.querySelectorAll('[data-delatt]').forEach((b) => b.addEventListener('click', () => {
      const att = attachmentsFor(tx.id).find((x) => x.id === b.dataset.delatt);
      if (!att || !confirm(t('confirmRemovePhoto'))) return;
      busy(b, async () => {
        try {
          await window.Store.deleteAttachment(att);
          DATA.attachments = (DATA.attachments || []).filter((x) => x.id !== att.id);
          render(); fillEvidenceBox(tx);
        } catch (err) { toast(t('photoUploadFailed') + ': ' + err.message, 'error'); }
      });
    }));
    const addBtn = box.querySelector('#attachAdd');
    const fileInput = box.querySelector('#attachFile');
    if (addBtn && fileInput) {
      addBtn.addEventListener('click', () => {
        if (!navigator.onLine) { toast(t('needNetworkPhoto'), 'warn'); return; }
        fileInput.click();
      });
      fileInput.addEventListener('change', async () => {
        const files = Array.from(fileInput.files || []);
        fileInput.value = '';
        if (!files.length) return;
        const have = attachmentsFor(tx.id).length;
        let allow = files;
        if (have + files.length > MAX_PHOTOS) {
          allow = files.slice(0, Math.max(0, MAX_PHOTOS - have));
          toast(t('maxPhotos').replace('{n}', MAX_PHOTOS), 'warn');
        }
        if (!allow.length) return;
        const oldHtml = addBtn.innerHTML;
        await busy(addBtn, async () => {
          addBtn.innerHTML = icon('clock') + '<span>' + t('uploading') + '</span>';
          try {
            for (const f of allow) {
              try {
                const out = await compressImage(f);
                const path = await window.Store.uploadReceipt(tx.id, out.blob, 'jpg');
                const att = await window.Store.insertAttachment({
                  transactionId: tx.id, storagePath: path, mime: 'image/jpeg',
                  sizeBytes: out.blob.size, width: out.width, height: out.height,
                });
                DATA.attachments = DATA.attachments || []; DATA.attachments.push(att);
              } catch (err) {
                const msg = (err && err.message === 'decode') ? t('photoUnsupported')
                  : (t('photoUploadFailed') + (err && err.message ? ': ' + err.message : ''));
                toast(msg, 'error');
              }
            }
          } finally { addBtn.innerHTML = oldHtml; }
        });
        render(); fillEvidenceBox(tx);
      });
    }
  }

  /* ----- Entry-time photos: chosen on the Add page, attached once the tx is saved ----- */
  let pendingAddFiles = []; // [{ file, url }]
  function clearPendingAddFiles() {
    pendingAddFiles.forEach((p) => { try { URL.revokeObjectURL(p.url); } catch (e) { /* ignore */ } });
    pendingAddFiles = [];
  }
  // Fill the Add page's photo picker from pendingAddFiles (previews use object URLs).
  function renderAddPhotos() {
    const box = document.getElementById('addPhotos');
    if (!box) return;
    const thumbs = pendingAddFiles.map((p, i) =>
      '<div class="attach-thumb"><img src="' + p.url + '" alt=""/>' +
      '<button type="button" class="attach-del" data-rmadd="' + i + '" title="' + t('removePhoto') + '">' + icon('x') + '</button></div>'
    ).join('');
    // Offer "scan receipt → auto-fill" once at least one photo is chosen.
    const scanBtn = pendingAddFiles.length
      ? '<button type="button" class="ghost-btn ocr-btn" id="ocrBtn">' + icon('camera') + ' ' + t('scanReceipt') + '</button>'
      : '';
    box.innerHTML =
      '<div class="attach-grid">' + thumbs +
        '<button type="button" class="attach-add" id="addPhotoBtn">' + icon('camera') + '<span>' + t('addPhoto') + '</span></button>' +
      '</div>' + scanBtn +
      '<input type="file" id="addPhotoFile" accept="image/*" multiple hidden/>';
    const addBtn = box.querySelector('#addPhotoBtn');
    const file = box.querySelector('#addPhotoFile');
    addBtn.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const files = Array.from(file.files || []); file.value = '';
      let capped = false;
      files.forEach((f) => {
        if (pendingAddFiles.length < MAX_PHOTOS) pendingAddFiles.push({ file: f, url: URL.createObjectURL(f) });
        else capped = true;
      });
      if (capped) toast(t('maxPhotos').replace('{n}', MAX_PHOTOS), 'warn');
      renderAddPhotos();
    });
    box.querySelectorAll('[data-rmadd]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.rmadd); const p = pendingAddFiles[i];
      if (p) { try { URL.revokeObjectURL(p.url); } catch (e) { /* ignore */ } pendingAddFiles.splice(i, 1); renderAddPhotos(); }
    }));
    const ocrBtn = box.querySelector('#ocrBtn');
    if (ocrBtn) ocrBtn.addEventListener('click', () => scanFirstReceipt(ocrBtn));
  }

  // OCR the first chosen photo and open the confirm sheet prefilled with the result.
  // The photo stays in pendingAddFiles, so saving also attaches it as evidence.
  async function scanFirstReceipt(btn) {
    const first = pendingAddFiles[0];
    if (!first) return;
    if (!window.Parser.imageOcrAvailable()) { toast(t('ocrNeedKey'), 'warn'); return; }
    if (!navigator.onLine) { toast(t('needNetworkPhoto'), 'warn'); return; }
    return busy(btn, () => scanFirstReceiptInner(btn, first));
  }
  async function scanFirstReceiptInner(btn, first) {
    const oldHtml = btn.innerHTML;
    btn.innerHTML = icon('clock') + ' ' + t('scanning');
    try {
      let blob = first.file;
      try {
        // Smaller/lighter than the evidence copy → faster OCR (receipts are mostly text).
        const out = await compressImage(first.file, 1280, 0.7);
        blob = out.blob;
      } catch (e) {
        // Can't decode (e.g. HEIC) → the API can't read it either; bail with a clear message.
        if (e && e.message === 'decode') { toast(t('photoUnsupported'), 'warn'); return; }
        // Other (encode) failure: fall back to the raw file.
      }
      const parsed = await window.Parser.parseImageReceipt(blob);
      const today = ymd(new Date());
      const acctSel = document.getElementById('txAccountBig');
      const accountId = (acctSel ? acctSel.value : defaultAccountId()) || '';
      const dateInput = document.getElementById('txDateBig');
      const picked = dateInput ? dateInput.value : '';
      const draft = buildDraft(parsed, picked, today, accountId);
      openEntryPreview([draft], accountId, 0);
      const msg = !draft.amount ? t('ocrNoAmount') : (parsed.lowConfidence ? t('checkAmount') : t('ocrDone'));
      toast(msg, draft.amount && !parsed.lowConfidence ? 'success' : 'warn');
    } catch (err) {
      toast(t('ocrFailed') + (err && err.message ? ': ' + err.message : ''), 'error');
    } finally {
      btn.innerHTML = oldHtml;
    }
  }
  // Upload all pending Add-page photos onto a freshly-saved transaction. Pushes into
  // DATA.attachments but does NOT render (the caller renders once afterwards).
  async function attachPendingTo(txId) {
    if (!pendingAddFiles.length) return;
    const files = pendingAddFiles.map((p) => p.file);
    clearPendingAddFiles();
    for (const f of files) {
      try {
        const out = await compressImage(f);
        const path = await window.Store.uploadReceipt(txId, out.blob, 'jpg');
        const att = await window.Store.insertAttachment({
          transactionId: txId, storagePath: path, mime: 'image/jpeg',
          sizeBytes: out.blob.size, width: out.width, height: out.height,
        });
        DATA.attachments = DATA.attachments || []; DATA.attachments.push(att);
      } catch (err) {
        const msg = (err && err.message === 'decode') ? t('photoUnsupported')
          : (t('photoUploadFailed') + (err && err.message ? ': ' + err.message : ''));
        toast(msg, 'error');
      }
    }
  }

  function txActions(tx) {
    if (!canEditTx(tx)) return '';
    // The whole row is tappable to edit now, so we only surface delete here (declutters the list).
    return '<div class="tx-actions">' +
      '<button class="icon-btn" data-act="del" data-id="' + tx.id + '">' + icon('trash') + '</button></div>';
  }
  function txRow(tx) {
    if (isAdjust(tx)) {
      const sign = tx.type === 'income' ? '+' : '−';
      return '<div class="tx-row" data-id="' + tx.id + '">' +
        '<div class="tx-ic ' + tx.type + '">' + icon('edit') + '</div>' +
        '<div class="tx-main"><div class="tx-note"><span class="tx-note-txt">' + t('balanceAdjustLabel') + '</span></div>' +
        '<div class="tx-meta">' + tx.date + (tx.time ? ' ' + tx.time : '') + ' · ' + esc(memberName(tx.userId)) + '</div></div>' +
        '<div class="tx-right"><div class="tx-amount ' + tx.type + '">' + sign + fmtShort(tx.amount) + '</div>' +
        txActions(tx) + '</div></div>';
    }
    if (tx.type === 'transfer') {
      const from = accountById(tx.accountId);
      const to = accountById(tx.toAccountId);
      const fromN = from ? from.name : t('unassignedWallet');
      const toN = to ? to.name : t('unassignedWallet');
      return '<div class="tx-row" data-id="' + tx.id + '">' +
        '<div class="tx-ic transfer">' + icon('transfer') + '</div>' +
        '<div class="tx-main"><div class="tx-note"><span class="tx-note-txt">' + esc(tx.note || t('transfer')) + '</span>' + attachBadge(tx.id) + '</div>' +
        '<div class="tx-meta">' + esc(fromN) + ' → ' + esc(toN) + ' · ' + tx.date + (tx.time ? ' ' + tx.time : '') + ' · ' + esc(memberName(tx.userId)) + '</div></div>' +
        '<div class="tx-right"><div class="tx-amount transfer">' + fmtShort(tx.amount) + '</div>' +
        txActions(tx) + '</div></div>';
    }
    const sign = tx.type === 'income' ? '+' : '−';
    return '<div class="tx-row" data-id="' + tx.id + '">' +
      '<div class="tx-ic ' + tx.type + '">' + catIcon(tx.category) + '</div>' +
      '<div class="tx-main"><div class="tx-note"><span class="tx-note-txt">' + esc(tx.note || tx.rawInput) + '</span>' + attachBadge(tx.id) + '</div>' +
      '<div class="tx-meta">' + esc(catLabel(tx.category)) + ' · ' + tx.date + (tx.time ? ' ' + tx.time : '') + ' · ' + esc(memberName(tx.userId)) +
        (tx.beneficiaryId ? ' · ' + t('spentForShort') + ' ' + esc(memberName(tx.beneficiaryId)) : '') + '</div></div>' +
      '<div class="tx-right"><div class="tx-amount ' + tx.type + '">' + sign + fmtShort(tx.amount) + '</div>' +
      txActions(tx) + '</div></div>';
  }
  // Fraction of the anchored month already elapsed (1 for past months — they're fully done).
  function monthElapsedFraction(anchor) {
    const now = new Date();
    if (anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()) {
      return now.getDate() / endOfMonth(anchor).getDate();
    }
    return 1;
  }
  // Budget vs actual bars. Threshold logic: ok < 80% ≤ warning < 100% ≤ critical.
  // When `elapsedFrac` (0–1) is given, pace-adjust to flag categories projected to overspend.
  function budgetBarsHtml(byCat, budgets, elapsedFrac) {
    const cats = Object.keys(budgets).filter((c) => budgets[c] > 0);
    if (!cats.length) return '<div class="empty">' + t('budgetNotSet') + '</div>';
    return cats.map((cat) => {
      const limit = budgets[cat], used = byCat[cat] || 0;
      const raw = limit ? used / limit * 100 : 0, pct = Math.min(100, Math.round(raw));
      let cls = 'ok'; if (raw >= 100) cls = 'danger'; else if (raw >= 80) cls = 'warn';
      // Projected overspend: extrapolate current pace to the end of the period.
      let projBadge = '';
      if (elapsedFrac && elapsedFrac > 0 && elapsedFrac < 1 && raw < 100) {
        const projected = used / elapsedFrac;
        if (projected >= limit) {
          if (cls === 'ok') cls = 'warn';
          projBadge = '<div class="budget-proj">' + icon('trendUp') + ' ' + t('projectedOverspend') +
            ' · ~' + fmtShort(projected) + '</div>';
        }
      }
      return '<div class="budget-row">' +
        '<div class="budget-top"><span class="budget-cat">' + catIcon(cat) + esc(catLabel(cat)) + '</span>' +
        '<span class="budget-nums ' + (used > limit ? 'over' : '') + '">' + fmtShort(used) + ' / ' + fmtShort(limit) + '</span></div>' +
        '<div class="budget-track"><div class="budget-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
        projBadge + '</div>';
    }).join('');
  }

  // Date selector for quick-add: "Hôm nay" / "Hôm qua" chips + a native date picker.
  // Defaults to today; capped at today (no future dates).
  function dateBar(inputId) {
    const today = ymd(new Date());
    return '<div class="date-bar">' +
      '<button type="button" class="date-chip active" data-dateset="' + today + '" data-for="' + inputId + '">' + t('today') + '</button>' +
      '<button type="button" class="date-chip" data-dateset="' + ymd(addDays(new Date(), -1)) + '" data-for="' + inputId + '">' + t('yesterday') + '</button>' +
      '<input type="date" id="' + inputId + '" class="date-input" value="' + today + '" max="' + today + '" title="' + t('pickDate') + '"/>' +
      '</div>';
  }
  function wireDateBar() {
    document.querySelectorAll('.date-bar').forEach((bar) => {
      const input = bar.querySelector('.date-input');
      const chips = bar.querySelectorAll('.date-chip');
      const syncChips = () => chips.forEach((c) => c.classList.toggle('active', input && c.dataset.dateset === input.value));
      chips.forEach((c) => c.addEventListener('click', () => { if (input) { input.value = c.dataset.dateset; syncChips(); } }));
      if (input) input.addEventListener('change', syncChips);
    });
  }

  // Horizontal strip of wallet cards (Overview). Empty when there are no wallets.
  function walletStripHtml() {
    const accs = activeAccounts();
    if (!accs.length) return '';
    const cards = accs.map((a) => {
      const b = accountBalance(a.id);
      return '<div class="wallet-card" role="button" tabindex="0" data-wallethist="' + esc(a.id) + '" title="' + t('walletHistory') + '">' +
        '<div class="wallet-top">' + accountTypeIcon(a.type) + '<span>' + esc(a.name) + '</span></div>' +
        '<div class="wallet-bal ' + (b < 0 ? 'neg' : '') + '">' + mask(fmtShort(b)) + '</div></div>';
    }).join('');
    // The GLOBAL mask toggle (wallet cards, goals, reports…) lives here now —
    // the hero figures have their own independent eyes.
    return '<div class="section-row"><div class="section-title">' + t('wallets') + '</div>' +
      '<button id="eyeToggle" class="eye-btn eye-plain" title="' + (hideAmounts ? t('showBalance') : t('hideBalance')) + '">' + icon(hideAmounts ? 'eyeOff' : 'eye') + '</button></div>' +
      '<div class="wallet-strip">' + cards + '</div>';
  }

  /* ============== VIEW: Overview ============== */
  function viewOverview() {
    const now = new Date();
    const monthTx = inRange(startOfMonth(now), endOfMonth(now));
    const mt = totals(monthTx);
    const bal = totalBalance();
    const budget = totalBudget();
    const remain = budget - mt.expense;
    const dayNow = now.getDate();
    const todayTx = DATA.transactions.filter((x) => x.date === ymd(now) && x.type === 'expense' && !isAdjust(x));
    const spentToday = todayTx.reduce((a, b) => a + b.amount, 0);
    const avgDay = dayNow ? mt.expense / dayNow : 0;

    // Weekly review
    const wkTx = inRange(startOfWeek(now), endOfWeek(now));
    const wkExp = totals(wkTx).expense;
    const lastWk = new Date(now); lastWk.setDate(lastWk.getDate() - 7);
    const lastWkExp = totals(inRange(startOfWeek(lastWk), endOfWeek(lastWk))).expense;
    const diffPct = lastWkExp ? Math.round((wkExp - lastWkExp) / lastWkExp * 100) : (wkExp ? 100 : 0);
    // 7-day sparkline
    const spark = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); spark.push(totals(DATA.transactions.filter((x) => x.date === ymd(d) && x.type === 'expense')).expense); }
    setTimeout(() => window.Charts.sparkline('weekSpark', spark, getComputedStyle(document.body).getPropertyValue('--expense').trim() || '#ef4444'), 0);

    const recent = DATA.transactions.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 5);

    return (
      '<div class="hero">' +
      '<div class="hero-label">' + icon('wallet') + ' ' + t('balanceAvail') +
      '<button id="eyeAvail" class="eye-btn" title="' + (hideBalAvail ? t('showBalance') : t('hideBalance')) + '">' + icon(hideBalAvail ? 'eyeOff' : 'eye') + '</button></div>' +
      '<div class="hero-balance">' + (hideBalAvail ? '••••••' : fmtVND(txBalance())) + '</div>' +
      '<div class="hero-total">' + t('balanceTotal') + ': <b>' + (hideBalTotal ? '••••••' : fmtVND(bal)) + '</b>' +
      '<button id="eyeTotal" class="eye-btn eye-sm" title="' + (hideBalTotal ? t('showBalance') : t('hideBalance')) + '">' + icon(hideBalTotal ? 'eyeOff' : 'eye') + '</button></div>' +
      '<div class="hero-chips">' +
      '<div class="hero-chip"><span>' + icon('down') + ' ' + t('thisMonth') + ' ' + t('income').toLowerCase() + '</span><b>' + fmtShort(mt.income) + '</b></div>' +
      '<div class="hero-chip"><span>' + icon('up') + ' ' + t('thisMonth') + ' ' + t('expense').toLowerCase() + '</span><b>' + fmtShort(mt.expense) + '</b></div>' +
      '</div></div>' +

      '<div class="tiles">' +
      statTile(t('remaining') + ' ' + t('budget').toLowerCase(), remain, remain >= 0 ? 'income' : 'expense', 'target') +
      netTileHtml(mt) +
      statTile(t('spentToday'), spentToday, 'expense', 'up') +
      statTile(t('avgPerDay'), avgDay, 'neutral', 'chart') +
      '</div>' +

      // Wallet balances
      walletStripHtml() +

      // Savings goals
      goalsSectionHtml() +

      // Weekly review
      '<div class="card week-card">' +
      '<div class="card-title">' + icon('calendar') + ' ' + t('weekReview') + '</div>' +
      '<div class="week-body">' +
      '<div><div class="week-amount">' + fmtVND(wkExp) + '</div>' +
      '<div class="week-diff ' + (diffPct > 0 ? 'bad' : 'good') + '">' + icon(diffPct > 0 ? 'trendUp' : 'trendDown') +
      ' ' + (diffPct > 0 ? '+' : '') + diffPct + '% ' + t('vsLastWeek') + '</div></div>' +
      '<div class="spark-wrap"><canvas id="weekSpark"></canvas></div>' +
      '</div></div>' +

      // Recent
      '<div class="section-row"><div class="section-title">' + t('recent') + '</div>' +
      '<button class="link-btn" data-goto="transactions">' + t('seeAll') + ' ' + icon('right') + '</button></div>' +
      '<div class="tx-list">' + (recent.length ? recent.map(txRow).join('') : '<div class="empty">' + t('noTx') + '</div>') + '</div>'
    );
  }

  function alertItem(kind, ic, text) {
    return '<div class="alert-item ' + kind + '">' + icon(ic) + '<span>' + text + '</span></div>';
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
  // Range of the period immediately before the anchored one (same length).
  function prevReportRange() {
    const a = new Date(reportAnchor);
    if (reportPeriod === 'week') { a.setDate(a.getDate() - 7); return { s: startOfWeek(a), e: endOfWeek(a) }; }
    if (reportPeriod === 'year') { a.setFullYear(a.getFullYear() - 1); return { s: new Date(a.getFullYear(), 0, 1), e: new Date(a.getFullYear(), 11, 31) }; }
    a.setMonth(a.getMonth() - 1); return { s: startOfMonth(a), e: endOfMonth(a) };
  }
  // Small ▲/▼ delta chip vs the previous period. higherIsGood flips the colour meaning.
  function deltaChip(cur, prev, higherIsGood) {
    if (!prev && !cur) return '';
    const pct = prev !== 0 ? Math.round((cur - prev) / Math.abs(prev) * 100) : (cur ? 100 : 0);
    if (pct === 0) return '<span class="sum-delta flat">—</span>';
    const up = pct > 0, good = higherIsGood ? up : !up;
    return '<span class="sum-delta ' + (good ? 'good' : 'bad') + '">' + icon(up ? 'trendUp' : 'trendDown') + ' ' + Math.abs(pct) + '%</span>';
  }
  // "Wrap-up" headline card summarising the selected period vs the previous one.
  function reportWrapUpHtml(tt, pt, byCat) {
    const rate = tt.income ? Math.round(tt.net / tt.income * 100) : 0;
    let topCat = '', topVal = 0;
    Object.keys(byCat).forEach((c) => { if (byCat[c] > topVal) { topVal = byCat[c]; topCat = c; } });
    const dpct = pt.expense ? Math.round((tt.expense - pt.expense) / pt.expense * 100) : null;
    let cmp;
    if (dpct === null) cmp = t('wrapNoPrev');
    else if (dpct > 0) cmp = t('wrapMore').replace('{n}', dpct);
    else if (dpct < 0) cmp = t('wrapLess').replace('{n}', Math.abs(dpct));
    else cmp = t('wrapSame');
    const coach = (dpct !== null && dpct < 0) ? t('wrapGood') : ((dpct !== null && dpct > 10) ? t('wrapWatch') : '');
    return '<div class="wrap-card">' +
      '<div class="wrap-top"><span class="wrap-period">' + esc(reportLabel()) + '</span>' +
      '<span class="wrap-rate">' + t('savingsRate') + ' ' + rate + '%</span></div>' +
      '<div class="wrap-spent">' + fmtVND(tt.expense) + '</div>' +
      '<div class="wrap-cmp">' + cmp + '</div>' +
      (topCat ? '<div class="wrap-biggest">' + catIcon(topCat) + ' ' + t('wrapBiggest') + ': ' + esc(catLabel(topCat)) + ' · ' + fmtShort(topVal) + '</div>' : '') +
      (coach ? '<div class="wrap-coach">' + coach + '</div>' : '') +
      '</div>';
  }

  /* ============== Auto insights & spending calendar ============== */
  // A few plain-language observations for the anchored month (max 3).
  function autoInsights(anchor) {
    const out = [];
    const mk = monthKey(anchor);
    const catOf = (key) => { const o = {}; DATA.transactions.forEach((x) => { if (x.type === 'expense' && !isAdjust(x) && x.date.slice(0, 7) === key) o[x.category] = (o[x.category] || 0) + x.amount; }); return o; };
    const cur = catOf(mk);
    const monthExp = Object.values(cur).reduce((a, b) => a + b, 0);
    if (!monthExp) return out;
    // 1) vs recent 3-month average
    const prior = monthlyExpenseSeries(4, anchor).slice(0, 3).map((s) => s.expense).filter((v) => v > 0);
    if (prior.length) {
      const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
      if (avg > 0) {
        const pct = Math.round((monthExp - avg) / avg * 100);
        if (Math.abs(pct) >= 10) out.push({ kind: pct > 0 ? 'warn' : 'good', ic: pct > 0 ? 'trendUp' : 'trendDown', text: t(pct > 0 ? 'insMoreAvg' : 'insLessAvg').replace('{n}', Math.abs(pct)) });
      }
    }
    // 2) weekend vs weekday daily average
    const byDay = {};
    DATA.transactions.forEach((x) => { if (x.type === 'expense' && !isAdjust(x) && x.date.slice(0, 7) === mk) byDay[x.date] = (byDay[x.date] || 0) + x.amount; });
    let we = 0, wec = 0, wd = 0, wdc = 0;
    Object.keys(byDay).forEach((d) => { const g = new Date(d + 'T00:00:00').getDay(); if (g === 0 || g === 6) { we += byDay[d]; wec++; } else { wd += byDay[d]; wdc++; } });
    if (wec && wdc) { const r = (we / wec) / (wd / wdc); if (r >= 1.3) out.push({ kind: 'info', ic: 'calendar', text: t('insWeekend').replace('{n}', r.toFixed(1)) }); }
    // 3) biggest category jump vs previous month
    const prev = catOf(monthKey(addMonths(anchor, -1)));
    let jc = '', jp = 0;
    Object.keys(cur).forEach((c) => { const p = prev[c] || 0; if (p > 0) { const pct = Math.round((cur[c] - p) / p * 100); if (pct > jp) { jp = pct; jc = c; } } });
    if (jc && jp >= 30) out.push({ kind: 'warn', ic: 'trendUp', text: t('insCatJump').replace('{c}', catLabel(jc)).replace('{n}', jp) });
    return out.slice(0, 3);
  }
  function autoInsightsHtml() {
    const items = autoInsights(reportAnchor);
    if (!items.length) return '';
    return '<div class="section-title">' + t('insights') + '</div>' +
      '<div class="alerts">' + items.map((i) => alertItem(i.kind, i.ic, i.text)).join('') + '</div>';
  }
  // Month calendar heat-map: each day shaded by how much was spent.
  function spendingHeatmapHtml() {
    const anchor = reportAnchor;
    const mk = monthKey(anchor);
    const first = startOfMonth(anchor);
    const days = endOfMonth(anchor).getDate();
    const byDay = {}; let maxv = 0;
    DATA.transactions.forEach((tx) => {
      if (tx.type !== 'expense' || isAdjust(tx) || tx.date.slice(0, 7) !== mk) return;
      const d = parseInt(tx.date.slice(8, 10), 10);
      byDay[d] = (byDay[d] || 0) + tx.amount;
      if (byDay[d] > maxv) maxv = byDay[d];
    });
    const lead = (first.getDay() + 6) % 7; // Monday-first offset
    const todayStr = ymd(new Date());
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div class="hm-cell empty"></div>';
    for (let d = 1; d <= days; d++) {
      const v = byDay[d] || 0;
      const lvl = (v === 0 || maxv === 0) ? 0 : Math.min(4, Math.ceil(v / maxv * 4));
      const dateStr = mk + '-' + pad(d);
      cells += '<button class="hm-cell lvl-' + lvl + (dateStr === todayStr ? ' today' : '') + '" data-hmday="' + dateStr + '"' +
        (v ? ' title="' + fmtShort(v) + '"' : '') + '>' + d + '</button>';
    }
    const head = t('dows').map((dn) => '<div class="hm-dow">' + dn + '</div>').join('');
    return '<div class="section-title">' + t('spendingCalendar') + '</div>' +
      '<div class="card hm-card">' +
      '<div class="hm-grid hm-head">' + head + '</div>' +
      '<div class="hm-grid">' + cells + '</div>' +
      '<div class="hm-legend"><span>' + t('less') + '</span>' +
      [0, 1, 2, 3, 4].map((l) => '<span class="hm-cell sw lvl-' + l + '"></span>').join('') +
      '<span>' + t('more') + '</span></div></div>';
  }
  function trendData(txs, range) {
    let labels = [], inc = [], exp = [];
    if (reportPeriod === 'week') {
      labels = t('dows').slice();
      const s = startOfWeek(reportAnchor);
      for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(s.getDate() + i); const dt = ymd(d); const dd = txs.filter((x) => x.date === dt); inc.push(totals(dd).income); exp.push(totals(dd).expense); }
    } else if (reportPeriod === 'year') {
      for (let m = 0; m < 12; m++) { labels.push(t('moPrefix') + (m + 1)); const mk = reportAnchor.getFullYear() + '-' + pad(m + 1); const dd = txs.filter((x) => x.date.slice(0, 7) === mk); inc.push(totals(dd).income); exp.push(totals(dd).expense); }
    } else {
      const days = endOfMonth(reportAnchor).getDate(); const weeks = Math.ceil(days / 7);
      for (let w = 0; w < weeks; w++) { labels.push(t('weekLabel') + ' ' + (w + 1)); inc.push(0); exp.push(0); }
      txs.forEach((x) => { if (isAdjust(x)) return; const day = parseInt(x.date.slice(8, 10), 10); const wi = Math.min(weeks - 1, Math.floor((day - 1) / 7)); if (x.type === 'income') inc[wi] += x.amount; else exp[wi] += x.amount; });
    }
    return { labels, inc, exp };
  }

  /* ============== Trend analysis & forecast ============== */
  // Monthly expense totals for the `months` months ending at the anchored month.
  function monthlyExpenseSeries(months, anchor) {
    const out = [];
    const base = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const ym = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      const expense = DATA.transactions
        .filter((x) => x.type === 'expense' && !isAdjust(x) && x.date.slice(0, 7) === ym)
        .reduce((a, b) => a + b.amount, 0);
      out.push({ ym: ym, label: t('moPrefix') + (d.getMonth() + 1), expense: expense });
    }
    return out;
  }
  // Centered moving average (window must be odd, e.g. 3) — the smoothed trend line.
  function movingAvg(vals, win) {
    const half = Math.floor(win / 2);
    return vals.map((_, i) => {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(vals.length - 1, i + half); j++) { s += vals[j]; c++; }
      return c ? Math.round(s / c) : 0;
    });
  }
  // Flag months whose spend exceeds the trailing mean by ≥2 standard deviations (z-score).
  function detectSpikes(series) {
    const out = [];
    for (let i = 0; i < series.length; i++) {
      const window = series.slice(Math.max(0, i - 6), i).map((s) => s.expense);
      if (window.length < 3) continue;
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const sd = Math.sqrt(window.reduce((a, b) => a + (b - mean) * (b - mean), 0) / window.length);
      if (sd > 0 && mean > 0) {
        const z = (series[i].expense - mean) / sd;
        // Require both a high z-score AND a meaningful (≥25%) jump, so tiny wiggles on
        // near-flat months don't register as false spikes.
        if (z >= 2 && series[i].expense >= mean * 1.25) {
          out.push({ ym: series[i].ym, label: series[i].label, expense: series[i].expense, z: Math.round(z * 10) / 10 });
        }
      }
    }
    return out;
  }
  // Ordinary least-squares projection of the next month (needs ≥4 data points).
  function linRegForecast(vals) {
    const n = vals.length;
    if (n < 4) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const x = i + 1, y = vals[i]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const denom = n * sxx - sx * sx;
    if (!denom) return null;
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    return Math.max(0, Math.round(slope * (n + 1) + intercept));
  }
  function trendsForecastHtml() {
    const title = '<div class="section-title">' + t('trendForecast') + '</div>';
    const series = monthlyExpenseSeries(12, reportAnchor).filter((_, i, arr) => {
      // drop leading all-zero months before the first real transaction so the trend isn't skewed
      return arr.slice(0, i + 1).some((s) => s.expense > 0);
    });
    // Always render the section; show an empty state until there's enough history to chart.
    if (series.length < 2) {
      return title + '<div class="card"><div class="empty">' + t('trendEmpty') + '</div></div>';
    }
    const expenses = series.map((s) => s.expense);
    const trend = movingAvg(expenses, 3);
    const spikes = detectSpikes(series);
    const forecast = linRegForecast(expenses);

    const labels = series.map((s) => s.label).concat(forecast != null ? ['→ ' + t('forecastLabel')] : []);
    const actualData = expenses.concat(forecast != null ? [null] : []);
    const trendData2 = trend.concat(forecast != null ? [null] : []);
    // forecast dataset: bridge from the last actual point into the projected month
    const forecastData = forecast != null
      ? series.map(() => null).slice(0, -1).concat([expenses[expenses.length - 1], forecast])
      : null;

    const expColor = getComputedStyle(document.body).getPropertyValue('--expense').trim() || '#ef4444';
    const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#6366f1';
    const warnColor = getComputedStyle(document.body).getPropertyValue('--warning').trim() || '#f59e0b';

    setTimeout(() => {
      const ds = [
        { label: t('actualLabel'), data: actualData, color: expColor, fill: true },
        { label: t('trendLabel'), data: trendData2, color: accentColor },
      ];
      if (forecastData) ds.push({ label: t('forecastLabel'), data: forecastData, color: warnColor, dashed: true });
      window.Charts.lines('repTrendLine', labels, ds);
    }, 0);

    let extras = '';
    if (forecast != null) {
      extras += '<div class="forecast-pill">' + icon('target') + ' ' + t('forecastLabel') + ': <b>' +
        fmtShort(forecast) + '</b>' + t('perMonth') + '</div>';
    } else {
      extras += '<div class="hint">' + t('needMoreData') + '</div>';
    }
    if (spikes.length) {
      extras += spikes.map((s) => alertItem('warn', 'trendUp',
        '<b>' + s.label + '</b>: ' + t('spikeMonth') + ' · ' + fmtShort(s.expense))).join('');
    }
    if (forecast != null) extras += '<div class="hint">' + t('forecastNote') + '</div>';

    return title +
      '<div class="card"><div class="chart-box tall"><canvas id="repTrendLine"></canvas></div></div>' +
      '<div class="forecast-extras">' + extras + '</div>';
  }

  /* ============== Net worth (assets vs liabilities) ============== */
  function netWorthHtml() {
    const accs = activeAccounts();
    if (!accs.length) return '<div class="section-title">' + t('netWorth') + '</div>' +
      '<div class="empty">' + t('noAccountsNw') + '</div>';
    const nw = netWorth();
    const assetAccs = accs.filter((a) => accountClass(a) !== 'liability');
    const liabAccs = accs.filter((a) => accountClass(a) === 'liability');

    const accRow = (a) => {
      const isLia = accountClass(a) === 'liability';
      const b = accountBalance(a.id);
      const shown = isLia ? Math.max(0, -b) : b;
      let sub = '';
      if (a.type === 'credit_card') {
        const cyc = cardCycle(a);
        const bits = [];
        if (cyc.utilization != null) bits.push(t('utilization') + ' ' + cyc.utilization + '%');
        if (cyc.minPayment > 0) bits.push(t('minPayment') + ' ' + fmtShort(cyc.minPayment));
        if (cyc.dueDate) bits.push(t('dueDate') + ' ' + cyc.dueDate);
        if (bits.length) sub = '<div class="nw-acc-sub">' + bits.join(' · ') + '</div>';
      }
      if (a.type === 'gold') {
        const per = goldBuyPerChi(a);
        const bits = [fmtChi(a.goldWeightChi) + ' ' + t('unitChi'), goldKindLabel(a.goldKind)];
        if ((a.goldFactor || 1) !== 1) bits.push(Math.round((a.goldFactor || 1) * 100) + '%');
        if (per) bits.push('~' + fmtShort(per) + '/' + t('unitChi'));
        let pnlBit = '';
        if (a.goldBuyPerChi) {
          const p = goldPnl(a);
          const sign = p.pnl >= 0 ? '+' : '−';
          pnlBit = ' · <span class="' + (p.pnl >= 0 ? 'income' : 'expense') + '">' +
            mask(sign + fmtShort(Math.abs(p.pnl)) + (p.pct != null ? ' (' + sign + (Math.abs(Math.round(p.pct * 1000) / 10)) + '%)' : '')) + '</span>';
        }
        sub = '<div class="nw-acc-sub">' + bits.join(' · ') + pnlBit + '</div>';
      }
      return '<div class="nw-acc">' +
        '<div class="nw-acc-main">' + accountTypeIcon(a.type) + '<span>' + esc(a.name) + '</span></div>' +
        '<div class="nw-acc-val ' + (isLia ? 'neg' : '') + '">' + mask((isLia ? '−' : '') + fmtShort(shown)) + '</div>' +
        sub + '</div>';
    };

    // Gold strip: price freshness + total unrealized P&L + on-demand refresh.
    const goldAccs = assetAccs.filter((a) => a.type === 'gold');
    let goldBar = '';
    if (goldAccs.length) {
      const fa = goldPriceFetchedAt();
      const usesMarket = goldAccs.some((a) => a.goldKind && a.goldKind !== 'custom');
      const when = fa ? t('priceUpdatedAt') + ' ' + pad(fa.getDate()) + '/' + pad(fa.getMonth() + 1) + ' ' + pad(fa.getHours()) + ':' + pad(fa.getMinutes()) : '';
      const stale = usesMarket && (!fa || (Date.now() - fa.getTime() > 24 * 3600 * 1000))
        ? '<span class="gold-stale">' + t('priceStale') + '</span>' : '';
      const hasBasis = goldAccs.some((a) => a.goldBuyPerChi);
      const pnlTotal = totalGoldPnl();
      goldBar = '<div class="gold-price-bar">' +
        '<div class="gold-price-info">' + (when ? '<span>' + when + '</span>' : '') + stale +
        (hasBasis ? '<span class="gold-pnl-total ' + (pnlTotal >= 0 ? 'income' : 'expense') + '">' + t('goldPnlTotal') + ': ' +
          mask((pnlTotal >= 0 ? '+' : '−') + fmtShort(Math.abs(pnlTotal))) + '</span>' : '') + '</div>' +
        (usesMarket ? '<button type="button" id="goldRefreshBtn" class="ghost-btn sm">' + icon('refresh') + ' ' + t('updateGoldPrice') + '</button>' : '') +
        '</div>';
    }

    return '<div class="section-title">' + t('netWorth') + ' · ' + t('netWorthNow') + '</div>' +
      '<div class="nw-hero"><div class="nw-hero-label">' + icon('scale') + ' ' + t('netWorth') + '</div>' +
      '<div class="nw-hero-val ' + (nw.net < 0 ? 'neg' : '') + '">' + mask(fmtVND(nw.net)) + '</div></div>' +
      '<div class="summary-grid">' +
      '<div class="sum-cell income"><span>' + t('totalAssets') + '</span><b>' + mask(fmtShort(nw.assets)) + '</b></div>' +
      '<div class="sum-cell expense"><span>' + t('totalLiabilities') + '</span><b>' + mask(fmtShort(nw.liabilities)) + '</b></div>' +
      '</div>' + goldBar +
      (assetAccs.length ? '<div class="nw-group-title">' + t('assets') + '</div><div class="nw-list">' + assetAccs.map(accRow).join('') + '</div>' : '') +
      (liabAccs.length ? '<div class="nw-group-title">' + t('liabilities') + '</div><div class="nw-list">' + liabAccs.map(accRow).join('') + '</div>' : '');
  }

  // Wrap a report section as an atomic card (skipped when empty so the masonry
  // grid never gets blank cells). See .report-grid / .dash-card in style.css.
  function reportCard(inner) { return inner ? '<section class="dash-card">' + inner + '</section>' : ''; }

  // Aggregate spending by WHO IT WAS SPENT FOR (beneficiary) for the given period.
  // NULL beneficiary = "Chung (cả nhà)". Only buckets that actually have activity are
  // returned (idle members are omitted — the full roster lives in the add/edit picker).
  // "Chung" is pinned first, the rest sorted by expense desc. Transfers are ignored.
  function beneficiaryTotals(txs) {
    const by = {};
    txs.forEach((tx) => {
      if (tx.type === 'transfer' || isAdjust(tx)) return;
      const k = tx.beneficiaryId || '';
      const b = by[k] || (by[k] = { expense: 0, income: 0 }); // unknown id (left household) still counted
      if (tx.type === 'income') b.income += tx.amount; else b.expense += tx.amount;
    });
    const keys = Object.keys(by).sort((a, b) => {
      if (a === '') return -1; if (b === '') return 1;   // "Chung" always first
      return by[b].expense - by[a].expense;              // then most-spent-for first
    });
    return {
      keys: keys,
      labels: keys.map((k) => (k === '' ? t('beneficiaryShared') : memberName(k))),
      exp: keys.map((k) => by[k].expense),
      inc: keys.map((k) => by[k].income),
    };
  }

  // Spending by beneficiary: an expense bar chart (id 'repBeneficiary') + a numeric
  // breakdown list (amount · %). The chart itself is drawn in viewReports() once the
  // canvas is in the DOM. Skipped entirely when there's no expense in the period.
  function byBeneficiaryHtml(pp) {
    const totalExp = pp.exp.reduce((a, b) => a + b, 0);
    if (!totalExp) return '';
    const rows = pp.keys.map((k, i) => {
      if (!pp.exp[i]) return '';
      const pct = Math.round(pp.exp[i] / totalExp * 100);
      return '<div class="ben-row"><span class="ben-name">' + esc(pp.labels[i]) + '</span>' +
        '<span class="ben-amt">' + mask(fmtShort(pp.exp[i])) + ' · ' + pct + '%</span></div>';
    }).join('');
    return '<div class="section-title">' + t('byBeneficiary') + '</div>' +
      '<div class="card"><div class="chart-box tall"><canvas id="repBeneficiary"></canvas></div>' +
      '<div class="ben-list">' + rows + '</div></div>';
  }

  /* ============== Monthly close (chốt sổ) ============== */
  function anchorFromPeriod(p) { const parts = String(p || '').split('-'); return new Date(Number(parts[0]), (Number(parts[1]) || 1) - 1, 1); }

  // Compute ALL numbers for the month containing `anchor`. This object is what gets
  // stored in monthly_reports.metrics and re-rendered — reuses totals/byCategory/etc.
  function buildMonthlyClose(anchor) {
    const cur = inRange(startOfMonth(anchor), endOfMonth(anchor));
    const prevA = addMonths(anchor, -1);
    const prev = inRange(startOfMonth(prevA), endOfMonth(prevA));
    const tt = totals(cur), pt = totals(prev);
    const curCat = byCategory(cur), prevCat = byCategory(prev);
    const rate = tt.income ? Math.round(tt.net / tt.income * 100) : 0;

    const cats = Object.keys(curCat).map((c) => {
      const p = prevCat[c] || 0;
      return { category: c, amount: curCat[c], pct: tt.expense ? Math.round(curCat[c] / tt.expense * 100) : 0,
        prevAmount: p, deltaPct: p ? Math.round((curCat[c] - p) / p * 100) : null };
    }).sort((a, b) => b.amount - a.amount);

    const allCats = {}; Object.keys(curCat).forEach((c) => { allCats[c] = 1; }); Object.keys(prevCat).forEach((c) => { allCats[c] = 1; });
    const movers = Object.keys(allCats).map((c) => {
      const a = curCat[c] || 0, p = prevCat[c] || 0;
      return { category: c, deltaAbs: a - p, deltaPct: p ? Math.round((a - p) / p * 100) : null };
    }).filter((m) => m.deltaAbs !== 0).sort((a, b) => Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs)).slice(0, 3);

    const budget = Object.keys(DATA.budgets || {}).filter((c) => DATA.budgets[c] > 0).map((c) => {
      const spent = curCat[c] || 0, b = DATA.budgets[c];
      return { category: c, budget: b, spent: spent, pctUsed: Math.round(spent / b * 100),
        status: spent >= b ? 'critical' : (spent >= b * 0.8 ? 'warning' : 'ok') };
    }).sort((a, b) => b.pctUsed - a.pctUsed);

    const recurring = (DATA.recurring || []).filter((r) => r.active !== false && r.type !== 'income')
      .map((r) => ({ name: r.name, amount: r.amount, category: r.category }));
    const recurringTotal = recurring.reduce((a, r) => a + (r.amount || 0), 0);

    const prior = monthlyExpenseSeries(4, anchor).slice(0, 3).map((s) => s.expense).filter((v) => v > 0);
    const avg3m = prior.length ? Math.round(prior.reduce((a, b) => a + b, 0) / prior.length) : null;

    const wins = [];
    if (pt.income && rate > Math.round(pt.net / pt.income * 100)) wins.push('savingsUp');
    if (avg3m && tt.expense < avg3m) wins.push('belowAvg');
    const cutCat = cats.find((c) => c.deltaPct != null && c.deltaPct <= -15);
    if (cutCat) wins.push('catDown:' + cutCat.category);

    return { period: monthKey(anchor), income: tt.income, expense: tt.expense, net: tt.net, savingsRate: rate,
      prev: { income: pt.income, expense: pt.expense, net: pt.net }, avg3m: avg3m,
      categories: cats, movers: movers, budget: budget, recurring: recurring, recurringTotal: recurringTotal, wins: wins };
  }

  // Safe, aggregated payload for the AI — NO per-transaction notes, NO beneficiary names.
  function aiPayload(m) {
    return { period: m.period, income: m.income, expense: m.expense, net: m.net, savingsRate: m.savingsRate,
      prevExpense: m.prev.expense, avg3mExpense: m.avg3m,
      topCategories: m.categories.slice(0, 8).map((c) => ({ name: c.category, amount: c.amount, pct: c.pct, deltaPct: c.deltaPct })),
      movers: m.movers.map((x) => ({ name: x.category, deltaAbs: x.deltaAbs, deltaPct: x.deltaPct })),
      overBudget: m.budget.filter((b) => b.status !== 'ok').map((b) => ({ name: b.category, budget: b.budget, spent: b.spent })),
      recurring: m.recurring.map((r) => ({ name: r.name, amount: r.amount })), recurringTotal: m.recurringTotal };
  }

  // Card shown at the top of Reports (month view only): close / view / re-close.
  function monthlyCloseCardHtml() {
    const pk = monthKey(reportAnchor);
    const saved = (DATA.monthlyReports || []).find((r) => r.period === pk);
    const canClose = canManageConfig();
    let action;
    if (saved) {
      action = '<button class="ghost-btn" data-openclose="' + pk + '">' + icon('chart') + ' ' + t('viewReport') + '</button>' +
        (canClose ? '<button class="ghost-btn" data-reclose="' + pk + '">' + icon('refresh') + ' ' + t('reclose') + '</button>' : '');
    } else if (canClose) {
      action = '<button class="primary-btn" data-openclose="' + pk + '">' + icon('check') + ' ' + t('closeThisMonth').replace('{m}', pk) + '</button>';
    } else {
      action = '<div class="hint">' + t('notClosedYet') + '</div>';
    }
    const status = saved ? '<div class="hint">' + t('closedOn').replace('{d}', new Date(saved.closedAt).toLocaleDateString()) + '</div>' : '';
    return '<div class="section-title">' + t('monthlyClose') + '</div><div class="card close-card">' + status +
      '<div class="close-actions">' + action + '</div></div>';
  }

  // Pure render of a month report (used both live and for saved snapshots).
  function renderMonthlyReport(m, ai, editable) {
    const netCls = m.net >= 0 ? 'income' : 'expense';
    let h = '<div class="summary-grid">' +
      '<div class="sum-cell income"><span>' + t('income') + '</span><b>' + mask(fmtShort(m.income)) + '</b>' + deltaChip(m.income, m.prev.income, true) + '</div>' +
      '<div class="sum-cell expense"><span>' + t('expense') + '</span><b>' + mask(fmtShort(m.expense)) + '</b>' + deltaChip(m.expense, m.prev.expense, false) + '</div>' +
      '<div class="sum-cell ' + netCls + '"><span>' + t('savings') + '</span><b>' + mask(fmtShort(m.net)) + '</b>' + deltaChip(m.net, m.prev.net, true) + '</div>' +
      '<div class="sum-cell neutral"><span>' + t('savingsRate') + '</span><b>' + m.savingsRate + '%</b></div></div>';

    const cmp = [];
    if (m.prev.expense) { const d = Math.round((m.expense - m.prev.expense) / m.prev.expense * 100); cmp.push(t('vsPrevMonth') + ': ' + (d > 0 ? '+' : '') + d + '%'); }
    if (m.avg3m) { const d = Math.round((m.expense - m.avg3m) / m.avg3m * 100); cmp.push(t('vs3mAvg') + ': ' + (d > 0 ? '+' : '') + d + '%'); }
    if (cmp.length) h += '<div class="close-cmp hint">' + cmp.join('  ·  ') + '</div>';

    if (m.categories.length) {
      h += '<div class="section-title">' + t('byCategory') + '</div><div class="close-cats">' +
        m.categories.map((c) => '<div class="close-cat-row">' + catIcon(c.category) +
          '<span class="cc-name">' + esc(catLabel(c.category)) + '</span>' +
          '<span class="cc-amt">' + mask(fmtShort(c.amount)) + ' · ' + c.pct + '%</span>' +
          (c.deltaPct != null ? deltaChip(c.amount, c.prevAmount, false) : '') + '</div>').join('') + '</div>';
    }
    if (m.movers.length) {
      h += '<div class="section-title">' + t('movers') + '</div><div class="close-movers">' +
        m.movers.map((x) => '<div class="close-mover ' + (x.deltaAbs > 0 ? 'up' : 'down') + '">' + catIcon(x.category) + ' ' +
          esc(catLabel(x.category)) + ' <b>' + (x.deltaAbs > 0 ? '+' : '−') + mask(fmtShort(Math.abs(x.deltaAbs))) + '</b>' +
          (x.deltaPct != null ? ' (' + (x.deltaPct > 0 ? '+' : '') + x.deltaPct + '%)' : '') + '</div>').join('') + '</div>';
    }
    if (m.budget.length) {
      h += '<div class="section-title">' + t('budgetProgress') + '</div><div class="close-budget">' +
        m.budget.map((b) => '<div class="close-bud-row ' + b.status + '"><span>' + esc(catLabel(b.category)) + '</span>' +
          '<span>' + mask(fmtShort(b.spent)) + ' / ' + mask(fmtShort(b.budget)) + ' · ' + b.pctUsed + '%</span></div>').join('') + '</div>';
    }
    if (m.recurring.length) {
      h += '<div class="section-title">' + t('recurringDetected') + ' · ' + mask(fmtShort(m.recurringTotal)) + t('perMonth') + '</div><div class="close-rec">' +
        m.recurring.map((r) => '<div class="close-rec-row"><span>' + esc(r.name) + '</span><span>' + mask(fmtShort(r.amount)) + '</span></div>').join('') + '</div>';
    }
    if (m.wins && m.wins.length) {
      h += '<div class="section-title">' + t('wins') + '</div><div class="alerts">' +
        m.wins.map((w) => {
          let txt = w;
          if (w === 'savingsUp') txt = t('winSavingsUp');
          else if (w === 'belowAvg') txt = t('winBelowAvg');
          else if (w.indexOf('catDown:') === 0) txt = t('winCatDown').replace('{c}', catLabel(w.slice(8)));
          return alertItem('good', 'trendDown', txt);
        }).join('') + '</div>';
    }

    h += '<div class="section-title">' + t('aiReviewTitle') + '</div>';
    if (ai) {
      h += '<div class="ai-review">';
      if (ai.summary) h += '<p class="ai-summary">' + esc(ai.summary) + '</p>';
      if (ai.observations && ai.observations.length) h += '<ul class="ai-obs">' + ai.observations.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ul>';
      if (ai.suggestions && ai.suggestions.length) h += '<div class="ai-sugs">' + ai.suggestions.map((s) =>
        '<div class="ai-sug"><span class="prio ' + s.priority + '">' + t('prio' + s.priority.charAt(0).toUpperCase() + s.priority.slice(1)) + '</span>' +
        '<span class="sug-action">' + esc(s.action) + (s.estSaving ? ' <b class="sug-save">' + t('estSaving') + ' ' + mask(fmtShort(s.estSaving)) + '</b>' : '') + '</span></div>').join('') + '</div>';
      h += '</div>';
    } else if (editable) {
      h += '<div class="ai-empty"><button class="ghost-btn" id="mcGenAi">' + icon('target') + ' ' + t('genAiReview') + '</button>' +
        '<div class="hint">' + t('aiPrivacyNote') + '</div></div>';
    } else {
      h += '<div class="hint">' + t('noAiReview') + '</div>';
    }
    return h;
  }

  // Open the month report modal. View saved snapshot, or compute live to close / re-close.
  function openMonthlyClose(period, opts) {
    opts = opts || {};
    const saved = (DATA.monthlyReports || []).find((r) => r.period === period);
    const viewOnly = !!saved && !opts.reclose;
    const metrics = viewOnly ? saved.metrics : buildMonthlyClose(anchorFromPeriod(period));
    let curReview = viewOnly ? saved.aiReview : null;
    const canClose = canManageConfig();

    const footer = viewOnly
      ? '<button class="ghost-btn" id="mcClose">' + t('closeReport') + '</button>' +
        (canClose ? '<button class="ghost-btn" id="mcReclose">' + icon('refresh') + ' ' + t('reclose') + '</button>' : '')
      : '<button class="ghost-btn" id="mcClose">' + t('cancel') + '</button>' +
        (canClose ? '<button class="primary-btn" id="mcSave">' + icon('check') + ' ' + t('monthlyClose') + '</button>' : '');

    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal close-modal">' +
      '<div class="card-title">' + icon('chart') + ' ' + t('monthOverview') + ' · ' + esc(period) + '</div>' +
      '<div class="close-body" id="mcBody">' + renderMonthlyReport(metrics, curReview, !viewOnly) + '</div>' +
      '<div class="modal-actions">' + footer + '</div></div></div>';
    document.body.appendChild(wrap.firstChild);

    const close = () => { const mo = document.getElementById('modalBackdrop'); if (mo) mo.remove(); };
    const wireBody = () => {
      const gen = document.getElementById('mcGenAi');
      if (gen) gen.addEventListener('click', () => {
        if (!window.Parser.aiReviewAvailable()) { toast(t('aiNeedKey'), 'error'); return; }
        busy(gen, async () => {
          gen.innerHTML = icon('refresh') + ' ' + t('closeGenerating');
          try {
            curReview = await window.Parser.reviewMonth(aiPayload(metrics));
            const b = document.getElementById('mcBody'); if (b) b.innerHTML = renderMonthlyReport(metrics, curReview, !viewOnly);
            wireBody();
          } catch (e) { toast(e.message || t('aiFailed'), 'error'); gen.innerHTML = icon('target') + ' ' + t('genAiReview'); }
        });
      });
    };

    document.getElementById('mcClose').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    const reclose = document.getElementById('mcReclose');
    if (reclose) reclose.addEventListener('click', () => { close(); openMonthlyClose(period, { reclose: true }); });
    const save = document.getElementById('mcSave');
    if (save) save.addEventListener('click', () => busy(save, async () => {
      try {
        const s2 = await window.Store.upsertMonthlyReport({ period: metrics.period, metrics: metrics, aiReview: curReview || null });
        const i = DATA.monthlyReports.findIndex((r) => r.period === s2.period);
        if (i >= 0) DATA.monthlyReports[i] = s2; else DATA.monthlyReports.push(s2);
        toast(t('closeSaved'), 'success'); close(); render();
      } catch (e) { toast(e.message, 'error'); }
    }));
    wireBody();
  }

  function viewReports() {
    const { s, e } = reportRange();
    const txs = inRange(s, e);
    const tt = totals(txs);
    const byCat = byCategory(txs);
    const rate = tt.income ? Math.round(tt.net / tt.income * 100) : 0;
    const pr = prevReportRange();
    const pt = totals(inRange(pr.s, pr.e));
    const td = trendData(txs, { s, e });
    const pp = beneficiaryTotals(txs);
    const incColor = getComputedStyle(document.body).getPropertyValue('--income').trim() || '#10b981';
    const expColor = getComputedStyle(document.body).getPropertyValue('--expense').trim() || '#ef4444';
    const top = txs.filter((x) => x.type === 'expense' && !isAdjust(x)).sort((a, b) => b.amount - a.amount).slice(0, 5);

    setTimeout(() => {
      window.Charts.donut('repDonut', 'repLegend', byCat, (cat) => { filterCategory = cat; filterMonth = monthKey(reportAnchor); currentTab = 'transactions'; render(); }, catLabel);
      window.Charts.bars('repTrend', td.labels, [
        { label: t('income'), data: td.inc, color: incColor },
        { label: t('expense'), data: td.exp, color: expColor },
      ]);
      const benL = [], benE = [];
      pp.keys.forEach((k, i) => { if (pp.exp[i]) { benL.push(pp.labels[i]); benE.push(pp.exp[i]); } });
      if (benE.length) window.Charts.bars('repBeneficiary', benL, [
        { label: t('expense'), data: benE, color: expColor },
      ]);
    }, 0);

    const periodBtn = (p, label) => '<button class="seg-btn ' + (reportPeriod === p ? 'active' : '') + '" data-period="' + p + '">' + label + '</button>';

    return (
      '<div class="seg period-seg">' + periodBtn('week', t('week')) + periodBtn('month', t('month')) + periodBtn('year', t('year')) + '</div>' +
      '<div class="period-nav"><button class="nav-arrow" data-shift="-1">' + icon('left') + '</button>' +
      '<span class="period-label">' + reportLabel() + '</span>' +
      '<button class="nav-arrow" data-shift="1">' + icon('right') + '</button></div>' +

      reportWrapUpHtml(tt, pt, byCat) +

      (reportPeriod === 'month' ? reportCard(monthlyCloseCardHtml()) : '') +

      '<div class="summary-grid">' +
      '<div class="sum-cell income"><span>' + t('income') + '</span><b>' + fmtShort(tt.income) + '</b>' + deltaChip(tt.income, pt.income, true) + '</div>' +
      '<div class="sum-cell expense"><span>' + t('expense') + '</span><b>' + fmtShort(tt.expense) + '</b>' + deltaChip(tt.expense, pt.expense, false) + '</div>' +
      '<div class="sum-cell ' + (tt.net >= 0 ? 'income' : 'expense') + '"><span>' + t('savings') + '</span><b>' + fmtShort(tt.net) + '</b>' + deltaChip(tt.net, pt.net, true) + '</div>' +
      '<div class="sum-cell neutral"><span>' + t('savingsRate') + '</span><b>' + rate + '%</b></div>' +
      '</div>' +

      // Charts side by side on a wide screen
      '<div class="dash">' +
      reportCard('<div class="section-title">' + t('trend') + '</div>' +
        '<div class="card"><div class="chart-box tall"><canvas id="repTrend"></canvas></div></div>') +
      reportCard('<div class="section-title">' + t('byCategory') + '</div>' +
        '<div class="card"><div class="chart-box"><canvas id="repDonut"></canvas></div><div id="repLegend" class="legend"></div></div>') +
      '</div>' +

      // Remaining sections: balanced 2-column masonry so cards are evenly sized.
      '<div class="report-grid">' +
      reportCard(reportPeriod === 'month' ?
        '<div class="section-title">' + t('budgetProgress') + '</div><div class="budget-list">' +
        budgetBarsHtml(byCat, DATA.budgets, monthElapsedFraction(reportAnchor)) + '</div>' : '') +
      // Auto insights + spending calendar (month view only)
      reportCard(reportPeriod === 'month' ? autoInsightsHtml() : '') +
      reportCard(reportPeriod === 'month' ? spendingHeatmapHtml() : '') +
      // Trend analysis & forecast (rolling monthly window, independent of the period selector)
      reportCard(trendsForecastHtml()) +
      // Net worth: assets vs liabilities (current snapshot)
      reportCard(netWorthHtml()) +
      // Spending split by who each transaction was spent for (beneficiary)
      reportCard(byBeneficiaryHtml(pp)) +
      reportCard('<div class="section-title">' + t('topSpending') + '</div>' +
        '<div class="tx-list">' + (top.length ? top.map(txRow).join('') : '<div class="empty">' + t('noTx') + '</div>') + '</div>') +
      '</div>'
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
    const catOpts = '<option value="">' + t('allCats') + '</option>' + cats().map((c) => '<option value="' + c + '"' + (c === filterCategory ? ' selected' : '') + '>' + catLabel(c) + '</option>').join('');
    const typeOpts = '<option value="">' + t('allTypes') + '</option><option value="expense"' + (filterType === 'expense' ? ' selected' : '') + '>' + t('expense') + '</option><option value="income"' + (filterType === 'income' ? ' selected' : '') + '>' + t('income') + '</option>';

    let body = '';
    const dates = Object.keys(groups).sort().reverse();
    if (!dates.length) body = '<div class="empty">' + t('noTx') + '</div>';
    else dates.forEach((d) => {
      const dayExp = groups[d].filter((x) => x.type === 'expense' && !isAdjust(x)).reduce((a, b) => a + b.amount, 0);
      body += '<div class="day-head"><span>' + d + '</span><span class="day-sum">−' + fmtShort(dayExp) + '</span></div>';
      body += groups[d].map(txRow).join('');
    });

    return (
      '<div class="quick-add"><input id="txInput" type="text" list="txSuggest" placeholder="' + t('placeholder') + '" autocomplete="off"/>' +
      '<button id="addBtn" class="add-btn-inline">' + icon('plus') + '</button></div>' +
      '<datalist id="txSuggest">' + inputSuggestions().map((s) => '<option value="' + esc(s) + '"></option>').join('') + '</datalist>' +
      dateBar('txDate') +
      (accountSelect('txAccount') ? '<div class="acct-row">' + icon('wallet') + accountSelect('txAccount') + '</div>' : '') +
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
      dateBar('txDateBig') +
      (accountSelect('txAccountBig') ? '<div class="acct-row">' + icon('wallet') + accountSelect('txAccountBig') + '</div>' : '') +
      '<div class="acct-row">' + icon('user') +
        '<label class="sr-only" for="txBeneficiaryBig">' + t('spentFor') + '</label>' + beneficiarySelect('txBeneficiaryBig', '') + '</div>' +
      '<div class="add-photos-label">' + t('evidence') + ' <span class="add-photos-opt">(' + t('optional') + ')</span></div>' +
      '<div class="add-photos" id="addPhotos"></div>' +
      '<button id="addBtnBig" class="primary-btn">' + icon('plus') + ' ' + t('add') + '</button>' +
      (spendableAccounts().length >= 2 ? '<button id="transferBtn" class="ghost-btn transfer-btn">' + icon('transfer') + ' ' + t('transferBetween') + '</button>' : '') +
      templateChipsHtml() +
      '<div class="examples">' +
      ['ăn sáng 35k', 'lương 15 triệu', 'đổ xăng 80k', 'cafe 2 triệu rưỡi', 'grab 1tr2', 'tiền điện 500 nghìn', 'mua giày 800k', 'khám bệnh 250k']
        .map((ex) => '<button class="chip" data-ex="' + ex + '">' + ex + '</button>').join('') +
      '</div></div>';
  }

  /* ============== VIEW: Settings ============== */
  // Resolve a member's effective role: the role column, with a fallback to "owner"
  // for the household creator (covers older rows before the role backfill ran).
  function memberRole(m) {
    if (m.role) return m.role;
    const ownerId = DATA.household && DATA.household.createdBy;
    return (ownerId && ownerId === m.userId) ? 'owner' : 'member';
  }
  function membersHtml() {
    if (!householdMembers.length) return '';
    const meIsOwner = iAmOwner();
    const rows = householdMembers.map((m) => {
      const isSelf = m.userId === currentUserId;
      const role = memberRole(m);
      const isOwn = role === 'owner';
      const label = esc(m.email || t('unknownMember')) + (isSelf ? ' <span class="member-you">(' + t('you') + ')</span>' : '');
      const roleCls = isOwn ? 'owner' : (role === 'admin' ? 'admin' : '');
      // Action buttons. The owner manages everyone else; a non-owner can only leave.
      let act = '';
      if (meIsOwner && !isSelf) {
        const uid = esc(m.userId);
        if (role === 'admin') {
          act += '<button class="icon-btn" data-setrole="' + uid + '" data-role="member" title="' + t('removeAdmin') + '">' + icon('shield') + '</button>';
        } else {
          act += '<button class="icon-btn" data-setrole="' + uid + '" data-role="admin" title="' + t('makeAdmin') + '">' + icon('shield') + '</button>';
        }
        act += '<button class="icon-btn" data-makeowner="' + uid + '" title="' + t('makeOwner') + '">' + icon('crown') + '</button>';
        act += '<button class="icon-btn danger" data-remove="' + uid + '" title="' + t('confirmRemoveMember') + '">' + icon('trash') + '</button>';
      } else if (isSelf && !isOwn) {
        act = '<button class="icon-btn danger" data-leave="1" title="' + t('leaveHousehold') + '">' + icon('right') + '</button>';
      }
      return '<div class="member-row">' +
        '<div class="member-info"><div class="member-email">' + label + '</div>' +
        '<div class="member-role ' + roleCls + '">' + roleLabel(role) + '</div></div>' +
        (act ? '<div class="member-actions">' + act + '</div>' : '') + '</div>';
    }).join('');
    return '<div class="member-list">' + rows + '</div>';
  }

  // Editable list of wallets in Settings (name, type, opening balance, delete) + add button.
  function walletEditRowHtml(acc) {
    const a = acc || { id: '', name: '', type: 'cash', openingBalance: 0 };
    const typeOpts = ACCOUNT_TYPES.map((ty) => '<option value="' + ty + '"' + (ty === a.type ? ' selected' : '') + '>' + accountTypeLabel(ty) + '</option>').join('');
    const balHtml = acc ? '<span class="w-bal">= ' + fmtShort(accountBalance(a.id)) + '</span>' : '';
    // Existing wallets get quick actions: snap balance to reality, and view this wallet's history.
    // "Đổi số dư" is asset-only — the positive-only money input can't express a liability's owed
    // amount — and never for gold: its value comes from weight × price, not from transactions.
    const wAdjustBtn = (acc && !LIABILITY_TYPES.includes(a.type) && a.type !== 'gold')
      ? '<button type="button" class="ghost-btn sm w-adjust" data-acc="' + esc(a.id) + '">' + icon('edit') + ' ' + t('adjustBalance') + '</button>' : '';
    const wActs = acc ? '<div class="wallet-edit-acts">' + wAdjustBtn +
      '<button type="button" class="ghost-btn sm w-history" data-acc="' + esc(a.id) + '">' + icon('clock') + ' ' + t('walletHistory') + '</button>' +
      '</div>' : '';
    const isLia = LIABILITY_TYPES.includes(a.type);
    const isGold = a.type === 'gold';
    // Gold: current value + P&L preview (rendered from the SAVED state; it refreshes on save).
    let goldLive = '';
    if (acc && isGold) {
      const per = goldBuyPerChi(a);
      goldLive = '<div class="wg-live">' + t('goldValueNow') + ': <b>' + mask(fmtShort(goldValue(a))) + '</b>' +
        (per ? ' <span class="wg-per">(' + fmtShort(per) + '/' + t('unitChi') + ' ≈ ' + fmtShort(per * 10) + t('goldPerLuong') + ')</span>'
             : ' <span class="wg-per">' + t('goldNoPrice') + '</span>');
      if (a.goldBuyPerChi) {
        const p = goldPnl(a);
        const sign = p.pnl >= 0 ? '+' : '−';
        goldLive += '<div class="wg-pnl ' + (p.pnl >= 0 ? 'income' : 'expense') + '">' + t('unrealizedPnl') + ': ' +
          mask(sign + fmtShort(Math.abs(p.pnl)) + (p.pct != null ? ' (' + sign + (Math.abs(Math.round(p.pct * 1000) / 10)) + '%)' : '')) + '</div>';
      }
      goldLive += '</div>';
    }
    const gKindSel = a.goldKind || 'sjc';
    const gKindOpts = GOLD_KINDS.map((k) => '<option value="' + k + '"' + (k === gKindSel ? ' selected' : '') + '>' + goldKindLabel(k) + '</option>').join('');
    const goldFields = '<div class="wallet-gold-fields' + (isGold ? '' : ' hidden') + '">' +
      '<div class="wg-grid">' +
      '<label>' + t('goldWeight') +
      '<div class="wg-weight"><input type="number" step="0.001" min="0" class="w-gweight" value="' + fmtChi(a.goldWeightChi || 0) + '"/>' +
      '<div class="wg-unit w-gunit"><button type="button" class="on" data-unit="chi">' + t('unitChi') + '</button>' +
      '<button type="button" data-unit="luong">' + t('unitLuong') + '</button></div></div></label>' +
      '<label>' + t('goldKind') + '<select class="w-gkind">' + gKindOpts + '</select></label>' +
      '<label>' + t('goldFactor') + '<input type="number" step="0.1" min="1" class="w-gfactor" value="' + (Math.round((a.goldFactor != null ? a.goldFactor : 1) * 10000) / 100) + '"/></label>' +
      '</div>' +
      '<label class="w-gcustom-row' + (gKindSel === 'custom' ? '' : ' hidden') + '">' + t('goldCustomBuy') +
      '<input type="text" inputmode="numeric" class="w-gcustom js-money" value="' + groupMoney(a.goldCustomBuy != null ? a.goldCustomBuy : '') + '"/></label>' +
      '<div class="wg-grid2">' +
      '<label>' + t('goldBuyPrice') + '<input type="text" inputmode="numeric" class="w-gbuy js-money" value="' + groupMoney(a.goldBuyPerChi != null ? a.goldBuyPerChi : '') + '"/></label>' +
      '<label>' + t('goldBuyDate') + '<input type="date" class="w-gbuydate" value="' + esc(a.goldBuyDate || '') + '"/></label>' +
      '</div>' + goldLive +
      '<div class="wc-hint">' + t('goldBuyHint') + ' ' + t('goldSpreadHint') + '</div>' +
      '</div>';
    // Star toggles this wallet as the household default (the one pre-selected on entry).
    // The chosen default is applied on Save. New (unsaved) rows can't be default yet.
    const defBtn = '<button class="icon-btn w-default' + (a.isDefault ? ' on' : '') + '"' +
      ' data-setdef="1" aria-pressed="' + (a.isDefault ? 'true' : 'false') + '"' +
      ' title="' + t('setDefaultWallet') + '">' + icon('star') + '</button>';
    return '<div class="wallet-edit-row' + (a.isDefault ? ' is-default' : '') + '" data-acc="' + esc(a.id) + '">' +
      '<div class="wallet-edit-main">' +
      '<input type="text" class="w-name" value="' + esc(a.name) + '" placeholder="' + t('walletName') + '"/>' +
      '<select class="w-type">' + typeOpts + '</select>' +
      defBtn +
      (acc ? '<button class="icon-btn danger" data-delacc="' + esc(a.id) + '" title="' + t('delete') + '">' + icon('trash') + '</button>' : '') +
      '</div>' +
      // Opening balance does not apply to gold (value = weight × price) — hidden there.
      '<div class="wallet-edit-sub' + (isGold ? ' hidden' : '') + '"><label>' + t('openingBalance') + '</label>' +
      '<input type="text" inputmode="numeric" class="w-open js-money" value="' + groupMoney(a.openingBalance || 0) + '"/>' + balHtml +
      '</div>' +
      // User-set switch: storage wallets opt out of entry forms (spend via transfer).
      // Gold never takes transactions at all, so the switch is hidden there.
      '<label class="w-allowtx-row' + (isGold ? ' hidden' : '') + '" title="' + esc(t('walletAllowTxHint')) + '">' +
      '<input type="checkbox" class="w-allowtx"' + (a.allowTx !== false ? ' checked' : '') + '/>' +
      '<span>' + t('walletAllowTx') + '</span></label>' +
      wActs +
      '<div class="wallet-credit-fields' + (isLia ? '' : ' hidden') + '">' +
      '<div class="wc-grid">' +
      '<label>' + t('creditLimit') + '<input type="text" inputmode="numeric" class="w-limit js-money" value="' + groupMoney(a.creditLimit != null ? a.creditLimit : '') + '"/></label>' +
      '<label>' + t('statementDay') + '<input type="number" min="1" max="31" class="w-stmt" value="' + (a.statementDay || '') + '"/></label>' +
      '<label>' + t('dueDay') + '<input type="number" min="1" max="31" class="w-due" value="' + (a.dueDay || '') + '"/></label>' +
      '</div>' +
      '<div class="wc-hint">' + t('liabilityHint') + '</div>' +
      '</div>' + goldFields + '</div>';
  }
  function walletsEditorHtml() {
    const accs = activeAccounts();
    const rows = accs.length ? accs.map((a) => walletEditRowHtml(a)).join('') : '<div class="empty">' + t('noWallets') + '</div>';
    return '<div class="wallet-edit" id="walletEdit">' + rows + '</div>' +
      '<div class="wallet-edit-actions">' +
      '<button id="addWalletBtn" class="ghost-btn">' + icon('plus') + ' ' + t('addWallet') + '</button>' +
      '<button id="saveWalletsBtn" class="primary-btn">' + icon('wallet') + ' ' + t('save') + '</button>' +
      '</div>';
  }

  // One tappable row in an iOS-style grouped list.
  //   o = { ic, tint, label, value, page, action, control, danger, noChevron }
  function iosRow(o) {
    const tappable = !!(o.page || o.action);
    const attrs =
      (o.page ? ' data-page="' + o.page + '"' : '') +
      (o.action ? ' data-saction="' + o.action + '"' : '');
    const val = (o.value != null && o.value !== '') ? '<span class="ios-row-value">' + o.value + '</span>' : '';
    const right = o.control || ((tappable && !o.noChevron) ? '<span class="ios-row-chev">' + icon('right') + '</span>' : '');
    const tag = tappable ? 'button' : 'div';
    const cls = 'ios-row' + (tappable ? ' tappable' : '') + (o.danger ? ' danger' : '');
    return '<' + tag + ' class="' + cls + '"' + attrs + '>' +
      (o.ic ? '<span class="ios-ic tint-' + (o.tint || 'gray') + '">' + icon(o.ic) + '</span>' : '') +
      '<span class="ios-row-label">' + o.label + '</span>' + val + right +
      '</' + tag + '>';
  }
  function iosGroup(rows, header) {
    return (header ? '<div class="ios-grp-h">' + header + '</div>' : '') +
      '<div class="ios-group">' + rows.join('') + '</div>';
  }
  // Sticky iOS navigation bar + large title for a Settings sub-page.
  function iosNav(title) {
    return '<div class="ios-nav"><button class="ios-back" data-back="1">' + icon('left') +
      '<span>' + t('settings') + '</span></button></div>' +
      '<h1 class="ios-large-title">' + esc(title) + '</h1>';
  }

  // Root grouped menu (the Settings landing screen).
  // App version = the ?v= cache-bust on app.js, which the Release workflow keeps
  // in sync with the SemVer tag on every release. Falls back to '' if absent.
  const APP_VERSION = (function () {
    try {
      const s = document.querySelector('script[src*="js/app.js"]');
      const m = s && s.src.match(/[?&]v=([^&"]+)/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  })();

  // Monthly email report config — lives in household_settings (DATA.aiConfig),
  // read by the monthly-email Edge Function. NOT a window.CONFIG key.
  function emailReportCfg() {
    const s = (DATA && DATA.aiConfig && DATA.aiConfig.EMAIL_REPORT) || {};
    let day = Math.round(Number(s.sendDay)) || 3;
    day = Math.min(28, Math.max(1, day));
    return { enabled: s.enabled === true, sendDay: day };
  }
  async function saveEmailReportCfg(cfg) {
    DATA.aiConfig = await window.Store.saveHouseholdSettings({ EMAIL_REPORT: cfg });
  }

  function settingsRoot() {
    const hh = DATA.household || { name: '' };
    const accs = activeAccounts();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const themeSwitch = '<span class="ios-switch' + (isDark ? ' on' : '') + '"><span class="ios-knob"></span></span>';
    return '<h1 class="ios-large-title ios-root-title">' + t('settings') + '</h1>' +
      iosGroup([
        iosRow({ ic: 'wallet', tint: 'indigo', label: t('household'), value: esc(hh.name), page: 'household' }),
        iosRow({ ic: 'more', tint: 'blue', label: t('members'), value: householdMembers.length ? String(householdMembers.length) : '', page: 'members' }),
        (canManageConfig() ? iosRow({ ic: 'clock', tint: 'gray', label: t('activity'), page: 'activity' }) : ''),
        iosRow({ ic: 'check', tint: 'green', label: t('account'), value: esc(currentUserEmail || ''), page: 'account' }),
      ], t('grpAccount')) +
      iosGroup([
        iosRow({ ic: 'target', tint: 'red', label: t('budget'), page: 'budget' }),
        iosRow({ ic: 'list', tint: 'indigo', label: t('categories'), value: String(cats().length), page: 'cats' }),
        iosRow({ ic: 'card', tint: 'orange', label: t('wallets'), value: accs.length ? String(accs.length) : '', page: 'wallets' }),
        iosRow({ ic: 'zap', tint: 'green', label: t('quickTemplates'), value: getTemplates().length ? String(getTemplates().length) : '', page: 'templates' }),
        iosRow({ ic: 'piggy', tint: 'pink', label: t('savingsGoals'), value: (DATA.goals && DATA.goals.length) ? String(DATA.goals.length) : '', page: 'goals' }),
        iosRow({ ic: 'refresh', tint: 'blue', label: t('recurring'), value: (DATA.recurring && DATA.recurring.length) ? String(DATA.recurring.length) : '', page: 'recurring' }),
      ], t('grpMoney')) +
      iosGroup([
        iosRow({ ic: 'globe', tint: 'teal', label: t('language'), value: (lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'), action: 'lang' }),
        iosRow({ ic: 'moon', tint: 'purple', label: t('darkMode'), control: themeSwitch, action: 'theme', noChevron: true }),
        iosRow({ ic: 'bell', tint: 'orange', label: t('reminder'), value: (getReminderCfg().enabled ? getReminderCfg().time : ''), page: 'reminder' }),
      ], t('grpGeneral')) +
      iosGroup([
        iosRow({ ic: 'spark', tint: 'pink', label: t('aiCategorize'), page: 'ai' }),
        iosRow({ ic: 'mail', tint: 'blue', label: t('emailReport'), value: emailReportCfg().enabled ? t('emailOnBadge') : '', page: 'email' }),
        (canManageConfig() ? iosRow({ ic: 'chart', tint: 'teal', label: t('storageUsage'), page: 'storage' }) : ''),
        iosRow({ ic: 'settings', tint: 'gray', label: t('connTitle'), page: 'supabase' }),
      ], t('grpAdvanced')) +
      iosGroup([
        iosRow({ ic: 'right', tint: 'red', label: t('signOut'), action: 'signout', danger: true, noChevron: true }),
      ]) +
      (APP_VERSION ? '<p class="ios-version">' + esc(t('appName')) + ' v' + esc(APP_VERSION) + '</p>' : '');
  }

  // A read-only notice + a disabled <fieldset> wrapper. Native `disabled` greys out and
  // blocks every form control inside, so members see the config but can't change it.
  function lockBanner(msg) {
    return '<div class="lock-banner">' + icon('lock') + '<span>' + (msg || t('ownerOnlyHint')) + '</span></div>';
  }
  function roLock(html, msg) {
    return lockBanner(msg) + '<fieldset class="ro-lock" disabled>' + html + '</fieldset>';
  }

  /* ============== VIEW: Storage usage ============== */
  // Plan quotas aren't visible from SQL — these are the Supabase Free plan
  // limits; the RPC measures what's used and the app shows used vs limit.
  const STORAGE_PLAN = { dbMb: 500, filesMb: 1024 };
  async function loadStorageUsage() {
    storageLoading = true;
    storageUsage = await window.Store.getStorageUsage();
    storageLoading = false;
  }
  function fmtBytes(n) {
    const loc = lang === 'vi' ? 'vi-VN' : 'en-US';
    const f = (v, d) => v.toLocaleString(loc, { maximumFractionDigits: d });
    if (n >= 1073741824) return f(n / 1073741824, 2) + ' GB';
    if (n >= 1048576) return f(n / 1048576, 1) + ' MB';
    if (n >= 1024) return f(n / 1024, 0) + ' KB';
    return Math.round(n) + ' B';
  }
  // One "used vs plan limit" bar, reusing the budget bar styles.
  function usageBarHtml(label, usedBytes, limitMb) {
    const limit = limitMb * 1024 * 1024;
    const raw = limit ? usedBytes / limit * 100 : 0;
    const pct = Math.min(100, Math.round(raw));
    let cls = 'ok'; if (raw >= 90) cls = 'danger'; else if (raw >= 70) cls = 'warn';
    return '<div class="budget-row">' +
      '<div class="budget-top"><span class="budget-cat">' + label + '</span>' +
      '<span class="budget-nums' + (raw >= 100 ? ' over' : '') + '">' + fmtBytes(usedBytes) + ' / ' + fmtBytes(limit) + ' · ' + pct + '%</span></div>' +
      '<div class="budget-track"><div class="budget-fill ' + cls + '" style="width:' + pct + '%"></div></div></div>';
  }

  /* ============== VIEW: Activity log ============== */
  async function loadActivity() {
    activityLoading = true;
    try { activityLog = await window.Store.listActivity({ limit: 100 }); }
    catch (e) { activityLog = []; }
    activityLoading = false;
  }
  // Map the source-table name (stored in `entity`) to a localized noun and an icon.
  const ENTITY_LABEL = {
    transactions: 'entTransaction', budgets: 'entBudget', accounts: 'entAccount',
    goals: 'entGoal', recurring: 'entRecurring', household_members: 'entMember', households: 'entHousehold',
  };
  const ENTITY_ICON = {
    transactions: 'file', budgets: 'target', accounts: 'card',
    goals: 'piggy', recurring: 'refresh', household_members: 'more', households: 'wallet',
  };
  function entityLabel(entity) { return t(ENTITY_LABEL[entity] || 'entTransaction'); }
  function entityIcon(entity) { return ENTITY_ICON[entity] || 'more'; }
  // A short, human-readable description of WHAT changed, built from the row snapshot.
  function describeActivity(e) {
    const d = (e.summary && e.summary.data) || {};
    switch (e.entity) {
      case 'transactions': {
        if (d.type === 'transfer') return t('transfer') + (d.amount != null ? ' · ' + fmtShort(d.amount) : '');
        const parts = [];
        if (d.category) parts.push(d.category === ADJUST_CATEGORY ? t('balanceAdjustLabel') : catLabel(d.category));
        if (d.amount != null) parts.push(fmtShort(d.amount));
        let s = parts.join(' · ');
        if (d.note) s += ' — ' + d.note;
        return s;
      }
      case 'budgets': return catLabel(d.category) + ': ' + fmtShort(d.amount || 0);
      case 'accounts':
      case 'goals':
      case 'recurring': return d.name || '';
      case 'household_members': return (d.email || '') + (d.role ? ' (' + roleLabel(d.role) + ')' : '');
      case 'households': return d.name || '';
      default: return '';
    }
  }
  function fmtDateTime(iso) {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return '';
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }
  // ----- Activity detail: turn a row snapshot into readable field/value lines -----
  const ACT_HIDE_KEYS = new Set(['id', 'household_id', 'created_at', 'updated_at', 'recurring_id', 'raw_input', 'sort_order', 'user_id', 'created_by']);
  const ACT_MONEY_KEYS = new Set(['amount', 'opening_balance', 'target_amount', 'credit_limit', 'current_amount', 'saved_amount']);
  function actFieldLabel(key) {
    const m = {
      amount: t('amount'), type: t('walletType'), category: t('category'), note: t('note'),
      date: t('date'), time: t('time'), name: t('walletName'), role: t('role'), email: 'Email',
      opening_balance: t('openingBalance'), target_amount: t('amount'), credit_limit: t('creditLimit'),
      account_id: t('fromWallet'), to_account_id: t('toWallet'), beneficiary_id: t('spentFor'),
    };
    return m[key] || key;
  }
  function actFieldValue(key, val) {
    if (val == null || val === '') return '—';
    if (ACT_MONEY_KEYS.has(key)) return fmtShort(Number(val) || 0);
    if (key === 'category') return val === ADJUST_CATEGORY ? t('balanceAdjustLabel') : catLabel(val);
    if (key === 'account_id' || key === 'to_account_id') { const a = accountById(val); return a ? a.name : String(val).slice(0, 8); }
    if (key === 'beneficiary_id') return memberName(val);
    if (key === 'type') return val === 'income' ? t('income') : (val === 'expense' ? t('expense') : t('transfer'));
    if (key === 'role') return roleLabel(val);
    if (typeof val === 'boolean') return val ? '✓' : '—';
    return String(val);
  }
  // Field/value rows for one log entry: changed fields (before → after) for edits, else the full snapshot.
  function activityDetailHtml(e) {
    const after = (e.summary && e.summary.data) || {};
    const before = (e.summary && e.summary.prev) || null;
    const keys = Object.keys(after).filter((k) => !ACT_HIDE_KEYS.has(k));
    const rows = [];
    if (e.action === 'update' && before) {
      keys.forEach((k) => {
        if (String(after[k]) === String(before[k])) return;
        rows.push('<div class="act-d-row"><span class="act-d-k">' + esc(actFieldLabel(k)) + '</span>' +
          '<span class="act-d-v"><s>' + esc(actFieldValue(k, before[k])) + '</s> → ' + esc(actFieldValue(k, after[k])) + '</span></div>');
      });
      if (!rows.length) return '<div class="act-d-row"><span class="act-d-k">' + t('noFieldChanges') + '</span></div>';
    } else {
      keys.forEach((k) => {
        if (after[k] == null || after[k] === '') return;
        rows.push('<div class="act-d-row"><span class="act-d-k">' + esc(actFieldLabel(k)) + '</span>' +
          '<span class="act-d-v">' + esc(actFieldValue(k, after[k])) + '</span></div>');
      });
    }
    return rows.join('') || '<div class="act-d-row"><span class="act-d-k">—</span></div>';
  }
  function openActivityDetail(id) {
    const e = activityLog.find((x) => x.id === id); if (!e) return;
    const verb = e.action === 'insert' ? t('actAdd') : (e.action === 'delete' ? t('actDel') : t('actEdit'));
    const who = e.userEmail ? e.userEmail.split('@')[0] : t('unknownMember');
    const actCls = e.action === 'insert' ? 'add' : (e.action === 'delete' ? 'del' : 'edit');
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon(entityIcon(e.entity)) + ' ' + t('activityDetail') + '</div>' +
      '<div class="act-d-head"><span class="act-badge ' + actCls + '">' + verb + '</span> ' + esc(entityLabel(e.entity)) +
      ' · <b>' + esc(who) + '</b> · ' + esc(fmtDateTime(e.createdAt)) + '</div>' +
      '<div class="act-d-body">' + activityDetailHtml(e) + '</div>' +
      '<div class="modal-actions"><button class="ghost-btn" id="adClose">' + t('cancel') + '</button></div>' +
      '</div></div>';
    document.body.appendChild(wrap.firstChild);
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    document.getElementById('adClose').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (ev) => { if (ev.target.id === 'modalBackdrop') close(); });
  }
  function activityRowHtml(e) {
    const verb = e.action === 'insert' ? t('actAdd') : (e.action === 'delete' ? t('actDel') : t('actEdit'));
    const who = e.userEmail ? e.userEmail.split('@')[0] : t('unknownMember');
    const desc = describeActivity(e);
    const actCls = e.action === 'insert' ? 'add' : (e.action === 'delete' ? 'del' : 'edit');
    const search = (who + ' ' + entityLabel(e.entity) + ' ' + verb + ' ' + (desc || '')).toLowerCase();
    return '<div class="activity-row" data-actentry="' + esc(e.id) + '" data-search="' + esc(search) + '">' +
      '<div class="act-ic ' + actCls + '">' + icon(entityIcon(e.entity)) + '</div>' +
      '<div class="act-main">' +
      '<div class="act-title"><b>' + esc(who) + '</b> ' + verb + ' ' + esc(entityLabel(e.entity)) + '</div>' +
      (desc ? '<div class="act-desc">' + esc(desc) + '</div>' : '') +
      '<div class="act-when">' + esc(fmtDateTime(e.createdAt)) + '</div>' +
      '</div><span class="ios-row-chev">' + icon('right') + '</span></div>';
  }

  // One editable category row. Existing rows carry their id in data-cat (and the
  // original name in data-name); brand-new rows have neither — created on Save.
  // 'Thu nhập' (isSystem) is locked: parser & reports depend on it.
  // The icon cell is readonly — tapping it opens the emoji picker (openEmojiPicker),
  // which also offers free typing and "use default".
  function catEditRowHtml(c) {
    if (!c) {
      return '<div class="cat-edit-row is-new">' +
        '<input type="text" class="c-emoji" maxlength="4" readonly placeholder="+" title="' + t('emojiPickTitle') + '"/>' +
        '<input type="text" class="c-name" placeholder="' + t('catName') + '"/>' +
        '<select class="c-type"><option value="expense">' + t('expense') + '</option><option value="income">' + t('income') + '</option></select>' +
        '<button type="button" class="icon-btn danger" data-rmcatrow="1" title="' + t('delete') + '">' + icon('x') + '</button>' +
        '</div>';
    }
    const locked = c.isSystem;
    const used = DATA.transactions.some((tx) => tx.category === c.name) ||
      (DATA.recurring || []).some((r) => r.category === c.name);
    let action = '';
    if (!locked) {
      action = c.archived
        ? '<button type="button" class="icon-btn" data-catarch="' + esc(c.id) + '" data-to="0" title="' + t('catShow') + '">' + icon('eye') + '</button>'
        : '<button type="button" class="icon-btn" data-catarch="' + esc(c.id) + '" data-to="1" title="' + t('catHide') + '">' + icon('eyeOff') + '</button>';
      if (!used) action += '<button type="button" class="icon-btn danger" data-catdel="' + esc(c.name) + '" title="' + t('delete') + '">' + icon('trash') + '</button>';
    }
    return '<div class="cat-edit-row' + (c.archived ? ' is-archived' : '') + '" data-cat="' + esc(c.id) + '" data-name="' + esc(c.name) + '">' +
      '<input type="text" class="c-emoji" maxlength="4" readonly value="' + esc(c.emoji || '') + '" placeholder="+" title="' + t('emojiPickTitle') + '"' + (locked ? ' disabled' : '') + '/>' +
      '<input type="text" class="c-name" value="' + esc(c.name) + '"' + (locked ? ' disabled' : '') + '/>' +
      '<span class="c-typelabel">' + (c.type === 'income' ? t('income') : t('expense')) + '</span>' +
      action + '</div>';
  }

  // 16 icons for the most familiar spending walks of life. Picked from a sheet
  // (tap the icon cell); free typing and "use default" stay available.
  const EMOJI_PRESETS = ['🍜', '🛒', '🛍️', '🚗', '⛽', '🏠', '🧾', '📱', '💊', '📚', '👶', '🐶', '🎬', '✈️', '🎁', '💰'];
  function openEmojiPicker(target) {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon('spark') + ' ' + t('emojiPickTitle') + '</div>' +
      '<div class="emoji-grid">' + EMOJI_PRESETS.map((e2) =>
        '<button type="button" class="emoji-opt' + (target.value === e2 ? ' sel' : '') + '" data-emoji="' + e2 + '">' + e2 + '</button>').join('') + '</div>' +
      '<label style="margin-top:12px;display:block">' + t('emojiCustom') + '</label>' +
      '<div class="emoji-custom-row"><input id="emojiCustom" type="text" maxlength="4" value="' + esc(target.value || '') + '" placeholder="🙂"/>' +
      '<button type="button" class="ghost-btn sm" id="emojiApply">' + t('save') + '</button></div>' +
      '<div class="modal-actions"><button class="ghost-btn" id="emojiDefault">' + t('emojiDefault') + '</button>' +
      '<button class="ghost-btn" id="emojiCancel">' + t('cancel') + '</button></div>' +
      '</div></div>';
    document.body.appendChild(wrap.firstChild);
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    const set = (v) => { target.value = v; close(); };
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    document.getElementById('emojiCancel').addEventListener('click', close);
    document.getElementById('emojiDefault').addEventListener('click', () => set(''));
    document.getElementById('emojiApply').addEventListener('click', () => set(document.getElementById('emojiCustom').value.trim()));
    document.querySelectorAll('#modalBackdrop [data-emoji]').forEach((b) => b.addEventListener('click', () => set(b.dataset.emoji)));
  }

  // A single Settings sub-page (reuses the existing form markup + element IDs).
  function settingsPageView(page) {
    const C = window.CONFIG;
    const hh = DATA.household || { id: '', name: '' };
    const f = (id, label, val, type) => '<div class="conn-row"><label>' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false"/></div>';
    let title = '';
    let body = '';

    if (page === 'budget') {
      title = t('budget');
      const budgetInputs = cats('expense').map((c) =>
        '<div class="budget-edit-row"><label>' + catIcon(c) + esc(catLabel(c)) + '</label>' +
        '<input type="text" inputmode="numeric" class="js-money" data-budget="' + c + '" value="' + groupMoney(DATA.budgets[c] || 0) + '"/></div>').join('');
      body = '<div class="ios-grp-h">' + t('budget') + ' (' + t('month').toLowerCase() + ')</div>' +
        '<div class="ios-card budget-edit">' + budgetInputs + '</div>' +
        '<button id="saveBudgetBtn" class="primary-btn">' + icon('target') + ' ' + t('saveBudget') + '</button>' +
        (canManageConfig() ? '<button class="link-btn" data-page="cats" style="margin-top:10px">' + t('manageCats') + ' ' + icon('right') + '</button>' : '');
      if (!canManageConfig()) body = roLock(body);
    } else if (page === 'cats') {
      title = t('categories');
      const rows = DATA.categories || [];
      if (!rows.length) {
        // First open seeds the defaults (see the data-page handler); if that
        // failed, the table doesn't exist yet → point at the schema.
        body = catsSeedPending ? '<div class="empty">…</div>'
          : '<div class="warn-hint">' + icon('alert') + ' ' + t('catsSchemaHint') + '</div>';
      } else {
        const head = '<div class="cat-edit-head"><span class="h-emoji">' + t('catEmoji') + '</span>' +
          '<span class="h-name">' + t('catName') + '</span><span class="h-type">' + t('catType') + '</span></div>';
        body = '<div class="hint">' + t('catsHint') + '</div>' + head +
          '<div id="catEdit" class="ios-card cat-edit">' + rows.map(catEditRowHtml).join('') + '</div>' +
          '<button id="addCatBtn" class="ghost-btn">' + icon('plus') + ' ' + t('addCategory') + '</button>' +
          '<button id="saveCatsBtn" class="primary-btn" style="margin-top:10px">' + icon('check') + ' ' + t('save') + '</button>';
        if (!canManageConfig()) body = roLock('<div class="hint">' + t('catsHint') + '</div>' + head +
          '<div class="ios-card cat-edit">' + rows.map(catEditRowHtml).join('') + '</div>');
      }
    } else if (page === 'wallets') {
      title = t('wallets');
      body = canManageConfig() ? walletsEditorHtml() : roLock(walletsEditorHtml());
    } else if (page === 'templates') {
      title = t('quickTemplates');
      body = '<div class="hint">' + t('templatesHint') + '</div>' + templatesEditorHtml();
    } else if (page === 'goals') {
      title = t('savingsGoals');
      body = '<div class="hint">' + t('goalsHint') + '</div>' + goalsEditorHtml();
      if (!canManageConfig()) body = roLock(body);
    } else if (page === 'recurring') {
      title = t('recurring');
      body = '<div class="hint">' + t('recurringHint') + '</div>' + recurringEditorHtml();
      if (!canManageConfig()) body = roLock(body);
    } else if (page === 'household') {
      title = t('household');
      const switchSel = (myHouseholds.length > 1 ?
        '<div class="conn-row" style="margin-bottom:12px"><label>' + t('switchHousehold') + '</label><select id="switchHh">' +
        myHouseholds.map((h) => '<option value="' + esc(h.id) + '"' + (hh.id === h.id ? ' selected' : '') + '>' + esc(h.name) + '</option>').join('') +
        '</select></div>' : '');
      // Renaming the household is owner-only; everyone can still see the name, copy the
      // invite code, and join another household.
      const renameBlock = iAmOwner()
        ? '<div class="conn-form"><div class="conn-row"><label>' + t('householdName') + '</label>' +
          '<input id="hhName" type="text" value="' + esc(hh.name) + '"/></div></div>' +
          '<button id="renameHhBtn" class="ghost-btn">' + icon('edit') + ' ' + t('save') + '</button>'
        : '<div class="conn-form"><div class="conn-row"><label>' + t('householdName') + '</label>' +
          '<input type="text" value="' + esc(hh.name) + '" readonly/></div></div>' +
          '<div class="hint">' + t('ownerOnlyRename') + '</div>';
      body = switchSel + renameBlock +
        '<div class="conn-row" style="margin-top:16px"><label>' + t('inviteCode') + '</label>' +
        '<input id="inviteCodeBox" type="text" value="' + esc(hh.id) + '" readonly/></div>' +
        '<button id="copyCodeBtn" class="ghost-btn">' + icon('file') + ' ' + t('copyCode') + '</button>' +
        '<div class="conn-row" style="margin-top:16px"><label>' + t('joinHousehold') + '</label>' +
        '<input id="joinCode" type="text" placeholder="' + t('joinCodePh') + '"/></div>' +
        '<button id="joinHhBtn" class="ghost-btn">' + icon('check') + ' ' + t('join') + '</button>';
    } else if (page === 'members') {
      title = t('members');
      const m = membersHtml();
      body = m || '<div class="empty">' + t('unknownMember') + '</div>';
    } else if (page === 'activity') {
      title = t('activity');
      if (!canManageConfig()) {
        body = lockBanner();
      } else {
        const list = activityLoading
          ? '<div class="empty">…</div>'
          : (activityLog.length
            ? '<div class="activity-list">' + activityLog.map(activityRowHtml).join('') + '</div>' +
              '<div class="empty" id="actNoMatch" style="display:none">' + t('noActMatch') + '</div>'
            : '<div class="empty">' + t('activityEmpty') + '</div>');
        body = '<div class="hint">' + t('activityHint') + '</div>' +
          '<div class="act-toolbar">' +
          '<input id="actSearch" type="text" class="act-search" placeholder="' + t('searchAct') + '" value="' + esc(activitySearch) + '"/>' +
          '<button id="refreshActBtn" class="ghost-btn sm" title="' + t('refresh') + '">' + icon('refresh') + '</button>' +
          '</div>' +
          list;
      }
    } else if (page === 'account') {
      title = t('account');
      body = '<div class="config-status ok">👤 ' + esc(currentUserEmail || '') + '</div>' +
        iosGroup([iosRow({ ic: 'right', tint: 'red', label: t('signOut'), action: 'signout', danger: true, noChevron: true })]);
    } else if (page === 'ai') {
      title = t('aiCategorize');
      // Keys are household-wide (stored in the DB, shared by every member/device).
      // Members see them read-only; only owner/admin can change them (RLS mirrors this).
      body = '<div class="hint">' + t('aiHint') + '</div>' +
        '<div class="conn-form">' +
        f('cfgGemini', t('geminiKey'), C.GEMINI_API_KEY, 'password') +
        f('cfgAnthropic', t('anthropicKey'), C.ANTHROPIC_API_KEY, 'password') + '</div>' +
        '<button id="saveConfigBtn" class="primary-btn">' + icon('check') + ' ' + t('save') + '</button>';
      if (!canManageConfig()) body = roLock(body);
    } else if (page === 'email') {
      title = t('emailReport');
      const cfg = emailReportCfg();
      const sw = '<span class="ios-switch' + (cfg.enabled ? ' on' : '') + '"><span class="ios-knob"></span></span>';
      body = iosGroup([
        iosRow({ ic: 'mail', tint: 'blue', label: t('emailReportOn'), control: sw, action: 'email-toggle', noChevron: true }),
      ]) +
        (cfg.enabled
          ? '<div class="conn-row" style="margin-top:14px"><label>' + t('emailSendDay') + '</label>' +
            '<input id="emailSendDay" type="number" min="1" max="28" inputmode="numeric" value="' + cfg.sendDay + '"/></div>' +
            '<button id="emailTestBtn" class="ghost-btn" style="margin-top:10px">' + icon('mail') + ' ' + t('emailTestSend') + '</button>'
          : '') +
        '<div class="hint">' + t('emailReportDesc') + '</div>' +
        '<div class="warn-hint">' + icon('alert') + ' ' + t('emailPrivacyNote') + '</div>';
      if (!canManageConfig()) body = roLock(body);
    } else if (page === 'storage') {
      title = t('storageUsage');
      if (!canManageConfig()) {
        body = lockBanner();
      } else if (storageLoading) {
        body = '<div class="empty">…</div>';
      } else if (!storageUsage) {
        body = '<div class="warn-hint">' + icon('alert') + ' ' + t('storageUnavailable') + '</div>';
      } else {
        body =
          usageBarHtml(t('storageDb'), storageUsage.dbBytes, STORAGE_PLAN.dbMb) +
          usageBarHtml(t('storageFiles') + ' · ' + t('storageFilesCount').replace('{n}', storageUsage.receiptsFiles), storageUsage.receiptsBytes, STORAGE_PLAN.filesMb) +
          '<button id="refreshStorageBtn" class="ghost-btn sm" style="margin-top:12px">' + icon('refresh') + ' ' + t('refresh') + '</button>' +
          '<div class="hint">' + t('storageHint') + '</div>';
      }
    } else if (page === 'supabase') {
      title = t('connTitle');
      body = '<div class="conn-form">' +
        f('cfgSupaUrl', t('supaUrl'), C.SUPABASE_URL) +
        f('cfgSupaKey', t('supaKey'), C.SUPABASE_ANON_KEY, 'password') + '</div>' +
        '<button id="saveSupaBtn" class="ghost-btn">' + icon('settings') + ' ' + t('saveConnect') + '</button>' +
        '<div class="hint">' + t('tokenHint') + '</div>' +
        '<div class="hint">' + t('supaWhyLocal') + '</div>';
    } else if (page === 'reminder') {
      title = t('reminder');
      const r = getReminderCfg();
      const sw = '<span class="ios-switch' + (r.enabled ? ' on' : '') + '"><span class="ios-knob"></span></span>';
      const blocked = ('Notification' in window) && Notification.permission === 'denied';
      body = iosGroup([
        iosRow({ ic: 'bell', tint: 'orange', label: t('reminderOn'), control: sw, action: 'remind-toggle', noChevron: true }),
      ]) +
        (r.enabled ? '<div class="conn-row" style="margin-top:14px"><label>' + t('reminderTime') + '</label>' +
          '<input id="remindTime" type="time" value="' + esc(r.time || '20:00') + '"/></div>' : '') +
        (blocked ? '<div class="warn-hint">' + icon('alert') + ' ' + t('reminderDenied') + '</div>' : '') +
        '<div class="hint">' + t('reminderHint') + '</div>';
    } else {
      settingsPage = null;
      return settingsRoot();
    }
    return iosNav(title) + '<div class="ios-page-body">' + body + '</div>';
  }

  function viewSettings() {
    const inner = settingsPage ? settingsPageView(settingsPage) : settingsRoot();
    return '<div class="ios-settings' + (settingsPage ? ' is-sub' : '') + '">' + inner + '</div>';
  }

  // iOS-style popup picker for the app language.
  function openLangPicker() {
    const opt = (code, label) => '<button class="ios-pick' + (lang === code ? ' sel' : '') + '" data-pick="' + code + '">' +
      '<span>' + label + '</span>' + (lang === code ? icon('check') : '') + '</button>';
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon('globe') + ' ' + t('chooseLanguage') + '</div>' +
      '<div class="ios-picklist">' + opt('vi', '🇻🇳 Tiếng Việt') + opt('en', '🇬🇧 English') + '</div>' +
      '<div class="modal-actions"><button class="ghost-btn" id="lpCancel">' + t('cancel') + '</button></div>' +
      '</div></div>';
    document.body.appendChild(wrap.firstChild);
    if (window.CustomSelect) window.CustomSelect.enhanceAll();
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    document.getElementById('lpCancel').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    document.querySelectorAll('#modalBackdrop [data-pick]').forEach((b) => b.addEventListener('click', () => {
      lang = b.dataset.pick; localStorage.setItem('lang', lang);
      const lt = document.getElementById('langToggle'); if (lt) lt.textContent = lang.toUpperCase();
      close(); render();
    }));
  }

  // Shared sign-out routine (used by the root menu and the Account sub-page).
  async function signOutNow() {
    try { window.Store.unsubscribeChanges(); } catch (e) { /* ignore */ }
    await window.Store.signOut();
    DATA = { household: null, budgets: {}, transactions: [] };
    showAuth('login');
  }

  /* ============== Transfer modal ============== */
  function openTransfer(existing) {
    const accs = spendableAccounts(); // gold wallets can't send or receive transfers
    if (accs.length < 2) { toast(t('needTwoWallets'), 'warn'); return; }
    const ex = existing || null;
    const fromSel = ex ? ex.accountId : defaultAccountId();
    const toSel = ex ? ex.toAccountId : (accs.find((a) => a.id !== fromSel) || accs[0]).id;
    const today = ymd(new Date());
    // Show each wallet's current balance in the label so the user can pick at a glance.
    const opt = (a, sel) => '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + ' · ' + fmtShort(accountBalance(a.id)) + '</option>';
    const fromOpts = accs.map((a) => opt(a, fromSel)).join('');
    const toOpts = accs.map((a) => opt(a, toSel)).join('');
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon('transfer') + ' ' + t('transferBetween') + '</div>' +
      '<label>' + t('fromWallet') + '</label><select id="tFrom">' + fromOpts + '</select>' +
      '<label>' + t('toWallet') + '</label><select id="tTo">' + toOpts + '</select>' +
      '<label>' + t('amount') + '</label><input id="tAmount" type="text" inputmode="numeric" class="js-money" value="' + groupMoney(ex ? ex.amount : '') + '"/>' +
      '<label>' + t('date') + '</label><input id="tDate" type="date" value="' + (ex ? esc(ex.date) : today) + '" max="' + today + '"/>' +
      '<label>' + t('note') + '</label><input id="tNote" type="text" value="' + (ex ? esc(ex.note) : '') + '"/>' +
      '<div class="modal-actions"><button class="ghost-btn" id="tCancel">' + t('cancel') + '</button>' +
      '<button class="primary-btn" id="tSave">' + t('save') + '</button></div></div></div>';
    document.body.appendChild(wrap.firstChild);
    if (window.CustomSelect) window.CustomSelect.enhanceAll();
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    document.getElementById('tCancel').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    const tSave = document.getElementById('tSave');
    tSave.addEventListener('click', () => busy(tSave, async () => {
      const from = document.getElementById('tFrom').value;
      const to = document.getElementById('tTo').value;
      const amount = readMoney(document.getElementById('tAmount'));
      const date = document.getElementById('tDate').value || today;
      const note = document.getElementById('tNote').value.trim();
      if (!amount) { toast(t('needAmount'), 'warn'); return; }
      if (from === to) { toast(t('sameWallet'), 'warn'); return; }
      const time = date === today ? new Date().toTimeString().slice(0, 5) : '';
      try {
        if (ex) {
          await window.Store.updateTransaction(ex.id, { amount: amount, date: date, time: time, note: note, accountId: from, toAccountId: to });
          Object.assign(ex, { amount: amount, date: date, time: time, note: note, accountId: from, toAccountId: to });
        } else {
          const saved = await window.Store.addTransaction({
            date: date, time: time, type: 'transfer', category: 'Chuyển khoản',
            note: note, amount: amount, accountId: from, toAccountId: to, rawInput: '',
          });
          DATA.transactions.unshift(saved);
        }
        close(); toast(t('transferDone'), 'success'); render();
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    }));
  }

  /* ============== Adjust balance & wallet history ============== */
  // "Đổi số dư": snap an asset wallet to its real balance by recording an adjustment transaction
  // for the difference (income when up, expense when down). Keeps the ledger intact, dated and
  // attributed, reversible, and excluded from spending reports (category = ADJUST_CATEGORY).
  function openAdjustBalance(id) {
    const acc = accountById(id); if (!acc) return;
    if (acc.type === 'gold') return; // gold ignores transactions — adjust weight/price instead
    if (!canManageConfig()) { toast(t('cantEditOthersTx'), 'warn'); return; }
    const cur = accountBalance(id);
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon('edit') + ' ' + t('adjustBalance') + ' · ' + esc(acc.name) + '</div>' +
      '<label>' + t('realBalance') + '</label><input id="abAmount" type="text" inputmode="numeric" class="js-money" value="' + groupMoney(cur > 0 ? cur : 0) + '"/>' +
      '<div class="wc-hint">' + t('adjustHint') + '</div>' +
      '<div class="modal-actions"><button class="ghost-btn" id="abCancel">' + t('cancel') + '</button>' +
      '<button class="primary-btn" id="abSave">' + t('save') + '</button></div></div></div>';
    document.body.appendChild(wrap.firstChild);
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    document.getElementById('abCancel').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    const abSave = document.getElementById('abSave');
    abSave.addEventListener('click', () => busy(abSave, async () => {
      const target = readMoney(document.getElementById('abAmount'));
      const delta = target - cur;
      if (!delta) { close(); return; }              // already correct — nothing to record
      const today = ymd(new Date());
      try {
        const saved = await window.Store.addTransaction({
          date: today, time: new Date().toTimeString().slice(0, 5),
          type: delta > 0 ? 'income' : 'expense', category: ADJUST_CATEGORY,
          note: t('balanceAdjustLabel'), amount: Math.abs(delta), accountId: id, rawInput: '',
        });
        DATA.transactions.unshift(saved);
        close(); toast(t('balanceAdjusted'), 'success'); render();
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    }));
  }

  // Every transaction that touched a wallet, oldest→newest, each stamped with the running
  // balance after it. Returned newest-first for display. delta: money into (+) / out of (−) the wallet.
  function walletHistory(id) {
    const acc = accountById(id);
    const rows = DATA.transactions.filter((tx) =>
      tx.accountId === id || (tx.type === 'transfer' && tx.toAccountId === id));
    rows.sort((a, b) => {
      const ka = a.date + (a.time || '') + (a.createdAt || '');
      const kb = b.date + (b.time || '') + (b.createdAt || '');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    let bal = acc ? (acc.openingBalance || 0) : 0;
    const out = rows.map((tx) => {
      let delta;
      if (tx.type === 'transfer') delta = tx.toAccountId === id ? tx.amount : -tx.amount;
      else delta = tx.type === 'income' ? tx.amount : -tx.amount;
      bal += delta;
      return { tx: tx, delta: delta, balanceAfter: bal };
    });
    return out.reverse();
  }

  function walletHistoryRow(h, id) {
    const tx = h.tx;
    const sign = h.delta >= 0 ? '+' : '−';
    const amtCls = h.delta >= 0 ? 'income' : 'expense';
    let label, ic;
    if (tx.type === 'transfer') {
      const other = accountById(tx.toAccountId === id ? tx.accountId : tx.toAccountId);
      const arrow = tx.toAccountId === id ? '← ' : '→ ';
      label = arrow + esc(other ? other.name : t('unassignedWallet'));
      ic = 'transfer';
    } else if (isAdjust(tx)) {
      label = t('balanceAdjustLabel'); ic = 'edit';
    } else {
      label = esc(catLabel(tx.category)); ic = null;
    }
    const editable = !isAdjust(tx) && canEditTx(tx);
    return '<div class="tx-row wh-row' + (editable ? ' wh-edit' : '') + '"' + (editable ? ' data-whedit="' + tx.id + '"' : '') + '>' +
      '<div class="tx-ic ' + (h.delta >= 0 ? 'income' : 'expense') + '">' + (ic ? icon(ic) : catIcon(tx.category)) + '</div>' +
      '<div class="tx-main"><div class="tx-note"><span class="tx-note-txt">' + label + '</span></div>' +
      '<div class="tx-meta">' + tx.date + (tx.time ? ' ' + tx.time : '') + ' · ' + esc(memberName(tx.userId)) + '</div></div>' +
      '<div class="tx-right"><div class="tx-amount ' + amtCls + '">' + sign + mask(fmtShort(Math.abs(h.delta))) + '</div>' +
      '<div class="wh-after">' + t('balanceAfter') + ' ' + mask(fmtShort(h.balanceAfter)) + '</div></div></div>';
  }

  // "Lịch sử ví": a drawer listing every movement of one wallet with who/when and running balance.
  function openWalletHistory(id) {
    const acc = accountById(id); if (!acc) return;
    const hist = walletHistory(id);
    const canAdjust = canManageConfig() && !LIABILITY_TYPES.includes(acc.type) && acc.type !== 'gold';
    const body = hist.length
      ? hist.map((h) => walletHistoryRow(h, id)).join('')
      : '<div class="empty">' + t('noWalletHistory') + '</div>';
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal wh-modal">' +
      '<div class="wh-head"><div class="wh-title">' + accountTypeIcon(acc.type) + ' <span>' + esc(acc.name) + '</span></div>' +
      '<div class="wh-bal ' + (accountBalance(id) < 0 ? 'neg' : '') + '">' + mask(fmtShort(accountBalance(id))) + '</div></div>' +
      (canAdjust ? '<div class="wh-actions"><button type="button" class="ghost-btn sm" id="whAdjust">' + icon('edit') + ' ' + t('adjustBalance') + '</button></div>' : '') +
      '<div class="tx-list wh-list">' + body + '</div>' +
      '<div class="modal-actions"><button class="ghost-btn" id="whClose">' + t('cancel') + '</button></div>' +
      '</div></div>';
    document.body.appendChild(wrap.firstChild);
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    document.getElementById('whClose').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    const adj = document.getElementById('whAdjust');
    if (adj) adj.addEventListener('click', () => { close(); openAdjustBalance(id); });
    document.querySelectorAll('#modalBackdrop [data-whedit]').forEach((r) =>
      r.addEventListener('click', () => { close(); openEdit(r.dataset.whedit); }));
  }

  /* ============== Edit modal ============== */
  function openEdit(id) {
    const tx = DATA.transactions.find((x) => x.id === id); if (!tx) return;
    if (!canEditTx(tx)) { toast(t('cantEditOthersTx'), 'warn'); return; }
    if (isAdjust(tx)) return;                          // balance adjustments have no editable fields
    if (tx.type === 'transfer') { openTransfer(tx); return; }
    const catOpts = catOptionsFor(tx.category);
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon('edit') + ' ' + t('edit') + '</div>' +
      '<label>' + t('amount') + '</label><input id="eAmount" type="text" inputmode="numeric" class="js-money" value="' + groupMoney(tx.amount) + '"/>' +
      '<label>' + t('category') + '</label><select id="eCat">' + catOpts + '</select>' +
      '<label>' + t('note') + '</label><input id="eNote" type="text" value="' + esc(tx.note) + '"/>' +
      '<div class="edit-datetime"><div><label>' + t('date') + '</label><input id="eDate" type="date" value="' + esc(tx.date) + '" max="' + ymd(new Date()) + '"/></div>' +
      '<div><label>' + t('time') + '</label><input id="eTime" type="time" value="' + esc(tx.time || '') + '"/></div></div>' +
      (accountSelect('eAccount', tx.accountId) ? '<label>' + t('wallet') + '</label>' + accountSelect('eAccount', tx.accountId) : '') +
      '<label>' + t('spentFor') + '</label>' + beneficiarySelect('eBeneficiary', tx.beneficiaryId) +
      '<div class="seg" style="margin-top:10px"><button class="seg-btn ' + (tx.type === 'expense' ? 'active' : '') + '" data-type="expense">' + t('expense') + '</button>' +
      '<button class="seg-btn ' + (tx.type === 'income' ? 'active' : '') + '" data-type="income">' + t('income') + '</button></div>' +
      '<div class="edit-evidence" id="evidenceBox"></div>' +
      '<div class="modal-actions"><button class="ghost-btn" id="eCancel">' + t('cancel') + '</button>' +
      '<button class="primary-btn" id="eSave">' + t('save') + '</button></div></div></div>';
    document.body.appendChild(wrap.firstChild);
    if (window.CustomSelect) window.CustomSelect.enhanceAll();
    fillEvidenceBox(tx);
    let newType = tx.type;
    document.querySelectorAll('#modalBackdrop .seg-btn').forEach((b) => b.addEventListener('click', () => {
      newType = b.dataset.type;
      document.querySelectorAll('#modalBackdrop .seg-btn').forEach((x) => x.classList.remove('active')); b.classList.add('active');
    }));
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    document.getElementById('eCancel').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    const eSave = document.getElementById('eSave');
    eSave.addEventListener('click', () => busy(eSave, async () => {
      const fields = {
        amount: readMoney(document.getElementById('eAmount')),
        category: document.getElementById('eCat').value,
        note: document.getElementById('eNote').value.trim(),
        type: newType,
        date: document.getElementById('eDate').value || tx.date,
        time: document.getElementById('eTime').value || '',
      };
      const eAcct = document.getElementById('eAccount');
      if (eAcct) fields.accountId = eAcct.value || null;
      const eBen = document.getElementById('eBeneficiary');
      if (eBen) fields.beneficiaryId = eBen.value || null;
      try {
        await window.Store.updateTransaction(tx.id, fields);
        Object.assign(tx, fields);
        close(); toast(t('save') + ' ✓', 'success'); render();
      } catch (err) {
        toast(t('syncError') + ': ' + err.message, 'error');
      }
    }));
  }

  /* ============== Nav ============== */
  function renderNav() {
    const nav = document.getElementById('bottomNav');
    if (!nav) return;
    const item = (tab, ic, label) => '<button class="nav-btn ' + (currentTab === tab ? 'active' : '') + '" data-tab="' + tab + '"' + (currentTab === tab ? ' aria-current="page"' : '') + '>' +
      '<span class="nav-ic">' + icon(ic) + '</span>' +
      '<span>' + label + '</span></button>';
    nav.innerHTML =
      item('overview', 'wallet', t('overview')) +
      item('reports', 'chart', t('reports')) +
      '<button class="nav-fab ' + (currentTab === 'add' ? 'active' : '') + '" data-tab="add" data-label="' + esc(t('add')) + '" title="' + esc(t('add')) + '">' + icon('plus') + '</button>' +
      item('transactions', 'list', t('txs')) +
      item('settings', 'settings', t('settings'));
    nav.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { currentTab = b.dataset.tab; render(); }));
  }

  /* ============== Render + wire ============== */
  function render() {
    rebuildAttachIndex();
    if (currentTab !== 'add') clearPendingAddFiles(); // don't carry chosen photos to other tabs
    if (currentTab !== 'settings') settingsPage = null; // leaving Settings resets the sub-page stack
    document.getElementById('appName').textContent = t('appName');
    const view = document.getElementById('view');
    const map = { overview: viewOverview, reports: viewReports, transactions: viewTransactions, add: viewAdd, settings: viewSettings };
    view.innerHTML = (map[currentTab] || viewOverview)();
    view.scrollTop = 0;
    renderNav();
    wire();
    if (window.CustomSelect) window.CustomSelect.enhanceAll(view);
  }

  function wire() {
    // quick add (transactions)
    const ti = document.getElementById('txInput');
    if (ti) { document.getElementById('addBtn').addEventListener('click', () => addFromInput(ti.value, 'addBtn', 'txDate', 'txAccount')); ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFromInput(ti.value, 'addBtn', 'txDate', 'txAccount'); }); }
    // add page
    const tib = document.getElementById('txInputBig');
    if (tib) document.getElementById('addBtnBig').addEventListener('click', () => addFromInput(tib.value, 'addBtnBig', 'txDateBig', 'txAccountBig'));
    renderAddPhotos(); // Add page: photo picker (no-op elsewhere)
    document.querySelectorAll('.chip[data-ex]').forEach((c) => c.addEventListener('click', () => { if (tib) { tib.value = c.dataset.ex; tib.focus(); } }));
    // transfer between wallets
    const trBtn = document.getElementById('transferBtn');
    if (trBtn) trBtn.addEventListener('click', () => openTransfer(null));
    // date bar: "Hôm nay" / "Hôm qua" chips set the date input; manual change clears chip highlight
    wireDateBar();
    // filters
    const fm = document.getElementById('fMonth'); if (fm) fm.addEventListener('change', () => { filterMonth = fm.value; render(); });
    const fc = document.getElementById('fCat'); if (fc) fc.addEventListener('change', () => { filterCategory = fc.value; render(); });
    const ft = document.getElementById('fType'); if (ft) ft.addEventListener('change', () => { filterType = ft.value; render(); });
    // tx actions
    document.querySelectorAll('.tx-actions .icon-btn').forEach((b) => b.addEventListener('click', () => { b.dataset.act === 'del' ? deleteTx(b.dataset.id, b) : openEdit(b.dataset.id); }));
    // tap a transaction row (anywhere but its delete button / attachment badge) to open its editor
    document.querySelectorAll('.tx-row[data-id]').forEach((row) => row.addEventListener('click', (e) => {
      if (e.target.closest('.tx-actions') || e.target.closest('[data-attview]')) return;
      const tx = DATA.transactions.find((x) => x.id === row.dataset.id);
      if (!tx || isAdjust(tx) || !canEditTx(tx)) return;
      openEdit(row.dataset.id);
    }));
    // evidence badge → open the read-only photo viewer (anyone in the household)
    document.querySelectorAll('[data-attview]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openAttachmentViewer(b.dataset.attview, 0); }));
    // goto links
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { currentTab = b.dataset.goto; render(); }));
    // monthly close card: open / re-close
    document.querySelectorAll('[data-openclose]').forEach((b) => b.addEventListener('click', () => openMonthlyClose(b.dataset.openclose)));
    document.querySelectorAll('[data-reclose]').forEach((b) => b.addEventListener('click', () => openMonthlyClose(b.dataset.reclose, { reclose: true })));
    // overview wallet cards → open that wallet's history
    document.querySelectorAll('[data-wallethist]').forEach((c) => {
      c.addEventListener('click', () => openWalletHistory(c.dataset.wallethist));
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWalletHistory(c.dataset.wallethist); } });
    });
    // privacy: global mask toggle (wallet strip header) + per-figure hero eyes
    const eye = document.getElementById('eyeToggle');
    if (eye) eye.addEventListener('click', () => {
      hideAmounts = !hideAmounts;
      try { localStorage.setItem('hideAmounts', hideAmounts ? '1' : '0'); } catch (e) { /* ignore */ }
      render();
    });
    const eyeA = document.getElementById('eyeAvail');
    if (eyeA) eyeA.addEventListener('click', () => {
      hideBalAvail = !hideBalAvail;
      try { localStorage.setItem('hideBalAvail', hideBalAvail ? '1' : '0'); } catch (e) { /* ignore */ }
      render();
    });
    const eyeT = document.getElementById('eyeTotal');
    if (eyeT) eyeT.addEventListener('click', () => {
      hideBalTotal = !hideBalTotal;
      try { localStorage.setItem('hideBalTotal', hideBalTotal ? '1' : '0'); } catch (e) { /* ignore */ }
      render();
    });
    // reports period + nav
    document.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { reportPeriod = b.dataset.period; render(); }));
    document.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => shiftReport(parseInt(b.dataset.shift, 10))));
    // spending calendar: tap a day → open that month's transactions
    document.querySelectorAll('[data-hmday]').forEach((b) => b.addEventListener('click', () => { filterMonth = b.dataset.hmday.slice(0, 7); filterCategory = ''; filterType = ''; currentTab = 'transactions'; render(); }));
    // budgets
    const sb = document.getElementById('saveBudgetBtn');
    if (sb) sb.addEventListener('click', () => busy(sb, async () => {
      const obj = {};
      document.querySelectorAll('[data-budget]').forEach((i) => { obj[i.dataset.budget] = readMoney(i); });
      try {
        await window.Store.saveBudgets(obj);
        Object.assign(DATA.budgets, obj);
        toast(t('budgetSaved'), 'success');
      } catch (err) {
        toast(t('syncError') + ': ' + err.message, 'error');
      }
    }));
    // wallets: show/hide credit-card & gold fields when a row's type changes (delegated → covers new rows)
    const weBox = document.getElementById('walletEdit');
    if (weBox) weBox.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('w-type')) {
        const row = e.target.closest('.wallet-edit-row');
        const ty = e.target.value;
        const cf = row && row.querySelector('.wallet-credit-fields');
        if (cf) cf.classList.toggle('hidden', !LIABILITY_TYPES.includes(ty));
        const gf = row && row.querySelector('.wallet-gold-fields');
        if (gf) gf.classList.toggle('hidden', ty !== 'gold');
        const ob = row && row.querySelector('.wallet-edit-sub');
        if (ob) ob.classList.toggle('hidden', ty === 'gold');
      }
      // gold: the manual-price input only applies to kind='custom'
      if (e.target && e.target.classList.contains('w-gkind')) {
        const row = e.target.closest('.wallet-edit-row');
        const cr = row && row.querySelector('.w-gcustom-row');
        if (cr) cr.classList.toggle('hidden', e.target.value !== 'custom');
      }
    });
    // wallets: quick actions on a row — adjust balance / view history / gold unit toggle
    if (weBox) weBox.addEventListener('click', (e) => {
      const adj = e.target && e.target.closest('.w-adjust');
      if (adj) { openAdjustBalance(adj.dataset.acc); return; }
      const his = e.target && e.target.closest('.w-history');
      if (his) { openWalletHistory(his.dataset.acc); return; }
      // chỉ/lượng segmented control: switch the unit and convert the shown weight
      const ub = e.target && e.target.closest('.w-gunit button');
      if (ub && !ub.classList.contains('on')) {
        const grp = ub.closest('.w-gunit');
        grp.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        ub.classList.add('on');
        const inp = ub.closest('.wg-weight').querySelector('.w-gweight');
        const v = parseFloat(String(inp.value).replace(',', '.'));
        if (isFinite(v)) inp.value = String(Math.round((ub.dataset.unit === 'luong' ? v / 10 : v * 10) * 10000) / 10000);
      }
    });
    // wallets: tap the star to choose the default wallet (single selection, applied on Save)
    if (weBox) weBox.addEventListener('click', (e) => {
      const star = e.target && e.target.closest('.w-default');
      if (!star) return;
      const row = star.closest('.wallet-edit-row');
      const wasOn = row.classList.contains('is-default');
      weBox.querySelectorAll('.wallet-edit-row.is-default').forEach((r) => {
        r.classList.remove('is-default');
        const b = r.querySelector('.w-default'); if (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
      });
      // Re-tapping the current default clears it (back to "first wallet" fallback).
      if (!wasOn) {
        row.classList.add('is-default');
        star.classList.add('on'); star.setAttribute('aria-pressed', 'true');
      }
    });
    // wallets: add a blank editable row
    const aw = document.getElementById('addWalletBtn');
    if (aw) aw.addEventListener('click', () => {
      const box = document.getElementById('walletEdit');
      if (!box) return;
      const empty = box.querySelector('.empty'); if (empty) empty.remove();
      box.insertAdjacentHTML('beforeend', walletEditRowHtml(null));
      const last = box.querySelector('.wallet-edit-row:last-child .w-name'); if (last) last.focus();
    });
    // wallets: save all rows (update existing, insert new)
    const sw = document.getElementById('saveWalletsBtn');
    if (sw) sw.addEventListener('click', () => busy(sw, async () => {
      const rows = Array.from(document.querySelectorAll('#walletEdit .wallet-edit-row'));
      try {
        // Resolve the wallet id the user marked as default (may be a row inserted just now).
        let defaultId = null; let defaultMarked = false; let skippedNoName = false;
        for (const row of rows) {
          const id = row.dataset.acc;
          const name = (row.querySelector('.w-name').value || '').trim();
          const type = row.querySelector('.w-type').value;
          // Gold wallets don't use an opening balance (value = weight × price).
          const openingBalance = type === 'gold' ? 0 : readMoney(row.querySelector('.w-open'));
          const cls = LIABILITY_TYPES.includes(type) ? 'liability' : 'asset';
          const numOrNull = (sel) => { const v = row.querySelector(sel); const s = v ? String(v.value).replace(/\D/g, '') : ''; return s ? Number(s) : null; };
          // Type-specific metadata: credit/loan fields for liabilities, gold fields
          // for gold wallets; whatever no longer applies gets cleared on type change.
          let extra;
          if (type === 'gold') {
            const unitBtn = row.querySelector('.w-gunit .on');
            let w = parseFloat(String((row.querySelector('.w-gweight') || {}).value || '').replace(',', '.'));
            if (!isFinite(w) || w < 0) w = 0;
            if (unitBtn && unitBtn.dataset.unit === 'luong') w = w * 10; // stored canonically in chỉ
            let fpct = parseFloat((row.querySelector('.w-gfactor') || {}).value);
            if (!isFinite(fpct) || fpct <= 0) fpct = 100;
            const kind = ((row.querySelector('.w-gkind') || {}).value) || 'sjc';
            extra = {
              class: 'asset', creditLimit: null, statementDay: null, dueDay: null,
              goldWeightChi: Math.round(w * 1000) / 1000,
              goldKind: kind,
              goldFactor: Math.round(fpct * 100) / 10000, // 98 (%) → 0.98
              goldCustomBuy: kind === 'custom' ? (readMoney(row.querySelector('.w-gcustom')) || null) : null,
              goldBuyPerChi: readMoney(row.querySelector('.w-gbuy')) || null,
              goldBuyDate: ((row.querySelector('.w-gbuydate') || {}).value) || null,
            };
          } else {
            extra = cls === 'liability'
              ? { class: cls, creditLimit: numOrNull('.w-limit'), statementDay: numOrNull('.w-stmt'), dueDay: numOrNull('.w-due') }
              : { class: cls, creditLimit: null, statementDay: null, dueDay: null };
            // Only send the gold-clearing fields when this wallet used to be gold, so
            // normal wallets keep saving on DBs that haven't re-run supabase-schema.sql.
            const prev = id ? accountById(id) : null;
            if (prev && (prev.type === 'gold' || prev.goldKind)) {
              Object.assign(extra, { goldWeightChi: null, goldKind: null, goldFactor: 1, goldCustomBuy: null, goldBuyPerChi: null, goldBuyDate: null });
            }
          }
          // Per-wallet "allow direct transactions" switch — schema-tolerant: only
          // sent when false is involved, so old DBs without the column keep saving.
          const atEl = row.querySelector('.w-allowtx');
          if (atEl && type !== 'gold') {
            const prevAcc = id ? accountById(id) : null;
            if (!atEl.checked || (prevAcc && prevAcc.allowTx === false)) extra.allowTx = atEl.checked;
          }
          const isDef = row.classList.contains('is-default');
          if (isDef) defaultMarked = true;
          if (id) {
            await window.Store.updateAccount(id, Object.assign({ name: name || t('wallet'), type: type, openingBalance: openingBalance }, extra));
            if (isDef) defaultId = id;
          } else if (name) {
            const created = await window.Store.addAccount(Object.assign({ name: name, type: type, openingBalance: openingBalance, sortOrder: rows.indexOf(row) }, extra));
            if (isDef && created) defaultId = created.id;
          } else {
            // A brand-new row with no name would otherwise be silently dropped —
            // no insert, no error — leaving the user thinking it saved. Flag it instead.
            skippedNoName = true;
          }
        }
        // Apply the default choice atomically (clears it on all others). Only touch it
        // when the user expressed a choice, so we never wipe an existing default by accident.
        if (defaultMarked) await window.Store.setDefaultAccount(defaultId);
        await refreshData(true);
        if (skippedNoName) toast(t('needWalletName'), 'warn');
        else toast(t('walletSaved'), 'success');
      } catch (err) {
        // A missing gold_* column / stale PostgREST schema cache means
        // supabase-schema.sql hasn't been (re)run — say that instead of
        // surfacing the raw PostgREST message.
        const msg = /gold_|schema cache/i.test(err.message || '')
          ? t('goldSchemaHint')
          : t('syncError') + ': ' + err.message;
        toast(msg, 'error');
      }
    }));
    // wallets: delete
    document.querySelectorAll('[data-delacc]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(t('confirmDeleteWallet'))) return;
      busy(b, async () => {
        try {
          await window.Store.deleteAccount(b.dataset.delacc);
          await refreshData(true);
          toast(t('walletDeleted'), 'info');
        } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
      });
    }));
    // Quick templates: tap a chip (Add page) to log it instantly
    document.querySelectorAll('[data-usetpl]').forEach((b) => b.addEventListener('click', () => busy(b, () => addFromTemplate(b.dataset.usetpl))));
    // Quick templates: add a blank editor row
    const atpl = document.getElementById('addTplBtn');
    if (atpl) atpl.addEventListener('click', () => {
      const box = document.getElementById('tplEdit'); if (!box) return;
      const empty = box.querySelector('.empty'); if (empty) empty.remove();
      box.insertAdjacentHTML('beforeend', templateEditRowHtml(null));
      const last = box.querySelector('.tpl-edit-row:last-child .tp-label'); if (last) last.focus();
    });
    // Quick templates: delete a row (persisted on Save)
    document.querySelectorAll('[data-deltpl]').forEach((b) => b.addEventListener('click', () => {
      const row = b.closest('.tpl-edit-row'); if (row) row.remove();
    }));
    // Quick templates: save all rows
    const stpl = document.getElementById('saveTplBtn');
    if (stpl) stpl.addEventListener('click', () => {
      const list = [];
      Array.from(document.querySelectorAll('#tplEdit .tpl-edit-row')).forEach((r) => {
        const label = (r.querySelector('.tp-label').value || '').trim();
        const amount = readMoney(r.querySelector('.tp-amount'));
        if (!label || amount <= 0) return;
        list.push({ id: r.dataset.tpl || uuid(), label: label, amount: amount,
          type: r.querySelector('.tp-type').value === 'income' ? 'income' : 'expense',
          category: r.querySelector('.tp-cat').value, note: label });
      });
      setTemplates(list);
      toast(t('save') + ' ✓', 'success'); render();
    });
    // Savings goals: add a blank editor row
    const agoal = document.getElementById('addGoalBtn');
    if (agoal) agoal.addEventListener('click', () => {
      const box = document.getElementById('goalEdit'); if (!box) return;
      const empty = box.querySelector('.empty'); if (empty) empty.remove();
      box.insertAdjacentHTML('beforeend', goalEditRowHtml(null));
      const last = box.querySelector('.goal-edit-row:last-child .g-name'); if (last) last.focus();
    });
    // Savings goals: delete (persists immediately)
    document.querySelectorAll('[data-delgoal]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(t('delete') + '?')) return;
      busy(b, async () => {
        try { await window.Store.deleteGoal(b.dataset.delgoal); await refreshData(true); toast(t('deleted'), 'info'); }
        catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
      });
    }));
    // Savings goals: save all rows (insert new / update existing)
    const sgoal = document.getElementById('saveGoalsBtn');
    if (sgoal) sgoal.addEventListener('click', () => busy(sgoal, async () => {
      const rows = Array.from(document.querySelectorAll('#goalEdit .goal-edit-row'));
      try {
        for (const r of rows) {
          const name = (r.querySelector('.g-name').value || '').trim();
          const targetAmount = readMoney(r.querySelector('.g-target'));
          if (!name || targetAmount <= 0) continue;
          const fields = { name: name, targetAmount: targetAmount, accountId: r.querySelector('.g-acct').value || null, dueDate: r.querySelector('.g-due').value || null };
          const id = r.dataset.goal;
          if (id) await window.Store.updateGoal(id, fields);
          else await window.Store.addGoal(fields);
        }
        await refreshData(true);
        toast(t('save') + ' ✓', 'success');
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    }));
    // Recurring: add a blank editor row
    const arec = document.getElementById('addRecBtn');
    if (arec) arec.addEventListener('click', () => {
      const box = document.getElementById('recEdit'); if (!box) return;
      const empty = box.querySelector('.empty'); if (empty) empty.remove();
      box.insertAdjacentHTML('beforeend', recurringEditRowHtml(null));
      const last = box.querySelector('.rec-edit-row:last-child .r-name'); if (last) last.focus();
    });
    // Recurring: delete (persists immediately)
    document.querySelectorAll('[data-delrec]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(t('delete') + '?')) return;
      busy(b, async () => {
        try { await window.Store.deleteRecurring(b.dataset.delrec); await refreshData(true); toast(t('deleted'), 'info'); }
        catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
      });
    }));
    // Recurring: save all rows (insert new / update existing), then run any now due
    const srec = document.getElementById('saveRecBtn');
    if (srec) srec.addEventListener('click', () => busy(srec, async () => {
      const rows = Array.from(document.querySelectorAll('#recEdit .rec-edit-row'));
      try {
        for (const r of rows) {
          const name = (r.querySelector('.r-name').value || '').trim();
          const amount = readMoney(r.querySelector('.r-amount'));
          if (!name || amount <= 0) continue;
          let day = Math.round(Number(r.querySelector('.r-day').value) || 1); day = Math.min(31, Math.max(1, day));
          const fields = { name: name, amount: amount, type: r.querySelector('.r-type').value === 'income' ? 'income' : 'expense', category: r.querySelector('.r-cat').value, accountId: r.querySelector('.r-acct').value || null, day: day };
          const id = r.dataset.rec;
          if (id) await window.Store.updateRecurring(id, fields);
          else await window.Store.addRecurring(Object.assign({ freq: 'monthly', nextRun: nextOccurrence(day) }, fields));
        }
        await refreshData(true);
        await runRecurring();
        toast(t('save') + ' ✓', 'success');
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    }));
    // Categories editor: add a blank row
    const acb = document.getElementById('addCatBtn');
    if (acb) acb.addEventListener('click', () => {
      const box = document.getElementById('catEdit'); if (!box) return;
      box.insertAdjacentHTML('beforeend', catEditRowHtml(null));
      const last = box.querySelector('.cat-edit-row:last-child .c-name'); if (last) last.focus();
    });
    // Categories editor: row actions (delegated → also covers rows added after wiring)
    const catBox = document.getElementById('catEdit');
    if (catBox) catBox.addEventListener('click', (e) => {
      const em = e.target && e.target.closest && e.target.closest('.c-emoji');
      if (em) { if (!em.disabled) openEmojiPicker(em); return; }
      const rm = e.target && e.target.closest && e.target.closest('[data-rmcatrow]');
      if (rm) { const row = rm.closest('.cat-edit-row'); if (row) row.remove(); return; }
      const arch = e.target && e.target.closest && e.target.closest('[data-catarch]');
      if (arch) {
        busy(arch, async () => {
          try {
            await window.Store.updateCategory(arch.dataset.catarch, { archived: arch.dataset.to === '1' });
            await refreshData(true);
            toast(t('catSaved'), 'success');
          } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
        });
        return;
      }
      const del = e.target && e.target.closest && e.target.closest('[data-catdel]');
      if (del) {
        if (!confirm(t('delete') + '?')) return;
        busy(del, async () => {
          try {
            await window.Store.deleteCategory(del.dataset.catdel);
            await refreshData(true);
            toast(t('deleted'), 'info');
          } catch (err) {
            toast(/in_use/.test(err.message || '') ? t('catInUse') : (t('syncError') + ': ' + err.message), 'error');
          }
        });
      }
    });
    // Categories editor: save all rows (insert new / rename / emoji changes)
    const scats = document.getElementById('saveCatsBtn');
    if (scats) scats.addEventListener('click', () => busy(scats, async () => {
      const rowEls = Array.from(document.querySelectorAll('#catEdit .cat-edit-row'));
      try {
        for (let i = 0; i < rowEls.length; i++) {
          const r = rowEls[i];
          const name = (r.querySelector('.c-name').value || '').trim();
          const emoji = (r.querySelector('.c-emoji').value || '').trim();
          const id = r.dataset.cat;
          if (!id) {              // brand-new row
            if (!name) continue;
            const sel = r.querySelector('.c-type');
            await window.Store.addCategory({ name: name, emoji: emoji, type: sel ? sel.value : 'expense', sortOrder: i });
            continue;
          }
          const cat = (DATA.categories || []).find((x) => x.id === id);
          if (!cat) continue;
          if (!cat.isSystem && name && name !== cat.name) {
            if (!confirm(t('confirmRenameCat').replace('{a}', cat.name).replace('{b}', name))) continue;
            await window.Store.renameCategory(cat.name, name);
          }
          if ((emoji || null) !== (cat.emoji || null)) await window.Store.updateCategory(id, { emoji: emoji });
        }
        await refreshData(true);
        toast(t('catSaved'), 'success');
      } catch (err) {
        const msg = /duplicate/i.test(err.message || '') ? t('catDuplicate') : (t('syncError') + ': ' + err.message);
        toast(msg, 'error');
      }
    }));
    // Save AI keys (parser): Gemini (free) + Claude (paid fallback).
    // Written to the household_settings table so the whole household shares them;
    // if the table doesn't exist yet (schema not re-run) fall back to localStorage.
    const sc = document.getElementById('saveConfigBtn');
    if (sc) sc.addEventListener('click', () => busy(sc, async () => {
      const patch = {
        GEMINI_API_KEY: document.getElementById('cfgGemini').value.trim(),
        ANTHROPIC_API_KEY: document.getElementById('cfgAnthropic').value.trim(),
      };
      try {
        DATA.aiConfig = await window.Store.saveHouseholdSettings(patch);
        applyDbConfig();
        toast(t('aiSavedShared'), 'success');
      } catch (err) {
        saveSettings(patch);
        toast(t('aiSavedLocal'), 'warn');
      }
    }));
    // Change Supabase config (URL/key) -> page reload required to apply
    const sca = document.getElementById('saveSupaBtn');
    if (sca) sca.addEventListener('click', () => {
      saveSettings({
        SUPABASE_URL: document.getElementById('cfgSupaUrl').value.trim(),
        SUPABASE_ANON_KEY: document.getElementById('cfgSupaKey').value.trim(),
      });
      toast(t('connSaved'), 'info');
      setTimeout(() => location.reload(), 600);
    });
    // Rename household
    const rh = document.getElementById('renameHhBtn');
    if (rh) rh.addEventListener('click', () => busy(rh, async () => {
      const name = document.getElementById('hhName').value.trim();
      if (!name) return;
      try { await window.Store.renameHousehold(name); if (DATA.household) DATA.household.name = name; toast(t('renameOk'), 'success'); render(); }
      catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    }));
    // Copy invite code
    const cc = document.getElementById('copyCodeBtn');
    if (cc) cc.addEventListener('click', () => {
      const code = DATA.household ? DATA.household.id : '';
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast(t('copied'), 'success'));
      else toast(code, 'info');
    });
    // Join another household
    const jb = document.getElementById('joinHhBtn');
    if (jb) jb.addEventListener('click', () => busy(jb, async () => {
      const code = document.getElementById('joinCode').value.trim();
      if (!code) return;
      try {
        await window.Store.joinHousehold(code);
        toast(t('joined'), 'success');
        await enterApp();
      } catch (err) { toast(err.message, 'error'); }
    }));
    // Remove member (owner removes another member)
    document.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(t('confirmRemoveMember'))) return;
      busy(b, async () => {
        try {
          await window.Store.removeMember(b.dataset.remove);
          householdMembers = await window.Store.listMembers().catch(() => []);
          toast(t('memberRemoved'), 'success'); render();
        } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
      });
    }));
    // Promote/demote a member (owner only). RLS + the role-guard trigger reject it server-side otherwise.
    document.querySelectorAll('[data-setrole]').forEach((b) => b.addEventListener('click', () => {
      const role = b.dataset.role === 'admin' ? 'admin' : 'member';
      if (!confirm(role === 'admin' ? t('confirmMakeAdmin') : t('confirmRemoveAdmin'))) return;
      busy(b, async () => {
        try {
          await window.Store.setMemberRole(b.dataset.setrole, role);
          householdMembers = await window.Store.listMembers().catch(() => householdMembers);
          myRole = computeMyRole();
          toast(t('roleChanged'), 'success'); render();
        } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
      });
    }));
    // Transfer ownership to another member (owner only). The acting owner becomes an admin.
    document.querySelectorAll('[data-makeowner]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(t('confirmMakeOwner'))) return;
      busy(b, async () => {
        try {
          await window.Store.transferOwnership(b.dataset.makeowner);
          householdMembers = await window.Store.listMembers().catch(() => householdMembers);
          myRole = computeMyRole();
          toast(t('ownerTransferred'), 'success'); render();
        } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
      });
    }));
    // Leave household (remove yourself)
    const lv = document.querySelector('[data-leave]');
    if (lv) lv.addEventListener('click', () => {
      if (!confirm(t('confirmLeave'))) return;
      busy(lv, async () => {
        try {
          window.Store.unsubscribeChanges();
          await window.Store.removeMember(currentUserId);
          toast(t('memberRemoved'), 'info');
          await enterApp();
        } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
      });
    });
    // Switch household (when in multiple households)
    const hs = document.getElementById('switchHh');
    if (hs) hs.addEventListener('change', async () => {
      try { await window.Store.switchHousehold(hs.value); await enterApp(); }
      catch (err) { toast(err.message, 'error'); }
    });
    // Settings: navigate into a sub-page (Activity lazy-loads its data on open)
    document.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', async () => {
      settingsPage = b.dataset.page;
      if (settingsPage === 'activity') {
        activityLog = []; activityLoading = true; activitySearch = ''; render(); // show the loading state first
        await loadActivity();
      } else if (settingsPage === 'storage') {
        storageUsage = null; storageLoading = true; render(); // show the loading state first
        await loadStorageUsage();
      } else if (settingsPage === 'cats' && canManageConfig() && !(DATA.categories || []).length) {
        // First open: move the built-in defaults into the DB so they become editable.
        catsSeedPending = true; render();
        try {
          const seeded = await window.Store.seedDefaultCategories(DEFAULT_CATS);
          if (seeded.length) { DATA.categories = seeded; syncParserCategories(); }
        } catch (e) { /* table missing (schema not re-run) → page shows the hint */ }
        catsSeedPending = false;
      }
      render();
    }));
    // Storage page: manual refresh
    const rsb = document.getElementById('refreshStorageBtn');
    if (rsb) rsb.addEventListener('click', () => busy(rsb, async () => { await loadStorageUsage(); render(); }));
    // Activity: manual refresh
    const refAct = document.getElementById('refreshActBtn');
    if (refAct) refAct.addEventListener('click', async () => { await loadActivity(); render(); });
    // Activity: live search filter (in-place DOM filter → keeps input focus, no re-render)
    const actSearch = document.getElementById('actSearch');
    const applyActFilter = () => {
      const q = (actSearch ? actSearch.value : '').trim().toLowerCase();
      activitySearch = actSearch ? actSearch.value : '';
      let shown = 0;
      document.querySelectorAll('.activity-row').forEach((r) => {
        const match = !q || (r.dataset.search || '').indexOf(q) >= 0;
        r.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      const nm = document.getElementById('actNoMatch');
      if (nm) nm.style.display = shown ? 'none' : '';
    };
    if (actSearch) { actSearch.addEventListener('input', applyActFilter); if (activitySearch) applyActFilter(); }
    // Activity: tap an entry to see exactly what was added / edited / deleted
    document.querySelectorAll('[data-actentry]').forEach((r) => r.addEventListener('click', () => openActivityDetail(r.dataset.actentry)));
    // Settings: back from a sub-page to the root menu
    const back = document.querySelector('[data-back]');
    if (back) back.addEventListener('click', () => { settingsPage = null; render(); });
    // Reminder time picker
    const rt = document.getElementById('remindTime');
    if (rt) rt.addEventListener('change', () => { const c = getReminderCfg(); c.time = rt.value || '20:00'; setReminderCfg(c); toast(t('save') + ' ✓', 'success'); });
    // Settings: inline actions (language popup, dark-mode toggle, reminder toggle, sign out)
    document.querySelectorAll('[data-saction]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.saction;
      if (a === 'lang') openLangPicker();
      else if (a === 'theme') { toggleTheme(); render(); }
      else if (a === 'remind-toggle') toggleReminder();
      else if (a === 'email-toggle') busy(b, async () => {
        const cfg = emailReportCfg();
        try {
          await saveEmailReportCfg({ enabled: !cfg.enabled, sendDay: cfg.sendDay });
          toast(t('emailSaved'), 'success');
        } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
        render();
      });
      else if (a === 'signout') busy(b, signOutNow);
    }));
    // Monthly email report: send day + test send
    const esd = document.getElementById('emailSendDay');
    if (esd) esd.addEventListener('change', async () => {
      let day = Math.round(Number(esd.value)) || 3;
      day = Math.min(28, Math.max(1, day)); esd.value = day;
      try { await saveEmailReportCfg({ enabled: true, sendDay: day }); toast(t('emailSaved'), 'success'); }
      catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    });
    const etb = document.getElementById('emailTestBtn');
    if (etb) etb.addEventListener('click', () => busy(etb, async () => {
      try {
        const res = await window.Store.sendTestMonthlyEmail();
        const to = (res && res.sentTo && res.sentTo[0]) || currentUserEmail;
        toast(t('emailTestSent').replace('{e}', to), 'success');
      } catch (err) {
        toast(err.message === 'no_snapshot' ? t('emailNeedClose') : (t('syncError') + ': ' + err.message), 'error');
      }
    }));
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
    // manual refresh: pull the latest data without reloading the page
    const rf = document.getElementById('refreshBtn');
    if (rf) {
      rf.innerHTML = icon('refresh');
      rf.title = t('refresh');
      rf.addEventListener('click', async () => {
        rf.classList.add('spinning'); rf.disabled = true;
        try { await refreshData(false); }
        finally { rf.classList.remove('spinning'); rf.disabled = false; }
      });
    }
  }

  /* ============== Sync events ============== */
  window.addEventListener('offline', () => setStatus(t('offline'), 'warn'));
  window.addEventListener('online', () => setStatus(''));

  /* ============== Auth screen ============== */
  function showAuth(mode) {
    authMode = mode || (window.Store.isConfigured() ? 'login' : 'config');
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('appShell').classList.add('hidden');
    const el = document.getElementById('authScreen');
    el.classList.remove('hidden');
    el.innerHTML = renderAuth();
    wireAuth();
  }
  function hideAuth() { document.getElementById('authScreen').classList.add('hidden'); }

  function renderAuth() {
    const C = window.CONFIG;
    if (authMode === 'config') {
      return '<div class="auth-card">' +
        '<div class="auth-brand">' + icon('wallet') + ' ' + t('appName') + '</div>' +
        '<div class="auth-sub">' + t('configIntro') + '</div>' +
        '<label>' + t('supaUrl') + '</label><input id="aSupaUrl" type="text" value="' + esc(C.SUPABASE_URL || '') + '" placeholder="https://xxxx.supabase.co" autocomplete="off" autocapitalize="off" spellcheck="false"/>' +
        '<label>' + t('supaKey') + '</label><input id="aSupaKey" type="password" value="' + esc(C.SUPABASE_ANON_KEY || '') + '" placeholder="anon public key" autocomplete="off"/>' +
        '<button id="aSaveCfg" class="primary-btn">' + icon('check') + ' ' + t('saveConnect') + '</button>' +
        '<div class="hint">' + t('tokenHint') + '</div>' +
        '</div>';
    }
    return '<div class="auth-card">' +
      '<div class="auth-brand">' + icon('wallet') + ' ' + t('appName') + '</div>' +
      '<div class="auth-sub">' + t('authWelcome') + '</div>' +
      '<label>' + t('email') + '</label><input id="aEmail" type="email" autocomplete="username" placeholder="you@example.com"/>' +
      '<label>' + t('password') + '</label><input id="aPass" type="password" autocomplete="current-password" placeholder="••••••••"/>' +
      '<div id="authError" class="auth-error hidden"></div>' +
      '<button id="aPrimary" class="primary-btn">' + (authIsSignup ? icon('plus') + ' ' + t('signUp') : icon('check') + ' ' + t('signIn')) + '</button>' +
      '<button id="aToggle" class="link-btn">' + (authIsSignup ? t('haveAccount') : t('needAccount')) + '</button>' +
      '<button id="aEditCfg" class="link-btn subtle">' + t('editConfig') + '</button>' +
      '</div>';
  }

  function wireAuth() {
    const sc = document.getElementById('aSaveCfg');
    if (sc) sc.addEventListener('click', () => {
      const url = document.getElementById('aSupaUrl').value.trim();
      const key = document.getElementById('aSupaKey').value.trim();
      if (!url || !key) { toast(t('configMissing'), 'warn'); return; }
      saveSettings({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key });
      location.reload();
    });
    const tg = document.getElementById('aToggle');
    if (tg) tg.addEventListener('click', () => { authIsSignup = !authIsSignup; showAuth('login'); });
    const ec = document.getElementById('aEditCfg');
    if (ec) ec.addEventListener('click', () => showAuth('config'));
    const pr = document.getElementById('aPrimary');
    if (pr) pr.addEventListener('click', doAuth);
    const pass = document.getElementById('aPass');
    if (pass) pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth(); });
  }

  // Show / clear the inline error banner inside the auth card.
  function setAuthError(msg) {
    const el = document.getElementById('authError');
    if (!el) return;
    if (msg) { el.innerHTML = icon('alert') + '<span>' + esc(msg) + '</span>'; el.classList.remove('hidden'); }
    else { el.innerHTML = ''; el.classList.add('hidden'); }
  }
  // Map raw Supabase auth errors to a friendly, localized message.
  function friendlyAuthError(raw) {
    const m = (raw || '').toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) return t('invalidCreds');
    if (m.includes('email not confirmed')) return t('emailNotConfirmed');
    if (m.includes('rate limit') || m.includes('too many') || m.includes('429')) return t('authRateLimit');
    if (m.includes('already registered') || m.includes('already exists')) return t('userExists');
    if (m.includes('password') && (m.includes('6') || m.includes('short') || m.includes('weak'))) return t('weakPassword');
    if (m.includes('invalid email') || m.includes('unable to validate email')) return t('invalidEmail');
    return raw || t('authError');
  }

  async function doAuth() {
    setAuthError('');
    const email = (document.getElementById('aEmail').value || '').trim();
    const password = document.getElementById('aPass').value || '';
    if (!email || !password) { setAuthError(t('fillEmailPass')); toast(t('fillEmailPass'), 'warn'); return; }
    const btn = document.getElementById('aPrimary');
    return busy(btn, async () => {
      try {
        if (authIsSignup) {
          await window.Store.signUp(email, password);
          const user = await window.Store.getUser();
          if (!user) { toast(t('signedUp'), 'success'); authIsSignup = false; showAuth('login'); return; }
        } else {
          await window.Store.signIn(email, password);
        }
        await enterApp();
      } catch (err) {
        const msg = friendlyAuthError(err.message);
        setAuthError(msg);
        toast(msg, 'error');
      }
    });
  }

  /* ============== Enter app (load data) ============== */
  async function enterApp() {
    const user = await window.Store.getUser();
    if (!user) { showAuth('login'); return; }
    currentUserEmail = user.email || '';
    currentUserId = user.id || '';
    hideAuth();
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    setStatus(t('saving'));
    try {
      DATA = await window.Store.loadData();
      setStatus('');
    } catch (err) {
      const cached = await window.Store.getCachedData().catch(() => null);
      DATA = cached || { household: null, budgets: {}, transactions: [] };
      setStatus(t('syncError'), 'err');
      toast(t('syncError') + ': ' + err.message, 'error');
    }
    if (!DATA.budgets) DATA.budgets = {};
    if (!DATA.transactions) DATA.transactions = [];
    if (!DATA.accounts) DATA.accounts = [];
    if (!DATA.goals) DATA.goals = [];
    if (!DATA.recurring) DATA.recurring = [];
    if (!DATA.attachments) DATA.attachments = [];
    if (!DATA.monthlyReports) DATA.monthlyReports = [];
    if (!DATA.categories) DATA.categories = [];
    if (!DATA.goldPrices) DATA.goldPrices = {};
    syncParserCategories();
    myHouseholds = await window.Store.listHouseholds().catch(() => []);
    householdMembers = await window.Store.listMembers().catch(() => []);
    myRole = computeMyRole();
    // One-time seed: no household_settings row yet but this browser has AI keys
    // and we're allowed to write → migrate them to the DB (best-effort, silent).
    if (DATA.aiConfig == null && canManageConfig() && (window.CONFIG.GEMINI_API_KEY || window.CONFIG.ANTHROPIC_API_KEY)) {
      try {
        DATA.aiConfig = await window.Store.saveHouseholdSettings({
          GEMINI_API_KEY: window.CONFIG.GEMINI_API_KEY || '',
          ANTHROPIC_API_KEY: window.CONFIG.ANTHROPIC_API_KEY || '',
        });
      } catch (e) { /* table not created yet → keep using local keys */ }
    }
    applyDbConfig();
    currentTab = 'overview';
    render();
    startAutoSync();
    maybeNotify();
    runRecurring();
    maybeRefreshGoldPrices();
  }

  /* ============== Gold price refresh ============== */
  // On-demand refresh (button on the Net worth card). The Edge Function updates the
  // shared gold_prices cache; realtime + refreshData bring the new numbers back.
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('#goldRefreshBtn') : null;
    if (!btn) return;
    busy(btn, async () => {
      try {
        await window.Store.refreshGoldPrices();
        await refreshData(true);
        toast(t('goldPriceUpdated'), 'success');
      } catch (err) {
        toast(t('goldPriceUpdateFailed'), 'warn');
      }
    });
  });
  // Keep prices fresh without user action: when any gold wallet references a market
  // kind and the cache is older than 4h, poke the Edge Function fire-and-forget.
  // The function itself no-ops when someone refreshed minutes ago, so a whole
  // household opening the app at once still costs a single upstream fetch.
  const GOLD_PRICE_TTL_MS = 4 * 60 * 60 * 1000;
  function maybeRefreshGoldPrices() {
    try {
      const usesMarket = activeAccounts().some((a) => a.type === 'gold' && a.goldKind && a.goldKind !== 'custom');
      if (!usesMarket) return;
      const fa = goldPriceFetchedAt();
      if (fa && Date.now() - fa.getTime() < GOLD_PRICE_TTL_MS) return;
      window.Store.refreshGoldPrices().then(() => refreshData(true)).catch(() => { /* stale badge covers it */ });
    } catch (e) { /* never block startup on prices */ }
  }

  /* ============== Auto-sync (realtime + when returning to the app) ============== */
  let refreshTimer = null;
  let autoSyncWired = false;
  async function refreshData(silent) {
    try {
      const fresh = await window.Store.loadData();
      DATA = fresh;
      if (!DATA.budgets) DATA.budgets = {};
      if (!DATA.transactions) DATA.transactions = [];
      if (!DATA.accounts) DATA.accounts = [];
    if (!DATA.goals) DATA.goals = [];
    if (!DATA.recurring) DATA.recurring = [];
    if (!DATA.attachments) DATA.attachments = [];
    if (!DATA.monthlyReports) DATA.monthlyReports = [];
    if (!DATA.categories) DATA.categories = [];
    if (!DATA.goldPrices) DATA.goldPrices = {};
    syncParserCategories();
      householdMembers = await window.Store.listMembers().catch(() => householdMembers);
      myRole = computeMyRole();
      applyDbConfig();
      render();
      if (!silent) { setStatus(t('synced'), 'ok'); setTimeout(() => setStatus(''), 1500); }
    } catch (e) { /* keep existing data */ }
  }
  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshData(true), 400); // batch several consecutive changes
  }
  function startAutoSync() {
    // Realtime: when someone in the household adds/edits/deletes -> auto-update
    try { window.Store.subscribeChanges(scheduleRefresh); } catch (e) { /* ignore */ }
    if (autoSyncWired) return;
    autoSyncWired = true;
    // Fallback: reload when returning to the tab / when back online
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshData(true); maybeNotify(); } });
    window.addEventListener('focus', () => { refreshData(true); maybeNotify(); });
    window.addEventListener('online', () => refreshData(true));
  }

  /* ============== Init ============== */
  async function init() {
    applyTheme(localStorage.getItem('theme') || 'light');
    loadSettings();
    wireHeader();
    if (!window.Store.isConfigured()) { showAuth('config'); return; }
    const user = await window.Store.getUser().catch(() => null);
    if (!user) { showAuth('login'); return; }
    await enterApp();
  }
  document.addEventListener('DOMContentLoaded', init);
})();

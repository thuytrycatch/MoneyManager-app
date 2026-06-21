/* =====================================================================
 *  app.js — Family Income & Expense Manager
 *  Overview · Reports (Week/Month/Year) · Transactions · Settings
 * ===================================================================== */
(function () {
  'use strict';

  /* ============== Settings (localStorage) ============== */
  window.CONFIG = window.CONFIG || {
    SUPABASE_URL: '', SUPABASE_ANON_KEY: '', ANTHROPIC_API_KEY: '',
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
    bank: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    transfer: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
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
      recent: 'Giao dịch gần đây', seeAll: 'Xem tất cả', noTx: 'Chưa có giao dịch nào.', refresh: 'Làm mới',
      addTx: 'Thêm giao dịch', placeholder: 'ăn sáng 35k, lương 15 triệu, đổ xăng 80k…',
      week: 'Tuần', month: 'Tháng', year: 'Năm', byCategory: 'Chi theo danh mục', trend: 'Diễn biến thu chi',
      budgetProgress: 'Tiến độ ngân sách', topSpending: 'Khoản chi lớn nhất', summary: 'Tổng kết',
      save: 'Lưu', cancel: 'Hủy', delete: 'Xóa', edit: 'Sửa', category: 'Danh mục', note: 'Ghi chú', amount: 'Số tiền',
      date: 'Ngày', time: 'Giờ', today: 'Hôm nay', yesterday: 'Hôm qua', pickDate: 'Chọn ngày',
      wallets: 'Ví / Tài khoản', wallet: 'Ví', walletCash: 'Tiền mặt', addWallet: 'Thêm ví',
      walletName: 'Tên ví', walletType: 'Loại', openingBalance: 'Số dư đầu kỳ',
      typeCash: 'Tiền mặt', typeBank: 'Ngân hàng', typeEwallet: 'Ví điện tử', typeOther: 'Khác',
      totalBalance: 'Tổng số dư', walletSaved: 'Đã lưu ví', walletDeleted: 'Đã xóa ví',
      confirmDeleteWallet: 'Xóa ví này? Giao dịch cũ vẫn giữ nhưng sẽ không còn gắn ví.',
      noWallets: 'Chưa có ví nào.', unassignedWallet: 'Chưa gán ví', needWalletName: 'Nhập tên ví.',
      transfer: 'Chuyển khoản', transferBetween: 'Chuyển tiền giữa ví', fromWallet: 'Từ ví', toWallet: 'Đến ví',
      transferDone: 'Đã chuyển khoản', needTwoWallets: 'Cần ít nhất 2 ví để chuyển khoản.',
      sameWallet: 'Ví nguồn và ví đích phải khác nhau.', needAmount: 'Nhập số tiền.',
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
      connSaved: 'Đã lưu, đang kết nối…', connOk: 'Đã kết nối', configMissing: 'Chưa cấu hình Supabase.',
      tokenHint: '🔒 Thông tin lưu trên trình duyệt này (localStorage). anon key là khóa công khai, dữ liệu được bảo vệ bằng Row Level Security.',
      // Auth
      signIn: 'Đăng nhập', signUp: 'Tạo tài khoản', signOut: 'Đăng xuất', email: 'Email', password: 'Mật khẩu',
      authWelcome: 'Đăng nhập để quản lý thu chi gia đình', haveAccount: 'Đã có tài khoản? Đăng nhập',
      needAccount: 'Chưa có tài khoản? Tạo mới', editConfig: 'Đổi cấu hình Supabase',
      signedUp: 'Đã tạo tài khoản. Kiểm tra email nếu cần xác nhận, rồi đăng nhập.',
      authError: 'Lỗi đăng nhập', fillEmailPass: 'Nhập email và mật khẩu.',
      configIntro: 'Nhập thông tin Supabase (Settings → API) để bắt đầu.',
      // Household
      household: 'Hộ gia đình', householdName: 'Tên hộ', inviteCode: 'Mã mời (chia sẻ để người thân cùng dùng)',
      copyCode: 'Sao chép mã', copied: 'Đã sao chép', joinHousehold: 'Tham gia hộ khác', joinCodePh: 'Dán mã mời vào đây',
      join: 'Tham gia', joined: 'Đã tham gia hộ', renameOk: 'Đã đổi tên hộ', account: 'Tài khoản',
      switchHousehold: 'Chọn hộ đang xem',
      members: 'Thành viên', roleOwner: 'Chủ hộ', roleMember: 'Thành viên', you: 'bạn', unknownMember: '(chưa rõ email)',
      confirmRemoveMember: 'Xóa thành viên này khỏi hộ?', memberRemoved: 'Đã xóa thành viên',
      leaveHousehold: 'Rời hộ này', confirmLeave: 'Rời khỏi hộ này?', onlyOwnerRemove: 'Chỉ chủ hộ mới xóa được thành viên.',
      added: 'Đã thêm', deleted: 'Đã xóa', confirmDelete: 'Xóa giao dịch này?',
      emptyInput: 'Vui lòng nhập nội dung.', cantParse: 'Không nhận diện được số tiền.',
      warn80: 'Sắp vượt ngân sách', warn100: 'Vượt ngân sách', parsing: 'Đang phân tích…',
      synced: 'Đã đồng bộ ✓', syncError: 'Lỗi đồng bộ', offline: 'Offline — sẽ đồng bộ sau', saving: 'Đang lưu…',
      paceFast: 'Chi nhanh hơn kế hoạch', paceOk: 'Chi tiêu trong tầm kiểm soát', overspentWeek: 'Tuần này chi nhiều hơn tuần trước',
      savedWell: 'Tuần này tiết kiệm tốt!', daysLeft: 'ngày còn lại trong tháng', biggestWeek: 'Khoản chi lớn nhất tuần',
      noAlerts: 'Mọi thứ ổn định. Tiếp tục duy trì nhé! 👍',
    },
    en: {
      appName: 'Money Manager', overview: 'Overview', reports: 'Reports', add: 'Add', txs: 'Transactions', settings: 'Settings',
      income: 'Income', expense: 'Expense', balance: 'Current balance', savings: 'Savings', savingsRate: 'Savings rate',
      thisMonth: 'This month', remaining: 'Remaining', budget: 'Budget', spentToday: 'Spent today', avgPerDay: 'Avg / day',
      weekReview: 'This week review', vsLastWeek: 'vs last week', alerts: 'Alerts & control',
      recent: 'Recent transactions', seeAll: 'See all', noTx: 'No transactions yet.', refresh: 'Refresh',
      addTx: 'Add transaction', placeholder: 'breakfast 35k, salary 15 million, gas 80k…',
      week: 'Week', month: 'Month', year: 'Year', byCategory: 'Spending by category', trend: 'Income & expense trend',
      budgetProgress: 'Budget progress', topSpending: 'Top spending', summary: 'Summary',
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', category: 'Category', note: 'Note', amount: 'Amount',
      date: 'Date', time: 'Time', today: 'Today', yesterday: 'Yesterday', pickDate: 'Pick date',
      wallets: 'Wallets / Accounts', wallet: 'Wallet', walletCash: 'Cash', addWallet: 'Add wallet',
      walletName: 'Wallet name', walletType: 'Type', openingBalance: 'Opening balance',
      typeCash: 'Cash', typeBank: 'Bank', typeEwallet: 'E-wallet', typeOther: 'Other',
      totalBalance: 'Total balance', walletSaved: 'Wallet saved', walletDeleted: 'Wallet deleted',
      confirmDeleteWallet: 'Delete this wallet? Past transactions are kept but will no longer be linked to a wallet.',
      noWallets: 'No wallets yet.', unassignedWallet: 'No wallet', needWalletName: 'Enter a wallet name.',
      transfer: 'Transfer', transferBetween: 'Transfer between wallets', fromWallet: 'From wallet', toWallet: 'To wallet',
      transferDone: 'Transfer done', needTwoWallets: 'You need at least 2 wallets to transfer.',
      sameWallet: 'Source and destination must differ.', needAmount: 'Enter an amount.',
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
      connSaved: 'Saved, connecting…', connOk: 'Connected', configMissing: 'Supabase not configured.',
      tokenHint: '🔒 Stored only in this browser (localStorage). The anon key is public; data is protected by Row Level Security.',
      // Auth
      signIn: 'Sign in', signUp: 'Sign up', signOut: 'Sign out', email: 'Email', password: 'Password',
      authWelcome: 'Sign in to manage your family budget', haveAccount: 'Have an account? Sign in',
      needAccount: 'No account? Create one', editConfig: 'Change Supabase config',
      signedUp: 'Account created. Confirm via email if required, then sign in.',
      authError: 'Auth error', fillEmailPass: 'Enter email and password.',
      configIntro: 'Enter your Supabase info (Settings → API) to start.',
      // Household
      household: 'Household', householdName: 'Household name', inviteCode: 'Invite code (share with family)',
      copyCode: 'Copy code', copied: 'Copied', joinHousehold: 'Join another household', joinCodePh: 'Paste invite code here',
      join: 'Join', joined: 'Joined household', renameOk: 'Household renamed', account: 'Account',
      switchHousehold: 'Active household',
      members: 'Members', roleOwner: 'Owner', roleMember: 'Member', you: 'you', unknownMember: '(email unknown)',
      confirmRemoveMember: 'Remove this member from the household?', memberRemoved: 'Member removed',
      leaveHousehold: 'Leave this household', confirmLeave: 'Leave this household?', onlyOwnerRemove: 'Only the owner can remove members.',
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
  let DATA = { household: null, budgets: {}, transactions: [], accounts: [] };
  let authMode = 'login'; // 'config' | 'login'
  let authIsSignup = false;
  let currentUserEmail = '';
  let currentUserId = '';
  let myHouseholds = []; // [{id, name}] households the user belongs to
  let householdMembers = []; // [{userId, email, role}] members of the household being viewed
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

  // Privacy: hide balances/amounts behind dots until the user taps the eye icon. Default: hidden.
  let hideAmounts = (localStorage.getItem('hideAmounts') || '1') === '1';
  function mask(str) { return hideAmounts ? '••••••' : str; }

  /* ============== Date helpers ============== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
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
    txs.forEach((tx) => {
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
      // transfers move money between wallets — neither income nor expense
    });
    return { income, expense, net: income - expense };
  }
  function byCategory(txs) {
    const o = {};
    txs.forEach((tx) => { if (tx.type === 'expense') o[tx.category] = (o[tx.category] || 0) + tx.amount; });
    return o;
  }
  function allTimeBalance() { return totals(DATA.transactions).net; }
  function totalBudget() { return Object.values(DATA.budgets).reduce((a, b) => a + (b || 0), 0); }

  /* ============== Accounts (wallets) ============== */
  const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'other'];
  const ACCOUNT_TYPE_META = {
    cash: { icon: 'wallet', key: 'typeCash' },
    bank: { icon: 'bank', key: 'typeBank' },
    ewallet: { icon: 'phone', key: 'typeEwallet' },
    other: { icon: 'more', key: 'typeOther' },
  };
  function accountTypeIcon(type) { return icon((ACCOUNT_TYPE_META[type] || ACCOUNT_TYPE_META.other).icon); }
  function accountTypeLabel(type) { return t((ACCOUNT_TYPE_META[type] || ACCOUNT_TYPE_META.other).key); }
  function activeAccounts() { return (DATA.accounts || []).filter((a) => !a.archived); }
  function accountById(id) { return (DATA.accounts || []).find((a) => a.id === id) || null; }
  // Balance of one wallet = opening balance + incomes − expenses recorded against it.
  function accountBalance(id) {
    const acc = accountById(id); if (!acc) return 0;
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
  function totalBalance() {
    const opening = (DATA.accounts || []).reduce((s, a) => s + (a.openingBalance || 0), 0);
    return opening + allTimeBalance();
  }
  // Remember the last wallet used for quick entry, scoped per household.
  function lastAccountKey() { return 'mm_last_account_' + (DATA.household ? DATA.household.id : ''); }
  function getLastAccountId() { try { return localStorage.getItem(lastAccountKey()) || ''; } catch (e) { return ''; } }
  function setLastAccountId(id) { try { localStorage.setItem(lastAccountKey(), id || ''); } catch (e) { /* ignore */ } }
  function defaultAccountId() {
    const accs = activeAccounts(); if (!accs.length) return '';
    const last = getLastAccountId();
    return accs.some((a) => a.id === last) ? last : accs[0].id;
  }
  // <select> of wallets for the entry forms; empty string when the household has no wallets.
  function accountSelect(id, selectedId) {
    const accs = activeAccounts();
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

  /* ============== Transaction actions ============== */
  async function addFromInput(raw, btnId, dateInputId, accountSelectId) {
    if (!raw.trim()) { toast(t('emptyInput'), 'warn'); return; }
    const btn = btnId && document.getElementById(btnId);
    const old = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    let parsed;
    try { parsed = await window.Parser.parseTransaction(raw); }
    catch (e) { parsed = window.Parser.parseWithRegex(raw); }
    if (!parsed.amount) {
      if (btn) { btn.disabled = false; btn.innerHTML = old; }
      toast(t('cantParse'), 'warn'); return;
    }
    const now = new Date();
    const today = ymd(now);
    // Date priority: a date the user picked in the date bar wins; otherwise a date
    // detected in the sentence ("hôm qua", "20/6"); otherwise today.
    const dateInput = dateInputId && document.getElementById(dateInputId);
    const picked = dateInput ? dateInput.value : '';
    let date = picked || today;
    if (parsed.date && (!picked || picked === today)) date = parsed.date;
    // Keep a real clock time only for today's entries; past days get no misleading time.
    const time = date === today ? now.toTimeString().slice(0, 5) : '';
    const acctSel = accountSelectId && document.getElementById(accountSelectId);
    const accountId = acctSel ? acctSel.value : defaultAccountId();
    const draft = {
      date: date, time: time,
      rawInput: raw, amount: parsed.amount, type: parsed.type,
      category: parsed.category, note: parsed.note,
      accountId: accountId || null,
    };
    setStatus(t('saving'));
    try {
      const saved = await window.Store.addTransaction(draft);
      DATA.transactions.unshift(saved);
      if (accountId) setLastAccountId(accountId);
      setStatus(t('synced'), 'ok'); setTimeout(() => setStatus(''), 2500);
      toast(t('added') + ': ' + parsed.note + ' · ' + fmtVND(parsed.amount) + (date !== today ? ' · ' + date : ''), 'success');
      if (parsed.type === 'expense') checkBudgetWarning(parsed.category);
      render();
    } catch (err) {
      setStatus(t('syncError'), 'err'); setTimeout(() => setStatus(''), 4000);
      toast(t('syncError') + ': ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = old; }
    }
  }
  function checkBudgetWarning(cat) {
    const limit = DATA.budgets[cat]; if (!limit) return;
    const used = byCategory(inRange(startOfMonth(new Date()), endOfMonth(new Date())))[cat] || 0;
    const pct = used / limit * 100;
    if (pct >= 100) toast('🚨 ' + t('warn100') + ': ' + cat + ' (' + Math.round(pct) + '%)', 'error');
    else if (pct >= 80) toast('⚠️ ' + t('warn80') + ': ' + cat + ' (' + Math.round(pct) + '%)', 'warn');
  }
  async function deleteTx(id) {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await window.Store.deleteTransaction(id);
      DATA.transactions = DATA.transactions.filter((x) => x.id !== id);
      toast(t('deleted'), 'info'); render();
    } catch (err) {
      toast(t('syncError') + ': ' + err.message, 'error');
    }
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
    if (tx.type === 'transfer') {
      const from = accountById(tx.accountId);
      const to = accountById(tx.toAccountId);
      const fromN = from ? from.name : t('unassignedWallet');
      const toN = to ? to.name : t('unassignedWallet');
      return '<div class="tx-row" data-id="' + tx.id + '">' +
        '<div class="tx-ic transfer">' + icon('transfer') + '</div>' +
        '<div class="tx-main"><div class="tx-note">' + esc(tx.note || t('transfer')) + '</div>' +
        '<div class="tx-meta">' + esc(fromN) + ' → ' + esc(toN) + ' · ' + tx.date + (tx.time ? ' ' + tx.time : '') + '</div></div>' +
        '<div class="tx-right"><div class="tx-amount transfer">' + fmtShort(tx.amount) + '₫</div>' +
        '<div class="tx-actions"><button class="icon-btn" data-act="edit" data-id="' + tx.id + '">' + icon('edit') + '</button>' +
        '<button class="icon-btn" data-act="del" data-id="' + tx.id + '">' + icon('trash') + '</button></div></div></div>';
    }
    const sign = tx.type === 'income' ? '+' : '−';
    return '<div class="tx-row" data-id="' + tx.id + '">' +
      '<div class="tx-ic ' + tx.type + '">' + catIcon(tx.category) + '</div>' +
      '<div class="tx-main"><div class="tx-note">' + esc(tx.note || tx.rawInput) + '</div>' +
      '<div class="tx-meta">' + esc(catLabel(tx.category)) + ' · ' + tx.date + (tx.time ? ' ' + tx.time : '') + '</div></div>' +
      '<div class="tx-right"><div class="tx-amount ' + tx.type + '">' + sign + fmtShort(tx.amount) + '₫</div>' +
      '<div class="tx-actions"><button class="icon-btn" data-act="edit" data-id="' + tx.id + '">' + icon('edit') + '</button>' +
      '<button class="icon-btn" data-act="del" data-id="' + tx.id + '">' + icon('trash') + '</button></div></div></div>';
  }
  function budgetBarsHtml(byCat, budgets) {
    const cats = Object.keys(budgets).filter((c) => budgets[c] > 0);
    if (!cats.length) return '<div class="empty">' + t('budgetNotSet') + '</div>';
    return cats.map((cat) => {
      const limit = budgets[cat], used = byCat[cat] || 0;
      const raw = limit ? used / limit * 100 : 0, pct = Math.min(100, Math.round(raw));
      let cls = 'ok'; if (raw >= 90) cls = 'danger'; else if (raw >= 70) cls = 'warn';
      return '<div class="budget-row">' +
        '<div class="budget-top"><span class="budget-cat">' + catIcon(cat) + esc(catLabel(cat)) + '</span>' +
        '<span class="budget-nums ' + (used > limit ? 'over' : '') + '">' + fmtShort(used) + ' / ' + fmtShort(limit) + '₫</span></div>' +
        '<div class="budget-track"><div class="budget-fill ' + cls + '" style="width:' + pct + '%"></div></div></div>';
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
      return '<div class="wallet-card">' +
        '<div class="wallet-top">' + accountTypeIcon(a.type) + '<span>' + esc(a.name) + '</span></div>' +
        '<div class="wallet-bal ' + (b < 0 ? 'neg' : '') + '">' + mask(fmtShort(b) + '₫') + '</div></div>';
    }).join('');
    return '<div class="section-title">' + t('wallets') + '</div>' +
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
    // 7-day sparkline
    const spark = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); spark.push(totals(DATA.transactions.filter((x) => x.date === ymd(d) && x.type === 'expense')).expense); }
    setTimeout(() => window.Charts.sparkline('weekSpark', spark, getComputedStyle(document.body).getPropertyValue('--expense').trim() || '#ef4444'), 0);

    const recent = DATA.transactions.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 5);

    return (
      '<div class="hero">' +
      '<div class="hero-label">' + icon('wallet') + ' ' + t('balance') +
      '<button id="eyeToggle" class="eye-btn" title="' + (hideAmounts ? t('showBalance') : t('hideBalance')) + '">' + icon(hideAmounts ? 'eyeOff' : 'eye') + '</button></div>' +
      '<div class="hero-balance">' + mask(fmtVND(bal)) + '</div>' +
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

      // Wallet balances
      walletStripHtml() +

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
      labels = t('dows').slice();
      const s = startOfWeek(reportAnchor);
      for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(s.getDate() + i); const dt = ymd(d); const dd = txs.filter((x) => x.date === dt); inc.push(totals(dd).income); exp.push(totals(dd).expense); }
    } else if (reportPeriod === 'year') {
      for (let m = 0; m < 12; m++) { labels.push(t('moPrefix') + (m + 1)); const mk = reportAnchor.getFullYear() + '-' + pad(m + 1); const dd = txs.filter((x) => x.date.slice(0, 7) === mk); inc.push(totals(dd).income); exp.push(totals(dd).expense); }
    } else {
      const days = endOfMonth(reportAnchor).getDate(); const weeks = Math.ceil(days / 7);
      for (let w = 0; w < weeks; w++) { labels.push(t('weekLabel') + ' ' + (w + 1)); inc.push(0); exp.push(0); }
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
      window.Charts.donut('repDonut', 'repLegend', byCat, (cat) => { filterCategory = cat; filterMonth = monthKey(reportAnchor); currentTab = 'transactions'; render(); }, catLabel);
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
    const catOpts = '<option value="">' + t('allCats') + '</option>' + CATS.map((c) => '<option value="' + c + '"' + (c === filterCategory ? ' selected' : '') + '>' + catLabel(c) + '</option>').join('');
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
      '<button id="addBtnBig" class="primary-btn">' + icon('plus') + ' ' + t('add') + '</button>' +
      (activeAccounts().length >= 2 ? '<button id="transferBtn" class="ghost-btn transfer-btn">' + icon('transfer') + ' ' + t('transferBetween') + '</button>' : '') +
      '<div class="examples">' +
      ['ăn sáng 35k', 'lương 15 triệu', 'đổ xăng 80k', 'cafe 2 triệu rưỡi', 'grab 1tr2', 'tiền điện 500 nghìn', 'mua giày 800k', 'khám bệnh 250k']
        .map((ex) => '<button class="chip" data-ex="' + ex + '">' + ex + '</button>').join('') +
      '</div></div>';
  }

  /* ============== VIEW: Settings ============== */
  function membersHtml() {
    if (!householdMembers.length) return '';
    const ownerId = DATA.household && DATA.household.createdBy;
    const iAmOwner = ownerId && ownerId === currentUserId;
    const rows = householdMembers.map((m) => {
      const isSelf = m.userId === currentUserId;
      const isOwn = ownerId && ownerId === m.userId;
      const label = esc(m.email || t('unknownMember')) + (isSelf ? ' <span class="member-you">(' + t('you') + ')</span>' : '');
      const role = isOwn ? t('roleOwner') : t('roleMember');
      let act = '';
      if (isSelf && !isOwn) act = '<button class="icon-btn danger" data-leave="1" title="' + t('leaveHousehold') + '">' + icon('right') + '</button>';
      else if (iAmOwner && !isSelf) act = '<button class="icon-btn danger" data-remove="' + esc(m.userId) + '" title="' + t('confirmRemoveMember') + '">' + icon('trash') + '</button>';
      return '<div class="member-row">' +
        '<div class="member-info"><div class="member-email">' + label + '</div>' +
        '<div class="member-role ' + (isOwn ? 'owner' : '') + '">' + role + '</div></div>' + act + '</div>';
    }).join('');
    return '<div class="section-title">' + t('members') + ' (' + householdMembers.length + ')</div>' +
      '<div class="member-list">' + rows + '</div>';
  }

  // Editable list of wallets in Settings (name, type, opening balance, delete) + add button.
  function walletEditRowHtml(acc) {
    const a = acc || { id: '', name: '', type: 'cash', openingBalance: 0 };
    const typeOpts = ACCOUNT_TYPES.map((ty) => '<option value="' + ty + '"' + (ty === a.type ? ' selected' : '') + '>' + accountTypeLabel(ty) + '</option>').join('');
    const balHtml = acc ? '<span class="w-bal">= ' + fmtShort(accountBalance(a.id)) + '₫</span>' : '';
    return '<div class="wallet-edit-row" data-acc="' + esc(a.id) + '">' +
      '<div class="wallet-edit-main">' +
      '<input type="text" class="w-name" value="' + esc(a.name) + '" placeholder="' + t('walletName') + '"/>' +
      '<select class="w-type">' + typeOpts + '</select>' +
      (acc ? '<button class="icon-btn danger" data-delacc="' + esc(a.id) + '" title="' + t('delete') + '">' + icon('trash') + '</button>' : '') +
      '</div>' +
      '<div class="wallet-edit-sub"><label>' + t('openingBalance') + '</label>' +
      '<input type="number" inputmode="numeric" class="w-open" value="' + (a.openingBalance || 0) + '"/>' + balHtml +
      '</div></div>';
  }
  function walletsEditorHtml() {
    const accs = activeAccounts();
    const rows = accs.length ? accs.map((a) => walletEditRowHtml(a)).join('') : '<div class="empty">' + t('noWallets') + '</div>';
    return '<div class="section-title">' + t('wallets') + '</div>' +
      '<div class="wallet-edit" id="walletEdit">' + rows + '</div>' +
      '<div class="wallet-edit-actions">' +
      '<button id="addWalletBtn" class="ghost-btn">' + icon('plus') + ' ' + t('addWallet') + '</button>' +
      '<button id="saveWalletsBtn" class="primary-btn">' + icon('wallet') + ' ' + t('save') + '</button>' +
      '</div>';
  }

  function viewSettings() {
    const budgetInputs = CATS.filter((c) => c !== 'Thu nhập').map((c) =>
      '<div class="budget-edit-row"><label>' + catIcon(c) + esc(catLabel(c)) + '</label>' +
      '<input type="number" inputmode="numeric" data-budget="' + c + '" value="' + (DATA.budgets[c] || 0) + '"/></div>').join('');
    const C = window.CONFIG;
    const hh = DATA.household || { id: '', name: '' };
    const f = (id, label, val, type) => '<div class="conn-row"><label>' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false"/></div>';

    return (
      '<div class="section-title">' + t('budget') + ' (' + t('month').toLowerCase() + ')</div>' +
      '<div class="budget-edit">' + budgetInputs + '</div>' +
      '<button id="saveBudgetBtn" class="primary-btn">' + icon('target') + ' ' + t('saveBudget') + '</button>' +

      // Wallets / Accounts
      walletsEditorHtml() +

      // Household
      '<div class="section-title">' + t('household') + '</div>' +
      (myHouseholds.length > 1 ?
        '<div class="conn-row" style="margin-bottom:12px"><label>' + t('switchHousehold') + '</label><select id="switchHh">' +
        myHouseholds.map((h) => '<option value="' + esc(h.id) + '"' + (hh.id === h.id ? ' selected' : '') + '>' + esc(h.name) + '</option>').join('') +
        '</select></div>' : '') +
      '<div class="conn-form">' +
      '<div class="conn-row"><label>' + t('householdName') + '</label><input id="hhName" type="text" value="' + esc(hh.name) + '"/></div>' +
      '</div>' +
      '<button id="renameHhBtn" class="ghost-btn">' + icon('edit') + ' ' + t('save') + '</button>' +
      '<div class="conn-row" style="margin-top:12px"><label>' + t('inviteCode') + '</label>' +
      '<input id="inviteCodeBox" type="text" value="' + esc(hh.id) + '" readonly/></div>' +
      '<button id="copyCodeBtn" class="ghost-btn">' + icon('file') + ' ' + t('copyCode') + '</button>' +
      '<div class="conn-row" style="margin-top:12px"><label>' + t('joinHousehold') + '</label>' +
      '<input id="joinCode" type="text" placeholder="' + t('joinCodePh') + '"/></div>' +
      '<button id="joinHhBtn" class="ghost-btn">' + icon('check') + ' ' + t('join') + '</button>' +

      // Members
      membersHtml() +

      // Language / theme
      '<div class="section-title">' + t('language') + ' · ' + t('theme') + '</div>' +
      '<div class="settings-row"><div class="seg">' +
      '<button class="seg-btn ' + (lang === 'vi' ? 'active' : '') + '" data-lang="vi">🇻🇳 VI</button>' +
      '<button class="seg-btn ' + (lang === 'en' ? 'active' : '') + '" data-lang="en">🇬🇧 EN</button></div>' +
      '<button id="themeToggle2" class="ghost-btn">' + icon('moon') + ' ' + t('theme') + '</button></div>' +

      // Account
      '<div class="section-title">' + t('account') + '</div>' +
      '<div class="config-status ok">👤 ' + esc(currentUserEmail || '') + '</div>' +
      '<button id="signOutBtn" class="ghost-btn">' + icon('right') + ' ' + t('signOut') + '</button>' +

      // Claude API key (optional)
      '<div class="section-title">' + t('anthropicKey') + '</div>' +
      '<div class="conn-form">' + f('cfgAnthropic', t('anthropicKey'), C.ANTHROPIC_API_KEY, 'password') + '</div>' +
      '<button id="saveConfigBtn" class="primary-btn">' + icon('check') + ' ' + t('save') + '</button>' +

      // Supabase configuration
      '<div class="section-title">' + t('connTitle') + '</div>' +
      '<div class="conn-form">' +
      f('cfgSupaUrl', t('supaUrl'), C.SUPABASE_URL) +
      f('cfgSupaKey', t('supaKey'), C.SUPABASE_ANON_KEY, 'password') + '</div>' +
      '<button id="saveSupaBtn" class="ghost-btn">' + icon('settings') + ' ' + t('saveConnect') + '</button>' +
      '<div class="hint">' + t('tokenHint') + '</div>'
    );
  }

  /* ============== Transfer modal ============== */
  function openTransfer(existing) {
    const accs = activeAccounts();
    if (accs.length < 2) { toast(t('needTwoWallets'), 'warn'); return; }
    const ex = existing || null;
    const fromSel = ex ? ex.accountId : defaultAccountId();
    const toSel = ex ? ex.toAccountId : (accs.find((a) => a.id !== fromSel) || accs[0]).id;
    const today = ymd(new Date());
    const opt = (a, sel) => '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + '</option>';
    const fromOpts = accs.map((a) => opt(a, fromSel)).join('');
    const toOpts = accs.map((a) => opt(a, toSel)).join('');
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon('transfer') + ' ' + t('transferBetween') + '</div>' +
      '<label>' + t('fromWallet') + '</label><select id="tFrom">' + fromOpts + '</select>' +
      '<label>' + t('toWallet') + '</label><select id="tTo">' + toOpts + '</select>' +
      '<label>' + t('amount') + '</label><input id="tAmount" type="number" inputmode="numeric" value="' + (ex ? ex.amount : '') + '"/>' +
      '<label>' + t('date') + '</label><input id="tDate" type="date" value="' + (ex ? esc(ex.date) : today) + '" max="' + today + '"/>' +
      '<label>' + t('note') + '</label><input id="tNote" type="text" value="' + (ex ? esc(ex.note) : '') + '"/>' +
      '<div class="modal-actions"><button class="ghost-btn" id="tCancel">' + t('cancel') + '</button>' +
      '<button class="primary-btn" id="tSave">' + t('save') + '</button></div></div></div>';
    document.body.appendChild(wrap.firstChild);
    const close = () => { const m = document.getElementById('modalBackdrop'); if (m) m.remove(); };
    document.getElementById('tCancel').addEventListener('click', close);
    document.getElementById('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') close(); });
    document.getElementById('tSave').addEventListener('click', async () => {
      const from = document.getElementById('tFrom').value;
      const to = document.getElementById('tTo').value;
      const amount = Math.round(Number(document.getElementById('tAmount').value) || 0);
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
    });
  }

  /* ============== Edit modal ============== */
  function openEdit(id) {
    const tx = DATA.transactions.find((x) => x.id === id); if (!tx) return;
    if (tx.type === 'transfer') { openTransfer(tx); return; }
    const catOpts = CATS.map((c) => '<option value="' + c + '"' + (c === tx.category ? ' selected' : '') + '>' + catLabel(c) + '</option>').join('');
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="modal-backdrop" id="modalBackdrop"><div class="modal">' +
      '<div class="card-title">' + icon('edit') + ' ' + t('edit') + '</div>' +
      '<label>' + t('amount') + '</label><input id="eAmount" type="number" inputmode="numeric" value="' + tx.amount + '"/>' +
      '<label>' + t('category') + '</label><select id="eCat">' + catOpts + '</select>' +
      '<label>' + t('note') + '</label><input id="eNote" type="text" value="' + esc(tx.note) + '"/>' +
      '<div class="edit-datetime"><div><label>' + t('date') + '</label><input id="eDate" type="date" value="' + esc(tx.date) + '" max="' + ymd(new Date()) + '"/></div>' +
      '<div><label>' + t('time') + '</label><input id="eTime" type="time" value="' + esc(tx.time || '') + '"/></div></div>' +
      (activeAccounts().length ? '<label>' + t('wallet') + '</label>' + accountSelect('eAccount', tx.accountId) : '') +
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
    document.getElementById('eSave').addEventListener('click', async () => {
      const fields = {
        amount: Math.round(Number(document.getElementById('eAmount').value) || 0),
        category: document.getElementById('eCat').value,
        note: document.getElementById('eNote').value.trim(),
        type: newType,
        date: document.getElementById('eDate').value || tx.date,
        time: document.getElementById('eTime').value || '',
      };
      const eAcct = document.getElementById('eAccount');
      if (eAcct) fields.accountId = eAcct.value || null;
      try {
        await window.Store.updateTransaction(tx.id, fields);
        Object.assign(tx, fields);
        close(); toast(t('save') + ' ✓', 'success'); render();
      } catch (err) {
        toast(t('syncError') + ': ' + err.message, 'error');
      }
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
    if (ti) { document.getElementById('addBtn').addEventListener('click', () => addFromInput(ti.value, 'addBtn', 'txDate', 'txAccount')); ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFromInput(ti.value, 'addBtn', 'txDate', 'txAccount'); }); }
    // add page
    const tib = document.getElementById('txInputBig');
    if (tib) document.getElementById('addBtnBig').addEventListener('click', () => addFromInput(tib.value, 'addBtnBig', 'txDateBig', 'txAccountBig'));
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
    document.querySelectorAll('.tx-actions .icon-btn').forEach((b) => b.addEventListener('click', () => { b.dataset.act === 'del' ? deleteTx(b.dataset.id) : openEdit(b.dataset.id); }));
    // goto links
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { currentTab = b.dataset.goto; render(); }));
    // privacy: toggle balance visibility (eye icon on the hero)
    const eye = document.getElementById('eyeToggle');
    if (eye) eye.addEventListener('click', () => {
      hideAmounts = !hideAmounts;
      try { localStorage.setItem('hideAmounts', hideAmounts ? '1' : '0'); } catch (e) { /* ignore */ }
      render();
    });
    // reports period + nav
    document.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { reportPeriod = b.dataset.period; render(); }));
    document.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => shiftReport(parseInt(b.dataset.shift, 10))));
    // budgets
    const sb = document.getElementById('saveBudgetBtn');
    if (sb) sb.addEventListener('click', async () => {
      const obj = {};
      document.querySelectorAll('[data-budget]').forEach((i) => { obj[i.dataset.budget] = Math.round(Number(i.value) || 0); });
      try {
        await window.Store.saveBudgets(obj);
        Object.assign(DATA.budgets, obj);
        toast(t('budgetSaved'), 'success');
      } catch (err) {
        toast(t('syncError') + ': ' + err.message, 'error');
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
    if (sw) sw.addEventListener('click', async () => {
      const rows = Array.from(document.querySelectorAll('#walletEdit .wallet-edit-row'));
      try {
        for (const row of rows) {
          const id = row.dataset.acc;
          const name = (row.querySelector('.w-name').value || '').trim();
          const type = row.querySelector('.w-type').value;
          const openingBalance = Math.round(Number(row.querySelector('.w-open').value) || 0);
          if (id) await window.Store.updateAccount(id, { name: name || t('wallet'), type: type, openingBalance: openingBalance });
          else if (name) await window.Store.addAccount({ name: name, type: type, openingBalance: openingBalance, sortOrder: rows.indexOf(row) });
        }
        await refreshData(true);
        toast(t('walletSaved'), 'success');
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    });
    // wallets: delete
    document.querySelectorAll('[data-delacc]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(t('confirmDeleteWallet'))) return;
      try {
        await window.Store.deleteAccount(b.dataset.delacc);
        await refreshData(true);
        toast(t('walletDeleted'), 'info');
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    }));
    // lang
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; localStorage.setItem('lang', lang); document.getElementById('langToggle').textContent = lang.toUpperCase(); render(); }));
    const tt2 = document.getElementById('themeToggle2'); if (tt2) tt2.addEventListener('click', toggleTheme);
    // Save Anthropic key (parser)
    const sc = document.getElementById('saveConfigBtn');
    if (sc) sc.addEventListener('click', () => {
      saveSettings({ ANTHROPIC_API_KEY: document.getElementById('cfgAnthropic').value.trim() });
      toast(t('save') + ' ✓', 'success');
    });
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
    if (rh) rh.addEventListener('click', async () => {
      const name = document.getElementById('hhName').value.trim();
      if (!name) return;
      try { await window.Store.renameHousehold(name); if (DATA.household) DATA.household.name = name; toast(t('renameOk'), 'success'); render(); }
      catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    });
    // Copy invite code
    const cc = document.getElementById('copyCodeBtn');
    if (cc) cc.addEventListener('click', () => {
      const code = DATA.household ? DATA.household.id : '';
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast(t('copied'), 'success'));
      else toast(code, 'info');
    });
    // Join another household
    const jb = document.getElementById('joinHhBtn');
    if (jb) jb.addEventListener('click', async () => {
      const code = document.getElementById('joinCode').value.trim();
      if (!code) return;
      try {
        await window.Store.joinHousehold(code);
        toast(t('joined'), 'success');
        await enterApp();
      } catch (err) { toast(err.message, 'error'); }
    });
    // Remove member (owner removes another member)
    document.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(t('confirmRemoveMember'))) return;
      try {
        await window.Store.removeMember(b.dataset.remove);
        householdMembers = await window.Store.listMembers().catch(() => []);
        toast(t('memberRemoved'), 'success'); render();
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    }));
    // Leave household (remove yourself)
    const lv = document.querySelector('[data-leave]');
    if (lv) lv.addEventListener('click', async () => {
      if (!confirm(t('confirmLeave'))) return;
      try {
        window.Store.unsubscribeChanges();
        await window.Store.removeMember(currentUserId);
        toast(t('memberRemoved'), 'info');
        await enterApp();
      } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
    });
    // Switch household (when in multiple households)
    const hs = document.getElementById('switchHh');
    if (hs) hs.addEventListener('change', async () => {
      try { await window.Store.switchHousehold(hs.value); await enterApp(); }
      catch (err) { toast(err.message, 'error'); }
    });
    // Sign out
    const so = document.getElementById('signOutBtn');
    if (so) so.addEventListener('click', async () => {
      try { window.Store.unsubscribeChanges(); } catch (e) { /* ignore */ }
      await window.Store.signOut();
      DATA = { household: null, budgets: {}, transactions: [] };
      showAuth('login');
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

  async function doAuth() {
    const email = (document.getElementById('aEmail').value || '').trim();
    const password = document.getElementById('aPass').value || '';
    if (!email || !password) { toast(t('fillEmailPass'), 'warn'); return; }
    const btn = document.getElementById('aPrimary');
    const old = btn.innerHTML; btn.disabled = true; btn.textContent = '…';
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
      toast(t('authError') + ': ' + err.message, 'error');
      btn.disabled = false; btn.innerHTML = old;
    }
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
    myHouseholds = await window.Store.listHouseholds().catch(() => []);
    householdMembers = await window.Store.listMembers().catch(() => []);
    currentTab = 'overview';
    render();
    startAutoSync();
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
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(true); });
    window.addEventListener('focus', () => refreshData(true));
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

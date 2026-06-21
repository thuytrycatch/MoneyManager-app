/* =====================================================================
 *  store.js — Lớp dữ liệu Supabase: Auth + Hộ gia đình + Giao dịch + Ngân sách
 * ---------------------------------------------------------------------
 *  Thay cho github.js cũ. Dữ liệu lưu trong PostgreSQL của Supabase, bảo vệ
 *  bằng Row Level Security (mỗi hộ chỉ thấy dữ liệu của mình — xem
 *  supabase-schema.sql).
 *
 *  API (window.Store):
 *    isConfigured()                       - đã có URL + anon key chưa
 *    signUp/signIn/signOut                - xác thực email/mật khẩu
 *    getUser()                            - user đang đăng nhập (hoặc null)
 *    loadData()                           - {household, budgets, transactions}
 *    addTransaction / updateTransaction / deleteTransaction
 *    saveBudgets(obj)                     - upsert ngân sách
 *    getHousehold() / renameHousehold / joinHousehold(code)
 *    getCachedData()                      - dữ liệu cache (hiển thị khi offline)
 * ===================================================================== */

(function () {
  'use strict';

  const DEFAULT_BUDGETS = {
    'Ăn uống': 3000000,
    'Di chuyển': 1000000,
    'Mua sắm': 2000000,
    'Giải trí': 1000000,
    'Sức khỏe': 500000,
    'Hóa đơn': 2000000,
    'Khác': 500000,
  };

  let client = null;
  let household = null; // { id, name }

  /* ---------------- Cấu hình & client ---------------- */
  function cfg() { return window.CONFIG || {}; }

  function isConfigured() {
    const c = cfg();
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY);
  }

  // Chuẩn hóa URL: bỏ khoảng trắng, bỏ dấu "/" thừa, bỏ phần "/rest/v1" nếu dán nhầm.
  function normalizeUrl(raw) {
    let u = (raw || '').trim();
    u = u.replace(/\/+$/, '');           // bỏ dấu / ở cuối
    u = u.replace(/\/rest\/v1$/i, '');   // lỡ dán kèm /rest/v1
    return u;
  }

  function getClient() {
    if (client) return client;
    if (!isConfigured()) throw new Error('Chưa cấu hình Supabase (thiếu URL hoặc anon key).');
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Chưa tải được thư viện Supabase — kiểm tra kết nối mạng.');
    }
    client = window.supabase.createClient(normalizeUrl(cfg().SUPABASE_URL), (cfg().SUPABASE_ANON_KEY || '').trim(), {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  /* ---------------- IndexedDB cache (hiển thị offline) ---------------- */
  const DB_NAME = 'chitieuviet';
  const STORE = 'kv';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function getCachedData() { return idbGet('data').catch(() => null); }

  /* ---------------- Auth ---------------- */
  async function getUser() {
    if (!isConfigured()) return null;
    try {
      const { data } = await getClient().auth.getUser();
      return data ? data.user : null;
    } catch (e) {
      return null;
    }
  }
  async function signUp(email, password) {
    const { data, error } = await getClient().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    return data;
  }
  async function signIn(email, password) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data;
  }
  async function signOut() {
    if (client) { try { await client.auth.signOut(); } catch (e) { /* ignore */ } }
    household = null;
  }

  /* ---------------- Hộ gia đình ---------------- */
  async function ensureHousehold(user) {
    const sb = getClient();
    // Đã thuộc hộ nào chưa?
    const { data: mems, error } = await sb
      .from('household_members')
      .select('household_id,households(id,name)')
      .eq('user_id', user.id)
      .limit(1);
    if (error) throw new Error(error.message);
    if (mems && mems.length && mems[0].households) {
      household = { id: mems[0].households.id, name: mems[0].households.name };
      return household;
    }
    // Chưa có → tạo hộ mới + thêm chính mình làm thành viên
    const baseName = user.email ? user.email.split('@')[0] : 'tôi';
    const { data: h, error: e1 } = await sb
      .from('households')
      .insert({ name: 'Gia đình của ' + baseName, created_by: user.id })
      .select()
      .single();
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await sb
      .from('household_members')
      .insert({ household_id: h.id, user_id: user.id, role: 'owner' });
    if (e2) throw new Error(e2.message);
    household = { id: h.id, name: h.name };
    // Seed ngân sách mặc định
    try { await saveBudgetsInternal(h.id, DEFAULT_BUDGETS); } catch (e) { /* không chặn */ }
    return household;
  }

  async function joinHousehold(code) {
    const user = await getUser();
    if (!user) throw new Error('Chưa đăng nhập.');
    const sb = getClient();
    const id = (code || '').trim();
    if (!id) throw new Error('Vui lòng nhập mã hộ.');
    // Tự thêm mình vào hộ (FK sẽ chặn nếu mã hộ không tồn tại)
    const { error } = await sb
      .from('household_members')
      .insert({ household_id: id, user_id: user.id, role: 'member' });
    if (error && !/duplicate key/i.test(error.message)) {
      throw new Error('Mã hộ không hợp lệ hoặc không tồn tại.');
    }
    // Giờ đã là thành viên → đọc được tên hộ
    const { data: h, error: e2 } = await sb
      .from('households').select('id,name').eq('id', id).single();
    if (e2 || !h) throw new Error('Không đọc được thông tin hộ.');
    household = { id: h.id, name: h.name };
    return household;
  }

  async function renameHousehold(name) {
    if (!household) throw new Error('Chưa có hộ.');
    const sb = getClient();
    const { error } = await sb.from('households').update({ name: name }).eq('id', household.id);
    if (error) throw new Error(error.message);
    household.name = name;
    return household;
  }

  function getHousehold() { return household; }

  /* ---------------- Map row DB → tx ứng dụng ---------------- */
  function mapRow(r) {
    return {
      id: r.id,
      date: r.date,
      time: r.time || '',
      amount: Number(r.amount),
      type: r.type,
      category: r.category,
      note: r.note || '',
      rawInput: r.raw_input || '',
      createdAt: r.created_at,
    };
  }

  /* ---------------- Đọc toàn bộ dữ liệu của hộ ---------------- */
  async function loadData() {
    const user = await getUser();
    if (!user) throw new Error('Chưa đăng nhập.');
    if (!household) await ensureHousehold(user);
    const sb = getClient();
    const hid = household.id;

    const [txRes, budRes] = await Promise.all([
      sb.from('transactions').select('*')
        .eq('household_id', hid)
        .order('date', { ascending: false })
        .order('time', { ascending: false, nullsFirst: false }),
      sb.from('budgets').select('category,amount').eq('household_id', hid),
    ]);
    if (txRes.error) throw new Error(txRes.error.message);
    if (budRes.error) throw new Error(budRes.error.message);

    const budgets = {};
    (budRes.data || []).forEach((b) => { budgets[b.category] = Number(b.amount); });
    const transactions = (txRes.data || []).map(mapRow);

    const data = { household: { id: household.id, name: household.name }, budgets, transactions };
    idbSet('data', data).catch(() => {});
    return data;
  }

  /* ---------------- CRUD giao dịch ---------------- */
  async function addTransaction(tx) {
    if (!household) throw new Error('Chưa có hộ.');
    const user = await getUser();
    const sb = getClient();
    const row = {
      household_id: household.id,
      user_id: user ? user.id : null,
      date: tx.date,
      time: tx.time || null,
      amount: Math.round(tx.amount),
      type: tx.type,
      category: tx.category,
      note: tx.note || null,
      raw_input: tx.rawInput || null,
    };
    const { data, error } = await sb.from('transactions').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  async function updateTransaction(id, fields) {
    const sb = getClient();
    const patch = {};
    if ('amount' in fields) patch.amount = Math.round(fields.amount);
    if ('category' in fields) patch.category = fields.category;
    if ('note' in fields) patch.note = fields.note || null;
    if ('type' in fields) patch.type = fields.type;
    const { error } = await sb.from('transactions').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async function deleteTransaction(id) {
    const sb = getClient();
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ---------------- Ngân sách ---------------- */
  async function saveBudgetsInternal(hid, obj) {
    const sb = getClient();
    const rows = Object.keys(obj).map((c) => ({
      household_id: hid, category: c, amount: Math.round(obj[c] || 0),
    }));
    if (!rows.length) return;
    const { error } = await sb.from('budgets').upsert(rows, { onConflict: 'household_id,category' });
    if (error) throw new Error(error.message);
  }
  async function saveBudgets(obj) {
    if (!household) throw new Error('Chưa có hộ.');
    return saveBudgetsInternal(household.id, obj);
  }

  /* ---------------- Xuất global ---------------- */
  window.Store = {
    isConfigured,
    getClient,
    getUser,
    signUp,
    signIn,
    signOut,
    ensureHousehold,
    joinHousehold,
    renameHousehold,
    getHousehold,
    loadData,
    getCachedData,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    saveBudgets,
    DEFAULT_BUDGETS,
  };
})();

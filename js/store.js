/* =====================================================================
 *  store.js — Supabase data layer: Auth + Household + Transactions + Budgets
 * ---------------------------------------------------------------------
 *  Replaces the old github.js. Data is stored in Supabase's PostgreSQL,
 *  protected by Row Level Security (each household only sees its own data —
 *  see supabase-schema.sql).
 *
 *  API (window.Store):
 *    isConfigured()                       - whether URL + anon key are set
 *    signUp/signIn/signOut                - email/password authentication
 *    getUser()                            - currently logged-in user (or null)
 *    loadData()                           - {household, budgets, transactions}
 *    addTransaction / updateTransaction / deleteTransaction
 *    saveBudgets(obj)                     - upsert budgets
 *    getHousehold() / renameHousehold / joinHousehold(code)
 *    getCachedData()                      - cached data (shown when offline)
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

  /* ---------------- Configuration & client ---------------- */
  function cfg() { return window.CONFIG || {}; }

  // Localized message: use the app's i18n (window.t) when available, else the Vietnamese fallback.
  function tr(key, fallback) {
    try { if (window.t) { const v = window.t(key); if (v && v !== key) return v; } } catch (e) { /* ignore */ }
    return fallback;
  }

  function isConfigured() {
    const c = cfg();
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY);
  }

  // Normalize the URL: trim whitespace, strip trailing "/", drop a "/rest/v1" suffix if pasted by mistake.
  function normalizeUrl(raw) {
    let u = (raw || '').trim();
    u = u.replace(/\/+$/, '');           // strip trailing /
    u = u.replace(/\/rest\/v1$/i, '');   // in case /rest/v1 was pasted along with it
    return u;
  }

  function getClient() {
    if (client) return client;
    if (!isConfigured()) throw new Error(tr('errNotConfigured', 'Chưa cấu hình Supabase (thiếu URL hoặc anon key).'));
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error(tr('errLibNotLoaded', 'Chưa tải được thư viện Supabase — kiểm tra kết nối mạng.'));
    }
    client = window.supabase.createClient(normalizeUrl(cfg().SUPABASE_URL), (cfg().SUPABASE_ANON_KEY || '').trim(), {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  /* ---------------- IndexedDB cache (offline display) ---------------- */
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

  /* ---------------- Household ---------------- */
  const ACTIVE_KEY = 'mm_active_household';
  function getActiveId() { try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch (e) { return ''; } }
  function setActiveId(id) { try { localStorage.setItem(ACTIVE_KEY, id || ''); } catch (e) { /* ignore */ } }

  // Returns ALL households the user belongs to: [{id, name, createdBy}]
  async function listHouseholds() {
    const user = await getUser();
    if (!user) return [];
    const sb = getClient();
    const { data, error } = await sb
      .from('household_members')
      .select('households(id,name,created_by)')
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
    return (data || []).filter((m) => m.households).map((m) => ({
      id: m.households.id, name: m.households.name, createdBy: m.households.created_by,
    }));
  }

  async function ensureHousehold(user) {
    const sb = getClient();
    const list = await listHouseholds();
    if (list.length) {
      // Prefer the currently selected household (saved in localStorage) if still a member
      const active = getActiveId();
      const found = list.find((h) => h.id === active);
      household = found || list[0];
      setActiveId(household.id);
      return household;
    }
    // None yet → create a new household + add self as a member
    const baseName = user.email ? user.email.split('@')[0] : tr('me', 'tôi');
    const { data: h, error: e1 } = await sb
      .from('households')
      .insert({ name: tr('hhDefaultPrefix', 'Gia đình của') + ' ' + baseName, created_by: user.id })
      .select()
      .single();
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await sb
      .from('household_members')
      .insert({ household_id: h.id, user_id: user.id, role: 'owner', email: user.email });
    if (e2) throw new Error(e2.message);
    household = { id: h.id, name: h.name, createdBy: h.created_by };
    setActiveId(household.id);
    // Seed default budgets
    try { await saveBudgetsInternal(h.id, DEFAULT_BUDGETS); } catch (e) { /* non-blocking */ }
    return household;
  }

  async function joinHousehold(code) {
    const user = await getUser();
    if (!user) throw new Error(tr('errNotSignedIn', 'Chưa đăng nhập.'));
    const sb = getClient();
    const id = (code || '').trim();
    if (!id) throw new Error(tr('errEnterCode', 'Vui lòng nhập mã hộ.'));
    // Add self to the household (the FK constraint blocks it if the household code does not exist)
    const { error } = await sb
      .from('household_members')
      .insert({ household_id: id, user_id: user.id, role: 'member', email: user.email });
    if (error && !/duplicate key/i.test(error.message)) {
      throw new Error(tr('errInvalidCode', 'Mã hộ không hợp lệ hoặc không tồn tại.'));
    }
    // Now a member → can read the household name
    const { data: h, error: e2 } = await sb
      .from('households').select('id,name,created_by').eq('id', id).single();
    if (e2 || !h) throw new Error(tr('errReadHousehold', 'Không đọc được thông tin hộ.'));
    household = { id: h.id, name: h.name, createdBy: h.created_by };
    setActiveId(household.id);
    return household;
  }

  /* ---------------- Members ---------------- */
  async function listMembers() {
    if (!household) return [];
    const sb = getClient();
    const { data, error } = await sb
      .from('household_members')
      .select('user_id,email,role,joined_at')
      .eq('household_id', household.id)
      .order('joined_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((m) => ({ userId: m.user_id, email: m.email, role: m.role }));
  }

  async function removeMember(userId) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const { error } = await sb
      .from('household_members')
      .delete()
      .eq('household_id', household.id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // Switch to another household (for users who belong to multiple)
  async function switchHousehold(id) {
    const list = await listHouseholds();
    const found = list.find((h) => h.id === id);
    if (!found) throw new Error(tr('errNotMember', 'Bạn không thuộc hộ này.'));
    household = found;
    setActiveId(id);
    return household;
  }

  async function renameHousehold(name) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const { error } = await sb.from('households').update({ name: name }).eq('id', household.id);
    if (error) throw new Error(error.message);
    household.name = name;
    return household;
  }

  function getHousehold() { return household; }

  /* ---------------- Map DB row → app tx ---------------- */
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
      accountId: r.account_id || null,
      toAccountId: r.to_account_id || null,
      createdAt: r.created_at,
    };
  }
  function mapAccount(a) {
    return {
      id: a.id,
      name: a.name,
      type: a.type || 'cash',
      openingBalance: Number(a.opening_balance || 0),
      archived: !!a.archived,
      sortOrder: a.sort_order || 0,
    };
  }

  /* ---------------- Read all of the household's data ---------------- */
  async function loadData() {
    const user = await getUser();
    if (!user) throw new Error(tr('errNotSignedIn', 'Chưa đăng nhập.'));
    if (!household) await ensureHousehold(user);
    const sb = getClient();
    const hid = household.id;

    // Auto-fill the email for our own member row (if still empty) so the member list can be displayed.
    if (user.email) {
      sb.from('household_members').update({ email: user.email })
        .eq('user_id', user.id).is('email', null).then(() => {}, () => {});
    }

    // Ensure the household has at least one wallet; migrate legacy transactions into a default "Tiền mặt" wallet.
    await ensureDefaultAccount(hid);

    const [txRes, budRes, accRes] = await Promise.all([
      sb.from('transactions').select('*')
        .eq('household_id', hid)
        .order('date', { ascending: false })
        .order('time', { ascending: false, nullsFirst: false }),
      sb.from('budgets').select('category,amount').eq('household_id', hid),
      sb.from('accounts').select('*').eq('household_id', hid)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);
    if (txRes.error) throw new Error(txRes.error.message);
    if (budRes.error) throw new Error(budRes.error.message);
    if (accRes.error) throw new Error(accRes.error.message);

    const budgets = {};
    (budRes.data || []).forEach((b) => { budgets[b.category] = Number(b.amount); });
    const transactions = (txRes.data || []).map(mapRow);
    const accounts = (accRes.data || []).map(mapAccount);

    const data = { household: { id: household.id, name: household.name, createdBy: household.createdBy }, budgets, transactions, accounts };
    idbSet('data', data).catch(() => {});
    return data;
  }

  // Create a default "Tiền mặt" wallet (and assign all unassigned transactions to it) if the household has none yet.
  async function ensureDefaultAccount(hid) {
    const sb = getClient();
    const { data: existing, error } = await sb.from('accounts').select('id').eq('household_id', hid).limit(1);
    if (error) throw new Error(error.message);
    if (existing && existing.length) return; // already has at least one wallet
    const { data: acc, error: e1 } = await sb.from('accounts')
      .insert({ household_id: hid, name: tr('walletCash', 'Tiền mặt'), type: 'cash', sort_order: 0 })
      .select().single();
    if (e1) throw new Error(e1.message);
    // Move legacy (account_id is null) transactions into the new default wallet.
    await sb.from('transactions').update({ account_id: acc.id })
      .eq('household_id', hid).is('account_id', null).then(() => {}, () => {});
  }

  /* ---------------- Transaction CRUD ---------------- */
  async function addTransaction(tx) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
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
      account_id: tx.accountId || null,
      to_account_id: tx.toAccountId || null,
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
    if ('date' in fields) patch.date = fields.date;
    if ('time' in fields) patch.time = fields.time || null;
    if ('accountId' in fields) patch.account_id = fields.accountId || null;
    if ('toAccountId' in fields) patch.to_account_id = fields.toAccountId || null;
    const { error } = await sb.from('transactions').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async function deleteTransaction(id) {
    const sb = getClient();
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ---------------- Budgets ---------------- */
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
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    return saveBudgetsInternal(household.id, obj);
  }

  /* ---------------- Accounts (wallets) ---------------- */
  async function addAccount(acc) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const { data, error } = await sb.from('accounts').insert({
      household_id: household.id,
      name: acc.name,
      type: acc.type || 'cash',
      opening_balance: Math.round(acc.openingBalance || 0),
      sort_order: acc.sortOrder || 0,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapAccount(data);
  }

  async function updateAccount(id, fields) {
    const sb = getClient();
    const patch = {};
    if ('name' in fields) patch.name = fields.name;
    if ('type' in fields) patch.type = fields.type;
    if ('openingBalance' in fields) patch.opening_balance = Math.round(fields.openingBalance || 0);
    if ('sortOrder' in fields) patch.sort_order = fields.sortOrder || 0;
    if ('archived' in fields) patch.archived = !!fields.archived;
    const { error } = await sb.from('accounts').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  // Delete a wallet. Its transactions are kept (account_id becomes null via the FK).
  async function deleteAccount(id) {
    const sb = getClient();
    const { error } = await sb.from('accounts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ---------------- Realtime sync ---------------- */
  let channel = null;
  function subscribeChanges(onChange) {
    if (!household) return;
    const sb = getClient();
    unsubscribeChanges();
    const hid = household.id;
    channel = sb.channel('hh-' + hid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: 'household_id=eq.' + hid }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets', filter: 'household_id=eq.' + hid }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: 'household_id=eq.' + hid }, onChange)
      .subscribe();
    return channel;
  }
  function unsubscribeChanges() {
    if (channel) { try { getClient().removeChannel(channel); } catch (e) { /* ignore */ } channel = null; }
  }

  /* ---------------- Global export ---------------- */
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
    listHouseholds,
    switchHousehold,
    listMembers,
    removeMember,
    loadData,
    getCachedData,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    saveBudgets,
    addAccount,
    updateAccount,
    deleteAccount,
    subscribeChanges,
    unsubscribeChanges,
    DEFAULT_BUDGETS,
  };
})();

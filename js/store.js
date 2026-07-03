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
    // If we removed ourselves (left the household), drop the cached selection so the
    // next loadData() re-picks another household (or creates a fresh one). Without this,
    // `household` still points to the household we just left and loadData would try to
    // read/insert into it — which RLS now blocks, causing an error.
    const user = await getUser();
    if (user && user.id === userId) {
      household = null;
      setActiveId('');
    }
  }

  // Change a member's role ('admin' or 'member'). Owner-only — enforced server-side
  // by the guard_member_role trigger + RLS, so a denied call throws here.
  async function setMemberRole(userId, role) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const r = (role === 'admin') ? 'admin' : 'member';
    const sb = getClient();
    const { error } = await sb
      .from('household_members')
      .update({ role: r })
      .eq('household_id', household.id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  // Transfer ownership to another member: promote them to 'owner', then demote self to 'admin'.
  // Order matters — we are still the owner when each update runs, so the role-guard trigger allows it.
  async function transferOwnership(userId) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const user = await getUser();
    if (!user) throw new Error(tr('errNotSignedIn', 'Chưa đăng nhập.'));
    const sb = getClient();
    const { error: e1 } = await sb
      .from('household_members').update({ role: 'owner' })
      .eq('household_id', household.id).eq('user_id', userId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await sb
      .from('household_members').update({ role: 'admin' })
      .eq('household_id', household.id).eq('user_id', user.id);
    if (e2) throw new Error(e2.message);
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
      userId: r.user_id || null,
      beneficiaryId: r.beneficiary_id || null,
      accountId: r.account_id || null,
      toAccountId: r.to_account_id || null,
      recurringId: r.recurring_id || null,
      createdAt: r.created_at,
    };
  }
  function mapRecurring(r) {
    return {
      id: r.id,
      name: r.name,
      amount: Number(r.amount || 0),
      type: r.type,
      category: r.category,
      accountId: r.account_id || null,
      freq: r.freq || 'monthly',
      day: Number(r.day || 1),
      nextRun: r.next_run,
      active: r.active !== false,
    };
  }
  function mapAccount(a) {
    return {
      id: a.id,
      name: a.name,
      type: a.type || 'cash',
      class: a.class || 'asset',
      openingBalance: Number(a.opening_balance || 0),
      creditLimit: a.credit_limit != null ? Number(a.credit_limit) : null,
      statementDay: a.statement_day != null ? Number(a.statement_day) : null,
      dueDay: a.due_day != null ? Number(a.due_day) : null,
      minPaymentPct: a.min_payment_pct != null ? Number(a.min_payment_pct) : null,
      goldWeightChi: a.gold_weight_chi != null ? Number(a.gold_weight_chi) : null,
      goldKind: a.gold_kind || null,
      goldFactor: a.gold_factor != null ? Number(a.gold_factor) : 1,
      goldCustomBuy: a.gold_custom_buy != null ? Number(a.gold_custom_buy) : null,
      goldBuyPerChi: a.gold_buy_per_chi != null ? Number(a.gold_buy_per_chi) : null,
      goldBuyDate: a.gold_buy_date || null,
      archived: !!a.archived,
      sortOrder: a.sort_order || 0,
      isDefault: !!a.is_default,
    };
  }
  function mapGoal(g) {
    return {
      id: g.id,
      name: g.name,
      targetAmount: Number(g.target_amount || 0),
      accountId: g.account_id || null,
      dueDate: g.due_date || null,
    };
  }
  function mapMonthlyReport(r) {
    return {
      id: r.id,
      period: r.period,
      metrics: r.metrics || {},
      aiReview: r.ai_review || null,
      closedBy: r.closed_by || null,
      closedAt: r.closed_at,
    };
  }
  function mapAttachment(a) {
    return {
      id: a.id,
      transactionId: a.transaction_id,
      storagePath: a.storage_path,
      mime: a.mime || null,
      sizeBytes: a.size_bytes != null ? Number(a.size_bytes) : null,
      width: a.width != null ? Number(a.width) : null,
      height: a.height != null ? Number(a.height) : null,
      uploadedBy: a.uploaded_by || null,
      createdAt: a.created_at,
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

    // Optional tables — tolerate absence so the app keeps working before
    // supabase-schema.sql has been re-run (missing table → empty list).
    const goals = await sb.from('goals').select('*').eq('household_id', hid)
      .then((r) => (r.error ? [] : (r.data || []).map(mapGoal))).catch(() => []);
    const recurring = await sb.from('recurring').select('*').eq('household_id', hid)
      .then((r) => (r.error ? [] : (r.data || []).map(mapRecurring))).catch(() => []);
    const attachments = await sb.from('transaction_attachments').select('*').eq('household_id', hid)
      .then((r) => (r.error ? [] : (r.data || []).map(mapAttachment))).catch(() => []);
    const monthlyReports = await sb.from('monthly_reports').select('*').eq('household_id', hid)
      .order('period', { ascending: false })
      .then((r) => (r.error ? [] : (r.data || []).map(mapMonthlyReport))).catch(() => []);
    // Household-wide shared settings (AI keys…). null = no row/table yet (fall back
    // to this browser's localStorage) — distinct from {} (row exists but empty).
    const aiConfig = await sb.from('household_settings').select('settings').eq('household_id', hid).limit(1)
      .then((r) => (r.error || !r.data || !r.data.length ? null : (r.data[0].settings || {}))).catch(() => null);
    // Shared gold price cache — no household_id (one row per kind, written by the
    // gold-price Edge Function / seed). Keyed by kind for O(1) lookup in the app.
    const goldPrices = await sb.from('gold_prices').select('*')
      .then((r) => {
        const out = {};
        if (!r.error) (r.data || []).forEach((p) => {
          out[p.kind] = {
            buyPerChi: Number(p.buy_per_chi),
            sellPerChi: p.sell_per_chi != null ? Number(p.sell_per_chi) : null,
            source: p.source || '',
            fetchedAt: p.fetched_at,
          };
        });
        return out;
      }).catch(() => ({}));

    const data = { household: { id: household.id, name: household.name, createdBy: household.createdBy }, budgets, transactions, accounts, goals, recurring, attachments, monthlyReports, goldPrices, aiConfig };
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
      beneficiary_id: tx.beneficiaryId || null,
    };
    // Only reference recurring_id when set — keeps inserts working even before the
    // schema with that column has been re-run (a plain add never sends it).
    if (tx.recurringId) row.recurring_id = tx.recurringId;
    const { data, error } = await sb.from('transactions').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  // Insert several transactions at once (one round-trip). Same household/RLS scope
  // and the same amount rounding as addTransaction(). Returns the saved rows.
  async function addTransactions(list) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    if (!Array.isArray(list) || !list.length) return [];
    const user = await getUser();
    const sb = getClient();
    const uid = user ? user.id : null;
    const rows = list.map((tx) => ({
      household_id: household.id,
      user_id: uid,
      date: tx.date,
      time: tx.time || null,
      amount: Math.round(tx.amount),
      type: tx.type,
      category: tx.category,
      note: tx.note || null,
      raw_input: tx.rawInput || null,
      account_id: tx.accountId || null,
      to_account_id: tx.toAccountId || null,
      beneficiary_id: tx.beneficiaryId || null,
    }));
    const { data, error } = await sb.from('transactions').insert(rows).select();
    if (error) throw new Error(error.message);
    return (data || []).map(mapRow);
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
    if ('beneficiaryId' in fields) patch.beneficiary_id = fields.beneficiaryId || null;
    const { error } = await sb.from('transactions').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async function deleteTransaction(id) {
    const sb = getClient();
    // Clean up any evidence FILES on Storage BEFORE deleting the transaction row.
    // Order matters: the receipts_delete storage policy checks the parent transaction
    // still exists, and deleting the row cascades the attachment rows away anyway.
    try {
      const { data: atts } = await sb.from('transaction_attachments')
        .select('storage_path').eq('transaction_id', id);
      const paths = (atts || []).map((a) => a.storage_path).filter(Boolean);
      if (paths.length) await removeReceipts(paths);
    } catch (e) { /* best-effort cleanup; never block the delete */ }
    const { error } = await sb.from('transactions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ---------------- Attachments (photo evidence) ----------------
   * Files live in the private Storage bucket 'receipts' at
   * '<household_id>/<transaction_id>/<uuid>.<ext>'; this table row is a pointer. */
  const RECEIPTS_BUCKET = 'receipts';
  const signedCache = new Map(); // storage_path -> { url, exp }

  // Upload one image blob for a transaction. Returns the storage path.
  async function uploadReceipt(txId, blob, ext) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const path = household.id + '/' + txId + '/' + cryptoUuid() + '.' + (ext || 'jpg');
    const { error } = await sb.storage.from(RECEIPTS_BUCKET)
      .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    return path;
  }

  // Record an uploaded file in the metadata table. Returns the mapped attachment.
  async function insertAttachment(meta) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const { data, error } = await sb.from('transaction_attachments').insert({
      household_id: household.id,
      transaction_id: meta.transactionId,
      storage_path: meta.storagePath,
      mime: meta.mime || null,
      size_bytes: meta.sizeBytes != null ? Math.round(meta.sizeBytes) : null,
      width: meta.width || null,
      height: meta.height || null,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapAttachment(data);
  }

  // A time-limited URL to view a private file. Cached until shortly before expiry.
  // Pass force=true to bypass the cache and request a fresh signature (used when a
  // previously-served URL failed to load).
  async function signedUrl(path, ttl, force) {
    ttl = ttl || 3600;
    const now = Date.now();
    if (force) signedCache.delete(path);
    const hit = signedCache.get(path);
    if (hit && hit.exp > now) return hit.url;
    const sb = getClient();
    const { data, error } = await sb.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, ttl);
    if (error) throw new Error(error.message);
    const url = data && data.signedUrl;
    // Only cache a real URL — never poison the cache with an empty result.
    if (url) signedCache.set(path, { url: url, exp: now + (ttl - 60) * 1000 });
    return url;
  }

  // Best-effort: drop files from Storage (never throws — used in cleanup paths).
  async function removeReceipts(paths) {
    if (!Array.isArray(paths) || !paths.length) return;
    try {
      await getClient().storage.from(RECEIPTS_BUCKET).remove(paths);
      paths.forEach((p) => signedCache.delete(p));
    } catch (e) { /* ignore */ }
  }

  // Remove one attachment: its metadata row, then its file (row first is fine — the
  // transaction still exists either way, so the storage policy is satisfied).
  async function deleteAttachment(att) {
    const sb = getClient();
    const { error } = await sb.from('transaction_attachments').delete().eq('id', att.id);
    if (error) throw new Error(error.message);
    await removeReceipts([att.storagePath]);
  }

  // Local helper so this section doesn't depend on app.js's uuid().
  function cryptoUuid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* ignore */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
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
    const row = {
      household_id: household.id,
      name: acc.name,
      type: acc.type || 'cash',
      class: acc.class || 'asset',
      opening_balance: Math.round(acc.openingBalance || 0),
      credit_limit: acc.creditLimit != null ? Math.round(acc.creditLimit) : null,
      statement_day: acc.statementDay || null,
      due_day: acc.dueDay || null,
      min_payment_pct: acc.minPaymentPct != null ? acc.minPaymentPct : null,
      sort_order: acc.sortOrder || 0,
    };
    // Gold metadata is only sent when present, so wallets keep saving on databases
    // that haven't re-run supabase-schema.sql yet (the columns may not exist there).
    if ('goldWeightChi' in acc) row.gold_weight_chi = acc.goldWeightChi;
    if ('goldKind' in acc) row.gold_kind = acc.goldKind;
    if ('goldFactor' in acc) row.gold_factor = acc.goldFactor != null ? acc.goldFactor : 1;
    if ('goldCustomBuy' in acc) row.gold_custom_buy = acc.goldCustomBuy != null ? Math.round(acc.goldCustomBuy) : null;
    if ('goldBuyPerChi' in acc) row.gold_buy_per_chi = acc.goldBuyPerChi != null ? Math.round(acc.goldBuyPerChi) : null;
    if ('goldBuyDate' in acc) row.gold_buy_date = acc.goldBuyDate || null;
    const { data, error } = await sb.from('accounts').insert(row).select().single();
    if (error) throw new Error(error.message);
    return mapAccount(data);
  }

  async function updateAccount(id, fields) {
    const sb = getClient();
    const patch = {};
    if ('name' in fields) patch.name = fields.name;
    if ('type' in fields) patch.type = fields.type;
    if ('class' in fields) patch.class = fields.class;
    if ('openingBalance' in fields) patch.opening_balance = Math.round(fields.openingBalance || 0);
    if ('creditLimit' in fields) patch.credit_limit = fields.creditLimit != null ? Math.round(fields.creditLimit) : null;
    if ('statementDay' in fields) patch.statement_day = fields.statementDay || null;
    if ('dueDay' in fields) patch.due_day = fields.dueDay || null;
    if ('minPaymentPct' in fields) patch.min_payment_pct = fields.minPaymentPct != null ? fields.minPaymentPct : null;
    if ('goldWeightChi' in fields) patch.gold_weight_chi = fields.goldWeightChi;
    if ('goldKind' in fields) patch.gold_kind = fields.goldKind;
    if ('goldFactor' in fields) patch.gold_factor = fields.goldFactor != null ? fields.goldFactor : 1;
    if ('goldCustomBuy' in fields) patch.gold_custom_buy = fields.goldCustomBuy != null ? Math.round(fields.goldCustomBuy) : null;
    if ('goldBuyPerChi' in fields) patch.gold_buy_per_chi = fields.goldBuyPerChi != null ? Math.round(fields.goldBuyPerChi) : null;
    if ('goldBuyDate' in fields) patch.gold_buy_date = fields.goldBuyDate || null;
    if ('sortOrder' in fields) patch.sort_order = fields.sortOrder || 0;
    if ('archived' in fields) patch.archived = !!fields.archived;
    if ('isDefault' in fields) patch.is_default = !!fields.isDefault;
    const { error } = await sb.from('accounts').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  // Mark one wallet as the household's default (the one pre-selected on the entry form).
  // Atomic-ish: clear the flag on every other wallet first so the partial unique
  // index (one default per household) is never violated, then set the chosen one.
  // Pass id = null/'' to simply clear the default.
  async function setDefaultAccount(id) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    let q = sb.from('accounts').update({ is_default: false }).eq('household_id', household.id);
    if (id) q = q.neq('id', id);
    const { error: eClear } = await q;
    if (eClear) throw new Error(eClear.message);
    if (!id) return;
    const { error } = await sb.from('accounts').update({ is_default: true }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  // Delete a wallet. Its transactions are kept (account_id becomes null via the FK).
  async function deleteAccount(id) {
    const sb = getClient();
    const { error } = await sb.from('accounts').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ---------------- Savings goals ---------------- */
  async function addGoal(goal) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const { data, error } = await sb.from('goals').insert({
      household_id: household.id,
      name: goal.name,
      target_amount: Math.round(goal.targetAmount || 0),
      account_id: goal.accountId || null,
      due_date: goal.dueDate || null,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapGoal(data);
  }
  async function updateGoal(id, fields) {
    const sb = getClient();
    const patch = {};
    if ('name' in fields) patch.name = fields.name;
    if ('targetAmount' in fields) patch.target_amount = Math.round(fields.targetAmount || 0);
    if ('accountId' in fields) patch.account_id = fields.accountId || null;
    if ('dueDate' in fields) patch.due_date = fields.dueDate || null;
    const { error } = await sb.from('goals').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }
  async function deleteGoal(id) {
    const sb = getClient();
    const { error } = await sb.from('goals').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ---------------- Recurring entries ---------------- */
  async function addRecurring(r) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const { data, error } = await sb.from('recurring').insert({
      household_id: household.id,
      name: r.name,
      amount: Math.round(r.amount || 0),
      type: r.type === 'income' ? 'income' : 'expense',
      category: r.category,
      account_id: r.accountId || null,
      freq: r.freq || 'monthly',
      day: r.day || 1,
      next_run: r.nextRun,
      active: r.active !== false,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapRecurring(data);
  }
  async function updateRecurring(id, fields) {
    const sb = getClient();
    const patch = {};
    if ('name' in fields) patch.name = fields.name;
    if ('amount' in fields) patch.amount = Math.round(fields.amount || 0);
    if ('type' in fields) patch.type = fields.type === 'income' ? 'income' : 'expense';
    if ('category' in fields) patch.category = fields.category;
    if ('accountId' in fields) patch.account_id = fields.accountId || null;
    if ('day' in fields) patch.day = fields.day || 1;
    if ('nextRun' in fields) patch.next_run = fields.nextRun;
    if ('active' in fields) patch.active = !!fields.active;
    const { error } = await sb.from('recurring').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }
  async function deleteRecurring(id) {
    const sb = getClient();
    const { error } = await sb.from('recurring').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /* ---------------- Monthly close (chốt sổ) ---------------- */
  // Chốt / chốt lại một tháng: upsert theo (household_id, period). Ghi đè bản cũ.
  async function upsertMonthlyReport({ period, metrics, aiReview }) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const user = await getUser();
    const { data, error } = await sb.from('monthly_reports').upsert({
      household_id: household.id,
      period: period,
      metrics: metrics || {},
      ai_review: aiReview || null,
      closed_by: user ? user.id : null,
      closed_at: new Date().toISOString(),
    }, { onConflict: 'household_id,period' }).select().single();
    if (error) throw new Error(error.message);
    return mapMonthlyReport(data);
  }

  /* ---------------- Household settings (shared config) ----------------
   * One row per household; `settings` jsonb keys mirror window.CONFIG names
   * (GEMINI_API_KEY, ANTHROPIC_API_KEY, …). Members read, owner/admin write
   * (RLS). Supabase URL/anon key never live here — they bootstrap the client. */
  async function saveHouseholdSettings(patch) {
    if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
    const sb = getClient();
    const user = await getUser();
    // Merge with the current row so a partial patch never clobbers other keys.
    const { data: cur } = await sb.from('household_settings')
      .select('settings').eq('household_id', household.id).limit(1);
    const merged = Object.assign({}, (cur && cur[0] && cur[0].settings) || {}, patch || {});
    const { error } = await sb.from('household_settings').upsert({
      household_id: household.id,
      settings: merged,
      updated_by: user ? user.id : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id' });
    if (error) throw new Error(error.message);
    return merged;
  }

  /* ---------------- Activity log (audit trail) ---------------- */
  // Read the household's activity log (newest first). Owners/admins only — RLS returns
  // nothing for plain members. Tolerates the table being absent (before the schema re-run).
  async function listActivity(opts) {
    if (!household) return [];
    const sb = getClient();
    const limit = (opts && opts.limit) || 100;
    const { data, error } = await sb
      .from('activity_log')
      .select('id,user_id,user_email,action,entity,entity_id,summary,created_at')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id || null,
      userEmail: r.user_email || '',
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id || null,
      summary: r.summary || {},
      createdAt: r.created_at,
    }));
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: 'household_id=eq.' + hid }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring', filter: 'household_id=eq.' + hid }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_attachments', filter: 'household_id=eq.' + hid }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_reports', filter: 'household_id=eq.' + hid }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_settings', filter: 'household_id=eq.' + hid }, onChange)
      // gold_prices is a shared cache with no household_id — subscribe unfiltered
      // so a price refresh from any member (or the cron) updates everyone live.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gold_prices' }, onChange)
      .subscribe();
    return channel;
  }
  function unsubscribeChanges() {
    if (channel) { try { getClient().removeChannel(channel); } catch (e) { /* ignore */ } channel = null; }
  }

  /* ---------------- Gold prices ---------------- */
  // Ask the gold-price Edge Function to refresh the shared price cache. The new
  // prices land in public.gold_prices and are pushed back over realtime, so the
  // caller only needs to reload data (or wait for the realtime event).
  // Throws when the function isn't deployed / network fails — callers that
  // auto-refresh in the background should swallow the error (stale badge covers it).
  async function refreshGoldPrices() {
    const c = cfg();
    if (!isConfigured()) throw new Error(tr('errNotConfigured', 'Chưa cấu hình Supabase (thiếu URL hoặc anon key).'));
    const url = normalizeUrl(c.SUPABASE_URL) + '/functions/v1/gold-price';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + c.SUPABASE_ANON_KEY, apikey: c.SUPABASE_ANON_KEY },
    });
    if (!resp.ok) throw new Error('gold-price HTTP ' + resp.status);
    return resp.json();
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
    setMemberRole,
    transferOwnership,
    listActivity,
    loadData,
    getCachedData,
    addTransaction,
    addTransactions,
    updateTransaction,
    deleteTransaction,
    uploadReceipt,
    insertAttachment,
    signedUrl,
    deleteAttachment,
    removeReceipts,
    saveBudgets,
    addAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    addGoal,
    updateGoal,
    deleteGoal,
    addRecurring,
    updateRecurring,
    deleteRecurring,
    upsertMonthlyReport,
    saveHouseholdSettings,
    refreshGoldPrices,
    subscribeChanges,
    unsubscribeChanges,
    DEFAULT_BUDGETS,
  };
})();

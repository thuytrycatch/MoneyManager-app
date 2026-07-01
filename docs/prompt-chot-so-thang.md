# Prompt: "CHỐT SỔ THÁNG" — tổng kết tháng + nhận xét & đề xuất từ AI

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; web tĩnh chạy trên GitHub Pages; PWA).
>
> Triết lý: **thay đổi tối thiểu, tái dùng tối đa hạ tầng báo cáo + AI đã có.** ~70% số liệu cần cho báo cáo tháng đã được tính sẵn ở `viewReports`/`totals`/`byCategory`/`monthlyExpenseSeries`. Tính năng này KHÔNG phải một tab báo cáo thứ hai — nó là **(1) một "nghi thức" chốt sổ + bản snapshot lưu lại** và **(2) một lớp diễn giải bằng AI** (nhận xét + đề xuất hành động) mà Reports hiện chưa có.

---

## MỤC TIÊU (theo yêu cầu người dùng)

1. Thêm chức năng **"Chốt sổ tháng"**: xem tháng vừa rồi **thu vào / chi ra / chênh lệch / tỷ lệ tiết kiệm**, so với tháng trước, và một **báo cáo tổng quan cụ thể**.
2. Khi chốt, **lưu lại một snapshot** (số liệu + nhận xét AI tại thời điểm chốt) để xem lại về sau và đối chiếu qua các tháng.
3. **AI kết luận** chi tiêu tháng đó thế nào, **nhận xét chung**, chỉ ra **khoản có thể cân nhắc cắt giảm**, và đưa ra **hành động đề xuất cụ thể** (ưu tiên + ước tính tiết kiệm).
4. Hoạt động **không có API key vẫn được** (báo cáo số liệu chạy offline; chỉ phần AI cần key — giống parser: có key thì dùng, không có thì thôi).

### QUYẾT ĐỊNH THIẾT KẾ CỐT LÕI (đọc kỹ, đừng làm khác)

- **"Soft close", KHÔNG khóa cứng.** Chốt sổ = lưu một bản báo cáo, **KHÔNG** khóa/không cấm sửa giao dịch tháng đã chốt (người dùng hay nhập trễ vài ngày). Nếu tháng đã chốt mà số liệu thay đổi → cho **"Chốt lại"** (tính lại + ghi đè snapshot). Một tháng chỉ có **một** snapshot (`unique (household_id, period)`).
- **AI KHÔNG tính toán số.** App tính tất cả con số **deterministically** (`buildMonthlyClose`). AI chỉ nhận **bản tóm tắt đã tổng hợp** rồi **diễn giải + đề xuất**. Không gửi từng dòng giao dịch để AI tự cộng — nó sẽ sai.
- **Grounding + JSON có cấu trúc.** AI trả về JSON đúng schema (dùng `responseSchema` của Gemini y như OCR), cấm bịa danh mục/số liệu.
- **Riêng tư (nâng cấp mức nhạy cảm).** Chốt sổ gửi **toàn cảnh tài chính tháng** cho bên thứ ba → chỉ gửi **số liệu tổng hợp** (tổng theo danh mục, so sánh tháng trước, budget vượt/dưới, tên khoản định kỳ). **KHÔNG gửi ghi chú/nội dung từng giao dịch, không gửi tên người thụ hưởng.** Phần AI là **opt-in** (người dùng bấm nút mới gọi).
- **Giọng điệu không phán xét.** Chi "cần / không cần" là chủ quan → AI gọi là **"khoản linh hoạt (discretionary) có thể cân nhắc"** kèm số tiền ước tính, để người dùng tự quyết. Không dùng từ "lãng phí".

---

## BỐI CẢNH REPO (đọc trước khi code)

### AI đã tích hợp sẵn — `js/parser.js` (tái dùng nguyên pattern)
- `window.CONFIG.GEMINI_API_KEY` / `window.CONFIG.ANTHROPIC_API_KEY` (lưu ở trình duyệt; cấu hình ở Settings, `js/app.js` ~L2497–2498, lưu ~L3049–3054).
- **Gemini** (`parseWithGemini` ~L242, `parseImageWithGemini` ~L363): POST `generativelanguage…:generateContent?key=`, body có `system_instruction`, `contents`, và `generationConfig: { temperature, responseMimeType: 'application/json', responseSchema }`. **`responseSchema` bảo đảm JSON hợp lệ** (xem `OCR_SCHEMA` ~L289).
- **Claude** (`parseWithClaude` ~L209): POST `api.anthropic.com/v1/messages`, model `claude-haiku-4-5`, header `anthropic-dangerous-direct-browser-access: 'true'`.
- Ưu tiên **Gemini (free) → Claude → (offline)**; mỗi bước `try/catch` rồi rơi xuống bước sau (xem `parseTransaction` ~L411, `parseImageReceipt` ~L394).
- Helpers dùng lại: `extractJson(text, who)` (~L200), `toIntAmount` (~L182). `window.Parser` là điểm export (~L460).

### Báo cáo & tổng hợp đã có — `js/app.js` (tái dùng, ĐỪNG tính lại từ đầu)
- `totals(txs)` (~L512) → `{income, expense, net}`; đã **loại giao dịch điều chỉnh số dư** (`isAdjust`) và **bỏ transfer**. Dùng nguyên.
- `byCategory(txs)` (~L522) → `{category: amount}` (chỉ expense, bỏ adjust).
- `inRange(s, e)` (~L511) lọc `DATA.transactions` theo khoảng ngày; `monthKey(d)` (~L489); `startOfMonth`/`endOfMonth`/`addMonths`/`pad`/`ymd`.
- `monthlyExpenseSeries(n, anchor)` (dùng ở ~L1795, ~L1928) → mảng `{label, expense}` n tháng gần nhất → tính **trung bình 3 tháng** và movers.
- `autoInsights(anchor)` (~L1787) **đã** so sánh tháng này vs TB 3 tháng, cuối tuần vs ngày thường, và **category jump** vs tháng trước → **tái dùng/nới rộng cho movers & wins**, đừng viết trùng.
- `reportWrapUpHtml(tt, pt, byCat)` (~L1764), `deltaChip(cur, prev, higherIsGood)` (~L1756) — chip ▲/▼ % so kỳ trước.
- `budgetBarsHtml(byCat, budgets, elapsedFrac)` (~L1533) + `monthElapsedFraction` (~L1524) — trạng thái ngân sách ok/warning/critical.
- `DATA.recurring` (mảng khoản định kỳ: `{name, amount, type, category, …}`) — **chính là danh sách subscription/khoản cố định** để liệt kê "ứng viên cắt giảm". `DATA.budgets` (`{category: amount}`).
- Format & tiện ích: `fmtShort`/`fmtVND`, `mask()` (ẩn số dư), `esc()` (~L1140), `icon(name)` (~L76), `catLabel(c)`/`catIcon(c)`, `alertItem(kind, ic, text)` (dùng ở ~L1820), `reportCard(inner)` (~L2021), `memberName(uid)` (~L449).
- **View & routing**: `currentTab` (~L416); `render()` map (~L2873) = `{overview, reports, transactions, add, settings}`; `renderNav`/`item()` (~L2854); handlers gắn trong `wire()` (~L2881). **Nav đã đủ 5 mục — KHÔNG thêm tab mới.**
- **Modal**: dùng lại pattern overlay như `openEntryPreview` (~L1028) / `openEdit` (~L2539) / `openAttachmentViewer` — báo cáo chốt sổ mở dạng modal.
- **Quyền quản lý**: `canManageConfig()` (~L480) = `myRole === 'owner' || 'admin'` — chính là helper đang gate các editor cấu hình/Khoản định kỳ/Mục tiêu. Dùng **đúng helper này** cho nút "Chốt sổ" (xem QUY TẮC #6). (`myRole` ~L412, `computeMyRole` ~L472.)
- i18n: object `I18N` (VI ~L60+, EN ~L230+). **Mọi chuỗi mới phải có cả `vi` và `en`.** Mẫu thông báo cần key có sẵn `ocrNeedKey` (~L231/L379) khi thiếu API key.

### Tầng dữ liệu — `js/store.js` (pattern bảng theo hộ)
- `loadData()` (~L356) đọc song song, và **dung nạp bảng chưa tồn tại** (goals/recurring/attachments ~L393–398: lỗi → `[]`). Data trả về gói ở object `data` (~L400).
- CRUD mẫu: `addGoal`/`updateGoal`/`deleteGoal` (~L660), `addRecurring` (~L690) — luôn `household_id: household.id`, có `mapX(row)` map snake→camel.
- `budgets` dùng **upsert** với `onConflict: 'household_id,category'` (~L590) — mẫu cho "chốt lại" (ghi đè theo `household_id,period`).
- Realtime: `subscribeChanges` (~L756) đăng ký từng bảng bằng `.on('postgres_changes', {table, filter:'household_id=eq.'+hid})`.

### Schema — `supabase-schema.sql` (an toàn chạy lại)
- Mẫu bảng theo hộ: `goals` (~L346), `recurring` (~L376): `create table if not exists`, `household_id … references households on delete cascade`, `enable row level security`, policy `X_select` = `household_id in (select public.user_households())`, policy `X_write` = `public.is_household_admin(household_id)`, và block `alter publication supabase_realtime add table …`.

---

## MÔ HÌNH DỮ LIỆU (quyết định)

Một bảng mới **`monthly_reports`**: mỗi hộ, mỗi tháng (`period = 'YYYY-MM'`) có **một** snapshot.

- `metrics jsonb` — **số liệu do app tính** (nguồn sự thật của báo cáo đã chốt; render lại từ đây, không tính lại từ giao dịch).
- `ai_review jsonb` (nullable) — kết quả AI `{summary, observations[], suggestions[]}`; `null` nếu người dùng chưa/không tạo.
- `closed_by`, `closed_at` — ai chốt & lúc nào.
- **Quyền**: mọi thành viên **đọc**; chỉ owner/admin **chốt/chốt lại** (giống goals/recurring — báo cáo cấp cả hộ). Member thường chỉ xem.

---

## PHẦN A — Schema (`supabase-schema.sql`, an toàn chạy lại)

Thêm sau block `recurring`/`activity_log` (đặt cạnh các bảng theo hộ khác):

```sql
-- =====================================================================
--  Monthly close — một snapshot "chốt sổ" cho mỗi (hộ, tháng).
--  metrics: số liệu do app tính (nguồn sự thật để render lại).
--  ai_review: nhận xét & đề xuất từ AI (có thể null).
--  Soft close: KHÔNG khóa giao dịch; "chốt lại" = upsert ghi đè theo (household_id, period).
--  An toàn chạy lại.
-- =====================================================================
create table if not exists public.monthly_reports (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  period        text not null,                 -- 'YYYY-MM'
  metrics       jsonb not null default '{}'::jsonb,
  ai_review     jsonb,
  closed_by     uuid references auth.users(id) on delete set null,
  closed_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (household_id, period)
);
create index if not exists idx_monthly_reports_hh on public.monthly_reports (household_id, period desc);

alter table public.monthly_reports enable row level security;
-- Mọi thành viên đọc; chỉ owner/admin chốt/chốt lại.
drop policy if exists monthly_reports_select on public.monthly_reports;
create policy monthly_reports_select on public.monthly_reports for select
  using (household_id in (select public.user_households()));
drop policy if exists monthly_reports_write on public.monthly_reports;
create policy monthly_reports_write on public.monthly_reports for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
do $$
begin
  begin alter publication supabase_realtime add table public.monthly_reports; exception when duplicate_object then null; end;
end $$;
```

> Cập nhật `memory`/README: nhắc **chạy lại `supabase-schema.sql`** sau khi merge (đúng như các tính năng trước).

---

## PHẦN B — Tầng dữ liệu (`js/store.js`)

1. **`mapMonthlyReport(r)`** (đặt cạnh `mapGoal`/`mapRecurring`):
   ```js
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
   ```
2. **`loadData`** (~L393–398): thêm một dòng dung nạp-vắng-mặt như goals/recurring:
   ```js
   const monthlyReports = await sb.from('monthly_reports').select('*').eq('household_id', hid)
     .order('period', { ascending: false })
     .then((r) => (r.error ? [] : (r.data || []).map(mapMonthlyReport))).catch(() => []);
   ```
   và thêm `monthlyReports` vào object `data` trả về (~L400).
3. **`upsertMonthlyReport({ period, metrics, aiReview })`** (mẫu theo `addGoal` + upsert của budgets):
   ```js
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
   ```
   Export `upsertMonthlyReport` trong `window.Store`.
4. **`subscribeChanges`** (~L767): thêm dòng
   ```js
   .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_reports', filter: 'household_id=eq.' + hid }, onChange)
   ```
5. `app.js` sau `loadData`: `if (!DATA.monthlyReports) DATA.monthlyReports = [];` (đặt cạnh `if (!DATA.recurring) …` ~L3410/L3433).

---

## PHẦN C — Lớp AI (`js/parser.js`) — nơi dễ hỏng nhất, làm đúng 4 rào chắn

Thêm vào `parser.js` (tái dùng `extractJson`; export qua `window.Parser.reviewMonth`). Có thể tách file riêng `js/coach.js` nếu muốn, nhưng để trong parser.js là tái dùng được helper + đúng triết lý "thay đổi tối thiểu".

```js
// System prompt: trợ lý tài chính gia đình, tiếng Việt. Rào chắn grounding + giọng điệu.
const REVIEW_SYSTEM =
  'Bạn là trợ lý tài chính gia đình, nói tiếng Việt, thân thiện và thực tế.\n' +
  'Bạn nhận SỐ LIỆU ĐÃ TỔNG HỢP của một tháng (đơn vị VND). Nhiệm vụ: diễn giải + đề xuất.\n' +
  'TUYỆT ĐỐI KHÔNG tự tính lại hay bịa thêm con số/danh mục nào ngoài dữ liệu được cấp.\n' +
  'KHÔNG phán xét ("lãng phí"). Gọi các khoản có thể giảm là "khoản linh hoạt có thể cân nhắc".\n' +
  'observations: 2–4 nhận xét NGẮN, cụ thể, gắn với số liệu thật (vd "chi Ăn uống +18% so tháng trước").\n' +
  'suggestions: 2–3 hành động KHẢ THI, ưu tiên rõ; estSaving là số nguyên VND ước tính (có thể null nếu không chắc).\n' +
  'Ngắn gọn, không sáo rỗng. Chỉ trả về JSON đúng schema.';

// Gemini structured-output schema → JSON hợp lệ, không cần retry parse.
const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    observations: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestions: { type: 'ARRAY', items: {
      type: 'OBJECT',
      properties: {
        action:    { type: 'STRING' },
        category:  { type: 'STRING', nullable: true },
        estSaving: { type: 'INTEGER', nullable: true },
        priority:  { type: 'STRING', enum: ['high', 'medium', 'low'] },
      },
      required: ['action', 'priority'],
    } },
  },
  required: ['summary', 'observations', 'suggestions'],
};

function normalizeReview(parsed) {
  parsed = parsed || {};
  const obs = Array.isArray(parsed.observations) ? parsed.observations.map(String).slice(0, 4) : [];
  const sug = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3).map((s) => ({
    action: String(s.action || '').trim(),
    category: s.category ? String(s.category) : null,
    estSaving: s.estSaving != null ? toIntAmount(s.estSaving) : null,
    priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
  })).filter((s) => s.action) : [];
  return { summary: String(parsed.summary || '').trim(), observations: obs, suggestions: sug };
}

async function reviewMonthGemini(summary, apiKey) {
  const model = 'gemini-2.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: REVIEW_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: 'SỐ LIỆU THÁNG (VND):\n' + JSON.stringify(summary) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: REVIEW_SCHEMA },
    }),
  });
  if (!resp.ok) { const e = await resp.text().catch(() => ''); throw new Error('Gemini API ' + resp.status + ': ' + e); }
  const data = await resp.json();
  const cand = (data.candidates || [])[0];
  const parts = cand && cand.content && cand.content.parts ? cand.content.parts : [];
  return normalizeReview(extractJson(parts.map((p) => p.text || '').join(''), 'Gemini'));
}

async function reviewMonthClaude(summary, apiKey) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-api-key': apiKey,
      'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5', max_tokens: 700, system: REVIEW_SYSTEM,
      messages: [{ role: 'user', content: 'SỐ LIỆU THÁNG (VND):\n' + JSON.stringify(summary) + '\nChỉ trả về JSON.' }],
    }),
  });
  if (!resp.ok) { const e = await resp.text().catch(() => ''); throw new Error('Claude API ' + resp.status + ': ' + e); }
  const data = await resp.json();
  const tb = (data.content || []).find((b) => b.type === 'text');
  return normalizeReview(extractJson(tb ? tb.text : '', 'Claude'));
}

// Gemini (free) → Claude. Throws nếu không có key hoặc tất cả lỗi (UI hiện toast).
async function reviewMonth(summary) {
  const cfg = window.CONFIG || {};
  let lastErr = null;
  if (cfg.GEMINI_API_KEY) {
    try { return await reviewMonthGemini(summary, cfg.GEMINI_API_KEY); }
    catch (err) { lastErr = err; console.warn('Gemini review lỗi, thử cách khác:', err.message); }
  }
  if (cfg.ANTHROPIC_API_KEY) {
    try { return await reviewMonthClaude(summary, cfg.ANTHROPIC_API_KEY); }
    catch (err) { lastErr = err; console.warn('Claude review lỗi:', err.message); }
  }
  throw lastErr || new Error('Chưa cấu hình API key để tạo nhận xét');
}
```
Thêm `reviewMonth` (và `imageOcrAvailable`-style `aiReviewAvailable()` = `!!(cfg.GEMINI_API_KEY || cfg.ANTHROPIC_API_KEY)`) vào `window.Parser`.

> **Privacy gate**: `summary` truyền vào `reviewMonth` phải là bản đã tổng hợp ở PHẦN D (`aiPayload`) — **không** chứa ghi chú/nội dung giao dịch, **không** tên người thụ hưởng.

---

## PHẦN D — Logic báo cáo (deterministic) + UI (`js/app.js`)

### D1. `buildMonthlyClose(anchor)` — tính TẤT CẢ con số (tái dùng helper sẵn có)
Trả về object `metrics` (đây là thứ lưu vào `monthly_reports.metrics` và render lại):

```js
// Số liệu chốt sổ cho tháng chứa `anchor`. Tái dùng totals/byCategory/monthlyExpenseSeries.
function buildMonthlyClose(anchor) {
  const s = startOfMonth(anchor), e = endOfMonth(anchor);
  const cur = inRange(s, e);
  const prevA = addMonths(anchor, -1);
  const prev = inRange(startOfMonth(prevA), endOfMonth(prevA));
  const tt = totals(cur), pt = totals(prev);
  const curCat = byCategory(cur), prevCat = byCategory(prev);
  const rate = tt.income ? Math.round(tt.net / tt.income * 100) : 0;

  // Danh mục + % + so tháng trước
  const cats = Object.keys(curCat).map((c) => {
    const p = prevCat[c] || 0;
    return {
      category: c, amount: curCat[c],
      pct: tt.expense ? Math.round(curCat[c] / tt.expense * 100) : 0,
      prevAmount: p, deltaPct: p ? Math.round((curCat[c] - p) / p * 100) : null,
    };
  }).sort((a, b) => b.amount - a.amount);

  // Biến động lớn nhất (movers) theo trị tuyệt đối chênh lệch
  const allCats = new Set([...Object.keys(curCat), ...Object.keys(prevCat)]);
  const movers = [...allCats].map((c) => {
    const a = curCat[c] || 0, p = prevCat[c] || 0;
    return { category: c, deltaAbs: a - p, deltaPct: p ? Math.round((a - p) / p * 100) : null };
  }).filter((m) => Math.abs(m.deltaAbs) > 0).sort((a, b) => Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs)).slice(0, 3);

  // Ngân sách vượt/dưới (chỉ danh mục có đặt budget)
  const budget = Object.keys(DATA.budgets || {}).filter((c) => DATA.budgets[c] > 0).map((c) => {
    const spent = curCat[c] || 0, b = DATA.budgets[c];
    const pctUsed = Math.round(spent / b * 100);
    return { category: c, budget: b, spent: spent, pctUsed: pctUsed,
      status: spent >= b ? 'critical' : (spent >= b * 0.8 ? 'warning' : 'ok') };
  }).sort((a, b) => b.pctUsed - a.pctUsed);

  // Khoản định kỳ (ứng viên cân nhắc cắt) — chỉ tên + số + danh mục
  const recurring = (DATA.recurring || []).filter((r) => r.active !== false && r.type !== 'income')
    .map((r) => ({ name: r.name, amount: r.amount, category: r.category }));
  const recurringTotal = recurring.reduce((a, r) => a + (r.amount || 0), 0);

  // TB 3 tháng gần trước (không tính tháng hiện tại)
  const prior = monthlyExpenseSeries(4, anchor).slice(0, 3).map((m) => m.expense).filter((v) => v > 0);
  const avg3m = prior.length ? Math.round(prior.reduce((a, b) => a + b, 0) / prior.length) : null;

  // Điểm sáng (wins) — quy tắc đơn giản, tái dùng ý của autoInsights
  const wins = [];
  if (pt.income && rate > Math.round(pt.net / pt.income * 100)) wins.push('savingsUp');
  if (avg3m && tt.expense < avg3m) wins.push('belowAvg');
  const cutCat = cats.find((c) => c.deltaPct != null && c.deltaPct <= -15);
  if (cutCat) wins.push('catDown:' + cutCat.category);

  return {
    period: monthKey(anchor),
    income: tt.income, expense: tt.expense, net: tt.net, savingsRate: rate,
    prev: { income: pt.income, expense: pt.expense, net: pt.net },
    avg3m: avg3m,
    categories: cats, movers: movers, budget: budget,
    recurring: recurring, recurringTotal: recurringTotal,
    wins: wins,
  };
}
```

### D2. `aiPayload(metrics)` — bản rút gọn AN TOÀN gửi cho AI (privacy)
Chỉ gửi số liệu tổng hợp, KHÔNG ghi chú/không tên người:

```js
function aiPayload(m) {
  return {
    period: m.period,
    income: m.income, expense: m.expense, net: m.net, savingsRate: m.savingsRate,
    prevExpense: m.prev.expense, avg3mExpense: m.avg3m,
    topCategories: m.categories.slice(0, 8).map((c) => ({ name: c.category, amount: c.amount, pct: c.pct, deltaPct: c.deltaPct })),
    movers: m.movers.map((x) => ({ name: x.category, deltaAbs: x.deltaAbs, deltaPct: x.deltaPct })),
    overBudget: m.budget.filter((b) => b.status !== 'ok').map((b) => ({ name: b.category, budget: b.budget, spent: b.spent })),
    recurring: m.recurring.map((r) => ({ name: r.name, amount: r.amount })),
    recurringTotal: m.recurringTotal,
  };
}
```

### D3. Card "Chốt sổ" trong Reports (chỉ month view)
Chèn vào `viewReports` (~L2099, ngay sau `reportWrapUpHtml`), chỉ khi `reportPeriod === 'month'`:

```js
reportCard(reportPeriod === 'month' ? monthlyCloseCardHtml() : '') +
```

```js
function monthlyCloseCardHtml() {
  const pk = monthKey(reportAnchor);
  const saved = (DATA.monthlyReports || []).find((r) => r.period === pk);
  const canClose = canManageConfig(); // helper owner/admin có sẵn (~L480)
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
  return '<div class="section-title">' + t('monthlyClose') + '</div><div class="card close-card">' + status + '<div class="close-actions">' + action + '</div></div>';
}
```
> `isManager()`: nếu repo chưa có helper tên này, tái dùng logic quyền đang dùng để ẩn/hiện editor Khoản định kỳ & Mục tiêu (owner/admin). Đừng tạo cơ chế quyền mới.

### D4. Modal báo cáo — `openMonthlyClose(period, opts)`
- Nếu đã có snapshot (`DATA.monthlyReports`) và **không** phải "chốt lại" → render từ `saved.metrics` + `saved.aiReview` (KHÔNG tính lại, KHÔNG gọi AI).
- Nếu chưa có / "chốt lại" → `const metrics = buildMonthlyClose(anchorFromPeriod(period))` rồi render live; hiện nút **"Tạo nhận xét AI"** (opt-in) và **"Chốt sổ"/"Lưu"**.
- Dùng lại cơ chế modal/overlay của `openEntryPreview`/`openEdit`.

Bố cục render (`renderMonthlyReport(metrics, aiReview, editable)`):
```
① Headline:   Thu | Chi | Chênh lệch (net) | Tỷ lệ tiết kiệm %   (dùng summary-grid + deltaChip vs metrics.prev)
② So sánh:    chi tháng này vs tháng trước & vs avg3m (câu chữ + deltaChip)
③ Danh mục:   metrics.categories (tên · số tiền · % · ▲▼ so tháng trước) — dùng catIcon/catLabel/deltaChip
④ Movers:     metrics.movers — "Biến động lớn nhất"
⑤ Ngân sách:  metrics.budget vượt/dưới (tái dùng style bar ok/warning/critical)
⑥ Định kỳ:    metrics.recurring + recurringTotal — "ứng viên cân nhắc"
⑦ Wins:       metrics.wins → câu chúc mừng (map key → t())
⑧ 🤖 AI:      aiReview.summary + observations[] + suggestions[] (action + priority chip + estSaving)
              — nếu chưa có: nút "Tạo nhận xét AI"
```
- Số tiền: **luôn** qua `fmtShort`/`fmtVND` và bọc `mask()`.
- Section ①–⑦ là code thuần (deterministic). Chỉ ⑧ gọi AI.

### D5. Nút "Tạo nhận xét AI" (opt-in)
```js
// handler nút genAiReview trong modal:
if (!window.Parser.aiReviewAvailable()) { toast(t('aiNeedKey'), 'error'); return; }
try {
  setBtnLoading(true);
  const review = await window.Parser.reviewMonth(aiPayload(currentMetrics));
  currentAiReview = review;
  renderMonthlyReport(currentMetrics, review, true); // vẽ lại có section ⑧
} catch (e) { toast(e.message || t('aiFailed'), 'error'); }
finally { setBtnLoading(false); }
```
- Kèm dòng ghi chú riêng tư dưới nút: `t('aiPrivacyNote')`.

### D6. Nút "Chốt sổ" / "Lưu"
```js
try {
  const saved = await window.Store.upsertMonthlyReport({
    period: currentMetrics.period, metrics: currentMetrics, aiReview: currentAiReview || null,
  });
  const i = DATA.monthlyReports.findIndex((r) => r.period === saved.period);
  if (i >= 0) DATA.monthlyReports[i] = saved; else DATA.monthlyReports.push(saved);
  toast(t('closeSaved'), 'success'); closeModal(); render();
} catch (e) { toast(e.message, 'error'); }
```

### D7. Wiring (`wire()`, ~L2881) — gắn handler mới
```js
document.querySelectorAll('[data-openclose]').forEach((b) => b.addEventListener('click', () => openMonthlyClose(b.dataset.openclose)));
document.querySelectorAll('[data-reclose]').forEach((b) => b.addEventListener('click', () => openMonthlyClose(b.dataset.reclose, { reclose: true })));
```
(Các nút trong modal — genAiReview / lưu / đóng — gắn ngay khi mở modal, giống `openEntryPreview`.)

### D8. i18n (bắt buộc `vi` + `en`)
```
monthlyClose:   'Chốt sổ tháng'                    / 'Monthly close'
closeThisMonth: 'Chốt sổ {m}'                      / 'Close {m}'
reclose:        'Chốt lại'                         / 'Re-close'
closedOn:       'Đã chốt ngày {d}'                 / 'Closed on {d}'
notClosedYet:   'Tháng này chưa được chốt sổ.'     / 'This month has not been closed yet.'
viewReport:     'Xem báo cáo'                      / 'View report'
monthOverview:  'Tổng quan tháng'                  / 'Month overview'
movers:         'Biến động lớn nhất'               / 'Biggest movers'
recurringDetected:'Khoản định kỳ (cân nhắc)'       / 'Recurring items (review)'
wins:           'Điểm sáng'                        / 'Wins'
aiReviewTitle:  '🤖 Nhận xét & đề xuất từ AI'      / '🤖 AI review & suggestions'
genAiReview:    'Tạo nhận xét AI'                  / 'Generate AI review'
aiNeedKey:      'Cần API key (Gemini/Claude) trong Cài đặt để tạo nhận xét AI.' / 'A Gemini or Claude API key (in Settings) is required for AI review.'
aiPrivacyNote:  'Chỉ số liệu tổng hợp (không gồm ghi chú từng giao dịch) được gửi tới dịch vụ AI.' / 'Only aggregated figures (no per-transaction notes) are sent to the AI service.'
aiFailed:       'Không tạo được nhận xét AI.'      / 'Could not generate AI review.'
closeSaved:     'Đã chốt sổ tháng.'                / 'Month closed.'
estSaving:      'Ước tính tiết kiệm'               / 'Est. saving'
prioHigh:'Ưu tiên cao'/'High'  prioMed:'Trung bình'/'Medium'  prioLow:'Thấp'/'Low'
winSavingsUp:   'Tỷ lệ tiết kiệm cao hơn tháng trước 🎉' / 'Savings rate up vs last month 🎉'
winBelowAvg:    'Chi thấp hơn trung bình 3 tháng.'      / 'Spending below the 3-month average.'
winCatDown:     'Giảm chi ở {c}.'                       / 'Lower spending on {c}.'
```

---

## PHẦN E — CSS (`css/style.css`)
- Thêm `.close-card`, `.close-actions` (flex, gap), `.close-section` (spacing giữa ①–⑧), `.suggestion` (mỗi đề xuất một dòng), `.prio` (chip high=đỏ nhạt/medium=vàng/low=xám — tái dùng token màu status ok/warning/critical đã có).
- Modal: **tái dùng** class overlay/modal của `openEntryPreview`/`openEdit`; **không** thêm cơ chế modal mới. Không thêm thư viện.

---

## QUY TẮC CHUNG (bắt buộc)
1. **Soft close**: chốt sổ KHÔNG khóa/không cấm sửa giao dịch; "Chốt lại" = tính lại + upsert ghi đè (`onConflict household_id,period`).
2. **AI không tính số**: mọi con số do `buildMonthlyClose` tính. AI chỉ diễn giải bản `aiPayload`. AI là **opt-in** (bấm nút mới gọi) và **optional** (không có key vẫn xem được báo cáo số liệu).
3. **Privacy**: chỉ gửi số liệu tổng hợp; **không** gửi ghi chú giao dịch, **không** tên người thụ hưởng.
4. **Grounding**: dùng `responseSchema` (Gemini) + `normalizeReview`; giọng điệu không phán xét ("khoản linh hoạt", không "lãng phí").
5. Mọi số tiền qua `fmtShort`/`fmtVND` và bọc `mask()`; mọi chuỗi UI đủ `vi` + `en`.
6. **Quyền**: chỉ owner/admin **chốt/chốt lại** (tái dùng logic quyền của Khoản định kỳ/Mục tiêu). Mọi thành viên **xem** được báo cáo đã chốt.
7. Vanilla JS thuần, không framework/thư viện/build step. Tái dùng `totals`/`byCategory`/`monthlyExpenseSeries`/`budgetBarsHtml`/`autoInsights`/`deltaChip`/`reportCard` — **đừng viết trùng**.
8. `supabase-schema.sql` an toàn chạy lại; `loadData` dung nạp bảng chưa tồn tại (lỗi → `monthlyReports = []`).

---

## TEST TAY
1. Chạy lại `supabase-schema.sql` → bảng `monthly_reports` xuất hiện; app cũ vẫn chạy (chưa chốt tháng nào → card hiện nút "Chốt sổ {tháng}").
2. Vào **Báo cáo** (tháng) với vài giao dịch thu/chi + có budget + có khoản định kỳ → bấm **Chốt sổ** → modal hiện ①–⑦ đúng số (headline khớp `totals`; danh mục khớp donut ở Reports; movers/ngân sách/định kỳ hợp lý). Số tiền tôn trọng **ẩn số dư** (`mask`).
3. Chưa nhập key AI → bấm **Tạo nhận xét AI** → toast `aiNeedKey`. Nhập key Gemini (Settings) → bấm lại → section ⑧ hiện `summary` + observations + suggestions (có chip ưu tiên + ước tính tiết kiệm). Kiểm tra AI **không** bịa danh mục ngoài dữ liệu.
4. Bấm **Chốt sổ/Lưu** → toast `closeSaved`; card đổi thành "Đã chốt ngày …" + nút **Xem báo cáo** / **Chốt lại**. Reload trang → snapshot vẫn còn (đọc từ DB), **Xem báo cáo** render y hệt mà **không** gọi lại AI.
5. Thêm 1 giao dịch vào tháng đã chốt → số liệu live đổi nhưng snapshot cũ giữ nguyên → bấm **Chốt lại** → snapshot cập nhật (metrics + closed_at mới).
6. Đăng nhập bằng **member thường** → thấy nút **Xem báo cáo** (nếu đã chốt) hoặc dòng "chưa chốt"; **không** thấy nút Chốt/Chốt lại.
7. Đổi bộ chọn kỳ sang **Tuần/Năm** → card "Chốt sổ" **không** hiện (chỉ month view).
8. Tắt mạng giữa chừng khi tạo AI → toast `aiFailed`, báo cáo số liệu vẫn xem/chốt được bình thường.

---

## PHẦN F — Phase 2 (tuỳ chọn, không bắt buộc v1)
- **Nhắc chốt sổ tự động** đầu tháng (dùng `recurring`-style reminder hoặc streak/reminder đã có) + push notification.
- **So sánh nhiều tháng**: biểu đồ savingsRate / net theo các tháng đã chốt (đọc `DATA.monthlyReports`).
- **Fixed vs variable**: đánh dấu danh mục cố định để tách "chi cố định" khỏi "chi linh hoạt" trong ⑥ (giúp đề xuất cắt giảm chính xác hơn).
- **Xuất PDF/chia sẻ** báo cáo tháng.
- **Chi tiết hơn cho AI**: cho phép người dùng chọn gửi cả top giao dịch (ẩn ghi chú) để đề xuất sát hơn — vẫn opt-in.
- **Đánh giá đề xuất kỳ sau**: đánh dấu suggestion đã áp dụng, tháng sau đối chiếu có tiết kiệm thật không.

---

## KẾT QUẢ MONG ĐỢI
- ✅ Trong **Báo cáo (tháng)** có card **"Chốt sổ tháng"**: chốt được, xem lại được, chốt lại được (soft close, không khóa giao dịch).
- ✅ Báo cáo tổng quan tháng cụ thể: **thu/chi/chênh lệch/tỷ lệ tiết kiệm** + **so sánh tháng trước & TB 3 tháng** + **danh mục** + **biến động lớn nhất** + **ngân sách vượt/dưới** + **khoản định kỳ** + **điểm sáng** — toàn bộ tính **deterministic**, tái dùng hạ tầng có sẵn.
- ✅ **AI kết luận + nhận xét + đề xuất hành động** (ưu tiên + ước tính tiết kiệm), **opt-in**, **grounded** (không bịa số), **không phán xét**, chỉ gửi **số liệu tổng hợp** (riêng tư).
- ✅ Snapshot lưu ở `monthly_reports` (một bản/tháng), xem lại không tốn API; đồng bộ realtime; tôn trọng quyền (owner/admin chốt, mọi người xem) và chế độ ẩn số dư như phần còn lại của app.
- ✅ Không có API key vẫn dùng được báo cáo số liệu; vanilla JS, không thêm build step.
</content>
</invoke>

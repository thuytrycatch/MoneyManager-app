# Prompt: Thêm tài sản VÀNG vào danh mục ví + tính vào tổng tài sản

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; web tĩnh chạy trên GitHub Pages).
>
> Triết lý: **thay đổi tối thiểu, không phá vỡ logic ví/net-worth hiện có.** Vàng là một _loại ví mới_ (`type='gold'`), được định giá realtime ra VND và cộng vào **Tổng tài sản** trong báo cáo Net worth.

---

## BỐI CẢNH REPO (đọc trước khi code — mốc dòng kiểm chứng 2026-07-03, có thể lệch nhẹ → tìm theo TÊN HÀM)

- Ví nằm ở bảng `public.accounts` (xem `supabase-schema.sql`; khối `alter table public.accounts add column if not exists …` ở ~L104–114). Mỗi ví có `class` = `asset|liability`.
- Số dư & net worth tính **client-side** trong `js/app.js`:
  - `accountBalance(id)` (~L866): `opening_balance + Σ giao dịch` (xử lý cả transfer 2 chiều).
  - `accountClass(acc)` (~L862), `netWorth()` (~L887): `assets − liabilities` — gọi `accountBalance` cho từng ví.
  - ⚠️ **`totalBalance()` (~L881) KHÔNG gọi `accountBalance`** — nó = `Σ opening_balance + allTimeBalance()`. Đây là thẻ "Số dư" trên Overview (~L1623). Xem C2 để biết quyết định xử lý.
  - `netWorthHtml()` (~L2007) + closure `accRow` bên trong (~L2015): thẻ hiển thị Net worth (trang Reports).
  - `walletStripHtml()` (~L1605): dải thẻ ví ở Overview — dùng `accountBalance` nên tự đúng với vàng.
  - Hằng `ACCOUNT_TYPES`, `LIABILITY_TYPES`, `ACCOUNT_TYPE_META` (~L847–858).
  - Picker ví cho form giao dịch: `accountSelect(id, selectedId)` (~L939) — dùng ở form nhập (`epAccount` ~L1096) và form sửa (`eAccount` ~L3033); `defaultAccountId()` (~L923). Recurring editor tự build `<option>` inline (~L753, ~L824). Dialog chuyển khoản (~L2860) + điều kiện hiện nút `transferBtn` (~L2412).
  - Editor ví trong Cài đặt: `walletEditRowHtml(acc)` (~L2460) + handler Save `saveWalletsBtn` (~L3212, build `extra` ~L3225) + toggle credit fields khi đổi `.w-type` (~L3171). Nút "Đổi số dư" `.w-adjust` (~L2466) + `openAdjustBalance` (~L2996).
  - Tiền hiển thị qua `fmtShort` / `fmtVND` (`js/charts.js`); ẩn số dư qua `mask()`.
- Tầng dữ liệu: `js/store.js` — `mapAccount` (~L316), `loadAll` (~L380; chú ý pattern "optional tables — tolerate absence" ~L401–411), `addAccount` (~L612), `updateAccount` (~L631), realtime `subscribeChanges` (~L787).
- App **đã** gọi Claude API trực tiếp từ browser: `js/parser.js` ~L210 (header `anthropic-dangerous-direct-browser-access: true`). Dùng lại pattern này cho Phase 2 (web_search, chỉ là fallback).
- i18n: object `I18N` trong `js/app.js` (key VI ~L60+, khối EN ngay sau đó). **Mọi chuỗi UI mới phải có cả `vi` và `en`.**

---

## NGUYÊN TẮC ĐỊNH GIÁ (đọc kỹ — quyết định công thức)

- Đơn vị: **1 lượng = 10 chỉ = 100 phân**. Lưu nội bộ theo **chỉ** (`numeric`, cho phép thập phân, vd 2.5 chỉ).
- Định giá tài sản dùng **GIÁ MUA VÀO** (giá tiệm mua lại từ người dân = số tiền bán đi thực nhận), KHÔNG dùng giá bán ra.
- Tách 2 khái niệm cho "vàng không phải thương hiệu lớn":
  1. **`kind`** = loại tham chiếu, mỗi loại một mức giá nguồn: `sjc` (vàng miếng SJC), `ring9999` (nhẫn/vàng 9999 24k), `jewelry` (vàng tây 18k/14k…), `custom` (tự nhập giá).
  2. **`factor`** = hệ số điều chỉnh (%) so với giá tham chiếu của `kind` (chiết khấu thương hiệu/tuổi vàng). Mặc định `1.0` (=100%). Ví dụ nhẫn không thương hiệu ≈ `0.98`, vàng 18k ≈ `0.75`.
- Công thức: **`giá_trị_VND = số_chỉ × giá_mua_per_chỉ(kind) × factor`**.
- v1: ví vàng là **tài sản định giá độc lập** — KHÔNG nhận giao dịch thu/chi/chuyển khoản; `opening_balance` không dùng. (Mua/bán vàng để phase sau.)

---

## NGHIỆP VỤ GIÁ GỐC & LÃI/LỖ (cost basis & unrealized P&L)

Mục tiêu: cho nhập **giá mua lúc đầu** (giá gốc) → so với **giá thị trường hiện tại** để ra **lãi/lỗ tạm tính**.

**Công thức v1 (giá mua trung bình / chỉ):**
- `costBasis = số_chỉ × gold_buy_per_chi` (giá đã trả khi mua, /chỉ — chính là giá BÁN RA của tiệm lúc đó, đã gồm chênh lệch).
- `currentValue = số_chỉ × giá_mua_vào_hiện_tại(kind) × factor` (đúng như định giá tài sản — dùng giá tiệm MUA LẠI).
- `pnl = currentValue − costBasis` · `pnl% = pnl / costBasis` (null khi costBasis = 0).
- Lãi (`pnl ≥ 0`) tô xanh (`income`), lỗ tô đỏ (`expense`); bọc `mask()`.

**4 điểm "phức tạp" PHẢI xử lý đúng (nếu không P&L sẽ gây hiểu nhầm):**

1. **Chênh lệch mua–bán (spread):** lúc mua trả giá BÁN RA (cao), lúc định giá dùng giá MUA VÀO (thấp). Vì vậy ngay sau khi mua, P&L thường **âm nhẹ** dù giá thị trường chưa đổi — đây là ĐÚNG (đó là phí spread). Lưu `gold_buy_per_chi` = số tiền **thực trả/chỉ** ⇒ spread tự được phản ánh, không cần xử lý thêm. Thêm tooltip/hint giải thích để người dùng không hoảng.
2. **Hệ số `factor` KHÔNG áp vào giá gốc:** `gold_buy_per_chi` là số tiền thực trả nên đã "đúng giá" của vàng đó rồi. `factor` chỉ nhân vào `currentValue`. Tuyệt đối **không** nhân factor hai lần.
3. **Mua nhiều đợt (DCA):** v1 chỉ lưu **một** giá mua TB/chỉ → khi mua thêm, người dùng phải tự cập nhật giá TB (gợi ý công thức bình quân gia quyền trong hint). Mô hình **lots** (mỗi lần mua một dòng) chính xác hơn nhưng để **Phase 3** (xem cuối file).
4. **Lãi/lỗ TẠM TÍNH (unrealized):** vì vàng vẫn đang giữ. Lãi/lỗ **thực hiện** (realized) chỉ phát sinh khi bán → thuộc Phase 3 (giao dịch bán vàng). v1 chỉ hiển thị tạm tính, ghi rõ nhãn "(tạm tính)".

**Không double-count tiền mặt:** v1 giá gốc chỉ là metadata — KHÔNG tự trừ tiền khỏi ví tiền mặt. Nếu sau này liên kết "mua vàng = chi tiền từ ví VND" thì để Phase 3 (tránh cộng trùng cả tiền mặt lẫn vàng vào tổng tài sản).

---

## PHẦN A — Schema (sửa `supabase-schema.sql`, an toàn chạy lại)

Thêm vào khối `accounts` (đặt cạnh các `alter table public.accounts add column if not exists …` hiện có):

```sql
-- Vàng: định giá theo khối lượng × giá thị trường (quy ra VND). type='gold', class='asset'.
alter table public.accounts add column if not exists gold_weight_chi numeric(12,3); -- khối lượng theo CHỈ (1 lượng = 10 chỉ)
alter table public.accounts add column if not exists gold_kind       text;          -- sjc | ring9999 | jewelry | custom
alter table public.accounts add column if not exists gold_factor     numeric(6,4) not null default 1; -- hệ số so giá tham chiếu
alter table public.accounts add column if not exists gold_custom_buy bigint;        -- (kind='custom') giá mua/chỉ nhập tay
-- Giá gốc (cost basis) để tính lãi/lỗ tạm tính so với giá thị trường hiện tại:
alter table public.accounts add column if not exists gold_buy_per_chi bigint;       -- giá MUA TRUNG BÌNH lúc đầu / chỉ (số tiền thực trả, đã gồm spread)
alter table public.accounts add column if not exists gold_buy_date    date;         -- ngày mua (gần nhất / TB) — để tính lợi suất theo thời gian (tuỳ chọn)
```

Thêm bảng giá vàng **dùng chung** (đọc bởi mọi user đã đăng nhập; chỉ Edge Function/service-role được ghi):

```sql
-- Giá vàng thị trường VN, cache dùng chung. Ghi DUY NHẤT bởi Edge Function (service role)
-- hoặc seed thủ công; client chỉ đọc. buy_per_chi = giá mua vào / 1 chỉ (dùng để định giá).
create table if not exists public.gold_prices (
  kind         text primary key,          -- sjc | ring9999 | jewelry
  buy_per_chi  bigint not null,           -- giá mua vào / chỉ (VND)
  sell_per_chi bigint,                    -- giá bán ra / chỉ (tham khảo)
  source       text,                      -- nguồn (vd 'sjc.com.vn')
  fetched_at   timestamptz not null default now()
);
alter table public.gold_prices enable row level security;
drop policy if exists gold_prices_select on public.gold_prices;
create policy gold_prices_select on public.gold_prices for select
  using (auth.role() = 'authenticated');   -- ai đăng nhập cũng đọc được; KHÔNG có policy write cho client
do $$
begin
  begin alter publication supabase_realtime add table public.gold_prices; exception when duplicate_object then null; end;
end $$;

-- Seed mẫu để Phase 1 chạy được ngay (người dùng cập nhật sau, hoặc Edge Function ghi đè):
insert into public.gold_prices (kind, buy_per_chi, sell_per_chi, source) values
  ('sjc',      11500000, 11700000, 'seed'),
  ('ring9999', 11000000, 11200000, 'seed'),
  ('jewelry',  10500000, 10800000, 'seed')
on conflict (kind) do nothing;
```

> Cập nhật `memory`/README: nhắc người dùng **chạy lại `supabase-schema.sql`** sau khi merge (đúng như các tính năng trước).

---

## PHẦN B — Tầng dữ liệu (`js/store.js`)

1. Trong `mapAccount`, map thêm các field mới (camelCase) từ row Supabase:
   ```js
   goldWeightChi: r.gold_weight_chi != null ? Number(r.gold_weight_chi) : null,
   goldKind:      r.gold_kind || null,
   goldFactor:    r.gold_factor != null ? Number(r.gold_factor) : 1,
   goldCustomBuy: r.gold_custom_buy != null ? Number(r.gold_custom_buy) : null,
   goldBuyPerChi: r.gold_buy_per_chi != null ? Number(r.gold_buy_per_chi) : null,
   goldBuyDate:   r.gold_buy_date || null,
   ```
2. Trong `addAccount` / `updateAccount`, chuyển ngược các field này về snake_case khi `insert`/`update` (giống cách `class`, `credit_limit`… đang được xử lý). Chỉ ghi field nào có trong `fields`.
3. Thêm `goldPrices` vào payload `loadAll()` (~L380) theo ĐÚNG pattern "optional tables — tolerate absence" sẵn có (~L401–411, như `goals`/`recurring`): bảng chưa tồn tại (người dùng chưa chạy lại schema) → `{}`, KHÔNG throw.
   - `sb.from('gold_prices').select('*')` → reduce về object `{ [kind]: { buyPerChi, sellPerChi, source, fetchedAt } }`.
   - Đưa vào object `data` trả về → tự được cache offline qua `idbSet('data', …)` (~L414), mở app offline vẫn định giá bằng giá cuối cùng đã biết.
4. Subscribe realtime bảng `gold_prices` trong `subscribeChanges` (~L787). **Khác các bảng khác: bảng này KHÔNG có cột `household_id`** → subscribe không filter: `.on('postgres_changes', { event: '*', schema: 'public', table: 'gold_prices' }, onChange)`.
5. (Phase 2) Thêm hàm `refreshGoldPrices()` — xem PHẦN E.

---

## PHẦN C — Logic & UI (`js/app.js`)

### C1. Đăng ký loại ví mới
- Thêm `'gold'` vào `ACCOUNT_TYPES` (KHÔNG thêm vào `LIABILITY_TYPES` — vàng là asset).
- Thêm vào `ACCOUNT_TYPE_META`: `gold: { icon: 'coin', key: 'typeGold' }` (nếu chưa có icon `coin`/`gem` trong bộ `icon()`, thêm 1 SVG đơn giản; có thể tái dùng `piggy` tạm thời).

### C1b. Cách ly vàng khỏi luồng giao dịch (BẮT BUỘC — v1 ví vàng không nhận giao dịch)
Thêm helper `spendableAccounts()` = `activeAccounts().filter((a) => a.type !== 'gold')` và dùng nó thay `activeAccounts()` ở MỌI nơi thuộc luồng giao dịch:
- `accountSelect(id, selectedId)` (~L939) — picker ví của form Thêm (`epAccount` ~L1096) và form Sửa giao dịch (`eAccount` ~L3033).
- `defaultAccountId()` (~L923) — ví mặc định pre-select không bao giờ được là ví vàng.
- Recurring editor: 2 chỗ build `<option>` inline từ `activeAccounts()` (~L753, ~L824).
- Dialog chuyển khoản giữa ví (~L2860) + điều kiện hiện nút `transferBtn` (~L2412): đổi `activeAccounts().length >= 2` → `spendableAccounts().length >= 2`.
- **GIỮ NGUYÊN `activeAccounts()`** cho: `netWorth`, `netWorthHtml`, `walletStripHtml`, editor ví trong Cài đặt — vàng vẫn hiển thị/sửa được ở các chỗ này.
- Ẩn nút **"Đổi số dư"** với ví vàng: `wAdjustBtn` (~L2466) thêm điều kiện `a.type !== 'gold'`; guard tương tự trong `openAdjustBalance` (~L2996). Lý do: "Đổi số dư" tạo giao dịch adjustment, mà `accountBalance` của vàng bỏ qua mọi giao dịch → nút sẽ "không có tác dụng" và gây bối rối. (Nút "Lịch sử ví" giữ nguyên — vô hại.)
- Parser AI (`js/parser.js`) nếu có map tên ví → id: loại ví vàng khỏi danh sách ứng viên (không để AI gán chi tiêu vào ví vàng).

### C2. Định giá vàng
Thêm helper:
```js
// Giá mua vào / 1 chỉ cho ví vàng (VND). custom = giá tự nhập; còn lại lấy từ DATA.goldPrices.
function goldBuyPerChi(acc) {
  if (acc.goldKind === 'custom') return acc.goldCustomBuy || 0;
  const p = (DATA.goldPrices || {})[acc.goldKind];
  return p ? p.buyPerChi : 0;
}
// Giá trị VND hiện tại của ví vàng = số chỉ × giá mua/chỉ × hệ số.
function goldValue(acc) {
  return Math.round((acc.goldWeightChi || 0) * goldBuyPerChi(acc) * (acc.goldFactor || 1));
}
// Giá gốc (cost basis) = số chỉ × giá mua TB lúc đầu. KHÔNG nhân factor (đã là tiền thực trả).
function goldCostBasis(acc) {
  return Math.round((acc.goldWeightChi || 0) * (acc.goldBuyPerChi || 0));
}
// Lãi/lỗ tạm tính của ví vàng so với giá gốc. pct = null khi chưa nhập giá gốc.
function goldPnl(acc) {
  const cost = goldCostBasis(acc);
  const pnl = goldValue(acc) - cost;
  return { cost: cost, pnl: pnl, pct: cost > 0 ? pnl / cost : null };
}
// Tổng lãi/lỗ tạm tính toàn bộ ví vàng (để hiển thị 1 dòng tổng ở thẻ Net worth).
function totalGoldPnl() {
  return activeAccounts().filter((a) => a.type === 'gold' && a.goldBuyPerChi)
    .reduce((s, a) => s + goldPnl(a).pnl, 0);
}
```
Sửa **`accountBalance(id)`** (~L866): ngay đầu hàm, nếu `acc.type === 'gold'` → `return goldValue(acc);` (bỏ qua opening_balance + giao dịch). Nhờ vậy mọi nơi gọi `accountBalance` tự động đúng: `netWorth()` (~L887) cộng vàng vào **Tổng tài sản**, `walletStripHtml()` (~L1605) hiện thẻ ví vàng với giá trị hiện tại — không cần sửa thêm. (Net worth dùng **giá trị hiện tại**, không phải giá gốc — đúng bản chất tài sản.)

> ⚠️ **QUYẾT ĐỊNH v1 — thẻ "Số dư" Overview KHÔNG gồm vàng:** `totalBalance()` (~L881) KHÔNG đi qua `accountBalance` (nó = `Σ opening_balance + allTimeBalance()`), nên vàng sẽ không tự xuất hiện ở đó — và đó là hành vi MONG MUỐN: "Số dư" là tiền tiêu được, vàng chỉ thuộc Net worth. **Không sửa `totalBalance`**; chỉ thêm 1 dòng comment tại hàm giải thích để người sau không tưởng là bug. (Nếu sau này muốn thẻ "Tổng tài sản gồm vàng" ở Overview thì thêm dòng hiển thị riêng, không trộn vào totalBalance.)

### C3. Editor ví trong Cài đặt (`walletEditRowHtml` + Save handler)
- Khi `type === 'gold'`: thay khối credit-fields bằng **khối gold-fields** (CSS class `.wallet-gold-fields`, ẩn/hiện theo type giống credit):
  - Khối lượng + đơn vị: input số + toggle **chỉ / lượng** (lưu về chỉ: lượng×10).
  - Dropdown `kind`: SJC / Nhẫn 9999 / Vàng tây (jewelry) / Tự nhập giá (custom).
  - Input `factor` hiển thị theo **%** (vd nhập `98` ↔ lưu `0.98`); mặc định `100`.
  - Nếu `kind='custom'`: hiện input **giá mua/chỉ** (`js-money`); ẩn khi khác.
  - **Giá gốc (cost basis):** input **Giá mua lúc đầu / chỉ** (`js-money`, map `goldBuyPerChi`) + (tuỳ chọn) input ngày mua (`goldBuyDate`). Hint: _"giá thực trả/chỉ khi mua; mua nhiều đợt thì nhập giá trung bình"_.
  - Dòng giá trị live: `= fmtShort(goldValue(acc))` + `(giá X/chỉ ≈ Y/lượng · cập nhật lúc <fetched_at>)` — hiện thêm giá quy theo **lượng** (`×10`) vì thị trường VN quen yết giá/lượng.
  - Dòng **lãi/lỗ tạm tính**: nếu có `goldBuyPerChi` → hiện `goldPnl(acc)`: `(+/−)fmtShort(pnl)` và `(pct%)`, xanh khi lãi / đỏ khi lỗ; nhãn kèm "(tạm tính)".
  - Ẩn input **Số dư ban đầu** (không dùng cho vàng) hoặc đổi nhãn thành chỉ-đọc giá trị.
- Trong handler Save `saveWalletsBtn` (~L3212): hiện `extra` có 2 nhánh liability/asset (~L3225) — thêm nhánh thứ 3 cho `type==='gold'`: `class:'asset'`, `openingBalance: 0` (input bị ẩn nhưng vẫn trong DOM — ép 0 cho sạch), `goldWeightChi`, `goldKind`, `goldFactor` (từ % → số), `goldCustomBuy` (chỉ khi custom, ngược lại `null`), `goldBuyPerChi`, `goldBuyDate` (rỗng → `null`); và clear `creditLimit/statementDay/dueDay = null`. Với type khác gold: set các field gold về `null`/`1` để không lẫn (đổi ví vàng → ví thường phải sạch metadata).
- Cập nhật listener toggle đổi `.w-type` (~L3171, delegated trên `#walletEdit`): hiện `.wallet-gold-fields` nếu `=== 'gold'`, hiện `.wallet-credit-fields` nếu là liability, ẩn còn lại; đồng thời ẩn/hiện khối "Số dư ban đầu" tương ứng.

### C4. Thẻ Net worth (`netWorthHtml` + `accRow`)
- Trong `accRow`, nếu `a.type === 'gold'`: thêm dòng phụ `nw-acc-sub` =
  `<số chỉ> chỉ · <kind label> · <factor>% · ~<fmtShort(giá mua vào/chỉ)>/chỉ`.
  - Nếu có `goldBuyPerChi`: thêm dòng lãi/lỗ tạm tính từ `goldPnl(a)` — `mask((pnl>=0?'+':'−') + fmtShort(|pnl|))` + `(pct%)`, class `income`/`expense`.
- Nếu có ví vàng nhập giá gốc: thêm **1 dòng tổng "Lãi/lỗ vàng (tạm tính)"** = `mask(fmtShort(totalGoldPnl()))` dưới khối assets (xanh/đỏ).
- Thêm **nút "Cập nhật giá vàng"** (refresh) ở đầu khối assets nếu có ≥1 ví vàng → gọi `refreshGoldPrices()` (Phase 2) hoặc mở popup nhập giá tay (Phase 1).
- Nếu giá cũ hơn 24h (so `fetched_at` với `new Date()`): hiện badge cảnh báo "giá có thể đã cũ".
- **Tôn trọng `mask()`**: mọi số tiền vàng phải bọc `mask(...)` như các ví khác.

### C5. i18n
Thêm các key (cả `vi` & `en`), ví dụ:
`typeGold` (Vàng/Gold), `goldWeight` (Khối lượng), `unitChi` (chỉ), `unitLuong` (lượng),
`goldKind` (Loại vàng), `goldKindSjc`, `goldKindRing`, `goldKindJewelry`, `goldKindCustom`,
`goldFactor` (Hệ số giá %), `goldCustomBuy` (Giá mua/chỉ), `goldPricePerChi` (Giá/chỉ),
`updateGoldPrice` (Cập nhật giá vàng), `priceUpdatedAt` (Cập nhật lúc), `priceStale` (Giá có thể đã cũ),
`goldValueNow` (Giá trị hiện tại),
`goldBuyPrice` (Giá mua lúc đầu /chỉ), `goldBuyDate` (Ngày mua), `costBasis` (Giá gốc),
`unrealizedPnl` (Lãi/lỗ tạm tính), `goldPnlTotal` (Lãi/lỗ vàng (tạm tính)), `returnPct` (Lợi suất),
`goldBuyHint` (Giá thực trả/chỉ khi mua; mua nhiều đợt nhập giá trung bình),
`goldSpreadHint` (Mua giá bán ra, định giá theo giá mua vào — nên ngay sau khi mua thường lỗ nhẹ do chênh lệch).

---

## PHẦN D — CSS (`css/style.css`)
- Thêm `.wallet-gold-fields` (ẩn/hiện như `.wallet-credit-fields`, dùng class `.hidden`).
- Toggle đơn vị chỉ/lượng: style nhỏ gọn (segmented control), tái dùng biến màu/token sẵn có. Không thêm thư viện.

---

## PHẦN E — Phase 2: Tự lấy giá vàng (KHÔNG vướng CORS)

> Phase 1 ở trên chạy được ngay với giá nhập tay/seed. Phase 2 tự động hoá việc lấy giá.
> **Quan trọng:** web tĩnh KHÔNG fetch trực tiếp được trang giá vàng VN (CORS). Và Claude API
> (messages) có knowledge cutoff → KHÔNG được hỏi "giá vàng hôm nay" bằng kiến thức sẵn có
> (sẽ bịa số). Chọn 1 trong 2 cách:

**Cách 1 (KHUYẾN NGHỊ) — Supabase Edge Function `gold-price`:**
- Tạo `supabase/functions/gold-price/index.ts` (Deno). Server-side fetch một nguồn giá VN
  (fetch ở server nên không vướng CORS), parse ra `buy_per_chi`/`sell_per_chi` cho từng `kind`,
  rồi **upsert** vào `public.gold_prices` bằng service-role key (đọc từ `Deno.env`).
  Trả về JSON các giá vừa cập nhật.
- **Ứng viên nguồn giá (BẮT BUỘC kiểm chứng endpoint còn sống tại thời điểm code — có thể đã đổi):**
  1. SJC: feed XML công khai `https://sjc.com.vn/xml/tygiavang.xml` (miếng SJC + nhẫn, yết theo **lượng**).
  2. BTMC: `https://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=…` (JSON, có nhẫn tròn 9999).
  3. DOJI / webgia / giavang (HTML hoặc API tổng hợp) — dự phòng.
  Chọn 1 nguồn chính + 1 fallback; nguồn yết theo **lượng** thì `÷10` ra **chỉ** trước khi ghi. `jewelry` nếu nguồn không có thì suy từ `ring9999 × tỉ lệ tuổi vàng` hoặc bỏ qua (giữ seed/custom).
- **Chống ghi giá bẩn vào cache dùng chung (bắt buộc — cả nhà cùng đọc bảng này):** trước khi upsert, validate:
  `buy_per_chi` nằm trong khoảng tin được (vd 3–50 triệu/chỉ), `buy ≤ sell`, và không lệch quá ±20% so với giá đang lưu. Parse fail / out-of-range → **GIỮ giá cũ**, trả lỗi kèm `fetched_at` cũ; tuyệt đối không ghi đè bằng `0`/`null`.
- **Chống dội nguồn:** đầu function, đọc `fetched_at` hiện tại — nếu mới hơn ~15–30 phút thì trả luôn giá cache, không fetch lại (nhiều người bấm refresh cùng lúc chỉ tốn 1 lần fetch thật).
- Lên lịch bằng Supabase Cron / Scheduled Functions (vd mỗi 1–4h) để giá luôn mới; client chỉ cần đọc bảng `gold_prices` (realtime tự đẩy về). Nút refresh ở UI gọi function này on-demand.
- Hàm client `refreshGoldPrices()` (đặt trong `js/store.js`, export qua `window.Store`) = `fetch('https://<project>.functions.supabase.co/gold-price', { headers: { Authorization: 'Bearer ' + anonKey } })` rồi `await refreshData()`.
- **Tự làm mới khi mở app (để giá "realtime" mà không cần bấm nút):** sau `loadAll`, nếu có ≥1 ví vàng và `fetched_at` cũ hơn TTL (vd 4h) → gọi `refreshGoldPrices()` **fire-and-forget** (không await chặn render; lỗi thì im lặng — badge "giá cũ" ở C4 lo phần cảnh báo). Nhờ mục "chống dội nguồn" ở trên, cả nhà cùng mở app cũng chỉ 1 lần fetch thật.
- Ưu điểm: chính xác (nguồn VN), không lộ khoá ở client, cả nhà dùng chung cache, realtime đẩy giá mới về mọi máy đang mở.

**Cách 2 (fallback, không cần Edge Function) — Claude API + web_search:**
- Dùng lại pattern `parseWithClaude` trong `js/parser.js`. Gọi `api.anthropic.com/v1/messages`
  với **tool `web_search`** (`{"type":"web_search_20250305","name":"web_search"}`) + `tool_choice`
  ép tìm, prompt: _"Tìm giá vàng SJC / nhẫn 9999 hôm nay tại Việt Nam, đơn vị VND/lượng, trả về
  JSON {sjc:{buy,sell}, ring9999:{buy,sell}} theo giá mua vào & bán ra/lượng"_. Quy đổi /lượng→/chỉ (÷10).
- BẮT BUỘC dùng web_search (không dùng kiến thức model). Kết quả ghi vào `DATA.goldPrices` (in-memory)
  hoặc, nếu muốn chia sẻ, vẫn cần Edge Function để ghi DB (client không có quyền write `gold_prices`).
- Nhược điểm: tốn token, chậm hơn, mỗi máy tự gọi; chỉ nên là phương án dự phòng.

> Dù chọn cách nào, LUÔN giữ đường nhập giá tay (`kind='custom'` hoặc sửa seed) để tính năng không
> bao giờ phụ thuộc cứng vào mạng/nguồn ngoài.

---

## QUY TẮC CHUNG (bắt buộc)
1. **Không phá** hành vi của ví không-phải-vàng: `accountBalance` chỉ rẽ nhánh khi `type==='gold'`.
2. Mọi số tiền đi qua `fmtShort`/`fmtVND` và bọc `mask()`; không tự format thủ công.
3. Mọi chuỗi UI có đủ `vi` + `en`.
4. Vanilla JS thuần, không thêm framework/thư viện; không thêm build step.
5. Phân quyền: chỉ owner/admin sửa ví (đã có RLS `accounts_write`) → không cần đổi.
6. `supabase-schema.sql` an toàn chạy lại (mọi statement `if not exists` / `drop … if exists`).
7. **Giá gốc KHÔNG nhân factor**; net worth dùng **giá trị hiện tại** (không dùng giá gốc).
8. Test tay:
   - Tạo ví vàng 2.5 chỉ SJC factor 100% → giá trị = 2.5 × buy_per_chi; đổi factor 75% → giá trị giảm tương ứng; vàng xuất hiện trong **Tổng tài sản**; bật "ẩn số dư" → giá trị vàng cũng bị che.
   - Nhập giá gốc 7,000,000/chỉ, giá mua vào hiện tại 7,500,000/chỉ, factor 100% → **lãi tạm tính** = 2.5 × (7.5M − 7M) = +1,250,000 (xanh); đặt giá hiện tại 6,800,000/chỉ → **lỗ** −500,000 (đỏ).
   - Để trống giá gốc → KHÔNG hiện dòng lãi/lỗ (không chia cho 0).
   - **Cách ly giao dịch:** ví vàng KHÔNG xuất hiện trong picker ví của form thêm/sửa giao dịch, recurring, dialog chuyển khoản; `defaultAccountId()` không bao giờ trả về ví vàng; ví vàng không có nút "Đổi số dư".
   - **Số dư vs Net worth:** thêm ví vàng → thẻ "Số dư" Overview KHÔNG đổi, Net worth tăng đúng bằng `goldValue`; thẻ ví vàng vẫn hiện trong wallet strip với giá trị hiện tại.
   - **Chưa chạy lại schema** (bảng `gold_prices` chưa tồn tại) → app vẫn mở bình thường (loadAll không throw); ví vàng `kind='custom'` vẫn định giá được bằng giá tự nhập.
   - **Giá cũ:** chỉnh `fetched_at` lùi >24h → badge "giá có thể đã cũ" xuất hiện; gọi refresh → badge biến mất, mọi máy đang mở cùng nhận giá mới (realtime).

---

## PHẦN F — Phase 3 (tùy chọn, nâng cao): lots & lãi/lỗ thực hiện

> Chỉ làm khi cần độ chính xác đầu tư. Không bắt buộc cho v1.

- **Lot tracking:** bảng `gold_lots (id, account_id, weight_chi, buy_per_chi, buy_date)`. Giá gốc = Σ(weight×price);
  giá mua TB = costBasis / Σweight (bình quân gia quyền) — xử lý đúng việc mua nhiều đợt mà không cần nhập tay TB.
  Khi đó `gold_buy_per_chi`/`gold_buy_date` ở `accounts` chỉ là cache hiển thị (hoặc bỏ).
- **Bán vàng (realized P&L):** giao dịch bán → trừ khối lượng (FIFO hoặc theo lot chọn), ghi lãi/lỗ **thực hiện**
  = tiền bán − giá gốc phần bán; đồng thời cộng tiền vào ví VND (chuyển đổi chỉ→VND). Cập nhật net worth.
- **Liên kết tiền mặt:** "mua vàng" = chi từ ví VND + tăng khối lượng vàng (tránh cộng trùng tài sản).
- **Lợi suất theo thời gian:** dùng `buy_date` để tính %/năm (annualized) cho mỗi lot.

---

## KẾT QUẢ MONG ĐỢI
- ✅ Thêm loại ví **Vàng**, nhập khối lượng (chỉ/lượng) + loại vàng + hệ số % cho vàng ngoài thương hiệu.
- ✅ Tự quy đổi ra VND theo giá mua vào hiện tại; hiện thời điểm cập nhật + cảnh báo giá cũ; giá tự làm mới khi mở app nếu quá TTL.
- ✅ Ví vàng bị loại khỏi mọi luồng giao dịch (thêm/sửa/chuyển khoản/recurring/ví mặc định/đổi số dư) — chỉ hiện ở Net worth, wallet strip và Cài đặt.
- ✅ **Nhập giá gốc lúc mua → hiện lãi/lỗ tạm tính (VND + %)** so với giá thị trường, có màu xanh/đỏ.
- ✅ Vàng được cộng vào **Tổng tài sản** (theo giá trị hiện tại) trong báo cáo Net worth → cả nhà thấy tổng tài sản thực.
- ✅ Phase 1 chạy ngay với giá seed/nhập tay; Phase 2 tự lấy giá realtime qua Edge Function (khuyến nghị) hoặc Claude web_search (dự phòng); Phase 3 (tùy chọn) lots + lãi/lỗ thực hiện khi bán.
- ✅ Đồng bộ realtime giữa các thành viên; tôn trọng quyền (owner/admin) và chế độ ẩn số dư.

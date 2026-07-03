# Prompt: CẤU HÌNH AI LƯU TRÊN DATABASE (thay vì localStorage)

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; web tĩnh chạy trên GitHub Pages; PWA).
>
> Triết lý: **thay đổi tối thiểu, tái dùng tối đa.** Một bảng mới + vài chục dòng code. Không đổi UI, chỉ đổi NƠI LƯU và PHẠM VI chia sẻ của cấu hình.

---

## MỤC TIÊU (theo yêu cầu người dùng)

1. Cấu hình hiện lưu ở `localStorage` (`mm_settings`) → chuyển sang **lưu trong database** để:
   - **Dùng chung cả hộ**: một người (owner/admin) nhập key AI một lần, mọi thành viên & mọi thiết bị đều dùng được (trước đây mỗi trình duyệt phải tự dán key).
   - **Không mất khi xóa dữ liệu trình duyệt / đổi máy.**
2. Có tính năng **cập nhật cấu hình vào database** ngay trong màn Settings hiện có.

### QUYẾT ĐỊNH THIẾT KẾ CỐT LÕI (đọc kỹ, đừng làm khác)

- **Cấu hình Supabase (URL + anon key) KHÔNG THỂ chuyển vào database** — nghịch lý con gà–quả trứng: app cần URL/key để *kết nối* database, nên không thể *đọc chúng từ* database. Chúng **ở lại localStorage** (bootstrap), chỉ cập nhật câu hint để giải thích. **Chỉ cấu hình AI (Gemini/Claude key) chuyển vào DB.**
- **Một bảng `household_settings`, một hàng cho mỗi hộ, cột `settings jsonb`** — tên key trong jsonb trùng tên key của `window.CONFIG` (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) để merge 1:1. jsonb → thêm setting mới sau này không cần đổi schema.
- **Whitelist khi áp cấu hình DB vào `window.CONFIG`**: chỉ nhận `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`. TUYỆT ĐỐI không cho hàng DB ghi đè `SUPABASE_URL`/`SUPABASE_ANON_KEY` (một hàng bị sửa tay có thể trỏ app sang server khác).
- **DB là nguồn sự thật khi hàng tồn tại** (kể cả giá trị rỗng = đã xóa key); **chưa có hàng/bảng → fallback localStorage** như cũ (app cũ chưa chạy lại schema vẫn hoạt động nguyên vẹn).
- **Quyền**: mọi thành viên **đọc** (parser của member cần key để gọi AI); chỉ owner/admin **ghi** — đúng mô hình "cấu hình là việc của quản lý" đang áp cho ví/ngân sách/khoản định kỳ. UI: member thấy trang AI bị khóa bằng `roLock` (fieldset disabled) như trang Ví.
- **KHÔNG gắn trigger activity-log cho bảng này** — log_activity chụp snapshot hàng vào `activity_log`, tức là **sao chép API key sang bảng thứ hai**. Cố ý bỏ qua để không rò secret.
- **Migration êm**: lần đầu vào app sau khi có bảng, nếu DB chưa có hàng mà localStorage có key AI và user là owner/admin → **tự seed** key cục bộ lên DB (im lặng, best-effort).

---

## BỐI CẢNH REPO (đọc trước khi code)

- `js/app.js` ~L8–22: `window.CONFIG` + `loadSettings()`/`saveSettings()` (localStorage `mm_settings`). ⚠️ **Bug có sẵn**: `saveSettings` GHI ĐÈ toàn bộ `mm_settings` thay vì merge → lưu key AI làm mất URL Supabase đã lưu. Sửa thành merge khi làm tính năng này.
- Trang Settings → AI: `js/app.js` ~L2790–2796 (page `'ai'`), nút lưu ~L3350–3357 (`saveConfigBtn`). Trang Supabase: ~L2797–2803, nút lưu ~L3359–3367.
- Quyền: `canManageConfig()` (~L506) = owner/admin; `roLock(html)` (~L2584) = banner + `<fieldset disabled>`.
- Parser đọc key trực tiếp từ `window.CONFIG` (`js/parser.js` L389–424, L545–557) → chỉ cần CONFIG được cập nhật đúng lúc là parser tự dùng, **không sửa parser.js**.
- `js/store.js`: `loadData()` (~L372) đọc song song + **dung nạp bảng chưa tồn tại** (goals/recurring… lỗi → giá trị rỗng); kết quả cache vào IndexedDB (offline). `subscribeChanges` (~L823) đăng ký realtime từng bảng. Upsert mẫu: budgets `onConflict`.
- `supabase-schema.sql`: mẫu bảng theo hộ + RLS (`user_households()`, `is_household_admin()`), block `alter publication supabase_realtime` bọc `duplicate_object`. **An toàn chạy lại.**
- Boot: `init()` → `loadSettings()` → `enterApp()` → `Store.loadData()`; realtime/focus → `refreshData()`. Offline: `getCachedData()`.
- i18n `I18N.vi` / `I18N.en` — mọi chuỗi mới phải đủ cả hai.

---

## PHẦN A — Schema (`supabase-schema.sql`, an toàn chạy lại)

Thêm bảng cấu hình theo hộ (đặt cuối file, sau `gold_prices`):

```sql
create table if not exists public.household_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  settings     jsonb not null default '{}'::jsonb,   -- { GEMINI_API_KEY, ANTHROPIC_API_KEY, ... }
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);
alter table public.household_settings enable row level security;
-- Mọi thành viên đọc (parser cần key); chỉ owner/admin ghi.
create policy hh_settings_select … using (household_id in (select public.user_households()));
create policy hh_settings_write  … is_household_admin(household_id);
-- realtime publication (bọc duplicate_object như các bảng khác)
```

KHÔNG thêm trigger `log_activity` cho bảng này (lý do: không copy secret sang activity_log).

---

## PHẦN B — Tầng dữ liệu (`js/store.js`)

1. **Đọc trong `loadData()`** (dung nạp-vắng-mặt, `null` = chưa có hàng/bảng — khác `{}` = hàng rỗng):
   ```js
   const aiConfig = await sb.from('household_settings').select('settings').eq('household_id', hid).limit(1)
     .then((r) => (r.error || !r.data || !r.data.length ? null : (r.data[0].settings || {}))).catch(() => null);
   ```
   Thêm `aiConfig` vào object `data` trả về → tự được cache IndexedDB → offline vẫn áp được key.
2. **`saveHouseholdSettings(patch)`**: đọc hàng hiện tại → merge (`Object.assign`) để không clobber key tương lai → `upsert` với `onConflict: 'household_id'`, kèm `updated_by`/`updated_at`. Trả về object settings đã merge. Export trong `window.Store`.
3. **`subscribeChanges`**: thêm một dòng `.on('postgres_changes', { table: 'household_settings', filter: 'household_id=eq.'+hid }, onChange)` → quản lý đổi key là mọi thiết bị nhận ngay.

---

## PHẦN C — App (`js/app.js`)

1. **Sửa `saveSettings` thành merge** (fix bug ghi đè `mm_settings` nêu trên).
2. **`applyDbConfig()`** — áp cấu hình DB vào `window.CONFIG` qua whitelist:
   ```js
   const DB_CONFIG_KEYS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY'];
   function applyDbConfig() {
     const s = DATA && DATA.aiConfig;
     if (!s) return;                       // chưa có hàng/bảng → giữ giá trị local
     DB_CONFIG_KEYS.forEach((k) => { window.CONFIG[k] = String(s[k] || '').trim(); });
   }
   ```
   Gọi trong `enterApp()` (sau khi `DATA` sẵn sàng, kể cả nhánh cache offline) và trong `refreshData()`.
3. **Seed một lần** trong `enterApp()` (sau `myRole = computeMyRole()`): nếu `DATA.aiConfig == null` && `canManageConfig()` && local có key → `Store.saveHouseholdSettings(...)` trong try/catch im lặng.
4. **Trang AI** (page `'ai'`):
   - Hint mới: key lưu trong database của hộ, dùng chung mọi thành viên/thiết bị.
   - Member thường: bọc form bằng `roLock(...)` (nút Lưu nằm trong fieldset → tự disabled).
   - Nút lưu (`saveConfigBtn`) thành async: `Store.saveHouseholdSettings(patch)` → `DATA.aiConfig = kết quả; applyDbConfig()` → toast `aiSavedShared`. Lỗi (bảng chưa có) → fallback `saveSettings(patch)` local + toast warn `aiSavedLocal`.
5. **Trang Supabase**: giữ nguyên hành vi (localStorage bắt buộc), thêm hint `supaWhyLocal` giải thích vì sao mục này vẫn lưu trên thiết bị.
6. **i18n** (vi + en): `aiHint` (viết lại), `aiSavedShared`, `aiSavedLocal`, `supaWhyLocal`.

---

## QUY TẮC CHUNG (bắt buộc)

1. Supabase URL/anon key **ở lại localStorage** — không bao giờ đọc từ DB.
2. Whitelist `DB_CONFIG_KEYS` khi áp settings DB → CONFIG.
3. Hàng DB tồn tại = nguồn sự thật (kể cả rỗng); không có hàng → fallback local. App chưa chạy lại schema **không được vỡ**.
4. Member đọc / owner-admin ghi; UI khóa bằng `roLock` có sẵn — không tạo cơ chế quyền mới.
5. Không log activity cho bảng settings (không copy secret).
6. Vanilla JS, không thư viện mới; schema chạy lại an toàn; mọi chuỗi UI đủ `vi` + `en`.

---

## TEST TAY

1. Chưa chạy lại schema → app cũ chạy nguyên vẹn: lưu key AI → toast warn "tạm lưu trên trình duyệt"; parser vẫn dùng key local.
2. Chạy lại `supabase-schema.sql` → đăng nhập bằng owner có key local → hàng `household_settings` tự xuất hiện (seed); xóa `mm_settings` + reload → key vẫn còn (đọc từ DB), AI parse chạy.
3. Đăng nhập cùng hộ bằng **member trên máy khác** (chưa từng nhập key) → AI parse chạy ngay bằng key của hộ; trang Settings → AI bị khóa `roLock`.
4. Owner đổi/xóa key → máy member nhận realtime (hoặc sau focus) → CONFIG cập nhật; xóa hết key trên DB → member không còn dùng được AI (giá trị rỗng thắng giá trị local cũ).
5. Lưu key AI xong reload → cấu hình Supabase **không mất** (bug saveSettings đã sửa).
6. Offline sau lần đầu load → key vẫn áp từ cache IndexedDB.

---

## KẾT QUẢ MONG ĐỢI

- ✅ Key AI (Gemini/Claude) lưu ở bảng `household_settings`, **dùng chung cả hộ, đồng bộ realtime mọi thiết bị**, không mất khi đổi máy/xóa trình duyệt.
- ✅ Nút "Lưu" trong Settings → AI **cập nhật thẳng vào database** (owner/admin); member chỉ xem.
- ✅ Supabase URL/anon key vẫn ở localStorage (bootstrap) — có giải thích trong UI.
- ✅ Tương thích ngược hoàn toàn + tự migrate key local lên DB; sửa kèm bug `saveSettings` ghi đè mất cấu hình.

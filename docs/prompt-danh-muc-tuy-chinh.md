# Prompt: DANH MỤC TÙY CHỈNH — budget động theo danh mục do người dùng tự định nghĩa

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; PWA).
>
> Triết lý: **tên danh mục (text tiếng Việt) vẫn là khóa định danh** — không chuyển sang FK id.
> Đổi khóa là cuộc đại phẫu (transactions, budgets, recurring, jsonb snapshot chốt sổ đều lưu text)
> mà không mang lại giá trị cho người dùng. Ta chỉ làm cho **danh sách** đó trở thành dữ liệu
> theo hộ (thêm/sửa/ẩn được) thay vì hằng số trong code.

---

## HIỆN TRẠNG (đã khảo sát — số dòng đúng tại thời điểm viết)

- **8 danh mục cố định** ở `js/parser.js` L13 (`CATEGORIES`), app import qua `const CATS = window.Parser.CATEGORIES` (`js/app.js` ~L519).
- Budget = bảng `budgets(household_id, category text, amount)` — user chỉ nhập **số tiền** cho từng danh mục cố định; editor ở `js/app.js` ~L2933 (`CATS.filter((c) => c !== 'Thu nhập')`).
- `CAT_ICON` (~L96) icon SVG cứng theo tên; `CAT_LABELS`/`catLabel` (~L492–500) dịch EN cứng theo tên.
- **7 dropdown** build từ `CATS`: sửa nhanh (~L744), recurring editor (~L880), sheet xác nhận nhiều bút toán (~L1215), filter Giao dịch (~L2505), budget editor (~L2933), modal sửa (~L3273), template editor.
- **Parser**: regex keywords cứng theo 8 danh mục (`parser.js` ~L20); prompt AI (Gemini/Claude, text + OCR) **hardcode danh sách** trong system prompt (~L36, ~L283); validate `CATEGORIES.includes(category)` (~L193, ~L320) — sai thì rơi về `Thu nhập`/`Khác`.
- Danh mục đặc biệt ngoài bộ 8: `ADJUST_CATEGORY` (điều chỉnh số dư), `'Chuyển khoản'` (transfer) — **không đụng tới**.

## MỤC TIÊU

1. Mỗi hộ **tự định nghĩa danh mục chi/thu**: thêm mới, đổi tên, đổi icon, ẩn (archive), sắp xếp.
2. **Budget bám theo danh mục động**: editor ngân sách hiện đúng danh sách hộ đang có (không còn bộ 8 cứng).
3. **AI parser nhận danh sách động**: nhập "ăn sáng 35k" vẫn tự phân loại đúng theo danh mục CỦA HỘ (kể cả danh mục mới như "Học phí con", "Thú cưng").
4. **Không phá dữ liệu cũ**: hộ chưa chạy lại schema vẫn dùng được app với bộ 8 mặc định; giao dịch cũ giữ nguyên danh mục.

### QUYẾT ĐỊNH THIẾT KẾ CỐT LÕI (đọc kỹ, đừng làm khác)

1. **Text là khóa, không đổi schema giao dịch.** `transactions.category`, `budgets.category`, `recurring.category` giữ nguyên text. Bảng mới `categories` chỉ là **danh bạ** (registry) của các tên đó.
2. **Đổi tên = cascade bằng RPC.** `rename_category(old, new)` (security definer, check `is_household_admin`) update transactions + budgets + recurring **trong một transaction**. KHÔNG sửa jsonb trong `monthly_reports` — snapshot đã chốt là lịch sử, giữ tên cũ (ghi chú rõ trong UI khi đổi tên).
3. **Archive, không xóa cứng.** Danh mục đã có giao dịch chỉ được **ẩn** (biến khỏi picker/budget editor; giao dịch cũ + báo cáo cũ vẫn hiển thị bình thường vì `byCategory` chạy trên text). Xóa cứng chỉ cho phép khi **0 giao dịch, 0 recurring** tham chiếu (app kiểm tra trước, RPC kiểm tra lại).
4. **Fallback bộ 8 mặc định.** `DATA.categories` rỗng/không load được (schema chưa chạy lại) → app hoạt động y hệt hôm nay với 8 danh mục cứng. **Seed lazy**: lần đầu owner/admin mở trang "Danh mục", app upsert 8 hàng mặc định vào bảng rồi mới cho sửa.
5. **Icon = emoji** cho danh mục tự tạo (input 1 ô emoji, ví dụ 🐶 📚 ⛽) — không vẽ thêm SVG, không thư viện icon-picker. 8 danh mục mặc định giữ icon SVG hiện có (`CAT_ICON`); `catIcon()` ưu tiên emoji nếu hàng categories có, fallback SVG map, fallback 'more'.
6. **`'Thu nhập'` là danh mục hệ thống** (type income, không cho đổi tên/ẩn — parser & báo cáo dựa vào nó). Danh mục tự tạo có `type: 'expense' | 'income'`; budget chỉ áp cho expense.
7. **Quyền**: mọi thành viên đọc; owner/admin thêm/sửa/ẩn (RLS pattern goals/recurring + gate UI bằng `canManageConfig()` ~L480).
8. **Parser nhận danh sách động qua `window.Parser.setCategories(list)`** — app gọi sau `loadData` và mỗi lần realtime đổi. Parser không import DATA (giữ tách lớp hiện có).
9. Vanilla JS, không thư viện; mọi chuỗi UI đủ `vi` + `en`; số tiền qua `fmtShort`/`mask` như cũ; mọi nút gọi server bọc **`busy()`** (helper chuẩn của repo).

---

## PHẦN A — Schema (`supabase-schema.sql`, an toàn chạy lại)

Bảng danh bạ + RPC đổi tên/xóa. Đặt sau block `household_settings`:

```sql
-- =====================================================================
--  Categories — danh bạ danh mục theo hộ. TÊN (text) vẫn là khóa định danh
--  trong transactions/budgets/recurring; bảng này chỉ quản lý danh sách:
--  thêm/đổi tên/ẩn/icon/sort. Hộ chưa có hàng nào → app dùng bộ 8 mặc định.
--  An toàn chạy lại.
-- =====================================================================
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  type         text not null default 'expense' check (type in ('expense','income')),
  emoji        text,                          -- icon emoji cho danh mục tự tạo (null = dùng SVG mặc định)
  sort_order   int not null default 0,
  archived     boolean not null default false,
  is_system    boolean not null default false, -- 'Thu nhập': không đổi tên/ẩn
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);
create index if not exists idx_categories_hh on public.categories (household_id, sort_order);
alter table public.categories enable row level security;
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select
  using (household_id in (select public.user_households()));
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));
do $$
begin
  begin alter publication supabase_realtime add table public.categories; exception when duplicate_object then null; end;
end $$;
drop trigger if exists trg_log_categories on public.categories;
create trigger trg_log_categories after insert or update or delete on public.categories
  for each row execute function public.log_activity();

-- Đổi tên danh mục: cascade text qua transactions/budgets/recurring trong MỘT
-- transaction. KHÔNG sửa monthly_reports (snapshot đã chốt là lịch sử).
create or replace function public.rename_category(hid uuid, old_name text, new_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_admin(hid) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.categories where household_id = hid and name = new_name) then
    raise exception 'duplicate';
  end if;
  update public.categories   set name = new_name where household_id = hid and name = old_name and not is_system;
  update public.transactions set category = new_name where household_id = hid and category = old_name;
  update public.recurring    set category = new_name where household_id = hid and category = old_name;
  -- budgets có khóa chính (household_id, category) → upsert-merge rồi xóa hàng cũ
  insert into public.budgets (household_id, category, amount)
    select household_id, new_name, amount from public.budgets where household_id = hid and category = old_name
  on conflict (household_id, category) do update set amount = excluded.amount;
  delete from public.budgets where household_id = hid and category = old_name;
end $$;

-- Xóa cứng: chỉ khi không còn gì tham chiếu.
create or replace function public.delete_category(hid uuid, cat_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_admin(hid) then raise exception 'forbidden'; end if;
  if exists (select 1 from public.transactions where household_id = hid and category = cat_name)
     or exists (select 1 from public.recurring where household_id = hid and category = cat_name) then
    raise exception 'in_use';
  end if;
  delete from public.budgets    where household_id = hid and category = cat_name;
  delete from public.categories where household_id = hid and name = cat_name and not is_system;
end $$;
```

> Cập nhật README/memory: **chạy lại `supabase-schema.sql`** sau khi merge.

---

## PHẦN B — Tầng dữ liệu (`js/store.js`)

1. `mapCategory(r)` → `{ id, name, type, emoji, sortOrder, archived, isSystem }` (cạnh `mapGoal`).
2. `loadData`: load `categories` (order `sort_order`), **dung nạp vắng mặt** (lỗi → `[]`) như goals/recurring; thêm vào object `data`.
3. CRUD: `addCategory({name, type, emoji, sortOrder})`, `updateCategory(id, fields)` (emoji/sort/archived), `renameCategory(oldName, newName)` → `sb.rpc('rename_category', {hid, old_name, new_name})`, `deleteCategory(name)` → rpc `delete_category`. `seedDefaultCategories(list)` — upsert bộ 8 mặc định (onConflict `household_id,name` — dùng insert + ignore duplicate).
4. `subscribeChanges`: thêm bảng `categories`.
5. Export tất cả trong `window.Store`.

---

## PHẦN C — Parser động (`js/parser.js`)

1. `CATEGORIES` → thành **biến** (giữ bộ 8 làm mặc định). Thêm:
   ```js
   function setCategories(list) {   // list = [{name, type}] active, đã sort
     if (Array.isArray(list) && list.length) CATEGORIES = list.map((c) => c.name);
   }
   ```
   Export `setCategories`; `window.Parser.CATEGORIES` đổi thành getter (hoặc export hàm `getCategories()` — chọn cách ít đụng call-site nhất, `app.js` hiện chỉ đọc 1 lần ~L519 → đổi thành hàm `cats()` bên app, xem PHẦN D).
2. **Prompt AI build động** (cả text parse ~L36 và OCR ~L283): thay chuỗi hardcode `[Ăn uống, …]` bằng `CATEGORIES.join(', ')` tại thời điểm gọi. Giữ nguyên phần ví dụ không dấu cho 8 danh mục mặc định, thêm câu: *"Nếu không khớp danh mục nào, dùng 'Khác'."*
3. **Validate động** (~L193, ~L320): `CATEGORIES.includes(category)` giữ nguyên logic nhưng chạy trên danh sách động; fallback `'Khác'` (expense) / `'Thu nhập'` (income) như cũ. Nếu hộ đã ẩn `'Khác'` → fallback danh mục expense đầu tiên còn active.
4. Regex fallback (`CAT_KEYWORDS` ~L20): giữ nguyên cho 8 mặc định. **Danh mục tự tạo không có keywords ở v1** — không match thì rơi về AI (có key) hoặc `'Khác'`. (Keywords tự nhập là Phase 2.)

---

## PHẦN D — App (`js/app.js`)

### D1. Nguồn danh mục động
- Thay `const CATS = window.Parser.CATEGORIES` (~L519) bằng:
  ```js
  const DEFAULT_CATS = [...bộ 8 hiện tại];  // giữ làm fallback
  function cats(type) {  // type: 'expense' | 'income' | undefined = tất cả
    const list = (DATA.categories || []).filter((c) => !c.archived);
    const names = list.length ? list : DEFAULT_CATS.map((n) => ({ name: n, type: n === 'Thu nhập' ? 'income' : 'expense' }));
    return names.filter((c) => !type || c.type === type).map((c) => c.name);
  }
  ```
- **Quét 7 chỗ dùng `CATS`** (~L744, ~L880, ~L1215, ~L2505, ~L2933, ~L3273, template editor) → `cats()`; budget editor dùng `cats('expense')` (thay `CATS.filter(c !== 'Thu nhập')`).
- Sau `loadData` + trong handler realtime: `window.Parser.setCategories(...)` với danh sách active.
- `catIcon(cat)` (~L100): tra `DATA.categories` trước — có `emoji` → `'<span class="cat-emoji">' + esc(emoji) + '</span>'`; không thì `CAT_ICON` SVG; cuối cùng `'more'`. `catLabel` giữ nguyên (custom name hiển thị đúng tên user đặt, không dịch).

### D2. Trang Settings mới "Danh mục" (owner/admin)
- Root menu: thêm `iosRow({ic:'list', tint:'orange', label:t('categories'), page:'cats'})` vào nhóm **Quản lý tiền** (cạnh Ngân sách).
- Page `cats` — editor dạng hàng như Ví/Khoản định kỳ (`walletEditRowHtml` pattern):
  - Mỗi hàng: ô emoji (nhỏ) · ô tên · segmented Chi/Thu · nút ẩn/hiện (archive toggle) · nút xóa (chỉ enable khi chưa dùng — app đếm `DATA.transactions`).
  - `'Thu nhập'` (is_system): khóa tên + không cho ẩn/xóa (disable input).
  - Nút "Thêm danh mục" thêm hàng trống; nút "Lưu" (bọc `busy()`): hàng mới → `addCategory`; đổi emoji/type/sort → `updateCategory`; **đổi tên → confirm** (`t('confirmRenameCat')` nêu rõ: mọi giao dịch cũ sẽ đổi theo, báo cáo đã chốt giữ tên cũ) rồi `renameCategory`.
  - Lần đầu mở mà `DATA.categories` rỗng → gọi `seedDefaultCategories` (tự chuyển bộ 8 vào DB) rồi render editor.
  - Member thường: `roLock` (xem, không sửa) — pattern trang AI.
  - Schema chưa chạy lại (seed lỗi) → hint `catsSchemaHint` ("chạy lại supabase-schema.sql"), app vẫn chạy bộ 8.
- Budget editor (~L2933): thêm link nhỏ "Quản lý danh mục →" (`data-page="cats"`).

### D3. Realtime & thứ tự render
- `subscribeChanges` đã refresh DATA → chỉ cần đảm bảo sau refresh gọi lại `Parser.setCategories`.
- Archive một danh mục đang có budget: hàng budget giữ trong DB nhưng editor/report progress chỉ hiện danh mục active + **các danh mục archived còn số liệu trong kỳ đang xem** (để báo cáo tháng cũ không mất cột). `byCategory`/donut chạy trên text nên tự đúng.

### D4. i18n (đủ vi + en)
```
categories:        'Danh mục'                          / 'Categories'
addCategory:       'Thêm danh mục'                     / 'Add category'
catName:           'Tên danh mục'                      / 'Name'
catEmoji:          'Biểu tượng'                        / 'Icon'
catArchived:       'Đã ẩn'                             / 'Hidden'
catHide:           'Ẩn'                                / 'Hide'
catShow:           'Hiện lại'                          / 'Unhide'
catInUse:          'Đang có giao dịch — chỉ có thể ẩn.' / 'Has transactions — can only be hidden.'
confirmRenameCat:  'Đổi tên "{a}" thành "{b}"? Mọi giao dịch, ngân sách, khoản định kỳ sẽ đổi theo. Báo cáo tháng đã chốt giữ tên cũ.' / '...'
catSaved:          'Đã lưu danh mục.'                  / 'Categories saved.'
catDuplicate:      'Tên danh mục đã tồn tại.'          / 'Category name already exists.'
catsHint:          'Danh mục dùng chung cho cả hộ. AI phân loại theo danh sách này.' / '...'
catsSchemaHint:    'Cần chạy lại supabase-schema.sql để bật danh mục tùy chỉnh.'     / '...'
manageCats:        'Quản lý danh mục'                  / 'Manage categories'
```

### D5. CSS (`css/style.css`)
- `.cat-emoji` (font-size khớp `.ic` 15–18px, line-height 1); hàng editor `.cat-edit-row` tái dùng style `.wallet-edit-row`; không thêm cơ chế mới.

---

## QUY TẮC CHUNG (bắt buộc)

1. Text là khóa — KHÔNG thêm cột `category_id` vào transactions/budgets/recurring.
2. Đổi tên qua RPC duy nhất (atomic); KHÔNG update từng bảng từ client.
3. Archive-first; xóa cứng chỉ khi 0 tham chiếu (app check + RPC check lại).
4. `'Thu nhập'`, `ADJUST_CATEGORY`, `'Chuyển khoản'` là hệ thống — không rename/ẩn/xóa.
5. Fallback bộ 8 khi bảng trống/lỗi — app cũ chạy y nguyên, KHÔNG bắt buộc migration.
6. Parser nhận danh sách qua `setCategories`; prompt AI build động tại thời điểm gọi.
7. Mọi nút server bọc `busy()`; i18n đủ vi+en; schema an toàn chạy lại; `loadData` dung nạp bảng vắng.
8. Không thư viện mới, không emoji-picker phức tạp (input text là đủ — bàn phím điện thoại có sẵn emoji).

---

## TEST TAY

1. **Chưa chạy schema**: app chạy như cũ (8 danh mục); mở trang Danh mục → hint chạy lại schema.
2. Chạy lại schema → mở **Cài đặt → Danh mục** lần đầu → 8 danh mục mặc định xuất hiện trong editor (đã seed vào DB).
3. **Thêm** "Học phí 📚" (expense) → Lưu → xuất hiện trong: dropdown Thêm/Sửa giao dịch, filter, budget editor. Nhập tay "học phí kỳ 2 5tr" (có key AI) → AI phân loại đúng "Học phí".
4. Đặt **budget** cho "Học phí" → thanh progress hiện đúng ở Ngân sách + Báo cáo.
5. **Đổi tên** "Học phí" → "Giáo dục": confirm hiện cảnh báo; sau khi lưu, giao dịch cũ + budget + recurring đều mang tên mới; mở lại báo cáo tháng ĐÃ CHỐT trước đó → vẫn tên cũ (đúng thiết kế).
6. **Ẩn** "Giải trí" (đang có giao dịch): biến khỏi picker/budget editor; giao dịch cũ vẫn hiện "Giải trí"; báo cáo tháng cũ vẫn có cột Giải trí. **Hiện lại** → quay về picker.
7. **Xóa cứng** danh mục vừa tạo chưa dùng → mất hẳn. Thử xóa danh mục có giao dịch → app chặn (chỉ cho Ẩn); gọi RPC trực tiếp cũng bị `in_use`.
8. `'Thu nhập'`: không sửa/ẩn/xóa được. Member thường: trang Danh mục read-only.
9. Máy thứ hai cùng hộ: thêm danh mục ở máy 1 → máy 2 thấy ngay (realtime), parser máy 2 phân loại theo danh mục mới.
10. Tắt AI key: nhập tay từ khóa thuộc 8 danh mục mặc định vẫn match regex; từ khóa danh mục mới → rơi về 'Khác' (chấp nhận ở v1).

---

## PHẦN E — Phase 2 (tuỳ chọn, KHÔNG làm ở v1)

- **Keywords tự nhập** cho danh mục mới (regex fallback không cần AI).
- **Budget theo kỳ**: tuần/năm, không chỉ tháng; **rollover** phần dư sang tháng sau.
- Gộp danh mục (merge A vào B).
- Màu tùy chỉnh cho donut chart.
- Giới hạn số danh mục (~30) + cảnh báo UX khi quá nhiều.

---

## KẾT QUẢ MONG ĐỢI

- ✅ Hộ tự thêm/đổi tên/ẩn danh mục (kèm emoji), dùng chung realtime cho cả hộ.
- ✅ Budget editor + báo cáo + mọi dropdown bám danh sách động; AI phân loại theo danh mục của hộ.
- ✅ Dữ liệu cũ nguyên vẹn; đổi tên cascade an toàn (atomic); snapshot đã chốt bất biến.
- ✅ Không chạy lại schema vẫn dùng được như cũ; vanilla JS, không thư viện mới.

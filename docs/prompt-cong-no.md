# Prompt: THEO DÕI CÔNG NỢ — cho vay / đi vay, trả nhiều lần, kèm ảnh bằng chứng

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework; backend Supabase; PWA).
>
> Triết lý: **công nợ KHÔNG phải thu/chi**. Cho mượn rồi được trả mà ghi chi + thu sẽ thổi phồng
> mọi số gross (tổng chi, tổng thu, tỷ lệ tiết kiệm, ngân sách, chốt sổ) — đặc biệt sai khi mượn/trả
> vắt qua hai tháng. Mọi dòng tiền công nợ đi bằng **CHUYỂN KHOẢN** (đã được loại khỏi thống kê
> thu/chi sẵn) qua hai **ví hệ thống** "Cho vay" (tài sản) / "Đi vay" (nợ) — bảng `debts` chỉ là sổ
> theo dõi TỪNG KHOẢN theo người, còn bao nhiêu, hạn khi nào. Ảnh bằng chứng tái dùng nguyên
> pipeline `transaction_attachments` + bucket `receipts` vì mỗi lần giải ngân/trả là một transaction.

---

## HIỆN TRẠNG (đã khảo sát)

- Chuyển khoản = transaction `type: 'transfer'`, `category: 'Chuyển khoản'`, `account_id` (đi) + `to_account_id` (đến), tạo qua `Store.addTransaction` (modal `openTransfer`, app.js ~L3551). `totals()` bỏ qua transfer → không đụng thu/chi.
- Ví đã có `class` asset|liability (net worth), `allow_tx` (ví lưu trữ rời form nhập nhưng vẫn chuyển khoản được), pattern insert schema-tolerant (`addAccount` store.js ~L731).
- Evidence ảnh: `compressImage(file)` → `Store.uploadReceipt(txId, blob, 'jpg')` → `Store.insertAttachment({transactionId, storagePath, mime, sizeBytes, width, height})` (xem `attachPendingTo`, app.js ~L1824); badge `attachBadge(txId)` + viewer read-only `data-attview` dùng cho MỌI transaction có ảnh. `deleteTransaction` tự dọn file Storage trước khi xóa row.
- Money input: `class="js-money"` + `groupMoney()`/`readMoney()`; modal pattern `modal-backdrop`; dropdown tự nâng cấp bởi `CustomSelect.enhanceAll()`; mọi nút server bọc `busy()`.
- `log_activity` generic (bảng mới chỉ cần trigger + label); realtime từng bảng trong `subscribeChanges`; RLS helper `user_households()` / `is_household_admin()`.

## MỤC TIÊU

1. Màn **Công nợ** (Cài đặt → Quản lý tiền): tạo khoản **cho vay / đi vay** theo người (ngoài hộ), ghi nhận **trả nhiều lần**, tự tất toán khi trả đủ, lịch sử đã tất toán.
2. **Mỗi giao dịch công nợ (giải ngân + từng lần trả) đính được ẢNH bằng chứng** — chụp/chọn ngay trên form, xem lại bằng viewer sẵn có.
3. Thống kê thu/chi/tiết kiệm/ngân sách/chốt sổ **không bị méo**; tài sản ròng đúng (Cho vay = tài sản, Đi vay = nợ).
4. Hạn trả: badge sắp hạn/quá hạn + nhắc 1 lần/ngày khi mở app.
5. Card tóm tắt ở **Tổng quan** khi đang có nợ mở, chạm để vào màn Công nợ.
6. Schema-tolerant: hộ chưa chạy lại schema → mục Công nợ hiện hint, app còn lại nguyên vẹn.

### QUYẾT ĐỊNH THIẾT KẾ CỐT LÕI (đọc kỹ, đừng làm khác)

1. **Sổ nợ tách khỏi dòng tiền**: bảng `debts` giữ gốc khoản nợ (người, hướng, số tiền gốc, hạn); từng lần tiền chảy = transaction transfer gắn `transactions.debt_id`. "Còn lại" LUÔN tính client-side = gốc − tổng các transfer chiều trả (không lưu số dư trong debts → không bao giờ lệch).
2. **Hai ví hệ thống, tạo lười (lazy)** khi lần đầu dùng: nhận diện bằng cột mới `accounts.system_kind` (`debt_lend` / `debt_borrow`) — KHÔNG match theo tên (user đổi tên được). Cho vay: type savings, class asset. Đi vay: type savings, class **liability** (số dư âm = đang nợ, khớp khung net worth). Cả hai `allow_tx=false` (không lọt form nhập chi tiêu).
3. **Chiều tiền**: cho vay X = transfer ví-thật → ví Cho vay; được trả = ví Cho vay → ví-thật. Đi vay = ví Đi vay → ví-thật; trả nợ = ví-thật → ví Đi vay. Phân biệt giải-ngân/lần-trả của một debt bằng chiều transfer so với ví hệ thống (không thêm cột type).
4. **Ảnh bằng chứng đi theo transaction** (không bảng mới): form tạo nợ / ghi trả có input ảnh (`accept="image/*" capture="environment"`, chọn nhiều), sau khi transfer lưu xong → nén + upload từng ảnh lên chính tx đó. Hàng lịch sử trong màn Công nợ hiện `attachBadge(tx.id)` → viewer sẵn có.
5. **Xóa khoản nợ = hoàn tác trọn gói**: xóa mọi transaction gắn `debt_id` (qua `deleteTransaction` — tự dọn ảnh Storage) rồi xóa row debts → số dư ví tự hồi. Confirm nêu rõ hệ quả. Khoản đã có lần trả chỉ creator/admin xóa được (RLS transactions tự chặn member xóa tx người khác — bắt lỗi, toast).
6. **Tất toán**: sau mỗi lần trả, nếu tổng trả ≥ gốc → update `status='settled'`; hiển thị luôn nhóm theo **outstanding tính lại từ transactions** (status chỉ là nhãn lưu trữ — lỡ xóa tay một lần trả thì list vẫn đúng).
7. **Quyền**: mọi thành viên tạo/ghi trả (như transactions); sửa/xóa = creator hoặc owner/admin. RLS mirror pattern transactions.
8. **`DATA.debts === null`** (bảng chưa có — schema chưa chạy lại) → menu vẫn hiện, trang hiện `debtsSchemaHint`; `[]` = có bảng nhưng trống. Card Tổng quan chỉ hiện khi là mảng và có nợ mở.
9. Không đụng parser/AI (nhập "cho A mượn 2tr" tự nhận diện là Phase 2); không đụng Edge Function; `sw.js` không đổi.

---

## PHẦN A — Schema (`supabase-schema.sql`, an toàn chạy lại — CẦN chạy lại)

```sql
-- Ví hệ thống của tính năng Công nợ (nhận diện không theo tên)
alter table public.accounts add column if not exists system_kind text;

create table if not exists public.debts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person       text not null,
  direction    text not null check (direction in ('lend', 'borrow')),
  amount       bigint not null check (amount > 0),
  date         date not null default current_date,
  due_date     date,
  note         text,
  status       text not null default 'open' check (status in ('open', 'settled')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_debts_hh on public.debts (household_id, status, due_date);

alter table public.transactions add column if not exists debt_id uuid references public.debts(id) on delete set null;
```
RLS (pattern transactions): select member hộ; insert member (`created_by = auth.uid()`); update/delete `created_by = auth.uid() or is_household_admin(household_id)`. + realtime publication + trigger `trg_log_debts` (log_activity generic).

## PHẦN B — `js/store.js`

1. `mapRow`: thêm `debtId: r.debt_id || null`. `mapAccount`: thêm `systemKind: a.system_kind || null`. `addTransaction`: `if (tx.debtId) row.debt_id = tx.debtId;` (schema-tolerant như recurring_id).
2. `mapDebt(r)` → `{id, person, direction, amount, date, dueDate, note, status, createdBy}`.
3. `loadData`: `debts` — lỗi/thiếu bảng → `null`, có bảng → mảng (`.order('date', desc)`). `subscribeChanges` + bảng `debts`.
4. `ensureDebtWallet(direction)`: tìm account theo `system_kind`; chưa có → `addAccount`-style insert `{name: tr('walletLend'/'walletBorrow'), type: 'savings', class: lend?'asset':'liability', allow_tx: false, system_kind, sort_order: 90}`.
5. `addDebt({person, direction, amount, date, dueDate, note, accountId})`: insert debts → `ensureDebtWallet` → `addTransaction` transfer đúng chiều (note tự sinh "Cho vay: <person>" / "Đi vay: <person>", `debtId`). Trả `{debt, tx}`.
6. `addDebtPayment(debt, {amount, accountId, date, settle})`: transfer chiều trả + `debtId`; `settle===true` → update status settled. Trả tx.
7. `updateDebt(id, fields)` (status/dueDate/note/person), `deleteDebt(id)`: select id các tx `eq('debt_id', id)` → lặp `deleteTransaction` → delete row.
8. Export: `addDebt, addDebtPayment, updateDebt, deleteDebt` (ensureDebtWallet nội bộ).

## PHẦN C — `js/app.js`

### C1. Helpers
- `debtWallet(direction)` từ `DATA.accounts` theo `systemKind`; `debtTxs(id)` = transactions có `debtId===id` (sort date asc); `debtPaid(debt)` = tổng tx chiều trả (Q.Đ #3); `debtOutstanding = amount − paid`; `debtIsOpen = outstanding > 0`.
- `dueBadge(debt)`: quá hạn (đỏ) / còn ≤3 ngày (vàng) khi open.
- `maybeDebtReminder()` (gọi cuối `enterApp`): có khoản open quá hạn → toast warn, chặn lặp bằng `localStorage mm_debt_remind = ymd(today)`.

### C2. Trang Cài đặt → Công nợ (page `'debts'`, row grpMoney value = số khoản mở)
- `DATA.debts === null` → `debtsSchemaHint`. Ngược lại:
- Chips tóm tắt: `Đang cho vay: X · Đang nợ: Y` (tổng outstanding theo hướng).
- Nút **＋ Thêm khoản nợ** → form inline: select hướng (Cho vay/Đi vay) · tên người · số tiền `js-money` · ví (select từ `spendableAccounts()` loại trừ ví systemKind) · ngày (mặc định hôm nay) · hạn trả (optional) · ghi chú · **input ảnh bằng chứng** (multiple, hiện đếm "n ảnh") · nút Lưu (`busy`): `Store.addDebt` → upload từng ảnh lên `tx.id` (pattern `attachPendingTo`: compress → uploadReceipt → insertAttachment → push `DATA.attachments`) → refreshData nhẹ/unshift + render + toast.
- Danh sách: nhóm **"Người khác nợ bạn"** / **"Bạn nợ người khác"** (open, sort hạn gần trước) — mỗi hàng: person + note, `còn X / gốc Y`, dueBadge, nút **Trả** + nút xóa (icon-btn danger, confirm `confirmDeleteDebt` nêu rõ xóa cả giao dịch + ảnh). Dưới hàng: mini-list các tx (ngày · ±số tiền · `attachBadge(tx.id)`).
- **Form ghi trả** (toggle theo hàng): số tiền (prefill outstanding, cho phép < outstanding = trả một phần; > outstanding → chặn `overpay`) · ví nhận/chi · ngày · **ảnh bằng chứng** · Lưu (`busy`): `addDebtPayment(debt, {…, settle: paid+amount >= debt.amount})` + upload ảnh + render.
- **Lịch sử** (outstanding ≤ 0): `<details>` gọn cuối trang, mỗi hàng person · gốc · ngày tất toán (ngày tx trả cuối).

### C3. Tổng quan
- `debtsSectionHtml()` sau goals: chỉ khi có khoản mở — card 1 dòng `Công nợ · Cho vay còn X · Đang nợ Y` (ẩn vế 0), chạm → `currentTab='settings'; settingsPage='debts'; render()`.

### C4. Nhật ký hoạt động
- map entity `debts` → `entDebt` + icon; summary hiện person + amount.

### C5. i18n (đủ vi + en — nhóm key `debts*`, `walletLend/walletBorrow`, `lend/borrow`, `debtPerson/debtDue/debtRemain/debtRecordPay/debtPaidOff/debtHistory/overpay/confirmDeleteDebt/debtsSchemaHint/debtReminder/…`)

### C6. CSS
- `.debt-row` (pattern member-row/goal), `.debt-badge.due/.overdue`, chips tóm tắt, mini-list tx. Không cơ chế mới.

---

## QUY TẮC CHUNG (bắt buộc)

1. Tiền công nợ CHỈ đi bằng transfer + debt_id — KHÔNG bao giờ ghi type expense/income.
2. "Còn lại" tính từ transactions mỗi lần render — không lưu cột số dư.
3. Ảnh bằng chứng chỉ qua pipeline receipts sẵn có; xóa nợ phải xóa tx qua `deleteTransaction` (dọn Storage).
4. Ví hệ thống nhận diện bằng `system_kind`; không hiện trong form nhập (`allow_tx=false`); user có quyền đổi tên thoải mái.
5. Schema-tolerant: `debts` null → hint; mapRow/addTransaction chịu được thiếu cột `debt_id`.
6. `busy()` mọi nút; i18n vi+en; realtime + activity log; Conventional Commits; KHÔNG bump version; `sw.js` không đổi.
7. Khoản nợ cũ đã lỡ nhập dạng chi/thu: ĐỂ NGUYÊN (không migration) — ghi chú trong release note.

## TEST TAY

1. Chưa chạy schema: menu Công nợ hiện, trang báo hint; app còn lại bình thường.
2. Chạy schema → tạo "Cho vay A 5tr" kèm 1 ảnh: ví Cho vay tự sinh (không lọt form nhập chi), số dư 5tr; Tiền mặt −5tr; **tổng chi kỳ KHÔNG đổi**; badge 📎 mở đúng ảnh.
3. A trả 2tr (kèm ảnh) → còn 3tr; trả nốt 3tr → khoản tự sang Lịch sử; ví Cho vay về 0.
4. Đi vay B 10tr → ví Đi vay −10tr, tài sản ròng giảm đúng 0 (tiền mặt +10, nợ −10); trả dần OK.
5. Nhập quá outstanding → chặn; hai thiết bị cùng hộ thấy realtime; member thường tạo/trả được, xóa khoản của người khác bị chặn (owner xóa được).
6. Xóa khoản có 2 lần trả + 3 ảnh → cả 3 tx biến mất, Storage sạch, số dư ví hồi nguyên.
7. Đặt hạn hôm qua → badge đỏ + toast nhắc 1 lần/ngày; hạn +2 ngày → badge vàng.
8. Chốt sổ tháng có cho vay/trả nợ: thu/chi/tiết kiệm không lẫn số công nợ; card Tổng quan hiện đúng, chạm nhảy đúng trang.

## Phase 2 (KHÔNG làm ở v1)
Nhập ngôn ngữ tự nhiên ("cho anh Tuấn mượn 2tr"); lãi suất; nợ giữa thành viên trong hộ; xuất báo cáo công nợ; nhắc qua email tháng.

## KẾT QUẢ MONG ĐỢI
- ✅ Sổ công nợ theo người, trả nhiều lần, ảnh bằng chứng từng giao dịch, nhắc hạn.
- ✅ Thu/chi/ngân sách/chốt sổ sạch; tài sản ròng phản ánh đúng khoản cho vay/đi vay.
- ⚠ Vận hành: chạy lại `supabase-schema.sql` (bucket receipts đã có từ trước).

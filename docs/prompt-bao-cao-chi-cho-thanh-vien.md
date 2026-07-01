# Prompt: Báo cáo "CHI CHO AI" (người thụ hưởng) thay cho báo cáo theo người nhập

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; web tĩnh chạy trên GitHub Pages).
>
> Triết lý: **thay đổi tối thiểu, tái dùng hạ tầng báo cáo & danh sách thành viên sẵn có.** Thêm 1 trường "chi cho ai" (người thụ hưởng) trên mỗi giao dịch; đổi báo cáo "theo người **nhập**" thành báo cáo "theo người **được chi**".

---

## MỤC TIÊU (theo yêu cầu người dùng)

1. Hiện tại có báo cáo **"Thu chi theo người"** — gom theo **ai là người NHẬP** giao dịch (`tx.userId`). Đổi thành báo cáo **"Chi theo thành viên"** — gom theo **giao dịch đó CHI CHO AI**.
2. Danh sách người thụ hưởng luôn có **mặc định "Chi chung (cả nhà)"** + **từng thành viên** trong hộ.
3. **Mỗi lần thêm / sửa** giao dịch đều có **lựa chọn "Chi cho"**: _Chung (cả nhà)_ **hoặc** _một thành viên_. Mặc định = **Chung**.
4. Báo cáo = **thống kê ai đang được chi bao nhiêu tiền**, theo **tuần / tháng / năm** (đã có sẵn bộ chọn kỳ — báo cáo mới phải hoạt động trên cả 3 kỳ).

---

## BỐI CẢNH REPO (đọc trước khi code)

- **Giao dịch** ở bảng `public.transactions` (`supabase-schema.sql` ~L56). Trường hiện có: `user_id` (người nhập), `type` (`income|expense|transfer`), `category`, `note`, `account_id`, `to_account_id`… Pattern thêm cột: các dòng `alter table public.transactions add column if not exists …` (~L90–95). **An toàn chạy lại.**
- **Thành viên hộ** ở bảng `public.household_members` (`user_id`, `email`, `role`). Client nạp vào biến `householdMembers` (`js/app.js` ~L400) dạng `[{userId, email, role}]`. Hàm hiển thị tên: **`memberName(uid)`** (~L449) — trả `t('you')` nếu là mình, ngược lại lấy phần trước `@` của email, fallback `t('unknownMember')`.
- **Tầng dữ liệu** `js/store.js`:
  - `mapRow(r)` (~L284) map row → tx (camelCase). `userId: r.user_id`.
  - `addTransaction(tx)` (~L420) & `addTransactions(list)` (~L447): build `row`/`rows` snake_case rồi `insert`.
  - `updateTransaction(id, fields)` (~L471): patch từng field `if ('x' in fields)`.
- **Báo cáo** `js/app.js`:
  - Bộ chọn kỳ: biến `reportPeriod` (`week|month|year`, ~L412), `reportAnchor` (~L413); `reportRange()` (~L1675) → `{s, e}`; `inRange(s, e)` lọc giao dịch trong kỳ. Nút kỳ render ~L2024.
  - **`personTotals(txs)`** (~L1971): gom `income/expense` theo `tx.userId` → `{labels, inc, exp}`. **Đây là hàm CẦN ĐỔI.**
  - **`byPersonHtml(pp)`** (~L1989): render section (canvas `repPerson`).
  - `viewReports()` (~L1995): `const pp = personTotals(txs)` (~L2004); vẽ chart `repPerson` trong `setTimeout` (~L2015); nhúng `reportCard(byPersonHtml(pp))` (~L2059).
- **Form thêm giao dịch** = ô nhập ngôn ngữ tự nhiên, KHÔNG có dropdown category:
  - `viewAdd()` (~L2107): `textarea#txInputBig` + `dateBar` + hàng ví `accountSelect('txAccountBig')` (~L2112).
  - Handler parse → `buildDraft(parsed, picked, today, accountId)` (~L933) → `saveDrafts(drafts, accountId, opts)` (~L948) gọi `addTransaction`/`addTransactions`.
  - Nhiều dòng → **`openEntryPreview(drafts, accountId, dropped)`** (~L1028): modal xác nhận, có `accountSelect('epAccount')` dùng chung cho cả lô (~L1030); khi Save đọc lại từng `.entry-row` (~L1061).
- **Modal sửa** `openEdit(id)` (~L2539): có `#eAmount`, `select#eCat`, `#eNote`, ngày/giờ, `accountSelect('eAccount')`, seg type. Save (~L2569) gom `fields` rồi `updateTransaction`. Chuyển khoản (`type==='transfer'`) đi qua `openTransfer` (~L2489) — **KHÔNG áp dụng "chi cho ai".**
- **Quyền sửa**: `canEditTx(tx)` (~L470) — member chỉ sửa tx của mình, owner/admin sửa mọi tx. Đã đủ; không đổi.
- Tiền hiển thị qua `fmtShort`/`fmtVND`; ẩn số dư qua `mask()`. i18n: object `I18N` (VI ~L60+, EN ~L200+) — **mọi chuỗi mới phải có cả `vi` và `en`.** `byPerson` hiện ở VI ~L142, EN ~L287.

---

## MÔ HÌNH DỮ LIỆU (quyết định — đọc kỹ)

- Thêm **1 cột** trên `transactions`: **`beneficiary_id uuid references auth.users(id) on delete set null`**.
  - **`NULL` = "Chi chung (cả nhà)"** (mặc định). Đây là ý nghĩa mặc định cho **mọi giao dịch cũ** ⇒ **không cần backfill**.
  - **Non-null** = `user_id` của **một thành viên hộ** (người được chi cho).
- Vì sao dùng `user_id` chứ không phải bảng "người thụ hưởng" riêng: tái dùng nguyên `householdMembers` + `memberName()`; không thêm bảng, không thêm join. Người thụ hưởng ngoài-hộ (vd con nhỏ chưa có tài khoản) để **Phase 2**.
- `on delete set null`: nếu tài khoản auth bị xoá thì giao dịch của người đó tự về "Chung" — chấp nhận được. Nếu id thụ hưởng không còn trong `householdMembers` (đã rời hộ) → báo cáo vẫn gom được, nhãn = `memberName()` (fallback "chưa rõ email").
- Áp dụng cho **income & expense** (lưu chung 1 cột cho đơn giản); **transfer KHÔNG dùng** (bỏ qua như `personTotals` đang bỏ qua transfer). Báo cáo thống kê **chi (expense)** là chính — đúng câu "ai đang chi".

---

## PHẦN A — Schema (`supabase-schema.sql`, an toàn chạy lại)

Thêm cạnh các `alter table public.transactions add column …` hiện có (~L90–95):

```sql
-- "Chi cho ai": người thụ hưởng của giao dịch. NULL = chi chung cho cả nhà.
-- Non-null = user_id của một thành viên hộ. on delete set null: xoá user → về "chung".
alter table public.transactions add column if not exists beneficiary_id uuid references auth.users(id) on delete set null;
create index if not exists transactions_beneficiary_idx on public.transactions(household_id, beneficiary_id);
```

> RLS: cột nằm trên `transactions` nên **các policy hiện có đã bao trọn** (không cần policy mới). Ràng buộc "beneficiary phải cùng hộ" là tuỳ chọn (UI chỉ cho chọn thành viên trong hộ) — có thể thêm trigger kiểm tra ở Phase 2, v1 không bắt buộc.
> Cập nhật `memory`/README: nhắc người dùng **chạy lại `supabase-schema.sql`** sau khi merge (đúng như các tính năng trước).

---

## PHẦN B — Tầng dữ liệu (`js/store.js`)

1. **`mapRow`** (~L284): thêm
   ```js
   beneficiaryId: r.beneficiary_id || null,
   ```
2. **`addTransaction`** (~L420) — trong object `row`, thêm (đặt cạnh `to_account_id`):
   ```js
   beneficiary_id: tx.beneficiaryId || null,
   ```
3. **`addTransactions`** (~L447) — trong `rows.map(...)`, thêm dòng tương tự `beneficiary_id: tx.beneficiaryId || null,`.
4. **`updateTransaction`** (~L471) — thêm:
   ```js
   if ('beneficiaryId' in fields) patch.beneficiary_id = fields.beneficiaryId || null;
   ```

> Không đổi `mapRecurring` ở v1 (khoản định kỳ vẫn tạo giao dịch "chung"). Ghi chú Phase 2 bên dưới.

---

## PHẦN C — Logic & UI (`js/app.js`)

### C1. Helper chọn người thụ hưởng (tái dùng ở mọi form)

Thêm gần `accountSelect` (~L876):

```js
// <select> "Chi cho ai": option đầu = Chung (value ''), rồi từng thành viên hộ.
// selectedId = beneficiaryId hiện tại ('' / null = Chung).
function beneficiarySelect(id, selectedId) {
  const sel = selectedId || '';
  let opts = '<option value=""' + (sel === '' ? ' selected' : '') + '>' + t('beneficiaryShared') + '</option>';
  opts += householdMembers.map((m) =>
    '<option value="' + esc(m.userId) + '"' + (m.userId === sel ? ' selected' : '') + '>' +
    esc(memberName(m.userId)) + '</option>').join('');
  return '<select id="' + id + '">' + opts + '</select>';
}
```

### C2. Gắn selector vào form **Thêm** (`viewAdd`, ~L2107)
- Ngay dưới hàng ví (~L2112), thêm 1 hàng "Chi cho":
  ```js
  '<div class="acct-row">' + icon('members') /* hoặc 'more' nếu chưa có icon */ +
    '<label class="sr-only">' + t('spentFor') + '</label>' + beneficiarySelect('txBeneficiaryBig', '') + '</div>' +
  ```
  (nếu hộ chỉ có 1 thành viên và bạn muốn gọn, vẫn hiển thị — mặc định "Chung" là hợp lệ.)
- Trong handler add (~L905–929): đọc `const beneficiaryId = (document.getElementById('txBeneficiaryBig')||{}).value || null;` **trước** `buildDraft`, rồi truyền xuống.

### C3. `buildDraft` (~L933) — nhận & gắn beneficiary
- Đổi chữ ký: `buildDraft(parsed, picked, today, accountId, beneficiaryId)` và thêm vào object trả về:
  ```js
  beneficiaryId: beneficiaryId || null,
  ```
- Nơi gọi (~L925): `recognized.map((p) => buildDraft(p, picked, today, accountId, beneficiaryId))`.
- `saveDrafts` → `addTransaction`/`addTransactions` đã nhận `tx.beneficiaryId` (PHẦN B) nên tự lưu.

### C4. Modal xác nhận nhiều dòng (`openEntryPreview`, ~L1028)
- Thêm 1 select dùng chung cho cả lô, cạnh `walletSel` (~L1030/1035):
  ```js
  const benSel = '<label>' + t('spentFor') + '</label>' + beneficiarySelect('epBeneficiary', drafts[0] ? drafts[0].beneficiaryId : '');
  // …chèn ' + walletSel + benSel + ' vào chuỗi modal
  ```
- Khi Save (~L1058): đọc `const ben = (document.getElementById('epBeneficiary')||{}).value || null;` và thêm `beneficiaryId: ben` vào từng object push (~L1064).
- (Tuỳ chọn Phase 2: cho phép chọn **theo từng dòng** — thêm `beneficiarySelect` vào `entryPreviewRow`.)

### C5. Modal **Sửa** (`openEdit`, ~L2539)
- Sau dropdown ví `accountSelect('eAccount', …)` (~L2552), thêm:
  ```js
  '<label>' + t('spentFor') + '</label>' + beneficiarySelect('eBeneficiary', tx.beneficiaryId) +
  ```
- Trong Save (~L2570): thêm vào `fields`:
  ```js
  beneficiaryId: (document.getElementById('eBeneficiary')||{}).value || null,
  ```
  (`updateTransaction` + `Object.assign(tx, fields)` đã xử lý phần còn lại.)
- **Không** thêm vào `openTransfer` (chuyển khoản không có người thụ hưởng).

### C6. ĐỔI báo cáo: `personTotals` → gom theo người thụ hưởng
Thay **`personTotals`** (~L1971) bằng logic gom theo `beneficiaryId` (NULL → bucket "Chung"). Báo cáo chỉ liệt kê **người thực sự được chi** (thành viên không phát sinh sẽ không xuất hiện — danh sách đầy đủ "Chung + thành viên" nằm ở ô chọn khi thêm/sửa). "Chung" luôn đứng đầu:

```js
// Gom CHI (expense) theo người được chi trong kỳ. NULL = "Chung (cả nhà)".
// Chỉ giữ bucket có phát sinh; "Chung" đứng đầu, còn lại sắp giảm dần theo chi.
// key '' = chung; key = userId. Trả về mảng song song cho bar chart + danh sách số liệu.
function beneficiaryTotals(txs) {
  const by = {};
  txs.forEach((tx) => {
    if (tx.type === 'transfer') return;
    const k = tx.beneficiaryId || '';
    const b = by[k] || (by[k] = { expense: 0, income: 0 }); // id lạ (đã rời hộ) vẫn gom
    if (tx.type === 'income') b.income += tx.amount; else b.expense += tx.amount;
  });
  const keys = Object.keys(by).sort((a, b) => {
    if (a === '') return -1; if (b === '') return 1;          // "Chung" luôn đứng đầu
    return by[b].expense - by[a].expense;                      // còn lại: chi nhiều lên trước
  });
  return {
    keys: keys,
    labels: keys.map((k) => (k === '' ? t('beneficiaryShared') : memberName(k))),
    exp: keys.map((k) => by[k].expense),
    inc: keys.map((k) => by[k].income),
  };
}
```

> Giữ tên biến cũ `pp` ở `viewReports` (đổi nguồn): `const pp = beneficiaryTotals(txs);` (~L2004). `txs = inRange(s, e)` đã theo **tuần/tháng/năm** ⇒ báo cáo mới tự chạy cho cả 3 kỳ, không cần thêm gì.

### C7. Render section mới (`byPersonHtml` → `byBeneficiaryHtml`)
Thay `byPersonHtml` (~L1989) bằng: tiêu đề mới + **bar chart CHI theo người** + **danh sách số liệu** (tiền + %) — vì yêu cầu là "với số lượng tiền là báo cáo":

```js
function byBeneficiaryHtml(pp) {
  const totalExp = pp.exp.reduce((a, b) => a + b, 0);
  if (!totalExp) return ''; // chưa có chi trong kỳ → bỏ card (masonry không có ô trống)
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
```

Trong `viewReports`:
- Vẽ chart (~L2015): đổi id `repPerson` → `repBeneficiary`, chỉ vẽ **chi**, lọc bỏ bucket 0đ để không có cột rỗng:
  ```js
  const benL = [], benE = [];
  pp.keys.forEach((k, i) => { if (pp.exp[i]) { benL.push(pp.labels[i]); benE.push(pp.exp[i]); } });
  if (benE.length) window.Charts.bars('repBeneficiary', benL, [{ label: t('expense'), data: benE, color: expColor }]);
  ```
- Nhúng section (~L2059): `reportCard(byBeneficiaryHtml(pp))`.
- Xoá/không dùng `byPersonHtml` & `personTotals` cũ (thay hẳn — theo yêu cầu "đổi thành").

### C8. (Tuỳ chọn) Hiển thị người thụ hưởng trên dòng giao dịch
Trong `txRow` (~L1465, dòng meta của expense/income) có thể thêm chip "→ <tên>" khi `tx.beneficiaryId`:
`+ (tx.beneficiaryId ? ' · ' + t('spentForShort') + ' ' + esc(memberName(tx.beneficiaryId)) : '')`
(vẫn giữ `memberName(tx.userId)` = người nhập). Không bắt buộc, nhưng giúp đối chiếu nhanh.

### C9. i18n (bắt buộc `vi` + `en`)
Thêm/đổi các key:
```
spentFor:          'Chi cho'                 / 'Spent for'
spentForShort:     'cho'                     / 'for'
beneficiaryShared: 'Chung (cả nhà)'          / 'Shared (whole family)'
byBeneficiary:     'Chi theo thành viên'     / 'Spending by member'
```
- Có thể **giữ** key `byPerson` cũ (không còn dùng) hoặc xoá — không để chuỗi nào thiếu ngôn ngữ.

---

## PHẦN D — CSS (`css/style.css`)
- Thêm `.ben-list` / `.ben-row` (flex, `justify-content: space-between`, khoảng cách nhỏ) và `.ben-amt` (đậm), tái dùng token màu/spacing sẵn có. Không thêm thư viện.
- `.sr-only` nếu chưa có (ẩn nhãn "Chi cho" trên Add page mà vẫn giữ accessibility) — hoặc dùng nhãn hiện.

---

## QUY TẮC CHUNG (bắt buộc)
1. **Mặc định luôn là "Chung"** (`beneficiaryId = null`). Giao dịch cũ = "Chung" tự động; **không backfill**.
2. **Transfer không có người thụ hưởng** — `beneficiaryTotals` bỏ qua, `openTransfer` không thêm selector.
3. Mọi số tiền qua `fmtShort`/`fmtVND` và bọc `mask()`; không tự format thủ công.
4. Mọi chuỗi UI đủ `vi` + `en`.
5. Vanilla JS thuần, không thêm framework/thư viện/build step.
6. Phân quyền giữ nguyên: `canEditTx` quyết định ai sửa được (member chỉ tx của mình; owner/admin mọi tx). Ai cũng **chọn được** người thụ hưởng khi tạo tx của mình.
7. `supabase-schema.sql` an toàn chạy lại (`add column if not exists`, `create index if not exists`).
8. Báo cáo mới phải hoạt động **đồng nhất** ở cả **tuần / tháng / năm** (dùng lại `reportRange`/`inRange` — không hard-code kỳ).

---

## TEST TAY
- Chạy lại `supabase-schema.sql` → cột `beneficiary_id` xuất hiện, app cũ vẫn chạy (mọi tx cũ = "Chung").
- Thêm "ăn tối 200k" để mặc định **Chung**; thêm "học phí 3tr" chọn **Chi cho: <thành viên A>**; thêm "cafe 50k" chọn **thành viên B**.
- Vào **Báo cáo** (tháng): section **"Chi theo thành viên"** hiện bar chart + danh sách: **Chung 200k**, **A 3tr**, **B 50k**, kèm **%**. Tổng khớp tổng chi.
- Chuyển bộ chọn kỳ sang **Tuần** rồi **Năm** → cùng section, số liệu đổi theo kỳ, "Chung" luôn đứng đầu.
- **Sửa** "cafe 50k" đổi người thụ hưởng B → A → báo cáo cập nhật (A tăng, B biến mất khỏi danh sách nếu về 0).
- Nhập nhiều dòng "trà sữa 40k, đồ chơi 150k" → modal xác nhận: chọn **Chi cho** dùng chung cho cả lô → lưu → cả 2 gắn đúng người.
- Bật **ẩn số dư** → số tiền trong danh sách/chart bị che (`mask`).
- Thành viên thường (member) tạo tx của mình có chọn người thụ hưởng OK; không sửa được tx của người khác (giữ nguyên hành vi `canEditTx`).
- Chuyển khoản giữa 2 ví → **không** có ô "Chi cho" và **không** xuất hiện trong báo cáo người thụ hưởng.

---

## PHẦN E — Phase 2 (tuỳ chọn, không bắt buộc v1)
- **Người thụ hưởng ngoài hộ** (con nhỏ, người thân không có tài khoản): bảng `beneficiaries (id, household_id, name)` + cho `beneficiary_id` trỏ tới đó, hoặc thêm cột `beneficiary_name text` tự do. Khi đó `beneficiarySelect` gộp thành viên + danh sách tuỳ chỉnh.
- **Chọn theo từng dòng** trong modal nhiều-mục (`entryPreviewRow`).
- **Khoản định kỳ có người thụ hưởng**: thêm cột trên `recurring` + map ở `runRecurring`.
- **Tự đoán người thụ hưởng từ câu nhập** ("… cho vợ", "cho con") trong `js/parser.js` — chỉ gợi ý, vẫn cho sửa tay.
- **Trigger ràng buộc cùng hộ**: kiểm tra `beneficiary_id` phải là thành viên của `household_id`.

---

## KẾT QUẢ MONG ĐỢI
- ✅ Mỗi giao dịch (thu/chi, không tính chuyển khoản) có trường **"Chi cho"**: mặc định **Chung (cả nhà)** hoặc chọn **một thành viên**, hiện ở cả form **Thêm**, modal **nhiều dòng**, và modal **Sửa**.
- ✅ Báo cáo cũ "theo người **nhập**" được **thay** bằng **"Chi theo thành viên"** = thống kê **ai được chi bao nhiêu tiền** (VND + %), có **bar chart** + **danh sách số liệu**, "Chung" luôn đứng đầu.
- ✅ Chạy đúng cho **tuần / tháng / năm** (tái dùng bộ chọn kỳ sẵn có).
- ✅ Giao dịch cũ mặc định "Chung", **không cần backfill**; đồng bộ realtime & tôn trọng quyền, chế độ ẩn số dư như phần còn lại của app.

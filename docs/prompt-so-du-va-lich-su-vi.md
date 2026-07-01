# Prompt: Nút "Đổi số dư" cho từng ví (giao dịch điều chỉnh) + Lịch sử từng ví

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; web tĩnh chạy trên GitHub Pages).
>
> Triết lý: **thuần bổ sung (additive), thay đổi tối thiểu.** KHÔNG đổi mô hình số dư, KHÔNG đổi cách hiển thị số dư đang có (vẫn giữ số dư từng ví + ô "đầu kỳ" như hiện tại). Chỉ **thêm 2 thứ**: (1) một nút **"Đổi số dư"** trên mỗi ví, hoạt động bằng cách tạo **giao dịch điều chỉnh**; (2) màn **Lịch sử của từng ví** (ai / khi nào / hướng nào / số dư sau).

---

## NGUYÊN TẮC & QUYẾT ĐỊNH (đọc kỹ — đã chốt với người dùng)

Số dư hiện được tính theo **sổ cái phái sinh** (`js/app.js:814` `accountBalance`): `opening_balance + Σ(giao dịch)`. **GIỮ NGUYÊN mô hình này** (an toàn đa người/realtime, không lệch số, sửa/xoá được).

**Nút "Đổi số dư" phải dùng "cách B" — TẠO GIAO DỊCH ĐIỀU CHỈNH bằng phần chênh lệch, KHÔNG sửa thẳng `opening_balance`:**

- Cách này giống hệt tính năng "Reconciliation/Adjustment" của YNAB / Actual Budget.
- Ưu điểm: có **ngày + người** thực hiện (vào được lịch sử), không âm thầm viết lại số dư các kỳ quá khứ, **hoàn tác được** như mọi giao dịch.
- Với người dùng thì trải nghiệm y hệt "gõ số dư thật → số dư nhảy về đúng"; app chỉ ngầm ghi thêm một dòng "Điều chỉnh số dư".

---

## BỐI CẢNH REPO (đọc trước khi code)

- **Ví** ở bảng `public.accounts`; số dư tính **client-side** bằng `accountBalance(id)` (`js/app.js:814`): `opening_balance + Σ(thu − chi) ± Σ(chuyển khoản)`. **KHÔNG sửa hàm này.**
- **Chuyển khoản = giao dịch `type='transfer'`** với `account_id` (ví nguồn) + `to_account_id` (ví đích). Đã bị loại khỏi tổng thu/chi (`js/app.js:501`, `js/app.js:659`). Modal transfer: `openTransfer()` (~L2522).
- **Dữ liệu "ai / khi nào" ĐÃ CÓ SẴN — KHÔNG cần đổi schema:**
  - Giao dịch tải bằng `select('*')` (`js/store.js:373`); `mapTransaction` (~L288) map sẵn `userId`, `date`, `time`, `accountId`, `toAccountId`, `createdAt`.
  - Helper **`memberName(uid)`** đã có (`js/app.js:450`) → tên người từ `user_id` (chính mình = `t('you')`, giao dịch cũ `null` = nhãn "chưa rõ").
- **Danh sách giao dịch đã render transfer đủ**: dòng transfer hiện `Từ A → B · <ngày giờ> · <người>` (`js/app.js:1474`); dòng thu/chi hiện `<category> · <ngày giờ> · <người>` (`js/app.js:1482`). Tái dùng đúng cách này cho màn lịch sử ví.
- **Điểm đặt nút:** dải ví ở Tổng quan render số dư mỗi ví (~L1547); trình sửa ví `walletEditRowHtml(acc)` (~L2201) hiện số dư `= …` (~L2203) và ô "đầu kỳ" `.w-open` (~L2217). **Giữ nguyên các phần này, chỉ THÊM nút.**
- `activity_log` (bảng + trigger) là nhật ký sửa/xoá **chỉ owner/admin** — nguồn cho audit "ai SỬA/XOÁ". Lịch sử ví thường ngày thì **dựng từ `transactions`** (mọi thành viên xem được). **Không đụng `activity_log`.**
- Tiền qua `fmtShort`/`fmtVND` (`js/charts.js`), ẩn số dư qua `mask()`, chống XSS qua `esc()`. i18n: object `I18N` trong `js/app.js` — **mọi chuỗi UI mới phải có cả `vi` và `en`.**

---

## PHẦN A — Schema (`supabase-schema.sql`)

**KHÔNG cần đổi schema.** Dữ liệu (`user_id`, `date`, `time`, `account_id`, `to_account_id`) đã đủ; không thêm bảng/cột; **không cần chạy lại `supabase-schema.sql`.**

Chỉ khai báo một **hằng category dành riêng** trong `js/app.js`:
```js
const ADJUST_CATEGORY = 'Điều chỉnh số dư'; // category cố định cho giao dịch điều chỉnh — KHÔNG phải chi tiêu thật
```

---

## PHẦN B — Tầng dữ liệu (`js/store.js`)

Không cần thay đổi. `select('*')` đã lấy đủ; `addTransaction` đã gán `user_id`, `date`, `time`. Giao dịch điều chỉnh đi qua `Store.addTransaction` như mọi giao dịch khác.

---

## PHẦN C — Logic & UI (`js/app.js`)

### C1. Nút "Đổi số dư" (giao dịch điều chỉnh — cách B)

**Điểm đặt nút** (thêm, không thay gì có sẵn):
1. Trong **trình sửa ví** (`walletEditRowHtml`, cạnh dòng số dư `= …` ~L2203): nút nhỏ icon bút chì "Đổi số dư".
2. (Tuỳ chọn) trên **dải ví ở Tổng quan** (~L1547): nút/icon nhỏ trên mỗi ví.

**Luồng `openAdjustBalance(id)`:**
1. Mở modal nhỏ (tái dùng `.modal-backdrop`/`.modal`): 1 input `js-money` **điền sẵn số dư hiện tại** `accountBalance(id)`, nhãn `t('realBalance')` ("Số dư thực tế"); có ghi chú ngắn "app sẽ ghi một khoản điều chỉnh cho phần chênh lệch".
2. Khi lưu: `delta = readMoney(input) − accountBalance(id)`. Nếu `delta === 0` → đóng, không tạo gì.
3. Tạo giao dịch qua `Store.addTransaction`:
   ```js
   {
     type: delta > 0 ? 'income' : 'expense',
     amount: Math.abs(delta),
     category: ADJUST_CATEGORY,
     accountId: id,
     date: ymd(new Date()),
     time: new Date().toTimeString().slice(0, 5),
     note: t('balanceAdjustNote'),
     rawInput: '',
   }
   ```
   `Store.addTransaction` tự gán `user_id` (ai chỉnh). → khoản điều chỉnh tự vào lịch sử ví với đủ "ai / khi nào".
4. `DATA.transactions.unshift(saved); close(); toast(t('balanceAdjusted'), 'success'); render();`

**Loại khỏi báo cáo thu/chi (BẮT BUỘC):** giao dịch `category === ADJUST_CATEGORY` là chỉnh kỹ thuật, KHÔNG phải thu/chi thật. Ở **mọi** nơi cộng tổng thu/chi (nơi đang bỏ qua `type==='transfer'` — `js/app.js:501`, `js/app.js:659`, và các hàm gộp báo cáo thu/chi / theo-người / theo-category), thêm điều kiện bỏ qua `tx.category === ADJUST_CATEGORY`. **TUYỆT ĐỐI KHÔNG** loại nó khỏi `accountBalance` (nó phải làm đổi số dư ví).

**Phân quyền:** chỉ owner/admin dùng nút này (theo phân quyền sửa ví hiện có). Ẩn nút với thành viên thường nếu UI đang ẩn các thao tác quản trị tương tự.

### C2. Màn "Lịch sử của ví"

Thêm `openWalletHistory(id)` mở **modal/drawer** liệt kê **mọi giao dịch ảnh hưởng tới ví này**, mới nhất trên cùng. Mỗi dòng trả lời: **bao nhiêu · hướng nào · ví đối ứng (nếu chuyển) · ai · khi nào · số dư sau**.

**Gom dữ liệu + số dư sau (running balance):**
```js
function walletHistory(id) {
  const acc = accountById(id);
  const rows = DATA.transactions.filter((tx) =>
    tx.accountId === id || (tx.type === 'transfer' && tx.toAccountId === id));
  rows.sort(byDateTimeAsc); // tăng dần theo (date, time, createdAt) để cộng dồn đúng
  let bal = acc ? (acc.openingBalance || 0) : 0;
  const out = rows.map((tx) => {
    let delta;
    if (tx.type === 'transfer') delta = tx.toAccountId === id ? tx.amount : -tx.amount; // đến +, đi −
    else delta = tx.type === 'income' ? tx.amount : -tx.amount;
    bal += delta;
    return { tx: tx, delta: delta, balanceAfter: bal };
  });
  return out.reverse(); // hiển thị giảm dần (mới nhất trước)
}
```

**Mỗi dòng hiển thị:**
- **Số tiền & màu:** `delta ≥ 0` → xanh `+fmtShort`, `< 0` → đỏ `−fmtShort`; luôn bọc `mask()`.
- **Nhãn / đối ứng:**
  - transfer **đi**: `→ <tên ví đích>`; transfer **đến**: `← <tên ví nguồn>` (dùng `accountById(...).name`, bọc `esc`).
  - thu/chi/điều chỉnh: `catLabel(tx.category)` (khoản điều chỉnh hiện đúng nhãn "Điều chỉnh số dư").
- **Ai:** `esc(memberName(tx.userId))`.
- **Khi nào:** `tx.date + (tx.time ? ' ' + tx.time : '')`.
- **Số dư sau:** `mask(fmtShort(balanceAfter))` (in nhạt, phụ) — cho người dùng lần theo biến động.
- Bấm một dòng → mở modal sửa tương ứng (`openTransfer(tx)` nếu transfer, ngược lại `openEdit(tx)`), tái dùng logic có sẵn.
- Đầu drawer: tên ví + **số dư hiện tại** lớn (`mask(fmtShort(accountBalance(id)))`), kèm nút **"Đổi số dư"** (C1) và **"Chuyển tiền"** (mở `openTransfer` với ví này chọn sẵn — tuỳ chọn).
- Danh sách rỗng → dòng `t('noWalletHistory')`.

**Điểm mở lịch sử:**
1. Bấm vào một ví ở **dải ví Tổng quan** (~L1547) → `openWalletHistory(a.id)` (thêm `cursor:pointer`).
2. Nút **"Lịch sử"** trong trình sửa ví.

### C3. i18n (thêm cả `vi` & `en`)

- `adjustBalance` — Đổi số dư / Adjust balance
- `realBalance` — Số dư thực tế / Actual balance
- `balanceAdjustNote` — Điều chỉnh số dư / Balance adjustment
- `balanceAdjusted` — Đã cập nhật số dư / Balance updated
- `walletHistory` — Lịch sử ví / Wallet history
- `balanceAfter` — Số dư sau / Balance after
- `noWalletHistory` — Ví chưa có giao dịch nào / No transactions in this wallet yet

---

## PHẦN D — CSS (`css/style.css`)

- Modal/drawer lịch sử ví: tái dùng `.modal-backdrop`/`.modal`; danh sách dòng tái dùng class dòng giao dịch (`.tx-*`) cho đồng nhất. Danh sách dài → `overflow:auto; max-height`.
- Số tiền căn phải; "số dư sau" in nhạt (secondary).
- Nút "Đổi số dư" nhỏ gọn (icon bút chì), tái dùng token màu/nút sẵn có. Ví bấm được ở Tổng quan → `cursor:pointer`. Không thêm thư viện.

---

## QUY TẮC CHUNG (bắt buộc)

1. **GIỮ NGUYÊN `accountBalance`** và cách hiển thị số dư hiện tại (kể cả ô "đầu kỳ"). Feature này **chỉ THÊM**, không bỏ/đổi gì đang có.
2. Nút "Đổi số dư" **PHẢI** tạo giao dịch điều chỉnh (cách B), **KHÔNG** sửa thẳng `opening_balance`.
3. Giao dịch điều chỉnh: **loại khỏi mọi tổng thu/chi báo cáo**, nhưng **vẫn tính vào số dư ví**.
4. Mọi số tiền qua `fmtShort`/`fmtVND`, bọc `mask()`; mọi chuỗi người dùng chèn qua `esc()`.
5. Mọi chuỗi UI mới có đủ `vi` + `en`.
6. Vanilla JS thuần, không framework, không build step, không thư viện mới.
7. Tôn trọng quyền: nút "Đổi số dư" chỉ owner/admin (RLS `accounts_write` / phân quyền hiện có).
8. KHÔNG cần chạy lại `supabase-schema.sql` (không đổi DB).

---

## KIỂM THỬ TAY

1. **Đổi số dư:** ví A đang 1,500,000, bấm "Đổi số dư" → điền 1,600,000 → tạo giao dịch income 100,000 "Điều chỉnh số dư"; số dư ví = 1,600,000. Điền đúng 1,500,000 → không tạo gì.
2. **Đổi giảm:** ví A 1,600,000 → điền 1,550,000 → tạo expense 50,000; số dư = 1,550,000.
3. **Không phá báo cáo:** sau 2 bước trên, "Thu nhập / Chi tiêu tháng này" **không đổi** vì khoản điều chỉnh bị loại; nhưng số dư ví thì đúng.
4. **Hoàn tác được:** xoá giao dịch điều chỉnh vừa tạo → ví về số cũ (chứng minh ledger còn nguyên).
5. **Lịch sử ví:** mở lịch sử ví A → thấy khoản điều chỉnh kèm **người + thời gian**; thấy transfer dạng `→ Ví B` / `← Ví B`; mỗi dòng có **số dư sau** đúng theo thứ tự thời gian.
6. **Ẩn số dư (mask) bật** → mọi số trong lịch sử ví & nút đổi số dư bị che.
7. **Đa thành viên:** thành viên khác thêm chi tiêu vào ví A ở máy khác → realtime cập nhật; lịch sử ví A hiện đúng "ai" là thành viên đó.

---

## KẾT QUẢ MONG ĐỢI

- ✅ Mỗi ví có nút **"Đổi số dư"**: gõ số dư thật → app tự ghi một **giao dịch điều chỉnh** (có người + thời gian, hoàn tác được), số dư về đúng ngay. Không làm sai lệch báo cáo thu/chi hay số dư các kỳ trước.
- ✅ Mỗi ví có màn **Lịch sử** đầy đủ: từng biến động — số tiền, hướng (đến/đi), ví đối ứng khi chuyển, **ai** thao tác, **khi nào**, và **số dư sau** mỗi lần.
- ✅ Giữ nguyên toàn bộ giao diện & mô hình số dư hiện tại; thuần bổ sung, không hồi quy.
- ✅ Không đổi schema, không chạy lại SQL; đồng bộ realtime, tôn trọng phân quyền & chế độ ẩn số dư.

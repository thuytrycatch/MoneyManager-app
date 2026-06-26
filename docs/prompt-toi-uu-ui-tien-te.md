# Prompt: Tối ưu UI — định dạng tiền quốc tế, người nhập & báo cáo theo người

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework; backend Supabase).

---

## PROMPT

Bạn là kỹ sư frontend làm việc trên app quản lý chi tiêu **BudgetManager** (HTML/CSS/JS thuần, đa hộ gia đình, backend Supabase). Thực hiện **3 nhóm thay đổi** dưới đây. Không phá vỡ logic nghiệp vụ; ưu tiên thay đổi tối thiểu, tập trung ở tầng hiển thị + một báo cáo mới.

---

### NHÓM 1 — Định dạng tiền kiểu quốc tế, BỎ ký hiệu ₫

**Mục tiêu:** số tiền hiển thị gọn theo chuẩn quốc tế (K / M / B), **không còn ký hiệu `₫`**.

1. **Bỏ hoàn toàn `₫`** khỏi UI. Tất cả call site đang nối `+ '₫'` (và `'₫ · '` trong charts) phải gỡ bỏ.

2. **Quy ước số kiểu quốc tế (en-US):** dấu **phẩy** phân tách hàng nghìn, dấu **chấm** thập phân.
   - `850000 → 850,000` · `12000 → 12,000` · `125000000 → 125,000,000`.
   - `1500000000 → 1.5B` · `2300000000 → 2.3B`.

3. **Ngưỡng rút gọn (chỉ số TRÊN 9 CHỮ SỐ mới viết tắt):**
   - `|n| ≤ 999,999,999` (đến 9 chữ số) → giữ ĐẦY ĐỦ chữ số: `850,000`, `125,000,000`.
   - `|n| ≥ 1,000,000,000` (trên 9 chữ số) → `B`: `1.5B`, `2.3B`.
   - Vì dưới 1 tỷ luôn hiện đầy đủ, `M`/`K` **chỉ còn dùng ở nhãn trục biểu đồ** (hàm `fmtAxis`) để tick không quá dài.

4. **~3 chữ số ý nghĩa** khi rút gọn, tự bỏ số 0 thừa (`1.50B → 1.5B`). Số âm: dấu `−` đứng trước, giữ màu/dấu income–expense hiện có.

**Triển khai (giữ tối thiểu):** mọi điểm gọi hiển thị tiền đi qua **`fmtShort(n)`** (`js/charts.js`); nhãn trục biểu đồ dùng **`fmtAxis(n)`** riêng → sửa 2 hàm là toàn UI cập nhật.

```js
// ~3 chữ số ý nghĩa, dấu CHẤM thập phân
function dec(v) {
  const av = Math.abs(v);
  let s = v.toFixed(av >= 100 ? 0 : av >= 10 ? 1 : 2);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
// Hiển thị chính: chỉ số ≥ 1 tỷ (trên 9 chữ số) mới rút gọn (B); còn lại đầy đủ.
function fmtShort(n) {
  n = Math.round(n || 0);
  if (Math.abs(n) >= 1e9) return dec(n / 1e9) + 'B';
  return n.toLocaleString('en-US');           // ≤ 9 chữ số: đầy đủ, phẩy ngăn nghìn
}
// Bản gọn riêng cho nhãn trục biểu đồ — giữ K/M/B để tick ngắn.
function fmtAxis(n) {
  n = Math.round(n || 0);
  const a = Math.abs(n);
  if (a >= 1e9) return dec(n / 1e9) + 'B';
  if (a >= 1e6) return dec(n / 1e6) + 'M';
  if (a >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
}
```

- `fmtVND(n)` (tooltip biểu đồ): số đầy đủ **không ký hiệu** → `new Intl.NumberFormat('en-US').format(Math.round(n||0))`.
- Nhãn trục Y của bars/line/lines dùng `fmtAxis`; tooltip dùng `fmtVND`; legend dùng `fmtShort`.
- Gỡ mọi `+ '₫'` / `'₫ · '` còn lại trong `js/app.js` và `js/charts.js`.

---

### NHÓM 2 — Hiển thị NGƯỜI NHẬP của mỗi giao dịch

**Không cần đổi schema** — cột `transactions.user_id` đã lưu người tạo giao dịch (xem `supabase-schema.sql:46`), và `store.addTransaction` đã gán `user_id` (`js/store.js:379, 408`).

Dữ liệu sẵn có trong `js/app.js`: `householdMembers = [{userId, email, role}]`, `currentUserId`, `currentUserEmail`, và i18n `t('you')`.

1. Thêm helper hiển thị tên người nhập:
   ```js
   function memberName(uid) {
     if (uid && uid === currentUserId) return t('you');           // 'bạn' / 'you'
     const m = householdMembers.find((x) => x.userId === uid);
     if (m && m.email) return m.email.split('@')[0];              // tên rút từ email
     return t('unknownMember');                                   // giao dịch cũ user_id = null
   }
   ```
2. Hiển thị tên người nhập trên **mỗi dòng giao dịch** (danh sách lịch sử) dưới dạng sub-label nhẹ, cạnh category/thời gian — ví dụ: `Ăn uống · 14:30 · An`. Dùng `esc()` để chống XSS.
3. (Nếu có màn chi tiết giao dịch) bổ sung trường "Người nhập".
4. Đảm bảo dữ liệu giao dịch tải về có kèm `user_id` (kiểm tra `select` trong `js/store.js`); nếu thiếu thì thêm `user_id` vào danh sách cột select.

---

### NHÓM 3 — BÁO CÁO THU CHI THEO TỪNG NGƯỜI

Thêm một mục báo cáo mới: tổng **thu** và **chi** theo từng thành viên, trong kỳ đang xem (tôn trọng bộ lọc tháng/khoảng thời gian hiện hành của trang báo cáo).

1. **Gom dữ liệu:** group các giao dịch theo `user_id`, mỗi người tính `income` (tổng type=income), `expense` (tổng type=expense), `net = income − expense`. Giao dịch `user_id = null` gom vào nhóm `t('unknownMember')`.
2. **Hiển thị:** một thẻ/danh sách trong trang Báo cáo, mỗi hàng:
   `[tên người]  thu: <fmtShort> · chi: <fmtShort> · ròng: <fmtShort>` — dùng màu xanh/đỏ như phần tổng quan thu–chi hiện có; sắp xếp giảm dần theo tổng chi (hoặc theo ròng).
3. Có thể thêm **biểu đồ cột** so sánh chi tiêu giữa các thành viên (tái dùng Chart.js trong `js/charts.js`).
4. Áp dụng đúng định dạng tiền ở Nhóm 1 (không `₫`).

---

### Review UI kèm theo (báo lại, sửa nếu đơn giản)
1. Không còn sót `₫`, `tr`, `tỷ`, `k` cũ ở bất kỳ đâu trên UI.
2. Số hàng tỷ (`12.4B`) không vỡ layout ở mobile (tile số dư, hero-chip, wallet-bal).
3. `mask()` (`js/app.js:380`) vẫn ẩn đúng `••••••` sau khi đổi định dạng.
4. Số tiền căn phải trong danh sách giao dịch để dễ so sánh.
5. Tên người nhập dài (email) không tràn dòng giao dịch.

### Tiêu chí nghiệm thu
- [ ] `850000 → 850,000` · `125000000 → 125,000,000` · `999999999 → 999,999,999` (đầy đủ) · `1500000000 → 1.5B` · `2300000000 → 2.3B`, **không có `₫`** ở bất kỳ đâu.
- [ ] Tooltip biểu đồ hiện số đầy đủ kiểu `1,234,567` (không ký hiệu).
- [ ] Mỗi dòng giao dịch hiện tên người nhập; chính mình hiện `bạn`/`you`; giao dịch cũ hiện nhãn "chưa rõ".
- [ ] Trang Báo cáo có mục "thu chi theo người" với thu/chi/ròng đúng cho từng thành viên trong kỳ.
- [ ] `mask()`, màu/dấu income–expense, và các bộ lọc kỳ báo cáo vẫn hoạt động như cũ.

---

### Ghi chú quyết định (đã chốt với người dùng)
- **Bỏ ký hiệu ₫**, định dạng **quốc tế en-US** (phẩy ngăn nghìn, chấm thập phân). *Nếu muốn dấu phẩy thập phân kiểu Việt (`1,5B`) thì đổi `dec()` trả về `s.replace('.', ',')`.*
- Ngưỡng: **chỉ số trên 9 chữ số (≥ 1 tỷ) mới rút gọn thành `B`**; mọi số ≤ 9 chữ số giữ đầy đủ chữ số. `M`/`K` chỉ còn ở nhãn trục biểu đồ (`fmtAxis`).
- "Người nhập" lấy từ `transactions.user_id` (không đổi schema); báo cáo theo người group theo `user_id`.

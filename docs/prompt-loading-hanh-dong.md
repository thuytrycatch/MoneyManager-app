# Prompt: LOADING KHI CHỜ SERVER — feedback tức thì + chống double-submit cho mọi hành động async

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; PWA).
>
> Triết lý: **một helper duy nhất, quét toàn bộ handler** — không viết lại UI, không thêm thư viện, không skeleton screen. Vấn đề thật sự cần giải: (1) người dùng bấm nút gọi server mà **không có phản hồi gì** cho tới khi toast hiện, (2) trên mạng chậm có thể **bấm đúp → tạo bản ghi trùng** (vd 2 giao dịch giống nhau). Repo đã có 5 chỗ tự chế pattern `btn.disabled = true; btn.innerHTML = …` — hợp nhất chúng luôn.

---

## MỤC TIÊU

1. **Mọi nút bấm** kích hoạt một thao tác chờ server (mọi chỗ `await window.Store.*` và các call AI/parser) phải: **disable ngay lập tức + hiện spinner** trong lúc chờ, **khôi phục** khi xong/lỗi.
2. **Chống double-submit**: bấm lần 2 khi đang chờ = no-op. Đây là bug thật (mạng chậm → 2 giao dịch trùng), không chỉ là thẩm mỹ.
3. Hợp nhất 5 pattern ad-hoc sẵn có về **một helper dùng chung**.
4. Không đổi hành vi hiện tại: vẫn `toast(...)` khi lỗi, vẫn `render()` khi thành công, vẫn `confirm()` trước hành động xóa.

### QUYẾT ĐỊNH THIẾT KẾ CỐT LÕI (đọc kỹ, đừng làm khác)

- **Một helper duy nhất `busy(btn, fn)`** (async). KHÔNG rải `disabled = true/false` thủ công ở từng handler nữa.
- **Spinner bằng CSS, không đổi text nút** → không giật layout, không cần chuỗi i18n mới. Tái dùng `@keyframes spin` đã có (`css/style.css` ~L55, đang dùng cho `.spinner` L54 và `#refreshBtn.spinning` L92).
- **Chịu được nút bị gỡ khỏi DOM**: nhiều handler gọi `render()` khi thành công → nút cũ bị thay. Helper phải khôi phục trong `finally` mà **không crash** khi nút đã detached (thao tác trên element cũ vô hại, chỉ đừng ném lỗi).
- **Phạm vi = nút hành động.** KHÔNG thêm overlay/skeleton cho việc tải view: khởi động đã có `#loading` (style.css L52), refresh đã có `#refreshBtn.spinning`, đồng bộ nền đã có `setStatus` (`js/app.js` ~L1066), activity log đã có `activityLoading` (~L492). Đừng đụng vào các cơ chế đó.
- **Vanilla JS thuần**, không thư viện, không build step.

---

## BỐI CẢNH REPO (đọc trước khi code)

### Cơ chế feedback sẵn có — `js/app.js`
- `toast(msg, kind)` (~L1058) — thông báo nổi; `setStatus(text, kind)` (~L1066) — dòng trạng thái đồng bộ (đang dùng cho add-flow: `saving`/`uploading`/`synced` ~L1124–1141). **Giữ nguyên**, helper mới bổ sung chứ không thay thế.
- 5 pattern ad-hoc cần **thay bằng helper**:
  1. Nút parse/Thêm (~L1073–1081): `btn.disabled = true; btn.textContent = '…'` rồi khôi phục.
  2. Nút thêm ảnh (~L1490–1511): disable + `icon('clock') + t('uploading')`.
  3. Nút quét OCR (~L1566–1594): disable + `t('scanning')`.
  4. Nút "Tạo nhận xét AI" trong modal chốt sổ (~L2400–2406).
  5. Nút "Chốt sổ/Lưu" trong modal chốt sổ (~L2416–2422).
- `icon(name)` (~L76) trả SVG; nút thường có dạng `icon(..) + '<span>text</span>'`.

### CSS sẵn có — `css/style.css`
- `@keyframes spin` (L55); `.spinner` 44px cho màn hình khởi động (L54); `#refreshBtn.spinning .ic { animation: spin .8s linear infinite; }` (L92). Tái dùng keyframes, thêm class mới cho nút.

### Danh sách handler async cần quét (mọi chỗ `await window.Store.*` trong `js/app.js`)
Vị trí ~dòng (grep lại cho chính xác trước khi sửa):

| Nhóm | Handler / dòng |
|---|---|
| Giao dịch | thêm từ recurring L856–867 · add-flow L1127–1128 (đã có pattern riêng, thay bằng helper) · xóa L1173, L1265 · sửa L3248 |
| Ảnh hóa đơn | xóa attachment L1470 · upload L1499–1500, L1606–1607 (thay pattern riêng) |
| Chốt sổ | lưu snapshot L2418 (thay pattern riêng) |
| Ví | chuyển ví L3078–3081 · điều chỉnh số dư L3118 · lưu ví L3463–3476 · xóa ví L3494 |
| Ngân sách | lưu budgets L3345 |
| Mục tiêu / Định kỳ | xóa/lưu goal L3539–3554 · xóa/lưu recurring L3571–3587 |
| Hộ & thành viên | lưu AI settings L3605 · đổi tên hộ L3629 · nhập hộ L3645 · xóa/đổi vai trò/chuyển chủ L3654–3686 · đổi hộ L3694 |
| Auth | đăng ký/đăng nhập L3855–3859 · đăng xuất L3035 |

**KHÔNG bọc**: `loadData`/`getCachedData`/`listMembers` lúc khởi động (đã có `#loading`), `refreshAll` (~L3955–3969, đã có `#refreshBtn.spinning` + `setStatus`), `listActivity` (~L2769, đã có `activityLoading`), `refreshGoldPrices` (chạy nền), các thao tác thuần local (đổi tab, mask, filter…).

---

## PHẦN A — Helper `busy(btn, fn)` (`js/app.js`, đặt cạnh `toast`/`setStatus` ~L1058)

```js
// Bọc một hành động async gắn với nút: disable + spinner khi chờ, khôi phục khi
// xong. Chống double-submit (đang chạy → bấm thêm = no-op). Chịu được việc nút
// bị render() thay mất trước khi finally chạy (thao tác trên node cũ vô hại).
async function busy(btn, fn) {
  if (!btn) return fn();                 // gọi không có nút → chạy trần
  if (btn.dataset.busy) return;          // đang chạy → nuốt click
  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.classList.add('btn-busy');
  btn.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } finally {
    delete btn.dataset.busy;
    btn.disabled = false;
    btn.classList.remove('btn-busy');
    btn.removeAttribute('aria-busy');
  }
}
```

Cách dùng trong handler (giữ nguyên logic try/catch/toast/render sẵn có, chỉ bọc ngoài):

```js
b.addEventListener('click', () => busy(b, async () => {
  try {
    await window.Store.deleteAccount(id);
    toast(t('walletDeleted'), 'info'); render();
  } catch (err) { toast(t('syncError') + ': ' + err.message, 'error'); }
}));
```

- Với form `submit`: lấy nút submit của form (`form.querySelector('button[type=submit]')` hoặc nút đã có sẵn trong closure) rồi bọc y hệt.
- Với 3 pattern ad-hoc có đổi text (`uploading`/`scanning`/`closeGenerating`): **giữ phần đổi text nếu nó có giá trị thông tin** (vd "Đang quét…"), nhưng chuyển phần disable/khôi phục/chống bấm đúp sang `busy()` — tức là bên trong `fn` vẫn được swap `innerHTML`, còn helper lo vòng đời. Đơn giản nhất: những nút text tĩnh chỉ cần `busy()` + CSS spinner; những nút có text tiến trình thì bọc `busy()` và tự đổi text bên trong.

---

## PHẦN B — CSS (`css/style.css`, đặt cạnh `#refreshBtn.spinning` ~L92)

```css
/* Nút đang chờ server: mờ + spinner nhỏ chèn trước label, không giật layout. */
button.btn-busy { opacity: .65; pointer-events: none; position: relative; }
button.btn-busy .ic { display: none; }              /* icon nhường chỗ spinner */
button.btn-busy::before {
  content: ''; display: inline-block; width: 14px; height: 14px;
  margin-right: 6px; vertical-align: -2px; border-radius: 50%;
  border: 2px solid currentColor; border-top-color: transparent;
  animation: spin .8s linear infinite;
}
```

- Nút chỉ-có-icon (không label, vd nút xóa ảnh): `::before` thay icon là đủ vì `.ic` đã ẩn.
- Tôn trọng dark/light theme sẵn có (dùng `currentColor`, không hardcode màu).

---

## PHẦN C — Quét & thay thế

1. Grep toàn bộ `await window.Store.` trong `js/app.js`, đối chiếu bảng ở BỐI CẢNH. Với **từng** handler là click/submit của người dùng: bọc `busy(nút, …)`.
2. Xóa 5 pattern ad-hoc (L1073, L1490, L1566, L2400, L2416) — thay bằng helper, hành vi hiển thị giữ nguyên hoặc tốt hơn.
3. Nút xóa có `confirm()`: gọi `confirm()` **trước** khi vào `busy()` (không spinner khi đang hỏi).
4. Kiểm tra chuỗi hành động kép (vd lưu giao dịch rồi upload ảnh L1127–1131): một lần `busy()` bao cả chuỗi, `setStatus` bên trong giữ nguyên.

---

## QUY TẮC CHUNG (bắt buộc)

1. **Một helper duy nhất** — không còn chỗ nào tự set `disabled`/khôi phục thủ công cho vòng đời loading.
2. Helper phải **an toàn khi nút bị `render()` thay** giữa chừng (không throw trong `finally`).
3. **Không** thêm thư viện/spinner overlay toàn màn hình/skeleton; không đụng `#loading`, `#refreshBtn`, `setStatus`, `activityLoading`.
4. Không cần chuỗi i18n mới (spinner là đủ); nếu giữ text tiến trình thì dùng key i18n **đã có** (`uploading`, `scanning`, `closeGenerating`).
5. Không đổi logic nghiệp vụ: thứ tự `confirm()` → gọi Store → `toast` → `render()` giữ nguyên.
6. Vanilla JS thuần, code style khớp file hiện tại (không semicolon-less, không arrow lồng khó đọc quá mức hiện có).

---

## TEST TAY

Mở DevTools → Network → throttle **Slow 3G** để mọi call chậm hẳn:

1. **Thêm giao dịch** → bấm "Lưu" rồi bấm đúp liên tiếp → nút disable + spinner, **chỉ 1 giao dịch** được tạo.
2. **Chuyển ví / điều chỉnh số dư / sửa giao dịch** (các modal) → nút lưu spinner khi chờ; lỗi (tắt mạng) → toast lỗi + **nút khôi phục lại bấm được**, modal không kẹt.
3. **Xóa ví/giao dịch/mục tiêu/định kỳ** → confirm trước, spinner sau, thành công → view render lại, không lỗi console (nút cũ đã bị thay).
4. **Quét OCR / thêm ảnh** → hành vi hiển thị như cũ (text "Đang quét…"/"Đang tải lên…"), bấm đúp không tạo 2 lần upload.
5. **Cài đặt hộ**: lưu AI settings, đổi tên hộ, mời/xóa thành viên, đổi vai trò → từng nút có spinner riêng, các nút khác không bị khóa oan.
6. **Đăng nhập/đăng ký** mạng chậm → nút disable, không submit đúp.
7. Tắt throttle → mọi thao tác nhanh vẫn mượt, spinner chớp qua không gây giật layout (so chiều rộng nút trước/sau).

---

## KẾT QUẢ MONG ĐỢI

- ✅ Mọi hành động chờ server có phản hồi thị giác **ngay khi bấm** (disable + spinner), khôi phục đúng khi xong/lỗi.
- ✅ **Hết bug double-submit** trên mạng chậm (giao dịch trùng, upload trùng…).
- ✅ 5 pattern ad-hoc hợp nhất về 1 helper `busy()`; codebase sạch hơn chứ không phình ra.
- ✅ Không thư viện mới, không giật layout, tôn trọng theme + i18n sẵn có.

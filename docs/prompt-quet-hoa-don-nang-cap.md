# Prompt: Nâng cấp QUÉT HOÁ ĐƠN — chính xác hơn, nhanh hơn, chọn ảnh từ thư viện, + phóng to ảnh & sửa nút Close

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; web tĩnh chạy trên GitHub Pages).
>
> Đây là **bản nâng cấp Phase 2 (OCR hoá đơn)** đã có từ v1.13.x. Triết lý: **thay đổi tối thiểu, không phá luồng nhập/đính ảnh hiện tại.** Người dùng LUÔN xác nhận trước khi lưu.

---

## Bạn là ai (vai trò khi thực thi)

Bạn là **chuyên gia lập trình Front-end** (vanilla JS thuần, không build step), nắm chắc cách gọi Gemini & Claude API trực tiếp từ trình duyệt. Mục tiêu: làm OCR hoá đơn **đọc đúng số tiền phải trả**, **nhanh hơn**, và **cho chọn ảnh từ thư viện** chứ không chỉ chụp.

---

## BỐI CẢNH REPO (đọc trước khi code)

- OCR hoá đơn nằm ở `js/parser.js`:
  - `OCR_PROMPT` (chuỗi prompt gửi model).
  - `parseImageWithGemini(blob, apiKey)` — model hiện tại `gemini-2.5-flash`, `generationConfig: { temperature: 0, responseMimeType: 'application/json' }`.
  - `parseImageWithClaude(blob, apiKey)` — model `claude-haiku-4-5`.
  - `parseImageReceipt(blob)` — dispatcher Gemini → Claude (không có regex fallback).
  - `normalizeParsed(parsed, raw)` (~L181) — chuẩn hoá kết quả model về `{amount, type, category, note, date}`.
  - `extractJson(text, who)` — bóc JSON đầu tiên từ text trả về.
  - `parseAmount(raw)` (~L56) — bộ parse số tiền tiếng Việt cho fallback regex (k/triệu/rưỡi…).
  - Export: `parseImageReceipt`, `imageOcrAvailable`, …
- UI ở `js/app.js`:
  - `renderAddPhotos()` — picker ảnh ở tab **Thêm**; có `<input type="file" id="addPhotoFile" accept="image/*" capture="environment" multiple hidden/>` và nút **"Quét hoá đơn"** gọi `scanFirstReceipt(btn)`.
  - `fillEvidenceBox(tx)` — picker ảnh trong modal Sửa; có `<input type="file" id="attachFile" accept="image/*" capture="environment" multiple hidden/>`.
  - `scanFirstReceipt(btn)` — nén ảnh (`compressImage`) → `Parser.parseImageReceipt` → `buildDraft` → `openEntryPreview([draft], …)`.
  - `compressImage(file, maxDim=1600, quality=0.82)` — canvas → JPEG.
- i18n: object `I18N` trong `js/app.js` (key VI ~L60+, EN ~L260+). **Mọi chuỗi UI mới phải có cả `vi` và `en`.**

---

## LỖI HIỆN TẠI — PHẢI SỬA (root cause)

1. **`normalizeParsed` parse sai số tiền đã định dạng.** Hiện dùng `Math.round(Number(parsed.amount) || 0)`. Nếu model trả số dạng chuỗi tiếng Việt:
   - `Number("185.000")` → **185** (coi `.` là dấu thập phân) → SAI (đáng lẽ 185000).
   - `Number("1.234.000")` → **NaN** → 0 → SAI.
   ⇒ Bắt buộc **sanitize**: bỏ mọi ký tự không phải chữ số trước khi `Number`. Thêm helper dùng chung:
   ```js
   // Số tiền VND nguyên từ number HOẶC chuỗi đã định dạng ("1.234.000", "185,000", "12.000đ").
   function toIntAmount(v) {
     if (typeof v === 'number' && isFinite(v)) return Math.round(v);
     const digits = String(v == null ? '' : v).replace(/[^\d]/g, '');
     return digits ? parseInt(digits, 10) : 0;
   }
   ```
   Dùng `toIntAmount(parsed.amount)` trong `normalizeParsed` (giữ nguyên hành vi cho parse văn bản — số văn bản đã là integer nên không ảnh hưởng).

2. **Model nhầm "tiền khách đưa" với "số tiền phải trả".** Đây là yêu cầu chính của người dùng: phải dựa vào **TỔNG SỐ TIỀN KHÁCH GỬI** (tiền khách đưa) và **SỐ TIỀN THỰC PHẢI TRẢ** (thành tiền/tổng cộng) để chọn đúng. Hiện prompt chỉ "đừng lấy tiền khách đưa" → chưa đủ chắc. ⇒ chuyển sang **trích nhiều trường + đối chiếu** (PHẦN A).

---

## PHẦN A — Nhận diện CHÍNH XÁC hơn (trích nhiều trường + cross-check)

### A1. OCR trả về JSON giàu hơn (không chỉ `amount`)
Đổi `OCR_PROMPT` để model trả các trường (đơn vị VND, số nguyên):
```json
{
  "total":     number,        // SỐ TIỀN THỰC PHẢI TRẢ (THÀNH TIỀN / TỔNG CỘNG / TỔNG THANH TOÁN / KHÁCH PHẢI TRẢ)
  "tendered":  number | null, // TỔNG TIỀN KHÁCH GỬI/ĐƯA (TIỀN KHÁCH ĐƯA / TIỀN MẶT / KHÁCH TRẢ)
  "change":    number | null, // TIỀN THỐI LẠI (TIỀN THỐI / TRẢ LẠI / THỪA)
  "subtotal":  number | null, // TẠM TÍNH
  "tax":       number | null, // THUẾ/VAT
  "type":      "expense" | "income",
  "category":  string,        // [Ăn uống, Di chuyển, Mua sắm, Giải trí, Sức khỏe, Hóa đơn, Thu nhập, Khác]
  "note":      string,        // tên cửa hàng/mô tả ngắn (tiếng Việt)
  "date":      string | null  // "YYYY-MM-DD" nếu có trên hoá đơn
}
```
Yêu cầu trong prompt:
- Liệt kê **nhãn tiếng Việt** cho từng trường (như trên) để model bắt đúng dòng.
- **`total` = số tiền thực phải trả** — TUYỆT ĐỐI không phải `tendered`/`change`.
- Mọi số là **số nguyên VND, không dấu phân cách** ("185000" chứ không "185.000").
- Trường không thấy → `null`.
- Chỉ trả JSON, không giải thích.

### A2. Hàm chọn & đối chiếu (`pickReceiptAmount`)
Thêm logic chọn `amount` cuối cùng từ các trường (sau khi đã `toIntAmount` mọi số):
```
1. amount = total (nếu total > 0).
2. Nếu total trống/0 nhưng có tendered & change hợp lệ → amount = tendered − change.
3. Cross-check: nếu có cả total, tendered, change mà |(tendered − change) − total| nhỏ (≤ 1000đ sai số làm tròn) → tin total.
   Nếu lệch LỚN → vẫn ưu tiên total (dòng "TỔNG CỘNG/THÀNH TIỀN"), nhưng đánh dấu cờ `lowConfidence=true`.
4. TUYỆT ĐỐI không trả tendered làm amount.
5. amount ≤ 0 → giữ 0 (để UI nhắc nhập tay), không tự bịa.
```
Trả về `{ amount, type, category, note, date, _candidates: {total, tendered, change, subtotal, tax}, _lowConfidence }`. Các field `_*` chỉ dùng để hiển thị/đối chiếu ở UI (PHẦN C2), không lưu DB.

### A3. Gemini structured output (chắc & nhanh hơn parse)
Trong `parseImageWithGemini`, thêm `responseSchema` vào `generationConfig` để **ép đúng kiểu** (total/tendered/change là INTEGER) → JSON luôn hợp lệ, không cần dò regex, ít lỗi parse:
```js
generationConfig: {
  temperature: 0,
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'OBJECT',
    properties: {
      total: { type: 'INTEGER' }, tendered: { type: 'INTEGER', nullable: true },
      change: { type: 'INTEGER', nullable: true }, subtotal: { type: 'INTEGER', nullable: true },
      tax: { type: 'INTEGER', nullable: true },
      type: { type: 'STRING', enum: ['expense', 'income'] },
      category: { type: 'STRING' }, note: { type: 'STRING' }, date: { type: 'STRING', nullable: true },
    },
    required: ['total', 'type', 'category', 'note'],
  },
}
```
> Claude: giữ nguyên cách prompt + `extractJson` (hoặc dùng tool/structured nếu muốn, không bắt buộc). `normalizeParsed`/hàm chuẩn hoá phải xử lý CHUNG cả 2 nguồn theo A1–A2.

### A4. Cập nhật `normalizeParsed` cho OCR
- Cho phép `normalizeParsed` (hoặc tách riêng `normalizeReceipt(parsed)`) nhận JSON giàu trường ở A1, chạy `toIntAmount` + `pickReceiptAmount`, rồi trả shape chuẩn `{amount, type, category, note, date}` (+ `_candidates`, `_lowConfidence` cho OCR). Giữ `normalizeParsed` cũ cho luồng văn bản hoạt động như cũ (chỉ thêm `toIntAmount`).

---

## PHẦN B — NHANH hơn

1. **Nén riêng cho OCR (nhỏ hơn bản lưu evidence).** Hoá đơn chủ yếu là chữ → cạnh dài **~1280px**, `quality ~0.7` là đủ đọc, giảm đáng kể dung lượng upload + token. Tách tham số:
   - Lưu evidence: giữ `compressImage(file, 1600, 0.82)` như cũ.
   - OCR: gọi `compressImage(file, 1280, 0.7)` cho riêng lần quét (ảnh nhỏ hơn ⇒ upload & xử lý nhanh hơn).
   - (Tuỳ chọn) chuyển grayscale khi vẽ canvas cho bản OCR để nhẹ thêm — chỉ làm nếu không giảm độ chính xác trên test.
2. **Structured output (A3)** vừa chính xác vừa nhanh: loại bỏ vòng retry parse JSON.
3. `max_tokens`/output giữ nhỏ (256 đủ cho JSON). Không tăng.
4. **KHÔNG** thêm thư viện, không tải model client-side.

---

## PHẦN C — Cho phép CHỌN ẢNH TỪ THƯ VIỆN (không chỉ chụp)

### C1. Gỡ ép-camera
Hiện cả 2 input ảnh đều có `capture="environment"` → trên mobile **ép mở camera**, không chọn được ảnh có sẵn.
- **Sửa tối thiểu:** bỏ thuộc tính `capture` ở `#addPhotoFile` (trong `renderAddPhotos`) **và** `#attachFile` (trong `fillEvidenceBox`). Khi đó iOS/Android hiện bộ chọn **Chụp ảnh / Thư viện / Chọn tệp**.
- **UX rõ ràng hơn (khuyến nghị):** tách **2 nút**:
  - 🖼 **"Chọn từ thư viện"** → input `accept="image/*"` **không** `capture`.
  - 📷 **"Chụp ảnh"** → input `accept="image/*" capture="environment"`.
  Dùng chung handler thêm-ảnh hiện có (`pendingAddFiles` ở Add page, `attachFile` ở modal Sửa). Giữ `multiple` cho nút thư viện.

### C2. (Tuỳ chọn) Hiển thị đối chiếu trong sheet xác nhận
Trong `openEntryPreview`/`scanFirstReceipt`, nếu có `_candidates`, thêm 1 dòng hint nhỏ dưới ô số tiền:
`Phải trả: <total> · Khách đưa: <tendered> · Thối: <change>` (bọc `fmtShort`), và nếu `_lowConfidence` → badge cảnh báo "kiểm tra lại số tiền". Giúp người dùng thấy ngay model có nhầm "tiền khách đưa" không.

### C3. i18n (vi + en)
Thêm key nếu làm 2 nút: `chooseFromLibrary` (Chọn từ thư viện / Choose from library), `takePhoto` (đã có `takePhoto` — kiểm tra, tái dùng). Cộng `amountToPay` (Phải trả), `amountTendered` (Khách đưa), `amountChange` (Tiền thối), `checkAmount` (Kiểm tra lại số tiền) nếu làm C2.

---

## PHẦN E — Xem ảnh: PHÓNG TO (zoom) + SỬA lỗi nút Close

Lightbox xem ảnh là `openAttachmentViewer(txId, startIdx)` trong `js/app.js` (mở từ badge 📎 trên dòng giao dịch và từ thumbnail trong modal Sửa). Hiện có nút `#lbClose` (×) + nút ‹ › + `#lbImg`.

### E1. SỬA lỗi: bấm nút × không đóng được (ưu tiên)
Các nguyên nhân khả dĩ — xử lý hết:
1. **iPhone (`viewport-fit=cover`)**: `.lightbox-close` đặt `top: 14px` → lọt **dưới notch / status bar (safe-area)** nên khó/không chạm được. Sửa CSS:
   `top: calc(env(safe-area-inset-top, 0px) + 14px);` và đảm bảo vùng chạm ≥ **44×44px**, `z-index` cao hơn ảnh và lớp zoom.
2. **Tap trúng `<svg>`/`<path>` con bên trong nút** → dùng handler **uỷ quyền** trên backdrop thay vì chỉ gắn vào nút:
   ```js
   wrap.addEventListener('click', (e) => {
     if (e.target === wrap || (e.target.closest && e.target.closest('#lbClose'))) close();
   });
   ```
   (Giữ thêm listener trực tiếp trên `#lbClose` cũng được; quan trọng là `closest('#lbClose')` bắt được tap vào icon con.)
3. Nút dùng `type="button"`; `#lbClose`, `#lbPrev`, `#lbNext` phải nằm **trên** (z-index) lớp ảnh/pan để cử chỉ zoom không che mất.
4. **Esc / bấm nền** vẫn đóng (giữ nguyên). Kiểm tra `close()` thực sự gỡ `#lightbox` **và** gỡ listener `keydown`.

### E2. Thêm PHÓNG TO ảnh (vanilla, không thư viện)
Áp `transform: translate(x,y) scale(s)` lên `#lbImg` (hoặc 1 wrapper bọc ảnh). Giới hạn `s` trong **1×–5×**; giới hạn pan trong biên ảnh; mặc định 1× (vừa khung).
- **Mobile:**
  - **Pinch-to-zoom**: theo dõi 2 điểm chạm (`touchstart/touchmove`), tính khoảng cách → cập nhật `scale` (zoom quanh trung điểm 2 ngón).
  - **Double-tap**: toggle 1× ↔ ~2.5× tại điểm chạm.
  - **Một ngón kéo**: pan khi `scale > 1`.
- **Desktop:**
  - **Cuộn chuột (wheel)**: zoom quanh con trỏ.
  - **Kéo chuột**: pan khi đã zoom. **Double-click**: toggle zoom.
- **Reset** zoom & pan khi: đổi ảnh (‹ ›/phím mũi tên) và khi đóng.
- Khi `scale > 1`, vuốt ngang dùng để **pan** (không chuyển ảnh) — điều hướng ảnh dùng nút ‹ › hoặc phím; tránh xung đột cử chỉ.
- CSS: ảnh `touch-action: none` (để tự xử lý cử chỉ) + `will-change: transform`; **nhưng** `#lbClose`/`#lbPrev`/`#lbNext` nằm ngoài vùng ảnh và `z-index` cao hơn → cử chỉ trên ảnh **không** được `preventDefault` nuốt mất tap của các nút. Chỉ `preventDefault` trên chính phần tử ảnh/lớp pan.
- Giữ nhẹ, mượt; không thêm thư viện, không build step.

### E3. i18n (vi + en)
Thêm nếu cần: `zoomIn`/`zoomOut`/`resetZoom` (nếu làm nút zoom rời — tuỳ chọn; pinch/wheel là chính). Không bắt buộc nếu chỉ dùng cử chỉ.

---

## QUY TẮC CHUNG (bắt buộc)
1. **Sửa bug số tiền trước tiên** (`toIntAmount`) — đây là lỗi đang gặp.
2. Vanilla JS thuần, không thêm framework/thư viện/build step.
3. Mọi chuỗi UI có đủ `vi` + `en`. Mọi số tiền hiển thị qua `fmtShort`/`fmtVND` + bọc `mask()` nếu nằm trong chỗ tôn trọng ẩn số dư (sheet nhập thì không cần mask).
4. Người dùng **luôn xác nhận** ở `openEntryPreview` trước khi lưu — không bao giờ tự lưu từ OCR.
5. Không phá luồng đính ảnh/evidence: ảnh đã quét vẫn được đính vào giao dịch khi lưu (cơ chế `attachPendingTo` giữ nguyên).
6. OCR vẫn fallback Gemini → Claude; không key → nút báo cần key (giữ nguyên `imageOcrAvailable`).
7. `amount` luôn là **số nguyên VND đã sanitize**; không lấy `tendered`/`change` làm amount.

## Kiểm thử tay (bắt buộc)
- Hoá đơn có **"Thành tiền 185.000 — Tiền khách đưa 200.000 — Tiền thối 15.000"** → amount = **185.000** (KHÔNG phải 200.000). Hint hiển thị đủ 3 số.
- Hoá đơn chỉ có **"TỔNG CỘNG 1.234.000"** → amount = **1.234.000** (không bị NaN→0).
- Model trả `total` dạng chuỗi `"1.234.000"` / `"185,000"` / `"12.000đ"` → `toIntAmount` ra đúng `1234000 / 185000 / 12000`.
- Thiếu `total` nhưng có `tendered 500.000` & `change 120.000` → amount = **380.000**.
- **iOS Safari & Android Chrome:** ở tab Thêm và modal Sửa, có thể **chọn ảnh từ thư viện** (không bị ép mở camera); nút Chụp vẫn mở camera.
- Quét lại nhanh hơn rõ rệt với ảnh hoá đơn lớn (bản OCR ~1280px).
- Không có key → nút "Quét hoá đơn" báo cần API key; nhập tay vẫn chạy.
- **Lightbox:** bấm nút **× đóng được trên cả iPhone (có notch) lẫn Android & desktop**; bấm nền/Esc cũng đóng.
- **Zoom:** trên mobile **pinch + double-tap** phóng to/thu nhỏ, kéo để pan; desktop cuộn chuột/double-click để zoom; đổi ảnh hoặc đóng thì reset về 1×; khi đang zoom, nút × và ‹ › vẫn bấm được.

## KẾT QUẢ MONG ĐỢI
- ✅ Đọc **đúng số tiền phải trả** nhờ trích nhiều trường (total/tendered/change) + đối chiếu; không còn nhầm "tiền khách đưa".
- ✅ Sửa lỗi `Number()` làm hỏng số đã định dạng (`toIntAmount`).
- ✅ Nhanh hơn: ảnh OCR nhỏ hơn + Gemini structured output (`responseSchema`).
- ✅ **Chọn ảnh từ thư viện** (hoặc chụp) ở cả màn Thêm lẫn modal Sửa.
- ✅ (Tuỳ chọn) sheet xác nhận hiện đối chiếu phải trả / khách đưa / thối để người dùng soát nhanh.
- ✅ **Sửa lỗi nút × không đóng** (an toàn cho iPhone notch) + **phóng to/zoom ảnh** (pinch/double-tap/cuộn) khi xem bằng chứng.
- ✅ Giữ nguyên: xác nhận trước khi lưu, tự đính ảnh làm bằng chứng, fallback Gemini→Claude, vi+en.

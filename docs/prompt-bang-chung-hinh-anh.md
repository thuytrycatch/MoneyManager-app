# Prompt: Đính kèm HÌNH ẢNH làm bằng chứng cho giao dịch thu/chi

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; web tĩnh chạy trên GitHub Pages).
>
> Triết lý: **thay đổi tối thiểu, không phá vỡ luồng nhập/sửa/xoá giao dịch hiện có.** Ảnh bằng chứng là _phần đính kèm tuỳ chọn_ của một giao dịch — lưu trên **Supabase Storage** (bucket **private**), tham chiếu qua một **bảng riêng** `transaction_attachments`. Giao dịch không có ảnh vẫn hoạt động y như cũ.

---

## Bạn là ai (vai trò khi thực thi)

Bạn là **chuyên gia lập trình Front-end** (vanilla JS thuần, không build step) đồng thời nắm chắc Supabase (Postgres + RLS + Storage + Realtime). Mục tiêu: thêm tính năng đính ảnh **gọn, an toàn, đúng quyền**, tái dùng tối đa pattern sẵn có, không kéo theo framework/thư viện.

---

## BỐI CẢNH REPO (đọc trước khi code)

- **Tech stack:** vanilla JS, không build. `supabase-js@2` nạp qua CDN ở [`index.html:27`](../index.html) ⇒ `supabase.storage` **đã có sẵn**, chưa dùng ở đâu cả.
- **Giao dịch:** bảng `public.transactions` (xem `supabase-schema.sql`, ~L56). Các cột: `id, household_id, user_id, date, time, amount, type(income|expense|transfer), category, note, account_id, to_account_id, recurring_id, created_at`.
- **RLS giao dịch** (`supabase-schema.sql` ~L279–301): mọi thành viên ĐỌC mọi giao dịch; INSERT cần là thành viên hộ (actor được stamp bởi trigger `set_tx_actor`); UPDATE/DELETE chỉ với giao dịch **của mình**, owner/admin sửa tất cả. Helper sẵn có: `public.user_households()`, `public.is_household_admin(hid)`, `public.is_household_owner(hid)`.
- **Tầng dữ liệu** `js/store.js`:
  - `getClient()` (~L57) trả về Supabase client (đã có `.storage`).
  - `mapRow(r)` (~L284) map row → camelCase.
  - `addTransaction(tx)` (~L405), `addTransactions(list)` (~L432), `updateTransaction(id, fields)` (~L456), `deleteTransaction(id)` (~L471).
  - `loadData()` (~L342) đọc toàn bộ dữ liệu hộ; cache xuống IndexedDB (`idbSet('data', …)`).
- **UI/logic** `js/app.js`:
  - `txRow(tx)` (~L1083): render 1 dòng giao dịch; gọi `txActions(tx)` cho nút sửa/xoá.
  - `openEdit(id)` (~L2172): modal sửa giao dịch thu/chi (`#eAmount`, `#eCat`, `#eNote`, `#eDate`, `#eTime`, `#eAccount`, nút `#eSave`).
  - Modal **thêm tay** dùng input `#tNote`/`#tAmount`… (~L2138 trong `openTransfer`); luồng nhập nhanh lưu qua `addTransaction`/`addTransactions` (~L724, ~L926).
  - `canEditTx(tx)` (~L2174): kiểm tra quyền sửa giao dịch (mình hoặc admin/owner). **Dùng đúng hàm này để gate nút đính/xoá ảnh.**
  - Tiền hiển thị qua `fmtShort`/`fmtVND` (`js/charts.js`); ẩn qua `mask()`.
- **i18n:** object `I18N` trong `js/app.js` (key VI ~L60+, EN ~L200+). **Mọi chuỗi UI mới phải có cả `vi` và `en`.**
- **Realtime + Activity log:** các bảng dữ liệu được add vào publication `supabase_realtime` (~L329) và gắn trigger `log_activity()` (~L486+). Bảng mới nên theo đúng 2 pattern này.
- **Storage CHƯA được dùng** ở bất kỳ đâu — đây là hạ tầng mới duy nhất phải dựng.

---

## QUYẾT ĐỊNH KIẾN TRÚC (đọc kỹ — quyết định toàn bộ phần còn lại)

1. **Bucket PRIVATE, KHÔNG public.** Ảnh hoá đơn/sao kê là dữ liệu tài chính nhạy cảm. Dùng bucket private + **signed URL có hạn** (`createSignedUrl`, vd 3600s) để hiển thị. Tuyệt đối **không** dùng `getPublicUrl`.
2. **Bảng riêng `transaction_attachments`** (1 giao dịch ↔ nhiều ảnh), KHÔNG nhồi mảng vào cột `transactions`. Lý do: dễ RLS theo từng dòng, dễ realtime, dễ gắn `log_activity`, đúng pattern `goals`/`recurring`.
3. **Quy ước đường dẫn file** = `"<household_id>/<transaction_id>/<uuid>.<ext>"`. Nhờ vậy **RLS trên `storage.objects`** đọc được `household_id` từ folder cấp 1 (`storage.foldername(name)[1]`) và `transaction_id` từ folder cấp 2 → gate quyền chuẩn xác mà không cần JOIN phức tạp.
4. **Nén ảnh ở client trước khi upload** (canvas thuần, không thư viện): resize cạnh dài ≤ ~1600px, xuất JPEG quality ~0.82 → ảnh điện thoại 3–5MB còn vài trăm KB. Tiết kiệm Storage + băng thông + nhanh.
5. **Phân quyền đính/xoá ảnh = đúng quyền sửa giao dịch** (`canEditTx` ở client, mirror bằng RLS ở server): chủ giao dịch hoặc admin/owner. Ai cũng **xem** được ảnh trong hộ (giống quyền đọc giao dịch).
6. **Dọn rác Storage khi xoá:** xoá giao dịch (hoặc xoá ảnh lẻ) phải **xoá object trên Storage** — Storage KHÔNG bị `on delete cascade` của Postgres. Xử lý ở client (`storage.remove([...paths])`); ghi rõ đây là best-effort, nếu lỗi mạng vẫn không chặn thao tác chính.
7. **Giữ nguyên hành vi cũ:** giao dịch không ảnh chạy y hệt hiện tại. Tính năng phải **chịu được khi schema chưa chạy lại** (bảng/bucket chưa có → ẩn UI ảnh, không vỡ app — giống cách `goals`/`recurring` được `try/catch` tolerant trong `loadData`).

---

## PHẦN A — Hạ tầng Supabase

### A1. Bucket Storage (làm 1 lần, ghi rõ trong README/memory để người dùng tự tạo)

Trong Supabase → Storage, tạo bucket **`receipts`**:
- **Public: OFF** (private).
- File size limit: **5 MB**. Allowed MIME types: `image/jpeg, image/png, image/webp` (thêm `image/heic, image/heif` nếu muốn nhận ảnh iPhone thô — xem caveat HEIC ở PHẦN E).

Hoặc bằng SQL (an toàn chạy lại):
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

### A2. RLS trên `storage.objects` (thêm vào `supabase-schema.sql`, an toàn chạy lại)

Quy ước path `"<household_id>/<transaction_id>/<file>"` ⇒ `foldername[1]=household_id`, `foldername[2]=transaction_id`.

```sql
-- ===== Storage: bằng chứng ảnh cho giao dịch (bucket 'receipts', private) =====
-- ĐỌC: thành viên của hộ (household_id = folder cấp 1) đọc được mọi ảnh trong hộ.
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1]::uuid in (select public.user_households())
);

-- GHI (upload): chỉ được đính vào giao dịch mình ĐƯỢC PHÉP sửa (chủ giao dịch hoặc admin/owner).
drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1]::uuid in (select public.user_households())
  and exists (
    select 1 from public.transactions t
     where t.id = (storage.foldername(name))[2]::uuid
       and t.household_id = (storage.foldername(name))[1]::uuid
       and (t.user_id = auth.uid() or public.is_household_admin(t.household_id))
  )
);

-- XOÁ: cùng điều kiện như ghi.
drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1]::uuid in (select public.user_households())
  and exists (
    select 1 from public.transactions t
     where t.id = (storage.foldername(name))[2]::uuid
       and (t.user_id = auth.uid() or public.is_household_admin(t.household_id))
  )
);
```

> Lưu ý thứ tự thao tác: vì policy insert kiểm tra giao dịch đã tồn tại, luồng nhập mới phải **tạo giao dịch trước (lấy `id`)** rồi mới upload ảnh. (Đã phản ánh ở PHẦN C.)

### A3. Bảng metadata `transaction_attachments` (thêm vào `supabase-schema.sql`, an toàn chạy lại)

```sql
create table if not exists public.transaction_attachments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id)   on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  storage_path   text not null,           -- '<household_id>/<transaction_id>/<uuid>.<ext>'
  mime           text,
  size_bytes     bigint,
  width          int,
  height         int,
  uploaded_by    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_attach_tx on public.transaction_attachments (transaction_id);
create index if not exists idx_attach_hh on public.transaction_attachments (household_id, created_at desc);

-- Stamp người upload server-side (giống set_tx_actor) để uploaded_by luôn đáng tin.
create or replace function public.set_attachment_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.uploaded_by := auth.uid(); return new; end $$;
drop trigger if exists trg_set_attachment_actor on public.transaction_attachments;
create trigger trg_set_attachment_actor before insert on public.transaction_attachments
  for each row execute function public.set_attachment_actor();

alter table public.transaction_attachments enable row level security;

-- ĐỌC: thành viên hộ.
drop policy if exists attach_select on public.transaction_attachments;
create policy attach_select on public.transaction_attachments for select
  using (household_id in (select public.user_households()));

-- GHI: chỉ đính vào giao dịch mình được phép sửa (mirror storage + tx RLS).
drop policy if exists attach_insert on public.transaction_attachments;
create policy attach_insert on public.transaction_attachments for insert
  with check (
    household_id in (select public.user_households())
    and exists (
      select 1 from public.transactions t
       where t.id = transaction_id
         and t.household_id = transaction_attachments.household_id
         and (t.user_id = auth.uid() or public.is_household_admin(t.household_id))
    )
  );

-- XOÁ: cùng điều kiện.
drop policy if exists attach_delete on public.transaction_attachments;
create policy attach_delete on public.transaction_attachments for delete
  using (
    household_id in (select public.user_households())
    and exists (
      select 1 from public.transactions t
       where t.id = transaction_id
         and (t.user_id = auth.uid() or public.is_household_admin(t.household_id))
    )
  );

-- Realtime + Activity log (đồng bộ giữa thành viên + ghi audit, giống các bảng khác).
do $$ begin
  begin alter publication supabase_realtime add table public.transaction_attachments;
  exception when duplicate_object then null; end;
end $$;
drop trigger if exists trg_log_attachments on public.transaction_attachments;
create trigger trg_log_attachments after insert or update or delete on public.transaction_attachments
  for each row execute function public.log_activity();
```

> Cập nhật `memory`/README: nhắc người dùng **(1) chạy lại `supabase-schema.sql`** và **(2) tạo bucket `receipts` (private)** sau khi merge.

---

## PHẦN B — Tầng dữ liệu (`js/store.js`)

1. **Mapper** `mapAttachment(a)` → `{ id, transactionId, storagePath, mime, sizeBytes, width, height, uploadedBy, createdAt }`.

2. **Đọc kèm trong `loadData()`** (tolerant như `goals`/`recurring` — bảng thiếu → `[]`):
   ```js
   const attachments = await sb.from('transaction_attachments').select('*').eq('household_id', hid)
     .then((r) => (r.error ? [] : (r.data || []).map(mapAttachment))).catch(() => []);
   ```
   Đưa vào `data.attachments` (mảng phẳng). Ở `js/app.js` build index `attachmentsByTx = {}` để tra nhanh `tx.id → [attachment]`.

3. **Hàm Storage mới** (export trong API của Store):
   - `async function uploadReceipt(householdId, txId, blob, ext)`:
     - `path = householdId + '/' + txId + '/' + uuid() + '.' + ext` (tự viết `uuid()` ngắn bằng `crypto.randomUUID()`).
     - `getClient().storage.from('receipts').upload(path, blob, { contentType: blob.type, upsert: false })`.
     - Lỗi → throw (caller toast).
     - Trả về `path`.
   - `async function insertAttachment(meta)`: `insert` vào `transaction_attachments` (`household_id, transaction_id, storage_path, mime, size_bytes, width, height`), `.select().single()` → `mapAttachment`.
   - `async function signedUrl(path, ttl = 3600)`: `storage.from('receipts').createSignedUrl(path, ttl)` → trả `signedUrl`. Cache in-memory theo `path` (kèm thời điểm hết hạn) để tránh ký lại liên tục khi re-render.
   - `async function removeReceipts(paths)`: `storage.from('receipts').remove(paths)` (best-effort, nuốt lỗi).
   - `async function deleteAttachment(att)`: `delete` row khỏi `transaction_attachments` theo `id`, **rồi** `removeReceipts([att.storagePath])`.

4. **Dọn rác khi xoá giao dịch** — sửa `deleteTransaction(id)`:
   - Trước khi xoá row giao dịch, lấy `storage_path` của mọi attachment thuộc `transaction_id = id` (1 query), xoá giao dịch (FK cascade tự xoá rows attachment), **rồi** `removeReceipts(paths)` (best-effort). Thứ tự: query paths → delete tx → remove storage.

5. **Subscribe realtime** bảng `transaction_attachments` (giống các bảng khác) để ảnh mới của thành viên khác hiện ngay.

6. **KHÔNG cache blob ảnh vào IndexedDB** — chỉ cache metadata (path) như hiện tại; ảnh luôn lấy qua signed URL.

---

## PHẦN C — UI & Logic (`js/app.js`)

### C1. Helper nén ảnh (vanilla, không thư viện)
```js
// Resize cạnh dài ≤ maxDim, xuất JPEG. Trả { blob, width, height }.
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file);            // (fallback <img>+onload nếu cần)
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
  return { blob, width: w, height: h };
}
```
> Ảnh đã là JPEG/PNG nhỏ thì vẫn nén để chuẩn hoá; HEIC xem caveat PHẦN E.

### C2. Khối "Bằng chứng" trong modal sửa (`openEdit`) — nơi chính
Thêm vào modal `openEdit` (~L2172), đặt dưới phần nhập, **chỉ khi `canEditTx(tx)`** cho nút thêm; phần xem ảnh thì ai trong hộ cũng thấy:
- **Lưới thumbnail**: với mỗi attachment của `tx`, hiện `<img>` (src = signed URL, lazy) trong ô vuông; click → mở **lightbox** (overlay phóng to, vanilla). Mỗi thumbnail có nút **xoá** (chỉ hiện nếu `canEditTx(tx)`), bấm → confirm → `Store.deleteAttachment(att)` → cập nhật `attachmentsByTx` + re-render.
- **Nút "+ Thêm ảnh"**: `<input type="file" accept="image/*" capture="environment" multiple hidden>` + nút bấm kích hoạt nó (`capture="environment"` cho phép chụp trực tiếp trên mobile). Khi chọn file:
  1. Với mỗi file: `compressImage` → `Store.uploadReceipt(householdId, tx.id, blob, 'jpg')` → `Store.insertAttachment({...})`.
  2. Hiện trạng thái "đang tải lên…" (disable nút), toast lỗi từng ảnh nếu có.
  3. Xong → cập nhật `attachmentsByTx[tx.id]` + re-render lưới.

### C3. Đính ảnh khi NHẬP MỚI (luồng quick-add + modal thêm tay)
Vì RLS yêu cầu giao dịch tồn tại trước khi upload → theo thứ tự:
1. Lưu giao dịch như hiện tại (`addTransaction` trả về `saved` có `id`).
2. Nếu người dùng đã chọn ảnh trước đó (giữ tạm trong biến `pendingFiles`), sau khi có `saved.id` thì `compressImage`→`uploadReceipt(hid, saved.id, …)`→`insertAttachment`.
3. Nếu upload lỗi: giao dịch **vẫn được giữ** (không rollback), chỉ toast cảnh báo "đã lưu giao dịch nhưng tải ảnh thất bại, thử lại trong phần Sửa".
> Nếu thấy phức tạp cho luồng nhập-nhanh hàng loạt, **v1 chỉ cần cho đính ảnh trong `openEdit`** (sửa giao dịch), và thêm nút 📎 ở form thêm tay. Đính lúc nhập-nhanh để Phase sau.

### C4. Chỉ báo ở danh sách giao dịch (`txRow`)
- Nếu `attachmentsByTx[tx.id]?.length` → thêm badge nhỏ hình **kẹp giấy 📎** + số lượng vào `tx-meta` (hoặc cạnh `tx-right`). Bấm vào dòng/badge mở `openEdit` (đã có sẵn) để xem ảnh.
- Thêm icon `paperclip` vào bộ `icon()` nếu chưa có (1 SVG đơn giản).

### C5. Lightbox (xem ảnh phóng to)
- Overlay `position:fixed` full-screen, nền tối, ảnh `max-width/max-height:90%`, bấm nền hoặc nút × để đóng; phím Esc đóng. Vanilla, không thư viện. Nếu nhiều ảnh: nút ‹ › chuyển ảnh (tuỳ chọn).

### C6. i18n (cả `vi` & `en`)
Thêm các key, ví dụ:
`evidence` (Bằng chứng / Evidence), `addPhoto` (Thêm ảnh / Add photo),
`takePhoto` (Chụp ảnh / Take photo), `uploading` (Đang tải lên… / Uploading…),
`removePhoto` (Xoá ảnh / Remove photo), `confirmRemovePhoto` (Xoá ảnh này? / Remove this photo?),
`photoUploadFailed` (Tải ảnh thất bại / Photo upload failed),
`txSavedPhotoFailed` (Đã lưu giao dịch nhưng tải ảnh thất bại / Transaction saved but photo upload failed),
`photoTooBig` (Ảnh quá lớn / Image too large), `noEvidence` (Chưa có bằng chứng / No evidence yet),
`viewPhoto` (Xem ảnh / View photo).

---

## PHẦN D — CSS (`css/style.css`)
- `.attach-grid` (grid thumbnail vuông, ~64–80px, `object-fit:cover`, bo góc), `.attach-thumb`, `.attach-del` (nút × góc trên phải thumbnail).
- `.lightbox-backdrop` (overlay tối, flex center) + `.lightbox-img`.
- Badge `.tx-attach` (kẹp giấy + số) nhỏ gọn trong `tx-meta`/`tx-right`.
- Tái dùng biến màu/token + class `.hidden` sẵn có; không thêm thư viện, không thêm build step.

---

## PHẦN E — Caveat & quyết định kỹ thuật (đọc kỹ)

1. **HEIC/HEIF (iPhone):** trình duyệt thường không decode được HEIC trong canvas. Thực tế khi chọn qua `<input type="file" accept="image/*">`, iOS Safari **tự convert sang JPEG**, nên đa số ổn. Nếu `createImageBitmap` ném lỗi với 1 file → bắt lỗi, toast "định dạng ảnh không hỗ trợ", bỏ qua file đó (không chặn các ảnh khác). KHÔNG thêm thư viện decode HEIC ở v1.
2. **Signed URL hết hạn:** ký TTL 1h và cache; nếu `<img>` lỗi tải (onerror) → ký lại 1 lần rồi gán lại src.
3. **Dọn rác Storage:** xoá giao dịch/ảnh đã gọi `storage.remove`. File mồ côi do lỗi mạng là chấp nhận được ở v1 (không rò rỉ vì bucket private + RLS). GC triệt để (Edge Function/cron quét object không có row tham chiếu) để **Phase sau**.
4. **Số lượng/giới hạn:** giới hạn mềm ~5 ảnh/giao dịch ở UI; bucket đã chặn cứng 5MB/ảnh + MIME. Thông báo rõ khi vượt.
5. **Ẩn số dư (`mask`)** không áp cho ảnh; nhưng cân nhắc: ở chế độ riêng tư, vẫn cho xem ảnh (không phải số tiền). Giữ nguyên hành vi, không che ảnh.
6. **Offline:** khi mất mạng, ẩn nút thêm ảnh hoặc toast "cần mạng để tải ảnh"; metadata vẫn hiển thị từ cache nhưng `<img>` sẽ trống (chấp nhận được).

---

## PHẦN F — Phase 2 (tuỳ chọn): OCR tự điền từ ảnh hoá đơn

> Không bắt buộc cho v1. Tận dụng việc app **đã gọi Claude API trực tiếp từ browser** ([`js/parser.js:201`](../js/parser.js), header `anthropic-dangerous-direct-browser-access`).

- Khi người dùng đính ảnh hoá đơn ở form nhập mới, gửi ảnh (base64) tới `api.anthropic.com/v1/messages` với content block `{"type":"image", "source":{"type":"base64",...}}` (model `claude-haiku-4-5` đã dùng), prompt: _"Đọc hoá đơn, trả JSON {amount, date, note, type}"_ → dùng lại `normalizeParsed`/`extractJson` trong `parser.js` để **prefill** form. Người dùng xác nhận trước khi lưu.
- Ưu điểm: giảm thao tác nhập tay; tái dùng hạ tầng parser sẵn có. Nhược điểm: tốn token, cần mạng → luôn cho sửa tay.

---

## QUY TẮC CHUNG (bắt buộc)
1. **Không phá** luồng nhập/sửa/xoá hiện có; giao dịch không ảnh chạy y nguyên.
2. **Tolerant khi chưa migrate:** bảng/bucket chưa có → ẩn UI ảnh, app không vỡ (try/catch như `goals`/`recurring`).
3. **Bucket private + signed URL.** Không bao giờ `getPublicUrl`.
4. **Phân quyền:** dùng `canEditTx` ở client; RLS (`storage.objects` + `transaction_attachments`) mirror đúng quyền sửa giao dịch. Ai trong hộ cũng xem được ảnh.
5. **Nén ảnh client-side** trước khi upload; vanilla canvas, không thêm thư viện.
6. Mọi chuỗi UI có đủ `vi` + `en`. Mọi tiền (nếu hiển thị) qua `fmtShort`/`fmtVND` + `mask()`.
7. Vanilla JS thuần, không framework, không build step. `supabase-schema.sql` an toàn chạy lại (mọi statement `if not exists` / `drop … if exists` / `on conflict`).
8. Dọn `storage.remove` khi xoá giao dịch hoặc ảnh lẻ (best-effort, không chặn thao tác chính).

## Kiểm thử tay (bắt buộc)
- Tạo giao dịch chi → mở Sửa → đính 2 ảnh điện thoại (3–5MB) → upload thành công, hiện thumbnail; kiểm tra file trên Storage đã được nén (vài trăm KB), path đúng `<hid>/<txid>/<uuid>.jpg`.
- Đăng nhập bằng thành viên khác cùng hộ → thấy ảnh (realtime). Thành viên **member** KHÔNG sửa được ảnh của giao dịch người khác (nút xoá ẩn; thử insert/delete qua console bị RLS chặn). Owner/admin sửa/xoá được mọi ảnh.
- Tài khoản **ngoài hộ** không đọc được ảnh (signed URL không cấp được do RLS).
- Badge 📎 + số hiện đúng ở dòng giao dịch.
- Xoá 1 ảnh → row + object Storage biến mất. Xoá cả giao dịch → mọi attachment row (cascade) + object Storage bị dọn.
- Chạy app khi **chưa** tạo bucket/chưa chạy schema → app vẫn chạy, chỉ không có UI ảnh (không lỗi đỏ).

## KẾT QUẢ MONG ĐỢI
- ✅ Đính **nhiều ảnh bằng chứng** cho mỗi giao dịch thu/chi; chụp trực tiếp trên mobile hoặc chọn từ thư viện.
- ✅ Ảnh được **nén client-side**, lưu **bucket private**, hiển thị qua **signed URL**; có lightbox xem phóng to.
- ✅ **Đúng quyền** (chủ giao dịch / admin / owner) ở cả client lẫn RLS; ai trong hộ cũng xem được; người ngoài hộ không truy cập được.
- ✅ Badge 📎 ở danh sách giao dịch; đồng bộ **realtime** giữa thành viên; ghi **activity log**.
- ✅ Dọn rác Storage khi xoá; app **không vỡ** khi schema/bucket chưa được tạo.
- ✅ (Tuỳ chọn) Phase 2: OCR hoá đơn bằng Claude vision để tự điền số tiền/ngày.

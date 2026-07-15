# Prompt: HỒ SƠ CÁ NHÂN — tên hiển thị, ảnh đại diện, đổi mật khẩu, xác thực email

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; PWA).
>
> Triết lý: hồ sơ = **hai lớp tách bạch**. (1) Lớp *bảo mật tài khoản* (mật khẩu, xác thực email)
> thuộc về Supabase Auth — chỉ gọi API auth, không lưu gì thêm. (2) Lớp *danh tính hiển thị trong hộ*
> (tên, ảnh) đi theo `household_members` — đúng con đường mà cột `email` đang đi, vì **thành viên
> khác không đọc được `user_metadata` auth của nhau**, còn hàng member thì cả hộ đọc được sẵn.
> Không bảng mới, không Storage bucket mới: avatar là data-URI JPEG nhỏ (~5KB) nằm ngay trong hàng member.

---

## HIỆN TRẠNG (đã khảo sát — số dòng đúng tại thời điểm viết, sau v1.26.0)

- Trang **Cài đặt → Tài khoản** (`page === 'account'`, `js/app.js` ~L3190) chỉ có email + nút Đăng xuất; hàng root menu ~L2836 (`value` = email).
- **Danh tính hiển thị = email-prefix, một phễu duy nhất**: `memberName(uid)` (~L633, self → `t('you')`) được dùng ở dòng giao dịch (~L1779/1791/1799), picker "Chi cho" (~L1135), báo cáo theo thành viên (~L2293), chi tiết nhật ký (~L2963). `membersHtml()` (~L2655) hiện email + role.
- **Pattern "tự ghi hàng member của mình" đã có**: `loadData` backfill email — `update({email}).eq('user_id', user.id).is('email', null)` (store.js, KHÔNG filter household → chạm mọi hộ). RLS `members_update` cho phép user sửa hàng của **chính mình** (`user_id = auth.uid()`), guard trigger chỉ khóa cột `role` → thêm cột hồ sơ không đụng phân quyền.
- `listMembers()` (store.js ~L214) select `'user_id,email,role,joined_at'`.
- **Realtime đã subscribe `household_members`** (thêm ở v1.26.0) → đổi tên/ảnh tự lan sang máy khác, không cần code thêm.
- Auth: `signUp/signIn/signOut` (store.js ~L117–130); `getUser()` trả user Supabase (có `email_confirmed_at`). `friendlyAuthError` (app.js ~L4302) đã map lỗi mật khẩu yếu / sai mật khẩu / rate limit.
- **Đã có `compressImage(file, maxDim, quality)`** (app.js ~L1443, canvas → JPEG blob, dùng cho hóa đơn) — tái dùng cho avatar, chỉ cần thêm helper blob→dataURL.
- **Nhật ký hoạt động an toàn sẵn một nửa**: `log_activity` (schema ~L503–506) đã **bỏ qua UPDATE `household_members` không đổi role** → lưu tên/ảnh không tạo dòng log. Nhưng INSERT/DELETE member vẫn snapshot cả hàng (`to_jsonb`) → sẽ nhét base64 avatar vào `activity_log` khi có người rời/bị xóa — cần strip.
- Chưa có gì về trạng thái xác thực email; message sau đăng ký chỉ nhắc "kiểm tra email nếu cần xác nhận".

## MỤC TIÊU

1. Trang **Tài khoản → Hồ sơ**: avatar (đổi/xóa) + tên hiển thị + email kèm badge xác thực + đổi mật khẩu + đăng xuất.
2. **Tên & ảnh lan ra mọi chỗ** đang hiện email-prefix: dòng giao dịch, danh sách thành viên, picker "Chi cho", báo cáo theo thành viên — và nhất quán trên **mọi hộ** user tham gia.
3. **Đổi mật khẩu an toàn**: bắt nhập mật khẩu hiện tại, xác minh trước khi đổi.
4. **Xác thực email**: hiện trạng thái ✓/⚠, nút gửi lại thư xác thực (chống spam 60s).
5. **Schema-tolerant**: hộ chưa chạy lại `supabase-schema.sql` vẫn dùng app y như cũ (không tên/ảnh, có hint).

### QUYẾT ĐỊNH THIẾT KẾ CỐT LÕI (đọc kỹ, đừng làm khác)

1. **`display_name` + `avatar` là cột mới của `household_members`** — KHÔNG tạo bảng `profiles` (thừa normal-hóa cho app này), KHÔNG dùng `user_metadata` (member khác không đọc được), KHÔNG bucket (avatar nhỏ, signed-URL churn vô ích). Avatar = **data-URI JPEG ≤128–256px, ~3–8KB**, CHECK `length ≤ 60000` chặn dữ liệu rác.
2. **Cập nhật hồ sơ = update MỌI hàng member của chính mình** (`eq('user_id', user.id)`, không filter household — pattern backfill email): một lần đổi tên, mọi hộ thấy tên mới. RLS sẵn có cho phép, không sửa policy.
3. **Đổi mật khẩu**: verify mật khẩu hiện tại bằng `signInWithPassword(email, currentPw)` (đồng thời làm tươi session) rồi `auth.updateUser({ password })`. Lỗi map qua `friendlyAuthError` (đã có invalidCreds/weakPassword/rate limit).
4. **Xác thực email**: đọc `user.email_confirmed_at` (badge ✓/⚠); chưa xác thực → nút "Gửi lại email xác thực" = `auth.resend({ type: 'signup', email })`, cooldown 60s phía client (biến module, KHÔNG dựa vào disabled vì `busy()` reset nó). **Điều kiện hạ tầng** (ghi rõ trong README/kết quả): bật *Confirm email* trong Supabase Auth settings và đặt *Site URL* trỏ về URL app để link xác thực đổ về đúng chỗ. Đổi địa chỉ email là Phase 2.
5. **Hiển thị**: `memberName()` ưu tiên `displayName` → email-prefix → unknown (self vẫn `t('you')` ở dòng giao dịch). Helper mới `memberAvatar(uid, cls)`: ảnh data-URI (chỉ render khi `/^data:image\//` — chống injection vào `src`) hoặc **vòng tròn chữ cái đầu** màu deterministic theo uid. V1 gắn avatar ở trang Hồ sơ + danh sách Thành viên; dòng giao dịch chỉ đổi text (avatar trong list dài là Phase 2).
6. **Schema-tolerant hai chiều**: `listMembers` select đủ cột mới, lỗi (cột chưa tồn tại) → **retry với cột cũ**; `updateProfile` lỗi chứa 'column' → toast `profileSchemaHint`. App chưa chạy schema mới hoạt động nguyên trạng.
7. **`log_activity` strip `avatar`** khỏi `v_new`/`v_old` ngay đầu hàm (idempotent `create or replace`) — nhật ký không bao giờ chứa base64.
8. Vanilla JS, không thư viện mới; i18n đủ `vi`+`en`; mọi nút server bọc `busy()`; `sw.js` không đổi.

---

## PHẦN A — Schema (`supabase-schema.sql`, an toàn chạy lại — CẦN chạy lại sau khi merge)

1. Cạnh alter email của `household_members` (~L41):
```sql
alter table public.household_members add column if not exists display_name text;
-- Ảnh đại diện: data-URI JPEG nhỏ (~5KB). CHECK chặn nhét dữ liệu lớn.
alter table public.household_members add column if not exists avatar text;
alter table public.household_members drop constraint if exists household_members_avatar_len;
alter table public.household_members add constraint household_members_avatar_len
  check (avatar is null or length(avatar) <= 60000);
```
2. Trong `log_activity()` (create or replace sẵn có), thêm ngay đầu block `begin` (trước guard no-op):
```sql
  -- Avatar là data-URI vài KB — không bao giờ đưa vào nhật ký.
  v_new := v_new - 'avatar';
  v_old := v_old - 'avatar';
  v_row := coalesce(v_new, v_old);
```

> Không sửa policy, không sửa guard trigger, không bảng/bucket mới.

## PHẦN B — Tầng dữ liệu (`js/store.js`)

1. **`listMembers()`** (~L214): select `'user_id,email,role,joined_at,display_name,avatar'`; nếu lỗi → retry select cột cũ (schema chưa chạy lại). Map thêm `displayName: m.display_name || ''`, `avatar: m.avatar || ''`.
2. **`updateProfile(fields)`**: payload chỉ chứa field được truyền (`displayName` → `display_name`, trim, rỗng → null; `avatar` → nguyên văn hoặc null để xóa); `update(payload).eq('user_id', user.id)` — mọi hộ. Lỗi → throw (app phân loại hint schema).
3. **`changePassword(currentPw, newPw)`**: `getUser` → `signIn(user.email, currentPw)` → `auth.updateUser({ password: newPw })`.
4. **`resendVerification()`**: `auth.resend({ type: 'signup', email: user.email })`.
5. Export `updateProfile`, `changePassword`, `resendVerification`.

## PHẦN C — App (`js/app.js`)

### C1. Danh tính hiển thị
- `memberName(uid)` (~L633): chèn `if (m && m.displayName) return m.displayName;` trước nhánh email.
- Helper `myDisplayName()` = displayName của hàng mình || email — dùng cho `value` của hàng root menu Tài khoản (~L2836).
- Helper `memberAvatar(uid, cls)`: hàng member có `avatar` hợp lệ (`/^data:image\//`) → `<img class="avatar ...">`; không → `<span class="avatar avatar-fallback">` chữ cái đầu của tên/email, `background` chọn từ palette 8 màu theo tổng charCode của uid.
- Helper `blobToDataURL(blob)` (FileReader) đặt cạnh `compressImage` (~L1443).
- `membersHtml()` (~L2655): thêm `memberAvatar(m.userId)` trước `.member-info`; dòng tên = displayName || email, có displayName thì thêm dòng phụ `.member-sub` là email.

### C2. Trang Hồ sơ (page `'account'`, ~L3190 — thay toàn bộ body)
- `.profile-head`: avatar lớn (96px) + input file ẩn (`accept="image/*"`) + nút "Đổi ảnh" / "Xóa ảnh" (chỉ hiện khi có ảnh).
- Email + badge `verify-badge ok/warn` (✓ Đã xác thực / ⚠ Chưa xác thực từ `currentUserVerified`); chưa xác thực → nút "Gửi lại email xác thực".
- Ô "Tên hiển thị" (maxlength 40) + nút Lưu.
- Khối "Đổi mật khẩu": 3 ô password (hiện tại / mới / nhập lại, autocomplete đúng chuẩn) + nút; validate client: đủ ô, mới ≥6, khớp nhau — rồi mới gọi server.
- Giữ iosRow Đăng xuất cuối trang.

### C3. Handlers (đặt cạnh cụm rename/join household)
- Đổi ảnh: `compressImage(f, 256, 0.8)` → `blobToDataURL`; nếu >60000 ký tự → thử lại `(f, 128, 0.6)`; vẫn quá → toast `avatarTooLarge`. Thành công → `Store.updateProfile({avatar})` → nạp lại `householdMembers` + `render()`.
- Xóa ảnh → `updateProfile({avatar: null})`. Lưu tên → `updateProfile({displayName})`. Cả ba đều bọc `busy()`, lỗi qua `profileError(err)`: message chứa 'column' → toast `profileSchemaHint`, khác → syncError.
- Đổi mật khẩu: validate như C2 → `Store.changePassword` → toast `passwordChanged` + xóa 3 ô; lỗi → `friendlyAuthError`.
- Gửi lại xác thực: biến module `verifyCooldownUntil`; trong hạn → toast `verifyWait`; gửi thành công → đặt cooldown 60s + toast `verifySent`.
- `enterApp()`: sau `currentUserId` thêm `currentUserVerified = !!(user.email_confirmed_at || user.confirmed_at);`. Trong handler `data-page` khi mở `'account'`: gọi `Store.getUser()` nền — verified đổi (user vừa bấm link trong mail) → cập nhật biến + `render()`.

### C4. i18n (đủ vi + en)
```
displayNameLbl:   'Tên hiển thị'                       / 'Display name'
changeAvatar:     'Đổi ảnh'                            / 'Change photo'
removeAvatar:     'Xóa ảnh'                            / 'Remove photo'
avatarSaved:      'Đã cập nhật ảnh đại diện.'          / 'Profile photo updated.'
avatarTooLarge:   'Ảnh quá lớn — hãy chọn ảnh khác.'   / 'Image too large — please pick another.'
nameSaved:        'Đã lưu tên hiển thị.'               / 'Display name saved.'
changePassword:   'Đổi mật khẩu'                       / 'Change password'
currentPassword:  'Mật khẩu hiện tại'                  / 'Current password'
newPassword:      'Mật khẩu mới'                       / 'New password'
confirmPassword:  'Nhập lại mật khẩu mới'              / 'Confirm new password'
passwordMismatch: 'Mật khẩu nhập lại không khớp.'      / 'Passwords do not match.'
passwordChanged:  'Đã đổi mật khẩu.'                   / 'Password changed.'
fillAllFields:    'Vui lòng điền đủ các ô.'            / 'Please fill in all fields.'
emailVerified:    'Đã xác thực'                        / 'Verified'
emailNotVerified: 'Chưa xác thực'                      / 'Not verified'
resendVerify:     'Gửi lại email xác thực'             / 'Resend verification email'
verifySent:       'Đã gửi email xác thực — kiểm tra hộp thư.' / 'Verification email sent — check your inbox.'
verifyWait:       'Vui lòng đợi một lát rồi gửi lại.'  / 'Please wait a moment before resending.'
profileSchemaHint:'Cần chạy lại supabase-schema.sql để bật hồ sơ (tên, ảnh).' / 'Re-run supabase-schema.sql to enable profiles (name, photo).'
```

### C5. CSS (`css/style.css`)
- `.avatar` (36px, tròn, `object-fit: cover`), `.avatar-fallback` (chữ trắng đậm trên nền màu), `.avatar-lg` (96px), `.profile-head`, `.profile-avatar-btns`, `.verify-badge.ok/.warn` (pill nhỏ), `.member-sub` (email phụ 11.5px). Không cơ chế mới.

---

## QUY TẮC CHUNG (bắt buộc)

1. Tên/ảnh CHỈ nằm ở `household_members` — không bảng mới, không bucket, không `user_metadata`.
2. Avatar luôn là data-URI `image/*` ≤60000 ký tự; validate prefix trước khi render vào `src`; DB có CHECK chặn.
3. Mật khẩu/xác thực CHỈ qua `supabase.auth` API — app không bao giờ lưu mật khẩu.
4. Schema-tolerant: chưa chạy schema mới → app nguyên trạng + hint; `listMembers` phải có nhánh retry cột cũ.
5. `log_activity` không được chứa base64 avatar (strip trong hàm).
6. Không đụng role/permissions/guard trigger; member thường tự sửa hồ sơ CHÍNH MÌNH (RLS self-row sẵn có).
7. `busy()` mọi nút server; i18n vi+en; Conventional Commits; KHÔNG tự bump version/`?v=`; `sw.js` không đổi.

---

## TEST TAY

1. **Chưa chạy schema mới**: app chạy như cũ; Hồ sơ lưu tên → toast hint chạy lại schema; danh sách thành viên vẫn hiện (nhánh retry cột cũ).
2. Chạy lại schema → đổi tên "Bố Bin" → dòng giao dịch, Thành viên, picker "Chi cho", báo cáo theo thành viên hiện "Bố Bin" thay email-prefix; **máy khác cùng hộ thấy realtime** không cần reload.
3. **Avatar**: chọn ảnh chụp điện thoại (~3–5MB) → nén còn vài KB, hiện tròn ở Hồ sơ + Thành viên; máy khác thấy realtime. Xóa ảnh → về vòng tròn chữ cái đầu.
4. User thuộc **2 hộ**: đổi tên/ảnh một lần → mở hộ kia thấy y hệt (update mọi hàng member).
5. **Đổi mật khẩu**: sai mật khẩu hiện tại → invalidCreds; mới <6 ký tự → weakPassword (chặn từ client); nhập lại lệch → passwordMismatch (không gọi server); hợp lệ → đăng xuất, đăng nhập bằng mật khẩu mới OK.
6. **Xác thực email** (bật Confirm email trong Supabase trước): tài khoản chưa xác thực → badge ⚠ + nút gửi lại → nhận mail → bấm link → mở lại trang Hồ sơ → badge ✓ (không cần đăng nhập lại).
7. Bấm "Gửi lại" hai lần liền → lần 2 báo `verifyWait` (cooldown 60s), không dính rate limit Supabase.
8. **Nhật ký**: đổi tên/ảnh KHÔNG tạo dòng log (guard sẵn có); xóa một thành viên có avatar → dòng log KHÔNG chứa chuỗi base64.
9. Member thường (không phải owner/admin) tự sửa tên/ảnh của mình OK; không sửa được hàng người khác (RLS chặn — thử qua devtools).
10. Ảnh cố nhét >60KB qua devtools → DB CHECK từ chối.

---

## PHẦN D — Phase 2 (tuỳ chọn, KHÔNG làm ở v1)

- **Đổi địa chỉ email** (`updateUser({email})` + double-confirm + đồng bộ `household_members.email`).
- **Quên mật khẩu** (`resetPasswordForEmail` + xử lý event `PASSWORD_RECOVERY` trong SPA — cần màn hình đặt lại riêng).
- Avatar thu nhỏ trong dòng giao dịch + header; crop vuông thật khi chọn ảnh (v1 dùng `object-fit: cover`).
- Bắt buộc xác thực email trước khi mời/join hộ.

---

## KẾT QUẢ MONG ĐỢI

- ✅ Hồ sơ cá nhân: tên hiển thị + ảnh đại diện dùng chung mọi hộ, lan realtime, thay email-prefix ở mọi chỗ hiển thị.
- ✅ Đổi mật khẩu có xác minh mật khẩu cũ; xác thực email với badge trạng thái + gửi lại có cooldown.
- ✅ Không bảng/bucket mới; nhật ký sạch base64; chưa chạy schema mới vẫn dùng app bình thường.
- ⚠ Vận hành: **chạy lại `supabase-schema.sql`**; muốn dùng xác thực email phải bật *Confirm email* + đặt *Site URL* trong Supabase Auth settings.

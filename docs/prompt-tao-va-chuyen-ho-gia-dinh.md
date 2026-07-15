# Prompt: TẠO & CHUYỂN HỘ GIA ĐÌNH — onboarding chọn hộ sau đăng nhập, tạo hộ mới, switch giữa các hộ đã tham gia

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase; PWA).
>
> Triết lý: **đăng nhập ≠ có hộ**. Tài khoản chỉ là danh tính; dữ liệu tiền bạc luôn thuộc về MỘT hộ
> đang active. User chưa thuộc hộ nào → bắt buộc đi qua màn hình "Tạo hộ / Tham gia hộ" — app KHÔNG
> tự bịa ra hộ thay người dùng nữa. Đây là feature **thuần frontend** (store.js + app.js):
> RLS hiện tại đã cách ly dữ liệu theo hộ đúng yêu cầu, **KHÔNG sửa `supabase-schema.sql`**.

---

## HIỆN TRẠNG (đã khảo sát — số dòng đúng tại thời điểm viết)

### Đã có sẵn, KHÔNG làm lại

- **DB + RLS đã chuẩn multi-household**: `households`, `household_members` (1 user thuộc nhiều hộ), mọi bảng dữ liệu khóa `household_id` và policy `household_id in (select public.user_households())` → yêu cầu *"user nào joined vào hộ nào thì mới nhìn được thông tin hộ đó"* và *"quản lý tiền theo hộ"* **đã được enforce ở tầng DB**. Trigger `trg_guard_member_role` chặn leo quyền (chỉ `created_by` được insert role `owner`; join bằng mã luôn là `member`).
- `js/store.js`: `listHouseholds()` (~L132), `joinHousehold(code)` (~L176 — mã mời = UUID của hộ, FK chặn mã sai), `switchHousehold(id)` (~L263), `renameHousehold` (~L272), localStorage `mm_active_household` (`ACTIVE_KEY`, ~L127) nhớ hộ đang xem.
- `js/app.js`: trang Settings → Hộ gia đình (page `'household'`, ~L3122–3145) đã có: dropdown `#switchHh` (chỉ hiện khi `myHouseholds.length > 1`), đổi tên (owner), copy mã mời, tham gia hộ bằng mã; handlers ~L3952–4030 (`switch` → `Store.switchHousehold(id)` + `enterApp()` là pattern chuẩn — giữ nguyên cách này).
- **Realtime an toàn khi switch**: `subscribeChanges` (store.js ~L966) tạo channel `hh-<id>` filter theo `household_id` và tự `unsubscribeChanges()` trước khi subscribe lại.
- `templatesKey()` (app.js ~L772) đã per-household. `myHouseholds` / `householdMembers` / `myRole` nạp trong `enterApp()` (~L4275–4277).

### Khoảng trống cần làm (chính là feature này)

1. **`ensureHousehold(user)` (store.js ~L146) TỰ TẠO hộ** "Gia đình của <email-prefix>" ngay lần đăng nhập đầu — user không được hỏi, không được đặt tên, không có lựa chọn "tôi muốn join hộ của vợ/chồng trước". Nhánh auto-create này phải bỏ.
2. **Không có UI tạo hộ** — kể cả user đã có hộ cũng không cách nào tạo hộ THỨ HAI (ví dụ tách "hộ bố mẹ" riêng). Chỉ có join bằng mã.
3. **Rời hộ cuối cùng → app lại tự tạo hộ mới** (removeMember tự rời set `household = null` ~L226, lần `loadData` sau `ensureHousehold` lại auto-create) — phải quay về màn hình chọn hộ.
4. **IndexedDB cache dùng MỘT key `'data'`** (store.js ~L99, ghi ở cuối `loadData` ~L456) không phân biệt hộ → offline sau khi switch có thể hiển thị nhầm dữ liệu hộ khác. Bug thuộc scope này, phải sửa.
5. Switch đang chôn trong Settings dưới dạng `<select>` chỉ-hiện-khi->1-hộ — cần nâng thành danh sách hộ rõ ràng, kèm lối "Tạo hộ mới".
6. Màn hình auth (`showAuth`/`renderAuth`, app.js ~L4149–4182) mới có 2 mode: `'config'`, `'login'` — cần mode thứ ba `'household'` (onboarding).

## MỤC TIÊU

1. **Đăng nhập xong, chưa thuộc hộ nào → màn hình onboarding**: đặt tên và "Tạo hộ mới" HOẶC dán mã mời "Tham gia hộ". Không tự tạo hộ ngầm nữa.
2. **Tạo hộ chủ động** (đặt tên ngay lúc tạo) — từ onboarding VÀ từ Settings → Hộ gia đình (user có thể lập nhiều hộ; người tạo là `owner`).
3. **Switch giữa các hộ đã tham gia**: danh sách hộ trong Settings → Hộ gia đình, chạm để chuyển; toàn bộ dữ liệu (giao dịch, ví, ngân sách, danh mục, thành viên, cài đặt chung…) nạp lại theo hộ mới.
4. **Không phá gì đang chạy**: RLS giữ nguyên, mã mời giữ nguyên (UUID), user cũ đang có hộ vẫn vào thẳng hộ active như hôm nay.

### QUYẾT ĐỊNH THIẾT KẾ CỐT LÕI (đọc kỹ, đừng làm khác)

1. **KHÔNG sửa schema.** `households_insert` (`created_by = auth.uid()`) + `members_insert` + guard trigger đã cho phép client tạo hộ và tự thêm mình làm owner (chính `ensureHousehold` đang làm vậy) — chỉ chuyển hành vi đó thành hành động CÓ CHỦ ĐÍCH của user. Không cần chạy lại `supabase-schema.sql`.
2. **Tách `createHousehold(name)` ra khỏi `ensureHousehold`** (store.js): insert `households` (+`created_by`) → insert `household_members` role `owner` → `setActiveId` → seed `DEFAULT_BUDGETS` (best-effort như hiện tại). `ensureHousehold` sau refactor: có hộ → chọn theo `mm_active_household` hoặc `list[0]` (giữ nguyên); **không có hộ → `return null`** (bỏ hẳn nhánh auto-create).
3. **`loadData()` báo trạng thái "chưa có hộ" bằng lỗi có mã**: `ensureHousehold` trả null → `const err = new Error(tr('errNoHousehold', 'Chưa có hộ.')); err.code = 'NO_HOUSEHOLD'; throw err;`. Trong `enterApp()` (app.js ~L4256), catch kiểm tra `err.code === 'NO_HOUSEHOLD'` **trước** nhánh fallback cache → `showAuth('household')` rồi `return`. KHÔNG rơi xuống cached data của hộ cũ.
4. **Onboarding = mode mới `'household'` của authScreen** (tái dùng `auth-card`, không thêm màn hình mới): tên app + câu chào theo email; ô "Tên hộ" (placeholder gợi ý *«Gia đình của …»* từ email-prefix — user sửa được) + nút **Tạo hộ mới** (primary); vạch ngăn "hoặc"; ô dán mã mời + nút **Tham gia hộ**; link-btn **Đăng xuất** (về `'login'`). Thành công (tạo hoặc join) → `enterApp()`. Cả hai nút bọc `busy()`.
5. **Trang Settings → Hộ gia đình nâng cấp phần switch**: thay `<select id="switchHh">` bằng **iosGroup "Hộ của tôi"** — mỗi hộ một `iosRow` (icon `wallet`, tên hộ, hộ đang active có checkmark ✓ và không bấm được; hộ khác chạm để chuyển, confirm không cần — chuyển là thao tác đọc, vô hại). Dưới group: nút **"+ Tạo hộ mới"** mở prompt tên (pattern rename hiện có) → `Store.createHousehold(name)` → `enterApp()`. Giữ nguyên các phần rename / mã mời / tham gia hộ / thành viên như hiện tại.
6. **Switch = `Store.switchHousehold(id)` + `await enterApp()`** — pattern đã có ở handler ~L4030, giữ nguyên: `enterApp` tự nạp lại DATA, members, role, parser categories, realtime resubscribe, reset về tab Tổng quan. KHÔNG viết cơ chế reload thứ hai.
7. **Cache IndexedDB theo hộ**: key `'data'` → `'data:' + household.id` khi ghi (cuối `loadData`); `getCachedData()` đọc theo `getActiveId()` (`'data:' + getActiveId()`), không có → null. KHÔNG migrate key `'data'` cũ (cache chỉ để hiển thị offline, tự đầy lại sau lần sync đầu). Nhờ đó offline mở app vẫn thấy đúng hộ đang chọn, và switch khi offline không lòi dữ liệu hộ khác.
8. **Rời hộ / bị xóa khỏi hộ**: sau `removeMember` chính mình (handler leave ~L4014) hoặc realtime phát hiện mất quyền → `enterApp()` chạy lại; `listHouseholds()` còn hộ khác → vào `list[0]`; hết hộ → `NO_HOUSEHOLD` → onboarding. Logic fallback `found || list[0]` trong `ensureHousehold` giữ nguyên (tự xử lý `mm_active_household` trỏ tới hộ đã rời).
9. **Đăng xuất xóa lựa chọn hộ? KHÔNG.** Giữ `mm_active_household` qua các phiên (thiết bị cá nhân, đăng nhập lại vào đúng hộ đang dùng là UX đúng). `signOut` chỉ reset biến `household = null` như hiện tại.
10. **Phát hiện bị xóa khỏi hộ khi app đang mở** (không có, Test #10 fail): `household_members` KHÔNG nằm trong danh sách realtime (store.js ~L971–983) và RLS chỉ lọc rỗng chứ không báo lỗi → máy bị xóa sẽ nhìn hộ trống đến khi reload. Phải: (a) thêm subscription `household_members` filter theo `household_id`; (b) store.js export **`clearHousehold()`** (`household = null; setActiveId('')` — hiện không có đường reset ngoài removeMember/signOut); (c) app.js sau khi nạp `householdMembers`, nếu user hiện tại không còn trong danh sách → còn hộ khác thì `switchHousehold(list[0].id)` + `enterApp()`, hết hộ thì `clearHousehold()` + `showAuth('household')`. Lỗi mạng khi kiểm tra → giữ nguyên hiện trạng (không văng user oan).
11. **Chống flash app-shell rỗng**: `enterApp()` hiện bỏ ẩn `appShell` TRƯỚC khi `loadData()` chạy (~L4252–4254) → tài khoản mới sẽ thấy shell rỗng lóe lên rồi mới về onboarding. Dời `hideAuth()` + ẩn `#loading` + hiện `appShell` xuống SAU try/catch `loadData` (nhánh `NO_HOUSEHOLD` return trước đó): splash "Đang khởi động…" giữ nguyên đến khi có dữ liệu hoặc chuyển thẳng sang onboarding, không qua trạng thái trung gian.
12. Vanilla JS, không thư viện mới; mọi chuỗi UI đủ `vi` + `en` trong `I18N`; mọi nút gọi server bọc **`busy()`**; điều hướng code bằng banner comment `/* ===== section ===== */`.

---

## PHẦN A — Tầng dữ liệu (`js/store.js`)

1. **`createHousehold(name)`** (đặt cạnh `ensureHousehold`):
   ```js
   async function createHousehold(name) {
     const user = await getUser();
     if (!user) throw new Error(tr('errNotSignedIn', 'Chưa đăng nhập.'));
     const sb = getClient();
     const hhName = (name || '').trim();
     if (!hhName) throw new Error(tr('errEnterHhName', 'Vui lòng nhập tên hộ.'));
     const { data: h, error: e1 } = await sb.from('households')
       .insert({ name: hhName, created_by: user.id }).select().single();
     if (e1) throw new Error(e1.message);
     const { error: e2 } = await sb.from('household_members')
       .insert({ household_id: h.id, user_id: user.id, role: 'owner', email: user.email });
     if (e2) throw new Error(e2.message);
     household = { id: h.id, name: h.name, createdBy: h.created_by };
     setActiveId(household.id);
     try { await saveBudgetsInternal(h.id, DEFAULT_BUDGETS); } catch (e) { /* non-blocking */ }
     return household;
   }
   ```
2. **`ensureHousehold(user)`** (~L146): giữ nhánh `list.length` nguyên trạng; nhánh cuối (auto-create, ~L157–173) thay bằng `return null;`.
3. **`loadData()`** (~L387): `if (!household) { const h = await ensureHousehold(user); if (!h) { const err = new Error(...); err.code = 'NO_HOUSEHOLD'; throw err; } }`.
4. **Cache theo hộ**: chỗ ghi cache cuối `loadData` (~L456) dùng key `'data:' + household.id`; `getCachedData()` (~L99) → `idbGet('data:' + getActiveId())`.
5. **`clearHousehold()`**: `household = null; setActiveId('');` — dùng khi bị xóa khỏi hộ cuối cùng (xem Quyết định #10).
6. **`subscribeChanges`** (~L971): thêm `.on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter: 'household_id=eq.' + hid }, onChange)` — để máy khác thấy thành viên vào/ra realtime và máy bị xóa tự phát hiện.
7. Export thêm `createHousehold`, `clearHousehold` trong `window.Store` (giữ nguyên các export cũ).

> Không đụng `joinHousehold`, `switchHousehold` — đã đúng.

## PHẦN B — Onboarding chọn hộ (`js/app.js`, section Auth ~L4149–4243)

1. `renderAuth()`: thêm nhánh `authMode === 'household'`:
   ```
   auth-card:
     auth-brand (như login)
     auth-sub    = t('hhOnboardSub')  ("Bạn chưa thuộc hộ nào. Tạo hộ mới hoặc tham gia bằng mã mời.")
     label t('householdName') + input #aHhName (value gợi ý: t('hhDefaultPrefix') + ' ' + email-prefix)
     button #aCreateHh .primary-btn   = t('createHousehold')
     divider "— t('or') —"
     label t('joinHousehold') + input #aJoinCode (placeholder t('joinCodePh'))
     button #aJoinHh .primary-btn (hoặc secondary) = t('join')
     div #authError.auth-error.hidden
     button #aSignOut .link-btn.subtle = t('signOut')
   ```
2. `wireAuth()`: wire 3 nút mới —
   - `#aCreateHh` → `busy(btn, async () => { await Store.createHousehold(name); await enterApp(); })`, lỗi → `setAuthError`.
   - `#aJoinHh` → `busy(btn, async () => { await Store.joinHousehold(code); await enterApp(); })` (tái dùng thông báo lỗi `errInvalidCode` sẵn có).
   - `#aSignOut` → `await Store.signOut(); showAuth('login');`.
3. `enterApp()` (~L4256): trong `catch (err)`, **dòng đầu tiên**: `if (err && err.code === 'NO_HOUSEHOLD') { showAuth('household'); return; }` — trước fallback cache. Đồng thời dời `hideAuth()` + ẩn `#loading` + hiện `appShell` xuống SAU try/catch (Quyết định #11 — chống flash).
4. **Phát hiện bị đá khỏi hộ** (Quyết định #10): helper `handleEvicted()` — `listHouseholds()`; lỗi mạng → return false (giữ nguyên); còn hộ → `switchHousehold(list[0].id)` + `enterApp()`; hết hộ → `Store.clearHousehold()` + `showAuth('household')`; return true khi đã điều hướng. Gọi trong `enterApp()` (sau khi nạp `householdMembers`) và trong `refreshData()` khi `currentUserId` không còn trong `householdMembers` (danh sách rỗng từ query thành công = chắc chắn không còn là member; catch lỗi mạng giữ giá trị cũ nên không báo nhầm).

## PHẦN C — Trang Settings → Hộ gia đình (`js/app.js` page `'household'` ~L3122 + handlers ~L3952–4030)

1. **Danh sách hộ thay cho `<select>`**: bỏ block `switchSel` (~L3124–3127). Đầu trang render `iosGroup` "**Hộ của tôi**" từ `myHouseholds`:
   - Hộ active: `iosRow` có checkmark (`icon('check')`), không có `data-switch`, thêm class mờ nhẹ hoặc tint xanh.
   - Hộ khác: `iosRow` với `data-switch="<id>"`; handler (thay handler `#switchHh` ~L4027): `busy` phần tử → `await Store.switchHousehold(id); await enterApp();` — lỗi (ví dụ đã bị xóa khỏi hộ) → toast + `enterApp()` để tự chọn lại. Lưu ý: `busy()` viết cho button — nếu spinner trên `iosRow` hiển thị xấu, chỉ cần set `pointer-events:none` + opacity trong lúc chờ (không chế thêm cơ chế).
   - Luôn hiển thị group này kể cả khi chỉ có 1 hộ (để chỗ đặt nút tạo hộ, và user hiểu mình đang ở hộ nào).
2. **Nút "＋ Tạo hộ mới"** dưới group (pattern nút thêm ví/khoản định kỳ hiện có): bấm → hiện 1 hàng input tên + nút Lưu (hoặc `prompt` đơn giản theo pattern rename hiện tại — chọn cách ít code hơn, nhất quán với trang) → `busy` → `Store.createHousehold(name)` → toast `t('hhCreated')` → `await enterApp()` (tự nhảy sang hộ mới vì `createHousehold` đã `setActiveId`).
3. Các phần còn lại của trang (đổi tên — owner, mã mời + copy, tham gia hộ bằng mã, rời hộ ở trang thành viên) **giữ nguyên vị trí và hành vi**; chỉ đảm bảo sau join thành công handler hiện có (~L3967–3975) vẫn `enterApp()`.
4. **Rời hộ cuối cùng**: handler leave (~L4014–4023) đã gọi `enterApp()` → giờ tự rơi vào `NO_HOUSEHOLD` → onboarding. Không code thêm.

## PHẦN D — i18n (đủ vi + en, thêm vào `I18N` app.js)

```
hhOnboardSub:   'Bạn chưa thuộc hộ nào. Tạo hộ mới cho gia đình mình, hoặc dán mã mời để tham gia hộ có sẵn.'
                / 'You are not in any household yet. Create one for your family, or paste an invite code to join an existing one.'
createHousehold:'Tạo hộ mới'                / 'Create household'
myHouseholds:   'Hộ của tôi'                / 'My households'
currentHh:      'Đang xem'                  / 'Current'
hhCreated:      'Đã tạo hộ mới.'            / 'Household created.'
hhSwitched:     'Đã chuyển hộ.'             / 'Switched household.'
errEnterHhName: 'Vui lòng nhập tên hộ.'     / 'Please enter a household name.'
or:             'hoặc'                      / 'or'
signOut:        (dùng key sẵn có nếu đã tồn tại — kiểm tra trước khi thêm)
```

Key sẵn có tái dùng: `householdName`, `joinHousehold`, `joinCodePh`, `join`, `joined`, `errInvalidCode`, `hhDefaultPrefix`, `switchHousehold` (đổi nghĩa thành tiêu đề nhóm nếu còn dùng).

## PHẦN E — CSS (`css/style.css`)

- Divider "hoặc" trong auth-card (`.auth-or`: 1 dòng flex, 2 gạch mờ 2 bên chữ) — thứ duy nhất có thể phải thêm; mọi thứ khác tái dùng `.auth-card`, `.ios-group`, `.iosRow`, `.link-btn`. Không thêm cơ chế mới.

---

## QUY TẮC CHUNG (bắt buộc)

1. **KHÔNG sửa `supabase-schema.sql`** — RLS/guard hiện tại đã đúng và đủ. Không thêm bảng, không thêm RPC.
2. **KHÔNG tự tạo hộ ngầm ở bất kỳ đường code nào** — mọi hộ mới đều đi qua `createHousehold(name)` do user bấm.
3. Switch hộ chỉ bằng `Store.switchHousehold(id)` + `enterApp()`; không tự nạp lẻ tẻ từng loại dữ liệu.
4. Cache IndexedDB key theo `household.id`; không bao giờ hiển thị cache của hộ khác với `mm_active_household`.
5. Lỗi `NO_HOUSEHOLD` phải bắt TRƯỚC nhánh fallback cache trong `enterApp()`.
6. Mã mời giữ nguyên là UUID hộ (không đổi cơ chế join ở phiên bản này).
7. Mọi nút server bọc `busy()`; i18n đủ vi+en; vanilla JS, không thư viện mới.
8. Commit theo Conventional Commits (`feat: …`), KHÔNG tự bump version/`?v=` (CI làm). `sw.js` không đổi → không bump `VERSION`.
9. Đoạn seed AI key một lần trong `enterApp` (~L4278) giữ nguyên — chấp nhận việc key cục bộ được seed vào hộ mới tạo nếu browser còn key trong localStorage (hành vi sẵn có, không mở rộng).

---

## TEST TAY

1. **Tài khoản mới tinh**: đăng ký → đăng nhập → thấy màn hình "Tạo hộ / Tham gia hộ" (KHÔNG tự vào app, KHÔNG có hộ "Gia đình của xxx" tự sinh trong DB). Tạo hộ "Nhà Bin" → vào app, Settings → Hộ gia đình hiện "Nhà Bin", role owner, budgets mặc định đã seed.
2. **Join từ onboarding**: tài khoản mới thứ hai + mã mời của "Nhà Bin" → tham gia thành công, vào thẳng app, thấy đúng dữ liệu "Nhà Bin", role member. Mã sai → báo `errInvalidCode`, vẫn ở onboarding.
3. **User cũ đã có hộ**: đăng nhập → vào thẳng hộ active như trước (không thấy onboarding).
4. **Tạo hộ thứ hai** từ Settings → "＋ Tạo hộ mới" ("Hộ bố mẹ") → app chuyển ngay sang hộ mới (trống, ví mặc định tự tạo); nhóm "Hộ của tôi" liệt kê 2 hộ, checkmark đúng chỗ.
5. **Switch**: chạm "Nhà Bin" trong danh sách → toàn bộ Tổng quan/Giao dịch/Ví/Ngân sách/Danh mục/Thành viên đổi theo; thêm giao dịch → ghi đúng `household_id` của hộ đang xem; máy khác cùng hộ thấy realtime, máy đang xem hộ kia KHÔNG thấy.
6. **Cách ly dữ liệu**: user chỉ thuộc "Hộ bố mẹ" không thấy "Nhà Bin" trong danh sách, không đọc được giao dịch "Nhà Bin" (thử qua devtools query → RLS chặn).
7. **Offline sau switch**: đang ở "Hộ bố mẹ", tắt mạng, reload → hiện cache "Hộ bố mẹ" (không phải hộ khác).
8. **Rời hộ**: user 2 hộ rời 1 → nhảy sang hộ còn lại. Rời nốt hộ cuối → quay về màn hình onboarding (không tự sinh hộ mới trong DB).
9. **Bị xóa khỏi hộ đang xem** (owner xóa từ máy khác): máy bị xóa nhận realtime (subscription `household_members` mới) → tự chuyển sang hộ còn lại, hoặc về onboarding nếu hết hộ; không kẹt màn hình hộ trống. Mất mạng lúc kiểm tra → giữ nguyên, không văng oan.
10. Reload app nhiều lần: vẫn vào đúng hộ chọn cuối (`mm_active_household`); đăng xuất → đăng nhập lại: vẫn hộ đó.

---

## PHẦN F — Phase 2 (tuỳ chọn, KHÔNG làm ở v1)

- **Mã mời ngắn có hạn dùng/hết hạn** (bảng `invites` + RPC) thay cho lộ UUID hộ.
- **Xóa hộ** (owner, hộ rỗng hoặc confirm 2 bước) — hiện chỉ rời được.
- Badge **tên hộ trên header** (cạnh brand) + bottom-sheet switch nhanh không cần vào Settings.
- Thông báo in-app khi được thêm vào hộ mới (realtime trên `household_members` theo `user_id`).
- Đặt biểu tượng/màu cho từng hộ để phân biệt nhanh.

---

## KẾT QUẢ MONG ĐỢI

- ✅ Đăng nhập không còn tự sinh hộ; user chủ động tạo hộ (tự đặt tên) hoặc tham gia bằng mã mời ngay màn hình đầu.
- ✅ Một tài khoản nhiều hộ: danh sách "Hộ của tôi" trong Settings, chạm để switch, tạo thêm hộ bất kỳ lúc nào.
- ✅ Tiền bạc, ví, ngân sách, danh mục, thành viên, cài đặt chung — tất cả theo hộ đang active; chỉ thành viên của hộ mới thấy (RLS sẵn có, không đổi schema).
- ✅ Cache offline đúng hộ; rời/bị xóa khỏi hộ xử lý êm; user cũ không thấy khác biệt ngoài tính năng mới.

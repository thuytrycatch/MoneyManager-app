# Prompt: EMAIL BÁO CÁO THÁNG — tự động gửi tổng kết "chốt sổ" qua mail hàng tháng

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework; web tĩnh trên GitHub Pages; backend Supabase; đã có Edge Function `gold-price` làm mẫu).
>
> Triết lý: **email chỉ là kênh phân phối của snapshot "Chốt sổ tháng" đã có** (bảng `monthly_reports`, tính năng theo `docs/prompt-chot-so-thang.md`). Edge Function **KHÔNG tính lại số liệu** — không port `buildMonthlyClose` sang Deno (sẽ lệch số và duy trì 2 nơi). Nó chỉ đọc `metrics`/`ai_review` đã lưu và render thành email.

---

## MỤC TIÊU

1. Hàng tháng, **tự động gửi email tổng kết tháng trước** cho các thành viên của hộ: thu/chi/chênh lệch/tỷ lệ tiết kiệm, so tháng trước, danh mục top, ngân sách vượt/dưới, và nhận xét AI (nếu snapshot có).
2. **Opt-in theo hộ** (mặc định TẮT): owner/admin bật trong Cài đặt, chọn ngày gửi; có nút **"Gửi thử"** để nhận ngay 1 email mẫu.
3. Tháng **chưa chốt sổ** đến ngày gửi → gửi **email nhắc** owner/admin vào app chốt; sau khi chốt (dù trễ), báo cáo thật tự gửi ở lần chạy kế tiếp.
4. **Idempotent**: mỗi (hộ, tháng) chỉ gửi báo cáo **một lần**, cron chạy lại không gửi trùng.

### QUYẾT ĐỊNH THIẾT KẾ CỐT LÕI (đọc kỹ, đừng làm khác)

- **Nguồn số liệu = `monthly_reports.metrics` + `ai_review`** (jsonb do app tính bằng `buildMonthlyClose`, `js/app.js` ~L2235, lưu qua `upsertMonthlyReport`, `js/store.js` ~L783). Edge Function tuyệt đối **không** đọc bảng `transactions` để tự cộng.
- **Không gọi AI trong Edge Function.** `ai_review` có sẵn thì đưa vào email, không có thì bỏ section đó. (AI là opt-in lúc chốt sổ — giữ nguyên triết lý.)
- **Gửi mail bằng [Resend](https://resend.com)** qua `fetch` từ Deno (free tier đủ dùng: ~100 mail/ngày). `RESEND_API_KEY` là **secret của Edge Function** (`supabase secrets set`) — **tuyệt đối không** xuất hiện ở client/localStorage/`household_settings`. Lúc chưa verify domain riêng, dùng from `onboarding@resend.dev` để test.
- **Lịch chạy = pg_cron + pg_net gọi function MỖI NGÀY** (không phải mỗi tháng): function tự quyết gửi gì hôm nay. Nhờ vậy hộ chốt sổ trễ vẫn nhận báo cáo, và nhắc nhở chỉ bắn đúng `send_day`. Mẫu cron y hệt `supabase/functions/gold-price/README.md` (~L47–59).
- **Idempotency bằng cột mới `monthly_reports.email_sent_at`** — đã gửi thì stamp, lần sau skip. Email nhắc không cần state: chỉ gửi khi `hôm nay == send_day` (cron ngày chạy 1 lần → tối đa 1 nhắc/tháng).
- **Cấu hình lưu ở `household_settings.settings.EMAIL_REPORT`** (bảng đã có, member-đọc/manager-ghi, `supabase-schema.sql` ~L728; client ghi qua `saveHouseholdSettings`, `js/store.js` ~L803): `{ enabled: bool, sendDay: 1–28 (mặc định 3), lang: 'vi' }`. **KHÔNG** thêm key này vào `DB_CONFIG_KEYS` (`js/app.js` ~L28–36) — nó không phải config runtime của client, Settings UI đọc thẳng `DATA.aiConfig.EMAIL_REPORT`.
- **Người nhận = email của mọi thành viên hộ** (join `household_members` × `auth.users` bằng service role trong function). Không cho nhập email ngoài hộ ở v1 (tránh biến app thành máy spam).
- **Bảo mật 2 đường vào function**: (a) cron/scheduled → yêu cầu header `x-cron-secret` khớp secret `CRON_SECRET`; (b) client "Gửi thử" → gửi kèm JWT người dùng, function verify user là **owner/admin của hộ đó** và chỉ gửi tới **chính email người bấm**.
- **Riêng tư**: email chứa đúng phần số liệu tổng hợp của snapshot (vốn đã không có ghi chú giao dịch/tên người thụ hưởng). UI bật tính năng phải có dòng cảnh báo "báo cáo tài chính sẽ được gửi qua email tới mọi thành viên".

---

## BỐI CẢNH REPO (đọc trước khi code)

### Chốt sổ tháng — đã có sẵn (tái dùng, đừng đụng logic)
- Bảng `monthly_reports` (`supabase-schema.sql`): `household_id, period 'YYYY-MM', metrics jsonb, ai_review jsonb, closed_by, closed_at`, unique `(household_id, period)`. RLS: member đọc, admin ghi.
- Cấu trúc `metrics` (do `buildMonthlyClose` tạo — xem `js/app.js` ~L2235): `{ period, income, expense, net, savingsRate, prev:{income,expense,net}, avg3m, categories:[{category,amount,pct,prevAmount,deltaPct}], movers, budget:[{category,budget,spent,pctUsed,status}], recurring, recurringTotal, wins }`.
- Cấu trúc `ai_review`: `{ summary, observations[], suggestions[{action, category, estSaving, priority}] }` hoặc `null`.

### Edge Function mẫu — `supabase/functions/gold-price/`
- `index.ts`: Deno + `npm:@supabase/supabase-js@2`, dùng `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` được inject sẵn, header comment kiểu block, trả JSON `{ok, ...}`.
- `README.md`: format chuẩn của repo cho deploy/test/schedule (pg_cron + pg_net) — **bắt chước y hệt** cho function mới.

### Cài đặt hộ — client
- `saveHouseholdSettings(patch)` (`js/store.js` ~L803): merge patch vào jsonb `settings`, upsert. Load về ở `DATA.aiConfig` (`js/store.js` ~L418–421).
- Section cài đặt AI trong Settings (`js/app.js` ~L3605) — mẫu UI + quyền cho section email mới. Quyền: `canManageConfig()` (~L480). i18n: object `I18N` vi (~L60+) / en (~L230+), **mọi chuỗi mới phải đủ cả hai**.
- Gọi Edge Function từ client: dùng client supabase sẵn có — thêm wrapper `Store.sendTestMonthlyEmail()` dùng `sb.functions.invoke('monthly-email', { body: {...} })` (functions.invoke tự kèm JWT).

### Danh tính hộ & thành viên (cho function, service role)
- `household_settings.settings->'EMAIL_REPORT'` → hộ nào bật.
- `household_members(household_id, user_id, role)` + `auth.users.email` → danh sách người nhận; role `owner|admin` → người nhận email nhắc.
- `households.name` → tên hộ trong tiêu đề mail.

---

## PHẦN A — Schema (`supabase-schema.sql`, an toàn chạy lại)

Thêm ngay sau block `monthly_reports`:

```sql
-- Email báo cáo tháng: stamp chống gửi trùng (Edge Function monthly-email ghi
-- bằng service role — không cần đổi RLS/policy).
alter table public.monthly_reports add column if not exists email_sent_at timestamptz;
```

> Nhắc trong README/memory: **chạy lại `supabase-schema.sql`** sau khi merge (như mọi tính năng trước).

---

## PHẦN B — Edge Function `supabase/functions/monthly-email/index.ts`

Header comment kiểu `gold-price`. Luồng xử lý:

```
1. Auth:
   - header x-cron-secret == Deno.env.get('CRON_SECRET')  → mode 'cron'
   - ngược lại: verify JWT (createClient với anon key + Authorization của request,
     supabase.auth.getUser()) + body {test:true, householdId} → mode 'test'
     (kiểm tra user là owner/admin của householdId qua household_members)
   - cả hai đều fail → 401.

2. mode 'test':
   - đọc snapshot MỚI NHẤT của hộ (monthly_reports order by period desc limit 1);
     chưa có → 404 {ok:false, error:'no_snapshot'}.
   - render email, gửi tới DUY NHẤT email của người gọi, KHÔNG stamp email_sent_at.
   - trả {ok:true, sentTo:[email]}.

3. mode 'cron' (chạy mỗi ngày):
   - period = tháng TRƯỚC theo giờ VN ('Asia/Ho_Chi_Minh') dạng 'YYYY-MM';
     today = ngày trong tháng theo giờ VN.
   - lấy mọi household_settings có settings->'EMAIL_REPORT'->>'enabled' = 'true'.
   - VỚI TỪNG HỘ (try/catch riêng — 1 hộ lỗi không chặn hộ khác):
       sendDay = settings.EMAIL_REPORT.sendDay || 3 (clamp 1..28)
       nếu today < sendDay → skip.
       row = monthly_reports where household_id, period
       a) row tồn tại và email_sent_at null:
          → render báo cáo từ row.metrics + row.ai_review
          → gửi tới email mọi thành viên hộ
          → update email_sent_at = now()   (stamp SAU khi Resend trả 2xx)
       b) row tồn tại, đã stamp → skip (idempotent).
       c) row CHƯA tồn tại và today == sendDay:
          → gửi email NHẮC (ngắn: "Tháng {period} chưa chốt sổ — mở app để chốt,
            báo cáo sẽ tự gửi sau khi chốt") tới riêng owner/admin.
       d) row chưa tồn tại, today != sendDay → skip.
   - trả {ok:true, sent:n, reminded:n, skipped:n, errors:[...]}.
```

Gửi mail qua Resend:

```ts
const FROM = Deno.env.get("MAIL_FROM") || "BudgetManager <onboarding@resend.dev>";
async function sendEmail(to: string[], subject: string, html: string, text: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json",
               authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}` },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}
```

### Render email (thuần hàm, trong cùng file)
- **Subject**: `📊 BudgetManager — Báo cáo tháng {period} · {tên hộ}`.
- **HTML tự chứa, inline CSS** (email client không load CSS ngoài; bảng đơn giản, một cột, max-width 560px, hỗ trợ cả nền sáng): các section theo đúng thứ tự modal chốt sổ:
  1. Headline: Thu / Chi / Chênh lệch / Tỷ lệ tiết kiệm — kèm ▲▼% so tháng trước (tính từ `metrics.prev`, chỉ số học đơn giản trên dữ liệu có sẵn, không "tính lại nghiệp vụ").
  2. Top danh mục (tối đa 5): tên · số tiền · % tổng chi · Δ% so tháng trước.
  3. Ngân sách: các mục `status != 'ok'` (spent/budget, %).
  4. Biến động lớn nhất (`movers`).
  5. 🤖 Nhận xét AI (`ai_review.summary` + tối đa 3 `suggestions` kèm ước tính tiết kiệm) — **chỉ khi có**.
  6. Footer: link mở app (env `APP_URL`), dòng "Bạn nhận mail này vì hộ {tên} bật Báo cáo email trong Cài đặt — owner/admin có thể tắt ở đó." (Không làm link unsubscribe riêng ở v1.)
- **Plain-text fallback** cùng nội dung rút gọn.
- Số tiền: `new Intl.NumberFormat('vi-VN').format(n) + ' ₫'`. Ngày giờ theo `Asia/Ho_Chi_Minh`. Escape mọi chuỗi động (tên hộ, category, text AI) trước khi nhét vào HTML.

---

## PHẦN C — `supabase/functions/monthly-email/README.md` (format như gold-price)

- **Deploy**: `supabase functions deploy monthly-email`.
- **Secrets**: `supabase secrets set RESEND_API_KEY=re_xxx CRON_SECRET=<chuỗi ngẫu nhiên dài> MAIL_FROM="BudgetManager <bao-cao@ten-mien-cua-ban>" APP_URL=https://<user>.github.io/BugetManager/` — ghi rõ: from mặc định `onboarding@resend.dev` chỉ để test, production cần verify domain trong Resend.
- **Test**: 2 lệnh curl — (a) mode cron với `-H "x-cron-secret: ..."`, (b) ghi chú test từ app bằng nút "Gửi thử".
- **Schedule** (SQL Editor, cần pg_cron + pg_net — y mẫu gold-price nhưng kèm secret header):

```sql
select cron.schedule(
  'monthly-email-daily',
  '0 1 * * *',   -- 08:00 giờ VN (cron chạy UTC)
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/monthly-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    )
  );
  $$
);
```

---

## PHẦN D — Client: Cài đặt + Gửi thử (`js/app.js`, `js/store.js`)

1. **`js/store.js`**: thêm `sendTestMonthlyEmail()`:
   ```js
   async function sendTestMonthlyEmail() {
     if (!household) throw new Error(tr('errNoHousehold', 'Chưa có hộ.'));
     const sb = getClient();
     const { data, error } = await sb.functions.invoke('monthly-email', {
       body: { test: true, householdId: household.id },
     });
     if (error) throw new Error(error.message);
     if (data && data.ok === false) throw new Error(data.error || 'send failed');
     return data;
   }
   ```
   Export trong `window.Store`.
2. **Settings UI** (`js/app.js`, đặt cạnh section cấu hình AI ~L3605, chỉ hiện khi `canManageConfig()`):
   - Toggle **"Báo cáo email hàng tháng"** + select **ngày gửi** (1–28, mặc định 3) + dòng mô tả kèm cảnh báo riêng tư (`emailPrivacyNote`).
   - Nút **"Gửi thử"** (chỉ enable khi đã bật): gọi `Store.sendTestMonthlyEmail()`; bọc loading theo helper `busy()` nếu đã có (xem `docs/prompt-loading-hanh-dong.md`), toast kết quả. Lỗi `no_snapshot` → toast `emailNeedClose`.
   - Lưu: `DATA.aiConfig = await Store.saveHouseholdSettings({ EMAIL_REPORT: { enabled, sendDay } })` — đọc giá trị hiện tại từ `DATA.aiConfig && DATA.aiConfig.EMAIL_REPORT`.
   - Member thường: thấy trạng thái (bật/tắt) dạng chỉ-đọc hoặc ẩn hẳn section — theo đúng cách section AI đang xử lý, đừng chế cơ chế mới.
3. **i18n** (đủ `vi` + `en`):
   ```
   emailReport:      'Báo cáo email hàng tháng'   / 'Monthly email report'
   emailReportDesc:  'Tự gửi tổng kết tháng đã chốt sổ tới email các thành viên.' / 'Email the closed monthly summary to all members.'
   emailSendDay:     'Gửi vào ngày'               / 'Send on day'
   emailPrivacyNote: 'Báo cáo tài chính tổng hợp của hộ sẽ được gửi qua email tới mọi thành viên.' / 'The household’s aggregated financial report will be emailed to all members.'
   emailTestSend:    'Gửi thử'                    / 'Send test'
   emailTestSent:    'Đã gửi email thử tới {e}.'  / 'Test email sent to {e}.'
   emailNeedClose:   'Chưa có tháng nào được chốt sổ — hãy chốt sổ trước.' / 'No closed month yet — close a month first.'
   emailSaved:       'Đã lưu cài đặt email.'      / 'Email settings saved.'
   ```

---

## QUY TẮC CHUNG (bắt buộc)

1. **Không tính lại số liệu, không gọi AI** trong Edge Function — chỉ render `metrics`/`ai_review` đã lưu.
2. **Secrets chỉ ở Edge Function** (`RESEND_API_KEY`, `CRON_SECRET`); client không bao giờ thấy. Đường cron phải có `x-cron-secret`; đường test phải verify JWT + role owner/admin + chỉ gửi cho chính người bấm.
3. **Idempotent**: stamp `email_sent_at` sau khi Resend 2xx; cron chạy lại không gửi trùng; schema an toàn chạy lại (`add column if not exists`).
4. **Cô lập lỗi theo hộ**: try/catch từng hộ, gom vào `errors[]`, không throw cả batch.
5. Múi giờ **Asia/Ho_Chi_Minh** cho mọi phép "tháng trước"/"hôm nay" (server chạy UTC — sai múi giờ là gửi sớm/trễ 1 ngày, thậm chí lệch tháng vào ngày 1).
6. Email: HTML inline CSS tự chứa + plain-text fallback; escape chuỗi động; tiếng Việt mặc định.
7. Client: vanilla JS, tái dùng `saveHouseholdSettings`/`canManageConfig`/pattern section AI; mọi chuỗi đủ `vi`+`en`; không thêm thư viện.
8. Cập nhật README + memory: chạy lại schema, deploy function, set secrets, tạo cron — theo đúng checklist các tính năng trước.

---

## TEST TAY

1. Chạy lại `supabase-schema.sql` → cột `email_sent_at` xuất hiện; app cũ chạy bình thường.
2. Deploy function + set secrets (dùng from `onboarding@resend.dev`, RESEND key test). Trong app (owner): bật "Báo cáo email hàng tháng" → lưu OK; đăng nhập member thường → không sửa được.
3. Chưa chốt tháng nào → bấm **Gửi thử** → toast `emailNeedClose`. Chốt sổ một tháng → **Gửi thử** → nhận được email đúng số liệu (đối chiếu modal chốt sổ), có section AI nếu snapshot có `ai_review`.
4. Curl mode cron với `x-cron-secret` đúng, giả lập `today >= sendDay` (chỉnh tạm `sendDay` = hôm nay): hộ đã chốt → mail gửi tới **mọi thành viên**, `email_sent_at` được stamp; curl lần 2 → `skipped`, không mail trùng.
5. Curl thiếu/sai `x-cron-secret` và không JWT → 401. JWT của member thường gọi test → 403.
6. Hộ bật email nhưng **chưa chốt** và `today == sendDay` → chỉ owner/admin nhận mail nhắc; hôm sau chạy lại → không nhắc nữa; chốt sổ xong → lần chạy kế tiếp gửi báo cáo thật.
7. Tắt toggle → cron bỏ qua hộ này hoàn toàn.
8. Kiểm tra email trên Gmail mobile + desktop, nền sáng: layout 1 cột không vỡ, số tiền định dạng `vi-VN`, không lộ ghi chú giao dịch/tên người thụ hưởng.

---

## KẾT QUẢ MONG ĐỢI

- ✅ Hàng tháng, thành viên hộ nhận **email tổng kết tháng đã chốt sổ** (số liệu y hệt modal trong app + nhận xét AI nếu có), tự động, đúng ngày cấu hình, không gửi trùng.
- ✅ Chưa chốt tới ngày gửi → owner/admin được **nhắc chốt sổ**; chốt trễ vẫn nhận báo cáo.
- ✅ Bật/tắt + ngày gửi + **Gửi thử** ngay trong Cài đặt (chỉ owner/admin), có cảnh báo riêng tư.
- ✅ Toàn bộ secret nằm ở Edge Function; snapshot là nguồn sự thật duy nhất; schema an toàn chạy lại; pattern deploy/cron đồng nhất với `gold-price`.

---

## PHẦN E — Phase 2 (tuỳ chọn, không bắt buộc v1)

- Unsubscribe cá nhân (từng thành viên tự tắt nhận mail, lưu preference riêng).
- Đính kèm PDF báo cáo / biểu đồ dạng ảnh.
- Email tuần (digest ngắn) hoặc cảnh báo vượt ngân sách realtime qua mail.
- Tự động chốt sổ server-side nếu quá N ngày chưa chốt (cần port `buildMonthlyClose` — cân nhắc kỹ chi phí duy trì 2 bản logic).

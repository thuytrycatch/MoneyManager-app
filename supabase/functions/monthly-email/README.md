# monthly-email — Edge Function gửi báo cáo tháng qua email

Gửi **snapshot "Chốt sổ tháng"** (`monthly_reports.metrics` + `ai_review`) tới email
các thành viên hộ. Function **không tính lại số liệu** và **không gọi AI** — app tính
lúc chốt sổ, function chỉ render và gửi.

Luồng (cron chạy **mỗi ngày**, function tự quyết):

- Hộ bật `EMAIL_REPORT` + đã qua `sendDay` + tháng trước **đã chốt** và chưa gửi
  → gửi báo cáo cho **mọi thành viên**, stamp `email_sent_at` (chạy lại không gửi trùng).
- Chưa chốt và hôm nay **đúng** `sendDay` → gửi mail **nhắc** riêng owner/admin;
  chốt trễ thì lần chạy kế tiếp gửi báo cáo thật.
- Nút **"Gửi thử"** trong app gọi function với JWT: chỉ owner/admin, chỉ gửi tới
  chính email người bấm, không stamp.

## Deploy

```bash
supabase link --project-ref <PROJECT_REF>
supabase functions deploy monthly-email
```

## Secrets (bắt buộc trước khi dùng)

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxxx \
  CRON_SECRET=<chuỗi ngẫu nhiên dài, ví dụ openssl rand -hex 24> \
  MAIL_FROM="BudgetManager <onboarding@resend.dev>" \
  APP_URL=https://<user>.github.io/BugetManager/
```

- `RESEND_API_KEY`: tạo tại resend.com (free ~100 mail/ngày). **Không bao giờ**
  đặt key này ở client/localStorage.
- `MAIL_FROM`: `onboarding@resend.dev` chỉ để test (Resend chỉ cho gửi tới email
  của chính chủ tài khoản Resend). Production phải **verify domain** trong Resend
  rồi đổi thành `BudgetManager <baocao@ten-mien-cua-ban>`.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` được Supabase
  tự inject.

Yêu cầu schema: chạy lại `supabase-schema.sql` (cột `monthly_reports.email_sent_at`).

## Test sau khi deploy

Mode cron (quét mọi hộ đã bật):

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/monthly-email" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "x-cron-secret: <CRON_SECRET>"
```

- `{"ok":true,"period":"YYYY-MM","sent":n,"reminded":n,"skipped":n,"errors":[]}` → hoạt động.
- Gửi thử từ app: Cài đặt → Báo cáo email hàng tháng → **Gửi thử** (cần đã chốt ít
  nhất một tháng; mail chỉ tới email của bạn).
- Sai/thiếu `x-cron-secret` và không có JWT hợp lệ → 401. Member thường gọi test → 403.

## Lên lịch tự chạy (mỗi ngày)

Chạy trong SQL Editor (cần bật extension `pg_cron` + `pg_net` — Dashboard →
Database → Extensions):

```sql
select cron.schedule(
  'monthly-email-daily',
  '0 1 * * *',   -- 01:00 UTC = 08:00 giờ VN
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

## Cấu hình theo hộ (app ghi, function đọc)

`household_settings.settings.EMAIL_REPORT`:

```json
{ "enabled": true, "sendDay": 3 }
```

Owner/admin bật/tắt + chọn ngày gửi (1–28) trong app: **Cài đặt → Báo cáo email
hàng tháng**. Mặc định TẮT cho mọi hộ.

## Riêng tư & an toàn

- Email chứa **số liệu tổng hợp** của snapshot (không có ghi chú giao dịch, không
  tên người thụ hưởng) — đúng phần app đã lưu khi chốt sổ.
- Idempotent theo (hộ, tháng): stamp `email_sent_at` **sau khi** Resend nhận 2xx;
  gửi fail → lần chạy sau thử lại.
- Lỗi của một hộ không chặn các hộ khác (gom vào `errors[]`).
- Mọi phép "hôm nay/tháng trước" tính theo múi giờ `Asia/Ho_Chi_Minh`.

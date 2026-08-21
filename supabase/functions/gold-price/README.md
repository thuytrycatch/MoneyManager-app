# gold-price — Edge Function cập nhật giá vàng

Lấy giá vàng VN (vang.today → fallback SJC XML → BTMC), chuẩn hóa về **VND/chỉ**,
kiểm tra hợp lệ rồi ghi vào bảng dùng chung `public.gold_prices`. Client (app) chỉ
đọc bảng này — giá mới tự đẩy về mọi máy qua Supabase Realtime.

Ngoài giá hiện tại, mỗi lần chạy còn ghi **1 hàng/loại/ngày** vào
`public.gold_price_history` (lần chạy sau trong cùng ngày ghi đè → hàng của ngày
đó là giá chốt ngày). Bảng này nuôi biểu đồ "Giá vàng" ở màn Báo cáo.

> Cần chạy lại `supabase-schema.sql` để có bảng `gold_price_history`. Chưa chạy
> thì function vẫn cập nhật giá bình thường (`historyError` trong response cho
> biết bảng còn thiếu), app chỉ không vẽ được biểu đồ theo ngày.

## Nguồn giá chính: vang.today

`GET https://www.vang.today/api/prices` trả về mọi loại trong 1 lần gọi, giá tính
theo **lượng** (`normalizePerChi` chia 10). App dùng 2 mã:

| Mã trong API | Tên | kind trong DB |
|---|---|---|
| `SJL1L10` | SJC 9999 (vàng miếng) | `sjc` |
| `SJ9999`  | SJC Ring (nhẫn) | `ring9999` |

`change_buy` (mức tăng/giảm so với phiên trước) được dùng để suy ra giá đóng cửa
hôm qua khi bảng lịch sử còn rỗng, nhờ vậy biểu đồ có dữ liệu ngay ngày đầu. Hàng
suy ra không bao giờ ghi đè hàng đã ghi thật (`ignoreDuplicates`).

## Deploy

```bash
supabase link --project-ref <PROJECT_REF>
supabase functions deploy gold-price
```

Không cần secret gì thêm: `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` được
Supabase tự inject vào Edge Function.

## Test sau khi deploy (QUAN TRỌNG)

Nguồn giá VN hay chặn IP nước ngoài / đổi format. Sau khi deploy hãy gọi thử:

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/gold-price" \
  -H "Authorization: Bearer <ANON_KEY>"
```

- `{"ok":true,"source":"vang.today","updated":2,...}` → hoạt động tốt.
- `"historyError": "...relation ... does not exist"` → chưa chạy lại
  `supabase-schema.sql`; giá vẫn cập nhật, chỉ thiếu lịch sử theo ngày.
- `{"ok":false,...,"errors":[...]}` (HTTP 502) → cả 3 nguồn đều fail (thường do
  chặn IP datacenter). App **vẫn chạy bình thường** với giá cũ + badge "giá có
  thể đã cũ"; người dùng có thể dùng loại vàng "Tự nhập giá". Cách xử lý: đổi
  nguồn khác trong `index.ts` (webgia, doji, giavang…) hoặc cập nhật giá tay:

```sql
update public.gold_prices set buy_per_chi = 11500000, sell_per_chi = 11700000,
  source = 'manual', fetched_at = now() where kind = 'sjc';
```

- Giá bị `rejected` → giá parse được lệch >±25% so giá đang lưu hoặc nằm ngoài
  khoảng [5tr, 30tr]/chỉ. Nếu giá thị trường thật sự vượt khung, chỉnh env
  `GOLD_MIN_PER_CHI` / `GOLD_MAX_PER_CHI` (Project Settings → Edge Functions).

## Lên lịch tự chạy (mỗi 4 giờ)

Chạy trong SQL Editor (cần bật extension `pg_cron` + `pg_net` — Dashboard →
Database → Extensions):

```sql
select cron.schedule(
  'gold-price-4h',
  '0 */4 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/gold-price',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    )
  );
  $$
);
```

(App cũng tự gọi function này khi mở nếu giá cũ hơn 4h, nên cron chỉ là lớp
phụ — có cũng tốt, không có vẫn chạy. Riêng với biểu đồ giá theo ngày thì cron
đáng bật: không có nó, ngày nào không ai mở app sẽ khuyết một điểm trên biểu đồ.)

## Chống spam & giá bẩn

- Giá trong cache mới hơn **15 phút** → function trả cache luôn, không fetch nguồn.
- Giá parse ra phải nằm trong ±25% giá đang lưu (hoặc khung tuyệt đối khi chưa có
  giá) và `buy ≤ sell` — sai thì **giữ giá cũ**, không bao giờ ghi đè bằng 0/null.
- `jewelry` (vàng tây) không có nguồn công khai ổn định → giữ giá seed/tay;
  ví dùng `gold_factor` để chiết khấu tuổi vàng.

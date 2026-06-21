# 💰 Sổ Thu Chi — Quản lý thu chi gia đình (nhiều hộ)

Web app quản lý thu chi chạy trên **GitHub Pages** (miễn phí), nhập liệu bằng
**tiếng Việt tự nhiên**, dữ liệu lưu trong **database PostgreSQL của Supabase**.
Hỗ trợ **nhiều hộ gia đình** (mỗi người đăng nhập riêng, dữ liệu tách biệt bằng
Row Level Security), biểu đồ thống kê, cảnh báo ngân sách, song ngữ VI/EN, dark mode.

> Ví dụ nhập: `ăn sáng 35k` · `lương 15 triệu` · `đổ xăng 80k` · `cafe 2 triệu rưỡi` · `grab 1tr2`

---

## ✨ Tính năng

- 👨‍👩‍👧 **Nhiều hộ gia đình**: mỗi hộ có dữ liệu riêng; mời người thân bằng mã hộ.
- 🔐 **Đăng nhập** bằng email/mật khẩu (Supabase Auth).
- 🛡️ **Bảo mật** bằng Row Level Security — hộ này không đọc/ghi được dữ liệu hộ khác.
- 📝 Nhập giao dịch bằng tiếng Việt tự nhiên (Claude API hoặc regex dự phòng).
- 📊 Biểu đồ: donut theo danh mục, cột thu/chi, thanh tiến độ ngân sách.
- 🔔 Cảnh báo khi vượt 80% và 100% ngân sách.
- 📱 Mobile-first, bottom navigation, dark mode, song ngữ Việt / Anh.

---

## 🚀 Hướng dẫn triển khai

### 1. Tạo dự án Supabase (miễn phí)

1. Đăng ký tại <https://supabase.com> → **New project**.
2. Chọn **Region** gần Việt Nam (vd: *Southeast Asia — Singapore*).
3. Đặt mật khẩu database (lưu lại, không cần cho app).

### 2. Tạo bảng + bảo mật

Mở **SQL Editor → New query**, dán toàn bộ nội dung file
[`supabase-schema.sql`](supabase-schema.sql), bấm **Run**. (Chạy 1 lần là đủ.)

Việc này tạo các bảng `households`, `household_members`, `transactions`,
`budgets` và bật **RLS** để mỗi hộ chỉ thấy dữ liệu của mình.

### 3. Lấy thông tin kết nối

**Supabase → Settings → API**:

```
Project URL                     → SUPABASE_URL       (https://xxxx.supabase.co)
Project API keys → anon public  → SUPABASE_ANON_KEY  (eyJhbGciOi...)
```

> ✅ `anon key` là **khóa công khai**, an toàn để đặt trong trình duyệt — dữ liệu
> được bảo vệ bởi RLS. Đây là khác biệt lớn so với token GitHub trước đây.

### 4. Bật xác thực email

**Supabase → Authentication → Providers → Email**: bật **Email**.
- Để dùng nhanh, có thể tắt *"Confirm email"* (Authentication → Providers → Email →
  *Confirm email* = off) để đăng ký xong đăng nhập được ngay.

### 5. Triển khai lên GitHub Pages

```
Repo → Settings → Pages
   → Source: Deploy from a branch
   → Branch: main   /(root)  → Save
```

Truy cập `https://{username}.github.io/{repo-name}`, app sẽ hiện màn hình
**Kết nối Supabase** → nhập URL + anon key (lưu vào localStorage trình duyệt) →
**Đăng ký / Đăng nhập**.

> Nếu chạy cục bộ, có thể điền sẵn vào `config.js` (đã gitignore) cho tiện.

---

## 👨‍👩‍👧 Dùng cho nhiều hộ gia đình

- Mỗi người **đăng ký tài khoản** → tự động được tạo một **hộ** riêng.
- Muốn người thân cùng quản lý chung một hộ: vào **Cài đặt → Hộ gia đình →
  Sao chép mã**, gửi mã đó cho họ. Họ vào **Cài đặt → Tham gia hộ khác**, dán mã.
- Từ đó mọi thành viên trong hộ thấy chung giao dịch & ngân sách của hộ.

---

## 🤖 Tích hợp Claude API (tùy chọn)

Điền `ANTHROPIC_API_KEY` (Cài đặt → Claude API Key) để hiểu câu nhập tiếng Việt
chính xác hơn. Model dùng: **`claude-haiku-4-5`**. Không có key → tự động dùng bộ
phân tích **regex** (vẫn nhận diện `35k`, `80 nghìn`, `1.5tr`, `2 triệu rưỡi`...).

> ⚠️ API key Anthropic đặt trong trình duyệt có thể bị lộ — nên đặt **giới hạn
> chi tiêu** cho key và chỉ dùng cho app của riêng bạn/gia đình.

---

## 📁 Cấu trúc dự án

```
.
├── index.html              # Shell + nạp CDN (Chart.js, Supabase), scripts
├── supabase-schema.sql     # Lược đồ CSDL + RLS (chạy trong Supabase SQL Editor)
├── config.js               # Cấu hình cá nhân (gitignored, tùy chọn)
├── config.example.js       # Mẫu cấu hình
├── css/style.css           # Giao diện, dark mode, responsive, màn hình đăng nhập
└── js/
    ├── app.js              # Logic chính, i18n, điều hướng, đăng nhập, CRUD
    ├── store.js            # Lớp dữ liệu Supabase (Auth + hộ + giao dịch + ngân sách)
    ├── parser.js           # Phân tích tiếng Việt (Claude + regex)
    └── charts.js           # Biểu đồ Chart.js
```

---

## 🛠️ Chạy thử cục bộ

```bash
# Python
python -m http.server 8080
# rồi mở http://localhost:8080
```

Không cần build step, không cần npm install.

---

## ℹ️ Ghi chú

- Ứng dụng cần **kết nối mạng** để đọc/ghi dữ liệu (Supabase). Khi mất mạng vẫn
  hiển thị được dữ liệu đã tải lần gần nhất (cache IndexedDB) nhưng không ghi mới.
- Phiên bản trước lưu dữ liệu vào file JSON trên GitHub (`data/transactions.json`)
  và chỉ dùng cho 1 người — nay đã thay bằng Supabase.

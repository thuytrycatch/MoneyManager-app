# 💰 Chi Tiêu Việt — Quản lý chi tiêu cá nhân

Web app quản lý chi tiêu cá nhân chạy trên **GitHub Pages** (miễn phí), nhập
liệu bằng **tiếng Việt tự nhiên**, dữ liệu tự động lưu lên **GitHub repo** dưới
dạng JSON. Hỗ trợ biểu đồ thống kê, cảnh báo ngân sách, song ngữ VI/EN, dark
mode, và hoạt động cả khi offline (cache IndexedDB).

> Ví dụ nhập: `ăn sáng 35k` · `lương 15 triệu` · `đổ xăng 80k` · `cafe 2 triệu rưỡi` · `grab 1tr2`

---

## ✨ Tính năng

- 📝 Nhập giao dịch bằng tiếng Việt tự nhiên (Claude API hoặc regex dự phòng)
- 📊 Biểu đồ: donut theo danh mục, cột thu/chi theo ngày, thanh tiến độ ngân sách
- 🔔 Cảnh báo khi vượt 80% và 100% ngân sách
- 💾 Lưu tự động lên GitHub (debounce 2s tránh spam commit)
- 📱 Mobile-first, bottom navigation, dark mode
- 🌐 Song ngữ Việt / Anh
- ✈️ Offline-first: dữ liệu lưu IndexedDB, tự sync khi có mạng

---

## 🚀 Hướng dẫn triển khai

### 1. Fork / tạo repo

Fork repo này hoặc tạo repo mới (vd: `chi-tieu-viet`) trên tài khoản GitHub của bạn.

### 2. Tạo GitHub Personal Access Token

```
GitHub → Settings → Developer settings
   → Personal access tokens → Fine-grained tokens
   → Generate new token
       ┌─────────────────────────────────────────┐
       │ Repository access:  Only select repos    │
       │   ▸ chọn repo lưu dữ liệu (chi-tieu-viet) │
       │ Permissions → Repository permissions:     │
       │   ▸ Contents:  Read and write   ✅         │
       └─────────────────────────────────────────┘
   → Generate token → SAO CHÉP (github_pat_...)
```

### 3. Điền thông tin vào `config.js`

```js
const CONFIG = {
  GITHUB_TOKEN: 'github_pat_xxxxxxxxxxxx',
  GITHUB_OWNER: 'tendangnhap',
  GITHUB_REPO:  'chi-tieu-viet',
  GITHUB_BRANCH: 'main',
  DATA_FILE_PATH: 'data/transactions.json',
  ANTHROPIC_API_KEY: '',   // tùy chọn — để trống vẫn chạy được
};
```

> ⚠️ `config.js` đã nằm trong `.gitignore` nên **không** bị commit lên repo công khai.
> Khi deploy lên GitHub Pages, bạn cần đẩy `config.js` lên (xem lưu ý bảo mật bên dưới).

### 4. Bật GitHub Pages

```
Repo → Settings → Pages
   → Source: Deploy from a branch
   → Branch: main   /(root)
   → Save
```

### 5. Truy cập

```
https://{username}.github.io/{repo-name}
```

---

## 🤖 Tích hợp Claude API (tùy chọn)

Điền `ANTHROPIC_API_KEY` để hiểu câu nhập tiếng Việt chính xác hơn (vd: phân
loại danh mục thông minh, hiểu "2 triệu rưỡi", "1tr2", "tiền điện tháng này").

- Model dùng: **`claude-haiku-4-5`** (nhanh, rẻ).
  > Lưu ý: prompt gốc ghi `claude-haiku-3-5` nhưng model đó **đã ngừng phục vụ**,
  > nên app dùng bản hiện hành `claude-haiku-4-5`.
- Gọi trực tiếp từ trình duyệt qua header `anthropic-dangerous-direct-browser-access: true`.
- Nếu không có key hoặc gọi lỗi → tự động dùng bộ phân tích **regex** (vẫn nhận
  diện được `35k`, `80 nghìn`, `1.5tr`, `2 triệu rưỡi`, `35.000`...).

---

## 🔒 Lưu ý bảo mật

- Token GitHub và API key đặt trong `config.js` ở **phía trình duyệt** → bất kỳ
  ai mở DevTools trên trang đã deploy đều có thể đọc được.
- ✅ Phù hợp cho **ứng dụng cá nhân riêng tư** (repo private, hoặc Pages chỉ mình bạn dùng).
- 🚫 Không dùng cho trang công khai nhiều người truy cập.
- Nên giới hạn quyền token (chỉ `Contents` của đúng 1 repo) và đặt **giới hạn chi tiêu** cho API key.

---

## 📁 Cấu trúc dự án

```
chi-tieu-viet/
├── index.html          # Shell + nạp CDN, scripts
├── config.js           # Cấu hình cá nhân (gitignored)
├── css/style.css       # Giao diện, dark mode, responsive
├── js/
│   ├── app.js          # Logic chính, i18n, điều hướng, CRUD
│   ├── github.js       # GitHub API + cache IndexedDB
│   ├── parser.js       # Phân tích tiếng Việt (Claude + regex)
│   └── charts.js       # Biểu đồ Chart.js
└── data/
    └── transactions.json   # Dữ liệu mẫu / schema
```

---

## 🛠️ Chạy thử cục bộ

Vì dùng `fetch` và module qua `<script>`, chỉ cần một static server:

```bash
# Python
python -m http.server 8080
# rồi mở http://localhost:8080
```

Không cần build step, không cần npm install.

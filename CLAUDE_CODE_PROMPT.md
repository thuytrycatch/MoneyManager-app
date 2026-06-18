# 🚀 Claude Code Prompt — Ứng dụng Quản lý Chi Tiêu Cá Nhân (Tiếng Việt)

## MỤC TIÊU
Xây dựng một web app quản lý chi tiêu cá nhân hoàn chỉnh, chạy trên GitHub Pages, lưu dữ liệu tự động lên GitHub repo dưới dạng file JSON thông qua GitHub API. Giao diện đẹp, mobile-first, hỗ trợ tiếng Việt và tiếng Anh, dark mode.

---

## CẤU TRÚC THƯ MỤC CẦN TẠO

```
chi-tieu-viet/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── github.js
│   ├── parser.js
│   └── charts.js
├── data/
│   └── transactions.json
└── config.js
```

---

## YÊU CẦU CHI TIẾT TỪNG FILE

### `config.js`
File cấu hình do người dùng điền, KHÔNG commit lên git (thêm vào .gitignore):
```js
const CONFIG = {
  GITHUB_TOKEN: '',        // Personal Access Token với quyền repo
  GITHUB_OWNER: '',        // GitHub username
  GITHUB_REPO: '',         // Tên repo, ví dụ: chi-tieu-viet
  GITHUB_BRANCH: 'main',
  DATA_FILE_PATH: 'data/transactions.json',
  ANTHROPIC_API_KEY: '',   // Claude API key để parse tiếng Việt
};
```

Thêm hướng dẫn comment rõ ràng bằng tiếng Việt trong file này.

---

### `data/transactions.json`
Schema dữ liệu chuẩn:
```json
{
  "version": "1.0",
  "lastUpdated": "2024-01-15T10:30:00Z",
  "budgets": {
    "Ăn uống": 3000000,
    "Di chuyển": 1000000,
    "Mua sắm": 2000000,
    "Giải trí": 1000000,
    "Sức khỏe": 500000,
    "Hóa đơn": 2000000,
    "Khác": 500000
  },
  "transactions": [
    {
      "id": "uuid-v4",
      "date": "2024-01-15",
      "time": "10:30",
      "rawInput": "ăn sáng 35k",
      "amount": 35000,
      "type": "expense",
      "category": "Ăn uống",
      "note": "ăn sáng",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

### `js/github.js`
Module xử lý GitHub API:

**Hàm cần implement:**
1. `readDataFile()` — Đọc file JSON từ GitHub repo qua API `GET /repos/{owner}/{repo}/contents/{path}`
2. `writeDataFile(data)` — Ghi file JSON lên GitHub qua API `PUT /repos/{owner}/{repo}/contents/{path}`, tự động tạo commit message kiểu `"chore: update transactions - 2024-01-15 10:30"`
3. `initRepo()` — Kiểm tra file tồn tại chưa, nếu chưa thì tạo mới với data mặc định
4. Xử lý lỗi network, token sai, rate limit với thông báo tiếng Việt rõ ràng
5. Local cache bằng IndexedDB để app vẫn hoạt động khi offline, sync lại khi có mạng

**Lưu ý quan trọng:** GitHub API yêu cầu content được encode base64. Xử lý đúng UTF-8 tiếng Việt khi encode/decode.

---

### `js/parser.js`
Module parse ngôn ngữ tự nhiên tiếng Việt bằng Claude API (`claude-haiku-3-5` để tiết kiệm chi phí):

**Các định dạng số tiền cần hỗ trợ:**
- `35k`, `35K` → 35,000
- `80 nghìn`, `80 ngàn` → 80,000
- `1tr`, `1.5tr`, `1tr2` → 1,000,000 / 1,500,000 / 1,200,000
- `500 nghìn`, `500k` → 500,000
- `35.000`, `35,000` → 35,000
- `2 triệu rưỡi` → 2,500,000

**Danh mục tự động phân loại:**
| Danh mục | Từ khóa gợi ý |
|---|---|
| Ăn uống | ăn, uống, cơm, phở, cafe, trà, bún, bánh, nhậu, beer |
| Di chuyển | xăng, xe, grab, taxi, bus, xe ôm, parking, đỗ xe |
| Mua sắm | mua, shop, quần áo, giày, túi, điện thoại, laptop |
| Giải trí | phim, game, du lịch, karaoke, gym, spa |
| Sức khỏe | thuốc, bệnh viện, khám, bác sĩ, pharmacy |
| Hóa đơn | điện, nước, internet, wifi, tiền nhà, thuê |
| Thu nhập | lương, thưởng, thu, nhận, chuyển khoản vào |
| Khác | (mặc định nếu không rõ) |

**System prompt cho Claude API:**
```
Bạn là assistant parse chi tiêu tài chính từ văn bản tiếng Việt. 
Trả về JSON với format: {"amount": number, "type": "expense"|"income", "category": string, "note": string}
- amount: số tiền (số nguyên, đơn vị VND)
- type: "income" nếu là thu nhập, "expense" nếu là chi tiêu
- category: một trong [Ăn uống, Di chuyển, Mua sắm, Giải trí, Sức khỏe, Hóa đơn, Thu nhập, Khác]
- note: mô tả ngắn gọn bằng tiếng Việt
Chỉ trả về JSON, không giải thích thêm.
```

**Fallback:** Nếu không có API key hoặc lỗi, dùng regex parse cơ bản vẫn hoạt động được.

---

### `js/charts.js`
Dùng Chart.js (CDN) vẽ 3 loại biểu đồ:

1. **Donut Chart** — Chi tiêu theo danh mục tháng hiện tại
   - Hiển thị % và số tiền từng danh mục
   - Legend custom bên dưới
   - Click vào slice để filter danh sách giao dịch

2. **Bar Chart** — Thu chi theo ngày trong tháng
   - 2 dataset: Thu nhập (xanh lá) và Chi tiêu (đỏ/cam)
   - Trục Y format VND rút gọn (35k, 1.2tr)

3. **Progress Bars** — Ngân sách theo danh mục
   - Màu xanh khi < 70%, vàng khi 70-90%, đỏ khi > 90%
   - Hiển thị số tiền đã dùng / tổng ngân sách

---

### `js/app.js`
Logic chính của ứng dụng:

**Các tính năng:**
1. **Nhập giao dịch** — Input text lớn, placeholder gợi ý "ăn sáng 35k", "lương 15 triệu", "đổ xăng 80k"
2. **Danh sách giao dịch** — Theo ngày, có filter theo danh mục và tháng
3. **Xóa / Sửa giao dịch** — Swipe to delete trên mobile, click icon trên desktop
4. **Cài đặt ngân sách** — Nhập ngân sách từng danh mục mỗi tháng
5. **Cảnh báo ngân sách** — Toast notification khi vượt 80% và 100%
6. **Stats tháng hiện tại** — Tổng thu, tổng chi, số dư, tiết kiệm được

**Navigation:**
- Bottom navigation bar trên mobile (4 tab: Trang chủ, Thêm, Thống kê, Cài đặt)
- Sidebar trên desktop

**i18n (đa ngôn ngữ):**
Tất cả text UI hỗ trợ 2 ngôn ngữ, toggle VI/EN ở header. Lưu preference vào localStorage.

```js
const I18N = {
  vi: {
    addTransaction: 'Thêm giao dịch',
    income: 'Thu nhập',
    expense: 'Chi tiêu',
    balance: 'Số dư',
    budget: 'Ngân sách',
    settings: 'Cài đặt',
    // ... đầy đủ
  },
  en: {
    addTransaction: 'Add transaction',
    income: 'Income',
    expense: 'Expense',
    balance: 'Balance',
    budget: 'Budget',
    settings: 'Settings',
    // ... đầy đủ
  }
};
```

---

### `css/style.css`
**Yêu cầu thiết kế:**
- Mobile-first, responsive breakpoint tại 768px
- CSS Variables cho theme (light/dark):
```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --accent: #4f46e5;        /* Indigo */
  --income: #10b981;        /* Xanh lá */
  --expense: #ef4444;       /* Đỏ */
  --warning: #f59e0b;       /* Vàng */
  --border: #e5e7eb;
  --shadow: rgba(0,0,0,0.08);
}
[data-theme="dark"] {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --border: #2d3748;
  --shadow: rgba(0,0,0,0.3);
}
```
- Font: Inter (Google Fonts) hoặc system-ui
- Card style với border-radius 12px, subtle shadow
- Smooth transitions 200ms
- Bottom nav fixed trên mobile
- Input area nổi bật, dễ thao tác bằng ngón tay (min-height 48px)

---

### `index.html`
- Load Chart.js từ CDN: `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js`
- Load config.js TRƯỚC các file js khác
- Meta viewport đúng cho mobile
- PWA meta tags (theme-color, apple-mobile-web-app-capable)
- Màn hình loading đẹp khi khởi động (kiểm tra config, kết nối GitHub)

---

## QUY TẮC QUAN TRỌNG

1. **Format tiền VND:** Luôn dùng `Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND'})` hoặc rút gọn: 35.000₫, 1,2tr₫
2. **UUID:** Dùng `crypto.randomUUID()` để tạo ID giao dịch
3. **Ngày giờ:** Lưu ISO 8601, hiển thị theo locale vi-VN
4. **Error handling:** Mọi lỗi đều hiện toast thông báo tiếng Việt, không crash app
5. **Offline first:** IndexedDB là source of truth, GitHub là backup cloud
6. **Không dùng framework:** Vanilla JS thuần, không cần build step
7. **Bảo mật:** Config.js trong .gitignore, KHÔNG hardcode API key vào source code
8. **GitHub rate limit:** Debounce 2 giây trước khi gọi GitHub API để tránh spam commits

---

## FILE `.gitignore`
```
config.js
.DS_Store
node_modules/
```

---

## FILE `README.md`
Tạo README hướng dẫn deploy tiếng Việt với các bước:
1. Fork repo
2. Tạo GitHub Personal Access Token (hướng dẫn chi tiết từng bước, có ảnh ASCII)
3. Điền thông tin vào `config.js`
4. Bật GitHub Pages (Settings → Pages → Branch: main)
5. Truy cập `https://{username}.github.io/{repo-name}`

---

## KẾT QUẢ MONG MUỐN

Sau khi chạy prompt này, Claude Code sẽ tạo ra một web app hoàn chỉnh:
- ✅ Chạy được ngay trên GitHub Pages (miễn phí)
- ✅ Nhập chi tiêu bằng tiếng Việt tự nhiên
- ✅ Dữ liệu tự động lưu lên GitHub repo dạng JSON
- ✅ Biểu đồ thống kê đẹp
- ✅ Cảnh báo ngân sách
- ✅ Hỗ trợ VI/EN
- ✅ Dark mode
- ✅ Mobile-friendly
- ✅ Offline hoạt động được (IndexedDB cache)

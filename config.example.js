/* =====================================================================
 *  config.example.js — MẪU cấu hình (Supabase)
 * ---------------------------------------------------------------------
 *  Bạn KHÔNG bắt buộc dùng file này. Trên bản chạy GitHub Pages, hãy nhập
 *  thông tin ngay trên màn hình "Kết nối Supabase" của app (lưu vào
 *  localStorage của trình duyệt).
 *
 *  Nếu muốn chạy CỤC BỘ tiện hơn: copy file này thành config.js rồi điền.
 *  (config.js đã nằm trong .gitignore nên không bị đẩy lên GitHub.)
 *
 *  LẤY THÔNG TIN Ở ĐÂU:
 *    Supabase → Project → Settings → API
 *      - Project URL            → SUPABASE_URL
 *      - Project API keys → anon public → SUPABASE_ANON_KEY
 *
 *  ⚠️ anon key là khóa CÔNG KHAI, an toàn để đặt trong trình duyệt — dữ liệu
 *     được bảo vệ bởi Row Level Security (xem supabase-schema.sql).
 * ===================================================================== */
const CONFIG = {
  SUPABASE_URL: '',          // https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: '',     // eyJhbGciOi... (anon public key)
  ANTHROPIC_API_KEY: '',     // (tùy chọn) sk-ant-... để parse tiếng Việt bằng Claude
};
window.CONFIG = CONFIG;

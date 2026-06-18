/* =====================================================================
 *  config.example.js — MẪU cấu hình
 * ---------------------------------------------------------------------
 *  Bạn KHÔNG bắt buộc dùng file này. Trên bản chạy GitHub Pages, hãy nhập
 *  thông tin trong tab "Cài đặt" của app (token lưu localStorage trình duyệt,
 *  KHÔNG commit, KHÔNG public).
 *
 *  Nếu muốn chạy CỤC BỘ tiện hơn: copy file này thành config.js rồi điền.
 *  (config.js đã nằm trong .gitignore nên không bị đẩy lên GitHub.)
 * ===================================================================== */
const CONFIG = {
  GITHUB_TOKEN: '',          // token classic có quyền "repo"
  GITHUB_OWNER: '',          // username GitHub
  GITHUB_REPO: '',           // repo lưu dữ liệu (nên để Private)
  GITHUB_BRANCH: 'main',
  DATA_FILE_PATH: 'data/transactions.json',
  ANTHROPIC_API_KEY: '',     // (tùy chọn) sk-ant-...
};
window.CONFIG = CONFIG;

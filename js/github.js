/* =====================================================================
 *  github.js — Đồng bộ dữ liệu JSON lên GitHub repo + cache IndexedDB
 * ---------------------------------------------------------------------
 *  - readDataFile()      : đọc file JSON từ repo
 *  - writeDataFile(data) : ghi (debounce 2s) lên repo, tạo commit
 *  - initRepo()          : tạo file mặc định nếu chưa có
 *  - cache IndexedDB     : hoạt động offline, sync khi có mạng
 *  Dữ liệu encode base64 đúng UTF-8 (giữ nguyên tiếng Việt).
 * ===================================================================== */

(function () {
  'use strict';

  const API = 'https://api.github.com';

  const DEFAULT_DATA = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    budgets: {
      'Ăn uống': 3000000,
      'Di chuyển': 1000000,
      'Mua sắm': 2000000,
      'Giải trí': 1000000,
      'Sức khỏe': 500000,
      'Hóa đơn': 2000000,
      'Khác': 500000,
    },
    transactions: [],
  };

  let currentSha = null; // sha của file hiện tại trên GitHub (cần khi update)

  /* ---------------- Base64 UTF-8 ---------------- */
  function encodeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function decodeBase64(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
  }

  /* ---------------- IndexedDB cache ---------------- */
  const DB_NAME = 'chitieuviet';
  const STORE = 'kv';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* ---------------- Cấu hình & headers ---------------- */
  function cfg() {
    return window.CONFIG || {};
  }
  function isConfigured() {
    const c = cfg();
    return !!(c.GITHUB_TOKEN && c.GITHUB_OWNER && c.GITHUB_REPO);
  }
  function headers() {
    return {
      Authorization: 'Bearer ' + cfg().GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
  }
  function contentsUrl() {
    const c = cfg();
    return API + '/repos/' + c.GITHUB_OWNER + '/' + c.GITHUB_REPO +
      '/contents/' + c.DATA_FILE_PATH;
  }

  function friendlyError(status) {
    switch (status) {
      case 401: return 'Token GitHub không hợp lệ hoặc đã hết hạn.';
      case 403: return 'Bị từ chối hoặc vượt giới hạn GitHub API (rate limit).';
      case 404: return 'Không tìm thấy repo/file. Kiểm tra owner, repo, đường dẫn.';
      case 422: return 'Dữ liệu gửi lên không hợp lệ (có thể sai sha).';
      default:  return 'Lỗi GitHub API (mã ' + status + ').';
    }
  }

  /* ---------------- Đọc file ---------------- */
  async function readDataFile() {
    // Luôn lấy cache trước để có dữ liệu hiển thị ngay (offline-first)
    const cached = await idbGet('data').catch(() => null);

    if (!isConfigured() || !navigator.onLine) {
      return cached || DEFAULT_DATA;
    }

    try {
      const resp = await fetch(contentsUrl() + '?ref=' + cfg().GITHUB_BRANCH, {
        headers: headers(),
      });

      if (resp.status === 404) {
        // File chưa tồn tại
        return null;
      }
      if (!resp.ok) {
        throw new Error(friendlyError(resp.status));
      }

      const json = await resp.json();
      currentSha = json.sha;
      const data = JSON.parse(decodeBase64(json.content));
      await idbSet('data', data);
      await idbSet('sha', currentSha);
      return data;
    } catch (err) {
      console.warn('readDataFile lỗi, dùng cache:', err.message);
      if (cached) return cached;
      throw err;
    }
  }

  /* ---------------- Ghi file (lõi) ---------------- */
  async function pushToGitHub(data) {
    if (!isConfigured()) throw new Error('Chưa cấu hình GitHub trong config.js');
    if (!navigator.onLine) throw new Error('offline');

    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
    const body = {
      message: 'chore: update transactions - ' + stamp,
      content: encodeBase64(JSON.stringify(data, null, 2)),
      branch: cfg().GITHUB_BRANCH,
    };
    if (currentSha) body.sha = currentSha;

    let resp = await fetch(contentsUrl(), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body),
    });

    // sha cũ → thử lấy sha mới rồi ghi lại 1 lần
    if (resp.status === 409 || resp.status === 422) {
      const fresh = await fetch(contentsUrl() + '?ref=' + cfg().GITHUB_BRANCH, { headers: headers() });
      if (fresh.ok) {
        currentSha = (await fresh.json()).sha;
        body.sha = currentSha;
        resp = await fetch(contentsUrl(), {
          method: 'PUT', headers: headers(), body: JSON.stringify(body),
        });
      }
    }

    if (!resp.ok) throw new Error(friendlyError(resp.status));
    const json = await resp.json();
    currentSha = json.content.sha;
    await idbSet('sha', currentSha);
    return true;
  }

  /* ---------------- Ghi file (debounce 2s + cache) ---------------- */
  let writeTimer = null;
  let pendingData = null;

  function writeDataFile(data) {
    data.lastUpdated = new Date().toISOString();
    pendingData = data;
    // Lưu cache ngay lập tức (offline-first source of truth)
    idbSet('data', data).catch(() => {});
    idbSet('dirty', true).catch(() => {});

    return new Promise((resolve) => {
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(async () => {
        try {
          await pushToGitHub(pendingData);
          await idbSet('dirty', false);
          window.dispatchEvent(new CustomEvent('gh-sync', { detail: { ok: true } }));
        } catch (err) {
          window.dispatchEvent(new CustomEvent('gh-sync', { detail: { ok: false, error: err.message } }));
        }
        resolve();
      }, 2000); // chống spam commit
    });
  }

  /* ---------------- Khởi tạo repo ---------------- */
  async function initRepo() {
    const existing = await readDataFile();
    if (existing) return existing;
    // Chưa có file → tạo mới với dữ liệu mặc định
    const data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    currentSha = null;
    try {
      await pushToGitHub(data);
    } catch (err) {
      console.warn('Không tạo được file trên GitHub:', err.message);
    }
    await idbSet('data', data);
    return data;
  }

  /* ---------------- Sync lại khi có mạng ---------------- */
  async function syncIfDirty() {
    const dirty = await idbGet('dirty').catch(() => false);
    if (dirty && navigator.onLine && isConfigured()) {
      const data = await idbGet('data');
      if (data) {
        try {
          await pushToGitHub(data);
          await idbSet('dirty', false);
          window.dispatchEvent(new CustomEvent('gh-sync', { detail: { ok: true } }));
        } catch (err) {
          console.warn('syncIfDirty lỗi:', err.message);
        }
      }
    }
  }
  window.addEventListener('online', syncIfDirty);

  window.GitHubSync = {
    readDataFile,
    writeDataFile,
    initRepo,
    syncIfDirty,
    isConfigured,
    DEFAULT_DATA,
  };
})();

# Prompt: Tinh gọn & cá nhân hóa màn Báo cáo — bỏ cập nhật giá vàng thủ công, đưa Tài sản ròng lên đầu, card cấu hình hiển thị được

> ✅ **ĐÃ TRIỂN KHAI.** Các điểm khác/bổ sung so với đặc tả bên dưới:
> - `netWorthHtml()` giờ là `<section class="nw-card">` nền thường (không gradient), danh sách theo ví nằm trong `<details class="nw-detail">` **mặc định đóng** (nhớ trạng thái qua `localStorage.nwWalletsOpen`) để card đầu trang không đẩy bộ lọc kỳ xuống quá sâu.
> - Nhóm `rgAssets` chỉ còn thẻ Chốt sổ nên i18n đổi thành "Chốt sổ / Monthly close".
> - `Charts.bars()` nhận thêm tham số thứ 4 `opts.tooltipTitles` **và** bật `interaction: {mode:'index', intersect:false}` khi có tooltipTitles (chạm đâu trong cột cũng mở tooltip trên điện thoại).
> - Thêm dòng gợi ý `trendTapHint` dưới biểu đồ "Diễn biến thu chi" (chỉ hiện ở view tuần/tháng).
> - Giữ `Charts.mixed` cho `repDaily` (không đổi sang `Charts.lines`).
> - i18n mới: `byWallet`, `trendTapHint`, `reportCardsMgmt`, `reportCardsHint`, `monthOnlyNote`; đã xóa `updateGoldPrice`, `goldPriceUpdated`, `goldPriceUpdateFailed`.

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework, không build step; backend Supabase).
> Đây là bản nối tiếp `docs/prompt-sap-xep-man-bao-cao.md` (đã áp dụng: nhóm 6 khối tổng quan→chi tiết, `reportGroup`/`reportCard`). Prompt này KHÔNG lặp lại việc sắp xếp thứ tự nhóm — chỉ sửa/bổ sung 6 điểm bên dưới.

---

## PROMPT

Bạn là kỹ sư frontend làm việc trên app quản lý chi tiêu **Sổ Thu Chi** (HTML/CSS/JS thuần, không build step). Thực hiện 6 thay đổi trên màn **Báo cáo** (`viewReports()` trong `js/app.js`), áp dụng cho **cả 2 chế độ xem tuần và tháng** (mục 6 dưới đây). Chỉ đổi tầng hiển thị + thêm 1 cấu hình lưu `localStorage`; **không đổi schema Supabase, không đổi logic tính tổng/ngân sách/ví hiện có** trừ khi nêu rõ.

---

### BỐI CẢNH REPO (đọc trước khi code — mốc kiểm chứng 2026-08-20, có thể lệch nhẹ → tìm theo TÊN HÀM)

- `viewReports()` (`js/app.js` ~L2961–3050) đã theo cấu trúc 6 nhóm `rgOverview/rgFlow/rgStructure/rgAnalysis/rgDetail/rgAssets` (spec cũ). Helper `reportCard(inner)` (~L2692) bọc 1 card, trả `''` khi rỗng; `reportGrid`/`reportGroup(titleKey, cards)` (~L2696–2703) gom nhiều `reportCard` thành 1 khối lưới 2 cột, tự ẩn cả tiêu đề nhóm khi rỗng.
- `trendData(txs, range)` (~L2492–2506) sinh `{labels, inc, exp}` cho card **"Diễn biến thu chi"** (`t('trend')`, canvas `repTrend`): view tuần → 7 ngày từ `startOfWeek(reportAnchor)`, label chỉ là thứ trong tuần (`dows`: T2..CN), KHÔNG có ngày cụ thể; view tháng → chia theo cụm 7 ngày-của-tháng (`Math.floor((day-1)/7)`, KHÔNG phải tuần lịch), label chỉ là "Tuần 1".."Tuần N"; view năm → 12 tháng, không đổi (không thuộc phạm vi yêu cầu 1).
- `js/charts.js` → `bars(canvasId, labels, datasets)` (~L186–204): dùng ở đúng 2 nơi — `repTrend` (`viewReports` ~L2981) và `repBeneficiary` (~L2987). Khác `donut()` (~L137–183, đã có tham số `onClick`), `bars()` hiện KHÔNG nhận `onClick`/tooltip title tùy biến — `tooltip.callbacks` chỉ có `label`, title mặc định = label trục X.
- `netWorthHtml()` (~L2618–2688) đã là **1 hàm/1 card duy nhất**: section-title "Tài sản ròng · Hiện tại" → hero `.nw-hero` (số net worth) → `.summary-grid` 2 ô (Tổng tài sản/Tổng nợ) → `goldBar` (giá vàng + nút refresh) → 2 danh sách `.nw-list` (Tài sản/Nợ, từng ví qua closure `accRow`). Card này hiện nằm ở **nhóm cuối** `reportGroup('rgAssets', […])` (~L3045) — tức cuối trang, sau segment tuần/tháng/năm và mọi nhóm khác.
  ⚠️ `.nw-hero` (`css/style.css:408`) và `.wrap-card` (`css/style.css:909`, dùng bởi `reportWrapUpHtml()`) dùng **chung** `linear-gradient(135deg, var(--accent), var(--accent-2))`. Nếu chỉ kéo `netWorthHtml()` lên đầu mà không đổi style, trang sẽ có 2 khối gradient giống hệt nhau nằm sát nhau → cần phân biệt (xem mục 2).
- Nút **"Cập nhật giá vàng"**: render trong `netWorthHtml()` ~L2675 (`#goldRefreshBtn`, chỉ hiện khi có ví vàng dùng giá thị trường); handler click ~L5129–5141 (gọi `Store.refreshGoldPrices()` → `refreshData(true)` → toast `goldPriceUpdated`/`goldPriceUpdateFailed`). Tách biệt: `maybeRefreshGoldPrices()` (~L5147–5155) là auto-refresh **ngầm** khi mở app (TTL 4h, fire-and-forget, gọi tại boot ~L5112) — không có nút, không thuộc "tính năng cập nhật giá vàng" hiển thị trong báo cáo.
- `dailySpendHtml()` (~L2430–2491, card **"Chi tiêu theo ngày"**, `t('dailySpend')`, canvas `repDaily`, vẽ bằng `Charts.mixed`): 3 dataset — bar Thu nhập (`incBars`, từ `tx.type==='income'`), line Chi tiêu (`expLine`), line đứt Chuẩn ngân sách/ngày (`stdLine`). Chỉ chạy ở **view tháng** (`isMonth`, `viewReports` ~L3017) — không có bản tương đương cho tuần/năm.
- Tiền lệ toggle on/off kiểu "hiển thị theo máy": `hideAmounts`/`hideBalAvail`/`hideBalTotal` (~L702–707) — biến module-level đọc từ `localStorage`, đảo giá trị + `localStorage.setItem` trong click handler (~L4099–4114), rồi `render()`. Đây là pattern tái dùng cho "card nào hiện/ẩn" ở mục 4 — **không cần bảng DB mới**.
- Settings dùng `iosGroup([iosRow(…)], groupTitleKey)` (`settingsRoot()` ~L3295–3331) + trang con `settingsPage` (`settingsPageView()`, switch theo `settingsPage`, ~L3554+; ví dụ `'debts'`, `'activity'`, `'storage'`). Đây là nơi gắn mục Settings mới cho mục 4. Toggle dạng checkbox đã có tiền lệ ở `.w-allowtx` (~L3223, `<input type="checkbox">` thuần, không phải custom switch component).
- i18n: object `I18N` trong `js/app.js`, khối `vi` rồi khối `en`. Mọi card đang có sẵn đúng 1 key section-title: `insights`, `trend` ("Diễn biến thu chi" — khớp đúng tên trong yêu cầu 1 của người dùng), `dailySpend`, `byCategory`, `incomeByCat`, `budgetProgress`, `trendForecast`, `byBeneficiary`, `topSpending` — **tái dùng các key này** làm nhãn checkbox ở mục 4, không đặt tên mới.

---

### YÊU CẦU TRIỂN KHAI

#### 1+6. Card "Diễn biến thu chi": click vào 1 cột hiện khoảng ngày cụ thể (áp dụng cả tuần lẫn tháng)

- Sửa `trendData(txs, range)` (~L2492): trả thêm mảng `ranges` (song song `labels`), mỗi phần tử `{ from: Date, to: Date }`:
  - **week**: `from = to` = ngày cụ thể của cột đó (`startOfWeek(reportAnchor)` + i ngày) — hiện tại label chỉ ghi "T2".."CN" nên không biết là ngày nào, đây chính là phần cần bổ sung cho báo cáo tuần.
  - **month**: `from` = ngày `(w*7+1)`, `to` = `Math.min(days, (w+1)*7)` của tháng `reportAnchor` (dùng lại biến `days`/`weeks` đã có trong hàm).
  - **year**: giữ nguyên, KHÔNG thêm range (nhãn "T1".."T12" đã đủ rõ vì `period-label` phía trên đã ghi năm đang xem).
- Thêm helper `fmtDayRange(from, to)` gần `pad()`/`ymd()` (~L765): trả `"dd/mm"` nếu `from` và `to` cùng ngày, `"dd/mm – dd/mm"` nếu khác.
- Sửa `Charts.bars(canvasId, labels, datasets)` → thêm tham số thứ 4 tùy chọn `opts` (`js/charts.js` ~L186): `options.plugins.tooltip.callbacks` thêm `title: (items) => (opts && opts.tooltipTitles) ? opts.tooltipTitles[items[0].dataIndex] : undefined` (trả `undefined` → Chart.js tự dùng label mặc định). **Không đổi** lời gọi `repBeneficiary` (~L2987) — không truyền `opts`, giữ nguyên title mặc định.
- `viewReports()` (~L2981): truyền `{ tooltipTitles: td.ranges && td.ranges.map((r) => fmtDayRange(r.from, r.to)) }` vào `Charts.bars('repTrend', td.labels, […], opts)`.
- Đây là tooltip, không phải modal riêng: trên thiết bị cảm ứng, Chart.js hiện tooltip khi **tap** vào cột — đúng hành vi "click vào hiện thị" người dùng mô tả, không cần thêm DOM mới.

#### 2. Đưa "Tài sản ròng · Hiện tại" lên đầu trang, trước cả bộ lọc kỳ

Nội dung "Tài sản ròng" và "Tài sản" (danh sách ví) **đã nằm chung 1 hàm/1 card** (`netWorthHtml()`) — việc cần làm là **đổi vị trí** + **thiết kế lại cho gọn/nổi bật hơn**, không phải gộp thêm dữ liệu.

- Trong `viewReports()` (~L2996), chuyển `reportCard(netWorthHtml())` ra khỏi `reportGroup('rgAssets', […])` (~L3045) và render **full-width ngay trên** dòng `'<div class="seg period-seg">'` (tức trước cả segment tuần/tháng/năm và `period-nav`) — vì đây là snapshot tại thời điểm xem, không phụ thuộc kỳ đang lọc (đúng như người dùng nêu).
- `reportGroup('rgAssets', […])` sau đó chỉ còn `monthlyCloseCardHtml()` (`isMonth`); ở view tuần/năm nhóm này rỗng hoàn toàn → tự ẩn theo `reportGroup()` sẵn có, không cần code thêm.
- Bỏ dòng section-title lặp nghĩa `t('netWorth') + ' · ' + t('netWorthNow')` ở đầu `netWorthHtml()` — đứng riêng đầu trang rồi thì không cần nhãn nhóm nữa; giữ `.nw-hero-label` bên trong hero làm tiêu đề chính.
- **Tránh trùng giao diện với `.wrap-card`** (mục Bối cảnh, cả 2 đang dùng chung gradient `--accent`/`--accent-2`): đổi `.nw-hero` sang nền `.card` thường (`var(--bg-elev)` + `border: 1px solid var(--border)` + `var(--shadow)`, xem `css/style.css:149`), số Net worth nổi bật bằng cỡ chữ/độ đậm thay vì màu nền gradient. Giữ `.wrap-card` gradient nguyên trạng (nó đại diện "kỳ đang lọc", đứng trong nhóm Tổng quan) — nhờ vậy 2 khối phân biệt rõ: 1 cái "hiện tại" (card thường, đứng riêng trên cùng) và 1 cái "kỳ đang xem" (gradient, trong nhóm Tổng quan).
- Bố cục gợi ý bên trong card (đẹp hơn, gọn hơn — không bắt buộc theo đúng từng chi tiết, miễn giữ đủ thông tin hiện có): nhãn + số Net worth to ở trên cùng; ngay dưới 1 hàng nhỏ Tổng tài sản/Tổng nợ (giữ `.summary-grid` hiện có); gộp `goldBar` thành 1 dòng phụ nhỏ (chỉ còn "giá lúc…" + lãi/lỗ vàng sau khi bỏ nút refresh ở mục 3 — không cần khung `.gold-price-bar` to như hiện tại); danh sách theo ví (`.nw-list`) giữ nguyên bên dưới.
- CSS: cập nhật `css/style.css` — đảm bảo card mới (đứng ngoài `.report-grid`/`.dash-card`) full-width đúng trên cả mobile và desktop, không kế thừa margin/padding tính cho lưới 2 cột.

#### 3. Bỏ tính năng "Cập nhật giá vàng" thủ công

- Bỏ nút `#goldRefreshBtn` trong `netWorthHtml()` (~L2675) và toàn bộ handler click ~L5129–5141.
- **Giữ nguyên**: badge giá cũ (`priceStale`, ~L2667–2668), dòng "Giá lúc" (`priceUpdatedAt`), và `maybeRefreshGoldPrices()` (~L5147, auto-refresh ngầm TTL 4h khi mở app, gọi tại boot ~L5112) — đây là cơ chế **duy nhất còn lại** giữ giá không quá cũ; bỏ luôn cái này thì giá vàng sẽ đứng yên vĩnh viễn.
- Không đổi Edge Function `gold-price`, bảng `gold_prices`, hay `Store.refreshGoldPrices` — hàm vẫn được gọi bởi `maybeRefreshGoldPrices()`.
- i18n `updateGoldPrice`/`goldPriceUpdated`/`goldPriceUpdateFailed`: grep lại toàn repo sau khi xóa nút, chỉ xóa khối `vi`/`en` tương ứng nếu không còn nơi nào tham chiếu.

#### 4. Card báo cáo thiết kế theo từng khối, cấu hình hiển thị được bởi người dùng

- Định nghĩa 1 danh sách cố định (đặt cạnh `reportCard()`, `js/app.js`) đúng **9 card** hiện có thể bật/tắt — loại trừ wrap-up/summary-grid (luôn là tiêu đề đầu nhóm Tổng quan), loại trừ `monthlyClose` (là một hành động, không phải báo cáo), loại trừ Net worth (nay luôn hiện đầu trang theo mục 2):

  ```js
  const REPORT_CARD_KEYS = [
    { key: 'autoInsights',   labelKey: 'insights' },
    { key: 'trend',          labelKey: 'trend' },
    { key: 'dailySpend',     labelKey: 'dailySpend' },
    { key: 'byCategory',     labelKey: 'byCategory' },
    { key: 'incomeByCat',    labelKey: 'incomeByCat' },
    { key: 'budgetProgress', labelKey: 'budgetProgress' },
    { key: 'trendsForecast', labelKey: 'trendForecast' },
    { key: 'byBeneficiary',  labelKey: 'byBeneficiary' },
    { key: 'topSpending',    labelKey: 'topSpending' },
  ];
  ```

- Lưu cấu hình trong `localStorage` (đúng pattern `hideAmounts` — **không cần bảng/`household_settings`** vì đây là sở thích hiển thị theo máy/theo người, không phải config chia sẻ cả nhà): key `'reportCardsCfg'`, biến module-level `reportCardsCfg` khởi tạo `Object.assign({...tất cả true mặc định}, JSON.parse(localStorage.getItem('reportCardsCfg') || '{}'))`; hàm `setReportCardVisible(key, on)` ghi lại `localStorage` rồi `render()`. Mặc định TẤT CẢ `true` → không đổi hành vi người dùng cũ.
- Sửa chữ ký `reportCard(inner)` (~L2692) → `reportCard(key, inner)`: trả `''` ngay nếu `reportCardsCfg[key] === false` (không cần tính `inner`); ngược lại giữ hành vi cũ (bỏ qua khi `inner` rỗng). Cập nhật cả 9 lời gọi `reportCard(...)` liên quan trong `viewReports()` (~L3011–3046) để truyền đúng `key`; lời gọi `monthlyClose` không cần key (luôn hiện khi `isMonth`).
- Thêm 1 mục Settings: `iosRow({ ic: 'chart', tint: 'teal', label: t('reportCardsMgmt'), page: 'reportCards' })` (nhóm `grpGeneral` hoặc `grpMoney`, `settingsRoot()` ~L3316–3320) + case `'reportCards'` mới trong `settingsPageView()`: danh sách checkbox (`<input type="checkbox">` như `.w-allowtx`), mỗi dòng = nhãn `t(labelKey)` + `checked = reportCardsCfg[key] !== false`, đổi → `setReportCardVisible(key, checked)`.
- Card bị ẩn theo cấu hình nhưng vốn dĩ đã rỗng ở kỳ đó (vd `budgetProgress` ở view tuần) vẫn rỗng như cũ — cấu hình chỉ **ẩn thêm**, không "hiện ép" card không áp dụng cho kỳ đang xem.
- Cấu hình áp dụng chung mọi kỳ (không cấu hình riêng theo tuần/tháng/năm, tránh phức tạp hoá UI). Với 3 card chỉ chạy ở view tháng (`autoInsights`, `dailySpend`, `budgetProgress`): dù bật cấu hình, ở view tuần/năm vẫn không hiện — nên chú thích ngay trong màn quản lý (vd "(chỉ áp dụng cho báo cáo tháng)") để người dùng không tưởng nhầm là bug.

#### 5. "Chi tiêu theo ngày": bỏ dữ liệu thu nhập

- `dailySpendHtml()` (~L2430–2491): bỏ tính `incDay`/`incBars` (~L2435, 2441, 2454, 2463); mảng dataset chỉ còn line Chi tiêu (`expLine`) + line đứt Chuẩn ngân sách/ngày (`stdLine`, nếu có) — bỏ hẳn dataset `{ type:'bar', label: t('income'), data: incBars, … }`.
- Cân nhắc đổi `Charts.mixed('repDaily', …)` (~L2467) → `Charts.lines('repDaily', …)` (`js/charts.js` ~L225) vì không còn dataset dạng bar nào — so sánh options tooltip/scale giữa 2 hàm trước khi đổi để tránh lệch style; nếu không chắc, giữ `Charts.mixed` (vẫn chạy đúng với toàn line, chỉ là dùng thừa API).
- Cập nhật comment đầu hàm (~L2427–2429, đang ghi "…plus income per day (bars)") cho khớp code mới.
- Không đổi khối thống kê phụ (`stdPerDay`/`avg`/`over`/`peak`, ~L2480–2484) — các số này vốn chỉ tính trên `expDay`, không liên quan thu nhập.

#### 6. Áp dụng tương tự cho báo cáo tuần — tổng hợp theo từng mục

- Mục 1: đã xử lý chung tuần+tháng ở trên (`ranges` cho cả 2 kỳ trong cùng 1 hàm `trendData`).
- Mục 2 (Tài sản ròng lên đầu) và mục 3 (bỏ nút cập nhật giá vàng): áp dụng tự động cho **mọi kỳ** vì sửa ở 1 vị trí dùng chung (`netWorthHtml`/`viewReports`), không phải logic theo period — không cần sửa gì thêm riêng cho tuần.
- Mục 4 (card cấu hình): áp dụng chung mọi kỳ (xem quyết định ở mục 4 — không cấu hình riêng theo kỳ).
- Mục 5 (bỏ thu nhập khỏi "Chi tiêu theo ngày"): `dailySpendHtml()` vốn **chỉ chạy ở view tháng** — không có bản tương đương ở tuần để sửa. Xem "Ghi chú quyết định" bên dưới.

---

### QUY TẮC CHUNG
1. Không đổi schema Supabase — mọi thay đổi ở JS/CSS; cấu hình hiển thị lưu `localStorage` (không phải `household_settings`).
2. i18n đủ `vi`/`en` cho chuỗi mới (`reportCardsMgmt` + chú thích "chỉ áp dụng cho báo cáo tháng"); nhãn checkbox tái dùng key section-title sẵn có, không đặt tên mới.
3. Giữ nguyên toàn bộ id canvas hiện có (`repTrend`, `repDonut`, `repIncDonut`, `repDaily`, `repTrendLine`, `repBeneficiary`) và hành vi click legend donut (nhảy tab Giao dịch kèm filter) — không đổi.
4. Không tự bump version/`?v=` (release workflow tự lo), không sửa `sw.js`.
5. Test cả 3 chế độ kỳ (tuần/tháng/năm) + dark mode + mobile 1 cột trước khi coi là xong.

---

### Tiêu chí nghiệm thu
- [ ] Tap/click 1 cột trong card "Diễn biến thu chi" (view tuần hoặc tháng) hiện tooltip có khoảng ngày cụ thể (vd "08/06 – 14/06" cho tuần-trong-tháng, "08/06" cho 1 ngày-trong-tuần); view năm không đổi.
- [ ] Card "Tài sản ròng" nằm trên cùng trang Báo cáo, TRƯỚC segment tuần/tháng/năm, giữ đủ nội dung Tổng tài sản/Tổng nợ/danh sách ví, không còn trùng gradient với card tóm tắt kỳ (`.wrap-card`).
- [ ] Không còn nút "Cập nhật giá vàng" ở bất kỳ đâu trong Báo cáo; giá vẫn tự làm mới ngầm khi mở app (test: chỉnh `fetched_at` lùi >4h, mở lại app, giá tự cập nhật không cần thao tác gì).
- [ ] Settings có mục quản lý hiển thị báo cáo, tắt/bật từng card trong 9 card đã liệt kê; tắt → card biến mất khỏi Báo cáo ở MỌI kỳ áp dụng được; bật lại → hiện lại; mặc định (chưa từng đổi) = hiện tất cả như hiện tại.
- [ ] "Chi tiêu theo ngày" không còn cột/đường thu nhập, chỉ còn chi tiêu + chuẩn ngân sách/ngày.
- [ ] View tuần và năm không vỡ layout, không có heading mồ côi (cơ chế `reportGroup` sẵn có phải còn hoạt động đúng sau khi Net worth bị tách ra ngoài).
- [ ] Dark mode và mobile 1 cột không vỡ layout ở card Net worth mới (đứng ngoài `.report-grid`).

---

### Ghi chú quyết định (đề xuất — xác nhận lại nếu muốn khác)

- **Phạm vi mục 3 (bỏ cập nhật giá vàng):** chỉ bỏ NÚT bấm thủ công + toast liên quan. Auto-refresh ngầm (TTL 4h) và badge "giá có thể đã cũ" được giữ lại — nếu bỏ luôn, giá vàng sẽ không bao giờ tự cập nhật nữa và toàn bộ tính năng định giá vàng (Net worth, ví vàng) sẽ dùng số liệu đứng yên vĩnh viễn. Nếu ý người dùng là bỏ HẲN việc tự động lấy giá (kể cả ngầm), cần nêu rõ lại — khi đó card ví vàng nên chuyển hẳn sang nhập giá tay (`kind='custom'`) làm mặc định.
- **Phạm vi mục 4 (lưu cấu hình ở đâu):** chọn `localStorage` (theo máy/theo người dùng), không phải `household_settings` (chia sẻ cả nhà) — vì đây là sở thích hiển thị cá nhân (người thích xem nhiều/ít chi tiết khác nhau), giống hệt cách `hideAmounts` đang làm. Nếu muốn cả nhà luôn thấy cùng 1 bố cục báo cáo (đồng bộ qua các máy), cần đổi sang lưu trong `household_settings` (đã có RLS + hạ tầng đồng bộ sẵn theo `docs/prompt-cau-hinh-ai-database.md`) — tốn thêm 1 lượt đổi schema.
- **Cơ chế "click hiện khoảng ngày" (mục 1):** dùng tooltip Chart.js (hiện khi tap/hover), không mở modal/dòng chữ cố định riêng. Nếu muốn thông tin này LUÔN hiển thị sẵn (không cần tương tác) — vd 1 dòng nhỏ dưới biểu đồ liệt kê "Tuần 1: 01/06–07/06 · Tuần 2: 08/06–14/06 …" — nêu rõ lại, cách này tốn thêm chỗ hiển thị nhưng dùng được trên mọi thiết bị kể cả khi tooltip khó thao tác.
- **Mục 5/6 kết hợp:** `dailySpendHtml()` chỉ tồn tại ở view tháng; view tuần không có card "Chi tiêu theo ngày" riêng (biểu đồ theo-ngày của tuần chính là card "Diễn biến thu chi" ở mục 1, vốn vẫn hiện cả thu lẫn chi vì tên gọi "thu chi" bao hàm cả hai). Mặc định KHÔNG tạo thêm 1 card "Chi tiêu theo ngày" mới riêng cho tuần — nếu muốn có, đây là việc mới (thêm biểu đồ, không phải "sửa tương tự"), nên làm ở prompt riêng sau khi xác nhận nhu cầu.
- **Thiết kế lại Net worth (mục 2):** đổi nền gradient → nền `.card` thường để tránh trùng `.wrap-card`. Nếu muốn GIỮ gradient cho Net worth (vì nó vẫn là con số "nổi bật nhất trang") thì đổi `.wrap-card` sang nền thường thay vào đó — chọn 1 trong 2, không giữ cả hai cùng gradient.

---

### KẾT QUẢ MONG ĐỢI
- ✅ Card "Diễn biến thu chi" (tuần & tháng): click/tap 1 cột hiện rõ khoảng ngày của cột đó.
- ✅ Card "Tài sản ròng" đứng đầu trang Báo cáo, trước bộ lọc kỳ, giao diện gọn/nổi bật hơn, không trùng lặp với card tóm tắt kỳ.
- ✅ Không còn nút "Cập nhật giá vàng" thủ công; giá vẫn tự mới ngầm định kỳ.
- ✅ Toàn bộ card báo cáo (trừ tóm tắt kỳ, Net worth, Chốt sổ) bật/tắt được từ 1 màn quản lý trong Settings, lưu theo máy, mặc định giữ nguyên như hiện tại.
- ✅ "Chi tiêu theo ngày" chỉ còn dữ liệu chi tiêu, bỏ thu nhập.
- ✅ Mọi thay đổi áp dụng nhất quán cho cả báo cáo tuần lẫn tháng; view năm không bị ảnh hưởng ngoài ý muốn.

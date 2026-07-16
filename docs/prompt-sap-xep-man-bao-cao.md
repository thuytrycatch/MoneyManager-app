# Prompt: Sắp xếp lại màn Báo cáo — từ tổng quan đến chi tiết

> Dán prompt bên dưới cho AI coding agent (Claude Code / Cursor / …) để thực thi.
> Đặc tả viết riêng cho repo **BudgetManager** (vanilla JS, không framework; backend Supabase).

---

## PROMPT

Bạn là kỹ sư frontend làm việc trên app quản lý chi tiêu **Sổ Thu Chi** (HTML/CSS/JS thuần). Nhiệm vụ: **sắp xếp lại các khối báo cáo trong màn Báo cáo** (`viewReports()` trong `js/app.js`) theo trật tự khoa học **từ tổng quan → chi tiết** (nguyên tắc "kim tự tháp ngược" của dashboard: *cái gì đã xảy ra → diễn biến thế nào → tiền đi đâu → so với kế hoạch → chi tiết → tài sản & hành động*), kèm **tiêu đề nhóm** để người dùng lướt nhanh hiểu ngay cấu trúc. Chỉ đổi tầng hiển thị — **không đổi logic tính toán, không đổi schema**.

---

### HIỆN TRẠNG (thứ tự trong `viewReports()`, `js/app.js` ~dòng 2641–2721)

1. Segment chọn kỳ (tuần/tháng/năm) + nav mũi tên
2. Wrap-up card (`reportWrapUpHtml`)
3. Thẻ **Chốt sổ tháng** (`monthlyCloseCardHtml`, chỉ view tháng)
4. Summary grid 4 ô (thu / chi / tiết kiệm / tỷ lệ)
5. `.dash` 2 cột: **Xu hướng** (bars `repTrend`) + **Chi theo danh mục** (donut `repDonut`)
6. `.report-grid` (masonry) theo thứ tự DOM: Tiến độ ngân sách → Nhận định tự động (`autoInsightsHtml`) → Chi tiêu theo ngày (`dailySpendHtml`) → Xu hướng & dự báo (`trendsForecastHtml`) → Thu theo danh mục (donut `repIncDonut`) → Tài sản ròng (`netWorthHtml`) → Chi theo người (`byBeneficiaryHtml`) → Top chi tiêu

**Vấn đề:** các khối xếp lộn xộn giữa tổng quan/chi tiết (nhận định tổng quan nằm giữa trang, chốt sổ — một hành động — nằm trên cùng, tài sản ròng chen giữa các phân tích kỳ). Ngoài ra `.report-grid` dùng `column-count: 2` (css/style.css:723) — masonry đổ **dọc theo cột**, nên thứ tự DOM không còn là thứ tự đọc trái→phải trên màn rộng.

---

### THỨ TỰ MỚI — 6 nhóm, mỗi nhóm có tiêu đề

Giữ nguyên segment kỳ + nav trên cùng. Sau đó:

**NHÓM 1 — Tổng quan kỳ** (trả lời "kỳ này thế nào?")
1. Wrap-up card (giữ nguyên vị trí đầu)
2. Summary grid 4 ô
3. **Nhận định tự động** (`autoInsightsHtml`, view tháng) — kéo LÊN đây vì là tóm tắt bằng lời, thuộc tổng quan

**NHÓM 2 — Dòng tiền trong kỳ** (diễn biến theo thời gian)
4. Xu hướng thu–chi (`repTrend`)
5. Chi tiêu theo ngày (`dailySpendHtml`, view tháng)

**NHÓM 3 — Cơ cấu danh mục** (tiền đi đâu, đến từ đâu)
6. Chi theo danh mục (donut `repDonut`)
7. Thu theo danh mục (donut `repIncDonut`) — đặt CẠNH donut chi để đối chiếu
8. Tiến độ ngân sách (view tháng) — kiểm soát theo danh mục nên đứng ngay sau cơ cấu

**NHÓM 4 — Phân tích sâu & dự báo**
9. Xu hướng & dự báo nhiều tháng (`trendsForecastHtml`)
10. Chi theo người (`byBeneficiaryHtml`)

**NHÓM 5 — Chi tiết**
11. Top chi tiêu (danh sách 5 giao dịch lớn nhất)

**NHÓM 6 — Tài sản & hành động**
12. Tài sản ròng (`netWorthHtml`) — snapshot hiện tại, không phụ thuộc kỳ → để cuối
13. Thẻ **Chốt sổ tháng** — chuyển XUỐNG cuối: là hành động thực hiện *sau khi* đã xem xong báo cáo

---

### YÊU CẦU TRIỂN KHAI

1. **Tiêu đề nhóm:** thêm heading nhẹ giữa các nhóm (vd class `report-group-title`) — chữ nhỏ, uppercase, màu `--muted`, phân tách rõ nhưng không nặng nề. i18n đủ 2 khóa `vi`/`en` trong `I18N` (`js/app.js`), ví dụ: `rgOverview` "Tổng quan / Overview", `rgFlow` "Dòng tiền trong kỳ / Cash flow", `rgStructure` "Cơ cấu danh mục / Category breakdown", `rgAnalysis` "Phân tích & dự báo / Analysis & forecast", `rgDetail` "Chi tiết / Details", `rgAssets` "Tài sản & chốt sổ / Assets & closing".
2. **Nhóm rỗng phải ẩn cả tiêu đề.** Nhiều khối chỉ có ở view tháng (ngân sách, nhận định, chi theo ngày, chốt sổ) hoặc rỗng khi không có dữ liệu (thu theo danh mục, chi theo người, tài sản ròng). Tái dùng pattern `reportCard()` (bỏ qua khi rỗng, `js/app.js:2383`): build từng nhóm bằng helper kiểu `reportGroup(titleKey, cards[])` — join các card, nếu kết quả rỗng thì trả `''` (không render heading mồ côi).
3. **Sửa layout để thứ tự đọc đúng trên màn rộng:** thay MỘT `.report-grid` masonry toàn trang bằng **mỗi nhóm một grid riêng** (giữ `column-count: 2` / hoặc `display: grid` 2 cột trong từng nhóm, `break-inside: avoid` giữ nguyên). Như vậy trật tự nhóm luôn từ trên xuống; trong nội bộ một nhóm, 2 cột là chấp nhận được. Mobile giữ 1 cột như hiện tại. Cập nhật `css/style.css` (cả breakpoint 723 và 790) — đừng để nhóm chỉ có 1 card bị co nửa cột: cho card đơn chiếm cả hàng.
4. **Không đổi logic:** giữ nguyên toàn bộ hàm tính toán, id canvas (`repTrend`, `repDonut`, `repIncDonut`, `repDaily`, `repBeneficiary`), khối `setTimeout` vẽ chart, và hành vi click legend donut (nhảy sang tab Giao dịch với filter). Chỉ di chuyển vị trí chuỗi HTML trong `viewReports()`.
5. **Chốt sổ ở cuối vẫn phải dễ thấy:** giữ nguyên nút/primary style hiện có của `monthlyCloseCardHtml`; không cần thêm gì mới.
6. Kiểm tra cả 3 chế độ kỳ (tuần/tháng/năm): tuần & năm sẽ vắng nhiều khối tháng — các nhóm còn lại phải tự khép gọn, không để khoảng trống/heading thừa.
7. Tuân thủ convention repo: commit theo Conventional Commits (vd `feat: sắp xếp màn báo cáo theo nhóm tổng quan → chi tiết`), **không** tự bump version/`?v=`, không sửa `sw.js` (không đổi file cache).

---

### Tiêu chí nghiệm thu

- [ ] Thứ tự khối đúng như danh mục 1→13 ở trên; trên desktop thứ tự đọc theo nhóm từ trên xuống, không bị masonry xáo trộn giữa các nhóm.
- [ ] Mỗi nhóm có tiêu đề song ngữ vi/en; nhóm không có nội dung thì biến mất hoàn toàn (cả heading).
- [ ] View tuần và năm hiển thị gọn gàng (không heading mồ côi, không ô trống).
- [ ] Nhận định tự động nằm trong nhóm Tổng quan; Chốt sổ tháng nằm cuối trang và vẫn hoạt động (đóng/xem/chốt lại, AI review).
- [ ] Mọi chart vẫn vẽ đúng, click donut vẫn nhảy sang tab Giao dịch kèm filter; dark mode và mobile 1 cột không vỡ layout.

---

### Ghi chú quyết định (đề xuất — xác nhận lại nếu muốn khác)

- **Chốt sổ tháng chuyển từ đầu trang xuống cuối** (nhóm Tài sản & hành động) theo logic "đọc xong mới chốt". Nếu muốn giữ CTA chốt sổ nổi bật đầu trang thì bỏ mục 13 và giữ vị trí cũ — phần còn lại của spec không đổi.
- **Tài sản ròng để cuối** vì là snapshot hiện tại, không thuộc kỳ đang xem — tránh gây hiểu nhầm số liệu kỳ.
- Nhóm được đặt theo mạch: *kết quả → diễn biến → cơ cấu → phân tích → chi tiết → tài sản/hành động*.

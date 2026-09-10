# Thời khóa biểu điện tử — Trường PTDTBT TH & THCS Măng Cành

Hệ thống thời khóa biểu điện tử năm học 2026–2027: học sinh và phụ huynh xem
lịch không cần tài khoản; giáo viên, ban giám hiệu và quản trị viên đăng nhập
vào phần việc của mình.

> Hướng dẫn sử dụng bằng tiếng Việt (dễ hiểu, theo từng vai trò) nằm ngay
> trong website tại **`/huong-dan`** — cũng có trong menu dọc của giáo viên
> và quản trị viên.

## Tính năng chính

- **Trang công khai** (`/tkb`, `/hsv`): thời khóa biểu theo lớp (sáng/chiều
  riêng biệt), sổ tay học sinh, tìm kiếm không dấu. Chỉ hiển thị bản đã
  công bố.
- **Giáo viên** (`/gv`): lịch dạy cá nhân, khung "Hôm nay" (tiết hiện tại /
  kế tiếp), dạy thay & dạy bù, thông báo đẩy.
- **Ban giám hiệu** (`/bg`): tổng quan khối lượng, phân công giảng dạy,
  phê duyệt & công bố.
- **Quản trị viên** (`/admin`): trình soạn kéo-thả + sao chép (tiết/ngày/lớp),
  kiểm tra xung đột, phiên bản DRAFT → REVIEW → PUBLISHED, dạy thay/dạy bù,
  nhập/xuất Excel, in ấn, QR, quản lý tài khoản, nhật ký thao tác.
- **PWA**: cài lên màn hình chính, xem offline, nhận thông báo đẩy (Web Push).

## Vai trò & quyền

| Vai trò | Vào đâu | Đăng nhập? |
|---|---|---|
| Học sinh, phụ huynh | `/tkb`, `/hsv` | Không |
| Giáo viên | `/gv` | Có |
| Ban giám hiệu | `/bg` | Có |
| Quản trị viên | `/admin` | Có |

Tài khoản do quản trị nhà trường cấp (trang `/admin/tai-khoan`).

## Chạy trên máy lập trình

Yêu cầu: Node 20+, PostgreSQL (kèm cụm nhúng để phát triển).

```bash
npm install            # cài dependencies
npm run db:start       # khởi động PostgreSQL nhúng (port 5435)
npm run db:migrate     # áp dụng migration
npm run db:seed        # DEV ONLY: nạp dữ liệu mẫu Tuần 01 + tài khoản demo
npm run dev            # http://localhost:3000
```

Tài khoản demo (mật khẩu `Dev@12345` — chỉ dùng khi phát triển):
`admin`, `tkbadmin`, `principal`, `t01`–`t19`.

Kiểm tra chất lượng: `npm test` · `npm run lint` · `npx tsc --noEmit`.

## Triển khai lên VPS (Docker)

```bash
git clone <repo> && cd school-timetable
cat > .env <<'EOF'
POSTGRES_USER=school
POSTGRES_PASSWORD=<mật-khẩu-mạnh>
POSTGRES_DB=school_timetable
EOF
docker compose up -d --build     # db → migrate → app
```

Đặt HTTPS reverse proxy (Caddy/Nginx) trỏ tới cổng 3000. Chi tiết đầy đủ
(bao gồm câu trả lời cho "VPS mấy CPU/RAM là đủ", sao lưu, nâng cấp):
xem [`docs/deployment.md`](docs/deployment.md).

## Tài liệu

- Hướng dẫn sử dụng (tiếng Việt): `/huong-dan` trong website
- Kiến trúc: [`docs/architecture.md`](docs/architecture.md)
- Luật xếp thời khóa biểu: [`docs/timetable-rules.md`](docs/timetable-rules.md)
- API: [`docs/api.md`](docs/api.md)
- Triển khai: [`docs/deployment.md`](docs/deployment.md)
- Đặc thù máy tính hiện tại (SID chết, cụm PostgreSQL nhúng):
  xem ghi chú đầu file `AGENTS.md`

import type { Metadata } from "next";
import Link from "next/link";

import { PublicFooter, PublicHeader } from "@/components/site/public-chrome";
import { Icon, type IconName } from "@/components/ui/icon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hướng dẫn sử dụng — Măng Cành",
  description:
    "Hướng dẫn dùng hệ thống thời khóa biểu điện tử cho học sinh, phụ huynh, giáo viên, ban giám hiệu và quản trị viên.",
};

/**
 * /huong-dan — the in-app user manual, in plain Vietnamese, split by role.
 * Public (no login): the guide itself explains how to log in.
 * Sections are anchor targets — the sticky public header overlaps anchors,
 * hence scroll-mt-24 on every section.
 */

const PAPER = "#FAF7EF";

interface RoleCardProps {
  icon: IconName;
  bubbleClass: string;
  title: string;
  text: string;
  href: string;
}

function RoleCard({ icon, bubbleClass, title, text, href }: RoleCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-900/5 transition duration-200 hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${bubbleClass}`}>
          <Icon name={icon} size={20} />
        </span>
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
      </div>
      <p className="mt-2.5 flex-1 text-sm leading-snug text-stone-600">{text}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 group-hover:text-emerald-900">
        Xem hướng dẫn
        <Icon name="arrow-right" size={13} />
      </span>
    </Link>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-stone-900">{title}</p>
        <div className="mt-0.5 text-sm leading-relaxed text-stone-600">{children}</div>
      </div>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-stone-300 bg-stone-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-stone-700">
      {children}
    </kbd>
  );
}

function MenuPath({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-800">
      {children}
    </span>
  );
}

export default function GuidePage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col" style={{ backgroundColor: PAPER }}>
      <PublicHeader current="huong-dan" />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-8">
          <header className="mb-8">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Trường PTDTBT TH &amp; THCS Măng Cành
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">
              Hướng dẫn sử dụng
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
              Hệ thống thời khóa biểu điện tử. Chọn vai trò của bạn bên dưới để
              xem hướng dẫn chi tiết. Học sinh và phụ huynh <strong>không cần
              tài khoản</strong> — chỉ cần mở trang và xem.
            </p>
          </header>

          <nav aria-label="Vai trò" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <RoleCard
              icon="graduation-cap"
              bubbleClass="bg-emerald-100 text-emerald-800"
              title="Học sinh &amp; phụ huynh"
              text="Xem thời khóa biểu, sổ tay học sinh, cài app lên điện thoại."
              href="#hoc-sinh"
            />
            <RoleCard
              icon="book-open"
              bubbleClass="bg-amber-100 text-amber-800"
              title="Giáo viên"
              text="Xem lịch dạy, nhận thông báo dạy thay, dạy bù."
              href="#giao-vien"
            />
            <RoleCard
              icon="chart-column"
              bubbleClass="bg-teal-100 text-teal-800"
              title="Ban giám hiệu"
              text="Xem tổng quan, phê duyệt và công bố thời khóa biểu."
              href="#ban-giam-hieu"
            />
            <RoleCard
              icon="settings"
              bubbleClass="bg-rose-100 text-rose-700"
              title="Quản trị viên"
              text="Xếp lịch, dạy thay, nhập Excel, quản lý tài khoản."
              href="#quan-tri"
            />
          </nav>

          {/* ------------------------------------------------ hoc sinh */}
          <section id="hoc-sinh" className="mt-12 scroll-mt-24">
            <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                <Icon name="graduation-cap" size={17} />
              </span>
              Học sinh &amp; phụ huynh
            </h2>
            <ol className="mt-4 space-y-4">
              <Step n={1} title="Xem thời khóa biểu cả tuần">
                Mở trang <Link href="/tkb" className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2">Thời khóa biểu</Link>{" "}
                và bấm vào lớp của bạn (ví dụ: 6A). Buổi <strong>sáng</strong> và
                buổi <strong>chiều</strong> được chia riêng, kèm giờ học của
                từng tiết. Hôm nay được viền vàng cho dễ nhận.
              </Step>
              <Step n={2} title="Sổ tay học sinh">
                Trang <Link href="/hsv" className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2">Sổ tay học sinh</Link>{" "}
                cho biết <strong>tiết học kế tiếp</strong> hôm nay (còn bao lâu
                nữa đến giờ), toàn bộ lịch hôm nay và thông báo của lớp.
              </Step>
              <Step n={3} title="Tìm kiếm nhanh">
                Ô tìm kiếm trên trang thời khóa biểu hiểu cả chữ không dấu:
                gõ <em>“toan”</em> vẫn ra môn <em>Toán</em>, gõ <em>“nguyen thi”</em>{" "}
                ra danh sách giáo viên họ Nguyễn Thị.
              </Step>
              <Step n={4} title="Cài app lên màn hình chính (khuyên dùng)">
                Mỗi khu vực có <strong>ứng dụng riêng</strong> — cài từ đúng
                khu vực để mở thẳng vào việc mình cần, và app chỉ mở đúng khu
                vực đó:
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  <li>
                    <strong>Học sinh:</strong> mở trang{" "}
                    <Link href="/hsv" className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2">Sổ tay học sinh</Link>,
                    bấm <MenuPath>Cài đặt ứng dụng</MenuPath> → cài app{" "}
                    <em>“Sổ tay học sinh”</em>.
                  </li>
                  <li>
                    <strong>Phụ huynh / xem thời khóa biểu:</strong> mở trang{" "}
                    <Link href="/tkb" className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2">Thời khóa biểu</Link>,
                    bấm <MenuPath>Cài đặt ứng dụng</MenuPath> → cài app{" "}
                    <em>“TKB Măng Cành”</em>.
                  </li>
                  <li>
                    <strong>Giáo viên:</strong> mở trang{" "}
                    <Link href="/gv" className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2">Lịch dạy</Link>,
                    bấm <MenuPath>Cài đặt ứng dụng</MenuPath> trong menu bên trái
                    → cài app <em>“Lịch dạy”</em>.
                  </li>
                  <li>
                    <strong>Quản trị thời khóa biểu:</strong> mở trang{" "}
                    <Link href="/admin" className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2">Xếp thời khóa biểu</Link>{" "}
                    → cài app <em>“Quản trị nhà trường”</em>.
                  </li>
                  <li>
                    <strong>Ban giám hiệu:</strong> mở trang{" "}
                    <Link href="/bg" className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2">Tổng quan</Link>{" "}
                    → cài app <em>“Ban giám hiệu”</em>.
                  </li>
                </ul>
                Học sinh/phụ huynh chỉ nhìn thấy nút cài đặt của khu vực công
                khai — nút cài app giáo viên/quản trị chỉ xuất hiện sau khi
                đăng nhập, nên không thể cài nhầm. Nếu trước đây đã cài một app
                chung (TKB Măng Cành), hãy gỡ trước rồi cài lại từ đúng khu vực.
                App đã cài vẫn xem được thời khóa biểu khi mất mạng (phần đã
                xem trước đó).
              </Step>
            </ol>
          </section>

          {/* ------------------------------------------------ giao vien */}
          <section id="giao-vien" className="mt-12 scroll-mt-24">
            <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <Icon name="book-open" size={17} />
              </span>
              Giáo viên
            </h2>
            <ol className="mt-4 space-y-4">
              <Step n={1} title="Đăng nhập lần đầu — thiết lập tài khoản">
                Mở trang <Link href="/dang-nhap" className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2">Đăng nhập</Link>{" "}
                và dùng tài khoản do nhà trường cấp. <strong>Lần đầu đăng nhập</strong>,
                hệ thống yêu cầu thiết lập theo 3 bước: <strong>nhập email</strong> →{" "}
                <strong>đặt mật khẩu riêng</strong> → <strong>xác nhận email</strong>.
                Sau đó bạn đăng nhập bằng mật khẩu mới. (Quên mật khẩu: liên hệ
                quản trị để cấp lại — xem mục Câu hỏi thường gặp.)
              </Step>
              <Step n={2} title="Xem lịch dạy của tôi">
                Sau khi đăng nhập bạn sẽ vào trang{" "}
                <strong>Lịch dạy của tôi</strong>. Khung{" "}
                <strong>“Hôm nay”</strong> ở đầu trang cho biết tiết đang dạy,
                tiết kế tiếp và còn lại bao nhiêu tiết hôm nay. Bên dưới là lịch
                cả tuần — có thể đổi giữa dạng <em>Danh sách</em> và{" "}
                <em>Bảng</em>, lọc theo lớp hoặc môn học.
              </Step>
              <Step n={3} title="Đổi mật khẩu (tự làm, không cần nhờ ai)">
                Menu bên trái → <MenuPath>Tài khoản của tôi</MenuPath> → mục{" "}
                <strong>Đổi mật khẩu</strong>: nhập mật khẩu hiện tại và mật
                khẩu mới (tối thiểu 8 ký tự). Sau khi đổi, các thiết bị khác sẽ
                phải đăng nhập lại. Tại đây bạn cũng đổi được <strong>email
                liên hệ</strong>.
              </Step>
              <Step n={4} title="Dạy thay &amp; dạy bù">
                Khi được xếp dạy thay, trên lịch hiện nhãn màu{" "}
                <strong>“Dạy thay cho …”</strong> kèm tên giáo viên gốc. Tiết
                dạy bù có nhãn riêng. Bạn không cần làm gì thêm — chỉ cần đến
                đúng giờ.
              </Step>
              <Step n={5} title="Nhận thông báo trên điện thoại">
                Vào trang <strong>Thông báo</strong>, bấm{" "}
                <MenuPath>Bật thông báo</MenuPath> và đồng ý khi trình duyệt
                hỏi. Từ đó mọi thay đổi (đổi lịch, dạy thay, công bố lịch mới,
                thông báo chung của nhà trường) đều được gửi về điện thoại của
                bạn. Nên cài app (bước 4 phần học sinh) để nhận thông báo đầy
                đủ nhất. Gặp thông báo cũ: bấm{" "}
                <MenuPath>Đánh dấu tất cả đã đọc</MenuPath> hoặc{" "}
                <MenuPath>Xóa tất cả</MenuPath> (có hỏi xác nhận trước khi xóa).
                Muốn thông báo hiện trên màn hình khóa, xem mục Câu hỏi thường
                gặp bên dưới. Nếu lỡ bỏ qua thông báo đẩy, khi mở lại website
                bạn sẽ thấy <strong>dải nhắc màu vàng</strong> ở đầu trang — bấm
                “Xem thông báo” để đọc ngay.
              </Step>
              <Step n={6} title="In lịch dạy">
                Mở trang cần in, bấm tổ hợp <Kbd>Ctrl</Kbd> + <Kbd>P</Kbd> —
                trang sẽ in sạch sẽ, không có thanh menu.
              </Step>
            </ol>
          </section>

          {/* ------------------------------------------------ ban giam hieu */}
          <section id="ban-giam-hieu" className="mt-12 scroll-mt-24">
            <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-800">
                <Icon name="chart-column" size={17} />
              </span>
              Ban giám hiệu
            </h2>
            <ol className="mt-4 space-y-4">
              <Step n={1} title="Tổng quan toàn trường">
                Trang <strong>Tổng quan</strong> hiển thị khối lượng giảng dạy
                của từng giáo viên (dạy chính, kiêm nhiệm) và tình trạng các
                phiên bản thời khóa biểu.
              </Step>
              <Step n={2} title="Phê duyệt và công bố">
                Khi người xếp lịch gửi bản nháp để duyệt, danh sách phiên bản
                sẽ hiện nút <MenuPath>Phê duyệt</MenuPath>. Sau khi duyệt, bấm{" "}
                <MenuPath>Công bố</MenuPath> để chính thức áp dụng. Ngay lúc
                đó:
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  <li>Học sinh và phụ huynh thấy lịch mới trên trang công khai.</li>
                  <li>Mọi giáo viên nhận được thông báo.</li>
                  <li>Bản cũ được lưu lại (không mất) — có thể quay lại bất cứ lúc nào.</li>
                </ul>
              </Step>
              <Step n={3} title="Xem phân công giảng dạy">
                Trang <strong>Phân công giảng dạy</strong> liệt kê món học mỗi
                giáo viên phụ trách theo từng lớp, kèm tổng số tiết.
              </Step>
            </ol>
          </section>

          {/* ------------------------------------------------ quan tri */}
          <section id="quan-tri" className="mt-12 scroll-mt-24">
            <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                <Icon name="settings" size={17} />
              </span>
              Quản trị viên — xếp thời khóa biểu
            </h2>

            <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-stone-500">
              A. Soạn thời khóa biểu
            </h3>
            <ol className="mt-3 space-y-4">
              <Step n={1} title="Chọn tuần và tạo bản nháp">
                Vào trang <strong>Xếp thời khóa biểu</strong>, chọn tuần cần
                xếp, rồi bấm <MenuPath>Tạo bản nháp mới</MenuPath>. Có thể{" "}
                <em>nhân bản</em> tuần trước để sửa nhanh.
              </Step>
              <Step n={2} title="Thêm / sửa tiết học">
                Bấm vào ô trống trên lưới, chọn môn học và giáo viên, bấm{" "}
                <MenuPath>Lưu</MenuPath>. Để sửa, bấm vào tiết đã có. Hệ thống
                tự chặn việc xếp hai lớp cho cùng một giáo viên ở cùng một tiết.
              </Step>
              <Step n={3} title="Kéo-thả và sao chép">
                Kéo một tiết sang ô khác để dời. Giữ{" "}
                <Kbd>Ctrl</Kbd> khi kéo để <strong>sao chép</strong> sang ô
                mới. Còn có thể sao chép cả ngày{" "}
                (<MenuPath>Sao chép ngày</MenuPath>) hoặc cả lịch một lớp{" "}
                (<MenuPath>Sao chép lớp</MenuPath>) từ thanh công cụ.
              </Step>
              <Step n={4} title="Kiểm tra xung đột">
                Bấm <MenuPath>Kiểm tra</MenuPath> — hệ thống liệt kê mọi lỗi
                (trùng tiết, quá số tiết cho phép…) và cảnh báo nên xem lại.
                Chỉ được gửi duyệt khi không còn lỗi.
              </Step>
              <Step n={5} title="Hoàn tác">
                Bấm <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd> để hoàn tác thao tác vừa
                làm.
              </Step>
              <Step n={6} title="Gửi duyệt">
                Bấm <MenuPath>Gửi duyệt</MenuPath> — bản nháp sẽ chuyển cho
                ban giám hiệu phê duyệt và công bố (xem phần Ban giám hiệu ở
                trên). Học sinh chỉ thấy bản <strong>đã công bố</strong>.
              </Step>
            </ol>

            <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-stone-500">
              B. Dạy thay, hủy tiết, dạy bù
            </h3>
            <ol className="mt-3 space-y-4">
              <Step n={1} title="Xếp giáo viên dạy thay">
                Vào trang <strong>Dạy thay &amp; dạy bù</strong>, bấm vào tiết
                cần thay, chọn giáo viên sẽ dạy thay. Hệ thống chỉ gợi ý những
                giáo viên <em>rảnh</em> ở tiết đó. Giáo viên được chọn nhận
                thông báo ngay.
              </Step>
              <Step n={2} title="Hủy tiết và dạy bù">
                Chọn <MenuPath>Hủy tiết</MenuPath> để hủy (học sinh thấy nhãn
                “Đã hủy”), rồi chọn ngày giờ trống để{" "}
                <MenuPath>Tạo tiết dạy bù</MenuPath>.
              </Step>
            </ol>

            <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-stone-500">
              C. Nhập lịch từ file Excel
            </h3>
            <ol className="mt-3 space-y-4">
              <Step n={1} title="Xem trước">
                Vào trang <strong>Nhập từ Excel</strong>, chọn file{" "}
                <em>.xls/.xlsx</em> và tuần, bấm <MenuPath>Xem trước</MenuPath>.
                Bước này <strong>không ghi dữ liệu</strong> — chỉ kiểm tra file
                đúng sai ra sao.
              </Step>
              <Step n={2} title="Nhập khẩu">
                Khi xem trước không còn lỗi, bấm <MenuPath>Nhập khẩu</MenuPath>.
                Việc nhập là <em>tất-cả-hoặc-không-gì</em>: nếu có lỗi, không
                có gì được ghi.
              </Step>
            </ol>

            <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-stone-500">
              D. Quản lý tài khoản &amp; danh mục
            </h3>
            <ol className="mt-3 space-y-4">
              <Step n={1} title="Phân quyền — nhiều vai trò, nhiều tài khoản">
                Hệ thống có <strong>6 vai trò</strong>; mỗi vai trò thấy menu và
                quyền khác nhau. Có thể tạo <strong>nhiều tài khoản cho cùng một
                vai trò</strong> (ví dụ hai cô cùng làm quản trị thời khóa biểu):
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  <li><strong>Quản trị cấp cao (SUPER_ADMIN)</strong> — toàn quyền, kể cả tài khoản và nhật ký.</li>
                  <li><strong>Quản trị thời khóa biểu (TIMETABLE_ADMIN)</strong> — xếp lịch, dạy thay, nhập Excel, gửi thông báo; không quản lý tài khoản.</li>
                  <li><strong>Ban giám hiệu (PRINCIPAL)</strong> — tổng quan, phê duyệt &amp; công bố, xem nhật ký; không sửa từng tiết.</li>
                  <li><strong>Giáo viên (TEACHER)</strong> — lịch dạy của mình, thông báo.</li>
                  <li><strong>Học sinh (STUDENT) · Phụ huynh (PARENT)</strong> — xem lịch đã công bố (thường không cần tài khoản).</li>
                </ul>
                Hệ thống luôn giữ ít nhất một tài khoản SUPER_ADMIN đang hoạt động
                và không ai tự khóa/xóa tài khoản của chính mình.
              </Step>
              <Step n={2} title="Tài khoản người dùng">
                Trang <strong>Tài khoản</strong>: tạo tài khoản mới cho giáo
                viên / cán bộ, gán vai trò, cấp lại mật khẩu (mật khẩu mới chỉ
                hiện một lần — hãy copy đưa cho người dùng), khóa tài khoản khi
                cần. Tài khoản mới và tài khoản vừa cấp lại mật khẩu hiện nhãn
                vàng <strong>“Chưa thiết lập”</strong> — người dùng sẽ tự nhập
                email và đặt mật khẩu riêng ở lần đăng nhập kế tiếp (hệ thống
                bắt buộc). Khi tạo nhầm, bấm <MenuPath>Xóa</MenuPath> — phải gõ
                đúng tên đăng nhập để xác nhận; tài khoản bị xóa vĩnh viễn
                nhưng <strong>nhật ký thao tác vẫn được giữ lại</strong>. Nếu
                chỉ muốn ngăn đăng nhập tạm thời, hãy dùng{" "}
                <MenuPath>Khóa</MenuPath> thay vì xóa.
              </Step>
              <Step n={3} title="Danh mục trường học">
                Trang <strong>Danh mục</strong>: thêm / sửa giáo viên, lớp,
                môn học, phòng học và phân công giảng dạy.
              </Step>
              <Step n={4} title="Nhật ký thao tác">
                Trang <strong>Nhật ký</strong> ghi lại ai đã làm gì, lúc nào —
                dùng để truy vết khi có thắc mắc về lịch.
              </Step>
            </ol>

            <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-stone-500">
              E. Gửi thông báo cho cả trường
            </h3>
            <ol className="mt-3 space-y-4">
              <Step n={1} title="Soạn và chọn người nhận">
                Vào trang <strong>Gửi thông báo</strong>, chọn đối tượng:{" "}
                <MenuPath>Giáo viên &amp; ban giám hiệu</MenuPath>,{" "}
                <MenuPath>Học sinh &amp; phụ huynh</MenuPath>,{" "}
                <MenuPath>Tất cả mọi người</MenuPath>, hoặc{" "}
                <MenuPath>Người nhận được chọn</MenuPath> — khi đó hiện danh sách
                để tích chọn từng người (có ô tìm nhanh). Nhập tiêu đề, nội dung
                rồi bấm <MenuPath>Gửi thông báo</MenuPath>. Giáo viên nhận ngay
                trong mục Thông báo + trên điện thoại; học sinh thấy trong Sổ
                tay học sinh của lớp mình.
              </Step>
              <Step n={2} title="Xem lại &amp; xóa thông báo đã gửi">
                Phần <strong>Đã gửi gần đây</strong> liệt kê các thông báo đã
                gửi kèm số người nhận. Tích chọn một hoặc nhiều thông báo rồi
                bấm <MenuPath>Xóa đã chọn</MenuPath> — thông báo sẽ được xóa{" "}
                <strong>khỏi hộp thư của toàn bộ người nhận</strong> (kể cả
                thông báo lớp của học sinh); thao tác có hỏi xác nhận và không
                thể hoàn tác.
              </Step>
            </ol>
          </section>

          {/* ------------------------------------------------ faq */}
          <section id="cau-hoi" className="mt-12 scroll-mt-24">
            <h2 className="flex items-center gap-2 text-xl font-bold text-stone-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
                <Icon name="bell" size={17} />
              </span>
              Câu hỏi thường gặp
            </h2>
            <dl className="mt-4 space-y-4">
              <div className="rounded-xl bg-white p-4 ring-1 ring-stone-900/5">
                <dt className="text-sm font-semibold text-stone-900">
                  Quên mật khẩu thì sao?
                </dt>
                <dd className="mt-1 text-sm text-stone-600">
                  Liên hệ quản trị nhà trường. Quản trị vào trang{" "}
                  <strong>Tài khoản</strong> và bấm “Cấp lại mật khẩu”. Người
                  dùng đăng nhập bằng mật khẩu tạm đó rồi hệ thống yêu cầu{" "}
                  <strong>thiết lập lại</strong> (nhập email + đặt mật khẩu riêng
                  ở lần đăng nhập kế tiếp). Muốn tự đổi mật khẩu bất cứ lúc nào:{" "}
                  <strong>Tài khoản của tôi</strong> → Đổi mật khẩu.
                </dd>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-stone-900/5">
                <dt className="text-sm font-semibold text-stone-900">
                  Sao không thấy thời khóa biểu tuần này?
                </dt>
                <dd className="mt-1 text-sm text-stone-600">
                  Trang công khai chỉ hiện bản <strong>đã công bố</strong>.
                  Tuần này có thể chưa được xếp hoặc chưa duyệt — hãy hỏi
                  người phụ trách xếp lịch.
                </dd>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-stone-900/5">
                <dt className="text-sm font-semibold text-stone-900">
                  Mạng yếu / mất mạng có xem được không?
                </dt>
                <dd className="mt-1 text-sm text-stone-600">
                  Có — cài app lên màn hình chính (xem phần Học sinh, bước 4).
                  Phần lịch đã xem sẽ hiện ngay cả khi không có mạng.
                </dd>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-stone-900/5">
                <dt className="text-sm font-semibold text-stone-900">
                  Dùng trên điện thoại có được không?
                </dt>
                <dd className="mt-1 text-sm text-stone-600">
                  Được. Mọi trang đều tự co giãn vừa màn hình điện thoại, và
                  app cài được trên cả Android lẫn iPhone (iPhone cài qua
                  “Thêm vào màn hình chính”).
                </dd>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-stone-900/5">
                <dt className="text-sm font-semibold text-stone-900">
                  Thông báo không hiện trên màn hình khóa?
                </dt>
                <dd className="mt-1 text-sm text-stone-600">
                  Trên Android, mở Cài đặt → Ứng dụng → chọn app đã cài (Sổ tay
                  học sinh / Lịch dạy) → Thông báo → bật và đặt mức{" "}
                  <strong>Khẩn cấp / Cao</strong>. Đồng thời vào Cài đặt → Màn
                  hình khóa → Thông báo → cho phép hiện đầy đủ. Máy Xiaomi /
                  Oppo / Vivo nên bật thêm <em>Tự khởi chạy</em> cho Chrome và
                  app.
                </dd>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-stone-900/5">
                <dt className="text-sm font-semibold text-stone-900">
                  Đã đóng app mà không thấy thông báo?
                </dt>
                <dd className="mt-1 text-sm text-stone-600">
                  Thông báo đẩy trên Android được chuyển qua Chrome, nên cần
                  cho Chrome chạy nền: Cài đặt → Ứng dụng → Chrome → Pin →
                  Không hạn chế (và cho phép dùng dữ liệu nền). Không nên tắt
                  hoàn toàn Chrome bằng nút “Dừng” trong cài đặt ứng dụng.
                </dd>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-stone-900/5">
                <dt className="text-sm font-semibold text-stone-900">
                  Trên điện thoại có mấy app của trường?
                </dt>
                <dd className="mt-1 text-sm text-stone-600">
                  Mỗi khu vực một app riêng, chỉ mở đúng khu vực của mình:{" "}
                  <strong>Sổ tay học sinh</strong> (cài từ /hsv),{" "}
                  <strong>TKB Măng Cành</strong> cho phụ huynh (từ /tkb),{" "}
                  <strong>Lịch dạy</strong> (từ /gv),{" "}
                  <strong>Quản trị nhà trường</strong> (từ /admin) và{" "}
                  <strong>Ban giám hiệu</strong> (từ /bg). Nút cài app giáo
                  viên/quản trị chỉ hiện sau khi đăng nhập nên học sinh không
                  thể cài nhầm. Nếu đã cài app chung cũ, hãy gỡ rồi cài lại từ
                  đúng trang.
                </dd>
              </div>
            </dl>
          </section>

          <p className="mt-10 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <Icon name="shield-check" size={14} className="mr-1 inline" />
            Ghi nhớ: mọi trang công khai chỉ hiển thị thời khóa biểu{" "}
            <strong>đã được nhà trường công bố</strong> — không bao giờ hiển
            thị bản nháp.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

import { NextResponse } from "next/server";
import { generateQrSvg } from "@/server/domain/qr";
import { errorResponse } from "@/server/api/errors";

/**
 * GET /api/qr?class=8A — QR SVG (public-only data: the QR encodes the
 * public class timetable URL). Cache-Control public: the encoded content is
 * a public URL.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const classCode = url.searchParams.get("class")?.trim().toUpperCase();
  if (!classCode || !/^[1-9][AB]$/.test(classCode)) {
    return errorResponse(400, "VALIDATION_ERROR", "Tham số class không hợp lệ (ví dụ: 8A).");
  }
  // Absolute public URL from the request origin (proxy headers honored by
  // Next's url() via x-forwarded-host? build from explicit forwarded host):
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const target = `${proto}://${host}/timetable/class/${classCode}`;

  try {
    const svg = generateQrSvg(target);
    return new NextResponse(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return errorResponse(500, "INTERNAL", "Không tạo được mã QR.");
  }
}

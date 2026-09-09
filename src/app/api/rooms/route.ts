import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser, mutationErrorResponse } from "@/server/api/timetable-api";
import { prisma } from "@/server/db";
import { createRoom, listRoomCatalog } from "@/server/services/catalog.service";

/**
 * GET  /api/rooms                (legacy selector view — any logged-in user)
 * GET  /api/rooms?catalog=true   (catalog view — assignments:manage)
 * POST /api/rooms                {code, name?, roomType?, capacity?}
 */

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (new URL(request.url).searchParams.get("catalog") === "true") {
    try {
      return NextResponse.json({ rooms: await listRoomCatalog(auth.user) });
    } catch (error) {
      return mutationErrorResponse(error) ?? internal(error);
    }
  }
  const rooms = await prisma.room.findMany({
    select: { id: true, code: true, name: true, capacity: true },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({ rooms });
}

const createSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().max(120).nullish(),
  roomType: z.string().max(60).nullish(),
  capacity: z.number().int().min(1).max(500).nullish(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Thân yêu cầu không phải JSON hợp lệ.");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  try {
    return NextResponse.json(await createRoom(parsed.data, auth.user), { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error) ?? internal(error);
  }
}

function internal(error: unknown): NextResponse {
  console.error("API error:", error);
  return errorResponse(500, "INTERNAL", "Lỗi máy chủ. Vui lòng thử lại.");
}

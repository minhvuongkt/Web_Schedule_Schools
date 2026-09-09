import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { errorResponse, zodErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/api/timetable-api";
import { assertPermission, AuthorizationError, type Role } from "@/server/domain/roles";

/**
 * GET /api/audit?entityType=&entityId=&limit=50&offset= — audit log
 * (audit:read — PRINCIPAL / SUPER_ADMIN).
 */

const querySchema = z.object({
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const ENTITY_TYPES = [
  "TimetableVersion",
  "TimetableEntry",
  "TeachingAssignment",
  "Substitution",
  "MakeupLesson",
  "Teacher",
  "Subject",
  "SubjectComponent",
  "Room",
  "User",
  "Export",
  "Import",
] as const;

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  try {
    assertPermission(auth.user.role as Role, "audit:read");  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(403, "FORBIDDEN", error.message, {
        permission: error.permission,
        role: error.role,
      });
    }
    throw error;
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return zodErrorResponse(parsed.error.issues);
  const { entityType, entityId, limit, offset } = parsed.data;

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        actorName: true,
        action: true,
        entityType: true,
        entityId: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    entries: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    limit,
    offset,
    entityTypes: ENTITY_TYPES,
  });
}

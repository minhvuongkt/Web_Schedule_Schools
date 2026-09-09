import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireApiUser } from "@/server/api/timetable-api";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const year = await prisma.schoolYear.findFirst({ where: { status: "ACTIVE" } });
  if (!year) return NextResponse.json({ classes: [] });
  const classes = await prisma.class.findMany({
    where: { schoolYearId: year.id },
    select: { id: true, code: true, grade: true },
    orderBy: [{ grade: "asc" }, { code: "asc" }],
  });
  return NextResponse.json({ classes });
}

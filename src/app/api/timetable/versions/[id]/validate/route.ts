import { handleValidateVersion } from "@/server/api/timetable-api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleValidateVersion(id);
}

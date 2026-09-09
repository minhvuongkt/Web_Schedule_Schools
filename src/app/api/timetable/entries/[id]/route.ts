import { handleDeleteEntry, handleUpdateEntry } from "@/server/api/timetable-api";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleUpdateEntry(id, request);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleDeleteEntry(id, request);
}

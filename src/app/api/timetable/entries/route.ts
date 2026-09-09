import { handleCreateEntry } from "@/server/api/timetable-api";

export async function POST(request: Request) {
  return handleCreateEntry(request);
}

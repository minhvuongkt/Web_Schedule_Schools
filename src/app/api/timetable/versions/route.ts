import { handleCreateVersion, handleListVersions } from "@/server/api/timetable-api";

export async function GET(request: Request) {
  const weekId = new URL(request.url).searchParams.get("weekId");
  return handleListVersions(weekId);
}

export async function POST(request: Request) {
  return handleCreateVersion(request);
}

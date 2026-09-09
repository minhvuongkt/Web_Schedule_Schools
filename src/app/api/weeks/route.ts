import { handleListWeeks } from "@/server/api/timetable-api";

export async function GET() {
  return handleListWeeks();
}

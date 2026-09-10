import { handleCopyEntries } from "@/server/api/timetable-api";

/**
 * POST /api/timetable/entries/copy — batch copy entries within a DRAFT
 * version (copy day / copy class schedule / repeated paste). Static segment
 * "copy" takes precedence over the dynamic [id] route.
 */
export async function POST(request: Request) {
  return handleCopyEntries(request);
}

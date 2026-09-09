import {
  handleDeleteVersion,
  handleGetVersionGrid,
  type Params,
} from "@/server/api/timetable-api";

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return handleGetVersionGrid(id);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return handleDeleteVersion(id);
}

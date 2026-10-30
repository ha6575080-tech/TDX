import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { readJsonObject } from "@/lib/request-validation";
/** Historical endpoint retained so old clients receive clear guidance. */
export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  try { await readJsonObject(request); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  return NextResponse.json({ error: "Record monthly profit through the member withdrawal approval. Per-deposit payment recording is no longer available." }, { status: 409 });
}

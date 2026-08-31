import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";

// Only these private buckets may be signed for admin viewing.
// NOTE: the "selfies" bucket was removed from this allowlist when the
// selfie feature was removed from the product. Historical selfie objects
// remain in storage but are no longer served through this endpoint.
const ALLOWED_BUCKETS = new Set(["receipts", "task-screenshots"]);

export async function POST(request: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  let body: { path?: string; bucket?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { path, bucket } = body;
  const targetBucket =
    bucket && ALLOWED_BUCKETS.has(bucket) ? bucket : "receipts";

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  const { data, error: signedUrlError } = await supabase.storage
    .from(targetBucket)
    .createSignedUrl(path, 3600, { download: false });

  if (signedUrlError || !data?.signedUrl) {
    return NextResponse.json(
      { error: "Could not create signed URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}
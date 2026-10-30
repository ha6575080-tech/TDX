import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { internalError } from "@/lib/api-errors";
export async function GET() {
  const {error}=await requireUser();
  if(error)return error;
  const client=await createClient();
  const result=await client.rpc("member_statement_snapshot");
  if(result.error)return internalError("statements",result.error);
  if(!result.data)return NextResponse.json({error:"Statement unavailable"},{status:404});
  return NextResponse.json(result.data,{headers:{"Cache-Control":"private, no-store"}});
}

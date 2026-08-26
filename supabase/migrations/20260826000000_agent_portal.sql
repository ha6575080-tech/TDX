-- ============================================================
-- AGENT PORTAL
-- Adds the 'agent' role and agent-tracking columns so hired
-- agents can onboard new members from the web app.
-- ============================================================

-- Allow the 'agent' role alongside 'user' and 'admin'.
ALTER TABLE "public"."profiles" DROP CONSTRAINT IF EXISTS "profiles_role_check";
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_role_check"
  CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'agent'::text])));

-- Optional WhatsApp number captured at onboarding time.
ALTER TABLE "public"."profiles" ADD COLUMN IF NOT EXISTS "whatsapp_number" text;

-- The agent who onboarded this member.
ALTER TABLE "public"."profiles" ADD COLUMN IF NOT EXISTS "agent_id" uuid REFERENCES "public"."profiles"(id);

-- Track which agent submitted a deposit on behalf of a member.
ALTER TABLE "public"."deposits" ADD COLUMN IF NOT EXISTS "created_by_agent" uuid REFERENCES "public"."profiles"(id);

-- ============================================================
-- TDX LIVE BASELINE — captured from production project
-- jgbbifiizezrwvesdisc (schema-only, no data, no secrets)
-- Generated from live system catalogs (read-only).
-- Represents the ACTUAL production schema as of capture time.
-- ============================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- ---------- Tables (public) ----------
CREATE TABLE IF NOT EXISTS "public"."announcements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "language" text DEFAULT 'urdu'::text NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "title_ur" text,
  "content_ur" text
);

CREATE TABLE IF NOT EXISTS "public"."deposits" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "package_id" uuid,
  "amount" numeric(12,2) NOT NULL,
  "receipt_image_url" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "ai_verdict" text,
  "ai_confidence" numeric(5,2),
  "admin_notes" text,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone,
  "invoice_url" text
);

CREATE TABLE IF NOT EXISTS "public"."investment_returns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "deposit_id" uuid,
  "status" text DEFAULT 'requested'::text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "sender" text NOT NULL,
  "message" text NOT NULL,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "message_ur" text
);

CREATE TABLE IF NOT EXISTS "public"."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "title" text NOT NULL,
  "title_ur" text,
  "message" text NOT NULL,
  "message_ur" text,
  "is_read" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."packages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "package_name" text NOT NULL,
  "min_amount" numeric(12,2) NOT NULL,
  "max_amount" numeric(12,2) NOT NULL,
  "monthly_return_percent" numeric(5,2) NOT NULL,
  "yearly_return_percent" numeric(5,2) NOT NULL,
  "account_name" text DEFAULT 'Saima Easy Paisa Account'::text NOT NULL,
  "account_number" text DEFAULT '0325-2879424'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
  "id" uuid NOT NULL,
  "username" text NOT NULL,
  "full_name" text NOT NULL,
  "address" text NOT NULL,
  "city" text NOT NULL,
  "mobile_number" text NOT NULL,
  "email" text,
  "account_number" text NOT NULL,
  "payment_method" text NOT NULL,
  "profile_picture_url" text,
  "selfie_url" text,
  "referral_code" text,
  "referred_by" text,
  "referral_bonus" numeric(12,2) DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "is_suspended" boolean DEFAULT false NOT NULL,
  "profit_activation_date" timestamp with time zone,
  "package_id" uuid,
  "daily_tasks_failed" integer DEFAULT 0 NOT NULL,
  "total_deductions" numeric(12,2) DEFAULT 0 NOT NULL,
  "role" text DEFAULT 'user'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "selfie_verified" boolean DEFAULT false NOT NULL,
  "selfie_confidence" numeric(5,2),
  "selfie_verdict" text
);

CREATE TABLE IF NOT EXISTS "public"."profits" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "month" integer NOT NULL,
  "year" integer NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "payout_date" timestamp with time zone,
  "reminder_sent" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."referrals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "referrer_id" uuid NOT NULL,
  "referred_user_id" uuid NOT NULL,
  "bonus_amount" numeric(12,2) DEFAULT 100 NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "task_date" date NOT NULL,
  "youtube_link" text NOT NULL,
  "screenshot_url" text,
  "completed" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "deduction_applied" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."withdrawals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "fee" numeric(12,2) DEFAULT 100 NOT NULL,
  "net_amount" numeric(12,2) NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "user_details" jsonb,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);

-- ---------- Constraints ----------
ALTER TABLE "public"."announcements" ADD CONSTRAINT "announcements_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."announcements" ADD CONSTRAINT "announcements_language_check" CHECK ((language = ANY (ARRAY['urdu'::text, 'english'::text])));
ALTER TABLE "public"."deposits" ADD CONSTRAINT "deposits_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."deposits" ADD CONSTRAINT "deposits_ai_verdict_check" CHECK ((ai_verdict = ANY (ARRAY['real'::text, 'fake'::text, 'uncertain'::text])));
ALTER TABLE "public"."deposits" ADD CONSTRAINT "deposits_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE "public"."deposits" ADD CONSTRAINT "deposits_package_id_fkey" FOREIGN KEY (package_id) REFERENCES packages(id);
ALTER TABLE "public"."deposits" ADD CONSTRAINT "deposits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."investment_returns" ADD CONSTRAINT "investment_returns_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."investment_returns" ADD CONSTRAINT "investment_returns_status_check" CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'completed'::text])));
ALTER TABLE "public"."investment_returns" ADD CONSTRAINT "investment_returns_deposit_id_fkey" FOREIGN KEY (deposit_id) REFERENCES deposits(id);
ALTER TABLE "public"."investment_returns" ADD CONSTRAINT "investment_returns_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_check" CHECK ((sender = ANY (ARRAY['user'::text, 'ai'::text, 'admin'::text, 'system'::text])));
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."packages" ADD CONSTRAINT "packages_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_referral_code_key" UNIQUE (referral_code);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_username_key" UNIQUE (username);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_mobile_number_check" CHECK ((mobile_number ~ '^03[0-9]{9}$'::text));
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_payment_method_check" CHECK ((payment_method = ANY (ARRAY['EASY PAISA'::text, 'JAZZ CASH'::text, 'NAYAPAY'::text, 'BANK'::text, 'UPAISA'::text, 'EASYPAISA'::text, 'JAZZCASH'::text])));
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])));
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_package_id_fkey" FOREIGN KEY (package_id) REFERENCES packages(id);
ALTER TABLE "public"."profits" ADD CONSTRAINT "profits_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."profits" ADD CONSTRAINT "profits_user_id_month_year_key" UNIQUE (user_id, month, year);
ALTER TABLE "public"."profits" ADD CONSTRAINT "profits_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])));
ALTER TABLE "public"."profits" ADD CONSTRAINT "profits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE (user_id, endpoint);
ALTER TABLE "public"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])));
ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY (referred_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY (referrer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_user_id_task_date_youtube_link_key" UNIQUE (user_id, task_date, youtube_link);
ALTER TABLE "public"."tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."withdrawals" ADD CONSTRAINT "withdrawals_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."withdrawals" ADD CONSTRAINT "withdrawals_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'completed'::text, 'rejected'::text])));
ALTER TABLE "public"."withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ---------- Indexes ----------
CREATE INDEX idx_messages_unread ON public.messages USING btree (user_id, is_read);
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);

-- ---------- Row Level Security ----------
ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deposits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."investment_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."withdrawals" ENABLE ROW LEVEL SECURITY;

-- ---------- RLS Policies (public) ----------
CREATE POLICY "announcements admin manage" ON "public"."announcements" AS PERMISSIVE ALL TO "public"
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "announcements public read" ON "public"."announcements" AS PERMISSIVE SELECT TO "public"
  USING (true);
CREATE POLICY "Users manage own deposits" ON "public"."deposits" AS PERMISSIVE ALL TO "public"
  USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "deposits admin all" ON "public"."deposits" AS PERMISSIVE ALL TO "public"
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "deposits insert own" ON "public"."deposits" AS PERMISSIVE INSERT TO "public"
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "deposits read own" ON "public"."deposits" AS PERMISSIVE SELECT TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own returns" ON "public"."investment_returns" AS PERMISSIVE ALL TO "public"
  USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "returns admin all" ON "public"."investment_returns" AS PERMISSIVE ALL TO "public"
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "returns insert own" ON "public"."investment_returns" AS PERMISSIVE INSERT TO "public"
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "returns read own" ON "public"."investment_returns" AS PERMISSIVE SELECT TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own messages" ON "public"."messages" AS PERMISSIVE ALL TO "public"
  USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "messages admin all" ON "public"."messages" AS PERMISSIVE ALL TO "public"
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "messages insert own" ON "public"."messages" AS PERMISSIVE INSERT TO "public"
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "messages read own" ON "public"."messages" AS PERMISSIVE SELECT TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "System inserts notifications" ON "public"."notifications" AS PERMISSIVE INSERT TO "public"
  WITH CHECK (true);
CREATE POLICY "Users can mark own notifications read" ON "public"."notifications" AS PERMISSIVE UPDATE TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "Users mark own notifications read" ON "public"."notifications" AS PERMISSIVE UPDATE TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "Users see own notifications" ON "public"."notifications" AS PERMISSIVE SELECT TO "public"
  USING (((auth.uid() = user_id) OR (user_id IS NULL) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "Users see own or global notifications" ON "public"."notifications" AS PERMISSIVE SELECT TO "public"
  USING (((auth.uid() = user_id) OR (user_id IS NULL) OR is_admin()));
CREATE POLICY "packages public read" ON "public"."packages" AS PERMISSIVE SELECT TO "public"
  USING (true);
CREATE POLICY "Users can update own profile" ON "public"."profiles" AS PERMISSIVE UPDATE TO "public"
  USING ((auth.uid() = id));
CREATE POLICY "Users see own profile, admins see all" ON "public"."profiles" AS PERMISSIVE SELECT TO "public"
  USING (((auth.uid() = id) OR (role = 'admin'::text)));
CREATE POLICY "Users update own profile" ON "public"."profiles" AS PERMISSIVE UPDATE TO "public"
  USING (((auth.uid() = id) OR (role = 'admin'::text)));
CREATE POLICY "Users update own profile, admins update all" ON "public"."profiles" AS PERMISSIVE UPDATE TO "public"
  USING (((auth.uid() = id) OR is_admin()));
CREATE POLICY "profiles read admin" ON "public"."profiles" AS PERMISSIVE SELECT TO "public"
  USING (is_admin());
CREATE POLICY "profiles read own" ON "public"."profiles" AS PERMISSIVE SELECT TO "public"
  USING ((auth.uid() = id));
CREATE POLICY "profiles update admin" ON "public"."profiles" AS PERMISSIVE UPDATE TO "public"
  USING (is_admin());
CREATE POLICY "profiles update own" ON "public"."profiles" AS PERMISSIVE UPDATE TO "public"
  USING ((auth.uid() = id));
CREATE POLICY "Users manage own profits" ON "public"."profits" AS PERMISSIVE ALL TO "public"
  USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "profits admin all" ON "public"."profits" AS PERMISSIVE ALL TO "public"
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "profits read own" ON "public"."profits" AS PERMISSIVE SELECT TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "Users can manage own push subscriptions" ON "public"."push_subscriptions" AS PERMISSIVE ALL TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own push subs" ON "public"."push_subscriptions" AS PERMISSIVE ALL TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own push subscriptions" ON "public"."push_subscriptions" AS PERMISSIVE ALL TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "referrals admin all" ON "public"."referrals" AS PERMISSIVE ALL TO "public"
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "referrals read involved" ON "public"."referrals" AS PERMISSIVE SELECT TO "public"
  USING (((auth.uid() = referrer_id) OR (auth.uid() = referred_user_id)));
CREATE POLICY "Users manage own tasks" ON "public"."tasks" AS PERMISSIVE ALL TO "public"
  USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "tasks admin all" ON "public"."tasks" AS PERMISSIVE ALL TO "public"
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "tasks insert own" ON "public"."tasks" AS PERMISSIVE INSERT TO "public"
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "tasks read own" ON "public"."tasks" AS PERMISSIVE SELECT TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "tasks update own" ON "public"."tasks" AS PERMISSIVE UPDATE TO "public"
  USING ((auth.uid() = user_id));
CREATE POLICY "Users manage own withdrawals" ON "public"."withdrawals" AS PERMISSIVE ALL TO "public"
  USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
CREATE POLICY "withdrawals admin all" ON "public"."withdrawals" AS PERMISSIVE ALL TO "public"
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "withdrawals insert own" ON "public"."withdrawals" AS PERMISSIVE INSERT TO "public"
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "withdrawals read own" ON "public"."withdrawals" AS PERMISSIVE SELECT TO "public"
  USING ((auth.uid() = user_id));

-- ---------- Storage policies (platform schema, captured for reference) ----------
-- CREATE POLICY "delete own profile pictures" ON "storage"."objects" DELETE TO "authenticated"
--   USING (((bucket_id = 'profile-pictures'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
-- CREATE POLICY "update own profile pictures" ON "storage"."objects" UPDATE TO "authenticated"
--   USING (((bucket_id = 'profile-pictures'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
-- CREATE POLICY "upload profile pictures" ON "storage"."objects" INSERT TO "authenticated"
--   WITH CHECK (((bucket_id = 'profile-pictures'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
-- CREATE POLICY "upload receipts" ON "storage"."objects" INSERT TO "authenticated"
--   WITH CHECK (((bucket_id = 'receipts'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
-- CREATE POLICY "upload selfies" ON "storage"."objects" INSERT TO "authenticated"
--   WITH CHECK (((bucket_id = 'selfies'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
-- CREATE POLICY "upload task screenshots" ON "storage"."objects" INSERT TO "authenticated"
--   WITH CHECK (((bucket_id = 'task-screenshots'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
-- CREATE POLICY "view own selfies" ON "storage"."objects" SELECT TO "public"
--   USING (((bucket_id = 'selfies'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR is_admin())));
-- CREATE POLICY "view profile pictures" ON "storage"."objects" SELECT TO "public"
--   USING ((bucket_id = 'profile-pictures'::text));
-- CREATE POLICY "view receipts" ON "storage"."objects" SELECT TO "public"
--   USING (((bucket_id = 'receipts'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR is_admin())));
-- CREATE POLICY "view task screenshots" ON "storage"."objects" SELECT TO "public"
--   USING (((bucket_id = 'task-screenshots'::text) AND (((auth.uid())::text = (storage.foldername(name))[1]) OR is_admin())));

-- ---------- Functions (public) ----------
CREATE OR REPLACE FUNCTION public.get_referrer_by_code(ref_code text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.profiles where referral_code = ref_code limit 1;
$function$


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    insert into public.profiles (id, username, full_name, address, city, mobile_number, email, account_number, payment_method)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text,1,8)),
      coalesce(new.raw_user_meta_data->>'full_name',''),
      coalesce(new.raw_user_meta_data->>'address',''),
      coalesce(new.raw_user_meta_data->>'city',''),
      coalesce(new.raw_user_meta_data->>'mobile_number','03000000000'),
      new.email,
      coalesce(new.raw_user_meta_data->>'account_number',''),
      coalesce(new.raw_user_meta_data->>'payment_method','EASYPAISA')
    )
    on conflict (id) do nothing;
  exception when others then
    null; -- never block signup because of a profile write
  end;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$function$


-- ---------- Triggers ----------
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();
CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();
CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


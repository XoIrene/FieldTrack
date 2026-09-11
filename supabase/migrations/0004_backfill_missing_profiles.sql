-- Migration: fix PGRST116 "Cannot coerce the result to a single JSON object"
-- Symptom: frontend fetchProfile (.eq('id', userId).single()) returns 0 rows
-- even though auth session exists.
-- Causes covered here:
--  1. Legacy users created before handle_new_user trigger existed.
--  2. Trigger dropped / failed on an earlier deploy.
--  3. Race between auth.users insert and profile select.
--
-- This migration:
--  1. Re-asserts the hardened trigger (idempotent, from 0003).
--  2. Backfills any auth.users rows missing a public.profiles row.
--  3. Re-asserts the self-heal RLS policies the frontend relies on.
--
-- NOTE: some databases define profiles.role as a `user_role` ENUM,
-- others as TEXT + CHECK. Both variants are handled below by branching
-- on pg_type. A plain `CASE ... END` returns text, which Postgres will
-- NOT implicitly cast to an enum (error 42804), so the enum branch
-- explicitly casts with `::public.user_role`.

-- 1. Harden is_admin() (STABLE + search_path fixed, avoids RLS recursion)
-- Comparing enum/text column to an untyped literal ('admin') works for
-- both column types, so no branch needed here.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (select auth.uid()) AND role = 'admin'
  );
END;
$$;

-- 2. Harden handle_new_user(): idempotent insert, tolerates re-signup
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- ENUM variant: cast text -> public.user_role explicitly.
    EXECUTE $func$
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      requested_role TEXT;
    BEGIN
      requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'worker');
      IF requested_role NOT IN ('admin', 'worker') THEN
        requested_role := 'worker';
      END IF;
      INSERT INTO public.profiles (id, full_name, email, phone, role)
      VALUES (
        NEW.id,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'Unnamed'),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        requested_role::public.user_role
      )
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role;
      RETURN NEW;
    END;
    $body$;
    $func$;
  ELSE
    -- TEXT variant (matches supabase/schema.sql).
    EXECUTE $func$
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
      requested_role TEXT;
    BEGIN
      requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'worker');
      IF requested_role NOT IN ('admin', 'worker') THEN
        requested_role := 'worker';
      END IF;
      INSERT INTO public.profiles (id, full_name, email, phone, role)
      VALUES (
        NEW.id,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1), 'Unnamed'),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        requested_role
      )
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role;
      RETURN NEW;
    END;
    $body$;
    $func$;
  END IF;
END;
$do$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill profiles for existing auth users that have none.
-- Skips rows whose email is already taken by a different profile id
-- (profiles.email is UNIQUE).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    EXECUTE $backfill$
    INSERT INTO public.profiles (id, full_name, email, phone, role)
    SELECT
      u.id,
      COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1), 'Unnamed'),
      u.email,
      COALESCE(u.raw_user_meta_data->>'phone', ''),
      (CASE WHEN u.raw_user_meta_data->>'role' IN ('admin', 'worker')
        THEN u.raw_user_meta_data->>'role'
        ELSE 'worker' END)::public.user_role
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
      AND u.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.email = u.email)
    ON CONFLICT (id) DO NOTHING;
    $backfill$;
  ELSE
    EXECUTE $backfill$
    INSERT INTO public.profiles (id, full_name, email, phone, role)
    SELECT
      u.id,
      COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1), 'Unnamed'),
      u.email,
      COALESCE(u.raw_user_meta_data->>'phone', ''),
      CASE WHEN u.raw_user_meta_data->>'role' IN ('admin', 'worker')
        THEN u.raw_user_meta_data->>'role'
        ELSE 'worker' END
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
      AND u.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.email = u.email)
    ON CONFLICT (id) DO NOTHING;
    $backfill$;
  END IF;
END;
$do$;

-- 4. Self-heal policies (frontend upserts own profile when trigger missed).
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

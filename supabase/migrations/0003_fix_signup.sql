-- Migration: fix signup failures ("Database error saving new user")
-- Root cause: public.profiles only had "Admins can insert profiles".
-- When auth.users trigger handle_new_user() fires for a new anon signup,
-- the INSERT can be blocked by RLS, aborting the whole signup.
-- This migration:
--  1. Makes handle_new_user / is_admin stable + search_path-fixed
--  2. Makes trigger creation idempotent
--  3. Adds fallback INSERT policy so users can create their own profile
--     (needed if trigger missed + for client-side upsert fallback)
--  4. Adds missing admin DELETE policy (AdminWorkers delete needs it)

-- 1. Harden is_admin() against RLS recursion + search_path hijack
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
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Unnamed'),
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
$$;

-- 3. Idempotent trigger (re-running schema.sql used to fail with
-- "trigger already exists")
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Fallback: allow a user to insert their own profile row.
-- Without this, if the trigger hasn't run yet, client-side
-- upsert in AdminWorkers.tsx / Register fallback always fails.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

-- 5. Missing DELETE policy: admin worker deletion currently always fails
-- with "new row violates row-level security policy".
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

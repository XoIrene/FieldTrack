-- =============================================
-- Migration 0008: Auto-generate qr_token_hash on attendance_locations
-- =============================================
-- Symptom:
--   ERROR 23502: null value in column "qr_token_hash" of relation
--   "attendance_locations" violates not-null constraint
--   Failing row: (..., 'Main entrance', -6.816016, 39.287751, 100, null, 'active', ...)
--
-- Cause: live `attendance_locations.qr_token_hash` is NOT NULL with no
-- DEFAULT, but the insert omits it (passes NULL / omits column).
--
-- Fix (preserves intent, unblocks inserts):
--   1. Keep NOT NULL (hash stays required for QR security)
--   2. Add DEFAULT + BEFORE INSERT trigger that auto-fills NULL with a
--      secure random hex value, so both explicit and omitted hashes work.
--   3. Re-assert RLS needed by WorkerScan + AdminFields.
-- All statements are idempotent (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS).

-- Needed for gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Default so omitted column gets a value
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_locations'
      AND column_name = 'qr_token_hash'
  ) THEN
    EXECUTE $ddl$
      ALTER TABLE public.attendance_locations
        ALTER COLUMN qr_token_hash
        SET DEFAULT encode(gen_random_bytes(32), 'hex')
    $ddl$;
  END IF;
END;
$$;

-- 2. Trigger: if an explicit NULL is sent, replace it before NOT NULL check
CREATE OR REPLACE FUNCTION public.auto_fill_qr_token_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.qr_token_hash IS NULL THEN
    NEW.qr_token_hash := encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance_locations'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_auto_fill_qr_token_hash ON public.attendance_locations';
    EXECUTE 'CREATE TRIGGER trg_auto_fill_qr_token_hash
      BEFORE INSERT ON public.attendance_locations
      FOR EACH ROW EXECUTE FUNCTION public.auto_fill_qr_token_hash()';
  END IF;
END;
$$;

-- 3. RLS: workers need SELECT (WorkerScan lookup by project_id),
--    admins need full write (AdminFields create/edit).
--    Matches existing security model, no keys in frontend.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance_locations'
  ) THEN
    EXECUTE $rls$ ALTER TABLE public.attendance_locations ENABLE ROW LEVEL SECURITY $rls$;

    EXECUTE $pol$ DROP POLICY IF EXISTS "Authenticated users can view locations" ON public.attendance_locations $pol$;
    EXECUTE $pol$
    CREATE POLICY "Authenticated users can view locations"
      ON public.attendance_locations FOR SELECT
      TO authenticated
      USING (true)
    $pol$;

    EXECUTE $pol$ DROP POLICY IF EXISTS "Admins can manage locations" ON public.attendance_locations $pol$;
    EXECUTE $pol$
    CREATE POLICY "Admins can manage locations"
      ON public.attendance_locations FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin())
    $pol$;
  END IF;
END;
$$;

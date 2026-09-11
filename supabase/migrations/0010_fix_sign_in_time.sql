-- =============================================
-- Migration 0010: Guarantee sign_in_time + status atomicity
-- =============================================
-- Bug: attendance_records rows exist with sign_in_status = 'late' but
-- sign_in_time IS NULL, so Live Attendance + History show "—" for
-- sign-in / sign-out / duration.
--
-- Root cause: the worker client inserted { sign_in_status } without
-- sign_in_time, relying on the column DEFAULT. On live DBs where the
-- default drifted (or an explicit NULL was sent), the row kept a status
-- with no timestamp.
--
-- Fix (idempotent, no data loss):
--   1. Re-assert sign_in_time DEFAULT NOW().
--   2. Backfill existing NULL sign_in_time from created_at (the closest
--      server-side proxy for the actual scan moment), falling back to
--      attendance_date midnight when created_at is also null.
--   3. BEFORE INSERT trigger: if sign_in_time IS NULL, set NOW(); then
--      (unless status is 'rejected') derive sign_in_status from the SAME
--      timestamp vs the project's expected_start_time — at/before = present,
--      after = late. Status is therefore never set independently of time.
--
-- Apply with: supabase db push (or run this file in the SQL editor).

-- 1. Server-side default so an omitted column still gets a timestamp.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_records'
      AND column_name = 'sign_in_time'
  ) THEN
    EXECUTE 'ALTER TABLE public.attendance_records ALTER COLUMN sign_in_time SET DEFAULT NOW()';
  END IF;
END;
$$;

-- 2. Backfill legacy rows that have a status but no timestamp.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_records'
      AND column_name = 'sign_in_time'
  ) THEN
    EXECUTE $backfill$
      UPDATE public.attendance_records
      SET sign_in_time = COALESCE(created_at, (attendance_date::timestamptz))
      WHERE sign_in_time IS NULL
    $backfill$;
  END IF;
END;
$$;

-- 3. Trigger: single server-side timestamp drives both columns.
CREATE OR REPLACE FUNCTION public.enforce_sign_in_time_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_expected TIME;
BEGIN
  -- Same timestamp for both columns: fill missing time with server NOW().
  IF NEW.sign_in_time IS NULL THEN
    NEW.sign_in_time := NOW();
  END IF;

  -- Never derive over an explicit admin rejection.
  IF NEW.sign_in_status IS DISTINCT FROM 'rejected' THEN
    SELECT expected_start_time INTO v_expected
    FROM public.field_projects
    WHERE id = NEW.project_id;

    IF v_expected IS NOT NULL THEN
      IF (NEW.sign_in_time::time > v_expected) THEN
        NEW.sign_in_status := 'late';
      ELSE
        NEW.sign_in_status := 'present';
      END IF;
    ELSIF NEW.sign_in_status IS NULL THEN
      NEW.sign_in_status := 'present';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance_records'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_enforce_sign_in_time_status ON public.attendance_records';
    EXECUTE 'CREATE TRIGGER trg_enforce_sign_in_time_status
      BEFORE INSERT ON public.attendance_records
      FOR EACH ROW EXECUTE FUNCTION public.enforce_sign_in_time_status()';
  END IF;
END;
$$;

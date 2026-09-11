-- =============================================
-- Migration 0009: Permanent field QR — no sessions, no expiry, no GPS gate
-- =============================================
-- Intent (ONE FIELD -> ONE PERMANENT QR):
--   - QR value is `FIELDTRACK_PROJECT:<field_projects.id>`, valid as long
--     as the field exists. No daily QR, no expiry, no Start Attendance gate.
--   - The frontend NO LONGER queries `public.attendance_sessions`
--     (live DB returns PGRST205 for it). This migration deliberately does
--     NOT create that table.
--   - Workers resolve the QR via `field_projects.id` only, then insert
--     `attendance_records` for (worker, date) with sign-in/sign-out toggle.
--   - GPS columns stay for future use but never block QR attendance.
--   - There is NO artificial 10-user cap; no user-count constraint is added.
--
-- What this migration does (all idempotent, no tables dropped, no data lost):
--   1. Re-asserts SELECT on field_projects for any authenticated user
--      (worker QR lookup needs it).
--   2. Re-asserts worker own-row SELECT/INSERT/UPDATE on attendance_records.
--   3. Makes attendance_records.attendance_location_id nullable WHEN the
--      column exists (live DB has it NOT NULL with no default, which would
--      otherwise block the minimal permanent-QR insert). The
--      attendance_locations table itself is left intact for future use.
--   4. Backfills one attendance_locations row per field_project that lacks
--      one (WHEN the table exists), so pre-migration inserts that still
--      send a location id keep working.
--   5. Adds a trigger auto-creating the location row on new field_projects
--      (WHEN the table exists), so admins never have to configure it.
--   6. Re-asserts attendance_locations RLS (authenticated SELECT, admin ALL).
--
-- Apply with: supabase db push (or run this file in the SQL editor).

-- 1. Workers must resolve FIELDTRACK_PROJECT:<field_projects.id>.
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.field_projects;
CREATE POLICY "Authenticated users can view projects"
  ON public.field_projects FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. Worker attendance write path (sign-in INSERT, sign-out UPDATE).
DROP POLICY IF EXISTS "Workers can view own attendance" ON public.attendance_records;
CREATE POLICY "Workers can view own attendance"
  ON public.attendance_records FOR SELECT
  USING (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Workers can create own attendance" ON public.attendance_records;
CREATE POLICY "Workers can create own attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (auth.uid() = worker_id);

DROP POLICY IF EXISTS "Workers can update own attendance" ON public.attendance_records;
CREATE POLICY "Workers can update own attendance"
  ON public.attendance_records FOR UPDATE
  USING (auth.uid() = worker_id)
  WITH CHECK (auth.uid() = worker_id);

-- 3. Permanent QR must not be blocked by a NOT NULL location FK.
--    Guarded: fresh DBs from schema.sql have no such column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_records'
      AND column_name = 'attendance_location_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.attendance_records ALTER COLUMN attendance_location_id DROP NOT NULL';
  END IF;
END;
$$;

-- 4. Backfill one location row per project that lacks one.
--    Column list is the live shape probed via PostgREST:
--    (id, project_id, name, latitude, longitude, allowed_radius_meters,
--     qr_token_hash, qr_status, created_at, updated_at).
--    qr_token_hash has a DEFAULT + trigger from migration 0008, so omitting
--    it is safe; name copies the project name for admin readability.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance_locations'
  ) THEN
    EXECUTE $backfill$
      INSERT INTO public.attendance_locations (project_id, name, qr_status)
      SELECT fp.id, fp.name, 'active'
      FROM public.field_projects fp
      LEFT JOIN public.attendance_locations al ON al.project_id = fp.id
      WHERE al.id IS NULL
      ON CONFLICT DO NOTHING
    $backfill$;
  END IF;
END;
$$;

-- 5. Auto-create the location row for future fields.
CREATE OR REPLACE FUNCTION public.auto_create_attendance_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance_locations'
  ) THEN
    INSERT INTO public.attendance_locations (project_id, name, qr_status)
    VALUES (NEW.id, NEW.name, 'active')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'field_projects'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_auto_create_attendance_location ON public.field_projects';
    EXECUTE 'CREATE TRIGGER trg_auto_create_attendance_location
      AFTER INSERT ON public.field_projects
      FOR EACH ROW EXECUTE FUNCTION public.auto_create_attendance_location()';
  END IF;
END;
$$;

-- 6. RLS for attendance_locations (guarded: table may not exist on fresh DBs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance_locations'
  ) THEN
    EXECUTE 'ALTER TABLE public.attendance_locations ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view locations" ON public.attendance_locations';
    EXECUTE $pol$
      CREATE POLICY "Authenticated users can view locations"
        ON public.attendance_locations FOR SELECT
        TO authenticated
        USING (true)
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage locations" ON public.attendance_locations';
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

-- =============================================
-- Migration 0006: Ensure workers can read field projects for QR scan
-- =============================================
-- Symptom: worker scans a stable Admin QR
--   FIELDTRACK_PROJECT:<field_projects.id>
-- but gets "This QR code is expired or invalid / does not match any
-- field project", even though the Admin QR was generated from an
-- existing field_projects row.
--
-- Root cause covered here: if the live database drifted (policies
-- dropped / never applied), RLS on `field_projects` returns zero rows
-- to the worker. PostgREST then yields NULL for
-- `.eq('id', <uuid>).maybeSingle()`, which the frontend correctly
-- reports as "does not match any field project".
--
-- This migration RE-ASSERTS the existing security model (no new tables,
-- no new QR format, no GPS, no service_role in frontend):
--   - any authenticated user (admin or worker) can SELECT field_projects
--     (QR lookup needs only id/name/status; no sensitive data embedded)
--   - workers keep existing INSERT/UPDATE rights on their own
--     attendance_records rows (sign-in / sign-out)
-- All statements are idempotent (DROP POLICY IF EXISTS + CREATE POLICY).

-- 1. Workers must be able to resolve FIELDTRACK_PROJECT:<field_projects.id>
--    to a row. Matches supabase/schema.sql intent.
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.field_projects;
CREATE POLICY "Authenticated users can view projects"
  ON public.field_projects FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. Re-assert worker attendance write path used by WorkerScan
--    (sign-in INSERT, sign-out UPDATE). No behavior change if they exist.
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

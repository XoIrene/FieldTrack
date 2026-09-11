-- =============================================
-- Migration 0007: Workers can read attendance_locations for QR sign-in
-- =============================================
-- Live `attendance_records.attendance_location_id` is NOT NULL, so
-- WorkerScan must resolve `attendance_locations.id` by `project_id`
-- before inserting. That lookup needs SELECT on attendance_locations.
-- Idempotent, no tables created, no GPS, no keys.

DROP POLICY IF EXISTS "Authenticated users can view locations" ON public.attendance_locations;
CREATE POLICY "Authenticated users can view locations"
  ON public.attendance_locations FOR SELECT
  USING (auth.role() = 'authenticated');

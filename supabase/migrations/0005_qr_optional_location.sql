-- =============================================
-- Migration 0005: Optional location for QR-only attendance
-- =============================================
-- QR attendance must work without GPS coordinates, so latitude, longitude
-- and radius on field_projects, plus sign-in coordinates on
-- attendance_records, become nullable.
--
-- Existing columns and rows are preserved: no tables created, no data
-- deleted, no clients changed. CHECK constraints evaluate to NULL (pass)
-- for NULL values in Postgres, so stored coordinates (when present) are
-- still range-validated.

ALTER TABLE public.field_projects ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.field_projects ALTER COLUMN longitude DROP NOT NULL;
ALTER TABLE public.field_projects ALTER COLUMN allowed_radius_meters DROP NOT NULL;

ALTER TABLE public.attendance_records ALTER COLUMN sign_in_latitude DROP NOT NULL;
ALTER TABLE public.attendance_records ALTER COLUMN sign_in_longitude DROP NOT NULL;

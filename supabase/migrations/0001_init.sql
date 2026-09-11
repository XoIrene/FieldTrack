-- =============================================
-- FieldTrack Database Schema
-- QR-Based Field Attendance & Activity Management
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- PROFILES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'worker')),
  profile_photo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- FIELD PROJECTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.field_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  location_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  allowed_radius_meters INTEGER NOT NULL DEFAULT 100 CHECK (allowed_radius_meters > 0),
  expected_start_time TIME NOT NULL DEFAULT '08:00:00',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'suspended')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

-- =============================================
-- PROJECT WORKERS (Assignment) TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.project_workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.field_projects(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, worker_id)
);

-- =============================================
-- ATTENDANCE SESSIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.field_projects(id) ON DELETE CASCADE,
  qr_token TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'closed')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_token ON public.attendance_sessions(qr_token);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_status ON public.attendance_sessions(status);

-- =============================================
-- ATTENDANCE RECORDS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.field_projects(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.attendance_sessions(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sign_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sign_out_time TIMESTAMPTZ,
  sign_in_latitude DOUBLE PRECISION NOT NULL,
  sign_in_longitude DOUBLE PRECISION NOT NULL,
  sign_out_latitude DOUBLE PRECISION,
  sign_out_longitude DOUBLE PRECISION,
  sign_in_status TEXT NOT NULL DEFAULT 'present' CHECK (sign_in_status IN ('present', 'late', 'rejected')),
  sign_out_status TEXT CHECK (sign_out_status IN ('completed', 'early', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_worker ON public.attendance_records(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_project ON public.attendance_records(project_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON public.attendance_records(attendance_date);

-- =============================================
-- DAILY ACTIVITIES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.daily_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.field_projects(id) ON DELETE CASCADE,
  attendance_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  activity_description TEXT NOT NULL,
  progress_description TEXT,
  challenges TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_activities_worker ON public.daily_activities(worker_id);
CREATE INDEX IF NOT EXISTS idx_daily_activities_project ON public.daily_activities(project_id);

-- =============================================
-- AUDIT LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_field_projects_updated_at
  BEFORE UPDATE ON public.field_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_activities_updated_at
  BEFORE UPDATE ON public.daily_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- AUTO-CREATE PROFILE ON USER SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'worker'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- PROFILES RLS POLICIES
-- =============================================
-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin());

-- =============================================
-- FIELD PROJECTS RLS POLICIES
-- =============================================
-- Anyone authenticated can view active projects
CREATE POLICY "Authenticated users can view projects"
  ON public.field_projects FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can create projects
CREATE POLICY "Admins can create projects"
  ON public.field_projects FOR INSERT
  WITH CHECK (public.is_admin());

-- Only admins can update projects
CREATE POLICY "Admins can update projects"
  ON public.field_projects FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Only admins can delete projects
CREATE POLICY "Admins can delete projects"
  ON public.field_projects FOR DELETE
  USING (public.is_admin());

-- =============================================
-- PROJECT WORKERS RLS POLICIES
-- =============================================
-- Workers can view their own assignments
CREATE POLICY "Workers can view own assignments"
  ON public.project_workers FOR SELECT
  USING (auth.uid() = worker_id);

-- Admins can view all assignments
CREATE POLICY "Admins can view all assignments"
  ON public.project_workers FOR SELECT
  USING (public.is_admin());

-- Only admins can manage assignments
CREATE POLICY "Admins can manage assignments"
  ON public.project_workers FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================
-- ATTENDANCE SESSIONS RLS POLICIES
-- =============================================
-- Authenticated users can view active sessions
CREATE POLICY "Authenticated users can view sessions"
  ON public.attendance_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can create sessions
CREATE POLICY "Admins can create sessions"
  ON public.attendance_sessions FOR INSERT
  WITH CHECK (public.is_admin());

-- Only admins can update sessions
CREATE POLICY "Admins can update sessions"
  ON public.attendance_sessions FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================
-- ATTENDANCE RECORDS RLS POLICIES
-- =============================================
-- Workers can view their own attendance records
CREATE POLICY "Workers can view own attendance"
  ON public.attendance_records FOR SELECT
  USING (auth.uid() = worker_id);

-- Admins can view all attendance records
CREATE POLICY "Admins can view all attendance"
  ON public.attendance_records FOR SELECT
  USING (public.is_admin());

-- Workers can create their own attendance records
CREATE POLICY "Workers can create own attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (auth.uid() = worker_id);

-- Workers can update their own attendance (for sign-out)
CREATE POLICY "Workers can update own attendance"
  ON public.attendance_records FOR UPDATE
  USING (auth.uid() = worker_id)
  WITH CHECK (auth.uid() = worker_id);

-- Admins can update any attendance record
CREATE POLICY "Admins can update any attendance"
  ON public.attendance_records FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================
-- DAILY ACTIVITIES RLS POLICIES
-- =============================================
-- Workers can view their own activities
CREATE POLICY "Workers can view own activities"
  ON public.daily_activities FOR SELECT
  USING (auth.uid() = worker_id);

-- Admins can view all activities
CREATE POLICY "Admins can view all activities"
  ON public.daily_activities FOR SELECT
  USING (public.is_admin());

-- Workers can create their own activities
CREATE POLICY "Workers can create own activities"
  ON public.daily_activities FOR INSERT
  WITH CHECK (auth.uid() = worker_id);

-- Workers can update their own activities
CREATE POLICY "Workers can update own activities"
  ON public.daily_activities FOR UPDATE
  USING (auth.uid() = worker_id)
  WITH CHECK (auth.uid() = worker_id);

-- =============================================
-- AUDIT LOGS RLS POLICIES
-- =============================================
-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin());

-- Only admins can create audit logs
CREATE POLICY "Admins can create audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (public.is_admin());

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to calculate distance between two GPS coordinates (Haversine formula)
CREATE OR REPLACE FUNCTION public.calculate_distance(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
DECLARE
  R DOUBLE PRECISION := 6371000; -- Earth's radius in meters
  dlat DOUBLE PRECISION;
  dlon DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  a := sin(dlat/2) * sin(dlat/2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dlon/2) * sin(dlon/2);
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  RETURN R * c;
END;
$$ LANGUAGE plpgsql;

-- Function to generate secure QR token
CREATE OR REPLACE FUNCTION public.generate_qr_token()
RETURNS TEXT AS $$
BEGIN
  RETURN 'FIELDTRACK_ATTENDANCE_SESSION:' || encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to log audit events
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
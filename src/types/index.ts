export type UserRole = 'admin' | 'worker';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  profile_photo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FieldProject {
  id: string;
  name: string;
  description: string | null;
  location_name: string;
  // Optional: QR attendance does not require GPS coordinates.
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number | null;
  expected_start_time: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'suspended';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWorker {
  id: string;
  project_id: string;
  worker_id: string;
  assigned_at: string;
  project?: FieldProject;
  worker?: Profile;
}

/**
 * @deprecated Temporary attendance sessions were removed.
 * The app now uses ONE permanent QR per field
 * (`FIELDTRACK_PROJECT:<field_projects.id>`) with no expiry.
 * Kept only so old imports do not break the build.
 */
export interface AttendanceSession {
  id: string;
  project_id: string;
  qr_token: string;
  started_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'closed';
  created_by: string;
  created_at: string;
  project?: FieldProject;
}

export interface AttendanceRecord {
  id: string;
  worker_id: string;
  project_id: string;
  /**
   * @deprecated Removed from the live schema (PostgREST 42703).
   * Never send on insert/update. Kept optional for old local DBs.
   */
  session_id?: string | null;
  /**
   * Live schema requires this FK on some deployments
   * (`attendance_locations.id`). The worker scanner fills it
   * automatically when the server demands it; newer migrations make
   * it nullable so the permanent QR works with field + worker only.
   */
  attendance_location_id?: string | null;
  attendance_date: string;
  sign_in_time: string | null;
  sign_out_time: string | null;
  sign_in_latitude: number | null;
  sign_in_longitude: number | null;
  sign_out_latitude: number | null;
  sign_out_longitude: number | null;
  sign_in_status: 'present' | 'late' | 'rejected';
  sign_out_status: 'completed' | 'early' | 'rejected' | null;
  created_at: string;
  updated_at: string;
  worker?: Profile;
  project?: FieldProject;
}

export interface DailyActivity {
  id: string;
  worker_id: string;
  project_id: string;
  attendance_id: string;
  activity_description: string;
  progress_description: string | null;
  challenges: string | null;
  submitted_at: string;
  updated_at: string;
  worker?: Profile;
  project?: FieldProject;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface AttendanceStats {
  total_days: number;
  present_days: number;
  late_days: number;
  absent_days: number;
  total_hours: number;
}

export interface DashboardStats {
  total_workers: number;
  present_today: number;
  absent_today: number;
  late_today: number;
  currently_on_field: number;
  signed_out: number;
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  workerId: string;
  projectId: string;
  status: string;
}

export interface ReportRow {
  worker_name: string;
  email: string;
  project: string;
  date: string;
  sign_in: string;
  sign_out: string;
  duration: string;
  status: string;
  location_verified: string;
}
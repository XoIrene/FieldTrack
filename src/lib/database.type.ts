export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          role: 'admin' | 'worker';
          profile_photo: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          phone?: string | null;
          role?: 'admin' | 'worker';
          profile_photo?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          phone?: string | null;
          role?: 'admin' | 'worker';
          profile_photo?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      field_projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          location_name: string;
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
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          location_name: string;
          latitude?: number | null;
          longitude?: number | null;
          allowed_radius_meters?: number | null;
          expected_start_time?: string;
          start_date: string;
          end_date: string;
          status?: 'active' | 'completed' | 'suspended';
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          location_name?: string;
          latitude?: number | null;
          longitude?: number | null;
          allowed_radius_meters?: number | null;
          expected_start_time?: string;
          start_date?: string;
          end_date?: string;
          status?: 'active' | 'completed' | 'suspended';
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      project_workers: {
        Row: {
          id: string;
          project_id: string;
          worker_id: string;
          assigned_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          worker_id: string;
          assigned_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          worker_id?: string;
          assigned_at?: string;
        };
      };
      // NOTE: `attendance_sessions` was removed. The live database has no
      // such table (PostgREST PGRST205). The app uses ONE permanent QR per
      // field (`FIELDTRACK_PROJECT:<field_projects.id>`) with no expiry.
      // This stub is kept only so old imports do not break the build.
      attendance_sessions: {
        Row: {
          id: string;
          project_id: string;
          qr_token: string;
          started_at: string;
          expires_at: string;
          status: 'active' | 'expired' | 'closed';
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          qr_token: string;
          started_at?: string;
          expires_at: string;
          status?: 'active' | 'expired' | 'closed';
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          qr_token?: string;
          started_at?: string;
          expires_at?: string;
          status?: 'active' | 'expired' | 'closed';
          created_by?: string;
          created_at?: string;
        };
      };
      attendance_locations: {
        Row: {
          id: string;
          project_id: string;
          name: string | null;
          latitude: number | null;
          longitude: number | null;
          allowed_radius_meters: number | null;
          qr_token_hash: string | null;
          qr_status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          allowed_radius_meters?: number | null;
          qr_token_hash?: string | null;
          qr_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          allowed_radius_meters?: number | null;
          qr_token_hash?: string | null;
          qr_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      attendance_records: {
        Row: {
          id: string;
          worker_id: string;
          project_id: string;
          attendance_location_id: string | null;
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
        };
        Insert: {
          id?: string;
          worker_id: string;
          project_id: string;
          attendance_location_id?: string | null;
          attendance_date?: string;
          sign_in_time?: string;
          sign_out_time?: string | null;
          sign_in_latitude?: number | null;
          sign_in_longitude?: number | null;
          sign_out_latitude?: number | null;
          sign_out_longitude?: number | null;
          sign_in_status?: 'present' | 'late' | 'rejected';
          sign_out_status?: 'completed' | 'early' | 'rejected' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          worker_id?: string;
          project_id?: string;
          attendance_location_id?: string | null;
          attendance_date?: string;
          sign_in_time?: string;
          sign_out_time?: string | null;
          sign_in_latitude?: number;
          sign_in_longitude?: number;
          sign_out_latitude?: number | null;
          sign_out_longitude?: number | null;
          sign_in_status?: 'present' | 'late' | 'rejected';
          sign_out_status?: 'completed' | 'early' | 'rejected' | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      daily_activities: {
        Row: {
          id: string;
          worker_id: string;
          project_id: string;
          attendance_id: string;
          activity_description: string;
          progress_description: string | null;
          challenges: string | null;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          worker_id: string;
          project_id: string;
          attendance_id: string;
          activity_description: string;
          progress_description?: string | null;
          challenges?: string | null;
          submitted_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          worker_id?: string;
          project_id?: string;
          attendance_id?: string;
          activity_description?: string;
          progress_description?: string | null;
          challenges?: string | null;
          submitted_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

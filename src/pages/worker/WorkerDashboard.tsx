import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ScanLine, CalendarCheck, ClipboardList } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import EmptyState from '@/components/ui/EmptyState';
import type { FieldProject, AttendanceRecord } from '@/types';
import { formatTime, getGreeting, getTodayISO } from '@/lib/utils';

export default function WorkerDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<FieldProject[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadData() {
    if (!user) return;
    try {
      const { data: assignments } = await supabase
        .from('project_workers')
        .select('project:field_projects(*)')
        .eq('worker_id', user.id);

      const assigned = (assignments?.map((a: { project: unknown }) => a.project).filter(Boolean) || []) as FieldProject[];
      setProjects(assigned);

      const today = getTodayISO();
      const { data: record } = await supabase
        .from('attendance_records')
        .select('*, project:field_projects(*)')
        .eq('worker_id', user.id)
        .eq('attendance_date', today)
        .maybeSingle();

      if (record) setTodayRecord(record as AttendanceRecord);
    } catch (error) {
      console.error('Error loading worker dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {getGreeting()}, {user?.full_name?.split(' ')[0] ?? 'Worker'}
        </h1>
        <p className="text-sm text-slate-500">Today: {getTodayISO()}</p>
      </div>

      {todayRecord ? (
        <div className="card p-5 bg-success-50 border-success-100">
          <p className="text-sm font-medium text-success-700">Signed in today</p>
          <p className="mt-1 text-sm text-slate-600">
            {todayRecord.project?.name} at {formatTime(todayRecord.sign_in_time)}
            {todayRecord.sign_out_time ? ` — signed out ${formatTime(todayRecord.sign_out_time)}` : ' — still on field'}
          </p>
        </div>
      ) : (
        <div className="card p-5">
          <p className="text-sm font-medium text-slate-900">You have not signed in today</p>
          <Link to="/worker/scan" className="btn-primary mt-3 w-full">
            <ScanLine className="w-4 h-4" />
            Scan QR to Sign In
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Link to="/worker/scan" className="card p-5 hover:shadow-card-hover transition-shadow">
          <ScanLine className="w-6 h-6 text-primary-600" />
          <p className="mt-2 font-medium text-slate-900">Scan QR</p>
          <p className="text-xs text-slate-500">Sign in / out</p>
        </Link>
        <Link to="/worker/attendance" className="card p-5 hover:shadow-card-hover transition-shadow">
          <CalendarCheck className="w-6 h-6 text-success-600" />
          <p className="mt-2 font-medium text-slate-900">Attendance</p>
          <p className="text-xs text-slate-500">View history</p>
        </Link>
        <Link to="/worker/activity" className="card p-5 hover:shadow-card-hover transition-shadow col-span-2">
          <ClipboardList className="w-6 h-6 text-warning-600" />
          <p className="mt-2 font-medium text-slate-900">Daily Activity</p>
          <p className="text-xs text-slate-500">Submit today&apos;s work report</p>
        </Link>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">My Projects ({projects.length})</h2>
        {projects.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={MapPin}
              title="No projects assigned"
              description="Contact your administrator to get assigned to a field project."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="card p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary-50 text-primary-600">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{project.name}</p>
                  <p className="text-xs text-slate-500">{project.location_name} • {project.expected_start_time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

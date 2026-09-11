import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  MapPin,
  Eye,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import type { AttendanceRecord, DashboardStats } from '../../types';
import {
  formatTime,
  formatDuration,
  getStatusBadgeClass,
  getStatusLabel,
  getTodayISO,
} from '../../lib/utils';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    total_workers: 0,
    present_today: 0,
    absent_today: 0,
    late_today: 0,
    currently_on_field: 0,
    signed_out: 0,
  });
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function loadDashboard() {
    try {
      const today = getTodayISO();

      // Total Workers is an EXACT head-count (head:true + count:'exact'),
      // not a page size — there is NO artificial 10-user cap. It counts
      // every active worker allowed by RLS, regardless of pagination.
      const { count: totalWorkers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'worker')
        .eq('is_active', true);

      // Get today's attendance records with worker and project info
      const { data: records, error } = await supabase
        .from('attendance_records')
        .select('*, worker:profiles(*), project:field_projects(*)')
        .eq('attendance_date', today)
        .order('sign_in_time', { ascending: true });

      if (error) throw error;

      const attendanceRecords = (records || []) as AttendanceRecord[];
      setTodayRecords(attendanceRecords);

      // Total = rows today; Present/Late from sign_in_status.
      const present = attendanceRecords.filter((r) => r.sign_in_status === 'present').length;
      const late = attendanceRecords.filter((r) => r.sign_in_status === 'late').length;
      const onField = attendanceRecords.filter((r) => !r.sign_out_time).length;
      const signedOut = attendanceRecords.filter((r) => r.sign_out_time).length;
      const totalWorkersCount = totalWorkers || 0;

      // Absent = assigned (project_workers) minus have-a-row-today.
      // Distinct workers: a worker on two fields counts once for "today".
      let absent = 0;
      try {
        const { data: assignmentRows, error: assignmentError } = await supabase
          .from('project_workers')
          .select('project_id, worker_id');
        if (assignmentError) throw assignmentError;
        const assignedIds = new Set(
          ((assignmentRows || []) as { project_id: string; worker_id: string }[]).map(
            (a) => a.worker_id
          )
        );
        if (assignedIds.size > 0) {
          const presentIds = new Set(attendanceRecords.map((r) => r.worker_id));
          for (const id of assignedIds) {
            if (!presentIds.has(id)) absent += 1;
          }
        } else {
          absent = 0;
        }
      } catch (assignmentErr) {
        console.error('Error loading assignments for absent count:', assignmentErr);
        absent = 0;
      }

      setStats({
        total_workers: totalWorkersCount,
        present_today: present,
        absent_today: absent,
        late_today: late,
        currently_on_field: onField,
        signed_out: signedOut,
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
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
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Welcome back, {user?.full_name}</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          title="Total Workers"
          value={stats.total_workers}
          icon={Users}
          color="primary"
        />
        <StatCard
          title="Present Today"
          value={stats.present_today}
          icon={UserCheck}
          color="success"
        />
        <StatCard
          title="Absent Today"
          value={stats.absent_today}
          icon={UserX}
          color="danger"
        />
        <StatCard
          title="Late Today"
          value={stats.late_today}
          icon={Clock}
          color="warning"
        />
        <StatCard
          title="On Field Now"
          value={stats.currently_on_field}
          icon={MapPin}
          color="primary"
          subtitle={`${stats.signed_out} signed out`}
        />
      </div>
      <div
        className="card p-4 bg-slate-50 border-slate-200"
        title="Present = sign-in at or before the project's expected start time. Late = sign-in after expected start time. Absent = worker assigned to a project (via project assignments) but with no attendance record for today."
      >
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">What do these mean?</span>{' '}
          <span className="font-medium text-success-700">Present</span> = signed in at or before the
          expected start time · <span className="font-medium text-warning-700">Late</span> = signed in
          after the expected start time · <span className="font-medium text-slate-700">Absent</span> =
          assigned to a project but has no attendance record for today.
        </p>
      </div>

      {/* Today's attendance table */}
      <div className="card">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Today's Attendance</h2>
            <p className="text-sm text-slate-500">{getTodayISO()}</p>
          </div>
          <Link to="/admin/attendance" className="btn-secondary text-sm">
            <Eye className="w-4 h-4" />
            View Live
          </Link>
        </div>

        {todayRecords.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No attendance records yet"
            description="Attendance records will appear here as workers sign in."
          />
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Sign In</th>
                  <th>Sign Out</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {todayRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                          {record.worker?.full_name?.charAt(0) || '?'}
                        </div>
                        <span className="font-medium">{record.worker?.full_name}</span>
                      </div>
                    </td>
                    <td>{record.project?.name}</td>
                    <td>
                      <span className={getStatusBadgeClass(record.sign_in_status)}>
                        {getStatusLabel(record.sign_in_status)}
                      </span>
                    </td>
                    <td>{formatTime(record.sign_in_time)}</td>
                    <td>{formatTime(record.sign_out_time)}</td>
                    <td>{formatDuration(record.sign_in_time, record.sign_out_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
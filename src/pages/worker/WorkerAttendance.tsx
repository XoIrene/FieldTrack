import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import EmptyState from '@/components/ui/EmptyState';
import type { AttendanceRecord } from '@/types';
import { formatTime, formatDuration, getStatusBadgeClass, getStatusLabel } from '@/lib/utils';

export default function WorkerAttendance() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadRecords() {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, project:field_projects(*)')
        .eq('worker_id', user.id)
        .order('attendance_date', { ascending: false })
        .limit(60);
      if (error) throw error;
      setRecords((data || []) as AttendanceRecord[]);
    } catch (error) {
      console.error('Error loading attendance:', error);
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
        <h1 className="text-2xl font-bold text-slate-900">My Attendance</h1>
        <p className="text-sm text-slate-500">{records.length} records</p>
      </div>

      <div className="card">
        {records.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No attendance yet"
            description="Scan a field QR code to record your first attendance."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {records.map((record) => (
              <div key={record.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{record.project?.name}</p>
                    <p className="text-xs text-slate-500">{record.attendance_date}</p>
                  </div>
                  <span className={getStatusBadgeClass(record.sign_in_status)}>
                    {getStatusLabel(record.sign_in_status)}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-slate-600">
                  <span>In: {formatTime(record.sign_in_time)}</span>
                  <span>Out: {formatTime(record.sign_out_time)}</span>
                  <span>Duration: {formatDuration(record.sign_in_time, record.sign_out_time)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

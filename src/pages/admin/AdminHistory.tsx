import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/ui/EmptyState';
import type { AttendanceRecord } from '@/types';
import { formatTime, formatDuration, getStatusBadgeClass, getStatusLabel } from '@/lib/utils';

export default function AdminHistory() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, worker:profiles(*), project:field_projects(*)')
        .order('attendance_date', { ascending: false })
        .order('sign_in_time', { ascending: false })
        .limit(200);
      if (error) throw error;
      setRecords((data || []) as AttendanceRecord[]);
    } catch (error) {
      console.error('Error loading history:', error);
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
        <h1 className="text-2xl font-bold text-slate-900">History</h1>
        <p className="text-sm text-slate-500">Full attendance history ({records.length} records)</p>
      </div>

      <div className="card">
        {records.length === 0 ? (
          <EmptyState
            icon={History}
            title="No history yet"
            description="Attendance history will appear here."
          />
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Project</th>
                  <th>Date</th>
                  <th>Sign In</th>
                  <th>Sign Out</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="font-medium">{record.worker?.full_name}</td>
                    <td>{record.project?.name}</td>
                    <td>{record.attendance_date}</td>
                    <td>{formatTime(record.sign_in_time)}</td>
                    <td>{formatTime(record.sign_out_time)}</td>
                    <td>{formatDuration(record.sign_in_time, record.sign_out_time)}</td>
                    <td>
                      <span className={getStatusBadgeClass(record.sign_in_status)}>
                        {getStatusLabel(record.sign_in_status)}
                      </span>
                    </td>
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

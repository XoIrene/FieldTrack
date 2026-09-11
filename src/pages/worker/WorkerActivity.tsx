import { useEffect, useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { ClipboardList } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import EmptyState from '@/components/ui/EmptyState';
import type { DailyActivity, AttendanceRecord } from '@/types';
import { formatDateTime } from '@/lib/utils';

export default function WorkerActivity() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<DailyActivity[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ activity: '', progress: '', challenges: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadData() {
    if (!user) return;
    try {
      const { data: acts } = await supabase
        .from('daily_activities')
        .select('*, project:field_projects(*)')
        .eq('worker_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(30);

      setActivities((acts || []) as DailyActivity[]);

      const today = new Date().toISOString().split('T')[0];
      const { data: att } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('worker_id', user.id)
        .eq('attendance_date', today)
        .maybeSingle();

      if (att) setTodayAttendance(att as AttendanceRecord);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !todayAttendance) {
      toast.error('You must sign in today before submitting activity.');
      return;
    }
    if (!form.activity.trim()) {
      toast.error('Please describe your activity.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('daily_activities').insert({
        worker_id: user.id,
        project_id: todayAttendance.project_id,
        attendance_id: todayAttendance.id,
        activity_description: form.activity.trim(),
        progress_description: form.progress.trim() || null,
        challenges: form.challenges.trim() || null,
      });
      if (error) throw error;
      toast.success('Activity submitted!');
      setForm({ activity: '', progress: '', challenges: '' });
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit activity.');
    } finally {
      setSaving(false);
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
        <h1 className="text-2xl font-bold text-slate-900">Daily Activity</h1>
        <p className="text-sm text-slate-500">Report what you accomplished today</p>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Submit Today&apos;s Report</h2>
        {!todayAttendance ? (
          <p className="text-sm text-slate-500">Sign in via QR scan first to enable activity reporting.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">What did you do today? *</label>
              <textarea
                className="input"
                rows={3}
                value={form.activity}
                onChange={(e) => setForm({ ...form, activity: e.target.value })}
                placeholder="Installed network cables at site A..."
              />
            </div>
            <div>
              <label className="label">Progress</label>
              <textarea
                className="input"
                rows={2}
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: e.target.value })}
                placeholder="70% complete..."
              />
            </div>
            <div>
              <label className="label">Challenges</label>
              <textarea
                className="input"
                rows={2}
                value={form.challenges}
                onChange={(e) => setForm({ ...form, challenges: e.target.value })}
                placeholder="Any blockers..."
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={saving}>
              {saving ? <span className="spinner w-4 h-4" /> : 'Submit Report'}
            </button>
          </form>
        )}
      </div>

      <div>
        <h2 className="font-semibold text-slate-900 mb-3">Recent Reports ({activities.length})</h2>
        {activities.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ClipboardList}
              title="No reports yet"
              description="Your submitted daily activities will appear here."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="card p-4">
                <p className="text-sm font-medium text-slate-900">{activity.project?.name}</p>
                <p className="mt-1 text-sm text-slate-600">{activity.activity_description}</p>
                {activity.progress_description && (
                  <p className="mt-1 text-xs text-slate-500">Progress: {activity.progress_description}</p>
                )}
                {activity.challenges && (
                  <p className="mt-1 text-xs text-warning-600">Challenges: {activity.challenges}</p>
                )}
                <p className="mt-2 text-xs text-slate-400">{formatDateTime(activity.submitted_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

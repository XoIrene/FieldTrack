import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileBarChart, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import EmptyState from '../../components/ui/EmptyState';
import type { AttendanceRecord, FieldProject, Profile } from '../../types';
import {
  downloadCSV,
  formatTime,
  formatDuration,
  getStatusBadgeClass,
  getStatusLabel,
  getTodayISO,
} from '../../lib/utils';

export default function AdminReports() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<FieldProject[]>([]);
  const [assignments, setAssignments] = useState<{ project_id: string; worker_id: string }[]>([]);
  const [coverage, setCoverage] = useState<{ project_id: string; worker_id: string; attendance_date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: getTodayISO(),
    workerId: '',
    projectId: '',
    status: '',
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      // Load ALL workers (paginated, no artificial 10-user cap) + projects.
      const PAGE = 1000;
      const allWorkers: Profile[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'worker')
          .order('full_name')
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        allWorkers.push(...((data || []) as Profile[]));
        if (!data || data.length < PAGE) break;
      }
      const projectsRes = await supabase.from('field_projects').select('*').order('name');

      if (projectsRes.error) throw projectsRes.error;

      setWorkers(allWorkers);
      setProjects((projectsRes.data || []) as FieldProject[]);

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from('project_workers')
        .select('project_id, worker_id');
      if (assignmentError) throw assignmentError;
      setAssignments((assignmentRows || []) as { project_id: string; worker_id: string }[]);

      await loadRecords();
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }

  async function loadRecords() {
    try {
      let query = supabase
        .from('attendance_records')
        .select('*, worker:profiles(*), project:field_projects(*)')
        .gte('attendance_date', filters.startDate)
        .lte('attendance_date', filters.endDate)
        .order('attendance_date', { ascending: false });

      if (filters.workerId) {
        query = query.eq('worker_id', filters.workerId);
      }

      if (filters.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      if (filters.status) {
        query = query.eq('sign_in_status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRecords((data || []) as AttendanceRecord[]);

      // Coverage for Absent calculation: same date/project/worker scope but
      // WITHOUT the status filter, so "who showed up" isn't skewed when the
      // admin filters the table to present/late only.
      let coverageQuery = supabase
        .from('attendance_records')
        .select('project_id, worker_id, attendance_date')
        .gte('attendance_date', filters.startDate)
        .lte('attendance_date', filters.endDate);
      if (filters.workerId) coverageQuery = coverageQuery.eq('worker_id', filters.workerId);
      if (filters.projectId) coverageQuery = coverageQuery.eq('project_id', filters.projectId);
      const { data: coverageRows, error: coverageError } = await coverageQuery;
      if (coverageError) throw coverageError;
      setCoverage(
        (coverageRows || []) as { project_id: string; worker_id: string; attendance_date: string }[]
      );

      // Refresh assignments too (cheap, keeps Absent correct after reassign).
      const { data: assignmentRows } = await supabase
        .from('project_workers')
        .select('project_id, worker_id');
      if (assignmentRows) {
        setAssignments(assignmentRows as { project_id: string; worker_id: string }[]);
      }
    } catch (error) {
      console.error('Error loading records:', error);
      toast.error('Failed to load attendance records.');
    }
  }

  function handleExport() {
    const rows: string[][] = [
      ['Worker Name', 'Email', 'Project', 'Date', 'Sign In', 'Sign Out', 'Duration', 'Status', 'Location Verification'],
    ];

    records.forEach((record) => {
      rows.push([
        record.worker?.full_name || '',
        record.worker?.email || '',
        record.project?.name || '',
        record.attendance_date,
        formatTime(record.sign_in_time),
        formatTime(record.sign_out_time),
        formatDuration(record.sign_in_time, record.sign_out_time),
        getStatusLabel(record.sign_in_status),
        record.sign_in_latitude != null && record.sign_in_longitude != null ? 'Verified' : 'QR Only',
      ]);
    });

    downloadCSV(`fieldtrack-report-${filters.startDate}-to-${filters.endDate}.csv`, rows);
    toast.success('Report exported successfully!');
  }

  // ---- Summary: Total = rows in range, Present/Late from sign_in_status,
  // Absent = assigned (project_workers) minus have-a-row, summed per date ----
  function enumerateDates(start: string, end: string): string[] {
    const out: string[] = [];
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return out;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      out.push(d.toISOString().split('T')[0]);
      if (out.length > 366) break;
    }
    return out;
  }

  const totalRecords = records.length;
  const totalPresent = records.filter((r) => r.sign_in_status === 'present').length;
  const totalLate = records.filter((r) => r.sign_in_status === 'late').length;

  function computeAbsent(): number {
    const dates = enumerateDates(filters.startDate, filters.endDate);
    if (dates.length === 0) return 0;
    let relevant = assignments;
    if (filters.projectId) relevant = relevant.filter((a) => a.project_id === filters.projectId);
    if (filters.workerId) relevant = relevant.filter((a) => a.worker_id === filters.workerId);
    if (relevant.length === 0) return 0;

    const coverageSet = new Set(
      coverage.map((c) => `${c.project_id}|${c.attendance_date}|${c.worker_id}`)
    );

    // Single-worker view: count dates (x projects) with no row.
    if (filters.workerId) {
      if (filters.projectId) {
        let missing = 0;
        for (const d of dates) {
          if (!coverageSet.has(`${filters.projectId}|${d}|${filters.workerId}`)) missing += 1;
        }
        return missing;
      }
      const projectIds = [...new Set(relevant.map((a) => a.project_id))];
      let missing = 0;
      for (const d of dates) {
        for (const pid of projectIds) {
          if (!coverageSet.has(`${pid}|${d}|${filters.workerId!}`)) missing += 1;
        }
      }
      return missing;
    }

    // Single-project view.
    if (filters.projectId) {
      const assignedWorkers = new Set(relevant.map((a) => a.worker_id));
      let missing = 0;
      for (const d of dates) {
        const present = new Set(
          coverage
            .filter((c) => c.project_id === filters.projectId && c.attendance_date === d)
            .map((c) => c.worker_id)
        );
        missing += Math.max(0, assignedWorkers.size - present.size);
      }
      return missing;
    }

    // All projects: sum per project per date, counting only assigned workers.
    const byProject = new Map<string, Set<string>>();
    for (const a of relevant) {
      if (!byProject.has(a.project_id)) byProject.set(a.project_id, new Set());
      byProject.get(a.project_id)!.add(a.worker_id);
    }
    let missing = 0;
    for (const d of dates) {
      for (const [pid, assignedSet] of byProject) {
        let presentAssigned = 0;
        for (const c of coverage) {
          if (c.project_id === pid && c.attendance_date === d && assignedSet.has(c.worker_id)) {
            presentAssigned += 1;
          }
        }
        // De-dupe workers with multiple rows same day (shouldn't happen due
        // to UNIQUE(worker_id, attendance_date), but be safe).
        const distinctPresent = new Set(
          coverage
            .filter((c) => c.project_id === pid && c.attendance_date === d && assignedSet.has(c.worker_id))
            .map((c) => c.worker_id)
        );
        presentAssigned = distinctPresent.size;
        missing += Math.max(0, assignedSet.size - presentAssigned);
      }
    }
    return missing;
  }

  const totalAbsent = computeAbsent();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Generate and export attendance reports</p>
        </div>
        <button className="btn-primary" onClick={handleExport} disabled={records.length === 0}>
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              className="input"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Worker</label>
            <select
              className="input"
              value={filters.workerId}
              onChange={(e) => setFilters({ ...filters, workerId: e.target.value })}
            >
              <option value="">All Workers</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>{worker.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Project</label>
            <select
              className="input"
              value={filters.projectId}
              onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
            >
              <option value="">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-secondary" onClick={loadRecords}>
            <Search className="w-4 h-4" />
            Apply Filters
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="text-sm font-medium text-slate-500">Total Records</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{totalRecords}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-medium text-slate-500">Present</p>
          <p className="mt-2 text-2xl font-bold text-success-600">{totalPresent}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-medium text-slate-500">Late</p>
          <p className="mt-2 text-2xl font-bold text-warning-600">{totalLate}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-medium text-slate-500">Absent</p>
          <p className="mt-2 text-2xl font-bold text-slate-600">{totalAbsent}</p>
        </div>
      </div>
      <div
        className="card p-4 bg-slate-50 border-slate-200"
        title="Present = sign-in at or before the project's expected start time. Late = sign-in after expected start time. Absent = worker assigned to the project (via project assignments) but with no attendance record for that project and date."
      >
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">What do these mean?</span>{' '}
          <span className="font-medium text-success-700">Present</span> = signed in at or before the
          expected start time · <span className="font-medium text-warning-700">Late</span> = signed in
          after the expected start time · <span className="font-medium text-slate-700">Absent</span> =
          assigned to the project but has no attendance record for that date. Total = attendance rows
          in the selected date range.
        </p>
      </div>

      {/* Records Table */}
      <div className="card">
        {records.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title="No records found"
            description="Adjust your filters to see attendance records."
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
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div>
                        <p className="font-medium text-slate-900">{record.worker?.full_name}</p>
                        <p className="text-xs text-slate-500">{record.worker?.email}</p>
                      </div>
                    </td>
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
                    <td>
                      {record.sign_in_latitude != null && record.sign_in_longitude != null ? (
                        <span className="badge-success">Verified</span>
                      ) : (
                        <span className="badge-primary">QR Only</span>
                      )}
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
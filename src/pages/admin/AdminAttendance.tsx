import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RefreshCw, MapPin, QrCode, Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import EmptyState from '../../components/ui/EmptyState';
import type { AttendanceRecord, FieldProject } from '../../types';
import { buildProjectQrValue } from '../../lib/projectQr';
import {
  formatTime,
  formatDuration,
  getStatusBadgeClass,
  getStatusLabel,
  getTodayISO,
} from '../../lib/utils';

/**
 * PERMANENT QR ARCHITECTURE — Live Attendance.
 *
 * ONE FIELD -> ONE PERMANENT QR (`FIELDTRACK_PROJECT:<field_projects.id>`),
 * valid as long as the field exists. There is NO `attendance_sessions`
 * table, NO "Start Attendance" gate, NO QR expiry, and NO GPS requirement.
 * Workers scan the same printed QR every day; this page only monitors
 * today's attendance and shows every active field's permanent QR at a
 * glance (no selector — one card per field).
 */
export default function AdminAttendance() {
  const [projects, setProjects] = useState<FieldProject[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
    loadTodayRecords();
  }, []);

  // Auto-refresh records every 15 seconds + instant realtime updates so a
  // worker scan appears under Live Status / Today's Records immediately.
  useEffect(() => {
    const interval = setInterval(loadTodayRecords, 15000);

    const channel = supabase
      .channel('admin-attendance-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => {
          loadTodayRecords();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProjects() {
    try {
      const { data, error } = await supabase
        .from('field_projects')
        .select('*')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      const list = (data || []) as FieldProject[];
      setProjects(list);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  async function loadTodayRecords() {
    try {
      const today = getTodayISO();
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, worker:profiles(*), project:field_projects(*)')
        .eq('attendance_date', today)
        .order('sign_in_time', { ascending: true });

      if (error) throw error;
      setRecords((data || []) as AttendanceRecord[]);
    } catch (error) {
      console.error('Error loading records:', error);
    } finally {
      setLoading(false);
    }
  }

  const onField = records.filter((r) => !r.sign_out_time);
  const signedOut = records.filter((r) => r.sign_out_time);

  function qrFileName(project: FieldProject): string {
    return `fieldtrack-qr-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'field'}.png`;
  }

  function getQrSvg(projectId: string): SVGSVGElement | null {
    return document.querySelector(`[data-qr-card="${projectId}"] svg`);
  }

  async function handleDownloadQr(project: FieldProject) {
    const svg = getQrSvg(project.id);
    if (!svg) {
      toast.error('QR code is not ready yet. Please try again.');
      return;
    }
    try {
      const svgString = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      try {
        const img = new Image();
        img.decoding = 'sync';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Could not render the QR code image.'));
          img.src = svgUrl;
        });
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not render the QR code image.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = qrFileName(project);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('QR code downloaded.');
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    } catch (error) {
      console.error('QR download failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download the QR code.');
    }
  }

  function handlePrintQr(project: FieldProject) {
    const svg = getQrSvg(project.id);
    if (!svg) {
      toast.error('QR code is not ready yet. Please try again.');
      return;
    }
    try {
      const printWindow = window.open('', '_blank', 'width=640,height=760');
      if (!printWindow) {
        toast.error('Pop-up blocked. Please allow pop-ups to print the QR code.');
        return;
      }
      const svgHtml = new XMLSerializer().serializeToString(svg);
      const safeName = project.name.replace(/</g, '&lt;');
      const safeLocation = project.location_name.replace(/</g, '&lt;');
      printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Field QR - ${safeName}</title>
<style>
body { font-family: Arial, sans-serif; text-align: center; padding: 32px; color: #0f172a; }
.card { display: inline-block; border: 2px solid #0f172a; border-radius: 16px; padding: 32px 40px; }
h1 { font-size: 24px; margin: 0 0 4px; }
p.sub { margin: 0 0 20px; color: #475569; font-size: 14px; }
.meta { margin-top: 16px; font-size: 13px; color: #475569; }
svg { width: 380px; height: 380px; }
@media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="card">
<h1>${safeName}</h1>
<p class="sub">${safeLocation}</p>
${svgHtml}
<div class="meta">Scan with the FieldTrack worker app to sign in / out.<br/>Keep this posted at the field entrance.</div>
</div>
<div class="no-print" style="margin-top:24px"><button onclick="window.print()">Print</button></div>
<script>window.onload = () => window.print();<\/script>
</body>
</html>`);
      printWindow.document.close();
      toast.success('Print view opened.');
    } catch (error) {
      console.error('QR print failed:', error);
      toast.error('Failed to open the print view.');
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
        <h1 className="text-2xl font-bold text-slate-900">Live Attendance</h1>
        <p className="text-sm text-slate-500">
          Each field has one permanent QR. Workers scan the same QR every day — no session to start.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Permanent field QRs — every active field at a glance, no selector */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Permanent Field QR</h2>
          <p className="text-xs text-slate-500 mb-4">
            One permanent QR per field — always valid, never expires. Print once and post at the
            entrance.
          </p>

          {projects.length === 0 ? (
            <EmptyState
              icon={QrCode}
              title="No active fields"
              description="Create an active field project to get its permanent QR code."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
              {projects.map((project) => {
                const qrValue = buildProjectQrValue(project.id);
                return (
                  <div
                    key={project.id}
                    className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white"
                  >
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-success-50">
                      <span className="w-2 h-2 rounded-full bg-success-500" />
                      <span className="text-xs font-medium text-success-700">
                        Permanent QR — never expires
                      </span>
                    </div>

                    <div
                      data-qr-card={project.id}
                      className="flex justify-center p-4 bg-white rounded-xl border-2 border-dashed border-slate-200"
                    >
                      <QRCodeSVG value={qrValue} size={160} level="H" includeMargin />
                    </div>

                    <div className="text-center">
                      <p className="text-sm font-medium text-slate-900">{project.name}</p>
                      <p className="text-xs text-slate-500">{project.location_name}</p>
                      <p className="mt-1 text-[11px] font-mono text-slate-400 break-all">
                        {qrValue}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="btn-primary text-xs"
                        onClick={() => void handleDownloadQr(project)}
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => handlePrintQr(project)}
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {projects.length > 0 && (
            <p className="mt-4 text-xs text-slate-500 text-center">
              Workers scan the same QR daily to sign in/out. Manage each field anytime from{' '}
              <span className="font-semibold">Fields → QR Code</span>.
            </p>
          )}
        </div>

        {/* Live Status Section */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Live Status</h2>
            <button
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              onClick={loadTodayRecords}
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-primary-50">
              <p className="text-2xl font-bold text-primary-700">{onField.length}</p>
              <p className="text-xs text-primary-600 font-medium">On Field</p>
            </div>
            <div className="p-4 rounded-lg bg-success-50">
              <p className="text-2xl font-bold text-success-700">{signedOut.length}</p>
              <p className="text-xs text-success-600 font-medium">Signed Out</p>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {onField.length === 0 && signedOut.length === 0 ? (
              <EmptyState
                icon={MapPin}
                title="No attendance yet"
                description="Workers will appear here as they scan the permanent field QR and sign in."
              />
            ) : (
              <>
                {onField.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                        {record.worker?.full_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{record.worker?.full_name}</p>
                        <p className="text-xs text-slate-500">{record.project?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-700">{formatTime(record.sign_in_time)}</p>
                      <span className="badge-primary">On Field</span>
                    </div>
                  </div>
                ))}

                {signedOut.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 opacity-75">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold">
                        {record.worker?.full_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{record.worker?.full_name}</p>
                        <p className="text-xs text-slate-500">{record.project?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">
                        {formatTime(record.sign_in_time)} - {formatTime(record.sign_out_time)}
                      </p>
                      <span className="badge-success">Completed</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Today's Records Table */}
      <div className="card">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Today&apos;s Records</h2>
        </div>
        {records.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No records yet"
            description="Attendance records will appear here as workers sign in."
          />
        ) : (
          <div className="table-container border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Field</th>
                  <th>Status</th>
                  <th>Sign In</th>
                  <th>Sign Out</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="font-medium">{record.worker?.full_name}</td>
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

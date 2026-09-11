import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import {
  MapPin,
  LogIn,
  LogOut,
  Navigation,
  RefreshCw,
  Camera,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentPosition, getTodayISO, formatTime } from '@/lib/utils';
import { parseScannedQr, normalizeProjectId, EXPIRED_INVALID_MESSAGE, SIGNED_IN_SUCCESS_MESSAGE } from '@/lib/projectQr';
import type { AttendanceRecord, FieldProject, GeoPosition } from '@/types';

type GpsState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; position: GeoPosition }
  | { status: 'error'; message: string };

interface ResultBanner {
  kind: 'success' | 'error';
  title: string;
  message: string;
}

interface SignInDetails {
  workerName: string;
  projectName: string;
  signInTime: string;
  status: string;
}

export default function WorkerScan() {
  const { user } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [gps, setGps] = useState<GpsState>({ status: 'idle' });
  const [result, setResult] = useState<ResultBanner | null>(null);
  const [lastSignIn, setLastSignIn] = useState<SignInDetails | null>(null);
  const [manualQr, setManualQr] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadTodayRecord();
    // NOTE: GPS is optional for QR attendance. We deliberately do NOT request
    // location on page load so no permission prompt blocks the QR workflow.
    // Workers may enable it via the optional GPS card if they want to attach
    // coordinates to their record.
    return () => {
      mountedRef.current = false;
      // Stop the camera when the user leaves the page / component unmounts.
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        try {
          const state = scanner.getState();
          if (state === Html5QrcodeScannerState.SCANNING) {
            void scanner.stop().then(() => {
              try {
                scanner.clear();
              } catch {
                // ignore cleanup errors
              }
            }).catch(() => undefined);
          } else {
            try {
              scanner.clear();
            } catch {
              // ignore cleanup errors
            }
          }
        } catch {
          // ignore cleanup errors
        }
      }
      setScanning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTodayRecord() {
    if (!user) {
      setRecordsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*, project:field_projects(*)')
        .eq('worker_id', user.id)
        .eq('attendance_date', getTodayISO())
        .maybeSingle();
      if (error) throw error;
      setTodayRecord((data as AttendanceRecord | null) ?? null);
    } catch (error) {
      console.error('Error loading today attendance:', error);
      toast.error(
        error instanceof Error
          ? `Database error: ${error.message}`
          : 'Database error: could not load today attendance.'
      );
    } finally {
      setRecordsLoading(false);
    }
  }

  async function requestGps() {
    setGps({ status: 'locating' });
    setResult(null);
    try {
      const position = await getCurrentPosition();
      setGps({ status: 'ready', position });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to get your location. Please try again.';
      setGps({ status: 'error', message });
    }
  }

  function cameraErrorMessage(error: unknown): string {
    const text =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === 'string'
          ? error
          : '';
    const lower = text.toLowerCase();

    if (
      error instanceof Error &&
      (error.name === 'NotAllowedError' || error.name === 'SecurityError') ||
      lower.includes('permission denied') ||
      lower.includes('notallowederror') ||
      lower.includes('permission dismissed')
    ) {
      return 'Camera permission denied. Please allow camera access in your browser and try again.';
    }
    if (
      (error instanceof Error &&
        (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')) ||
      lower.includes('notfounderror') ||
      lower.includes('overconstrainederror') ||
      lower.includes('no camera') ||
      lower.includes('could not satisfy constraints')
    ) {
      return 'No camera was found on this device. Please use a device with a camera, or pick another camera if you have one.';
    }
    if (
      (error instanceof Error && error.name === 'NotReadableError') ||
      lower.includes('notreadableerror') ||
      lower.includes('already in use') ||
      lower.includes('could not start video source')
    ) {
      return 'Could not start the camera. Please close other apps using the camera and try again.';
    }
    if (lower.includes('secure context') || lower.includes('https')) {
      return 'Camera requires a secure context. Please open this page over HTTPS or localhost.';
    }
    if (typeof error === 'string' && error.trim().length > 0 && error.length < 200) {
      return error;
    }
    if (error instanceof Error && error.message && error.message.length < 200) {
      return error.message;
    }
    return 'Could not start camera. Please allow camera access and try again.';
  }

  async function startScanner() {
    // QR attendance does NOT require GPS — the QR code alone is enough.
    if (starting || processing) return;
    // Camera requires a secure context (localhost is allowed; otherwise HTTPS).
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      const message =
        'Camera requires a secure context. Please open this page over HTTPS or localhost and try again.';
      setResult({ kind: 'error', title: 'Camera error', message });
      toast.error(message);
      return;
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      const message =
        'Camera is not supported in this browser or context. Please use Chrome or Firefox over HTTPS (localhost is fine for development).';
      setResult({ kind: 'error', title: 'Camera error', message });
      toast.error(message);
      return;
    }

    setResult(null);
    setStarting(true);
    try {
      // Clean up any previous instance (e.g. after a restart or a failed start).
      await stopScanner();

      // The #qr-reader element is always mounted (see JSX below) so
      // `new Html5Qrcode('qr-reader')` never fails with "element not found".
      // Empty it in case a previous session left DOM nodes behind.
      document.getElementById('qr-reader')?.replaceChildren();

      // Early, friendly "no camera" detection.
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new DOMException('No camera found', 'NotFoundError');
        }
      } catch (error) {
        // A permission denial here surfaces as NotAllowedError — report it directly.
        const msg = cameraErrorMessage(error);
        if (mountedRef.current) {
          setResult({ kind: 'error', title: 'Camera error', message: msg });
          toast.error(msg);
        }
        return;
      }

      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      if (mountedRef.current) setScanning(true);

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      try {
        // Prefer the rear/environment camera on mobile devices.
        await scanner.start({ facingMode: 'environment' }, config, onScanSuccess, () => undefined);
      } catch (envError) {
        // Desktops (e.g. Firefox/Chrome without a rear camera) reject the
        // environment constraint — fall back to the default camera.
        const msg = cameraErrorMessage(envError).toLowerCase();
        const isConstraint =
          msg.includes('no camera') ||
          msg.includes('constraint') ||
          msg.includes('overconstrained') ||
          msg.includes('notfound');
        if (!isConstraint) throw envError;
        await scanner.start({}, config, onScanSuccess, () => undefined);
      }
    } catch (error) {
      console.error('Scanner start failed:', error);
      await stopScanner();
      const message = cameraErrorMessage(error);
      if (mountedRef.current) {
        setResult({ kind: 'error', title: 'Camera error', message });
        toast.error(message);
      }
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (mountedRef.current) setScanning(false);
    if (!scanner) return;
    try {
      let isScanning = false;
      try {
        isScanning = scanner.getState() === Html5QrcodeScannerState.SCANNING;
      } catch {
        isScanning = true; // if state is unknown, still attempt stop
      }
      if (isScanning) {
        await scanner.stop();
      }
    } catch {
      // ignore stop errors (camera already released, etc.)
    }
    try {
      scanner.clear();
    } catch {
      // ignore cleanup errors
    }
  }

  function fail(title: string, message: string) {
    setResult({ kind: 'error', title, message });
    toast.error(message);
  }

  async function onScanSuccess(decodedText: string) {
    if (processingRef.current) return;
    console.log('[WorkerScan] scanned QR text:', decodedText);
    const parsed = parseScannedQr(decodedText);
    console.log('[WorkerScan] parsed QR:', parsed);
    if (parsed.kind === 'invalid') {
      // Keep the scanner running so the worker can retry immediately.
      // Title + message both carry the exact required string for expired/invalid QRs.
      console.warn('[WorkerScan] invalid QR:', parsed.reason);
      fail(EXPIRED_INVALID_MESSAGE, `${EXPIRED_INVALID_MESSAGE} ${parsed.reason}`);
      return;
    }
    await handleAttendance(decodedText);
  }

  async function handleAttendance(scannedValue: string) {
    if (!user) return;
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    try {
      // First production version requires internet to record attendance in
      // Supabase — the PWA caches only the app shell, never attendance data.
      if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
        fail(
          'No internet connection',
          'Internet connection is required to record attendance.'
        );
        return;
      }

      await stopScanner();

      // Dev diagnostics (QR value holds only the field identifier — no secrets).
      console.log('[WorkerScan] scanned QR text:', scannedValue);
      const parsed = parseScannedQr(scannedValue);
      console.log('[WorkerScan] parsed QR:', parsed);
      if (parsed.kind === 'project') {
        console.log('[WorkerScan] extracted project UUID:', parsed.projectId);
      }
      if (parsed.kind === 'invalid') {
        console.warn('[WorkerScan] invalid QR:', parsed.reason);
        fail(EXPIRED_INVALID_MESSAGE, `${EXPIRED_INVALID_MESSAGE} ${parsed.reason}`);
        return;
      }

      // QR-only attendance: GPS is optional. Use the cached position only if
      // the worker opted in via "Enable GPS"; otherwise record nulls.
      // Never prompt for or require location permission here.
      const position: GeoPosition | null =
        gps.status === 'ready' ? gps.position : null;

      // Resolve the scanned value to a field project.
      // PERMANENT QR ARCHITECTURE (only supported flow):
      //   `FIELDTRACK_PROJECT:<field_projects.id>` or bare UUID
      // The QR permanently identifies the field. There is NO
      // `attendance_sessions` table lookup, NO temporary token,
      // NO expiry check, and NO GPS requirement.
      // Attendance = QR (field) + auth (logged-in worker) + date.
      // We never send `session_id` (removed from the live schema).
      const projectId = normalizeProjectId(
        parsed.kind === 'project' ? parsed.projectId : ''
      );
      console.log('[WorkerScan] looking up field_projects.id =', projectId);
      const { data, error } = await supabase
        .from('field_projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      console.log('[WorkerScan] field_projects lookup result:', { data, error });
      if (error) {
        console.error('[WorkerScan] field_projects lookup error:', error);
        fail('Database error', `Database error: ${error.message}. Please try again.`);
        return;
      }
      if (!data) {
        console.warn('[WorkerScan] no field_projects row for UUID:', projectId);
        fail(
          EXPIRED_INVALID_MESSAGE,
          `${EXPIRED_INVALID_MESSAGE} This QR code does not match any field project. Ask your admin for the permanent field QR code.`
        );
        return;
      }
      const project = data as FieldProject;

      if (project.status !== 'active') {
        fail(
          'Field not active',
          `The field "${project.name}" is currently ${project.status}. Contact your administrator.`
        );
        return;
      }

      // QR presence is the authorization for QR attendance: any authenticated
      // worker holding the permanent field QR may sign in. No assignment gate and
      // no GPS/geofence gate — missing latitude/longitude/radius never rejects.

      const today = getTodayISO();
      const { data: existingRow, error: existingError } = await supabase
        .from('attendance_records')
        .select('*, project:field_projects(*)')
        .eq('worker_id', user.id)
        .eq('attendance_date', today)
        .maybeSingle();

      if (existingError) {
        console.error('[WorkerScan] today attendance lookup error:', existingError);
        fail('Database error', `Database error: ${existingError.message}. Please try again.`);
        return;
      }

      const existing = existingRow as AttendanceRecord | null;
      console.log('[WorkerScan] today existing record:', existing ? existing.id : null);

      if (!existing) {
        // Single server-clock timestamp drives BOTH sign_in_time and
        // sign_in_status so they can never drift apart (a "late" row can
        // never have a null sign_in_time). Status is derived from the same
        // `now` used for the insert — at/before expected_start_time =
        // present, after = late.
        const now = new Date();
        const nowIso = now.toISOString();
        const nowHm = now.toTimeString().slice(0, 5);
        const expectedHm = (project.expected_start_time || '').slice(0, 5);
        const isLate = nowHm > expectedHm;
        const basePayload = {
          worker_id: user.id,
          project_id: project.id,
          attendance_date: today,
          sign_in_time: nowIso,
          sign_in_latitude: position?.latitude ?? null,
          sign_in_longitude: position?.longitude ?? null,
          sign_in_status: (isLate ? 'late' : 'present') as 'late' | 'present',
        };
        console.log('[WorkerScan] inserting attendance record:', basePayload);

        // Permanent-QR insert. The live schema requires
        // `attendance_records.attendance_location_id` (NOT NULL) on some
        // deployments, while newer migrations make it nullable. Try the
        // minimal payload first; only if the server complains about the
        // NOT NULL column do we resolve a location row and retry.
        // Never send `session_id` (removed) and never require GPS.
        let { data: inserted, error } = await supabase
          .from('attendance_records')
          .insert(basePayload)
          .select()
          .maybeSingle();

        if (
          error &&
          (error.message.includes('attendance_location_id') ||
            error.message.includes('null value in column'))
        ) {
          console.log(
            '[WorkerScan] location id required, resolving attendance_location for project:',
            project.id
          );
          const { data: locationRow, error: locationError } = await supabase
            .from('attendance_locations')
            .select('id')
            .eq('project_id', project.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          console.log('[WorkerScan] attendance_locations lookup:', {
            locationRow,
            locationError,
          });
          if (locationError) {
            console.error('[WorkerScan] attendance_locations lookup error:', locationError);
            fail('Database error', `Database error: ${locationError.message}. Please try again.`);
            return;
          }
          const locationId = (locationRow as { id: string } | null)?.id ?? null;
          if (!locationId) {
            console.warn('[WorkerScan] no attendance_locations row for project:', project.id);
            fail(
              'Field not configured',
              `No attendance location is configured for "${project.name}". Ask your admin to open this field once in the Fields page (this auto-creates it), then scan again.`
            );
            return;
          }
          const retry = await supabase
            .from('attendance_records')
            .insert({ ...basePayload, attendance_location_id: locationId })
            .select()
            .maybeSingle();
          inserted = retry.data;
          error = retry.error;
          console.log('[WorkerScan] attendance insert retry result:', { inserted, error });
        }

        console.log('[WorkerScan] attendance insert result:', { inserted, error });
        if (error) {
          // UNIQUE(worker_id, attendance_date) backstop: a concurrent scan
          // already recorded sign-in, so this is a duplicate — never insert twice.
          console.error('[WorkerScan] attendance insert error:', error);
          fail('Database error', `Database error: ${error.message}. Please try again.`);
          return;
        }
        const workerName = user.full_name || 'Worker';
        const message = `${SIGNED_IN_SUCCESS_MESSAGE} to ${project.name} at ${formatTime(nowIso)} (${isLate ? 'late' : 'on time'}).`;
        setResult({ kind: 'success', title: SIGNED_IN_SUCCESS_MESSAGE, message });
        setLastSignIn({
          workerName,
          projectName: project.name,
          signInTime: formatTime(nowIso),
          status: 'Signed In',
        });
        toast.success(`${SIGNED_IN_SUCCESS_MESSAGE}: ${project.name} at ${formatTime(nowIso)}`);
      } else if (!existing.sign_out_time) {
        if (existing.project_id !== project.id) {
          const currentName = existing.project?.name ?? 'another field';
          fail(
            'Already signed in',
            `You are already signed in to "${currentName}". Sign out there first before signing in to "${project.name}".`
          );
          return;
        }
        console.log('[WorkerScan] signing out attendance record:', existing.id);
        const signOutTime = new Date().toISOString();
        const { error } = await supabase
          .from('attendance_records')
          .update({
            sign_out_time: signOutTime,
            sign_out_latitude: position?.latitude ?? null,
            sign_out_longitude: position?.longitude ?? null,
            sign_out_status: 'completed',
          })
          .eq('id', existing.id);
        console.log('[WorkerScan] sign-out update result:', { error });
        if (error) {
          console.error('[WorkerScan] sign-out update error:', error);
          fail('Database error', `Database error: ${error.message}. Please try again.`);
          return;
        }
        const message = `Signed out successfully from ${project.name} at ${formatTime(signOutTime)}.`;
        setLastSignIn(null);
        setResult({ kind: 'success', title: 'Signed out successfully', message });
        toast.success(message);
      } else {
        fail(
          'Attendance already completed',
          `Attendance already signed out for today at ${formatTime(existing.sign_out_time)}.`
        );
        return;
      }

      await loadTodayRecord();
    } catch (error) {
      console.error('Attendance failed:', error);
      fail(
        'Attendance failed',
        error instanceof Error ? error.message : 'Attendance failed. Please try again.'
      );
    } finally {
      processingRef.current = false;
      if (mountedRef.current) setProcessing(false);
    }
  }

  const nextAction = todayRecord
    ? todayRecord.sign_out_time
      ? 'completed'
      : 'sign-out'
    : 'sign-in';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scan QR</h1>
        <p className="text-sm text-slate-500">Scan the field QR code to sign in or out</p>
      </div>

      {/* GPS status (optional — QR code alone is enough to sign in) */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg ${
                gps.status === 'ready'
                  ? 'bg-success-50 text-success-600'
                  : gps.status === 'error'
                    ? 'bg-danger-50 text-danger-600'
                    : 'bg-primary-50 text-primary-600'
              }`}
            >
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">GPS Location</p>
              {gps.status === 'ready' && (
                <p className="text-xs text-slate-500">
                  {gps.position.latitude.toFixed(6)}, {gps.position.longitude.toFixed(6)}
                  {gps.position.accuracy != null &&
                    ` (±${Math.round(gps.position.accuracy)}m)`}
                </p>
              )}
              {gps.status === 'locating' && (
                <p className="text-xs text-slate-500">Locating… please allow location access.</p>
              )}
              {gps.status === 'error' && (
                <p className="text-xs text-danger-600">{gps.message}</p>
              )}
              {gps.status === 'idle' && (
                <p className="text-xs text-slate-500">Location not requested yet.</p>
              )}
            </div>
          </div>
          <button
            className="btn-secondary text-xs"
            onClick={requestGps}
            disabled={gps.status === 'locating'}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${gps.status === 'locating' ? 'animate-spin' : ''}`}
            />
            {gps.status === 'ready' ? 'Refresh' : 'Enable GPS (optional)'}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          GPS is optional. Scanning the attendance QR code is enough to sign in —
          no location permission required.
        </p>
      </div>

      {/* Next-action status */}
      {!recordsLoading && (
        <div
          className={`card p-4 flex items-center gap-3 ${
            nextAction === 'sign-out'
              ? 'bg-success-50 border-success-100'
              : nextAction === 'completed'
                ? 'bg-slate-50'
                : 'bg-primary-50 border-primary-100'
          }`}
        >
          {nextAction === 'sign-out' ? (
            <LogIn className="w-5 h-5 text-success-600" />
          ) : nextAction === 'completed' ? (
            <LogOut className="w-5 h-5 text-slate-400" />
          ) : (
            <Camera className="w-5 h-5 text-primary-600" />
          )}
          <p className="text-sm text-slate-700">
            {nextAction === 'sign-out' && (
              <>
                Signed in to <span className="font-semibold">{todayRecord?.project?.name}</span>.
                Your next scan will <span className="font-semibold">sign you out</span>.
              </>
            )}
            {nextAction === 'completed' && (
              <>Attendance completed for today. See you tomorrow.</>
            )}
            {nextAction === 'sign-in' && (
              <>Not signed in yet. Your next scan will <span className="font-semibold">sign you in</span>.</>
            )}
          </p>
        </div>
      )}

      {/* Result banner (persists after toasts disappear) */}
      {result && (
        <div
          className={`card p-4 flex items-start gap-3 ${
            result.kind === 'success' ? 'bg-success-50 border-success-100' : 'bg-danger-50 border-danger-100'
          }`}
        >
          {result.kind === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-success-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-danger-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p
              className={`text-sm font-semibold ${
                result.kind === 'success' ? 'text-success-700' : 'text-danger-700'
              }`}
            >
              {result.title}
            </p>
            <p className="text-sm text-slate-600">{result.message}</p>
          </div>
        </div>
      )}

      {/* Sign-in confirmation details */}
      {lastSignIn && (
        <div className="card p-5 bg-success-50 border-success-100">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-success-600" />
            <p className="text-sm font-semibold text-success-700">Signed in successfully</p>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Worker</dt>
              <dd className="font-medium text-slate-900 text-right">{lastSignIn.workerName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Project / Field</dt>
              <dd className="font-medium text-slate-900 text-right">{lastSignIn.projectName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Sign-in time</dt>
              <dd className="font-medium text-slate-900 text-right">{lastSignIn.signInTime}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-semibold text-success-700 text-right">{lastSignIn.status}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Scanner */}
      <div className="card p-6">
        {/* Always mounted: Html5Qrcode needs #qr-reader in the DOM before start(). */}
        <div className={scanning || starting ? 'space-y-4' : 'hidden'}>
          <div id="qr-reader" />
          {starting && !scanning && (
            <p className="text-sm text-slate-500 text-center">
              Starting camera… please allow camera access.
            </p>
          )}
          <button
            className="btn-secondary w-full"
            onClick={() => void stopScanner()}
            disabled={processing}
          >
            Stop Scanner
          </button>
        </div>
        {!scanning && !starting && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-primary-600" />
            </div>
            <p className="text-sm text-slate-600">
              Scan the permanent field QR posted at the entrance. No GPS needed, never expires.
            </p>
            <button
              className="btn-primary w-full"
              onClick={startScanner}
              disabled={processing || starting}
              title="Start the QR scanner"
            >
              {processing || starting ? <span className="spinner w-4 h-4" /> : 'Start Scanner'}
            </button>
            {todayRecord && (
              <p className="text-xs text-slate-500">
                Today: signed in at {formatTime(todayRecord.sign_in_time)}{' '}
                {todayRecord.sign_out_time
                  ? `(signed out at ${formatTime(todayRecord.sign_out_time)})`
                  : '(on field)'}
              </p>
            )}
            <div className="pt-2 border-t border-slate-100 space-y-2 text-left">
              <p className="text-xs font-medium text-slate-600 text-center">
                No camera? Paste the field QR value:
              </p>
              <input
                type="text"
                className="input font-mono text-xs"
                placeholder="FIELDTRACK_PROJECT:... or project ID"
                value={manualQr}
                onChange={(e) => setManualQr(e.target.value)}
              />
              <button
                className="btn-secondary w-full text-sm"
                disabled={processing || !manualQr.trim()}
                title="Submit the pasted QR value"
                onClick={() => void handleAttendance(manualQr.trim())}
              >
                {processing ? <span className="spinner w-4 h-4" /> : 'Submit QR Value'}
              </button>
            </div>
          </div>
        )}
      </div>

      {todayRecord && (
        <div className="card p-5 flex items-center gap-3">
          {todayRecord.sign_out_time ? (
            <LogOut className="w-5 h-5 text-slate-500" />
          ) : (
            <LogIn className="w-5 h-5 text-success-600" />
          )}
          <div>
            <p className="text-sm font-medium text-slate-900">{todayRecord.project?.name}</p>
            <p className="text-xs text-slate-500">
              {todayRecord.sign_out_time ? 'Completed for today' : 'Currently on field'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

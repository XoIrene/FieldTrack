import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer } from 'lucide-react';
import Modal from './ui/Modal';
import { buildProjectQrValue } from '@/lib/projectQr';
import type { FieldProject } from '@/types';

interface ProjectQrModalProps {
  project: FieldProject | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Displays the stable, printable QR code for a single field project.
 * QR payload = `FIELDTRACK_PROJECT:<field_projects.id>` (no sensitive data).
 */
export default function ProjectQrModal({ project, isOpen, onClose }: ProjectQrModalProps) {
  const qrBoxRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);

  if (!isOpen) return null;

  if (!project) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Field QR Code">
        <p className="text-sm text-danger-600">
          No project selected. Please close this dialog and pick a field project first.
        </p>
      </Modal>
    );
  }

  const qrValue = buildProjectQrValue(project.id);
  const fileName = `fieldtrack-qr-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'field'}.png`;
  // Capture a non-null alias: TS otherwise loses the null-guard inside closures.
  const activeProject: FieldProject = project;

  function getSvgElement(): SVGSVGElement | null {
    return qrBoxRef.current?.querySelector('svg') ?? null;
  }

  async function handleDownload() {
    const svg = getSvgElement();
    if (!svg) {
      toast.error('QR code is not ready yet. Please try again.');
      return;
    }
    setBusy('download');
    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
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

        // Render at 1024px on a white background so it stays easy to scan when printed.
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not render the QR code image.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);

        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = fileName;
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
    } finally {
      setBusy(null);
    }
  }

  function handlePrint() {
    const svg = getSvgElement();
    if (!svg) {
      toast.error('QR code is not ready yet. Please try again.');
      return;
    }
    setBusy('print');
    try {
      const printWindow = window.open('', '_blank', 'width=640,height=760');
      if (!printWindow) {
        toast.error('Pop-up blocked. Please allow pop-ups to print the QR code.');
        return;
      }
      const svgHtml = new XMLSerializer().serializeToString(svg);
      const safeName = activeProject.name.replace(/</g, '&lt;');
      const safeLocation = activeProject.location_name.replace(/</g, '&lt;');
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
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Field QR Code - ${activeProject.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          This QR code is <span className="font-semibold">stable and unique per field</span>.
          Generate once, print it, and post it at the site entrance. Workers scan it to sign in
          or out. It contains only the field identifier — no passwords or private data.
        </p>

        {/* Large, high-contrast, phone-friendly QR */}
        <div className="flex justify-center p-6 bg-white rounded-xl border-2 border-dashed border-slate-200">
          <div ref={qrBoxRef} className="bg-white p-2">
            <QRCodeSVG value={qrValue} size={256} level="H" includeMargin />
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-slate-900">{activeProject.name}</p>
          <p className="text-xs text-slate-500">
            {activeProject.location_name}
            {activeProject.latitude != null && activeProject.longitude != null
              ? ` · ${activeProject.latitude.toFixed(4)}, ${activeProject.longitude.toFixed(4)}`
              : ' · QR attendance (no GPS coordinates)'}
            {activeProject.allowed_radius_meters != null
              ? ` · ${activeProject.allowed_radius_meters}m radius`
              : ''}
          </p>
          <p className="text-[11px] font-mono text-slate-400 break-all px-4">{qrValue}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            className="btn-primary w-full"
            onClick={() => void handleDownload()}
            disabled={busy !== null}
          >
            {busy === 'download' ? (
              <span className="spinner w-4 h-4" />
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download PNG
              </>
            )}
          </button>
          <button
            className="btn-secondary w-full"
            onClick={handlePrint}
            disabled={busy !== null}
          >
            {busy === 'print' ? (
              <span className="spinner w-4 h-4" />
            ) : (
              <>
                <Printer className="w-4 h-4" />
                Print QR Code
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] text-slate-400 text-center">
          Tip: print at least 10cm × 10cm and laminate for outdoor use.
        </p>
      </div>
    </Modal>
  );
}

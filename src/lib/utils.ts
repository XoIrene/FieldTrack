import { format, parseISO, differenceInMinutes } from 'date-fns';
import type { GeoPosition } from '../types';

// =============================================
// GEOLOCATION UTILITIES
// =============================================

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Get current GPS position with error handling
 */
export function getCurrentPosition(
  timeout = 10000
): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS is not supported on this device.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Location permission denied. Please enable location access to sign in.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location information is unavailable. Please try again.'));
            break;
          case error.TIMEOUT:
            reject(new Error('Location request timed out. Please try again.'));
            break;
          default:
            reject(new Error('Unable to get your location. Please try again.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Check if a position is within the allowed radius of a field location
 */
export function isWithinRadius(
  workerLat: number,
  workerLon: number,
  fieldLat: number,
  fieldLon: number,
  allowedRadiusMeters: number
): { within: boolean; distance: number } {
  const distance = calculateDistance(workerLat, workerLon, fieldLat, fieldLon);
  return {
    within: distance <= allowedRadiusMeters,
    distance: Math.round(distance),
  };
}

// =============================================
// FORMATTING UTILITIES
// =============================================

export function formatTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'hh:mm a');
  } catch {
    return '—';
  }
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy hh:mm a');
  } catch {
    return '—';
  }
}

export function formatDuration(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return '—';
  try {
    const minutes = differenceInMinutes(parseISO(endTime), parseISO(startTime));
    if (minutes < 0) return '—';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  } catch {
    return '—';
  }
}

export function formatHours(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// =============================================
// VALIDATION UTILITIES
// =============================================

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[+]?[\d\s-]{7,15}$/;
  return phoneRegex.test(phone);
}

export function isValidPassword(password: string): boolean {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return passwordRegex.test(password);
}

export function isValidLatitude(lat: number): boolean {
  return lat >= -90 && lat <= 90;
}

export function isValidLongitude(lon: number): boolean {
  return lon >= -180 && lon <= 180;
}

export function isValidRadius(radius: number): boolean {
  return radius > 0 && radius <= 10000;
}

// =============================================
// MISC UTILITIES
// =============================================

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred. Please try again.';
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'present':
      return 'badge-success';
    case 'late':
      return 'badge-warning';
    case 'absent':
      return 'badge-danger';
    case 'active':
      return 'badge-primary';
    case 'completed':
      return 'badge-success';
    case 'suspended':
      return 'badge-warning';
    case 'expired':
      return 'badge-slate';
    case 'closed':
      return 'badge-slate';
    case 'rejected':
      return 'badge-danger';
    default:
      return 'badge-slate';
  }
}

export function getStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function downloadCSV(filename: string, rows: string[][]) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    )
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  return new Date(now.setDate(diff));
}

export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}
/**
 * Permanent per-field QR helpers.
 *
 * ONE FIELD -> ONE PERMANENT QR, valid as long as the field exists.
 * The QR value contains ONLY a stable, non-sensitive project identifier:
 *   FIELDTRACK_PROJECT:<field_projects.id UUID>
 *
 * No passwords, no service_role keys, no auth tokens, no private data,
 * no expiry timestamps, and no GPS are embedded.
 *
 * There is NO temporary session QR, NO daily QR, and NO expiration.
 * Legacy `FIELDTRACK_ATTENDANCE_SESSION:...` values are rejected with a
 * clear message directing the worker to the permanent field QR.
 */

export const PROJECT_QR_PREFIX = 'FIELDTRACK_PROJECT:';

/**
 * @deprecated Temporary session QRs are no longer supported.
 * Kept only so old printed/session values can be detected and rejected
 * with a helpful message. Do NOT generate new session QRs.
 */
export const SESSION_QR_PREFIX = 'FIELDTRACK_ATTENDANCE_SESSION:';

// Finds a UUID anywhere in a string (tolerates surrounding whitespace,
// quotes, braces, newlines, or scanner-added noise).
const UUID_EXTRACT_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Build the stable QR payload for a field project. */
export function buildProjectQrValue(projectId: string): string {
  return `${PROJECT_QR_PREFIX}${projectId.trim()}`;
}

/**
 * Normalize a raw project UUID for database lookup.
 * Strips surrounding noise and lowercases so `eq('id', ...)` always uses
 * the canonical form stored in `field_projects.id` (Postgres UUIDs are
 * lowercase). This avoids mismatches from uppercase scans or copy-paste.
 */
export function normalizeProjectId(rawId: string): string {
  const match = rawId.match(UUID_EXTRACT_RE);
  return (match ? match[0] : rawId.trim()).toLowerCase();
}

/** Remove BOM / zero-width / control noise that phone cameras sometimes add. */
function cleanScannedText(raw: string): string {
  return (raw || '')
    .replace(/[\uFEFF\u200B\u200C\u200D\u2060]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, (ch) =>
      ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : ''
    )
    .trim();
}

export type ParsedQr =
  | { kind: 'project'; projectId: string }
  | { kind: 'invalid'; reason: string };

/**
 * Parse a scanned QR string.
 * - `FIELDTRACK_PROJECT:<uuid>` -> permanent field QR (the ONLY valid format)
 * - `<uuid>` (bare)              -> permanent field QR (tolerated, e.g. manually typed)
 * - anything else (including legacy `FIELDTRACK_ATTENDANCE_SESSION:...`)
 *                                -> invalid
 */
export function parseScannedQr(raw: string): ParsedQr {
  const text = cleanScannedText(raw);
  if (!text) {
    return { kind: 'invalid', reason: 'Empty QR code. Please scan a field QR code.' };
  }

  // Stable field QR. Prefix match is case-insensitive so a printed /
  // manually-typed variant (e.g. lowercase) still resolves to the same
  // `field_projects.id`. The canonical generated form stays uppercase
  // `FIELDTRACK_PROJECT:<uuid>` — this does NOT create a second format.
  if (text.toUpperCase().startsWith(PROJECT_QR_PREFIX)) {
    const afterPrefix = text.slice(PROJECT_QR_PREFIX.length);
    const extracted = afterPrefix.match(UUID_EXTRACT_RE);
    if (!extracted) {
      const remainder = afterPrefix.trim();
      if (!remainder) {
        return { kind: 'invalid', reason: 'This field QR code is missing its project identifier.' };
      }
      return {
        kind: 'invalid',
        reason: 'This field QR code has a malformed project identifier.',
      };
    }
    return { kind: 'project', projectId: normalizeProjectId(extracted[0]) };
  }

  if (text.startsWith(SESSION_QR_PREFIX)) {
    return {
      kind: 'invalid',
      reason:
        'This looks like an old temporary session QR, which is no longer used. Please scan the permanent field QR code (FIELDTRACK_PROJECT:...).',
    };
  }

  // Tolerate a bare UUID (admin may share/print just the ID, possibly
  // wrapped in braces/quotes/whitespace from copy-paste).
  const bare = text.match(UUID_EXTRACT_RE);
  if (bare && cleanScannedText(text).length <= 40) {
    return { kind: 'project', projectId: normalizeProjectId(bare[0]) };
  }

  return {
    kind: 'invalid',
    reason: 'Invalid QR code. Please scan a FieldTrack field QR code shown by your admin.',
  };
}

/** Exact user-facing message required when the worker is outside the geofence. */
export const OUTSIDE_LOCATION_MESSAGE = 'You are outside the field location.';

/** Exact user-facing message required when a QR is expired, closed, unknown, or malformed. */
export const EXPIRED_INVALID_MESSAGE = 'This QR code is expired or invalid.';

/** Exact user-facing success title required after a valid sign-in. */
export const SIGNED_IN_SUCCESS_MESSAGE = 'Signed in successfully';

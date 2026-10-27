const RESERVED_WINDOWS_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F\x7F]/g;

/**
 * Sanitizes a single file name component.
 * Removes control characters and illegal filesystem characters,
 * guards against Windows reserved names, and truncates to 255 characters.
 */
export function sanitizeFilename(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'unnamed_file';
  }

  // Strip drive letters like C:
  let clean = rawName.replace(/^[a-zA-Z]:[/\\]?/, '');

  // Strip path traversal dots
  clean = clean.replace(/^\.+/, '');

  // Strip illegal chars
  clean = clean.replace(ILLEGAL_FILENAME_CHARS, '_').trim();

  if (!clean || clean === '.' || clean === '..' || /^_+$/.test(clean)) {
    return 'unnamed_file';
  }

  // Check reserved Windows names
  const nameWithoutExt = clean.split('.')[0]!.toUpperCase();
  if (RESERVED_WINDOWS_NAMES.has(nameWithoutExt)) {
    clean = `_${clean}`;
  }

  // Limit to 255 characters (preserve extension if possible)
  if (clean.length > 255) {
    const match = clean.match(/(\.[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)?)$/);
    if (match && match[1] && match[1].length < 16) {
      const ext = match[1];
      clean = clean.slice(0, 255 - ext.length) + ext;
    } else {
      clean = clean.slice(0, 255);
    }
  }

  return clean;
}

/**
 * Sanitizes a relative file path preserving internal directory structure,
 * while preventing directory traversal attacks ('..', leading '/', drive letters).
 */
export function sanitizeRelativePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return 'unnamed_file';
  }

  // Normalize backslashes to forward slashes
  let normalized = rawPath.replace(/\\/g, '/');

  // Strip drive letters like C:/
  normalized = normalized.replace(/^[a-zA-Z]:\/?/, '');

  // Split into path segments
  const segments = normalized.split('/');
  const sanitizedSegments: string[] = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    // Skip empty, current dir (.), and directory traversal (..)
    if (!trimmed || trimmed === '.' || trimmed === '..') {
      continue;
    }

    const cleanSegment = sanitizeFilename(trimmed);
    if (cleanSegment) {
      sanitizedSegments.push(cleanSegment);
    }
  }

  if (sanitizedSegments.length === 0) {
    return 'unnamed_file';
  }

  let result = sanitizedSegments.join('/');
  if (result.length > 1024) {
    result = result.slice(0, 1024);
  }

  return result;
}

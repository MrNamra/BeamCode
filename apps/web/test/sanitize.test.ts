import { describe, it, expect } from 'vitest';
import { sanitizeFilename, sanitizeRelativePath } from '../src/core/util/sanitize.js';

describe('Filename and path sanitizer', () => {
  it('strips directory traversal patterns (../../etc/passwd)', () => {
    expect(sanitizeRelativePath('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeRelativePath('../../../var/log/syslog')).toBe('var/log/syslog');
    expect(sanitizeFilename('../etc/passwd')).not.toContain('..');
  });

  it('strips Windows drive letters (C:\\x, D:/data)', () => {
    expect(sanitizeRelativePath('C:\\Users\\admin\\file.txt')).toBe('Users/admin/file.txt');
    expect(sanitizeRelativePath('D:/photos/vacation.jpg')).toBe('photos/vacation.jpg');
    expect(sanitizeFilename('C:passwd')).toBe('passwd');
  });

  it('strips control characters and illegal filesystem characters', () => {
    expect(sanitizeFilename('my*file?name<is>bad:here|ok.txt')).toBe(
      'my_file_name_is_bad_here_ok.txt'
    );
    expect(sanitizeFilename('file\x00\x1F\x7F.png')).toBe('file___.png');
  });

  it('escapes reserved Windows names (CON, PRN, AUX, NUL, COM1, LPT1)', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('nul.txt')).toBe('_nul.txt');
    expect(sanitizeFilename('com1.dat')).toBe('_com1.dat');
    expect(sanitizeFilename('prn.pdf')).toBe('_prn.pdf');
  });

  it('truncates excessively long filenames while keeping extension', () => {
    const longName = 'a'.repeat(300) + '.tar.gz';
    const sanitized = sanitizeFilename(longName);
    expect(sanitized.length).toBeLessThanOrEqual(255);
    expect(sanitized.endsWith('.tar.gz')).toBe(true);
  });

  it('falls back to unnamed_file on empty or all-stripped input', () => {
    expect(sanitizeFilename('')).toBe('unnamed_file');
    expect(sanitizeFilename('..')).toBe('unnamed_file');
    expect(sanitizeFilename('///')).toBe('unnamed_file');
    expect(sanitizeRelativePath('../../..')).toBe('unnamed_file');
  });
});

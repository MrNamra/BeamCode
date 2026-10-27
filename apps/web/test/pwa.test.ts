import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Progressive Web App (PWA) Configuration', () => {
  const publicDir = path.resolve(process.cwd(), 'apps/web/public');
  const indexHtmlPath = path.resolve(process.cwd(), 'apps/web/index.html');

  it('provides a valid manifest.webmanifest with all required PWA fields', () => {
    const manifestPath = path.join(publicDir, 'manifest.webmanifest');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);

    expect(manifest.name).toBe('BeamCode — Peer-to-Peer File Transfer');
    expect(manifest.short_name).toBe('BeamCode');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0B0F17');
    expect(manifest.theme_color).toBe('#2563EB');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);

    // Verify maskable icon exists for Android/Chrome adaptive icons
    const hasMaskable = manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable');
    expect(hasMaskable).toBe(true);

    // Verify share_target exists for native OS file sharing
    expect(manifest.share_target).toBeDefined();
    expect(manifest.share_target.action).toBe('/share-target');
  });

  it('ensures all icons declared in manifest exist on disk', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8')
    );

    for (const icon of manifest.icons) {
      const relPath = icon.src.replace(/^\//, '');
      const filePath = path.join(publicDir, relPath);
      expect(fs.existsSync(filePath), `Icon file ${icon.src} should exist`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it('includes PWA manifest and theme meta tags in index.html', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  });

  it('ensures service worker (sw.js) handles caching and download streaming', () => {
    const swPath = path.join(publicDir, 'sw.js');
    expect(fs.existsSync(swPath)).toBe(true);

    const swContent = fs.readFileSync(swPath, 'utf8');
    expect(swContent).toContain("addEventListener('install'");
    expect(swContent).toContain("addEventListener('activate'");
    expect(swContent).toContain("addEventListener('fetch'");
    expect(swContent).toContain('/sw-download/');
    expect(swContent).toContain('/share-target');
  });
});

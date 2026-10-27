/* eslint-disable no-undef */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'apps/web/public/icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Regular Icon SVG
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#0B0F17"/>
    </linearGradient>
    <linearGradient id="beamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="50%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
    <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#2563EB" stop-opacity="0.2"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background Squircle -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <rect x="4" y="4" width="504" height="504" rx="108" fill="none" stroke="#334155" stroke-width="3" stroke-opacity="0.6"/>

  <!-- Glowing Beam Path -->
  <g filter="url(#glow)">
    <!-- Fast Transmission Chevron / Beam -->
    <path d="M140 136 L280 256 L140 376" fill="none" stroke="url(#pulseGrad)" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
    <path d="M220 136 L360 256 L220 376" fill="none" stroke="url(#beamGrad)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Center Dynamic Lightning/Beam Node -->
  <circle cx="280" cy="256" r="28" fill="#38BDF8" filter="url(#glow)"/>
  <circle cx="280" cy="256" r="14" fill="#FFFFFF"/>
</svg>`;

// 2. Maskable Icon SVG (Designed to be safe within the central 80% circle)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="maskBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#0B0F17"/>
    </linearGradient>
    <linearGradient id="maskBeamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="50%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
    <linearGradient id="maskPulseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#2563EB" stop-opacity="0.2"/>
    </linearGradient>
    <filter id="maskGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Full Bleed Background for Maskable Icon -->
  <rect width="512" height="512" fill="url(#maskBgGrad)"/>

  <!-- Centered Safe-Zone Artwork (Scale ~72%) -->
  <g transform="translate(51.2, 51.2) scale(0.8)">
    <path d="M140 136 L280 256 L140 376" fill="none" stroke="url(#maskPulseGrad)" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
    <path d="M220 136 L360 256 L220 376" fill="none" stroke="url(#maskBeamGrad)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" filter="url(#maskGlow)"/>
    <circle cx="280" cy="256" r="28" fill="#38BDF8" filter="url(#maskGlow)"/>
    <circle cx="280" cy="256" r="14" fill="#FFFFFF"/>
  </g>
</svg>`;

async function generate() {
  // Save SVGs
  fs.writeFileSync(path.join(outDir, 'icon.svg'), standardSvg);
  fs.writeFileSync(path.join(process.cwd(), 'apps/web/public/favicon.svg'), standardSvg);
  console.log('Saved SVG icons.');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Helper to render SVG to PNG at given size
  async function renderToPng(svg, size, filename) {
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;width:${size}px;height:${size}px;">${svg.replace(/width="512" height="512"/, `width="${size}" height="${size}"`)}</body></html>`;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html);
    const dest = path.join(outDir, filename);
    await page.screenshot({ path: dest, omitBackground: true });
    console.log(`Rendered ${filename} (${size}x${size})`);
  }

  await renderToPng(standardSvg, 192, 'icon-192.png');
  await renderToPng(standardSvg, 512, 'icon-512.png');
  await renderToPng(standardSvg, 180, 'apple-touch-icon.png');
  await renderToPng(maskableSvg, 192, 'icon-maskable-192.png');
  await renderToPng(maskableSvg, 512, 'icon-maskable-512.png');

  await browser.close();
  console.log('All PWA icon assets generated successfully.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

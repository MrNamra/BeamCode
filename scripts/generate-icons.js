/* eslint-disable no-undef */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'apps/web/public/icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Regular Icon SVG (Stylized B + High-Speed Transmission Chevrons)
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#182335"/>
      <stop offset="100%" stop-color="#080C14"/>
    </linearGradient>
    <linearGradient id="bGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="45%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>
    <linearGradient id="chevronGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60A5FA"/>
      <stop offset="100%" stop-color="#38BDF8"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background Squircle -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#2A384C" stroke-width="3" stroke-opacity="0.8"/>

  <g filter="url(#glow)">
    <!-- Stylized 'B' Structure -->
    <path d="M 130 130 L 225 130 C 268 130 295 152 295 188 C 295 218 274 238 244 250 C 284 262 308 286 308 322 C 308 362 272 382 225 382 L 130 382 Z" fill="none" stroke="url(#bGrad)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 130 250 L 236 250" stroke="url(#bGrad)" stroke-width="36" stroke-linecap="round"/>

    <!-- Beam Transmission Chevrons >> -->
    <path d="M 330 160 L 410 256 L 330 352" fill="none" stroke="url(#chevronGrad)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

// 2. Maskable Icon SVG (Centered Safe-Zone with Full-Bleed Background)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="maskBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#182335"/>
      <stop offset="100%" stop-color="#080C14"/>
    </linearGradient>
    <linearGradient id="maskBGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="45%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>
    <linearGradient id="maskChevronGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60A5FA"/>
      <stop offset="100%" stop-color="#38BDF8"/>
    </linearGradient>
    <filter id="maskGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Full Bleed Background for Adaptive Masks -->
  <rect width="512" height="512" fill="url(#maskBgGrad)"/>

  <!-- Centered Safe-Zone Artwork (Scale 75%) -->
  <g transform="translate(64, 64) scale(0.75)" filter="url(#maskGlow)">
    <path d="M 130 130 L 225 130 C 268 130 295 152 295 188 C 295 218 274 238 244 250 C 284 262 308 286 308 322 C 308 362 272 382 225 382 L 130 382 Z" fill="none" stroke="url(#maskBGrad)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 130 250 L 236 250" stroke="url(#maskBGrad)" stroke-width="36" stroke-linecap="round"/>
    <path d="M 330 160 L 410 256 L 330 352" fill="none" stroke="url(#maskChevronGrad)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

async function generate() {
  fs.writeFileSync(path.join(outDir, 'icon.svg'), standardSvg);
  fs.writeFileSync(path.join(process.cwd(), 'apps/web/public/favicon.svg'), standardSvg);
  console.log('Saved SVG icons with B brand emblem.');

  const browser = await chromium.launch();
  const page = await browser.newPage();

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
  console.log('All PWA icon assets regenerated with B brand emblem.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});

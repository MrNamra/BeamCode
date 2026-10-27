import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = '/home/admin1/.gemini/antigravity/brain/9e30d6d1-57f5-40c8-b23b-8ceba9a63eae';
const SCREENSHOT_DIR = path.join(process.cwd(), 'apps/web/public/screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }
});

test.describe('Phase 4 UI - Responsive & Theming Screenshots', () => {
  test.describe.configure({ mode: 'serial' });

  test('captures screenshots at 360px and 1440px in light and dark modes', async ({ page }) => {
    // 1. 1440px Desktop - Light mode
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('beamcode_theme', 'light');
    });
    await expect(page.locator('[data-testid="send-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="receive-card"]')).toBeVisible();

    const dest1440Light = path.join(SCREENSHOT_DIR, 'home-1440-light.png');
    await page.screenshot({ path: dest1440Light, fullPage: true });
    fs.copyFileSync(dest1440Light, path.join(ARTIFACT_DIR, 'home-1440-light.png'));

    // 2. 1440px Desktop - Dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('beamcode_theme', 'dark');
    });
    // small wait for transition
    await page.waitForTimeout(300);

    const dest1440Dark = path.join(SCREENSHOT_DIR, 'home-1440-dark.png');
    await page.screenshot({ path: dest1440Dark, fullPage: true });
    fs.copyFileSync(dest1440Dark, path.join(ARTIFACT_DIR, 'home-1440-dark.png'));

    // 3. 360px Mobile - Light mode
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('beamcode_theme', 'light');
    });
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="tab-send"]')).toBeVisible();
    await expect(page.locator('[data-testid="send-card"]')).toBeVisible();

    const dest360Light = path.join(SCREENSHOT_DIR, 'home-360-light.png');
    await page.screenshot({ path: dest360Light, fullPage: true });
    fs.copyFileSync(dest360Light, path.join(ARTIFACT_DIR, 'home-360-light.png'));

    // 4. 360px Mobile - Dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('beamcode_theme', 'dark');
    });
    await page.waitForTimeout(300);

    const dest360Dark = path.join(SCREENSHOT_DIR, 'home-360-dark.png');
    await page.screenshot({ path: dest360Dark, fullPage: true });
    fs.copyFileSync(dest360Dark, path.join(ARTIFACT_DIR, 'home-360-dark.png'));
  });

  test('verifies mobile navbar displays brand logo and responsive menu', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');

    // Brand logo image is visible
    const logoImg = page.locator('[data-testid="brand-link"] img');
    await expect(logoImg).toBeVisible();

    // Hamburger button is visible on mobile
    const menuBtn = page.locator('[data-testid="mobile-menu-btn"]');
    await expect(menuBtn).toBeVisible();

    // Open mobile menu
    await menuBtn.click();
    const dropdown = page.locator('[data-testid="mobile-menu-dropdown"]');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('text=How it works')).toBeVisible();
    await expect(dropdown.locator('text=Privacy')).toBeVisible();

    // Close menu
    await menuBtn.click();
    await expect(dropdown).not.toBeVisible();
  });

  test('verifies deep link /r/:code opens receive card and auto-joins', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/r/482019');

    await expect(page.locator('[data-testid="receive-card"]')).toBeVisible();
    await expect(
      page
        .locator('text=Connecting to sender…')
        .or(page.locator('text=Waiting for sender approval…'))
        .or(page.locator('[data-testid="receive-error-message"]'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('runs complete UI transfer between sender and receiver in browser', async ({ browser }) => {
    const senderContext = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const receiverContext = await browser.newContext({ viewport: { width: 1200, height: 800 } });

    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();

    // 1. Sender visits home page
    await senderPage.goto('/');

    // 2. Select file using file-input
    const filePayload = {
      name: 'hello-beamcode.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('BeamCode direct P2P transfer working perfectly!'),
    };
    await senderPage.setInputFiles('[data-testid="file-input"]', [filePayload]);

    // File item should be visible in FileList
    await expect(senderPage.locator('[data-testid="file-list-items"]')).toContainText('hello-beamcode.txt');

    // 3. Sender clicks Send
    await senderPage.click('[data-testid="send-action-button"]');

    // 4. CodeDisplay appears with 6 digits
    const digitsLocator = senderPage.locator('[data-testid="display-code-digits"]');
    await expect(digitsLocator).not.toBeEmpty({ timeout: 15000 });
    const rawCodeText = (await digitsLocator.textContent())?.replace(/\s+/g, '') || '';
    expect(rawCodeText).toMatch(/^\d{6}$/);

    const destCode = path.join(SCREENSHOT_DIR, 'code-display-1200-light.png');
    await senderPage.screenshot({ path: destCode });
    fs.copyFileSync(destCode, path.join(ARTIFACT_DIR, 'code-display-1200-light.png'));

    // 5. Receiver joins via deep link
    await receiverPage.goto(`/r/${rawCodeText}`);

    // 6. Transfer starts automatically on code entry without manual approval needed from either side
    // Both sides see progress card and then completed result card
    await expect(senderPage.locator('[data-testid="result-card"]')).toBeVisible({ timeout: 25000 });
    await expect(receiverPage.locator('[data-testid="result-card"]')).toBeVisible({ timeout: 25000 });

    const destCompleted = path.join(SCREENSHOT_DIR, 'completed-1200-light.png');
    await receiverPage.screenshot({ path: destCompleted });
    fs.copyFileSync(destCompleted, path.join(ARTIFACT_DIR, 'completed-1200-light.png'));

    await senderContext.close();
    await receiverContext.close();
  });
});

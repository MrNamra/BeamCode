import { test, expect } from '@playwright/test';

test.describe('1 GB Localhost WebRTC Transfer (Phase 3)', () => {
  test('transfers 1 GB file between two browser contexts on localhost with matching SHA-256', async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    // 1 GB = 1024 * 1024 * 1024 bytes
    const oneGbBytes = 1024 * 1024 * 1024;

    // Create two isolated browser contexts (Sender and Receiver)
    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();

    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();

    senderPage.on('console', (msg) => console.log('[Sender Page]', msg.text()));
    senderPage.on('pageerror', (err) => console.error('[Sender Error]', err));
    receiverPage.on('console', (msg) => console.log('[Receiver Page]', msg.text()));
    receiverPage.on('pageerror', (err) => console.error('[Receiver Error]', err));

    // 1. Launch sender on test-transfer page
    await senderPage.goto(`/test-transfer?role=sender&size=${oneGbBytes}`);

    // Wait for file generation, hashing and code creation
    const codeLocator = senderPage.locator('#sender-code');
    await expect(codeLocator).not.toBeEmpty({ timeout: 45000 });
    const code = (await codeLocator.textContent())?.trim();
    expect(code).toMatch(/^\d{6}$/);

    const senderHashLocator = senderPage.locator('#sender-hash');
    await expect(senderHashLocator).not.toBeEmpty({ timeout: 45000 });
    const senderHash = (await senderHashLocator.textContent())?.trim();
    expect(senderHash).toHaveLength(64);

    console.log(`[Sender] Code: ${code}, SHA-256: ${senderHash}`);

    // 2. Launch receiver with the generated code
    await receiverPage.goto(`/test-transfer?role=receiver&code=${code}`);

    // 3. Wait for transfer to complete on receiver
    const receiverDoneLocator = receiverPage.locator('#transfer-done');
    await expect(receiverDoneLocator).toHaveText('true', { timeout: 120000 });

    // 4. Verify receiver SHA-256 matches sender SHA-256
    const receiverHashLocator = receiverPage.locator('#receiver-hash');
    await expect(receiverHashLocator).not.toBeEmpty({ timeout: 30000 });
    const receiverHash = (await receiverHashLocator.textContent())?.trim();

    console.log(`[Receiver] SHA-256: ${receiverHash}`);
    expect(receiverHash).toBe(senderHash);

    // 5. Read measured MB/s
    const measuredMbsLocator = receiverPage.locator('#measured-mbs');
    const measuredMBs = (await measuredMbsLocator.textContent())?.trim();
    console.log(`[Measurement] Measured Throughput: ${measuredMBs} MB/s`);

    await senderContext.close();
    await receiverContext.close();
  });
});

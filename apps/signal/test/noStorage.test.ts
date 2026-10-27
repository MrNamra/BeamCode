import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSignalServer } from '../src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

describe('No Storage Verification (docs/09-TESTING.md §4.1 & §4.2, AC-6)', () => {
  it('passes static check: signal/src contains NO forbidden storage/multipart patterns (§4.1)', () => {
    const forbiddenPatterns = [
      /multipart/i,
      /fs\.write/i,
      /createWriteStream/i,
      /@fastify\/multipart/i,
      /formidable/i,
      /busboy/i,
      /@aws-sdk/i,
      /aws-sdk/i,
      /@google-cloud\/storage/i,
      /@azure\/storage-blob/i,
      /minio/i,
      /sqlite/i,
      /better-sqlite3/i,
      /typeorm/i,
      /prisma/i,
      /mongoose/i,
    ];

    function scanDir(dir: string): string[] {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      let results: string[] = [];
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          results = results.concat(scanDir(fullPath));
        } else if (file.name.endsWith('.ts') || file.name.endsWith('.js')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const sourceFiles = scanDir(srcDir);
    expect(sourceFiles.length).toBeGreaterThan(0);

    const violations: { file: string; pattern: string; line: string }[] = [];

    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          return;
        }

        for (const pattern of forbiddenPatterns) {
          if (pattern.test(line)) {
            violations.push({
              file: path.relative(srcDir, filePath),
              pattern: pattern.source,
              line: `Line ${idx + 1}: ${trimmed}`,
            });
          }
        }
      });
    }

    expect(
      violations,
      `Forbidden storage/upload patterns found in apps/signal/src:\n${violations.map((v) => `${v.file}: ${v.pattern} -> ${v.line}`).join('\n')}`
    ).toEqual([]);
  });

  it('passes route check: server only registers GET routes /healthz, /api/ice, /ws, /metrics (§4.2)', async () => {
    const server = await createSignalServer({ PORT: 0 });
    await server.app.ready();

    const allowedPaths = ['/healthz', '/api/ice', '/ws', '/metrics'];

    // Also check through fastify iterator or request each method
    const forbiddenMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

    for (const method of forbiddenMethods) {
      for (const path of allowedPaths) {
        const res = await server.app.inject({
          method: method as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
          url: path,
        });
        // Non-GET requests should return 404 (Route not found) or 405 (Method not allowed)
        expect(
          res.statusCode,
          `${method} ${path} must not be accepted by server (got status ${res.statusCode})`
        ).toBe(404);
      }
    }

    // Verify GET routes succeed or accept connection
    const healthzRes = await server.app.inject({ method: 'GET', url: '/healthz' });
    expect(healthzRes.statusCode).toBe(200);

    const iceRes = await server.app.inject({ method: 'GET', url: '/api/ice' });
    expect(iceRes.statusCode).toBe(200);

    const metricsRes = await server.app.inject({ method: 'GET', url: '/metrics' });
    expect(metricsRes.statusCode).toBe(200);

    await server.close();
  });
});

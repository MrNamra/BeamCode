import { useState } from 'react';

export function DebugPage() {
  const [logs] = useState<string[]>([
    'Debug mode active.',
    `WebRTC supported: ${typeof RTCPeerConnection !== 'undefined'}`,
    `WebSocket supported: ${typeof WebSocket !== 'undefined'}`,
    `FileSystemAccess supported: ${typeof window !== 'undefined' && 'showSaveFilePicker' in window}`,
    `ServiceWorker supported: ${typeof navigator !== 'undefined' && 'serviceWorker' in navigator}`,
    `WakeLock supported: ${typeof navigator !== 'undefined' && 'wakeLock' in navigator}`,
  ]);

  return (
    <div className="p-8 max-w-4xl mx-auto font-mono text-sm">
      <h1 className="text-2xl font-bold mb-4">BeamCode WebRTC Diagnostics (/debug)</h1>
      <div className="bg-slate-900 text-green-400 p-4 rounded-lg space-y-2">
        {logs.map((log, idx) => (
          <div key={idx}>{log}</div>
        ))}
      </div>
    </div>
  );
}

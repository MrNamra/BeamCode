declare global {
  interface Window {
    showSaveFilePicker?: (options?: unknown) => Promise<unknown>;
    showDirectoryPicker?: (options?: unknown) => Promise<unknown>;
  }
}

export interface BrowserCapabilities {
  supported: boolean;
  unsupportedReasons: string[];
  hasFileSystemAccess: boolean;
  hasServiceWorker: boolean;
  hasWakeLock: boolean;
  recommendedSink: 'fs-access' | 'service-worker' | 'memory';
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  if (typeof window === 'undefined') {
    return {
      supported: true,
      unsupportedReasons: [],
      hasFileSystemAccess: false,
      hasServiceWorker: false,
      hasWakeLock: false,
      recommendedSink: 'memory',
    };
  }

  const unsupportedReasons: string[] = [];

  if (typeof window.RTCPeerConnection === 'undefined') {
    unsupportedReasons.push('WebRTC (RTCPeerConnection) is not supported.');
  }
  if (typeof window.WebSocket === 'undefined') {
    unsupportedReasons.push('WebSocket is not supported.');
  }
  if (typeof window.File === 'undefined' || typeof window.Blob === 'undefined') {
    unsupportedReasons.push('File and Blob APIs are not supported.');
  }
  if (typeof window.ReadableStream === 'undefined') {
    unsupportedReasons.push('Streams API (ReadableStream) is not supported.');
  }

  const hasFileSystemAccess =
    typeof window.showSaveFilePicker === 'function' ||
    typeof window.showDirectoryPicker === 'function';

  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasWakeLock = 'wakeLock' in navigator;

  let recommendedSink: 'fs-access' | 'service-worker' | 'memory' = 'memory';
  if (hasFileSystemAccess) {
    recommendedSink = 'fs-access';
  } else if (hasServiceWorker) {
    recommendedSink = 'service-worker';
  }

  return {
    supported: unsupportedReasons.length === 0,
    unsupportedReasons,
    hasFileSystemAccess,
    hasServiceWorker,
    hasWakeLock,
    recommendedSink,
  };
}

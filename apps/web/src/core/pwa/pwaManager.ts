import { create } from 'zustand';
import { useTransferStore } from '../state/transferStore.js';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PwaState {
  canInstall: boolean;
  isInstalled: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  triggerInstall: () => Promise<boolean>;
}

export const usePwaStore = create<PwaState>((set, get) => ({
  canInstall: false,
  isInstalled:
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true),
  installPrompt: null,

  triggerInstall: async () => {
    const prompt = get().installPrompt;
    if (!prompt) return false;

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        set({ canInstall: false, installPrompt: null, isInstalled: true });
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[PWA] Install prompt failed:', err);
      return false;
    }
  },
}));

/**
 * Reads shared files deposited by Service Worker Web Share Target (IndexedDB)
 */
async function checkSharedTargetFiles(): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;

  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.get('shared')) return;

  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('beamcode-share', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (!db.objectStoreNames.contains('shared-files')) return;

    const files: File[] = await new Promise((resolve, reject) => {
      const tx = db.transaction('shared-files', 'readonly');
      const store = tx.objectStore('shared-files');
      const getReq = store.getAll();
      getReq.onsuccess = () => {
        const records = getReq.result as Array<{
          name: string;
          type: string;
          blob: Blob;
          lastModified?: number;
        }>;
        const mapped = records.map(
          (r) => new File([r.blob], r.name, { type: r.type, lastModified: r.lastModified || Date.now() })
        );
        resolve(mapped);
      };
      getReq.onerror = () => reject(getReq.error);
    });

    if (files.length > 0) {
      useTransferStore.getState().addFiles(files);

      // Clean up IndexedDB
      const clearTx = db.transaction('shared-files', 'readwrite');
      clearTx.objectStore('shared-files').clear();

      // Clean URL
      urlParams.delete('shared');
      const newQuery = urlParams.toString() ? `?${urlParams.toString()}` : '';
      window.history.replaceState({}, '', `${window.location.pathname}${newQuery}`);
    }
  } catch (err) {
    console.warn('[PWA] Failed to read share-target files:', err);
  }
}

/**
 * Initializes Service Worker registration and PWA install listeners
 */
export function initPwa(): void {
  if (typeof window === 'undefined') return;

  // 1. Capture beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    const promptEvent = e as BeforeInstallPromptEvent;
    usePwaStore.setState({
      canInstall: true,
      installPrompt: promptEvent,
    });
  });

  // 2. Capture appinstalled
  window.addEventListener('appinstalled', () => {
    usePwaStore.setState({
      canInstall: false,
      installPrompt: null,
      isInstalled: true,
    });
    console.log('[PWA] BeamCode installed as application.');
  });

  // 3. Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // 4. Process share-target files if launched via OS Share
  checkSharedTargetFiles();
}

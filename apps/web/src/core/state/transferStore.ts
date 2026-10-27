import { create } from 'zustand';
import {
  ManifestFileItem,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_WINDOW_BYTES_LAN,
  SignalData,
} from '@beamcode/protocol';
import { SignalingClient } from '../signaling/SignalingClient.js';
import { PeerSession } from '../rtc/PeerSession.js';
import { fetchIceServers } from '../rtc/iceConfig.js';
import { ConnectionType, detectConnectionType } from '../rtc/connectionType.js';
import { performSenderHandshake, performReceiverHandshake } from '../transfer/handshake.js';
import { SenderTransfer } from '../transfer/SenderTransfer.js';
import { ReceiverTransfer } from '../transfer/ReceiverTransfer.js';
import { Sink } from '../sinks/Sink.js';
import { ServiceWorkerStreamSink } from '../sinks/ServiceWorkerStreamSink.js';
import { MemoryBlobSink } from '../sinks/MemoryBlobSink.js';
import { ZipSink } from '../sinks/ZipSink.js';
import { WakeLockManager } from '../util/wakeLock.js';
import { detectBrowserCapabilities } from '../util/capabilities.js';

export type TransferRole = 'sender' | 'receiver' | 'idle';

export type SenderStep =
  | 'idle'
  | 'creating_code'
  | 'waiting_receiver'
  | 'receiver_request'
  | 'connecting'
  | 'transferring'
  | 'completed'
  | 'expired'
  | 'declined'
  | 'failed'
  | 'cant_connect';

export type ReceiverStep =
  | 'idle'
  | 'connecting_code'
  | 'review'
  | 'connecting'
  | 'transferring'
  | 'completed'
  | 'expired'
  | 'declined'
  | 'failed'
  | 'cant_connect';

export interface SelectedFileItem {
  file: File | Blob;
  meta: ManifestFileItem;
  checked?: boolean;
}

export interface ProgressState {
  bytesDone: number;
  totalBytes: number;
  percent: number;
  speedMBs: string;
  eta: string;
}

interface TransferStoreState {
  role: TransferRole;
  senderStep: SenderStep;
  receiverStep: ReceiverStep;

  // Selected files (Sender or Receiver)
  selectedFiles: SelectedFileItem[];
  saveAsZip: boolean;

  // Code & Session info
  code: string;
  codeExpiresAt: number | null;
  receiverDeviceName: string;
  senderDeviceName: string;

  // Connection
  connectionType: ConnectionType | null;

  // Progress
  progress: ProgressState;

  // Error / failure details
  errorMessage: string | null;

  // Actions
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  setSaveAsZip: (zip: boolean) => void;
  toggleFileSelection: (index: number) => void;

  // Sender flows
  startSending: () => Promise<void>;
  acceptReceiver: () => void;
  declineReceiver: () => void;
  cancelTransfer: (reason?: string) => void;
  resetSender: () => void;

  // Receiver flows
  startReceiving: (code: string) => Promise<void>;
  acceptTransfer: () => Promise<void>;
  declineTransfer: () => void;
  resetReceiver: () => void;
}

let activeSignaling: SignalingClient | null = null;
let activePeerSession: PeerSession | null = null;
let activeSenderTransfer: SenderTransfer | null = null;
let activeReceiverTransfer: ReceiverTransfer | null = null;
let activeWakeLock: WakeLockManager | null = null;
let activeSink: Sink | null = null;
let pendingReceiverId = '';
let connectionCheckTimer: ReturnType<typeof setInterval> | null = null;

function getSignalUrl(): string {
  const envUrl = (import.meta as unknown as { env: { VITE_SIGNAL_URL?: string } }).env
    .VITE_SIGNAL_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    // In local Vite development mode (port 5173), connect directly to signal dev server on 8080
    if (window.location.port === '5173') {
      return `ws://${window.location.hostname}:8080/ws`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return 'ws://localhost:8080/ws';
}

export const useTransferStore = create<TransferStoreState>((set, get) => ({
  role: 'idle',
  senderStep: 'idle',
  receiverStep: 'idle',

  selectedFiles: [],
  saveAsZip: false,

  code: '',
  codeExpiresAt: null,
  receiverDeviceName: '',
  senderDeviceName: '',

  connectionType: null,

  progress: {
    bytesDone: 0,
    totalBytes: 0,
    percent: 0,
    speedMBs: '0',
    eta: '--:--',
  },

  errorMessage: null,

  addFiles: (newFiles: File[]) => {
    const current = get().selectedFiles;
    let nextIndex = current.length;

    const items: SelectedFileItem[] = newFiles.map((file) => {
      const relPath =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return {
        file,
        meta: {
          index: nextIndex++,
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          relPath,
        },
        checked: true,
      };
    });

    set({ selectedFiles: [...current, ...items] });
  },

  removeFile: (index: number) => {
    const filtered = get().selectedFiles.filter((_, idx) => idx !== index);
    // Re-index remaining files
    const reindexed = filtered.map((item, idx) => ({
      ...item,
      meta: { ...item.meta, index: idx },
    }));
    set({ selectedFiles: reindexed });
  },

  clearFiles: () => {
    set({ selectedFiles: [] });
  },

  setSaveAsZip: (saveAsZip: boolean) => {
    set({ saveAsZip });
  },

  toggleFileSelection: (index: number) => {
    const updated = get().selectedFiles.map((item, idx) => {
      if (idx === index) {
        return { ...item, checked: !item.checked };
      }
      return item;
    });
    set({ selectedFiles: updated });
  },

  startSending: async () => {
    const files = get().selectedFiles;
    if (files.length === 0) return;

    set({
      role: 'sender',
      senderStep: 'creating_code',
      errorMessage: null,
      code: '',
      codeExpiresAt: null,
    });

    try {
      const signaling = new SignalingClient(getSignalUrl());
      activeSignaling = signaling;
      await signaling.connect();

      signaling.send({ v: 1, t: 'create' });

      const queuedSignals: SignalData[] = [];
      let peerIdReceiver = '';

      async function handleSenderSignal(session: PeerSession, data: SignalData) {
        if (data.kind === 'answer') {
          await session.handleAnswer(data.sdp);
        } else if (data.kind === 'ice') {
          await session.addIceCandidate(data.candidate);
        }
      }

      signaling.on('code-created', (msg) => {
        set({
          senderStep: 'waiting_receiver',
          code: msg.code,
          codeExpiresAt: msg.expiresAt,
        });
      });

      signaling.on('code-released', (msg) => {
        if (msg.reason === 'expired') {
          set({ senderStep: 'expired' });
        } else if (msg.reason === 'cancelled') {
          set({ senderStep: 'declined' });
        }
      });

      signaling.on('join-request', (msg) => {
        pendingReceiverId = msg.receiverId;
        // Auto-approve receiver immediately so transfer starts automatically on code entry
        signaling.send({
          v: 1,
          t: 'join-decision',
          receiverId: msg.receiverId,
          accept: true,
        });
        set({
          senderStep: 'connecting',
          receiverDeviceName: msg.deviceName,
        });
      });

      signaling.on('join-accepted', async (msg) => {
        if (msg.peerId) {
          peerIdReceiver = msg.peerId;
        }
        set({ senderStep: 'connecting' });

        try {
          const iceServers = await fetchIceServers();
          const session = new PeerSession({
            iceServers,
            onSignal: (data) => {
              signaling.send({ v: 1, t: 'signal', to: peerIdReceiver, data });
            },
          });
          activePeerSession = session;

          // Periodically detect connection type
          connectionCheckTimer = setInterval(async () => {
            if (activePeerSession) {
              const type = await detectConnectionType(activePeerSession.pc);
              set({ connectionType: type });
            }
          }, 1500);

          const offer = await session.createOffer();
          signaling.send({
            v: 1,
            t: 'signal',
            to: peerIdReceiver,
            data: { kind: 'offer', sdp: offer.sdp! },
          });

          while (queuedSignals.length > 0) {
            const sig = queuedSignals.shift()!;
            await handleSenderSignal(session, sig);
          }

          await session.waitForChannelsOpen(4, 30000);

          // Perform control handshake
          const manifestFiles = get().selectedFiles.map((f) => f.meta);
          const handshake = await performSenderHandshake({
            ctrlChannel: session.ctrlChannel,
            transferId: `tx_${Date.now()}`,
            files: manifestFiles,
          });

          if (!handshake.accepted) {
            set({ senderStep: 'declined' });
            return;
          }

          set({ senderStep: 'transferring' });
          if (!activeWakeLock) activeWakeLock = new WakeLockManager();
          await activeWakeLock.request();

          const senderTransfer = new SenderTransfer({
            ctrlChannel: session.ctrlChannel,
            dataChannels: session.dataChannels,
            files: get().selectedFiles.map((f) => ({ file: f.file, meta: f.meta })),
            chunkSize: handshake.chunkSize,
            channelsCount: handshake.channels,
            windowBytes: handshake.windowBytes,
            onProgress: (p) => {
              const percent = p.totalBytes > 0 ? (p.bytesAcked / p.totalBytes) * 100 : 100;
              set({
                progress: {
                  bytesDone: p.bytesAcked,
                  totalBytes: p.totalBytes,
                  percent: Math.min(100, Math.round(percent)),
                  speedMBs: p.speedMBs,
                  eta: p.eta,
                },
              });
            },
            onDone: () => {
              activeWakeLock?.release();
              activeWakeLock = null;
              if (connectionCheckTimer) clearInterval(connectionCheckTimer);
              set({ senderStep: 'completed' });
            },
            onError: (err) => {
              activeWakeLock?.release();
              activeWakeLock = null;
              if (connectionCheckTimer) clearInterval(connectionCheckTimer);
              set({ senderStep: 'failed', errorMessage: err.message });
            },
          });

          activeSenderTransfer = senderTransfer;
          await senderTransfer.start();
        } catch (err) {
          activeWakeLock?.release();
          activeWakeLock = null;
          if (connectionCheckTimer) clearInterval(connectionCheckTimer);
          set({
            senderStep: 'failed',
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
      });

      signaling.on('signal', async (msg) => {
        if (activePeerSession) {
          await handleSenderSignal(activePeerSession, msg.data);
        } else {
          queuedSignals.push(msg.data);
        }
      });

      signaling.on('close', () => {
        if (get().senderStep === 'transferring' || get().senderStep === 'connecting') {
          set({ senderStep: 'failed', errorMessage: 'Signaling connection closed' });
        }
      });
    } catch (err) {
      set({
        senderStep: 'cant_connect',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  },

  acceptReceiver: () => {
    if (activeSignaling && pendingReceiverId) {
      activeSignaling.send({
        v: 1,
        t: 'join-decision',
        receiverId: pendingReceiverId,
        accept: true,
      });
    }
  },

  declineReceiver: () => {
    if (activeSignaling && pendingReceiverId) {
      activeSignaling.send({
        v: 1,
        t: 'join-decision',
        receiverId: pendingReceiverId,
        accept: false,
      });
    }
    set({ senderStep: 'declined' });
  },

  cancelTransfer: (reason = 'User cancelled') => {
    if (activeSenderTransfer) {
      activeSenderTransfer.cancel(reason);
    }
    if (activeReceiverTransfer) {
      activeReceiverTransfer.cancel(reason);
    }
    activeWakeLock?.release();
    activeWakeLock = null;
    if (connectionCheckTimer) clearInterval(connectionCheckTimer);
    activeSignaling?.disconnect();
    activePeerSession?.close();

    if (get().role === 'sender') {
      set({ senderStep: 'idle', role: 'idle' });
    } else {
      set({ receiverStep: 'idle', role: 'idle' });
    }
  },

  resetSender: () => {
    get().cancelTransfer();
    set({
      role: 'idle',
      senderStep: 'idle',
      selectedFiles: [],
      errorMessage: null,
      code: '',
      codeExpiresAt: null,
      connectionType: null,
    });
  },

  startReceiving: async (codeToJoin: string) => {
    const cleanCode = codeToJoin.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanCode)) return;

    set({
      role: 'receiver',
      receiverStep: 'connecting_code',
      code: cleanCode,
      errorMessage: null,
    });

    try {
      const signaling = new SignalingClient(getSignalUrl());
      activeSignaling = signaling;
      await signaling.connect();

      signaling.send({ v: 1, t: 'join', code: cleanCode });

      signaling.on('serverError', (msg) => {
        if (msg.code === 'CODE_UNAVAILABLE') {
          set({ role: 'idle', receiverStep: 'idle', errorMessage: 'Key not found or no longer available.' });
        } else if (msg.code === 'RATE_LIMITED') {
          set({ role: 'idle', receiverStep: 'idle', errorMessage: 'Too many attempts. Try again in 40 s.' });
        } else {
          set({ role: 'idle', receiverStep: 'idle', errorMessage: msg.message });
        }
      });

      let peerIdSender = '';
      const queuedSignals: SignalData[] = [];

      let transferStarted = false;
      async function onOfferHandled(session: PeerSession) {
        if (transferStarted) return;
        transferStarted = true;

        await session.waitForChannelsOpen(4, 30000);

        // Perform receiver handshake
        const handshake = await performReceiverHandshake({
          ctrlChannel: session.ctrlChannel,
          chooseAcceptance: async (manifest) => {
            // Store manifest files
            const items: SelectedFileItem[] = manifest.files.map((m) => ({
              file: new Blob([]),
              meta: m,
              checked: true,
            }));

            set({
              selectedFiles: items,
              receiverStep: 'connecting',
              senderDeviceName: manifest.transferId,
            });

            // Determine destination sink
            const caps = detectBrowserCapabilities();
            const saveAsZip = get().saveAsZip;
            const filesToReceive = items.map((f) => f.meta);

            let sink: Sink;
            if (saveAsZip && filesToReceive.length > 1) {
              const memorySink = new MemoryBlobSink();
              sink = new ZipSink(memorySink);
            } else if (caps.hasServiceWorker && navigator.serviceWorker?.controller) {
              sink = new ServiceWorkerStreamSink();
            } else {
              sink = new MemoryBlobSink();
            }

            activeSink = sink;
            await sink.init(filesToReceive);

            const sinkType: 'fs' | 'sw' | 'memory' =
              sink instanceof ServiceWorkerStreamSink ? 'sw' : 'memory';

            return {
              accept: true,
              sink: sinkType,
              channels: 4,
              chunkSize: DEFAULT_CHUNK_SIZE,
              windowBytes: DEFAULT_WINDOW_BYTES_LAN,
              files: filesToReceive.map((f) => f.index),
            };
          },
        });

        if (!handshake.accepted) {
          set({ receiverStep: 'declined' });
          return;
        }

        set({ receiverStep: 'transferring' });
        if (!activeWakeLock) activeWakeLock = new WakeLockManager();
        await activeWakeLock.request();

        const receiverTransfer = new ReceiverTransfer({
          ctrlChannel: session.ctrlChannel,
          dataChannels: session.dataChannels,
          sink: activeSink!,
          files: handshake.files,
          totalExpectedBytes: handshake.totalSize,
          windowBytes: handshake.windowBytes,
          onProgress: (p) => {
            const percent = p.totalBytes > 0 ? (p.bytesReceived / p.totalBytes) * 100 : 100;
            set({
              progress: {
                bytesDone: p.bytesReceived,
                totalBytes: p.totalBytes,
                percent: Math.min(100, Math.round(percent)),
                speedMBs: p.speedMBs,
                eta: p.eta,
              },
            });
          },
          onDone: () => {
            activeWakeLock?.release();
            activeWakeLock = null;
            if (connectionCheckTimer) clearInterval(connectionCheckTimer);

            // Auto-trigger browser download for received files
            if (activeSink instanceof MemoryBlobSink) {
              const completed = activeSink.getCompletedFiles();
              for (const f of completed) {
                const url = URL.createObjectURL(f.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = f.name;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                  URL.revokeObjectURL(url);
                  a.remove();
                }, 1000);
              }
            }

            set({ receiverStep: 'completed' });
          },
          onError: (err) => {
            activeWakeLock?.release();
            activeWakeLock = null;
            if (connectionCheckTimer) clearInterval(connectionCheckTimer);
            set({ receiverStep: 'failed', errorMessage: err.message });
          },
        });

        activeReceiverTransfer = receiverTransfer;
        await receiverTransfer.waitForCompletion();
      }

      async function handleReceiverSignal(session: PeerSession, data: SignalData) {
        if (data.kind === 'offer') {
          const answer = await session.handleOffer(data.sdp);
          signaling.send({
            v: 1,
            t: 'signal',
            to: peerIdSender,
            data: { kind: 'answer', sdp: answer.sdp! },
          });

          // Run channels and transfer asynchronously so ICE candidates are never blocked
          onOfferHandled(session).catch((err) => {
            activeWakeLock?.release();
            activeWakeLock = null;
            if (connectionCheckTimer) clearInterval(connectionCheckTimer);
            set({ receiverStep: 'failed', errorMessage: err.message });
          });
        } else if (data.kind === 'ice') {
          await session.addIceCandidate(data.candidate);
        }
      }

      signaling.on('join-accepted', async (msg) => {
        peerIdSender = msg.peerId;
        set({ receiverStep: 'connecting' });
        const iceServers = await fetchIceServers();

        const session = new PeerSession({
          iceServers,
          onSignal: (data) => {
            signaling.send({ v: 1, t: 'signal', to: peerIdSender, data });
          },
        });
        activePeerSession = session;

        connectionCheckTimer = setInterval(async () => {
          if (activePeerSession) {
            const type = await detectConnectionType(activePeerSession.pc);
            set({ connectionType: type });
          }
        }, 1500);

        while (queuedSignals.length > 0) {
          const sig = queuedSignals.shift()!;
          await handleReceiverSignal(session, sig);
        }
      });

      signaling.on('signal', async (msg) => {
        if (activePeerSession) {
          await handleReceiverSignal(activePeerSession, msg.data);
        } else {
          queuedSignals.push(msg.data);
        }
      });

      signaling.on('close', () => {
        if (get().receiverStep === 'transferring' || get().receiverStep === 'connecting') {
          set({ receiverStep: 'failed', errorMessage: 'Signaling connection closed' });
        }
      });
    } catch (err) {
      set({
        receiverStep: 'cant_connect',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  },

  acceptTransfer: async () => {
    set({ receiverStep: 'connecting' });
  },

  declineTransfer: () => {
    set({ receiverStep: 'declined' });
  },

  resetReceiver: () => {
    get().cancelTransfer();
    set({
      role: 'idle',
      receiverStep: 'idle',
      selectedFiles: [],
      errorMessage: null,
      code: '',
      codeExpiresAt: null,
      connectionType: null,
    });
  },
}));

// Setup beforeunload guard
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    const { role, senderStep, receiverStep } = useTransferStore.getState();
    const isActive =
      (role === 'sender' &&
        (senderStep === 'waiting_receiver' ||
          senderStep === 'receiver_request' ||
          senderStep === 'connecting' ||
          senderStep === 'transferring')) ||
      (role === 'receiver' &&
        (receiverStep === 'connecting_code' ||
          receiverStep === 'review' ||
          receiverStep === 'connecting' ||
          receiverStep === 'transferring'));

    if (isActive) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

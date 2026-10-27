import { useEffect, useState, useRef } from 'react';
import { SignalingClient } from '../core/signaling/SignalingClient.js';
import { PeerSession } from '../core/rtc/PeerSession.js';
import { fetchIceServers } from '../core/rtc/iceConfig.js';
import { performSenderHandshake, performReceiverHandshake } from '../core/transfer/handshake.js';
import { SenderTransfer } from '../core/transfer/SenderTransfer.js';
import { ReceiverTransfer } from '../core/transfer/ReceiverTransfer.js';
import { MemoryBlobSink } from '../core/sinks/MemoryBlobSink.js';
import { DEFAULT_CHUNK_SIZE, DEFAULT_WINDOW_BYTES_LAN, SignalData } from '@beamcode/protocol';

async function computeSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function TestTransferPage() {
  const [role, setRole] = useState<'sender' | 'receiver' | 'idle'>('idle');
  const [code, setCode] = useState('');
  const [senderHash, setSenderHash] = useState('');
  const [receiverHash, setReceiverHash] = useState('');
  const [status, setStatus] = useState('Initializing');
  const [speedMBs, setSpeedMBs] = useState('0');
  const [measuredMBs, setMeasuredMBs] = useState('0');
  const [done, setDone] = useState(false);

  const transferStartedRef = useRef(false);

  useEffect(() => {
    if (transferStartedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get('role');
    const urlCode = params.get('code');
    const sizeParam = params.get('size');
    const targetSize = sizeParam ? parseInt(sizeParam, 10) : 1024 * 1024 * 1024; // default 1 GB

    const channelsParam = params.get('channels');
    const targetChannels = channelsParam ? parseInt(channelsParam, 10) : 4;
    const chunkParam = params.get('chunkSize');
    const targetChunk = chunkParam ? parseInt(chunkParam, 10) : DEFAULT_CHUNK_SIZE;
    const windowParam = params.get('window');
    const targetWindow = windowParam ? parseInt(windowParam, 10) : DEFAULT_WINDOW_BYTES_LAN;

    const signalUrl = (import.meta as unknown as { env: { VITE_SIGNAL_URL?: string } }).env
      .VITE_SIGNAL_URL || `ws://${window.location.hostname}:8080/ws`;

    if (urlRole === 'sender') {
      transferStartedRef.current = true;
      setRole('sender');
      runSender(signalUrl, targetSize, targetChannels);
    } else if (urlRole === 'receiver' && urlCode) {
      transferStartedRef.current = true;
      setRole('receiver');
      setCode(urlCode);
      runReceiver(signalUrl, urlCode, targetChannels, targetChunk, targetWindow);
    }
  }, []);

  async function runSender(signalUrl: string, size: number, targetChannels = 4) {
    setStatus('Generating file...');

    // Fast generation using repeated 4 MiB pattern
    const patternSize = 4 * 1024 * 1024;
    const pattern = new Uint8Array(patternSize);
    for (let i = 0; i < patternSize; i++) {
      pattern[i] = (i * 7 + 13) & 0xff;
    }

    const repeatCount = Math.floor(size / patternSize);
    const remainder = size % patternSize;
    const parts: Uint8Array[] = new Array(repeatCount).fill(pattern);
    if (remainder > 0) {
      parts.push(pattern.subarray(0, remainder));
    }

    const fileBlob = new Blob(parts as BlobPart[], { type: 'application/octet-stream' });

    setStatus('Hashing test file...');
    const hash = await computeSHA256(fileBlob);
    setSenderHash(hash);

    setStatus('Connecting to signaling server...');
    const signaling = new SignalingClient(signalUrl);
    await signaling.connect();

    setStatus('Creating code...');
    signaling.send({ v: 1, t: 'create' });

    let activePeerSession: PeerSession | null = null;
    let peerIdReceiver = '';
    const queuedSenderSignals: SignalData[] = [];

    async function handleSenderSignal(session: PeerSession, data: SignalData) {
      if (data.kind === 'answer') {
        await session.handleAnswer(data.sdp);
      } else if (data.kind === 'ice') {
        await session.addIceCandidate(data.candidate);
      }
    }

    signaling.on('code-created', (msg) => {
      setCode(msg.code);
      setStatus(`Waiting for receiver with code ${msg.code}...`);
    });

    signaling.on('join-request', async (msg) => {
      setStatus(`Receiver ${msg.deviceName} requested join, approving...`);
      peerIdReceiver = msg.receiverId;
      signaling.send({ v: 1, t: 'join-decision', receiverId: msg.receiverId, accept: true });
    });

    signaling.on('join-accepted', async (msg) => {
      if (msg.peerId) {
        peerIdReceiver = msg.peerId;
      }
      setStatus('Join accepted! Starting WebRTC connection...');
      const iceServers = await fetchIceServers();

      const session = new PeerSession({
        iceServers,
        onSignal: (data) => {
          signaling.send({ v: 1, t: 'signal', to: peerIdReceiver, data });
        },
      });
      activePeerSession = session;

      const offer = await session.createOffer();
      signaling.send({
        v: 1,
        t: 'signal',
        to: peerIdReceiver,
        data: { kind: 'offer', sdp: offer.sdp! },
      });

      // Flush any signals received before session was ready
      while (queuedSenderSignals.length > 0) {
        const sig = queuedSenderSignals.shift()!;
        await handleSenderSignal(session, sig);
      }

      setStatus('Waiting for data channels to open...');
      await session.waitForChannelsOpen(targetChannels);

      setStatus('Negotiating transfer handshake...');
      const handshake = await performSenderHandshake({
        ctrlChannel: session.ctrlChannel,
        transferId: 'test-transfer-1',
        files: [
          {
            index: 0,
            name: 'test-1gb.dat',
            size: fileBlob.size,
            mime: 'application/octet-stream',
            relPath: 'test-1gb.dat',
          },
        ],
      });

      if (!handshake.accepted) {
        setStatus('Receiver declined transfer');
        return;
      }

      setStatus('Transferring data...');
      const startTime = performance.now();

      const transfer = new SenderTransfer({
        ctrlChannel: session.ctrlChannel,
        dataChannels: session.dataChannels,
        files: [
          {
            file: fileBlob,
            meta: {
              index: 0,
              name: 'test-1gb.dat',
              size: fileBlob.size,
              mime: 'application/octet-stream',
              relPath: 'test-1gb.dat',
            },
          },
        ],
        chunkSize: handshake.chunkSize,
        channelsCount: handshake.channels,
        windowBytes: handshake.windowBytes,
        onProgress: (p) => {
          setSpeedMBs(p.speedMBs);
          setStatus(`Sending: ${((p.bytesAcked / p.totalBytes) * 100).toFixed(1)}% (${p.speedMBs})`);
        },
      });

      await transfer.start();
      const durationSec = (performance.now() - startTime) / 1000;
      const rateMBs = (size / 1_000_000 / durationSec).toFixed(2);
      setMeasuredMBs(rateMBs);
      setStatus(`Transfer complete in ${durationSec.toFixed(2)}s (${rateMBs} MB/s)`);
      setDone(true);
    });

    signaling.on('signal', async (msg) => {
      if (activePeerSession) {
        await handleSenderSignal(activePeerSession, msg.data);
      } else {
        queuedSenderSignals.push(msg.data);
      }
    });
  }

  async function runReceiver(
    signalUrl: string,
    joinCode: string,
    targetChannels = 4,
    targetChunk = DEFAULT_CHUNK_SIZE,
    targetWindow = DEFAULT_WINDOW_BYTES_LAN
  ) {
    setStatus('Connecting to signaling server...');
    const signaling = new SignalingClient(signalUrl);
    await signaling.connect();

    setStatus(`Joining with code ${joinCode}...`);
    signaling.send({ v: 1, t: 'join', code: joinCode });

    let activePeerSession: PeerSession | null = null;
    let peerIdSender = '';
    const sink = new MemoryBlobSink();
    const queuedReceiverSignals: SignalData[] = [];

    async function handleReceiverSignal(session: PeerSession, data: SignalData) {
      if (data.kind === 'offer') {
        const answer = await session.handleOffer(data.sdp);
        signaling.send({
          v: 1,
          t: 'signal',
          to: peerIdSender,
          data: { kind: 'answer', sdp: answer.sdp! },
        });

        setStatus('Waiting for data channels to open...');
        await session.waitForChannelsOpen(targetChannels);

        setStatus('Performing receiver handshake...');
        const handshake = await performReceiverHandshake({
          ctrlChannel: session.ctrlChannel,
          chooseAcceptance: async (manifest) => {
            await sink.init(manifest.files);
            return {
              accept: true,
              sink: 'memory',
              channels: targetChannels,
              chunkSize: targetChunk,
              windowBytes: targetWindow,
            };
          },
        });

        setStatus('Receiving data...');
        const startTime = performance.now();

        const receiverTransfer = new ReceiverTransfer({
          ctrlChannel: session.ctrlChannel,
          dataChannels: session.dataChannels,
          sink,
          files: handshake.files,
          totalExpectedBytes: handshake.totalSize,
          windowBytes: handshake.windowBytes,
          onProgress: (p) => {
            setSpeedMBs(p.speedMBs);
            setStatus(
              `Receiving: ${((p.bytesReceived / p.totalBytes) * 100).toFixed(1)}% (${p.speedMBs})`
            );
          },
        });

        await receiverTransfer.waitForCompletion();
        const durationSec = (performance.now() - startTime) / 1000;
        const rateMBs = (handshake.totalSize / 1_000_000 / durationSec).toFixed(2);
        setMeasuredMBs(rateMBs);

        setStatus('Computing SHA-256 of received file...');
        const completed = sink.getCompletedFiles();
        if (completed.length > 0) {
          const recHash = await computeSHA256(completed[0]!.blob);
          setReceiverHash(recHash);
        }

        setStatus(`Received successfully in ${durationSec.toFixed(2)}s (${rateMBs} MB/s)`);
        setDone(true);
      } else if (data.kind === 'ice') {
        await session.addIceCandidate(data.candidate);
      }
    }

    signaling.on('join-pending', () => {
      setStatus('Waiting for sender approval...');
    });

    signaling.on('join-accepted', async (msg) => {
      peerIdSender = msg.peerId;
      setStatus('Approved! Setting up WebRTC connection...');

      const iceServers = await fetchIceServers();
      const session = new PeerSession({
        iceServers,
        onSignal: (data) => {
          signaling.send({ v: 1, t: 'signal', to: peerIdSender, data });
        },
      });
      activePeerSession = session;

      while (queuedReceiverSignals.length > 0) {
        const sig = queuedReceiverSignals.shift()!;
        await handleReceiverSignal(session, sig);
      }
    });

    signaling.on('signal', async (msg) => {
      if (activePeerSession) {
        await handleReceiverSignal(activePeerSession, msg.data);
      } else {
        queuedReceiverSignals.push(msg.data);
      }
    });
  }

  return (
    <div className="p-8 max-w-2xl mx-auto font-mono text-sm space-y-4">
      <h1 className="text-xl font-bold">BeamCode Test Transfer</h1>
      <div>
        Role: <span id="transfer-role" className="font-semibold">{role}</span>
      </div>
      <div>
        Status: <span id="transfer-status">{status}</span>
      </div>
      {code && (
        <div>
          Code: <span id="sender-code" className="text-lg font-bold text-blue-600">{code}</span>
        </div>
      )}
      {senderHash && (
        <div>
          Sender SHA-256: <span id="sender-hash" className="text-xs break-all">{senderHash}</span>
        </div>
      )}
      {receiverHash && (
        <div>
          Receiver SHA-256: <span id="receiver-hash" className="text-xs break-all">{receiverHash}</span>
        </div>
      )}
      {speedMBs && (
        <div>
          Speed: <span id="transfer-speed">{speedMBs}</span>
        </div>
      )}
      {measuredMBs !== '0' && (
        <div>
          Measured MB/s: <span id="measured-mbs" className="font-bold">{measuredMBs}</span>
        </div>
      )}
      <div>
        Done: <span id="transfer-done">{done ? 'true' : 'false'}</span>
      </div>
    </div>
  );
}

import {
  ControlMessage,
  parseControlMessage,
  ManifestFileItem,
  DEFAULT_PARALLEL_CHANNELS_LAN,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_WINDOW_BYTES_LAN,
  PROTOCOL_VERSION,
} from '@beamcode/protocol';

export interface HandshakeSenderOptions {
  ctrlChannel: RTCDataChannel;
  transferId: string;
  files: ManifestFileItem[];
}

export interface HandshakeReceiverOptions {
  ctrlChannel: RTCDataChannel;
  chooseAcceptance: (manifest: {
    transferId: string;
    totalSize: number;
    files: ManifestFileItem[];
  }) => Promise<{
    accept: boolean;
    files?: number[];
    sink?: 'fs' | 'sw' | 'memory';
    zip?: boolean;
    channels?: number;
    chunkSize?: number;
    windowBytes?: number;
  }>;
}

export async function performSenderHandshake(
  options: HandshakeSenderOptions
): Promise<{
  accepted: boolean;
  chosenFiles: number[];
  sink: 'fs' | 'sw' | 'memory';
  zip: boolean;
  channels: number;
  chunkSize: number;
  windowBytes: number;
}> {
  const { ctrlChannel, transferId, files } = options;

  return new Promise((resolve, reject) => {
    let receiverCapsReceived = false;

    // Send hello
    const sendHello = () => {
      ctrlChannel.send(
        JSON.stringify({
          t: 'hello',
          v: PROTOCOL_VERSION,
          caps: {
            maxMessageSize: 262144,
            fsAccess: false,
            swStream: false,
            maxChannels: 8,
          },
        })
      );
    };

    const sendManifest = () => {
      const totalSize = files.reduce((acc, f) => acc + f.size, 0);
      ctrlChannel.send(
        JSON.stringify({
          t: 'manifest',
          transferId,
          totalSize,
          files,
        })
      );
    };

    const handler = (event: MessageEvent) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const msg: ControlMessage = parseControlMessage(JSON.parse(raw));

        if (msg.t === 'hello') {
          receiverCapsReceived = true;
          sendManifest();
        } else if (msg.t === 'accept') {
          ctrlChannel.removeEventListener('message', handler);

          // Reply with start
          ctrlChannel.send(
            JSON.stringify({
              t: 'start',
              transferId,
            })
          );

          resolve({
            accepted: true,
            chosenFiles: msg.files,
            sink: msg.sink,
            zip: msg.zip,
            channels: msg.channels,
            chunkSize: msg.chunkSize,
            windowBytes: msg.windowBytes,
          });
        } else if (msg.t === 'decline') {
          ctrlChannel.removeEventListener('message', handler);
          resolve({
            accepted: false,
            chosenFiles: [],
            sink: 'memory',
            zip: false,
            channels: 1,
            chunkSize: DEFAULT_CHUNK_SIZE,
            windowBytes: DEFAULT_WINDOW_BYTES_LAN,
          });
        }
      } catch (err) {
        console.warn('Error during sender handshake:', err);
      }
    };

    ctrlChannel.addEventListener('message', handler);

    if (ctrlChannel.readyState === 'open') {
      sendHello();
    } else {
      ctrlChannel.onopen = () => sendHello();
    }

    // Fallback if hello already received
    if (receiverCapsReceived) {
      sendManifest();
    }

    ctrlChannel.onerror = (err) => {
      ctrlChannel.removeEventListener('message', handler);
      reject(err);
    };
  });
}

export async function performReceiverHandshake(
  options: HandshakeReceiverOptions
): Promise<{
  accepted: boolean;
  transferId: string;
  files: ManifestFileItem[];
  totalSize: number;
  channels: number;
  chunkSize: number;
  windowBytes: number;
}> {
  const { ctrlChannel, chooseAcceptance } = options;

  return new Promise((resolve, reject) => {
    // Send hello
    const sendHello = () => {
      ctrlChannel.send(
        JSON.stringify({
          t: 'hello',
          v: PROTOCOL_VERSION,
          caps: {
            maxMessageSize: 262144,
            fsAccess: typeof window !== 'undefined' && 'showSaveFilePicker' in window,
            swStream: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
            maxChannels: 8,
          },
        })
      );
    };

    const handler = async (event: MessageEvent) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const msg: ControlMessage = parseControlMessage(JSON.parse(raw));

        if (msg.t === 'manifest') {
          const decision = await chooseAcceptance({
            transferId: msg.transferId,
            totalSize: msg.totalSize,
            files: msg.files,
          });

          if (!decision.accept) {
            ctrlChannel.send(
              JSON.stringify({
                t: 'decline',
                transferId: msg.transferId,
              })
            );
            ctrlChannel.removeEventListener('message', handler);
            resolve({
              accepted: false,
              transferId: msg.transferId,
              files: [],
              totalSize: 0,
              channels: 1,
              chunkSize: DEFAULT_CHUNK_SIZE,
              windowBytes: DEFAULT_WINDOW_BYTES_LAN,
            });
            return;
          }

          const chosenIndices = decision.files ?? msg.files.map((f) => f.index);
          const chosenFiles = msg.files.filter((f) => chosenIndices.includes(f.index));
          const channels = decision.channels ?? DEFAULT_PARALLEL_CHANNELS_LAN;
          const chunkSize = decision.chunkSize ?? DEFAULT_CHUNK_SIZE;
          const windowBytes = decision.windowBytes ?? DEFAULT_WINDOW_BYTES_LAN;

          ctrlChannel.send(
            JSON.stringify({
              t: 'accept',
              transferId: msg.transferId,
              files: chosenIndices,
              sink: decision.sink ?? 'memory',
              zip: decision.zip ?? false,
              channels,
              chunkSize,
              windowBytes,
            })
          );

          // Wait for start
          const startHandler = (startEvt: MessageEvent) => {
            const startRaw =
              typeof startEvt.data === 'string'
                ? startEvt.data
                : new TextDecoder().decode(startEvt.data);
            const startMsg: ControlMessage = parseControlMessage(JSON.parse(startRaw));
            if (startMsg.t === 'start') {
              ctrlChannel.removeEventListener('message', startHandler);
              ctrlChannel.removeEventListener('message', handler);
              resolve({
                accepted: true,
                transferId: msg.transferId,
                files: chosenFiles,
                totalSize: chosenFiles.reduce((acc, f) => acc + f.size, 0),
                channels,
                chunkSize,
                windowBytes,
              });
            }
          };

          ctrlChannel.addEventListener('message', startHandler);
        }
      } catch (err) {
        console.warn('Error during receiver handshake:', err);
      }
    };

    ctrlChannel.addEventListener('message', handler);

    if (ctrlChannel.readyState === 'open') {
      sendHello();
    } else {
      ctrlChannel.onopen = () => sendHello();
    }

    ctrlChannel.onerror = (err) => {
      ctrlChannel.removeEventListener('message', handler);
      reject(err);
    };
  });
}

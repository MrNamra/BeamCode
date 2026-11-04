import { describe, it, expect, beforeEach } from 'vitest';
import { useTransferStore } from '../src/core/state/transferStore.js';

describe('TransferStore Mutual Exclusivity and File Isolation', () => {
  beforeEach(() => {
    useTransferStore.getState().cancelTransfer();
    useTransferStore.getState().clearFiles();
  });

  it('keeps selectedFiles and receivedFiles strictly separated', () => {
    const store = useTransferStore.getState();

    // Stage a sender file
    const fakeFile = new File(['hello sender'], 'sender.txt', { type: 'text/plain' });
    store.addFiles([fakeFile]);

    expect(useTransferStore.getState().selectedFiles).toHaveLength(1);
    expect(useTransferStore.getState().selectedFiles[0]?.meta.name).toBe('sender.txt');
    expect(useTransferStore.getState().receivedFiles).toHaveLength(0);

    // Simulate receiving files arriving in store
    useTransferStore.setState({
      role: 'receiver',
      receiverStep: 'transferring',
      receivedFiles: [
        {
          file: new Blob([]),
          meta: { index: 0, name: 'receiver.mp4', size: 1000, mime: 'video/mp4', relPath: 'receiver.mp4' },
          checked: true,
        },
      ],
    });

    // Sender files remain preserved and not overwritten
    expect(useTransferStore.getState().selectedFiles).toHaveLength(1);
    expect(useTransferStore.getState().selectedFiles[0]?.meta.name).toBe('sender.txt');

    // Received files are populated in receivedFiles
    expect(useTransferStore.getState().receivedFiles).toHaveLength(1);
    expect(useTransferStore.getState().receivedFiles[0]?.meta.name).toBe('receiver.mp4');
  });

  it('prevents starting send while role is receiver', async () => {
    // Set receiver active
    useTransferStore.setState({
      role: 'receiver',
      receiverStep: 'transferring',
      receivedFiles: [
        {
          file: new Blob([]),
          meta: { index: 0, name: 'video.mp4', size: 5000, mime: 'video/mp4', relPath: 'video.mp4' },
          checked: true,
        },
      ],
    });

    // Attempt startSending
    await useTransferStore.getState().startSending();

    // Role must remain receiver, receiverStep untouched
    expect(useTransferStore.getState().role).toBe('receiver');
    expect(useTransferStore.getState().receiverStep).toBe('transferring');
  });

  it('prevents starting receive while role is sender', async () => {
    useTransferStore.setState({
      role: 'sender',
      senderStep: 'transferring',
    });

    // Attempt startReceiving
    await useTransferStore.getState().startReceiving('123456');

    // Role must remain sender, senderStep untouched
    expect(useTransferStore.getState().role).toBe('sender');
    expect(useTransferStore.getState().senderStep).toBe('transferring');
  });

  it('resets correctly on cancelTransfer', () => {
    useTransferStore.setState({
      role: 'receiver',
      receiverStep: 'transferring',
      receivedFiles: [
        {
          file: new Blob([]),
          meta: { index: 0, name: 'doc.pdf', size: 1200, mime: 'application/pdf', relPath: 'doc.pdf' },
          checked: true,
        },
      ],
    });

    useTransferStore.getState().cancelTransfer();

    expect(useTransferStore.getState().role).toBe('idle');
    expect(useTransferStore.getState().receiverStep).toBe('idle');
    expect(useTransferStore.getState().receivedFiles).toHaveLength(0);
  });
});


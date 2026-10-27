import { useState, useEffect } from 'react';
import { ShieldCheck, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useTranslation } from '../i18n/index.js';
import { useTransferStore } from '../core/state/transferStore.js';
import { DropZone } from '../components/DropZone.js';
import { FileList } from '../components/FileList.js';
import { CodeDisplay } from '../components/CodeDisplay.js';
import { CodeInput } from '../components/CodeInput.js';
import { ReceiverReview } from '../components/ReceiverReview.js';
import { ProgressCard } from '../components/ProgressCard.js';
import { ResultCard } from '../components/ResultCard.js';

interface HomeProps {
  initialCode?: string;
}

export function HomePage({ initialCode = '' }: HomeProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>(initialCode ? 'receive' : 'send');

  const {
    role,
    senderStep,
    receiverStep,
    selectedFiles,
    saveAsZip,
    code,
    codeExpiresAt,
    receiverDeviceName,
    senderDeviceName,
    connectionType,
    progress,
    errorMessage,
    addFiles,
    removeFile,
    setSaveAsZip,
    toggleFileSelection,
    startSending,
    acceptReceiver,
    declineReceiver,
    cancelTransfer,
    resetSender,
    startReceiving,
    acceptTransfer,
    declineTransfer,
    resetReceiver,
  } = useTransferStore();

  // Switch tab if deep link initialCode provided
  useEffect(() => {
    if (initialCode) {
      setActiveTab('receive');
    }
  }, [initialCode]);

  return (
    <div className="flex-1 flex flex-col justify-between py-6 sm:py-12 px-4 max-w-[960px] mx-auto w-full">
      {/* Mobile Tab Switcher (< 900px) */}
      <div className="flex lg:hidden w-full max-w-sm mx-auto mb-6 p-1 bg-slate-200/70 dark:bg-slate-800/70 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveTab('send')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'send'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          data-testid="tab-send"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          {t('tabs.send')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('receive')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'receive'
              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          data-testid="tab-receive"
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          {t('tabs.receive')}
        </button>
      </div>

      {/* Main Two-Card Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-start w-full">
        {/* ===================== SEND CARD ===================== */}
        <div
          className={`w-full min-h-[460px] rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] p-6 sm:p-8 flex flex-col justify-between shadow-[0_8px_30px_rgba(15,23,42,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-all ${
            activeTab !== 'send' ? 'hidden lg:flex' : 'flex'
          }`}
          data-testid="send-card"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <h1 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('tabs.send')}
            </h1>
            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
          </div>

          <div className="flex-1 flex flex-col justify-center py-4">
            {role !== 'sender' && selectedFiles.length === 0 && (
              <DropZone onFilesSelected={addFiles} />
            )}

            {role !== 'sender' && selectedFiles.length > 0 && (
              <FileList
                files={selectedFiles}
                onRemove={removeFile}
                onAddFiles={addFiles}
                onSend={startSending}
                isSending={senderStep === 'creating_code'}
              />
            )}

            {role === 'sender' &&
              (senderStep === 'waiting_receiver' ||
                senderStep === 'receiver_request' ||
                senderStep === 'connecting') && (
                <CodeDisplay
                  code={code}
                  expiresAt={codeExpiresAt}
                  receiverDeviceName={receiverDeviceName}
                  step={senderStep}
                  onAcceptReceiver={acceptReceiver}
                  onDeclineReceiver={declineReceiver}
                  onCancel={() => cancelTransfer('Sender cancelled')}
                />
              )}

            {role === 'sender' && senderStep === 'transferring' && (
              <ProgressCard
                title={t('progress.sending')}
                progress={progress}
                files={selectedFiles}
                connectionType={connectionType}
                onCancel={() => cancelTransfer('Sender cancelled')}
              />
            )}

            {role === 'sender' && senderStep === 'completed' && (
              <ResultCard type="completed_sender" onAction={resetSender} />
            )}

            {role === 'sender' && senderStep === 'expired' && (
              <ResultCard type="expired" onAction={resetSender} />
            )}

            {role === 'sender' && senderStep === 'declined' && (
              <ResultCard type="declined" onAction={resetSender} />
            )}

            {role === 'sender' && senderStep === 'failed' && (
              <ResultCard
                type="failed"
                errorMessage={errorMessage}
                onAction={resetSender}
              />
            )}

            {role === 'sender' && senderStep === 'cant_connect' && (
              <ResultCard type="cant_connect" onAction={resetSender} />
            )}
          </div>

          <div className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            P2P Direct · End-to-end encrypted
          </div>
        </div>

        {/* ===================== RECEIVE CARD ===================== */}
        <div
          className={`w-full min-h-[460px] rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] p-6 sm:p-8 flex flex-col justify-between shadow-[0_8px_30px_rgba(15,23,42,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-all ${
            activeTab !== 'receive' ? 'hidden lg:flex' : 'flex'
          }`}
          data-testid="receive-card"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <h1 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('tabs.receive')}
            </h1>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>

          <div className="flex-1 flex flex-col justify-center py-4">
            {receiverStep === 'idle' && (
              <CodeInput
                initialCode={initialCode}
                onSubmit={startReceiving}
                errorMessage={errorMessage}
              />
            )}

            {role === 'receiver' &&
              (receiverStep === 'connecting_code' || receiverStep === 'connecting') && (
                <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center animate-in fade-in">
                  <div className="w-12 h-12 rounded-full border-4 border-blue-500/20 border-t-blue-600 animate-spin" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {t('receive.connecting')}
                  </p>
                  <button
                    type="button"
                    onClick={() => cancelTransfer('Receiver cancelled')}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
                  >
                    {t('codeDisplay.cancel')}
                  </button>
                </div>
              )}

            {role === 'receiver' && receiverStep === 'review' && (
              <ReceiverReview
                senderDeviceName={senderDeviceName}
                files={selectedFiles}
                saveAsZip={saveAsZip}
                onToggleZip={setSaveAsZip}
                onToggleFile={toggleFileSelection}
                onAccept={acceptTransfer}
                onDecline={declineTransfer}
                isConnecting={false}
              />
            )}

            {role === 'receiver' && receiverStep === 'transferring' && (
              <ProgressCard
                title={t('progress.receiving')}
                progress={progress}
                files={selectedFiles}
                connectionType={connectionType}
                onCancel={() => cancelTransfer('Receiver cancelled')}
              />
            )}

            {role === 'receiver' && receiverStep === 'completed' && (
              <ResultCard
                type="completed_receiver"
                fileCount={selectedFiles.length}
                onAction={resetReceiver}
              />
            )}

            {role === 'receiver' && receiverStep === 'expired' && (
              <ResultCard type="expired" onAction={resetReceiver} />
            )}

            {role === 'receiver' && receiverStep === 'declined' && (
              <ResultCard type="declined" onAction={resetReceiver} />
            )}

            {role === 'receiver' && receiverStep === 'failed' && (
              <ResultCard
                type="failed"
                errorMessage={errorMessage}
                onAction={resetReceiver}
              />
            )}

            {role === 'receiver' && receiverStep === 'cant_connect' && (
              <ResultCard type="cant_connect" onAction={resetReceiver} />
            )}
          </div>

          <div className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Zero cloud buffering · Maximum speed
          </div>
        </div>
      </div>

      {/* Trust Strip */}
      <div className="mt-8 pt-6 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-center text-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <span>{t('trust')}</span>
      </div>
    </div>
  );
}

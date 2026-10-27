import { Shield, EyeOff, Server, Lock, ArrowLeft } from 'lucide-react';

interface PrivacyProps {
  onNavigate?: (path: string) => void;
}

export function PrivacyPage({ onNavigate }: PrivacyProps) {
  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate('/');
    } else {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className="flex-1 max-w-[760px] mx-auto w-full py-8 px-4 space-y-8 animate-in fade-in">
      <div>
        <a
          href="/"
          onClick={handleBack}
          className="inline-flex items-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md py-0.5"
          data-testid="back-to-home"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to home
        </a>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          BeamCode is designed so your file bytes and file names never touch our servers.
        </p>
      </div>

      <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <section className="p-5 rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
            <Server className="w-5 h-5 text-blue-500" />
            <h2>Zero File Storage</h2>
          </div>
          <p>
            Transfers happen directly between browsers using WebRTC data channels. File data is
            streamed peer-to-peer. Our signaling server only relays small WebRTC connection
            handshakes and has a strict 64 KiB message limit.
          </p>
        </section>

        <section className="p-5 rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
            <EyeOff className="w-5 h-5 text-emerald-500" />
            <h2>No File Metadata on Servers</h2>
          </div>
          <p>
            The file manifest (file names, sizes, directory paths) is exchanged strictly over the
            encrypted WebRTC control channel between devices. The signaling server never learns
            what you are sending.
          </p>
        </section>

        <section className="p-5 rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
            <Lock className="w-5 h-5 text-amber-500" />
            <h2>In-Memory Ephemeral Signaling</h2>
          </div>
          <p>
            6-digit transfer keys exist purely in server memory and are automatically erased when
            the transfer completes, fails, is cancelled, or expires after 10 minutes. No transfer
            state is ever written to disk or database. Server logs mask keys (`48****`) and omit
            SDP or IP addresses.
          </p>
        </section>

        <section className="p-5 rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h2>No Trackers or Third-Party Analytics</h2>
          </div>
          <p>
            BeamCode does not use Google Analytics, cookies, tracking scripts, or CDN fonts. All
            assets are self-hosted directly from the application origin.
          </p>
        </section>
      </div>
    </div>
  );
}

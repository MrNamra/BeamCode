import { ArrowLeft, KeyRound, Radio, Zap, HardDrive } from 'lucide-react';

export function HowItWorksPage() {
  return (
    <div className="flex-1 max-w-[760px] mx-auto w-full py-8 px-4 space-y-8 animate-in fade-in">
      <div>
        <a
          href="/"
          className="inline-flex items-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to home
        </a>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          How BeamCode Works
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Fast, direct browser-to-browser file sharing with 6-digit keys.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] space-y-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <KeyRound className="w-5 h-5" />
          </div>
          <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
            1. Select & Generate Key
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Choose your files or drop an entire folder. A random 6-digit key is allocated from our
            ephemeral in-memory signaling server.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] space-y-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Radio className="w-5 h-5" />
          </div>
          <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
            2. Receiver Joins & Approves
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            The receiver enters the 6-digit key or scans the QR code. The sender sees the
            receiver's device name and clicks Accept to lock the key.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] space-y-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5" />
          </div>
          <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
            3. Direct WebRTC Mesh
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            The browsers establish a direct WebRTC connection. If both devices are on the same
            Wi-Fi or LAN, data transfers directly at local network wire speed.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#18202B] border border-[#E2E8F0] dark:border-[#2A3646] space-y-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <HardDrive className="w-5 h-5" />
          </div>
          <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
            4. Parallel Streaming to Disk
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            4 parallel SCTP channels stream data with 64 KiB frames and 4 MiB read-ahead blocks
            directly to disk using the File System Access API or Service Worker stream.
          </p>
        </div>
      </div>
    </div>
  );
}

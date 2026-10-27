import { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { HomePage } from './pages/Home.js';
import { PrivacyPage } from './pages/Privacy.js';
import { HowItWorksPage } from './pages/HowItWorks.js';
import { DebugPage } from './pages/Debug.js';
import { TestTransferPage } from './pages/TestTransfer.js';

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Dev & test pages without full layout header
  if (currentPath === '/debug') {
    return <DebugPage />;
  }

  if (currentPath === '/test-transfer') {
    return <TestTransferPage />;
  }

  // Route matching
  let pageContent: React.ReactNode = null;
  if (currentPath === '/privacy') {
    pageContent = <PrivacyPage />;
  } else if (currentPath === '/how-it-works') {
    pageContent = <HowItWorksPage />;
  } else if (currentPath.startsWith('/r/')) {
    const code = currentPath.slice(3).trim();
    pageContent = <HomePage initialCode={code} />;
  } else {
    pageContent = <HomePage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F3F6FB] dark:bg-[#0F141B] text-[#0F172A] dark:text-[#E6EDF5] transition-colors selection:bg-blue-500 selection:text-white">
      <Header onNavigate={navigate} />
      <main className="flex-1 flex flex-col">{pageContent}</main>
    </div>
  );
}

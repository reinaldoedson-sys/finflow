import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, CheckCircle, Sparkles } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem('finflow_pwa_banner_dismissed') === 'true';
  });
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (installed PWA / APK)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalledSuccess(true);
      setDeferredPrompt(null);
      setTimeout(() => setInstalledSuccess(false), 5000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowManualGuide(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalledSuccess(true);
      } else {
        setShowManualGuide(true);
      }
      setDeferredPrompt(null);
    } catch {
      setShowManualGuide(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('finflow_pwa_banner_dismissed', 'true');
  };

  // Don't render if already in standalone app mode or dismissed (unless success message or guide open)
  if (isStandalone || (isDismissed && !installedSuccess && !showManualGuide)) {
    return null;
  }

  if (installedSuccess) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs mb-4 animate-in fade-in slide-in-from-top duration-300">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>FinFlow instalado com sucesso! Seus dados continuarão sincronizados em tempo real.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/30 border border-emerald-500/30 shadow-lg mb-5 flex flex-col gap-3 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-white text-sm">
              <span>Instalar FinFlow no Celular</span>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> App / APK
              </span>
            </div>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Instale como aplicativo nativo. Seus dados e contas sincronizam automaticamente com este computador!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-3.5 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalar Agora</span>
          </button>
          <button
            onClick={() => setShowManualGuide((prev) => !prev)}
            className="px-2.5 py-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg text-xs"
          >
            Ajuda
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showManualGuide && (
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-300 text-[11px] space-y-1.5 animate-in fade-in duration-200">
          <p className="font-bold text-emerald-300">
            Dica rápida para instalar no Android sem erro:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li>No Chrome do celular, toque no menu de <strong>3 pontinhos (⋮)</strong> no canto superior direito.</li>
            <li>Selecione <strong>&quot;Adicionar à tela inicial&quot;</strong> (ou &quot;Instalar aplicativo&quot;).</li>
            <li>O atalho oficial com o ícone do FinFlow será criado. Ao tocar nele, ele abre em <strong>tela cheia (sem barra de URL)</strong> como um app nativo, com sincronização em tempo real!</li>
          </ol>
        </div>
      )}
    </div>
  );
};

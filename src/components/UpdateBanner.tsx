import React, { useState, useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export const UpdateBanner: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        // App está pronto para uso offline
      },
    });
    setUpdateSW(() => update);
  }, []);

  const handleUpdate = async () => {
    if (updateSW) {
      await updateSW(true);
    } else {
      window.location.reload();
    }
  };

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/30 border border-emerald-500/30 shadow-lg mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Nova versão disponível</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-medium border border-emerald-500/30">
              Atualização
            </span>
          </div>
          <p className="text-slate-400 text-[11px] mt-0.5">
            Uma nova versão do FinFlow está pronta. Clique em atualizar quando terminar de preencher seus dados.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:self-center">
        <button
          onClick={handleUpdate}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer text-xs shadow-md shadow-emerald-500/10"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar agora</span>
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Fechar por enquanto"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

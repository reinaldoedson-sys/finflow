import React, { useState } from 'react';
import { AlertCircle, Trash2, CheckCircle2, Loader2, X } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';

export const SampleDataBanner: React.FC = () => {
  const { currentUser } = useAuth();
  const { isDemoActive, clearSampleData, retrySync } = useFinance();
  const [isCleaning, setIsCleaning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // Exibe o banner apenas quando o usuário estiver autenticado e houver dados de exemplo ativos
  if (!currentUser || !isDemoActive || isDismissed) {
    return null;
  }

  const handleCleanAndSync = async () => {
    setIsCleaning(true);
    setFeedback(null);
    try {
      await clearSampleData();
      await retrySync();
      setFeedback('Dados de teste limpos com sucesso! Seus dados reais da nuvem estão sincronizados.');
      setTimeout(() => {
        setIsDismissed(true);
      }, 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao limpar dados de teste.';
      setFeedback(msg);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="mb-4 p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300 shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs sm:text-sm font-bold text-amber-100 flex items-center gap-1.5">
              <span>Dados de exemplo detectados neste aparelho</span>
            </h4>
            <p className="text-[11px] sm:text-xs text-amber-200/90 leading-relaxed">
              Detectamos dados de teste locais (Itaú, Nubank, etc.) no seu dispositivo. Para evitar falhas de sincronização e manter apenas seus dados reais salvos no Firebase:
            </p>

            {feedback && (
              <div className="mt-2 p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{feedback}</span>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCleanAndSync}
                disabled={isCleaning}
                className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isCleaning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Limpando e sincronizando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar dados de teste e sincronizar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                className="px-2.5 py-1.5 text-xs font-medium text-amber-300/80 hover:text-amber-200 transition-colors cursor-pointer"
              >
                Dispensar
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="text-amber-400/70 hover:text-amber-200 p-1 rounded-lg transition-colors cursor-pointer"
          title="Dispensar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

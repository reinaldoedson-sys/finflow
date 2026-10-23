import React, { useState } from 'react';
import { AlertTriangle, Download, Trash2, LogOut, Loader2 } from 'lucide-react';

interface AccountConflictModalProps {
  isOpen: boolean;
  onOpenBackup: () => void;
  onConfirmClearAndSwitch: () => Promise<void>;
  onCancelLogout: () => Promise<void>;
}

export const AccountConflictModal: React.FC<AccountConflictModalProps> = ({
  isOpen,
  onOpenBackup,
  onConfirmClearAndSwitch,
  onCancelLogout,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirmClearAndSwitch();
    } catch (err) {
      console.error('Erro ao limpar dados locais para troca de conta:', err);
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    setIsProcessing(true);
    try {
      await onCancelLogout();
    } catch (err) {
      console.error('Erro ao cancelar e sair:', err);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <h3 className="text-lg font-bold text-slate-100 mb-2">
            Conflito de Contas Detectado
          </h3>

          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            Este aparelho tem dados de outra conta. Para usar esta conta aqui, os dados locais da conta anterior serão removidos deste aparelho.
          </p>

          <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl p-3 mb-6">
            <p className="text-xs text-amber-300 leading-relaxed">
              A sincronização com a nuvem está temporariamente pausada para evitar que os dados locais sejam enviados ou mesclados incorretamente com esta nova conta.
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={onOpenBackup}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-700/80 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Baixar backup antes</span>
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-rose-950/40 cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Continuar e apagar dados locais</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cancelar e sair</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

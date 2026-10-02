import React, { useState, useRef } from 'react';
import { useFinance } from '../context/FinanceContext';
import { X, Shield, Download, Upload, CheckCircle2, AlertTriangle, Key } from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const { exportData, importData } = useFinance();

  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [encryptExport, setEncryptExport] = useState(true);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsProcessing(true);
      setFeedback(null);

      if (encryptExport && !exportPassphrase.trim()) {
        setFeedback({ type: 'error', message: 'Defina uma senha para criptografar o backup.' });
        setIsProcessing(false);
        return;
      }

      const backupString = await exportData(encryptExport ? exportPassphrase : undefined);
      
      const blob = new Blob([backupString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `finflow-backup-${encryptExport ? 'encrypted-' : ''}${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFeedback({ 
        type: 'success', 
        message: encryptExport 
          ? 'Backup criptografado (AES-256) gerado e baixado com sucesso! Guarde sua senha com segurança.' 
          : 'Backup exportado com sucesso!'
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao exportar backup.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setFeedback(null);

      const text = await file.text();
      const result = await importData(text, importPassphrase);

      if (result.success) {
        setFeedback({ type: 'success', message: result.message });
      } else {
        setFeedback({ type: 'error', message: result.message });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao ler arquivo de backup.' });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-[#0e1422] border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Cofre & Backup Local Seguro
              </h3>
              <p className="text-[11px] text-slate-400">Privacidade total · Sem servidores externos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl mb-5 border border-slate-800">
          <button
            type="button"
            onClick={() => { setTab('export'); setFeedback(null); }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === 'export'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Backup</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('import'); setFeedback(null); }}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === 'import'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restaurar / Importar</span>
          </button>
        </div>

        {feedback && (
          <div className={`mb-4 p-3 rounded-xl flex items-start gap-2 text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {tab === 'export' ? (
          <div className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-300">
              <p className="font-semibold text-slate-200 mb-1">Criptografia de Ponta a Ponta</p>
              <p className="text-slate-400 leading-relaxed">
                Seus lançamentos, contas e orçamentos podem ser salvos em um arquivo protegido por criptografia 
                <strong className="text-emerald-400 font-mono"> AES-GCM 256-bit</strong>. Ninguém conseguirá abrir o arquivo sem a senha escolhida por você.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="encryptExport"
                checked={encryptExport}
                onChange={(e) => setEncryptExport(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500 border-slate-700 bg-slate-900"
              />
              <label htmlFor="encryptExport" className="text-xs text-slate-200 font-medium cursor-pointer">
                Proteger arquivo com senha (Criptografia Forte)
              </label>
            </div>

            {encryptExport && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  Defina uma Senha de Proteção
                </label>
                <input
                  type="password"
                  value={exportPassphrase}
                  onChange={(e) => setExportPassphrase(e.target.value)}
                  placeholder="Digite uma senha forte..."
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleExport}
              className="w-full py-2.5 px-4 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 mt-4"
            >
              <Download className="w-4 h-4" />
              <span>{isProcessing ? 'Gerando arquivo...' : 'Baixar Arquivo de Backup'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-300">
              <p className="font-semibold text-slate-200 mb-1">Restaurar Informações</p>
              <p className="text-slate-400 leading-relaxed">
                Selecione o arquivo <span className="font-mono text-emerald-400">.json</span> exportado anteriormente para recuperar todas as suas movimentações financeiras.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                Senha de Descriptografia (se o arquivo foi protegido)
              </label>
              <input
                type="password"
                value={importPassphrase}
                onChange={(e) => setImportPassphrase(e.target.value)}
                placeholder="Insira a senha do arquivo..."
                className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 mt-2"
            >
              <Upload className="w-4 h-4" />
              <span>{isProcessing ? 'Restaurando...' : 'Selecionar Arquivo de Backup'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

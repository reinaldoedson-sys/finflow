import React, { useState } from 'react';
import { useSecurity } from '../context/SecurityContext';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { CurrencyCode } from '../types/finance';
import { 
  Shield, 
  Lock, 
  Key, 
  Eye, 
  Clock, 
  Download, 
  Upload, 
  RefreshCw, 
  Trash2, 
  Plus, 
  Check, 
  AlertTriangle,
  FolderLock,
  Cloud,
  LogIn,
  LogOut,
  CheckCircle2,
  Smartphone,
  Sparkles,
  ExternalLink,
  Share2
} from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';

interface SettingsViewProps {
  onOpenBackupModal: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenBackupModal }) => {
  const { 
    isPinEnabled, 
    autoLockMinutes, 
    setAutoLockMinutes, 
    setPin, 
    removePin,
    hideValues,
    toggleHideValues
  } = useSecurity();

  const { 
    currency, 
    setCurrency, 
    categories, 
    addCategory, 
    deleteCategory, 
    resetToDefaults, 
    clearAllData,
    clearSampleData,
    isDemoActive,
    syncLocalToCloud,
    isCloudSynced,
    syncStatus: globalSyncStatus,
    syncError,
    pendingSyncCount,
    retrySync
  } = useFinance();

  const { currentUser, signInWithGoogle, logout, authError } = useAuth();
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Pin state form
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New category form
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense');
  const [newCatColor, setNewCatColor] = useState('#10b981');

  // Confirmation modal for clear data
  const [confirmClear, setConfirmClear] = useState(false);

  const [isStandalone] = useState(() => {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
  });
  const [showApkGuide, setShowApkGuide] = useState(false);

  const handleSyncToCloud = async () => {
    setSyncFeedback('Sincronizando com Firestore...');
    try {
      await retrySync();
      await syncLocalToCloud();
      setSyncFeedback('Dados sincronizados com sucesso no Firebase!');
    } catch {
      setSyncFeedback('Falha na sincronização. Os dados permanecem salvos localmente.');
    }
    setTimeout(() => setSyncFeedback(null), 3500);
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setPinFeedback({ type: 'error', message: 'O PIN deve conter exatamente 4 números.' });
      return;
    }
    if (newPin !== confirmPin) {
      setPinFeedback({ type: 'error', message: 'Os PINs digitados não coincidem.' });
      return;
    }

    await setPin(newPin);
    setNewPin('');
    setConfirmPin('');
    setShowPinSetup(false);
    setPinFeedback({ type: 'success', message: 'PIN configurado com sucesso! Seu FinFlow está protegido.' });
  };

  const handleDisablePin = async () => {
    const success = await removePin(currentPin);
    if (success) {
      setCurrentPin('');
      setPinFeedback({ type: 'success', message: 'Bloqueio por PIN desativado.' });
    } else {
      setPinFeedback({ type: 'error', message: 'PIN atual incorreto para desativar.' });
    }
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    addCategory({
      name: newCatName.trim(),
      type: newCatType,
      color: newCatColor,
      icon: newCatType === 'income' ? 'TrendingUp' : 'Tag'
    });

    setNewCatName('');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          Segurança, Privacidade & Configurações
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Gerencie a proteção por PIN, cofre criptografado local e preferências do sistema
        </p>
      </div>

      {/* Cloud Sync & Firebase Section */}
      <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Sincronização em Nuvem (Firebase Firestore)</h3>
              <p className="text-xs text-slate-400">Acesse seus dados em múltiplos dispositivos com segurança e backup em tempo real</p>
            </div>
          </div>
          {currentUser && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Conectado
            </span>
          )}
        </div>

        {authError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {authError}
          </div>
        )}

        {syncFeedback && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {globalSyncStatus === 'error' && syncError && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2">
            <span>{syncError} ({pendingSyncCount} pendentes)</span>
            <button
              onClick={() => retrySync()}
              className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded text-[11px] font-medium transition-colors shrink-0"
            >
              Reenviar agora
            </button>
          </div>
        )}

        {currentUser ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="flex items-center gap-3">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-slate-700"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-sm">
                    {(currentUser.email?.[0] || 'U').toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold text-white">{currentUser.displayName || 'Usuário Google'}</p>
                  <p className="text-[11px] text-slate-400">{currentUser.email}</p>
                  <p className="text-[10px] text-emerald-400/90 font-mono mt-0.5">UID: {currentUser.uid.slice(0, 12)}...</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncToCloud}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar Agora</span>
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Seus lançamentos, contas e orçamentos estão sendo salvos com isolamento total no banco de dados Firestore sob sua identidade protegida.
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/30 border border-slate-800">
            <div>
              <p className="text-xs font-semibold text-slate-200">Você está usando o Modo Local (Offline)</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Conecte sua conta Google para sincronizar suas finanças na nuvem e nunca perder nenhum lançamento.
              </p>
            </div>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <LogIn className="w-4 h-4" />
              <span>Conectar com Google</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile App & APK Integration Section */}
      <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Aplicativo no Celular & APK</h3>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> PWA / WebAPK
                </span>
              </div>
              <p className="text-xs text-slate-400">Instale no seu smartphone e mantenha tudo sincronizado com o computador</p>
            </div>
          </div>

          {isStandalone && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              App Instalado
            </span>
          )}
        </div>

        {/* Como funciona a sincronização */}
        <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800/80 space-y-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-white">Sincronização Automática em Tempo Real:</strong> Como o FinFlow está conectado ao Firebase Firestore, basta fazer login com a sua conta Google no celular e no computador. Qualquer gasto, cartão, aporte ou meta cadastrado no celular sincroniza instantaneamente na versão web e vice-versa.
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-white">Funcionamento Offline no Smartphone:</strong> Se o seu celular ficar sem internet ou sem sinal, o app continua funcionando normalmente no aparelho. Assim que a conexão voltar, a fila de consistência sincroniza tudo automaticamente.
            </div>
          </div>
        </div>

        {/* Opções de Instalação e APK */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Opção 1: WebAPK Direto no Android */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  1. Instalação Direta (WebAPK Android)
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Recomendado
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Abra o link do FinFlow no Google Chrome do seu celular, toque nos <strong>3 pontinhos do menu</strong> e selecione <strong>&quot;Instalar aplicativo&quot;</strong>. O Android gerará um APK nativo automaticamente no seu aparelho, com ícone próprio na tela de início e sem barra de navegador.
              </p>
            </div>
          </div>

          {/* Opção 2: Gerar arquivo .apk via PWABuilder */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-cyan-400" />
                  2. Gerar Arquivo .APK
                </span>
                <span className="text-[10px] text-cyan-400 font-semibold bg-cyan-500/10 px-1.5 py-0.5 rounded">
                  Arquivo Físico
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Para compilar um pacote <code>.apk</code> ou <code>.aab</code> para distribuição externa ou sideloading, o FinFlow já possui Web App Manifest, ícones 192/512/maskable e Service Worker prontos para o <strong>PWABuilder</strong>.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800/80 mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowApkGuide(prev => !prev)}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {showApkGuide ? 'Ocultar Instruções' : 'Ver passo a passo do APK'}
              </button>
              <a
                href="https://www.pwabuilder.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
              >
                <span>PWABuilder</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Passo a passo expandido para gerar o APK */}
        {showApkGuide && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2.5 animate-in fade-in duration-200">
            <h4 className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
              <span>Como gerar o arquivo .APK em 3 passos:</span>
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-[11px] leading-relaxed">
              <li>Acesse <a href="https://www.pwabuilder.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline font-semibold">pwabuilder.com</a> no navegador.</li>
              <li>Cole a URL pública do seu FinFlow e clique em <strong>Start</strong> (o sistema validará o Manifest e os ícones criados).</li>
              <li>Clique em <strong>Package for Stores</strong> &gt; selecione <strong>Android</strong> e baixe seu arquivo <strong>.apk</strong> assinado.</li>
            </ol>
          </div>
        )}
      </div>

      {/* Security & PIN Section */}
      <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Bloqueio de Segurança por PIN</h3>
            <p className="text-xs text-slate-400">Protege o acesso às suas informações financeiras</p>
          </div>
        </div>

        {pinFeedback && (
          <div className={`p-3 rounded-lg text-xs ${
            pinFeedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            {pinFeedback.message}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Exigir PIN ao abrir o aplicativo</p>
              <p className="text-[11px] text-slate-400">
                {isPinEnabled ? 'PIN ativo e protegendo seus dados' : 'Desativado. Qualquer pessoa com acesso ao navegador pode visualizar'}
              </p>
            </div>
            {isPinEnabled ? (
              <button
                onClick={() => setShowPinSetup(prev => !prev)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Alterar ou Desativar PIN
              </button>
            ) : (
              <button
                onClick={() => setShowPinSetup(true)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all"
              >
                Ativar PIN
              </button>
            )}
          </div>

          {/* PIN Setup / Change Form */}
          {showPinSetup && (
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 mt-3 space-y-4">
              <h4 className="text-xs font-bold text-white">
                {isPinEnabled ? 'Alterar ou Remover PIN' : 'Configurar Novo PIN de 4 Dígitos'}
              </h4>

              {isPinEnabled && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Digite o PIN Atual para confirmar
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      maxLength={4}
                      inputMode="numeric"
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value)}
                      placeholder="••••"
                      className="w-32 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono tracking-widest text-center text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleDisablePin}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-all"
                    >
                      Desativar PIN
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSavePin} className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3 max-w-xs">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Novo PIN (4 dígitos)</label>
                    <input
                      type="password"
                      maxLength={4}
                      inputMode="numeric"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="1234"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono tracking-widest text-center text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Confirmar PIN</label>
                    <input
                      type="password"
                      maxLength={4}
                      inputMode="numeric"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      placeholder="1234"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono tracking-widest text-center text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all"
                  >
                    Salvar PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPinSetup(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Auto Lock timeout */}
          {isPinEnabled && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">Bloqueio Automático por Inatividade</p>
                  <p className="text-[11px] text-slate-400">Bloqueia a tela se o app ficar inativo</p>
                </div>
              </div>
              <select
                value={autoLockMinutes}
                onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value={1}>Após 1 minuto</option>
                <option value={5}>Após 5 minutos</option>
                <option value={15}>Após 15 minutos</option>
                <option value={0}>Desativado</option>
              </select>
            </div>
          )}

          {/* Privacy mode toggle */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs font-semibold text-slate-200">Modo Privacidade (Ocultar Valores)</p>
                <p className="text-[11px] text-slate-400">
                  Esconde saldos e números na tela (Atalho no teclado: pressione <kbd className="font-mono text-emerald-400 bg-slate-800 px-1 rounded">P</kbd>)
                </p>
              </div>
            </div>
            <button
              onClick={toggleHideValues}
              className={`px-3 py-1 text-xs font-semibold rounded-md border transition-all ${
                hideValues
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {hideValues ? 'Ocultos' : 'Visíveis'}
            </button>
          </div>
        </div>
      </div>

      {/* Data Vault & Backups */}
      <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <FolderLock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Cofre de Dados & Backup Criptografado</h3>
            <p className="text-xs text-slate-400">
              Todos os dados ficam armazenados localmente no seu dispositivo, com suporte a exportação AES-256
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-xs font-semibold text-slate-200">Backup Local com Senha</p>
            <p className="text-[11px] text-slate-400">
              Gere um arquivo protegido para salvar no seu computador ou pen drive com segurança máxima.
            </p>
          </div>
          <button
            onClick={onOpenBackupModal}
            className="px-4 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Gerenciar Backup</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <div>
            <p className="text-xs font-semibold text-amber-400">Limpar Dados de Exemplo</p>
            <p className="text-[11px] text-slate-400">
              Remove contas, cartões e transações de demonstração para que você comece com o FinFlow limpo. Os dados de teste não voltarão mais.
            </p>
          </div>
          <button
            onClick={async () => {
              await clearSampleData();
              setSyncFeedback('Dados de exemplo removidos com sucesso! Você agora está com o FinFlow limpo.');
              setTimeout(() => setSyncFeedback(null), 3500);
            }}
            className="px-3.5 py-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Limpar Dados de Teste</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <div>
            <p className="text-xs font-semibold text-slate-200">Dados de Demonstração</p>
            <p className="text-[11px] text-slate-400">
              Restaurar dados de exemplo realistas (Nubank, Itaú, XP, despesas do mês)
            </p>
          </div>
          <button
            onClick={async () => {
              await resetToDefaults();
              setSyncFeedback('Dados de demonstração recarregados.');
              setTimeout(() => setSyncFeedback(null), 3500);
            }}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recarregar Demo</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <div>
            <p className="text-xs font-semibold text-rose-400">Limpar Todos os Dados</p>
            <p className="text-[11px] text-slate-400">
              Apaga permanentemente todas as contas, lançamentos e orçamentos deste navegador.
            </p>
          </div>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-all"
            >
              Apagar Tudo
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-300 font-semibold">Tem certeza?</span>
              <button
                onClick={() => { clearAllData(); setConfirmClear(false); }}
                className="px-3 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-all"
              >
                Sim, Limpar
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Currency & Localization */}
      <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white">Moeda & Localização</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-200">Moeda Padrão</p>
            <p className="text-[11px] text-slate-400">Formatação usada nos valores e gráficos</p>
          </div>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="BRL">Real Brasileiro (R$)</option>
            <option value="USD">Dólar Americano ($)</option>
            <option value="EUR">Euro (€)</option>
          </select>
        </div>
      </div>

      {/* Category Management */}
      <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white">Categorias Personalizadas</h3>
            <p className="text-xs text-slate-400">Crie ou remova categorias para organizar seus gastos</p>
          </div>
        </div>

        {/* Add Category Form */}
        <form onSubmit={handleCreateCategory} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nome da nova categoria..."
            className="flex-1 min-w-[180px] px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />

          <select
            value={newCatType}
            onChange={(e) => setNewCatType(e.target.value as any)}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none"
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>

          <input
            type="color"
            value={newCatColor}
            onChange={(e) => setNewCatColor(e.target.value)}
            className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer"
            title="Escolha a cor da categoria"
          />

          <button
            type="submit"
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-sm transition-all flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar</span>
          </button>
        </form>

        {/* List of categories */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="p-2 rounded-lg bg-slate-800/40 border border-slate-800/80 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-slate-200 truncate">{cat.name}</span>
              </div>
              <button
                type="button"
                onClick={() => deleteCategory(cat.id)}
                className="text-slate-500 hover:text-rose-400 p-1"
                title="Excluir categoria"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

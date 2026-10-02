import React, { useState, useEffect, useCallback } from 'react';
import { useSecurity } from '../context/SecurityContext';
import { Shield, Delete, AlertCircle, Lock } from 'lucide-react';

export const PinLockModal: React.FC = () => {
  const { isLocked, unlockWithPin } = useSecurity();
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const handleKeyPress = useCallback((digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit);
      setError(false);
    }
  }, [pin]);

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
    setError(false);
  }, []);

  // Keyboard support for desktop users
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape' || e.key === 'Delete') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, handleKeyPress, handleDelete, handleClear]);

  // When 4 digits are entered, auto-verify
  useEffect(() => {
    if (pin.length === 4) {
      setIsVerifying(true);
      unlockWithPin(pin).then((success) => {
        setIsVerifying(false);
        if (!success) {
          setError(true);
          setPin('');
        }
      });
    }
  }, [pin, unlockWithPin]);

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070a10]/95 backdrop-blur-md p-4">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Brand Lock Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-950/40">
          <Shield className="w-8 h-8 text-emerald-400" />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-white mb-1">
          FinFlow Seguro
        </h2>
        <p className="text-xs text-slate-400 mb-8 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          Digite o PIN de 4 dígitos para desbloquear
        </p>

        {/* PIN Dots Indicator */}
        <div className={`flex items-center gap-4 mb-8 transition-transform ${error ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? 'bg-emerald-400 scale-110 shadow-sm shadow-emerald-400/50'
                    : 'border-2 border-slate-700 bg-slate-800/60'
                } ${error ? 'border-red-500 bg-red-500/20' : ''}`}
              />
            );
          })}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 mb-6 font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>PIN incorreto. Tente novamente.</span>
          </div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isVerifying}
              onClick={() => handleKeyPress(String(num))}
              className="h-14 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 active:scale-95 text-xl font-mono font-medium text-slate-100 transition-all focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            disabled={isVerifying}
            onClick={handleClear}
            className="h-14 rounded-xl bg-slate-900/40 border border-transparent hover:border-slate-800 text-xs font-medium text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center focus:outline-none"
          >
            Limpar
          </button>

          <button
            type="button"
            disabled={isVerifying}
            onClick={() => handleKeyPress('0')}
            className="h-14 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 active:scale-95 text-xl font-mono font-medium text-slate-100 transition-all focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          >
            0
          </button>

          <button
            type="button"
            disabled={isVerifying || pin.length === 0}
            onClick={handleDelete}
            className="h-14 rounded-xl bg-slate-900/40 border border-transparent hover:border-slate-800 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center focus:outline-none"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-8">
          Todos os dados permanecem salvos localmente e protegidos no seu navegador.
        </p>
      </div>
    </div>
  );
};

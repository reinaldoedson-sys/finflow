import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { SecuritySettings } from '../types/finance';
import { hashString } from '../utils/crypto';

interface SecurityContextType {
  isLocked: boolean;
  isPinEnabled: boolean;
  hideValues: boolean;
  autoLockMinutes: number;
  unlockWithPin: (pin: string) => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  removePin: (currentPin: string) => Promise<boolean>;
  lockApp: () => void;
  toggleHideValues: () => void;
  setAutoLockMinutes: (mins: number) => void;
  hasPinConfigured: boolean;
}

const STORAGE_KEY = 'finflow_security_v1';

const defaultSettings: SecuritySettings = {
  isPinEnabled: false,
  autoLockMinutes: 5,
  hideValuesByDefault: false,
};

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SecuritySettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // fallback
    }
    return defaultSettings;
  });

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    // If PIN is enabled, initial state should be locked
    return !!settings.isPinEnabled && !!settings.pinHash;
  });

  const [hideValues, setHideValues] = useState<boolean>(() => settings.hideValuesByDefault);

  // Save settings to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save security settings', e);
    }
  }, [settings]);

  const lockApp = useCallback(() => {
    if (settings.isPinEnabled && settings.pinHash) {
      setIsLocked(true);
    }
  }, [settings.isPinEnabled, settings.pinHash]);

  // Inactivity Auto-Lock
  useEffect(() => {
    if (!settings.isPinEnabled || !settings.pinHash || settings.autoLockMinutes <= 0 || isLocked) {
      return;
    }

    let timer: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsLocked(true);
      }, settings.autoLockMinutes * 60 * 1000);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [settings.isPinEnabled, settings.pinHash, settings.autoLockMinutes, isLocked]);

  // Keyboard shortcut: Press 'p' to toggle privacy mode (only if not typing in an input/textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        setHideValues(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unlockWithPin = async (pin: string): Promise<boolean> => {
    if (!settings.pinHash) {
      setIsLocked(false);
      return true;
    }
    const hash = await hashString(pin);
    if (hash === settings.pinHash) {
      setIsLocked(false);
      return true;
    }
    return false;
  };

  const setPin = async (pin: string) => {
    const hash = await hashString(pin);
    setSettings(prev => ({
      ...prev,
      isPinEnabled: true,
      pinHash: hash,
    }));
    setIsLocked(false);
  };

  const removePin = async (currentPin: string): Promise<boolean> => {
    if (settings.pinHash) {
      const hash = await hashString(currentPin);
      if (hash !== settings.pinHash) {
        return false;
      }
    }
    setSettings(prev => ({
      ...prev,
      isPinEnabled: false,
      pinHash: undefined,
    }));
    setIsLocked(false);
    return true;
  };

  const toggleHideValues = () => {
    setHideValues(prev => !prev);
  };

  const setAutoLockMinutes = (mins: number) => {
    setSettings(prev => ({ ...prev, autoLockMinutes: mins }));
  };

  return (
    <SecurityContext.Provider
      value={{
        isLocked,
        isPinEnabled: settings.isPinEnabled,
        hideValues,
        autoLockMinutes: settings.autoLockMinutes,
        unlockWithPin,
        setPin,
        removePin,
        lockApp,
        toggleHideValues,
        setAutoLockMinutes,
        hasPinConfigured: !!settings.pinHash,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};

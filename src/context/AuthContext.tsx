import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { loadFirebase } from '../firebaseLoader';

export const AUTH_HINT_STORAGE_KEY = 'finflow_auth_hint';

/**
 * Função pura para determinar se o Firebase deve ser carregado na inicialização da aplicação.
 * Se houver registro de sessão prévia bem-sucedida, inicia o Firebase para revalidar a sessão.
 * Caso contrário, mantém o app 100% local-first sem baixar o chunk do Firebase.
 */
export function shouldLoadFirebaseOnBoot(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const s = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!s) return false;
    return Boolean(s.getItem(AUTH_HINT_STORAGE_KEY));
  } catch {
    return false;
  }
}

interface AuthContextType {
  currentUser: User | null;
  isAuthReady: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    // Se não há indício de login anterior, inicializa o app imediatamente offline
    if (!shouldLoadFirebaseOnBoot()) {
      setCurrentUser(null);
      setIsAuthReady(true);
      return;
    }

    // Se havia sessão salva, carrega o Firebase de forma assíncrona
    loadFirebase()
      .then(async (fb) => {
        if (!isMounted) return;
        const { onAuthStateChanged } = await import('firebase/auth');
        if (!isMounted) return;
        const { doc, getDoc, setDoc } = await import('firebase/firestore');
        if (!isMounted) return;

        const unsub = onAuthStateChanged(fb.auth, async (user) => {
          if (!isMounted) return;
          setCurrentUser(user);
          setIsAuthReady(true);

          if (user) {
            try {
              localStorage.setItem(AUTH_HINT_STORAGE_KEY, 'true');
            } catch {
              // ignore
            }

            // Garante que o documento do usuário exista no Firestore
            const userRef = doc(fb.db, 'users', user.uid);
            try {
              const userSnap = await getDoc(userRef);
              if (!isMounted) return;
              if (!userSnap.exists()) {
                await setDoc(userRef, {
                  email: user.email || '',
                  displayName: user.displayName || '',
                  photoURL: user.photoURL || '',
                  currency: 'BRL',
                  createdAt: new Date().toISOString()
                });
              }
            } catch (err) {
              if (isMounted) {
                fb.handleFirestoreError(err, fb.OperationType.WRITE, `users/${user.uid}`);
              }
            }
          }
        });

        if (!isMounted) {
          unsub();
          return;
        }
        unsubscribe = unsub;
      })
      .catch((err) => {
        console.warn('[AuthContext] Falha ao carregar Firebase na inicialização com auth hint:', err);
        if (isMounted) {
          setCurrentUser(null);
          setIsAuthReady(true);
          // NÃO apague a flag, para permitir reconexão futura quando houver rede
        }
      });

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      setAuthError(null);
      const fb = await loadFirebase();
      const result = await fb.signInWithPopup(fb.auth, fb.googleProvider);
      if (result.user) {
        try {
          localStorage.setItem(AUTH_HINT_STORAGE_KEY, 'true');
        } catch {
          // ignore
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao autenticar com Google.';
      setAuthError(msg);
      console.error('Google Sign-In Error:', err);
    }
  };

  const logout = async () => {
    try {
      try {
        localStorage.removeItem(AUTH_HINT_STORAGE_KEY);
      } catch {
        // ignore
      }
      const fb = await loadFirebase();
      await fb.signOut(fb.auth);
      setCurrentUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthReady,
        signInWithGoogle,
        logout,
        authError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

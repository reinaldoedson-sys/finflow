import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, signInWithPopup, signOut, handleFirestoreError, OperationType } from '../firebase';

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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);

      if (user) {
        // Ensure user document exists in Firestore
        const userRef = doc(db, 'users', user.uid);
        try {
          const userSnap = await getDoc(userRef);
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
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao autenticar com Google.';
      setAuthError(msg);
      console.error('Google Sign-In Error:', err);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
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

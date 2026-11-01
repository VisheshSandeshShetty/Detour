// Keeps track of who is logged in, for the whole app.
// Any component can call  const { user, login, logout } = useAuth();

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean; // true while we ask the server "am I already logged in?"
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // When the app opens, check whether the login cookie is still valid
  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null)) // not logged in (or server offline): that is fine
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await api.login(email, password);
    setUser(data.user);
  }

  async function register(name: string, email: string, password: string) {
    const data = await api.register(name, email, password);
    setUser(data.user);
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

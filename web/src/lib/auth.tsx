import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getToken, handleSignedOut, setToken, type Me } from "./api";

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  /** The first-sign-in password was chosen: unlock the app straight away. */
  passwordSet: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const queryClient = useQueryClient();

  const signOut = useCallback(() => {
    setToken(null);
    setMe(null);
    queryClient.clear();
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      setMe(await api<Me>("/auth/me"));
    } catch {
      /* offline or signed out; signed-out is handled below */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    handleSignedOut(signOut);
    void refresh();
  }, [refresh, signOut]);

  // Pick up a role change (made admin, made coordinator) without signing out.
  useEffect(() => {
    if (!me) return;
    const interval = setInterval(refresh, 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [me, refresh]);

  const signIn = async (email: string, password: string) => {
    const res = await api<{ token: string; me: Me }>("/auth/login", { method: "POST", body: { email, password } });
    setToken(res.token);
    setMe(res.me);
  };

  const passwordSet = useCallback(() => {
    setMe((current) => current && { ...current, mustChangePassword: false });
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, signIn, signOut, refresh, passwordSet }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** For pages that only render when signed in. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error("useMe while signed out");
  return me;
}

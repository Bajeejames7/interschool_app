import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api, getStoredMe, getToken, handleSignedOut, setStoredMe, setToken, type Me } from "./api";
import { clearOffline } from "./offline";

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
  // Start from the saved copy so the app opens straight away, offline too;
  // the server's answer replaces it a moment later.
  const [me, setMeState] = useState<Me | null>(() => (getToken() ? getStoredMe() : null));
  const [loading, setLoading] = useState(() => Boolean(getToken()) && !getStoredMe());
  const setMe = useCallback((next: Me | null) => {
    setStoredMe(next);
    setMeState(next);
  }, []);
  const queryClient = useQueryClient();

  const signOut = useCallback(() => {
    setToken(null);
    setMe(null);
    queryClient.clear();
    clearOffline(); // this phone's saved data and unsent changes were theirs
  }, [queryClient, setMe]);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      setMe(await api<Me>("/auth/me"));
    } catch (err) {
      // Offline: keep the saved copy. Signed out (401) is handled by
      // handleSignedOut below.
      if (!(err instanceof ApiError) || err.status !== 0) console.warn(err);
    } finally {
      setLoading(false);
    }
  }, [setMe]);

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
    setMeState((current) => {
      const next = current && { ...current, mustChangePassword: false };
      setStoredMe(next);
      return next;
    });
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

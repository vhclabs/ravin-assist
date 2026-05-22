import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loginWithPasscode, me } from "./auth.functions";
import { setRavinPasscode, clearRavinPasscode, getRavinPasscode } from "./ravin-auth-client";

type AppUser = { id: string; name: string; role: "master" | "vendedor" };

type AuthCtx = {
  isAuthed: boolean;
  user: AppUser | null;
  login: (code: string) => Promise<boolean>;
  logout: () => void;
  ready: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const code = getRavinPasscode();
    if (!code) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const u = await me();
        setUser(u as AppUser);
      } catch {
        clearRavinPasscode();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = async (code: string) => {
    const trimmed = code.trim();
    setRavinPasscode(trimmed);
    try {
      const r = await loginWithPasscode({ data: { passcode: trimmed } });
      if (!r.ok) {
        clearRavinPasscode();
        return false;
      }
      setUser(r.user as AppUser);
      return true;
    } catch {
      clearRavinPasscode();
      return false;
    }
  };

  const logout = () => {
    clearRavinPasscode();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ isAuthed: !!user, user, login, logout, ready }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

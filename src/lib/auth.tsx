import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const MASTER_CREDENTIAL = "manu2107@";
const STORAGE_KEY = "ravin_auth_v1";

type AuthCtx = {
  isAuthed: boolean;
  login: (code: string) => boolean;
  logout: () => void;
  ready: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsAuthed(localStorage.getItem(STORAGE_KEY) === "ok");
      setReady(true);
    }
  }, []);

  const login = (code: string) => {
    if (code.trim() === MASTER_CREDENTIAL) {
      localStorage.setItem(STORAGE_KEY, "ok");
      setIsAuthed(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsAuthed(false);
  };

  return <Ctx.Provider value={{ isAuthed, login, logout, ready }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

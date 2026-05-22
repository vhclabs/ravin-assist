// Client middleware that attaches the stored passcode header to every server fn call.
import { createMiddleware } from "@tanstack/react-start";

const STORAGE_KEY = "ravin_passcode_v1";

export function setRavinPasscode(p: string) {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, p);
}
export function clearRavinPasscode() {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
export function getRavinPasscode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export const attachRavinAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const code = getRavinPasscode();
  if (!code) return next();
  return next({ headers: { "x-ravin-passcode": code } });
});

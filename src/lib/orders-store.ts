import type { Order } from "./order-types";

const ORDERS_KEY = "ravin_orders_v1";
const EMAILS_KEY = "ravin_emails_v1";

export function loadOrders(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
  } catch {
    return [];
  }
}
export function saveOrder(o: Order) {
  const all = loadOrders();
  all.unshift(o);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
}
export function deleteOrder(id: string) {
  const all = loadOrders().filter((o) => o.id !== id);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(all));
}

export function loadEmails(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(EMAILS_KEY) || "[]");
  } catch {
    return [];
  }
}
export function saveEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!e) return;
  const all = loadEmails();
  if (!all.includes(e)) {
    all.unshift(e);
    localStorage.setItem(EMAILS_KEY, JSON.stringify(all.slice(0, 30)));
  }
}
export function removeEmail(email: string) {
  const all = loadEmails().filter((e) => e !== email);
  localStorage.setItem(EMAILS_KEY, JSON.stringify(all));
}

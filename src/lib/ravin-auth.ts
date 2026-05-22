// Server-side middleware that validates Ravin passcode (sent as header)
// against app_users. Injects { user } in context.
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RavinUser = {
  id: string;
  name: string;
  role: "master" | "vendedor";
};

export const requireRavinAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const passcode = getRequestHeader("x-ravin-passcode");
  if (!passcode) throw new Error("Unauthorized: missing passcode");
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,role,active")
    .eq("passcode", passcode)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) throw new Error("Unauthorized: invalid passcode");
  const user: RavinUser = { id: data.id, name: data.name, role: data.role as RavinUser["role"] };
  return next({ context: { user } });
});

export const requireMaster = createMiddleware({ type: "function" })
  .middleware([requireRavinAuth])
  .server(async ({ next, context }) => {
    if (context.user.role !== "master") throw new Error("Forbidden: master only");
    return next({ context });
  });

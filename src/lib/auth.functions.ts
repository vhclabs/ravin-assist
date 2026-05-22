// Auth server functions
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRavinAuth } from "./ravin-auth";

export const loginWithPasscode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ passcode: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { data: user, error } = await supabaseAdmin
      .from("app_users")
      .select("id,name,role,active")
      .eq("passcode", data.passcode)
      .eq("active", true)
      .maybeSingle();
    if (error || !user) return { ok: false as const };
    return { ok: true as const, user: { id: user.id, name: user.name, role: user.role } };
  });

export const me = createServerFn({ method: "GET" })
  .middleware([requireRavinAuth])
  .handler(async ({ context }) => context.user);

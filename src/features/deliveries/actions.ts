"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function moveDelivery(input: unknown) {
  const parsed = z.object({ deliveryId: z.string().uuid(), status: z.enum(["preparing", "ready", "out_for_delivery", "delivered", "cancelled"]), position: z.number().finite().min(0).max(1_000_000_000), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Confira a etapa e os dados da entrega." };
  if (parsed.data.status === "cancelled" && parsed.data.reason.length < 3) return { ok: false, message: "Informe o motivo do cancelamento." };
  const context = await getUserContext();
  if (!context) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_delivery", { p_store: context.store.id, p_delivery: parsed.data.deliveryId, p_status: parsed.data.status, p_position: parsed.data.position, p_expected_version: parsed.data.expectedVersion, p_reason: parsed.data.reason || undefined });
  if (error) {
    if (error.message.includes("version_conflict")) return { ok: false, message: "Outra pessoa atualizou esta entrega. Atualize o quadro e tente novamente." };
    if (error.message.includes("cancelled_sale_delivery")) return { ok: false, message: "A venda foi cancelada. Cancele a entrega separadamente antes de avançá-la." };
    return { ok: false, message: "Não foi possível atualizar a entrega." };
  }
  for (const path of ["/entregas", "/vendas", "/dashboard", "/financeiro"]) revalidatePath(path);
  return { ok: true };
}

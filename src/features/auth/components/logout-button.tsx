"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LuLogOut } from "react-icons/lu";
import { Button } from "@/components/ui/button";

export function LogoutButton({ label = "Sair" }: { label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" className="h-10 gap-2" onClick={logout} disabled={pending}>
      <LuLogOut className="size-4" aria-hidden="true" />
      {pending ? "Saindo…" : label}
    </Button>
  );
}

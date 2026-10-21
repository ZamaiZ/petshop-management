import type { ReactNode } from "react";
import { Suspense } from "react";
import { AdminShell } from "@/features/platform-admin/components/admin-shell";
import { requirePlatformAdminContext } from "@/lib/auth/context";

export default function PlatformAdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="min-h-dvh bg-[#f6f7f9] dark:bg-background" aria-busy="true" />}><AuthorizedPlatformAdmin>{children}</AuthorizedPlatformAdmin></Suspense>;
}

async function AuthorizedPlatformAdmin({ children }: { children: ReactNode }) {
  const context = await requirePlatformAdminContext();
  return <AdminShell email={context.user.email ?? ""}>{children}</AdminShell>;
}

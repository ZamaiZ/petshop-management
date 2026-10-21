"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LuBuilding2, LuPawPrint, LuTicket } from "react-icons/lu";
import { LogoutButton } from "@/features/auth/components/logout-button";

const navigation = [
  { href: "/lojas", label: "Pet shops", icon: LuBuilding2 },
  { href: "/convites", label: "Convites", icon: LuTicket },
];

export function AdminShell({ children, email }: { children: ReactNode; email: string }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-[#f6f7f9] dark:bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-[72px] max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background"><LuPawPrint className="size-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-[-0.02em]">petshop.</p>
              <p className="text-[10px] text-muted-foreground">Administração da plataforma</p>
            </div>
          </div>
          <nav aria-label="Administração da plataforma" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
            {navigation.map(({ href, label, icon: Icon }) => {
              const internalPath = href === "/lojas" ? "/platform-admin/stores" : "/platform-admin/invitations";
              const active = pathname === href || pathname === internalPath || pathname.startsWith(`${internalPath}/`);
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-[11px] font-medium transition-colors ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>
                  <Icon className="size-3.5" aria-hidden="true" />{label}
                </Link>
              );
            })}
          </nav>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden max-w-48 truncate text-[10px] text-muted-foreground md:inline">{email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
        {children}
      </main>
    </div>
  );
}

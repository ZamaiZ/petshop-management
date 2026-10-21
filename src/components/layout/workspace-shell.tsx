"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MotionConfig } from "motion/react";
import {
  LuBell,
  LuCalendarDays,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuCircleUserRound,
  LuCreditCard,
  LuHouse,
  LuLogOut,
  LuPackage,
  LuPawPrint,
  LuSettings2,
  LuShoppingBag,
  LuTruck,
  LuUsersRound,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageTransition } from "@/components/layout/page-transition";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { saveSidebarPreference, saveThemePreference } from "@/features/settings/actions";

type StoreInfo = { id: string; name: string; logo_url: string | null };
type Theme = "system" | "light" | "dark";

const navigation = [
  { href: "/dashboard", label: "Visão geral", icon: LuHouse },
  { href: "/vendas", label: "Vendas", icon: LuShoppingBag },
  { href: "/estoque", label: "Estoque", icon: LuPackage },
  { href: "/agenda", label: "Agenda", icon: LuCalendarDays },
  { href: "/entregas", label: "Entregas", icon: LuTruck },
  { href: "/clientes", label: "Clientes", icon: LuUsersRound },
  { href: "/financeiro", label: "Financeiro", icon: LuCreditCard },
];

const pageTitles: Record<string, string> = {
  dashboard: "Visão geral",
  vendas: "Vendas",
  estoque: "Estoque",
  agenda: "Agenda",
  entregas: "Entregas",
  clientes: "Clientes",
  financeiro: "Financeiro",
  configuracoes: "Configurações",
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function AppSidebar({ store, pathname }: { store: StoreInfo; pathname: string }) {
  const { state } = useSidebar();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="relative h-[72px] justify-center border-b border-sidebar-border px-4 py-0">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8 shrink-0 rounded-lg after:rounded-lg">
            {store.logo_url ? <AvatarImage src={store.logo_url} alt={`Logo de ${store.name}`} className="rounded-md object-contain" /> : null}
            <AvatarFallback className="rounded-md bg-foreground text-background"><LuPawPrint className="size-4" aria-hidden="true" /></AvatarFallback>
          </Avatar>
          <span className="truncate text-[13px] font-semibold tracking-[-0.02em] group-data-[collapsible=icon]:hidden">{store.name}</span>
        </div>
        <SidebarTrigger
          className="absolute top-1/2 -right-[15px] z-30 size-7 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm hover:bg-muted"
          aria-label={state === "expanded" ? "Recolher menu" : "Expandir menu"}
        >
          {state === "expanded" ? <LuChevronLeft className="size-3.5" /> : <LuChevronRight className="size-3.5" />}
        </SidebarTrigger>
      </SidebarHeader>
      <SidebarContent className="px-2 pt-5">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navigation.map(({ href, label, icon: Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      render={<Link href={href} aria-current={active ? "page" : undefined} />}
                      isActive={active}
                      tooltip={label}
                      className="h-10 rounded-md px-3 text-[12px] font-medium [&>svg]:size-[17px]"
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function ThemeSelector({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={(value) => onThemeChange(value as Theme)}>
      <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Tema</DropdownMenuLabel>
      <DropdownMenuRadioItem value="system">Sistema</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">Escuro</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

function ShellHeader({
  store,
  userEmail,
  pageTitle,
  theme,
  onThemeChange,
  onLogout,
}: {
  store: StoreInfo;
  userEmail: string;
  pageTitle: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur-sm sm:px-8">
      <div className="flex min-w-0 items-center gap-3 text-[12px]">
        <span className="truncate text-muted-foreground">{store.name}</span>
        <span className="text-muted-foreground/60">›</span>
        <span className="truncate font-medium text-foreground">{pageTitle}</span>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Notificações" className="size-9 rounded-full" />}>
            <LuBell className="size-[17px]" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Notificações</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <p className="px-2 py-3 text-xs text-muted-foreground">Nenhuma notificação nova.</p>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="h-10 gap-2 rounded-full px-1.5 sm:px-2" aria-label="Abrir menu da conta" />}>
            <span className="grid size-8 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
              {userEmail.slice(0, 2).toUpperCase() || <LuCircleUserRound className="size-4" />}
            </span>
            <span className="hidden max-w-32 truncate text-[12px] font-medium sm:block">{store.name}</span>
            <LuChevronDown className="hidden size-3 text-muted-foreground sm:block" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-xs font-medium">{userEmail}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{store.name}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/configuracoes" />}>
                <LuSettings2 aria-hidden="true" />
                Configurações
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <ThemeSelector theme={theme} onThemeChange={onThemeChange} />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LuLogOut aria-hidden="true" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function WorkspaceShell({
  children,
  store,
  userId,
  userEmail,
  initialTheme,
  initialSidebarCollapsed,
}: {
  children: ReactNode;
  store: StoreInfo;
  userId: string;
  userEmail: string;
  initialTheme: Theme;
  initialSidebarCollapsed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const title = useMemo(() => {
    const section = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
    return pageTitles[section] ?? "Visão geral";
  }, [pathname]);

  const applyTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", nextTheme === "dark" || (nextTheme === "system" && systemDark));
    document.documentElement.dataset.theme = nextTheme;
    void saveThemePreference(nextTheme);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
      document.documentElement.dataset.theme = theme;
    };
    sync();
    if (theme !== "system") return;
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);

  const handleSidebarChange = useCallback((open: boolean) => {
    setCollapsed(!open);
    void saveSidebarPreference(!open);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
        applyTheme(next);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [theme, applyTheme]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.theme = "system";
    router.replace("/login");
    router.refresh();
  }

  return (
    <MotionConfig reducedMotion="user">
      <RealtimeProvider storeId={store.id} userId={userId}>
      <TooltipProvider delay={150}>
        <SidebarProvider
          open={!collapsed}
          onOpenChange={handleSidebarChange}
          style={{ "--sidebar-width": "224px", "--sidebar-width-icon": "74px" } as CSSProperties}
          className="min-h-dvh"
        >
          <AppSidebar store={store} pathname={pathname} />
          <SidebarInset className="min-h-dvh bg-[#f6f7f9] dark:bg-background">
            <ShellHeader
              store={store}
              userEmail={userEmail}
              pageTitle={title}
              theme={theme}
              onThemeChange={applyTheme}
              onLogout={logout}
            />
            <div className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-8 xl:px-[34px]">
              <PageTransition>{children}</PageTransition>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
      </RealtimeProvider>
    </MotionConfig>
  );
}

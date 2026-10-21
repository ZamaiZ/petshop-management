import { Suspense, type ReactNode } from "react";
import { io } from "next/cache";
import { requireUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Skeleton } from "@/components/ui/skeleton";

function WorkspaceLoading() {
  return (
    <div className="flex min-h-dvh bg-[#f6f7f9] dark:bg-background" aria-busy="true">
      <aside className="hidden w-[224px] shrink-0 border-r border-border bg-background p-4 md:block">
        <div className="flex h-10 items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="mt-8 space-y-2">
          {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-10 rounded-md" />)}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-[72px] items-center justify-between border-b border-border bg-background px-5 sm:px-8">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="size-9 rounded-full" />
        </header>
        <main className="space-y-5 px-5 py-6 sm:px-8 sm:py-8 xl:px-[34px]">
          <div className="flex items-center justify-between">
            <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-3 w-56" /></div>
            <Skeleton className="h-9 w-36" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[128px] rounded-[10px]" />)}
          </div>
          <Skeleton className="h-[300px] rounded-[10px]" />
        </main>
      </div>
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  await io();
  const context = await requireUserContext();
  const supabase = await createClient();
  const logoResult = context.store.logo_path
    ? await supabase.storage.from("store-assets").createSignedUrl(context.store.logo_path, 60 * 60 * 24)
    : null;
  return (
    <WorkspaceShell
      store={{ id: context.store.id, name: context.store.name, logo_url: logoResult?.data?.signedUrl ?? null }}
      userId={context.user.id}
      userEmail={context.user.email ?? ""}
      initialTheme={context.preferences.theme}
      initialSidebarCollapsed={context.preferences.sidebar_collapsed}
    >
      {children}
    </WorkspaceShell>
  );
}

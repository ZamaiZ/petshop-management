import { LuUsersRound } from "react-icons/lu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { InvitationCreateCard } from "@/features/invitations/components/invitation-create-card";
import { InvitationList, type InvitationRecord } from "@/features/invitations/components/invitation-list";

type TeamMember = {
  user_id: string;
  email: string | null;
  role: string;
  active: boolean;
  joined_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export function TeamView({
  invitations,
  members,
  loadError,
}: {
  invitations: InvitationRecord[];
  members: TeamMember[];
  loadError: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Gestão do pet shop</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em]">Equipe</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Convide colaboradores para acessar o painel do seu pet shop.</p>
      </div>
      {loadError ? <Alert variant="destructive"><AlertDescription>Não foi possível carregar a equipe agora. Atualize a página para tentar novamente.</AlertDescription></Alert> : null}
      <InvitationCreateCard
        endpoint="/api/team/invitations"
        title="Convidar colaborador"
        description="O link ficará vinculado ao e-mail informado, será válido por sete dias e poderá ser usado uma única vez. Copie e envie manualmente."
      />
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="gap-0 rounded-xl border-border/90 p-5 shadow-xs sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Acessos do pet shop</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Gestores e colaboradores cadastrados.</p>
            </div>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><LuUsersRound className="size-4" aria-hidden="true" /></span>
          </div>
          {members.length ? (
            <div className="mt-4 divide-y divide-border">
              {members.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium">{member.email ?? "Conta sem e-mail"}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Acesso desde {formatDate(member.joined_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-medium">{member.role === "owner" ? "Gestor" : "Colaborador"}</p>
                    <p className={`mt-1 text-[10px] ${member.active ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{member.active ? "Ativo" : "Inativo"}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-[12px] font-medium">Nenhum acesso encontrado</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Os acessos criados aparecerão aqui.</p>
            </div>
          )}
        </Card>
        <InvitationList invitations={invitations} endpoint="/api/team/invitations" title="Convites de colaboradores" />
      </div>
    </div>
  );
}

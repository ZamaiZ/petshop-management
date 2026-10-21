# Plano de implementação — acesso por convites

**Desenho:** aprovado em 21/10/2026 em `docs/superpowers/specs/2026-10-21-platform-access-invites-design.md`.
**Status:** implementação no workspace e revisão estática independente concluídas; sem validação dinâmica.

## Restrições do projeto

- Não executar `git`, `test`, `typecheck`, `build` ou `lint`; não criar nem rodar testes.
- Não limpar nem resetar dados. A migration deve preservar dados e parar se o ownership atual for ambíguo.
- Manter a interface no padrão atual do painel e manter employee com as mesmas ações atuais de negócio; somente gestão da equipe será exclusiva de owner.
- Não configurar envio de e-mail. Convites são links de uso único copiados manualmente.

## Sequência de implementação

### 1. Preflight de dados e procedimento operacional

**Arquivos:**

- criar `sql/preflight-platform-access.sql`;
- criar `docs/runbooks/platform-admin-bootstrap.md`;
- criar `docs/runbooks/platform-owner-recovery.md`.

O preflight será somente leitura e listará lojas, quantidade de memberships e candidatos a owner, sem alterar linhas. A migration repetirá as verificações e abortará com os IDs das lojas que não tenham exatamente um membership candidato. Uma loja ambígua não será corrigida automaticamente nem apagada.

O runbook do admin documentará a autorização inicial por e-mail mais hash de um segredo aleatório de uso único, a criação da conta no Supabase Auth e a confirmação de que ela foi registrada como `platform_admin`. O trigger removerá o segredo dos metadados antes de persistir a conta. Também descreverá como adicionar/remover admins manualmente. O runbook de recuperação explicará a intervenção operacional para recuperar conta ou transferir ownership sem permitir autoelevação de employee.

### 2. Migration de autorização, convites e estado da loja

**Arquivo:** criar `supabase/migrations/20261021001600_platform_access_invites.sql` sem reescrever migrations antigas.

Na migration:

1. Fazer preflight transacional e interromper se houver lojas sem exatamente um membership candidato a owner; para dados existentes sem ambiguidade, preencher o papel como `owner`.
2. Adicionar `stores.platform_active`, default `true`, e campos mínimos para registrar quem/quando mudou esse estado. Não reutilizar `archived_at`.
3. Restaurar `store_memberships.role` com `CHECK ('owner', 'employee')`; impor no máximo um membership por usuário e um owner por loja.
4. Criar tabelas privadas para `platform_admins`, autorização única de bootstrap (e-mail mais hash de segredo), convites e onboarding pendente. Revogar acesso direto do cliente e não publicar essas tabelas em Realtime.
5. Criar funções de reserva/consumo/revogação de convites, leitura do destino de login, conclusão do onboarding e operações do painel admin. Cada função terá `search_path` fixo, validação de `auth.uid()` quando chamada com sessão de usuário, grants mínimos e proteção contra concorrência.
6. Trocar os triggers atuais de `auth.users`: aceitar somente bootstrap autorizado ou reserva de convite válida; criar admin, estado pendente de onboarding ou membership employee conforme o convite; rejeitar inserções sem autorização. Criar user preferences não será restaurado, pois a tabela foi removida na migration 014.
7. Remover o provisionamento automático de loja e retirar o gate global por senha/tickets, sem remover usuários, lojas ou dados de negócio existentes.
8. Criar o status inicial de lojas atuais como ativo e proteger a alteração futura para ocorrer somente pelo fluxo de admin.

Os handlers de aplicação não devem confiar em `user_metadata`: o trigger cruzará ID da reserva, e-mail, validade, tipo e estado do convite com a tabela privada. A reserva terá prazo curto e identificador de operação; falhas/timeouts serão idempotentes, com consulta/reconciliação antes de liberar ou repetir a operação.

Atualizar `src/types/database.generated.ts` para refletir colunas, papéis e RPCs públicos usados pelo app. Não expor as tabelas privadas no tipo público se não forem acessíveis via PostgREST.

### 3. Serviço de convites e criação de contas

**Arquivos principais:**

- criar `src/lib/platform-access/invitations.ts` e schemas associados;
- criar handlers separados em `src/app/api/platform-admin/invitations/`, `src/app/api/team/invitations/` e `src/app/api/auth/invitations/accept/`;
- substituir `src/app/api/auth/signup/route.ts` por aceitação de convite;
- atualizar `src/lib/http/security.ts` somente se for necessário para rate limit da aceitação.

Implementar funções compartilhadas para normalizar e-mail, gerar token aleatório de 256 bits, produzir hash SHA-256, formar o link com `PANEL_APP_URL` e não registrar token/senha em logs. O banco persiste somente o hash; o link completo é retornado apenas na criação e mantido na interface até ser copiado/fechado.

O endpoint de criação verifica a sessão atual e a autorização (`platform_admin` para owner; `owner` ativo para employee), cria o convite com expiração de sete dias e devolve link copiável. Revogação e listagem retornam estado, e-mail e validade, nunca o token em claro.

O endpoint de aceitação valida same-origin, tamanho e formato do corpo, token, e-mail e estado do convite; reserva o convite atomicamente; cria o usuário via Supabase Admin apenas no servidor, com e-mail confirmado para permitir o login sem SMTP; depende do trigger para consumir a reserva e vincular o destino; e inicia a sessão com a senha recém-definida. Deve tratar conta Auth já existente, corrida, falha de criação e timeout sem duplicar conta, loja ou membership. Erros de e-mail/convite não devem revelar se um endereço arbitrário já possui conta.

### 4. Login e aposentadoria do cadastro aberto

**Arquivos principais:**

- `src/app/api/auth/login/route.ts`;
- `src/features/auth/components/login-form.tsx`;
- `src/app/(auth)/login/page.tsx` e `src/app/(auth)/cadastro/page.tsx`;
- `src/features/auth/components/signup-form.tsx`;
- `src/app/auth/callback/route.ts`;
- `src/app/api/auth/recover/route.ts`;
- `src/app/api/auth/logout/route.ts`.

Depois do login, resolver o destino no servidor por estado real do banco: admin vai ao painel admin; owner pendente vai à configuração inicial; owner/employee de loja ativa vai ao dashboard; loja inativa recebe a página de estado suspenso; papel incompatível com o host recebe acesso negado. Não ler role, loja ou destino de metadata controlada pelo browser.

Remover a chamada e o formulário de cadastro público e retirar o link “Criar conta” do login. A rota antiga `/cadastro` deverá direcionar para a página explicativa de convite; o endpoint antigo não poderá mais criar conta, mesmo se chamado diretamente. Atualizar callback e recuperação para usar o host canônico correto. Recuperação por e-mail continua dependente da configuração SMTP/Supabase existente.

### 5. Onboarding do owner e criação atômica do pet shop

**Arquivos principais:**

- criar `src/app/(onboarding)/configuracao-inicial/page.tsx`;
- criar componente em `src/features/onboarding/`;
- atualizar `src/features/settings/actions.ts` e extrair schema compartilhado para perfil/endereço;
- reutilizar `src/components/ui/cep-lookup-field.tsx` e componentes do padrão auth/configurações;
- atualizar `src/lib/auth/context.ts` e `src/app/(workspace)/layout.tsx`.

A página só abre para sessão autenticada com `pending_store_setup`. Exigir nome e endereço estruturado (CEP, logradouro, número, bairro, cidade e UF); manter complemento, referência, telefone, e-mail comercial e logo opcionais. ViaCEP segue como preenchimento editável. O RPC de conclusão verifica usuário e ausência de loja, cria loja ativa, membership `owner` e categorias padrão dentro da mesma transação; uma repetição não cria segunda loja.

Upload da logo ocorre depois da criação atômica, reaproveitando validação e Storage existentes. Falha do upload não desfaz o pet shop: mostra orientação para configurar a logo depois. Após concluir, seguir para `/dashboard`; não exigir produtos, serviços ou financeiro.

### 6. Convites de employee e navegação de equipe

**Arquivos principais:**

- criar `src/app/(workspace)/equipe/page.tsx`;
- criar rotas de equipe em `src/app/api/team/invitations/` e a visualização em `src/features/team/components/`;
- atualizar `src/components/layout/workspace-shell.tsx`;
- atualizar `src/lib/auth/context.ts` com papel explícito e guarda de owner.

Owner ativo poderá criar, copiar e revogar convites employee e consultar e-mail/estado/validade. A autorização será repetida no servidor e na função do banco. Employee acessando rota ou action diretamente recebe negação, mesmo sem o item de navegação. Não criar tela de permissões, remoção de colaborador ou alteração de papel nesta entrega.

### 7. Painel admin e roteamento por host

**Arquivos principais:**

- atualizar `src/proxy.ts`;
- criar namespace interno em `src/app/platform-admin/` e componentes em `src/features/platform-admin/`;
- criar handlers em `src/app/api/platform-admin/`;
- atualizar `.env.example` e instruções de configuração.

Definir URLs canônicas separadas, `PANEL_APP_URL` e `ADMIN_APP_URL`. No proxy, comparar host recebido com hostnames dessas configurações e reescrever as rotas externas do host admin para o namespace interno de admin; impedir acesso a esse namespace pelo host do painel. Preservar o caminho externo simples (`admin.dominio/login`, `admin.dominio/`) e não usar hostname como autorização. Ler as convenções atuais de `proxy` nas docs locais de Next 16.4.2 antes da edição.

O painel admin terá login separado por host, lista de lojas/owners/estado, criação e revogação de convites owner e ação reversível ativar/desativar. Todas as ações verificam `platform_admins` no servidor/banco. Sessões são host-only; a conta admin não recebe membership de loja. Criar links sempre a partir de `PANEL_APP_URL`, nunca de `Host` não validado.

Adicionar a `src/components/layout/workspace-shell.tsx` o acesso à equipe sem mudar o padrão visual existente. Painel admin usa tokens, botões, campos e estados vazios/erro/carregamento já usados pelo projeto.

### 8. Aplicação do status ativo em todas as camadas

**Arquivos principais:**

- `src/lib/auth/context.ts`, `src/proxy.ts`, layouts/pages protegidos e rota autenticada de logo;
- nova migration, cobrindo `private.is_store_member`, `private.is_store_owner` e `private.assert_member`;
- políticas RLS e RPCs de `supabase/migrations/20261021000200_rls_realtime_storage.sql` e migrations de operações subsequentes;
- `src/app/(workspace)/layout.tsx` e `src/app/(workspace)/configuracoes/page.tsx`.

Atualizar helpers centrais para exigir membership ativo e loja `platform_active`, e auditar todas as policies e RPCs de negócio para garantir que não haja caminho que ignore o helper. Stores, relatórios/exportações, actions, Storage e funções de transação devem negar operações para loja inativa. A ativação/desativação será uma operação autorizada somente para platform admin e registrará ator/horário; não modifica membership nem dados da loja.

Employees devem manter o acesso atual de negócio, inclusive as operações de logo atualmente permitidas ao membro. Restringir por papel somente a gestão de equipe e o que o escopo define explicitamente como owner-only.

Remover os usos de `createSignedUrl` para logos privadas do tenant e servi-las por endpoint autenticado que revalida acesso e estado da loja a cada requisição.

### 9. Tipos, configuração e retirada do procedimento antigo

**Arquivos:**

- `src/types/database.generated.ts`;
- `.env.example`;
- `sql/alterar-senha-cadastro.sql`;
- documentação operacional dos dois runbooks.

Documentar `PANEL_APP_URL`/`ADMIN_APP_URL`, configuração de hosts locais, URLs permitidas de callback no Supabase e bootstrap do primeiro admin sem gravar e-mail pessoal, senha ou segredo no repositório. Substituir `sql/alterar-senha-cadastro.sql` pelo procedimento de bootstrap, para não sobrar instrução de senha global. Não alterar `.env.local` nem expor seus valores.

### 10. Revisão estática final

Fazer leitura final dos fluxos de login, aceitação owner/employee, onboarding pendente, criação de loja, autorização de equipe, painel admin, status inativo, triggers, grants, RLS, Storage, callbacks e links assinados. Confirmar que a migration não remove linhas e que nenhuma rota pública antiga cria usuário. Esta revisão não executará comandos proibidos nem testes; não declarar validação dinâmica.

## Dependências e ordem de implantação

1. Executar o preflight somente leitura e resolver qualquer membership ambíguo antes de aplicar migration.
2. Configurar as URLs canônicas e callbacks no ambiente/Supabase; criar bootstrap do admin antes de inserir sua conta no Supabase Auth.
3. Aplicar migration e publicar o app em sequência coordenada, pois a troca do trigger encerra o signup antigo. Login das contas existentes e dados de negócio devem permanecer preservados.

Não haverá etapa de testes ou verificação dinâmica neste plano. A revisão final é somente estática, conforme as instruções do projeto.

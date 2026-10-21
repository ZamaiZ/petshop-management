# Petshop — Plano de implementação

> **Para quem implementar:** seguir as etapas na ordem deste documento usando `superpowers:executing-plans`.

**Objetivo:** transformar o projeto Next.js existente em um sistema de gestão para pet shop que siga as telas de referência e use o Supabase como fonte de verdade.

**Arquitetura:** manter o App Router e os componentes shadcn/Base UI já presentes. Separar shell, módulos de domínio, acesso a dados e regras transacionais; consultas protegidas usam Supabase SSR e as mutações financeiras/estoque usam RPCs atômicas com RLS no banco.

**Stack:** Next.js 16.4.2, React 19.3, TypeScript, Tailwind 4, componentes shadcn locais sobre Base UI, React Hook Form, Zod, TanStack Table, Recharts, React Icons e Supabase. Motion e uma biblioteca de arraste ainda precisam ser adicionados; confirmar versões compatíveis no início da implementação.

**Especificação:** `petshop-implementation/spec.md`, com evidências em `petshop-implementation/screenshots/`, `petshop-implementation/reference-site/`, `petshop-implementation/supabase/`, `petshop-implementation/sql/` e `petshop-implementation/docs/`.

## Restrições globais

- Preservar Next.js 16, React 19 e o lockfile pnpm existente.
- Usar os componentes shadcn locais em toda nova interface; adaptar suas variantes e tokens para as capturas, sem trocar a biblioteca visual.
- Não usar os dados ou regras persistidos em `localStorage` pelo site estático como dados de produção.
- Dinheiro fica em centavos inteiros no banco; quantidade usa precisão explícita; estoque é derivado do ledger.
- Cada consulta e mutação deve validar vínculo com a loja. Operações compostas ficam em uma RPC única e mantêm RLS.
- Não incluir emissão fiscal, integração com SEFAZ, cobrança Pix/cartão ou mensagens de WhatsApp.
- As instruções do projeto proíbem executar `git`, `typecheck`, `build`, `lint` e `test`; não executar testes. A revisão final deste escopo fica limitada à inspeção de código/SQL e à conferência visual manual autorizada.

## Estado encontrado

- `src/app/page.tsx` e `src/app/layout.tsx` ainda são o starter do Next, com metadados em inglês; não há rotas de produto, domínio, autenticação ou integração Supabase.
- `src/app/globals.css` já tem tokens shadcn claros/escuros, Tailwind 4 e Inter, mas ainda mantém valores do starter. O token escuro da sidebar usa azul, divergindo do padrão monocromático da referência.
- Há mais de 50 componentes locais em `src/components/ui/`, incluindo Button, Sidebar, Sheet, Dialog, Tooltip, Combobox, Calendar, Skeleton, Toast e Table. São wrappers de Base UI e devem ser preservados. `Table` é só a primitiva visual; `@tanstack/react-table` já está instalado para a Data Table.
- Já estão instalados React Hook Form, Zod, Recharts e React Icons. `@supabase/supabase-js`, `@supabase/ssr`, Motion e DnD não aparecem no `package.json`.
- `petshop-implementation/` contém 21 capturas, uma galeria e uma referência navegável. O JavaScript da referência usa dados de demonstração e `localStorage`; cadastro, pagamentos, estoque e mudanças de status são simulações locais.
- As cinco migrations modelam as entidades principais, RLS, Realtime, Storage privado, gate de cadastro e operações iniciais. Elas estão dentro do pacote de evidências, não em `supabase/migrations/` na raiz do app; não há `supabase/config.toml`, tipos gerados ou variáveis de ambiente na raiz.
- `petshop-implementation/docs/validation.md` relata parsing PostgreSQL e um harness PGlite para alguns fluxos. O próprio relatório limita essa evidência: não valida o Supabase hospedado, Auth real, concorrência, Storage, Realtime ou todos os contratos do spec. Não reexecutei esse harness por causa da regra do projeto.
- Informação do usuário: o projeto Supabase remoto existe, mas está vazio; a única função preexistente é `rls_auto_enable`. Ela ativa RLS em tabelas novas no schema `public`, mas não cria policies ou grants. Confirmar no catálogo se há um event trigger ativo associado à função antes das migrations; a função isolada não dispara sozinha.
- Decisões do usuário: a agenda oferece horários em intervalos de 30 minutos, sem dois atendimentos no mesmo horário; contagens de produtos com validade serão feitas por lote. O modelo de profissionais fica fora do escopo inicial.

## Lacunas e riscos que alteram a implementação

1. O spec pede uma contagem de estoque atômica, FEFO entre lotes, conversão de pacote fechado para granel, vínculo de banho/tosa com uma venda, reagendamento versionado, cancelamento e devolução com rateio e trilha de auditoria. As migrations atuais não fornecem essas operações.
2. Os RPCs usam chaves de idempotência, mas não comparam a impressão digital do payload; uma mesma chave com dados diferentes pode devolver o resultado anterior. `close_cash` também não tem chave de idempotência, então uma repetição depois de um fechamento confirmado falha em vez de recuperar o resultado.
3. `complete_sale` exige um caixa aberto antes de verificar os pagamentos. Isso bloqueia também vendas integralmente por Pix/cartão sem caixa aberto; o spec só exige caixa para movimentações em dinheiro. Confirmar a regra antes de corrigir.
4. `move_delivery` aceita o status recebido sem validar a sequência permitida. `set_appointment_status` aceita qualquer status da constraint, sem validar transições ou exigir motivo para cancelar/falta. Completar validações e auditoria no banco.
5. Os códigos de barras são únicos dentro de cada tabela, mas não há garantia de unicidade entre `products` e `product_packagings`.
6. `inventory_count_items` guarda saldo agregado por produto, sem lote. Como as contagens serão por lote, a migration complementar precisa incluir lote nas linhas, preservar a versão agregada para detectar movimentações concorrentes e só então aplicar ajustes.
7. A agenda não precisa de profissionais no escopo inicial. Os intervalos disponíveis começam a cada 30 minutos; o RPC deve impedir sobreposição conforme a duração do serviço para que dois atendimentos não fiquem ativos ao mesmo tempo.
8. Regra de caixa confirmada: Pix/cartão não dependem do saldo físico; dinheiro exige sessão aberta; com saldo zero, só aceitar pagamento exato; troco exige saldo físico suficiente. O spec pede validação de segurança, concorrência, dinheiro, RLS e visual como critérios de aceite, mas as regras locais proíbem testes e também build/lint/typecheck; sem outra forma permitida de validação, não será possível declarar esses critérios verificados.

## Arquitetura de arquivos proposta

```text
src/app/
  layout.tsx, globals.css
  (auth)/login/page.tsx
  (auth)/cadastro/page.tsx
  (auth)/recuperar-senha/page.tsx
  (auth)/redefinir-senha/page.tsx
  (workspace)/layout.tsx
  (workspace)/dashboard/page.tsx
  (workspace)/vendas/page.tsx
  (workspace)/vendas/nova/page.tsx
  (workspace)/estoque/page.tsx
  (workspace)/agenda/page.tsx
  (workspace)/entregas/page.tsx
  (workspace)/clientes/page.tsx
  (workspace)/financeiro/page.tsx
  (workspace)/configuracoes/page.tsx
src/components/layout/       # shell, header, sidebar, conta e providers
src/components/data-table/   # tabela TanStack e toolbar reutilizáveis
src/features/<dominio>/      # components, schemas, queries, actions, repository
src/lib/supabase/            # browser, server, admin server-only
src/lib/                     # dinheiro, quantidade, data, erros, idempotência
src/proxy.ts                 # atualização de cookies conforme Next 16/Supabase SSR
src/types/database.generated.ts
supabase/config.toml
supabase/migrations/         # cópias operacionais + migrations incrementais
.env.example
```

As páginas de domínio ficam como Server Components sempre que possível. Componentes client ficam restritos a interação, formulários e Realtime. Uma DAL server-only verifica sessão e vínculo perto de cada fonte de dados e ação; `proxy.ts` trata atualização de sessão/cookies, não substitui essa autorização. A loja autenticada alimenta o shell e não é um texto fixo do mockup.

## Foco da revisão final

- Troca de IDs entre lojas, inclusive em RPC, Storage e canal Realtime.
- Repetição de uma mutação após timeout e reutilização da mesma chave com payload diferente.
- Venda da última unidade concorrendo com outra venda ou com fechamento do caixa.
- Quantidade pesada, desconto em centavos, troco, lote vencido e datas no timezone da loja.
- Uso por teclado/móvel, foco em diálogos, filtros de tabela, skeleton, vazio e erro recuperável.

Esses pontos serão inspecionados nos contratos SQL e percorridos manualmente na interface. Não haverá execução de testes automatizados conforme a instrução local.

## Etapas

### Etapa 1 — fechar as decisões de dados e criar a base Supabase

**Arquivos:** criar `supabase/config.toml`, `.env.example`, `supabase/migrations/` e `src/types/database.generated.ts`. Como o projeto Supabase existente está vazio, usar as cinco migrations entregues como base operacional sem alterar as evidências, após conferir o event trigger `rls_auto_enable` e confirmar que a função está no schema esperado. Não criar uma segunda trigger com o mesmo objetivo.

- Confirmado que o Supabase existe e está vazio. Antes de aplicar a base, verificar `pg_event_trigger` para saber se `rls_auto_enable` está associado/ativo; a migration 002 também habilita RLS explicitamente. Usar staging/local para a integração inicial e não publicar migrations sem identificar o alvo.
- Revisar e complementar os RPCs em migrations novas: validação de transição de status, vínculo de agendamento, gestão dos lotes FEFO, contagem de inventário, conversão para granel, cancelamento/devolução e idempotência com fingerprint.
- Garantir grants, RLS, FKs compostas, Realtime e índices para toda tabela nova. Criar rastreabilidade de reembolso/alocação e eventos de auditoria sem apagar pagamentos originais.
- Corrigir a unicidade de barcode entre produto e embalagem, com proteção de concorrência no banco.
- Gerar os tipos somente depois do schema final. Não colocar chave secreta nos arquivos públicos nem no bundle.

**Resultado verificável:** migrations operacionais versionadas na raiz, contratos transacionais fechados e tipos coerentes com o schema. Nenhuma migration remota é aplicada sem identificar o banco alvo e o estado existente.

### Etapa 2 — clientes Supabase, sessão e autenticação

**Arquivos:** `src/lib/supabase/{browser,server,admin}.ts`, `src/lib/auth/verify-session.ts`, `src/proxy.ts`, `src/features/auth/{schemas,actions,repository}.ts`, rotas em `src/app/(auth)/` e ajustes em `src/app/layout.tsx`.

- Adicionar `@supabase/supabase-js` e `@supabase/ssr`; manter o cliente admin server-only com a chave secreta.
- Implementar login, logout, cadastro com senha pessoal e gate de autorização, recuperação e redefinição. O Route Handler/ação valida origem, tamanho, rate limit por e-mail/IP confiável e payload antes do Admin API.
- Seguir os guias instalados em `node_modules/next/dist/docs/` para Next 16: `authentication.md`, `16-proxy.md`, `15-route-handlers.md` e `cookies.md`. Fazer verificação de autorização na DAL e nas RPCs, além do proxy.
- Manter mensagens genéricas de recuperação e nunca registrar senha, ticket, cookie ou chave.

**Resultado verificável:** as rotas de autenticação substituem o mock e o usuário autorizado chega ao workspace com sessão SSR.

### Etapa 3 — shell, tokens e fidelidade visual

**Arquivos:** `src/app/layout.tsx`, `src/app/globals.css`, `src/app/(workspace)/layout.tsx`, `src/components/layout/*`, provider de tema e `loading.tsx` das rotas.

- Corrigir idioma, título, descrição e fontes; retirar a composição de fontes duplicada do starter e alinhar tokens claros/escuros à referência.
- Compor Sidebar, Sheet, TooltipProvider, DropdownMenu, Breadcrumb e Button locais. Ajustar a sidebar aos 224/74 px, header de 72 px, espaçamento, raio e densidade das capturas. Implementar nome/logo dinâmicos da loja.
- Persistir preferências de tema e sidebar em `user_preferences`, respeitar sistema, Ctrl+B, Ctrl+Alt+T e hidratação sem flash. O estado de tema e sidebar não vai para `localStorage`.
- Adicionar Motion com `prefers-reduced-motion`; skeletons próprios por página e aba, estados de vazio/erro e foco acessível. Criar layouts responsivos sem overflow horizontal global.

**Resultado verificável:** shell, tema claro/escuro, sidebar e autenticação visualmente alinhados às capturas de referência.

### Etapa 4 — cadastros, clientes e estoque

**Arquivos:** `src/features/catalog/*`, `src/features/customers/*`, `src/features/inventory/*`, `src/app/(workspace)/estoque/page.tsx`, `clientes/page.tsx`, além de diálogos de recebimento e contagem.

- Implementar cadastros de categorias, produtos, embalagens, fornecedores e serviços com arquivamento; clientes com endereços e vários pets.
- Criar Data Tables TanStack com filtros/paginação server-side, toolbar e ações usando primitivas shadcn.
- Implementar consulta de barcode sem remover zeros iniciais, recebimento multi-item, lotes/validade, ledger, ajuste auditável, contagem versionada e conversão para granel.
- Aplicar FEFO no servidor e bloquear lotes vencidos. Fazer contagem por lote para produtos rastreados e agregada para produtos sem lote; guardar a versão do saldo para detectar mudanças durante a contagem.

**Resultado verificável:** cadastro, recebimento, ajuste e contagem persistem por RPC/queries do tenant e atualizam saldo pelo ledger.

### Etapa 5 — PDV, vendas e financeiro

**Arquivos:** `src/features/sales/*`, `src/features/finance/*`, `src/app/(workspace)/vendas/*` e `financeiro/page.tsx`.

- Criar busca/Combobox de produto e cliente, suporte a scanner HID, carrinho, peso, serviços, desconto, taxa de entrega, pagamento dividido, troco e fiado.
- Enviar somente IDs, quantidades e escolhas explícitas ao RPC. O banco calcula preço, total, estoque, pagamentos, recebível e delivery atomicamente; preservar carrinho até confirmação.
- Implementar caixa, contagem por denominações, diferença auditável, reforço/retirada, recebimentos parciais, contas a pagar e despesas com pagamentos parciais. Regra confirmada: dinheiro exige sessão aberta; com saldo físico zero, aceitar somente valor exato; exigir saldo suficiente para dar troco. Pix/cartão independem do saldo físico e não alteram o caixa.
- Construir detalhes de venda e ações de cancelamento/devolução somente após as RPCs estarem disponíveis; calcular rateio de desconto em centavos e manter eventos imutáveis.

**Resultado verificável:** fluxos financeiros usam uma transação por operação e representam separado valor vendido, recebido, pendente e dinheiro físico.

### Etapa 6 — agenda e entregas

**Arquivos:** `src/features/appointments/*`, `src/features/deliveries/*`, `src/app/(workspace)/agenda/page.tsx`, `entregas/page.tsx`.

- Fazer calendário navegável por data real/timezone da loja, lista de atendimentos, tutor/pet/serviço, edição e reagendamento versionado.
- Vincular serviço a uma venda uma única vez; registrar faltas/cancelamentos com motivo e controlar conflitos pelo modelo de capacidade decidido.
- Fazer Kanban nas quatro etapas, usando uma biblioteca DnD compatível com React instalado, DragOverlay e alternativa por teclado/menu. Atualizar com versão esperada e rollback em conflito.
- Manter pagamento independente do status da entrega e registrar recebimento na entrega sobre o mesmo saldo da venda.

**Resultado verificável:** agenda e Kanban refletem estados persistidos, conflitos e pagamento sem simulações locais.

### Etapa 7 — dashboard, configurações, Storage e Realtime

**Arquivos:** `src/features/dashboard/*`, `src/features/settings/*`, `src/components/providers/realtime-provider.tsx`, `src/app/(workspace)/dashboard/page.tsx`, `configuracoes/page.tsx`, endpoints de exportação.

- Criar agregações server-side para as quatro métricas, gráfico, pendências e vendas recentes, respeitando timezone e definições do spec.
- Implementar perfil da loja, upload privado de logo com validação de arquivo, troca atômica de referência e limpeza de órfãos; manter o arquivo anterior em caso de falha.
- Exportar períodos completos em CSV UTF-8 com mitigação de formula injection.
- Manter um canal Realtime por sessão/loja, invalidar somente consultas afetadas, reconciliar após reconexão e limpar dados/canais no logout.

**Resultado verificável:** números deixam de ser dados de demonstração e mudanças da loja aparecem sem vazamento entre tenants.

### Etapa 8 — reconciliação visual e revisão operacional

- Percorrer as 21 capturas e os estados da galeria lado a lado com cada rota real; corrigir hierarquia, espaçamento, ícones, alinhamentos, densidade e temas.
- Conferir manualmente foco/teclado, tooltips, diálogos, tabelas, loading, erro, vazio e viewport móvel.
- Revisar policies/grants, funções `SECURITY DEFINER`, variáveis e caminhos de Storage; consultar `sql/verificar-seguranca.sql` no ambiente identificado.
- Registrar no plano quais critérios não foram exercitados. Como a regra local proíbe testes e comandos de verificação automatizada, não declarar segurança, concorrência ou critério de aceite verificado com base apenas em parsing ou aparência.

## Ponto para fechar antes do fluxo de caixa

- Regra confirmada: Pix/cartão independem do saldo físico; pagamento em espécie exige sessão aberta; com saldo zero, só aceitar valor exato; para dar troco, o saldo físico precisa cobrir a devolução. A entrada no caixa continua sendo o valor líquido da venda.


# Petshop — especificação de implementação

**Versão:** 1.0 · 20/10/2026 · Português do Brasil  
**Destino:** Codex, trabalhando no projeto Next.js existente do usuário.  
**Referência visual aprovada:** https://petshop-studio-zamai.nimblemole5.chatgpt.site  
**Artefatos locais:** `reference-site/`, `screenshots/`, `supabase/migrations/`, `sql/`, `docs/`.

## 1. Instrução obrigatória antes de alterar código

**Antes de criar, substituir, mover, remover ou refatorar arquivos, revisar completamente o projeto Next.js atual e planejar a implementação.** Não começar um projeto novo por cima do existente. Não copiar a arquitetura do JavaScript estático da referência para a aplicação real.

1. Ler `AGENTS.md`, documentação, instruções locais e scripts do repositório. Identificar o package manager pelo lockfile; não gerar um segundo lockfile.
2. Inventariar `app/` ou `src/app/`, layouts, rotas, providers, componentes, hooks, serviços, estilos, fontes, tokens, aliases, bibliotecas de ícones, estado, validação, tabelas e formulários.
3. Ler `package.json`, `components.json`, configurações de TypeScript, Next, Tailwind, lint, testes, Supabase e variáveis de ambiente **sem imprimir valores secretos**.
4. Revisar todos os componentes shadcn já instalados, suas variantes e dependências. Descobrir como o projeto implementa Combobox, Command, Popover, Tooltip, Sidebar, Dialog, Sheet, Skeleton, Button, Form, Calendar e Data Table.
5. Verificar páginas e integrações já prontas. Reaproveitar o que estiver correto, preservando o trabalho atual e alterações não commitadas. Não fazer `reset --hard`, limpar diretórios ou substituir estilos globais indiscriminadamente.
6. Conferir o esquema remoto/local e o histórico de migrations antes de aplicar os SQLs deste pacote. Nunca reaplicar uma inicialização sobre tabelas de produção existentes. Havendo esquema prévio, produzir migrations incrementais de adaptação com preservação dos dados.
7. Examinar a referência e os prints; comparar página por página, temas, espaçamentos, estados e fluxos. Documentar divergências encontradas no projeto atual.
8. Escrever `IMPLEMENTATION_PLAN.md` com inventário, arquitetura encontrada, componentes reutilizados, arquivos afetados, modelo de dados, ordem das migrations, contratos transacionais e critérios de verificação. Prosseguir com o plano dentro do escopo autorizado; perguntar apenas se existir impedimento real ou escolha de negócio não definida.
9. Implementar por etapas, validar e atualizar o plano. Não declarar funcionalidades completas quando existirem botões sem ação, dados fictícios, políticas ausentes ou transações fragmentadas.

## 2. Objetivo e limites

Sistema para a rotina de um pet shop: vender, receber mercadorias, controlar estoque e ração a granel, atender banho e tosa, organizar entregas, acompanhar fiado e fechar caixa. Uma conta por pet shop nesta versão; sem administração de equipe na interface. Cada usuário possui identidade no Auth; o esquema de vínculo com a loja prepara o isolamento e futura evolução sem expor gerenciamento de equipe agora.

O sistema fiscal/contábil atual continua. Exportar dados operacionais para o contador; **não prometer emissão fiscal, integração com SEFAZ, cobrança automática de Pix ou integração com maquininha**. Registrar o meio de pagamento é diferente de efetuar uma cobrança. Não integrar WhatsApp/envio de mensagens nesta entrega sem novo escopo.

A referência estática valida design e navegação. Seus dados locais não são fonte de verdade financeira e seus atalhos de lógica **não podem ser copiados como regras de produção**. O destino é uma aplicação Next tipada, ligada ao Supabase, com transações verificadas. Não utilizar `localStorage` para vendas, estoque, saldos, autenticação ou credenciais; apenas preferências não sensíveis e rascunho estritamente necessário.

## 3. Stack e organização

- Preservar as versões e o roteamento encontrados no projeto. Next.js App Router, React e TypeScript estrito como base esperada; adaptar nomes/pastas ao existente.
- Tailwind e tokens shadcn existentes. Reutilizar `cn`, variantes de Button e primitivas do projeto.
- **Usar os componentes shadcn já instalados para toda nova página e componente de interface.** Não substituir por selects nativos, tooltips via `title`, modais manuais ou uma biblioteca visual concorrente.
- Combobox: composição já instalada de Popover + Command ou o Combobox fornecido pela versão local do shadcn; busca, teclado, indicação do selecionado e foco corretos.
- Data Table: padrão shadcn com a infraestrutura TanStack Table existente; sorting, filtros, paginação, visibilidade quando útil e ações por linha. Não confundir o componente `Table` sem estado com uma Data Table completa.
- TooltipProvider compartilhado; Tooltip em todos os ícones sem texto e nos itens da sidebar recolhida. Dialog, AlertDialog, Sheet, DropdownMenu, Tabs, Calendar, Skeleton, Badge, Input, Label, Textarea, Separator e toast/Sonner conforme o projeto.
- **Motion** (`motion/react`) para entrada de páginas, transições, indicador ativo e drag overlay quando útil; respeitar `prefers-reduced-motion`. Não instalar simultaneamente Motion e outra versão de Framer Motion sem necessidade.
- `@supabase/supabase-js` e `@supabase/ssr`; clients separados para navegador, servidor com sessão e administração server-only. Integrar cookies/refresh usando o mecanismo adequado à versão instalada do Next.
- Preferir estado local e caches de servidor já adotados. Não introduzir Zustand. Redux Toolkit só se já existir ou uma necessidade compartilhada justificar; não usar store global para estado de cada campo.
- Validação Zod e formulários compatíveis com shadcn/React Hook Form, se já presentes. Gerar tipos do banco após migrations, sem tipos `any` para respostas do Supabase.

### 3.1 Limites de responsabilidade

Páginas compõem a tela e carregam dados; componentes exibem e disparam eventos; hooks gerenciam estado de interface; serviços/actions validam casos de uso; repositórios consultam o banco; RPCs garantem transações e invariantes.

Estrutura sugerida, a adaptar após inspeção:

```text
src/app/(auth)/login, cadastro, recuperar-senha, redefinir-senha
src/app/(workspace)/layout.tsx
src/app/(workspace)/dashboard, vendas, vendas/nova, estoque, agenda,
  entregas, clientes, financeiro, configuracoes
src/components/ui/                 # shadcn existente
src/components/layout/             # shell, sidebar, header, theme menu
src/features/<dominio>/components/ # lista, form, dialog e skeleton separados
src/features/<dominio>/schemas.ts
src/features/<dominio>/queries.ts
src/features/<dominio>/actions.ts
src/features/<dominio>/repository.ts
src/lib/supabase/{browser,server,admin}.ts
src/lib/{money,quantity,date,errors,idempotency}.ts
src/types/database.generated.ts
supabase/migrations/
supabase/tests/
```

Poucas responsabilidades por arquivo; separar formulário, lista e caso de uso. Evitar páginas com centenas de linhas de SQL, JSX e regras financeiras misturados. Extrair duplicação real (dinheiro, quantidade, endereços, loading, erros), sem criar abstrações genéricas antes de existir repetição. DRY e SOLID são critérios de organização, não justificativa para camadas vazias.

## 4. Contrato visual

**Seguir exatamente o padrão de design do site de referência e dos prints.** Não fazer redesign, inventar cores primárias verdes, adicionar gradientes decorativos, blocos promocionais, emojis ou textos de autopromoção. Apenas títulos, valores, instruções úteis e identificação de estados.

- Superfícies claras/brancas; fundo suave; primary preto no tema claro. Tema escuro com contraste equivalente e primary claro, usando tokens semânticos.
- Referência desktop: sidebar 224 px aberta e 74 px recolhida, header 72 px, conteúdo com padding 32 × 34 px, cards com raio aproximadamente 10–12 px, botões com raio 7–8 px, borda sutil, sombra quase imperceptível. Usar os tokens do projeto para obter a mesma aparência.
- Inter ou a mesma fonte efetivamente usada na referência, com fallback consistente. Corpo 12–13 px, títulos 22–25 px, números 24–28 px, rótulos legíveis. Não reduzir texto a ponto de comprometer acessibilidade.
- Ícones consistentes da biblioteca já instalada. Não misturar famílias por tela.
- Status podem usar verde/âmbar/vermelho discretos; isso não altera o preto como cor principal. Nenhum significado depende só da cor.
- Alinhamento, hierarquia, densidade, largura de campos, espaçamento e disposição das tabelas devem coincidir com os prints. Formulários longos em Dialog/Sheet com scroll interno e ações acessíveis.
- BRL em `pt-BR`; números decimais com vírgula na exibição, aceitando entrada normalizada. Nunca concatenar strings monetárias para calcular.
- Datas exibidas em `America/Sao_Paulo` ou timezone da loja; `timestamptz` no banco, datas civis como `date`. O dia operacional vem da timezone, não de data fixa do mockup.
- Mobile: sidebar em Sheet, cards 2 por linha quando couberem, Data Table com colunas prioritárias e scroll horizontal contido; venda e resumo empilhados; Kanban com colunas roláveis e alternativa acessível ao arraste. Nada deve provocar overflow da página inteira.

### 4.1 Sidebar e header

- Sem seletor de loja na sidebar. Sem textos promocionais, configurações, tema ou sair no rodapé da sidebar.
- Nome da loja autenticada ao lado da logo; fallback de ícone quando não houver logo; ocultar nome ao recolher. Não usar o texto fixo “petshop” como marca da loja autenticada.
- Botão circular no topo, centralizado sobre a borda direita da sidebar. Chevron com rotação de 180° ao alterar o estado. Animação de largura e conteúdo em 200–250 ms, sem salto do layout.
- **Ctrl B** alterna aberta/recolhida; impedir ação padrão do navegador quando o atalho for tratado. Tooltip nos itens recolhidos, acessível por hover e foco. Estado persistido sem flash no primeiro render.
- Menu da conta no header contém configurações, temas Sistema/Claro/Escuro e Sair. **Ctrl Alt T** alterna Sistema → Claro → Escuro → Sistema. Seguir mudanças do SO quando em Sistema; evitar flash incorreto na hidratação.
- Item de página ativo e pendente claramente identificado; na navegação pendente, aplicar blur animado sutil ao indicador/label ativo, mantendo foco e área clicável estáveis.

## 5. Loading, skeletons e Motion

Tudo que faz I/O deve ter estado explícito: inicial, carregando, sucesso, vazio, erro e revalidação quando aplicável. Todo submit deve ter `isPending`, prevenção de duplicação, `aria-busy`, rótulo contextual e erros preservando campos. Não travar a aplicação inteira por uma mutação local.

Implementar `loading.tsx` por segmento, Suspense em blocos independentes e skeletons específicos. **Não usar apenas um spinner central ou um skeleton genérico de tela inteira para todas as páginas.** Skeleton preserva geometria, altura aproximada, colunas, cards, toolbar e linhas reais, evitando layout shift.

| Tela/área | Skeleton obrigatório |
| --- | --- |
| Dashboard | Cabeçalho, 4 cards de métricas, faixa de ações, gráfico, pendências e linhas de vendas |
| Vendas | 4 métricas, busca/filtros, cabeçalho e linhas da Data Table |
| Nova venda | Busca/categorias, grid de produtos, cliente, resumo e total |
| Estoque | Métricas, tabs, toolbar e linhas; variantes de movimentações e contagem |
| Agenda | Calendário e lista de horários com avatar, serviço, status e ação |
| Entregas | Cabeçalhos das 4 colunas e cards com medidas dos cards reais |
| Clientes | Busca, avatar/nome, contato, pets, saldo e ação por linha |
| Financeiro | Métricas, tabs, resumo de caixa; variantes de pagar e receber |
| Configurações | Logo, labels e campos com larguras corretas |
| Dialog/Sheet | Skeleton dos dados do detalhe; ação de confirmação bloqueada até carregar |
| Auth | Submit pendente e validação; sem skeleton artificial para campos que já estão disponíveis |
| Combobox | Busca com debounce/cancelamento, opções em loading, vazio e erro; manter seleção |
| Logo | Placeholder na proporção final, progresso e retry no upload |

**Transições:** wrapper de página em Motion com `initial` opacity reduzida, `y: 6–8` e blur de aproximadamente 5 px, terminando em opacity 1, y 0 e blur 0 em 200–280 ms. Ao trocar rota, manter shell/header, animar blur no corpo enquanto a página real carrega e exibir seu skeleton compatível. Remover blur assim que os dados necessários resolverem; não usar temporizadores artificiais de 320 ms em produção. Não cobrir conteúdo sensível anterior de outra loja com apenas blur: limpar cache e desmontar imediatamente em logout/troca de identidade.

Com reduced motion: sem blur oscilante, shimmer intenso ou deslocamento; manter loading legível. Não animar novamente todo o formulário a cada tecla ou todo o dashboard em cada evento Realtime. Navegação com erro termina em estado recuperável; o item da sidebar não fica “carregando” para sempre.

## 6. Autenticação e autorização de cadastro

### 6.1 Experiência

Cadastro pede **nome do pet shop, e-mail, senha pessoal e senha de autorização**. As duas senhas são digitadas normalmente; inputs `type=password` com mostrar/ocultar. “Plain text” significa que a pessoa informa a senha original e o servidor faz a verificação; **não fazer hash no navegador nem exigir que a pessoa digite um hash**. Enviar somente por HTTPS, em corpo POST, nunca em URL.

Login usa e-mail e senha pessoal. Confirmação de e-mail já está desativada no Supabase por escolha do usuário; não implementar uma etapa de confirmação. Recuperar senha envia instruções com resposta genérica; implementar callback seguro e página de redefinição, com redirect allowlist. Não gravar senha pessoal em tabela própria: Supabase Auth é o único responsável por ela.

### 6.2 Senha de autorização e bloqueio de bypass

A migration `20261021000300_signup_gate.sql` cria:

- `private.signup_authorization`: singleton com hash bcrypt e versão da senha, nunca plaintext.
- `private.registration_tickets`: hash de token aleatório, e-mail vinculado, nome da loja, versão e TTL de 2 minutos, uso único.
- `private.signup_rate_limits`: janela de tentativas por chave de rate limit gerada pelo servidor.
- `private.set_signup_password(text)`: gera salt + bcrypt; só administrador do banco executa.
- `public.issue_registration_ticket(...)`: **EXECUTE apenas para `service_role`**, não para `anon` ou `authenticated`.
- Trigger `BEFORE INSERT ON auth.users` que exige ticket válido, o consome em transação e remove o token do metadata antes de salvar.
- Trigger `AFTER INSERT ON auth.users` que cria loja, vínculo de owner e preferências na mesma transação do usuário.

Fluxo do Route Handler/Server Action de cadastro:

1. Validar payload, Origin/CSRF e limites de tamanho. Não logar corpo nem senhas. Aplicar rate limit na borda e por e-mail normalizado, além do limite SQL. IP somente do proxy confiável; não confiar em header arbitrário.
2. Gerar `p_rate_key = HMAC-SHA256(serverRateLimitSecret, trustedClientIp)`; nunca passar IP bruto ou valor escolhido pelo navegador. A chave de HMAC é server-only.
3. Usar client admin server-only para chamar `issue_registration_ticket(authorizationPassword,email,storeName,rateKey)`. Ticket nulo resulta em erro genérico e nenhuma criação.
4. Chamar `supabaseAdmin.auth.admin.createUser({ email, password: accountPassword, email_confirm: true, user_metadata: { registration_ticket: ticket } })`.
5. A trigger de banco impede o cadastro direto por `auth.signUp` sem ticket e faz provisionamento atômico. Se qualquer criação de loja/vínculo falhar, o insert Auth falha inteiro; não liberar sessão de usuário órfão.
6. Fazer `signInWithPassword` pelo client SSR de sessão e emitir cookies. Redirecionar ao dashboard; não devolver ticket ou chave administrativa ao navegador.
7. Se criar usuário tiver sucesso e o login falhar por rede, oferecer entrar normalmente. Não repetir criação com novo usuário. Ticket de outra versão, expirado, reutilizado ou de outro e-mail é inválido.

A senha de autorização **não é a senha de login**. Rotacioná-la não altera contas existentes. A função aceita de 16 a 72 bytes UTF-8 por limite do bcrypt; impedir truncamento silencioso. O SQL não contém senha padrão: falha fechado até a configuração manual.

**SQL separado obrigatório:** `sql/alterar-senha-cadastro.sql`. Trocar o placeholder e executar como `postgres` após migrations, sem colocar a senha real no git. Isso cria/rotaciona o hash e invalida tickets não usados. Não oferecer RPC pública de alterar essa senha. Não expor o hash em configurações, logs ou Realtime. Não desativar a trigger de gate para “resolver” erros de cadastro.

As triggers Auth impactam todos os novos usuários, inclusive convites e novos providers. Nesta versão, somente cadastro e-mail/senha autorizado. Ao encontrar outros fluxos existentes, adaptar conscientemente antes de instalar as triggers; nunca quebrá-los silenciosamente. Não criar ou alterar manualmente colunas internas de `auth.users`; usar Admin API para criar contas.

### 6.3 Chaves e sessão

| Variável | Ambiente | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Navegador/servidor | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Navegador/servidor | Chave publicável, com JWT da sessão e RLS |
| `SUPABASE_SECRET_KEY` | Apenas servidor, módulo `server-only` | Admin Auth e RPC de ticket |
| `SIGNUP_RATE_LIMIT_SECRET` | Apenas servidor | HMAC para rate limit |
| `NEXT_PUBLIC_SITE_URL` | Configuração pública | Origem permitida para redirects |

Se o projeto ainda usar chaves legadas, `anon` é pública e `service_role` é secreta, seguindo a mesma separação. Não duplicar nomes sem necessidade. Nunca usar chave secret/service-role no client, em `NEXT_PUBLIC_*`, no bundle, nos prints ou no repositório.

Operações normais usam client SSR com JWT do usuário, inclusive RPCs. Não usar service role para contornar RLS de consultas e mutações ordinárias. No servidor, validar identidade com API verificadora (`getClaims`/`getUser`, conforme versão), não apenas confiar no conteúdo local de `getSession`. RLS continua obrigatória mesmo após verificar sessão no Next.

## 7. Modelo de dados e migrations

**Todas as tabelas da aplicação devem ser criadas pelas migrations versionadas, incluindo tabelas auxiliares, relacionamentos, índices, constraints, RLS, grants, triggers, RPCs e Realtime. Não deixar “crie depois no painel”.** O inventário completo está em `docs/table-inventory.md`; os campos, tipos e relações exatos estão nos SQLs.

| Grupo | Tabelas |
| --- | --- |
| Loja e acesso | stores, store_memberships, user_preferences |
| Catálogo | categories, products, product_packagings, suppliers, services |
| Cliente | customers, customer_addresses, pets |
| Estoque | inventory_balances, inventory_lots, inventory_movements, inventory_counts, inventory_count_items |
| Compras | goods_receipts, goods_receipt_items |
| Venda | sales, sale_items, payments, sale_returns, sale_return_items |
| A receber | receivables, receivable_payments |
| A pagar | expense_categories, payables, payable_payments |
| Caixa | cash_sessions, cash_movements, cash_counts |
| Atendimento | appointments |
| Delivery | deliveries, delivery_events |
| Auditoria | audit_logs |
| Segurança privada | signup_authorization, registration_tickets, signup_rate_limits |

### 7.1 Convenções obrigatórias

- UUID como identidade. Todas as entidades da loja carregam `store_id`; FKs compostas `(store_id,parent_id)` impedem ligar uma venda da loja A a cliente/produto da loja B.
- `created_at`, `updated_at` e triggers; `archived_at` nos cadastros. Não apagar registros financeiros ou históricos para “corrigir” valores.
- Dinheiro em `bigint` de **centavos**; quantidade em `numeric(15,3)`. Precisão da unidade explicitada. Usar Decimal/inteiros nas regras TypeScript; não somar BRL com floats e tolerâncias arbitrárias.
- Valores do banco `bigint` devem ser tratados com conversão segura, limite de domínio e serialização definida. Não converter qualquer bigint silenciosamente para Number acima de `MAX_SAFE_INTEGER`.
- Estoque disponível vem de `inventory_balances`, mantido pelo ledger `inventory_movements`. Nunca editar quantidade diretamente no cadastro do produto.
- Snapshot de nome, unidade, preço e custo nos itens; alterar o preço do catálogo não muda venda passada.
- Endereço da entrega como snapshot da venda, mesmo se cliente mudar de endereço depois.
- `version` em registros com concorrência; `idempotency_key` nos lançamentos sensíveis e retries. Mesma chave representa o mesmo payload; recusar reaproveitamento para payload diferente.
- Um caixa aberto por loja por índice único parcial. Intervalos de agenda válidos. Quantidades e valores não negativos conforme natureza; estoques não podem ficar negativos.
- Não criar “saldo devedor” mutável em customers: calcular de receivables e seus recebimentos. Saldo de caixa deriva de abertura + movimentos; fechamento guarda snapshot auditável.
- Pagamento não é status da venda nem da entrega. Serviço concluído não implica recebido.

### 7.2 Arquivos entregues

1. `20261021000100_schema.sql`: todas as tabelas operacionais, constraints e índices principais.
2. `20261021000200_rls_realtime_storage.sql`: RLS, grants, timestamps, proteção de identidade/unidade, publicação Realtime e bucket privado.
3. `20261021000300_signup_gate.sql`: hash da autorização, tickets, rate limit e provisionamento Auth atômico.
4. `20261021000400_transactions.sql`: ledger de estoque; abrir/fechar/movimentar caixa; finalizar venda; receber fiado; mover entrega.
5. `20261021000500_operations.sql`: recebimento de mercadorias, despesas, pagamento de conta, ajuste e agendamento.

Esses SQLs são a base fornecida para revisão e implementação, **não são uma afirmação de que já foram executados no projeto Supabase do usuário**. Antes de implantação, executar todos em ambiente local/staging, revisar o schema existente e completar as RPCs adicionais do item 11. Não remover RLS para fazer os testes passarem. Nunca modificar uma migration já aplicada em produção; criar a próxima.

## 8. RLS e permissões

- RLS ativa em **todas as tabelas criadas**, inclusive as privadas (sem políticas de leitura para navegador).
- `private.is_store_member` usa `auth.uid()` e vínculo ativo persistido; não confiar em `store_id` enviado pelo navegador ou em `user_metadata` editável.
- Usuário deslogado: nenhum dado operacional, hash ou ticket. Usuário autenticado: somente lojas vinculadas. Usuário dono de duas lojas não pode mover IDs/tenant de um registro para outra.
- Catálogos com SELECT/INSERT/UPDATE restritos ao tenant; archival em vez de delete. Transações, saldos e histórico com SELECT RLS e escrita via RPC restrita.
- Owner pode editar somente colunas de apresentação da loja. Alterar owner/vínculo/role não é operação do formulário de configurações.
- Funções SECURITY DEFINER com `search_path=''`, referências qualificadas, validação interna de usuário/tenant e EXECUTE concedido explicitamente. `PUBLIC` não mantém execute por padrão nas funções criadas.
- Service role é uma ferramenta administrativa server-only; a RLS não a restringe. Portanto, auditar manualmente cada chamada administrativa, especialmente o cadastro.
- Índices em store_id, vínculo por user_id, filtros de data/status e FKs usadas. Consultas sempre com tenant e paginação do servidor; RLS é a proteção, filtro no client não é proteção.
- Policies e grants precisam ser testados em conjunto: estar com RLS ativa não substitui definir grants corretos.

## 9. Realtime em todas as tabelas operacionais

Todas as tabelas operacionais próprias em public, incluindo preferências/vínculos, entram na publicação `supabase_realtime` por migration. **A exceção deliberada são tabelas de segredos, rate limit, tickets e os schemas gerenciados `auth`/`storage`**: nunca publicar hash ou credencial para cumprir literalmente “todas”. Sua mudança não tem conteúdo útil para a UI; só o servidor acessa. Não usar `ALTER PUBLICATION ... FOR ALL TABLES`.

- Um provider por sessão/loja registra subscriptions necessárias e as limpa ao sair/desmontar. Não abrir um canal por célula, card ou linha.
- Assinar INSERT/UPDATE das tabelas operacionais com filtros por `store_id` ou `user_id` em preferências. O filtro reduz tráfego; RLS controla acesso. Revalidar queries afetadas, preservando filtros e scroll.
- Arquivar produtos/cadastros e atualizar status em vez de hard DELETE. Eventos DELETE de Postgres Changes têm limitações de RLS e não devem transmitir dados antigos completos; não habilitar `REPLICA IDENTITY FULL` indiscriminadamente.
- Reconnect: reconciliar com fetch autoritativo, exibir offline/reconectando de modo discreto, aplicar backoff e não duplicar lançamentos. Estado otimista é revertido no erro/conflito.
- Revogação de vínculo ou logout limpa cache, dados anteriores e canais; validar que a sessão removida para de acessar o banco. Não confiar somente em um canal previamente autorizado.
- Não sobrescrever formulário sujo com evento remoto. Exibir aviso de atualização e permitir recarregar. Para Kanban, usar versão e rollback de posição.
- Coalescer bursts de uma transação para evitar dezenas de fetches. Não apresentar total parcial como definitivo enquanto pagamentos/itens estiverem sendo reconciliados.
- Testar dois navegadores na mesma loja e dois usuários de lojas diferentes. Assinar uma tabela não torna o conteúdo público; nunca contornar falta de SELECT desligando RLS.

## 10. Storage

Bucket privado `store-assets`, 2 MB, PNG/JPEG/WebP. Caminho `store_id/logos/uuid.ext`. Validar assinatura MIME real no servidor, tamanho e dimensões; remover metadados quando necessário. Não aceitar SVG ativo sem sanitização; o SQL entregue restringe a raster.

Upload novo → confirmar sucesso → gravar `stores.logo_path` → atualizar cache/preview → remover arquivo antigo. Em falha, preservar logo anterior e limpar upload órfão. Sem `upsert` de caminho previsível. SELECT por usuário da loja e gravação por owner; URL assinada curta ou download autenticado, nunca bucket público para facilitar UI. `logo_path` não pode apontar para outro tenant. Não salvar base64 do arquivo em Postgres/localStorage na implementação final.

## 11. Funcionalidades e contratos transacionais

### 11.1 Dashboard `/dashboard`

4 métricas principais clicáveis: vendas de hoje, a receber, estoque baixo e atendimentos do dia. Cada clique abre a tela correspondente com filtro aplicado e URL coerente. Ações rápidas: nova venda, receber mercadoria, agendar serviço. Gráfico semanal, pendências práticas e últimas vendas. Sem datas ou valores fixos.

Definições: vendido = vendas concluídas no período menos cancelamentos/estornos conforme status; recebido = pagamentos efetivamente registrados na data de recebimento; a receber = soma de remaining_cents de títulos abertos; estoque baixo = quantidade menor que minimum_stock de produto ativo; atendimentos = agenda da timezone local. Não somar quantidades de kg e unidades em um big number sem significado. Não chamar faturamento de lucro.

### 11.2 Vendas `/vendas` e `/vendas/nova`

Data Table com número, cliente, horário/data, método(s), situação de pagamento, total e detalhes. Busca por cliente/número, filtros de status/período, ordenação e paginação. Detalhe mostra itens, valores, recebimentos, saldo, delivery e trilha de correções.

PDV com busca por nome, SKU/código e barcode USB HID (scanner digita código e Enter). Produto por unidade adiciona 1; nova leitura aumenta quantidade. Produto por peso abre quantidade com unidade explícita; 750 g normaliza para 0,750 kg se unidade base kg. Não capturar leitura em campo de observação/senha nem interceptar todo Enter do sistema. Produto não encontrado permite cadastrar com permissão, sem apagar carrinho. Código preservado como texto, inclusive zeros iniciais.

Combobox de cliente opcional para venda à vista, obrigatório para saldo posterior. Selecionado não desaparece durante busca remota. Exibir saldo anterior sem bloquear venda automaticamente. Produto inativo/sem estoque não pode ser concluído.

Carrinho com quantidade, unidade, preço, subtotal, exclusão, desconto, serviços e total; serviços não baixam estoque. Permitir preservar rascunho ao navegar ou confirmar descarte. Não limpar carrinho até servidor confirmar transação.

Pagamento em dinheiro, Pix, débito, crédito ou combinação. “A receber” representa saldo, não um método de recebimento. Entrada parcial + saldo e vencimento. Receber R$ 100 para uma venda de R$ 73 gera pagamento de R$ 73 e troco de R$ 27; caixa aumenta R$ 73. Não contabilizar R$ 100 como receita. Desconto não pode tornar total negativo.

**`complete_sale` em transação única:** validar loja/caixa/cliente, serializar produtos, ler preços do banco, validar estoque/unidade/lote, criar venda e snapshots de itens, baixar ledger, registrar pagamentos reais, gerar saldo a receber e delivery quando solicitado. Em qualquer falha, nada é lançado. Repetição da mesma operação não duplica venda. `p_delivery_address` e taxa permitem criar entrega associada; endereço validado no servidor. Somar taxa ao total e nunca cobrar duas vezes.

**Complementar na implementação:** alocação FEFO automática entre vários lotes quando um item vendido exigir mais de um lote; o RPC básico entregue aceita lote por item e impede venda de lote vencido. Implementar serviço de alocação no banco, não loop de inserts no navegador. Produtos em lote não podem ser vendidos por uma rota que ignore `lot_id`.

### 11.3 Estoque `/estoque`

Tabs Produtos, Movimentações e Contagem. Data Tables e filtros. Produto: nome, descrição/marca, categoria, SKU, barcode, unidade base, precisão, preço, custo, estoque mínimo e controle de lote/validade. Unidade não pode mudar depois que houver movimentação sem conversão formal. Barcode de embalagem deve ser único na resolução de leitura; conferir colisão entre products e product_packagings, não apenas dentro da mesma tabela.

Recebimento permite **vários itens**, fornecedor, embalagem/fator, quantidade base, lote/validade, custo total e pagamento/vencimento. Ex.: 2 sacos × 15 kg = 30 kg. `receive_goods` atualiza ledger e custo médio, cria conta a pagar e opcionalmente seu pagamento. Não dar baixa em dinheiro se foi Pix; não duplicar despesa e compra como duas saídas.

Ajuste pede quantidade física e motivo; registrar diferença e auditoria. Em contagem com vários produtos, guardar versão/quantidade esperada para detectar venda ocorrida durante a contagem. **Adicionar RPC `apply_inventory_count`** em migration complementar: conferir versões, ajustar todos os itens de forma atômica, registrar os vínculos count_item_id e marcar aplicada. Não substituir estoque cegamente com contagem antiga.

Saco fechado e granel podem ser produtos diferentes. **Adicionar RPC `convert_to_bulk`**: debitar saco fechado, creditar quantidade convertida no granel, preservar custo/lote, dois movimentos com transfer_group, mesma transação e validação da loja. Não adicionar 15 kg sem retirar o saco do estoque original.

Validade por lote, indicação de próximos vencimentos e bloqueio de vencido; perda/avaria com motivo e ledger. Produtos sem movimentação podem ter saldo zero; saldos iniciais entram por recebimento/ajuste, não por INSERT direto em inventory_balances.

### 11.4 Agenda `/agenda`

Calendário navegável por mês/dia; não limitar a outubro de 2026. Lista ordenada por horário com tutor/pet, raça/espécie, serviço, valor e status. Cadastro de cliente permite vários pets, não campo único concatenado.

Agendamento com tutor, pet pertencente ao tutor, serviço, data/hora, duração, preço e observações de cuidado. Evitar agendamento duplicado; confirmar conflitos de capacidade sem presumir que só há um profissional. Status: agendado → chegou → em atendimento → pronto → entregue; falta/cancelamento com motivo. Validar transições no servidor, usar version e auditar.

Pagamento independente do estado. Vincular serviço a uma venda para cobrar banho e produtos juntos e impedir cobrança duplicada do mesmo agendamento. **Estender RPC de venda com appointment_id validado/lock** e adicionar RPC de reagendamento/edição com version. Não usar apenas save_appointment para todos os casos.

### 11.5 Entregas `/entregas`

Kanban A preparar, Pronto para sair, Saiu para entrega e Entregue. Cards com venda, cliente, resumo dos produtos, endereço, total e situação do pagamento. Sem exibir “pago” por mover para entregue.

DnD com mouse/toque/teclado, DragOverlay e feedback de alvo; manter alternativa de mover por menu/ação. Preferir biblioteca DnD já existente; se necessário, `@dnd-kit` compatível com React instalado. Motion para transição visual. Não copiar listeners globais de ponteiro do mockup.

`move_delivery` recebe tenant, id, status, posição e versão esperada; servidor valida, grava evento e incrementa versão. Em conflito: rollback, refetch e aviso. Mover de entregue/cancelado exige motivo; não desfazer pagamento ao mover card de volta. Receber na entrega chama recebimento transacional da mesma venda; não cria nova venda ou nova receita fictícia.

Cancelar delivery e cancelar venda são decisões separadas. Devolver estoque somente por devolução confirmada dos itens. Taxa, troco e observações do pedido devem aparecer no detalhe. Cliente e endereço obrigatórios.

### 11.6 Clientes `/clientes`

Data Table por nome/telefone/pet, perfil com contatos, endereços, vários pets, histórico de vendas/serviços e saldo. Formulários separados para cliente, pet e endereço. Dados opcionais não bloqueiam venda avulsa. Receber fiado no perfil chama o mesmo caso de uso do financeiro.

### 11.7 Financeiro `/financeiro`

Tabs Caixa, A receber e A pagar. Datas/filtros persistidos na URL. Exportar período, não apenas o que está paginado. CSV UTF-8 com cabeçalhos claros e proteção contra formula injection (`=`, `+`, `-`, `@` em conteúdo textual não confiável). Separar exportações de vendas, recebimentos, despesas e saldos, com significado e timezone.

**Caixa:** abrir com fundo inicial e opcional contagem por denominações; registrar abertura no usuário/horário. Reforço positivo, retirada negativa com motivo; não retirar mais dinheiro do que existe. Recebimentos/despesas em cash entram automaticamente nos movimentos, Pix e cartão não. Troco reduz o valor entregue até o líquido da venda, sem segunda saída duplicada.

Fechar: bloquear concorrência da sessão, somar abertura + movimentos; contar notas/moedas ou informar total; comparar esperado × contado, registrar diferença e justificativa. Guardar denominadores e quantidades, histórico imutável. Não substituir o esperado pelo contado para ocultar falta. Caixa fechado não aceita nova movimentação; nova abertura é outra sessão. Retentativa de fechamento deve recuperar resultado já confirmado em vez de executar nova contagem.

**A receber:** cliente, venda, valor original, recebido, saldo, vencimento e atraso. Recebimento total/parcial reduz saldo sob lock, cria payment vinculado à venda e receivable_payment. Não altera valor vendido; não cria venda nova. Pagamento maior que saldo é recusado. Pagamentos em cash exigem caixa aberto.

**A pagar:** descrição, categoria, fornecedor, origem compra, vencimento, original, pago e saldo. Despesa pode ser lançada aberta ou já paga, com meio de pagamento. Pagamento parcial/total em `pay_payable`; dinheiro exige caixa e saldo suficientes. Não marcar despesa paga sem registrar seu pagamento.

### 11.8 Devolução, cancelamento e correções

**Implementar RPCs adicionais `return_sale_items` e `cancel_sale` antes de habilitar ações reais.** O esquema de devoluções está criado; não copiar a ação do mockup que apenas troca um status.

Contrato: lock de venda, títulos, pagamentos e estoque; quantidade devolvida acumulada não supera vendida; usuário decide se item voltou em condição de revenda; entrada de estoque só nesse caso. Ratear desconto original por item de forma determinística em centavos para calcular limite reembolsável; nunca devolver preço cheio de produto que foi vendido com desconto. Primeiro reduzir saldo a receber quando aplicável, depois registrar reembolso efetivo; dinheiro reembolsado gera saída de caixa com verificação de saldo. Preservar pagamentos originais e registrar estorno/reembolso como evento, não apagá-los. Criar tabela adicional de refunds/allocations em migration para rastreabilidade e cálculos; definir seu RLS e Realtime como as demais. Motivo e audit obrigatórios. Repetição da mesma chave não duplica estoque ou reembolso.

Se essa função ainda não estiver concluída, não exibir botão funcionando parcialmente. A implementação só é considerada completa quando esses contratos e os testes forem atendidos.

### 11.9 Configurações `/configuracoes`

Nome, telefone, e-mail, endereço, cidade/timezone e logo. Exibir no shell imediatamente após sucesso, via cache + Realtime. Upload com preview, loading, erro e remoção; preservar logo anterior em falha. Tema e sidebar são preferências do usuário no header. Não expor senha de autorização, chaves administrativas ou configuração SQL nessa página.

## 12. Contratos de API e segurança de mutação

- Payloads tipados e validados em server action/route e novamente por constraints/RPC. Erros de negócio mapeados para mensagem clara; não devolver SQL interno, stack ou tokens.
- Client não manda total confiável, saldo final ou role. Desconto/taxa negociados são entradas explicitamente validadas, com limite de valor e permissão.
- Transação de negócio = uma RPC, não série de `.insert()` no client. Para operações compostas que faltarem na base, criar migration complementar com função única e grants restritos.
- Idempotência com UUID estável por tentativa lógica, mantido em retry até confirmação. Além de chave única, validar fingerprint do payload para rejeitar mesmo UUID com conteúdo diferente. Incluir esse reforço nas migrations de fechamento da implementação.
- Concorrência: ordem consistente de locks, caixa → loja quando necessário → produtos em ordem UUID → títulos/itens; revisar todas as funções para evitar deadlock. UI trata erros `40001` com refetch e retry limitado somente quando seguro.
- Server actions verificam sessão/tenant e protegem contra CSRF/Origin inválida. RLS/RPC continuam checando tenant no banco.
- Queries de dashboard/export têm agregações no servidor, security invoker ou RPC validada; nunca carregar o banco inteiro no browser para somar.
- Paginação server-side, queries indexadas e buscas com limite. `AbortController` ou cancelamento de query em busca. Scanner não exige buscar todos os produtos.
- Logs estruturados com request id e entidade; nunca incluir senhas, authorization, cookies, token, conteúdo integral de cliente ou hash de gate.

## 13. Etapas de execução para o Codex

1. Auditoria e plano antes de alterações, conforme seção 1.
2. Shell shadcn, tokens, logo, temas, sidebar, atalhos e skeletons equivalentes à referência.
3. Supabase clients/SSR/variáveis; revisão e aplicação local das migrations, geração de tipos e testes RLS.
4. Cadastro com gate, login/logout, sessão e recuperação; validar bypass direto negado.
5. Cadastros e estoque; recebimento multi-item, contagem, conversão granel e validade.
6. Caixa, venda atômica e pagamentos; fiado e contas a pagar.
7. Agenda, vínculo com venda, delivery com DnD e controle de concorrência.
8. Cancelamento/devolução auditáveis, exports e dashboard com números reais.
9. Realtime, reconciliação, loading, empty/error, acessibilidade e responsividade em todos os módulos.
10. Executar checklist, comparar screenshots e corrigir divergências. Documentar comandos, migrations aplicadas e limites restantes. Não encerrar com simulações onde a especificação exige persistência real.

## 14. Critérios de aceite e testes obrigatórios

### Segurança

- [ ] Usuário A não lê/escreve nenhum dado da loja B em SELECT direto, RPC, Storage ou Realtime.
- [ ] FKs compostas impedem vincular objetos de tenants diferentes, mesmo com service role por engano.
- [ ] Deslogado não lê tabelas operacionais nem privadas.
- [ ] Nem usuário autenticado nem anon executa emissão/rotação de senha de gate.
- [ ] `auth.signUp` direto sem ticket é negado; ticket errado/expirado/reutilizado/outro e-mail/versão antiga é negado.
- [ ] Cadastro autorizado cria usuário + loja + vínculo em conjunto, sem confirmação de e-mail.
- [ ] Senha de autorização nunca persiste em plaintext, metadata, response, logs ou bundle.
- [ ] Service secret ausente do JS client e do repositório; bucket privado bloqueia outro tenant.

### Negócio e concorrência

- [ ] Venda de 0,750 kg × R$ 18,90 resulta em R$ 14,18, arredondando centavos no servidor.
- [ ] Receber 2 sacos × 15 kg adiciona 30 kg e gera uma única obrigação/pagamento.
- [ ] Duas vendas concorrentes da última unidade: apenas uma conclui, outra recebe estoque insuficiente.
- [ ] Retry da mesma venda/recebimento/ajuste não duplica ledger nem caixa; payload divergente é recusado.
- [ ] Fiado com entrada reduz somente o saldo residual; recebimento parcial não aumenta faturamento.
- [ ] Venda R$ 73, dinheiro entregue R$ 100, troco R$ 27: movimento de caixa +R$ 73.
- [ ] Fundo R$ 150 + venda cash R$ 73 + reforço R$ 20 − retirada R$ 10 = esperado R$ 233. Contado R$ 230 → diferença −R$ 3.
- [ ] Pix/cartão não afetam dinheiro físico; pagar despesa em cash reduz caixa.
- [ ] Fechar caixa disputa corretamente com venda concorrente; sem lançamento após fechamento.
- [ ] Ração em saco convertida para granel não fica contada duas vezes.
- [ ] Lote vencido bloqueado; FEFO distribui corretamente a saída entre lotes.
- [ ] Devolução parcial respeita desconto e limite; não repõe avaria; estorno é rastreável.
- [ ] Agendamento não é cobrado duas vezes; pet pertence ao tutor.
- [ ] Arraste do Kanban persiste, reverte em erro e detecta versão concorrente; entregue não significa pago.

### Interface e qualidade

- [ ] Todas as páginas reproduzem o design aprovado; nenhum select nativo visível.
- [ ] Combobox, tooltips, dialogs, menus e Data Tables usam o shadcn local e funcionam por teclado.
- [ ] Ctrl B e Ctrl Alt T, persistência de preferências, SO e ausência de flash de tema.
- [ ] Skeleton específico e dimensões estáveis em cada página/aba/detalhe; blur termina em sucesso ou erro.
- [ ] Submit bloqueia duplicação e preserva campos em erro; retry e empty states úteis.
- [ ] Mobile sem overflow global; DnD tem alternativa por teclado; foco não some ao navegar.
- [ ] Realtime atualiza dois navegadores da mesma loja e não vaza para outra.
- [ ] Typecheck, build, lint/testes exigidos pelo projeto e testes transacionais/RLS passam.
- [ ] Não há `any` indevido, página monolítica, SQL no componente, mocks em produção ou segredo no código.

## 15. Configuração, revisão SQL e validação entregue

O pacote não contém credenciais e não executa migrations remotamente. Usar Supabase local/staging para reset/testes, depois `supabase migration list`, `supabase db push` com alvo conferido e geração de tipos conforme scripts do projeto. Fazer backup antes de migração em base existente; testar restore.

`sql/verificar-seguranca.sql` fornece verificações de cobertura de RLS, publicação e grants. Os testes de comportamento acima continuam obrigatórios: parsing SQL não prova uma política correta e build de UI não prova uma transação financeira correta.

**Pontos que o Codex deve fechar na implementação:** RPC de contagem e conversão granel; FEFO multi-lote; agendamento vinculado a venda; refunds/cancelamento auditável com rateio; fingerprint de idempotência; limites de payload, versionamento e regras de transição; agregações server-side. Criar suas migrations complementares, todas as novas tabelas com RLS e Realtime operacional. Esses pontos não podem ser omitidos por não existirem no JavaScript de referência.

## 16. Fontes técnicas oficiais consultadas

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs
- https://supabase.com/docs/reference/javascript/auth-admin-createuser
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/storage/security/access-control
- https://motion.dev/docs/animate

Consultar a documentação compatível com as versões efetivamente instaladas ao implementar. Este documento define o comportamento e os limites de segurança; não autoriza ignorar instruções do repositório, expor segredos ou substituir componentes existentes indiscriminadamente.

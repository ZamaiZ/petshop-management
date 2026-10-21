# Petshop — plano atualizado e revisão de implementação

**Atualizado em:** 21/10/2026  
**Objetivo:** sistema de gestão para uma loja, com Supabase como fonte de verdade e interface baseada nos componentes shadcn locais sobre Base UI.

## Evidências e decisões confirmadas

O pacote `petshop-implementation/` contém a especificação funcional, a referência navegável estática, 21 capturas, migrations-base, consultas SQL e um relatório de validação limitado. A referência estática usa dados de demonstração e `localStorage`; ela orienta aparência e navegação, mas não é fonte de regras nem de dados de produção.

Decisões informadas pelo usuário:

- O projeto Supabase existe e está vazio; a única função existente é `rls_auto_enable`. A função, sozinha, não prova que há um event trigger registrado e ativo. As migrations do app habilitam RLS explicitamente.
- A agenda oferece horários em intervalos de 30 minutos. A duração do serviço define o fim do atendimento e o banco impede sobreposição entre horários ativos.
- Produtos controlados por validade são contados por lote.
- Dinheiro exige sessão de caixa aberta. O caixa pode começar sem fundo; pagamento exato funciona sem saldo para troco, e outras modalidades continuam disponíveis. Pix e cartão não movimentam o dinheiro físico.

## Arquitetura presente

- App Router do Next 16.4.2, React 19.3 e Tailwind 4.
- Shell, tabelas, diálogos, abas, inputs e demais controles usam componentes locais de `src/components/ui/` (Base UI/shadcn). A Data Table usa TanStack Table.
- Server Components carregam dados; `src/features/<domínio>/queries.ts` concentra consultas e `actions.ts` concentra mutações autenticadas. Operações compostas usam RPC transacional no PostgreSQL.
- Clientes Supabase separados para browser, SSR e operações administrativas; `src/proxy.ts` atualiza sessão e protege rotas. A autorização é conferida novamente nas ações e RPCs.
- Realtime usa canal por loja/usuário e atualiza os Server Components afetados.
- Tipos manuais do banco ficam em `src/types/database.generated.ts`; devem ser regenerados após aplicar o schema final em ambiente identificado.

## Escopo já implementado no workspace

- **Acesso:** login, cadastro com gate de autorização, recuperação e redefinição de senha.
- **Shell e dashboard:** navegação autenticada, tema e preferência da sidebar persistidos em cookies do navegador, indicadores agregados no servidor, gráfico e vendas recentes.
- **Clientes:** clientes, pets, endereços, perfil e vendas recentes.
- **Estoque:** produtos e categorias, embalagens com barcode, edição e arquivamento, recebimento multi-item, fornecedor, custo médio, lotes/validade, FEFO, ajuste auditável, contagem versionada por lote e conversão de produto fechado para granel.
- **PDV e vendas:** scanner HID, busca por código/SKU/nome, embalagens, itens pesáveis, serviços e agendamentos, desconto, pagamentos divididos, fiado, entrega, detalhe, cancelamento e devolução com rateio e trilha de auditoria.
- **Financeiro:** abertura/fechamento do caixa, total contado manualmente ou por denominações, diferença com justificativa validada no banco, reforço/retirada, contas a receber e a pagar, pagamentos parciais e despesas. Há CSV separado para vendas, recebimentos, despesas pagas e saldos em aberto, com período em timezone da loja e proteção contra formula injection.
- **Agenda:** horários de 30 em 30 minutos, duração e preço do serviço, vínculo tutor/pet, conflitos de sobreposição, reagendamento versionado, transições auditáveis e vínculo com venda.
- **Entregas:** quatro etapas, histórico, cancelamento separado da venda, controle de versão e alternativa por teclado/toque ao arraste.
- **Configurações:** perfil, timezone brasileiro, serviços, fornecedores e logo em Storage privado.

## Banco de dados versionado

`supabase/migrations/20261021000100_schema.sql` a `20261021000500_operations.sql` são a base do domínio e das operações iniciais. As migrations `006` a `009` complementam hardening, dashboard, operações versionadas, devoluções e reembolsos, idempotência, catálogo, embalagens, conversão para granel e métricas líquidas.

As tabelas têm escopo por `store_id`; policies, grants e RPCs restringem acesso ao tenant. Storage usa bucket privado para logos. As tabelas operacionais são publicadas em Realtime; segredos e dados de rate limit ficam fora da publicação.

O usuário informa que executou todas as migrations no Supabase. Essa aplicação não foi consultada remotamente nesta revisão; portanto, ainda falta confirmar o estado real das migrations, policies, grants, Storage, Realtime e do event trigger `rls_auto_enable` no projeto alvo. Não duplicar essa função. A migration 002 habilita RLS de forma explícita, mas isso não substitui a revisão de policies e grants.

## Revisão visual e limites de validação

O preview local abriu a tela de login. Sua estrutura e hierarquia correspondem à captura `11-login.png`; a captura fornecida está no tema claro e o preview respeitou o tema escuro do sistema. `.env.local` existe e as variáveis necessárias ao cadastro estão preenchidas; os valores não foram lidos nem validados nesta revisão. Ainda não há sessão autenticada e conjunto de dados para cotejar visualmente as rotas internas com as capturas.

As regras locais proíbem `git`, `build`, `lint`, `typecheck` e `test`, e determinam que não se trabalhe com testes. Esses comandos não foram executados. O preview de desenvolvimento não verifica segurança, concorrência, migrations ou contratos financeiros; nada disso está declarado como aprovado.

## Incidentes reportados em 21/10/2026

| Prioridade | Sintoma | Causa confirmada | Ação e estado |
| --- | --- | --- | --- |
| P0 | `/vendas` e `/agenda` mostram `unstable value Date.now()` no `WorkspaceLayout`. | A verificação de expiração do Supabase Auth (`auth-js`) lê o relógio enquanto o segmento autenticado passa pela prerenderização do Next com Cache Components. O layout já tinha `<Suspense>`, mas faltava suspender explicitamente antes de inicializar a sessão. | Adicionado `await io()` no componente autenticado, antes de `requireUserContext()`, mantendo o conteúdo dentro do `<Suspense>`. Alteração local, sem validação em runtime. |
| P0 | `/vendas` lança `table.getState is not a function`; as listagens compartilhadas também poderiam falhar. | O projeto instala TanStack Table 9.3.1, mas a DataTable ainda lia o estado pela API v8. `getState()` foi removido no v9. | Busca e paginação agora leem `table.state`. Alteração local, sem validação em runtime. |
| P0 | O shell falha com `MenuGroupContext is missing` ao renderizar `DropdownMenuLabel`. | Rótulos de notificação e da conta eram renderizados fora do contexto de grupo exigido pelo Base UI. | Os rótulos e itens foram colocados dentro de `DropdownMenuGroup`; o rótulo de tema permanece dentro do `DropdownMenuRadioGroup`. Implementação presente, sem validação em runtime. |
| P1 | Dashboard mostra aviso do Base UI sobre `nativeButton` e links renderizados como botões. | `Button` (elemento `<button>`) era usado para navegação com `render={<Link>}` ou `render={<a>}`, confundindo semântica de botão e link. | Criado `ButtonLink` com os mesmos estilos shadcn para navegação real por link; exportação usa `<a>` estilizado. Alteração local, sem validação em runtime. |
| P0 | Dashboard e indicadores de vendas retornam erro genérico. | Ambos chamam `dashboard_overview`. A migration 006 usa `generate_series(..., interval '1 day')`, que retorna timestamp; somar/subtrair inteiros desse valor falha no PostgreSQL. | A migration `20261021001000_fix_dashboard_overview_chart_date_math.sql` já corrige os offsets para aritmética de `date`. Está no workspace; não há confirmação de aplicação no Supabase. Aplicá-la é pré-requisito para os indicadores. |

As regras locais impedem executar testes, build, lint e typecheck. Por isso, as duas correções TypeScript acima estão registradas como aplicadas, mas ainda não como verificadas no navegador. A migration 010 também não foi aplicada nem consultada remotamente nesta revisão.

## Pendências antes de usar com dados reais

1. Definir a senha de autorização com `sql/alterar-senha-cadastro.sql` e usar exatamente o mesmo valor no formulário. O arquivo chama a função de hash já criada pela migration; não altera senhas de contas existentes.
2. Confirmar no projeto Supabase alvo o estado das migrations, policies, grants, Storage, Realtime e do event trigger `rls_auto_enable`; fazer backup antes de qualquer ajuste remoto.
3. Criar uma loja e dados de demonstração em local/staging para cotejar cada rota e estado com as capturas e conferir teclado, móvel, loading, vazio e erro.
4. Migrar listagens ainda limitadas por `limit()` para paginação server-side e persistir filtros/abas de vendas e financeiro na URL. A DataTable pagina apenas os dados carregados: histórico de vendas está limitado a 200; clientes, produtos, agenda e movimentos têm outros tetos (250–1000), que podem ocultar registros sem indicar que há mais páginas.
5. Reconciliar a interface interna contra as capturas. A revisão visual realizada até agora cobre a tela pública de acesso, não todas as 21 imagens.

## Próxima ordem de trabalho

1. Aplicar a migration 010 no projeto Supabase que atende o app; ela não estava entre as migrations 001–009 que o usuário informou ter executado. Depois, observar dashboard e indicadores de vendas durante o uso normal.
2. Com o servidor de desenvolvimento reiniciado, abrir `/vendas`, `/agenda` e as demais páginas com DataTable para confirmar se os dois erros de runtime deixaram de aparecer; a restrição atual não permite usar build, lint, typecheck ou testes como validação.
3. Confirmar no ambiente Supabase alvo o histórico 001–010, policies/grants, Storage privado, Realtime e o event trigger `rls_auto_enable`, sem alterar o remoto às cegas.
4. Definir a senha de autorização com `sql/alterar-senha-cadastro.sql` e usar exatamente o mesmo valor no formulário; o arquivo chama a função de hash já criada pela migration e não altera senhas de contas existentes.
5. Criar uma loja com dados controlados em local/staging e comparar visualmente as rotas/estados contra as capturas. A revisão atual ainda não cobre as páginas internas autenticadas.
6. Fechar paginação server-side e filtros/abas persistidos na URL; em seguida corrigir divergências visuais e registrar explicitamente os itens que não puderem ser verificados. Não declarar segurança ou concorrência comprovadas apenas por inspeção de código/SQL.

# Plano: loading local e toast para mutações

**Status:** implementação aplicada; aceite visual e reprodução no ambiente afetado pendentes.

Este plano executa a proposta em [`2026-10-21-feedback-mutacoes-ux-design.md`](../specs/2026-10-21-feedback-mutacoes-ux-design.md). A implementação foi aplicada; a reprodução no ambiente afetado e o aceite visual continuam pendentes.

## Regras de execução

- Trabalhar sem adicionar dependências: reutilizar Base UI, `useTransition` e a infraestrutura já instalada.
- Não alterar regras de negócio, idempotência, valores ou esquema de banco para implementar feedback visual.
- Revisar as invalidações existentes antes de editar `revalidatePath`; mudanças só quando um destino estiver faltando ou redundante.
- Não usar toast para navegação, busca, filtros ou consultas auxiliares. Erros de campo permanecem junto ao campo.
- Não executar `git`, `test`, `typecheck`, `build` ou `lint`, conforme as instruções do projeto. O projeto não terá testes automatizados neste trabalho; a aceitação posterior será visual/manual.

## Fase 0 — Agendamento e diagnóstico de serviço

**Arquivos previstos**

- `src/features/appointments/actions.ts`
- `src/features/appointments/components/agenda-view.tsx`
- `src/features/appointments/queries.ts`, se for necessário observar a versão da linha atualizada
- `src/features/services/actions.ts`
- `src/features/services/components/services-view.tsx`
- Novo utilitário em `src/lib/server/` somente se a inspeção confirmar que não existe logger estruturado adequado
- `supabase/migrations/20261021000500_operations.sql`, `supabase/migrations/20261021000600_hardening_and_dashboard.sql` e `supabase/migrations/20261021000200_rls_realtime_storage.sql`; nova migration apenas se a evidência justificar correção de assinatura, grant, policy ou constraint
- `src/types/database.generated.ts` apenas se a assinatura efetivamente aplicada precisar ser refletida nos tipos locais

**Sequência obrigatória**

1. Instrumentar `saveAppointment`, `updateAppointmentStatus`, `rescheduleAppointment`, `createService` e `updateService` com log estruturado no servidor: referência de correlação, nome da ação, etapa e código SQLSTATE/PostgREST. Sanitizar mensagem/constraint e não registrar payload, nome, e-mail, credenciais ou outros dados pessoais.
2. Retornar a referência de forma segura para a UI, que mantém a explicação amigável. Distinguir erro retornado pelo Supabase de exceção inesperada/rede.
3. Reproduzir uma vez no ambiente que falha e consultar o log pela referência. Conferir estado da migration, assinatura/grant das RPCs de agenda, policy de `services` e constraint de horário. Migrations locais, isoladamente, não provam o estado do banco remoto.
4. Corrigir a camada indicada pela evidência. Não relaxar a proteção contra sobreposição nem declarar sucesso para contornar o erro.

**Correções e aceite**

- Classificar erros por código SQLSTATE/constraint e identificadores conhecidos, não só por substring de `error.message`.
- Cobrir os nomes atuais do SQL: `invalid_appointment_slot`, `customer_not_found`, `pet_not_found`, `invalid_appointment_transition`, `version_conflict`, `appointment_not_reschedulable` e `reason_required`; mapear `23P01`/`appointments_no_overlap` como conflito de horário.
- Impedir no formulário envio de data passada e horário passado no fuso da loja; manter o banco como autoridade e tratar conflitos concorrentes com mensagem específica.
- Dar ao erro inesperado uma mensagem segura e referência pesquisável; distinguir falha de cadastro/edição de serviço da falha de RPC de agenda.
- Preservar tutor, pet, serviço, data, horário, motivo e observações quando houver erro; evitar envio duplicado enquanto a ação estiver em andamento.
- Para criar/reagendar, levar a agenda à data afetada quando ela for diferente da selecionada, ou indicar claramente a data do atendimento salvo. Manter a região pendente até o novo estado estar visível; só então fechar o diálogo e mostrar toast de sucesso.
- Se a gravação tiver sido confirmada, mas a sincronização falhar, comunicar sincronização pendente sem sugerir que o usuário repita a mutação.
- Cadastro e edição de serviço também aguardam a lista/combobox da agenda refletir a alteração antes do toast de sucesso.

Ainda não há evidência para afirmar qual código de erro ocorreu na tentativa reportada. A causa específica só fica confirmada depois da reprodução com a referência; corrigir apenas o texto genérico não conta como resolução integral.

## Fase 1 — Infraestrutura compartilhada

**Arquivos previstos**

- `src/components/ui/toast.tsx`
- `src/app/layout.tsx`
- Novos componentes/hooks sob `src/components/feedback/` para estado regional e ciclo de mutação
- `src/components/providers/realtime-provider.tsx`
- `src/components/layout/workspace-shell.tsx`

**Trabalho**

1. Montar uma única instância de `Toaster` no root para workspace e autenticação e definir defaults acessíveis de duração, empilhamento e fechamento.
2. Criar uma região de atualização local reutilizável com `aria-busy`, texto legível, spinner discreto e layout estável.
3. Criar o contrato compartilhado para execução de mutação: estado de envio, área afetada, tratamento de resultado e toast. Permitir que uma tela mantenha o estado regional enquanto um componente filho fecha ou muda de estado.
4. Coordenar eventos de realtime da própria ação com a atualização em curso. Manter os eventos externos e reposicionar o aviso offline para não disputar espaço com os toasts.
5. Documentar no próprio contrato a regra de não encerrar a atualização regional antes da nova representação dos dados.

**Aceite da fase**

- O root tem um Toaster único, inclusive nas rotas de login e cadastro.
- A região de loading pode ser aplicada a um cartão, lista ou painel sem substituir a página.
- A atualização de uma ação não agenda um segundo refresh local por eco do realtime.
- Não há sobreposição visual do toast e do indicador offline.

## Fase 2 — Estoque e financeiro

**Arquivos previstos**

- `src/features/inventory/components/inventory-view.tsx`
- `src/features/inventory/actions.ts` (somente revisão dos destinos de revalidação)
- `src/features/finance/components/finance-view.tsx`
- `src/features/finance/components/open-cash-dialog.tsx`
- `src/features/finance/actions.ts` (somente revisão dos destinos de revalidação)
- `src/features/dashboard/components/dashboard-view.tsx`, se o contexto do atalho exigir ajuste

**Ações abrangidas**

- Estoque: categoria, produto, embalagem, ajuste, conversão, contagem e recebimento de mercadoria.
- Financeiro: abrir/fechar caixa, reforço/retirada, receber/pagar conta, criar despesa e categoria.

**Trabalho e aceite**

- O recebimento mantém diálogo/botão pendente e marca os cards/tabela/movimentações de estoque até os dados atualizados chegarem; o toast informa se houve pagamento imediato ou se foi criada uma conta a pagar.
- Produto/categoria/embalagem indicam a parte do catálogo que muda; ajustes, conversões e contagens também indicam saldo e movimentações.
- Ações do caixa marcam saldo, estado e histórico; ações de contas marcam a lista correspondente e o resumo financeiro.
- Erros preservam todos os valores já preenchidos, inclusive quantia e método de pagamento.
- Uma ação financeira concluída não recebe mensagem de falha só porque a atualização visual atrasou.

## Fase 3 — Vendas, entregas e agenda

**Arquivos previstos**

- `src/features/sales/components/sales-view.tsx`
- `src/features/sales/components/sale-composer.tsx`
- `src/features/sales/actions.ts` (revisão de invalidações)
- `src/features/deliveries/components/delivery-board.tsx`
- `src/features/deliveries/actions.ts` (revisão de invalidações)
- `src/features/appointments/components/agenda-view.tsx`
- `src/features/appointments/actions.ts` (revisão de invalidações)

**Ações abrangidas**

- Concluir/cancelar venda e devolver itens.
- Mover entrega de etapa e receber saldo vinculado à entrega.
- Agendar, reagendar, concluir, cancelar e marcar falta.

**Trabalho e aceite**

- Conclusão de venda não sai do fluxo deixando a lista antiga sem indicador; a confirmação aparece quando a listagem ou detalhe atualizado estiver pronto.
- Cancelamento/devolução mostram o estado regional da venda e indicam separadamente o impacto de estoque, caixa ou recebível quando aplicável.
- Entregas preservam o estado pendente existente, incluindo versão/coluna atualizada e alternativa acessível ao drag-and-drop.
- Agenda marca a lista/dia afetado e não deixa o compromisso antigo parecer definitivo durante o reagendamento.
- Realtime e invalidação não produzem refresh duplicado nem toast repetido.

## Fase 4 — Clientes, fornecedores e demais operações de serviço

**Arquivos previstos**

- `src/features/customers/components/customer-view.tsx`
- `src/features/customers/actions.ts` (revisão de invalidações)
- `src/features/suppliers/components/suppliers-view.tsx`
- `src/features/suppliers/actions.ts` (revisão de invalidações)
- `src/features/services/components/services-view.tsx`
- `src/features/services/actions.ts` (revisão de invalidações)

**Trabalho e aceite**

- Cliente, pet e endereço mostram qual perfil/lista está sendo atualizado; arquivar/reativar não remove o item sem sinalizar a transição.
- Fornecedor e serviço mantêm formulários e consulta CNPJ nos estados atuais, mas adicionam toast às mutações. A criação/edição de serviço segue o tratamento de erro com referência da Fase 0. A consulta CNPJ continua indicando progresso no campo e não gera toast genérico.
- Mensagens distinguem criação, edição, arquivamento, reativação e falha; a tela não apresenta uma mensagem de sucesso antes da lista refletir a operação.

## Fase 5 — Configurações, shell e autenticação

**Arquivos previstos**

- `src/features/settings/components/settings-view.tsx`
- `src/features/settings/actions.ts` (revisão de invalidações)
- `src/components/layout/workspace-shell.tsx`
- `src/features/auth/components/login-form.tsx`
- `src/features/auth/components/signup-form.tsx`
- `src/features/auth/components/recover-form.tsx`
- `src/features/auth/components/update-password-form.tsx`
- Rotas de autenticação em `src/app/api/auth/`, apenas se for preciso devolver um resultado adequado à interface

**Trabalho e aceite**

- Salvar perfil e enviar/remover logo mostram o resultado da ação. Tema e sidebar atualizam e persistem localmente em cookies, sem feedback de mutação no servidor.
- Login, cadastro, recuperação e alteração de senha mantêm feedback inline e toast de sucesso/erro. Mensagens de sucesso que atravessam redirect chegam à rota de destino sem desaparecer.
- Logout indica que está encerrando a sessão e impede envio repetido durante a requisição.

## Fase 6 — Revisão cruzada e aceite visual

1. Comparar a lista do documento de design com todas as Server Actions exportadas e os pontos que as chamam; registrar e resolver qualquer ação de escrita não coberta.
2. Conferir todos os destinos de `revalidatePath()` versus os dados exibidos em cada rota e remover refresh cliente redundante somente depois de confirmar a cobertura.
3. Percorrer visualmente um fluxo de sucesso e um de falha por módulo, verificando: botão pendente, região afetada, preservação de dados, atualização visível, toast, foco e ausência de atualização duplicada.
4. Revisar operação financeira que grava com sucesso, mas tem sincronização visual atrasada, para assegurar que não induz repetição de pagamento/recebimento.
5. Não executar comandos automatizados proibidos pelas instruções do repositório.
6. Repetir agendamento e criação/edição de serviço no ambiente originalmente afetado e conferir as referências nos logs; a remoção da mensagem genérica, por si só, não é critério de conclusão.

## Escopo confirmado pelo usuário

Escopo aprovado: ações que alteram dados ou executam um fluxo operacional (incluindo autenticação) recebem loading local e toast. Leitura, consulta de CEP/CNPJ, filtro, busca e navegação mantêm feedback contextual. Exportação de arquivo pode receber confirmação própria quando a interface conseguir confirmar o download.


# Feedback de mutações: loading local e confirmações

**Status:** proposta para revisão. Nenhuma mudança de produto foi aplicada.

## Objetivo

Toda ação que grava ou altera dados deve deixar claro que começou, indicar qual parte da tela está sendo atualizada e confirmar o resultado. A tela deve manter o contexto visível durante a atualização; o usuário não pode ficar olhando valores antigos sem indicação de que o refetch está em andamento.

O escopo inclui criar, editar, arquivar, reativar, remover, pagar, receber, ajustar, mudar status e salvar preferências. Inclui também os fluxos de autenticação, com feedback apropriado à navegação. Busca, filtros, troca de abas, seleção de datas e navegação não geram toast porque não gravam estado. Consultas de CNPJ/CEP mantêm progresso junto aos campos, onde a resposta é usada.

## O que o código atual mostra

1. `src/components/ui/toast.tsx` já implementa toast com Base UI, mas `Toaster` não está montado em `src/app/layout.tsx` e não há chamadas de `toast.add` nos módulos de produto. A infraestrutura existente está, na prática, inativa.
2. Muitos formulários exibem estado no botão, como “Salvando…”, mas fecham o diálogo assim que a Server Action retorna e só então chamam `router.refresh()`. Esse refresh não é aguardado pelo callback; por isso a tela pode continuar mostrando os valores anteriores sem feedback local.
3. As Server Actions já chamam `revalidatePath()` para várias rotas. Na versão instalada do Next, a documentação local informa que uma Server Function revalida e atualiza imediatamente a rota afetada que está aberta. A chamada adicional a `router.refresh()` precisa ser revisada por ação para evitar uma segunda busca desnecessária.
4. `src/components/providers/realtime-provider.tsx` também agenda `router.refresh()` em eventos do Supabase, com debounce de 140 ms. Uma mutação local pode provocar a revalidação da Server Action e outra atualização via realtime.
5. `src/features/deliveries/components/delivery-board.tsx` mantém um estado local enquanto aguarda a nova versão da entrega. Esse padrão é uma referência útil para evitar que um indicador termine antes de os dados novos aparecerem.
6. O feedback de erro atual geralmente fica dentro do formulário, o que é adequado para preservar contexto; falta uma confirmação global consistente de sucesso e falha. Preferências da loja e do layout também são salvas sem feedback uniforme.
7. A notificação de sincronização offline do realtime e a área de toast estão posicionadas no rodapé direito, então a montagem global precisa também resolver a sobreposição entre elas.

### Falha reportada: serviço e agendamento

O usuário reportou que criar/editar serviço e marcar atendimento exibem mensagens genéricas de falha. O mesmo texto visível não prova que as operações falharam pela mesma causa: serviço grava diretamente em `services`; agendamento chama RPCs e passa por constraints de horário.

Há um defeito comprovado no tratamento de erros de agendamento: `src/features/appointments/actions.ts` reduz o erro Supabase a `error.message` e não registra código nem referência. O tradutor espera `appointment_transition_invalid` e `appointment_version_conflict`, mas as migrations atuais lançam `invalid_appointment_transition` e `version_conflict`. Também ficam sem tradução `invalid_appointment_slot`, `customer_not_found`, `pet_not_found`, `appointment_not_reschedulable` e `reason_required`. A constraint `appointments_no_overlap` gera SQLSTATE `23P01`; não é garantido que a mensagem contenha `appointment_conflict`.

O cadastro/edição de serviço também descarta o erro PostgREST/SQL em `src/features/services/actions.ts` e não grava log estruturado. É um problema comum de observabilidade, mas as chamadas de banco são diferentes. Sem o erro técnico da tentativa atual, ainda não é possível afirmar se a causa específica é horário passado, conflito, migration/permissão divergente ou outra falha.

O formulário permite enviar horário passado; a RPC lança `invalid_appointment_slot` nesse caso. Isso é uma hipótese plausível para agendamento, não uma causa confirmada. Além disso, `AppointmentForm` fecha o diálogo antes de `router.refresh()`. Esse ponto explica a falta de feedback da atualização, mas sozinho não explica a falha da gravação.

## Inventário por visualização

| Visualização | Ações persistentes abrangidas | Região que precisa sinalizar atualização | Arquivos principais |
| --- | --- | --- | --- |
| `/dashboard` | Abrir caixa pelo atalho | Badge de caixa e dados do resumo | `src/features/dashboard/components/dashboard-view.tsx`, `src/features/finance/components/open-cash-dialog.tsx`, `src/features/finance/actions.ts` |
| `/estoque` | Criar/editar/arquivar produto; criar/editar/arquivar/reativar categoria; salvar/remover embalagem; ajuste; conversão para granel; iniciar/aplicar contagem; receber mercadoria | Indicadores, tabela de produtos, movimentações, categorias e/ou painel da contagem conforme a ação. No recebimento, destacar estoque e movimentações enquanto o retorno da operação chega | `src/features/inventory/components/inventory-view.tsx`, `src/features/inventory/actions.ts` |
| `/financeiro` | Abrir/fechar caixa; reforço/retirada; receber conta; pagar conta; criar despesa e categoria | Estado e saldo do caixa, histórico, abas e listas de contas, conforme a ação | `src/features/finance/components/finance-view.tsx`, `src/features/finance/components/open-cash-dialog.tsx`, `src/features/finance/actions.ts` |
| `/vendas` e `/vendas/nova` | Concluir venda; cancelar venda; devolver itens | Resumo e lista/detalhe da venda. Na conclusão, manter feedback no fluxo até a venda aparecer na visualização atualizada | `src/features/sales/components/sales-view.tsx`, `src/features/sales/components/sale-composer.tsx`, `src/features/sales/actions.ts` |
| `/entregas` | Avançar etapa da entrega; receber valor pendente da venda | Cartão/coluna da entrega e indicadores pertinentes; preservar o estado pendente já existente no quadro | `src/features/deliveries/components/delivery-board.tsx`, `src/features/deliveries/actions.ts`, chamada a `receiveReceivable` de `src/features/finance/actions.ts` |
| `/agenda` | Agendar; reagendar; concluir, cancelar ou marcar falta | Dia, calendário e lista do atendimento selecionado | `src/features/appointments/components/agenda-view.tsx`, `src/features/appointments/actions.ts` |
| `/clientes` | Criar cliente; criar/editar/arquivar pet; criar/remover endereço; arquivar cliente | Tabela e perfil aberto, incluindo pets e endereços | `src/features/customers/components/customer-view.tsx`, `src/features/customers/actions.ts` |
| `/fornecedores` | Criar/editar/arquivar/reativar fornecedor | Lista e aba de ativos/arquivados | `src/features/suppliers/components/suppliers-view.tsx`, `src/features/suppliers/actions.ts` |
| `/servicos` | Criar/editar/arquivar/reativar serviço | Lista e contadores da página | `src/features/services/components/services-view.tsx`, `src/features/services/actions.ts` |
| `/configuracoes` | Salvar perfil; enviar/remover logo | Formulário, identidade e imagem da loja | `src/features/settings/components/settings-view.tsx`, `src/features/settings/actions.ts` |
| Shell e autenticação | Persistir tema/sidebar em cookies do navegador; login, cadastro, recuperação/alteração de senha e logout | Tema/sidebar atualizam imediatamente no navegador; autenticação mantém feedback de formulário e redirecionamento | `src/components/layout/workspace-shell.tsx`, `src/features/auth/components/*`, rotas `/api/auth/*` |

As ações de cada servidor também precisam de uma revisão pontual de revalidação. Os arquivos `actions.ts` de agenda, clientes, entregas, financeiro, estoque, vendas, serviços, fornecedores e configurações já contêm chamadas a `revalidatePath()` com destinos variados. O trabalho deve confirmar cada destino e não acrescentar invalidações indiscriminadamente.

## Diagnóstico e correção do erro

| Caminho | Evidência local | Tratamento necessário |
| --- | --- | --- |
| Agendar horário inválido ou passado | SQL lança `invalid_appointment_slot`; formulário não impede data passada | Validar no cliente e manter validação autoritativa no banco; orientar a escolher horário futuro em intervalos de 30 minutos |
| Conflito de horário | Constraint `appointments_no_overlap`, SQLSTATE `23P01`; tradutor busca uma frase antiga | Traduzir por código/constraint para “Esse horário já está ocupado.” |
| Tutor, pet, serviço ou estado indisponível | SQL lança `customer_not_found`, `pet_not_found`, `invalid_appointment_transition`, `version_conflict`, `appointment_not_reschedulable` e `reason_required` | Mapear cada condição para uma orientação recuperável, sem mensagem genérica |
| Assinatura/permissão do RPC divergente | O código ignora `error.code`; migrations locais não provam o estado aplicado no ambiente usado | Logar referência/código da operação e conferir assinatura e grants instalados antes de alterar SQL |
| Criar/editar serviço falha | A action descarta o erro Supabase e retorna texto genérico | Registrar diagnóstico seguro com referência e mapear erros conhecidos sem expor detalhes internos |

Antes de corrigir banco, instrumentar e reproduzir uma vez no ambiente afetado. Registrar ação, etapa, referência de correlação e código SQLSTATE/PostgREST; sanitizar mensagem/constraint e nunca gravar payload de formulário, nome, e-mail, credenciais ou outros dados pessoais. Usar códigos e identificadores conhecidos em vez de depender de substrings frágeis em mensagens.

Corrigir a causa demonstrada. Não remover a constraint de sobreposição nem alterar regras de negócio para esconder o erro. Se a falha real for só um código conhecido não traduzido, corrigir o mapeamento; se for assinatura, grant, política ou migration não aplicada, corrigir o ambiente/migration correspondente.

## Contrato de interação

### Ao iniciar

- O botão mostra o verbo adequado, como “Registrando recebimento…” ou “Atualizando horário…”, e impede um segundo envio da mesma ação.
- A área afetada recebe um indicador contextual — texto curto e spinner discreto — com `aria-busy="true"` e anúncio acessível. A página permanece utilizável fora dessa área.
- Conteúdo existente permanece estável. Quando os valores anteriores puderem ser confundidos com o resultado, sinalizar visualmente a região como desatualizada até a atualização chegar, sem apagar o conteúdo nem cobrir a página inteira.
- Operações rápidas não devem piscar um indicador regional. O estado do botão começa imediatamente; o indicador da região só aparece quando a atualização ultrapassar um limiar curto, escolhido na implementação e aplicado de forma consistente.

### Ao concluir com sucesso

- A operação permanece pendente até a atualização correspondente chegar à tela. A referência é a revalidação da Server Action quando ela cobre a rota atual; usar refresh de cliente apenas nos casos em que a revisão comprovar que é necessário.
- Só depois de a tela refletir o novo estado, fechar o diálogo/fluxo quando couber, remover o indicador e disparar um toast de sucesso.
- Se a gravação foi confirmada mas a atualização visual falhar, não dizer que a gravação falhou. Manter um aviso de atualização pendente com uma tentativa explícita de atualizar e uma mensagem que diferencie gravação de sincronização.
- Realtime provocado pela própria ação deve ser agrupado com o ciclo em curso. Eventos externos continuam atualizando a tela, sem produzir toast de sucesso como se o usuário tivesse acabado de salvar.

### Ao falhar

- Manter o diálogo e os dados digitados; reativar controles quando seguro.
- Manter erros de validação perto dos campos e erro operacional junto ao formulário. Além disso, emitir um toast resumido com título acionável; o toast não substitui a mensagem inline.
- Não exibir detalhes internos, stack traces ou referências técnicas como mensagem principal para o usuário. Se uma referência de suporte for útil, deixá-la em detalhe secundário sem substituir a explicação simples.
- Falhas de agendamento/serviço devem ter uma referência pesquisável em log estruturado; conflito, horário inválido, versão concorrente, motivo ausente e recurso indisponível recebem mensagens específicas.

## Regras de toast

- Um toast de sucesso ou erro para toda mutação persistente, inclusive abrir/fechar caixa, ajustes financeiros e de estoque, mudanças de status, preferências e identidade da loja. Fluxos de autenticação também recebem feedback; em redirecionamentos, usar um mecanismo que preserve a mensagem até a rota de destino.
- O título nomeia a ação e a descrição informa o efeito relevante. Exemplos: “Recebimento registrado” / “Estoque e movimentações atualizados.”; “Fornecedor arquivado” / “Ele deixou de aparecer na lista de ativos.”; “Não foi possível salvar o serviço” / mensagem curta e útil.
- Sucesso deve ser curto e desaparecer em cerca de 4 segundos; falhas podem permanecer um pouco mais e sempre podem ser fechadas. Evitar empilhar várias notificações idênticas em cliques repetidos ou eco de realtime.
- Não emitir toast para filtro, busca, navegação, seleção ou consulta de CEP/CNPJ; manter o progresso dessas consultas ao lado do campo. Exportações devem ser avaliadas separadamente conforme a confirmação de download disponível.
- Reutilizar a infraestrutura Base UI atual. Montar um único `Toaster` no nível raiz para cobrir autenticação e workspace e ajustar a posição da notificação offline para não haver sobreposição.

## Arquitetura proposta

1. Criar um contrato compartilhado para iniciar/finalizar uma mutação, nomear a região afetada e disparar toast com mensagens específicas. A implementação deve permitir que o componente da página acompanhe o estado iniciado por um diálogo filho.
2. Adicionar uma região de atualização reutilizável, sem acoplar textos do produto ao framework. Ela deve preservar o layout, anunciar o estado a tecnologias assistivas e aceitar rótulos como “Atualizando estoque…” ou “Atualizando contas…”.
3. Centralizar o ciclo no componente que conhece a visualização afetada. O diálogo filho não deve remover o único indicador ao fechar; a tela pai controla o estado regional até receber os novos dados.
4. Usar `revalidatePath()` como fonte primária quando a Server Action já revalida a rota atual. Para os casos não cobertos, coordenar `router.refresh()` com o estado regional. O evento realtime local não deve iniciar um segundo ciclo concorrente.
5. Preservar os estados locais atuais de validação e confirmação destrutiva; a abstração compartilhada deve reduzir duplicação sem esconder diferenças de mensagem ou de escopo entre as operações.

## Critérios de aceite para a implementação

- Cada mutação listada neste documento tem estado de ação, estado regional quando há refetch visível e resultado em toast.
- Nenhuma área afetada mostra valores antigos sem indicação enquanto a atualização esperada está pendente.
- A área não relacionada continua responsiva; não há bloqueio ou spinner de página inteira para operações locais.
- Toast de sucesso aparece depois de o dado novo estar visível; erro preserva o formulário e não aparece como sucesso.
- Não existem dois refreshes da mesma ação causados pela combinação de `revalidatePath`, `router.refresh()` e eco do realtime.
- Atualização de caixa, estoque, contas, vendas, clientes, agenda e entregas não deixa badges/resumos incompatíveis com a lista da própria tela.
- Agendar, reagendar e alterar status distinguem conflito de horário, slot inválido, estado concorrente e falha inesperada; o fluxo não mascara todos os casos como “Confira os dados”.
- Falhas ao criar/editar serviço ficam pesquisáveis por referência; sucesso só é confirmado depois da atualização da lista e dos serviços disponíveis na agenda.
- Estados acessíveis usam texto além de cor/ícone e funcionam por teclado e com movimento reduzido.
- Interações de leitura e navegação não geram notificações repetitivas.

## Riscos a tratar durante a execução

- O encerramento da Server Action, a atualização da árvore RSC e o evento realtime podem ocorrer em ordem diferente. A implementação deve observar a nova versão/dados da visualização antes de remover o estado regional; o padrão versionado do quadro de entregas é uma referência, não uma solução universal sem adaptação.
- Uma ação pode gravar com sucesso e falhar ao sincronizar a tela. Os dois resultados precisam ser comunicados separadamente para não induzir repetição de operação financeira.
- O toast global precisa sobreviver a navegação cliente em fluxos de autenticação e não pode ficar sob dialogs/alert dialogs nem sobrepor o estado offline.


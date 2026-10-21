# Correções do composer de vendas e entrega — plano de implementação

> **Execução:** implementar inline, tarefa a tarefa, seguindo este plano.

**Objetivo:** tornar a nova venda acessível pelos dois pontos de entrada e concluir um fluxo de catálogo, cliente, endereço e entrega funcional.

**Arquitetura:** manter o diálogo controlado por URL para deep links e sincronizá-lo com estado local para resposta imediata. Usar a ação autenticada de endereço já existente e uma rota GET interna, com CEP validado, para consultar o ViaCEP.

**Stack:** Next.js 16.4.2 App Router, React 19, Supabase e componentes locais.

**Design:** `docs/superpowers/specs/2026-10-21-sales-composer-and-delivery-design.md`.

## Restrições globais

- Não executar comandos `git`, `typecheck`, `build`, `lint` ou `test`.
- Não adicionar nem executar testes.
- Não alterar o esquema do banco nem instalar dependências.
- Ler e respeitar os guias Next.js locais antes de alterar Route Handlers ou Server Actions.

## Pontos de revisão

- A navegação da listagem deve abrir o diálogo mesmo antes de a nova prop do servidor chegar.
- Atualizar o composer não pode chamar setters que não existem nem impedir a atualização do carrinho.
- A resposta do ViaCEP deve ser validada e o usuário deve continuar podendo preencher manualmente.
- Trocar/editar um endereço para uma entrega não pode alterar o registro salvo existente.
- Salvar endereço exige cliente ativo e não pode perder os endereços anteriores.

## Tarefa 1: Abertura e interação do catálogo

**Arquivos:**
- Alterar `src/features/sales/components/sales-view.tsx`.
- Alterar `src/features/sales/components/sale-composer.tsx`.

- [x] Adicionar estado local para abertura do diálogo, sincronizado com `newSaleOpen`, e atualizar a abertura, o fechamento e a conclusão da venda para não depender somente da navegação do servidor.
- [x] Remover a chamada à variável inexistente `setSuccess` em `changed()`.
- [x] Tornar a ação de adicionar produto evidente e preservar os limites de estoque, embalagens e controles de quantidade do carrinho.
- [x] Fazer revisão estática do fluxo de entrada, saída, teclado e atualização do carrinho.

## Tarefa 2: Consulta resiliente de CEP

**Arquivos:**
- Criar `src/app/api/cep/route.ts`.
- Alterar `src/components/ui/cep-lookup-field.tsx`.

**Interface:** `GET /api/cep?cep=<8 dígitos>` retorna os campos normalizados do ViaCEP; `400` para formato inválido, `404` para CEP inexistente e erro `5xx` para indisponibilidade externa.

- [x] Validar e normalizar o CEP na rota; consultar somente o host fixo do ViaCEP com timeout e sem cache.
- [x] Trocar a chamada externa no navegador pela rota same-origin.
- [x] Distinguir CEP inexistente de erro de consulta e preservar os estados de loading, sucesso e digitação manual.
- [x] Inspecionar os caminhos da resposta e cancelamento no componente e na rota, sem comandos proibidos.

## Tarefa 3: Endereços no fluxo de entrega

**Arquivos:**
- Alterar `src/features/customers/actions.ts`.
- Alterar `src/features/sales/actions.ts`.
- Alterar `src/features/sales/components/sale-composer.tsx`.

**Interface:** `createCustomerAddress` retorna `{ ok: true, address }` com o registro salvo, ou `{ ok: false, message }`.

- [x] Fazer a ação inserir e devolver o registro completo, mantendo validação de cliente/loja, autenticação e revalidação atuais.
- [x] Ao selecionar cliente ou marcar entrega, preencher o primeiro endereço ativo quando disponível; expor todos no seletor e um modo de novo endereço.
- [x] Permitir editar o snapshot da entrega sem gravar por cima do endereço selecionado.
- [x] Adicionar a ação explícita “Salvar este endereço no cadastro”, sem remover os endereços atuais, e selecionar o novo registro retornado.
- [x] Revisar validações, estados pendentes, erros próximos aos campos e o fluxo de cliente sem endereços.

## Verificação permitida

- [x] Preservar o endereço salvo selecionado quando a consulta do CEP não altera os dados da entrega.

Revisar os arquivos alterados linha a linha. Não executar testes, build, lint, typecheck ou comandos Git.

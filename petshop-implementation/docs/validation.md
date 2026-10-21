# Verificação da entrega

## Referência visual

- Build esbuild/React do Combobox e Motion: concluído.
- JavaScript da referência: `node --check` passou.
- Referência publicada com sucesso em https://petshop-studio-zamai.nimblemole5.chatgpt.site.
- Cadastro atualizado com campo separado de senha de autorização.
- Skeletons proporcionais por tipo de página e transição de entrada/blur na referência.
- Navegação, tema escuro/claro, sidebar recolhida, busca do Combobox, diferença no fechamento e DnD foram inspecionados no navegador durante o desenvolvimento.
- Capturas reais das páginas e de estados selecionados em `screenshots/`.

## SQL

As cinco migrations passaram por parsing PostgreSQL com `pgsql-parser`.

Também foram executadas em PostgreSQL embarcado (PGlite), com stubs locais mínimos de roles, auth.uid(), auth.users e storage, as seguintes verificações:

1. Todas as cinco migrations criaram seus objetos sem erro de DDL.
2. SELECT sob RLS retornou somente a loja do usuário autenticado.
3. INSERT direto de loja por usuário autenticado foi negado.
4. Venda de 0,750 kg a R$ 18,90 produziu R$ 14,18.
5. Retry da mesma chave de venda retornou a venda existente.
6. Saldo de estoque baixou uma única vez, de 20 para 19,250 kg.
7. Pagamento cash registrou R$ 14,18 líquidos, e não os R$ 20 entregues.
8. Estoque insuficiente provocou rollback.
9. Fechamento calculou esperado R$ 164,18; contado R$ 164,00; diferença −R$ 0,18.
10. Movimentação após fechar o caixa foi negada.

Código reproduzível em `verification/`: instalar dependências nessa pasta com `npm ci`; executar `node sql-parse-tests.cjs` e `node local-postgres-tests.mjs`.

## Limites reais

Este teste NÃO conecta ao Supabase do usuário, NÃO configura a senha real e NÃO valida serviços Auth/Storage/Realtime hospedados. A criação da extensão pgcrypto foi omitida apenas no harness embarcado; as funções de gate foram criadas, mas bcrypt/tickets/cadastro real não foram executados nesse harness. Os stubs existem somente na verificação, não nas migrations reais. As triggers de Auth foram temporariamente desabilitadas apenas no banco descartável para criar duas identidades de teste; não fazer isso no Supabase real.

Parsing não valida corpos PL/pgSQL em todas as combinações de entrada; o harness exercita somente os fluxos listados. Testes de concorrência real, Storage, Realtime, bypass do signup, expiração/rotação do gate e todos os cenários do spec devem passar em Supabase local/staging antes de produção.

Os SQLs são uma base de implementação. O spec exige migrations complementares para contratos adicionais (FEFO multi-lote, contagem atômica, conversão para granel, devoluções/reembolsos e fingerprint de idempotência). Não declarar essas operações prontas por existir um formulário na referência.

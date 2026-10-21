# SDD ledger — plan: docs/superpowers/plans/2026-10-21-platform-access-invites.md

## Estado

- Desenho e plano aprovados pelo usuário.
- Execução inline no workspace autorizado.
- Nenhuma migration foi aplicada e nenhum dado externo foi alterado.

## Rulings

- Ruling: trabalhar no workspace compartilhado sem worktree ou commits — `git` está explicitamente proibido pelo AGENTS.md; a solicitação aprovada autoriza alterações no código do projeto — custo se estiver errado: alterações ficam misturadas ao estado local existente e sem isolamento por branch.
- Ruling: não criar nem executar testes, build, lint ou typecheck — proibição explícita do AGENTS.md — custo se estiver errado: defeitos de integração que só apareceriam em verificação dinâmica podem permanecer.
- Ruling: exigir segredo bootstrap de uso único além do e-mail — trigger em `auth.users` não distingue signup público de criação via dashboard apenas pelo e-mail; hash privado + segredo aleatório evita que um terceiro reivindique o endereço autorizado — custo se estiver errado: o primeiro bootstrap exige um passo operacional adicional e passagem temporária do segredo pelo fluxo Auth confiável.
- Ruling: servir logos privadas por endpoint autenticado em vez de continuar emitindo URLs assinadas — URL assinada já emitida continuaria válida após a desativação; a rota revalida membership e estado da loja em cada leitura — custo: uma requisição autenticada a mais e cache de logo desativado.
- Ruling: permitir somente um convite pendente por e-mail normalizado em toda a plataforma — impede que o mesmo endereço fique simultaneamente associado a papéis ou pet shops diferentes; convites expirados são revogados ao emitir outro — custo: um convite antigo precisa ser revogado antes de mudar seu destino.
- Ruling: exigir `TRUSTED_CLIENT_IP_HEADER` em produção e usar o hash do token como chave local quando não houver IP confiável — não deixar o e-mail informado pelo visitante contornar ou bloquear o limite de tentativas — custo: o deploy público precisa configurar um cabeçalho sobrescrito pelo proxy de entrada.
- Ruling: garantir exatamente um owner ativo em cada pet shop ativo por trigger diferido — permite criar/transferir ownership dentro de uma transação e impede commits intermediários sem owner — custo: recuperação manual precisa promover o novo owner e ajustar o anterior na mesma transação.

## Tarefas

- Task 1: preflight de dados e runbooks — complete (artifacts created; no database execution).
- Task 2: migration de autorização, convites e estado da loja — complete (authored only; not applied).
- Task 3: serviço de convites e criação de contas — complete.
- Task 4: login e retirada do cadastro aberto — complete.
- Task 5: onboarding do owner — complete.
- Task 6: convites de employee e equipe — complete.
- Task 7: painel admin e roteamento por host — complete.
- Task 8: status ativo em todas as camadas e signed URLs — complete.
- Task 9: tipos, configuração e retirada do procedimento antigo — complete.
- Task 10: revisão estática final — complete (independent review findings fixed and re-reviewed; no remaining findings in the two corrected paths).

## Revisão e verificação

- Revisão estática independente encontrou o limite por e-mail como contornável/abusável e o formulário de redefinição navegando para `/dashboard` em ambos os hosts. Ambos foram corrigidos e reavaliados sem achados restantes: produção exige IP obtido por cabeçalho confiável, desenvolvimento limita por hash do token, e o destino de login retornado pelo servidor orienta a navegação após redefinição.
- Nenhum teste, build, lint, typecheck ou comando `git` foi executado, conforme `AGENTS.md`.
- Nenhuma migration foi aplicada; Supabase, Auth e dados não foram acessados/modificados.

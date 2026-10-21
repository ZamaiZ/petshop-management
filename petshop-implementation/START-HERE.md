# Comece por aqui

Este pacote é a referência visual e funcional para implementar o Petshop no seu projeto Next.js existente.

1. Abra `spec.md` no Codex junto com o repositório atual.
2. Peça para seguir a etapa obrigatória de revisão completa e planejamento **antes de alterar arquivos**.
3. Use `screenshots/` e `reference-site/dist/` para conferir fidelidade de design. A referência usa dados locais; não é o backend de produção.
4. Revise as migrations em `supabase/migrations/` em ambiente local/staging; não aplicar cegamente sobre um banco que já tenha tabelas.
5. Configure a senha de autorização com `sql/alterar-senha-cadastro.sql`, trocando o placeholder. O SQL cria o hash; nenhuma senha real acompanha o pacote.
6. Feche os contratos adicionais listados no spec antes de considerar a implementação completa. A referência não substitui testes de estoque, dinheiro, RLS e concorrência.

## Conteúdo

- `spec.md`: contrato completo para implementação pelo Codex.
- `reference-site/`: HTML/CSS/JS e fonte do Combobox/Motion. Sem node_modules, Git, credenciais ou identidade de hospedagem.
- `screenshots/`: capturas reais das páginas e estados selecionados da referência publicada.
- `supabase/migrations/`: esquema operacional, segurança, gate de cadastro, transações principais e operações.
- `sql/alterar-senha-cadastro.sql`: configurar ou trocar a senha de autorização.
- `sql/verificar-seguranca.sql`: inspeção após aplicar as migrations.
- `docs/`: inventário de tabelas, índice dos prints e relatório de verificação.
- `.env.example`: somente nomes de variáveis, sem valores secretos.

## Abrir a referência local

Em `reference-site/`, `npm ci` e `npm run build` recompilam os componentes. Para visualizar, sirva a pasta `dist/` com um servidor estático, por exemplo `python -m http.server 8080 --directory dist`.

O arquivo `dist/index.html` também pode ser aberto diretamente para inspeção visual. O carregamento de fontes externas depende de rede. A implementação final usará as fontes, o roteamento e os componentes existentes do projeto Next.

## Instrução curta para colar no Codex

> Leia `spec.md` e todos os anexos relevantes. Antes de modificar qualquer coisa, revise completamente meu projeto Next.js atual, seus componentes shadcn instalados, dependências, rotas, estilos, instruções e migrations. Escreva um plano de implementação baseado no que encontrou e execute-o preservando o projeto. Reproduza exatamente a referência visual. Implemente Supabase Auth/Storage/Postgres, o gate seguro de cadastro, todas as tabelas, RLS, Realtime operacional, transações, skeletons e Motion conforme o spec. Complete as migrations e os contratos adicionais explicitamente listados. Não copie lógica simulada, dados locais nem a organização monolítica do mockup como arquitetura de produção. Valide segurança, concorrência, dinheiro e fidelidade visual antes de encerrar.

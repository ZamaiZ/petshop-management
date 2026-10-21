# Acesso à plataforma por convites — proposta de desenho

**Status:** aprovado pelo usuário em 21/10/2026; implementação no workspace e revisão estática independente concluídas, sem validação dinâmica.

## 1. Objetivo e escopo

Substituir o cadastro aberto protegido por senha compartilhada por convites individuais, com validade de sete dias e e-mail de destino definido. O link será copiado pelo administrador e enviado manualmente; não haverá serviço de disparo de e-mail.

O escopo contém:

- painel da plataforma em `admin.dominio` (desenvolvimento: `admin.localhost:PORT`), com login de administrador, criação de convites para novos owners e ativação/desativação de pet shops;
- painel do pet shop em `painel.dominio` (desenvolvimento: `localhost:PORT`), com login, criação de convites de employees e o fluxo inicial de configuração do pet shop;
- somente os papéis `owner` e `employee`, sem matriz de permissões para módulos ou ações nesta entrega;
- um pet shop por conta de usuário;
- preservação de dados ao desativar ou reativar um pet shop.

Ficam fora: envio de e-mail, exclusão de pet shops/contas, múltiplas lojas por usuário, cobrança, novos níveis de permissão e mudança nos fluxos de produtos, serviços e financeiro.

## 2. Fluxos de usuário

### 2.1 Bootstrap e acesso do administrador da plataforma

O primeiro administrador será uma conta criada no Supabase Auth e autorizada explicitamente no banco. O bootstrap exige e-mail e um segredo aleatório de uso único; o banco guarda somente o hash do segredo. O trigger valida ambos, consome a autorização e registra a conta em `private.platform_admins`. O segredo pode chegar como dado temporário de criação da conta, mas deve ser removido pelo trigger antes de persistir o usuário; nenhum booleano/papel de `user_metadata` autoriza admin. Isso impede que alguém reivindique o e-mail por signup direto enquanto o bootstrap estiver pendente.

O administrador entra pelo host de admin. A autorização é confirmada consultando a tabela privada no servidor/banco. Estar em `admin.localhost` ou `admin.dominio` apenas escolhe a interface; o hostname não concede acesso.

Não haverá gestão de usuários administradores na interface. Inclusão/remoção de admins após o bootstrap será uma operação manual e controlada no Supabase, documentada junto ao procedimento de implantação; não haverá autoatribuição de admin pelo painel.

### 2.2 Convite de owner e criação do pet shop

1. O admin informa o e-mail de destino e cria um convite. O sistema gera um token aleatório, guarda somente seu hash e apresenta o link completo para cópia. O convite vence em sete dias.
2. O admin envia o link manualmente. O link abre a página de convite no host do painel do pet shop, configurado por URL canônica de ambiente, nunca montado a partir de um `Host` arbitrário.
3. A pessoa informa o mesmo e-mail do convite e define sua própria senha. E-mail diferente, link inválido, revogado, usado ou vencido não cria conta.
4. O servidor valida e reserva o convite, cria a conta no Supabase Auth usando credencial administrativa somente no servidor e autentica a pessoa. A criação não depende de confirmação por e-mail, pois não há envio configurado.
5. A primeira sessão do owner vai para a configuração inicial, não para um painel sem loja. Ele informa nome e endereço do pet shop; CEP/ViaCEP preenche sugestões editáveis. A logo é opcional e também poderá ser adicionada depois.
6. Ao salvar, uma operação atômica cria o pet shop ativo, a associação `owner` e as categorias padrão que hoje forem necessárias ao painel. Em seguida, a pessoa entra no dashboard. Produtos, serviços e financeiro continuam disponíveis na ordem atual, sem checklist obrigatório.
7. Se sair antes de concluir, ao fazer login novamente a pessoa volta à configuração pendente. Não se cria pet shop fictício ou incompleto.

Nome do pet shop e endereço estruturado serão obrigatórios; número poderá ser informado separadamente. Complemento e referência, telefone, e-mail comercial e logo permanecem opcionais. A resposta do ViaCEP será editável, não uma fonte de verdade imutável.

### 2.3 Convite de employee

1. Um owner informa o e-mail do colaborador na área de equipe e cria o convite; recebe um link copiável com validade de sete dias.
2. O colaborador abre o link, informa o e-mail idêntico ao convite e define a própria senha.
3. Depois da criação da conta, o sistema associa o usuário ao pet shop do convite com papel `employee` e o envia ao dashboard.

Employees usarão as funcionalidades existentes do pet shop. Nesta etapa, a única diferença funcional de papel será que somente `owner` pode criar convites/gerenciar a equipe. Não será introduzida uma matriz geral de permissões. Não faz parte deste escopo remover ou desativar individualmente employees.

### 2.4 Login, sessão e hosts

Os hosts separam a interface, mas a autorização vem do banco:

- `admin.dominio`: somente membros de `private.platform_admins` acessam o painel de admin;
- `painel.dominio`: somente usuários com membership válido acessam o painel do pet shop;
- `admin.localhost:PORT` e `localhost:PORT` representam esses hosts em desenvolvimento, com URLs canônicas de admin e painel em configuração de ambiente.

O proxy pode direcionar rotas e exigir sessão, mas cada página, action, route handler, RPC e leitura/escrita protegida deve autorizar o usuário no servidor/banco. Cookies de sessão permanecem host-only. Login/callback no host de admin não deve conceder membership de pet shop, nem o inverso.

O owner que ainda tem configuração pendente é direcionado a ela após login. Employee e owner já configurados vão ao dashboard. Usuário sem autorização no host acessado recebe resposta de acesso negado clara, sem confiar em papel ou loja enviados pelo navegador.

## 3. Modelo de autorização e dados

### 3.1 Administradores globais

- Criar `private.platform_admins`, ligada a `auth.users`, sem exposição ao cliente/browser.
- Bootstrap com autorização inicial de e-mail e hash de segredo de uso único, preparada no banco antes da criação da conta no Supabase Auth. O trigger confere os dois valores, consome a autorização, remove o segredo dos metadados recebidos e registra o usuário como administrador.
- Não usar role/booleano de `user_metadata`, uma senha compartilhada ou a existência de um hostname como prova de admin. A confirmação temporária de bootstrap é um segredo portador de uso único, comparado a um hash privado.
- O admin não precisa ter membership de pet shop.

O caminho exato de bootstrap deve ser incluído na migration/instrução operacional e validado contra o trigger atual que bloqueia inserções em `auth.users`. Não inserir credenciais, segredo em claro ou e-mails pessoais no repositório.

### 3.2 Convites

Usar uma tabela privada comum para os dois tipos de convite, distinguindo `store_owner` e `employee`. Campos essenciais: tipo, e-mail normalizado, hash do token, validade, criador, loja associada somente para employee, estado de reserva/processamento, consumido/revogado em, e usuário que aceitou. RLS e grants devem impedir leitura ou alteração pelo cliente; operações passam por funções/handlers de servidor com autorização explícita.

- Gerar token criptograficamente aleatório de pelo menos 256 bits; guardar só o hash. O token original é mostrado somente na criação e mantido temporariamente na interface para copiar.
- Normalizar e-mail removendo espaços externos e aplicando comparação sem distinção de caixa. Não aplicar regras específicas de provedores (pontos/alias Gmail, por exemplo).
- Vencimento em UTC, exatamente sete dias após a criação. Aceitação deve validar validade, estado, tipo, e-mail e loja na mesma operação que reserva/consome o convite.
- Permitir revogar convite ainda pendente. Para recriar para o mesmo e-mail/loja, revogar o pendente anterior. A tela pode mostrar e-mail, estado e validade; nunca mostrar ou persistir o token em claro.
- Se o link for perdido, revogar e emitir outro. O admin/owner copia e envia o link manualmente.
- E-mail idêntico ao convite vincula a criação àquele endereço, mas sem SMTP/validação de caixa postal não comprova que a pessoa controla o e-mail. O link também é um segredo portador: quem o obtiver pode tentar usá-lo, sujeito ao e-mail e senha que informar. Não afirmar que existe verificação de propriedade da caixa postal.
- Uma conta Auth já existente não pode aceitar um convite para criar uma segunda conta enquanto a regra for um usuário/um pet shop. A tela deve orientar a emitir convite para um e-mail ainda não cadastrado; suporte a associar conta existente fica fora deste escopo.

A criação do usuário no Supabase Auth e as gravações no banco não compartilham uma transação distribuída. Para evitar corrida ou convite reutilizado, a implementação deve reservar o convite atomicamente com identificador de operação e prazo curto; o trigger de `auth.users` valida essa reserva e consome o convite na mesma transação em que cria o estado de onboarding ou membership. Handlers precisam ser idempotentes e tratar timeout/resultado incerto consultando o usuário/convite antes de liberar ou tentar novamente. Reserva expirada pode ser retomada; reserva ativa não pode ser usada em paralelo.

### 3.3 Memberships e estado de onboarding

- Reintroduzir `store_memberships.role` com restrição fechada em `owner` e `employee`. O papel no banco será a fonte canônica; não duplicar o owner em `stores.owner_user_id`.
- Garantir no banco no máximo um membership por usuário e um owner por loja. Uma loja ativa precisa de exatamente um owner após configuração.
- Convite de owner aceito cria estado privado de `pending_store_setup`; somente o RPC protegido de conclusão pode criar uma loja e membership owner. Convite employee aceito cria membership employee na loja indicada. Ambos os caminhos dependem de convite válido consumido pelo trigger.
- Criar loja, membership owner e dados padrão requeridos em uma função atômica, que também verifica que o usuário autenticado é o dono do onboarding pendente e ainda não possui loja.
- Contexto de autenticação deve retornar loja e papel explicitamente, validar no máximo uma associação e reconhecer onboarding pendente. Não escolher arbitrariamente o primeiro membership.
- Não haverá transferência de ownership na interface nesta fase. Recuperação normal de senha segue o fluxo atual; se o owner perder acesso permanentemente ou não houver acesso ao e-mail, a recuperação/transferência exigirá intervenção operacional controlada no Supabase. O procedimento deverá preservar a regra de um único owner e não será uma ação livre de employee.

### 3.4 Status da loja e autorização de tenant

Adicionar status de plataforma independente de `stores.archived_at` (por exemplo, `platform_active`, default `true`). Desativar/reativar muda somente esse status; não apaga loja, memberships ou dados de negócio. Owners não podem alterar esse status.

Toda rota/RPC/RLS de dados do pet shop deve exigir membership ativo **e** loja ativa. As políticas de Storage também devem consultar a loja ativa. A checagem de `owner` fica restrita à gestão da equipe e demais operações explicitamente owner-only; as políticas comuns de negócio continuam funcionando para ambos os papéis nesta fase.

Ao desativar uma loja, a próxima requisição autenticada deve bloquear o painel e operações de dados, exibindo estado de loja desativada. A sessão do Supabase pode continuar válida; reativar a loja restabelece o acesso sem recriar dados. Logos privadas são servidas por uma rota autenticada que consulta membership e estado da loja em cada requisição, sem criar novos links assinados. Links assinados emitidos antes desta implementação não são revogáveis retroativamente e podem continuar válidos até o vencimento original; arquivos já baixados permanecem fora do controle da plataforma.

## 4. Painéis e experiência

### Admin da plataforma

- login no host de admin;
- lista de pet shops com nome, owner, estado ativo/inativo e ação para ativar/desativar;
- criação de convite de owner por e-mail, exibição/cópia do link, validade e estado (pendente, usado, expirado ou revogado);
- revogação de convites pendentes;
- nenhuma ação de exclusão de loja ou edição de seus dados de negócio.

### Painel do pet shop

- retirar o cadastro público e a senha global de cadastro;
- tela de aceitação de convite e criação de senha;
- configuração inicial do pet shop, reutilizando padrões/componentes atuais de endereço/ViaCEP e upload de logo onde for adequado;
- área de equipe para owner criar/copiar/revogar convites employee e visualizar estado/validade;
- login existente continua, com redirecionamento guiado pelo estado da conta;
- manter produtos, serviços, financeiro, configurações e demais telas existentes.

As URLs canônicas do painel e do admin devem ser configurações explícitas de ambiente, distintas por host. Em desenvolvimento, documentar como subir/resolver os dois hosts; se `admin.localhost` não resolver no ambiente do usuário, usar alias local equivalente sem mudar a regra de autorização.

## 5. Migração e compatibilidade dos dados atuais

Não apagar dados de teste por padrão. A migração deve ser aditiva e parar com diagnóstico se não conseguir atribuir owners com segurança.

1. Antes de migrar, inventariar lojas, memberships, contas e políticas; não assumir que todo usuário atual é admin.
2. Para lojas existentes: marcar `platform_active = true`. Associar como owner somente quando houver exatamente um usuário/membership elegível sem ambiguidade. Loja sem membro, com múltiplos candidatos, ou com membership inconsistente deve interromper o backfill e listar os casos para decisão, preservando as linhas. Não promover todos os usuários a admin.
3. Criar tabelas privadas, índices, restrições, funções e políticas sem abrir acesso direto via API.
4. Trocar o gate da senha global por validação de convite/bootstrap; retirar o provisionamento automático de loja no trigger genérico de `auth.users`; remover referências a `registration_store_name`/registration ticket depois da migração para o fluxo novo.
5. Atualizar autorização das funções/RLS/Storage e contexto de auth antes de expor a nova interface.
6. Desativar/remover a instrução antiga `sql/alterar-senha-cadastro.sql` ou substituí-la por procedimento de bootstrap do admin, para não manter dois modelos operacionais.

O levantamento atual indica um gate global em `supabase/migrations/20261021000300_signup_gate.sql`, provisionamento adicional em migrations posteriores, papel/owner removidos em `20261021001100`, e seleção de membership sem papel em `src/lib/auth/context.ts`. `stores.archived_at` já tem semântica própria e não deve ser reaproveitado como status da plataforma. Políticas tenant e de Storage hoje dependem de membership, então precisam ser auditadas em conjunto, não apenas trocar o middleware.

Se o preflight encontrar somente dados inconsistentes de teste, a decisão de reset pode ser tomada com o inventário concreto em mãos. Não executar reset automático nem descartar dados durante a implementação sem mostrar primeiro o escopo afetado.

## 6. Segurança, falhas e operação

- Service role fica restrita ao servidor. Browser usa apenas sessão Supabase normal; nunca recebe chave administrativa.
- Host define destino/interface, não identidade nem autorização. URLs de retorno/callback vêm de configuração confiável e lista de hosts permitidos.
- Falhas de token/email retornam mensagem clara sem revelar se um e-mail arbitrário já tem conta. Não logar token, senha ou URL completa de convite.
- Corrida de duas aceitações, token vencido durante a reserva, falha do Auth Admin e timeout após criação devem ter tratamento idempotente e sem segunda loja/membership.
- Rejeitar criação pública direta no trigger/banco mesmo que a UI de signup seja acessada por URL direta.
- A recuperação de senha atual usa envio de e-mail do Supabase. O convite manual não configura esse envio; se SMTP/serviço de e-mail continuar indisponível, recuperação de senha permanecerá uma dependência operacional separada e poderá exigir recuperação manual pelo operador.
- Desativação deve ser aplicada por banco e servidor, não somente escondendo o painel. Endpoints que não passam pelo proxy também devem negar acesso.

## 7. Critérios de aceite do desenho

- Admin autorizado no Supabase entra em `admin.*`; usuário comum não entra no painel admin.
- Não há cadastro público nem senha compartilhada para cadastro.
- Convite de owner tem e-mail, token de uso único, validade de sete dias, cópia manual e revogação; cria conta e segue para configurar nome/endereço do pet shop, com logo opcional.
- Concluir onboarding cria uma única loja ativa e membership owner; reabrir sessão pendente retoma setup; nenhuma tela de produto/serviço/financeiro é obrigatória antes do dashboard.
- Owner cria convite employee; aceitação cria membership employee na mesma loja, sem criar uma segunda loja.
- Conta cadastrada não pode pertencer a duas lojas nesta fase.
- Owner e employee seguem as mesmas permissões atuais de funcionalidades do pet shop; apenas a gestão de equipe é owner-only.
- Admin desativa/reativa uma loja preservando loja, membership e dados; enquanto inativa, rotas, RPCs, Storage e telas do tenant não permitem operação.
- Lojas existentes têm backfill seguro ou a migração para com relatório acionável, sem apagar ou atribuir ownership ambíguo.

## 8. Limites de verificação desta implementação

A implementação foi revisada estaticamente, incluindo fluxos de login e convites, onboarding, roles, host routing, migration, triggers, grants, RLS, Storage e documentação operacional. O repositório proíbe comandos `test`, `typecheck`, `build` e `lint`, e determina que não sejam executados testes; portanto, não há validação dinâmica nem confirmação em ambiente Supabase. A migration permanece sem aplicação, e o preflight deve ser executado e revisado antes de qualquer rollout. Links assinados de logos emitidos antes da mudança podem continuar válidos até o vencimento original.

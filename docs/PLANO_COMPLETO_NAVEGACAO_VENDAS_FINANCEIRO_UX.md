# Plano completo — navegação, vendas, financeiro e experiência de uso

**Status:** planejamento revisado; nenhuma implementação iniciada.  
**Data:** 21/10/2026  
**Objetivo:** organizar as áreas do pet shop e corrigir os fluxos identificados com regras previsíveis, informação fácil de localizar e interface profissional, elegante e funcional.

Este documento consolida as decisões mais recentes do usuário. Se uma anotação anterior conflitar com este plano, prevalece a decisão registrada aqui. Em especial: **CEP/ViaCEP é usado para endereço da loja e endereço de entrega ao cliente; CNPJ é usado para fornecedor.**

## 1. Resultado esperado

Ao terminar a implementação:

- Cada área importante terá um destino claro na navegação, sem criar uma página ou um item de sidebar para toda ação.
- Configurações continuará no dropdown do cabeçalho.
- Vendas e Financeiro terão uma página principal de acompanhamento. Cadastros e ações transacionais acontecerão em diálogos apropriados.
- Serviços e Fornecedores serão áreas acessíveis por páginas próprias, fora de Configurações.
- Endereços, quantidades, valores, datas e totais seguirão as regras deste documento tanto na interface quanto nas ações do servidor e no banco.
- Todas as telas alteradas terão estados de carregamento, vazio, erro e sucesso coerentes, além de comportamento responsivo e acessível.

## 2. Decisões funcionais confirmadas

| Área | Decisão |
| --- | --- |
| Configurações | Continua no dropdown do cabeçalho; não ocupa item da sidebar. |
| Sidebar | Agrupa áreas de trabalho. Não cria subitem para toda ação, aba ou filtro. |
| Vendas | Uma página lista as vendas realizadas e mostra indicadores úteis. “Nova venda” abre diálogo quase em tela cheia, sem fluxo principal em uma página separada. |
| Entrega | A venda pode incluir entrega. O valor da entrega é informado manualmente em cada venda, por enquanto. |
| CEP | ViaCEP é usado para o endereço da loja e para o endereço de entrega ao cliente. Não é usado para consulta de CNPJ. |
| Fornecedor | CNPJ é consultado no cadastro/edição do fornecedor, pode preencher dados como sugestão e fica salvo no fornecedor. |
| Serviço | Serviços têm página própria, fora de Configurações. |
| Fornecedor | Fornecedores têm página própria, fora de Configurações. |
| Financeiro | Uma página principal com resumo e movimentações. Caixa, a receber e a pagar são visualizações internas, não itens da sidebar. Ações e detalhes usam diálogos. |
| Categorias | Gerenciamento permanece relacionado a Estoque, mas o acesso deve ficar explícito e contextual. |
| Quantidade | `un`, `pacote`, `caixa`, `g` e `ml` usam quantidade inteira; `kg` e `L` aceitam frações de até três casas. Não haverá campo manual de “casas decimais”. |
| Fuso | Usar sempre `America/Sao_Paulo`; remover seletor e avisos de fuso da interface. |
| Exportação | Todos os tipos exportáveis devem gerar planilhas Excel `.xlsx`. |
| Interface | Visual elegante, funcional, legível, responsivo e consistente. Skeletons, estados e feedback fazem parte do escopo, não são acabamento opcional. |

## 3. Arquitetura de navegação

### 3.1 Estrutura proposta

| Grupo/posição | Destino | Conteúdo principal |
| --- | --- | --- |
| Principal | Visão geral (`/dashboard`) | Indicadores, atalhos contextuais e acesso para abrir caixa quando estiver fechado. |
| Atendimento | Agenda (`/agenda`) | Agenda e gerenciamento dos atendimentos. |
| Atendimento | Clientes (`/clientes`) | Cadastro, consulta e histórico de clientes, pets e endereços. |
| Atendimento | Vendas (`/vendas`) | Indicadores e vendas realizadas; criação e detalhes por diálogo. |
| Atendimento | Entregas (`/entregas`) | Acompanhamento das etapas de entrega. |
| Gestão | Estoque (`/estoque`) | Produtos, categorias, movimentações, contagens e recebimentos de mercadoria. |
| Gestão | Serviços (`/servicos`) | Consulta, criação, edição, arquivamento e reativação de serviços. |
| Gestão | Fornecedores (`/fornecedores`) | Consulta, cadastro, edição, arquivamento e reativação de fornecedores. |
| Financeiro | Financeiro (`/financeiro`) | Resumo e movimentações com visualizações internas de caixa, recebíveis e pagamentos. |
| Cabeçalho | Configurações (`/configuracoes`) | Perfil da loja, endereço e logo. Acesso no dropdown existente do cabeçalho. |

Os nomes dos grupos são rótulos de organização; os destinos acima são links diretos. A sidebar não terá subitens para “Nova venda”, “Vendas realizadas”, abas financeiras, categorias ou exportações. Esses recursos ficam no contexto da página correspondente.

### 3.2 Comportamento da navegação

- Indicar claramente a rota ativa e o grupo a que ela pertence.
- Manter nomes curtos, específicos e consistentes com os títulos das páginas.
- Em sidebar expandida, o controle de recolher aponta para a esquerda; recolhida, aponta para a direita.
- A seta gira com transição curta ao alternar o estado. O controle deve permanecer inteiro e clicável, sem ser cortado por `overflow`, header ou stacking context.
- Preservar a preferência de sidebar existente.
- Em telas estreitas, usar o comportamento móvel já previsto pelo componente de sidebar, sem comprimir os links nem esconder os rótulos enquanto o menu estiver aberto.
- Configurações continua alcançável pelo dropdown do cabeçalho em todos os estados da sidebar.

### 3.3 Compatibilidade da rota de nova venda

O caminho existente `/vendas/nova` não deve continuar apresentando uma página separada como fluxo principal. Para não quebrar links existentes, ele deve redirecionar para a página de vendas com o diálogo aberto, usando estado de URL equivalente a `/vendas?nova=1`. Fechar o diálogo remove esse estado e mantém a lista. A implementação deve respeitar voltar/avançar do navegador e não abrir diálogos duplicados durante navegação ou refresh.

## 4. Especificação por área

### 4.1 Visão geral

- Manter indicadores e conteúdo existente que ainda sejam úteis.
- Quando não houver sessão de caixa aberta, oferecer uma ação primária **Abrir caixa**, que abre o diálogo existente de abertura.
- Ao abrir, atualizar o estado do dashboard e da área financeira; não exigir reload manual.
- Quando já houver caixa aberto, não mostrar a ação de abertura como se ainda fosse necessária.
- Os atalhos devem levar a páginas existentes e não criar rotas duplicadas para a mesma ação.

### 4.2 Página de Vendas

#### Conteúdo da página

- Título **Vendas**, descrição curta e ação primária **Nova venda**.
- Indicadores compactos e úteis para o período selecionado: faturamento, quantidade de vendas e ticket médio. Incluir indicador operacional de vendas canceladas/devolvidas ou entregas somente se isso ajudar a decidir o próximo passo; não acumular cartões redundantes.
- Busca por cliente ou número da venda.
- Filtros de período e status (por exemplo, pagas, a receber, canceladas e devolvidas) claramente visíveis e combináveis.
- Lista de vendas realizadas como conteúdo principal, com data, número, cliente, status, entrega quando aplicável e total.
- Em viewport estreito, transformar linhas em cartões legíveis, sem esconder total ou status.
- Selecionar uma venda abre diálogo de detalhes. Ações existentes de cancelamento e devolução permanecem acessíveis e confirmadas, com motivo quando exigido.
- Exportação de vendas em XLSX permanece contextual à página e respeita o filtro aplicável.

#### Diálogo de nova venda

- Abrir em tamanho quase integral da viewport em desktop; ocupar a viewport disponível em telas pequenas, com conteúdo rolável, cabeçalho e ações de conclusão sempre acessíveis.
- Reaproveitar o fluxo e as regras atuais: escolha de cliente, produtos, embalagens/códigos, serviços, vínculo opcional a atendimento, desconto, formas de pagamento, pagamento dividido, fiado quando permitido, exigência de caixa para dinheiro e idempotência.
- O rótulo atualmente confuso **“Atendimento pronto”** deve ser explicado como vínculo opcional com um atendimento concluído, por exemplo **“Vincular atendimento concluído (opcional)”**, com texto curto explicando o efeito.
- Ao concluir a venda, validar os campos no cliente e novamente no servidor. Desabilitar o envio enquanto a operação estiver pendente.
- Em falha, manter os dados da venda e informar o campo ou ação que precisa de atenção. Em sucesso, fechar o diálogo, atualizar a lista e os indicadores, e dar confirmação sem obrigar o usuário a recarregar.

#### Entrega dentro da venda

- A opção **Registrar entrega** revela os campos de endereço e o valor manual.
- Permitir selecionar um endereço já salvo para o cliente ou informar outro endereço para essa venda.
- Adicionar CEP, rua/logradouro, número, complemento, bairro, cidade, UF e observação/referência como campos separados. Número, complemento e referência são opcionais; rua e cidade continuam obrigatórios quando a entrega exigir esses dados.
- O CEP aceita somente números e tem máscara apenas visual. Consultar ViaCEP depois de o usuário preencher oito dígitos, com debounce, estado de consulta e prevenção de resposta fora de ordem.
- ViaCEP preenche logradouro, bairro, cidade e UF. O número, complemento, referência e outros campos manuais não podem ser apagados pela consulta. O usuário pode editar tudo depois do preenchimento.
- Tratar CEP incompleto, não encontrado, indisponibilidade e erro de rede com mensagens no próprio formulário e permitir continuar manualmente quando os campos obrigatórios estiverem preenchidos.
- Campo **Valor da entrega (R$)** manual, não derivado do CEP nem de tabela automática. Valor padrão `R$ 0,00`; aceitar zero para entrega gratuita e rejeitar valores negativos ou formato inválido.
- Incluir o valor no total exibido e gravado pela operação de venda/entrega. Sem entrega, enviar valor zero e nenhum endereço de entrega.
- Salvar os dados de entrega como snapshot da venda, sem alterar silenciosamente o endereço cadastrado do cliente.

### 4.3 Página de Financeiro

#### Conteúdo e visualizações

- Uma única página `/financeiro` reúne resumo, caixa e movimentações.
- Manter visualizações internas para **Caixa**, **A receber** e **A pagar**, com ícones da mesma família visual. As abas não viram links de sidebar.
- Resumo compacto com estado do caixa, entradas, pagamentos/saídas e valores em aberto relevantes. Filtros de período e estado devem ser claros e não criar indicadores duplicados.
- Listas permanecem na página; abrir uma movimentação mostra detalhes em diálogo. Não colocar tabelas extensas dentro de diálogos.
- Ações como abrir/fechar caixa, lançar despesa e registrar recebimento/pagamento usam diálogos consistentes com os componentes existentes.
- A ação **Nova despesa** deve ficar no contexto de A pagar. As despesas avulsas aparecem diferenciadas das contas geradas por recebimento de mercadoria.
- Exportações financeiras são ações contextuais da página e devem resultar em XLSX.

#### Integridade financeira

- Preservar abertura/fechamento de caixa, diferença de fechamento, justificativa, movimentos, pagamentos parciais e exigência de sessão para operações em dinheiro conforme as regras existentes.
- Preservar a operação de recebimento de mercadoria que cria o recebimento e a conta a pagar relacionada de maneira transacional/idempotente. Não criar uma segunda conta ao atualizar a tela, repetir a solicitação ou “Pagar agora”.
- Distinguir claramente a origem da conta a pagar: recebimento de mercadoria ou despesa avulsa.
- Após qualquer ação confirmada, atualizar saldo, lista, resumo e estado do caixa de forma coerente.

### 4.4 Estoque, categorias e unidade de medida

- Manter produtos, movimentações, contagem e conversão para granel na área de Estoque.
- Tornar o acesso a categorias explícito. Renomear o botão genérico atual **“Categorias”** para **“Gerenciar categorias”**, com ícone adequado e posição próxima ao catálogo de produtos.
- O diálogo deve deixar evidente que administra categorias de produtos e oferecer criar, editar, arquivar e reativar com feedback e proteção contra perda de vínculos históricos.
- Remover do formulário o campo **“Casas decimais”**.
- Determinar a quantidade pela unidade: `un`, `pacote`, `caixa`, `g` e `ml` aceitam somente números inteiros; `kg` e `L` aceitam frações de até três casas. Para `g` e `ml`, o incremento mínimo é uma unidade inteira (um grama ou um mililitro). O valor interno de precisão será derivado da unidade (`0` para unidades inteiras e `3` para `kg`/`L`) e nunca editado no formulário.
- Usar a mesma regra em cadastro, ajuste, contagem, recebimento, conversão de embalagem/granel, venda, devolução e validação do servidor. A interface deve exibir a unidade junto ao campo, como **Quantidade (kg)**.
- O servidor deve rejeitar fração em unidade inteira e precisão maior do que três casas em `kg`/`L`; não arredondar silenciosamente. A escala numérica do banco já suporta até três casas, mas deve ser conferida contra todas as RPCs e ações antes da implementação.
- Preços e custos continuam monetários em centavos; não são afetados pela regra de quantidade.
- Recebimento de mercadoria permanece em Estoque, onde o impacto sobre saldo e fornecedor faz sentido. Tornar o botão e o histórico/aba de movimentações fáceis de localizar, sem criar uma nova área na sidebar.

### 4.5 Serviços

- Criar destino `/servicos` e uma página própria, fora de Configurações.
- Reaproveitar as tabelas, ações e regras de preço/duração já existentes; não duplicar catálogo nem criar outra fonte de verdade.
- Mostrar serviços ativos por padrão, busca, dados essenciais (nome, duração, preço e estado) e acesso claro a arquivados/reativação.
- Criar e editar em diálogos consistentes, com validação, estado de salvamento e atualização da lista.
- Mudanças no serviço não devem reescrever o histórico de agendamentos ou vendas que já registram snapshots.

### 4.6 Fornecedores e consulta de CNPJ

- Criar destino `/fornecedores` e página própria, fora de Configurações.
- Reaproveitar a tabela e as ações existentes; manter cadastro, edição, arquivamento e reativação.
- Lista com busca e informações úteis: nome de exibição, CNPJ, telefone/e-mail, cidade e situação. Mostrar vazios de contato sem quebrar o layout.
- No cadastro e edição, a consulta de CNPJ é exclusiva do fornecedor. A ação explícita **Consultar CNPJ** aparece quando o valor está válido; evitar chamadas a cada tecla.
- Usar OpenCNPJ como provedor gratuito para pré-preencher os campos compatíveis com o modelo atual. A documentação do provedor informa acesso sem chave; os dados são uma sugestão e não devem ser apresentados como validação fiscal oficial ou garantia de atualização. [Documentação da API OpenCNPJ](https://opencnpj.com/api) · [Informações sobre a base](https://opencnpj.org/bigquery)
- Fazer a chamada por uma camada do servidor para normalizar a resposta, aplicar timeout, tratar indisponibilidade e manter o formulário manual como alternativa. Não introduzir chave secreta inexistente nem bloquear o cadastro quando a consulta falhar.
- Preservar campos editados manualmente. Se a consulta preencher um campo que já contém valor, pedir confirmação ou não sobrescrever silenciosamente.
- Validar e normalizar o CNPJ conforme o contrato de entrada e as regras de banco. O esquema local atual admite o formato definido na migration `20261021001100_catalogs_and_single_user.sql` e possui unicidade por loja para CNPJ informado; manter essa proteção e exibir uma mensagem legível para duplicidade.
- O retorno da consulta pode ajudar a preencher nome e endereço. Não adicionar campos de razão social, natureza jurídica ou situação cadastral ao banco sem necessidade funcional aprovada.

### 4.7 Configurações da loja e ViaCEP

- Configurações continua acessível no dropdown existente do cabeçalho.
- Retirar de Configurações a administração de serviços e fornecedores. Manter nesta página perfil, logo e dados da loja.
- Completar os campos visíveis de endereço da loja usando o JSON já armazenado: CEP, logradouro, número, complemento, bairro, cidade, UF e referência quando pertinente.
- Usar o mesmo componente/regra de consulta de CEP da entrega, sem misturar com consulta por CNPJ.
- Salvar apenas os campos de endereço definidos, preservando outras chaves existentes do JSON e sem apagar campos não mostrados.
- Remover o seletor de fuso. Normalizar a loja para `America/Sao_Paulo` e impedir que as ações da aplicação salvem outro valor.

### 4.8 Agenda e Entregas

- O título do mini calendário deve acompanhar o mês atualmente visível. Navegar entre meses atualiza título e grade; selecionar um dia atualiza o dia da agenda. O estado do dia selecionado e o estado do mês visível não devem se contradizer.
- A página de Entregas deixa de exibir o texto “Atualizado no fuso da loja” ou equivalente. Datas e horas continuam formatadas corretamente em São Paulo.
- Preservar etapas, histórico, cancelamento de entrega separado de cancelamento da venda, controle de versão e alternativa acessível ao drag-and-drop.

## 5. Regras compartilhadas e contratos de dados

### 5.1 CEP e ViaCEP

- Reutilizar uma implementação de endereço para Configurações e venda, evitando regras duplicadas.
- Aceitar somente dígitos no estado submetido; máscara é apresentação, não parte do valor salvo.
- Consultar apenas depois de oito dígitos, com debounce e cancelamento/ignorância de resposta antiga.
- Indicar consulta, endereço encontrado, CEP inválido/não encontrado e indisponibilidade por mensagem próxima ao campo.
- Não bloquear preenchimento manual por indisponibilidade externa.
- A consulta não muda cliente selecionado, endereço salvo do cliente nem campos pessoais; na venda, compõe o snapshot de entrega daquela operação.

### 5.2 CNPJ

- CNPJ só aparece no fluxo de Fornecedores.
- Fazer consulta sob ação do usuário após entrada válida, evitando tráfego desnecessário.
- Resposta externa nunca substitui validação do servidor nem regras de unicidade por loja.
- Indisponibilidade, limite do provedor, CNPJ sem registro e resposta incompleta devem deixar o usuário corrigir ou continuar manualmente.
- Não afirmar que uma resposta confirma regularidade fiscal.

### 5.3 Fuso horário

- Usar `America/Sao_Paulo` em formatação, filtros por dia, agenda, dashboard, vendas, financeiro, entregas e relatórios/exportações.
- A auditoria deve localizar chamadas que atualmente leem `stores.timezone`, inclusive funções SQL/RPC, e garantir que o valor esteja fixo.
- Manter a coluna existente se for útil para compatibilidade, mas remover edição na UI e atualizar valores antigos para São Paulo em migration idempotente, após conferir a estratégia de migração.
- Não imprimir o nome do fuso para o usuário em rodapés de atualização.

### 5.4 Precisão de quantidades

- Representar a regra como classificação interna de unidade, não como escolha do usuário: `un`, `pacote`, `caixa`, `g` e `ml` são inteiras; `kg` e `L` aceitam até três casas.
- Validar no formulário e no servidor; para operações que chegam a RPC, validar também na RPC/banco para impedir que uma chamada fora da UI viole a regra.
- Aplicar formatação pt-BR sem zeros finais desnecessários e exibir sempre o sufixo da unidade.
- Antes de alterar `unit_precision`, revisar conversões, produtos a granel, embalagens, lotes, devoluções e contagem de estoque. Não migrar dados nem arredondar existentes sem identificar valores que ficariam inválidos.

## 6. Correções de erros já observados

### 6.1 Chaves duplicadas de diálogos

Em `settings-view.tsx`, os diálogos de Serviço e Fornecedor podem receber a mesma chave `false-new`, gerando o aviso de filhos com a mesma key. A migração das telas elimina esses diálogos da página de Configurações; ainda assim, cada página/componente deve usar identidade estável e única ou controlar explicitamente o reset de formulário, sem chaves calculadas que colidam.

**Aceite:** abrir/fechar cadastro e edição de serviço e fornecedor não gera warning de key, não reutiliza dados do formulário anterior e não mantém estado incorreto ao alternar entre novo/edição.

### 6.2 Upload de logo acima do limite da Server Action

A interface e a ação aceitam arquivo de até 2 MiB, enquanto o limite padrão de corpo de Server Actions do Next é 1 MiB. Isso provoca `Body exceeded 1 MB limit` antes da validação da ação.

**Plano:** consultar a documentação local da versão instalada do Next 16 antes da mudança; configurar o limite de Server Actions um pouco acima do tamanho máximo aceito, com margem para multipart, mantendo a validação estrita de 2 MiB e formatos de imagem no servidor. Não elevar o limite sem necessidade. Preservar feedback de upload, falha, substituição e remoção.

**Aceite:** arquivo válido até 2 MiB é enviado; arquivo maior ou tipo não permitido é recusado com mensagem clara; falha de Storage não perde a logo anterior.

### 6.3 Exportação com `invalid_export_type`

A montagem atual combina uma rota que já pode ter `?type=...` com outra concatenação de `?`, corrompendo o parâmetro em alguns tipos. Corrigir a construção com `URL`/`URLSearchParams` e uma lista explícita de tipos permitidos.

Substituir CSV por XLSX para todos os tipos disponíveis (vendas, recebimentos, despesas e saldos em aberto), usando uma biblioteca compatível já instalada ou escolhida após verificar dependências. Preservar filtros de período e timezone. Escrever datas, valores e quantidades nos tipos/células adequados, aplicar formato de moeda/data e garantir que texto do usuário não seja interpretado como fórmula. Nomear arquivos e abas de forma clara.

**Aceite:** cada ação baixa arquivo `.xlsx` válido, com tipo de exportação correto, filtros aplicados, colunas legíveis e sem fórmula executável originada de texto externo.

## 7. Sistema visual e critérios de UI/UX

### 7.1 Direção visual

- Reaproveitar componentes locais Base UI/shadcn, tokens e a família de ícones já instalada. Não introduzir uma segunda biblioteca visual sem motivo técnico.
- Usar composição limpa, hierarquia evidente, superfícies e bordas discretas, cor de destaque restrita a ações/estados importantes e espaçamento consistente.
- “Premium” significa precisão e consistência visual, não acumular sombras, gradientes, cartões ou animações decorativas.
- Melhorar a legibilidade do app atual: textos operacionais, labels, ações, cabeçalhos e dados de tabela não devem depender de fonte minúscula para caber. Priorizar body em tamanho confortável, metadados ainda legíveis e números alinhados com algarismos tabulares.
- Uma ação principal por contexto; ações secundárias ficam em botões de menor ênfase ou menu contextual.
- Ícones são consistentes e acompanhados de rótulo quando o significado não for universal. Ícone sozinho requer nome acessível/tooltip.

### 7.2 Skeletons, loading e feedback

- Criar skeletons por estrutura de página: cabeçalho, resumo, filtros e linhas/cartões. Não deixar a tela inteira vazia com spinner genérico se já se conhece o formato do conteúdo.
- Mostrar loading local nas consultas ViaCEP/CNPJ, nos botões que salvam e nos diálogos com dados remotos.
- Enquanto uma mutação estiver pendente, bloquear reenvio da mesma ação e mostrar verbo de progresso coerente (por exemplo, “Salvando fornecedor…”).
- Estado vazio explica o que ainda não existe e apresenta a ação adequada para começar.
- Estado de erro explica o problema de forma acionável, oferece tentar novamente quando aplicável e preserva os dados digitados.
- Estado de sucesso confirma a ação e atualiza listas, indicadores e badges relacionados sem obrigar reload manual.
- Erros de campo ficam próximos ao campo. Erros de operação ficam no formulário/diálogo; não depender somente de toast que desaparece.
- Confirmar ações destrutivas ou financeiras irreversíveis conforme o padrão já usado no produto.

### 7.3 Acessibilidade, responsividade e movimento

- Todas as ações essenciais funcionam por teclado, com foco visível, labels associados e ordem de foco previsível.
- Respeitar contraste e estados que não dependam apenas de cor.
- Diálogos gerenciam foco, fechamento e rolagem corretamente; em telas estreitas podem ocupar a tela toda sem esconder o botão primário.
- Tabelas densas devem se adaptar para cartões/rolagem controlada no mobile sem perder ações essenciais.
- Animações curtas, funcionais e compatíveis com `prefers-reduced-motion`.
- Manter o controle da sidebar fora de áreas cortadas e em camada clicável acima do conteúdo pertinente.

## 8. Dependências e estado atual confirmado no código local

Esta lista orienta a auditoria e evita duplicar recursos existentes. O estado remoto do Supabase não foi consultado nesta etapa.

- A sidebar atual é plana em `src/components/layout/workspace-shell.tsx`; Configurações já é acessada pelo dropdown do cabeçalho.
- Existem rotas `/vendas` e `/vendas/nova`; a segunda apresenta o composer como página separada.
- O composer de venda já contempla itens, pagamentos, endereços salvos, endereço manual e valor de entrega. A venda já armazena `delivery_fee_cents`; a tabela de entregas armazena `address_snapshot` e `fee_cents`. A mudança deve estender a UI e preservar a operação financeira existente, sem criar coluna duplicada.
- O schema local inclui `suppliers.cnpj` e índice único por loja na migration `20261021001100_catalogs_and_single_user.sql`. A UI de fornecedor já coleta CNPJ e endereço dentro de Configurações; o trabalho é mover o catálogo para página própria e adicionar consulta/autocomplete. Confirmar que a migration 011 está aplicada no ambiente alvo antes de depender do campo.
- Serviços e fornecedores já possuem ações de criar/editar/arquivar/reativar em `src/features/settings/actions.ts`, e seus dados são carregados pelo módulo de Settings. Reaproveitar a lógica e realocar a responsabilidade para módulos/páginas próprios sem duplicar queries.
- O endereço da loja já é um JSON e armazena mais campos do que os atualmente mostrados; preservar os dados existentes ao salvar novos campos.
- O schema inclui unidades `un`, `kg`, `g`, `L`, `ml`, `pacote`, `caixa` e `unit_precision` de 0 a 3. O formulário atual expõe “Casas decimais”; inventariar cada uso dessa propriedade antes de derivá-la automaticamente.
- Recebimento de mercadoria já gera uma conta a pagar relacionada com `receipt_id`; há unicidade por recebimento e fluxo transacional/idempotente nas migrations atuais. Preservar.
- Financeiro já tem Caixa, A receber e A pagar internamente, mas as abas precisam de ícones consistentes e a página precisa funcionar como visão integrada.
- As rotas de exportação existem em `src/app/api/exports/sales/route.ts` e `src/app/api/exports/finance/route.ts`; `src/lib/csv-export.ts` produz CSV atualmente.
- `settings/actions.ts` valida imagem até 2 MiB e `next.config.ts` ainda não define um limite de corpo maior para Server Actions.
- O texto de fuso a remover fica atualmente no quadro de Entregas.
- A página de Agenda calcula o título do mini calendário a partir da data selecionada, enquanto a navegação interna do mês precisa atualizar o mês visível.

## 9. Plano de implementação por fases

### Fase 0 — Auditoria e contrato de implementação

1. Ler as instruções do repositório e a documentação local de Next.js 16 relevante a Server Actions, diálogos, carregamento e roteamento antes de editar código.
2. Confirmar rotas, queries, ações, componentes, estado de sidebar, skeletons/loading existentes e dependências de exportação.
3. Revisar migrations 001–011 e confirmar no ambiente identificado quais estão aplicadas, principalmente a 011 (CNPJ) e as funções de vendas/entrega/financeiro. Não alterar banco remoto sem verificar o alvo.
4. Mapear todos os usos de `unit_precision`, timezone e endereço para definir contratos antes de retirar campos da interface.
5. Confirmar se existe necessidade real de migration: CNPJ, `delivery_fee_cents`, `address_snapshot` e contas por recebimento já existem no schema local.

**Saída da fase:** mapa de arquivos/rotas, contrato de dados e lista de migrations estritamente necessárias, sem duplicar dados existentes.

### Fase 1 — Regras centrais e componentes compartilhados

1. Definir unidade contável versus unidade de medida e concentrar a regra de precisão para interface, ações, parsing e operações SQL/RPC.
2. Fixar timezone São Paulo nas regras de servidor, consultas, operações SQL e formatação; planejar migration idempotente para registros existentes se necessário.
3. Criar o componente/serviço ViaCEP reutilizável para endereço da loja e entrega, com debounce, cancelamento/controle de resposta, digitação manual e estados.
4. Criar camada de consulta CNPJ de fornecedor usando OpenCNPJ, com validação, timeout, normalização, tratamento de erros e fallback manual.
5. Definir padrão compartilhado de diálogo, feedback, loading e skeletons usando os componentes locais.

**Saída da fase:** regras únicas e reutilizáveis antes de integrá-las em várias telas.

### Fase 2 — Navegação e páginas de cadastro/gestão

1. Reorganizar a navegação em Visão geral, Atendimento, Gestão e Financeiro; Configurações continua somente no dropdown do cabeçalho.
2. Corrigir seta, rotação, posicionamento, camada e overflow do controle de sidebar.
3. Criar a página de Serviços reaproveitando dados e ações existentes; remover seu catálogo da tela de Configurações.
4. Criar a página de Fornecedores, mover o CRUD para ela e adicionar consulta CNPJ; remover fornecedores de Configurações.
5. Completar o endereço da loja com CEP/ViaCEP dentro de Configurações e preservar as demais chaves do endereço JSON.
6. Melhorar o acesso e o título do gerenciamento de categorias em Estoque; remover o seletor de casas decimais.

**Saída da fase:** IA consistente e cadastros encontrados sem procurar em uma tela genérica de configurações.

### Fase 3 — Vendas e entrega

1. Consolidar vendas realizadas e indicadores em `/vendas`.
2. Levar o composer existente para um diálogo quase fullscreen sem alterar as regras normais de venda.
3. Preservar o deep link de `/vendas/nova` abrindo esse diálogo a partir da listagem.
4. Adicionar CEP/ViaCEP ao endereço de entrega e separar número, complemento e observação.
5. Manter valor de entrega manual em cada venda, incluído no total e na operação transacional já existente.
6. Harmonizar quantidade decimal conforme unidade e clarificar o vínculo opcional com atendimento concluído.
7. Atualizar listagem, indicadores e feedback ao salvar; preservar busca/filtros e estado coerente ao abrir/fechar diálogo.

**Saída da fase:** venda completa sem abandonar a lista e endereço/valor de entrega confiáveis.

### Fase 4 — Financeiro e Visão geral

1. Organizar `/financeiro` como página principal de resumo e movimentações, sem criar item de sidebar para cada aba.
2. Adicionar ícones coerentes às abas internas de Caixa, A receber e A pagar.
3. Manter lançamentos, baixas e detalhes em diálogos; colocar Nova despesa no contexto de A pagar.
4. Tornar explícita a origem das contas e preservar o vínculo transacional de recebimento de mercadoria para conta a pagar.
5. Adicionar o botão condicional Abrir caixa em Visão geral, reutilizando a operação existente.
6. Atualizar indicadores/listas após ação financeira sem reenvio duplicado ou conta duplicada.

**Saída da fase:** leitura e ação financeira dentro de uma página, com integridade das operações preservada.

### Fase 5 — Agenda, Entregas, exportação e estabilidade

1. Controlar explicitamente o mês visível do mini calendário e sincronizar o título.
2. Remover texto de fuso de Entregas e garantir formatação São Paulo.
3. Corrigir os parâmetros da exportação e produzir XLSX para todos os tipos existentes.
4. Corrigir limite do corpo de Server Actions conforme documentação Next 16, com margem para multipart, mantendo limite de arquivo de 2 MiB.
5. Corrigir as keys dos diálogos e verificar os formulários de criação/edição/fechamento.
6. Uniformizar skeletons, mensagens, feedback e responsividade das telas modificadas.

**Saída da fase:** falhas relatadas corrigidas e comportamento global consistente.

### Fase 6 — Conferência manual de aceite

Conferir os fluxos em ambiente local/staging com usuário e dados controlados. Esta conferência é manual, de ponta a ponta e não substitui validação do estado real do banco remoto.

## 10. Critérios de aceite detalhados

### Navegação e shell

- [ ] Todos os destinos da estrutura proposta abrem a página correta e indicam a seção ativa.
- [ ] Serviços e Fornecedores são links próprios; Configurações segue no dropdown do cabeçalho.
- [ ] Não há item de sidebar para Nova venda, vendas realizadas, abas financeiras, categoria, recebimento, exportação ou cada ação.
- [ ] Controle da sidebar gira na direção correta, tem área clicável inteira e não é cortado em desktop/mobile.
- [ ] Rotas internas carregam estados coerentes sem conteúdo sem rótulo ou ação inacessível.

### Vendas e entrega

- [ ] `/vendas` mostra resumo e vendas realizadas; busca e filtros trabalham em conjunto.
- [ ] Nova venda abre diálogo quase fullscreen; fechar mantém a listagem; rota antiga abre o mesmo diálogo.
- [ ] Composer mantém os métodos de pagamento e validações atuais.
- [ ] Entrega opcional exige os campos necessários; não altera endereço salvo do cliente.
- [ ] CEP incompleto não consulta; CEP completo consulta ViaCEP com debounce; respostas atrasadas não sobrescrevem a busca atual.
- [ ] Falha do ViaCEP permite preenchimento manual; número/complemento/observação sobrevivem à consulta.
- [ ] Taxa de entrega manual aceita zero, soma ao total corretamente e não aparece quando venda não tem entrega.
- [ ] Após venda, lista, totais, entrega e status são atualizados sem refresh manual.
- [ ] Quantidade inteira/fração respeita a unidade tanto no composer quanto no servidor.

### Fornecedores e serviços

- [ ] Cadastro/edição/arquivamento/restauração de ambos funciona fora de Configurações.
- [ ] Fornecedor pode ser salvo sem consulta externa; CNPJ válido pode preencher dados; usuário pode revisar e corrigir antes de salvar.
- [ ] CNPJ duplicado por loja gera mensagem clara; indisponibilidade do provedor não bloqueia cadastro manual.
- [ ] Consulta não sobrescreve silenciosamente campos que o usuário já editou.
- [ ] Serviços atualizados continuam corretos no cadastro de agenda/venda e históricos antigos mantêm snapshots.

### Estoque, endereço e unidades

- [ ] Gerenciar categorias é fácil de encontrar e o diálogo identifica claramente o conteúdo.
- [ ] Não existe campo “Casas decimais” no cadastro do produto.
- [ ] `un`, `pacote`, `caixa`, `g` e `ml` não aceitam fração; `kg` e `L` aceitam até três casas em todos os fluxos.
- [ ] Ajuste, contagem, embalagem, conversão e recebimento seguem a mesma validação sem arredondar silenciosamente.
- [ ] Endereço da loja pesquisa CEP via ViaCEP e salva todos os campos aceitos preservando os demais dados existentes.

### Financeiro, fuso e exportações

- [ ] Financeiro é um destino único com resumo e abas internas acompanhadas de ícones.
- [ ] Abrir caixa aparece na Visão geral apenas se o caixa estiver fechado e atualiza o estado após ação.
- [ ] Recebimento cria exatamente a conta a pagar vinculada esperada; atualização/reenvio idempotente não duplica lançamentos.
- [ ] Datas, filtros por dia, agenda, caixa, vendas, entregas e relatórios usam São Paulo; UI não oferece outro fuso e não exibe aviso de fuso.
- [ ] Calendário atualiza título ao navegar mês; seleção do dia continua clara.
- [ ] Todos os tipos de exportação produzem XLSX válido, com filtros, colunas, datas e valores corretos.

### Upload e estados de interface

- [ ] Logo válido de até 2 MiB passa pelo limite completo da Server Action; maior que 2 MiB e MIME não aceito são recusados.
- [ ] A troca de logo não remove a anterior antes de a nova imagem ter sido salva com sucesso.
- [ ] Não há warning de keys duplicadas ao abrir/fechar ou alternar formulários.
- [ ] Cada página e diálogo tem loading, vazio, erro recuperável e confirmação de sucesso adequados.
- [ ] Formulários mantêm valores quando a operação falha; mutação pendente não pode ser submetida novamente.
- [ ] Tipografia, contraste, foco, teclado, rolagem de diálogo e layout móvel continuam legíveis e utilizáveis.

## 11. Riscos e medidas de prevenção

| Risco | Prevenção |
| --- | --- |
| Migration local não aplicada no Supabase alvo | Verificar o ambiente e o histórico de migrations antes de depender de `suppliers.cnpj`; não alterar remoto sem confirmar o alvo. |
| Consultas externas indisponíveis ou lentas | Timeout, estados locais, preenchimento manual e nenhuma dependência do provedor para salvar. |
| Resposta externa substituir correção manual | Preencher campos vazios ou pedir confirmação antes de substituir valores existentes. |
| Remover `unit_precision` visual quebrar estoque e conversões | Mapear todos os usos antes da alteração; derivar a regra de unidade em um só lugar; conferir dados e RPCs. |
| Taxa da entrega somada duas vezes | Usar a coluna e RPC existentes; conferir uma única origem no total da venda/entrega. |
| Diálogo fullscreen piorar fluxo no mobile | Tratar rolagem interna, cabeçalho/rodapé acessíveis, foco e escape; conferir larguras pequenas manualmente. |
| Aumentar limite da Server Action permitir payloads maiores em outras ações | Configurar apenas a margem necessária, manter limite do arquivo e validação MIME no servidor. |
| XLSX interpretar texto externo como fórmula | Forçar texto para células de texto, tipar valores e manter validação/normalização nos dados exportados. |
| Mudanças do fuso alterarem agrupamento histórico | Auditar consultas, funções SQL, intervalos de data e dados existentes; atualizar com migration idempotente e explicitar efeito esperado. |
| Atualização de interface mostrar dados desatualizados | Invalidar/atualizar dados de servidor e estado de página de forma coordenada após cada mutação bem-sucedida. |

## 12. Restrições de execução e conclusão

- O repositório instrui que não se executem `git`, `test`, `build`, `lint` ou `typecheck`, e declara que não se trabalhará com testes. A implementação deve respeitar essa restrição.
- Antes de escrever código, consultar as guias locais de Next.js em `node_modules/next/dist/docs/`, conforme `AGENTS.md`, principalmente para limite de Server Actions e APIs de navegação/diálogo que forem alteradas.
- A conferência prevista é manual, por fluxos e estados, com ambiente identificado. Não declarar integração remota, migrations, exportação ou comportamento financeiro verificados sem conferir no ambiente adequado.
- O planejamento não autoriza, por si só, alteração remota no Supabase, implantação, publicação ou mudança de dados de produção.
- **Não há decisão funcional pendente** neste escopo. Antes de codificar, permanecem apenas auditorias técnicas: confirmar migrations aplicadas no alvo, usos de `unit_precision`/timezone, disponibilidade de dependência XLSX e contrato real das APIs externas.


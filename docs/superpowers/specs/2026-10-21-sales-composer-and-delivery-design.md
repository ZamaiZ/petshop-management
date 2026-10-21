# Composer de vendas e entrega: design

## Intenção

Deixar o registro de venda confiável tanto pela página de Vendas quanto pela ação rápida do dashboard. O mesmo fluxo deve permitir selecionar produtos, ajustar quantidades no carrinho, escolher o cliente e registrar uma entrega com um endereço salvo ou novo.

## Resultados esperados

- O diálogo de nova venda abre pelos dois pontos de entrada e continua aceitando links diretos com `?nova=1`.
- Adicionar produto ou serviço atualiza o carrinho sem erro em tempo de execução; o controle de quantidade fica claro.
- Selecionar um cliente com endereços ativos preenche o endereço inicial. A pessoa pode escolher outro endereço ou preencher um novo.
- Salvar um endereço novo a partir da venda acrescenta um registro ao cliente e preserva todos os endereços existentes.
- A consulta de CEP usa uma rota da própria aplicação, diferencia CEP inexistente de indisponibilidade e mantém o preenchimento manual.
- Mensagens, estados de carregamento, validação e controles seguem os componentes e tokens atuais.

## Limites e decisões

- Reutilizar Next.js, Supabase, ações, componentes e estilos existentes; não adicionar dependências.
- Não alterar o esquema de banco nem a RPC `complete_sale`; a entrega continua recebendo um snapshot independente do cadastro.
- A tabela de endereços não tem campo de endereço principal. Por isso, a seleção inicial será o primeiro endereço ativo na ordem já fornecida pela consulta, e o seletor permitirá trocar.
- A ação existente de cadastro de endereço será reutilizada e passará a devolver o registro salvo para que o composer possa selecioná-lo sem substituir os anteriores.
- Não criar nem executar testes, conforme a instrução local. A revisão se limitará a inspeção do fluxo e às verificações permitidas.

## Arquivos envolvidos

- `src/features/sales/components/sales-view.tsx`: estado local do diálogo e sincronização com a URL.
- `src/features/sales/components/sale-composer.tsx`: remoção da referência inválida, affordance de produto, seleção e edição de endereço, salvamento no cadastro.
- `src/features/sales/actions.ts`: alinhar os limites de validação do snapshot da entrega aos limites dos endereços de cliente.
- `src/features/customers/actions.ts`: validação, persistência e retorno do endereço criado.
- `src/components/ui/cep-lookup-field.tsx`: consulta same-origin e tratamento dos estados da resposta.
- `src/app/api/cep/route.ts`: validação do CEP e proxy com timeout para o ViaCEP.

## Revisão de comportamento

- Abrir venda pela listagem, pelo dashboard e pela URL direta; fechar e abrir novamente.
- Adicionar produto e serviço, aumentar/diminuir quantidade e respeitar estoque disponível.
- Trocar cliente sem exceção; testar cliente sem endereço, com um endereço e com mais de um.
- Trocar para endereço existente, editar somente o snapshot da venda, e confirmar que o cadastro anterior permanece intacto.
- Salvar um novo endereço no cliente e confirmar que aparece selecionado junto dos endereços anteriores.
- Consultar CEP válido, CEP inválido, resposta indisponível e preencher manualmente.
- Revisar os fluxos em largura estreita e larga, incluindo os estados vazios e pendentes.

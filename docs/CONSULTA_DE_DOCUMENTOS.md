# Consulta de CPF e CNPJ

`/admin/consulta-documentos`, no grupo **Consultas** do menu. Foi pedida pelo dono em 18/10/2026. Serve para conferir o cadastro, o compliance e o crédito de quem compra, vende ou financia com a loja. As consultas são pagas e passam pela APIBrasil, com o mesmo `APIBRASIL_TOKEN` da consulta de veículos.

Quem usa: Administrador, Gestor, Comercial e Financeiro. O Marketing não vê o item no menu e o banco também recusa (RLS).

## Níveis

O preço de cada nível é a soma da tabela da APIBrasil de 18/10/2026. Ele aparece antes da consulta como referência. O valor exato vem em cada resposta do fornecedor, e é esse que fica no histórico.

### CPF

| Nível | Produtos | Referência |
|---|---|---|
| Básico | CPF Lite + Receita Federal | R$ 0,46 |
| Dados | CPF Dados | R$ 4,50 |
| Crédito | Análise de Crédito Plus PF | R$ 29,02 |
| **Completo econômico** | Acerta Essencial Positivo + CPF Dados | **R$ 8,99** |
| **Completo integral** | CPF Dados + Análise de Crédito Plus PF | **R$ 33,52** |

Nenhum pacote único da APIBrasil cobre os três níveis.

- **Completo econômico:** o Acerta Essencial Positivo traz score, pendências, protestos, cheques, ações, consultas anteriores e renda por R$ 4,49. Ele dispensa o Plus PF, mas não tem a frase de decisão do bureau nem os outros modelos de score.
- **Completo integral:** o Plus PF já traz nome, mãe, nascimento e situação na Receita, então o CPF Lite e a Receita Federal sairiam repetidos. Falta só a data da situação.

### CNPJ

| Nível | Produtos | Referência |
|---|---|---|
| Básico | CNPJ Cadastral + Receita Federal PJ v3 | R$ 6,90 |
| Dados | Cadastral Premium PJ | R$ 3,75 |
| Crédito | Análise de Crédito Basic PJ | R$ 10,06 |
| **Completo econômico** | CNPJ + CNPJ Cadastral + Dossiê de Crédito PJ | **R$ 4,99** |
| **Completo com score** | o econômico + Cadastral Score PJ | **R$ 6,29** |
| **Completo integral** | os quatro produtos dos três níveis | **R$ 20,71** |

O que cada nível traz e o que deixa de fora aparece no cartão do próprio nível, na tela.

## Antes de cobrar

1. **CPF ou CNPJ válido.** Os dígitos verificadores são conferidos e o CNPJ alfanumérico é aceito. Até aqui nada é chamado no fornecedor.
2. **Consultas recentes.** A tela mostra as consultas do mesmo documento feitas nos últimos 90 dias. Reabrir uma delas não custa.
3. **Finalidade (LGPD).** Uma destas: financiamento, venda a prazo, compra de veículo, cadastro de cliente, cadastro de fornecedor ou prevenção a fraude.
4. **Declaração.** Quem consulta marca que o titular está em negociação com a loja e sabe da consulta.
5. **Confirmação.** Uma janela diz o nível, os produtos e o valor de referência.

## Como a consulta roda

- Os produtos do nível são chamados ao mesmo tempo, sem nova tentativa automática.
- Se **todos** falharem, nada é salvo.
- Se **algum** falhar, o relatório sai com a parte que veio e uma seção **"Não veio nesta consulta"** com o motivo.
- Saldo zerado na APIBrasil (402) aparece com esse nome.
- No modo de teste (`APIBRASIL_HOMOLOGACAO=1`), as respostas trazem dados de exemplo, o custo fica R$ 0 e o relatório leva a faixa "MODO DE TESTE".
- As respostas brutas ficam guardadas (`respostas`), para refazer o relatório se o formato do fornecedor mudar. Elas nunca saem pelo link.

## Relatório, PDF e link

O mesmo HTML aparece na tela, sai em PDF e abre pelo link.

- **Na tela:** fica num quadro sem script.
- **Imprimir / salvar PDF:** abre o relatório numa aba, com o botão de imprimir. Para gerar o PDF, escolha "Salvar como PDF" no navegador.
- **Gerar link para enviar:** cria um endereço `/relatorio/<código>` que vale 7 dias e abre sem login. Serve para mandar ao banco, à financeira ou ao próprio titular.
  - O código só aparece uma vez. O banco guarda apenas o hash dele.
  - Cada link mostra quem o criou, quantas vezes foi aberto e a validade.
  - **Revogar** derruba o link imediatamente e não tem volta.
  - A página do link não carrega GTM, Pixel nem o aviso de cookies, não entra no Google e não fica em cache.

## Histórico

A aba **Histórico** pesquisa pelo nome ou razão social, ou pelo começo do CPF ou CNPJ, e filtra por tipo de documento.

- Na lista, o CPF aparece mascarado (`***.456.789-**`) e o CNPJ aparece inteiro.
- Abrir uma consulta do histórico não consulta de novo.
- O histórico não pode ser editado nem apagado (sem UPDATE/DELETE na RLS).

## Banco

A migração é `supabase/migrations/20261018120000_consultas_de_documento.sql`. Ela cria:

- a tabela `consultas_de_documento`;
- a tabela `relatorios_compartilhados`;
- a função `abrir_relatorio_compartilhado(p_token_hash)`. É a única porta do link público: ela confere a validade e a revogação, conta o acesso e devolve só o relatório montado.

## Ressalvas

Os formatos de resposta foram tirados dos exemplos da documentação da APIBrasil. Antes da primeira consulta paga, rode uma em modo de teste: se algum campo vier com outro nome, a seção correspondente cai em "Não veio nesta consulta", sem quebrar o relatório.

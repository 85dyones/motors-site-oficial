# Consulta de CPF e CNPJ

`/admin/consulta-documentos`, no grupo **Consultas** do menu. Foi pedida pelo dono em 18/10/2026. Serve para conferir o cadastro, o compliance e o crédito de quem compra, vende ou financia com a loja. As consultas são pagas e passam pela APIBrasil, com o mesmo `APIBRASIL_TOKEN` da consulta de veículos.

Quem usa: Administrador, Gestor, Comercial e Financeiro. O Marketing não vê o item no menu e o banco também recusa (RLS).

## Níveis

O preço de cada nível é a soma da tabela de preços vigente em `parametros_consulta_documento` (semeada com a tabela pública da APIBrasil de 18/10/2026). Ele aparece antes da consulta como referência, com a data da tabela. O valor exato vem em cada resposta do fornecedor (`valor_consulta`), e é esse que fica no histórico. Quando o fornecedor muda o preço, o Administrador abre uma nova vigência (`consulta_documento_nova_vigencia`), sem mexer no código.

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
2. **Consultas recentes.** A tela mostra as consultas do mesmo documento feitas na janela dos parâmetros (90 dias na semente), no mesmo modo do fornecedor: depois de sair do modo de teste, as consultas de teste não aparecem ali. Reabrir uma delas não custa.
3. **Finalidade (LGPD).** Uma destas: financiamento, venda a prazo, compra de veículo, cadastro de cliente, cadastro de fornecedor ou prevenção a fraude.
4. **Declaração.** Quem consulta marca que o titular está em negociação com a loja e sabe da consulta.
5. **Confirmação.** Uma janela diz o nível, os produtos, o valor de referência e, se for o caso, que o mesmo nível já foi consultado.
6. **Trava contra repetição.** O mesmo documento no mesmo nível consultado há menos de 30 minutos (parâmetro) pede uma segunda confirmação: "abrir a anterior" ou "consultar de novo e pagar".
7. Depois de uma consulta, nível e declaração voltam em branco: mais um clique não cobra de novo.

## Como a consulta roda

- Os produtos do nível são chamados ao mesmo tempo, sem nova tentativa automática.
- **Toda tentativa fica registrada**, inclusive a que falhou inteira: quem consultou, por quê, o que cada produto respondeu (`tentativas`) e a situação (`completa`, `parcial` ou `falhou`). O titular tem direito de saber, e a loja pode ter sido cobrada.
- Se **algum** produto falhar, o relatório sai com a parte que veio e uma seção **"Não veio nesta consulta"**. Ali vai só um texto curto; a mensagem técnica do fornecedor fica no painel.
- **Cobrança em erro:** a doc da APIBrasil diz que a maioria dos produtos cobra mesmo quando responde erro. Nesses casos, e quando a resposta não chega (fora do ar, tempo esgotado), a tela avisa que pode ter cobrado e manda conferir o saldo antes de repetir. O Dossiê de Crédito PJ e o Cadastral + Score PJ não cobram em erro.
- O custo gravado é a soma do `valor_consulta` de cada produto. Se algum produto que pode ter cobrado não disse quanto, o custo fica em branco, em vez de um valor menor que o real.
- Saldo zerado na APIBrasil (402) aparece com esse nome.
- A consulta é gravada pelo servidor (função `registrar_consulta_de_documento`, só service_role), nunca pela sessão de quem consulta: ninguém consegue gravar um relatório inventado e mandá-lo pelo link. Precisa de `SUPABASE_SERVICE_ROLE_KEY` no ambiente; sem ela a consulta não sai.
- No modo de teste (`APIBRASIL_HOMOLOGACAO=1`), as respostas trazem dados de exemplo, o custo fica R$ 0 e o relatório leva a faixa "MODO DE TESTE".
- As respostas brutas ficam guardadas (`respostas`), para refazer o relatório se o formato do fornecedor mudar. Elas nunca saem pelo link.

## Relatório, PDF e link

O mesmo HTML aparece na tela, sai em PDF e abre pelo link.

- **Na tela:** fica num quadro sem script.
- **Sócios (CNPJ):** com CPF inteiro e nascimento, como o dono pediu. Quando a própria Receita manda o CPF mascarado (API CNPJ), ele aparece como veio.
- **Imprimir / salvar PDF:** abre o relatório numa aba, com o botão de imprimir. Para gerar o PDF, escolha "Salvar como PDF" no navegador.
- **Gerar link para enviar:** cria um endereço `/relatorio/<código>` que vale 7 dias (parâmetro) e abre sem login. Serve para mandar ao banco, à financeira ou ao próprio titular. Cada consulta tem no máximo 10 links ativos (parâmetro).
  - Quem abre o link vê primeiro uma página sem dados, com o botão **Abrir relatório**. Assim a pré-visualização do WhatsApp, do Gmail ou do antivírus do banco não baixa o relatório nem mostra o CPF, e só uma pessoa conta como acesso.
  - O código só aparece uma vez. O banco guarda apenas o hash dele, e a função do link recebe o código e calcula o hash lá dentro: uma cópia do banco não abre o link.
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
- a tabela `parametros_consulta_documento` (validade do link, janela das recentes, trava contra repetição, limite de links, tabela de preços), com vigência: os quatro papéis leem, só o Administrador abre vigência nova;
- a função `registrar_consulta_de_documento(...)`, a única porta de gravação (só service_role; confere o papel de quem consultou);
- a função `abrir_relatorio_compartilhado(p_token)`. É a única porta do link público: ela confere a validade e a revogação, conta o acesso e devolve só o relatório montado.

## Ressalvas

Os formatos de resposta foram tirados dos exemplos da documentação da APIBrasil. Antes da primeira consulta paga, rode uma em modo de teste: se algum campo vier com outro nome, a seção correspondente cai em "Não veio nesta consulta", sem quebrar o relatório.

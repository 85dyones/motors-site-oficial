# Avaliação — "The Illegal Seven" contra o projeto Motors

Escrita em 2026-09-20, a pedido do dono, a partir de um documento externo
([The Illegal Seven](https://docs.google.com/document/d/1TEBmirdZXe-uMCAu0WaJ6qE5RJ3U1Zm734xrMXLvRHg/edit))
que lista sete repositórios abertos como substitutos de software pago. O pedido
foi olhar os sete, com peso nos itens **5 (Documenso)**, **6 (Twenty)** e
**7 (OpenVoice)**.

Nada aqui foi instalado. O que está marcado **"verificado hoje"** foi lido na
fonte nesta data: licença lida do arquivo `LICENSE` de cada repositório,
estrelas conferidas pelo badge do shields.io, preços lidos na página do
fornecedor, e o estado do nosso lado lido do código e das migrações deste
repositório.

> **Nota sobre o documento de origem.** Os sete números de estrelas conferem
> (verificado hoje, inclusive o de Scrapling, que parecia alto). O que não
> confere é a **aritmética de economia**: ela compara com preço americano de
> DocuSign e Salesforce. Nenhum dos dois é o que a Motors pagaria — o mercado
> brasileiro tem concorrente a um décimo disso, e isso muda três dos sete
> vereditos abaixo.

---

## A recomendação em uma frase

Dos sete, **um resolve um buraco que já está escrito na nossa spec** (Documenso,
para assinatura eletrônica — a spec 60 diz "via provedor" e nunca escolheu o
provedor), **um resolve como hospedar esse** (Coolify), e os outros cinco não
têm lugar aqui — inclusive os dois que o dono destacou junto: **Twenty
substituiria o funil que já está no ar**, e **OpenVoice não fala português**.

---

## Veredito em uma linha, os sete

| # | Repo | Licença (verificado hoje) | Veredito |
|---|---|---|---|
| 1 | agenticSeek | — | **Não.** Agente local sem chave de API resolve um problema que não temos: já operamos com Claude Code e Gemini, e o gargalo do projeto é decisão do dono, não capacidade de agente. |
| 2 | Coolify | Apache-2.0 | **Sim, mas não como o texto propõe.** Não para trocar a Vercel (o site é produção e a decisão de 2026-08-29 foi manter gerenciado). Serve como **substrato** do que já é autohospedado na VPS do n8n — e é o que torna o item 5 viável. |
| 3 | Scrapling | BSD-3-Clause | **Talvez, estreito.** Monitoramento de preço praticado em Curitiba alimentaria a trava do §5.5 do manual. Não agora, e nunca sobre o dado que é do RevendaMais. |
| 4 | OpenBB | AGPL-3.0 | **Não.** É terminal de mercado financeiro. Nossa referência de preço é FIPE e o praticado da praça, não bolsa. |
| 5 | **Documenso** | **AGPL-3.0** | **Sim — é a resposta a uma decisão que a spec 60 deixou aberta.** Com uma alternativa brasileira que precisa ser comparada antes de fechar. Detalhe abaixo. |
| 6 | **Twenty** | **AGPL-3.0**, com arquivos marcados `@license Enterprise` fora da AGPL e alguns pacotes em MIT | **Não adotar. Ler.** Substituiria `funil_etapas`, `funil_motivos`, `leads_eventos` e a régua inteira de 2026-08-28. Vale como fonte de ideias para três lacunas que nós mesmos listamos. Detalhe abaixo. |
| 7 | **OpenVoice** | **MIT** | **Não.** V2 suporta inglês, espanhol, francês, chinês, japonês e coreano — **português não está na lista**. Último commit em 2025-04-19. Detalhe abaixo. |

---

# 5. Documenso — o único que preenche um buraco já escrito

## 5.1 O buraco existe, está datado e tem nome

Isto não é uma oportunidade que apareceu com o documento externo. É uma
pendência nossa, escrita em quatro lugares:

| Onde | O que diz |
|---|---|
| `motors-handoff/docs/specs/60-fiscal-renave-docs.md:16` | "`documentos`: tipo DUT\|CRV\|CNH\|contrato\|laudo\|termo\|NF … pendência bloqueia `ENTREGA_LIBERADA`. **Assinatura eletrônica via provedor.**" — o provedor nunca foi escolhido. |
| `docs/MANUAL_MOTORS_CICLO.md:415` (§3.2) | "Consentimento LGPD coletado **com assinatura eletrônica**, canal por canal, no mesmo ato". |
| `docs/MANUAL_MOTORS_CICLO.md:884` (Bloco B, item 15) | "**Contrato eletrônico de recompra** e provisionamento contábil *(bloqueia a primeira assinatura)*". |
| `supabase/migrations/20260813150000_ciclo_fundacao_de_dados.sql:159` | `contratos_ciclo.assinado_em` e `url_contrato` — **duas colunas que nascem nulas e continuam nulas porque não existe quem as escreva.** |

E a spec 60 já inventariou o que precisa ser assinado. São **sete modelos de
contrato** ("compra e venda varejo, termo de garantia contratual (CDC art. 50),
contrato de repasse + termo de isenção, termo de consignação, termo de parceria
(regresso), termo de devolução, checklist de entrega") mais o **protocolo de
entrega de cinco peças** ("laudo de vistoria, termo de ciência de estado, termo
de garantia, registro de procedência informada, prova de entrega").

Hoje isso é papel, caneta e PDF solto. A tabela `documentos` guarda uma `url` e
um booleano `pendente`; ninguém garante que o PDF naquela URL foi assinado, por
quem, quando, nem com qual texto.

## 5.2 O que o Documenso faz — verificado hoje

| Fato | Onde foi verificado |
|---|---|
| Licença **AGPL-3.0** pura, sem diretório `packages/ee` | `LICENSE` do repositório |
| **pt-BR é idioma de primeira classe** — `'pt-BR'` está em `SUPPORTED_LANGUAGE_CODES` e o catálogo tem 15.319 linhas traduzidas | `packages/lib/constants/locales.ts`, `packages/lib/translations/pt-BR/web.po` |
| **API v2** com documentos, destinatários, campos, **templates** e **webhooks**, por token com escopo de time | `docs.documenso.com/developers/public-api` |
| Autohospedagem: Postgres + Docker + SMTP, e **certificado de assinatura obrigatório** — "sem certificado a aplicação sobe normalmente e a assinatura falha" | `docs.documenso.com/developers/self-hosting` |
| Três transportes de assinatura: `local` (arquivo `.p12` com passphrase), `gcloud-hsm` e `csc` | `.env.example` do repositório |

O transporte `local` é a descoberta que importa: ele recebe um **`.p12`**, que é
exatamente o formato de um **e-CNPJ A1 da ICP-Brasil**. Ou seja, o PDF sai
selado com o certificado da loja, não com um certificado genérico de um SaaS
estrangeiro.

## 5.3 O que ele **não** resolve — e é importante não confundir

**ATPV-e e RENAVE ficam fora.** A spec 60 pede "assinatura avançada/qualificada"
para o ATPV-e (Res. CONTRAN 1.027/2026), e o `CLAUDE.md` já decidiu: *"cliente
RENAVE próprio (usar integradora)"* está na lista de **fora de escopo**.
Transferência de propriedade se assina no ambiente do governo, pela integradora
— Documenso não entra nessa fila e nem deve.

A divisão fica assim:

| Documento | Onde assina |
|---|---|
| Compra e venda, garantia (CDC art. 50), consignação, repasse, parceria, devolução, checklist de entrega, consentimento LGPD, contrato do Ciclo | **Provedor de assinatura** (Documenso ou concorrente) |
| ATPV-e, comunicação de venda, CRV | **Integradora RENAVE / gov.br** — decisão da F0, não deste documento |

**A base legal do lado privado é sólida e não depende de ICP-Brasil:** a
MP 2.200-2/2001, art. 10, §2º dá validade ao documento assinado por método
aceito pelas partes, e a Lei 14.063/2020 só exige assinatura avançada ou
qualificada na relação com o poder público. O e-CNPJ A1 no transporte `local`
não é requisito — é reforço de prova, e barato.

**O que nenhuma ferramenta resolve:** a spec 60 diz que as cláusulas precisam
ser "validadas por advogado antes de virar padrão". Isso continua verdade com
Documenso, com ZapSign ou com papel. **Não é tarefa de software e é o que
realmente bloqueia** — vale lembrar que o item H6 do `PLANO_F0.md` já coloca
"parecer jurídico" como pré-requisito da primeira assinatura do Ciclo.

## 5.4 A alternativa brasileira, honestamente

O documento externo compara com DocuSign a US$ 25–45 por usuário/mês. Não é o
nosso mercado. **Verificado hoje na página da ZapSign:**

| Plano | Preço/mês | Docs/mês | API |
|---|---|---|---|
| Profissional | R$ 39,90 – 149,90 | 20 – ilimitado | **Não** |
| **Equipe** | **R$ 69,90 – 259,90** | 20 – 200 | **Incluída** + certificado digital de brinde |
| Enterprise | a partir de R$ 500 | sob medida | Incluída |

Nosso volume, medido no que o repositório registra: 104 veículos no total, 38
ativos, 66 já vendidos ou arquivados (`docs/PLANO_F0.md`). Numa loja desse
tamanho, 12 peças por venda ficam **abaixo do teto de 200 documentos/mês da
faixa de R$ 259,90**.

Então o cálculo verdadeiro não é "economizar US$ 45/usuário". É:

> **Autohospedar Documenso economiza da ordem de R$ 100 a R$ 260 por mês, e cobra
> em troca: gerar e renovar certificado, TLS, backup de documento com valor
> jurídico, monitoração e disponibilidade.**

E existe precedente contra empilhar isso na VPS. A **decisão de infraestrutura
do dono em 2026-08-29** (`docs/PLANO_F0.md`) recusou um S3 próprio com esta
frase: *"um S3 na VPS poria TLS, backup, monitoração e a banda de toda visita à
vitrine na mesma máquina do n8n"*. O argumento vale igual aqui, com um
agravante e um atenuante:

- **Agravante:** contrato assinado perdido é pior que foto perdida. Foto se
  refotografa.
- **Atenuante:** assinatura não tem banda de vitrine. São algumas sessões por
  venda, não toda visita ao site.

É aqui que o **item 2 da lista (Coolify)** deixa de ser curiosidade e passa a
ser parte da resposta: TLS automático, backup agendado e deploy versionado são
exatamente o que ele entrega, e é o que falta na VPS hoje. **Coolify primeiro,
Documenso depois** — nessa ordem, ou a objeção de 2026-08-29 continua de pé.

## 5.5 A ordem correta de implementação

O erro previsível é começar escolhendo o provedor. **A primeira entrega não tem
provedor nenhum dentro dela**, e é a que vale mais:

**Passo 1 — o gerador de contrato (não depende de decisão de ninguém).**
Templates versionados que se preenchem dos dados da unidade, como a spec 60
manda. Sem isso, qualquer provedor recebe PDF montado à mão, e o campo
`detalhe jsonb` de `documentos` fica sem o que guardar. Vale notar que o §5.5 do
manual exige que *"o contrato guarda os parâmetros do dia da assinatura"* — é o
gerador que carimba isso, não o provedor.

**Passo 2 — a interface de provedor, com um adaptador só.** Uma função de
módulo, no formato que o `CLAUDE.md` exige (`src/modules/fiscal` ou
`src/modules/comercial`), com a mesma forma que a spec 60 já desenhou para a
NF-e: *"outbox → n8n → provedor → evento de volta; erro volta à tela"*. O outbox
ainda não existe — então **um mecanismo serve a NF-e e a assinatura**, e vale
construir uma vez.

**Passo 3 — só então escolher.** Com o adaptador pronto, trocar provedor é
trocar uma implementação. A decisão deixa de ser irreversível, e é isso que
justifica fazer nesta ordem.

### Duas restrições da casa que este trabalho precisa respeitar

1. **Migração aditiva.** O `CLAUDE.md` proíbe `ALTER TYPE` de objeto em uso
   nesta janela, e o enum `evento_tipo` (`20260829120000_f0a_org_e_enums.sql`)
   **não tem evento de assinatura**. Então o marco de assinado vive em
   `contratos_ciclo.assinado_em` e em colunas novas de `documentos` — não em
   valor novo de enum. Quem tentar `ALTER TYPE ... ADD VALUE` vai ser barrado
   pela regra, e corretamente.
2. **Tabela nova, se houver, nasce com `org_id` + RLS + policy por papel.**
   Documento assinado é dado de cliente; RLS não é opcional.

### Critério de decisão, para não ficar em aberto

| Se… | Então |
|---|---|
| A operação passar de ~200 documentos/mês, ou o dono quiser o contrato dentro da nossa infraestrutura por princípio | **Documenso autohospedado**, sobre Coolify, com e-CNPJ A1 no transporte `local` |
| O volume ficar onde está e a prioridade for entregar a primeira venda pela A19 | **Provedor brasileiro com API** (ZapSign na faixa Equipe), atrás do mesmo adaptador |

Em ambos os casos os passos 1 e 2 são idênticos. **É por isso que eles vêm
primeiro.**

---

# 6. Twenty — não adotar, e a razão é boa

## 6.1 O que ele substituiria

O documento externo vende Twenty como troca de Salesforce. Nós não temos
Salesforce. Temos um funil construído sob briefing do dono em **2026-08-28** e
documentado em `docs/FUNIL_DE_VENDAS.md`, que é fonte de verdade. Instalar
Twenty jogaria fora:

| Peça nossa | O que é |
|---|---|
| `funil_etapas` | Etapas editáveis sem deploy — `leads.situacao` ganhou FK no lugar do `check` fixo justamente para isso |
| `funil_motivos` | Motivos de ganho e perda editáveis, por escopo |
| `leads_eventos` | O rastro: cada mudança de etapa, de dono, cada aviso, cada desfecho — com `on delete cascade` para o direito de exclusão do titular (LGPD art. 18, VI) |
| `montar_fila_do_funil()` | A régua de estagnação inteira, em `service_role` |
| `registrar_contato_do_lead()` | O que o botão de WhatsApp do card chama |
| `agenda_de_pessoas` | Cinco ramos, um deles os leads |
| RLS `is_staff(auth.uid())` | A porta que foi fechada em 2026-08-28 |

## 6.2 O argumento que decide, e não é o de esforço perdido

Um CRM genérico guarda pessoas e negócios. **O nosso funil não é genérico: ele é
acoplado ao veículo de propósito.** Lead aponta para unidade de estoque,
desfecho conversa com `negocios` e com o razão, ganho abre o par
cliente-veículo do Ciclo, e o `CLAUDE.md` define a missão do projeto como
*"substituição total do RevendaMais"*.

Twenty é um CRM à parte. Adotá-lo significaria voltar a ter **duas fontes de
verdade sobre o mesmo cliente** — exatamente o problema que o §3.3 do manual
descreve ao mandar *"cruzar com RevendaMais e com o CRM atual"* para recuperar
dado histórico. Não vale reintroduzir a doença cuja cura está em andamento.

Detalhe de licença que pesaria se alguém pensasse em forkar: a AGPL do Twenty
tem exceções. Arquivos marcados `/* @license Enterprise */` **não são AGPL** —
são licença comercial. Um fork precisaria rastrear essa marca arquivo por
arquivo.

## 6.3 O que vale ler dele — e casa com lacunas que nós mesmos listamos

A seção 7 de `docs/FUNIL_DE_VENDAS.md` ("O que ficou de fora, e por quê") tem
três itens que o Twenty resolveu bem. Vale abrir o código dele como referência,
**sem instalar e sem dependência**:

| Nossa lacuna (§7) | O que olhar no Twenty |
|---|---|
| "Reabrir lead perdido com histórico do motivo anterior — o motivo antigo fica em `leads_eventos`, mas **nenhuma tela o mostra ainda**" | A timeline da ficha do registro. Nós já temos o dado; falta a superfície. **É a lacuna mais barata de fechar das três.** |
| "Vários funis. Pipedrive tem N pipelines; aqui há um. A estrutura suporta acrescentar um `funil_id` depois" | Como ele modela objeto e pipeline sem transformar a tela em configurador |
| "Prazo por origem do lead… primeiro é preciso um mês de dados" | Continua verdade — **nenhuma ferramenta substitui o mês de dados**, e hoje o funil ainda tem lead zero real |

Veredito: **ler, não instalar.** E a primeira das três é trabalho de tela, não
de banco.

---

# 7. OpenVoice — não, e o motivo é decisivo

## 7.1 Ele não fala português

Verificado hoje no `README.md` do repositório:

> "**Native Multi-lingual Support.** English, Spanish, French, Chinese, Japanese
> and Korean are natively supported in OpenVoice V2."

Português não está na lista. A promessa de clonagem *cross-lingual* é sobre o
**áudio de entrada** poder estar em qualquer idioma — a **saída** sai nos
idiomas dos base speakers, e pt-BR não é um deles. Uma revenda de Curitiba, que
fala português em todas as superfícies, não tem o que fazer com isso.

## 7.2 Os outros três motivos

**Está parado.** Último commit em **2025-04-19** (verificado hoje: um merge de
correção para Apple Silicon). A V2 é de abril de 2024. A licença MIT é boa e
permite uso comercial — só não há manutenção por trás dela.

**Não existe encaixe no projeto.** Não há áudio em lugar nenhum do código.
As 26 ocorrências de "voz" em `src/` e `tests/` são todas **voz editorial** —
`src/lib/campanhas.ts`, `src/lib/encomenda.ts` e os testes falam da frase
"na voz do cliente" contra "na voz da loja". É tom de texto, não som.

**E o mais importante: a casa já decidiu contra o que isso seria.** A seção 7 de
`docs/FUNIL_DE_VENDAS.md` recusou mensagem automática ao cliente com esta
justificativa:

> "Mensagem automática para cliente é o caminho mais curto para o número da loja
> ser bloqueado, e o pedido foi por um *atalho para falar*, não por um robô
> falando."

Áudio em voz clonada no WhatsApp é a versão mais forte do robô falando. Some a
isso o `MOTOR_DE_GATILHOS.md`, que já limita canal, horário e quarentena
justamente para o envio não parecer robô — e o próprio documento externo, que
avisa que clonar voz sem autorização escrita é problema jurídico, não técnico.
No Brasil a voz é direito de personalidade: clonar a do dono ou de um vendedor
exigiria autorização formal, e não resolveria a questão de o cliente descobrir
que o áudio não é de ninguém.

## 7.3 Se um dia a locução for necessária

Só faria sentido para **peça de marketing** — vídeo de anúncio, narração de
guia —, nunca para mensagem de cliente. E o critério então seria: **pt-BR
nativo, licença que permita uso comercial, e manutenção ativa.** OpenVoice falha
nos dois primeiros. Candidatos a avaliar naquele momento, com licença conferida
hoje: **Chatterbox** (Resemble AI, MIT, multilíngue com português) e **Kokoro**
(traz `'p' => Brazilian Portuguese pt-br` no próprio README).
**Cuidado com XTTS-v2 da Coqui:** o código é MPL-2.0, mas
os pesos do modelo vêm sob licença própria — conferir antes de qualquer uso
comercial.

Mesmo assim: gravar a voz de uma pessoa real custa menos que manter modelo, e
não tem o problema de autorização.

---

# Os outros quatro, em um parágrafo cada

**1. agenticSeek — não.** Agente local sem chave de API, para trabalho que não
pode sair da máquina. Nenhum trabalho nosso tem essa restrição, e já operamos
com Claude Code e Gemini. O gargalo do projeto está escrito em
`docs/CONTINUIDADE_18AGO.md` §4: dez pendências do dono, entre elas *"fechar a
primeira venda pela tela A19"* — as tabelas do Ciclo estão vazias. Agente novo
não move nenhuma delas.

**2. Coolify — sim, no papel de substrato.** Não substitui a Vercel: o site é
produção, e a decisão de 2026-08-29 foi manter gerenciado o que é gerenciado.
Serve para o que **já** é autohospedado — n8n (`n8n.v2o5.com.br`), Chatwoot
(`app.chat.v2o5.com.br`), Evolution API — e hoje vive sem TLS automático, backup
agendado nem deploy versionado. É **pré-requisito prático do item 5**, e é a
resposta direta à objeção que o próprio dono levantou contra empilhar serviço na
VPS.

**3. Scrapling — talvez, estreito e depois.** Monitorar preço praticado em
Curitiba alimentaria a trava do §5.5 do manual (`percentual_pleno × FIPE ≤ preço
praticado pela casa − margem alvo`), cuja **margem alvo ainda não tem número** —
está no Anexo do manual como pergunta aberta. Duas ressalvas: a migração
`20260902120000_preco_e_do_revendamais.sql` estabelece de quem é o preço, e nada
raspado pode encostar nisso; e raspar portal de concorrente tem risco de termo
de uso que precisa de decisão do dono, não de código.

**4. OpenBB — não.** Terminal de mercado financeiro, para ações e derivativos.
Nossa referência de preço é FIPE e o praticado da praça. Zero encaixe.

---

# O que fazer, em ordem

| # | Ação | Depende de |
|---|---|---|
| 1 | **Fechar a tela de histórico do lead** — `leads_eventos` já guarda o motivo anterior e nenhuma tela o mostra (`FUNIL_DE_VENDAS.md` §7). Ideia vinda do Twenty, sem instalar Twenty. | Nada. É trabalho de tela. |
| 2 | **Gerador de contrato com templates versionados** (spec 60), carimbando os parâmetros do dia (§5.5 do manual). | Nada — não depende de escolher provedor. |
| 3 | **Outbox + adaptador de provedor**, na forma que a spec 60 já desenhou para a NF-e. Um mecanismo serve às duas. | Passo 2. |
| 4 | **Coolify na VPS**, com TLS, backup e monitoração do que já está lá. | Decisão do dono. |
| 5 | **Escolher o provedor de assinatura** pelo critério do §5.5 deste documento. | Passos 3 e 4, e o parecer jurídico do H6. |

**Não fazer:** instalar Twenty, instalar OpenVoice, trocar a Vercel.

---

# Precisa de decisão do dono

1. **Assinatura: autohospedar ou contratar?** O critério está no §5.5 — em
   volume atual, o provedor brasileiro é mais barato em tempo; em princípio de
   soberania do dado, Documenso ganha. Os passos 1 a 3 acima são os mesmos nos
   dois caminhos, então **a decisão pode esperar sem travar o trabalho**.
2. **Coolify na VPS?** Muda a objeção de 2026-08-29 de "não empilhe" para
   "empilhe com TLS e backup".
3. **e-CNPJ A1 já existe na loja?** Se sim, o transporte `local` do Documenso o
   usa direto, e a faixa Equipe da ZapSign dá um de brinde. Se não, é compra de
   uma vez por ano.
4. **Raspar preço de concorrente (Scrapling): pode?** Pergunta de risco, não de
   técnica.

**O que este documento não resolve, e continua sendo o bloqueio real:** o
parecer jurídico das cláusulas (spec 60 e `PLANO_F0.md` H6) e a primeira venda
fechada pela tela A19. Nenhum dos sete repositórios move nenhum dos dois.

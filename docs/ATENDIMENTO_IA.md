# Atendimento por IA: o assistente no WhatsApp, o aquecimento e a entrega

Pedido do dono em **2026-10-19**:

> *"Na área de leads e atendimento, estamos atrás, vi o manobrai.com.br que
> traz um scraper de dados, com a base da empresa, atendimento via modelo
> deepseek pra baratear o custo, a tela dos leads tem atendimentos direto no
> painel, com uma aba resumo e aquecimento do lead, o bot atua em todos os
> atendimentos, os leads só são passados para o vendedor quando estão quentes
> na qualificação, se a qualificação cai ou o lead não esquentou, ele tem
> cadências de reaquecimento e engajamento, o resumo do atendimento é enviado
> para o WhatsApp do corretor, que atende do seu próprio número, continuam
> monitorando origem, métricas de desempenho da equipe, sem o uso de chatwoot,
> apenas a evolutionapi e N8N, pesquise sobre e vamos fazer um upgrade no
> painel da Motors"*.

Este documento é a **fonte de verdade** do atendimento por IA: o que a
pesquisa encontrou, o desenho, as réguas, como ligar e o que depende do dono.

---

## 1. A pesquisa

### 1.1 O manobrAI, pelo que ele publica

O site (manobrai.com.br, no ar desde 04/10/2026, da ORBITAIA, de Curitiba) é
uma página só, sem preço. O que ele diz:

| Tema | O que o manobrAI faz |
|---|---|
| Base | Lê o **site da própria loja** de madrugada (catálogo inteiro) e confere a cada 30 min o que saiu. Regras da loja (garantia, pagamento, troca) cadastradas no início. |
| Conversa | Pergunta **um assunto por vez**, registra **só o que o cliente disse**. Transcreve áudio. Não decide desconto, valor final nem troca; nunca diz que o financiamento foi aprovado; não simula parcela. Oferece test-drive e abre ficha de financiamento. |
| Ficha | Interesse, Pagamento, Entrada, Troca, e uma **temperatura** fria/morna/quente com o **Motivo** ("ofereceu carro na troca"). |
| Entrega | O lead ganha "vendedor da vez"; quando esquenta, o vendedor recebe no WhatsApp "LEAD QUENTE — nome", telefone, procura, pagamento, troca. Pode avisar a partir do morno. Fora do horário o aviso espera; domingo, nada. |
| Pausa | Vendedor respondeu pelo painel: a IA para e só volta pelo botão. No WhatsApp da loja, **texto e vídeo pausam; áudio, foto e documento não**. |
| Cadências | Follow-up (perguntou e sumiu: até 3, dias diferentes), reativação (sumiu sem dizer: até 3, uma por dia), pós-visita, carro compatível, lembrete de test-drive. Param quando o cliente responde. No horário da loja. |
| Conexão | Por padrão entra no número da loja como aparelho conectado (QR code, não a API oficial) — o caminho da Evolution. |

**Duas diferenças entre o briefing e o que o site publica**, registradas para
quem ler isto depois:

- O site não cita modelo nenhum (DeepSeek, n8n e "sem Chatwoot" não aparecem).
  Aqui a escolha é do dono: DeepSeek, Evolution e n8n.
- No manobrAI o vendedor assume **pelo painel**, no número da loja ("Assuma a
  conversa pelo painel para responder"). O briefing diz que o corretor atende
  **do próprio número**. Aqui valem os dois: o resumo vai ao WhatsApp do
  vendedor com o `wa.me` do cliente pronto, e o painel tem a conversa com a
  caixa de resposta pelo número da loja.

### 1.2 O que os concorrentes têm em comum

AutoSDR, IA SDR do Revenda Mais, BTECH.auto e WSeller: resposta em segundos
sobre o estoque real; coletam modelo, orçamento, pagamento, entrada e troca;
não negociam preço; só passam o lead qualificado. O AutoSDR usa **nota de 0 a
100**. Onde o manobrAI fica atrás — e o painel da Motors já está na frente —
é **origem do lead** (UTM, campanha, anúncio).

---

## 2. O desenho

```
 cliente ──WhatsApp──▶ Evolution ──webhook──▶ n8n "Entrada" ──▶ POST /api/atendimento/evolution
                                                  │                 (grava, cria o lead, diz se responde)
                                                  │ espera a rajada (12 s)
                                                  └──────────────▶ POST /api/atendimento/responder
                                                                    │  DeepSeek lê base + conversa
                                                                    │  régua calcula o aquecimento
                                                                    ├─▶ Evolution: resposta ao cliente
                                                                    └─▶ esquentou? Evolution: resumo ao vendedor

 n8n "Rodada" (15 min) ──▶ POST /api/atendimento/rodada   (resumos pendentes, devoluções e toques de cadência)

 painel: GET/POST /api/leads/[id]/conversa · POST /api/leads/[id]/assistente · /admin/leads/atendimento
```

**O n8n é dono do TEMPO; o site é dono do ENVIO e da DECISÃO.** O n8n junta a
rajada (o cliente manda três mensagens curtas) e acorda a rodada. Quem decide
se responde, o que responder, quem recebe o lead e se a cadência toca é o site;
quem envia é o site, pela Evolution (`src/lib/evolution.ts`). É a primeira vez
que o site envia WhatsApp: responder do painel é síncrono — a pessoa precisa
saber, na hora, se saiu —, e uma volta pelo n8n só para repassar o texto seria
um ponto de falha mudo entre o botão e o cliente.

### 2.1 A base da loja não é raspada: é lida

O manobrAI raspa o site da loja. Aqui não há o que raspar: o estoque está no
banco (sincronizado do RevendaMais) e o texto institucional já é gerado pelo
site para o Ney do Chatwoot (`lojaParaOAssistente`). O agente lê os dois a cada
conversa (`baseDoAtendimento-servidor.ts`, cache de 5 min com a etiqueta
`inventory`), **sem o teto de 15.000 bytes** que o Captain impunha: o catálogo
inteiro entra, com o link da ficha de cada carro. O que a loja quiser
acrescentar (política de troca, documentos para financiar, tom) vai em
**Regras da loja**, na configuração.

### 2.2 Por que DeepSeek, e como a conta fecha

`deepseek-flash` (tabela de 19/10/2026): US$ 0,15 por milhão de tokens de
entrada, **US$ 0,003** quando o começo do prompt repete (cache), US$ 0,60 por
milhão de saída, fora do pico. O prompt é montado com a parte fixa — regras,
loja, catálogo — na frente e igual para todo cliente, para cair no cache; a
conversa vem depois; o estado que muda a cada mensagem, por último.
O modo "thinking" (padrão do modelo) é desligado: para conversa de WhatsApp é
mais lento, mais caro e não melhora a resposta curta. A resposta vem em JSON
(`response_format: json_object`), lida e conferida por código.

O painel mostra o custo estimado do período em **Leads → Atendimento IA**
(com a classificação das fotos, para quem vê a loja inteira).

---

## 3. A régua do aquecimento

**O modelo preenche a ficha; a régua soma.** Pedir "dê uma nota de 0 a 100" a
um modelo produz um número que muda entre duas chamadas iguais e que ninguém
audita. Somar pesos sobre o que o cliente disse produz o mesmo número para a
mesma ficha, e cada ponto vira **motivo** na aba Aquecimento
(`src/lib/aquecimento.ts`).

| Sinal | Pontos |
|---|---|
| Carro definido (do estoque, ou modelo e ano) | +20 |
| Só a categoria ou o tipo ("um SUV") | +10 |
| Disse quanto quer gastar | +10 |
| Disse a forma de pagamento | +10 |
| Disse a entrada | +5 |
| Ofereceu carro na troca | +10 |
| Prazo: até 15 dias / este mês / próximos meses / sem pressa | +25 / +15 / +5 / −10 |
| Quer visitar ou fazer test-drive | +25 |
| Combinou o dia da visita | +10 |
| Pediu desconto, avaliação ou financiamento | +10 |
| Mandou 3 mensagens ou mais | +5 |
| Disse que só está pesquisando | −15 |
| Mostrou desinteresse | −30 |

**Morno a partir de 35, quente a partir de 65.** A conta, para conferir de
cabeça: "quero o Onix 2020" (20, frio) → "financiado, 15 mil de entrada" (35,
morno) → "tenho um Uno pra troca, quero resolver esse mês" (60, morno) →
"posso passar aí sábado" (85, quente).

Pesos e limiares são **dado** (`atendimento_config`), editáveis na tela — ponto
de partida declarado, como os prazos do funil. Opt-out zera a nota.

---

## 4. A entrega ao vendedor

Passa ao vendedor quando (`decidirEntrega`):

- **pediu para falar com uma pessoa** — sempre, com qualquer nota;
- **pediu o que só o vendedor resolve** (desconto, valor final, avaliação da
  troca, financiamento) — sempre;
- **a temperatura alcançou a mínima** (quente por padrão; a loja pode escolher
  morno, como no manobrAI).

**Para quem:**

| Situação | Quem recebe o resumo |
|---|---|
| Lead já tem responsável | O responsável. |
| Sem responsável, **rodízio** (o desta loja) | O comercial ativo, com WhatsApp, com menos leads abertos — a régua da transferência do funil. O rastro diz *"rodízio; o administrador pode trocar no quadro"*. |
| Sem responsável, distribuição **"o administrador escolhe"** | Quem distribui (administrador do comercial) e o gestor. Escolhido o dono no quadro, o resumo segue para ele na hora (`PATCH /api/leads/gerenciar`). |

**Decisão do dono em 20/10/2026**: *"rodízio, com o adm podendo mudar
manualmente"*. A linha desta loja nasce com o rodízio (a migração grava), e o
administrador troca o dono no quadro como sempre: quando troca, o **dono novo
recebe o resumo na hora**, mesmo que o rodízio já tenha avisado outro vendedor
(`avisarEntregaPendente(..., { trocaManual: true })`, só para entrega dos
últimos 7 dias e só quando a troca deixa um dono). A rodada e a transferência do
funil não reenviam o resumo: o vendedor que o funil trocou tem o aviso de
transferência dele. A configuração de **fábrica** (loja sem linha) continua
"o administrador escolhe", a mais conservadora.

**O resumo** (`resumoParaOVendedor.ts`): "🔥 LEAD QUENTE — nome", telefone com
`wa.me`, procura, quanto quer investir, pagamento e entrada, troca, prazo,
visita, a nota com o motivo principal, a origem, o resumo da conversa e o link
do lead. Campo que o cliente não disse não aparece.

**O cliente** lê, na mesma hora, quem vai atender e de que número vem a
chamada — senão ele recebe mensagem de um número desconhecido e não responde.
O texto não supõe gênero de quem vende ("Vou te passar para Carla, da nossa
equipe de consultores…").

**O horário.** O aviso à equipe segue a janela do funil: 8h às 20h, nada aos
domingos. Lead que esquenta às 23h fica entregue e o resumo sai na rodada da
manhã. **Até o resumo sair, o SLA do vendedor continua pausado**: o relógio
dele começa quando ele sabe.

**O SLA do funil.** Nenhuma linha de `montar_fila_do_funil` mudou. Enquanto o
assistente qualifica, `atendimentos.com_assistente` fica ligado (a regra do
dono de 05/09: *"o SLA só conta após o Ney transferir"*). Na entrega, desliga e
carimba `humano_assumiu_em`: daí em diante, a estagnação e a transferência de
sempre. No aviso a quem distribui, o lead é marcado como avisado, para o
"lead novo" do funil não sair em dobro na rodada seguinte.

**Depois da entrega**, o assistente não responde mais. Se o cliente escrever no
número da loja, a mensagem vai ao WhatsApp do vendedor (uma por rajada) — ele
pode estar atendendo do próprio número e não ver o da loja. Se o vendedor
responder "ok" ao resumo, conta como **confirmação** (métrica da equipe).

---

## 5. Quem tira o assistente da conversa

| Gesto | O assistente | Conta como atendimento (relógio do funil) |
|---|---|---|
| Vendedor responde pelo painel | sai, e só volta pelo botão | sim (`registrar_contato_do_lead`, canal `evolution`, tira de "Novo") |
| Alguém escreve texto ou manda vídeo **no celular da loja** | sai | só se veio de aparelho (Android/iOS) |
| Foto, áudio ou documento no celular da loja | fica | não |
| Mensagem da loja que sai pela API (outra automação do n8n) | sai | **não** — chega como `web`, igual ao WhatsApp Web |
| O modelo falhou, respondeu fora do formato, ou falta credencial | sai, com alerta | — (o SLA volta a correr) |
| A Evolution recusou todos os balões, ou deu exceção no meio da resposta | sai, com alerta | — |
| O assistente foi **desligado** na configuração | todo lead com ele sai na hora (e a rodada confere) | — |
| Mensagem do cliente sem resposta há 10 min (a função morreu, o n8n não chamou) | sai, pela rodada | — |
| A cadência acabou, ou foi desligada, sem o cliente responder | sai, pela rodada | — |
| A conversa parou e não há cadência marcada | sai um dia depois, pela rodada | — |

**Robô não atende** (`WEBHOOKS_N8N.md`): mensagem do assistente nunca reinicia o
relógio de ninguém — e reavisar um lead já entregue (o dono escolhido depois)
não mexe no relógio que já corre. **Na dúvida, devolve ao humano**: silêncio
do robô com o relógio pausado seria o lead parado sem ninguém saber. A
mensagem que ficou sem resposta volta para a fila: quem devolver a conversa ao
assistente pelo painel faz ele responder na hora.

**Os botões que devolvem o lead ao assistente têm porteiro**: *Devolver a
conversa ao assistente* só na conversa pausada; ele e *Devolver para
reaquecer* só com o assistente ligado e para o cliente que já escreveu à loja
— senão seriam um jeito de tirar o lead do prazo do funil sem ninguém atender.
O estado do assistente no lead (fase, cadência, opt-out, aviso, confirmação)
só muda pelo servidor: um gatilho no banco recusa a mudança vinda da sessão.

**Uma resposta por vez, nada em dobro.** A resposta tem trava por lead
(`respondendo_desde`, 90 s): a mensagem que chega enquanto o assistente
responde é respondida por uma segunda volta da mesma execução, e não por uma
resposta paralela. Se a primeira demorou demais para dar a segunda volta (por
exemplo, classificando na hora as fotos do carro), a rota devolve `ocupado`
com `tentar_em_ms` — quando a resposta em curso terá terminado com certeza — e
o workflow de entrada pede de novo, uma vez, nessa hora; se ela já tiver sido
coberta, a rota devolve `ja_respondida` e nada sai em dobro. A trava vale
130 s, mais que os 120 s da função: enquanto a resposta em curso pode estar
viva, ninguém a toma — e cada execução solta só a própria trava. O lead de um número novo é achado ou criado sob trava por
telefone (`achar_ou_criar_lead_do_whatsapp`), para a rajada não criar dois. O
resumo ao vendedor e cada toque de cadência são **reservados** por um update
condicional antes de sair: o quadro e a rodada, ou duas rodadas, não mandam o
mesmo duas vezes.

---

## 6. As cadências

| Cadência | Começa quando | Toques (de fábrica) |
|---|---|---|
| Follow-up | O assistente respondeu, o cliente tinha carro de interesse e sumiu | 20 h, +48 h, +72 h |
| Reativação | Idem, sem carro de interesse | 20 h, +24 h, +24 h |
| Engajamento | O vendedor **devolve** o lead ao assistente porque esfriou | 7 d, +15 d, +30 d |

Regras (`src/lib/cadencias.ts`): no máximo três toques; **só no horário da
loja**; **só para quem escreveu para a loja** (nunca disparo frio — o número
entra no WhatsApp como aparelho conectado, e mensagem em massa é o caminho mais
curto para o bloqueio — lead de formulário que nunca escreveu sai da
cadência sem receber nada); param quando o cliente responde ou pede para sair.
O modelo escreve cada toque a partir do texto pronto (que é o que sai quando o
modelo não está disponível), com a mesma trava de preço da conversa. Depois do
último toque, o cliente tem um dia para responder; sem resposta, o lead volta
para a equipe.

**A trava de preço** (com *informar preço* desligado): nenhum balão sai com
valor em dinheiro — "R$ 79.900", "79.900", "79,9 mil", "80k", "1890 reais" —
além do orçamento e da entrada que o cliente disse (na ficha **e** nas
mensagens dele). Confirmar o preço que o cliente "viu no anúncio" é informar
preço, e é barrado; o balão vira "O valor certinho quem te passa é a nossa
equipe de consultores". Quilometragem, ano e motor ("1.6") não contam.

**O que vem de fora**: o nome do WhatsApp entra no prompt só com letras e
curto (não abre seção nova nem fecha o JSON); o resumo vai ao vendedor sem
link nenhum.

### 6.1 As fotos do carro, em camadas

Pedido do dono (20/10): o assistente classifica as fotos de cada carro do
estoque, mostra primeiro as de fora, pergunta se o cliente quer ver o interior
e oferece os outros detalhes visuais um de cada vez — *"para não sobrecarregar
o usuário com informações"*.

**A classificação é uma vez por foto.** O próprio `deepseek-flash` lê imagem
(página de visão da DeepSeek, 20/10/2026; o `deepseek-v4-pro` não lê, por isso
o modelo de visão é fixo em `MODELO_DE_VISAO`). Cada foto da galeria do carro
(`whatsapp_images`, a JPEG) vai uma vez ao modelo, em baixa resolução (512 px),
em pedidos de até 12, e volta com:

| Camada | O que é |
|---|---|
| **fora** (`externa`) | o carro inteiro por fora, com o ângulo (frente, três-quartos, lateral, traseira) |
| **interior** | a cabine: painel, bancos, volante, console |
| **detalhes da versão** (`detalhes`) | close de item da versão: emblema, faróis, teto solar, painel digital, multimídia, chave |
| **rodas** | roda e pneu |
| **motor** | o cofre aberto |
| **porta-malas** | o porta-malas ou a caçamba |
| *outra* | documento, laudo, banner, foto sem o carro — **nunca vai ao cliente** |

…mais uma descrição de até seis palavras ("Teto solar panorâmico"), que vira a
legenda no WhatsApp e o destaque da oferta, e se a foto é aproveitável (tremida
ou escura não vai). O modelo LÊ o que está escrito na foto: descrição com
dinheiro, placa, telefone, e-mail ou site é descartada inteira, na gravação e
de novo na leitura — a etiqueta de preço no vidro não vira legenda, nem
destaque da oferta, nem linha do catálogo. Foto que o modelo não consegue
abrir (URL quebrada) é achada partindo o lote ao meio e sai do envio, para não
derrubar o carro inteiro a cada rodada — mas só com prova de que o PEDIDO
funciona (outro pedido deste carro deu certo agora, ou um pedido de controle
com uma foto já vista dá certo): se a DeepSeek passar a recusar o pedido
inteiro, nada é marcado e a falha aparece. Foto que o modelo pulou fica na
fila. Fica em `atendimento_fotos`, com a URL como chave: foto
trocada na galeria é URL nova e entra na fila sozinha. A rodada das fotos
(`/api/atendimento/fotos`, junto com a rodada do n8n) adianta a fila do
estoque; o carro que o cliente pedir antes disso é classificado na hora, pela
própria conversa (até 30 s). O custo é de frações de centavo por carro e entra
no custo do relatório.

**Na conversa, o modelo só pede; o servidor escolhe e manda.** O catálogo do
prompt diz, por carro, quantas fotos há de cada camada ("fotos: fora 5 ·
interior 6 · detalhes da versão 3 (teto solar e faróis de LED) · rodas 2"). O
modelo responde com `"fotos": {"veiculo": "…", "camada": "externa"}` e escreve
só a frase que vem antes ("Olha ele aqui 👇"). O servidor:

1. confere que o carro está à venda;
2. escolhe as fotos da camada que ainda não foram à conversa — de fora, a capa
   e um de cada ângulo (quatro fotos da frente não mostram o carro); até 4 de
   fora, 4 do interior, 3 de detalhes e 2 das outras;
3. manda pela Evolution (`sendMedia`), cada uma com a legenda (sem link e,
   com o preço desligado, sem valor — a placa de preço no para-brisa não vira
   legenda);
4. manda a **oferta da próxima camada**, escrita por código a partir do que o
   carro tem e do que já foi: depois das de fora, *"Quer ver o interior
   também?"*; depois do interior, *"Tenho também fotos dos detalhes da versão
   (teto solar e faróis de LED), das rodas e do motor. Quer ver alguma?"*;
   depois de um detalhe, só lembra o que sobrou. Nunca oferece foto que não
   existe, nunca repete camada.

O estado do prompt lista o que já foi mostrado de cada carro e o que ainda dá
para oferecer, e o histórico resume as fotos ("enviou 4 fotos de fora do carro
#…") — o modelo sabe onde a conversa está sem reler imagem.

**O pedido sempre fecha.** O modelo já escreveu "Olha ele aqui 👇"; se nenhuma
foto sai, o servidor fecha a frase: a camada que o carro não tem vira *"Não
tenho foto do motor desse carro aqui, mas a nossa equipe consegue te mandar"*;
a que já foi inteira, *"Essas fotos já estão aí em cima 🙂"* e o que sobrou;
a que pode estar entre as fotos ainda não separadas, *"Ainda não separei as
fotos do interior desse carro…"*; carro fora do estoque ou falha, *"a nossa
equipe consegue te mandar"* — e essa promessa fica anotada no rastro do lead.
Foto que a Evolution não confirmou a tempo fica pendente (pode ter saído; o eco
confirma) e não é mandada de novo. Faltando
as de fora e havendo fotos ainda não separadas (o modelo de visão caiu ou não
terminou), vão essas, em ordem, de quatro em quatro, com *"Quer ver mais
fotos?"* — nunca uma marcada "não mandar". A oferta da próxima camada só sai
quando a camada saiu inteira agora. Sem saber o que já foi à conversa (a
leitura falhou), nenhuma foto sai: mandar de novo seria foto em dobro.

**Prazo e ordem.** As fotos saem depois de o lead estar gravado (ficha, nota,
cadência), e só até 80 s do começo da resposta; a classificação na hora só
começa se sobrarem 45 s, e cada foto tem 15 s na Evolution. **Na entrega ao
vendedor, nenhuma foto nem oferta**: o cliente vai à pessoa, e a passagem é a
última palavra do assistente — dizendo que quem manda as fotos é o vendedor
(*"…que já vai te chamar pelo WhatsApp (41) 98888-7777 e te mandar as
fotos"*), e o resumo ao vendedor diz quais (*"📷 Pediu fotos do interior do
Onix LT 2020 (#…)"*). No painel, a conversa mostra a foto com a
legenda e a camada.

**Conferir e corrigir — Leads → Atendimento IA → Fotos** (Admin e Gestor). A
aba lista os carros à venda com o andamento ("12 de 40 carros com as fotos
separadas · 85 fotos na fila"), primeiro os que ainda têm foto na fila, e um
botão para **classificar a fila agora** sem esperar a rodada. Cada carro abre a
galeria com a camada de cada foto: trocar a camada, marcar **"Não mandar ao
cliente"** ou ajustar a legenda grava na hora, com o nome de quem corrigiu, e
vale na conversa seguinte. Foto corrigida à mão o modelo não reclassifica:
**"Refazer a classificação"** do carro classifica de novo só o que o modelo
tinha dito e troca cada linha depois de a nova dar certo — com a DeepSeek fora
do ar, a classificação antiga fica. A legenda com preço, placa ou contato é
recusada (a tela avisa). Sem a loja (`org_padrao` ilegível), a aba responde
503 e nada é lido nem gravado.

---

## 7. O painel

- **Detalhe do lead → bloco Atendimento**, logo abaixo do cabeçalho (na página
  larga, abre a coluna do meio), com três abas:
  - **Conversa**: cliente, assistente, equipe e cadência, com as marcas
    "cadência", "passagem ao vendedor", "pelo celular da loja", "não saiu"; a
    caixa para responder pelo número da loja; e os botões *Entregar ao
    vendedor agora*, *Pausar assistente*, *Devolver a conversa ao assistente*,
    *Devolver para reaquecer*.
  - **Resumo**: o resumo do assistente e a ficha (o que o cliente disse, com
    "não disse" à vista), a origem do anúncio e a entrega.
  - **Aquecimento**: a nota com a régua (marcas do morno e do quente), os
    motivos com o sinal, a linha do tempo e a cadência.
- **Card do quadro**: selo "Quente · 82" e "Com o assistente".
- **Leads → Atendimento IA** (`/admin/leads/atendimento`): o assistente
  (conversas, entregas por motivo, tempo até a entrega, custo, opt-outs), a
  temperatura dos abertos, **de onde vieram** (anúncio de clique para o
  WhatsApp, WhatsApp direto, canal do site com a fonte — com conversão), **a
  equipe** com os leads do assistente (recebidos, tempo até confirmar o aviso,
  tempo até o primeiro contato registrado, sem contato, conversão) e as
  cadências (toques, reaquecidos). O vendedor vê só os próprios números.
  A aba **Configuração** (Admin e Gestor) liga o assistente e edita tudo da
  régua — inclusive o nome e **como ele se apresenta** (§12); a aba **Fotos** (Admin e Gestor) mostra e corrige como as fotos de
  cada carro foram separadas em camadas (§6.1).

> Quem atende **do próprio número** não aparece na conversa da loja. O tempo
> até o primeiro contato dele vem do registro no lead (ou da resposta pelo
> painel). Sem registro, a tabela diz "sem registro" — nunca zero.

---

## 8. As rotas

| Rota | Quem chama | O que faz |
|---|---|---|
| `POST /api/atendimento/evolution` | n8n (`ATENDIMENTO_MOTOR_TOKEN`, só `Authorization: Bearer`) | Grava a mensagem, cria o lead, devolve `responder` e `aguardar_ms`. Nunca erra fora de autenticação. |
| `POST /api/atendimento/responder` | n8n | `{ lead_id, mensagem_id }`. Só a última da rajada responde; até 120 s (duas voltas). |
| `POST /api/atendimento/rodada` | n8n, a cada 15 min | `{ reservar: true }` envia e devolve; sem ele é **prévia**. |
| `GET/POST /api/leads/[id]/conversa` | painel | Lê a conversa (pela sessão, com o escopo do lead) / responde pelo número da loja. |
| `POST /api/leads/[id]/assistente` | painel | `pausar`, `retomar`, `entregar`, `devolver`. |
| `GET/PUT /api/atendimento/config` | painel (Admin, Gestor) | A configuração da loja, e o que falta nas integrações. Desligar devolve os leads do assistente à equipe. |
| `GET /api/atendimento/relatorio?dias=30` | painel | O relatório, recortado pelo escopo de quem pede. |
| `POST /api/atendimento/fotos` | n8n, a cada 15 min (junto com a rodada) | Classifica as fotos do estoque que o modelo de visão ainda não viu, até 40 s por chamada. |
| `GET/PATCH/POST /api/atendimento/fotos/estoque` | painel (Admin, Gestor) | A aba Fotos: o andamento por carro e a galeria (`?veiculo=`), a correção à mão de uma foto, e classificar agora (a fila, ou `{ veiculo, refazer }`). |

## 9. O banco — `20261020120000_atendimento_ia.sql` e `20261021120000_fotos_do_atendimento.sql`

Aditiva. Três tabelas novas com `org_id`, RLS e leitura que **herda o escopo de
`leads`** (o vendedor lê a conversa dos leads dele; marketing e financeiro,
nenhuma), escrita só pelo servidor: `atendimento_config` (nasce **desligada**),
`atendimento_mensagens` (`wa_id` único: idempotência e eco) e
`atendimento_qualificacoes` (retratos e tokens). Colunas novas e nuláveis em
`leads` para o estado atual. `registrar_contato_do_lead` passa a tirar de
"Novo" também o canal `evolution`. Um gatilho recusa mudança do estado do
assistente vinda da sessão (só o servidor muda), e
`achar_ou_criar_lead_do_whatsapp` acha ou cria o lead da conversa sob trava
por telefone, garantindo o atendimento pela Evolution com as etiquetas do
anterior. Conversa e retratos vão junto quando o lead é eliminado (LGPD, art.
18, VI). O aceite veste admin, gestor, dois vendedores, marketing e anônimo,
prova o isolamento de uma segunda loja e roda na cadeia de
`tests/migracoes-executam.test.ts`.

As leituras com a chave de serviço filtram pela loja de `org_padrao()` (a
configuração, a idempotência da entrada), e o que se grava leva `org_id`.

A segunda migração cria `atendimento_fotos` (a classificação: camada, ângulo,
descrição, aproveitável, tokens e — na correção à mão — quem e quando; uma
linha por URL de foto de cada carro, leitura da equipe e escrita só do
servidor) e acrescenta a
`atendimento_mensagens` a foto que saiu na conversa (`midia_url`,
`veiculo_id`, `camada` — só na saída, só imagem, com endereço http(s)).

---

## 10. Como ligar

1. **Banco**: aplicar as migrações `20261020120000_atendimento_ia.sql` e
   `20261021120000_fotos_do_atendimento.sql`.
2. **Vercel**: `ATENDIMENTO_MOTOR_TOKEN`, `DEEPSEEK_API_KEY`,
   `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCIA` (ver
   `.env.example`) — e republicar.
3. **Equipe**: WhatsApp de cada vendedor, do administrador e do gestor em
   **Usuários e permissões** (sem ele, o resumo não tem para onde ir, e o alerta
   avisa).
4. **n8n**: importar `Motors Atendimento — Entrada (Evolution).json` e
   `Motors Atendimento — Rodada.json` (vêm **desligados**). Criar a credencial
   Header Auth `ATENDIMENTO_MOTOR_TOKEN` (`Authorization: Bearer <token>`) e a
   do webhook da Evolution. Os workflows não guardam a execução que deu certo
   (o corpo tem telefone e mensagem do cliente).
5. **Evolution**: desligar a integração com o **Chatwoot** e apontar o webhook
   da instância (evento `MESSAGES_UPSERT`, com o cabeçalho da credencial) para o
   webhook do workflow de entrada. Ligar a transcrição de áudio da Evolution,
   se quiser que o assistente entenda áudio.
6. **Prévia**: chamar `/api/atendimento/rodada` com `{ "reservar": false }`.
7. **Painel**: Leads → Atendimento IA → Configuração. Conferir pesos, preço,
   distribuição e cadências; marcar **O assistente responde** e gravar.
8. Ligar os dois workflows no n8n.

Até o passo 7, nada muda para o cliente: com o assistente desligado, a entrada
só grava a conversa e cria o lead.

---

## 11. O que ficou de fora, e por quê

- **Desligar o código do Chatwoot.** Fica no repositório, intocado: a troca é
  estrangulamento, não big-bang (HANDOFF, decisão 6). Desligada a integração na
  Evolution, a rota do Chatwoot simplesmente para de receber. Remover o código
  é outra entrega, depois de um mês de atendimento novo.
- **Agenda de test-drive com lembrete, pós-visita e "carro compatível chegou".**
  São cadências do manobrAI que dependem de agenda e de casar estoque novo com
  interesse; a estrutura de cadência suporta, e entram na próxima rodada.
- **Áudio.** Entendido quando a transcrição da Evolution está ligada; sem ela,
  o assistente pede para escrever.
- **Monitorar o número de cada vendedor.** Conectar o WhatsApp de cada vendedor
  à Evolution daria a conversa dele no painel. É uma instância por pessoa, com
  implicação de privacidade, e precisa da decisão do dono.

## 12. Decisões do dono

Tomadas em **20/10/2026** e gravadas na linha da loja pela migração
(`20261020120000_atendimento_ia.sql`, com aceite que confere). Todas mudam na
tela, em **Leads → Atendimento IA → Configuração**.

1. **Distribuição — rodízio, com o administrador podendo trocar**: *"rodízio,
   com o adm podendo mudar manualmente"*. Ver §4.
2. **Preço — sim**: o assistente informa o **preço anunciado** do catálogo,
   sempre dizendo que é o anunciado; condição final, desconto e parcela
   continuam com a equipe (e pedir desconto ou valor final entrega o lead).
3. **Avisar a partir de — quente.**
4. **Nome — "Ney", a versão digital do Silvio Ney**: *"com o mesmo mote de
   versão digital do nosso Silvio Ney"*. O assistente se apresenta como "Ney, a
   versão digital do Silvio Ney, gestor da loja" (campo **Como ele se
   apresenta**, até 160 caracteres, sem quebra de linha nem instrução para o
   modelo). A regra 8 do prompt segura o resto: ele é um assistente
   **virtual** e **nunca diz que é uma pessoa** — se perguntarem, diz isso com
   naturalidade.
5. **Pesos e cadências**: rever depois do primeiro mês, com o relatório.

**Merge**: só depois do teste completo no branch paralelo (*"sem merge por
enquanto, vamos testar no branch paralelo, só entra 100%"*).

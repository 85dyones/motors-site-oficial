# Funil de vendas — a régua, a pesquisa e a proposta

Briefing do dono em **2026-08-28**, em cinco partes:

> *"todo lead precisa ir para a aba de clientes e fornecedores também, para
> melhorar gestão. precisamos ter uma opção de dar o negócio como ganho ou
> perdido, selecionando opções para mensurar em relatórios depois. temos que
> ser capazes de editar o funil de vendas de acordo com a necessidade, com
> alertas inteligentes de estagnação do lead no whatsapp do vendedor e após um
> prazo razoável, transferir o lead para outro vendedor, salvo os que já estão
> em negociação ou com visita agendada. a navegação através do funil precisa
> melhorar, uma barra de slide seria ideal além das setas, um atalho para falar
> com o cliente pelo whatsapp direto do card também é um must have. verifique o
> que fazem os grandes gestores de funil como pipedrive e, sem inchar as
> ferramentas, traga algo funcional e inovador, com uma curva de adoção mais
> amigável."*

Este documento é a **fonte de verdade** do funil: o que a pesquisa encontrou,
que regras foram propostas a partir dela, o que foi implementado e o que
depende de decisão do dono.

---

## 1. O ponto de partida: o que existia

| Peça | Onde estava | Problema |
|---|---|---|
| As 7 etapas | `const ETAPAS` em `LeadsKanban.tsx` **e** um `check` na migração `20260807210000` | Mudar o funil exigia deploy **e** migração, na ordem certa. Na prática, não era possível. |
| Ganho / perdido | Duas colunas do kanban | O card parava de incomodar e o motivo morria com ele. Não havia como responder *"por que a gente perde venda?"* |
| Tempo | Nada | Um lead que entrava às 22h de sexta esperava alguém abrir a tela na segunda. |
| Transferência | Nada | Lead na mão de quem está de férias fica na mão de quem está de férias. |
| WhatsApp no card | Um `<a href="wa.me/…">` no telefone | Abria a conversa em branco, e não registrava nada. |

---

## 2. A pesquisa

### 2.1 Pipedrive — as três lições que sobreviveram

**a) Nunca crie etapas "Fechado".** A orientação repetida por quem opera
Pipedrive é usar os botões *Won* e *Lost*, não colunas de fechamento: a etapa
diz onde o card está, o desfecho diz o que aconteceu com o negócio. São coisas
diferentes e medem coisas diferentes.

**b) O motivo da perda é o dado mais valioso do CRM — e o primeiro a se perder
quando é opcional.** A recomendação é analisar a distribuição todo mês: *se 40%
são "sem orçamento", a qualificação é que precisa de conserto*. Um Pipedrive
aceita até 100 motivos cadastrados.

**c) "Rotting" — apodrecimento — é por etapa, não global.** O prazo de
inatividade é configurado em cada etapa do funil, porque a atenção que cada uma
exige é diferente: dois dias no primeiro contato, dez na proposta enviada. O
card fica sombreado de vermelho quando estoura. E o alerta **não é automático**:
o Pipedrive só pinta, quem quiser notificação monta uma automação.

Um quarto ponto, que a comunidade repete: *um negócio parado por 2× o prazo
deve ser marcado como perdido, e não como "aguardando" — sempre dá para
reabrir.* É a origem da regra de reabertura implementada aqui.

### 2.2 Velocidade de resposta — o número que decide o resto

Este é o dado mais duro que a pesquisa produziu, e ele é específico do setor:

- Leads de internet respondidos **em até 5 minutos convertem cerca de 9× mais**
  que os respondidos após 30 minutos. Em taxas absolutas: **25–32%** dentro de
  cinco minutos contra **3–5%** depois de uma hora.
- A referência de 5 minutos vem de um estudo do MIT/InsideSales (2007),
  popularizado pela *Harvard Business Review* em 2011, e segue de pé.
- Operações de BDC de alto desempenho atribuem o lead **imediatamente** e
  trabalham com SLA de primeira resposta abaixo de 5–10 minutos, com alerta no
  CRM quando o lead passa do prazo.
- **Só 13,2% das concessionárias respondem em até 5 minutos; mais de 75% levam
  mais de uma hora.**
- Fila de rodízio cega é apontada como parte do problema: *quando o lead cai numa
  fila esperando o próximo disponível, a velocidade evapora* — precisa haver
  sempre alguém responsável pelo próximo lead que entra.

### 2.3 Reatribuição de lead parado — o consenso entre CRMs

Salesforce, HubSpot e as ferramentas de roteamento em cima deles convergem para
o mesmo desenho:

- **SLA com rede de segurança:** se o lead fica intocado dentro de uma janela
  definida, ele é reatribuído ao próximo vendedor disponível ou escalado para a
  gestão.
- **A janela varia por origem:** fontes de alta intenção pedem uma hora;
  nutrição de longo prazo aceita janelas longas.
- **48 horas sem toque num lead quente é perda consumada** — é o exemplo
  recorrente na literatura.
- **Escalar, não só rodar:** depois de N tentativas, o caso vai para um humano
  decidir, em vez de circular indefinidamente.

### 2.4 Motivos de perda no varejo automotivo brasileiro

A literatura de concessionária no Brasil aponta como perdas reais do setor:
**compra futura, baixa valorização do usado, condições de financiamento e falta
de estoque** — além da lentidão no atendimento, citada como uma das principais
razões pelas quais concessionárias perdem venda, porque *"o interesse do cliente
digital esfria de forma extremamente acelerada"*.

**Fontes:**
[Pipedrive — Lost reasons](https://support.pipedrive.com/en/article/lost-reasons) ·
[Pipedrive — The Rotting feature](https://support.pipedrive.com/en/article/the-rotting-feature) ·
[Solvaa — Using the Pipedrive rotting feature](https://solvaa.co.uk/how-to-use-the-pipedrive-rotting-feature-to-track-deal-inactivity-and-boost-conversions/) ·
[MinorCo — 5 common Pipedrive mistakes](https://minorco.com/blog/5-common-pipedrive-mistakes-to-avoid/) ·
[Le Lab — Pipedrive best practices](https://lelab0.com/en/guide-pipedrive/best-practices/) ·
[Proactive Training Solutions — Lead response time for car dealers 2026](https://proactivetrainingsolutions.com/lead-response-time-for-car-dealers-2026-speed-to-lead-benchmarks/) ·
[Clearline AI — The 5-minute rule](https://www.useclearline.com/blog/dealership-lead-response-time) ·
[Rework — Lead response time optimization](https://resources.rework.com/libraries/automotive-sales-growth/lead-response-time-optimization) ·
[Demand Local — 25 dealership phone lead statistics](https://www.demandlocal.com/blog/dealership-phone-lead-statistics/) ·
[LeadAngel — Managing lead re-assignment](https://www.leadangel.com/blog/operations/how-to-manage-lead-re-assignment-when-owners-become-inactive/) ·
[AskElephant — Automatic lead assignment in CRM](https://www.askelephant.ai/blog/automatic-lead-assignment-in-crm-4-strategies-for-modern-sales-teams) ·
[Intelia — Erros no atendimento de concessionária](https://blog.intelia.com.br/5-erros-no-atendimento-de-concessionaria-que-te-fazem-perder-vendas-de-veiculos/) ·
[e-Dialog — CRM automotivo](https://www.edialog.com.br/crm-automotivo/)

---

## 3. A proposta de regras

> Tudo nesta seção é **ponto de partida declarado**, não verdade revelada. A
> tela de configuração existe exatamente para o dono ajustar depois de ver o
> primeiro mês de dados. O que está travado em código é a mecânica; os números
> são dados.

### 3.1 Prazos por etapa (semeados na migração)

| Etapa | Avisa em | Transfere em | Protegida |
|---|---|---|---|
| Novo | **15 min** | **1 h** | não |
| Em contato | 1 dia | 3 dias | não |
| Proposta | 2 dias | 5 dias | não |
| Visita agendada | 2 dias | — | **sim** |
| Negociação | 2 dias | — | **sim** |
| Ganho / Perdido | — | — | terminal |

**Por que 15 minutos e não 5.** O benchmark do setor é 5 minutos, e ele é sobre
o *contato com o cliente* — não sobre a frequência com que se cutuca o vendedor.
Um aviso a cada 5 minutos vira spam no celular de quem está atendendo outro
cliente no balcão, e alerta que vira spam deixa de ser lido em uma semana.
Quinze minutos é o menor prazo que produz **um** empurrão, não três.

**Por que 1 hora para transferir um lead novo.** É o prazo em que a conversão
já caiu para um terço (25–32% → 3–5%). Depois disso, o lead vale mais na mão de
quem pode atender agora do que na mão de quem o recebeu primeiro.

**As duas exceções são as que o dono nomeou.** `visita` e `negociacao` nascem
`protegida = true`: avisam, nunca transferem. Tirar o lead de quem já tem visita
marcada quebra um compromisso com o **cliente**, não só com o vendedor.

### 3.2 Para quem vai o lead transferido

Para o vendedor ativo, com WhatsApp cadastrado, que tem **menos leads abertos**
— com o nome como desempate.

Rodízio cego (o próximo da lista) distribui igual no papel e desigual na
prática: quem está de férias ou de folga acumula, e é exatamente o problema que
a pesquisa aponta na fila round-robin. Carga aberta é a medida honesta de "quem
consegue atender agora", e a escolha é determinística — a mesma fila, chamada
duas vezes, escolhe a mesma pessoa.

**Sem teto de transferências.** A primeira versão parava na terceira troca, por
medo de pingue-pongue. Decisão do dono em 2026-08-28: *"quantas se fizerem
necessárias até o atendimento"* — e ele está certo sobre a mecânica. O lead só
circula enquanto está **parado**; qualquer toque humano reinicia o relógio e o
tira da fila. Um lead que trocou de dono cinco vezes não é um lead defeituoso:
são cinco pessoas que não o atenderam, e travá-lo na terceira apenas o
esconderia — o oposto do que a fila existe para fazer.

O contador `leads.transferencias` continua andando, e o card mostra
*"5ª transferência"* a partir da segunda. **Visibilidade em vez de bloqueio.**
A "escalação para a gestão" da literatura vira, aqui, um número no card que
qualquer um vê ao olhar o quadro.

### 3.3 O relógio: o que reinicia e o que não reinicia

**Qualquer toque humano reinicia.** Mover de etapa, anotar, trocar de dono,
abrir a conversa no WhatsApp pelo card. É a semântica do Pipedrive ("last
updated") e ela existe por um motivo de comportamento: o vendedor que anotou
*"liguei, retorna terça"* está atendendo. Cobrá-lo de novo em uma hora ensina a
equipe a ignorar o alerta — que é o pior resultado possível de um sistema de
avisos.

**A transferência automática NÃO reinicia.** Se reiniciasse, o dono novo
herdaria o prazo zerado e o lead ficaria mais três dias parado, agora com a
bênção do sistema.

### 3.4 Quando o aviso pode sair

- **Nada entre 20h e 8h, nada aos domingos.** Mesma régua do §4.3 do manual do
  Ciclo, e pelo mesmo motivo: o vendedor não é um servidor. O lead que estagna
  no sábado à noite é avisado na segunda de manhã — **o relógio dele não para,
  só a mensagem.**
- **Um empurrão por lead a cada 20 horas.** Vinte, e não vinte e quatro, para o
  lembrete diário não escorregar alguns minutos por dia até bater no bloqueio
  das 20h e pular um dia inteiro.
- **Nada é descartado em silêncio.** O que não sai vem na resposta com o motivo
  (`fora_do_horario`, `vendedor_sem_whatsapp`, `alerta_recente`,
  `sem_vendedor_disponivel`). Fila que descarta calada é fila que ninguém
  audita.

### 3.5 Motivos semeados

**Perda** (10): preço acima do que o cliente queria pagar · comprou em outro
lugar · financiamento ou crédito reprovado · não tínhamos o carro que ele queria
· avaliação do usado abaixo do esperado · condições de pagamento ou entrada ·
desistiu de trocar de carro · sumiu, não respondeu mais · vai comprar mais para
frente · contato inválido, duplicado ou trote.

**Ganho** (4): à vista · financiado · com carro na troca · consórcio ou carta
contemplada.

Duas observações sobre a lista:

- **`contato_invalido` não é venda perdida** — é lead que nunca foi lead. Sem
  ele, trote e duplicado entram na estatística de "perdemos por preço" e
  distorcem tudo que vier depois.
- **No ganho, o motivo é a forma de pagamento.** É o corte que a loja usa para
  planejar caixa e para saber quanto do resultado depende de banco.

### 3.6 O motivo e a observação fazem trabalhos diferentes

Pedido do dono em 2026-08-28: *"deixe um campo de observação adicional além dos
motivos padrão"*. São dois campos porque são duas perguntas:

| | Motivo | Observação |
|---|---|---|
| Formato | lista fechada | texto livre |
| Obrigatório | **sim** | não |
| Serve para | agrupar no relatório | dizer o que a lista não previu |

Texto livre não agrupa: *"preço"*, *"Preço"*, *"preco alto"* e *"achou caro"*
viram quatro fatias do mesmo gráfico. Mas lista sem campo aberto empurra o
vendedor para o motivo mais próximo e contamina a estatística — *"queria prata,
só tinha branco"* não é "sem estoque" nem "preço", e sem onde escrever isso ele
vira um dos dois.

Juntos: **o número diz quanto, a frase diz o quê.** O relatório mostra as
barras por motivo e, embaixo, as últimas 50 observações escritas — que é onde o
próximo motivo novo costuma aparecer três vezes antes de alguém cadastrá-lo.

As observações ficam atrás do mesmo gate do recorte por vendedor, e não junto
dos gráficos: é texto livre, e texto livre escrito por gente cita nome de
gente. Abri-lo a quem a matriz A17 mantém longe do contato individual
devolveria, pela porta lateral, o que o resto do relatório toma o cuidado de
não mostrar.

---

## 4. O que foi implementado

### 4.1 O banco — `20260828120000_funil_de_vendas.sql`

| Objeto | O que é |
|---|---|
| `funil_etapas` | As etapas, editáveis. `leads.situacao` ganhou FK para `chave` **no lugar do `check` fixo** — era ele que impedia criar etapa nova. |
| `funil_motivos` | Motivos de ganho e perda, editáveis. |
| `leads_eventos` | O rastro: cada mudança de etapa, de dono, cada aviso e cada desfecho. `on delete cascade` — pedido de exclusão do titular (LGPD art. 18, VI) leva o rastro junto. |
| Colunas em `leads` | `desfecho`, `desfecho_em`, `desfecho_motivo`, `desfecho_valor`, `desfecho_nota`, `ultimo_movimento_em`, `ultimo_contato_em`, `responsavel_desde`, `responsavel_anterior`, `transferencias`, `alertado_em`, `alertas`. |
| Gatilhos | Antes: mantém os relógios e o desfecho coerentes. Depois: escreve o rastro (`security definer` — rastro que a RLS pode engolir não é rastro). |
| `montar_fila_do_funil(agora, reservar)` | A fila de avisos, com a régua inteira. Só `service_role`. |
| `registrar_contato_do_lead(lead, canal)` | O que o botão de WhatsApp do card chama. |
| `agenda_de_pessoas` | Reconstruída com um **quinto ramo**: os leads. |
| RLS de `leads` | `using (true)` → `is_staff(auth.uid())`. Ver §6. |

A migração carrega **duas autoconferências** que quebram a aplicação se a
promessa não valer, e roda na cadeia de `tests/migracoes-executam.test.ts`.

### 4.2 O lead na agenda de pessoas

Ramo na view, **não cópia numa tabela**. Um gatilho que inserisse cada lead em
`parceiros` estaria errado por três motivos: `parceiros` é o cadastro do
financeiro (o lead viraria opção no seletor de fornecedor de contas a pagar);
cópia precisa de sincronia e fica para trás em silêncio; e a agenda existe para
**encontrar** duplicata, não para fabricá-la.

O mapeamento: `papel = 'lead'`, `especialidade` = o rótulo da etapa do funil,
`observacoes` = interesse + anotação, `ativo = false` quando o lead foi
**perdido** (sai do filtro padrão, continua alcançável em "todos"). Editar
continua sendo no kanban — `CAMPOS_EDITAVEIS.lead` é `{}` de propósito.

### 4.3 A tela

- **Barra de slide** (`input[type=range]`) + **trilho de etapas** clicável +
  **as setas do card**, que continuam. Três gestos diferentes: a barra move a
  vista, o trilho salta para uma coluna, as setas movem o lead. A barra some
  quando o quadro cabe na tela. Arrastar perto da borda rola o trilho sozinho.
- **Botão de WhatsApp no card**, com a mensagem já escrita (nome do cliente,
  carro de interesse, nome do vendedor) — e **registrando o contato**, que é o
  que reinicia o relógio.
- **Ganho e perdido são BOTÃO, não coluna.** Segunda rodada com o dono:
  *"não precisa de uma aba de ganho ou perdido, só um botão para destinar"*. É
  também o que Pipedrive recomenda por outro caminho — *"nunca crie etapas
  Fechado"*: uma coluna terminal só cresce, e um quadro com duas colunas que
  nunca esvaziam deixa de ser um quadro de trabalho. As etapas continuam
  existindo em `funil_etapas` (é o que `leads.situacao` grava, e a FK exige que
  existam); o que sumiu foi o lugar delas na tela.
- **O fechado sai do quadro e ganha endereço.** Uma lista própria, com motivo,
  observação, valor, quem atendeu e um seletor de volta ao funil. "Sem coluna"
  não pode virar "o card sumiu" — é a falha muda que este projeto persegue.
  Reabrir pede a etapa de destino em vez de adivinhar: o gatilho limpa o
  desfecho, mas não sabe de onde o lead veio, e chutar "Proposta" criaria uma
  proposta que nunca existiu.
- **Motivo obrigatório, observação livre ao lado.** A caixa abre antes de
  gravar, e a rota recusa (422 com `motivo_obrigatorio`) se o motivo não vier.
  Validar só na tela viraria opcional no dia em que alguém chamasse a rota de
  outro lugar. O motivo seleciona e o botão confirma: a primeira versão gravava
  no clique do motivo, o que deixou de servir quando a observação passou a ser
  um pedido explícito — um campo que só é preenchido por quem lê a letra miúda
  é um campo vazio.
- **Cor por estagnação** em quatro níveis, com um *"esfriando"* antes do
  estouro — a hora de agir é antes da cobrança.
- **Filtro "só os parados"**, que costuma ser a fila do dia.
- `/admin/leads/funil` — o editor, onde **cada linha escreve de volta a regra
  que acabou de criar**, em português, enquanto se digita. É a resposta ao
  pedido de curva de adoção amigável: uma tabela com "estagnação (min)" seria
  correta e não seria usada.
- `/admin/leads/relatorio` — ganhos e perdas por motivo, vendedor e período,
  com **as perdas primeiro** (é o dado acionável), *"sem motivo informado"* à
  vista como termômetro de confiança do próprio relatório, e as últimas 50
  **observações** escritas ao fechar.

### 4.4 As rotas

| Rota | Quem entra |
|---|---|
| `GET/PUT /api/funil/config` | Ler: staff. Escrever: Admin e Gestor. |
| `GET /api/funil/relatorio` | Staff. O recorte **por vendedor** só para quem vê lead ou relatório gerencial. |
| `POST /api/funil/alertas` | n8n, com `FUNIL_MOTOR_TOKEN`. |
| `PATCH /api/leads/gerenciar` | Ganhou desfecho, motivo, valor e `contato`. |

---

## 5. O n8n

Mesma divisão do motor do Ciclo: **o banco decide, o n8n entrega**.

```
POST https://<site>/api/funil/alertas
Authorization: Bearer $FUNIL_MOTOR_TOKEN
Content-Type: application/json

{ "reservar": true }
```

Resposta:

```jsonc
{
  "ok": true,
  "reservado": true,
  "total": 2,
  "fila": [
    {
      "lead_id": "…",
      "aviso": "transferencia",            // atribuicao | estagnacao | transferencia
      "lead": { "nome": "…", "whatsapp": "5541…", "interesse": "Onix 2020",
                "etapa": "Proposta", "minutos_parado": 7300 },
      "destinatario": { "nome": "Carla", "whatsapp": "5541…" },
      "responsavel_anterior": "Bruno",
      "mensagem": "…"                       // já pronto para enviar
    }
  ],
  "suprimidos": [ { "lead_id": "…", "suprimido_por": "alerta_recente", … } ]
}
```

O workflow faz três coisas: acorda **de hora em hora**, chama esta rota com
`reservar: true`, e envia `mensagem` para `destinatario.whatsapp` pela Evolution.
Nada de lógica de horário ou de prazo no workflow — ela está no banco.

`"reservar": false` é uma **prévia**: mostra o que aconteceria, não grava e não
transfere ninguém. É o que se chama para conferir a régua antes de ligar o
workflow.

### O workflow, versionado

`Motors Funil — Alertas de Estagnação.json`, na raiz do repositório, no mesmo
padrão dos outros dois. Oito nós:

```
De hora em hora → Pedir a fila → Distribuir os avisos → Tem para quem mandar?
                                                          ├─ sim → Enviar (Evolution) → Registrar envio ─┐
                                                          └─ não → Não enviado (sem número) ─────────────┴→ Conferir entregas
```

**Para importar:** n8n → Import from File. Depois, três coisas:

1. **A credencial `FUNIL_MOTOR_TOKEN`** (Header Auth) precisa ser criada e
   selecionada no nó *Pedir a fila* — o JSON traz um id de marcação que não
   existe na instância. `Name = Authorization`, `Value = Bearer <token>`.
2. **`WHATSAPP_GESTAO`** no nó *Distribuir os avisos*: o número de quem cuida
   do cadastro comercial. Vazio, o aviso de pendência de cadastro não sai — e
   fica registrado como não enviado, em vez de sumir.
3. **Ligar** só depois de conferir a prévia. Ele é importado **desligado** de
   propósito: a primeira rodada manda mensagem de verdade.

**Três decisões dentro do workflow que merecem nota:**

- **Ele acorda de hora em hora, todo dia — inclusive de madrugada e domingo.**
  Não é descuido. Quem decide se pode avisar agora é a rota; repetir a régua de
  horário no cron a duplicaria em dois lugares que ninguém obriga a concordar,
  e num fuso ainda por cima. Fora do horário a fila volta suprimida e nada é
  gravado. Custo: ~10 chamadas por dia que não fazem nada.
- **O aviso de cadastro faltando sai uma vez por dia, não a cada hora.**
  `vendedor_sem_whatsapp` e `sem_vendedor_disponivel` são silenciosos e
  precisam de alguém; mas um lembrete repetido doze vezes vira ruído que se
  aprende a ignorar — o oposto do que um alerta serve para fazer. As outras
  duas supressões (`fora_do_horario`, `alerta_recente`) não geram aviso
  nenhum: são a régua funcionando.
- **Falha de entrega derruba a execução.** É o único buraco do desenho: a rota
  transfere no mesmo comando que monta a fila, e a entrega acontece depois, no
  n8n. Se o envio falhar em silêncio, o lead trocou de dono e o dono novo não
  soube — exatamente a transferência sem aviso que o resto do sistema existe
  para impedir. O nó *Conferir entregas* estoura quando qualquer aviso de
  vendedor não saiu, e diz quais. O aviso de gestão fica fora da conta: ele
  não transfere nada.

`tests/funil.test.ts` trava o contrato entre o arquivo e a rota — os campos
lidos, os nomes das supressões, a credencial e o nó de conferência. A cópia
versionada de workflow já divergiu do que roda ao vivo duas vezes neste
projeto (`supabase/README.md`); o teste cobre a metade que o repositório
controla.

> **A transferência só acontece com `reservar: true`**, dentro do mesmo comando
> que produz a mensagem. Não existe transferência silenciosa: se ninguém vai ser
> avisado, o lead não troca de dono.

**Variável nova:** `FUNIL_MOTOR_TOKEN` na Vercel. Não é o `CICLO_MOTOR_TOKEN` —
segredo mede acesso, e a base de leads é um conjunto de dados diferente do da
base de clientes do Ciclo. Sem a variável, a rota responde 503 (estado honesto),
nunca 401.

---

## 6. Uma porta que estava aberta

A migração `20260807210000` abriu `leads` para `authenticated using (true)`.
Fazia sentido no dia: `authenticated` era sinônimo de "gente do painel".

Deixou de fazer em **2026-08-13**, quando o papel `cliente` entrou (a Garagem).
O comprador que acessa a área dele é `authenticated` e não é staff — e desde
então podia pedir a lista inteira de leads com a chave anônima. Ninguém percebeu
porque a **tela** sempre checou perfil; a checagem estava na porta da frente e a
dos fundos ficou destrancada.

Este pacote foi obrigado a mexer nisso porque leva `leads` para dentro da view
`agenda_de_pessoas`, que é `security_invoker` — a mesma abertura chegaria a
outra tela. A policy passou a ser `is_staff(auth.uid())`, e a autoconferência da
migração empurra a porta vestindo a pele de um cliente da Garagem.

Nenhuma tela do painel muda de comportamento.

---

## 7. O que ficou de fora, e por quê

- **Automação de mensagem para o cliente.** O botão do card abre o WhatsApp com
  o texto escrito; quem aperta enviar é o vendedor. Mensagem automática para
  cliente é o caminho mais curto para o número da loja ser bloqueado, e o pedido
  foi por um *atalho para falar*, não por um robô falando.
- **Prazo por origem do lead.** A pesquisa mostra que a janela deveria variar
  por fonte (site, Instagram, portal). Hoje ela varia por etapa. Acrescentar a
  origem é uma coluna a mais em `funil_etapas` — mas primeiro é preciso um mês
  de dados para saber se a diferença existe nesta loja.
- **Vários funis.** Pipedrive tem N pipelines (venda, pós-venda, avaliação).
  Aqui há um. A estrutura suporta acrescentar um `funil_id` depois; abrir agora
  seria pagar complexidade por um problema que ninguém relatou.
- **Reabrir lead perdido com histórico do motivo anterior.** Reabrir limpa o
  desfecho (correto: um "perdido por preço" que voltou a negociar não pode
  continuar contando como perda no mês). O motivo antigo fica em
  `leads_eventos`, mas nenhuma tela o mostra ainda.

---

## 8. Decidido em 2026-08-28

As quatro perguntas em aberto foram respondidas pelo dono na segunda rodada.
Ficam registradas com a resposta, e não apagadas: quem abrir este arquivo daqui
a seis meses precisa saber que os números foram escolhidos, não herdados.

1. **Os prazos da tabela §3.1 valem?** — *"ok"*. Seguem como estão, inclusive os
   15 min / 1 h do `Novo`, que são agressivos de propósito. São editáveis em
   **Configurar funil** sem deploy.
2. **Duas transferências é o teto certo?** — *"quantas se fizerem necessárias
   até o atendimento"*. **O teto foi removido.** Ver §3.2: o lead só circula
   enquanto está parado, e o atendimento é o freio. O contador vira um selo no
   card a partir da segunda troca.
3. **Cortar a lista de motivos de perda para 6 depois do primeiro mês?** —
   *"concordo"*. Fica para a revisão do primeiro mês; a lista é editável na
   mesma tela.
4. **Cadastrar o WhatsApp de cada vendedor?** — *"concordo"*. Pendência de
   operação: em **Usuários e permissões**, campo WhatsApp. Sem ele o vendedor
   não recebe aviso e não entra no rodízio, e a fila devolve
   `vendedor_sem_whatsapp` / `sem_vendedor_disponivel` — em voz alta, mas
   devolve.

### Ainda em aberto

- **Rever os prazos com um mês de dados.** A tabela §3.1 é um ponto de partida
  declarado; a primeira leitura do relatório é o que diz se 15 minutos gera
  ação ou gera ruído.
- **Ligar o workflow do n8n.** O arquivo está versionado e o token já está na
  Vercel (2026-08-28); falta importar, preencher `WHATSAPP_GESTAO` e ativar.
- **Limpar os leads de teste antes de ativar.** A prévia de 2026-08-28 trouxe
  oito leads sem dono, e pelo menos cinco são sobra de QA — "TESTE GTM",
  "teste turnstile", "Motors Store test". Ligar assim manda oito mensagens
  sobre leads que não existem, e ensina a equipe a ignorar o alerta na
  estreia. O motivo *"Contato inválido, duplicado ou trote"* existe para
  isso.

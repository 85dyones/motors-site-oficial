# Gestão do lead: o contrato do servidor

O desenho está em `docs/design/gestao_do_lead/README.md`; este documento é a
**fonte de verdade do que o servidor entrega** para as telas dele: as rotas, o
formato de cada resposta, os códigos de erro e as funções puras que a tela usa
para dizer a mesma coisa que a rota.

O banco já existia (migração `20260923150000_gestao_do_lead.sql`, em produção
desde 23/09/2026): `leads_interacoes`, o próximo passo e os dados do negócio em
`leads`, e a função `registrar_interacao_do_lead`. Esta entrega (03/10/2026) é
a metade do servidor: `src/lib/gestaoDoLead.ts`, `src/lib/gestaoDoLead-servidor.ts`
e as rotas abaixo. Nenhuma migração nova.

Os **veículos de interesse** (vários carros por lead, cada um resolvido, e o
relatório por veículo) entraram em 05/10/2026 e têm a seção própria: §7. Essa
parte tem migração (`20261005120000_veiculos_de_interesse.sql`), e o código foi
escrito para ir ao ar **antes** dela.

---

## 1. Quem chama

Todas as rotas daqui usam a sessão de quem está logado, e a mesma porta:

| Situação | Resposta |
|---|---|
| Sem sessão | `401 { "error": "Não autorizado" }` |
| Fora da equipe, ou perfil desativado | `403 { "error": "Acesso restrito à equipe" }` |
| Marketing, Financeiro (não veem lead) | `403 { "error": "Seu perfil não vê leads" }` |
| Lead fora do escopo, inexistente, ou id que não é UUID | `404 { "error": "Lead não encontrado" }` |

O escopo é o de `src/lib/escopoDeLeads.ts`: Administrador, todos; Gestor e SDR,
os que têm responsável; Comercial, só os dele.

**A guarda vem antes de tudo.** No banco, `leads_interacoes` e `leads_eventos`
são legíveis por toda a equipe, e `registrar_interacao_do_lead` alcança
qualquer lead pelo id. Por isso cada rota lê o lead, confere o escopo e só
então toca no histórico ou chama a função. Vale com a RLS de `leads` aberta à
equipe (como está hoje) e fechada por escopo (`20261003130000`, ainda não
aplicada): os dois casos estão em teste.

**Cliente da sessão em todas as leituras e escritas**, como no `gerenciar`. A
chave de serviço ignora a RLS e o que se lê aqui é dado de pessoa; e a função
recusa a chave de serviço (ela exige `is_staff(auth.uid())`).

Todo erro tem `error` (a frase para a tela). Os de validação têm também
`codigo`, que é o que a tela deve ler para decidir o que fazer.

---

## 2. As rotas

### 2.1 `GET /api/leads/[id]`: o detalhe

Sem corpo. Resposta `200`:

```jsonc
{
  "lead": {
    // A linha inteira de `leads` (select *), como na fila, mais os anexos.
    "id": "uuid", "nome": "string", "telefone": "string|null", "email": "string|null",
    "interesse": "string|null", "canal": "string|null", "observacoes": "string|null",
    "situacao": "string",            // chave de funil_etapas
    "responsavel": "string|null",
    "transferencias": 0,             // number, nunca nulo
    "created_at": "ISO", "ultimo_movimento_em": "ISO|null", "ultimo_contato_em": "ISO|null",
    "desfecho": "ganho|perdido|descartado|null", "desfecho_motivo": "string|null",
    "desfecho_valor": "number|null", "desfecho_nota": "string|null", "desfecho_em": "ISO|null",
    "proximo_passo": "string|null", "proximo_passo_vence_em": "ISO|null",
    "proximo_passo_definido_em": "ISO|null", "proximo_passo_definido_por": "string|null",
    "carro_na_troca": "string|null", "faixa_entrada": "string|null", "pagamento_pretendido": "string|null",
    "veiculo_id": "number|null",
    "utm_source": "string|null", "utm_campaign": "string|null",   // e os demais utm_*, gclid, fbclid
    "ag_uid": "string|null",
    "avaliacao": "objeto|null", "perfil": "objeto|null",          // BlocoDaAvaliacao / BlocoDoPerfil
    // anexos
    "ref": "string|null",                    // 8 caracteres em caixa alta, ou null
    "chatwoot_conversation_id": "number|null",
    "com_assistente": false,
    "humano_assumiu_em": "ISO|null",
    "etiquetas": ["string"]
  },
  "etapa": { "chave": "string", "rotulo": "string", "tipo": "aberta|ganho|perdido|descartado" },  // ou null
  "aberto": true,                            // false = tem desfecho
  "estagnacao": {
    "nivel": "ok|atencao|estagnado|transferir",   // a régua do card (lib/funil)
    "minutos_parado": 0,
    "parado_desde": "ISO"
  },
  "passo": {                                 // null quando não há próximo passo
    "texto": "string", "vence_em": "ISO|null",
    "definido_em": "ISO|null", "definido_por": "string|null",
    "situacao": "atrasado|hoje|proximo|null",
    "rotulo": "HOJE · 16:30"                 // rotuloDoPasso(..., "card"), ou null
  },
  "veiculo": { "id": 0, "nome": "Chevrolet Onix LT 1.0 2020", "km": 45000, "preco": 62900, "vendido": false },  // ou null
  "veiculos": [ /* VeiculoDeInteresse: §7.2 */ ],
  "veiculos_disponivel": true,               // false: a tabela ainda não existe (§7.1)
  "pendencias_de_veiculo": [ { "opcao": "uuid", "veiculo_id": 0, "rotulo": "string" } ],  // opções ainda em avaliação
  "historico": [ /* ItemDoHistorico, do mais novo para o mais antigo: §3.5 */ ],
  "sugestoes": [ { "texto": "string", "quando": "amanhã 10:00", "vence_em": "ISO" } ],  // [] em lead fechado
  "vizinhos": { "anterior": "uuid|null", "proximo": "uuid|null" },
  "etapas": [ /* EtapaDoFunil, em ordem */ ],
  "motivos": [ /* MotivoDoFunil, só os ativos */ ],
  "atendentes": [ { "nome": "string" } ],
  "escopo": "todos|designados|meus",
  "podeRemoverResponsavel": false,           // só o Administrador
  "etiquetasEditaveis": true,
  "funilPendente": false,
  "avisos": ["string"]                       // leituras secundárias que falharam; [] é o normal
}
```

- `vizinhos`: os leads **abertos** da mesma etapa que quem pede enxerga, na
  ordem do quadro (mais novo primeiro). `anterior` é o de cima. Lead fechado
  não está em coluna: os dois nulos.
- `veiculo`: lido de `estoque_motors` pelo `veiculo_id`. Carro que saiu do
  estoque devolve `null` e o `veiculo_id` continua no lead. É o veículo
  **principal**; a lista completa está em `veiculos` (§7.2).
- `etapas`, `motivos`, `atendentes`: o que o cabeçalho precisa para mover,
  atribuir e fechar. Essas ações continuam no `PATCH /api/leads/gerenciar`.
- `avisos`: se o histórico, a conversa ou o carro não puderem ser lidos, o lead
  vem assim mesmo e a frase vem aqui. Mostre na faixa de erro.

Erros além dos da porta: `500 { error }` se a leitura do lead falhar.

### 2.2 `POST /api/leads/[id]/interacoes`: registrar

Corpo:

```jsonc
{
  "tipo": "nota|ligacao|whatsapp|visita",
  "resultado": "atendeu|nao_atendeu|caixa_postal",   // só em ligação; opcional
  "texto": "string",                                 // opcional em ligação com resultado
  "proximo_passo": "string",
  "proximo_passo_vence_em": "2026-10-04T10:00:00-03:00"   // ISO COM fuso (ou Z)
}
```

Valida com `decidirInteracao` e grava por `registrar_interacao_do_lead`
(registro e próximo passo numa transação; o relógio da estagnação reinicia).
Resposta `200`:

```jsonc
{
  "ok": true,
  "interacao_id": "uuid",
  "lead": {                                  // o resumo para o card; null se a releitura falhar
    "id": "uuid", "situacao": "string", "responsavel": "string|null", "desfecho": "string|null",
    "proximo_passo": "string|null", "proximo_passo_vence_em": "ISO|null",
    "proximo_passo_definido_em": "ISO|null", "proximo_passo_definido_por": "string|null",
    "ultimo_contato_em": "ISO|null", "ultimo_movimento_em": "ISO|null",
    "ultima_interacao": { "tipo": "string", "quando": "ISO", "texto": "string|null", "autor": "string|null" }
  },
  "item": { /* ItemDoHistorico do registro novo; null se a releitura falhar */ },
  "aviso": "string"                          // só quando gravou e não deu para reler
}
```

| Status | `codigo` | Quando |
|---|---|---|
| 400 | `proximo_passo_obrigatorio` | Lead aberto sem texto ou sem data do próximo passo |
| 400 | `proximo_passo_incompleto` | Lead fechado com só o texto ou só a data |
| 400 | `interacao_vazia` | Sem texto (e não é ligação com resultado) |
| 400 | `tipo_invalido` | Tipo fora da lista, ou corpo ilegível |
| 400 | `resultado_invalido` | Resultado fora da lista, ou em registro que não é ligação |
| 400 | `data_invalida` | Data sem fuso ou ilegível |
| 400 | (sem código) | A função recusou por regra do banco |
| 503 | (sem código) | A função não existe no banco (migração pendente) |

Lead fechado (ganho, perdido, descartado) dispensa o próximo passo.

### 2.3 `POST /api/leads/[id]/chegou`: "Chegou na loja"

Corpo opcional: `{ "texto": "string" }` (padrão: "Chegou na loja.").

Registra uma interação `visita`, define o próximo passo **"Atender na loja"**
vencendo agora, e move o lead para a etapa `visita` pelo mesmo `update` com
escopo do `gerenciar` (quem escreve "Movido para ..." no histórico é o gatilho
do banco). Resposta `200`:

```jsonc
{
  "ok": true,
  "interacao_id": "uuid",
  "movido": true,                 // false: o lead já estava na visita ou adiante
  "situacao": "visita",           // a etapa em que o lead ficou
  "responsavel_avisado": false,   // sempre false: ver §5
  "lead": { /* o resumo de §2.2, ou null */ },
  "item": { /* ItemDoHistorico da visita, ou null */ },
  "aviso": "string"               // só quando gravou e não deu para reler
}
```

| Status | `codigo` | Quando |
|---|---|---|
| 409 | `lead_fechado` | O lead tem desfecho. Mover o reabriria; reabra pelo quadro |
| 422 | `etapa_de_visita_ausente` | A etapa `visita` não existe, está inativa ou virou desfecho |
| 500 | `movimento_falhou` | A visita foi registrada e o movimento não. Traz `interacao_id` |

O lead só anda para **frente**: quem está em `visita` ou `negociacao` fica onde
está (`movido: false`), com a visita e o próximo passo registrados.

### 2.4 `PATCH /api/leads/[id]/dados`: dados do negócio

Corpo: um ou mais dos cinco campos. `null` ou `""` limpa o campo.

```jsonc
{
  "carro_na_troca": "string|null",
  "faixa_entrada": "sem_entrada|ate_5k|de_5k_a_10k|de_10k_a_20k|acima_20k|null",
  "pagamento_pretendido": "a_vista|financiado|com_troca|consorcio|null",
  "email": "string|null",
  "veiculo_id": "number|null"     // id de estoque_motors
}
```

Resposta `200`: `{ "ok": true, "dados": { "id", "carro_na_troca", "faixa_entrada", "pagamento_pretendido", "email", "veiculo_id" } }`
(os cinco campos como ficaram no banco).

| Status | `codigo` | Quando |
|---|---|---|
| 400 | `campo_desconhecido` | Qualquer campo fora dos cinco. Nada do pedido é gravado |
| 400 | `sem_campos` | Corpo vazio ou ilegível |
| 400 | `faixa_entrada_invalida`, `pagamento_pretendido_invalido`, `email_invalido`, `carro_na_troca_invalido`, `veiculo_invalido` | Valor fora da forma |
| 422 | `veiculo_desconhecido` | O `veiculo_id` não está em `estoque_motors` |

Etapa, responsável, desfecho e anotação **não** passam por aqui: continuam no
`PATCH /api/leads/gerenciar`, com as travas de cada um. Gravar estes dados não
reinicia o relógio da estagnação.

**`veiculo_id` é o caminho antigo**, mantido para a tela que ainda o usa. Com a
tabela dos veículos de interesse no banco, um número aqui faz o mesmo que
`POST /api/leads/[id]/veiculos` com `principal: true` (§7.4): o carro entra nas
opções do lead, se ainda não está, e vira o principal. Erros a mais nesse caso:
`409 principal_ja_escolhido` (há outro carro escolhido) e `400
principal_descartado`. `null` limpa só o principal (as opções ficam), a menos
que o lead tenha um carro **escolhido**: aí é `409 principal_ja_escolhido`
("Reabra a escolha antes de tirar o carro do lead"), e nada do pedido é
gravado. Sem a tabela, grava só a coluna, como sempre.

### 2.5 `GET /api/leads/gerenciar`: o que mudou

Tudo o que a resposta tinha continua igual. Entraram:

- em cada lead: `ultima_interacao: { tipo, quando, texto, autor } | null` (a
  mais recente de `leads_interacoes`; em ligação sem texto, `texto` é o
  resultado por extenso), e `proximo_passo` / `proximo_passo_vence_em`
  garantidos como `string|null`;
- `avisos: string[]` na raiz (leitura das interações falhou ou bateu no teto);
- `?busca=<termo>`: a busca única, por nome (contém), telefone (dígitos
  contidos) ou referência. Obedece ao escopo de quem pede. A resposta traz
  `busca: { termo, tipo: "nome"|"telefone"|"ref", ref? }`. Erros: `400` com
  `codigo: "busca_invalida"` (menos de 2 letras ou de 4 dígitos); `403
  "Seu perfil não busca leads"` para Marketing e Financeiro.
- `?ref=` segue como era (`busca: { ref }`), e vale sobre `?busca=` se vierem
  os dois.
- perfil desativado passou a receber `403` também aqui.

A busca devolve lead fechado também (`desfecho` preenchido): a tela diz que ele
está fora do quadro, como já faz com a referência.

---

## 3. `src/lib/gestaoDoLead.ts`

Puro, sem I/O, serve servidor e cliente. Todo `agora` é em milissegundos
(`Date.now()`), e todo dia e hora é contado em `America/Sao_Paulo`.

### 3.1 O registro

```ts
decidirInteracao(corpo: CorpoDaInteracao | null | undefined, lead: { aberto: boolean }): DecisaoDeInteracao
// { ok: true, args: { p_tipo, p_resultado, p_texto, p_passo, p_vence_em } }
// { ok: false, status: 400, codigo, erro }
leadEstaAberto(lead: { desfecho?: string | null }): boolean
```

É a mesma função que a rota usa: o botão "REGISTRAR" habilita quando ela
devolve `ok`, e a dica ao lado sai do `codigo`.

Constantes: `TIPOS_DE_INTERACAO`, `RESULTADOS_DA_LIGACAO`,
`ROTULO_DA_INTERACAO` (Anotação, Ligação, WhatsApp, Visita à loja),
`ROTULO_DO_RESULTADO` (Atendeu, Não atendeu, Caixa postal).

### 3.2 As sugestões e o mapa de etapas

```ts
sugestoesDeProximoPasso(etapa: string | null | undefined, agora?: number): SugestaoDePasso[]
// SugestaoDePasso = { texto: string; quando: string; vence_em: string /* ISO UTC */ }
```

| Desenho | Chave em `funil_etapas` | Sugestões |
|---|---|---|
| Novo | `novo` | Primeiro contato pelo WhatsApp · hoje +15 min; Ligar para qualificar · hoje +1 h |
| Em contato | `em_contato` | Enviar proposta · amanhã 10:00; Convidar para visita · amanhã 10:00 |
| Proposta | `proposta` | Cobrar retorno da proposta · amanhã 10:00; Enviar simulação de financiamento · hoje 17:00 |
| Visita agendada | `visita` | Confirmar visita · amanhã 09:00; Avaliar carro na troca · hoje 16:00 |
| Negociação | `negociacao` | Levar contraproposta ao gerente · hoje 16:00; Fechar pedido · amanhã 10:00 |

Etapa criada depois pelo dono, e etapa terminal, não têm sugestão (`[]`).
"hoje 17:00" pedido depois das 17h vira "amanhã 17:00": a sugestão nunca nasce
atrasada. `ETAPA_DE_VISITA = "visita"` é a etapa do "Chegou na loja".

### 3.3 O passo no relógio

```ts
situacaoDoPasso(venceEm: string | null | undefined, agora?: number): "atrasado" | "hoje" | "proximo" | null
rotuloDoPasso(venceEm, agora?: number, formato?: "card" | "lista"): string | null
```

| Caso | `card` | `lista` |
|---|---|---|
| Acabou de vencer (até 15 min) | `AGORA` | `Agora` |
| Vence hoje | `HOJE · 16:30` | `16:30` |
| Venceu hoje | `ATRASADO · 20 MIN`, `ATRASADO · 4 H` | `11:40` |
| Venceu ontem | `ATRASADO · 1 D` | `ontem 17:00` |
| Venceu há mais dias | `ATRASADO · 5 D` | `5 d` |
| Amanhã | `AMANHÃ · 09:00` | `Amanhã 09:00` |
| Em 2 a 6 dias | `SÁB · 10:00` | `Sáb 10:00` |
| Em 7 dias ou mais | `12/10 · 10:00` | `12/10 10:00` |

A seta "→" do desenho é da tela. `FOLGA_DO_AGORA_MS` é a folga do "Agora".

### 3.4 A Lista do dia

```ts
ordenarListaDoDia<T extends LeadDaLista>(leads: readonly T[], agora?: number): ListaDoDia<T>
// { atrasados: T[]; hoje: T[]; proximos: T[]; semPasso: number }
```

Cada grupo por vencimento, o mais antigo primeiro. Lead fechado não entra.
`semPasso` conta os leads abertos sem próximo passo, que ficam fora dos grupos:
a tela pode dizer "N sem próximo passo".

### 3.5 O histórico

```ts
montarHistorico(interacoes, eventos, contexto?: { etapas?, motivos? }): ItemDoHistorico[]
itemDaInteracao(interacao: InteracaoDoLead): ItemDoHistorico
ultimaInteracaoPorLead(interacoes: readonly InteracaoDoLead[]): Map<string, UltimaInteracao>
```

```ts
interface ItemDoHistorico {
  id: string;                      // "interacao:<uuid>" ou "evento:<uuid>"
  origem: "humana" | "sistema";    // o filtro "Interações | Sistema"
  tipo: string;                    // nota|ligacao|whatsapp|visita, ou o tipo do rastro
  rotulo: string;                  // "Ligação", "Etapa", "Transferência automática"...
  autor: string | null;            // "Sistema" quando foi o motor
  quando: string;                  // ISO
  texto: string;                   // a frase pronta
  resultado?: "atendeu" | "nao_atendeu" | "caixa_postal";
  proximoPasso?: { texto: string; vence_em: string | null };
  importada?: true;                // veio da anotação antiga
}
```

Tudo o que vem de `leads_eventos` é `sistema`, mesmo quando uma pessoa moveu o
card. Tipos do rastro: `entrada`, `etapa`, `responsavel` (inclusive a
atribuição feita no Chatwoot), `transferencia`, `contato`, `desfecho`, `alerta`,
`etiqueta`, `nota`.

### 3.6 A busca, a referência e os dados

```ts
filtroDaBusca(termo: string | null | undefined): FiltroDaBusca | null
// { tipo: "ref", ref } | { tipo: "telefone", digitos, refAlternativa? } | { tipo: "nome", termo, padrao }
refDoLead(agUid: string | null | undefined): string | null
decidirDados(corpo: unknown): DecisaoDosDados
```

Oito dígitos exatos são telefone e também referência: a rota procura pelos dois.

| `faixa_entrada` | Rótulo | | `pagamento_pretendido` | Rótulo |
|---|---|---|---|---|
| `sem_entrada` | Sem entrada | | `a_vista` | À vista |
| `ate_5k` | Até R$ 5 mil | | `financiado` | Financiado |
| `de_5k_a_10k` | R$ 5 a 10 mil | | `com_troca` | Com troca |
| `de_10k_a_20k` | R$ 10 a 20 mil | | `consorcio` | Consórcio |
| `acima_20k` | Acima de R$ 20 mil | | | |

Em código: `FAIXAS_DE_ENTRADA` e `PAGAMENTOS_PRETENDIDOS` (`{ valor, rotulo }`).
As chaves de pagamento são as dos motivos de ganho: a caixa de ganho pode abrir
com o motivo que casa já escolhido.

### 3.7 Para montar a data na tela

```ts
diaNaLoja(agora: number, deslocamento?: number): string            // "2026-10-04"
instanteNoFusoDaLoja(dia: string, hora: string): string | null     // ("2026-10-04", "10:00") → ISO UTC
```

Os chips "Hoje | Amanhã | Em 3 dias | Próx. semana" são `diaNaLoja(agora, 0|1|3|7)`;
com o campo de hora, `instanteNoFusoDaLoja` dá o `proximo_passo_vence_em`. Não
monte a data com o fuso do aparelho.

---

## 4. O que o banco não deixou fazer

Nada aqui foi contornado em silêncio. Cada item pede mudança de banco, e
decisão do dono:

- **"Chegou na loja" são duas escritas**, a função e o `update` da etapa. Uma
  transação só pede uma função nova. Se o movimento falhar, a rota responde
  `movimento_falhou` e diz que a visita ficou.
- **O autor da visita é quem clicou**, e não "Balcão": a função assina com
  `autor_atual()` e não aceita outro nome.
- **A última interação da fila** sai de uma leitura limitada a 1000 linhas (o
  teto do PostgREST). Passando disso, a resposta avisa em `avisos`. A saída é
  uma view com `distinct on (lead_id)`.
- **A busca por nome distingue acento** ("Joao" não acha "João"): falta
  `unaccent` no banco.
- **O histórico e as funções continuam abertos à equipe no banco.** Quem
  monta a chamada direto no PostgREST lê `leads_interacoes` e `leads_eventos`
  de qualquer lead, e registra em qualquer lead. A guarda é só destas rotas.

---

## 5. O que ficou de fora

- **O aviso ao responsável no "Chegou na loja".** Não há por onde enfileirar
  um aviso avulso: `/api/funil/alertas` só entrega o que `montar_fila_do_funil`
  calcula pela régua de estagnação. A rota responde `responsavel_avisado: false`
  e o histórico não diz "avisado". Fica pendente, com a Fase 4.
- **Fase 4: a régua pelo vencimento do próximo passo e o resumo das 8h.** As
  duas mudam `montar_fila_do_funil` (função do banco) e o que o n8n envia.
  Dependem de aprovação do dono.
- **Fase 5.**
- **O F5 do desenho.** O desenho põe o estado na URL "para o F5 funcionar",
  mas desde 02/10 recarregar qualquer tela do painel leva à Visão geral
  (`lib/recargaDoPainel`). O link direto (`/admin/leads/[id]`, o do alerta)
  funciona; a recarga, não. E nenhuma mensagem pode mandar "recarregar"
  (`tests/recarga-do-painel`).
- **O aviso de vencimento no bloco do próximo passo.** O desenho escreve "É o
  que aparece no card e o que dispara o aviso quando vence". O aviso é da Fase
  4: a tela diz só "É o que aparece no card e na Lista do dia".

---

## 5.1 As telas (03/10/2026)

Feitas sobre este contrato, sem rota nova:

| Peça | Arquivo |
|---|---|
| O quadro (busca, URL, arrasto, gravação) | `src/components/admin/LeadsKanban.tsx` |
| Card enxuto | `src/components/admin/CardDoLead.tsx` |
| Linha de controles | `src/components/admin/ControlesDoFunil.tsx`, `SegmentadoDoPainel.tsx` |
| Lista do dia | `src/components/admin/ListaDoDia.tsx` |
| Negócios fechados | `src/components/admin/FechadosDoFunil.tsx` |
| Detalhe (gaveta e página) | `src/components/admin/DetalheDoLead.tsx` e os blocos em `src/components/admin/lead/` |
| Página do lead | `src/app/admin/leads/[id]/page.tsx` |
| Regras de tela, puras | `src/lib/filaDoFunil.ts` |

O que a tela decide por conta própria, e onde:

- **"Minha fila"** para quem vê a equipe: os leads cujo `responsavel` é o
  `full_name` de quem está logado. O nome vem da página (`/admin/leads`), que o
  lê do perfil; a resposta da fila não o traz. Sem nome, o controle some.
- **O estado na URL** (`?vista=`, `?escopo=`, `?lead=`): a tela muda no clique e
  escreve a URL com `history.replaceState`, sem ida ao servidor e sem entrada
  nova no histórico. A URL que muda por fora (um link, o voltar do navegador) é
  adotada (`SincroniaComAUrl`, `popstate`). Os chips e a busca não vão para a
  URL.
- **Os chips**: "Atrasados" e "Hoje" (um ou outro), "Parados" (para todos: quem
  a régua de estagnação já cobra) e "Sem responsável" (só para o Administrador,
  `escopo: "todos"`; ligá-lo leva ao Quadro). Todos contam sobre escopo e busca.
- **As sugestões de próximo passo** são calculadas na tela
  (`sugestoesDeProximoPasso(etapa, agora)`) quando a caixa é desenhada, e a data
  no toque. O `sugestoes` da leitura do detalhe não é usado: envelhecia.
- **Registro começado**: com algo escrito, Esc não fecha a gaveta, e FECHAR ou
  a troca de card perguntam na própria gaveta.
- **Lead que saiu do escopo**: se a releitura do detalhe responde 404, a gaveta
  fecha, a fila é relida e a tela diz "Este lead saiu da sua fila."
- **Carro de interesse**: "Trocar" pede o código do carro no estoque
  (`veiculo_id`). Não há busca de estoque nesta tela. (O servidor já tem a
  busca e as várias opções, §7; a tela nova ainda não foi feita.)
- **O `tel:` do LIGAR não passa por `trackContactClick`**: é a equipe ligando
  para o cliente, e medi-lo contaria contato recebido no GA4 e na CAPI.

---

## 6. Testes

- `tests/gestao-do-lead.test.ts`: a lib pura (viradas de dia em São Paulo,
  atraso, grupos da lista, cada tipo do rastro, a busca, os dados).
- `tests/gestao-do-lead-rotas.test.ts`: as rotas executadas sobre um banco em
  memória, com a RLS de `leads` aberta e fechada: escopo, códigos de validação
  e a ordem guarda → histórico → função.
- `tests/fila-do-funil.test.ts`: `lib/filaDoFunil` (escopo e vista por papel,
  contagens dos chips, a URL, o botão REGISTRAR e as dicas).
- `tests/gestao-do-lead-telas.test.ts`: as telas montadas (controles, Lista do
  dia, o detalhe nos dois layouts, registrar, "Chegou na loja", dados).
- `tests/card-do-lead-compacto*.test.ts`, `tests/busca-por-ref-fiacao.test.ts`,
  `tests/etiquetas-do-lead-fiacao.test.ts`: o card, a gaveta, a busca única e as
  etiquetas, no quadro montado.
- `tests/veiculos-de-interesse.test.ts` e
  `tests/veiculos-de-interesse-rotas.test.ts`: os veículos de interesse (§7.9).

---

## 7. Veículos de interesse (05/10/2026)

Pedido do dono: o carro de interesse é escolhido **buscando** o carro, e não
digitando o código; um lead pode ter **vários** carros de interesse; no fim do
atendimento cada opção é resolvida (uma escolhida, as outras descartadas **com
motivo**); e disso sai um relatório **por veículo**, para o dono do carro
consignado e para a estratégia comercial da loja.

O banco é a migração `20261005120000_veiculos_de_interesse.sql`: a tabela
`leads_veiculos` (uma linha por lead e carro), o gatilho que carimba autor,
retrato do carro e resolução, e as funções `resumo_de_interesse_do_veiculo` e
`interesse_por_veiculo`. O código: `src/lib/veiculosDeInteresse.ts` (puro, serve
servidor e tela), `src/lib/veiculosDeInteresse-servidor.ts` e as rotas abaixo.

`leads.veiculo_id` continua existindo e é o veículo **principal** do lead: o
card, a contagem de leads por veículo e o campo `veiculo` do detalhe leem a
coluna. Nenhum gatilho a reescreve; quem a mantém são estas rotas (§7.3).

### 7.1 Antes da migração

O código vai ao ar **antes** de a migração ser aplicada. Até lá a tabela e as
funções não existem, e cada rota sabe disso (`ehVeiculosIndisponivel`: PostgREST
`PGRST205` / `PGRST202`; Postgres `42P01` / `42883` **só quando a mensagem
nomeia** `leads_veiculos`, `resumo_de_interesse_do_veiculo` ou
`interesse_por_veiculo`. O mesmo código sobre outro objeto é erro de verdade:
`500`, ou aviso no detalhe):

| Rota | Sem a tabela |
|---|---|
| `GET /api/leads/[id]` | Como sempre. `veiculos` traz o carro único do lead como **uma** opção com `id: null`; `veiculos_disponivel: false`; `pendencias_de_veiculo: []`. Sem aviso. |
| `POST`, `PATCH`, `DELETE` em `…/veiculos…` | `503 { "error": "A lista de veículos de interesse ainda não está ativa. Por enquanto, o lead segue com um carro só.", "codigo": "veiculos_indisponivel" }` |
| `PATCH /api/leads/[id]/dados` com `veiculo_id` | Grava só `leads.veiculo_id`, como antes. |
| `PATCH /api/leads/gerenciar` | O desfecho é gravado; nada sobre veículos na resposta. |
| `GET /api/estoque/[id]/interesse` | `200 { "veiculos_disponivel": false, "veiculo": {…}, "relatorio": null }` |
| `GET /api/estoque/interesse` | `200 { "veiculos_disponivel": false, "veiculos": [] }` |
| `GET /api/estoque/busca` | Não depende da migração. |
| Captura do site (`POST /api/leads`) | O lead é gravado; a primeira opção, não (silêncio). A carga inicial da migração cria a linha depois. |

A tela decide por `veiculos_disponivel`: com `false`, mostra o carro único e
não oferece adicionar, resolver nem relatório.

### 7.2 A opção, na resposta

`veiculos` (no detalhe e na resposta de toda escrita) é uma lista de:

```jsonc
{
  "id": "uuid|null",              // id da OPÇÃO. null: o principal ainda sem linha (ver abaixo)
  "veiculo_id": 8203724,          // estoque_motors.id
  "rotulo": "Chevrolet Onix LT 1.0 2020",   // o retrato do banco, na grafia da tela
  "preco_na_epoca": 62900,        // preço quando o carro entrou no lead; null na opção sem linha
  "preco_atual": 59900,           // preço de hoje no estoque; null se o carro saiu
  "km": 45000,                    // null se o carro saiu
  "no_estoque": true,             // false: saiu do estoque. null: o estoque não pôde ser lido
  "vendido": false,               // null quando no_estoque não é true
  "situacao": "em_avaliacao|escolhido|descartado",
  "motivo_descarte": "preco|null",
  "motivo_rotulo": "Preço acima do que queria|null",
  "nota": "string|null",
  "adicionado_por": "string|null",   // nome. null: veio da captura do site ou da carga inicial
  "criado_em": "ISO",
  "resolvido_por": "string|null",
  "resolvido_em": "ISO|null",
  "principal": true               // é o leads.veiculo_id
}
```

A ordem: o principal primeiro, depois na ordem em que os carros entraram.

**Opção com `id: null`**: o lead tem `veiculo_id` e não há linha em
`leads_veiculos` para ele (a tabela não existe, ou o registro da captura
falhou). Ela aparece para o carro não sumir da tela, mas não pode ser resolvida
nem apagada. Para criar a linha: `POST …/veiculos` com `{ "veiculo_id", "principal": true }`.

Se a leitura das opções **falhar de verdade** (não é a tabela ausente), o
detalhe não devolve lista vazia: traz o principal como essa opção única e a
frase em `avisos`.

`pendencias_de_veiculo`: as opções (com linha) que seguem `em_avaliacao`, como
`{ opcao, veiculo_id, rotulo }`. É o que a tela oferece resolver ao fechar.

### 7.3 O veículo principal

Regra única, em `planejarResolucoes` (puro):

- o **primeiro** carro adicionado a um lead sem principal vira o principal.
  Principal apontando para uma opção **descartada** conta como "sem principal"
  (`semPrincipalValido`): o carro adicionado, ou a opção **reaberta**, assume;
- **escolher** um carro o torna o principal. Se havia outro escolhido, ele é
  reaberto (`em_avaliacao`) antes: só um escolhido por lead;
- **descartar o principal** passa o principal à opção em avaliação mais antiga.
  Sem nenhuma, o principal fica onde está;
- `principal: true` troca o principal, desde que não haja outro carro
  **escolhido** (o escolhido é sempre o principal) e o carro não esteja
  descartado;
- **apagar** o principal (Admin) passa, no mesmo pedido, ao escolhido, senão à
  opção em avaliação mais antiga, senão `leads.veiculo_id` fica nulo. A troca
  é gravada **antes** de apagar: se ela falhar, nada é apagado (`500
  principal_nao_atualizado`); se o apagar falhar, o principal volta ao lugar.

### 7.4 As rotas do lead

Todas com a porta de §1: sessão, equipe ativa, perfil que vê lead, e o **lead no
escopo antes de qualquer outra coisa** (`lerLeadNoEscopo`). Só depois o corpo é
validado e `leads_veiculos` é tocada. A opção é sempre procurada entre as do
lead da URL: o id de uma opção de outro lead é `404 opcao_nao_encontrada`.

Toda escrita que dá certo responde `200` com:

```jsonc
{
  "ok": true,
  "veiculos": [ /* §7.2, relidos; null se a releitura falhar */ ],
  "principal_veiculo_id": 8203724,           // number|null
  "pendencias_de_veiculo": [ /* §7.2 */ ],
  "aviso": "string"                          // só quando gravou e não deu para reler
}
```

#### `POST /api/leads/[id]/veiculos`: adicionar

Corpo: `{ "veiculo_id": 8203724, "principal": true }` (`principal` opcional).
Resposta: o bloco acima, mais `"criada": true|false` e `"opcao": "uuid"`.
`criada: false` é o carro que já era opção e só virou o principal.

| Status | `codigo` | Quando |
|---|---|---|
| 400 | `corpo_invalido`, `veiculo_invalido`, `principal_invalido`, `campo_desconhecido` | Forma do corpo |
| 400 | `principal_descartado` | `principal: true` num carro que já é opção e está descartado |
| 409 | `veiculo_repetido` | O carro já é opção do lead (e não veio `principal`). Traz `opcao` |
| 409 | `principal_ja_escolhido` | `principal: true` com outro carro escolhido |
| 422 | `veiculo_desconhecido` | O carro não está em `estoque_motors` (quem recusa é o gatilho) |
| 500 | `principal_nao_atualizado` | A opção foi gravada e `leads.veiculo_id` não |
| 503 | `veiculos_indisponivel` | §7.1 |

Carro vendido e lead já fechado **são aceitos**: registrar depois o carro que o
cliente de fato considerou é uso legítimo.

#### `PATCH /api/leads/[id]/veiculos/[opcao]`: resolver, reabrir, anotar, tornar principal

Corpo, um ou mais de:

```jsonc
{
  "situacao": "em_avaliacao|escolhido|descartado",
  "motivo_descarte": "preco",     // obrigatório ao descartar; proibido fora do descarte
  "nota": "string|null",          // obrigatória com o motivo "outro"; até 2000 caracteres
  "principal": true               // só aceita true
}
```

- descartar: `{ situacao: "descartado", motivo_descarte, nota? }`;
- escolher: `{ situacao: "escolhido" }`. Limpa o motivo, vira o principal;
- reabrir: `{ situacao: "em_avaliacao" }`. Limpa o motivo; a nota fica;
- só anotar: `{ nota }`; só trocar o motivo de um descarte: `{ motivo_descarte }`.

Resposta: o bloco de §7.4, mais `"opcao": "uuid"`.

| Status | `codigo` | Quando |
|---|---|---|
| 400 | `corpo_invalido`, `sem_campos`, `campo_desconhecido` | Forma do corpo |
| 400 | `situacao_invalida` | Fora das três |
| 400 | `motivo_de_descarte_obrigatorio` | Descartar sem motivo |
| 400 | `motivo_invalido` | Motivo fora da lista (§7.7) |
| 400 | `motivo_so_no_descarte` | Motivo junto com escolher, reabrir ou opção não descartada |
| 400 | `nota_obrigatoria` | Motivo `outro` sem nota (inclusive apagar a nota de um descarte `outro`) |
| 400 | `nota_invalida`, `nota_longa` | Nota que não é texto, ou acima de 2000 caracteres |
| 400 | `principal_invalido`, `principal_descartado` | `principal` diferente de `true`; carro descartado como principal |
| 404 | `opcao_nao_encontrada` | A opção não existe neste lead, ou o id não é UUID |
| 409 | `principal_ja_escolhido` | `principal: true` com outro carro escolhido |
| 409 | `ja_ha_escolhido` | Corrida: outro clique escolheu um carro entre a leitura e a gravação |
| 500 | `principal_nao_atualizado` | A opção foi gravada e `leads.veiculo_id` não |
| 500 | `erro_do_banco` | Falha de gravação. Traz `opcao` e `gravadas` (o que já tinha mudado) |
| 503 | `veiculos_indisponivel` | §7.1 |

#### `DELETE /api/leads/[id]/veiculos/[opcao]`: apagar (só o Administrador)

Para o carro adicionado por engano. O gesto de todo dia é **descartar**, que
deixa o motivo no relatório. Resposta: o bloco de §7.4, mais `"apagada": "uuid"`.
Erros: `403 so_admin`, `404 opcao_nao_encontrada`, `500 principal_nao_atualizado`,
`503 veiculos_indisponivel`.

#### `POST /api/leads/[id]/veiculos/resolver`: resolver em lote

Corpo: uma **lista** (o corpo é o array):

```jsonc
[
  { "opcao": "uuid", "situacao": "escolhido" },
  { "opcao": "uuid", "situacao": "descartado", "motivo_descarte": "preco", "nota": "string" }
]
```

`situacao` é obrigatória em cada item; o resto segue a regra do `PATCH`. O
pedido inteiro é **validado antes** da primeira gravação: um item recusado e
nada é gravado, e a resposta traz o `codigo` do item e `opcao`. No máximo um
`escolhido` por pedido. Resposta: o bloco de §7.4, mais `"resolvidas": 2`.

Códigos próprios: `400 lote_invalido` (o corpo não é lista), `lote_vazio`,
`lote_grande` (mais de 50), `opcao_invalida`, `opcao_repetida`,
`varios_escolhidos`. Os demais são os do `PATCH`, com `opcao`.

### 7.5 Fechar o lead

Nesta versão o desfecho **não é bloqueado** por opção pendente: fechar continua
no `PATCH /api/leads/gerenciar`, com as regras de sempre. O que mudou nele:

- fechado como **ganho** um lead com **exatamente um carro ao todo**, ainda em
  avaliação, ele vira o escolhido (e o principal). A resposta traz
  `"veiculo_escolhido": "<id da opção>"`. "Ao todo" é o que a tela mostra: as
  opções **mais** o principal sem linha (`id: null`); uma opção e um principal
  sem linha são dois carros, e nada é escolhido. Uma opção única já
  **descartada** não é escolhida por cima;
- se essa escolha cabia e **falhou**, a resposta traz `"aviso"` com a frase
  para a tela (o carro não foi marcado, ou foi marcado e o principal não
  acompanhou) e a opção segue em `pendencias_de_veiculo`;
- em qualquer desfecho (ganho, perdido, descartado), se sobram opções em
  avaliação a resposta traz `"pendencias_de_veiculo": [ … ]`. É a deixa para a
  tela abrir a resolução em lote (`POST …/veiculos/resolver`);
- sem opção, sem pendência, ou sem a tabela, a resposta é a de sempre
  (`{ "ok": true }`). Falha nesta parte nunca derruba o desfecho.

Para decidir **antes** de fechar, a tela usa a função pura, com as opções que
já tem do detalhe:

```ts
pendenciasAoFechar(opcoes, desfecho): { pendentes, escolha_automatica, falta_escolhido }
// desfecho: "ganho" | "perdido" | "descartado" | null (lead aberto)
// escolha_automatica: a opção que o ganho vai escolher sozinho (não entra em pendentes)
// falta_escolhido: ganho sem nenhum carro escolhido nem por escolher
```

### 7.6 As rotas do estoque

#### `GET /api/estoque/busca?q=`: o seletor de carro

Porta: a dos leads (equipe ativa que vê lead; Marketing e Financeiro, `403`).
Mínimo de 2 caracteres. Cada palavra é procurada em marca, modelo e versão
(contém, sem distinguir caixa) e o carro tem de casar com **todas**; palavra só
de dígitos vale também como ano (4 dígitos) e como código do carro. Na placa só
é procurada a palavra com **cara de placa**: a placa inteira (`ABC1D23`,
`ABC1234`, com ou sem hífen) ou o final de quatro (`1D23`, `9876`, casando o
fim). "fox" acha o Fox, e não o carro de placa FOX1234. Até 12 carros, os à venda primeiro.

```jsonc
{
  "veiculos": [
    {
      "id": 8203724,
      "rotulo": "Chevrolet Onix LT 1.0 2020",
      "ano": 2020, "km": 45000, "preco": 59900,
      "placa_final": "1D23",      // os 4 últimos; ausente se o carro não tem placa
      "foto": "https://…",        // a capa (url_imagem); ausente se não há
      "vendido": false,           // carro vendido VEM: a tela avisa
      "publicado": true           // false: rascunho ou arquivado, fora da vitrine
    }
  ],
  "termos": ["onix", "2020"]      // o que foi de fato procurado
}
```

Erros: `400 busca_curta` (menos de 2 caracteres úteis), `401`, `403`.

- **Placa**: é coluna interna, que hoje toda a equipe (e só ela) lê pela view
  `estoque_motors_equipe`. A busca vai por essa view, com a sessão; a resposta
  leva só os quatro últimos caracteres. Chassi, renavam, custo e FIPE não são
  lidos.
- **Curingas**: `%`, `_`, `*`, `\`, vírgula, parênteses e aspas saem do termo
  antes de ele virar filtro (viram espaço). "100%" procura "100".
- **Acento**: a busca **distingue** acento ("citroen" não acha "citroën"). Não
  há coluna normalizada nem `unaccent` no banco, a mesma falta de §4.
- **Hífen na placa**: a placa inteira é procurada com e sem hífen, digitada de
  um jeito ou de outro.

#### `GET /api/estoque/[id]/interesse`: o relatório de um carro

Porta: **equipe ativa, qualquer perfil** (Marketing e Financeiro também): o
relatório é da loja inteira, por decisão do dono, e só traz agregados. A função
do banco é chamada com a sessão de quem abriu a tela (ela recusa a chave de
serviço).

```jsonc
{
  "veiculos_disponivel": true,
  "veiculo": { "id": 8203724, "rotulo": "Chevrolet Onix LT 1.0 2020", "km": 45000, "preco": 59900, "vendido": false },  // null se saiu do estoque
  "relatorio": {
    "veiculo_id": 8203724,
    "total": 8,                   // leads que consideraram o carro
    "em_avaliacao": 3,
    "sem_resolucao": 1,           // parte de em_avaliacao cujo lead já foi fechado sem resolver a opção
    "escolhido": 1,
    "descartado": 4,
    "percentuais": { "em_avaliacao": 37.5, "sem_resolucao": 12.5, "escolhido": 12.5, "descartado": 50 },  // sobre o total
    "motivo_principal": { "motivo": "preco", "rotulo": "Preço acima do que queria", "total": 2, "percentual": 50 },  // ou null
    "motivos": [ { "motivo": "preco", "rotulo": "…", "total": 2, "percentual": 50 } ],  // do mais citado ao menos; percentual sobre os DESCARTES
    "notas": [ { "texto": "queria 5 mil a menos", "motivo": "preco", "motivo_rotulo": "…", "em": "ISO" } ],  // as 200 mais recentes
    "primeiro_interesse_em": "ISO|null",
    "ultimo_interesse_em": "ISO|null"
  }
}
```

**Sem identidade de lead**: nem id, nome, telefone, responsável ou autor. A
resposta é montada campo a campo (`montarRelatorioDoVeiculo`); o que a função
viesse a devolver a mais não passa. ⚠️ A **nota** é texto livre do vendedor e
sai no relatório como foi escrita: não escrever nome nem telefone de cliente
nela.

Erros: `400 veiculo_invalido` (o id não é código de carro), `401`, `403`.

#### `GET /api/estoque/interesse`: o ranking

Mesma porta. Uma linha por carro do estoque (com ou sem interesse) mais os que
já saíram do estoque e têm histórico, do mais considerado ao menos:

```jsonc
{
  "veiculos_disponivel": true,
  "veiculos": [
    {
      "veiculo_id": 8203724, "rotulo": "Chevrolet Onix LT 1.0 2020",
      "no_estoque": true, "vendido": false, "preco_atual": 59900,   // vendido e preco_atual nulos fora do estoque
      "total": 8, "em_avaliacao": 3, "sem_resolucao": 1, "escolhido": 1, "descartado": 4,
      "motivo_principal": "preco", "motivo_principal_rotulo": "Preço acima do que queria",
      "motivos": [ { "motivo": "preco", "rotulo": "…", "total": 2, "percentual": 50 } ],
      "ultimo_interesse_em": "ISO|null"
    }
  ]
}
```

### 7.7 Os motivos de descarte

A chave fica no banco; o rótulo, no painel (`ROTULO_DO_MOTIVO_DE_DESCARTE`).
`tests/migracao-dos-veiculos-de-interesse.test.ts` compara a lista e os rótulos
com o CHECK e o comentário da coluna.

| Chave | Rótulo |
|---|---|
| `preco` | Preço acima do que queria |
| `parcela` | Parcela ou financiamento não fechou |
| `km` | Quilometragem |
| `ano_versao` | Ano ou versão |
| `cor` | Cor |
| `estado` | Estado de conservação |
| `opcionais` | Faltou opcional |
| `troca` | Avaliação da troca não fechou |
| `outro_da_loja` | Preferiu outro carro da loja |
| `comprou_fora` | Comprou em outro lugar |
| `desistiu` | Desistiu da compra |
| `vendido` | O carro foi vendido antes |
| `outro` | Outro (a nota é obrigatória) |

Situações: `em_avaliacao` (Em avaliação), `escolhido` (Escolhido), `descartado`
(Descartado), em `ROTULO_DA_SITUACAO_DA_OPCAO`.

### 7.8 O que a tela usa de `lib/veiculosDeInteresse`

```ts
MOTIVOS_DE_DESCARTE, ROTULO_DO_MOTIVO_DE_DESCARTE, rotuloDoMotivo(chave)
SITUACOES_DA_OPCAO, ROTULO_DA_SITUACAO_DA_OPCAO, LIMITE_DA_NOTA
decidirResolucao(corpo, atual?)   // a mesma regra do PATCH: habilita o botão e dá o `codigo` da dica
decidirInclusao(corpo)
pendenciasAoFechar(opcoes, desfecho)
MINIMO_DA_BUSCA_DE_CARRO, LIMITE_DA_BUSCA_DE_CARRO
rotuloDoVeiculoNaTela(rotulo)     // o retrato do banco na grafia da tela
```

### 7.9 O que ficou em aberto

- **As gravações não são atômicas.** Escolher um carro são até três escritas
  (reabrir o escolhido anterior, escolher o novo, apontar `leads.veiculo_id`), e
  o lote é uma por opção. Vão uma a uma pelo PostgREST. A ordem falha do lado
  seguro, a reabertura implícita é desfeita se a escolha falhar, e a resposta de
  erro diz o que ficou (`gravadas`, `principal_nao_atualizado`). A saída é uma
  função no banco que junte tudo numa transação; depende de migração.
- **O lead que nasce no site.** `POST /api/leads` registra o carro da ficha
  como primeira opção (`agendarInteresseDaCaptura`, com a chave de serviço, sem
  autor). Roda **depois da resposta** (`after()`): a captura não espera nem
  depende dela. Só `lead_id` e `veiculo_id` são gravados; o rótulo é do
  gatilho, do estoque, e **nenhum texto do pedido** vira nome de carro. Carro
  que não está no estoque não ganha opção. Se a gravação falhar, o lead fica
  com o principal sem linha (a opção `id: null` de §7.2) e não conta no
  relatório até alguém criar a opção. Um gatilho em `leads` fecharia o buraco;
  a migração escolheu não ter.
- **Lead perdido antes da entrega.** A carga inicial deixou as opções dos leads
  já perdidos em `em_avaliacao` (o motivo de perda do lead não é o motivo de
  descarte do carro). O relatório as conta em `sem_resolucao`.
- **Busca sem acento**: §7.6.
- **O "+N" no card do quadro.** `GET /api/leads/gerenciar` não devolve quantos
  carros o lead tem, e a tela não busca isso card a card. Entra quando a fila
  trouxer a contagem.
- **O relatório no repasse.** O carro de repasse tem id próprio (uuid), que não
  é `estoque_motors.id`: a visão do repasse não mostra "Interesse e objeções".

### 7.10 As telas (05/10/2026)

- `components/admin/lead/CarrosDeInteresse.tsx`: o bloco `v` do detalhe. Na
  gaveta vem logo depois do próximo passo (h p v c t d); na página, no alto da
  coluna dos dados. Lista as opções, com escolher, descartar (na própria linha,
  motivo em chips, nota obrigatória em "Outro"), reabrir, tornar principal e,
  para o Administrador, remover. Com `veiculos_disponivel: false` é o carro
  único, trocado pela busca via `PATCH …/dados`, sem as outras ações e sem aviso.
- `components/admin/lead/BuscaDeCarro.tsx`: o seletor (combobox) sobre
  `GET /api/estoque/busca`, com espera de 250 ms.
- `components/admin/lead/ResolucaoDosCarros.tsx`: "Feche os carros deste
  atendimento". Abre depois do desfecho gravado, quando sobram opções em
  avaliação; "Depois" a fecha e fica a linha "N carros sem resolução".
- `components/admin/InteresseDoVeiculo.tsx`: "Interesse e objeções", na visão do
  veículo (`/admin/estoque/[id]`). "Copiar resumo" leva contagens e motivos; as
  notas ficam de fora, porque são texto livre.
- `lib/carrosDeInteresseNaTela.ts`: as frases, a previsão otimista e o resumo.
- Quem pode remover: a tela usa `podeRemoverResponsavel` do detalhe (só o
  Administrador o tem); a rota confere o perfil de novo.

Testes das telas: `tests/veiculos-de-interesse-telas.test.ts`.

Testes: `tests/veiculos-de-interesse.test.ts` (a lib pura) e
`tests/veiculos-de-interesse-rotas.test.ts` (as rotas executadas num banco em
memória que se comporta como a migração: escopo nos dois mundos da RLS, a
tabela ausente, o principal, o ganho, a busca e o relatório sem dado de
pessoa). `tests/gestao-do-lead-rotas.test.ts` roda as rotas antigas com a
tabela ausente, como produção no dia do deploy.

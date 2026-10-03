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
  estoque devolve `null` e o `veiculo_id` continua no lead.
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
- **As telas** (card enxuto, Lista do dia, gaveta e página `/admin/leads/[id]`):
  vêm depois, sobre este contrato. Até lá o quadro atual segue funcionando: a
  resposta do `gerenciar` só ganhou campos.

---

## 6. Testes

- `tests/gestao-do-lead.test.ts`: a lib pura (viradas de dia em São Paulo,
  atraso, grupos da lista, cada tipo do rastro, a busca, os dados).
- `tests/gestao-do-lead-rotas.test.ts`: as rotas executadas sobre um banco em
  memória, com a RLS de `leads` aberta e fechada: escopo, códigos de validação
  e a ordem guarda → histórico → função.

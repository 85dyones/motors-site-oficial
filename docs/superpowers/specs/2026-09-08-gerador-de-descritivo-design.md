# Gerador de descritivo no editor de veículo

Data: 2026-09-08
Branch: `feat/gerador-de-descritivo` (worktree `descritivo-seo`, a partir de `origin/main` 6890809)

---

## 1. O problema, medido

Medição feita em produção em 2026-09-08, contra `estoque_motors`:

| Campo | Onde aparece | Estado |
|---|---|---|
| `descricao_seo` | meta description do Google e descrição do feed dos portais | 51 preenchidos, **34 vazios** |
| `descricao` | o texto que abre a ficha do veículo | **62 veículos com o mesmo blurb** institucional de 424 caracteres, 3 com "Sem descrição informada" |

São 85 veículos à venda e **22 textos distintos** entre eles. Entre os que ainda estão no blurb há um BMW X1 de R$ 179.900 e um Corolla Cross de R$ 134.900.

Contexto de apoio, na mesma medição: 79 dos 85 têm `laudo_pericia` preenchido; apenas 27 têm `opcionais`.

O mutirão de 2026-08-17 (`conteudo-seo/`) resolveu 41 veículos escrevendo `rascunhos.json` à mão e gravando por script. O estoque dobrou e a dívida voltou. **O que falta não é conteúdo, é ferramenta**: o texto precisa nascer no fluxo de quem cadastra o carro, não num mutirão externo.

## 2. O que se constrói

Dois botões na aba "Texto e SEO" do editor de veículo. Cada um gera uma sugestão para um campo, mostra-a num painel e espera a pessoa decidir. Nada é gravado pela ferramenta.

### Quem abre, quando, e que decisão sai

- **Quem:** admin, marketing e comercial — a régua que já governa os dois campos (`ACAO_DO_CAMPO_DE_VEICULO` aponta ambos para "Editar opcionais e destaques rápidos", `src/lib/permissoes.ts:300`, que é `faz` para essas três colunas de `PERFIS`). Gestor e financeiro não veem o botão porque já não veem o campo.
- **Quando:** ao cadastrar ou revisar um veículo. Também é o caminho para zerar os 62 no blurb, um por vez.
- **Que decisão sai:** o texto que vai para a ficha do carro, para o feed dos portais e para o resultado de busca do Google.

## 3. Arquitetura

```
[Gerar]  →  POST /api/estoque/[id]/descritivo   { campo: "descricao" | "descricao_seo" }
              ├─ auth + perfil (mesmo preâmbulo do PATCH em api/estoque/[id]/route.ts)
              ├─ lê o veículo DO BANCO — não confia no corpo da requisição
              ├─ montarDossie(veiculo)
              ├─ chama o modelo com dossiê + briefing
              ├─ validarDescritivo(texto, dossie, campo)
              └─ 200 { texto, caracteres }
                 422 { motivos }  reprovado na validação
                 502 { motivo }   a API do fornecedor falhou
                 503 { motivo }   falta OPENAI_API_KEY

[09/09/2026: `periciaAprovada` SAIU da resposta — ver "Emenda de 09/09/2026"
no §11 deste doc. Emitir um campo sem consumidor é pior que não emitir.]
                        │
              [painel de sugestão sob o campo]
                        └─ "Usar este texto" → preenche o campo → salvar pelo botão existente
```

Rota de API, e não Server Action: é o padrão do repositório (`src/app/actions` só tem `auth.ts`; toda escrita de estoque passa por `/api/estoque/...`).

**A rota nova não escreve no banco.** A gravação continua no `PATCH /api/estoque/[id]`, que já existe, já valida campo por perfil e já alimenta o histórico do veículo. Uma porta de escrita só.

### Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/descritivo/dossie.ts` | `montarDossie(veiculo)` — função pura, sem rede |
| `src/lib/descritivo/briefing.ts` | o texto do system prompt, constante |
| `src/lib/descritivo/validacao.ts` | `validarDescritivo(texto, dossie, campo)` — função pura |
| `src/lib/descritivo/gerar.ts` | fronteira com a API do fornecedor, por `fetch`; recebe o transporte por injeção |
| `src/app/api/estoque/[id]/descritivo/route.ts` | auth, perfil, orquestração |
| `src/components/admin/EditorDeVeiculo.tsx` | os dois botões e o painel de sugestão |

## 4. O dossiê — a peça que impede a invenção

`montarDossie` devolve **apenas o que o banco confirma**. Campo vazio não entra no dossiê, e o que não está no dossiê não pode aparecer no texto.

**O formato é linha `Rótulo: valor`, em português, nunca JSON.** Medido em 2026-09-08: com JSON, o modelo trata as chaves como um saco de valores e transfere um para o rótulo do outro (§5.1). Os rótulos são desambiguadores de propósito — "Tipo de câmbio", "Cor da pintura", "Tipo de carroceria", "Motorização" — e o prompt afirma que o valor pertence ao rótulo da própria linha.

Junto dos fatos vai uma lista explícita de **afirmações autorizadas**:

- **Perícia.** A afirmação "perícia aprovada" só é liberada quando `formatPericia(veiculo.pericia) === "PERÍCIA APROVADA"` — a mesma régua que já acende o selo no site (`src/lib/supabase.ts:193` e `:337`). Sem isso o texto só pode falar do *processo*: "passa por perícia independente antes de entrar na vitrine". A régua é a perícia **normalizada**, nunca a coluna crua nem a presença de texto em `laudo_pericia`.

  **A normalização não é detalhe: nenhum veículo tem a string `"PERÍCIA APROVADA"` no banco.** Os valores reais, medidos nos 85 à venda em 2026-09-08, são `Em análise` (49), `Aprovado` (34) e `Aprovado com observação` (2). Comparar a coluna crua liberaria a afirmação para zero veículos — e o gerador chama a mesma função do selo, nunca uma régua paralela, para não criar mais uma verdade sobre a perícia.

  `Aprovado com observação` conta como aprovado, e o texto pode afirmá-lo: **decisão do dono em 2026-09-08**. É o que `formatPericia` já faz e o que o selo do site já pratica, então os 36 veículos aprovados hoje são os 34 mais esses 2.

  **O texto também não pode expor o status interno.** Dizer "o exame está em análise" é honesto e comercialmente errado num anúncio: não se vende um carro anunciando que a perícia não fechou. O silêncio sobre o resultado é a única saída quando ele não existe.

- **`laudo_pericia` não entra no dossiê enquanto a perícia não estiver aprovada.** O BMW X1 `7803195` prova por quê: `pericia` é `Em análise`, mas `laudo_pericia` diz *"Laudo cautelar completo — estrutura, chassi e histórico de sinistro auditados por empresa credenciada junto ao Detran"*. O texto descreve um exame cujo resultado ainda não saiu; passá-lo ao modelo é convidar a afirmação que a régua acabou de negar.
- **Opcionais.** Vazio em 58 dos 85 veículos. Dossiê sem opcionais significa texto sem nenhuma menção a equipamento.
- **Quilometragem, garantia de fábrica, donos anteriores, portas, motor, câmbio, combustível, cor.** Entram quando preenchidos.
- **FIPE não entra**, ainda que `valor_fipe` esteja na tabela: decisão do dono em 2026-08-17.
- **Preço** entra como número do anúncio. Nunca como julgamento ("oportunidade", "abaixo da tabela").

## 5. O prompt e o fornecedor

O texto é gerado pela **API da OpenAI**, com a chave que o dono já tem. Decisão de 2026-09-08.

- **System:** `POSICIONAMENTO.md` na íntegra mais a seção "Como escrever — o padrão" do `BRIEFING.md`. Os dois já existem em `conteudo-seo/`, versionados, e já foram aprovados pelo dono em 2026-08-17. Copiados para `briefing.ts` como constante — é o mesmo texto em toda chamada, e essa estabilidade de prefixo é o que deixa o cache de prompt do fornecedor agir sozinho.
- **User:** o dossiê serializado mais o campo pedido, com o formato-alvo de cada um.
- **Transporte:** o `fetch` do próprio Node, sem SDK. O projeto tem 8 dependências e nenhuma é de LLM; a chamada é um POST só. Retry e timeout ficam explícitos em `gerar.ts`, que é o único arquivo que sabe qual é o fornecedor.
- **Endpoint:** `POST /v1/responses`, com `instructions` (system) e `input` (dossiê). Medido: funciona em todos os modelos testados, das famílias 4x à 6.
- **Modelo: `gpt-4.1-mini`.** Escolhido por medição em 2026-09-08 (§5.1), não por memória. Fica em `briefing.ts` como constante nomeada, num lugar só, para trocar sem caçar string pelo código — a troca é uma linha.

### 5.1 Como o modelo foi escolhido

Nove modelos da conta geraram `descricao_seo` para o mesmo veículo real — o BMW X1 de R$ 179.900, escolhido porque tem `pericia` em análise e um `laudo_pericia` que *soa* como aprovação: a armadilha da §4. Preços lidos de `developers.openai.com/api/docs/pricing` no mesmo dia.

| Modelo | US$/texto | US$/170 textos | seg | Resultado |
|---|---|---|---|---|
| `gpt-4o-mini` | 0,0004 | 0,07 | 3,2 | reprova: vocabulário, alcance, markdown, inventa fato |
| **`gpt-4.1-mini`** | **0,0010** | **0,17** | **2,5** | **passa** |
| `gpt-5.6-luna` | 0,0018 | 0,31 | 13,2 | reprova: alcance, expõe status interno |
| `gpt-5.4-mini` | 0,0021 | 0,36 | 2,1 | reprova: alcance |
| `gpt-4.1` | 0,0050 | 0,84 | 1,7 | reprova: alcance |
| `gpt-4o` | 0,0063 | 1,06 | 4,4 | reprova: markdown |
| `gpt-5.6-terra` | 0,0115 | 1,96 | 10,9 | passa |
| `gpt-5.6-sol` | 0,0292 | 4,96 | 17,8 | passa |
| `gpt-6-astra` | 0,0375 | 6,38 | 12,3 | passa |

Os dois finalistas — `gpt-4.1-mini`, o mais barato aprovado, e `gpt-5.6-terra` — rodaram então em quatro veículos difíceis: a Fiat Titano (perícia **aprovada**, 24 opcionais), o Kia Bongo (em análise, 6 opcionais), e duas motos sem opcional nenhum. Os dois passaram 4 de 4 na validação automática, mas `gpt-4.1-mini` escreveu, para a Honda NXR, *"motor manual e carroceria branca"* — o câmbio é que é manual, e branca é a cor. Ele não inventou um fato: **usou certo um fato verdadeiro no campo errado**, e nenhuma regra determinística vê isso.

**A causa era o formato do dossiê, não o modelo.** Ele ia como JSON cru, e o modelo lia `{cambio, cor, tipo}` como um saco de valores. Reescrito em linhas `Rótulo: valor` — "Tipo de câmbio: manual", "Cor da pintura: branca", "Tipo de carroceria: Motocicleta" — mais uma instrução dizendo que o valor pertence ao rótulo da própria linha, `gpt-4.1-mini` rodou **duas vezes em cinco veículos: 10 de 10 passando, 10 de 10 sem troca de campo**. A Honda NXR saiu "câmbio manual, em pintura branca" nas duas.

Com o defeito corrigido no prompt, o custo volta a decidir, e `gpt-4.1-mini` é **12× mais barato e 4× mais rápido** que `gpt-5.6-terra`: US$ 0,17 contra US$ 1,96 pelos 170 textos, 2,5 s contra 10,9 s por clique — e latência importa num botão de painel. Escolha confirmada pelo dono em 2026-09-08.

### 5.2 Duas descobertas que mudaram o prompt

- **O "Exemplo trabalhado" do `BRIEFING.md` sai do prompt.** Ele descreve uma VW Saveiro e afirma "garantia de motor e câmbio". `gpt-4o-mini` copiou a frase para um BMW que não tem esse dado. Exemplo fixo em diretriz vira bordão — o mesmo defeito já registrado no agente de atendimento da loja. Entram no prompt o `POSICIONAMENTO.md` inteiro e a seção "Como escrever" **até** o exemplo.
- **As proibições são montadas por veículo, não fixas.** O que o dossiê não tem vira uma linha explícita — "não cite opcional", "não cite garantia", "não cite número de donos". Com as proibições genéricas, metade dos modelos escorregava; com elas explícitas, os dois finalistas passaram em tudo.

Custo em regime: cerca de 2.200 tokens de entrada por chamada (o briefing domina) e menos de cem de saída. Em `gpt-4.1-mini`, a US$ 0,40 e US$ 1,60 por milhão, isso é **cerca de US$ 0,001 por texto** — um décimo de centavo de dólar por carro. Os 170 textos que zeram a dívida atual custam **US$ 0,17**, uma vez. O custo desta ferramenta não é uma variável de decisão; a latência de 2,5 s por clique importa mais.

## 6. Validação da resposta

`validarDescritivo` é determinística e roda antes de o texto chegar à tela. As seis regras, e o caso real que cada uma pegou no teste de 2026-09-08:

1. **Abertura em 155 caracteres.** É onde `truncateString(cleanDescription, 155)` corta a meta description. `gpt-4o` estourou com 179. O prompt também manda **mirar entre 130 e 155** — só caber não basta: as primeiras respostas gastavam 65 dos 155 disponíveis.
2. **Vocabulário** barrado pelo `POSICIONAMENTO.md`: *premium, luxo, exclusivo, consulte-nos, melhor preço*.
3. **Perícia.** Sem autorização do dossiê, o texto não afirma aprovação.
4. **Status interno.** Nada de "em análise", "pendente", "aguardando" — `gpt-5.6-luna` escreveu *"neste caso, o exame está em análise"*.
5. **Markdown.** `gpt-4o` e `gpt-4o-mini` devolveram `**negrito**`. O texto vai cru para o XML do feed e para a meta description: os asteriscos apareceriam literais no anúncio.
6. **Fato fora do dossiê.** `gpt-4o-mini` afirmou "garantia de motor e câmbio" num veículo sem esse dado.

Reprovou: a rota responde 422 com os motivos, e o painel os mostra ao lado do botão "Gerar outro". Texto reprovado não chega ao campo, e não chega em silêncio.

### 6.1 Duas armadilhas que os testes cobraram

- **Toda regra de substring precisa de `\b`.** A primeira versão da regra 4 usava `/pendente/` e reprovava **todos** os textos — porque *"perícia independente"* contém "pendente". Uma regra que reprova tudo é tão inútil quanto uma que não reprova nada, e a tabela de resultados chegou a ser lida como "cinco modelos ruins" antes de o defeito aparecer. Cada regra precisa de teste nos **dois** sentidos: pega o caso real, e solta o texto legítimo.
- **A validação não pega troca de campo, e por isso ela foi atacada no prompt.** *"Motor manual e carroceria branca"* não inventa fato: atribui um fato verdadeiro ao campo errado, e nenhuma regra determinística vê isso. O dossiê rotulado (§4) fez o defeito sumir em 10 de 10 gerações, mas **10 gerações não são uma garantia** — o limite continua existindo, e é a razão de o texto ir para revisão humana num painel em vez de direto ao campo (§7).

  Uma tentativa de detectar a troca por regex foi **descartada por reprovar texto legítimo**: a regra pegava "motor flex", que é português correto para motor bicombustível. Mesmo defeito do `/pendente/`, do outro lado. Ficam só as colocações inequívocas — `motor manual`, `motor automático`, `carroceria <cor>` — como aviso ao operador, nunca como reprovação automática.

## 7. Comportamento na tela

O botão fica acima do campo correspondente. A sugestão aparece **num painel abaixo do campo**, nunca sobrescrevendo o que está escrito: com o texto gerado, a contagem de caracteres, o que ele afirma, e dois botões — "Usar este texto" e "Gerar outro".

"Usar este texto" preenche o campo do formulário. A gravação continua sendo o botão de salvar que já existe. Sair da página sem salvar não muda nada no banco.

## 8. Falha

Sem `OPENAI_API_KEY` — em desenvolvimento, ou na Vercel antes de o dono configurar — a rota responde **503 com o motivo nomeado**, e o painel diz qual é a falta. O botão não some, não fica inerte e não devolve sugestão vazia.

Erro da API (429, 5xx, timeout) vira 502 com o motivo. O painel mostra e oferece nova tentativa. O timeout é nosso, explícito: sem SDK não há um padrão herdado.

## 9. Testes

- `montarDossie`: campo vazio não entra; perícia diferente de "PERÍCIA APROVADA" não autoriza a afirmação; `valor_fipe` preenchido não entra no dossiê.
- `validarDescritivo`: **cada regra testada nos dois sentidos** — um texto que ela deve reprovar e um texto legítimo que ela deve deixar passar. Sem o segundo, a regra 4 teria entrado em produção reprovando todo texto que dissesse "perícia independente" (§6.1). Medindo a saída da função, nunca a forma do arquivo.
- Rota: 401 sem sessão, 403 para gestor e financeiro, 503 sem chave, 422 com texto reprovado.
- Nenhuma chamada de rede na suíte — `gerar.ts` recebe o transporte por injeção, e o teste passa um dublê. O dublê responde a forma real da API, não uma forma conveniente: a memória do projeto sobre dublê mais permissivo que o servidor nasceu de um teste verde sobre resposta que o servidor nunca daria.

## 10. Fora do escopo

- **Tela de mutirão / geração em lote.** Decisão de 2026-09-08: um veículo por vez, pelo editor.
- **Gravação automática.** A ferramenta sugere; a pessoa salva.
- **Histórico próprio de versões do texto.** O histórico do veículo já registra a mudança na gravação.
- **Geração no cadastro de veículo novo** (`CadastroDeVeiculo.tsx`), onde o veículo ainda não tem `id`. Fica para depois de o botão do editor provar o formato.

## 11. Pendências do dono

1. **`OPENAI_API_KEY` em `.env.local`** — feito em 2026-09-08; foi o que permitiu escolher o modelo por medição.
2. **`OPENAI_API_KEY` na Vercel** — presente, e o nome foi **confirmado pelo dono em 2026-09-08** como exatamente `OPENAI_API_KEY`. Fica um ponto de operação a conferir no primeiro PR: se a variável vale para **Preview** além de Production. Se não valer, o deploy de preview responde 503 e a ferramenta só pode ser provada depois do merge — o que inverte a ordem de conferir antes de publicar.

### Resolvido em 2026-09-08

**"Aprovado com observação" pode ser anunciado como aprovado — decisão do dono.** Dois veículos estão nesse estado. Isso confirma o comportamento que `formatPericia` já tem e que o selo do site já pratica: **nada muda no código.** A decisão fica registrada aqui porque o contrário exigiria mexer em `formatPericia`, e a mudança valeria para o selo e para o texto ao mesmo tempo — nunca só para o gerador.

### Emenda de 09/09/2026 — de detecção para proibição

As seções acima (§4, §6.1, §7 e a tabela de testes) descrevem a régua de perícia como ela nasceu: DETECTAR se o texto afirma indevidamente que o laudo aprovou. Essa régua foi reescrita quatro vezes entre 08/09 e 09/09/2026 e vazou nas quatro — a última passagem, medida pelo qa-guardian, deixava seis descritivos inteiros afirmarem aprovação e passarem limpos (radical incompleto, gatilho e afirmação em frases diferentes, sinônimos que a lista de gatilho não conhecia). Ver `.superpowers/sdd/2026-09-08-gerador-de-descritivo/progress.md`.

**Decisão do dono, 09/09/2026: inverter a dificuldade.** Detectar se um texto *afirma aprovação* é indecidível na prática; detectar se um texto *menciona* perícia é trivial. `descricao` e `descricao_seo` passam a proibir o assunto inteiro — perícia, laudo, cautelar, vistoria, inspeção —, aprovada ou não. A frase sobre perícia aprovada vira **texto padrão, determinístico**, num campo próprio (`laudo_pericia`, fonte em `src/lib/descritivo/laudoPadrao.ts`), nunca mais gerada pelo modelo.

Consequências no código, para quem ler §4/§6.1/§7 depois desta emenda:
- `validacao.ts`: `GATILHO_DE_PERICIA`, `AFIRMA_APROVACAO`, a negação estrutural e a segmentação por frase (`frasesDe`) saíram. Uma regex só, `MENCIONA_PERICIA`, substitui as três peças.
- `briefing.ts`: a poda condicional de "aprovado" em `montarInstrucoes(dossie)` saiu — a função não recebe mais o dossiê. O par "PODE afirmar" / "NÃO afirme" em `montarEntrada` virou uma proibição única, sempre presente.
- A resposta da rota perdeu `periciaAprovada` (ver a nota no diagrama do §3, acima) e o painel perdeu a linha "Pode/Não afirma perícia aprovada".
- §4 (Perícia), §6.1 e a tabela de testes do §7 continuam corretos como REGISTRO HISTÓRICO de por que a primeira versão da régua existia e como ela vazou — não como descrição do comportamento atual.

## 12. Decisões tomadas nesta conversa

| Decisão | Escolha |
|---|---|
| Onde vive | Botão no editor do veículo, um carro por vez |
| Quais campos | Dois botões separados, um por campo |
| Motor do texto | Dossiê factual + modelo de linguagem, com validação determinística na volta |
| Sobrescrita | Sugestão em painel; nada é sobrescrito sem comando |
| Fornecedor | OpenAI — o dono já tem a chave |
| Cliente | `fetch` do Node, sem SDK e sem dependência nova |
| Modelo | `gpt-4.1-mini`, escolhido medindo 9 modelos (§5.1) |
| Formato do dossiê | linhas `Rótulo: valor`, nunca JSON — foi o que matou a troca de campo |

A troca de fornecedor foi feita depois de a arquitetura estar fechada e **não mexeu em nada além de `gerar.ts`, do nome da env e do modelo**. O dossiê, a validação, a rota, as permissões e os testes ficaram idênticos. Se o fornecedor mudar de novo, o custo é o mesmo arquivo.

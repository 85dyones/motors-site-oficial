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
              └─ 200 { texto, caracteres, afirmacoes }
                 422 { motivos }  reprovado na validação
                 502 { motivo }   a API do fornecedor falhou
                 503 { motivo }   falta OPENAI_API_KEY
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

Junto dos fatos vai uma lista explícita de **afirmações autorizadas**:

- **Perícia.** A afirmação "perícia aprovada" só é liberada quando `formatPericia(veiculo.pericia) === "PERÍCIA APROVADA"` — a mesma régua que já acende o selo no site (`src/lib/supabase.ts:337`). Sem isso o texto só pode falar do *processo*: "todo veículo passa por perícia independente antes de entrar na vitrine". A régua é a perícia **normalizada**, nunca a coluna crua nem a presença de texto em `laudo_pericia`.
- **Opcionais.** Vazio em 58 dos 85 veículos. Dossiê sem opcionais significa texto sem nenhuma menção a equipamento.
- **Quilometragem, garantia de fábrica, donos anteriores, portas, motor, câmbio, combustível, cor.** Entram quando preenchidos.
- **FIPE não entra**, ainda que `valor_fipe` esteja na tabela: decisão do dono em 2026-08-17.
- **Preço** entra como número do anúncio. Nunca como julgamento ("oportunidade", "abaixo da tabela").

## 5. O prompt e o fornecedor

O texto é gerado pela **API da OpenAI**, com a chave que o dono já tem. Decisão de 2026-09-08.

- **System:** `POSICIONAMENTO.md` na íntegra mais a seção "Como escrever — o padrão" do `BRIEFING.md`. Os dois já existem em `conteudo-seo/`, versionados, e já foram aprovados pelo dono em 2026-08-17. Copiados para `briefing.ts` como constante — é o mesmo texto em toda chamada, e essa estabilidade de prefixo é o que deixa o cache de prompt do fornecedor agir sozinho.
- **User:** o dossiê serializado mais o campo pedido, com o formato-alvo de cada um.
- **Transporte:** o `fetch` do próprio Node, sem SDK. O projeto tem 8 dependências e nenhuma é de LLM; a chamada é um POST só. Retry e timeout ficam explícitos em `gerar.ts`, que é o único arquivo que sabe qual é o fornecedor.
- **Modelo:** **pendente**, e resolvido por medição, não por memória — assim que `OPENAI_API_KEY` estiver em `.env.local`, o modelo sai de um `GET /v1/models` contra a própria conta. Fica em `briefing.ts` como constante nomeada, num lugar só, para trocar sem caçar string pelo código.

Custo por texto depende do modelo escolhido e será estimado quando ele for cravado. A ordem de grandeza do trabalho já é conhecida: cerca de 4 mil tokens de entrada por chamada (o briefing domina) e algumas centenas de saída; 170 chamadas cobrem os dois campos dos 85 veículos, uma vez.

## 6. Validação da resposta

`validarDescritivo` é determinística e roda antes de o texto chegar à tela:

1. **`descricao_seo` — 155 caracteres.** A abertura precisa funcionar sozinha nesse limite: é onde `truncateString(cleanDescription, 155)` corta a meta description da ficha.
2. **Vocabulário barrado** pelo `POSICIONAMENTO.md`: *premium, luxo, exclusivo, consulte-nos, melhor preço*.
3. **Perícia.** Se o dossiê não autorizou a afirmação de aprovação, o texto não pode afirmá-la.
4. **Opcionais.** Nenhum equipamento citado que não esteja no dossiê.

Reprovou: a rota responde 422 com os motivos, e o painel os mostra ao lado do botão "Gerar outro". Texto reprovado não chega ao campo, e não chega em silêncio.

## 7. Comportamento na tela

O botão fica acima do campo correspondente. A sugestão aparece **num painel abaixo do campo**, nunca sobrescrevendo o que está escrito: com o texto gerado, a contagem de caracteres, o que ele afirma, e dois botões — "Usar este texto" e "Gerar outro".

"Usar este texto" preenche o campo do formulário. A gravação continua sendo o botão de salvar que já existe. Sair da página sem salvar não muda nada no banco.

## 8. Falha

Sem `OPENAI_API_KEY` — em desenvolvimento, ou na Vercel antes de o dono configurar — a rota responde **503 com o motivo nomeado**, e o painel diz qual é a falta. O botão não some, não fica inerte e não devolve sugestão vazia.

Erro da API (429, 5xx, timeout) vira 502 com o motivo. O painel mostra e oferece nova tentativa. O timeout é nosso, explícito: sem SDK não há um padrão herdado.

## 9. Testes

- `montarDossie`: campo vazio não entra; perícia diferente de "PERÍCIA APROVADA" não autoriza a afirmação; `valor_fipe` preenchido não entra no dossiê.
- `validarDescritivo`: uma regra por teste, medindo a saída da função e não a forma do arquivo.
- Rota: 401 sem sessão, 403 para gestor e financeiro, 503 sem chave, 422 com texto reprovado.
- Nenhuma chamada de rede na suíte — `gerar.ts` recebe o transporte por injeção, e o teste passa um dublê. O dublê responde a forma real da API, não uma forma conveniente: a memória do projeto sobre dublê mais permissivo que o servidor nasceu de um teste verde sobre resposta que o servidor nunca daria.

## 10. Fora do escopo

- **Tela de mutirão / geração em lote.** Decisão de 2026-09-08: um veículo por vez, pelo editor.
- **Gravação automática.** A ferramenta sugere; a pessoa salva.
- **Histórico próprio de versões do texto.** O histórico do veículo já registra a mudança na gravação.
- **Geração no cadastro de veículo novo** (`CadastroDeVeiculo.tsx`), onde o veículo ainda não tem `id`. Fica para depois de o botão do editor provar o formato.

## 11. Pendências do dono

1. **`OPENAI_API_KEY` em `.env.local`**, para desenvolvimento — é o que destrava cravar o modelo (§5).
2. **`OPENAI_API_KEY` nas variáveis de ambiente da Vercel**, para produção. Sem ela a ferramenta sobe e explica por que não gera.

## 12. Decisões tomadas nesta conversa

| Decisão | Escolha |
|---|---|
| Onde vive | Botão no editor do veículo, um carro por vez |
| Quais campos | Dois botões separados, um por campo |
| Motor do texto | Dossiê factual + modelo de linguagem, com validação determinística na volta |
| Sobrescrita | Sugestão em painel; nada é sobrescrito sem comando |
| Fornecedor | OpenAI — o dono já tem a chave |
| Cliente | `fetch` do Node, sem SDK e sem dependência nova |

A troca de fornecedor foi feita depois de a arquitetura estar fechada e **não mexeu em nada além de `gerar.ts`, do nome da env e do modelo**. O dossiê, a validação, a rota, as permissões e os testes ficaram idênticos. Se o fornecedor mudar de novo, o custo é o mesmo arquivo.

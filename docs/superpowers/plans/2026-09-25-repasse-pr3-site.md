# Repasse Motors — PR 3 (site e leads) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr no ar a seção pública do Repasse Motors — `/repasse` (herói com as duas trilhas, lote com filtros, "já saíram", a conta aberta, repasse × estoque, "serve para você?", como comprar, lista do repasse, perguntas; e o estado vazio) e `/repasse/[carro]` (galeria, conta, ficha de estado, histórico, "o que não vem", exame no pátio, parecidos, barra fixa) — com a lista do repasse e o exame no pátio entrando pela mesma `/api/leads`, a `/privacidade` da §7.4 no mesmo PR, sitemap e JSON-LD.

**Architecture:** Todo texto fixo vive em `src/lib/paginaDoRepasse.ts` (transcrito das pranchas v5, travado por teste contra os termos que o dono proibiu). As regras são libs puras com teste: horário da loja e dias do exame (`horarioDaLoja.ts`, `exameNoPatio.ts`), CNPJ, o lead do repasse (`leadDoRepasse.ts`: montar o corpo no navegador, decidir no servidor, inserir ou atualizar a inscrição), o lote (`loteDoRepasse.ts`), os parecidos (`similares.ts`) e o grafo (`grafoDoRepasse.ts`). A rota de leads ganha um ramo aditivo para canal que começa com `repasse`: valida antes de gravar, confere o carro do exame, grava o lead com `.select("id")` e depois a inscrição com a chave de serviço. As páginas são server components com `revalidate = 60`; filtros, trilha, formulários e galeria são ilhas cliente que recebem tudo já lido.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres, RLS, supabase-js anon e chave de serviço) · Vitest (node; `// @vitest-environment jsdom` para fiação).

**Spec:** `docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md` — §7 (site), §7.4 (texto APROVADO da `/privacidade`), §8 (leads), §9 (travas), §12 (linha "PR 3"). Texto das pranchas: `.superpowers/desenho-v5/TEXTOS.md` (partes 1 a 3; a parte 4 é dado de exemplo e NÃO é texto fixo). Decisões já tomadas: `.superpowers/pr3-handoff.md` (18, todas valem).

**Branch:** `feat/repasse-site`, a partir de `35e1974` (PR 2 atualizado com o main; empilhado no #146, que empilha no #144), no worktree `C:\Users\Lenovo\Documents\motors-claude\wt-repasse-site` (junção de `node_modules` para o clone principal). Push com `git push -u origin feat/repasse-site` — **nunca** nos branches do PR 1 ou do PR 2.

## Global Constraints

- Nomes de arquivo, tipo, função, tabela e coluna **em português**, no padrão do repositório.
- **Todo texto fixo da seção mora em `src/lib/paginaDoRepasse.ts`** e entra nos componentes por import. Componente não escreve frase para o cliente. A garantia do estoque só aparece por `PRAZO_DA_GARANTIA` (`src/lib/paginasInstitucionais.ts`), nunca digitada. Nada de "não girou" e parentes, CDC, direitos do consumidor, "%", "a partir de R$", "premium", "exclusivo", "melhor preço", "consulte". Laudo nunca "publicado/disponível/online/anexo/baixar/ver o laudo"; toda frase que diz que o laudo sai diz que sai **a pedido**. Sem travessão (— ou –) em nenhuma string de `paginaDoRepasse.ts`.
- Dado de exemplo das pranchas (Kwid, Ford Ka, "Ana", datas, preços) **nunca** vira texto fixo: sai do banco na hora de desenhar, ou a peça some.
- Client component recebe do `companySettings` **só** `{ whatsappRaw, whatsapp }` (tipo `WhatsappDaLoja`) — nunca o objeto inteiro, que viraria payload público (memória `chaves-s3-expostas-em-api-settings`).
- **Arquivo com `\b`, `\d`, `\s` ou `\u` numa regex ou string: gravar com a ferramenta Write/Edit, nunca por heredoc no shell** (o heredoc vira `\b` em byte 0x08 — memória `heredoc-come-a-barra-invertida`). A esteira de ferramentas também já decodificou `\u` em caractere de verdade. Depois de gravar um arquivo com escape, conferir que a barra chegou ao disco: `od -c <arquivo> | grep -F '\'` mostra as barras, e `grep -c $'\x08' <arquivo>` tem de dar `0`. Este plano evita `\u` de propósito (o espaço inseparável do `toLocaleString` é tratado com `\s`, que o pega).
- **Teste local só dos arquivos mexidos** (`npx vitest run tests/<arquivo>.test.ts …`) — a RAM desta máquina é curta. A suíte inteira roda **uma vez**, no fim (Task 14). `tsc`, lint e build ficam para o CI, que só vale **concluído e verde nos cinco jobs** (`vitest`, `tipos`, `lint`, `build`, `deploy-vercel`).
- **Lint é catraca:** nenhum `any` novo. `src/app/api/leads/route.ts` já tem `any` antigos (`webhookError: any`, `erroPersistencia: any`, `error: any`) — não mexer neles e não acrescentar outro. Dublê de teste usa `unknown`/`as never`, como os existentes.
- Trava nova só conta depois de **reprovar com o bug real** (memória `trava-so-vale-se-reprovar`). Cada tarefa tem um passo de sabotagem; desfazer cada sabotagem antes da próxima e anotar a reprovação vista no relatório.
- **Migração:** ensaio (ROLLBACK) antes; `--gravar` **só com ordem explícita do dono**. O runner é `supabase/manutencao/aplicar-migracao.js` e roda do **clone principal** `C:\Users\Lenovo\Documents\motors-claude\motors-site-oficial` (é ele que tem `.env.local` e `pg`), sempre pelo **controlador**, nunca pelo subagente.
- **PR:** só com o CI concluído e verde nos cinco jobs, aberto pelo Chrome do dono, com o ok dele. **Ordem de merge:** #144 → (#146 + este PR, juntos). O #146 aponta links para `/repasse/<slug>`, que nasce aqui.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (depois de uma linha em branco).
- Modelo por tarefa (regra do dono de 20/09): o indicado no título. No máximo dois agentes Opus ao mesmo tempo; subagente não abre subagente.
- Tudo que a pessoa lê e não está nas pranchas vai para a lista "Textos novos para o dono aprovar" (abaixo) e é perguntado ao dono antes do merge (regra `fato-ambiguo-nao-vai-ao-ar`).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/paginaDoRepasse.ts` (novo) | Todo o texto fixo, as âncoras e as funções que montam texto com dado (contagens, datas, confirmação) |
| `tests/textoDoRepasse.ts` (novo) | Ajudante de teste: recolhe todo o texto fixo e o montado com amostras |
| `src/lib/horarioDaLoja.ts` (novo) | `HORARIO_DA_LOJA` estruturado; datas de Curitiba (UTC−3 fixo); `especificacaoDoHorario()` |
| `src/lib/exameNoPatio.ts` (novo) | Turnos, os próximos três dias de loja aberta, rótulos "Sex 25", dia aceito para o exame |
| `src/lib/schemaLoja.ts` (muda) | `openingHoursSpecification` passa a vir de `especificacaoDoHorario()` (mesmo JSON-LD) |
| `src/lib/cnpj.ts` (novo) | Dígitos verificadores (numérico e alfanumérico), formato `00.000.000/0000-00` |
| `src/lib/leadDoRepasse.ts` (novo) | Canais, `formId`, montagem dos corpos, `decidirLeadDoRepasse`, `decidirInscricao`, mensagens do lead, erro da rota |
| `src/lib/repasse.ts` (muda) | `sufixoDoRepasse`, `EstadoDoRepasse`, `estadoDoRepasse` |
| `src/lib/turnstile.ts` (muda) | `ACOES.repasse` em `ACOES` e em `ACOES_DE_LEADS` |
| `src/lib/mensagensDoVeiculo.ts` (muda) | `mensagemDoRepasse`, `mensagemDePerguntaDoRepasse` |
| `supabase/migrations/20260925120000_repasse_carrocerias_da_lista.sql` (novo) | CHECK de `repasse_inscritos.carrocerias` com aceite |
| `src/lib/repasseNaRotaDeLeads.ts` (novo) | `carroDoExame`, `gravarInscricao` — só servidor |
| `src/app/api/leads/route.ts` (muda) | Ramo aditivo do repasse (2.5 e 5.3), insert com `.select("id")`, `repasse_id` |
| `tests/bancoDoRepasseDeTeste.ts` (muda) | Registra os filtros das leituras (`consultas`) |
| `src/lib/leituraDosRepasses.ts` (muda) | `registrarFalha` na linha malformada; `lerRepassePorSufixo` |
| `src/lib/similares.ts` (muda) | Núcleo `vizinhosPorPreco` exportado; `TIPO_NO_FEED`; `parecidosDoRepasse` |
| `src/lib/grafoDoRepasse.ts` (novo) | `Car`+`Offer` do repasse, grafo da ficha e da página |
| `src/lib/loteDoRepasse.ts` (novo) | Ordens, contagem por filtro, `resumoDoLote` (lote, abertos, já saíram, atualização, exemplos) |
| `src/components/repasse/CardDoRepasse.tsx` (novo) | O card nos quatro estados |
| `src/components/repasse/ContaDoRepasse.tsx` (novo) | A conta (card, ficha, exemplo) |
| `src/components/repasse/LoteDoRepasse.tsx` (novo) | Ilha: filtros, ordenação, "ver os outros" no celular |
| `src/components/repasse/ListaDoRepasse.tsx` (novo) | Formulário da lista, duas trilhas, linha de consentimento da §7.4 |
| `src/components/repasse/ExameNoPatio.tsx` (novo) | Formulário do exame no pátio |
| `src/components/repasse/TrilhaDoHeroi.tsx` (novo) | Ilha do seletor de trilha do herói |
| `src/components/repasse/SecoesDoRepasse.tsx` (novo) | Provas, conta aberta, repasse × estoque, serve para você, como comprar, perguntas |
| `src/components/repasse/GaleriaDoRepasse.tsx` (novo) | Galeria da ficha com as fotos de defeito marcadas |
| `src/app/repasse/page.tsx` (novo) | `/repasse`, com o estado vazio |
| `src/app/repasse/[carro]/page.tsx` (novo) | A ficha, o redirect pelo sufixo, a barra fixa |
| `src/app/repasse/[carro]/not-found.tsx` (novo) | `NaoEncontradoNoEstoque` com a lista do repasse no lugar da encomenda |
| `src/lib/compartilhamento.ts`, `src/types/index.ts` (mudam) | Id de compartilhamento `repasse` |
| `src/app/sitemap.ts` (muda) | `/repasse` e as fichas publicadas e reservadas, leitura paralela com `.catch()` |
| `src/app/privacidade/page.tsx` (muda) | As quatro inserções aprovadas da §7.4 |
| `src/lib/pedidosDeExame.ts`, `src/components/admin/repasse/PedidosDeExame.tsx` (novos); `src/app/admin/repasse/[id]/page.tsx` (muda) | Os pedidos de exame no editor do carro (spec §4.4) |
| Testes novos | `pagina-do-repasse`, `horario-e-exame`, `lead-do-repasse`, `mensagens-e-captcha-do-repasse`, `migracao-do-repasse-carrocerias`, `leads-do-repasse-na-rota`, `leitura-dos-repasses-no-site`, `parecidos-do-repasse`, `grafo-do-repasse`, `lote-do-repasse`, `lote-do-repasse-fiacao`, `formularios-do-repasse`, `pagina-do-repasse-no-ar`, `ficha-do-repasse-no-ar`, `sitemap-anuncia-o-repasse`, `privacidade-lista-do-repasse`, `pedidos-de-exame-no-editor` |
| Testes que mudam | `textos-sem-marcas-de-ia`, `links-no-texto-do-faq`, `funil`, `leitura-dos-repasses`, `brechas-de-mensuracao` (B.7), `sem-beco-sem-saida` |

## Desvios da spec e decisões, e por quê

**As 18 decisões do handoff valem inteiras** (resumo; o texto de cada uma está em `.superpowers/pr3-handoff.md`):

1. A trava "todo laudo vem com a pedido" vira duas: proibido afirmar laudo publicado/disponível/online/anexo/baixar/ver; toda frase que diz que o laudo **sai** contém "a pedido" (Task 1).
2. Sem `mensagemDeExameNoPatio` (o exame é formulário): `mensagemDoRepasse(r, estado, ref)` e `mensagemDePerguntaDoRepasse(ref)`; referência "Ref.: repasse <sufixo de 6>" (Task 4).
3. "Lote atualizado hoje, dd/mm" só quando a publicação mais recente é de hoje em Curitiba; senão "em dd/mm". Contagens dinâmicas (Tasks 1 e 8).
4. Carro só-lojistas: faixa "Só para lojistas" no lugar do WhatsApp e do exame; a rota só aceita exame de carro `publicado` (409) (Tasks 6 e 11).
5. Um formulário da lista, duas trilhas, usado na página, no vazio, na ficha e no não encontrado; rótulo do botão por contexto; `#lista-lojista` abre na trilha lojista (Task 9).
6. Linha de consentimento da lista = §7.4; o exame não tem linha, só "Confirmamos o horário pelo WhatsApp." (Tasks 1 e 9).
7. Rótulos curtos do celular por spans responsivos (Tasks 9 e 10).
8. "Já saíram": vendidos na carência, até três; some sem nenhum. Vazio: "o último carro saiu em dd/mm" só se houver vendido (Tasks 1, 8 e 10).
9. "Tanto faz" = `carrocerias: []`; opções Hatch, Sedã, SUV, Picape (Tasks 3 e 9).
10. Canais `repasse` / `repasse-lojista` / `repasse-exame`; `formId` `form-lista-repasse` / `form-lista-repasse-lojista` / `form-exame-repasse`; `tipoDeLead: "curadoria"`; uma ação de captcha `ACOES.repasse`; `intencao_busca.repasse` estruturado; mensagem sem CNPJ, faixa e carrocerias (Tasks 3, 4 e 6).
11. Rota: função pura antes de gravar (400); exame confere `publicado` (409); lead com `.select("id").maybeSingle()` e `repasse_id`; inscrição depois do lead, insere ou atualiza, CNPJ trocado zera a conferência; falha → `registrarFalha("quebra", …)` e 500; WhatsApp da lista com DDI (Task 6).
12. Dias do exame: próximos três dias de loja aberta depois de hoje, Curitiba UTC−3 fixo, manhã e tarde; fonte única `HORARIO_DA_LOJA`, que o `schemaLoja` passa a usar com o JSON-LD idêntico (Task 2).
13. Slug antigo: `/repasse/[carro]` sem slug procura pelo sufixo (últimos 6 do pedido) e faz `permanentRedirect` se achar exatamente um (Tasks 7 e 11).
14. Carência: a página decide (`aparecePublicamente` falso → `notFound()`); vendido na carência fica indexado com "VENDIDO" (Task 11).
15. `registrarFalha("quebra", "repasse-linha-malformada", {id}, {rota, origem: "servidor"})` na linha que `repasseDaLinha` recusa (Task 7).
16. Migração `20260925120000_repasse_carrocerias_da_lista.sql` com aceite por nome de restrição; ensaio e sabotagem pelo controlador; `--gravar` só com ordem do dono (Tasks 5 e 14).
17. Grafo: ficha = `Car`+`Offer`, `BreadcrumbList`, `AutoDealer`, `WebSite`; página = `BreadcrumbList`, `ItemList` dos abertos, `FAQPage`, `AutoDealer`, `WebSite`; sem `view_item`/`ViewContent` com id de repasse (Tasks 7, 10 e 11).
18. Ordem de merge #144 → (#146 + PR 3 juntos) (Task 14).

**Decisões deste plano, que o handoff não trazia:**

19. **Os dois quadros de exemplo usam carro de verdade.** "Como ler um repasse" (herói) e "EXEMPLO · …" (a conta aberta) desenham um carro aberto do lote — o herói prefere um com reparo, a conta prefere um com sinistro declarado — e somem sem carro aberto. Publicar o Kwid e o Ford Ka das pranchas seria afirmar "ele está escrito no anúncio" sobre carro que não existe (regra `fato-ambiguo-nao-vai-ao-ar`).
20. **O vazio mantém a explicação e as perguntas depois do estoque.** A prancha "sem carro aberto" desenha o topo; a página vai ao ar provavelmente vazia, e sem a conta, a tabela, "serve para você?", "como comprar" e as perguntas ela perderia o texto que responde à busca — e o `FAQPage` exige as perguntas visíveis.
21. **Carro só-lojistas publica `availability: LimitedAvailability`**, como o reservado: o carro existe e tem preço, mas o público não fecha hoje. `InStock` fica só para o aberto a todos.
22. **Parecidos medem pela FIPE (ou "você gasta", sem FIPE), não pelo preço à vista.** O carro com garantia do mesmo porte custa perto da FIPE; pelo preço de repasse, a banda 0,7–1,4 cortaria justamente eles (a prancha mostra R$ 49.900–54.900 para um repasse de R$ 36.900 com FIPE de R$ 42.100).
23. **A mensagem do lead do repasse é montada no servidor**, das mesmas funções que o navegador usa. `leads` é lida por toda a equipe; um cliente que mandasse o CNPJ na `mensagem` não o levaria ao Kanban.
24. **O CNPJ aceita o formato alfanumérico** (IN RFB 2.229/2024, emitido desde julho de 2026): mesmo módulo 11, valor da posição = código ASCII − 48.
25. **O dia do exame é aceito de hoje até o último dia da janela** (não só os três oferecidos agora): a ficha fica em cache 60 s e uma aba aberta de véspera ainda mostra os dias de ontem. Domingo e dia fora da janela seguem recusados.
26. **Task 13 nova: os pedidos de exame no editor do carro (spec §4.4).** O plano do PR 2 empurrou isto para o PR 3 junto com o formulário que cria o lead; o esboço do handoff não o trazia.
27. **As perguntas do repasse saem sem link automático.** O linkador ligaria "laudo cautelar" à `/garantia` — a garantia que o repasse justamente não tem. Elas entram no teste de `links-no-texto-do-faq` (spec §9) como invariante de texto.
28. **O insert do lead ganha o `.select("id")` por uma variável** (`const insercao = …insert({…}); await insercao.select("id").maybeSingle()`): o texto `.from("leads").insert({ … });` fica intacto para as travas de `pre-voo-das-conversoes` e `leads-insert-destravado`, que recortam o insert até o `});`.
29. **Variantes do celular simplificadas:** a tabela usa a frase do desktop ("antes de entrar na vitrine"); as vantagens do lojista ficam em lista também no celular; o `fieldset` do exame fica "DIA" e "TURNO" nos dois tamanhos. Menu e rodapé são do PR 4.
30. **Ficha reservada ou vendida:** sem exame; o botão de WhatsApp vira "PERGUNTAR NO WHATSAPP" (texto das pranchas) com a mensagem do estado, e a lista do repasse entra na página.

## Textos novos para o dono aprovar antes do merge

Nada abaixo está nas pranchas; tudo sai de `paginaDoRepasse.ts`, `leadDoRepasse.ts` ou `mensagensDoVeiculo.ts` e vai ao dono na Task 14:

- Singulares: "1 carro no repasse", "VER O CARRO", "VER O OUTRO CARRO", "1 carro aberto a todos", "1 foto", "1 foto de defeito".
- "Lote atualizado em dd/mm" (quando a publicação mais recente não é de hoje).
- Vazio sem venda na carência: "O repasse gira rápido. Entre na lista e receba o próximo no WhatsApp assim que ele abrir."
- Quadros com carro real: "A conta do <carro>", "Reparo: <itens>", "EXEMPLO · <CARRO>", "Consta sinistro: <detalhe>. Ele está escrito no anúncio e na ficha de estado, e é parte do motivo do preço." e o rótulo "FIPE do mês" quando falta o mês.
- Ficha: "Nenhum defeito conhecido.", "Sem orçamento", "Sem laudo cautelar", "Não feito", "Consta: <detalhe>", "Aprovado com apontamento: <texto>. Sai a pedido", "Pedido enviado.", "DEFEITO n", "<carro> no repasse | Motors Store" (título de busca), "<carro> · R$ X" (card de compartilhamento).
- Confirmação da lista fora da página com lote (vazio, ficha, não encontrado): a mesma frase sem "Enquanto isso, dá para ver o que está aberto hoje." e sem "VER O LOTE DE HOJE".
- Não encontrado: "Não encontramos este repasse", "Este endereço não abre nenhum carro do repasse. Costuma ser link antigo, de um carro que já saiu, ou endereço incompleto.", "Abaixo, uma amostra do estoque com garantia de hoje e a lista do repasse.", "Repasse não encontrado | Motors Store".
- Erros dos formulários e da rota (`ERROS_DO_REPASSE`).
- Mensagens de WhatsApp: as três de `mensagemDoRepasse` e a de `mensagemDePerguntaDoRepasse`.

## Fora deste PR

- Menu (`REPASSE` na barra a partir de 1281 px, sempre no celular) e a **remedição do menu no Chrome** com a tabela do docblock de `menuDoCabecalho.ts` → PR 4.
- Rodapé ("Repasse" na coluna Comprar) → PR 4.
- Faixa escura do repasse em `/estoque` e faixa clara na home → PR 4.
- `src/lib/paginasGeo.ts:55-57` (a oração "Os outros sete vão para repasse antes de chegar à vitrine") → PR 4.
- Guia 07, item T3 (fechar no `.md` do guia) → PR 4.
- Catálogo da Meta/Merchant com os repasses, `view_item`/`ViewContent` com id de repasse, disparo automático para a lista, PDF do laudo → fora do escopo (spec §13).

---

### Task 1: Os textos da seção — `paginaDoRepasse.ts` — Opus

**Files:**
- Create: `src/lib/paginaDoRepasse.ts`
- Create: `tests/textoDoRepasse.ts`
- Test: `tests/pagina-do-repasse.test.ts` (novo)
- Modify: `tests/textos-sem-marcas-de-ia.test.ts` (um `describe` a mais)
- Modify: `tests/links-no-texto-do-faq.test.ts` (as perguntas do repasse no array `respostas`)

**Interfaces:**
- Consumes: `PRAZO_DA_GARANTIA` (`src/lib/paginasInstitucionais.ts`); `concordar`, `o`, `um`, `Genero` (`src/lib/generoDoVeiculo.ts`); `FAIXAS_DO_REPASSE`, `CarroceriaDoRepasse`, `FaixaDoRepasse`, `FiltroDoRepasse`, `LaudoDoRepasse` (`src/lib/repasse.ts`); tipo `PerguntaFrequente` (`src/components/modernist/PaginaDeEstoque.tsx`).
- Produces (usados pelas Tasks 3 e 6 a 13):
  - Âncoras e caminho: `CAMINHO_DO_REPASSE = "/repasse"`, `ANCORA_DO_LOTE = "lote"`, `ANCORA_DA_LISTA = "lista"`, `ANCORA_DA_LISTA_LOJISTA = "lista-lojista"`, `ANCORA_DA_FICHA_DE_ESTADO = "ficha-de-estado"`, `ANCORA_DO_EXAME = "exame"`, `ANCORA_DO_ESTOQUE = "estoque"`, `ANCORA_DA_CONTA = "como-ler"`.
  - Constantes de texto: `TITULO_DO_REPASSE`, `DESCRICAO_DO_REPASSE`, `TITULO_SEO_DO_REPASSE`, `TRILHA_DO_REPASSE`, `HEROI_DO_REPASSE`, `COMO_LER_UM_REPASSE`, `ROTULOS_DA_CONTA`, `PROVAS_DO_REPASSE`, `LOTE_DO_REPASSE`, `CARD_DO_REPASSE`, `LAUDO_NO_CARD`, `PRECISA_FINANCIAR`, `JA_SAIRAM`, `CONTA_ABERTA`, `REPASSE_OU_ESTOQUE`, `SERVE_PARA_VOCE`, `COMO_COMPRAR`, `LISTA_DO_REPASSE`, `NOME_DA_CARROCERIA`, `PERGUNTAS_DO_REPASSE_CABECALHO`, `PERGUNTAS_DO_REPASSE: PerguntaFrequente[]`, `FICHA_DO_REPASSE`, `VAZIO_DO_REPASSE`, `NAO_ENCONTRADO_NO_REPASSE`, `ERROS_DO_REPASSE`.
  - Funções (todas `string`): `tituloDaContaDoCarro(nome)`, `linhaDoReparo(itens: string[])`, `rotuloDaFipe(mes: string | null)`, `rotuloDaFipeNaFicha(mes, carro)`, `tituloDoLote(n)`, `verOsCarros(n)`, `verOsOutros(n)`, `linhaDoLote({ hoje, dia, abertos, soLojistas })`, `linhaDoHistoricoNoCard({ laudo, leilao_consta, sinistro_consta })`, `contagemDeFotos(total, defeitos)`, `anosDoCarro({ ano_modelo, ano_fabricacao })`, `rotuloDoExemplo(nome)`, `notaDoSinistro(detalhe)`, `tituloDaConfirmacao(nome)`, `textoDaConfirmacao({ faixa, carrocerias, comLote })`, `seloDeAberto(dia)`, `laudoNaListaRapida(laudo)`, `laudoNoHistorico(laudo, apontamento)`, `constaNoHistorico(consta, detalhe)`, `consultaFeitaEm(dia)`, `orcamentoDaOficina(oficina, dia)`, `tituloDoExame(modelo, genero)`, `tituloDosParecidos(modelo, genero)`, `abaixoDaFipeNaBarra(valor)`, `contadorDaGaleria(atual, total, defeitos)`, `rotuloDoDefeito(n)`, `textoAlternativoDaFoto(nome, n)`, `tituloDaFichaNaBusca(nome)`, `textoDoVazio(ultimaSaida: string | null)`.
  - Em `tests/textoDoRepasse.ts`: `textosFixosDoRepasse(): string[]`, `textosMontadosDoRepasse(): string[]`, `todoOTextoDoRepasse(): string[]`.

- [ ] **Step 1: O ajudante que recolhe o texto**

`tests/textoDoRepasse.ts`:

```ts
import * as pagina from "../src/lib/paginaDoRepasse";

/**
 * Todo o texto da seção de repasse, para as travas de texto lerem de uma vez
 * (`pagina-do-repasse`, `textos-sem-marcas-de-ia`).
 *
 * O fixo é recolhido em PROFUNDIDADE de tudo o que `paginaDoRepasse.ts`
 * exporta: string nova num objeto novo entra sozinha na régua, sem ninguém
 * lembrar de registrá-la. O montado sai das funções com dados de amostra —
 * quem acrescentar uma função a `paginaDoRepasse.ts` acrescenta a amostra
 * aqui, e o controle de `pagina-do-repasse` cobra isso (toda função exportada
 * aparece na lista `FUNCOES_COM_AMOSTRA`).
 */
export function textosFixosDoRepasse(): string[] {
  const achados: string[] = [];
  const visitar = (valor: unknown) => {
    if (typeof valor === "string") achados.push(valor);
    else if (Array.isArray(valor)) valor.forEach(visitar);
    else if (valor && typeof valor === "object") Object.values(valor).forEach(visitar);
  };
  Object.values(pagina).forEach(visitar);
  return achados;
}

/** Nome de cada função exportada que tem amostra abaixo. */
export const FUNCOES_COM_AMOSTRA = [
  "tituloDaContaDoCarro",
  "linhaDoReparo",
  "rotuloDaFipe",
  "rotuloDaFipeNaFicha",
  "tituloDoLote",
  "verOsCarros",
  "verOsOutros",
  "linhaDoLote",
  "linhaDoHistoricoNoCard",
  "contagemDeFotos",
  "anosDoCarro",
  "rotuloDoExemplo",
  "notaDoSinistro",
  "tituloDaConfirmacao",
  "textoDaConfirmacao",
  "seloDeAberto",
  "laudoNaListaRapida",
  "laudoNoHistorico",
  "constaNoHistorico",
  "consultaFeitaEm",
  "orcamentoDaOficina",
  "tituloDoExame",
  "tituloDosParecidos",
  "abaixoDaFipeNaBarra",
  "contadorDaGaleria",
  "rotuloDoDefeito",
  "textoAlternativoDaFoto",
  "tituloDaFichaNaBusca",
  "textoDoVazio",
] as const;

export function textosMontadosDoRepasse(): string[] {
  return [
    pagina.tituloDaContaDoCarro("Renault Kwid Zen 1.0 2021"),
    pagina.linhaDoReparo(["Embreagem patinando nas arrancadas", "Pneus dianteiros no fim da vida útil"]),
    pagina.rotuloDaFipe("setembro de 2026"),
    pagina.rotuloDaFipe(null),
    pagina.rotuloDaFipeNaFicha("setembro de 2026", "Kwid Zen 1.0 2021"),
    pagina.tituloDoLote(1),
    pagina.tituloDoLote(6),
    pagina.verOsCarros(1),
    pagina.verOsCarros(6),
    pagina.verOsOutros(1),
    pagina.verOsOutros(4),
    pagina.linhaDoLote({ hoje: true, dia: "24/09", abertos: 6, soLojistas: 1 }),
    pagina.linhaDoLote({ hoje: false, dia: "23/09", abertos: 1, soLojistas: 0 }),
    pagina.linhaDoHistoricoNoCard({ laudo: "aprovado", leilao_consta: false, sinistro_consta: true }),
    pagina.linhaDoHistoricoNoCard({ laudo: "aprovado_com_apontamento", leilao_consta: false, sinistro_consta: false }),
    pagina.linhaDoHistoricoNoCard({ laudo: "nao_feito", leilao_consta: true, sinistro_consta: false }),
    pagina.contagemDeFotos(28, 4),
    pagina.contagemDeFotos(1, 0),
    pagina.anosDoCarro({ ano_modelo: 2021, ano_fabricacao: 2020 }),
    pagina.rotuloDoExemplo("Ford Ka SE 1.0 2018"),
    pagina.notaDoSinistro("pequena monta em 2021"),
    pagina.tituloDaConfirmacao("Ana Souza"),
    pagina.textoDaConfirmacao({ faixa: "30-50", carrocerias: ["hatch"], comLote: true }),
    pagina.textoDaConfirmacao({ faixa: "ate-30", carrocerias: ["picape"], comLote: false }),
    pagina.textoDaConfirmacao({ faixa: null, carrocerias: ["hatch", "suv", "picape"], comLote: true }),
    pagina.textoDaConfirmacao({ faixa: "acima-80", carrocerias: [], comLote: true }),
    pagina.seloDeAberto("24/09"),
    pagina.laudoNaListaRapida("aprovado"),
    pagina.laudoNaListaRapida("aprovado_com_apontamento"),
    pagina.laudoNaListaRapida("nao_feito"),
    pagina.laudoNoHistorico("aprovado", null),
    pagina.laudoNoHistorico("aprovado_com_apontamento", "repintura no para-choque traseiro."),
    pagina.laudoNoHistorico("nao_feito", null),
    pagina.constaNoHistorico(true, "pequena monta em 2021"),
    pagina.constaNoHistorico(false, null),
    pagina.consultaFeitaEm("22/09"),
    pagina.orcamentoDaOficina("Oficina Exemplo", "22/09"),
    pagina.tituloDoExame("Kwid", "m"),
    pagina.tituloDoExame("Strada", "f"),
    pagina.tituloDosParecidos("Kwid", "m"),
    pagina.tituloDosParecidos("Strada", "f"),
    pagina.abaixoDaFipeNaBarra("R$ 3.180"),
    pagina.contadorDaGaleria(1, 28, 4),
    pagina.contadorDaGaleria(2, 5, 1),
    pagina.contadorDaGaleria(1, 4, 0),
    pagina.rotuloDoDefeito(1),
    pagina.textoAlternativoDaFoto("Renault Kwid Zen 1.0 2021", 3),
    pagina.tituloDaFichaNaBusca("Renault Kwid Zen 1.0 2021"),
    pagina.textoDoVazio("23/09"),
    pagina.textoDoVazio(null),
  ];
}

export function todoOTextoDoRepasse(): string[] {
  return [...textosFixosDoRepasse(), ...textosMontadosDoRepasse()];
}
```

- [ ] **Step 2: Escrever o teste que falha**

`tests/pagina-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as pagina from "../src/lib/paginaDoRepasse";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { PRAZO_DA_GARANTIA } from "../src/lib/paginasInstitucionais";
import { lerCodigo } from "./fonte";
import { FUNCOES_COM_AMOSTRA, todoOTextoDoRepasse } from "./textoDoRepasse";

/**
 * As travas da spec §9 sobre o texto da seção de repasse — TUDO o texto de
 * `paginaDoRepasse.ts`, o fixo e o que as funções montam com dado.
 *
 * As regras são do dono (24/09): nunca "não girou" nem os rótulos antigos;
 * nada de CDC, direitos, "%", "a partir de R$", "premium", "exclusivo",
 * "melhor preço" ou "consulte"; a garantia do estoque só pela constante; e o
 * laudo nunca publicado — quando o texto diz que ele sai, diz que sai A PEDIDO
 * (decisão 1 do PR 3: a regra literal "todo laudo vem com a pedido" barraria
 * "Cada anúncio diz se o carro tem laudo cautelar", que é da prancha).
 */
const TUDO = todoOTextoDoRepasse();
const FRASES = TUDO.flatMap((texto) => texto.split(/(?<=[.!?;])\s+/));

describe("a leitura alcança o texto (controle)", () => {
  it("recolhe o fixo e o montado", () => {
    expect(TUDO.length).toBeGreaterThan(150);
    expect(TUDO).toContain("Carros de repasse em Curitiba");
    expect(TUDO).toContain(pagina.LISTA_DO_REPASSE.consentimento);
    expect(TUDO).toContain("A conta do Renault Kwid Zen 1.0 2021");
  });

  it("toda função exportada tem amostra no ajudante", () => {
    const funcoes = Object.entries(pagina)
      .filter(([, valor]) => typeof valor === "function")
      .map(([nome]) => nome)
      .sort();
    expect(funcoes).toEqual([...FUNCOES_COM_AMOSTRA].sort());
  });
});

describe("os termos que o repasse não usa", () => {
  it("nenhum da lista do painel (venda e jurídico)", () => {
    const achados = TUDO.flatMap((texto) => termosProibidosEm(texto).map((termo) => `${termo}: ${texto}`));
    expect(achados).toEqual([]);
  });

  it("nem os da §9 que a lista do painel não cobre", () => {
    for (const texto of TUDO) {
      expect(texto, texto).not.toMatch(/%/);
      expect(texto, texto).not.toMatch(/\bdireitos?\b/i);
      expect(texto, texto).not.toMatch(/\bconsulte\b/i);
      expect(texto, texto).not.toMatch(/\bexclusiv/i);
    }
  });

  it("a prancha antiga da lista não voltou", () => {
    expect(TUDO.join(" ")).not.toContain("Ao enviar, você concorda");
  });
});

describe("a garantia do estoque só aparece pela constante", () => {
  it("o arquivo não digita o prazo", () => {
    const codigo = lerCodigo("src/lib/paginaDoRepasse.ts");
    expect(codigo).not.toMatch(/tr[êe]s\s+meses/i);
    expect(codigo).not.toMatch(/5\.000/);
    expect(codigo).not.toMatch(/quil[ôo]metros/i);
  });

  it("toda frase que cita meses cita o prazo inteiro", () => {
    const comMeses = TUDO.filter((texto) => /meses/i.test(texto));
    expect(comMeses.length).toBeGreaterThanOrEqual(4);
    for (const texto of comMeses) {
      expect(texto.toLowerCase(), texto).toContain(PRAZO_DA_GARANTIA.toLowerCase());
    }
  });
});

describe("o laudo sai a pedido", () => {
  it("nunca publicado, disponível, online ou anexo, e nunca para baixar ou ver", () => {
    for (const frase of FRASES) {
      expect(frase, frase).not.toMatch(/laudo[^.!?]{0,60}\b(publicad|dispon[íi]ve|online|anex)/i);
      expect(frase, frase).not.toMatch(/\b(baixar|baixe|ver|veja|abrir|abra)\s+o\s+laudo\b/i);
    }
  });

  it("toda frase que diz que o laudo sai diz que sai a pedido", () => {
    const saem = FRASES.filter((frase) => /\blaudo\b/i.test(frase) && /\bsai\b/i.test(frase));
    expect(saem.length).toBeGreaterThanOrEqual(4);
    for (const frase of saem) expect(frase, frase).toMatch(/a pedido/i);
  });
});

describe("o texto é o das pranchas", () => {
  it("as dez perguntas, na ordem da prancha", () => {
    expect(pagina.PERGUNTAS_DO_REPASSE.map((p) => p.pergunta)).toEqual([
      "O que é um carro de repasse?",
      "O que muda entre um repasse com laudo e um sem laudo?",
      "Por que o repasse custa menos?",
      "Carro de repasse tem garantia?",
      "O que é a ficha de estado?",
      "Posso levar o carro ao meu mecânico?",
      "Dá para financiar ou dar meu carro na troca?",
      "Quem faz a transferência?",
      "Tem carro de leilão ou com sinistro?",
      "Sou lojista. O que muda para mim?",
    ]);
    expect(pagina.PERGUNTAS_DO_REPASSE[3].resposta).toBe(
      `Não tem a garantia da loja, a de ${PRAZO_DA_GARANTIA}, que vale para o estoque.`,
    );
  });

  it("a linha de consentimento é a da §7.4", () => {
    expect(pagina.LISTA_DO_REPASSE.consentimento).toBe(
      "Ao entrar na lista, você aceita receber avisos de repasse pelo WhatsApp e pode sair quando quiser.",
    );
    expect(pagina.LISTA_DO_REPASSE.politica).toBe("Política de privacidade");
  });

  it("o herói, as provas, a tabela e os passos", () => {
    expect(pagina.HEROI_DO_REPASSE.texto).toBe(
      "Abaixo da FIPE e sem a garantia da loja. Cada anúncio diz se o carro tem laudo cautelar e mostra a conta, com o reparo orçado quando ele existe.",
    );
    expect(pagina.PROVAS_DO_REPASSE.itens.map((p) => p.titulo)).toEqual([
      "Com laudo ou sem laudo",
      "A conta aberta",
      "A ficha de estado",
      "Exame no pátio",
    ]);
    expect(pagina.REPASSE_OU_ESTOQUE.linhas.map((l) => l.tema)).toEqual([
      "Preço",
      "Garantia da loja",
      "Estado do carro",
      "Pagamento",
      "Transferência",
      "Antes de comprar",
    ]);
    expect(pagina.COMO_COMPRAR.passos.map((p) => p.titulo)).toEqual([
      "Escolha",
      "Pergunte",
      "Examine no pátio",
      "Pague e transfira",
    ]);
    expect(pagina.PRECISA_FINANCIAR.texto).toBe(
      `Precisa financiar ou quer garantia? O estoque tem carros com garantia de ${PRAZO_DA_GARANTIA}.`,
    );
  });
});

describe("o texto que depende do dado", () => {
  it("contagens no singular e no plural", () => {
    expect(pagina.tituloDoLote(1)).toBe("1 carro no repasse");
    expect(pagina.tituloDoLote(6)).toBe("6 carros no repasse");
    expect(pagina.verOsCarros(6)).toBe("VER OS 6 CARROS");
    expect(pagina.verOsCarros(1)).toBe("VER O CARRO");
    expect(pagina.verOsOutros(4)).toBe("VER OS OUTROS 4 CARROS");
  });

  it("a linha do lote diz hoje só quando é hoje, e conta os só-lojistas à parte", () => {
    expect(pagina.linhaDoLote({ hoje: true, dia: "24/09", abertos: 6, soLojistas: 0 })).toBe(
      "Lote atualizado hoje, 24/09 · 6 carros abertos a todos",
    );
    expect(pagina.linhaDoLote({ hoje: false, dia: "23/09", abertos: 1, soLojistas: 2 })).toBe(
      "Lote atualizado em 23/09 · 1 carro aberto a todos · 2 só para lojistas",
    );
  });

  it("a confirmação concorda com o que a pessoa marcou", () => {
    expect(pagina.tituloDaConfirmacao("  Ana Souza ")).toBe("Pronto, Ana. Você está na lista do repasse.");
    expect(pagina.textoDaConfirmacao({ faixa: "30-50", carrocerias: ["hatch"], comLote: true })).toBe(
      "Quando entrar um hatch de R$ 30 mil a R$ 50 mil, ele chega no seu WhatsApp. Enquanto isso, dá para ver o que está aberto hoje.",
    );
    expect(pagina.textoDaConfirmacao({ faixa: "ate-30", carrocerias: ["picape"], comLote: false })).toBe(
      "Quando entrar uma picape até R$ 30 mil, ela chega no seu WhatsApp.",
    );
    expect(pagina.textoDaConfirmacao({ faixa: null, carrocerias: [], comLote: false })).toBe(
      "Quando entrar um carro, ele chega no seu WhatsApp.",
    );
  });

  it("o vazio só cita data quando houve venda", () => {
    expect(pagina.textoDoVazio("23/09")).toContain("o último carro saiu em 23/09");
    expect(pagina.textoDoVazio(null)).not.toMatch(/saiu em/);
  });

  it("a FIPE do mês sem o ano, como na prancha", () => {
    expect(pagina.rotuloDaFipe("setembro de 2026")).toBe("FIPE de setembro");
    expect(pagina.rotuloDaFipe(null)).toBe("FIPE do mês");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/pagina-do-repasse.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/paginaDoRepasse'`.

- [ ] **Step 4: Escrever `src/lib/paginaDoRepasse.ts`**

Gravar com a ferramenta Write (o arquivo tem `\s` e `\d` em regex). Conferir depois com `grep -c $'\x08' src/lib/paginaDoRepasse.ts` → `0`.

```ts
/**
 * Todo o texto fixo da seção de repasse (spec §7.3).
 *
 * Transcrito das pranchas da versão 5 do Design (`.superpowers/desenho-v5/
 * TEXTOS.md`, partes 1 a 3). A parte 4 das pranchas é dado de exemplo e NÃO
 * mora aqui: carro, preço, FIPE, data e o nome "Ana" saem do banco na hora de
 * desenhar — ou a peça some (decisão 19 do plano do PR 3).
 *
 * As regras do dono valem para cada linha, e `tests/pagina-do-repasse.test.ts`
 * as cobra sobre todo valor exportado daqui e sobre o texto que as funções
 * montam:
 *   - nunca dizer que um carro "não girou", nem os rótulos antigos ("fora do
 *     perfil", "veio em lote");
 *   - nada de CDC, direitos do consumidor, "%", "a partir de R$", "premium",
 *     "exclusivo", "melhor preço" ou "consulte";
 *   - laudo não é publicado: toda frase que diz que ele sai diz que sai a
 *     pedido.
 *
 * A garantia do estoque só entra por `PRAZO_DA_GARANTIA`: o prazo digitado à
 * mão é o que a loja já teve de corrigir em 01/09.
 *
 * Exceção às pranchas (spec §7.4): a linha de consentimento da lista é a
 * aprovada para a `/privacidade`, não o "Ao enviar, você concorda…".
 *
 * Sem travessão em nenhuma string: `tests/textos-sem-marcas-de-ia.test.ts`
 * lê este módulo inteiro. E sem string que só sirva de valor de banco
 * ("consumidor", "lojista"): a régua lê tudo o que é exportado, e a trilha é
 * chave de objeto aqui, nunca valor.
 */
import type { PerguntaFrequente } from "../components/modernist/PaginaDeEstoque";
import { concordar, o, um, type Genero } from "./generoDoVeiculo";
import { PRAZO_DA_GARANTIA } from "./paginasInstitucionais";
import {
  FAIXAS_DO_REPASSE,
  type CarroceriaDoRepasse,
  type FaixaDoRepasse,
  type FiltroDoRepasse,
  type LaudoDoRepasse,
} from "./repasse";

const PRAZO_COM_MAIUSCULA = `${PRAZO_DA_GARANTIA.charAt(0).toUpperCase()}${PRAZO_DA_GARANTIA.slice(1)}`;

const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);
const semPontoFinal = (texto: string) => texto.trim().replace(/[.\s]+$/, "");

/** "a, b ou c" — a lista como se fala. */
function juntar(partes: string[], conector: string): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} ${conector} ${partes[partes.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Caminho e âncoras — os links entre as seções e entre as páginas
// ---------------------------------------------------------------------------

export const CAMINHO_DO_REPASSE = "/repasse";
export const ANCORA_DO_LOTE = "lote";
export const ANCORA_DA_LISTA = "lista";
/** Abrir `/repasse#lista-lojista` abre a lista já na trilha do lojista (decisão 5). */
export const ANCORA_DA_LISTA_LOJISTA = "lista-lojista";
export const ANCORA_DA_FICHA_DE_ESTADO = "ficha-de-estado";
export const ANCORA_DO_EXAME = "exame";
export const ANCORA_DO_ESTOQUE = "estoque";
export const ANCORA_DA_CONTA = "como-ler";

// ---------------------------------------------------------------------------
// Página /repasse — topo
// ---------------------------------------------------------------------------

export const TITULO_DO_REPASSE = "Carros de repasse em Curitiba";

export const DESCRICAO_DO_REPASSE =
  "Abaixo da FIPE e sem a garantia da loja. Cada anúncio diz se o carro tem laudo cautelar e mostra a conta, com o reparo orçado quando ele existe.";

export const TITULO_SEO_DO_REPASSE = `${TITULO_DO_REPASSE} | Motors Store`;

export const TRILHA_DO_REPASSE = { inicio: "Início", repasse: "Repasse" } as const;

export const HEROI_DO_REPASSE = {
  rotulo: "REPASSE MOTORS · REPASSE ÀS CLARAS",
  titulo: TITULO_DO_REPASSE,
  texto: DESCRICAO_DO_REPASSE,
  legenda: "Para que você compra",
  usar: {
    botao: "COMPRO PARA USAR",
    botaoCurto: "PARA USAR",
    texto:
      "Você paga à vista, examina o carro no pátio com o seu mecânico e sabe antes quanto vai gastar para deixá-lo em ordem.",
    receber: "RECEBER NO WHATSAPP",
  },
  revender: {
    botao: "COMPRO PARA REVENDER",
    botaoCurto: "PARA REVENDER",
    texto:
      "Com o CNPJ cadastrado, o carro chega no seu WhatsApp antes de entrar no site. Dá para negociar condição de lote, e a nota sai no CNPJ da sua loja.",
    cadastrar: "CADASTRAR MEU CNPJ",
    verAberto: "VER O QUE ESTÁ ABERTO",
  },
} as const;

export const COMO_LER_UM_REPASSE = {
  rotulo: "COMO LER UM REPASSE",
  nota: "O orçamento é da oficina que examinou o carro. O seu mecânico pode conferir no pátio antes de você fechar.",
} as const;

/** "A conta do Renault Kwid Zen 1.0 2021" — o carro de verdade, nunca o da prancha. */
export function tituloDaContaDoCarro(nome: string): string {
  return `A conta do ${nome}`;
}

/** "Reparo: embreagem patinando nas arrancadas e pneus dianteiros no fim da vida útil". */
export function linhaDoReparo(itens: string[]): string {
  return `Reparo: ${juntar(itens.map((item) => minuscula(item.trim())), "e")}`;
}

export const ROTULOS_DA_CONTA = {
  preco: "Preço à vista",
  reparo: "Reparo orçado",
  verFicha: "(ver ficha)",
  voceGasta: "Você gasta",
  abaixo: "Fica abaixo da FIPE",
  abaixoCurto: "Abaixo da FIPE",
  noEstado: "à vista, no estado",
} as const;

/**
 * "FIPE de setembro". A API devolve o mês por extenso com o ano ("setembro de
 * 2026"); a prancha escreve só o mês. Sem mês, o termo do glossário.
 */
export function rotuloDaFipe(mesDeReferencia: string | null): string {
  const mes = (mesDeReferencia ?? "").replace(/\s+de\s+\d{4}\s*$/i, "").trim();
  return mes ? `FIPE de ${mes}` : "FIPE do mês";
}

/** "FIPE de setembro, Kwid Zen 1.0 2021" — a ficha desktop diz de qual versão. */
export function rotuloDaFipeNaFicha(mesDeReferencia: string | null, carro: string): string {
  return `${rotuloDaFipe(mesDeReferencia)}, ${carro}`;
}

export const PROVAS_DO_REPASSE = {
  rotulo: "O que todo repasse traz",
  itens: [
    {
      numero: "01",
      titulo: "Com laudo ou sem laudo",
      texto:
        "Cada anúncio diz se o carro já tem laudo cautelar. Quando tem, o laudo sai a pedido, antes de qualquer sinal.",
    },
    {
      numero: "02",
      titulo: "A conta aberta",
      texto:
        "Preço à vista, FIPE do mês e o orçamento do reparo quando há. A diferença para a FIPE aparece em reais.",
    },
    {
      numero: "03",
      titulo: "A ficha de estado",
      texto: "Os defeitos que conhecemos, com foto. Você assina essa mesma lista junto com o contrato.",
    },
    {
      numero: "04",
      titulo: "Exame no pátio",
      texto: "Marque um horário e traga o seu mecânico. O carro fica no pátio do Bacacheri até a compra.",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// O lote
// ---------------------------------------------------------------------------

const FILTROS_DO_LOTE: Record<FiltroDoRepasse, string> = {
  todos: "TODOS",
  "com-laudo": "COM LAUDO",
  "sem-laudo": "SEM LAUDO",
  "reparo-orcado": "REPARO ORÇADO",
};

/** As chaves são as de `ORDENS_DO_LOTE` (`loteDoRepasse.ts`); o teste da Task 8 confere. */
const ORDENS_DO_LOTE_NA_TELA = {
  recentes: "Mais recentes",
  diferenca: "Maior diferença para a FIPE",
  preco: "Menor preço",
} as const;

export const LOTE_DO_REPASSE = {
  rotulo: "LOTE ABERTO",
  ordenarPor: "Ordenar por",
  filtros: FILTROS_DO_LOTE,
  ordens: ORDENS_DO_LOTE_NA_TELA,
} as const;

export function tituloDoLote(total: number): string {
  return `${total} ${total === 1 ? "carro" : "carros"} no repasse`;
}

export function verOsCarros(total: number): string {
  return total === 1 ? "VER O CARRO" : `VER OS ${total} CARROS`;
}

export function verOsOutros(total: number): string {
  return total === 1 ? "VER O OUTRO CARRO" : `VER OS OUTROS ${total} CARROS`;
}

/**
 * "Lote atualizado hoje, 24/09 · 6 carros abertos a todos · 1 só para
 * lojistas". "Hoje" só quando a publicação mais recente É de hoje em Curitiba
 * (decisão 3); quem calcula `hoje` e `dia` é `resumoDoLote` (Task 8).
 */
export function linhaDoLote(args: { hoje: boolean; dia: string; abertos: number; soLojistas: number }): string {
  const partes = [args.hoje ? `Lote atualizado hoje, ${args.dia}` : `Lote atualizado em ${args.dia}`];
  if (args.abertos > 0) {
    partes.push(`${args.abertos} ${args.abertos === 1 ? "carro aberto" : "carros abertos"} a todos`);
  }
  if (args.soLojistas > 0) partes.push(`${args.soLojistas} só para lojistas`);
  return partes.join(" · ");
}

export const CARD_DO_REPASSE = {
  quero: "QUERO ESTE REPASSE",
  verFicha: "VER A FICHA DE ESTADO",
  soLojistas: "SÓ PARA LOJISTAS",
  soLojistasTexto: "Por enquanto, só para lojistas cadastrados",
  cadastrarCnpj: "CADASTRAR MEU CNPJ",
  aviseQuandoAbrir: "AVISE QUANDO ABRIR PARA TODOS",
  reservado: "RESERVADO",
  aviseSeVoltar: "AVISE SE ELE VOLTAR",
  vendido: "VENDIDO",
  entrarNaLista: "ENTRAR NA LISTA DO REPASSE",
} as const;

export const LAUDO_NO_CARD: Record<LaudoDoRepasse, string> = {
  aprovado: "aprovado, sai a pedido",
  aprovado_com_apontamento: "aprovado com apontamento, sai a pedido",
  nao_feito: "não feito",
};

/** "Laudo: aprovado, sai a pedido · Leilão: não consta · Sinistro: consta". */
export function linhaDoHistoricoNoCard(r: {
  laudo: LaudoDoRepasse | null;
  leilao_consta: boolean | null;
  sinistro_consta: boolean | null;
}): string {
  const laudo = LAUDO_NO_CARD[r.laudo ?? "nao_feito"];
  const consta = (valor: boolean | null) => (valor ? "consta" : "não consta");
  return `Laudo: ${laudo} · Leilão: ${consta(r.leilao_consta)} · Sinistro: ${consta(r.sinistro_consta)}`;
}

/** "28 fotos · 4 de defeitos" (as de defeito contam no total). */
export function contagemDeFotos(total: number, defeitos: number): string {
  const fotos = `${total} ${total === 1 ? "foto" : "fotos"}`;
  return defeitos > 0 ? `${fotos} · ${defeitos} de defeitos` : fotos;
}

/** "2020/2021": fabricação/modelo, como a prancha escreve mesmo quando são iguais. */
export function anosDoCarro(r: { ano_modelo: number; ano_fabricacao: number | null }): string {
  return `${r.ano_fabricacao ?? r.ano_modelo}/${r.ano_modelo}`;
}

export const PRECISA_FINANCIAR = {
  texto: `Precisa financiar ou quer garantia? O estoque tem carros com garantia de ${PRAZO_DA_GARANTIA}.`,
  link: "VER O ESTOQUE COM GARANTIA",
} as const;

export const JA_SAIRAM = {
  rotulo: "JÁ SAÍRAM DO REPASSE",
  texto: "Quem está na lista recebe o aviso no WhatsApp.",
  textoNoVazio: "Quem estava na lista recebeu o aviso no WhatsApp.",
} as const;

// ---------------------------------------------------------------------------
// A explicação
// ---------------------------------------------------------------------------

export const CONTA_ABERTA = {
  rotulo: "A CONTA ABERTA",
  titulo: "Como ler o preço de um repasse",
  termos: [
    {
      termo: "Preço à vista",
      definicao: "O valor do carro no estado em que ele está. É o que você paga, por PIX ou TED.",
    },
    {
      termo: "Reparo orçado",
      definicao:
        "O orçamento da oficina para os itens da ficha de estado que têm conserto previsto. Item estético sem orçamento aparece na ficha e fica fora da conta.",
    },
    { termo: "Você gasta", definicao: "Preço mais reparo. Use este número para comparar com outros carros." },
    {
      termo: "FIPE do mês",
      definicao: "A tabela FIPE do mês em que o anúncio foi atualizado, para o mesmo ano e a mesma versão.",
    },
    { termo: "Abaixo da FIPE", definicao: "A diferença, em reais, entre a FIPE e o que você gasta." },
  ],
  nota: "O orçamento vem de uma oficina. O seu mecânico pode chegar a outro valor, e por isso você pode trazê-lo ao pátio antes de fechar.",
} as const;

/** "EXEMPLO · RENAULT KWID ZEN 1.0 2021" — o carro de verdade do lote. */
export function rotuloDoExemplo(nome: string): string {
  return `EXEMPLO · ${nome.toUpperCase()}`;
}

/** A nota do quadro de exemplo quando o carro tem sinistro declarado. */
export function notaDoSinistro(detalhe: string): string {
  return `Consta sinistro: ${semPontoFinal(detalhe)}. Ele está escrito no anúncio e na ficha de estado, e é parte do motivo do preço.`;
}

export const REPASSE_OU_ESTOQUE = {
  rotulo: "REPASSE OU ESTOQUE",
  titulo: "A diferença, lado a lado",
  colunaRepasse: "REPASSE",
  colunaEstoque: "ESTOQUE COM GARANTIA",
  linhas: [
    {
      tema: "Preço",
      repasse: "Abaixo da FIPE, com a diferença em reais no anúncio",
      estoque: "Preço de loja, escrito no anúncio",
    },
    { tema: "Garantia da loja", repasse: "Não tem", estoque: PRAZO_COM_MAIUSCULA },
    {
      tema: "Estado do carro",
      repasse: "No estado. O anúncio diz se tem laudo cautelar, e a ficha de estado lista os defeitos conhecidos",
      estoque: "Aprovado na perícia cautelar independente antes de entrar na vitrine",
    },
    {
      tema: "Pagamento",
      repasse: "À vista, por PIX ou TED",
      estoque: "À vista, financiado ou com o seu carro na troca",
    },
    {
      tema: "Transferência",
      repasse: "Por conta de quem compra, com o documento sem restrição e sem débito",
      estoque: "Acompanhada pela loja",
    },
    {
      tema: "Antes de comprar",
      repasse: "Exame no pátio com o seu mecânico, e o laudo a pedido quando houver",
      estoque: "Laudo da perícia a pedido e test-drive",
    },
  ],
  verRepasse: "VER O REPASSE",
  verEstoque: "VER O ESTOQUE COM GARANTIA",
} as const;

export const SERVE_PARA_VOCE = {
  rotulo: "ANTES DE ESCOLHER",
  titulo: "O repasse serve para você?",
  texto:
    "Ele é bom negócio para quem compra à vista e não se importa em passar pela oficina. Para os outros casos, o estoque com garantia resolve melhor.",
  serveRotulo: "SERVE SE VOCÊ",
  serve: [
    "vai pagar à vista;",
    "tem mecânico de confiança ou prefere cuidar do reparo do seu jeito;",
    "quer pagar menos que a FIPE e aceita o carro como ele está;",
    "é lojista e compra para revender.",
  ],
  naoServeRotulo: "NÃO SERVE SE VOCÊ",
  naoServe: [
    "precisa financiar ou quer dar o seu carro na troca;",
    "quer a garantia de motor e câmbio da loja;",
    "quer o carro pronto para rodar sem passar na oficina.",
  ],
  link: "NESSES CASOS, O ESTOQUE COM GARANTIA",
} as const;

export const COMO_COMPRAR = {
  rotulo: "COMO COMPRAR",
  passos: [
    {
      numero: "01",
      titulo: "Escolha",
      texto: "No site ou pela lista do WhatsApp. O anúncio já traz a conta e a ficha de estado.",
    },
    {
      numero: "02",
      titulo: "Pergunte",
      texto: "Peça fotos extras e o histórico do carro. Nos carros com laudo cautelar, ele sai a pedido.",
    },
    {
      numero: "03",
      titulo: "Examine no pátio",
      texto: "Marque um horário no Bacacheri e traga o seu mecânico. O carro não sai do pátio antes da compra.",
    },
    {
      numero: "04",
      titulo: "Pague e transfira",
      texto:
        "À vista, por PIX ou TED. Você assina o contrato com a ficha de estado, recebe o documento sem restrição e sem débito e faz a transferência.",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// A lista do repasse
// ---------------------------------------------------------------------------

export const LISTA_DO_REPASSE = {
  rotulo: "LISTA DO REPASSE",
  titulo: "O repasse gira rápido. Receba o próximo no WhatsApp.",
  textoUsar:
    "Você conta o que procura e avisamos quando entrar um carro no seu perfil. Só mandamos repasse, e você sai da lista quando quiser.",
  vantagensLojista: [
    "O carro chega para você antes de entrar no site.",
    "Quem leva mais de um carro negocia condição de lote.",
    "A nota sai no CNPJ da sua loja, com atendimento direto.",
  ],
  trilhaUsar: "COMPRO PARA USAR",
  trilhaUsarCurta: "PARA USAR",
  trilhaLojista: "SOU LOJISTA",
  nome: "NOME",
  nomeExemplo: "Como devemos chamar você",
  whatsapp: "WHATSAPP",
  whatsappExemplo: "(41) 90000-0000",
  faixa: "QUANTO QUER GASTAR",
  tipo: "TIPO DE CARRO",
  tantoFaz: "Tanto faz",
  cnpj: "CNPJ",
  cnpjExemplo: "00.000.000/0000-00",
  lojaCidade: "LOJA E CIDADE",
  lojaCidadeExemplo: "Nome da loja, cidade",
  botaoUsar: "QUERO RECEBER OS REPASSES",
  botaoProximo: "QUERO RECEBER O PRÓXIMO",
  botaoLojista: "CADASTRAR MINHA LOJA",
  enviando: "ENVIANDO...",
  // Spec §7.4, APROVADO pelo dono em 24/09 — substitui a linha das pranchas.
  consentimento: "Ao entrar na lista, você aceita receber avisos de repasse pelo WhatsApp e pode sair quando quiser.",
  politica: "Política de privacidade",
  confirmacaoLojistaTitulo: "Recebemos o cadastro da sua loja.",
  confirmacaoLojistaTexto:
    "Vamos conferir o CNPJ e avisar pelo WhatsApp quando o aviso antecipado estiver liberado.",
  verLote: "VER O LOTE DE HOJE",
  verEstoque: "VER O ESTOQUE COM GARANTIA",
  captcha: "Não conseguimos concluir a verificação de segurança.",
} as const;

/** Rótulo do formulário, nome na frase e gênero ("um hatch", "uma picape"). */
export const NOME_DA_CARROCERIA: Record<CarroceriaDoRepasse, { rotulo: string; nome: string; genero: Genero }> = {
  hatch: { rotulo: "Hatch", nome: "hatch", genero: "m" },
  seda: { rotulo: "Sedã", nome: "sedã", genero: "m" },
  suv: { rotulo: "SUV", nome: "SUV", genero: "m" },
  picape: { rotulo: "Picape", nome: "picape", genero: "f" },
  outro: { rotulo: "Outro", nome: "carro", genero: "m" },
};

/** "Pronto, Ana. Você está na lista do repasse." — o primeiro nome digitado. */
export function tituloDaConfirmacao(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return primeiro ? `Pronto, ${primeiro}. Você está na lista do repasse.` : "Pronto. Você está na lista do repasse.";
}

/**
 * "Quando entrar um hatch de R$ 30 mil a R$ 50 mil, ele chega no seu
 * WhatsApp." — o perfil que a pessoa marcou, com artigo e pronome
 * concordando. `comLote` acrescenta a frase do lote de hoje só onde há lote
 * para ver (a página com carro aberto); no vazio, na ficha e no não
 * encontrado ela seria promessa sem objeto.
 */
export function textoDaConfirmacao(args: {
  faixa: FaixaDoRepasse | null;
  carrocerias: readonly CarroceriaDoRepasse[];
  comLote: boolean;
}): string {
  const tipos = args.carrocerias.map((c) => `${um(NOME_DA_CARROCERIA[c].genero)} ${NOME_DA_CARROCERIA[c].nome}`);
  const oQue = tipos.length > 0 ? juntar(tipos, "ou") : "um carro";
  const faixa = FAIXAS_DO_REPASSE.find((f) => f.id === args.faixa);
  const quanto = faixa ? ` ${minuscula(faixa.rotulo)}` : "";
  const unica = args.carrocerias.length === 1 ? args.carrocerias[0] : null;
  const pronome = unica && NOME_DA_CARROCERIA[unica].genero === "f" ? "ela" : "ele";
  const primeira = `Quando entrar ${oQue}${quanto}, ${pronome} chega no seu WhatsApp.`;
  return args.comLote ? `${primeira} Enquanto isso, dá para ver o que está aberto hoje.` : primeira;
}

export const PERGUNTAS_DO_REPASSE_CABECALHO = {
  rotulo: "PERGUNTAS",
  titulo: "O que perguntam sobre o repasse",
  texto: "Sua dúvida não está aqui? Pergunte no WhatsApp.",
  botao: "PERGUNTAR NO WHATSAPP",
} as const;

/** As dez perguntas, na ordem em que a prancha as mostra. Também vão para o `FAQPage`. */
export const PERGUNTAS_DO_REPASSE: PerguntaFrequente[] = [
  {
    pergunta: "O que é um carro de repasse?",
    resposta:
      "É o carro que a loja vende no estado, sem preparar e sem a garantia da loja, por um preço abaixo da FIPE. Cada anúncio diz se o carro tem laudo cautelar e, quando há reparo pendente, quanto ele custa.",
  },
  {
    pergunta: "O que muda entre um repasse com laudo e um sem laudo?",
    resposta:
      "O com laudo já passou pela perícia cautelar, e o laudo sai a pedido antes de qualquer sinal. O sem laudo ainda não foi periciado: você examina no pátio, com o seu mecânico, e decide com a ficha de estado na mão.",
  },
  {
    pergunta: "Por que o repasse custa menos?",
    resposta:
      "A loja não investe no preparo, não assume a garantia de motor e câmbio e precisa que o carro gire rápido. O que falta arrumar está na ficha de estado e, quando orçado, entra na conta do anúncio.",
  },
  {
    pergunta: "Carro de repasse tem garantia?",
    resposta: `Não tem a garantia da loja, a de ${PRAZO_DA_GARANTIA}, que vale para o estoque.`,
  },
  {
    pergunta: "O que é a ficha de estado?",
    resposta:
      "É a lista dos defeitos que conhecemos no carro, com foto e, quando existe, o orçamento. Ela fica publicada no anúncio e você a assina junto com o contrato.",
  },
  {
    pergunta: "Posso levar o carro ao meu mecânico?",
    resposta:
      "O exame é no nosso pátio, no Bacacheri. Marque um horário e traga o seu mecânico: ele pode olhar o carro com calma antes de você decidir.",
  },
  {
    pergunta: "Dá para financiar ou dar meu carro na troca?",
    resposta:
      "Não. O repasse é só à vista, por PIX ou TED. Se você precisa financiar ou quer dar o seu carro na troca, o estoque com garantia aceita as duas coisas.",
  },
  {
    pergunta: "Quem faz a transferência?",
    resposta: "Quem compra. Entregamos o documento sem restrição e sem débito, e a transferência fica por sua conta.",
  },
  {
    pergunta: "Tem carro de leilão ou com sinistro?",
    resposta:
      "Cada anúncio informa o histórico daquele carro. Se houver registro de leilão ou de sinistro, ele aparece escrito no anúncio e na ficha de estado.",
  },
  {
    pergunta: "Sou lojista. O que muda para mim?",
    resposta:
      "Com o CNPJ cadastrado, você recebe cada carro no WhatsApp antes de ele entrar no site, pode negociar condição para lote e compra com nota no CNPJ.",
  },
];

// ---------------------------------------------------------------------------
// A ficha do carro
// ---------------------------------------------------------------------------

export const FICHA_DO_REPASSE = {
  quero: "QUERO ESTE REPASSE",
  marcarExame: "MARCAR EXAME NO PÁTIO",
  semGarantia: "Sem a garantia da loja",
  aVista: "À vista, por PIX ou TED",
  transferencia: "Transferência por conta de quem compra",
  motivoRotulo: "POR QUE ESTÁ NO REPASSE",
  motivoComReparo: "Reparo pendente, orçado antes de anunciar",
  fichaRotulo: "FICHA DE ESTADO",
  fichaTitulo: "O que sabemos deste carro",
  fichaTexto: "Os defeitos que conhecemos, com foto. É esta lista que você assina junto com o contrato.",
  colunaFoto: "FOTO",
  colunaItem: "ITEM E ONDE ESTÁ",
  colunaOrcamento: "ORÇAMENTO",
  estetico: "Estético, sem orçamento",
  semOrcamento: "Sem orçamento",
  semDefeitos: "Nenhum defeito conhecido.",
  totalOrcado: "Total orçado",
  historicoRotulo: "HISTÓRICO E DOCUMENTOS",
  laudo: "Laudo cautelar",
  leilao: "Leilão",
  sinistro: "Sinistro",
  documento: "Documento",
  documentoValor: "Sem restrição e sem débito",
  transferenciaRotulo: "Transferência",
  transferenciaValor: "Por conta de quem compra",
  consulta: "Consulta do histórico",
  naoConsta: "Não consta",
  naoVemRotulo: "O QUE NÃO VEM COM ESTE CARRO",
  naoVem: [`A garantia da loja, de ${PRAZO_DA_GARANTIA}`, "Financiamento", "O seu carro na troca"],
  naoVemDestaque: "O preço já leva em conta o que não vem.",
  naoVemTexto: "Se você precisa de garantia, financiamento ou troca, o estoque com garantia tem as três coisas.",
  entenda: "ENTENDA O REPASSE",
  exameRotulo: "EXAME NO PÁTIO",
  exameTexto: "O carro fica no pátio do Bacacheri. Traga o seu mecânico, se quiser, e olhe com calma antes de decidir.",
  dia: "DIA",
  turno: "TURNO",
  levaMecanico: "Vou levar o meu mecânico",
  pedirHorario: "PEDIR HORÁRIO",
  confirmamos: "Confirmamos o horário pelo WhatsApp.",
  pedidoEnviado: "Pedido enviado.",
  parecidosRotulo: "NO ESTOQUE COM GARANTIA",
  verOEstoque: "VER O ESTOQUE",
  queroEste: "QUERO ESTE",
  aVistaCurto: "à vista",
  seloLojistas: "SÓ PARA LOJISTAS",
  seloReservado: "RESERVADO",
  seloVendido: "VENDIDO",
} as const;

export function seloDeAberto(dia: string): string {
  return `ABERTO A TODOS DESDE ${dia}`;
}

/** A primeira linha da lista rápida da ficha. */
export function laudoNaListaRapida(laudo: LaudoDoRepasse | null): string {
  if (laudo === "aprovado") return "Laudo cautelar aprovado, sai a pedido";
  if (laudo === "aprovado_com_apontamento") return "Laudo cautelar aprovado com apontamento, sai a pedido";
  return "Sem laudo cautelar";
}

/** O valor da linha "Laudo cautelar" em "Histórico e documentos" (spec §7.2). */
export function laudoNoHistorico(laudo: LaudoDoRepasse | null, apontamento: string | null): string {
  if (laudo === "aprovado") return "Aprovado, sai a pedido";
  if (laudo === "aprovado_com_apontamento") {
    return `Aprovado com apontamento: ${semPontoFinal(apontamento ?? "")}. Sai a pedido`;
  }
  return "Não feito";
}

/** Leilão e sinistro: "Não consta", ou "Consta: <o que a equipe escreveu>". */
export function constaNoHistorico(consta: boolean | null, detalhe: string | null): string {
  return consta ? `Consta: ${semPontoFinal(detalhe ?? "")}` : FICHA_DO_REPASSE.naoConsta;
}

export function consultaFeitaEm(dia: string): string {
  return `Feita em ${dia}`;
}

export function orcamentoDaOficina(oficina: string, dia: string): string {
  return `Orçamento da oficina ${oficina.trim()}, feito em ${dia}.`;
}

/** "Marque um horário para ver o Kwid" / "…ver a Strada". */
export function tituloDoExame(modelo: string, genero: Genero): string {
  return `Marque um horário para ver ${o(genero)} ${modelo}`;
}

/** "Prefere com garantia? Parecidos com este Kwid" / "…com esta Strada". */
export function tituloDosParecidos(modelo: string, genero: Genero): string {
  return `Prefere com garantia? Parecidos com ${concordar(genero, "este", "esta")} ${modelo}`;
}

/** Barra fixa do celular: "R$ 3.180 abaixo da FIPE". */
export function abaixoDaFipeNaBarra(valor: string): string {
  return `${valor} abaixo da FIPE`;
}

/** "1 / 28 · 4 fotos de defeitos" sobre a foto grande da galeria. */
export function contadorDaGaleria(atual: number, total: number, defeitos: number): string {
  const base = `${atual} / ${total}`;
  if (defeitos === 0) return base;
  return `${base} · ${defeitos} ${defeitos === 1 ? "foto de defeito" : "fotos de defeitos"}`;
}

export function rotuloDoDefeito(numero: number): string {
  return `DEFEITO ${numero}`;
}

export function textoAlternativoDaFoto(nome: string, numero: number): string {
  return `${nome}, foto ${numero}`;
}

export function tituloDaFichaNaBusca(nome: string): string {
  return `${nome} no repasse | Motors Store`;
}

// ---------------------------------------------------------------------------
// Sem carro aberto, e endereço que não abre carro
// ---------------------------------------------------------------------------

export const VAZIO_DO_REPASSE = {
  titulo: "Nenhum repasse aberto agora",
  lojista: "Se você é lojista, cadastre o CNPJ: o carro chega para você antes de entrar no site.",
  enquantoIsso: "ENQUANTO ISSO, O ESTOQUE COM GARANTIA",
  estoqueRotulo: "ENQUANTO ISSO",
  estoqueTitulo: "No estoque com garantia",
  verTodoOEstoque: "VER TODO O ESTOQUE",
} as const;

/** A data só entra quando houve venda na carência (decisão 8). */
export function textoDoVazio(ultimaSaida: string | null): string {
  return ultimaSaida
    ? `O repasse gira rápido, e o último carro saiu em ${ultimaSaida}. Entre na lista e receba o próximo no WhatsApp assim que ele abrir.`
    : "O repasse gira rápido. Entre na lista e receba o próximo no WhatsApp assim que ele abrir.";
}

export const NAO_ENCONTRADO_NO_REPASSE = {
  titulo: "Não encontramos este repasse",
  texto:
    "Este endereço não abre nenhum carro do repasse. Costuma ser link antigo, de um carro que já saiu, ou endereço incompleto.",
  textoDaAmostra: "Abaixo, uma amostra do estoque com garantia de hoje e a lista do repasse.",
  tituloNaBusca: "Repasse não encontrado | Motors Store",
  descricaoNaBusca: "Este endereço não abre nenhum carro do repasse. Veja o que está aberto hoje.",
} as const;

// ---------------------------------------------------------------------------
// O que os formulários e a rota dizem quando algo não passa
// ---------------------------------------------------------------------------

/**
 * Toda mensagem de erro que a pessoa pode ler na lista e no exame. A rota de
 * leads devolve estas mesmas (Task 6), e o formulário só mostra texto que
 * esteja aqui (`mensagemDeErroDaRota`, Task 3): mensagem de servidor que não
 * é nossa vira a genérica.
 */
export const ERROS_DO_REPASSE = {
  canal: "Formulário do repasse desconhecido.",
  nome: "Escreva o seu nome.",
  whatsapp: "Informe um WhatsApp com DDD.",
  faixa: "Escolha quanto quer gastar.",
  carroceria: "Escolha os tipos de carro da lista.",
  cnpj: "Confira o CNPJ: os números não fecham.",
  loja: "Escreva o nome da loja e a cidade.",
  carro: "Não achamos este carro no repasse.",
  dia: "Escolha um dos dias oferecidos.",
  turno: "Escolha manhã ou tarde.",
  exameFechado: "Este carro não está aberto para exame agora.",
  conferencia: "Não deu para conferir o carro agora. Tente de novo em instantes.",
  lista: "Não deu para entrar na lista agora. Tente de novo em instantes.",
  generico: "Não conseguimos enviar agora. Tente de novo em instantes.",
} as const;
```

- [ ] **Step 5: Registrar o texto nas duas travas globais**

Em `tests/textos-sem-marcas-de-ia.test.ts`:
1. Depois do último import do topo (`import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";`), acrescentar:
   ```ts
   import { todoOTextoDoRepasse } from "./textoDoRepasse";
   ```
2. Antes do `describe("a régua pega o que diz pegar", …)`, acrescentar:
   ```ts
   describe("a seção de repasse", () => {
     it("todo o texto de paginaDoRepasse.ts, o fixo e o montado", () => {
       semMarcas(todoOTextoDoRepasse().join("\n"), "paginaDoRepasse");
     });
   });
   ```

Em `tests/links-no-texto-do-faq.test.ts`, no `it("vale para toda resposta de FAQ que o repositório publica", …)`:
1. Depois de `const { PERGUNTAS_POR_CAMINHO } = await import("../src/lib/textoDosHubs");`, acrescentar:
   ```ts
       const { PERGUNTAS_DO_REPASSE } = await import("../src/lib/paginaDoRepasse");
   ```
2. No array `respostas`, depois de `...Object.values(PERGUNTAS_POR_CAMINHO).flat(),`, acrescentar:
   ```ts
         ...PERGUNTAS_DO_REPASSE,
   ```

- [ ] **Step 6: Rodar os três arquivos**

Run: `npx vitest run tests/pagina-do-repasse.test.ts tests/textos-sem-marcas-de-ia.test.ts tests/links-no-texto-do-faq.test.ts`
Expected: PASS. Se `textos-sem-marcas-de-ia` acusar marca forte numa frase das pranchas, **não reescrever a frase por conta própria**: parar e levar a frase ao controlador (é texto aprovado pelo dono).

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; rodar `npx vitest run tests/pagina-do-repasse.test.ts tests/textos-sem-marcas-de-ia.test.ts`, ver reprovar, desfazer:
1. Na resposta da pergunta "Carro de repasse tem garantia?", trocar `${PRAZO_DA_GARANTIA}` por `três meses ou 5.000 quilômetros, o que vier primeiro` digitado → "o arquivo não digita o prazo" reprova.
2. Na resposta de "O que muda entre um repasse com laudo e um sem laudo?", trocar "o laudo sai a pedido antes de qualquer sinal" por "o laudo sai antes de qualquer sinal" → "toda frase que diz que o laudo sai diz que sai a pedido" reprova.
3. Trocar `motivoComReparo` por "Não girou no estoque, orçado antes de anunciar" → "nenhum da lista do painel" reprova (termo "girou").
4. Pôr um travessão em `COMO_LER_UM_REPASSE.nota` ("O orçamento é da oficina — que examinou o carro.") → `textos-sem-marcas-de-ia` reprova em "§8 travessão".
5. Trocar `consentimento` pela linha das pranchas ("Ao enviar, você concorda com a política de privacidade.") → "a linha de consentimento é a da §7.4" reprova.
6. Apagar a amostra de `textoDoVazio` de `FUNCOES_COM_AMOSTRA` → "toda função exportada tem amostra" reprova.

- [ ] **Step 8: Commit**

```bash
git add src/lib/paginaDoRepasse.ts tests/textoDoRepasse.ts tests/pagina-do-repasse.test.ts tests/textos-sem-marcas-de-ia.test.ts tests/links-no-texto-do-faq.test.ts
git commit -m "feat(repasse): o texto da seção num módulo só, com as travas do dono

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: O horário da loja e os dias do exame — Sonnet

**Files:**
- Create: `src/lib/horarioDaLoja.ts`
- Create: `src/lib/exameNoPatio.ts`
- Modify: `src/lib/schemaLoja.ts` (o `openingHoursSpecification` do `schemaDaLoja`, ~linha 278, e o import do topo)
- Test: `tests/horario-e-exame.test.ts` (novo)

**Interfaces:**
- Consumes: `schemaDaLoja` (`src/lib/schemaLoja.ts`); `PAGINAS_GEO` (`src/lib/paginasGeo.ts`, só no teste).
- Produces (usados pelas Tasks 3, 6, 8, 9, 11):
  - Em `src/lib/horarioDaLoja.ts`: `type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6` (0 = domingo); `interface ExpedienteDaLoja { dias: readonly DiaDaSemana[]; abre: string; fecha: string }`; `HORARIO_DA_LOJA: readonly ExpedienteDaLoja[]`; `especificacaoDoHorario()`; `horaParaLer(hhmm: string): string` ("08:30" → "8h30"); `dataEmCuritiba(instante: Date): string` ("AAAA-MM-DD"); `ehData(data: string): boolean`; `somarDias(data: string, dias: number): string`; `diaDaSemana(data: string): DiaDaSemana`; `lojaAbreNoDia(data: string): boolean`; `ddmm(data: string): string` ("25/09"); `ddmmEmCuritiba(valor: string | null | undefined): string | null`; `ehHojeEmCuritiba(valor: string | null | undefined, agora: Date): boolean`.
  - Em `src/lib/exameNoPatio.ts`: `TURNOS_DO_EXAME = ["manha", "tarde"] as const`; `type TurnoDoExame`; `NOME_DO_TURNO: Record<TurnoDoExame, string>`; `QUANTOS_DIAS_DE_EXAME = 3`; `interface DiaDoExame { data: string; rotulo: string; rotuloCompleto: string }`; `rotuloDoDia(data)` ("Sex 25"); `rotuloCompletoDoDia(data)` ("Sex 25/09"); `diasDoExame(agora: Date, quantos?: number): DiaDoExame[]`; `diaAceitoParaOExame(data: unknown, agora: Date): data is string`; `turnoDoExame(valor: unknown): TurnoDoExame | null`.

Calendário de referência dos testes (conferido com `node`): 23/09/2026 é quarta; 24 quinta; 25 sexta; 26 sábado; 27 domingo; 28 segunda.

- [ ] **Step 1: Escrever os testes que falham**

`tests/horario-e-exame.test.ts` (Write tool: tem `\s` e `\d`):

```ts
import { describe, it, expect } from "vitest";
import {
  HORARIO_DA_LOJA,
  dataEmCuritiba,
  ddmmEmCuritiba,
  ehHojeEmCuritiba,
  especificacaoDoHorario,
  horaParaLer,
} from "../src/lib/horarioDaLoja";
import {
  diaAceitoParaOExame,
  diasDoExame,
  rotuloCompletoDoDia,
  turnoDoExame,
} from "../src/lib/exameNoPatio";
import { PAGINAS_GEO } from "../src/lib/paginasGeo";
import { schemaDaLoja } from "../src/lib/schemaLoja";
import type { CompanySettings } from "../src/types";

/**
 * O horário da loja virou dado (decisão 12 do PR 3): o exame no pátio precisa
 * CALCULAR com ele, e calcular em cima de uma frase seria a terceira cópia.
 * Estes testes provam que a fonte nova não mudou o que o site já publicava, e
 * que "hoje" é o dia de Curitiba — não o do servidor, que roda em UTC.
 */
const QUARTA_MEIO_DIA = new Date("2026-09-23T15:00:00Z"); // qua 23/09, 12h em Curitiba

describe("o horário da loja é uma fonte só", () => {
  it("o AutoDealer publica o mesmo horário de antes", () => {
    const loja = schemaDaLoja({ name: "Motors Store" } as CompanySettings);
    expect(loja.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "08:30",
        closes: "18:30",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday"],
        opens: "08:30",
        closes: "15:00",
      },
    ]);
  });

  it("e o que ele publica sai da constante", () => {
    expect(schemaDaLoja({ name: "Motors Store" } as CompanySettings).openingHoursSpecification).toEqual(
      especificacaoDoHorario(),
    );
  });

  it("o texto das páginas geográficas diz o mesmo horário", () => {
    const texto = PAGINAS_GEO.flatMap((p) => [...p.paragrafos, ...p.faq.map((f) => f.resposta)]).join(" ");
    for (const expediente of HORARIO_DA_LOJA) {
      expect(texto).toContain(`das ${horaParaLer(expediente.abre)} às ${horaParaLer(expediente.fecha)}`);
    }
  });
});

describe("o dia é o de Curitiba", () => {
  it("às 23h30 de quarta em Curitiba ainda é quarta, com o servidor já na quinta", () => {
    const noite = new Date("2026-09-24T02:30:00Z");
    expect(dataEmCuritiba(noite)).toBe("2026-09-23");
    expect(diasDoExame(noite).map((d) => d.rotulo)).toEqual(["Qui 24", "Sex 25", "Sáb 26"]);
  });

  it("dd/mm de coluna date e de timestamptz", () => {
    expect(ddmmEmCuritiba("2026-09-22")).toBe("22/09");
    expect(ddmmEmCuritiba("2026-09-25T01:00:00+00:00")).toBe("24/09");
    expect(ddmmEmCuritiba("2026-02-31")).toBeNull();
    expect(ddmmEmCuritiba("lixo")).toBeNull();
    expect(ddmmEmCuritiba(null)).toBeNull();
  });

  it("hoje é hoje em Curitiba", () => {
    expect(ehHojeEmCuritiba("2026-09-23T13:00:00Z", QUARTA_MEIO_DIA)).toBe(true);
    expect(ehHojeEmCuritiba("2026-09-23T02:00:00Z", QUARTA_MEIO_DIA)).toBe(false); // 23h de terça
    expect(ehHojeEmCuritiba(null, QUARTA_MEIO_DIA)).toBe(false);
  });
});

describe("os dias do exame", () => {
  it("os três próximos dias de loja aberta, depois de hoje", () => {
    expect(diasDoExame(QUARTA_MEIO_DIA)).toEqual([
      { data: "2026-09-24", rotulo: "Qui 24", rotuloCompleto: "Qui 24/09" },
      { data: "2026-09-25", rotulo: "Sex 25", rotuloCompleto: "Sex 25/09" },
      { data: "2026-09-26", rotulo: "Sáb 26", rotuloCompleto: "Sáb 26/09" },
    ]);
  });

  it("domingo fica de fora", () => {
    const sexta = new Date("2026-09-25T15:00:00Z");
    expect(diasDoExame(sexta).map((d) => d.data)).toEqual(["2026-09-26", "2026-09-28", "2026-09-29"]);
  });

  it("o rótulo completo leva dia e mês", () => {
    expect(rotuloCompletoDoDia("2026-09-26")).toBe("Sáb 26/09");
  });

  it("aceita de hoje até o fim da janela, e só dia de loja aberta", () => {
    expect(diaAceitoParaOExame("2026-09-24", QUARTA_MEIO_DIA)).toBe(true);
    expect(diaAceitoParaOExame("2026-09-26", QUARTA_MEIO_DIA)).toBe(true);
    // A ficha fica em cache: uma aba aberta de véspera ainda oferece o dia que virou hoje.
    expect(diaAceitoParaOExame("2026-09-23", QUARTA_MEIO_DIA)).toBe(true);
    expect(diaAceitoParaOExame("2026-09-22", QUARTA_MEIO_DIA)).toBe(false); // ontem
    expect(diaAceitoParaOExame("2026-09-27", QUARTA_MEIO_DIA)).toBe(false); // domingo
    expect(diaAceitoParaOExame("2026-09-28", QUARTA_MEIO_DIA)).toBe(false); // depois da janela
    expect(diaAceitoParaOExame("26/09", QUARTA_MEIO_DIA)).toBe(false);
    expect(diaAceitoParaOExame(20260926, QUARTA_MEIO_DIA)).toBe(false);
  });

  it("turno é manhã ou tarde", () => {
    expect(turnoDoExame("manha")).toBe("manha");
    expect(turnoDoExame("tarde")).toBe("tarde");
    expect(turnoDoExame("noite")).toBeNull();
    expect(turnoDoExame(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/horario-e-exame.test.ts`
Expected: FAIL — os dois módulos não existem.

- [ ] **Step 3: Escrever `src/lib/horarioDaLoja.ts`** (Write tool)

```ts
/**
 * O horário da loja, estruturado — a fonte única do exame no pátio e do
 * `openingHoursSpecification` do `AutoDealer` (decisão 12 do PR 3).
 *
 * Até 25/09 o horário existia em código duas vezes: uma frase para leitura em
 * `paginasGeo.ts` (`HORARIO`) e um literal no `schemaDaLoja`. O exame no
 * pátio precisa CALCULAR com ele (quais são os próximos dias de loja aberta),
 * e calcular em cima de uma frase seria a terceira cópia. Esta constante é a
 * fonte; `schemaDaLoja` passou a lê-la (o JSON-LD saiu idêntico, e
 * `tests/horario-e-exame.test.ts` o prende), e a frase de `paginasGeo.ts` é
 * conferida contra ela pelo mesmo teste.
 *
 * Curitiba é UTC−3 fixo: o Brasil não tem horário de verão desde 2019. O dia
 * "de hoje" é o de Curitiba, não o do servidor — a Vercel roda em UTC, e às
 * 22h de quarta em Curitiba já é quinta lá.
 */

/** 0 = domingo, como `Date.getUTCDay()`. */
export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ExpedienteDaLoja {
  dias: readonly DiaDaSemana[];
  /** "HH:MM", como o schema.org pede. */
  abre: string;
  fecha: string;
}

/** Segunda a sexta das 8h30 às 18h30; sábado das 8h30 às 15h. */
export const HORARIO_DA_LOJA: readonly ExpedienteDaLoja[] = [
  { dias: [1, 2, 3, 4, 5], abre: "08:30", fecha: "18:30" },
  { dias: [6], abre: "08:30", fecha: "15:00" },
];

const DIAS_EM_INGLES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** O `openingHoursSpecification` do `AutoDealer`. */
export function especificacaoDoHorario() {
  return HORARIO_DA_LOJA.map((expediente) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: expediente.dias.map((dia) => DIAS_EM_INGLES[dia]),
    opens: expediente.abre,
    closes: expediente.fecha,
  }));
}

/** "08:30" → "8h30"; "15:00" → "15h" — como `paginasGeo.ts` escreve para o leitor. */
export function horaParaLer(hhmm: string): string {
  const [hora, minuto] = hhmm.split(":");
  return `${Number(hora)}h${minuto === "00" ? "" : minuto}`;
}

const DESLOCAMENTO_DE_CURITIBA_MS = -3 * 60 * 60 * 1000;
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A data de Curitiba naquele instante, "AAAA-MM-DD". */
export function dataEmCuritiba(instante: Date): string {
  return new Date(instante.getTime() + DESLOCAMENTO_DE_CURITIBA_MS).toISOString().slice(0, 10);
}

/** "AAAA-MM-DD" que existe no calendário ("2026-02-31" não existe). */
export function ehData(data: string): boolean {
  const partes = DATA.exec(data);
  if (!partes) return false;
  const dia = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
  return dia.toISOString().slice(0, 10) === data;
}

/** Meio-dia UTC: nenhuma soma de dias cruza a virada por fuso. */
export function somarDias(data: string, dias: number): string {
  const dia = new Date(`${data}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}

export function diaDaSemana(data: string): DiaDaSemana {
  return new Date(`${data}T12:00:00Z`).getUTCDay() as DiaDaSemana;
}

export function lojaAbreNoDia(data: string): boolean {
  const dia = diaDaSemana(data);
  return HORARIO_DA_LOJA.some((expediente) => expediente.dias.includes(dia));
}

/** "AAAA-MM-DD" → "25/09". */
export function ddmm(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/**
 * "25/09" de uma coluna do banco: `date` ("2026-09-22") passa direto;
 * `timestamptz` vira a data de Curitiba. Valor ilegível devolve null.
 */
export function ddmmEmCuritiba(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (DATA.test(valor)) return ehData(valor) ? ddmm(valor) : null;
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? null : ddmm(dataEmCuritiba(instante));
}

/** O instante cai no mesmo dia de Curitiba que `agora`? */
export function ehHojeEmCuritiba(valor: string | null | undefined, agora: Date): boolean {
  if (!valor) return false;
  const instante = new Date(valor);
  return !Number.isNaN(instante.getTime()) && dataEmCuritiba(instante) === dataEmCuritiba(agora);
}
```

- [ ] **Step 4: Escrever `src/lib/exameNoPatio.ts`**

```ts
/**
 * O exame no pátio: quais dias e turnos a ficha oferece (spec §7.2, decisão
 * 12 do PR 3).
 *
 * Os próximos três dias de loja aberta DEPOIS de hoje, em Curitiba; turnos
 * manhã e tarde — o sábado fecha às 15h e ainda tem as duas metades. O
 * horário vem de `HORARIO_DA_LOJA`, sem segunda fonte.
 *
 * A rota de leads aceita um pouco mais do que a ficha oferece AGORA
 * (`diaAceitoParaOExame`): a ficha fica 60 s em cache e uma aba pode ficar
 * aberta de véspera, mostrando o dia que já virou hoje. Aceitar de hoje até o
 * fim da janela não deixa ninguém marcar domingo, ontem ou mês que vem; a
 * equipe confirma o horário pelo WhatsApp de qualquer jeito.
 */
import { dataEmCuritiba, ddmm, diaDaSemana, ehData, lojaAbreNoDia, somarDias } from "./horarioDaLoja";

export const TURNOS_DO_EXAME = ["manha", "tarde"] as const;
export type TurnoDoExame = (typeof TURNOS_DO_EXAME)[number];

export const NOME_DO_TURNO: Record<TurnoDoExame, string> = { manha: "Manhã", tarde: "Tarde" };

export const QUANTOS_DIAS_DE_EXAME = 3;

const SIGLAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export interface DiaDoExame {
  /** "AAAA-MM-DD" — o valor que o formulário manda. */
  data: string;
  /** "Sex 25" — o botão. */
  rotulo: string;
  /** "Sex 25/09" — a mensagem do lead. */
  rotuloCompleto: string;
}

export function rotuloDoDia(data: string): string {
  return `${SIGLAS[diaDaSemana(data)]} ${data.slice(8, 10)}`;
}

export function rotuloCompletoDoDia(data: string): string {
  return `${SIGLAS[diaDaSemana(data)]} ${ddmm(data)}`;
}

export function diasDoExame(agora: Date, quantos: number = QUANTOS_DIAS_DE_EXAME): DiaDoExame[] {
  const hoje = dataEmCuritiba(agora);
  const dias: DiaDoExame[] = [];
  // Catorze é só teto de segurança: com a loja aberta seis dias por semana,
  // três dias de exame cabem em quatro de calendário.
  for (let adiante = 1; dias.length < quantos && adiante <= 14; adiante++) {
    const data = somarDias(hoje, adiante);
    if (lojaAbreNoDia(data)) dias.push({ data, rotulo: rotuloDoDia(data), rotuloCompleto: rotuloCompletoDoDia(data) });
  }
  return dias;
}

export function diaAceitoParaOExame(data: unknown, agora: Date): data is string {
  if (typeof data !== "string" || !ehData(data) || !lojaAbreNoDia(data)) return false;
  const janela = diasDoExame(agora);
  const ultimo = janela.length > 0 ? janela[janela.length - 1].data : null;
  return ultimo !== null && data >= dataEmCuritiba(agora) && data <= ultimo;
}

export function turnoDoExame(valor: unknown): TurnoDoExame | null {
  return TURNOS_DO_EXAME.find((turno) => turno === valor) ?? null;
}
```

- [ ] **Step 5: `schemaDaLoja` passa a ler a constante**

Em `src/lib/schemaLoja.ts`:
1. Depois de `import { SITE_URL } from "./site";`, acrescentar:
   ```ts
   import { especificacaoDoHorario } from "./horarioDaLoja";
   ```
2. Trocar o bloco inteiro
   ```ts
       // Horário real da loja: Seg-Sex 08h30-18h30, Sáb 08h30-15h.
       openingHoursSpecification: [
         {
           "@type": "OpeningHoursSpecification",
           dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
           opens: "08:30",
           closes: "18:30",
         },
         {
           "@type": "OpeningHoursSpecification",
           dayOfWeek: ["Saturday"],
           opens: "08:30",
           closes: "15:00",
         },
       ],
   ```
   por:
   ```ts
       // Horário real da loja. A fonte é `HORARIO_DA_LOJA` (`horarioDaLoja.ts`)
       // desde 25/09, a mesma que calcula os dias do exame no pátio do repasse.
       openingHoursSpecification: especificacaoDoHorario(),
   ```

- [ ] **Step 6: Rodar**

Run: `npx vitest run tests/horario-e-exame.test.ts tests/paginas-de-entidade.test.ts tests/ficha-publica-o-grafo.test.ts`
Expected: PASS (os dois últimos já renderizam o `AutoDealer` e não podem mudar).

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; `npx vitest run tests/horario-e-exame.test.ts`; ver reprovar; desfazer:
1. Em `dataEmCuritiba`, tirar o deslocamento (`new Date(instante.getTime())`) → "às 23h30 de quarta…" reprova (o servidor em UTC já estaria na quinta).
2. Em `HORARIO_DA_LOJA`, trocar o sábado para `fecha: "14:00"` → "o AutoDealer publica o mesmo horário de antes" e "o texto das páginas geográficas" reprovam.
3. Em `diaAceitoParaOExame`, tirar `!lojaAbreNoDia(data) ||` → a linha do domingo reprova.

- [ ] **Step 8: Commit**

```bash
git add src/lib/horarioDaLoja.ts src/lib/exameNoPatio.ts src/lib/schemaLoja.ts tests/horario-e-exame.test.ts
git commit -m "feat(repasse): horário da loja como dado e os dias do exame no pátio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: CNPJ e o lead do repasse — `cnpj.ts` e `leadDoRepasse.ts` — Opus

**Files:**
- Create: `src/lib/cnpj.ts`
- Create: `src/lib/leadDoRepasse.ts`
- Test: `tests/lead-do-repasse.test.ts` (novo)

**Interfaces:**
- Consumes: `ERROS_DO_REPASSE` (Task 1); `diaAceitoParaOExame`, `rotuloCompletoDoDia`, `turnoDoExame`, `TurnoDoExame` (Task 2); `FAIXAS_DO_REPASSE`, `ehIdDeRepasse`, `CarroceriaDoRepasse`, `FaixaDoRepasse`, `Repasse` (`src/lib/repasse.ts`); tipo `TrilhaDoRepasse` (`src/lib/avisosDoRepasse.ts`, import só de tipo); `nomeComAno` (`src/lib/nomeDoVeiculo.ts`); `telefoneDoLead` (`src/lib/whatsapp.ts`); tipo `UtmParameters` (`src/lib/telemetry.ts`).
- Produces (usados pelas Tasks 5, 6, 9):
  - Em `src/lib/cnpj.ts`: `soCaracteresDoCnpj(valor: string): string`; `cnpjValido(valor: string): boolean`; `formatarCnpj(valor: string): string`.
  - Em `src/lib/leadDoRepasse.ts`: `CANAL_DA_LISTA = "repasse"`, `CANAL_DA_LISTA_LOJISTA = "repasse-lojista"`, `CANAL_DO_EXAME = "repasse-exame"`; `FORM_DA_LISTA = "form-lista-repasse"`, `FORM_DA_LISTA_LOJISTA = "form-lista-repasse-lojista"`, `FORM_DO_EXAME = "form-exame-repasse"`; `CARROCERIAS_DA_LISTA = ["hatch", "seda", "suv", "picape"] as const` e `type CarroceriaDaLista`; `MENSAGEM_DA_INSCRICAO: Record<TrilhaDoRepasse, string>`; `VEICULO_DA_LISTA: Record<TrilhaDoRepasse, { marca: string; modelo: string }>`; `type CarroDoExame = Pick<Repasse, "marca" | "modelo" | "versao" | "ano_modelo">`; `type CarroParaOExame = Pick<Repasse, "id" | "slug" | "marca" | "modelo" | "versao" | "ano_modelo" | "preco">`; `interface InscricaoNaLista { trilha; nome; whatsapp; faixa; carrocerias; cnpj; loja_cidade }`; `interface PedidoDeExame { repasseId; dia; turno; levaMecanico }`; `type PedidoDoRepasse`; `type DecisaoDoLeadDoRepasse = { ok: true; pedido: PedidoDoRepasse } | { ok: false; erro: string }`; `ehCanalDoRepasse(canal: unknown): boolean`; `decidirLeadDoRepasse(corpo: unknown, agora: Date): DecisaoDoLeadDoRepasse`; `interface LinhaNovaDoInscrito extends InscricaoNaLista { lead_id: string | null }`; `type ColunasDoInscrito`; `type EscritaDaInscricao`; `decidirInscricao(existente: { id: string; cnpj: string | null } | null, nova: InscricaoNaLista, leadId: string | null): EscritaDaInscricao`; `mensagemDoExame(carro: CarroDoExame, exame: { dia; turno; levaMecanico }): string`; `interface ExtrasDoLeadDoRepasse`; `interface DadosDaLista`; `interface DadosDoExame`; `montarLeadDaLista(dados, extras)`; `montarLeadDoExame(carro, dados, extras)`; `mensagemDeErroDaRota(corpo: unknown): string`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/lead-do-repasse.test.ts` (Write tool):

```ts
import { describe, it, expect } from "vitest";
import { cnpjValido, formatarCnpj } from "../src/lib/cnpj";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import {
  CANAL_DA_LISTA,
  CANAL_DA_LISTA_LOJISTA,
  CANAL_DO_EXAME,
  MENSAGEM_DA_INSCRICAO,
  decidirInscricao,
  decidirLeadDoRepasse,
  ehCanalDoRepasse,
  mensagemDeErroDaRota,
  mensagemDoExame,
  montarLeadDaLista,
  montarLeadDoExame,
  type InscricaoNaLista,
} from "../src/lib/leadDoRepasse";
import { ERROS_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import type { UtmParameters } from "../src/lib/telemetry";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * O lead do repasse sem rota e sem DOM (spec §8): o corpo que os formulários
 * montam, a régua que a rota aplica antes de gravar, e o que vira linha em
 * `repasse_inscritos`. Molde de `tests/encomenda-grava-e-dispara.test.ts`.
 */
const QUARTA_MEIO_DIA = new Date("2026-09-23T15:00:00Z");
const SEM_UTM: UtmParameters = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
  fbclid: null,
};
const EXTRAS = {
  agUid: "ag-1",
  eventId: "evt-1",
  turnstileToken: "tok",
  utm: SEM_UTM,
  eventSourceUrl: "https://exemplo.test/repasse",
  fbp: null,
  fbc: null,
};
const CARRO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z" });

const lista = (parcial: Partial<Parameters<typeof montarLeadDaLista>[0]> = {}) =>
  montarLeadDaLista(
    {
      trilha: "consumidor",
      nome: " Ana Souza ",
      whatsapp: "(41) 99737-2165",
      faixa: "30-50",
      carrocerias: ["hatch"],
      cnpj: "",
      lojaCidade: "",
      caminho: "/repasse",
      ...parcial,
    },
    EXTRAS,
  );
const lojista = (cnpj = "11.222.333/0001-81") =>
  lista({ trilha: "lojista", faixa: null, carrocerias: [], cnpj, lojaCidade: "Loja Exemplo, Curitiba" });
const exame = (parcial: Partial<Parameters<typeof montarLeadDoExame>[1]> = {}) =>
  montarLeadDoExame(
    CARRO,
    { nome: "Ana Souza", whatsapp: "(41) 99737-2165", dia: "2026-09-26", turno: "tarde", levaMecanico: true, ...parcial },
    EXTRAS,
  );
const comRepasse = (corpo: ReturnType<typeof lista>, repasse: Record<string, unknown>) => ({
  ...corpo,
  intencao_busca: { repasse: { ...corpo.intencao_busca.repasse, ...repasse } },
});

describe("CNPJ", () => {
  it("confere os dígitos verificadores", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
  });

  it("todos iguais não é CNPJ, mesmo quando o verificador fecha", () => {
    // 00000000000000 fecha no módulo 11 — é o caso que só a regra explícita pega.
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });

  it("aceita o alfanumérico (Receita, julho de 2026)", () => {
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12.abc.345/01de-35")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-36")).toBe(false);
  });

  it("formata e não inventa formato para o que não tem 14 posições", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj(" 12abc34501de35 ")).toBe("12.ABC.345/01DE-35");
    expect(formatarCnpj("123")).toBe("123");
  });
});

describe("o corpo que o formulário monta", () => {
  it("lista para usar: canal, formulário e intenção estruturada", () => {
    const corpo = lista();
    expect(corpo.canal).toBe(CANAL_DA_LISTA);
    expect(corpo.tipo).toBe("lead_repasse");
    expect(corpo.cliente).toEqual({ nome: "Ana Souza", whatsapp: "(41) 99737-2165" });
    expect(corpo.intencao_busca.repasse).toEqual({
      tipo: "lista",
      trilha: "consumidor",
      faixa: "30-50",
      carrocerias: ["hatch"],
      caminho: "/repasse",
    });
    expect(corpo.turnstileToken).toBe("tok");
  });

  it("a mensagem do lead não leva CNPJ, faixa nem tipo de carro", () => {
    // `leads` é lida por toda a equipe; o perfil da lista fica só em
    // `repasse_inscritos`, que só quem valida lê.
    for (const corpo of [lista(), lojista()]) {
      expect(corpo.mensagem).not.toMatch(/11\.222|R\$|hatch|Loja Exemplo/i);
    }
    expect(lista().mensagem).toBe(MENSAGEM_DA_INSCRICAO.consumidor);
    expect(lojista().mensagem).toBe(MENSAGEM_DA_INSCRICAO.lojista);
  });

  it("o exame não manda `veiculo`: o id do repasse não pode virar content_id nem veiculo_id", () => {
    const corpo = exame();
    expect(corpo).not.toHaveProperty("veiculo");
    expect(corpo.canal).toBe(CANAL_DO_EXAME);
    expect(corpo.intencao_busca.repasse).toEqual({
      tipo: "exame",
      repasse_id: CARRO.id,
      slug: CARRO.slug,
      dia: "2026-09-26",
      turno: "tarde",
      leva_mecanico: true,
    });
    expect(corpo.contentName).toBe("Renault Kwid");
  });

  it("a mensagem do exame diz o carro, o dia, o turno e o mecânico", () => {
    expect(mensagemDoExame(CARRO, { dia: "2026-09-26", turno: "tarde", levaMecanico: true })).toBe(
      "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.",
    );
    expect(mensagemDoExame(CARRO, { dia: "2026-09-24", turno: "manha", levaMecanico: false })).toBe(
      "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Qui 24/09, manhã.",
    );
  });

  it("nenhuma mensagem usa termo que o repasse não usa", () => {
    const mensagens = [
      ...Object.values(MENSAGEM_DA_INSCRICAO),
      mensagemDoExame(CARRO, { dia: "2026-09-26", turno: "tarde", levaMecanico: true }),
    ];
    for (const m of mensagens) expect(termosProibidosEm(m), m).toEqual([]);
  });
});

describe("a régua da rota", () => {
  it("o canal do repasse é o que começa com repasse", () => {
    expect(ehCanalDoRepasse("repasse")).toBe(true);
    expect(ehCanalDoRepasse("repasse-exame")).toBe(true);
    expect(ehCanalDoRepasse("Encomenda")).toBe(false);
    expect(ehCanalDoRepasse(undefined)).toBe(false);
  });

  it("o que o formulário monta, a rota aceita — nas três formas", () => {
    const consumidor = decidirLeadDoRepasse(lista(), QUARTA_MEIO_DIA);
    expect(consumidor).toEqual({
      ok: true,
      pedido: {
        tipo: "lista",
        inscricao: {
          trilha: "consumidor",
          nome: "Ana Souza",
          whatsapp: "5541997372165",
          faixa: "30-50",
          carrocerias: ["hatch"],
          cnpj: null,
          loja_cidade: null,
        },
      },
    });
    const loja = decidirLeadDoRepasse(lojista("11222333000181"), QUARTA_MEIO_DIA);
    expect(loja).toMatchObject({
      ok: true,
      pedido: { tipo: "lista", inscricao: { trilha: "lojista", cnpj: "11.222.333/0001-81", loja_cidade: "Loja Exemplo, Curitiba", faixa: null, carrocerias: [] } },
    });
    expect(decidirLeadDoRepasse(exame(), QUARTA_MEIO_DIA)).toEqual({
      ok: true,
      pedido: { tipo: "exame", exame: { repasseId: CARRO.id, dia: "2026-09-26", turno: "tarde", levaMecanico: true } },
    });
  });

  it("carroceria repetida entra uma vez; tanto faz é lista vazia", () => {
    const d = decidirLeadDoRepasse(lista({ carrocerias: ["hatch", "suv", "hatch"] }), QUARTA_MEIO_DIA);
    expect(d.ok && d.pedido.tipo === "lista" && d.pedido.inscricao.carrocerias).toEqual(["hatch", "suv"]);
    const tantoFaz = decidirLeadDoRepasse(lista({ carrocerias: [] }), QUARTA_MEIO_DIA);
    expect(tantoFaz.ok && tantoFaz.pedido.tipo === "lista" && tantoFaz.pedido.inscricao.carrocerias).toEqual([]);
  });

  it.each([
    ["canal desconhecido", { ...lista(), canal: "repasse-xyz" }, ERROS_DO_REPASSE.canal],
    ["sem nome", { ...lista(), cliente: { nome: "  ", whatsapp: "(41) 99737-2165" } }, ERROS_DO_REPASSE.nome],
    ["WhatsApp sem DDD", { ...lista(), cliente: { nome: "Ana", whatsapp: "99737-2165" } }, ERROS_DO_REPASSE.whatsapp],
    ["faixa fora da lista", comRepasse(lista(), { faixa: "ate-100" }), ERROS_DO_REPASSE.faixa],
    ["carroceria fora da lista", comRepasse(lista(), { carrocerias: ["hatch", "conversivel"] }), ERROS_DO_REPASSE.carroceria],
    ["carrocerias que não são lista", comRepasse(lista(), { carrocerias: "hatch" }), ERROS_DO_REPASSE.carroceria],
    ["trilha trocada no canal", comRepasse(lista(), { trilha: "lojista" }), ERROS_DO_REPASSE.canal],
    ["CNPJ que não fecha", lojista("11.222.333/0001-82"), ERROS_DO_REPASSE.cnpj],
    ["lojista sem loja", comRepasse(lojista(), { loja_cidade: " " }), ERROS_DO_REPASSE.loja],
  ])("lista: %s → recusa com a mensagem certa", (_caso, corpo, erro) => {
    expect(decidirLeadDoRepasse(corpo, QUARTA_MEIO_DIA)).toEqual({ ok: false, erro });
  });

  it.each([
    ["id que não é uuid", { repasse_id: "123" }, ERROS_DO_REPASSE.carro],
    ["domingo", { dia: "2026-09-27" }, ERROS_DO_REPASSE.dia],
    ["depois da janela", { dia: "2026-09-28" }, ERROS_DO_REPASSE.dia],
    ["turno que não existe", { turno: "noite" }, ERROS_DO_REPASSE.turno],
  ])("exame: %s → recusa com a mensagem certa", (_caso, repasse, erro) => {
    const corpo = exame();
    const torto = { ...corpo, intencao_busca: { repasse: { ...corpo.intencao_busca.repasse, ...repasse } } };
    expect(decidirLeadDoRepasse(torto, QUARTA_MEIO_DIA)).toEqual({ ok: false, erro });
  });

  it("corpo que não é objeto não quebra", () => {
    for (const corpo of [null, undefined, "x", 42, []]) {
      expect(decidirLeadDoRepasse(corpo, QUARTA_MEIO_DIA)).toEqual({ ok: false, erro: ERROS_DO_REPASSE.canal });
    }
  });
});

describe("a inscrição: insere ou atualiza", () => {
  const NOVA: InscricaoNaLista = {
    trilha: "lojista",
    nome: "Auto Bom",
    whatsapp: "5541999990000",
    faixa: null,
    carrocerias: [],
    cnpj: "11.222.333/0001-81",
    loja_cidade: "Auto Bom, Curitiba",
  };

  it("sem linha: insere tudo, com o elo do lead", () => {
    expect(decidirInscricao(null, NOVA, "lead-1")).toEqual({ operacao: "insert", linha: { ...NOVA, lead_id: "lead-1" } });
  });

  it("mesmo CNPJ, com ou sem máscara: atualiza e a conferência fica", () => {
    const escrita = decidirInscricao({ id: "i-1", cnpj: "11222333000181" }, NOVA, "lead-2");
    expect(escrita).toEqual({
      operacao: "update",
      id: "i-1",
      colunas: {
        nome: "Auto Bom",
        faixa: null,
        carrocerias: [],
        cnpj: "11.222.333/0001-81",
        loja_cidade: "Auto Bom, Curitiba",
        lead_id: "lead-2",
      },
    });
  });

  it("CNPJ trocado: a conferência volta a zero", () => {
    const escrita = decidirInscricao({ id: "i-1", cnpj: "12.ABC.345/01DE-35" }, NOVA, "lead-2");
    expect(escrita.operacao === "update" && escrita.colunas).toMatchObject({
      cnpj_conferido_em: null,
      cnpj_conferido_por: null,
    });
  });

  it("lead que não gravou não apaga o elo antigo", () => {
    const escrita = decidirInscricao({ id: "i-1", cnpj: "11.222.333/0001-81" }, NOVA, null);
    expect(escrita.operacao === "update" && escrita.colunas).not.toHaveProperty("lead_id");
  });
});

describe("o erro que o formulário mostra", () => {
  it("só texto nosso; o resto vira a mensagem genérica", () => {
    expect(mensagemDeErroDaRota({ error: ERROS_DO_REPASSE.cnpj })).toBe(ERROS_DO_REPASSE.cnpj);
    expect(mensagemDeErroDaRota({ error: ERROS_DO_REPASSE.lista })).toBe(ERROS_DO_REPASSE.lista);
    expect(mensagemDeErroDaRota({ error: "Erro interno no servidor ao processar o lead." })).toBe(
      ERROS_DO_REPASSE.generico,
    );
    expect(mensagemDeErroDaRota(null)).toBe(ERROS_DO_REPASSE.generico);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/lead-do-repasse.test.ts`
Expected: FAIL — `cnpj.ts` e `leadDoRepasse.ts` não existem.

- [ ] **Step 3: Escrever `src/lib/cnpj.ts`** (Write tool: tem `\1` numa regex)

```ts
/**
 * CNPJ: conferência dos dígitos verificadores e o formato "00.000.000/0000-00".
 *
 * Não havia validador no repositório; a lista do repasse é o primeiro lugar do
 * site que recebe CNPJ digitado por visitante (spec §8, trilha lojista).
 *
 * Aceita o CNPJ ALFANUMÉRICO (IN RFB 2.229/2024, emitido desde julho de
 * 2026): as doze primeiras posições podem ser letra ou número, os dois
 * verificadores são sempre número, e o valor de cada posição é o código ASCII
 * menos 48 — o que, para os números, é o próprio dígito. O algoritmo é o mesmo
 * módulo 11 de sempre, então o CNPJ numérico de hoje passa igual.
 *
 * Todos os caracteres iguais ("00000000000000") fecham no módulo 11 e não são
 * CNPJ: a regra explícita existe para eles.
 */
const PESOS_DO_PRIMEIRO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DO_SEGUNDO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Só letras e números, em maiúscula: "12.abc.345/01de-35" → "12ABC34501DE35". */
export function soCaracteresDoCnpj(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function verificador(base: string, pesos: number[]): number {
  const soma = pesos.reduce((total, peso, i) => total + (base.charCodeAt(i) - 48) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string): boolean {
  const cnpj = soCaracteresDoCnpj(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1+$/.test(cnpj)) return false;
  const primeiro = verificador(cnpj.slice(0, 12), PESOS_DO_PRIMEIRO);
  const segundo = verificador(`${cnpj.slice(0, 12)}${primeiro}`, PESOS_DO_SEGUNDO);
  return cnpj.slice(12) === `${primeiro}${segundo}`;
}

/** "00.000.000/0000-00". O que não tem 14 posições volta como veio, aparado. */
export function formatarCnpj(valor: string): string {
  const cnpj = soCaracteresDoCnpj(valor);
  if (cnpj.length !== 14) return valor.trim();
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
```

- [ ] **Step 4: Escrever `src/lib/leadDoRepasse.ts`**

```ts
/**
 * O lead do repasse: o que os três formulários mandam para `/api/leads` e o
 * que a rota aceita (spec §8, decisões 9 a 11 do PR 3).
 *
 * Uma porta só: a lista (duas trilhas) e o exame no pátio entram pela rota de
 * leads de sempre, com `canal` próprio. O corpo é montado aqui, e não dentro
 * do `onSubmit`, pelo mesmo motivo de `encomenda.ts`: um campo trocado não
 * quebra tela nenhuma, e o lead chegaria mudo do outro lado.
 *
 * A mesma função que monta a mensagem no navegador monta na rota
 * (`MENSAGEM_DA_INSCRICAO`, `mensagemDoExame`): o servidor não confia na
 * `mensagem` do corpo. `leads` é lida por toda a equipe; CNPJ, faixa e tipos
 * de carro ficam só em `repasse_inscritos`, que só quem valida lê.
 *
 * Módulo puro: roda no navegador (formulários) e no servidor (rota).
 */
import type { TrilhaDoRepasse } from "./avisosDoRepasse";
import { cnpjValido, formatarCnpj, soCaracteresDoCnpj } from "./cnpj";
import { diaAceitoParaOExame, rotuloCompletoDoDia, turnoDoExame, type TurnoDoExame } from "./exameNoPatio";
import { nomeComAno } from "./nomeDoVeiculo";
import { ERROS_DO_REPASSE } from "./paginaDoRepasse";
import {
  FAIXAS_DO_REPASSE,
  ehIdDeRepasse,
  type CarroceriaDoRepasse,
  type FaixaDoRepasse,
  type Repasse,
} from "./repasse";
import type { UtmParameters } from "./telemetry";
import { telefoneDoLead } from "./whatsapp";

export const CANAL_DA_LISTA = "repasse";
export const CANAL_DA_LISTA_LOJISTA = "repasse-lojista";
export const CANAL_DO_EXAME = "repasse-exame";

export const FORM_DA_LISTA = "form-lista-repasse";
export const FORM_DA_LISTA_LOJISTA = "form-lista-repasse-lojista";
export const FORM_DO_EXAME = "form-exame-repasse";

/** As quatro que o formulário oferece; "Tanto faz" é a lista vazia (decisão 9). */
export const CARROCERIAS_DA_LISTA = ["hatch", "seda", "suv", "picape"] as const satisfies readonly CarroceriaDoRepasse[];
export type CarroceriaDaLista = (typeof CARROCERIAS_DA_LISTA)[number];

/** O texto que a equipe lê no Kanban (decisão 10): sem CNPJ, faixa nem tipos. */
export const MENSAGEM_DA_INSCRICAO: Record<TrilhaDoRepasse, string> = {
  consumidor: "Entrou na lista do repasse (compra para usar).",
  lojista: "Entrou na lista do repasse (lojista).",
};

/**
 * Como a lista se chama na medição, no navegador (`trackLeadSubmission`) e no
 * servidor (`contentName` da CAPI): os dois lados do mesmo `event_id`
 * descrevem a mesma coisa.
 */
export const VEICULO_DA_LISTA: Record<TrilhaDoRepasse, { marca: string; modelo: string }> = {
  consumidor: { marca: "Repasse Motors", modelo: "Lista" },
  lojista: { marca: "Repasse Motors", modelo: "Lista lojista" },
};

export type CarroDoExame = Pick<Repasse, "marca" | "modelo" | "versao" | "ano_modelo">;
export type CarroParaOExame = Pick<Repasse, "id" | "slug" | "marca" | "modelo" | "versao" | "ano_modelo" | "preco">;

export interface InscricaoNaLista {
  trilha: TrilhaDoRepasse;
  nome: string;
  /** Com DDI (`telefoneDoLead(...).comDDI`): com a trilha, a chave da lista. */
  whatsapp: string;
  faixa: FaixaDoRepasse | null;
  carrocerias: CarroceriaDaLista[];
  /** "00.000.000/0000-00"; null fora da trilha lojista. */
  cnpj: string | null;
  loja_cidade: string | null;
}

export interface PedidoDeExame {
  repasseId: string;
  dia: string;
  turno: TurnoDoExame;
  levaMecanico: boolean;
}

export type PedidoDoRepasse = { tipo: "lista"; inscricao: InscricaoNaLista } | { tipo: "exame"; exame: PedidoDeExame };

export type DecisaoDoLeadDoRepasse = { ok: true; pedido: PedidoDoRepasse } | { ok: false; erro: string };

/** Spec §8: "quando o canal começa com repasse". */
export function ehCanalDoRepasse(canal: unknown): boolean {
  return typeof canal === "string" && canal.startsWith("repasse");
}

const LIMITE_DO_TEXTO = 120;
const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const objeto = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
const recusa = (erro: string): DecisaoDoLeadDoRepasse => ({ ok: false, erro });

/**
 * A régua da rota, pura e testada (decisão 11): roda ANTES de qualquer
 * gravação. Canal, trilha e o tipo do pedido têm de concordar entre si — um
 * corpo com `canal: "repasse"` e trilha lojista não passa.
 */
export function decidirLeadDoRepasse(corpo: unknown, agora: Date): DecisaoDoLeadDoRepasse {
  const c = objeto(corpo);
  const canal = c.canal;
  if (canal !== CANAL_DA_LISTA && canal !== CANAL_DA_LISTA_LOJISTA && canal !== CANAL_DO_EXAME) {
    return recusa(ERROS_DO_REPASSE.canal);
  }
  const cliente = objeto(c.cliente);
  const nome = texto(cliente.nome);
  if (!nome || nome.length > LIMITE_DO_TEXTO) return recusa(ERROS_DO_REPASSE.nome);
  const whatsapp = telefoneDoLead(texto(cliente.whatsapp)).comDDI;
  if (!whatsapp) return recusa(ERROS_DO_REPASSE.whatsapp);
  const repasse = objeto(objeto(c.intencao_busca).repasse);

  if (canal === CANAL_DO_EXAME) {
    const repasseId = texto(repasse.repasse_id).toLowerCase();
    if (repasse.tipo !== "exame" || !ehIdDeRepasse(repasseId)) return recusa(ERROS_DO_REPASSE.carro);
    const dia = repasse.dia;
    if (!diaAceitoParaOExame(dia, agora)) return recusa(ERROS_DO_REPASSE.dia);
    const turno = turnoDoExame(repasse.turno);
    if (!turno) return recusa(ERROS_DO_REPASSE.turno);
    return {
      ok: true,
      pedido: { tipo: "exame", exame: { repasseId, dia, turno, levaMecanico: repasse.leva_mecanico === true } },
    };
  }

  if (repasse.tipo !== "lista") return recusa(ERROS_DO_REPASSE.canal);

  if (canal === CANAL_DA_LISTA_LOJISTA) {
    if (repasse.trilha !== "lojista") return recusa(ERROS_DO_REPASSE.canal);
    const cnpj = texto(repasse.cnpj);
    if (!cnpjValido(cnpj)) return recusa(ERROS_DO_REPASSE.cnpj);
    const lojaCidade = texto(repasse.loja_cidade);
    if (!lojaCidade || lojaCidade.length > LIMITE_DO_TEXTO) return recusa(ERROS_DO_REPASSE.loja);
    return {
      ok: true,
      pedido: {
        tipo: "lista",
        inscricao: { trilha: "lojista", nome, whatsapp, faixa: null, carrocerias: [], cnpj: formatarCnpj(cnpj), loja_cidade: lojaCidade },
      },
    };
  }

  if (repasse.trilha !== "consumidor") return recusa(ERROS_DO_REPASSE.canal);
  const faixa = FAIXAS_DO_REPASSE.find((f) => f.id === repasse.faixa)?.id;
  if (!faixa) return recusa(ERROS_DO_REPASSE.faixa);
  const brutas = Array.isArray(repasse.carrocerias) ? (repasse.carrocerias as unknown[]) : null;
  const carrocerias = (brutas ?? []).filter((c): c is CarroceriaDaLista =>
    (CARROCERIAS_DA_LISTA as readonly unknown[]).includes(c),
  );
  // Um valor fora da lista NUNCA casaria com carro nenhum no painel: a pessoa
  // ficaria na lista sem ser avisada. Recusa em vez de descartar calado.
  if (!brutas || carrocerias.length !== brutas.length) return recusa(ERROS_DO_REPASSE.carroceria);
  return {
    ok: true,
    pedido: {
      tipo: "lista",
      inscricao: {
        trilha: "consumidor",
        nome,
        whatsapp,
        faixa,
        carrocerias: [...new Set(carrocerias)],
        cnpj: null,
        loja_cidade: null,
      },
    },
  };
}

export interface LinhaNovaDoInscrito extends InscricaoNaLista {
  lead_id: string | null;
}

export type ColunasDoInscrito = Partial<Omit<LinhaNovaDoInscrito, "trilha" | "whatsapp">> & {
  cnpj_conferido_em?: null;
  cnpj_conferido_por?: null;
};

export type EscritaDaInscricao =
  | { operacao: "insert"; linha: LinhaNovaDoInscrito }
  | { operacao: "update"; id: string; colunas: ColunasDoInscrito };

/**
 * Quem já está na lista (mesma trilha e mesmo WhatsApp) é ATUALIZADO, não
 * duplicado — a unique `(org_id, trilha, whatsapp)` recusaria de qualquer
 * jeito. CNPJ trocado perde a conferência: quem conferiu, conferiu outro
 * número. Lead que não gravou (`leadId` nulo) não apaga o elo antigo.
 */
export function decidirInscricao(
  existente: { id: string; cnpj: string | null } | null,
  nova: InscricaoNaLista,
  leadId: string | null,
): EscritaDaInscricao {
  if (!existente) return { operacao: "insert", linha: { ...nova, lead_id: leadId } };
  const cnpjTrocado = soCaracteresDoCnpj(existente.cnpj ?? "") !== soCaracteresDoCnpj(nova.cnpj ?? "");
  return {
    operacao: "update",
    id: existente.id,
    colunas: {
      nome: nova.nome,
      faixa: nova.faixa,
      carrocerias: nova.carrocerias,
      cnpj: nova.cnpj,
      loja_cidade: nova.loja_cidade,
      ...(leadId ? { lead_id: leadId } : {}),
      ...(cnpjTrocado ? { cnpj_conferido_em: null, cnpj_conferido_por: null } : {}),
    },
  };
}

/** "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico." */
export function mensagemDoExame(
  carro: CarroDoExame,
  exame: { dia: string; turno: TurnoDoExame; levaMecanico: boolean },
): string {
  const nome = nomeComAno({ marca: carro.marca, modelo: carro.modelo, versao: carro.versao, ano: carro.ano_modelo });
  const turno = exame.turno === "manha" ? "manhã" : "tarde";
  const mecanico = exame.levaMecanico ? " Vou levar o meu mecânico." : "";
  return `Quero marcar o exame no pátio do ${nome}: ${rotuloCompletoDoDia(exame.dia)}, ${turno}.${mecanico}`;
}

export interface ExtrasDoLeadDoRepasse {
  agUid: string;
  eventId: string | null;
  turnstileToken: string;
  utm: UtmParameters;
  eventSourceUrl?: string;
  fbp: string | null;
  fbc: string | null;
}

export interface DadosDaLista {
  trilha: TrilhaDoRepasse;
  nome: string;
  whatsapp: string;
  faixa: FaixaDoRepasse | null;
  carrocerias: CarroceriaDaLista[];
  cnpj: string;
  lojaCidade: string;
  /** Onde a pessoa estava: `/repasse`, a ficha, o endereço que não abriu carro. */
  caminho: string;
}

export function montarLeadDaLista(dados: DadosDaLista, extras: ExtrasDoLeadDoRepasse) {
  const lojista = dados.trilha === "lojista";
  const veiculo = VEICULO_DA_LISTA[dados.trilha];
  return {
    tipo: "lead_repasse",
    canal: lojista ? CANAL_DA_LISTA_LOJISTA : CANAL_DA_LISTA,
    mensagem: MENSAGEM_DA_INSCRICAO[dados.trilha],
    cliente: { nome: dados.nome.trim(), whatsapp: dados.whatsapp.trim() },
    intencao_busca: {
      repasse: lojista
        ? { tipo: "lista", trilha: "lojista", cnpj: dados.cnpj.trim(), loja_cidade: dados.lojaCidade.trim(), caminho: dados.caminho }
        : { tipo: "lista", trilha: "consumidor", faixa: dados.faixa, carrocerias: dados.carrocerias, caminho: dados.caminho },
    },
    contentName: `${veiculo.marca} ${veiculo.modelo}`,
    utm: extras.utm,
    agUid: extras.agUid,
    eventId: extras.eventId,
    eventSourceUrl: extras.eventSourceUrl,
    fbp: extras.fbp,
    fbc: extras.fbc,
    turnstileToken: extras.turnstileToken,
  };
}

export interface DadosDoExame {
  nome: string;
  whatsapp: string;
  dia: string;
  turno: TurnoDoExame;
  levaMecanico: boolean;
}

/**
 * Sem `veiculo` no corpo, de propósito: a rota converteria o uuid em
 * `veiculo_id` (bigint, vira null) e o mandaria como `content_ids` à CAPI —
 * um id que não existe no catálogo da Meta (spec §8). O elo com o carro é o
 * `repasse_id`, que a rota grava depois de conferir o carro.
 */
export function montarLeadDoExame(carro: CarroParaOExame, dados: DadosDoExame, extras: ExtrasDoLeadDoRepasse) {
  return {
    tipo: "lead_repasse_exame",
    canal: CANAL_DO_EXAME,
    mensagem: mensagemDoExame(carro, dados),
    cliente: { nome: dados.nome.trim(), whatsapp: dados.whatsapp.trim() },
    intencao_busca: {
      repasse: {
        tipo: "exame",
        repasse_id: carro.id,
        slug: carro.slug,
        dia: dados.dia,
        turno: dados.turno,
        leva_mecanico: dados.levaMecanico,
      },
    },
    contentName: `${carro.marca} ${carro.modelo}`,
    utm: extras.utm,
    agUid: extras.agUid,
    eventId: extras.eventId,
    eventSourceUrl: extras.eventSourceUrl,
    fbp: extras.fbp,
    fbc: extras.fbc,
    turnstileToken: extras.turnstileToken,
  };
}

/**
 * O que o formulário mostra quando a rota recusa: só texto de
 * `ERROS_DO_REPASSE`. Mensagem de servidor que não é nossa ("Erro interno…",
 * a do limite de envios) vira a genérica.
 */
export function mensagemDeErroDaRota(corpo: unknown): string {
  const erro = objeto(corpo).error;
  const nossas: readonly string[] = Object.values(ERROS_DO_REPASSE);
  return typeof erro === "string" && nossas.includes(erro) ? erro : ERROS_DO_REPASSE.generico;
}
```

Nota ao implementador: se o `tsc` do CI reclamar do `satisfies` em `CARROCERIAS_DA_LISTA`, a versão do TypeScript é `^5` (`package.json`), que o suporta; não trocar por `as` (perderia a conferência contra `CarroceriaDoRepasse`).

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/lead-do-repasse.test.ts`
Expected: PASS.

- [ ] **Step 6: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `decidirLeadDoRepasse`, trocar `if (!brutas || carrocerias.length !== brutas.length)` por `if (!brutas)` → "carroceria fora da lista" reprova (a pessoa entraria na lista com um tipo que nunca casa).
2. Em `decidirInscricao`, trocar `const cnpjTrocado = …` por `const cnpjTrocado = false;` → "CNPJ trocado: a conferência volta a zero" reprova.
3. Em `cnpjValido`, apagar a linha `if (/^(.)\1+$/.test(cnpj)) return false;` → "todos iguais não é CNPJ" reprova (no `00000000000000`).
4. Em `montarLeadDaLista`, trocar `mensagem: MENSAGEM_DA_INSCRICAO[dados.trilha]` por `` mensagem: `${MENSAGEM_DA_INSCRICAO[dados.trilha]} CNPJ ${dados.cnpj}` `` → "a mensagem do lead não leva CNPJ" reprova.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cnpj.ts src/lib/leadDoRepasse.ts tests/lead-do-repasse.test.ts
git commit -m "feat(repasse): o lead da lista e do exame, com a régua pura que a rota aplica

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A ação do captcha, o estado do carro e as mensagens de WhatsApp — Sonnet

**Files:**
- Modify: `src/lib/turnstile.ts` (`ACOES` e `ACOES_DE_LEADS`, ~linhas 210-240)
- Modify: `src/lib/repasse.ts` (`sufixoDoRepasse` e `slugDoRepasse`; `EstadoDoRepasse`, `estadoDoRepasse`)
- Modify: `src/lib/mensagensDoVeiculo.ts` (duas funções no fim)
- Test: `tests/mensagens-e-captcha-do-repasse.test.ts` (novo)

**Interfaces:**
- Consumes: `nomeComAno` (já importado em `mensagensDoVeiculo.ts`); `termosProibidosEm` (só no teste).
- Produces (usados pelas Tasks 7 a 11):
  - `ACOES.repasse = "repasse"`, e `ACOES.repasse` dentro de `ACOES_DE_LEADS`.
  - Em `src/lib/repasse.ts`: `sufixoDoRepasse(id: string): string`; `type EstadoDoRepasse = "aberto" | "lojistas" | "reservado" | "vendido"`; `estadoDoRepasse(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">): EstadoDoRepasse | null`.
  - Em `src/lib/mensagensDoVeiculo.ts`: `type EstadoDoRepasseNaMensagem = "aberto" | "reservado" | "vendido"`; `mensagemDoRepasse(r: Pick<Repasse, "id" | "marca" | "modelo" | "versao" | "ano_modelo">, estado: EstadoDoRepasseNaMensagem, ref?: string): string`; `mensagemDePerguntaDoRepasse(ref?: string): string`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/mensagens-e-captcha-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ACOES, ACOES_DE_LEADS } from "../src/lib/turnstile";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { mensagemDePerguntaDoRepasse, mensagemDoRepasse } from "../src/lib/mensagensDoVeiculo";
import { estadoDoRepasse, slugDoRepasse, sufixoDoRepasse } from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A metade "lib" do par de testes do captcha (molde `campanha-cta`): a ação
 * existe e a rota a aceita. A outra metade — cada formulário declara
 * `action={ACOES.repasse}` — nasce com os formulários (Task 9).
 */
describe("a ação do captcha existe dos dois lados", () => {
  it("`repasse` está em ACOES e é aceita por /api/leads", () => {
    // Esquecer a segunda metade não dá erro de compilação: o widget resolve, o
    // token viaja e o siteverify recusa pela action — 403 num formulário que
    // parece funcionar.
    expect(ACOES.repasse).toBe("repasse");
    expect([...ACOES_DE_LEADS]).toContain(ACOES.repasse);
  });
});

describe("a referência do carro", () => {
  it("o sufixo é o fim do slug — é por ele que o atendente acha o carro e a URL velha se acha", () => {
    const r = repasseDeTeste();
    expect(sufixoDoRepasse(r.id)).toBe("3f9a1c");
    expect(slugDoRepasse(r).endsWith(`-${sufixoDoRepasse(r.id)}`)).toBe(true);
  });
});

describe("o estado do carro na vitrine", () => {
  it("publicado se divide em aberto e só-lojistas; o resto não aparece", () => {
    expect(estadoDoRepasse({ situacao: "publicado", aberto_ao_publico_em: "2026-09-24T12:00:00Z" })).toBe("aberto");
    expect(estadoDoRepasse({ situacao: "publicado", aberto_ao_publico_em: null })).toBe("lojistas");
    expect(estadoDoRepasse({ situacao: "reservado", aberto_ao_publico_em: null })).toBe("reservado");
    expect(estadoDoRepasse({ situacao: "vendido", aberto_ao_publico_em: null })).toBe("vendido");
    for (const situacao of ["rascunho", "em_validacao", "arquivado"] as const) {
      expect(estadoDoRepasse({ situacao, aberto_ao_publico_em: null })).toBeNull();
    }
  });
});

describe("as mensagens de WhatsApp do repasse", () => {
  const r = repasseDeTeste();

  it("nomeiam o carro e levam a referência do atendente", () => {
    const m = mensagemDoRepasse(r, "aberto");
    expect(m).toContain("Renault Kwid Zen 1.0 2021");
    expect(m).toContain("Ref.: repasse 3f9a1c");
    expect(m).toMatch(/\?/);
  });

  it("reservado e vendido não prometem o carro", () => {
    expect(mensagemDoRepasse(r, "reservado")).toContain("reservado");
    expect(mensagemDoRepasse(r, "vendido")).toContain("vendido");
    expect(mensagemDoRepasse(r, "vendido")).not.toMatch(/disponível\?/);
  });

  it("o ref do rastreio vai no fim, como nas mensagens da ficha", () => {
    expect(mensagemDoRepasse(r, "aberto", " (ref: ag-1)").endsWith(" (ref: ag-1)")).toBe(true);
    expect(mensagemDePerguntaDoRepasse(" (ref: ag-1)").endsWith(" (ref: ag-1)")).toBe(true);
  });

  it("nenhuma usa termo que o repasse não usa", () => {
    for (const m of [
      mensagemDoRepasse(r, "aberto"),
      mensagemDoRepasse(r, "reservado"),
      mensagemDoRepasse(r, "vendido"),
      mensagemDePerguntaDoRepasse(),
    ]) {
      expect(termosProibidosEm(m), m).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/mensagens-e-captcha-do-repasse.test.ts`
Expected: FAIL — `ACOES.repasse` indefinido e as funções não existem.

- [ ] **Step 3: A ação do captcha**

Em `src/lib/turnstile.ts`:
1. Em `ACOES`, depois da linha `campanha: "campanha",`, acrescentar:
   ```ts
     /** A lista do repasse (duas trilhas) e o exame no pátio — spec 2026-09-24 §8 (2026-09-25). */
     repasse: "repasse",
   ```
2. Em `ACOES_DE_LEADS`, depois de `ACOES.campanha,`, acrescentar `ACOES.repasse,`.
3. No docblock de `ACOES_DE_LEADS`, trocar "`/api/leads` atende SETE superfícies" por "`/api/leads` atende OITO superfícies".

- [ ] **Step 4: O sufixo e o estado em `src/lib/repasse.ts`**

1. Trocar a função `slugDoRepasse` inteira por:
   ```ts
   /**
    * Os 6 primeiros do uuid, sem hífen: o fim do slug, a referência que o
    * atendente procura no painel ("Ref.: repasse 3f9a1c") e o que acha o carro
    * quando o slug muda (decisão 13 do PR 3).
    */
   export function sufixoDoRepasse(id: string): string {
     return id.replace(/-/g, "").slice(0, 6).toLowerCase();
   }

   /** `marca-modelo-versao-ano-xxxxxx`: legível e único pelos 6 primeiros do uuid. */
   export function slugDoRepasse(r: Pick<Repasse, "id" | "marca" | "modelo" | "versao" | "ano_modelo">): string {
     const base = slugificar([r.marca, r.modelo, r.versao ?? "", String(r.ano_modelo)].join(" "));
     return `${base}-${sufixoDoRepasse(r.id)}`;
   }
   ```
2. Depois de `soParaLojistas`, acrescentar:
   ```ts
   /**
    * Como o carro aparece no site: aberto a todos, só para lojistas (publicado
    * sem o switch), reservado ou vendido. `null` para o que não aparece
    * (rascunho, em validação, arquivado) — a página decide o 404.
    */
   export type EstadoDoRepasse = "aberto" | "lojistas" | "reservado" | "vendido";

   export function estadoDoRepasse(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">): EstadoDoRepasse | null {
     switch (r.situacao) {
       case "publicado":
         return r.aberto_ao_publico_em === null ? "lojistas" : "aberto";
       case "reservado":
         return "reservado";
       case "vendido":
         return "vendido";
       default:
         return null;
     }
   }
   ```

- [ ] **Step 5: As mensagens em `src/lib/mensagensDoVeiculo.ts`**

1. Trocar o import do topo por:
   ```ts
   import { nomeComAno, type VeiculoNomeavel } from "./nomeDoVeiculo";
   import { sufixoDoRepasse, type Repasse } from "./repasse";
   ```
2. No fim do arquivo, acrescentar:
   ```ts
   /**
    * O repasse (spec §8, decisão 2 do PR 3). A referência "Ref.: repasse
    * 3f9a1c" é o sufixo do slug: é por ela que o atendente acha o carro no
    * painel. `ref` é o sufixo de rastreio que as mensagens da ficha já levam
    * (vazio quando o link é montado no servidor).
    *
    * Só-lojistas não tem mensagem: a ficha dele troca o WhatsApp pela faixa
    * "Só para lojistas" (decisão 4).
    */
   export type EstadoDoRepasseNaMensagem = "aberto" | "reservado" | "vendido";

   export function mensagemDoRepasse(
     r: Pick<Repasse, "id" | "marca" | "modelo" | "versao" | "ano_modelo">,
     estado: EstadoDoRepasseNaMensagem,
     ref = "",
   ): string {
     const carro = nome({ marca: r.marca, modelo: r.modelo, versao: r.versao, ano: r.ano_modelo });
     const referencia = `Ref.: repasse ${sufixoDoRepasse(r.id)}`;
     if (estado === "vendido") {
       return `Olá! Vi no Repasse Motors o ${carro}, que já foi vendido. Quero saber dos próximos repasses. ${referencia}${ref}`;
     }
     if (estado === "reservado") {
       return `Olá! Vi no Repasse Motors o ${carro}, que está reservado. Se ele voltar, quero saber. ${referencia}${ref}`;
     }
     return `Olá! Vi no Repasse Motors o ${carro} e quero saber mais. Ele ainda está disponível? ${referencia}${ref}`;
   }

   /** O botão "PERGUNTAR NO WHATSAPP" das perguntas do repasse. */
   export function mensagemDePerguntaDoRepasse(ref = ""): string {
     return `Olá! Estou vendo o Repasse Motors no site e tenho uma dúvida.${ref}`;
   }
   ```

- [ ] **Step 6: Rodar o arquivo novo e os que já leem estes módulos**

Run: `npx vitest run tests/mensagens-e-captcha-do-repasse.test.ts tests/repasse.test.ts tests/mensagens-do-veiculo.test.ts tests/campanha-cta.test.ts tests/hub-vazio-tem-formulario.test.ts`
Expected: PASS.

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Tirar `ACOES.repasse,` de `ACOES_DE_LEADS` → "`repasse` está em ACOES e é aceita" reprova.
2. Em `sufixoDoRepasse`, trocar `.slice(0, 6)` por `.slice(-6)` → "o sufixo é o fim do slug" reprova (e `tests/repasse.test.ts` também).
3. Em `estadoDoRepasse`, trocar o `publicado` para devolver sempre `"aberto"` → o teste do estado reprova (o carro só-lojistas ganharia WhatsApp e exame).

- [ ] **Step 8: Commit**

```bash
git add src/lib/turnstile.ts src/lib/repasse.ts src/lib/mensagensDoVeiculo.ts tests/mensagens-e-captcha-do-repasse.test.ts
git commit -m "feat(repasse): ação de captcha, estado do carro na vitrine e as mensagens de WhatsApp

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Migração — as carrocerias da lista — Opus (o controlador ensaia)

**Files:**
- Create: `supabase/migrations/20260925120000_repasse_carrocerias_da_lista.sql`
- Test: `tests/migracao-do-repasse-carrocerias.test.ts` (novo)

**Interfaces:**
- Consumes: `repasse_inscritos` de `20260924180000_repasse_fundacao.sql` (coluna `carrocerias text[] not null default '{}'`, unique `(org_id, trilha, whatsapp)`); `CARROCERIAS_DO_REPASSE` (`src/lib/repasse.ts`); `CARROCERIAS_DA_LISTA` (Task 3).
- Produces: restrição `inscrito_carrocerias_da_lista` (`carrocerias <@ array['hatch','seda','suv','picape','outro']::text[]`). A rota da Task 6 grava contra ela.

- [ ] **Step 1: Escrever o teste que falha**

`tests/migracao-do-repasse-carrocerias.test.ts` (Write tool):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CARROCERIAS_DA_LISTA } from "../src/lib/leadDoRepasse";
import { CARROCERIAS_DO_REPASSE } from "../src/lib/repasse";

/**
 * A terceira migração do repasse: `repasse_inscritos.carrocerias` ganha o
 * CHECK que a revisão do PR 1 deixou anotado para quando o formulário
 * existisse (decisão 16 do PR 3). O ensaio no banco prova o comportamento;
 * este arquivo prova que o texto da migração concorda com o código.
 */
const ARQUIVO = join(__dirname, "..", "supabase", "migrations", "20260925120000_repasse_carrocerias_da_lista.sql");
const sql = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8").replace(/--[^\n]*/g, "") : "";

describe("migração: as carrocerias da lista", () => {
  it("o arquivo existe", () => {
    expect(existsSync(ARQUIVO)).toBe(true);
  });

  it("a restrição nomeada lista exatamente as carrocerias do carro", () => {
    const trecho = sql.match(
      /add\s+constraint\s+inscrito_carrocerias_da_lista\s+check\s*\(\s*carrocerias\s*<@\s*array\[([^\]]*)\]::text\[\]\s*\)/i,
    );
    expect(trecho, "não achei a restrição inscrito_carrocerias_da_lista").not.toBeNull();
    const valores = [...trecho![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(valores).toEqual([...CARROCERIAS_DO_REPASSE]);
  });

  it("o que o formulário oferece cabe na restrição", () => {
    for (const c of CARROCERIAS_DA_LISTA) expect([...CARROCERIAS_DO_REPASSE]).toContain(c);
  });

  it("o aceite confere a restrição PELO NOME e tem controle positivo", () => {
    expect(sql).toContain("ACEITE FALHOU");
    expect(sql).toMatch(/get\s+stacked\s+diagnostics\s+restricao\s*=\s*constraint_name/i);
    expect(sql).toMatch(/restricao\s*<>\s*'inscrito_carrocerias_da_lista'/);
    expect(sql).toMatch(/a lista legítima foi recusada/);
  });

  it("não mexe em mais nada", () => {
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\bcreate\s+policy\b/i);
    expect(sql).not.toMatch(/\b(grant|revoke)\b/i);
    expect(sql).not.toMatch(/\bdrop\s+column\b/i);
  });

  it("se registra no livro-razão", () => {
    expect(sql).toMatch(/values\s*\('20260925120000',\s*'repasse_carrocerias_da_lista'\)/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/migracao-do-repasse-carrocerias.test.ts`
Expected: FAIL em "o arquivo existe" (e nos demais).

- [ ] **Step 3: Escrever a migração**

`supabase/migrations/20260925120000_repasse_carrocerias_da_lista.sql`:

```sql
-- ============================================================================
-- Repasse Motors — as carrocerias da lista do repasse
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md, §4.2 e §8.
--
-- `repasse_inscritos.carrocerias` nasceu `text[]` sem CHECK
-- (20260924180000_repasse_fundacao.sql), e a revisão do PR 1 deixou isso
-- anotado para quando o formulário existisse. Ele existe agora (PR 3): a rota
-- de leads grava o que a pessoa marcou em "Tipo de carro". O painel casa o
-- inscrito com o carro por esta coluna (`inscritosQueCombinam`), e um valor
-- fora do vocabulário de `repasses.carroceria` nunca casaria com carro
-- nenhum: a pessoa ficaria na lista sem nunca ser avisada, e ninguém saberia.
--
-- A lista é a mesma de `repasses.carroceria` (CARROCERIAS_DO_REPASSE em
-- src/lib/repasse.ts; tests/migracao-do-repasse-carrocerias.test.ts confere).
-- O formulário oferece quatro (hatch, sedã, SUV, picape); "outro" entra para
-- a lista e a coluna do carro dizerem o mesmo. Vazio é "tanto faz" e passa.
--
-- A tabela só recebe linha pela rota de leads, que ganha o ramo do repasse
-- neste mesmo PR: em produção ela está vazia, e a restrição entra validada.
-- ============================================================================

alter table public.repasse_inscritos drop constraint if exists inscrito_carrocerias_da_lista;
alter table public.repasse_inscritos add constraint inscrito_carrocerias_da_lista
  check (carrocerias <@ array['hatch', 'seda', 'suv', 'picape', 'outro']::text[]);

-- ----------------------------------------------------------------------------
-- Autoconferência: cada violação recusada PELA RESTRIÇÃO CERTA, e a lista
-- legítima aceita.
-- ----------------------------------------------------------------------------
do $$
declare
  falhas     int := 0;
  restricao  text;
  controle   uuid;
begin
  -- 1. carroceria fora da lista
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-carrocerias-1', array['conversivel']);
    falhas := falhas + 1;
    raise notice 'fora da lista: passou';
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'inscrito_carrocerias_da_lista' then
      falhas := falhas + 1;
      raise notice 'fora da lista: esperava inscrito_carrocerias_da_lista, veio %', restricao;
    end if;
  end;

  -- 2. uma boa e uma ruim no mesmo array
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-carrocerias-2', array['hatch', 'van']);
    falhas := falhas + 1;
    raise notice 'array misto: passou';
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'inscrito_carrocerias_da_lista' then
      falhas := falhas + 1;
      raise notice 'array misto: esperava inscrito_carrocerias_da_lista, veio %', restricao;
    end if;
  end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram ou foram barradas pela restrição errada', falhas;
  end if;

  -- Controle positivo: as quatro do formulário e o "tanto faz" (vazio) entram.
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-carrocerias-3', array['hatch', 'seda', 'suv', 'picape'])
    returning id into controle;
    delete from public.repasse_inscritos where id = controle;

    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-carrocerias-4', '{}')
    returning id into controle;
    delete from public.repasse_inscritos where id = controle;
  exception when check_violation then
    raise exception 'ACEITE FALHOU: a lista legítima foi recusada (%)', sqlerrm;
  end;

  raise notice 'Repasse (carrocerias da lista) OK: fora da lista recusado pela restrição certa; as quatro do formulário e o vazio entram.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260925120000', 'repasse_carrocerias_da_lista')
  on conflict (version) do nothing;
```

- [ ] **Step 4: Rodar os testes de migração**

Run: `npx vitest run tests/migracao-do-repasse-carrocerias.test.ts tests/migracoes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (antes do ensaio, para o controlador rodar o arquivo versionado)**

```bash
git add supabase/migrations/20260925120000_repasse_carrocerias_da_lista.sql tests/migracao-do-repasse-carrocerias.test.ts
git commit -m "feat(repasse): migração que prende as carrocerias da lista ao vocabulário do carro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ensaio (roda o CONTROLADOR, não o subagente)**

```powershell
cd C:\Users\Lenovo\Documents\motors-claude\motors-site-oficial
node supabase/manutencao/aplicar-migracao.js ..\wt-repasse-site\supabase\migrations\20260925120000_repasse_carrocerias_da_lista.sql
```

Expected: `NOTICE … Repasse (carrocerias da lista) OK: fora da lista recusado pela restrição certa; as quatro do formulário e o vazio entram.` e `Ensaio OK (revertido): 20260925120000_repasse_carrocerias_da_lista.sql`. Se sair `FALHOU (revertida)`, ler o `ACEITE FALHOU` e os `NOTICE`, corrigir, repetir. **Não rodar com `--gravar`** (Task 14, com ordem do dono).

- [ ] **Step 7: Provar que o aceite reprova com o bug real (controlador)**

Duas sabotagens, cada uma numa cópia temporária; o arquivo versionado não muda:

```powershell
Copy-Item ..\wt-repasse-site\supabase\migrations\20260925120000_repasse_carrocerias_da_lista.sql $env:TEMP\sabotagem_carrocerias.sql
# S1: apagar as duas linhas "alter table … add constraint inscrito_carrocerias_da_lista … check (…);"
node supabase/manutencao/aplicar-migracao.js $env:TEMP\sabotagem_carrocerias.sql
```
Expected: `ACEITE FALHOU: 2 violação(ões) passaram…` e `FALHOU (revertida)`.

```powershell
Copy-Item ..\wt-repasse-site\supabase\migrations\20260925120000_repasse_carrocerias_da_lista.sql $env:TEMP\sabotagem_carrocerias.sql
# S2: tirar 'hatch', do array da restrição
node supabase/manutencao/aplicar-migracao.js $env:TEMP\sabotagem_carrocerias.sql
```
Expected: `ACEITE FALHOU: a lista legítima foi recusada (…)` e `FALHOU (revertida)`. Apagar a cópia. Anotar as duas saídas no ledger.

---

### Task 6: A rota de leads grava o repasse — Opus

**Files:**
- Create: `src/lib/repasseNaRotaDeLeads.ts`
- Modify: `src/app/api/leads/route.ts` (imports; bloco 2.5 novo; `mensagem` do n8n; bloco 5.2; bloco 5.3 novo)
- Modify: `tests/bancoDoRepasseDeTeste.ts` (registra os filtros das leituras em `consultas`)
- Modify: `tests/funil.test.ts` (os três canais novos na lista de canais de compra)
- Test: `tests/leads-do-repasse-na-rota.test.ts` (novo)

**Interfaces:**
- Consumes: `decidirLeadDoRepasse`, `decidirInscricao`, `ehCanalDoRepasse`, `mensagemDoExame`, `MENSAGEM_DA_INSCRICAO`, `InscricaoNaLista`, `CarroDoExame` (Task 3); `ERROS_DO_REPASSE` (Task 1); `registrarFalha` (`src/lib/observabilidade.ts:616`); `createAdminSupabaseClient` (`src/lib/supabase-server.ts`); a restrição da Task 5.
- Produces:
  - Em `src/lib/repasseNaRotaDeLeads.ts`: `type ConferenciaDoExame = { ok: true; carro: CarroDoExame & { id: string } } | { ok: false; status: 409 | 500; erro: string }`; `carroDoExame(admin: SupabaseClient, repasseId: string): Promise<ConferenciaDoExame>`; `gravarInscricao(admin: SupabaseClient, inscricao: InscricaoNaLista, leadId: string | null): Promise<{ ok: true } | { ok: false; detalhe: string }>`.
  - `POST /api/leads`, ramo do repasse: 400 `{ error }` com texto de `ERROS_DO_REPASSE` antes de gravar; 409 no exame de carro não publicado; lead com `repasse_id` no exame; `repasse_inscritos` depois do lead; 500 `{ error: ERROS_DO_REPASSE.lista }` se a inscrição não grava, antes da CAPI. Os outros canais seguem iguais.
  - No dublê: `banco.consultas: Array<{ tabela: string; filtros: Array<[string, unknown]> }>` (uma entrada por `from`, com os `eq`/`is` da leitura).

- [ ] **Step 1: O dublê passa a registrar os filtros das leituras**

Em `tests/bancoDoRepasseDeTeste.ts`:
1. Dentro de `bancoDeTeste()`, depois de `const lidas: string[] = [];`, acrescentar:
   ```ts
     /** Uma entrada por `from`, com os `eq`/`is` encadeados na LEITURA. */
     const consultas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];
   ```
2. Trocar a assinatura e o `encadeia` de `consulta`:
   ```ts
     function consulta(tabela: string, escrita: Escrita | null, leitura?: { filtros: Array<[string, unknown]> }) {
       const resolver = (): Resposta => (escrita ? responder(escrita) : (leituras[tabela] ?? { data: null, error: null }));
       const q: Record<string, unknown> = {};
       const encadeia =
         (nome: string) =>
         (...args: unknown[]) => {
           if (nome === "eq" || nome === "is") {
             const filtro: [string, unknown] = [String(args[0]), args[1]];
             if (escrita) escrita.filtros.push(filtro);
             else leitura?.filtros.push(filtro);
           }
           return q;
         };
       for (const nome of ["select", "eq", "is", "in", "order", "limit", "like"]) q[nome] = encadeia(nome);
       q.single = async () => resolver();
       q.maybeSingle = async () => resolver();
       q.then = (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, falha);
       return q;
     }
   ```
3. Em `from`, trocar `...consulta(tabela, null),` por:
   ```ts
       ...(() => {
         const leitura = { tabela, filtros: [] as Array<[string, unknown]> };
         consultas.push(leitura);
         return consulta(tabela, null, leitura);
       })(),
   ```
4. No objeto devolvido, depois de `lidas,`, acrescentar `consultas,`.

Run: `npx vitest run tests/rotas-do-repasse-cadastro.test.ts tests/rotas-do-repasse-situacao.test.ts tests/editor-do-repasse.test.ts tests/lista-do-repasse-no-painel.test.ts`
Expected: PASS (mudança só aditiva).

- [ ] **Step 2: Escrever os testes que falham**

`tests/leads-do-repasse-na-rota.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ERROS_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import { bancoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";

/**
 * `/api/leads` EXECUTADA contra um dublê do banco, no ramo do repasse (spec §8,
 * decisão 11 do PR 3). Prova a fiação que só a rota tem: a régua roda antes de
 * qualquer gravação e do n8n; o exame só entra para carro publicado; o lead
 * grava antes da inscrição, que o referencia; o texto livre do lead não leva o
 * perfil da lista; e a inscrição que falha volta 500 sem contar conversão.
 */
let banco: Banco;
const capi = vi.hoisted(() => ({ chamadas: [] as unknown[] }));
const falhas = vi.hoisted(() => ({ chamadas: [] as unknown[][] }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../src/lib/supabase-server", () => ({ createAdminSupabaseClient: () => banco.cliente }));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ webhooks: {}, companySettings: { metaPixelId: "px-1" } }),
}));
vi.mock("../src/lib/meta-capi", () => ({
  sendCapiEvent: async (evento: unknown) => {
    capi.chamadas.push(evento);
  },
}));
vi.mock("../src/lib/observabilidade", () => ({
  registrarFalha: async (...args: unknown[]) => {
    falhas.chamadas.push(args);
  },
}));
vi.mock("../src/lib/turnstile", async (original) => ({
  ...(await original<typeof import("../src/lib/turnstile")>()),
  verificarTurnstile: async () => ({ ok: true }),
}));

const { POST } = await import("../src/app/api/leads/route");

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const EXTRAS = { turnstileToken: "tok", eventId: "evt-1", agUid: "ag-1", utm: {}, fbp: null, fbc: null };
const CLIENTE = { nome: "Ana Souza", whatsapp: "(41) 99737-2165" };
const LISTA = {
  canal: "repasse",
  tipo: "lead_repasse",
  mensagem: "Entrou na lista do repasse (compra para usar).",
  cliente: CLIENTE,
  intencao_busca: {
    repasse: { tipo: "lista", trilha: "consumidor", faixa: "30-50", carrocerias: ["hatch"], caminho: "/repasse" },
  },
  contentName: "Repasse Motors Lista",
  ...EXTRAS,
};
const LOJISTA = {
  ...LISTA,
  canal: "repasse-lojista",
  mensagem: "Entrou na lista do repasse (lojista).",
  intencao_busca: {
    repasse: { tipo: "lista", trilha: "lojista", cnpj: "11.222.333/0001-81", loja_cidade: "Loja Exemplo, Curitiba", caminho: "/repasse" },
  },
};
const EXAME = {
  canal: "repasse-exame",
  tipo: "lead_repasse_exame",
  mensagem: "texto qualquer do navegador",
  cliente: CLIENTE,
  intencao_busca: {
    repasse: { tipo: "exame", repasse_id: ID, slug: "renault-kwid-zen-1-0-2021-3f9a1c", dia: "2026-09-26", turno: "tarde", leva_mecanico: true },
  },
  contentName: "Renault Kwid",
  ...EXTRAS,
};
const CARRO_PUBLICADO = { id: ID, situacao: "publicado", marca: "Renault", modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021 };

const pedido = (corpo: unknown) =>
  new NextRequest("http://teste/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
const insertDoLead = () => banco.escritasEm("leads")[0]?.valores as Record<string, unknown>;
let n8n: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T15:00:00Z")); // qua 23/09, 12h em Curitiba
  banco = bancoDeTeste();
  banco.responderEscrita((e) =>
    e.tabela === "leads" && e.operacao === "insert" ? { data: { id: "lead-1" }, error: null } : { data: null, error: null },
  );
  capi.chamadas = [];
  falhas.chamadas = [];
  n8n = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", n8n);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a lista do repasse", () => {
  it("consumidor: grava o lead e DEPOIS a inscrição, ligada a ele", async () => {
    const res = await POST(pedido(LISTA));
    expect(res.status).toBe(200);
    expect(insertDoLead()).toMatchObject({
      canal: "repasse",
      interesse: "Entrou na lista do repasse (compra para usar).",
      telefone: "5541997372165",
    });
    const [inscricao] = banco.escritasEm("repasse_inscritos");
    expect(inscricao.operacao).toBe("insert");
    expect(inscricao.valores).toEqual({
      trilha: "consumidor",
      nome: "Ana Souza",
      whatsapp: "5541997372165",
      faixa: "30-50",
      carrocerias: ["hatch"],
      cnpj: null,
      loja_cidade: null,
      lead_id: "lead-1",
    });
    expect(banco.lidas.indexOf("leads")).toBeLessThan(banco.lidas.indexOf("repasse_inscritos"));
    expect(banco.consultas.find((c) => c.tabela === "repasse_inscritos")?.filtros).toEqual([
      ["trilha", "consumidor"],
      ["whatsapp", "5541997372165"],
    ]);
    expect(capi.chamadas).toHaveLength(1);
  });

  it("o texto livre do lead não leva CNPJ nem a loja, mesmo que o navegador mande", async () => {
    await POST(pedido({ ...LOJISTA, mensagem: "CNPJ 11.222.333/0001-81, Loja Exemplo" }));
    const linha = JSON.stringify(insertDoLead());
    expect(linha).not.toContain("11.222.333");
    expect(linha).not.toContain("11222333");
    expect(linha).not.toContain("Loja Exemplo");
    expect(insertDoLead().interesse).toBe("Entrou na lista do repasse (lojista).");
  });

  it("lojista: a inscrição guarda o CNPJ formatado, a loja e a cidade", async () => {
    await POST(pedido({ ...LOJISTA, intencao_busca: { repasse: { ...LOJISTA.intencao_busca.repasse, cnpj: "11222333000181" } } }));
    expect(banco.escritasEm("repasse_inscritos")[0].valores).toMatchObject({
      trilha: "lojista",
      cnpj: "11.222.333/0001-81",
      loja_cidade: "Loja Exemplo, Curitiba",
      faixa: null,
      carrocerias: [],
    });
  });

  it("quem já está na lista é atualizado, e CNPJ trocado perde a conferência", async () => {
    banco.leituras.repasse_inscritos = { data: { id: "i-1", cnpj: "12.ABC.345/01DE-35" }, error: null };
    await POST(pedido(LOJISTA));
    const [update] = banco.escritasEm("repasse_inscritos");
    expect(update.operacao).toBe("update");
    expect(update.filtros).toEqual([["id", "i-1"]]);
    expect(update.valores).toMatchObject({
      cnpj: "11.222.333/0001-81",
      lead_id: "lead-1",
      cnpj_conferido_em: null,
      cnpj_conferido_por: null,
    });
  });

  it("mesmo CNPJ: a conferência fica", async () => {
    banco.leituras.repasse_inscritos = { data: { id: "i-1", cnpj: "11222333000181" }, error: null };
    await POST(pedido(LOJISTA));
    expect(banco.escritasEm("repasse_inscritos")[0].valores).not.toHaveProperty("cnpj_conferido_em");
  });

  it("inscrição que não grava: 500 com a mensagem da lista, falha na triagem e nenhuma conversão no servidor", async () => {
    banco.responderEscrita((e) =>
      e.tabela === "leads"
        ? { data: { id: "lead-1" }, error: null }
        : e.tabela === "repasse_inscritos"
          ? { data: null, error: { message: "falhou", code: "XX000" } }
          : { data: null, error: null },
    );
    const res = await POST(pedido(LISTA));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(ERROS_DO_REPASSE.lista);
    expect(falhas.chamadas[0]?.slice(0, 2)).toEqual(["quebra", "repasse-inscricao"]);
    expect(falhas.chamadas[0]?.[3]).toMatchObject({ rota: "/api/leads", origem: "servidor", lead_id: "lead-1" });
    expect(capi.chamadas).toEqual([]);
  });

  it("corpo torto: 400 antes de qualquer gravação e do n8n", async () => {
    const res = await POST(
      pedido({ ...LOJISTA, intencao_busca: { repasse: { ...LOJISTA.intencao_busca.repasse, cnpj: "11.222.333/0001-82" } } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(ERROS_DO_REPASSE.cnpj);
    expect(banco.escritas).toEqual([]);
    expect(n8n).not.toHaveBeenCalled();
  });

  it("canal que começa com repasse e não existe: 400", async () => {
    const res = await POST(pedido({ ...LISTA, canal: "repasse-vip" }));
    expect(res.status).toBe(400);
    expect(banco.escritas).toEqual([]);
  });
});

describe("o exame no pátio", () => {
  it("carro publicado: o lead leva repasse_id, e o interesse é o pedido montado no servidor", async () => {
    banco.leituras.repasses = { data: CARRO_PUBLICADO, error: null };
    const res = await POST(pedido(EXAME));
    expect(res.status).toBe(200);
    expect(insertDoLead()).toMatchObject({ canal: "repasse-exame", repasse_id: ID, veiculo_id: null });
    expect(insertDoLead().interesse).toBe(
      "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.",
    );
    expect(banco.consultas.find((c) => c.tabela === "repasses")?.filtros).toEqual([["id", ID]]);
    expect(banco.escritasEm("repasse_inscritos")).toEqual([]);
  });

  it.each([
    ["reservado", { data: { ...CARRO_PUBLICADO, situacao: "reservado" }, error: null }],
    ["vendido", { data: { ...CARRO_PUBLICADO, situacao: "vendido" }, error: null }],
    ["inexistente", { data: null, error: null }],
  ])("carro %s: 409 sem gravar nada e sem n8n", async (_caso, leitura) => {
    banco.leituras.repasses = leitura;
    const res = await POST(pedido(EXAME));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(ERROS_DO_REPASSE.exameFechado);
    expect(banco.escritas).toEqual([]);
    expect(n8n).not.toHaveBeenCalled();
  });

  it("domingo: 400 da régua, antes de ler o carro", async () => {
    const res = await POST(
      pedido({ ...EXAME, intencao_busca: { repasse: { ...EXAME.intencao_busca.repasse, dia: "2026-09-27" } } }),
    );
    expect(res.status).toBe(400);
    expect(banco.lidas).not.toContain("repasses");
  });
});

describe("os outros canais não mudam", () => {
  it("a encomenda grava sem repasse_id e sem tocar nas tabelas do repasse", async () => {
    const res = await POST(
      pedido({ canal: "Encomenda", tipo: "lead_encomenda", mensagem: "Olá! Procuro carro Toyota Corolla.", cliente: CLIENTE, ...EXTRAS }),
    );
    expect(res.status).toBe(200);
    expect(insertDoLead()).not.toHaveProperty("repasse_id");
    expect(insertDoLead().interesse).toBe("Olá! Procuro carro Toyota Corolla.");
    expect(banco.lidas).not.toContain("repasses");
    expect(banco.lidas).not.toContain("repasse_inscritos");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/leads-do-repasse-na-rota.test.ts`
Expected: FAIL — a rota ainda não conhece o repasse (sem inscrição, sem 409, sem `repasse_id`), e `repasseNaRotaDeLeads.ts` não existe.

- [ ] **Step 4: Escrever `src/lib/repasseNaRotaDeLeads.ts`**

```ts
/**
 * O que a rota de leads faz com o banco no ramo do repasse — só servidor.
 *
 * As regras (o pedido é válido? insere ou atualiza? o CNPJ trocou?) moram em
 * `leadDoRepasse.ts`, puras e testadas sem banco. Aqui fica só a conversa com
 * o Supabase, pela chave de serviço: `repasse_inscritos` não tem escrita para
 * ninguém além dela desde 20260924200000_repasse_escrita_pela_rota.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { decidirInscricao, type CarroDoExame, type InscricaoNaLista } from "./leadDoRepasse";
import { ERROS_DO_REPASSE } from "./paginaDoRepasse";

export type ConferenciaDoExame =
  | { ok: true; carro: CarroDoExame & { id: string } }
  | { ok: false; status: 409 | 500; erro: string };

/**
 * O exame só vale para carro publicado (decisão 4 do PR 3). Reservado,
 * vendido, arquivado ou id que não existe: 409 com a mensagem da ficha.
 */
export async function carroDoExame(admin: SupabaseClient, repasseId: string): Promise<ConferenciaDoExame> {
  const { data, error } = await admin
    .from("repasses")
    .select("id, situacao, marca, modelo, versao, ano_modelo")
    .eq("id", repasseId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, erro: ERROS_DO_REPASSE.conferencia };
  const linha = (data ?? null) as Record<string, unknown> | null;
  const marca = linha?.marca;
  const modelo = linha?.modelo;
  const anoModelo = Number(linha?.ano_modelo);
  if (!linha || linha.situacao !== "publicado" || typeof marca !== "string" || typeof modelo !== "string" || !Number.isFinite(anoModelo)) {
    return { ok: false, status: 409, erro: ERROS_DO_REPASSE.exameFechado };
  }
  return {
    ok: true,
    carro: {
      id: String(linha.id),
      marca,
      modelo,
      versao: typeof linha.versao === "string" ? linha.versao : null,
      ano_modelo: anoModelo,
    },
  };
}

/**
 * Lê por trilha + WhatsApp e insere ou atualiza (`decidirInscricao`). Duas
 * voltas: se outra inscrição do mesmo WhatsApp entrou entre a leitura e o
 * insert, a unique `(org_id, trilha, whatsapp)` recusa com 23505, e a segunda
 * volta lê a linha nova e atualiza. O `detalhe` vai para `registrarFalha`,
 * que mascara telefone e CNPJ antes de gravar.
 */
export async function gravarInscricao(
  admin: SupabaseClient,
  inscricao: InscricaoNaLista,
  leadId: string | null,
): Promise<{ ok: true } | { ok: false; detalhe: string }> {
  for (let volta = 0; volta < 2; volta++) {
    const { data, error } = await admin
      .from("repasse_inscritos")
      .select("id, cnpj")
      .eq("trilha", inscricao.trilha)
      .eq("whatsapp", inscricao.whatsapp)
      .maybeSingle();
    if (error) return { ok: false, detalhe: `${error.code ?? "sem-codigo"}: ${error.message}` };
    const linha = (data ?? null) as { id?: unknown; cnpj?: unknown } | null;
    const existente =
      linha && typeof linha.id === "string"
        ? { id: linha.id, cnpj: typeof linha.cnpj === "string" ? linha.cnpj : null }
        : null;
    const escrita = decidirInscricao(existente, inscricao, leadId);
    const { error: erroDaEscrita } =
      escrita.operacao === "insert"
        ? await admin.from("repasse_inscritos").insert(escrita.linha)
        : await admin.from("repasse_inscritos").update(escrita.colunas).eq("id", escrita.id);
    if (!erroDaEscrita) return { ok: true };
    if (erroDaEscrita.code !== "23505" || volta === 1) {
      return { ok: false, detalhe: `${erroDaEscrita.code ?? "sem-codigo"}: ${erroDaEscrita.message}` };
    }
  }
  return { ok: false, detalhe: "inscrição não gravada" };
}
```

- [ ] **Step 5: O ramo do repasse em `src/app/api/leads/route.ts`**

Cinco edições, com a ferramenta Edit. Nenhum `any` novo; os antigos ficam como estão.

1. **Imports.** Depois de `import { contextoDeMidiaDoLead } from "../../../lib/contextoDeMidia";`, acrescentar:
   ```ts
   import {
     MENSAGEM_DA_INSCRICAO,
     decidirLeadDoRepasse,
     ehCanalDoRepasse,
     mensagemDoExame,
     type InscricaoNaLista,
   } from "../../../lib/leadDoRepasse";
   import { registrarFalha } from "../../../lib/observabilidade";
   import { ERROS_DO_REPASSE } from "../../../lib/paginaDoRepasse";
   import { carroDoExame, gravarInscricao } from "../../../lib/repasseNaRotaDeLeads";
   ```

2. **Bloco 2.5.** Logo depois do bloco
   ```ts
       if (!cliente || !cliente.nome) {
         return NextResponse.json({ error: "Dados de contato do cliente ausentes (nome obrigatório)." }, { status: 400 });
       }
   ```
   acrescentar:
   ```ts

       // 2.5 Repasse (spec 2026-09-24 §8) — a lista e o exame no pátio.
       //
       // Aditivo: só entra quando o canal começa com "repasse", e nenhum campo
       // dos outros canais muda de sentido. A régua é pura
       // (`decidirLeadDoRepasse`, testada sem rota) e roda ANTES de qualquer
       // gravação e do n8n: corpo torto volta 400 sem deixar lead pela metade.
       //
       // A mensagem do lead sai daqui, e não do corpo: `leads` é lida por toda
       // a equipe, e CNPJ, faixa e tipos de carro ficam só em
       // `repasse_inscritos`, que só quem valida lê. Um navegador que mandasse
       // o CNPJ na `mensagem` não o levaria ao Kanban.
       let mensagemDoLead: unknown = body.mensagem;
       let repasseIdDoLead: string | null = null;
       let inscricaoDoRepasse: InscricaoNaLista | null = null;
       if (ehCanalDoRepasse(body.canal)) {
         const decisao = decidirLeadDoRepasse(body, new Date());
         if (!decisao.ok) {
           return NextResponse.json({ error: decisao.erro }, { status: 400 });
         }
         if (decisao.pedido.tipo === "lista") {
           inscricaoDoRepasse = decisao.pedido.inscricao;
           mensagemDoLead = MENSAGEM_DA_INSCRICAO[inscricaoDoRepasse.trilha];
         } else {
           // O exame só vale para carro publicado: reservado, vendido ou
           // arquivado não recebe pedido de horário, e o 409 diz isso.
           const conferido = await carroDoExame(createAdminSupabaseClient(), decisao.pedido.exame.repasseId);
           if (!conferido.ok) {
             return NextResponse.json({ error: conferido.erro }, { status: conferido.status });
           }
           repasseIdDoLead = conferido.carro.id;
           mensagemDoLead = mensagemDoExame(conferido.carro, decisao.pedido.exame);
         }
       }
   ```

3. **A mensagem do n8n.** No `n8nPayload`, trocar `mensagem: body.mensagem || "",` por `mensagem: mensagemDoLead || "",`.

4. **Bloco 5.2.**
   - Trocar
     ```ts
         // perder o registro é ruim, travar o contato é pior.
         try {
     ```
     por
     ```ts
         // perder o registro é ruim, travar o contato é pior.
         let idDoLead: string | null = null;
         try {
     ```
   - Em `interesseDoLead({ … })`, trocar `mensagem: body.mensagem,` por `mensagem: mensagemDoLead,`.
   - Trocar `const { error: erroLead } = await supabaseAdmin.from("leads").insert({` por `const insercao = supabaseAdmin.from("leads").insert({`.
   - Trocar
     ```ts
             ...contextoDeMidiaDoLead(body),
           });

           if (erroLead) {
             console.warn("[Leads API] Falha ao gravar lead (não bloqueante):", erroLead.message);
           }
     ```
     por
     ```ts
             ...contextoDeMidiaDoLead(body),
             // O exame no pátio liga o lead ao carro de repasse (spec §4.4): é
             // por esta coluna que o pedido aparece no editor do carro. Só o
             // exame a preenche; nos outros canais a chave nem entra.
             ...(repasseIdDoLead ? { repasse_id: repasseIdDoLead } : {}),
           });
           // `.select("id")` separado do insert, por uma variável: a lista do
           // repasse guarda o elo com o lead (`repasse_inscritos.lead_id`), e o
           // texto `.from("leads").insert({ … });` fica inteiro para as travas
           // de `pre-voo-das-conversoes` e `leads-insert-destravado`.
           const { data: leadGravado, error: erroLead } = await insercao.select("id").maybeSingle();

           if (erroLead) {
             console.warn("[Leads API] Falha ao gravar lead (não bloqueante):", erroLead.message);
           } else {
             const idGravado = (leadGravado as { id?: unknown } | null)?.id;
             idDoLead = typeof idGravado === "string" ? idGravado : null;
           }
     ```

5. **Bloco 5.3.** Logo depois do fechamento do `catch` do 5.2:
   ```ts
       } catch (erroPersistencia: any) {
         console.warn("[Leads API] Erro ao gravar lead (não bloqueante):", erroPersistencia?.message);
       }
   ```
   acrescentar (sem tocar no `any` antigo):
   ```ts

       // 5.3 Lista do repasse — a ÚNICA gravação desta rota que bloqueia.
       //
       // O resto é não bloqueante porque o visitante está a caminho do
       // WhatsApp. Quem entra na lista do repasse não está: a confirmação que
       // ele lê diz "você está na lista", e isso só é verdade se a linha
       // existir — é o produto do formulário. Falhou, ele vê o erro e tenta de
       // novo; a falha vai para a triagem; e a conversão NÃO é contada, nem
       // aqui (o return vem antes da CAPI) nem no navegador (que só mede
       // depois do 2xx).
       //
       // Depois do lead, e não antes: `lead_id` é o elo que o painel usa.
       if (inscricaoDoRepasse) {
         const gravado = await gravarInscricao(createAdminSupabaseClient(), inscricaoDoRepasse, idDoLead);
         if (!gravado.ok) {
           await registrarFalha("quebra", "repasse-inscricao", gravado.detalhe, {
             rota: "/api/leads",
             origem: "servidor",
             ...(idDoLead ? { lead_id: idDoLead } : {}),
           });
           return NextResponse.json({ error: ERROS_DO_REPASSE.lista }, { status: 500 });
         }
       }
   ```

- [ ] **Step 6: Os canais novos no inventário do funil**

Em `tests/funil.test.ts`, no bloco "Os canais que o site REALMENTE escreve hoje":
1. No comentário, depois da linha ` *   api/leads/route.ts ........... "N/A" e "site", os dois fallbacks`, acrescentar:
   ```ts
    *   repasse (lista e exame) ...... "repasse", "repasse-lojista", "repasse-exame"
   ```
2. Em `CANAIS_DE_COMPRA`, depois de `"site",`, acrescentar `"repasse", "repasse-lojista", "repasse-exame",`.

- [ ] **Step 7: Rodar o arquivo novo e todos os que leem a rota**

Run: `npx vitest run tests/leads-do-repasse-na-rota.test.ts tests/pre-voo-das-conversoes.test.ts tests/leads-insert-destravado.test.ts tests/encomenda-grava-e-dispara.test.ts tests/campanha-cta.test.ts tests/whatsapp-numero-unico.test.ts tests/brechas-de-mensuracao.test.ts tests/capi-correspondencia.test.ts tests/interesse-do-lead.test.ts tests/funil.test.ts`
Expected: PASS.

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez; `npx vitest run tests/leads-do-repasse-na-rota.test.ts`; ver reprovar; desfazer:
1. Mover o bloco 5.3 inteiro para ANTES do `try` do 5.2 → "consumidor: grava o lead e DEPOIS a inscrição" reprova (`lead_id` nulo e a ordem das tabelas).
2. Apagar o `if (!conferido.ok) { return … }` do 2.5 → os três casos "carro … : 409" reprovam (o lead do exame gravaria para carro vendido).
3. Em `interesseDoLead({ … })`, voltar `mensagem: mensagemDoLead,` para `mensagem: body.mensagem,` → "o texto livre do lead não leva CNPJ" reprova.
4. Mover o bloco 5.3 para depois do bloco "5.5 Meta CAPI" → "inscrição que não grava: … nenhuma conversão no servidor" reprova.
5. No dublê, apagar `else leitura?.filtros.push(filtro);` → o `toEqual` dos filtros de `repasse_inscritos` reprova (prova que a asserção lê o dublê de verdade).

- [ ] **Step 9: Commit**

```bash
git add src/lib/repasseNaRotaDeLeads.ts src/app/api/leads/route.ts tests/bancoDoRepasseDeTeste.ts tests/leads-do-repasse-na-rota.test.ts tests/funil.test.ts
git commit -m "feat(repasse): a rota de leads grava a lista e o exame no pátio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Leitura, parecidos e grafo — Sonnet

**Files:**
- Modify: `src/lib/leituraDosRepasses.ts` (`lerRepassesPublicos` avisa a linha malformada; `lerRepassePorSufixo` nova)
- Modify: `tests/leitura-dos-repasses.test.ts` (mock de `observabilidade`, para o arquivo antigo seguir hermético)
- Modify: `src/lib/similares.ts` (núcleo `vizinhosPorPreco` exportado; `TIPO_NO_FEED`; `parecidosDoRepasse`)
- Create: `src/lib/grafoDoRepasse.ts`
- Test: `tests/leitura-dos-repasses-no-site.test.ts`, `tests/parecidos-do-repasse.test.ts`, `tests/grafo-do-repasse.test.ts` (novos)

**Interfaces:**
- Consumes: `repasseDaLinha`, `SELECAO` (privado), `aparecePublicamente`, `contaDoRepasse`, `estadoDoRepasse` (Task 4), `CarroceriaDoRepasse`, `Repasse`; `registrarFalha`; `disponiveisDe`, `precoVigente` (`src/lib/regrasEstoque.ts`); `nomeComAno`; `REFERENCIA_DA_LOJA`, `schemaDaLoja`, `schemaDoSite` (`src/lib/schemaLoja.ts`); `schemaDePerguntas`, `schemaDeTrilha`, `DegrauDaTrilha`, `PerguntaDeSchema` (`src/lib/schemaListagem.ts`); `galeriaDoSchema`, `precoValidoAte`, `transmissaoDoSchema` (`src/lib/schemaVeiculo.ts`); `SITE_URL`; `CAMINHO_DO_REPASSE`, `TITULO_DO_REPASSE` (Task 1).
- Produces (usados pelas Tasks 10 a 12):
  - `lerRepassesPublicos(agora?: Date, rota?: string): Promise<Repasse[]>` (o segundo parâmetro é novo, padrão `"/repasse"`); `lerRepassePorSufixo(sufixo: string): Promise<Repasse[]>` (no máximo 2).
  - Em `src/lib/similares.ts`: `interface ReferenciaDosParecidos { id: string | null; preco: number; tipo: string; moto: boolean }`; `vizinhosPorPreco(ref, estoque: Veiculo[], limite?: number): Veiculo[]`; `TIPO_NO_FEED: Record<CarroceriaDoRepasse, string>`; `parecidosDoRepasse(r: Pick<Repasse, "preco" | "fipe_valor" | "itens_de_estado" | "carroceria">, estoque: Veiculo[], limite?: number): Veiculo[]`. `escolherSimilares` não muda de assinatura nem de resultado.
  - Em `src/lib/grafoDoRepasse.ts`: `disponibilidadeDoRepasse(r): string`; `schemaDoRepasse(r: Repasse, caminho: string)`; `grafoDoRepasse({ repasse, caminho, trilha, empresa, disponiveis }): unknown[]`; `schemaDosRepassesAbertos(repasses: Repasse[])`; `grafoDaPaginaDoRepasse({ repasses, perguntas, trilha, empresa, disponiveis }): unknown[]`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/leitura-dos-repasses-no-site.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { lerRepassePorSufixo, lerRepassesPublicos } from "../src/lib/leituraDosRepasses";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * As duas coisas que o site pede à leitura do PR 1: avisar a linha que o
 * código recusa (decisão 15 do PR 3) e achar o carro pelo sufixo do slug
 * quando o slug mudou (decisão 13).
 */
const estado = vi.hoisted(() => ({
  resultado: { data: null as unknown, error: null as unknown },
  chamadas: [] as Array<[string, unknown[]]>,
}));

vi.mock("../src/lib/supabase", () => ({
  get supabase() {
    const q: Record<string, unknown> = {};
    for (const nome of ["from", "select", "in", "eq", "like", "order", "limit"]) {
      q[nome] = (...args: unknown[]) => {
        estado.chamadas.push([nome, args]);
        return q;
      };
    }
    q.maybeSingle = async () => estado.resultado;
    q.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(estado.resultado).then(ok, falha);
    return q;
  },
}));

const falhas = vi.hoisted(() => ({ chamadas: [] as unknown[][] }));
vi.mock("../src/lib/observabilidade", () => ({
  registrarFalha: async (...args: unknown[]) => {
    falhas.chamadas.push(args);
  },
}));

beforeEach(() => {
  estado.resultado = { data: null, error: null };
  estado.chamadas = [];
  falhas.chamadas = [];
});

const linhaPublica = (parcial: Record<string, unknown> = {}) => {
  const linha: Record<string, unknown> = {
    ...repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z" }),
    ...parcial,
  };
  delete linha.arquivado_em;
  return linha;
};

describe("lerRepassesPublicos avisa a linha que o código recusa", () => {
  it("a linha malformada some da vitrine E vai para a triagem, com o id e a rota", async () => {
    estado.resultado = { data: [linhaPublica({ id: "x-1", preco: null }), linhaPublica({ slug: "bom" })], error: null };
    const repasses = await lerRepassesPublicos(new Date("2026-09-24T12:00:00Z"), "/sitemap.xml");
    expect(repasses.map((r) => r.slug)).toEqual(["bom"]);
    expect(falhas.chamadas).toEqual([
      ["quebra", "repasse-linha-malformada", { id: "x-1" }, { rota: "/sitemap.xml", origem: "servidor" }],
    ]);
  });

  it("linha boa não gera aviso", async () => {
    estado.resultado = { data: [linhaPublica()], error: null };
    await lerRepassesPublicos(new Date("2026-09-24T12:00:00Z"));
    expect(falhas.chamadas).toEqual([]);
  });
});

describe("lerRepassePorSufixo", () => {
  it("procura o slug que termina no sufixo, e pede só dois", async () => {
    estado.resultado = { data: [linhaPublica()], error: null };
    const achados = await lerRepassePorSufixo("3f9a1c");
    expect(achados.map((r) => r.slug)).toEqual(["renault-kwid-zen-1-0-2021-3f9a1c"]);
    expect(estado.chamadas).toContainEqual(["like", ["slug", "%-3f9a1c"]]);
    expect(estado.chamadas).toContainEqual(["limit", [2]]);
  });

  it("sufixo que não é o de um uuid nem chega ao banco", async () => {
    for (const sufixo of ["../x", "3F9A1C", "3f9a1", "zzzzzz", ""]) {
      expect(await lerRepassePorSufixo(sufixo)).toEqual([]);
    }
    expect(estado.chamadas).toEqual([]);
  });

  it("erro do banco lança, como a leitura por slug", async () => {
    estado.resultado = { data: null, error: { message: "boom" } };
    await expect(lerRepassePorSufixo("3f9a1c")).rejects.toThrow(/boom/);
  });
});
```

`tests/parecidos-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { escolherSimilares, parecidosDoRepasse, vizinhosPorPreco } from "../src/lib/similares";
import type { Veiculo } from "../src/types";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * Os três carros do estoque com garantia na ficha do repasse (spec §7.2). A
 * régua é a de `escolherSimilares`, extraída para aceitar uma referência que
 * não é carro do estoque; o preço de referência é a FIPE, porque o carro com
 * garantia do mesmo porte custa perto dela (decisão 22 do plano do PR 3).
 */
function veiculo(parcial: Partial<Veiculo> & { id: string; preco_original: number }): Veiculo {
  return {
    marca: "",
    modelo: "",
    versao: "",
    ano: 2020,
    quilometragem: 0,
    cambio: "",
    combustivel: "",
    cor: "",
    placa: "",
    fipe: "",
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

const ESTOQUE: Veiculo[] = [
  veiculo({ id: "kwid-intense", preco_original: 54900, tipo: "Hatch" }),
  veiculo({ id: "mobi", preco_original: 51900, tipo: "Hatch" }),
  veiculo({ id: "up", preco_original: 49900, tipo: "Hatch" }),
  veiculo({ id: "onix-sedan", preco_original: 45900, tipo: "Sedan" }),
  veiculo({ id: "hb20-vendido", preco_original: 43900, tipo: "Hatch", vendido: true }),
  veiculo({ id: "moto", preco_original: 42000, tipo: "Motocicleta" }),
  veiculo({ id: "caro", preco_original: 89900, tipo: "Hatch" }),
  veiculo({ id: "gol", preco_original: 47000, tipo: "Hatch" }),
];

describe("parecidosDoRepasse", () => {
  it("mede pela FIPE, e não pelo preço à vista", () => {
    // Kwid de teste: R$ 36.900 à vista, FIPE R$ 42.100 → banda 29.470–58.940.
    // Pelo preço à vista (25.830–51.660) o Kwid Intense de R$ 54.900 cairia fora.
    expect(parecidosDoRepasse(repasseDeTeste(), ESTOQUE, 10).map((v) => v.id)).toContain("kwid-intense");
    expect(parecidosDoRepasse(repasseDeTeste(), ESTOQUE)).toHaveLength(3);
  });

  it("não traz vendido, moto nem o que está fora da banda", () => {
    const ids = parecidosDoRepasse(repasseDeTeste(), ESTOQUE, 10).map((v) => v.id);
    expect(ids).not.toContain("hb20-vendido");
    expect(ids).not.toContain("moto");
    expect(ids).not.toContain("caro");
  });

  it("sem FIPE, mede pelo que você gasta", () => {
    const semFipe = repasseDeTeste({ fipe_valor: null });
    // Você gasta = 36.900 + 2.020 = 38.920 → banda 27.244–54.488: o Kwid Intense sai.
    expect(parecidosDoRepasse(semFipe, ESTOQUE, 10).map((v) => v.id)).not.toContain("kwid-intense");
  });

  it("a mesma carroceria pesa, no vocabulário do feed", () => {
    // Gol (Hatch, R$ 47.000) fica 11,6% da FIPE; Onix (Sedan, R$ 45.900), 9,0%.
    // O bônus de 8% põe o Gol na frente para o hatch e o Onix para o sedã.
    expect(parecidosDoRepasse(repasseDeTeste(), ESTOQUE, 1).map((v) => v.id)).toEqual(["gol"]);
    expect(parecidosDoRepasse(repasseDeTeste({ carroceria: "seda" }), ESTOQUE, 1).map((v) => v.id)).toEqual(["onix-sedan"]);
    expect(parecidosDoRepasse(repasseDeTeste({ carroceria: "outro" }), ESTOQUE, 1).map((v) => v.id)).toEqual(["onix-sedan"]);
  });
});

describe("o núcleo extraído não mudou a ficha do estoque", () => {
  it("escolherSimilares é vizinhosPorPreco com o próprio carro de referência", () => {
    const atual = ESTOQUE[1];
    expect(escolherSimilares(atual, ESTOQUE)).toEqual(
      vizinhosPorPreco({ id: atual.id, preco: 51900, tipo: "Hatch", moto: false }, ESTOQUE),
    );
    expect(escolherSimilares(atual, ESTOQUE).map((v) => v.id)).not.toContain(atual.id);
  });
});
```

`tests/grafo-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CompanySettings } from "../src/types";
import { disponibilidadeDoRepasse, grafoDaPaginaDoRepasse, grafoDoRepasse } from "../src/lib/grafoDoRepasse";
import { PERGUNTAS_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import { ID_DA_LOJA } from "../src/lib/schemaLoja";
import { SITE_URL } from "../src/lib/site";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * Os nós de JSON-LD do repasse, pela função (decisão 17 do PR 3). As rotas
 * são contadas nas Tasks 10 e 11, no molde de `ficha-publica-o-grafo`.
 */
const EMPRESA = { name: "Motors Store", whatsappRaw: "5541997372165", address: "" } as CompanySettings;
const TRILHA = [
  { nome: "Início", caminho: "/" },
  { nome: "Repasse", caminho: "/repasse" },
];
const ABERTO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ id: "bbbbbbbb-0000-4000-8000-000000000002", slug: "fiat-argo-2019-bbbbbb", situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z" });
const RESERVADO = repasseDeTeste({ id: "cccccccc-0000-4000-8000-000000000003", slug: "vw-gol-2015-cccccc", situacao: "reservado", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-20T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z" });
const VENDIDO = repasseDeTeste({ id: "dddddddd-0000-4000-8000-000000000004", slug: "ford-ka-2018-dddddd", situacao: "vendido", lojistas_desde: "2026-09-15T12:00:00Z", aberto_ao_publico_em: "2026-09-15T12:00:00Z", vendido_em: "2026-09-20T12:00:00Z" });

const tipos = (nos: unknown[]) => nos.map((n) => (n as { "@type": string })["@type"]);
const carroDe = (nos: unknown[]) => nos[0] as Record<string, Record<string, unknown>>;

describe("a ficha do repasse", () => {
  const nos = grafoDoRepasse({ repasse: ABERTO, caminho: `/repasse/${ABERTO.slug}`, trilha: TRILHA, empresa: EMPRESA, disponiveis: [] });

  it("Car, BreadcrumbList, AutoDealer e WebSite", () => {
    expect(tipos(nos)).toEqual(["Car", "BreadcrumbList", "AutoDealer", "WebSite"]);
  });

  it("a oferta é da loja, em reais, usada, e aponta para o #dealer emitido", () => {
    const carro = carroDe(nos);
    expect(carro.offers).toMatchObject({
      "@type": "Offer",
      price: "36900.00",
      priceCurrency: "BRL",
      itemCondition: "https://schema.org/UsedCondition",
      availability: "https://schema.org/InStock",
      seller: { "@id": ID_DA_LOJA },
      availableAtOrFrom: { "@id": ID_DA_LOJA },
    });
    expect((nos[2] as { "@id": string })["@id"]).toBe(ID_DA_LOJA);
  });

  it("o carro se chama pelo nome da casa e mora na URL da ficha", () => {
    const carro = nos[0] as Record<string, unknown>;
    expect(carro.name).toBe("Renault Kwid Zen 1.0 2021");
    expect(carro["@id"]).toBe(`${SITE_URL}/repasse/${ABERTO.slug}#car`);
    expect(carro.bodyType).toBe("Hatch");
    // O id do repasse não existe no catálogo da Meta: sem sku/mpn (spec §8).
    expect(carro).not.toHaveProperty("sku");
  });

  it("a disponibilidade diz o estado", () => {
    expect(disponibilidadeDoRepasse(ABERTO)).toBe("https://schema.org/InStock");
    expect(disponibilidadeDoRepasse(LOJISTAS)).toBe("https://schema.org/LimitedAvailability");
    expect(disponibilidadeDoRepasse(RESERVADO)).toBe("https://schema.org/LimitedAvailability");
    expect(disponibilidadeDoRepasse(VENDIDO)).toBe("https://schema.org/SoldOut");
  });
});

describe("a página /repasse", () => {
  it("com carro aberto: Breadcrumb, ItemList só dos abertos, FAQ, AutoDealer, WebSite", () => {
    const nos = grafoDaPaginaDoRepasse({
      repasses: [ABERTO, LOJISTAS, RESERVADO, VENDIDO],
      perguntas: PERGUNTAS_DO_REPASSE,
      trilha: TRILHA,
      empresa: EMPRESA,
      disponiveis: [],
    });
    expect(tipos(nos)).toEqual(["BreadcrumbList", "ItemList", "FAQPage", "AutoDealer", "WebSite"]);
    const lista = nos[1] as { itemListElement: Array<{ url: string }> };
    expect(lista.itemListElement.map((i) => i.url)).toEqual([`${SITE_URL}/repasse/${ABERTO.slug}`]);
    expect((nos[2] as { mainEntity: unknown[] }).mainEntity).toHaveLength(10);
  });

  it("sem carro aberto, sem ItemList", () => {
    const nos = grafoDaPaginaDoRepasse({
      repasses: [LOJISTAS, VENDIDO],
      perguntas: PERGUNTAS_DO_REPASSE,
      trilha: TRILHA,
      empresa: EMPRESA,
      disponiveis: [],
    });
    expect(tipos(nos)).toEqual(["BreadcrumbList", "FAQPage", "AutoDealer", "WebSite"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/leitura-dos-repasses-no-site.test.ts tests/parecidos-do-repasse.test.ts tests/grafo-do-repasse.test.ts`
Expected: FAIL — `lerRepassePorSufixo`, `vizinhosPorPreco`, `parecidosDoRepasse` e `grafoDoRepasse.ts` não existem, e a linha malformada não gera aviso.

- [ ] **Step 3: A leitura**

Em `src/lib/leituraDosRepasses.ts`:
1. Depois de `import { supabase } from "./supabase";`, acrescentar:
   ```ts
   import { registrarFalha } from "./observabilidade";
   ```
2. Trocar `lerRepassesPublicos` inteira por:
   ```ts
   /**
    * `rota` só identifica quem leu, para o aviso da linha malformada: a mesma
    * leitura serve `/repasse`, a ficha (`generateStaticParams`) e o sitemap.
    */
   export async function lerRepassesPublicos(agora: Date = new Date(), rota = "/repasse"): Promise<Repasse[]> {
     if (!supabase) return [];
     const { data, error } = await supabase
       .from("repasses")
       .select(SELECAO)
       .in("situacao", [...SITUACOES_PUBLICAS])
       .order("created_at", { ascending: false });
     if (error) throw new Error(`Leitura dos repasses falhou: ${error.message}`);
     // SELECAO é construída em tempo de execução, então supabase-js não infere o tipo da linha
     return (data ?? []).flatMap((linha) => {
       const bruta = linha as unknown as Record<string, unknown>;
       const r = repasseDaLinha(bruta);
       if (!r) {
         // Linha que o banco entrega e o código não entende (preço nulo,
         // situação nova no enum…) sumia da vitrine em silêncio. Agora some E
         // avisa (decisão 15 do PR 3). `registrarFalha` não lança nem bloqueia.
         void registrarFalha("quebra", "repasse-linha-malformada", { id: bruta.id ?? null }, { rota, origem: "servidor" });
         return [];
       }
       return aparecePublicamente(r, agora) ? [r] : [];
     });
   }
   ```
3. No fim do arquivo, acrescentar:
   ```ts
   /**
    * Os carros cujo slug termina no sufixo pedido (decisão 13 do PR 3): o slug
    * muda quando alguém corrige marca, modelo ou ano, e o sufixo — os 6
    * primeiros do uuid — não. A ficha pede no máximo dois e só redireciona
    * quando acha exatamente um. Sufixo que não tem forma de uuid nem chega ao
    * banco.
    */
   export async function lerRepassePorSufixo(sufixo: string): Promise<Repasse[]> {
     if (!supabase || !/^[0-9a-f]{6}$/.test(sufixo)) return [];
     const { data, error } = await supabase.from("repasses").select(SELECAO).like("slug", `%-${sufixo}`).limit(2);
     if (error) throw new Error(`Leitura do repasse pelo sufixo ${sufixo} falhou: ${error.message}`);
     return (data ?? []).flatMap((linha) => {
       const r = repasseDaLinha(linha as unknown as Record<string, unknown>);
       return r ? [r] : [];
     });
   }
   ```

Em `tests/leitura-dos-repasses.test.ts`, depois do `vi.mock("../src/lib/supabase", …)`, acrescentar (o arquivo antigo tem um caso com linha malformada, que agora chama a triagem):
```ts
vi.mock("../src/lib/observabilidade", () => ({ registrarFalha: async () => {} }));
```

- [ ] **Step 4: O núcleo dos parecidos**

Em `src/lib/similares.ts`:
1. Trocar o import do topo por:
   ```ts
   import type { Veiculo } from "../types";
   import { contaDoRepasse, type CarroceriaDoRepasse, type Repasse } from "./repasse";
   import { disponiveisDe, precoVigente } from "./regrasEstoque";
   ```
2. Trocar `mesmaCarroceria` por:
   ```ts
   function mesmaCarroceria(tipo: string, v: Veiculo): boolean {
     const ta = tipo.trim().toLowerCase();
     const tb = (v.tipo || "").trim().toLowerCase();
     return ta.length > 0 && ta === tb;
   }
   ```
3. Trocar `escolherSimilares` inteira (docblock incluso) por:
   ```ts
   /**
    * A referência de uma vizinhança: um preço, uma carroceria no vocabulário do
    * feed ("Hatch", "SUV"…; "" quando não se sabe) e se é moto. `id` tira a
    * própria ficha da lista; é `null` quando a página não é do estoque (o
    * repasse).
    */
   export interface ReferenciaDosParecidos {
     id: string | null;
     preco: number;
     tipo: string;
     moto: boolean;
   }

   /**
    * Os `limite` veículos do estoque mais próximos da referência — o núcleo
    * de `escolherSimilares`, extraído em 25/09 para a ficha do repasse usar a
    * mesma régua sem ser um `Veiculo`.
    *
    * Devolve menos que `limite` — inclusive nenhum — quando não há candidato
    * dentro da banda. A seção some da página nesse caso, que é melhor que
    * completar a grade com vizinho ruim.
    */
   export function vizinhosPorPreco(ref: ReferenciaDosParecidos, estoque: Veiculo[], limite = 3): Veiculo[] {
     const precoBase = ref.preco;
     if (!(precoBase > 0)) return [];

     const piso = precoBase * PISO_DA_BANDA;
     const teto = precoBase * TETO_DA_BANDA;

     return disponiveisDe(estoque)
       .filter((v) => {
         if (ref.id !== null && v.id === ref.id) return false;
         if (ehMotocicleta(v) !== ref.moto) return false;
         const preco = precoVigente(v);
         return preco >= piso && preco <= teto;
       })
       .map((v) => {
         const distancia = Math.abs(precoVigente(v) - precoBase) / precoBase;
         return {
           veiculo: v,
           pontuacao: distancia - (mesmaCarroceria(ref.tipo, v) ? BONUS_DE_CARROCERIA : 0),
         };
       })
       .sort((a, b) => {
         if (a.pontuacao !== b.pontuacao) return a.pontuacao - b.pontuacao;
         // Desempate estável: a PDP é ISR, e ordem que muda entre builds troca os
         // cards sem nenhuma razão visível para quem está olhando.
         return a.veiculo.id.localeCompare(b.veiculo.id);
       })
       .slice(0, limite)
       .map((c) => c.veiculo);
   }

   /** Os vizinhos de estoque no rodapé da PDP. A régua é `vizinhosPorPreco`. */
   export function escolherSimilares(atual: Veiculo, estoque: Veiculo[], limite = 3): Veiculo[] {
     return vizinhosPorPreco(
       { id: atual.id, preco: precoVigente(atual), tipo: atual.tipo || "", moto: ehMotocicleta(atual) },
       estoque,
       limite,
     );
   }

   /**
    * A carroceria do repasse no vocabulário do feed do estoque (`CARROCERIAS`
    * em `classificacaoVeiculo.ts`; o feed normaliza para "Hatch", "Sedan",
    * "SUV", "Picape"). "outro" não tem par e não ganha bônus.
    */
   export const TIPO_NO_FEED: Record<CarroceriaDoRepasse, string> = {
     hatch: "Hatch",
     seda: "Sedan",
     suv: "SUV",
     picape: "Picape",
     outro: "",
   };

   /**
    * "Prefere com garantia?" — três carros do estoque na ficha do repasse
    * (spec §7.2). A referência é a FIPE, ou "você gasta" sem ela: o carro com
    * garantia do mesmo porte custa perto da FIPE, e pelo preço de repasse a
    * banda cortaria justamente ele.
    */
   export function parecidosDoRepasse(
     r: Pick<Repasse, "preco" | "fipe_valor" | "itens_de_estado" | "carroceria">,
     estoque: Veiculo[],
     limite = 3,
   ): Veiculo[] {
     const conta = contaDoRepasse(r);
     return vizinhosPorPreco(
       { id: null, preco: conta.fipe ?? conta.voceGasta, tipo: r.carroceria ? TIPO_NO_FEED[r.carroceria] : "", moto: false },
       estoque,
       limite,
     );
   }
   ```

- [ ] **Step 5: O grafo do repasse**

`src/lib/grafoDoRepasse.ts`:

```ts
/**
 * Os nós de JSON-LD da seção de repasse (spec §7.1 e §7.2, decisão 17 do
 * PR 3) — montados aqui, e não no JSX, pelo motivo de `grafoDaFicha.ts`: array
 * de nós escrito no `<script>` é montagem sem teste. Quem guarda o que as
 * rotas SERVEM são `tests/pagina-do-repasse-no-ar.test.ts` e
 * `tests/ficha-do-repasse-no-ar.test.ts`, que renderizam e contam.
 *
 * O `Car` do repasse NÃO tem `sku`/`mpn`: o id do repasse não existe no
 * catálogo da Meta nem no feed, e o remarketing casaria anúncio com nada
 * (spec §8).
 */
import type { CompanySettings, Veiculo } from "../types";
import { nomeComAno } from "./nomeDoVeiculo";
import { CAMINHO_DO_REPASSE, TITULO_DO_REPASSE } from "./paginaDoRepasse";
import { estadoDoRepasse, type Repasse } from "./repasse";
import { REFERENCIA_DA_LOJA, schemaDaLoja, schemaDoSite } from "./schemaLoja";
import { schemaDePerguntas, schemaDeTrilha, type DegrauDaTrilha, type PerguntaDeSchema } from "./schemaListagem";
import { galeriaDoSchema, precoValidoAte, transmissaoDoSchema } from "./schemaVeiculo";
import { TIPO_NO_FEED } from "./similares";
import { SITE_URL } from "./site";

/**
 * Aberto a todos: `InStock`. Vendido: `SoldOut`. Reservado e só-lojistas:
 * `LimitedAvailability` — o carro existe e tem preço, mas o público não fecha
 * hoje (decisão 21 do plano).
 */
export function disponibilidadeDoRepasse(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">): string {
  const estado = estadoDoRepasse(r);
  if (estado === "aberto") return "https://schema.org/InStock";
  if (estado === "vendido") return "https://schema.org/SoldOut";
  return "https://schema.org/LimitedAvailability";
}

export function schemaDoRepasse(r: Repasse, caminho: string) {
  const url = `${SITE_URL}${caminho}`;
  const imagens = galeriaDoSchema(r);
  return {
    "@context": "https://schema.org",
    "@type": "Car",
    "@id": `${url}#car`,
    name: nomeComAno({ marca: r.marca, modelo: r.modelo, versao: r.versao, ano: r.ano_modelo }),
    url,
    image: imagens.length > 0 ? imagens : undefined,
    description: r.resumo ?? undefined,
    brand: { "@type": "Brand", name: r.marca },
    model: r.modelo,
    vehicleConfiguration: (r.versao ?? "").trim() || undefined,
    vehicleModelDate: r.ano_modelo,
    modelDate: String(r.ano_modelo),
    productionDate: r.ano_fabricacao ? String(r.ano_fabricacao) : undefined,
    color: (r.cor ?? "").trim() || undefined,
    bodyType: (r.carroceria ? TIPO_NO_FEED[r.carroceria] : "") || undefined,
    vehicleTransmission: transmissaoDoSchema(r.cambio),
    fuelType: (r.combustivel ?? "").trim() || undefined,
    mileageFromOdometer: { "@type": "QuantitativeValue", value: r.quilometragem, unitCode: "KMT" },
    itemCondition: "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      price: r.preco.toFixed(2),
      priceCurrency: "BRL",
      availability: disponibilidadeDoRepasse(r),
      itemCondition: "https://schema.org/UsedCondition",
      url,
      priceValidUntil: precoValidoAte(),
      seller: REFERENCIA_DA_LOJA,
      availableAtOrFrom: REFERENCIA_DA_LOJA,
    },
  };
}

/** A ficha: `Car` (com a `Offer`), `BreadcrumbList`, `AutoDealer` e `WebSite`. */
export function grafoDoRepasse(opcoes: {
  repasse: Repasse;
  caminho: string;
  trilha: DegrauDaTrilha[];
  empresa: CompanySettings;
  /** Só para a faixa de preço do `AutoDealer`. */
  disponiveis: Veiculo[];
}): unknown[] {
  return [
    schemaDoRepasse(opcoes.repasse, opcoes.caminho),
    schemaDeTrilha(opcoes.trilha),
    schemaDaLoja(opcoes.empresa, { disponiveis: opcoes.disponiveis }),
    schemaDoSite(opcoes.empresa),
  ];
}

/** `ItemList` dos carros ABERTOS A TODOS; null quando não há nenhum. */
export function schemaDosRepassesAbertos(repasses: Repasse[]) {
  const abertos = repasses.filter((r) => estadoDoRepasse(r) === "aberto");
  if (abertos.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: TITULO_DO_REPASSE,
    numberOfItems: abertos.length,
    itemListElement: abertos.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${CAMINHO_DO_REPASSE}/${r.slug}`,
    })),
  };
}

/** A página: `BreadcrumbList`, `ItemList` (se houver aberto), `FAQPage`, `AutoDealer`, `WebSite`. */
export function grafoDaPaginaDoRepasse(opcoes: {
  repasses: Repasse[];
  perguntas: PerguntaDeSchema[];
  trilha: DegrauDaTrilha[];
  empresa: CompanySettings;
  disponiveis: Veiculo[];
}): unknown[] {
  const lista = schemaDosRepassesAbertos(opcoes.repasses);
  return [
    schemaDeTrilha(opcoes.trilha),
    ...(lista ? [lista] : []),
    ...(opcoes.perguntas.length > 0 ? [schemaDePerguntas(opcoes.perguntas)] : []),
    schemaDaLoja(opcoes.empresa, { disponiveis: opcoes.disponiveis }),
    schemaDoSite(opcoes.empresa),
  ];
}
```

- [ ] **Step 6: Rodar os novos e os que já leem estes módulos**

Run: `npx vitest run tests/leitura-dos-repasses-no-site.test.ts tests/parecidos-do-repasse.test.ts tests/grafo-do-repasse.test.ts tests/leitura-dos-repasses.test.ts tests/similares.test.ts tests/ficha-publica-o-grafo.test.ts`
Expected: PASS.

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Apagar a linha `void registrarFalha(…)` → "a linha malformada some da vitrine E vai para a triagem" reprova.
2. Trocar o padrão do `like` por `` `%${sufixo}%` `` → "procura o slug que termina no sufixo" reprova.
3. Em `parecidosDoRepasse`, trocar `conta.fipe ?? conta.voceGasta` por `r.preco` → "mede pela FIPE" reprova.
4. Em `vizinhosPorPreco`, trocar `ref.id !== null && v.id === ref.id` por `false` → "escolherSimilares é vizinhosPorPreco…" reprova (a ficha se sugeriria a si mesma).
4b. Em `TIPO_NO_FEED`, trocar `seda: "Sedan"` por `seda: "Sedã"` → "a mesma carroceria pesa, no vocabulário do feed" reprova (o sedã nunca casaria com o `tipo` do estoque).
5. Em `disponibilidadeDoRepasse`, apagar a linha do `SoldOut` → "a disponibilidade diz o estado" reprova.
6. Em `schemaDosRepassesAbertos`, trocar o `filter` por `repasses` inteiro → "ItemList só dos abertos" reprova.

- [ ] **Step 8: Commit**

```bash
git add src/lib/leituraDosRepasses.ts src/lib/similares.ts src/lib/grafoDoRepasse.ts tests/leitura-dos-repasses.test.ts tests/leitura-dos-repasses-no-site.test.ts tests/parecidos-do-repasse.test.ts tests/grafo-do-repasse.test.ts
git commit -m "feat(repasse): leitura pelo sufixo, linha malformada na triagem, parecidos e grafo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: O card, a conta e o lote — Sonnet

**Files:**
- Create: `src/lib/loteDoRepasse.ts`
- Create: `src/components/repasse/ContaDoRepasse.tsx`
- Create: `src/components/repasse/CardDoRepasse.tsx`
- Create: `src/components/repasse/LoteDoRepasse.tsx`
- Test: `tests/lote-do-repasse.test.ts` (novo, node) e `tests/lote-do-repasse-fiacao.test.ts` (novo, jsdom)

**Interfaces:**
- Consumes: Task 1 (`LOTE_DO_REPASSE`, `CARD_DO_REPASSE`, `ROTULOS_DA_CONTA`, âncoras, `anosDoCarro`, `contagemDeFotos`, `linhaDoHistoricoNoCard`, `rotuloDaFipe`, `rotuloDaFipeNaFicha`, `verOsOutros`); Task 2 (`ddmmEmCuritiba`, `ehHojeEmCuritiba`); Task 4 (`estadoDoRepasse`, `mensagemDoRepasse`); `contaDoRepasse`, `emReais`, `etiquetaDoRepasse`, `passaNoFiltro`, `FILTROS_DO_REPASSE`, `FiltroDoRepasse`, `Repasse`; `linkWhatsApp`; `ehFotoPropria`; `BotaoWhatsApp`; `Etiqueta`, `formatarKm`.
- Produces (usados pelas Tasks 10 a 12):
  - Em `src/lib/loteDoRepasse.ts`: `ORDENS_DO_LOTE = ["recentes", "diferenca", "preco"] as const`; `type OrdemDoLote`; `QUANTOS_JA_SAIRAM = 3`; `type WhatsappDaLoja = { whatsappRaw: string; whatsapp: string }`; `publicadoEm(r): string`; `ordenarLote(lote: readonly Repasse[], ordem: OrdemDoLote): Repasse[]`; `contagemPorFiltro(lote): Record<FiltroDoRepasse, number>`; `interface ResumoDoLote { lote; abertos; soLojistas; sairam; ultimaSaida; atualizacao; exemploDoHeroi; exemploDaConta }`; `resumoDoLote(visiveis: readonly Repasse[], agora: Date): ResumoDoLote`.
  - `ContaDoRepasse({ repasse, variante: "card" | "ficha" | "exemplo", carroNaFipe?: string })`.
  - `CardDoRepasse({ repasse, whatsappDaLoja: WhatsappDaLoja, prioridade?: boolean })`.
  - `LoteDoRepasse({ lote: Repasse[], whatsappDaLoja: WhatsappDaLoja })` (client).

- [ ] **Step 1: Escrever os testes que falham**

`tests/lote-do-repasse.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ORDENS_DO_LOTE,
  QUANTOS_JA_SAIRAM,
  contagemPorFiltro,
  ordenarLote,
  resumoDoLote,
} from "../src/lib/loteDoRepasse";
import { CARD_DO_REPASSE, LOTE_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import type { Repasse } from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const { default: CardDoRepasse } = await import("../src/components/repasse/CardDoRepasse");

/**
 * O lote e o card (pranchas "Página /repasse" e "Card do repasse e estados"),
 * sem DOM: a régua do lote é pura, e o card não tem estado.
 */
const AGORA = new Date("2026-09-24T15:00:00Z"); // qui 24/09, 12h em Curitiba
const LOJA = { whatsappRaw: "5541997372165", whatsapp: "(41) 99737-2165" };

let n = 0;
function carro(parcial: Partial<Repasse>): Repasse {
  n += 1;
  const sufixo = String(n).padStart(6, "0");
  return repasseDeTeste({ id: `${sufixo}00-0000-4000-8000-000000000000`, slug: `carro-${sufixo}`, ...parcial });
}
const ABERTO = carro({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = carro({ situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z", laudo: "nao_feito", itens_de_estado: [], sem_defeitos_conhecidos: true, preco: 27500, fipe_valor: 33200 });
const RESERVADO = carro({ situacao: "reservado", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-20T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z", preco: 46900, fipe_valor: 52600, itens_de_estado: [], sem_defeitos_conhecidos: true });
const VENDIDOS = [15, 18, 20, 21].map((dia) =>
  carro({ situacao: "vendido", lojistas_desde: "2026-09-10T12:00:00Z", aberto_ao_publico_em: "2026-09-10T12:00:00Z", vendido_em: `2026-09-${dia}T12:00:00Z` }),
);

describe("a régua do lote", () => {
  it("as ordens da tela são as do código", () => {
    expect(Object.keys(LOTE_DO_REPASSE.ordens)).toEqual([...ORDENS_DO_LOTE]);
  });

  it("mais recentes pela publicação; maior diferença pela FIPE; menor preço pelo à vista", () => {
    const lote = [RESERVADO, ABERTO, LOJISTAS];
    expect(ordenarLote(lote, "recentes").map((r) => r.id)).toEqual([ABERTO.id, LOJISTAS.id, RESERVADO.id]);
    // abaixo da FIPE: ABERTO 3.180 · LOJISTAS 5.700 · RESERVADO 5.700 (empate → mais recente primeiro)
    expect(ordenarLote(lote, "diferenca").map((r) => r.id)).toEqual([LOJISTAS.id, RESERVADO.id, ABERTO.id]);
    expect(ordenarLote(lote, "preco").map((r) => r.id)).toEqual([LOJISTAS.id, ABERTO.id, RESERVADO.id]);
  });

  it("os filtros não são exclusivos: um carro com laudo e reparo conta nos dois", () => {
    expect(contagemPorFiltro([ABERTO, LOJISTAS, RESERVADO])).toEqual({
      todos: 3,
      "com-laudo": 2,
      "sem-laudo": 1,
      "reparo-orcado": 1,
    });
  });

  it("o resumo separa o lote, os abertos, os só-lojistas e os que já saíram", () => {
    const resumo = resumoDoLote([...VENDIDOS, RESERVADO, LOJISTAS, ABERTO], AGORA);
    expect(resumo.lote.map((r) => r.id)).toEqual([ABERTO.id, LOJISTAS.id, RESERVADO.id]);
    expect(resumo.abertos.map((r) => r.id)).toEqual([ABERTO.id]);
    expect(resumo.soLojistas).toBe(1);
    expect(resumo.sairam).toHaveLength(QUANTOS_JA_SAIRAM);
    expect(resumo.sairam[0].vendido_em).toBe("2026-09-21T12:00:00Z");
    expect(resumo.ultimaSaida).toBe("21/09");
    expect(resumo.atualizacao).toEqual({ hoje: true, dia: "24/09" });
  });

  it("hoje só quando a publicação mais recente é de hoje em Curitiba", () => {
    const ontem = { ...ABERTO, aberto_ao_publico_em: "2026-09-24T02:00:00Z" }; // 23h de quarta
    expect(resumoDoLote([ontem], AGORA).atualizacao).toEqual({ hoje: false, dia: "23/09" });
  });

  it("os exemplos preferem reparo (herói) e sinistro declarado (a conta), e só entre os abertos", () => {
    const comSinistro = carro({
      situacao: "publicado",
      lojistas_desde: "2026-09-21T12:00:00Z",
      aberto_ao_publico_em: "2026-09-21T12:00:00Z",
      sinistro_consta: true,
      sinistro_detalhe: "pequena monta em 2021",
      itens_de_estado: [],
      sem_defeitos_conhecidos: true,
    });
    const resumo = resumoDoLote([comSinistro, ABERTO, LOJISTAS], AGORA);
    expect(resumo.exemploDoHeroi?.id).toBe(ABERTO.id);
    expect(resumo.exemploDaConta?.id).toBe(comSinistro.id);
    expect(resumoDoLote([LOJISTAS], AGORA).exemploDoHeroi).toBeNull();
  });

  it("sem nada no ar, tudo vazio e nenhuma data inventada", () => {
    expect(resumoDoLote([], AGORA)).toMatchObject({ lote: [], abertos: [], sairam: [], ultimaSaida: null, atualizacao: null });
  });
});

describe("o card nos quatro estados", () => {
  // `\s` também pega o espaço inseparável que `toLocaleString` põe depois do "R$".
  const html = (r: Repasse) =>
    renderToStaticMarkup(createElement(CardDoRepasse, { repasse: r, whatsappDaLoja: LOJA })).replace(/\s+/g, " ");

  it("aberto: etiqueta, conta, histórico, WhatsApp com a referência e a ficha de estado", () => {
    const h = html(ABERTO);
    expect(h).toContain("REPARO ORÇADO");
    expect(h).toContain(CARD_DO_REPASSE.quero);
    expect(h).toContain("https://wa.me/5541997372165?text=");
    expect(h).toContain(encodeURIComponent("Ref.: repasse"));
    expect(h).toContain(`href="/repasse/${ABERTO.slug}#ficha-de-estado"`);
    expect(h).toContain("Laudo: aprovado, sai a pedido");
    expect(h).toContain("R$ 36.900");
  });

  it("só-lojistas: a camada e as duas saídas, sem WhatsApp", () => {
    const h = html(LOJISTAS);
    expect(h).toContain(CARD_DO_REPASSE.soLojistas);
    expect(h).toContain(CARD_DO_REPASSE.soLojistasTexto);
    expect(h).toContain('href="/repasse#lista-lojista"');
    expect(h).toContain('href="/repasse#lista"');
    expect(h).not.toContain("wa.me");
  });

  it("reservado e vendido: a camada e a lista, sem WhatsApp", () => {
    const reservado = html(RESERVADO);
    expect(reservado).toContain(CARD_DO_REPASSE.reservado);
    expect(reservado).toContain(CARD_DO_REPASSE.aviseSeVoltar);
    expect(reservado).not.toContain("wa.me");
    const vendido = html(VENDIDOS[0]);
    expect(vendido).toContain(CARD_DO_REPASSE.vendido);
    expect(vendido).toContain(CARD_DO_REPASSE.entrarNaLista);
    expect(vendido).not.toContain("wa.me");
  });

  it("carro que não aparece não desenha card", () => {
    expect(html(repasseDeTeste({ situacao: "arquivado" }))).toBe("");
  });
});
```

`tests/lote-do-repasse-fiacao.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Repasse } from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const { default: LoteDoRepasse } = await import("../src/components/repasse/LoteDoRepasse");

/**
 * A ilha do lote (spec §7.1): o HTML inicial traz TODOS os cards com seus
 * links; os filtros e a ordem agem no cliente; no celular, dois cards e o
 * botão dos outros.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
});

async function montar(lote: Repasse[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(createElement(LoteDoRepasse, { lote, whatsappDaLoja: { whatsappRaw: "5541997372165", whatsapp: "" } })),
  );
}

/** O link de cada ficha, uma vez só (a foto e o nome do card apontam para a mesma). */
const fichas = () => [
  ...new Set(
    [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "").filter((h) => /^\/repasse\/[^#]+$/.test(h)),
  ),
];
const botao = (texto: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(texto)) as HTMLButtonElement;

const base = { situacao: "publicado" as const, lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" };
const COM_REPARO = repasseDeTeste({ ...base, id: "a1000000-0000-4000-8000-000000000001", slug: "com-reparo-a10000" });
const SEM_LAUDO = repasseDeTeste({ ...base, id: "a2000000-0000-4000-8000-000000000002", slug: "sem-laudo-a20000", laudo: "nao_feito", itens_de_estado: [], sem_defeitos_conhecidos: true, preco: 27500 });
const COM_LAUDO = repasseDeTeste({ ...base, id: "a3000000-0000-4000-8000-000000000003", slug: "com-laudo-a30000", itens_de_estado: [], sem_defeitos_conhecidos: true, preco: 52900 });

describe("LoteDoRepasse", () => {
  it("todos os cards chegam com o link da ficha", async () => {
    await montar([COM_REPARO, SEM_LAUDO, COM_LAUDO]);
    expect(fichas().sort()).toEqual(["/repasse/com-laudo-a30000", "/repasse/com-reparo-a10000", "/repasse/sem-laudo-a20000"]);
  });

  it("o filtro tira os outros da grade", async () => {
    await montar([COM_REPARO, SEM_LAUDO, COM_LAUDO]);
    await act(async () => botao("SEM LAUDO").click());
    expect(fichas()).toEqual(["/repasse/sem-laudo-a20000"]);
    await act(async () => botao("TODOS").click());
    expect(fichas()).toHaveLength(3);
  });

  it("filtro sem carro fica desligado", async () => {
    await montar([COM_LAUDO]);
    expect(botao("SEM LAUDO").disabled).toBe(true);
    expect(botao("REPARO ORÇADO").disabled).toBe(true);
  });

  it("menor preço reordena a grade", async () => {
    await montar([COM_REPARO, SEM_LAUDO, COM_LAUDO]);
    const select = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "preco");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(fichas()).toEqual(["/repasse/sem-laudo-a20000", "/repasse/com-reparo-a10000", "/repasse/com-laudo-a30000"]);
  });

  it("no celular, do terceiro em diante fica escondido até o botão", async () => {
    await montar([COM_REPARO, SEM_LAUDO, COM_LAUDO]);
    const itens = [...container.querySelectorAll("li")];
    expect(itens[2].className).toContain("hidden");
    await act(async () => botao("VER O OUTRO CARRO").click());
    expect([...container.querySelectorAll("li")][2].className).not.toContain("hidden");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/lote-do-repasse.test.ts tests/lote-do-repasse-fiacao.test.ts`
Expected: FAIL — os módulos não existem.

- [ ] **Step 3: `src/lib/loteDoRepasse.ts`**

```ts
/**
 * O lote do repasse, em lib pura (spec §7.1, decisões 3 e 8 do PR 3): a
 * ordem da grade, a contagem de cada filtro e o resumo que a página desenha
 * — o que está no lote, o que já saiu, quando o lote mudou e qual carro
 * vira exemplo nos dois quadros "como ler".
 *
 * Recebe o que `lerRepassesPublicos` já filtrou (publicado, reservado e
 * vendido na carência).
 */
import { ddmmEmCuritiba, ehHojeEmCuritiba } from "./horarioDaLoja";
import {
  FILTROS_DO_REPASSE,
  contaDoRepasse,
  estadoDoRepasse,
  passaNoFiltro,
  type FiltroDoRepasse,
  type Repasse,
} from "./repasse";

export const ORDENS_DO_LOTE = ["recentes", "diferenca", "preco"] as const;
export type OrdemDoLote = (typeof ORDENS_DO_LOTE)[number];

export const QUANTOS_JA_SAIRAM = 3;

/** O que o card precisa do `companySettings` — e só isso vai para a ilha cliente. */
export type WhatsappDaLoja = { whatsappRaw: string; whatsapp: string };

const instante = (valor: string | null): number => {
  const t = valor ? new Date(valor).getTime() : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** Quando o carro entrou na vitrine: o switch, senão a publicação para lojistas, senão a criação. */
export function publicadoEm(r: Pick<Repasse, "aberto_ao_publico_em" | "lojistas_desde" | "created_at">): string {
  return r.aberto_ao_publico_em ?? r.lojistas_desde ?? r.created_at;
}

export function ordenarLote(lote: readonly Repasse[], ordem: OrdemDoLote): Repasse[] {
  const recentes = (a: Repasse, b: Repasse) =>
    instante(publicadoEm(b)) - instante(publicadoEm(a)) || a.id.localeCompare(b.id);
  const copia = [...lote];
  if (ordem === "diferenca") {
    const abaixo = (r: Repasse) => contaDoRepasse(r).abaixoDaFipe ?? Number.NEGATIVE_INFINITY;
    return copia.sort((a, b) => abaixo(b) - abaixo(a) || recentes(a, b));
  }
  if (ordem === "preco") return copia.sort((a, b) => a.preco - b.preco || recentes(a, b));
  return copia.sort(recentes);
}

export function contagemPorFiltro(lote: readonly Repasse[]): Record<FiltroDoRepasse, number> {
  const contagem = {} as Record<FiltroDoRepasse, number>;
  for (const filtro of FILTROS_DO_REPASSE) contagem[filtro] = lote.filter((r) => passaNoFiltro(r, filtro)).length;
  return contagem;
}

export interface ResumoDoLote {
  /** Publicado (aberto ou só-lojistas) e reservado, mais recentes primeiro. */
  lote: Repasse[];
  /** Publicado e aberto a todos. */
  abertos: Repasse[];
  soLojistas: number;
  /** Vendidos na carência, até três, venda mais recente primeiro. */
  sairam: Repasse[];
  /** "dd/mm" da venda mais recente; null sem venda na carência. */
  ultimaSaida: string | null;
  /** A publicação mais recente do lote; null com o lote vazio. */
  atualizacao: { hoje: boolean; dia: string } | null;
  /** "Como ler um repasse" (herói): um aberto com reparo, senão o primeiro aberto. */
  exemploDoHeroi: Repasse | null;
  /** "EXEMPLO" da conta aberta: um aberto com sinistro declarado, senão com reparo, senão o primeiro. */
  exemploDaConta: Repasse | null;
}

export function resumoDoLote(visiveis: readonly Repasse[], agora: Date): ResumoDoLote {
  const lote = ordenarLote(
    visiveis.filter((r) => r.situacao === "publicado" || r.situacao === "reservado"),
    "recentes",
  );
  const abertos = lote.filter((r) => estadoDoRepasse(r) === "aberto");
  const vendidos = visiveis
    .filter((r) => r.situacao === "vendido")
    .sort((a, b) => instante(b.vendido_em) - instante(a.vendido_em));
  const maisRecente = lote.length > 0 ? publicadoEm(lote[0]) : null;
  const dia = ddmmEmCuritiba(maisRecente);
  const comReparo = (r: Repasse) => contaDoRepasse(r).reparoOrcado > 0;
  return {
    lote,
    abertos,
    soLojistas: lote.filter((r) => estadoDoRepasse(r) === "lojistas").length,
    sairam: vendidos.slice(0, QUANTOS_JA_SAIRAM),
    ultimaSaida: ddmmEmCuritiba(vendidos.length > 0 ? vendidos[0].vendido_em : null),
    atualizacao: dia ? { hoje: ehHojeEmCuritiba(maisRecente, agora), dia } : null,
    exemploDoHeroi: abertos.find(comReparo) ?? abertos[0] ?? null,
    exemploDaConta:
      abertos.find((r) => r.sinistro_consta === true && r.sinistro_detalhe) ??
      abertos.find(comReparo) ??
      abertos[0] ??
      null,
  };
}
```

- [ ] **Step 4: `src/components/repasse/ContaDoRepasse.tsx`**

```tsx
import Link from "next/link";
import { ANCORA_DA_FICHA_DE_ESTADO, ROTULOS_DA_CONTA, rotuloDaFipe, rotuloDaFipeNaFicha } from "../../lib/paginaDoRepasse";
import { contaDoRepasse, emReais, type Repasse } from "../../lib/repasse";

/**
 * A conta do repasse (spec §1): preço à vista, reparo orçado, "você gasta",
 * FIPE do mês e a diferença para a FIPE em reais. Três desenhos:
 *   - `card`: compacto, com "à vista, no estado";
 *   - `ficha`: em linhas, com o link para a ficha de estado e a FIPE nomeando
 *     a versão;
 *   - `exemplo`: em linhas, para os quadros "como ler" (herói e conta aberta).
 * A diferença só aparece quando o carro está ABAIXO da FIPE — acima dela, a
 * linha "abaixo" seria número negativo com rótulo que mente.
 */
export default function ContaDoRepasse({
  repasse: r,
  variante,
  carroNaFipe,
}: {
  repasse: Repasse;
  variante: "card" | "ficha" | "exemplo";
  /** Só na ficha: "Kwid Zen 1.0 2021", depois do mês da FIPE. */
  carroNaFipe?: string;
}) {
  const conta = contaDoRepasse(r);
  const comReparo = conta.reparoOrcado > 0;
  const abaixo = conta.abaixoDaFipe !== null && conta.abaixoDaFipe > 0 ? conta.abaixoDaFipe : null;
  const fipe =
    variante === "ficha" && carroNaFipe
      ? rotuloDaFipeNaFicha(r.fipe_mes_referencia, carroNaFipe)
      : rotuloDaFipe(r.fipe_mes_referencia);

  if (variante === "card") {
    return (
      <div className="mt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[23px] font-extrabold tracking-[-.03em]">{emReais(conta.preco)}</span>
          <span className="text-[10px] text-mt-neutral-600">{ROTULOS_DA_CONTA.noEstado}</span>
        </div>
        <dl className="m-0 mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-[12px]">
          {comReparo && (
            <>
              <dt className="text-mt-neutral-700">{ROTULOS_DA_CONTA.reparo}</dt>
              <dd className="m-0 text-right">{emReais(conta.reparoOrcado)}</dd>
              <dt className="text-mt-neutral-700">{ROTULOS_DA_CONTA.voceGasta}</dt>
              <dd className="m-0 text-right font-semibold">{emReais(conta.voceGasta)}</dd>
            </>
          )}
          {conta.fipe !== null && (
            <>
              <dt className="text-mt-neutral-700">{fipe}</dt>
              <dd className="m-0 text-right">{emReais(conta.fipe)}</dd>
            </>
          )}
          {abaixo !== null && (
            <>
              <dt className="font-semibold text-mt-accent-800">{ROTULOS_DA_CONTA.abaixoCurto}</dt>
              <dd className="m-0 text-right font-extrabold text-mt-accent-800">{emReais(abaixo)}</dd>
            </>
          )}
        </dl>
      </div>
    );
  }

  return (
    <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[14px]">
      <dt>{ROTULOS_DA_CONTA.preco}</dt>
      <dd className="m-0 text-right text-[18px] font-extrabold">{emReais(conta.preco)}</dd>
      {comReparo && (
        <>
          <dt>
            {ROTULOS_DA_CONTA.reparo}
            {variante === "ficha" && (
              <>
                {" "}
                <Link href={`#${ANCORA_DA_FICHA_DE_ESTADO}`} className="mt-foco underline underline-offset-2">
                  {ROTULOS_DA_CONTA.verFicha}
                </Link>
              </>
            )}
          </dt>
          <dd className="m-0 text-right">+ {emReais(conta.reparoOrcado)}</dd>
          <dt className="font-semibold">{ROTULOS_DA_CONTA.voceGasta}</dt>
          <dd className="m-0 text-right font-semibold">{emReais(conta.voceGasta)}</dd>
        </>
      )}
      {conta.fipe !== null && (
        <>
          <dt>{fipe}</dt>
          <dd className="m-0 text-right">{emReais(conta.fipe)}</dd>
        </>
      )}
      {abaixo !== null && (
        <>
          <dt className="font-extrabold text-mt-accent">{ROTULOS_DA_CONTA.abaixo}</dt>
          <dd className="m-0 text-right text-[18px] font-extrabold text-mt-accent">{emReais(abaixo)}</dd>
        </>
      )}
    </dl>
  );
}
```

- [ ] **Step 5: `src/components/repasse/CardDoRepasse.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";
import { ehFotoPropria } from "../../lib/fotosDoVeiculo";
import type { WhatsappDaLoja } from "../../lib/loteDoRepasse";
import { mensagemDoRepasse } from "../../lib/mensagensDoVeiculo";
import {
  ANCORA_DA_FICHA_DE_ESTADO,
  ANCORA_DA_LISTA,
  ANCORA_DA_LISTA_LOJISTA,
  CAMINHO_DO_REPASSE,
  CARD_DO_REPASSE,
  anosDoCarro,
  contagemDeFotos,
  linhaDoHistoricoNoCard,
} from "../../lib/paginaDoRepasse";
import { estadoDoRepasse, etiquetaDoRepasse, type Repasse } from "../../lib/repasse";
import { linkWhatsApp } from "../../lib/whatsapp";
import BotaoWhatsApp from "../modernist/BotaoWhatsApp";
import { Etiqueta, formatarKm } from "../modernist/primitivos";
import ContaDoRepasse from "./ContaDoRepasse";

/**
 * O card do repasse (prancha "Card do repasse e estados"). Quatro estados:
 *   - aberto a todos: etiqueta (com laudo, sem laudo, reparo orçado) e
 *     "QUERO ESTE REPASSE" no WhatsApp, com a referência do carro;
 *   - só para lojistas: a camada, "CADASTRAR MEU CNPJ" e "AVISE QUANDO ABRIR
 *     PARA TODOS" — sem WhatsApp (decisão 4);
 *   - reservado e vendido: a camada e a lista do repasse, preço apagado.
 * Todo card leva "VER A FICHA DE ESTADO". Sem estado de React: desenha igual
 * no servidor ("já saíram") e dentro da ilha do lote.
 */
export default function CardDoRepasse({
  repasse: r,
  whatsappDaLoja,
  prioridade = false,
}: {
  repasse: Repasse;
  whatsappDaLoja: WhatsappDaLoja;
  prioridade?: boolean;
}) {
  const estado = estadoDoRepasse(r);
  if (!estado) return null;

  const ficha = `${CAMINHO_DO_REPASSE}/${r.slug}`;
  const foto = r.web_full_images[0] ?? r.whatsapp_images[0];
  const defeitos = r.itens_de_estado.filter((item) => item.foto).length;
  const totalDeFotos = r.web_full_images.length + defeitos;
  const etiqueta = etiquetaDoRepasse(r);
  const whatsapp = estado === "aberto" ? linkWhatsApp(whatsappDaLoja, mensagemDoRepasse(r, "aberto")) : "";
  const camada =
    estado === "lojistas" ? CARD_DO_REPASSE.soLojistas : estado === "reservado" ? CARD_DO_REPASSE.reservado : estado === "vendido" ? CARD_DO_REPASSE.vendido : null;

  return (
    <article className="flex flex-col">
      <Link href={ficha} className="mt-foco relative block aspect-[4/3] bg-mt-neutral-300">
        {foto ? (
          <Image
            src={foto}
            alt={[r.marca, r.modelo, r.versao].filter(Boolean).join(" ")}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            priority={prioridade}
            unoptimized={ehFotoPropria(foto)}
            className="object-cover"
          />
        ) : null}
        {estado === "aberto" && (
          <Etiqueta accent={etiqueta === "COM LAUDO"} className="pointer-events-none absolute left-0 top-0 text-[9px]">
            {etiqueta}
          </Etiqueta>
        )}
        {totalDeFotos > 0 && (
          <span className="pointer-events-none absolute bottom-0 right-0 bg-[rgba(20,18,18,.82)] px-2 py-1 text-[10px] font-semibold text-mt-inverso">
            {contagemDeFotos(totalDeFotos, defeitos)}
          </span>
        )}
        {camada && (
          <span className="absolute inset-0 flex flex-col items-start justify-end bg-[rgba(20,18,18,.72)] p-4 text-mt-inverso">
            <span className="text-[11px] font-extrabold tracking-[.14em]">{camada}</span>
            {estado === "lojistas" && <span className="mt-1 text-[13px]">{CARD_DO_REPASSE.soLojistasTexto}</span>}
          </span>
        )}
      </Link>

      <div className="mt-3 border-t-2 border-mt-regua pt-2.5">
        <div className="text-[9px] font-semibold tracking-[.16em] text-mt-accent">{r.marca.toUpperCase()}</div>
        <Link href={ficha} className="mt-foco block text-mt-ink no-underline">
          <span className="mt-0.5 block text-[19px] font-extrabold leading-tight tracking-[-.02em]">{r.modelo}</span>
          {r.versao && <span className="block text-xs text-mt-neutral-700">{r.versao}</span>}
        </Link>
        <div className="mt-2 flex gap-2 border-t border-mt-regua-fina pt-2 text-[10px] tracking-[.05em] text-mt-neutral-600">
          <span>{anosDoCarro(r)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatarKm(r.quilometragem)}</span>
          {r.cambio && (
            <>
              <span aria-hidden="true">·</span>
              <span>{r.cambio}</span>
            </>
          )}
        </div>
        {r.resumo && <p className="m-0 mt-2 text-[13px] leading-snug text-mt-neutral-800">{r.resumo}</p>}
        <div className={camada && estado !== "lojistas" ? "opacity-60" : ""}>
          <ContaDoRepasse repasse={r} variante="card" />
        </div>
        <p className="m-0 mt-2 text-[11px] leading-snug text-mt-neutral-700">{linhaDoHistoricoNoCard(r)}</p>
        <div className="mt-3 flex flex-col items-start gap-3">
          {estado === "aberto" && whatsapp && (
            <BotaoWhatsApp href={whatsapp} origem="repasse-card">
              {CARD_DO_REPASSE.quero}
            </BotaoWhatsApp>
          )}
          {estado === "lojistas" && (
            <>
              <Link href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA_LOJISTA}`} className="mt-btn mt-btn-tinta mt-foco">
                {CARD_DO_REPASSE.cadastrarCnpj}
              </Link>
              <Link href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA}`} className="mt-link-regua mt-foco">
                {CARD_DO_REPASSE.aviseQuandoAbrir}
              </Link>
            </>
          )}
          {estado === "reservado" && (
            <Link href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA}`} className="mt-link-regua mt-foco">
              {CARD_DO_REPASSE.aviseSeVoltar}
            </Link>
          )}
          {estado === "vendido" && (
            <Link href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA}`} className="mt-link-regua mt-foco">
              {CARD_DO_REPASSE.entrarNaLista}
            </Link>
          )}
          <Link href={`${ficha}#${ANCORA_DA_FICHA_DE_ESTADO}`} className="mt-link-regua mt-foco">
            {CARD_DO_REPASSE.verFicha}
          </Link>
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 6: `src/components/repasse/LoteDoRepasse.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  ORDENS_DO_LOTE,
  contagemPorFiltro,
  ordenarLote,
  type OrdemDoLote,
  type WhatsappDaLoja,
} from "../../lib/loteDoRepasse";
import { LOTE_DO_REPASSE, verOsOutros } from "../../lib/paginaDoRepasse";
import { FILTROS_DO_REPASSE, passaNoFiltro, type FiltroDoRepasse, type Repasse } from "../../lib/repasse";
import CardDoRepasse from "./CardDoRepasse";

/** No celular, a prancha mostra dois cards e o botão dos outros. */
const NO_CELULAR = 2;

/**
 * A ilha do lote (spec §7.1). Recebe os carros já lidos no servidor e só
 * filtra e ordena: o HTML inicial traz todos os cards com seus links, então o
 * rastreador acha cada ficha sem JavaScript — o problema medido do
 * `useSearchParams`, que servia zero link, não se aplica.
 *
 * Os filtros não são exclusivos (um carro com laudo e reparo está nos dois), e
 * filtro sem carro fica desligado em vez de mostrar grade vazia.
 */
export default function LoteDoRepasse({ lote, whatsappDaLoja }: { lote: Repasse[]; whatsappDaLoja: WhatsappDaLoja }) {
  const [filtro, setFiltro] = useState<FiltroDoRepasse>("todos");
  const [ordem, setOrdem] = useState<OrdemDoLote>("recentes");
  const [todosNoCelular, setTodosNoCelular] = useState(false);

  const contagem = contagemPorFiltro(lote);
  const visiveis = ordenarLote(
    lote.filter((r) => passaNoFiltro(r, filtro)),
    ordem,
  );
  const escondidos = Math.max(0, visiveis.length - NO_CELULAR);

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div role="group" aria-label={LOTE_DO_REPASSE.rotulo} className="flex flex-wrap gap-2">
          {FILTROS_DO_REPASSE.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              disabled={f !== "todos" && contagem[f] === 0}
              onClick={() => {
                setFiltro(f);
                setTodosNoCelular(false);
              }}
              className={`mt-foco border-2 px-3 py-2 text-[11px] font-extrabold tracking-[.1em] disabled:opacity-40 ${
                filtro === f ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua text-mt-ink"
              }`}
            >
              {LOTE_DO_REPASSE.filtros[f]} {contagem[f]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-mt-neutral-700">
          {LOTE_DO_REPASSE.ordenarPor}
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemDoLote)}
            className="mt-foco border border-mt-regua bg-mt-bg px-2 py-1.5 text-[13px] text-mt-ink"
          >
            {ORDENS_DO_LOTE.map((o) => (
              <option key={o} value={o}>
                {LOTE_DO_REPASSE.ordens[o]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="m-0 mt-6 grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 desktop:grid-cols-3">
        {visiveis.map((r, i) => (
          <li key={r.id} className={i >= NO_CELULAR && !todosNoCelular ? "hidden sm:block" : ""}>
            <CardDoRepasse repasse={r} whatsappDaLoja={whatsappDaLoja} prioridade={i === 0} />
          </li>
        ))}
      </ul>

      {escondidos > 0 && !todosNoCelular && (
        <button
          type="button"
          onClick={() => setTodosNoCelular(true)}
          className="mt-btn mt-btn-contorno mt-foco mt-6 sm:hidden"
        >
          {verOsOutros(escondidos)}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run tests/lote-do-repasse.test.ts tests/lote-do-repasse-fiacao.test.ts`
Expected: PASS.

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `CardDoRepasse`, trocar `estado === "aberto" ? linkWhatsApp(…) : ""` por `linkWhatsApp(…)` e tirar o `estado === "aberto" &&` do botão → "só-lojistas: … sem WhatsApp" reprova.
2. Em `resumoDoLote`, trocar `ehHojeEmCuritiba(maisRecente, agora)` por `true` → "hoje só quando a publicação mais recente é de hoje" reprova.
3. Em `LoteDoRepasse`, trocar `className={i >= NO_CELULAR && !todosNoCelular ? "hidden sm:block" : ""}` por `{…visiveis.slice(0, todosNoCelular ? undefined : NO_CELULAR)…}` (renderizar só dois) → "todos os cards chegam com o link da ficha" reprova (o HTML inicial perderia fichas).
4. Em `contagemPorFiltro`, contar só `r.laudo` para "com-laudo" com `temLaudo(r) && contaDoRepasse(r).reparoOrcado === 0` → "os filtros não são exclusivos" reprova.

- [ ] **Step 9: Commit**

```bash
git add src/lib/loteDoRepasse.ts src/components/repasse/ContaDoRepasse.tsx src/components/repasse/CardDoRepasse.tsx src/components/repasse/LoteDoRepasse.tsx tests/lote-do-repasse.test.ts tests/lote-do-repasse-fiacao.test.ts
git commit -m "feat(repasse): o card nos quatro estados, a conta e a ilha do lote

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Os formulários — a lista do repasse e o exame no pátio — Sonnet

**Files:**
- Create: `src/components/repasse/ListaDoRepasse.tsx`
- Create: `src/components/repasse/ExameNoPatio.tsx`
- Modify: `tests/brechas-de-mensuracao.test.ts` (B.7: os dois formulários novos em `GERAM_O_ID_ANTES_DO_POST`)
- Test: `tests/formularios-do-repasse.test.ts` (novo, jsdom)

**Interfaces:**
- Consumes: Task 1 (`LISTA_DO_REPASSE`, `FICHA_DO_REPASSE`, `HEROI_DO_REPASSE`, `ERROS_DO_REPASSE`, `NOME_DA_CARROCERIA`, âncoras, `CAMINHO_DO_REPASSE`, `tituloDaConfirmacao`, `textoDaConfirmacao`); Task 2 (`DiaDoExame`, `TurnoDoExame`, `TURNOS_DO_EXAME`, `NOME_DO_TURNO`); Task 3 (`CARROCERIAS_DA_LISTA`, `CarroceriaDaLista`, `FORM_DA_LISTA`, `FORM_DA_LISTA_LOJISTA`, `FORM_DO_EXAME`, `VEICULO_DA_LISTA`, `montarLeadDaLista`, `montarLeadDoExame`, `mensagemDeErroDaRota`, `CarroParaOExame`, `cnpjValido`); Task 4 (`ACOES.repasse`); `FAIXAS_DO_REPASSE`, `FaixaDoRepasse`; tipo `TrilhaDoRepasse`; `useTheme`; `getActiveAgUid`, `getMatchParamsRespeitandoRecusa`, `getUtmParameters`, `rastreamentoRecusado`, `trackLeadSubmission`; `generateEventId`; `mascararTelefone`, `telefoneDoLead`; `Turnstile`, `TurnstileHandle`, `SaidaDoCaptcha`.
- Produces (usados pelas Tasks 10 e 11):
  - `ListaDoRepasse({ contexto: ContextoDaLista, cabecalho?: boolean })` e `type ContextoDaLista = "pagina" | "vazio" | "ficha" | "nao-encontrado"`. A raiz é `<section id="lista">` com `<span id="lista-lojista">` dentro; `#lista-lojista` no endereço abre na trilha lojista.
  - `ExameNoPatio({ carro: CarroParaOExame, dias: DiaDoExame[], titulo: string })`. A raiz é `<section id="exame">`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/formularios-do-repasse.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ERROS_DO_REPASSE, LISTA_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import { lerCodigo } from "./fonte";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * Os dois formulários do repasse, montados de verdade (molde
 * `avaliacao-fipe-fora-fiacao`). Dublês: o `fetch`, o Turnstile (que fora do
 * navegador não carrega o script da Cloudflare), o tema e a medição — que só
 * anota. O resto é o código de produção.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ companySettings: { googleAdsId: "", googleAdsConversionLabel: "" } }),
}));
vi.mock("../src/components/Turnstile", () => ({
  default: function TurnstileFalso({ onSuccess }: { onSuccess: (t: string) => void }) {
    useEffect(() => {
      onSuccess("token-de-teste");
    }, [onSuccess]);
    return null;
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const medicao = vi.hoisted(() => ({ leads: [] as unknown[][] }));
vi.mock("../src/lib/telemetry", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/telemetry")>();
  return {
    ...real,
    trackLeadSubmission: (...args: unknown[]) => {
      medicao.leads.push(args);
      return null;
    },
  };
});

const { default: ListaDoRepasse } = await import("../src/components/repasse/ListaDoRepasse");
const { default: ExameNoPatio } = await import("../src/components/repasse/ExameNoPatio");

let container: HTMLDivElement;
let root: Root;
let posts: Array<{ url: string; corpo: Record<string, unknown> }>;
let resposta: { status: number; corpo: unknown };

beforeEach(() => {
  medicao.leads = [];
  posts = [];
  resposta = { status: 200, corpo: { success: true } };
  // Resposta como objeto simples, no molde de `avaliacao-fipe-fora-fiacao`:
  // o componente só lê `ok`, `status` e `json()`.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opcoes?: RequestInit) => {
      posts.push({ url: String(url), corpo: JSON.parse(String(opcoes?.body ?? "{}")) });
      return {
        ok: resposta.status >= 200 && resposta.status < 300,
        status: resposta.status,
        json: async () => resposta.corpo,
      } as never;
    }),
  );
  window.history.replaceState(null, "", "/repasse");
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

async function montar(elemento: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(elemento));
}

function digitar(el: HTMLInputElement | HTMLSelectElement, valor: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
const campo = (nome: string) => container.querySelector(`[name="${nome}"]`) as HTMLInputElement;
const botao = (texto: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(texto)) as HTMLButtonElement;
async function enviar() {
  await act(async () => {
    (container.querySelector("form") as HTMLFormElement).requestSubmit();
  });
  // O envio é assíncrono (fetch → json → medição → estado): quatro voltas do
  // relógio, como o `assentar` de `avaliacao-fipe-fora-fiacao`.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

describe("a ação do captcha nos dois formulários (a outra metade do par)", () => {
  it.each(["src/components/repasse/ListaDoRepasse.tsx", "src/components/repasse/ExameNoPatio.tsx"])(
    "%s declara action={ACOES.repasse}",
    (arquivo) => {
      expect(lerCodigo(arquivo)).toMatch(/action=\{ACOES\.repasse\}/);
    },
  );
});

describe("a lista do repasse", () => {
  it("compra para usar: posta o corpo da lista, mede DEPOIS do 2xx e confirma com o perfil", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => digitar(campo("nome"), "Ana Souza"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await act(async () => campo("carroceria-hatch").click());
    await enviar();

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/leads");
    expect(posts[0].corpo).toMatchObject({
      canal: "repasse",
      turnstileToken: "token-de-teste",
      cliente: { nome: "Ana Souza", whatsapp: "(41) 99737-2165" },
      intencao_busca: { repasse: { tipo: "lista", trilha: "consumidor", faixa: "30-50", carrocerias: ["hatch"], caminho: "/repasse" } },
    });
    expect(medicao.leads).toHaveLength(1);
    expect(medicao.leads[0][2]).toMatchObject({ tipoDeLead: "curadoria", formId: "form-lista-repasse" });
    expect(container.textContent).toContain("Pronto, Ana. Você está na lista do repasse.");
    expect(container.textContent).toContain("Quando entrar um hatch de R$ 30 mil a R$ 50 mil");
  });

  it("a linha de consentimento é a da §7.4, com o link para /privacidade#dados", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    expect(container.textContent).toContain(LISTA_DO_REPASSE.consentimento);
    expect(container.querySelector('a[href="/privacidade#dados"]')?.textContent).toBe(LISTA_DO_REPASSE.politica);
  });

  it("o botão muda com o contexto e a trilha", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "vazio" }));
    expect(botao(LISTA_DO_REPASSE.botaoProximo)).toBeDefined();
    await act(async () => botao(LISTA_DO_REPASSE.trilhaLojista).click());
    expect(botao(LISTA_DO_REPASSE.botaoLojista)).toBeDefined();
  });

  it("#lista-lojista no endereço abre na trilha lojista", async () => {
    window.history.replaceState(null, "", "/repasse#lista-lojista");
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    expect(campo("cnpj")).not.toBeNull();
    expect(container.querySelector("#lista")).not.toBeNull();
    expect(container.querySelector("#lista-lojista")).not.toBeNull();
  });

  it("lojista: CNPJ que não fecha para no navegador, sem POST", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => botao(LISTA_DO_REPASSE.trilhaLojista).click());
    await act(async () => digitar(campo("nome"), "Auto Bom"));
    await act(async () => digitar(campo("whatsapp"), "41999990000"));
    await act(async () => digitar(campo("cnpj"), "11.222.333/0001-82"));
    await act(async () => digitar(campo("loja"), "Auto Bom, Curitiba"));
    await enviar();
    expect(posts).toEqual([]);
    expect(container.textContent).toContain(ERROS_DO_REPASSE.cnpj);
  });

  it("lojista: posta CNPJ, loja e cidade, e confirma o cadastro", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => botao(LISTA_DO_REPASSE.trilhaLojista).click());
    await act(async () => digitar(campo("nome"), "Auto Bom"));
    await act(async () => digitar(campo("whatsapp"), "41999990000"));
    await act(async () => digitar(campo("cnpj"), "11.222.333/0001-81"));
    await act(async () => digitar(campo("loja"), "Auto Bom, Curitiba"));
    await enviar();
    expect(posts[0].corpo).toMatchObject({
      canal: "repasse-lojista",
      intencao_busca: { repasse: { trilha: "lojista", cnpj: "11.222.333/0001-81", loja_cidade: "Auto Bom, Curitiba" } },
    });
    expect(medicao.leads[0][2]).toMatchObject({ formId: "form-lista-repasse-lojista" });
    expect(container.textContent).toContain(LISTA_DO_REPASSE.confirmacaoLojistaTitulo);
  });

  it("403 do captcha: a saída do captcha, e nenhuma conversão", async () => {
    resposta = { status: 403, corpo: { error: "Falha na verificação de segurança (Anti-Spam)." } };
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => digitar(campo("nome"), "Ana"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await enviar();
    expect(medicao.leads).toEqual([]);
    expect(container.textContent).toContain(LISTA_DO_REPASSE.captcha);
  });

  it("500 da lista: a mensagem da rota, e nenhuma conversão", async () => {
    resposta = { status: 500, corpo: { error: ERROS_DO_REPASSE.lista } };
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => digitar(campo("nome"), "Ana"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await enviar();
    expect(medicao.leads).toEqual([]);
    expect(container.textContent).toContain(ERROS_DO_REPASSE.lista);
  });
});

describe("o exame no pátio", () => {
  const CARRO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
  const DIAS = [
    { data: "2026-09-24", rotulo: "Qui 24", rotuloCompleto: "Qui 24/09" },
    { data: "2026-09-25", rotulo: "Sex 25", rotuloCompleto: "Sex 25/09" },
    { data: "2026-09-26", rotulo: "Sáb 26", rotuloCompleto: "Sáb 26/09" },
  ];

  it("posta o dia, o turno e o mecânico; mede depois do 2xx; sem linha de consentimento", async () => {
    await montar(createElement(ExameNoPatio, { carro: CARRO, dias: DIAS, titulo: "Marque um horário para ver o Kwid" }));
    expect(container.textContent).not.toContain(LISTA_DO_REPASSE.consentimento);
    expect(container.textContent).toContain("Confirmamos o horário pelo WhatsApp.");
    await act(async () => digitar(campo("nome"), "Ana Souza"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await act(async () => (container.querySelector('input[value="2026-09-26"]') as HTMLInputElement).click());
    await enviar();
    expect(posts[0].corpo).toMatchObject({
      canal: "repasse-exame",
      mensagem: "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.",
      intencao_busca: { repasse: { tipo: "exame", repasse_id: CARRO.id, dia: "2026-09-26", turno: "tarde", leva_mecanico: true } },
    });
    expect(posts[0].corpo).not.toHaveProperty("veiculo");
    expect(medicao.leads[0][2]).toMatchObject({ tipoDeLead: "curadoria", formId: "form-exame-repasse" });
    expect(container.textContent).toContain("Pedido enviado.");
  });

  it("409 do carro que saiu: a mensagem da rota, sem conversão", async () => {
    resposta = { status: 409, corpo: { error: ERROS_DO_REPASSE.exameFechado } };
    await montar(createElement(ExameNoPatio, { carro: CARRO, dias: DIAS, titulo: "x" }));
    await act(async () => digitar(campo("nome"), "Ana"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await enviar();
    expect(medicao.leads).toEqual([]);
    expect(container.textContent).toContain(ERROS_DO_REPASSE.exameFechado);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/formularios-do-repasse.test.ts`
Expected: FAIL — os dois componentes não existem.

- [ ] **Step 3: `src/components/repasse/ListaDoRepasse.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";

import { useTheme } from "../../app/ThemeContext";
import type { TrilhaDoRepasse } from "../../lib/avisosDoRepasse";
import { cnpjValido } from "../../lib/cnpj";
import {
  CARROCERIAS_DA_LISTA,
  FORM_DA_LISTA,
  FORM_DA_LISTA_LOJISTA,
  VEICULO_DA_LISTA,
  mensagemDeErroDaRota,
  montarLeadDaLista,
  type CarroceriaDaLista,
} from "../../lib/leadDoRepasse";
import {
  ANCORA_DA_LISTA,
  ANCORA_DA_LISTA_LOJISTA,
  ANCORA_DO_LOTE,
  CAMINHO_DO_REPASSE,
  ERROS_DO_REPASSE,
  HEROI_DO_REPASSE,
  LISTA_DO_REPASSE,
  NOME_DA_CARROCERIA,
  textoDaConfirmacao,
  tituloDaConfirmacao,
} from "../../lib/paginaDoRepasse";
import { FAIXAS_DO_REPASSE, type FaixaDoRepasse } from "../../lib/repasse";
import {
  getActiveAgUid,
  getMatchParamsRespeitandoRecusa,
  getUtmParameters,
  rastreamentoRecusado,
  trackLeadSubmission,
} from "../../lib/telemetry";
import { generateEventId } from "../../lib/tracking-identity";
import { ACOES } from "../../lib/turnstile";
import { mascararTelefone, telefoneDoLead } from "../../lib/whatsapp";
import SaidaDoCaptcha from "../SaidaDoCaptcha";
import Turnstile, { type TurnstileHandle } from "../Turnstile";

export type ContextoDaLista = "pagina" | "vazio" | "ficha" | "nao-encontrado";

const assinarEndereco = (avisar: () => void) => {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
};
const lerEndereco = () => window.location.hash;
const enderecoNoServidor = () => "";

interface Inscrito {
  trilha: TrilhaDoRepasse;
  nome: string;
  faixa: FaixaDoRepasse | null;
  carrocerias: CarroceriaDaLista[];
}

const ROTULO = "text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700";
const CAMPO =
  "w-full border border-mt-regua bg-mt-bg px-3 py-2.5 text-[14px] text-mt-ink outline-none focus:border-mt-accent";

/**
 * A lista do repasse (spec §7.1, §7.4 e §8; decisões 5, 6, 9 e 10 do PR 3).
 *
 * Um componente, duas trilhas — "compro para usar" e "sou lojista" —, usado
 * na página, no vazio, na ficha vendida ou reservada e no endereço que não
 * abre carro. `#lista-lojista` no endereço abre na trilha lojista: é para lá
 * que "CADASTRAR MEU CNPJ" aponta. A escolha da pessoa vale até o endereço
 * mudar de novo (o herói pode mandar para a outra trilha depois).
 *
 * Tracking no molde de `EncomendaDeCarro.tsx`: `eventId` antes do POST e só
 * para quem não se opôs; `fbp`/`fbc` pela recusa; valores lidos no envio;
 * `trackLeadSubmission` SÓ depois do 2xx, com `tipoDeLead: "curadoria"` (a
 * tag do GTM não conhece valor novo) e o `formId` da trilha. 403 é o captcha
 * e tem saída própria; o resto mostra só texto de `ERROS_DO_REPASSE`.
 *
 * A linha de consentimento é a da §7.4, aprovada para a `/privacidade` — não a
 * das pranchas.
 */
export default function ListaDoRepasse({ contexto, cabecalho = true }: { contexto: ContextoDaLista; cabecalho?: boolean }) {
  const { companySettings } = useTheme();
  const L = LISTA_DO_REPASSE;

  const endereco = useSyncExternalStore(assinarEndereco, lerEndereco, enderecoNoServidor);
  const [escolha, setEscolha] = useState<{ trilha: TrilhaDoRepasse; endereco: string } | null>(null);
  const trilha: TrilhaDoRepasse =
    escolha && escolha.endereco === endereco
      ? escolha.trilha
      : endereco === `#${ANCORA_DA_LISTA_LOJISTA}`
        ? "lojista"
        : "consumidor";
  const lojista = trilha === "lojista";

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [faixa, setFaixa] = useState<FaixaDoRepasse>(FAIXAS_DO_REPASSE[1].id);
  const [carrocerias, setCarrocerias] = useState<CarroceriaDaLista[]>([]);
  const [cnpj, setCnpj] = useState("");
  const [lojaCidade, setLojaCidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [inscrito, setInscrito] = useState<Inscrito | null>(null);

  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [captchaBloqueado, setCaptchaBloqueado] = useState(false);
  const descartarToken = () => {
    setTurnstileToken("");
    turnstileRef.current?.reset();
  };

  const comLote = contexto === "pagina";
  const rotuloDoBotao = lojista ? L.botaoLojista : contexto === "pagina" ? L.botaoUsar : L.botaoProximo;

  function alternar(c: CarroceriaDaLista) {
    setCarrocerias((atual) => (atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const telefone = telefoneDoLead(whatsapp);
    const problema = !nome.trim()
      ? ERROS_DO_REPASSE.nome
      : !telefone.comDDI
        ? ERROS_DO_REPASSE.whatsapp
        : lojista && !cnpjValido(cnpj)
          ? ERROS_DO_REPASSE.cnpj
          : lojista && !lojaCidade.trim()
            ? ERROS_DO_REPASSE.loja
            : "";
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    setEnviando(true);

    // Gerado ANTES do POST para o pixel e a CAPI dividirem o mesmo id; nulo
    // para quem se opôs em /privacidade (a rota só espelha no CAPI com id).
    const eventId = rastreamentoRecusado() ? null : generateEventId("Lead");
    const { fbp, fbc } = getMatchParamsRespeitandoRecusa();
    const corpo = montarLeadDaLista(
      {
        trilha,
        nome,
        whatsapp,
        faixa: lojista ? null : faixa,
        carrocerias: lojista ? [] : carrocerias,
        cnpj: lojista ? cnpj : "",
        lojaCidade: lojista ? lojaCidade : "",
        caminho: window.location.pathname,
      },
      {
        agUid: getActiveAgUid(),
        eventId,
        turnstileToken,
        utm: getUtmParameters(),
        eventSourceUrl: window.location.href,
        fbp,
        fbc,
      },
    );

    let resposta: Response;
    try {
      resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
    } catch {
      setErro(ERROS_DO_REPASSE.generico);
      setEnviando(false);
      return;
    }

    if (!resposta.ok) {
      // O token é de uso único e já foi gasto no siteverify.
      descartarToken();
      setEnviando(false);
      if (resposta.status === 403) {
        setCaptchaBloqueado(true);
        return;
      }
      setErro(mensagemDeErroDaRota(await resposta.json().catch(() => null)));
      return;
    }

    // Só depois do sucesso: a pessoa está na lista, e aí sim é conversão.
    trackLeadSubmission({ ...VEICULO_DA_LISTA[trilha], preco: 0 }, corpo.mensagem, {
      presetEventId: eventId ?? undefined,
      googleAdsId: companySettings?.googleAdsId,
      googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
      phoneE164: telefone.e164,
      tipoDeLead: "curadoria",
      formId: lojista ? FORM_DA_LISTA_LOJISTA : FORM_DA_LISTA,
    });
    setInscrito({ trilha, nome, faixa: lojista ? null : faixa, carrocerias: lojista ? [] : carrocerias });
    setEnviando(false);
    descartarToken();
  }

  if (captchaBloqueado) {
    return <SaidaDoCaptcha mensagem={L.captcha} onTentarNovamente={() => setCaptchaBloqueado(false)} />;
  }

  const trilhaClasse = (ativa: boolean) =>
    `mt-foco border-2 px-3 py-2 text-[11px] font-extrabold tracking-[.1em] ${
      ativa ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua text-mt-ink"
    }`;

  return (
    <section id={ANCORA_DA_LISTA} className="scroll-mt-24">
      <span id={ANCORA_DA_LISTA_LOJISTA} aria-hidden="true" />
      {cabecalho && (
        <>
          <p className="mt-rotulo mt-rotulo-accent m-0">{L.rotulo}</p>
          <h2 className="mt-titulo m-0 mt-2 text-3xl md:text-[40px]">{L.titulo}</h2>
          {lojista ? (
            <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[14px] text-mt-neutral-800">
              {L.vantagensLojista.map((v) => (
                <li key={v}>
                  <span aria-hidden="true" className="mr-2 font-extrabold text-mt-accent">
                    ✓
                  </span>
                  {v}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-3 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">{L.textoUsar}</p>
          )}
        </>
      )}

      {inscrito ? (
        <div role="status" className="mt-6 max-w-[560px] border-2 border-mt-accent p-5">
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">
            <span aria-hidden="true">✓ </span>
            {inscrito.trilha === "lojista" ? L.trilhaLojista : L.trilhaUsar}
          </p>
          {inscrito.trilha === "lojista" ? (
            <>
              <p className="m-0 mt-2 text-[17px] font-extrabold">{L.confirmacaoLojistaTitulo}</p>
              <p className="m-0 mt-1.5 text-[14px] text-mt-neutral-800">{L.confirmacaoLojistaTexto}</p>
            </>
          ) : (
            <>
              <p className="m-0 mt-2 text-[17px] font-extrabold">{tituloDaConfirmacao(inscrito.nome)}</p>
              <p className="m-0 mt-1.5 text-[14px] text-mt-neutral-800">
                {textoDaConfirmacao({ faixa: inscrito.faixa, carrocerias: inscrito.carrocerias, comLote })}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {comLote && (
                  <a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DO_LOTE}`} className="mt-btn mt-btn-tinta mt-foco">
                    {L.verLote}
                  </a>
                )}
                <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
                  {L.verEstoque}
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="mt-6 grid max-w-[560px] gap-4">
          <div role="group" aria-label={HEROI_DO_REPASSE.legenda} className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!lojista} onClick={() => setEscolha({ trilha: "consumidor", endereco })} className={trilhaClasse(!lojista)}>
              <span className="hidden sm:inline">{L.trilhaUsar}</span>
              <span className="sm:hidden">{L.trilhaUsarCurta}</span>
            </button>
            <button type="button" aria-pressed={lojista} onClick={() => setEscolha({ trilha: "lojista", endereco })} className={trilhaClasse(lojista)}>
              {L.trilhaLojista}
            </button>
          </div>

          <label className="grid gap-1.5">
            <span className={ROTULO}>{L.nome}</span>
            <input
              type="text"
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              readOnly={enviando}
              autoComplete="name"
              placeholder={L.nomeExemplo}
              className={CAMPO}
            />
          </label>

          <label className="grid gap-1.5">
            <span className={ROTULO}>{L.whatsapp}</span>
            <input
              type="tel"
              name="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
              readOnly={enviando}
              autoComplete="tel"
              inputMode="tel"
              placeholder={L.whatsappExemplo}
              className={CAMPO}
            />
          </label>

          {lojista ? (
            <>
              <label className="grid gap-1.5">
                <span className={ROTULO}>{L.cnpj}</span>
                <input
                  type="text"
                  name="cnpj"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  readOnly={enviando}
                  inputMode="numeric"
                  placeholder={L.cnpjExemplo}
                  className={CAMPO}
                />
              </label>
              <label className="grid gap-1.5">
                <span className={ROTULO}>{L.lojaCidade}</span>
                <input
                  type="text"
                  name="loja"
                  value={lojaCidade}
                  onChange={(e) => setLojaCidade(e.target.value)}
                  readOnly={enviando}
                  autoComplete="organization"
                  placeholder={L.lojaCidadeExemplo}
                  className={CAMPO}
                />
              </label>
            </>
          ) : (
            <>
              <label className="grid gap-1.5">
                <span className={ROTULO}>{L.faixa}</span>
                <select name="faixa" value={faixa} onChange={(e) => setFaixa(e.target.value as FaixaDoRepasse)} className={CAMPO}>
                  {FAIXAS_DO_REPASSE.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="m-0 border-0 p-0">
                <legend className={ROTULO}>{L.tipo}</legend>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
                  {CARROCERIAS_DA_LISTA.map((c) => (
                    <label key={c} className="flex items-center gap-2">
                      <input type="checkbox" name={`carroceria-${c}`} checked={carrocerias.includes(c)} onChange={() => alternar(c)} />
                      {NOME_DA_CARROCERIA[c].rotulo}
                    </label>
                  ))}
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="carroceria-tanto-faz" checked={carrocerias.length === 0} onChange={() => setCarrocerias([])} />
                    {L.tantoFaz}
                  </label>
                </div>
              </fieldset>
            </>
          )}

          <Turnstile
            ref={turnstileRef}
            action={ACOES.repasse}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken("")}
            onError={() => setTurnstileToken("")}
          />

          <button type="submit" disabled={enviando} className="mt-btn mt-btn-primario mt-foco justify-self-start disabled:opacity-60">
            {enviando ? L.enviando : rotuloDoBotao}
          </button>

          {erro && (
            <p role="alert" className="m-0 text-[13px] text-mt-accent">
              {erro}
            </p>
          )}

          <p className="m-0 text-[12px] leading-relaxed text-mt-neutral-700">
            {L.consentimento}{" "}
            <Link href="/privacidade#dados" className="mt-foco underline underline-offset-2">
              {L.politica}
            </Link>
            .
          </p>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 4: `src/components/repasse/ExameNoPatio.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";

import { useTheme } from "../../app/ThemeContext";
import { NOME_DO_TURNO, TURNOS_DO_EXAME, type DiaDoExame, type TurnoDoExame } from "../../lib/exameNoPatio";
import { FORM_DO_EXAME, mensagemDeErroDaRota, montarLeadDoExame, type CarroParaOExame } from "../../lib/leadDoRepasse";
import { ANCORA_DO_EXAME, ERROS_DO_REPASSE, FICHA_DO_REPASSE, LISTA_DO_REPASSE } from "../../lib/paginaDoRepasse";
import {
  getActiveAgUid,
  getMatchParamsRespeitandoRecusa,
  getUtmParameters,
  rastreamentoRecusado,
  trackLeadSubmission,
} from "../../lib/telemetry";
import { generateEventId } from "../../lib/tracking-identity";
import { ACOES } from "../../lib/turnstile";
import { mascararTelefone, telefoneDoLead } from "../../lib/whatsapp";
import SaidaDoCaptcha from "../SaidaDoCaptcha";
import Turnstile, { type TurnstileHandle } from "../Turnstile";

const ROTULO = "text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700";
const CAMPO =
  "w-full border border-mt-regua bg-mt-bg px-3 py-2.5 text-[14px] text-mt-ink outline-none focus:border-mt-accent";
const opcao = (ativa: boolean) =>
  `mt-foco cursor-pointer border-2 px-3 py-2 text-[12px] font-extrabold tracking-[.06em] ${
    ativa ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua text-mt-ink"
  }`;

/**
 * O exame no pátio (spec §7.2, decisões 6 e 12 do PR 3). Os dias vêm prontos
 * do servidor (`diasDoExame`): três dias de loja aberta depois de hoje, em
 * Curitiba; turno da tarde e "vou levar o meu mecânico" já marcados, como na
 * prancha.
 *
 * Não é lista: sem linha de consentimento (como a Encomenda), só "Confirmamos
 * o horário pelo WhatsApp." — o dado serve para marcar o horário, base que a
 * `/privacidade` já declara. Tracking no molde da lista: `eventId` antes do
 * POST, medição só depois do 2xx, `formId: "form-exame-repasse"`.
 */
export default function ExameNoPatio({ carro, dias, titulo }: { carro: CarroParaOExame; dias: DiaDoExame[]; titulo: string }) {
  const { companySettings } = useTheme();
  const F = FICHA_DO_REPASSE;

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [dia, setDia] = useState(dias[0]?.data ?? "");
  const [turno, setTurno] = useState<TurnoDoExame>("tarde");
  const [levaMecanico, setLevaMecanico] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState("");

  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [captchaBloqueado, setCaptchaBloqueado] = useState(false);
  const descartarToken = () => {
    setTurnstileToken("");
    turnstileRef.current?.reset();
  };

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const telefone = telefoneDoLead(whatsapp);
    if (!nome.trim()) {
      setErro(ERROS_DO_REPASSE.nome);
      return;
    }
    if (!telefone.comDDI) {
      setErro(ERROS_DO_REPASSE.whatsapp);
      return;
    }
    setErro("");
    setEnviando(true);

    const eventId = rastreamentoRecusado() ? null : generateEventId("Lead");
    const { fbp, fbc } = getMatchParamsRespeitandoRecusa();
    const corpo = montarLeadDoExame(
      carro,
      { nome, whatsapp, dia, turno, levaMecanico },
      {
        agUid: getActiveAgUid(),
        eventId,
        turnstileToken,
        utm: getUtmParameters(),
        eventSourceUrl: window.location.href,
        fbp,
        fbc,
      },
    );

    let resposta: Response;
    try {
      resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
    } catch {
      setErro(ERROS_DO_REPASSE.generico);
      setEnviando(false);
      return;
    }

    if (!resposta.ok) {
      descartarToken();
      setEnviando(false);
      if (resposta.status === 403) {
        setCaptchaBloqueado(true);
        return;
      }
      setErro(mensagemDeErroDaRota(await resposta.json().catch(() => null)));
      return;
    }

    trackLeadSubmission({ marca: carro.marca, modelo: carro.modelo, preco: carro.preco }, corpo.mensagem, {
      presetEventId: eventId ?? undefined,
      googleAdsId: companySettings?.googleAdsId,
      googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
      phoneE164: telefone.e164,
      tipoDeLead: "curadoria",
      formId: FORM_DO_EXAME,
    });
    setPronto(true);
    setEnviando(false);
    descartarToken();
  }

  if (captchaBloqueado) {
    return <SaidaDoCaptcha mensagem={LISTA_DO_REPASSE.captcha} onTentarNovamente={() => setCaptchaBloqueado(false)} />;
  }

  return (
    <section id={ANCORA_DO_EXAME} className="scroll-mt-24 border-t-2 border-mt-regua px-[18px] py-10 lg:px-10">
      <p className="mt-rotulo mt-rotulo-accent m-0">{F.exameRotulo}</p>
      <h2 className="mt-titulo m-0 mt-2 text-[28px] lg:text-[36px]">{titulo}</h2>
      <p className="m-0 mt-2 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">{F.exameTexto}</p>

      {pronto ? (
        <div role="status" className="mt-6 max-w-[560px] border-2 border-mt-accent p-5">
          <p className="m-0 text-[15px] font-extrabold">{F.pedidoEnviado}</p>
          <p className="m-0 mt-1.5 text-[13px] text-mt-neutral-800">{F.confirmamos}</p>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="mt-6 grid max-w-[560px] gap-4">
          <label className="grid gap-1.5">
            <span className={ROTULO}>{LISTA_DO_REPASSE.nome}</span>
            <input
              type="text"
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              readOnly={enviando}
              autoComplete="name"
              placeholder={LISTA_DO_REPASSE.nomeExemplo}
              className={CAMPO}
            />
          </label>
          <label className="grid gap-1.5">
            <span className={ROTULO}>{LISTA_DO_REPASSE.whatsapp}</span>
            <input
              type="tel"
              name="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
              readOnly={enviando}
              autoComplete="tel"
              inputMode="tel"
              placeholder={LISTA_DO_REPASSE.whatsappExemplo}
              className={CAMPO}
            />
          </label>

          <fieldset className="m-0 border-0 p-0">
            <legend className={ROTULO}>{F.dia}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {dias.map((d) => (
                <label key={d.data} className={opcao(dia === d.data)}>
                  <input type="radio" name="dia" value={d.data} checked={dia === d.data} onChange={() => setDia(d.data)} className="sr-only" />
                  {d.rotulo}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="m-0 border-0 p-0">
            <legend className={ROTULO}>{F.turno}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TURNOS_DO_EXAME.map((t) => (
                <label key={t} className={opcao(turno === t)}>
                  <input type="radio" name="turno" value={t} checked={turno === t} onChange={() => setTurno(t)} className="sr-only" />
                  {NOME_DO_TURNO[t]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="mecanico" checked={levaMecanico} onChange={(e) => setLevaMecanico(e.target.checked)} />
            {F.levaMecanico}
          </label>

          <Turnstile
            ref={turnstileRef}
            action={ACOES.repasse}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken("")}
            onError={() => setTurnstileToken("")}
          />

          <button type="submit" disabled={enviando} className="mt-btn mt-btn-primario mt-foco justify-self-start disabled:opacity-60">
            {enviando ? LISTA_DO_REPASSE.enviando : F.pedirHorario}
          </button>

          {erro && (
            <p role="alert" className="m-0 text-[13px] text-mt-accent">
              {erro}
            </p>
          )}

          <p className="m-0 text-[12px] text-mt-neutral-700">{F.confirmamos}</p>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Os dois formulários no inventário do B.7**

Em `tests/brechas-de-mensuracao.test.ts`, em `GERAM_O_ID_ANTES_DO_POST`, depois de `"src/components/campanha/CtaDeCampanha.tsx",`, acrescentar:
```ts
    "src/components/repasse/ExameNoPatio.tsx",
    "src/components/repasse/ListaDoRepasse.tsx",
```
(é a trava "as duas listas são TODO arquivo de src/ que posta em /api/leads": sem esta linha ela reprova, e com ela os dois formulários passam a ser conferidos pela recusa do `fbp`/`fbc` e pelo `eventId` com portão.)

- [ ] **Step 6: Rodar**

Run: `npx vitest run tests/formularios-do-repasse.test.ts tests/brechas-de-mensuracao.test.ts`
Expected: PASS.

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `ListaDoRepasse`, trocar `action={ACOES.repasse}` por `action={ACOES.encomenda}` → "declara action={ACOES.repasse}" reprova.
2. Mover a chamada `trackLeadSubmission(…)` da lista para antes do `fetch` → "403 do captcha: … nenhuma conversão" reprova.
3. Trocar `const eventId = rastreamentoRecusado() ? null : generateEventId("Lead");` da lista por `const eventId = generateEventId("Lead");` → o B.7 ("o eventId do POST só nasce para quem não se opôs") reprova.
4. Trocar a condição do `trilha` para ignorar o endereço (`escolha?.trilha ?? "consumidor"`) → "#lista-lojista no endereço abre na trilha lojista" reprova.
5. No exame, trocar o padrão do turno `useState<TurnoDoExame>("tarde")` por `"manha"` → o corpo esperado ("tarde") reprova — prova que o teste lê o que a prancha marca por padrão.

- [ ] **Step 8: Commit**

```bash
git add src/components/repasse/ListaDoRepasse.tsx src/components/repasse/ExameNoPatio.tsx tests/formularios-do-repasse.test.ts tests/brechas-de-mensuracao.test.ts
git commit -m "feat(repasse): formulários da lista (duas trilhas) e do exame no pátio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: A página `/repasse` — Sonnet

**Files:**
- Create: `src/components/repasse/TrilhaDoHeroi.tsx`
- Create: `src/components/repasse/SecoesDoRepasse.tsx`
- Create: `src/app/repasse/page.tsx`
- Modify: `src/lib/compartilhamento.ts` (entrada `repasse` em `PAGINAS_COMPARTILHAVEIS`)
- Modify: `src/types/index.ts` (`repasse?: CardCompartilhamento` em `CompartilhamentoSettings`)
- Test: `tests/pagina-do-repasse-no-ar.test.ts` (novo)

**Interfaces:**
- Consumes: Tasks 1, 4, 7, 8, 9; `getEstoque`, `getVeiculoPdpUrl` (`src/lib/supabase.ts`); `disponiveisDe`; `getCachedSettings`; `montarCompartilhamento`; `patioEmDestaque` (`src/lib/fichaPerdida.ts`); `blocoJsonLd`; `linkWhatsApp`; `nomeComAno`; `CardVeiculo`, `LinkRegua`, `Rotulo`; `BotaoWhatsApp`.
- Produces: rota `/repasse` (`revalidate = 60`); `TrilhaDoHeroi({ totalNoLote })`; em `SecoesDoRepasse.tsx`: `ProvasDoRepasse()`, `ContaAberta({ exemplo })`, `RepasseOuEstoque()`, `ServeParaVoce()`, `ComoComprar()`, `PerguntasDoRepasse({ whatsapp })`; id de compartilhamento `"repasse"`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/pagina-do-repasse-no-ar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";
import type { Repasse } from "../src/lib/repasse";
import { SITE_URL } from "../src/lib/site";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * `/repasse` renderizada — o `<script>` e o HTML de verdade, no molde de
 * `ficha-publica-o-grafo`: contar o que a rota SERVE, e não o que a função
 * devolve (grafoDoRepasse já tem teste próprio).
 */
const estado = vi.hoisted(() => ({ repasses: [] as unknown[], estoque: [] as unknown[] }));

const EMPRESA = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "(41) 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "",
  instagram: "",
  facebook: "",
  cnpj: "",
} as CompanySettings;

vi.mock("../src/lib/leituraDosRepasses", () => ({ lerRepassesPublicos: async () => estado.repasses }));
vi.mock("../src/lib/supabase", () => ({
  getEstoque: async () => estado.estoque,
  getVeiculoPdpUrl: (v: { id: string }) => `/carros/marca/modelo/versao-${v.id}`,
}));
vi.mock("../src/lib/settings", () => ({ getCachedSettings: async () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/components/Turnstile", () => ({ default: () => null }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, fetchPriority: _fp, loading: _l, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const pagina = await import("../src/app/repasse/page");

const ABERTO = repasseDeTeste({ id: "a1000000-0000-4000-8000-000000000001", slug: "renault-kwid-zen-1-0-2021-a10000", situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ id: "b2000000-0000-4000-8000-000000000002", slug: "fiat-argo-drive-2019-b20000", marca: "Fiat", modelo: "Argo", situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z" });
const RESERVADO = repasseDeTeste({ id: "c3000000-0000-4000-8000-000000000003", slug: "vw-gol-2015-c30000", situacao: "reservado", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-20T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z" });
const VENDIDO = repasseDeTeste({ id: "d4000000-0000-4000-8000-000000000004", slug: "ford-ka-2018-d40000", situacao: "vendido", lojistas_desde: "2026-09-10T12:00:00Z", aberto_ao_publico_em: "2026-09-10T12:00:00Z", vendido_em: "2026-09-20T12:00:00Z" });
const ESTOQUE = ["1", "2", "3"].map(
  (id) =>
    ({
      id,
      marca: "Fiat",
      modelo: `Modelo ${id}`,
      versao: "1.0",
      ano: 2021,
      preco_original: 50000 + Number(id),
      preco_promocional: 0,
      quilometragem: 30000,
      cambio: "Manual",
      vendido: false,
      web_full_images: [],
      whatsapp_images: [],
    }) as unknown as Veiculo,
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T15:00:00Z")); // qui 24/09, 12h em Curitiba
  estado.estoque = ESTOQUE;
});
afterEach(() => vi.useRealTimers());

async function servida(repasses: Repasse[]): Promise<string> {
  estado.repasses = repasses;
  return renderToStaticMarkup(await pagina.default()).replace(/\s+/g, " ");
}

function nos(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const json = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
    return Array.isArray(json) ? json : [json];
  });
}

describe("/repasse com carro no lote", () => {
  it("serve Breadcrumb, ItemList só dos abertos, FAQ, AutoDealer e WebSite", async () => {
    const grafo = nos(await servida([ABERTO, LOJISTAS, RESERVADO, VENDIDO]));
    expect(grafo.map((n) => n["@type"])).toEqual(["BreadcrumbList", "ItemList", "FAQPage", "AutoDealer", "WebSite"]);
    const lista = grafo[1] as { itemListElement: Array<{ url: string }> };
    expect(lista.itemListElement.map((i) => i.url)).toEqual([`${SITE_URL}/repasse/${ABERTO.slug}`]);
  });

  it("o HTML traz a ficha de cada carro do lote e dos que já saíram", async () => {
    const html = await servida([ABERTO, LOJISTAS, RESERVADO, VENDIDO]);
    for (const r of [ABERTO, LOJISTAS, RESERVADO, VENDIDO]) expect(html).toContain(`href="/repasse/${r.slug}"`);
  });

  it("contagens e a linha do lote saem do dado", async () => {
    const html = await servida([ABERTO, LOJISTAS, RESERVADO, VENDIDO]);
    expect(html).toContain("3 carros no repasse");
    expect(html).toContain("VER OS 3 CARROS");
    expect(html).toContain("Lote atualizado hoje, 24/09 · 1 carro aberto a todos · 1 só para lojistas");
    expect(html).toContain("Quem está na lista recebe o aviso no WhatsApp.");
  });

  it("o quadro do herói é do carro de verdade, nunca o da prancha", async () => {
    const html = await servida([ABERTO, LOJISTAS]);
    expect(html).toContain("A conta do Renault Kwid Zen 1.0 2021");
    expect(html).not.toContain("Kwid Zen 2020");
    expect(html).not.toContain("FORD KA SE 2017");
  });

  it("as dez perguntas estão visíveis e a lista usa a linha da §7.4", async () => {
    const html = await servida([ABERTO]);
    expect(html).toContain("O que é um carro de repasse?");
    expect(html).toContain("Sou lojista. O que muda para mim?");
    expect(html).toContain("Ao entrar na lista, você aceita receber avisos de repasse pelo WhatsApp e pode sair quando quiser.");
    expect(html).toContain("QUERO RECEBER OS REPASSES");
    expect(html).not.toMatch(/n[ãa]o\s+gir/i);
  });

  it("são CINCO nós — cortar o array publicado tem que quebrar aqui", async () => {
    expect(nos(await servida([ABERTO]))).toHaveLength(5);
  });
});

describe("/repasse sem carro aberto", () => {
  it("vira a prancha do vazio: lista, já saíram, estoque com garantia — e a data só com venda", async () => {
    const html = await servida([VENDIDO]);
    expect(html).toContain("Nenhum repasse aberto agora");
    expect(html).toContain("o último carro saiu em 20/09");
    expect(html).toContain("QUERO RECEBER O PRÓXIMO");
    expect(html).toContain("Quem estava na lista recebeu o aviso no WhatsApp.");
    expect(html).toContain("No estoque com garantia");
    expect(html).toContain('href="/carros/marca/modelo/versao-1"');
    expect(nos(html).map((n) => n["@type"])).toEqual(["BreadcrumbList", "FAQPage", "AutoDealer", "WebSite"]);
  });

  it("sem venda nenhuma, sem data inventada e sem 'já saíram'", async () => {
    const html = await servida([]);
    expect(html).toContain("O repasse gira rápido. Entre na lista");
    expect(html).not.toContain("saiu em");
    expect(html).not.toContain("JÁ SAÍRAM DO REPASSE");
  });
});

describe("o cabeçalho da página", () => {
  it("título, descrição, canônico e card de compartilhamento", async () => {
    const meta = await pagina.generateMetadata();
    expect(meta.title).toBe("Carros de repasse em Curitiba | Motors Store");
    expect(meta.alternates?.canonical).toBe("/repasse");
    expect(String(meta.description).length).toBeLessThanOrEqual(155);
    expect(meta.openGraph?.title).toBe("Carros de repasse em Curitiba");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pagina-do-repasse-no-ar.test.ts`
Expected: FAIL — a rota não existe.

- [ ] **Step 3: O id de compartilhamento**

1. Em `src/types/index.ts`, em `CompartilhamentoSettings`, depois de `privacidade?: CardCompartilhamento;`, acrescentar:
   ```ts
     /** A seção de repasse, `/repasse` (2026-09-25). */
     repasse?: CardCompartilhamento;
   ```
2. Em `src/lib/compartilhamento.ts`:
   - Junto dos imports do topo, acrescentar `import { DESCRICAO_DO_REPASSE, TITULO_DO_REPASSE } from "./paginaDoRepasse";`.
   - Em `PAGINAS_COMPARTILHAVEIS`, antes da entrada `id: "privacidade"`, acrescentar:
     ```ts
       {
         // A seção de repasse (spec 2026-09-24). O texto de fábrica é o do
         // herói da página, aprovado nas pranchas — sai de `paginaDoRepasse.ts`
         // para o card não divergir da página.
         id: "repasse",
         nome: "Repasse",
         caminho: "/repasse",
         rotuloCard: "Repasse",
         tituloPadrao: TITULO_DO_REPASSE,
         descricaoPadrao: DESCRICAO_DO_REPASSE,
       },
     ```

- [ ] **Step 4: `src/components/repasse/TrilhaDoHeroi.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ANCORA_DA_LISTA, ANCORA_DA_LISTA_LOJISTA, ANCORA_DO_LOTE, HEROI_DO_REPASSE, verOsCarros } from "../../lib/paginaDoRepasse";

type Trilha = "usar" | "revender";

/**
 * O seletor "Para que você compra" do herói (prancha "Página /repasse"). Troca
 * o parágrafo e as duas chamadas; "CADASTRAR MEU CNPJ" leva a
 * `#lista-lojista`, que a lista abre já na trilha do lojista (decisão 5). Os
 * rótulos curtos do celular são spans responsivos (decisão 7).
 */
export default function TrilhaDoHeroi({ totalNoLote }: { totalNoLote: number }) {
  const [trilha, setTrilha] = useState<Trilha>("usar");
  const H = HEROI_DO_REPASSE;
  const botao = (t: Trilha) =>
    `mt-foco border-2 px-4 py-2.5 text-[12px] font-extrabold tracking-[.1em] ${
      trilha === t ? "border-mt-inverso bg-mt-inverso text-mt-inverso-fundo" : "border-mt-inverso-regua text-mt-inverso"
    }`;
  const contorno = "mt-btn mt-foco text-mt-inverso shadow-[inset_0_0_0_2px_currentColor]";

  return (
    <div className="mt-6">
      <div role="group" aria-label={H.legenda} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={trilha === "usar"} onClick={() => setTrilha("usar")} className={botao("usar")}>
          <span className="hidden sm:inline">{H.usar.botao}</span>
          <span className="sm:hidden">{H.usar.botaoCurto}</span>
        </button>
        <button type="button" aria-pressed={trilha === "revender"} onClick={() => setTrilha("revender")} className={botao("revender")}>
          <span className="hidden sm:inline">{H.revender.botao}</span>
          <span className="sm:hidden">{H.revender.botaoCurto}</span>
        </button>
      </div>
      <p className="m-0 mt-4 max-w-[560px] text-[15px] leading-relaxed">
        {trilha === "usar" ? H.usar.texto : H.revender.texto}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        {trilha === "usar" ? (
          <>
            <a href={`#${ANCORA_DO_LOTE}`} className="mt-btn mt-btn-primario mt-foco">
              {verOsCarros(totalNoLote)}
            </a>
            <a href={`#${ANCORA_DA_LISTA}`} className={contorno}>
              {H.usar.receber}
            </a>
          </>
        ) : (
          <>
            <a href={`#${ANCORA_DA_LISTA_LOJISTA}`} className="mt-btn mt-btn-primario mt-foco">
              {H.revender.cadastrar}
            </a>
            <a href={`#${ANCORA_DO_LOTE}`} className={contorno}>
              {H.revender.verAberto}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `src/components/repasse/SecoesDoRepasse.tsx`**

```tsx
import Link from "next/link";
import { nomeComAno } from "../../lib/nomeDoVeiculo";
import {
  ANCORA_DA_CONTA,
  ANCORA_DO_LOTE,
  COMO_COMPRAR,
  CONTA_ABERTA,
  PERGUNTAS_DO_REPASSE,
  PERGUNTAS_DO_REPASSE_CABECALHO,
  PROVAS_DO_REPASSE,
  REPASSE_OU_ESTOQUE,
  SERVE_PARA_VOCE,
  notaDoSinistro,
  rotuloDoExemplo,
} from "../../lib/paginaDoRepasse";
import type { Repasse } from "../../lib/repasse";
import BotaoWhatsApp from "../modernist/BotaoWhatsApp";
import { LinkRegua, Rotulo } from "../modernist/primitivos";
import ContaDoRepasse from "./ContaDoRepasse";

/**
 * As seções que explicam o repasse (pranchas "Página /repasse", a parte de
 * `Conteudo.dc.html`). As mesmas com lote e sem lote (decisão 20 do plano):
 * a página no ar sem carro não pode perder o texto que responde à busca, e o
 * `FAQPage` exige as perguntas visíveis. Server components sem estado; o
 * texto vem inteiro de `paginaDoRepasse.ts`.
 */
const SECAO = "border-t-2 border-mt-regua px-[18px] py-12 lg:px-10";
const TITULO = "mt-titulo m-0 mt-2 text-3xl md:text-[40px]";
const TEXTO = "m-0 mt-3 max-w-[620px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]";

export function ProvasDoRepasse() {
  return (
    <section aria-label={PROVAS_DO_REPASSE.rotulo} className="border-b-2 border-mt-regua">
      <ol className="m-0 grid list-none p-0 lg:grid-cols-4">
        {PROVAS_DO_REPASSE.itens.map((prova) => (
          <li
            key={prova.numero}
            className="border-b border-mt-regua-fina px-[18px] py-6 last:border-b-0 lg:border-b-0 lg:border-r lg:px-7 lg:last:border-r-0"
          >
            <div className="mb-2.5 text-[11px] font-extrabold tracking-[.1em] text-mt-accent">{prova.numero}</div>
            <div className="text-[15px] font-extrabold tracking-[-.01em]">{prova.titulo}</div>
            <p className="m-0 mt-1.5 text-[13px] leading-snug text-mt-neutral-800">{prova.texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** O glossário da conta, e o quadro de exemplo com um carro de verdade do lote (decisão 19). */
export function ContaAberta({ exemplo }: { exemplo: Repasse | null }) {
  return (
    <section id={ANCORA_DA_CONTA} className={`${SECAO} scroll-mt-24`}>
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Rotulo accent>{CONTA_ABERTA.rotulo}</Rotulo>
          <h2 className={TITULO}>{CONTA_ABERTA.titulo}</h2>
          <dl className="m-0 mt-6 grid gap-4">
            {CONTA_ABERTA.termos.map((t) => (
              <div key={t.termo} className="border-t border-mt-regua-fina pt-3">
                <dt className="text-[14px] font-extrabold">{t.termo}</dt>
                <dd className="m-0 mt-1 text-[14px] leading-relaxed text-mt-neutral-800">{t.definicao}</dd>
              </div>
            ))}
          </dl>
          <p className={TEXTO}>{CONTA_ABERTA.nota}</p>
        </div>
        {exemplo && (
          <aside className="self-start border-2 border-mt-regua p-5">
            <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">
              {rotuloDoExemplo(
                nomeComAno({ marca: exemplo.marca, modelo: exemplo.modelo, versao: exemplo.versao, ano: exemplo.ano_modelo }),
              )}
            </p>
            <div className="mt-4">
              <ContaDoRepasse repasse={exemplo} variante="exemplo" />
            </div>
            {exemplo.sinistro_consta && exemplo.sinistro_detalhe && (
              <p className="m-0 mt-4 text-[13px] leading-snug text-mt-neutral-800">{notaDoSinistro(exemplo.sinistro_detalhe)}</p>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

export function RepasseOuEstoque() {
  const R = REPASSE_OU_ESTOQUE;
  return (
    <section className={SECAO}>
      <Rotulo accent>{R.rotulo}</Rotulo>
      <h2 className={TITULO}>{R.titulo}</h2>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b-2 border-mt-regua text-[11px] tracking-[.12em] text-mt-neutral-600">
              <th scope="col" className="py-2 pr-4">
                <span className="sr-only">{R.rotulo}</span>
              </th>
              <th scope="col" className="py-2 pr-4 font-extrabold text-mt-accent">
                {R.colunaRepasse}
              </th>
              <th scope="col" className="py-2 font-extrabold">
                {R.colunaEstoque}
              </th>
            </tr>
          </thead>
          <tbody>
            {R.linhas.map((linha) => (
              <tr key={linha.tema} className="border-b border-mt-regua-fina align-top">
                <th scope="row" className="py-3 pr-4 font-extrabold">
                  {linha.tema}
                </th>
                <td className="py-3 pr-4">{linha.repasse}</td>
                <td className="py-3">{linha.estoque}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={`#${ANCORA_DO_LOTE}`} className="mt-btn mt-btn-tinta mt-foco">
          {R.verRepasse}
        </a>
        <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
          {R.verEstoque}
        </Link>
      </div>
    </section>
  );
}

export function ServeParaVoce() {
  const S = SERVE_PARA_VOCE;
  return (
    <section className={SECAO}>
      <Rotulo accent>{S.rotulo}</Rotulo>
      <h2 className={TITULO}>{S.titulo}</h2>
      <p className={TEXTO}>{S.texto}</p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em]">{S.serveRotulo}</p>
          <ul className="m-0 mt-3 grid gap-1.5 pl-5 text-[14px]">
            {S.serve.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">{S.naoServeRotulo}</p>
          <ul className="m-0 mt-3 grid gap-1.5 pl-5 text-[14px]">
            {S.naoServe.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mt-4">
            <LinkRegua href="/estoque">{S.link}</LinkRegua>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ComoComprar() {
  return (
    <section className={SECAO}>
      <Rotulo accent>{COMO_COMPRAR.rotulo}</Rotulo>
      <ol className="m-0 mt-6 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-4">
        {COMO_COMPRAR.passos.map((passo) => (
          <li key={passo.numero} className="border-t-2 border-mt-regua pt-3">
            <div className="text-[11px] font-extrabold tracking-[.1em] text-mt-accent">{passo.numero}</div>
            <div className="mt-1 text-[16px] font-extrabold">{passo.titulo}</div>
            <p className="m-0 mt-1.5 text-[13px] leading-snug text-mt-neutral-800">{passo.texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * As dez perguntas, visíveis, e o `FAQPage` do grafo é a mesma lista. Sem
 * link automático no texto (decisão 27 do plano): o linkador ligaria "laudo
 * cautelar" à `/garantia`, a garantia que o repasse justamente não tem.
 */
export function PerguntasDoRepasse({ whatsapp }: { whatsapp: string }) {
  const P = PERGUNTAS_DO_REPASSE_CABECALHO;
  return (
    <section className={SECAO}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Rotulo accent>{P.rotulo}</Rotulo>
          <h2 className={TITULO}>{P.titulo}</h2>
          <p className={TEXTO}>{P.texto}</p>
        </div>
        {whatsapp && (
          <BotaoWhatsApp href={whatsapp} origem="repasse-perguntas" className="mt-btn mt-btn-contorno mt-foco">
            {P.botao}
          </BotaoWhatsApp>
        )}
      </div>
      <dl className="m-0 mt-6 max-w-[760px]">
        {PERGUNTAS_DO_REPASSE.map((p) => (
          <div key={p.pergunta} className="border-t border-mt-regua-fina py-4">
            <dt className="text-[15px] font-extrabold">{p.pergunta}</dt>
            <dd className="m-0 mt-1.5 text-[14px] leading-relaxed text-mt-neutral-800">{p.resposta}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

- [ ] **Step 6: `src/app/repasse/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import CardDoRepasse from "../../components/repasse/CardDoRepasse";
import ContaDoRepasse from "../../components/repasse/ContaDoRepasse";
import ListaDoRepasse from "../../components/repasse/ListaDoRepasse";
import LoteDoRepasse from "../../components/repasse/LoteDoRepasse";
import {
  ComoComprar,
  ContaAberta,
  PerguntasDoRepasse,
  ProvasDoRepasse,
  RepasseOuEstoque,
  ServeParaVoce,
} from "../../components/repasse/SecoesDoRepasse";
import TrilhaDoHeroi from "../../components/repasse/TrilhaDoHeroi";
import { CardVeiculo, LinkRegua, Rotulo } from "../../components/modernist/primitivos";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { patioEmDestaque } from "../../lib/fichaPerdida";
import { grafoDaPaginaDoRepasse } from "../../lib/grafoDoRepasse";
import { lerRepassesPublicos } from "../../lib/leituraDosRepasses";
import { resumoDoLote, type WhatsappDaLoja } from "../../lib/loteDoRepasse";
import { mensagemDePerguntaDoRepasse } from "../../lib/mensagensDoVeiculo";
import { nomeComAno } from "../../lib/nomeDoVeiculo";
import {
  ANCORA_DO_ESTOQUE,
  ANCORA_DO_LOTE,
  CAMINHO_DO_REPASSE,
  COMO_LER_UM_REPASSE,
  DESCRICAO_DO_REPASSE,
  HEROI_DO_REPASSE,
  JA_SAIRAM,
  LOTE_DO_REPASSE,
  PERGUNTAS_DO_REPASSE,
  PRECISA_FINANCIAR,
  TITULO_SEO_DO_REPASSE,
  TRILHA_DO_REPASSE,
  VAZIO_DO_REPASSE,
  linhaDoLote,
  linhaDoReparo,
  textoDoVazio,
  tituloDaContaDoCarro,
  tituloDoLote,
} from "../../lib/paginaDoRepasse";
import { disponiveisDe } from "../../lib/regrasEstoque";
import type { Repasse } from "../../lib/repasse";
import { blocoJsonLd } from "../../lib/schemaListagem";
import { getCachedSettings } from "../../lib/settings";
import { getEstoque, getVeiculoPdpUrl } from "../../lib/supabase";
import { linkWhatsApp } from "../../lib/whatsapp";
import type { Veiculo } from "../../types";

/**
 * `/repasse` — a seção do Repasse Motors (spec §7.1; pranchas "Página
 * /repasse" e "Página /repasse sem carro aberto").
 *
 * Um minuto, como `/estoque` e a ficha: o carro muda de situação pelo painel
 * (reservar, vender, abrir para todos) e nada avisa o site.
 *
 * Ordem das seções, a das pranchas: herói escuro com o seletor de trilha,
 * faixa das quatro provas, lote, "precisa financiar?", "já saíram", a conta
 * aberta, repasse × estoque, "serve para você?", como comprar, lista do
 * repasse, perguntas. Sem carro no lote, o topo vira o do vazio (lista, "já
 * saíram", três carros do estoque com garantia) e a explicação continua
 * embaixo (decisão 20 do plano).
 *
 * A leitura dos repasses NÃO tem `.catch`: numa pane, mostrar "nenhum
 * repasse aberto" seria afirmar o que não se sabe; o ISR segura a última
 * página boa. O estoque tem: ele só alimenta a amostra do vazio e a faixa de
 * preço do `AutoDealer`.
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();
  return {
    title: TITULO_SEO_DO_REPASSE,
    description: DESCRICAO_DO_REPASSE,
    alternates: { canonical: CAMINHO_DO_REPASSE },
    ...montarCompartilhamento({ empresa: companySettings, pagina: "repasse", caminho: CAMINHO_DO_REPASSE }),
  };
}

const MARGEM = "px-[18px] lg:px-10";

export default async function PaginaDoRepasse() {
  const agora = new Date();
  const [visiveis, disponiveis, { companySettings }] = await Promise.all([
    lerRepassesPublicos(agora, CAMINHO_DO_REPASSE),
    getEstoque()
      .then((estoque) => disponiveisDe(estoque))
      .catch((): Veiculo[] => []),
    getCachedSettings(),
  ]);

  const resumo = resumoDoLote(visiveis, agora);
  const vazio = resumo.lote.length === 0;
  // Só o número da loja vai para as ilhas cliente — nunca o `companySettings` inteiro.
  const whatsappDaLoja: WhatsappDaLoja = {
    whatsappRaw: companySettings?.whatsappRaw ?? "",
    whatsapp: companySettings?.whatsapp ?? "",
  };
  const pergunta = linkWhatsApp(whatsappDaLoja, mensagemDePerguntaDoRepasse());
  const grafo = grafoDaPaginaDoRepasse({
    repasses: resumo.lote,
    perguntas: PERGUNTAS_DO_REPASSE,
    trilha: [
      { nome: TRILHA_DO_REPASSE.inicio, caminho: "/" },
      { nome: TRILHA_DO_REPASSE.repasse, caminho: CAMINHO_DO_REPASSE },
    ],
    empresa: companySettings,
    disponiveis,
  });
  const exemplo = resumo.exemploDoHeroi;
  const reparosDoExemplo = exemplo
    ? exemplo.itens_de_estado.filter((i) => typeof i.orcamento === "number" && i.orcamento > 0).map((i) => i.descricao)
    : [];
  const nomeDe = (r: Repasse) => nomeComAno({ marca: r.marca, modelo: r.modelo, versao: r.versao, ano: r.ano_modelo });

  const jaSairam =
    resumo.sairam.length > 0 ? (
      <section className={`border-t-2 border-mt-regua py-12 ${MARGEM}`}>
        <Rotulo accent>{JA_SAIRAM.rotulo}</Rotulo>
        <p className="m-0 mt-2 text-[14px] text-mt-neutral-800">{vazio ? JA_SAIRAM.textoNoVazio : JA_SAIRAM.texto}</p>
        <ul className="m-0 mt-6 grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 desktop:grid-cols-3">
          {resumo.sairam.map((r) => (
            <li key={r.id}>
              <CardDoRepasse repasse={r} whatsappDaLoja={whatsappDaLoja} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="font-modernist">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blocoJsonLd(grafo) }} />

      <section className="bg-mt-inverso-fundo text-mt-inverso">
        <div className={`grid gap-10 py-10 lg:grid-cols-[1.4fr_1fr] lg:py-14 ${MARGEM}`}>
          <div>
            <nav aria-label="Trilha" className="text-[11px] font-semibold tracking-[.16em] text-mt-inverso-suave">
              <Link href="/" className="mt-foco text-mt-inverso-suave no-underline hover:text-mt-inverso">
                {TRILHA_DO_REPASSE.inicio.toUpperCase()}
              </Link>
              {" / "}
              <span className="text-mt-inverso">{TRILHA_DO_REPASSE.repasse.toUpperCase()}</span>
            </nav>
            <p className="m-0 mt-6 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">{HEROI_DO_REPASSE.rotulo}</p>
            <h1 className="mt-titulo m-0 mt-3 text-[38px] lg:text-[64px]">{HEROI_DO_REPASSE.titulo}</h1>
            <p className="m-0 mt-4 max-w-[560px] text-[15px] leading-relaxed text-mt-inverso-suave">{HEROI_DO_REPASSE.texto}</p>
            {!vazio && <TrilhaDoHeroi totalNoLote={resumo.lote.length} />}
            {resumo.atualizacao && (
              <p className="m-0 mt-6 text-[12px] text-mt-inverso-suave">
                {linhaDoLote({ ...resumo.atualizacao, abertos: resumo.abertos.length, soLojistas: resumo.soLojistas })}
              </p>
            )}
          </div>
          {exemplo && (
            <aside className="self-start border-2 border-mt-inverso-regua p-5">
              <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">{COMO_LER_UM_REPASSE.rotulo}</p>
              <p className="m-0 mt-2 text-[20px] font-extrabold">{tituloDaContaDoCarro(nomeDe(exemplo))}</p>
              {reparosDoExemplo.length > 0 && (
                <p className="m-0 mt-1 text-[13px] text-mt-inverso-suave">{linhaDoReparo(reparosDoExemplo)}</p>
              )}
              <div className="mt-4">
                <ContaDoRepasse repasse={exemplo} variante="exemplo" />
              </div>
              {reparosDoExemplo.length > 0 && (
                <p className="m-0 mt-4 text-[12px] leading-snug text-mt-inverso-suave">{COMO_LER_UM_REPASSE.nota}</p>
              )}
            </aside>
          )}
        </div>
      </section>

      <ProvasDoRepasse />

      {vazio ? (
        <>
          <section id={ANCORA_DO_LOTE} className={`scroll-mt-24 py-12 ${MARGEM}`}>
            <Rotulo accent>{LOTE_DO_REPASSE.rotulo}</Rotulo>
            <h2 className="mt-titulo m-0 mt-2 text-3xl md:text-[46px]">{VAZIO_DO_REPASSE.titulo}</h2>
            <p className="m-0 mt-3 max-w-[620px] text-[15px] leading-relaxed text-mt-neutral-800">
              {textoDoVazio(resumo.ultimaSaida)}
            </p>
            <p className="m-0 mt-2 max-w-[620px] text-[15px] leading-relaxed text-mt-neutral-800">{VAZIO_DO_REPASSE.lojista}</p>
            <div className="mt-4">
              <LinkRegua href={`#${ANCORA_DO_ESTOQUE}`}>{VAZIO_DO_REPASSE.enquantoIsso}</LinkRegua>
            </div>
            <div className="mt-8">
              <ListaDoRepasse contexto="vazio" cabecalho={false} />
            </div>
          </section>
          {jaSairam}
          {disponiveis.length > 0 && (
            <section id={ANCORA_DO_ESTOQUE} className={`scroll-mt-24 border-t-2 border-mt-regua py-12 ${MARGEM}`}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <Rotulo accent>{VAZIO_DO_REPASSE.estoqueRotulo}</Rotulo>
                  <h2 className="mt-titulo m-0 mt-2 text-3xl md:text-[40px]">{VAZIO_DO_REPASSE.estoqueTitulo}</h2>
                </div>
                <LinkRegua href="/estoque">{VAZIO_DO_REPASSE.verTodoOEstoque}</LinkRegua>
              </div>
              <ul className="m-0 mt-6 grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 desktop:grid-cols-3">
                {patioEmDestaque(disponiveis, 3).map((v) => (
                  <li key={v.id}>
                    <CardVeiculo veiculo={v} href={getVeiculoPdpUrl(v)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <section id={ANCORA_DO_LOTE} className={`scroll-mt-24 py-12 ${MARGEM}`}>
            <Rotulo accent>{LOTE_DO_REPASSE.rotulo}</Rotulo>
            <h2 className="mt-titulo m-0 mt-2 text-3xl md:text-[46px]">{tituloDoLote(resumo.lote.length)}</h2>
            <LoteDoRepasse lote={resumo.lote} whatsappDaLoja={whatsappDaLoja} />
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-2 border-mt-regua p-5">
              <p className="m-0 max-w-[640px] text-[14px] leading-relaxed">{PRECISA_FINANCIAR.texto}</p>
              <LinkRegua href="/estoque">{PRECISA_FINANCIAR.link}</LinkRegua>
            </div>
          </section>
          {jaSairam}
        </>
      )}

      <ContaAberta exemplo={vazio ? null : resumo.exemploDaConta} />
      <RepasseOuEstoque />
      <ServeParaVoce />
      <ComoComprar />
      {!vazio && (
        <div className={`border-t-2 border-mt-regua py-12 ${MARGEM}`}>
          <ListaDoRepasse contexto="pagina" />
        </div>
      )}
      <PerguntasDoRepasse whatsapp={pergunta} />
    </div>
  );
}
```

Nota ao implementador: `patioEmDestaque` (`src/lib/fichaPerdida.ts:262`) é a amostra do pátio que o "não encontrado" do estoque já usa; conferir a assinatura `(disponiveis: Veiculo[], limite: number): Veiculo[]` antes de usar. Se o teste reprovar no `href="/carros/marca/modelo/versao-1"`, o problema está na amostra, não no mock.

- [ ] **Step 7: Rodar a página e as travas que leem o compartilhamento**

Run: `npx vitest run tests/pagina-do-repasse-no-ar.test.ts tests/compartilhamento-cards.test.ts tests/preview-do-card-nao-mente.test.ts tests/promessa-publica.test.ts`
Expected: PASS.

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Na página, trocar `__html: blocoJsonLd(grafo)` por `__html: blocoJsonLd(grafo.slice(0, 1))` → "são CINCO nós" reprova.
2. Em `schemaDosRepassesAbertos` (`grafoDoRepasse.ts`), trocar o filtro por `estadoDoRepasse(r) !== "vendido"` → "ItemList só dos abertos" reprova (o só-lojistas e o reservado entrariam na lista, servidos pela rota).
3. No vazio, trocar `textoDoVazio(resumo.ultimaSaida)` por `textoDoVazio("23/09")` → "sem venda nenhuma, sem data inventada" reprova.
4. No herói, trocar `tituloDaContaDoCarro(nomeDe(exemplo))` por `tituloDaContaDoCarro("Kwid Zen 2020")` → "o quadro do herói é do carro de verdade" reprova.
5. Tirar o `{!vazio && (…<ListaDoRepasse contexto="pagina" />…)}` → "a lista usa a linha da §7.4" reprova.

- [ ] **Step 9: Commit**

```bash
git add src/components/repasse/TrilhaDoHeroi.tsx src/components/repasse/SecoesDoRepasse.tsx src/app/repasse/page.tsx src/lib/compartilhamento.ts src/types/index.ts tests/pagina-do-repasse-no-ar.test.ts
git commit -m "feat(repasse): a página /repasse, com o lote, a explicação, a lista e o vazio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: A ficha `/repasse/[carro]` — Sonnet

**Files:**
- Create: `src/components/repasse/GaleriaDoRepasse.tsx`
- Create: `src/app/repasse/[carro]/page.tsx`
- Create: `src/app/repasse/[carro]/not-found.tsx`
- Modify: `tests/sem-beco-sem-saida.test.ts` (um `it` para a saída do repasse)
- Test: `tests/ficha-do-repasse-no-ar.test.ts` (novo)

**Interfaces:**
- Consumes: Tasks 1, 2 (`diasDoExame`, `ddmmEmCuritiba`), 4 (`estadoDoRepasse`, `mensagemDoRepasse`), 7 (`lerRepassePorSlug`, `lerRepassePorSufixo`, `lerRepassesPublicos`, `grafoDoRepasse`, `parecidosDoRepasse`, `TIPO_NO_FEED`), 8 (`ContaDoRepasse`, `WhatsappDaLoja`), 9 (`ListaDoRepasse`, `ExameNoPatio`); `aparecePublicamente`, `contaDoRepasse`, `emReais`, `etiquetaDoRepasse`; `generoDeModelo`; `nomeComAno`; `montarCompartilhamento`, `previaDaFotoDoVeiculo`; `NaoEncontradoNoEstoque` (`src/components/NaoEncontradoNoEstoque.tsx`, chamado como função); `CardVeiculo`, `LinkRegua`, `Rotulo`, `formatarKm`, `Etiqueta`; `BotaoWhatsApp`; `getEstoque`, `getVeiculoPdpUrl`; `ehFotoPropria`.
- Produces: rota `/repasse/[carro]` (`revalidate = 60`, `dynamicParams = true`): 200 para publicado, reservado e vendido na carência; `permanentRedirect` para o slug atual quando o pedido não acha slug e o sufixo acha exatamente um carro; `notFound()` no resto. `GaleriaDoRepasse({ fotos: FotoDaGaleria[], etiqueta: EtiquetaDoRepasse })` e `interface FotoDaGaleria { src; alt; defeito: number | null }`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/ficha-do-repasse-no-ar.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";
import { ID_DA_LOJA } from "../src/lib/schemaLoja";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A ficha do repasse renderizada (spec §7.2; molde `ficha-publica-o-grafo`):
 * os nós servidos, os quatro estados, a carência decidida pela página
 * (decisão 14) e o redirect pelo sufixo do slug (decisão 13).
 */
const estado = vi.hoisted(() => ({
  porSlug: {} as Record<string, unknown>,
  porSufixo: [] as unknown[],
  estoque: [] as unknown[],
}));

const EMPRESA = {
  name: "Motors Store",
  phone: "",
  whatsapp: "(41) 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "",
  instagram: "",
  facebook: "",
  cnpj: "",
} as CompanySettings;

vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassePorSlug: async (slug: string) => estado.porSlug[slug] ?? null,
  lerRepassePorSufixo: async () => estado.porSufixo,
  lerRepassesPublicos: async () => [],
}));
vi.mock("../src/lib/supabase", () => ({
  getEstoque: async () => estado.estoque,
  getVeiculoPdpUrl: (v: { id: string }) => `/carros/marca/modelo/versao-${v.id}`,
}));
vi.mock("../src/lib/settings", () => ({ getCachedSettings: async () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/components/Turnstile", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, fetchPriority: _fp, loading: _l, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const ficha = await import("../src/app/repasse/[carro]/page");

const SLUG = "renault-kwid-zen-1-0-2021-3f9a1c";
const ABERTO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z" });
const VENDIDO = repasseDeTeste({ situacao: "vendido", lojistas_desde: "2026-09-10T12:00:00Z", aberto_ao_publico_em: "2026-09-10T12:00:00Z", vendido_em: "2026-09-20T12:00:00Z" });
const VENDIDO_HA_MUITO = repasseDeTeste({ situacao: "vendido", lojistas_desde: "2026-05-01T12:00:00Z", aberto_ao_publico_em: "2026-05-01T12:00:00Z", vendido_em: "2026-05-10T12:00:00Z" });
const ESTOQUE = [
  { id: "1", preco: 45900 },
  { id: "2", preco: 49900 },
  { id: "3", preco: 54900 },
].map(
  (v) =>
    ({
      id: v.id,
      marca: "Fiat",
      modelo: `Modelo ${v.id}`,
      versao: "1.0",
      ano: 2021,
      tipo: "Hatch",
      preco_original: v.preco,
      preco_promocional: 0,
      quilometragem: 30000,
      cambio: "Manual",
      vendido: false,
      web_full_images: [],
      whatsapp_images: [],
    }) as unknown as Veiculo,
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T15:00:00Z")); // qui 24/09, 12h em Curitiba
  estado.porSlug = {};
  estado.porSufixo = [];
  estado.estoque = ESTOQUE;
});
afterEach(() => vi.useRealTimers());

async function servida(carro = SLUG): Promise<string> {
  return renderToStaticMarkup(await ficha.default({ params: Promise.resolve({ carro }) })).replace(/\s+/g, " ");
}

function nos(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const json = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
    return Array.isArray(json) ? json : [json];
  });
}

describe("a ficha do carro aberto a todos", () => {
  it("serve Car, BreadcrumbList, AutoDealer e WebSite — QUATRO, e a oferta aponta para o #dealer emitido", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const grafo = nos(await servida());
    expect(grafo.map((n) => n["@type"])).toEqual(["Car", "BreadcrumbList", "AutoDealer", "WebSite"]);
    const carro = grafo[0] as Record<string, Record<string, unknown>>;
    expect(carro.offers.availability).toBe("https://schema.org/InStock");
    expect(carro.offers.seller).toEqual({ "@id": ID_DA_LOJA });
    expect(grafo[2]["@id"]).toBe(ID_DA_LOJA);
  });

  it("a conta, o WhatsApp com a referência, o exame com os dias de Curitiba e a barra do celular", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const html = await servida();
    expect(html).toContain("R$ 36.900");
    expect(html).toContain("https://wa.me/5541997372165?text=");
    expect(html).toContain(encodeURIComponent("Ref.: repasse 3f9a1c"));
    expect(html).toContain('id="exame"');
    expect(html).toContain("Marque um horário para ver o Kwid");
    expect(html).toContain("Sex 25");
    expect(html).toContain("Sáb 26");
    expect(html).toContain("Seg 28");
    expect(html).toContain("QUERO ESTE");
    expect(html).toContain("ABERTO A TODOS DESDE 24/09");
  });

  it("a ficha de estado, o histórico e o que não vem", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const html = await servida();
    expect(html).toContain('id="ficha-de-estado"');
    expect(html).toContain("Embreagem patinando nas arrancadas");
    expect(html).toContain("Estético, sem orçamento");
    expect(html).toContain("Orçamento da oficina Oficina Exemplo, feito em 22/09.");
    expect(html).toContain("Total orçado R$ 2.020");
    expect(html).toContain("Laudo cautelar aprovado, sai a pedido");
    expect(html).toContain("Feita em 22/09");
    expect(html).toContain("O preço já leva em conta o que não vem.");
  });

  it("três parecidos do estoque com garantia", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const html = await servida();
    expect(html).toContain("Prefere com garantia? Parecidos com este Kwid");
    for (const id of ["1", "2", "3"]) expect(html).toContain(`href="/carros/marca/modelo/versao-${id}"`);
  });
});

describe("os outros estados", () => {
  it("só para lojistas: a faixa no lugar do WhatsApp e do exame", async () => {
    estado.porSlug[SLUG] = LOJISTAS;
    const html = await servida();
    expect(html).toContain("SÓ PARA LOJISTAS");
    expect(html).toContain('href="/repasse#lista-lojista"');
    expect(html).toContain('href="/repasse#lista"');
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain('id="exame"');
    const carro = nos(html)[0] as Record<string, Record<string, unknown>>;
    expect(carro.offers.availability).toBe("https://schema.org/LimitedAvailability");
  });

  it("vendido na carência: fica no ar com VENDIDO, a lista e os parecidos, indexado", async () => {
    estado.porSlug[SLUG] = VENDIDO;
    const html = await servida();
    expect(html).toContain("VENDIDO");
    expect(html).toContain("QUERO RECEBER O PRÓXIMO");
    expect(html).not.toContain('id="exame"');
    const carro = nos(html)[0] as Record<string, Record<string, unknown>>;
    expect(carro.offers.availability).toBe("https://schema.org/SoldOut");
    const meta = await ficha.generateMetadata({ params: Promise.resolve({ carro: SLUG }) });
    expect(meta.robots).toBeUndefined();
  });

  it("vendido depois da carência: não encontrado", async () => {
    estado.porSlug[SLUG] = VENDIDO_HA_MUITO;
    await expect(servida()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("o endereço que não abre carro", () => {
  it("slug antigo: redireciona para o slug atual quando o sufixo acha um carro só", async () => {
    estado.porSufixo = [ABERTO];
    await expect(servida("renault-kwid-2021-3f9a1c")).rejects.toThrow(`NEXT_REDIRECT:/repasse/${SLUG}`);
  });

  it("sufixo que acha dois carros: não adivinha", async () => {
    estado.porSufixo = [ABERTO, { ...ABERTO, slug: "outro-3f9a1c" }];
    await expect(servida("renault-kwid-2021-3f9a1c")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("nada com aquele nome nem com aquele sufixo: não encontrado", async () => {
    await expect(servida("carro-que-nunca-existiu")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("o cabeçalho da ficha", () => {
  it("título do carro, canônico no slug e descrição do resumo", async () => {
    estado.porSlug[SLUG] = ABERTO;
    const meta = await ficha.generateMetadata({ params: Promise.resolve({ carro: SLUG }) });
    expect(meta.title).toBe("Renault Kwid Zen 1.0 2021 no repasse | Motors Store");
    expect(meta.alternates?.canonical).toBe(`/repasse/${SLUG}`);
    expect(meta.description).toBe(ABERTO.resumo);
  });

  it("o endereço que não abre carro tem título próprio", async () => {
    const meta = await ficha.generateMetadata({ params: Promise.resolve({ carro: "nada" }) });
    expect(meta.title).toBe("Repasse não encontrado | Motors Store");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/ficha-do-repasse-no-ar.test.ts`
Expected: FAIL — a rota não existe.

- [ ] **Step 3: `src/components/repasse/GaleriaDoRepasse.tsx`**

```tsx
"use client";

import Image from "next/image";
import { useState } from "react";
import { ehFotoPropria } from "../../lib/fotosDoVeiculo";
import { contadorDaGaleria, rotuloDoDefeito } from "../../lib/paginaDoRepasse";
import type { EtiquetaDoRepasse } from "../../lib/repasse";
import { Etiqueta } from "../modernist/primitivos";

export interface FotoDaGaleria {
  src: string;
  alt: string;
  /** Número do defeito na ficha de estado; null para foto do carro. */
  defeito: number | null;
}

/**
 * A galeria da ficha do repasse (prancha "Ficha do carro de repasse"): as
 * fotos do carro e, depois delas, as fotos de defeito da ficha de estado,
 * marcadas. Foto nossa (bucket `veiculos`) vai sem otimizador, como no card
 * do estoque — o checklist do painel só publica foto nossa.
 */
export default function GaleriaDoRepasse({ fotos, etiqueta }: { fotos: FotoDaGaleria[]; etiqueta: EtiquetaDoRepasse }) {
  const [atual, setAtual] = useState(0);
  const defeitos = fotos.filter((f) => f.defeito !== null).length;
  const foto = fotos.length > 0 ? fotos[Math.min(atual, fotos.length - 1)] : null;

  return (
    <div>
      <div className="relative aspect-[4/3] bg-mt-neutral-300">
        {foto && (
          <Image
            key={foto.src}
            src={foto.src}
            alt={foto.alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 58vw"
            unoptimized={ehFotoPropria(foto.src)}
            className="object-cover"
          />
        )}
        <Etiqueta accent={etiqueta === "COM LAUDO"} className="pointer-events-none absolute left-0 top-0 text-[10px]">
          {etiqueta}
        </Etiqueta>
        {fotos.length > 0 && (
          <span className="pointer-events-none absolute bottom-0 right-0 bg-[rgba(20,18,18,.82)] px-2 py-1 text-[11px] font-semibold text-mt-inverso">
            {contadorDaGaleria(atual + 1, fotos.length, defeitos)}
          </span>
        )}
      </div>
      {fotos.length > 1 && (
        <ul className="m-0 mt-2 flex list-none gap-2 overflow-x-auto p-0">
          {fotos.map((f, i) => (
            <li key={`${i}-${f.src}`} className="shrink-0">
              <button
                type="button"
                aria-label={f.alt}
                aria-pressed={i === atual}
                onClick={() => setAtual(i)}
                className={`mt-foco relative block h-16 w-20 border-2 ${
                  f.defeito !== null ? "border-mt-accent" : i === atual ? "border-mt-ink" : "border-transparent"
                }`}
              >
                <Image src={f.src} alt="" fill sizes="80px" unoptimized={ehFotoPropria(f.src)} className="object-cover" />
                {f.defeito !== null && (
                  <span className="absolute inset-x-0 bottom-0 bg-mt-accent px-1 text-[8px] font-extrabold tracking-[.08em] text-mt-inverso">
                    {rotuloDoDefeito(f.defeito)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `src/app/repasse/[carro]/page.tsx`**

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Fragment } from "react";
import BotaoWhatsApp from "../../../components/modernist/BotaoWhatsApp";
import { CardVeiculo, LinkRegua, Rotulo, formatarKm } from "../../../components/modernist/primitivos";
import ContaDoRepasse from "../../../components/repasse/ContaDoRepasse";
import ExameNoPatio from "../../../components/repasse/ExameNoPatio";
import GaleriaDoRepasse, { type FotoDaGaleria } from "../../../components/repasse/GaleriaDoRepasse";
import ListaDoRepasse from "../../../components/repasse/ListaDoRepasse";
import { montarCompartilhamento, previaDaFotoDoVeiculo } from "../../../lib/compartilhamento";
import { diasDoExame } from "../../../lib/exameNoPatio";
import { ehFotoPropria } from "../../../lib/fotosDoVeiculo";
import { generoDeModelo } from "../../../lib/generoDoVeiculo";
import { grafoDoRepasse } from "../../../lib/grafoDoRepasse";
import { ddmmEmCuritiba } from "../../../lib/horarioDaLoja";
import { lerRepassePorSlug, lerRepassePorSufixo, lerRepassesPublicos } from "../../../lib/leituraDosRepasses";
import type { WhatsappDaLoja } from "../../../lib/loteDoRepasse";
import { mensagemDoRepasse } from "../../../lib/mensagensDoVeiculo";
import { nomeComAno } from "../../../lib/nomeDoVeiculo";
import {
  ANCORA_DA_CONTA,
  ANCORA_DA_FICHA_DE_ESTADO,
  ANCORA_DA_LISTA,
  ANCORA_DA_LISTA_LOJISTA,
  ANCORA_DO_EXAME,
  CAMINHO_DO_REPASSE,
  CARD_DO_REPASSE,
  DESCRICAO_DO_REPASSE,
  FICHA_DO_REPASSE,
  NAO_ENCONTRADO_NO_REPASSE,
  PERGUNTAS_DO_REPASSE_CABECALHO,
  TRILHA_DO_REPASSE,
  abaixoDaFipeNaBarra,
  anosDoCarro,
  constaNoHistorico,
  consultaFeitaEm,
  laudoNaListaRapida,
  laudoNoHistorico,
  orcamentoDaOficina,
  seloDeAberto,
  textoAlternativoDaFoto,
  tituloDaFichaNaBusca,
  tituloDoExame,
  tituloDosParecidos,
} from "../../../lib/paginaDoRepasse";
import { disponiveisDe } from "../../../lib/regrasEstoque";
import {
  aparecePublicamente,
  contaDoRepasse,
  emReais,
  estadoDoRepasse,
  etiquetaDoRepasse,
  type Repasse,
} from "../../../lib/repasse";
import { blocoJsonLd } from "../../../lib/schemaListagem";
import { getCachedSettings } from "../../../lib/settings";
import { TIPO_NO_FEED, parecidosDoRepasse } from "../../../lib/similares";
import { getEstoque, getVeiculoPdpUrl } from "../../../lib/supabase";
import { linkWhatsApp } from "../../../lib/whatsapp";
import type { Veiculo } from "../../../types";

/**
 * A ficha do carro de repasse (spec §7.2; pranchas "Ficha do carro de
 * repasse" e "Ficha no celular com a barra fixa").
 *
 * Quem decide se a ficha existe é a PÁGINA (decisão 14): a leitura por slug
 * devolve o carro mesmo com a carência vencida, e `aparecePublicamente` falso
 * vira `notFound()`. Vendido na carência fica no ar e indexado, com o selo, a
 * lista do repasse e os parecidos — igual ao estoque.
 *
 * Slug que não abre carro procura o carro pelo sufixo (decisão 13): o slug
 * muda quando alguém corrige marca, modelo ou ano no painel, e o sufixo — os 6
 * primeiros do uuid — não. Achou exatamente um, 308 para o slug atual; zero ou
 * mais de um, não encontrado.
 *
 * Quatro estados (`estadoDoRepasse`): aberto a todos (WhatsApp, exame, barra
 * fixa), só para lojistas (a faixa no lugar do WhatsApp e do exame, decisão
 * 4), reservado e vendido (sem exame; a lista do repasse e o WhatsApp de
 * pergunta, decisão 30 do plano).
 */
export const revalidate = 60;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ carro: string }>;
}

export async function generateStaticParams() {
  const repasses = await lerRepassesPublicos(new Date(), "/repasse/[carro]").catch((): Repasse[] => []);
  return repasses.map((r) => ({ carro: r.slug }));
}

const nomeDe = (r: Repasse) => nomeComAno({ marca: r.marca, modelo: r.modelo, versao: r.versao, ano: r.ano_modelo });

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { carro } = await params;
  const r = await lerRepassePorSlug(carro).catch(() => null);
  if (!r || !aparecePublicamente(r, new Date())) {
    return { title: NAO_ENCONTRADO_NO_REPASSE.tituloNaBusca, description: NAO_ENCONTRADO_NO_REPASSE.descricaoNaBusca };
  }
  const nome = nomeDe(r);
  const caminho = `${CAMINHO_DO_REPASSE}/${r.slug}`;
  const estado = estadoDoRepasse(r);
  const { companySettings } = await getCachedSettings();
  const previa = previaDaFotoDoVeiculo(r.whatsapp_images[0] ?? r.web_full_images[0] ?? "");
  return {
    title: tituloDaFichaNaBusca(nome),
    description: r.resumo ?? DESCRICAO_DO_REPASSE,
    alternates: { canonical: caminho },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "pdp",
      rotulo: TRILHA_DO_REPASSE.repasse,
      // Reservado e vendido não anunciam preço no card — a régua da ficha do estoque.
      tituloPadrao: estado === "aberto" || estado === "lojistas" ? `${nome} · ${emReais(r.preco)}` : nome,
      descricaoPadrao: r.resumo ?? DESCRICAO_DO_REPASSE,
      caminho,
      imagemPreferida: previa.url,
      imagemPreferidaSemDimensao: previa.semDimensao,
    }),
  };
}

const MARGEM = "px-[18px] lg:px-10";
const SECAO = `border-t-2 border-mt-regua py-10 ${MARGEM}`;
const TITULO = "mt-titulo m-0 mt-2 text-[28px] lg:text-[36px]";

export default async function FichaDoRepasse({ params }: PageProps) {
  const { carro } = await params;
  const agora = new Date();

  const r = await lerRepassePorSlug(carro);
  if (!r) {
    const candidatos = await lerRepassePorSufixo(carro.slice(-6));
    if (candidatos.length === 1 && candidatos[0].slug !== carro) {
      permanentRedirect(`${CAMINHO_DO_REPASSE}/${candidatos[0].slug}`);
    }
    notFound();
  }
  if (!aparecePublicamente(r, agora)) notFound();
  const estado = estadoDoRepasse(r);
  if (!estado) notFound();

  const [estoque, { companySettings }] = await Promise.all([
    getEstoque()
      .then((lista) => disponiveisDe(lista))
      .catch((): Veiculo[] => []),
    getCachedSettings(),
  ]);

  const F = FICHA_DO_REPASSE;
  const nome = nomeDe(r);
  const caminho = `${CAMINHO_DO_REPASSE}/${r.slug}`;
  const conta = contaDoRepasse(r);
  const genero = generoDeModelo(r.modelo, { tipo: r.carroceria ? TIPO_NO_FEED[r.carroceria] : "" });
  const parecidos = parecidosDoRepasse(r, estoque);
  const whatsappDaLoja: WhatsappDaLoja = {
    whatsappRaw: companySettings?.whatsappRaw ?? "",
    whatsapp: companySettings?.whatsapp ?? "",
  };
  const whatsapp = estado === "lojistas" ? "" : linkWhatsApp(whatsappDaLoja, mensagemDoRepasse(r, estado));
  const grafo = grafoDoRepasse({
    repasse: r,
    caminho,
    trilha: [
      { nome: TRILHA_DO_REPASSE.inicio, caminho: "/" },
      { nome: TRILHA_DO_REPASSE.repasse, caminho: CAMINHO_DO_REPASSE },
      { nome, caminho },
    ],
    empresa: companySettings,
    disponiveis: estoque,
  });

  const defeitosComFoto = r.itens_de_estado.flatMap((item) => (item.foto ? [{ ...item, foto: item.foto }] : []));
  const fotos: FotoDaGaleria[] = [
    ...r.web_full_images.map((src, i) => ({ src, alt: textoAlternativoDaFoto(nome, i + 1), defeito: null })),
    ...defeitosComFoto.map((item, i) => ({ src: item.foto, alt: `${item.descricao}, ${item.local}`, defeito: i + 1 })),
  ];
  const especificacoes = [anosDoCarro(r), formatarKm(r.quilometragem), r.cambio, r.combustivel, r.cor]
    .filter(Boolean)
    .join(" · ");
  const selo =
    estado === "aberto"
      ? seloDeAberto(ddmmEmCuritiba(r.aberto_ao_publico_em) ?? "")
      : estado === "lojistas"
        ? F.seloLojistas
        : estado === "reservado"
          ? F.seloReservado
          : F.seloVendido;
  const consulta = ddmmEmCuritiba(r.historico_consultado_em);
  const historico: Array<[string, string]> = [
    [F.laudo, laudoNoHistorico(r.laudo, r.laudo_apontamento)],
    [F.leilao, constaNoHistorico(r.leilao_consta, r.leilao_detalhe)],
    [F.sinistro, constaNoHistorico(r.sinistro_consta, r.sinistro_detalhe)],
    [F.documento, F.documentoValor],
    [F.transferenciaRotulo, F.transferenciaValor],
    ...(consulta ? [[F.consulta, consultaFeitaEm(consulta)] as [string, string]] : []),
  ];
  const abaixo = conta.abaixoDaFipe !== null && conta.abaixoDaFipe > 0 ? conta.abaixoDaFipe : null;

  return (
    <div className="font-modernist pb-24 lg:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blocoJsonLd(grafo) }} />

      <nav aria-label="Trilha" className={`pt-8 text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600 lg:pt-11 ${MARGEM}`}>
        <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
          {TRILHA_DO_REPASSE.inicio.toUpperCase()}
        </Link>
        {" / "}
        <Link href={CAMINHO_DO_REPASSE} className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
          {TRILHA_DO_REPASSE.repasse.toUpperCase()}
        </Link>
        {" / "}
        <span className="text-mt-ink">{nome.toUpperCase()}</span>
      </nav>

      <section className={`grid gap-8 pt-6 lg:grid-cols-[1.35fr_1fr] ${MARGEM}`}>
        <GaleriaDoRepasse fotos={fotos} etiqueta={etiquetaDoRepasse(r)} />
        <div>
          <p className="m-0 text-[11px] font-semibold tracking-[.16em] text-mt-accent">{r.marca.toUpperCase()}</p>
          <h1 className="mt-titulo m-0 mt-1 text-[34px] lg:text-[44px]">{[r.modelo, r.versao].filter(Boolean).join(" ")}</h1>
          <p className="m-0 mt-2 text-[13px] text-mt-neutral-700">{especificacoes}</p>
          <span className="mt-etiqueta mt-3 inline-block">{selo}</span>

          <div className={`mt-6 ${estado === "reservado" || estado === "vendido" ? "opacity-60" : ""}`}>
            <ContaDoRepasse
              repasse={r}
              variante="ficha"
              carroNaFipe={[r.modelo, r.versao, String(r.ano_modelo)].filter(Boolean).join(" ")}
            />
          </div>

          {estado === "aberto" && (
            <div className="mt-6 flex flex-wrap gap-3">
              {whatsapp && (
                <BotaoWhatsApp href={whatsapp} origem="repasse-ficha">
                  {F.quero}
                </BotaoWhatsApp>
              )}
              <a href={`#${ANCORA_DO_EXAME}`} className="mt-btn mt-btn-contorno mt-foco">
                {F.marcarExame}
              </a>
            </div>
          )}

          {estado === "lojistas" && (
            <div className="mt-6 border-2 border-mt-ink p-5">
              <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">{CARD_DO_REPASSE.soLojistas}</p>
              <p className="m-0 mt-1 text-[14px]">{CARD_DO_REPASSE.soLojistasTexto}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Link href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA_LOJISTA}`} className="mt-btn mt-btn-tinta mt-foco">
                  {CARD_DO_REPASSE.cadastrarCnpj}
                </Link>
                <Link href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA}`} className="mt-link-regua mt-foco">
                  {CARD_DO_REPASSE.aviseQuandoAbrir}
                </Link>
              </div>
            </div>
          )}

          {(estado === "reservado" || estado === "vendido") && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <a href={`#${ANCORA_DA_LISTA}`} className="mt-btn mt-btn-tinta mt-foco">
                {estado === "reservado" ? CARD_DO_REPASSE.aviseSeVoltar : CARD_DO_REPASSE.entrarNaLista}
              </a>
              {whatsapp && (
                <BotaoWhatsApp href={whatsapp} origem="repasse-ficha" className="mt-btn mt-btn-contorno mt-foco">
                  {PERGUNTAS_DO_REPASSE_CABECALHO.botao}
                </BotaoWhatsApp>
              )}
            </div>
          )}

          <ul className="m-0 mt-6 grid list-none gap-2 p-0 text-[13px]">
            <li className={r.laudo === "aprovado" || r.laudo === "aprovado_com_apontamento" ? "font-semibold text-mt-ink" : ""}>
              {laudoNaListaRapida(r.laudo)}
            </li>
            <li>{F.semGarantia}</li>
            <li>{F.aVista}</li>
            <li>{F.transferencia}</li>
          </ul>
        </div>
      </section>

      {r.motivo && (
        <section className={`mt-10 ${SECAO}`}>
          <Rotulo accent>{F.motivoRotulo}</Rotulo>
          {conta.reparoOrcado > 0 && <h2 className={TITULO}>{F.motivoComReparo}</h2>}
          <p className="m-0 mt-3 max-w-[680px] text-[15px] leading-relaxed text-mt-neutral-800">{r.motivo}</p>
        </section>
      )}

      <section id={ANCORA_DA_FICHA_DE_ESTADO} className={`scroll-mt-24 ${SECAO}`}>
        <Rotulo accent>{F.fichaRotulo}</Rotulo>
        <h2 className={TITULO}>{F.fichaTitulo}</h2>
        <p className="m-0 mt-2 max-w-[620px] text-[14px] leading-relaxed text-mt-neutral-800">{F.fichaTexto}</p>
        {r.sem_defeitos_conhecidos || r.itens_de_estado.length === 0 ? (
          <p className="m-0 mt-6 text-[14px] font-semibold">{F.semDefeitos}</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b-2 border-mt-regua text-[11px] tracking-[.12em] text-mt-neutral-600">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {F.colunaFoto}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {F.colunaItem}
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    {F.colunaOrcamento}
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.itens_de_estado.map((item, i) => (
                  <tr key={`${i}-${item.descricao}`} className="border-b border-mt-regua-fina align-top">
                    <td className="py-3 pr-4">
                      {item.foto ? (
                        <Image
                          src={item.foto}
                          alt={`${item.descricao}, ${item.local}`}
                          width={96}
                          height={72}
                          unoptimized={ehFotoPropria(item.foto)}
                          className="h-[72px] w-24 object-cover"
                        />
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <strong className="block text-mt-ink">{item.descricao}</strong>
                      <span className="text-mt-neutral-700">{item.local}</span>
                    </td>
                    <td className="py-3 text-right">
                      {typeof item.orcamento === "number" && item.orcamento > 0
                        ? emReais(item.orcamento)
                        : item.estetico
                          ? F.estetico
                          : F.semOrcamento}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {conta.reparoOrcado > 0 && (
          <div className="mt-4 flex flex-wrap justify-between gap-3 text-[13px]">
            {r.oficina_do_orcamento && r.orcamento_em && (
              <span className="text-mt-neutral-700">
                {orcamentoDaOficina(r.oficina_do_orcamento, ddmmEmCuritiba(r.orcamento_em) ?? "")}
              </span>
            )}
            <span className="font-extrabold">
              {F.totalOrcado} {emReais(conta.reparoOrcado)}
            </span>
          </div>
        )}
      </section>

      <section className={SECAO}>
        <Rotulo accent>{F.historicoRotulo}</Rotulo>
        <dl className="m-0 mt-4 grid max-w-[720px] grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
          {historico.map(([rotulo, valor]) => (
            <Fragment key={rotulo}>
              <dt className="font-semibold">{rotulo}</dt>
              <dd className="m-0 text-mt-neutral-800">{valor}</dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <section className={SECAO}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <Rotulo accent>{F.naoVemRotulo}</Rotulo>
            <ul className="m-0 mt-4 grid list-none gap-2 p-0 text-[14px]">
              {F.naoVem.map((item) => (
                <li key={item}>
                  <span aria-hidden="true" className="mr-2 font-extrabold text-mt-accent">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="m-0 text-[18px] font-extrabold">{F.naoVemDestaque}</p>
            <p className="m-0 mt-2 text-[14px] leading-relaxed text-mt-neutral-800">{F.naoVemTexto}</p>
            <div className="mt-4">
              <LinkRegua href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_CONTA}`}>{F.entenda}</LinkRegua>
            </div>
          </div>
        </div>
      </section>

      {estado === "aberto" && (
        <ExameNoPatio
          carro={{ id: r.id, slug: r.slug, marca: r.marca, modelo: r.modelo, versao: r.versao, ano_modelo: r.ano_modelo, preco: r.preco }}
          dias={diasDoExame(agora)}
          titulo={tituloDoExame(r.modelo, genero)}
        />
      )}

      {(estado === "reservado" || estado === "vendido") && (
        <div className={SECAO}>
          <ListaDoRepasse contexto="ficha" />
        </div>
      )}

      {parecidos.length > 0 && (
        <section className={SECAO}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Rotulo accent>{F.parecidosRotulo}</Rotulo>
              <h2 className={TITULO}>{tituloDosParecidos(r.modelo, genero)}</h2>
            </div>
            <LinkRegua href="/estoque">{F.verOEstoque}</LinkRegua>
          </div>
          <ul className="m-0 mt-6 grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 desktop:grid-cols-3">
            {parecidos.map((v) => (
              <li key={v.id}>
                <CardVeiculo veiculo={v} href={getVeiculoPdpUrl(v)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {estado === "aberto" && whatsapp && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t-2 border-mt-regua bg-mt-bg px-[18px] py-3 lg:hidden">
          <div>
            <div className="text-[20px] font-extrabold tracking-[-.02em]">{emReais(conta.preco)}</div>
            <div className="text-[11px] text-mt-neutral-700">
              {F.aVistaCurto}
              {abaixo !== null && (
                <>
                  {" · "}
                  <strong className="text-mt-accent">{abaixoDaFipeNaBarra(emReais(abaixo))}</strong>
                </>
              )}
            </div>
          </div>
          <BotaoWhatsApp href={whatsapp} origem="repasse-barra">
            {F.queroEste}
          </BotaoWhatsApp>
        </div>
      )}
    </div>
  );
}
```

Nota ao implementador: `r` é `Repasse | null` até o `notFound()`, que devolve `never` — o TypeScript estreita sozinho. `mensagemDoRepasse(r, estado)` só roda fora do ramo `"lojistas"`, e o tipo `EstadoDoRepasseNaMensagem` confere isso.

- [ ] **Step 5: `src/app/repasse/[carro]/not-found.tsx`**

```tsx
import NaoEncontradoNoEstoque from "../../../components/NaoEncontradoNoEstoque";
import ListaDoRepasse from "../../../components/repasse/ListaDoRepasse";
import { CAMINHO_DO_REPASSE, NAO_ENCONTRADO_NO_REPASSE, TRILHA_DO_REPASSE } from "../../../lib/paginaDoRepasse";

/**
 * O carro de repasse que não abre — arquivado, vendido depois da carência,
 * slug que nunca existiu (spec §7.2; regra do dono de 20/09: nenhum endereço
 * termina em beco). Status e metadata continuam 404 (`generateMetadata` da
 * rota); o corpo é o da casa, `NaoEncontradoNoEstoque` — amostra do pátio e
 * trilhas —, com a lista do repasse no lugar da encomenda: quem chegou atrás
 * de um repasse quer o próximo, não um carro encomendado.
 */
export default async function RepasseNaoEncontrado() {
  return NaoEncontradoNoEstoque({
    titulo: NAO_ENCONTRADO_NO_REPASSE.titulo,
    texto: NAO_ENCONTRADO_NO_REPASSE.texto,
    textoDaAmostra: NAO_ENCONTRADO_NO_REPASSE.textoDaAmostra,
    trilha: [
      { rotulo: TRILHA_DO_REPASSE.inicio, href: "/" },
      { rotulo: TRILHA_DO_REPASSE.repasse, href: CAMINHO_DO_REPASSE },
    ],
    encomenda: () => <ListaDoRepasse contexto="nao-encontrado" />,
  });
}
```

- [ ] **Step 6: A saída do repasse na trava "sem beco"**

Em `tests/sem-beco-sem-saida.test.ts`, depois do `it("a raiz existe — é ela que cobre o site inteiro", …)`, acrescentar:
```ts
  it("o carro de repasse que não abre tem saída própria, com a lista no lugar da encomenda", () => {
    // Não entra em SAIDAS porque a encomenda ali não serve: quem chegou atrás
    // de um repasse quer o próximo repasse (spec 2026-09-24 §7.2).
    const caminho = join(raizDoApp, "repasse", "[carro]", "not-found.tsx");
    expect(existsSync(caminho), "falta src/app/repasse/[carro]/not-found.tsx").toBe(true);
    const fonte = readFileSync(caminho, "utf8");
    expect(fonte).toContain("NaoEncontradoNoEstoque");
    expect(fonte).toContain("ListaDoRepasse");
  });
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run tests/ficha-do-repasse-no-ar.test.ts tests/sem-beco-sem-saida.test.ts tests/promessa-publica.test.ts tests/paginas-institucionais.test.ts`
Expected: PASS.

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Trocar `__html: blocoJsonLd(grafo)` por `__html: blocoJsonLd(grafo.slice(0, 1))` → "…QUATRO, e a oferta aponta para o #dealer emitido" reprova.
2. Apagar `if (!aparecePublicamente(r, agora)) notFound();` → "vendido depois da carência: não encontrado" reprova.
3. Trocar `candidatos.length === 1` por `candidatos.length >= 1` → "sufixo que acha dois carros: não adivinha" reprova.
4. Trocar `const whatsapp = estado === "lojistas" ? "" : …` por `const whatsapp = linkWhatsApp(whatsappDaLoja, mensagemDoRepasse(r, "aberto"));` e mostrar o botão para `lojistas` → "só para lojistas: … sem WhatsApp" reprova.
5. Trocar `dias={diasDoExame(agora)}` por `dias={diasDoExame(new Date("2026-09-24T02:00:00Z"))}` → o `it` dos dias ("Seg 28") reprova — prova que o teste lê os dias da hora do pedido.
6. No `not-found.tsx`, trocar `ListaDoRepasse` por `EncomendaDaFichaPerdida` → o `it` novo de `sem-beco-sem-saida` reprova.

- [ ] **Step 9: Commit**

```bash
git add src/components/repasse/GaleriaDoRepasse.tsx "src/app/repasse/[carro]/page.tsx" "src/app/repasse/[carro]/not-found.tsx" tests/ficha-do-repasse-no-ar.test.ts tests/sem-beco-sem-saida.test.ts
git commit -m "feat(repasse): a ficha do carro, com o exame, a barra fixa e o redirect pelo sufixo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: O sitemap e a `/privacidade` da §7.4 — Sonnet

**Files:**
- Modify: `src/app/sitemap.ts` (leitura paralela dos repasses; `/repasse` e as fichas; `ATUALIZACAO_INSTITUCIONAL`)
- Modify: `src/app/privacidade/page.tsx` (as quatro inserções aprovadas, o comentário de "Consentimento", `ULTIMA_ATUALIZACAO`)
- Test: `tests/sitemap-anuncia-o-repasse.test.ts` e `tests/privacidade-lista-do-repasse.test.ts` (novos)

**Interfaces:**
- Consumes: `lerRepassesPublicos(agora, rota)` (Task 7); `publicadoEm` (Task 8); `Repasse`.
- Produces: `/repasse` sempre no sitemap; `/repasse/<slug>` para publicado (aberto ou só-lojistas) e reservado; vendido fora. A `/privacidade` declara a lista do repasse ANTES de o formulário ir ao ar (mesmo PR, spec §7.4).

- [ ] **Step 1: Escrever os testes que falham**

`tests/sitemap-anuncia-o-repasse.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SITE_URL } from "../src/lib/site";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * O sitemap, montado de verdade, na parte do repasse (spec §7.2): `/repasse`
 * sempre, as fichas publicadas e reservadas, numa leitura paralela com o
 * próprio `.catch()` — uma pane no repasse não tira o resto do site do
 * sitemap. Mocks no molde de `sitemap-anuncia-os-guias`.
 */
vi.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: T) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));
vi.mock("../src/lib/supabase", () => ({
  getCarimbosDeConteudo: async () => ({}),
  getEstoque: async () => [],
  getUltimasPresencas: async () => ({}),
  getVeiculoPdpUrl: () => "/carros/x/y/z-1",
}));
vi.mock("../src/lib/publicacao", () => ({
  getDatasDeVenda: async () => ({}),
  decidirPublicacao: () => ({ indisponivel: false, noindex: false, rotulo: "" }),
}));
vi.mock("../src/lib/guiasDoBanco", () => ({
  listarGuiasPublicados: async () => [],
  buscarGuiaPublicado: async () => null,
  GuiasIndisponiveisError: class extends Error {},
}));
vi.mock("../src/lib/settings", () => ({ getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }) }));

const estado = vi.hoisted(() => ({ repasses: [] as unknown[], falha: false }));
vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassesPublicos: async () => {
    if (estado.falha) throw new Error("banco fora");
    return estado.repasses;
  },
}));

const ABERTO = repasseDeTeste({ slug: "aberto-aaaaaa", situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ slug: "lojistas-bbbbbb", situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z" });
const RESERVADO = repasseDeTeste({ slug: "reservado-cccccc", situacao: "reservado", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-20T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z" });
const VENDIDO = repasseDeTeste({ slug: "vendido-dddddd", situacao: "vendido", lojistas_desde: "2026-09-10T12:00:00Z", aberto_ao_publico_em: "2026-09-10T12:00:00Z", vendido_em: "2026-09-20T12:00:00Z" });

async function sitemapMontado() {
  const { default: sitemap } = await import("../src/app/sitemap");
  return sitemap();
}

beforeEach(() => {
  estado.repasses = [ABERTO, LOJISTAS, RESERVADO, VENDIDO];
  estado.falha = false;
});

describe("o sitemap anuncia o repasse", () => {
  it("a página e as fichas publicadas e reservadas; o vendido fica fora", async () => {
    const urls = (await sitemapMontado()).map((r) => r.url);
    expect(urls).toContain(`${SITE_URL}/repasse`);
    for (const r of [ABERTO, LOJISTAS, RESERVADO]) expect(urls).toContain(`${SITE_URL}/repasse/${r.slug}`);
    expect(urls).not.toContain(`${SITE_URL}/repasse/${VENDIDO.slug}`);
  });

  it("o lastmod da ficha é a publicação, e o da página é a mais recente", async () => {
    const rotas = await sitemapMontado();
    const ficha = rotas.find((r) => r.url.endsWith(`/repasse/${ABERTO.slug}`));
    expect(ficha?.lastModified).toEqual(new Date("2026-09-24T12:00:00Z"));
    const pagina = rotas.find((r) => r.url === `${SITE_URL}/repasse`);
    expect(pagina?.lastModified).toEqual(new Date("2026-09-24T12:00:00Z"));
  });

  it("pane na leitura do repasse: a página continua, as fichas somem, o resto do site fica", async () => {
    estado.falha = true;
    const urls = (await sitemapMontado()).map((r) => r.url);
    expect(urls).toContain(`${SITE_URL}/repasse`);
    expect(urls.some((u) => u.includes("/repasse/"))).toBe(false);
    expect(urls).toContain(`${SITE_URL}/estoque`);
    expect(urls).toContain(`${SITE_URL}/guias`);
  });
});
```

`tests/privacidade-lista-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * As quatro inserções da spec §7.4, APROVADAS pelo dono em 24/09, na
 * `/privacidade` — no mesmo PR que liga o formulário da lista (a régua do
 * registro de erros de 11/09: a finalidade é declarada antes de a coleta
 * começar). O texto é conferido como a pessoa o lê: sem comentário, sem tag,
 * com o espaço colapsado.
 */
const POLITICA = "src/app/privacidade/page.tsx";
const codigo = lerCodigo(POLITICA);
const naTela = (fonte: string) =>
  fonte
    .replace(/\{"\s*"\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();

function secao(id: string, proxima: string): string {
  const inicio = codigo.indexOf(`<Secao id="${id}"`);
  const fim = codigo.indexOf(`<Secao id="${proxima}"`, inicio);
  expect(inicio, `seção ${id}`).toBeGreaterThan(-1);
  expect(fim, `seção ${proxima}`).toBeGreaterThan(inicio);
  return naTela(codigo.slice(inicio, fim));
}

describe("a /privacidade declara a lista do repasse (§7.4)", () => {
  it("em Quais dados coletamos, depois do parágrafo dos formulários", () => {
    const dados = secao("dados", "finalidades");
    const frase =
      "Quando você entra na lista do repasse. Pedimos nome e WhatsApp, a faixa de preço e os tipos de carro que você procura. Se você é lojista, pedimos também o CNPJ, o nome da loja e a cidade.";
    expect(dados).toContain(frase);
    expect(dados.indexOf(frase)).toBeGreaterThan(dados.indexOf("Quando você preenche um formulário."));
    expect(dados.indexOf(frase)).toBeLessThan(dados.indexOf("Enquanto você navega."));
  });

  it("em Para que usamos, o item novo", () => {
    expect(secao("finalidades", "bases-legais")).toContain(
      "Avisar sobre carros de repasse. Quem está na lista recebe pelo WhatsApp os carros de repasse que combinam com a faixa e os tipos informados. Lojistas cadastrados recebem o aviso antes de o carro abrir para todos. Quem envia é uma pessoa da nossa equipe, não um disparo automático.",
    );
  });

  it("em Bases legais, o Consentimento volta — para a lista", () => {
    expect(secao("bases-legais", "cookies")).toContain(
      "Consentimento — para a lista do repasse. Você escolhe entrar e pode sair quando quiser, pedindo pelo WhatsApp ou pelos canais da seção Como falar conosco.",
    );
    // O comentário que dizia que o item saiu em 31/08 passa a dizer que ele voltou, e por quê.
    expect(ler(POLITICA)).toContain('o item "Consentimento" volta, com outra finalidade');
  });

  it("em Por quanto tempo guardamos, depois do parágrafo dos dados de contato", () => {
    const retencao = secao("retencao", "direitos");
    const frase =
      "Os dados da lista do repasse ficam guardados enquanto você estiver na lista. Quando você sai, apagamos a faixa de preço, os tipos de carro e, no caso de lojistas, o CNPJ e os dados da loja. O registro de contato segue a regra do parágrafo acima.";
    expect(retencao).toContain(frase);
    expect(retencao.indexOf(frase)).toBeGreaterThan(retencao.indexOf("Esses dados de contato"));
    expect(retencao.indexOf(frase)).toBeLessThan(retencao.indexOf("Dados de navegação e publicidade"));
  });

  it("nenhuma inserção fala em aceite (a trava B.6 vale para a página inteira)", () => {
    for (const [id, proxima] of [
      ["dados", "finalidades"],
      ["finalidades", "bases-legais"],
      ["bases-legais", "cookies"],
      ["retencao", "direitos"],
    ]) {
      expect(secao(id, proxima)).not.toMatch(/aceit/i);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/sitemap-anuncia-o-repasse.test.ts tests/privacidade-lista-do-repasse.test.ts`
Expected: FAIL — o sitemap não lê o repasse e a política não tem as inserções.

- [ ] **Step 3: O sitemap**

Em `src/app/sitemap.ts`:
1. Imports, depois de `import { campanhasVivas, caminhoDaCampanha } from "../lib/campanhas";`:
   ```ts
   import { lerRepassesPublicos } from "../lib/leituraDosRepasses";
   import { publicadoEm } from "../lib/loteDoRepasse";
   import type { Repasse } from "../lib/repasse";
   ```
2. Trocar `const ATUALIZACAO_INSTITUCIONAL = new Date("2026-09-15T00:00:00Z");` por `const ATUALIZACAO_INSTITUCIONAL = new Date("2026-09-25T00:00:00Z");` (a `/privacidade` muda neste PR; o docblock da constante manda subir a data junto).
3. Trocar a desestruturação e o `Promise.all`:
   ```ts
     const [carimbos, datasDeVenda, ultimasPresencas, destaques, recortes, guiasPublicados, repasses] =
       await Promise.all([
         getCarimbosDeConteudo(),
         getDatasDeVenda(),
         getUltimasPresencas(),
         destaquesParaSitemap(),
         recortesDoEstoque(),
         // Falha aqui não pode tirar o resto do site do sitemap: o cluster some
         // desta geração e volta na próxima, como `destaquesParaSitemap` já faz.
         // O oposto — deixar estourar — apagaria 176 URLs por causa de uma.
         listarGuiasPublicados().catch((erro) => {
           console.error("[Sitemap] Falha ao ler os guias:", (erro as Error).message);
           return [];
         }),
         // O repasse (spec 2026-09-24 §7.2), com o mesmo cuidado: pane aqui
         // tira desta geração só as fichas de repasse.
         lerRepassesPublicos(new Date(), "/sitemap.xml").catch((erro): Repasse[] => {
           console.error("[Sitemap] Falha ao ler os repasses:", (erro as Error).message);
           return [];
         }),
       ]);
   ```
4. Logo depois do bloco de `inventarioMudouEm`, acrescentar:
   ```ts
     // Publicado (aberto ou só para lojistas) e reservado. O vendido fica no ar
     // pela carência, e indexado como no estoque, mas não é anunciado: sitemap
     // que chama o buscador para um carro que já saiu é convite a indexar o que
     // ninguém compra mais.
     const repassesNaVitrine = repasses
       .filter((r) => r.situacao === "publicado" || r.situacao === "reservado")
       .sort((a, b) => new Date(publicadoEm(b)).getTime() - new Date(publicadoEm(a)).getTime());
     const quandoOrepasseMudou = (r: Repasse | undefined): Date | undefined => {
       if (!r) return undefined;
       const d = new Date(publicadoEm(r));
       return Number.isNaN(d.getTime()) ? undefined : d;
     };
   ```
5. Em `routes`, logo depois do bloco `...guiasPublicados.map(…)`, acrescentar:
   ```ts
       {
         // A seção de repasse. Perene: sem carro aberto a página vira a lista
         // do repasse, nunca beco — por isso entra mesmo vazia, como os hubs.
         url: `${SITE_URL}/repasse`,
         lastModified: quandoOrepasseMudou(repassesNaVitrine[0]),
         changeFrequency: "daily" as const,
         priority: 0.8,
       },
       ...repassesNaVitrine.map((r) => ({
         url: `${SITE_URL}/repasse/${r.slug}`,
         lastModified: quandoOrepasseMudou(r),
         changeFrequency: "daily" as const,
         priority: 0.8,
       })),
   ```
   (dentro de `routes`, e não de `vehicleRoutes`: assim o repasse sobrevive ao `catch` que devolve só as rotas estáticas quando o estoque falha.)

- [ ] **Step 4: A `/privacidade`**

Em `src/app/privacidade/page.tsx` (texto da spec §7.4, aprovado pelo dono em 24/09 — não reescrever nenhuma palavra):

1. `const ULTIMA_ATUALIZACAO = "17 de setembro de 2026";` → `const ULTIMA_ATUALIZACAO = "25 de setembro de 2026";`

2. Em `<Secao id="dados" …>`, logo depois do `<p>` que começa com `<strong className="text-mt-ink">Quando você preenche um formulário.</strong>` e termina em "Nada disso é obrigatório para navegar — só para ser atendido.", acrescentar:
   ```tsx
               {/* Spec 2026-09-24 §7.4, aprovado pelo dono em 24/09: a lista do
                   repasse é dado pessoal com finalidade nova (aviso por
                   WhatsApp), declarado no mesmo PR que liga o formulário. */}
               <p>
                 <strong className="text-mt-ink">Quando você entra na lista do repasse.</strong>{" "}
                 Pedimos nome e WhatsApp, a faixa de preço e os tipos de carro que você procura. Se
                 você é lojista, pedimos também o CNPJ, o nome da loja e a cidade.
               </p>
   ```

3. Em `<Secao id="finalidades" …>`, como último `<li>` do `<ul>` (depois de "Consertar o que quebra."):
   ```tsx
                 {/* Spec 2026-09-24 §7.4, aprovado em 24/09. */}
                 <li>
                   <strong className="text-mt-ink">Avisar sobre carros de repasse.</strong> Quem está
                   na lista recebe pelo WhatsApp os carros de repasse que combinam com a faixa e os
                   tipos informados. Lojistas cadastrados recebem o aviso antes de o carro abrir para
                   todos. Quem envia é uma pessoa da nossa equipe, não um disparo automático.
                 </li>
   ```

4. Em `<Secao id="bases-legais" …>`:
   - No fim do comentário grande (depois do parágrafo "16/09/2026 — as referências `arquivo:linha` deste comentário…"), acrescentar, antes do `*/}`:
     ```
                 25/09/2026 — o item "Consentimento" volta, com outra finalidade:
                 a lista do repasse (spec 2026-09-24 §7.4, texto aprovado pelo
                 dono em 24/09). Não é cookie: a medição de anúncios e de uso
                 continua no legítimo interesse, com a oposição no botão da seção
                 de cookies. A frase acima ("se algum dia voltar a haver cookie
                 sob consentimento, o item volta junto") segue valendo para
                 cookie.
     ```
   - Como PRIMEIRO `<li>` do `<ul>` (antes de "Execução de contrato e procedimentos preliminares" — é o inciso I do art. 7º):
     ```tsx
                 <li>
                   <strong className="text-mt-ink">Consentimento</strong> — para a lista do repasse.
                   Você escolhe entrar e pode sair quando quiser, pedindo pelo WhatsApp ou pelos canais
                   da seção{" "}
                   <a href="#contato" className="underline underline-offset-2">
                     Como falar conosco
                   </a>
                   .
                 </li>
     ```

5. Em `<Secao id="retencao" …>`, logo depois do `<p>` que começa com "Esses dados de contato" (e antes de "Dados de navegação e publicidade…"):
   ```tsx
               {/* Spec 2026-09-24 §7.4, aprovado em 24/09. Sair da lista APAGA a
                   linha de `repasse_inscritos` (e os avisos, em cascata): quem
                   executa é a tela de inscritos do painel. */}
               <p>
                 <strong className="text-mt-ink">Os dados da lista do repasse</strong> ficam guardados
                 enquanto você estiver na lista. Quando você sai, apagamos a faixa de preço, os tipos
                 de carro e, no caso de lojistas, o CNPJ e os dados da loja. O registro de contato
                 segue a regra do parágrafo acima.
               </p>
   ```

- [ ] **Step 5: Rodar os novos e as travas que já leem a política e o sitemap**

Run: `npx vitest run tests/sitemap-anuncia-o-repasse.test.ts tests/privacidade-lista-do-repasse.test.ts tests/sitemap-anuncia-os-guias.test.ts tests/brechas-de-mensuracao.test.ts tests/privacidade-registro-de-erro.test.ts tests/promessa-publica.test.ts`
Expected: PASS. (A B.6 de `brechas-de-mensuracao` proíbe `/aceit/i` no texto visível inteiro da política: as quatro inserções não têm "aceit"; a linha "você aceita" é do FORMULÁRIO, em `paginaDoRepasse.ts`, e não entra aqui.)

- [ ] **Step 6: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. No sitemap, tirar o `.catch(…)` da leitura dos repasses → "pane na leitura do repasse: …" reprova (o sitemap inteiro cairia).
2. No filtro de `repassesNaVitrine`, acrescentar `|| r.situacao === "vendido"` → "o vendido fica fora" reprova.
3. Na política, mover o parágrafo da retenção para depois de "Dados de navegação e publicidade…" → "depois do parágrafo dos dados de contato" reprova.
4. Na política, escrever "Ao entrar na lista, você aceita…" no parágrafo de `#dados` → a B.6 e o "nenhuma inserção fala em aceite" reprovam.

- [ ] **Step 7: Commit**

```bash
git add src/app/sitemap.ts src/app/privacidade/page.tsx tests/sitemap-anuncia-o-repasse.test.ts tests/privacidade-lista-do-repasse.test.ts
git commit -m "feat(repasse): sitemap com o repasse e a /privacidade da lista (texto aprovado da §7.4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Os pedidos de exame no editor do carro (spec §4.4) — Sonnet

**Files:**
- Create: `src/lib/pedidosDeExame.ts`
- Create: `src/components/admin/repasse/PedidosDeExame.tsx`
- Modify: `src/app/admin/repasse/[id]/page.tsx`
- Test: `tests/pedidos-de-exame-no-editor.test.ts` (novo)

**Interfaces:**
- Consumes: `leads.repasse_id` (gravado pela Task 6); `ddmmEmCuritiba` (Task 2); o dublê com `consultas` (Task 6); `bancoDeTeste`, `sessaoDeTeste`, `linhaDoBancoDeTeste`.
- Produces: `interface PedidoDeExameNoPainel { id; nome; telefone: string | null; interesse: string | null; created_at }`; `COLUNAS_DO_PEDIDO_DE_EXAME`; `pedidoDeExameDaLinha(linha): PedidoDeExameNoPainel | null`; `PedidosDeExame({ pedidos })`. O editor de `/admin/repasse/[id]` mostra os pedidos do carro, lidos com a SESSÃO (`leads` é lida por toda a equipe — `leads_leitura_staff`, a régua do Kanban).

- [ ] **Step 1: Escrever o teste que falha**

`tests/pedidos-de-exame-no-editor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";

/**
 * O lead do exame no pátio aparece no editor do carro (spec §4.4). O plano
 * do PR 2 empurrou isto para o PR 3, junto com o formulário que cria o lead.
 */
let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
// O editor tem teste próprio (`editor-do-repasse`); aqui o assunto é o bloco novo.
vi.mock("../src/components/admin/repasse/EditorDeRepasse", () => ({ default: () => null }));

const RepassePage = (await import("../src/app/admin/repasse/[id]/page")).default;
const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const PEDIDO =
  "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.";

beforeEach(() => {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, ["marketing"]);
  banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z" }), error: null };
});

const pagina = async () =>
  renderToStaticMarkup(await RepassePage({ params: Promise.resolve({ id: ID }) })).replace(/\s+/g, " ");

describe("os pedidos de exame no editor do carro", () => {
  it("o pedido aparece, lido pelo carro", async () => {
    banco.leituras.leads = {
      data: [{ id: "l-1", nome: "Ana Souza", telefone: "5541997372165", interesse: PEDIDO, created_at: "2026-09-24T15:00:00Z" }],
      error: null,
    };
    const html = await pagina();
    expect(html).toContain("Pedidos de exame no pátio");
    expect(html).toContain("Ana Souza");
    expect(html).toContain("Sáb 26/09, tarde");
    expect(banco.consultas.find((c) => c.tabela === "leads")?.filtros).toEqual([["repasse_id", ID]]);
  });

  it("sem pedido, diz que não há", async () => {
    banco.leituras.leads = { data: [], error: null };
    expect(await pagina()).toContain("Nenhum pedido de exame para este carro ainda.");
  });

  it("linha sem nome não vira pedido", async () => {
    banco.leituras.leads = { data: [{ id: "l-2", nome: "", created_at: "2026-09-24T15:00:00Z" }], error: null };
    expect(await pagina()).toContain("Nenhum pedido de exame para este carro ainda.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pedidos-de-exame-no-editor.test.ts`
Expected: FAIL — o editor não lê `leads`.

- [ ] **Step 3: `src/lib/pedidosDeExame.ts`**

```ts
/**
 * Os pedidos de exame no pátio de um carro de repasse, como o editor do
 * painel os mostra (spec §4.4). O lead do exame grava `leads.repasse_id`
 * (rota de leads, ramo do repasse); aqui ele é lido de volta.
 */
export interface PedidoDeExameNoPainel {
  id: string;
  nome: string;
  telefone: string | null;
  interesse: string | null;
  created_at: string;
}

export const COLUNAS_DO_PEDIDO_DE_EXAME = "id, nome, telefone, interesse, created_at";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function pedidoDeExameDaLinha(linha: Record<string, unknown>): PedidoDeExameNoPainel | null {
  const id = texto(linha.id);
  const nome = texto(linha.nome);
  const created_at = texto(linha.created_at);
  if (!id || !nome || !created_at) return null;
  return { id, nome, telefone: texto(linha.telefone), interesse: texto(linha.interesse), created_at };
}
```

- [ ] **Step 4: `src/components/admin/repasse/PedidosDeExame.tsx`**

```tsx
import { ddmmEmCuritiba } from "../../../lib/horarioDaLoja";
import type { PedidoDeExameNoPainel } from "../../../lib/pedidosDeExame";

/**
 * Os pedidos de exame do carro, abaixo do editor. Leitura só: o atendimento
 * continua no Kanban e no Chatwoot; aqui a equipe vê, junto do carro, quem
 * pediu para vê-lo no pátio.
 */
export default function PedidosDeExame({ pedidos }: { pedidos: PedidoDeExameNoPainel[] }) {
  return (
    <section aria-labelledby="pedidos-de-exame" className="flex w-full max-w-4xl flex-col gap-3 border-t-2 border-mt-regua pt-5">
      <h2 id="pedidos-de-exame" className="mt-titulo m-0 text-xl">
        Pedidos de exame no pátio
      </h2>
      {pedidos.length === 0 ? (
        <p className="m-0 text-sm text-mt-neutral-700">Nenhum pedido de exame para este carro ainda.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-mt-regua-fina p-0">
          {pedidos.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 py-3 text-xs">
              <span className="flex flex-wrap items-center gap-3">
                <strong className="text-sm">{p.nome}</strong>
                {p.telefone && <span className="tabular-nums">{p.telefone}</span>}
                <span className="text-mt-neutral-700">{ddmmEmCuritiba(p.created_at)}</span>
              </span>
              {p.interesse && <span className="text-mt-neutral-800">{p.interesse}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: O editor lê os pedidos**

Em `src/app/admin/repasse/[id]/page.tsx`:
1. Imports, depois de `import EditorDeRepasse from …`:
   ```ts
   import PedidosDeExame from "../../../../components/admin/repasse/PedidosDeExame";
   import { COLUNAS_DO_PEDIDO_DE_EXAME, pedidoDeExameDaLinha } from "../../../../lib/pedidosDeExame";
   ```
2. Depois de `if (!repasse) notFound();`, acrescentar:
   ```ts
     // Os pedidos de exame deste carro (spec §4.4). Com a SESSÃO: `leads` é
     // lida por toda a equipe (`leads_leitura_staff`), a mesma régua do Kanban.
     const { data: linhasDosPedidos } = await supabase
       .from("leads")
       .select(COLUNAS_DO_PEDIDO_DE_EXAME)
       .eq("repasse_id", id)
       .order("created_at", { ascending: false })
       .limit(50);
     const pedidos = ((linhasDosPedidos ?? []) as unknown as Record<string, unknown>[]).flatMap((linha) => {
       const pedido = pedidoDeExameDaLinha(linha);
       return pedido ? [pedido] : [];
     });
   ```
3. Trocar o `return ( <EditorDeRepasse … /> );` por:
   ```tsx
     return (
       <>
         <EditorDeRepasse
           repasse={repasse}
           perfis={perfis}
           inscritos={inscritos}
           avisados={avisados}
           urlDaFicha={urlDoSite(`/repasse/${repasse.slug}`)}
         />
         <PedidosDeExame pedidos={pedidos} />
       </>
     );
   ```

- [ ] **Step 6: Rodar o novo e o teste do editor**

Run: `npx vitest run tests/pedidos-de-exame-no-editor.test.ts tests/editor-do-repasse.test.ts`
Expected: PASS.

- [ ] **Step 7: Provar a trava com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Tirar `.eq("repasse_id", id)` → "o pedido aparece, lido pelo carro" reprova (o editor mostraria os leads de todos os carros).
2. Em `pedidoDeExameDaLinha`, tirar `!nome ||` → "linha sem nome não vira pedido" reprova.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pedidosDeExame.ts src/components/admin/repasse/PedidosDeExame.tsx "src/app/admin/repasse/[id]/page.tsx" tests/pedidos-de-exame-no-editor.test.ts
git commit -m "feat(repasse): os pedidos de exame no pátio aparecem no editor do carro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Fechamento — suíte, CI, revisão, textos, gravação e PR (controlador)

**Files:** nenhum arquivo novo; ledger em `.superpowers/sdd/2026-09-25-repasse-pr3-site/progress.md` (pasta ignorada pelo git).

- [ ] **Step 1: Varredura de escapes**

Nos arquivos novos com regex (`paginaDoRepasse.ts`, `horarioDaLoja.ts`, `cnpj.ts`, `leituraDosRepasses.ts` e os testes), conferir que nenhum `\b`/`\d`/`\s` virou byte de controle e nenhum `\u` virou caractere:
```bash
git diff --name-only 35e1974..HEAD | xargs grep -lP '\x08' ; echo "fim da busca por 0x08"
```
Expected: só "fim da busca por 0x08". Se algum arquivo aparecer, regravar com a ferramenta Write.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/repasse-site
```

- [ ] **Step 3: Suíte inteira uma vez, local**

Run: `npx vitest run`
Expected: nenhuma falha. (Ruling herdado dos PRs 1 e 2: a volta inteira pega as varreduras globais que os arquivos focados não pegam — `promessa-publica`, `paginas-institucionais`, `brechas-de-mensuracao`, `sem-beco-sem-saida`, `whatsapp-numero-unico`, `nomenclatura-estoque`, `dominio-do-site`.)

- [ ] **Step 4: CI concluído e verde nos cinco jobs**

Conferir o run `testes` do head pelo navegador embutido, na página do commit (memória `medir-ci-sem-gh`; o `gh` não está autenticado e a API pública tem 60/hora). Só segue com `completed success` em `vitest`, `tipos`, `lint`, `build` e `deploy-vercel`.

- [ ] **Step 5: Revisão final do branch com o checklist do `qa-guardian`**

Um revisor Opus com o modelo de revisão final e o checklist do `qa-guardian` dentro. Pontos que ele confere além do de sempre: nenhum `any` novo em `route.ts`; nenhum `companySettings` inteiro em prop de client component; a §7.4 idêntica ao aprovado; o texto fixo só em `paginaDoRepasse.ts`; nenhum `view_item`/`ViewContent`/`content_ids` com id de repasse. Bloqueios corrigidos numa rodada única; nova volta de CI.

- [ ] **Step 6: Os textos novos, ao dono**

Levar ao dono a lista "Textos novos para o dono aprovar antes do merge" (no topo deste plano), com a frase exata de cada um como está no código. Mudança pedida entra na mesma rodada de correção (e passa de novo pelas travas da Task 1). Nada disso vai ao `main` sem o ok.

- [ ] **Step 7: Gravar a migração — SÓ com ordem explícita do dono**

Perguntar ao dono. Com o "pode gravar":

```powershell
cd C:\Users\Lenovo\Documents\motors-claude\motors-site-oficial
node supabase/manutencao/aplicar-migracao.js ..\wt-repasse-site\supabase\migrations\20260925120000_repasse_carrocerias_da_lista.sql --gravar
```

Expected: o `NOTICE` do aceite e `GRAVADA: 20260925120000_repasse_carrocerias_da_lista.sql`. A rota de leads funciona sem a restrição (ela só barra valor fora da lista), então gravar antes ou depois do deploy não quebra nada — mas grava-se antes do merge, para o formulário nascer com a trava.

- [ ] **Step 8: A data da `/privacidade`**

`ULTIMA_ATUALIZACAO` ("25 de setembro de 2026") e `ATUALIZACAO_INSTITUCIONAL` (2026-09-25) dizem quando a política mudou. Se o merge não acontecer em 25/09, subir as duas para o dia do merge no mesmo lote (commit de duas linhas, CI de novo) — política que declara a lista precisa da data do dia em que a lista passou a existir.

- [ ] **Step 9: Abrir o PR — pelo Chrome do dono, com o ok dele**

Base `main` (como o #146; o diff mostra os três PRs empilhados). Corpo com: o que entra (página, ficha, lista, exame, rota, sitemap, `/privacidade`, pedidos no editor); a migração (ensaio, sabotagens S1 e S2, gravação); a verificação (suíte, CI, revisão); as decisões 19 a 30 deste plano; e **a ordem de merge: #144 → (#146 + este PR, juntos)** — o #146 aponta links para `/repasse/<slug>`, que nasce aqui. O merge em si é da sessão de handoff, em lote verificado (memória `merge-no-main-em-lote-verificado`), com ordem do dono.

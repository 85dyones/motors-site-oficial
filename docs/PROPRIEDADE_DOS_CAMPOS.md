# Quem manda em cada campo do veículo

**Data:** 27/08/2026 · pedido no §5.1 do `HANDOFF_CADASTRO_SYNC.md`.

Hoje essa distinção existe como rótulo na tela do editor. Este documento a
escreve, porque é o tipo de conhecimento que se perde — e perdê-lo custa uma
correção desfeita no sync seguinte, em silêncio.

**A fonte de verdade é o código**, não esta tabela: `CAMPOS_NOSSOS` em
`src/lib/estoqueEscrita.ts`. Se as duas divergirem, o código está certo.

---

## As três origens

| Origem | O que acontece | Campos |
|---|---|---|
| **Feed, só na importação** | O sincronizador traz quando o carro nasce. **Desde 30/08 ele não reescreve** estas colunas — ver abaixo. | `marca`, `modelo`, `versao`, `ano`, `quilometragem`, `cambio`, `combustivel`, `cor` |
| **Feed, SEMPRE** | O sincronizador escreve na importação **e em todo ciclo depois**. O painel não edita em carro do feed. É a allowlist da trava desde 02/09. | `preco`, `preco_original`, `preco_promocional`, `last_seen_at` |
| **Nosso** | O sync não conhece a coluna. O que o painel escreve fica. | `placa`, `motor`, `cor_interna`, `donos_anteriores`, `garantia_fabrica`, `preco_compra`, `descricao`, `descricao_seo`, `laudo_pericia`, `opcionais`, `status_tag`, `status_tag_color`, `vendido`, `tipo`, `perfis_uso`, `estado_cadastro` |
| **Override** | Coluna paralela à do feed. Preenchida, vence; vazia, vale o feed. | `modelo_override`, `versao_override` |
| **Do feed, mas nosso para editar** | Coluna que o feed preenche no nascimento e o painel sobrescreve para valer, em veículo de qualquer origem. | `whatsapp_images`, `web_full_images`, `url_imagem` |

### 🔴 O preço voltou a ser do RevendaMais em 2026-09-02 — as três colunas

Decisão do dono, literal: *"preciso que o preço seja o do revenda, sempre, nos
campos de preço e no de promoção, senão eu crio dois lugares para mudar isso e
pode gerar inúmeros problemas."*

Dois movimentos, no mesmo PR:

1. **A trava abriu para quatro colunas** (`20260902120000_preco_e_do_revendamais`).
   O gatilho continua reconhecendo o sync pelos dois sinais de sempre; ao
   reconhecer, devolve a linha como está **com `preco`, `preco_original`,
   `preco_promocional` e `last_seen_at` copiados do que o sync mandou** — e
   nada mais. É allowlist por construção: coluna nova nasce protegida sem
   ninguém lembrar de listar.
2. **O painel fechou a promoção em carro do feed.** `CAMPO_DA_PROMOCAO` passou
   a valer só no nativo, como `CAMPOS_DE_PRECO_DO_NATIVO`. As três colunas de
   preço têm uma régua só.

Por que a objeção de 01/09 caiu: a allowlist tinha sido recusada porque "o
RevendaMais desfaria as 16 promoções que a loja define no painel". Medido no
mesmo 02/09, feed real contra banco, 39 anúncios: **zero promoções criadas pelo
painel**. Não havia o que desfazer. E havia o custo do lado oposto — a Kia
Sorento anunciada a R$ 48.900 no RevendaMais e a R$ 56.900 no site, três dias
depois do último import, porque a trava total impedia o preço de chegar.

Com isso o **cron do sync voltou** (a cada 6 h): o motivo de desligá-lo era o
risco de sobrescrita de conteúdo, e a allowlist o elimina — ele não alcança
mais nada além de preço e carimbo. Preço novo no RevendaMais chega ao site no
ciclo seguinte, e move `conteudo_atualizado_em` (o `lastmod` do sitemap), que
é o comportamento certo: preço é conteúdo para o Google e para o portal.

`last_seen_at` voltar a andar tem um segundo efeito: ele é o proxy da data de
venda na carência de SEO (`publicacao.ts`) quando a venda não passa pelo Ciclo,
e estava congelado em 30/08 para o estoque inteiro.

### 🟢 As fotos atravessaram a fronteira em 2026-09-01 (F0.5)

As três colunas de foto saíram de **Feed** e entraram na quarta linha, ao lado
de `preco_promocional`. `camposGravaveis` não as condiciona mais a
`origem === 'painel'`, e a galeria do editor perdeu o portão de origem — sobrou
`podeEditar`, a linha "Adicionar e reordenar fotos" da matriz A17.

O motivo antigo ("o sync reescreve a cada 6 h") morreu duas vezes: a trava total
o impede de atualizar coluna nenhuma, e em 31/08 as fotos dos 37 ativos foram
para o bucket `veiculos`. Como `origem = 'sync'` é 100% do estoque, a condição
mantinha a galeria fechada para **todos** os carros — e a pendência de fotos
ainda mandava resolver no RevendaMais, que desde 30/08 não tem como devolver o
dado. Kombi e Parati estavam fora da vitrine exatamente por isso.

**Decisão do dono em 01/09, sobre hospedagem:** as fotos já migradas **ficam**
no nosso bucket, e **nenhuma migração nova é feita**. Carro novo continua
chegando com URL do `s3.carro57.com.br` e permanece assim — não se mexe em foto
que está boa. Quando faltar ou precisar trocar, o caminho é o painel. O motivo
declarado foi não criar centro de custo; conferido no mesmo dia, o bucket ocupa
160 MB de 1 GB do plano free, então **hospedar não custa nada hoje** — o que
pesa é egress, e egress não muda de lado conforme onde o arquivo mora.

Consequência para os portais: a vitrine ativa serve foto nossa, com URL pública
sem expiração e sob nosso controle de ordem e capa. Vendidos e arquivados seguem
no carro57 de propósito — quando aquele link morrer, essas fichas já terão saído
do ar pela carência de `publicacao.ts`.

### 🔴 A tabela acima mudou de sentido em 2026-08-30

A coluna "O que acontece" do Feed dizia *"o sincronizador reescreve a cada
ciclo; corrigir no painel dura até o próximo sync"*. **Isso deixou de ser
verdade.** A trava total (`20260829130000_f0k` + `20260830120000_f0q`) faz o
RevendaMais não atualizar linha nenhuma, de origem nenhuma — ele só INSERE
veículo novo, e o cron nem roda mais sozinho.

A tabela continua útil porque descreve **de onde o dado nasce**, e porque a
linha "Nosso" ainda é a única em que o painel pode escrever livremente. Mas o
medo que a organizava — "salvei e voltou sozinho" — não existe mais.

> **Superado em 02/09:** `preco_promocional` atravessou essa fronteira em
> 31/08, a pedido do dono, e voltou dois dias depois, a pedido do mesmo dono —
> ver a seção 🔴 acima. Não virou "Nosso" nem "Override" em momento nenhum; hoje
> está na linha "Feed, SEMPRE". **Antes de criar um override novo, pergunte se
> ele ainda é preciso.**

A ressalva que valia para o preço de tabela vale agora para as três colunas de
preço: editáveis só no veículo nativo, que não tem RevendaMais para vir. Não é
limitação técnica — é para existir **um** lugar de mudar preço.

### Por que o override existe, e quando criar outro

`modelo` e `versao` **são** colunas do feed. Corrigi-las direto seria desfeito
no ciclo seguinte, sem erro e sem log — o sintoma é "salvei e voltou sozinho".
A saída foi uma coluna paralela que o sync não conhece, resolvida na leitura
por `mapDbToVeiculo`: daí para cima, URL, hubs, feed XML e JSON-LD recebem o
valor já resolvido e nunca discordam.

O precedente é `descricao_seo` (migração `20260817130000`). O padrão vale
sempre que precisarmos corrigir um campo que o feed manda.

> ⚠️ **Nenhuma coluna nossa pode entrar no corpo do upsert do n8n.** No dia em
> que alguém incluir, toda correção feita à mão passa a ser apagada a cada
> sync. Os `COMMENT ON COLUMN` das migrações repetem esse aviso onde ele será
> lido — no schema.

## O que trava isso

- `CAMPOS_NOSSOS` é a allowlist da escrita: o que não está nela, a rota
  descarta. Acrescentar campo gravável exige entrar aqui **e** em
  `ACAO_DO_CAMPO_DE_VEICULO` (`src/lib/permissoes.ts`) — campo sem linha na
  matriz é negado a todo perfil, e o sintoma é o campo não aparecer na tela.
- `tests/modelo-e-carroceria.test.ts` e `tests/perfis-de-uso.test.ts` falham se
  um override sair da allowlist, ou se `modelo`/`versao` entrarem nela.

## Bloqueio de publicação

Uma régua, dois degraus — decisão do dono em 01/09:

| Item | Tira do ar? | Onde se resolve |
|---|---|---|
| menos de 4 fotos (`poucas-fotos`) | **sim** | painel, ou RevendaMais no carro do feed |
| de 4 a 7 fotos (`fotos-incompletas`) | não | painel — é pendência interna, o carro já está no ar |

Quatro fotos são a porta: *"acho que 4 fotos boas são suficiente pra iniciar e
deixar publicado, mas continuar marcando incompleto até as 8 internamente"*. As
oito continuam sendo a meta (`FOTOS_DA_FICHA_COMPLETA`), e o painel cobra —
sem tirar o carro da vitrine. O carro de 4 fotos entra nos três destinos:
vitrine, feed de anúncios e sitemap. É o que "publicado" já significava no
código, e mantém uma régua só.

Um veículo bloqueado sai da vitrine, do feed de anúncios e do índice de busca,
mas **a ficha continua respondendo** — quem tem o link não bate em 404, e subir
as fotos devolve o carro ao ar no ciclo seguinte. A regra vive em
`bloqueiosDePublicacao` (`src/lib/coerenciaDoCadastro.ts`) e o filtro é o
padrão de `getEstoque()`: ver o bloqueado exige pedir
`incluirNaoPublicaveis: true`.

### O laudo saiu da lista, e a correção é de domínio

A primeira versão desta regra tratava `laudo_pericia` vazio como "carro não
periciado" e chegou a bloquear publicação por isso. **A leitura estava errada.**
Quem corrigiu foi o dono, em 29/08:

> *"Parta do pressuposto de que 100% dos carros são periciados. O campo existe
> para colocar observações sobre apontamentos pontuais."*

Campo vazio quer dizer **sem apontamentos** — o melhor caso, não uma pendência.
Bloquear ali punia o carro impecável, e teria levado a vitrine de 34 para 1.

Duas colunas, dois papéis:

| Coluna | O que guarda | Medido em 29/08 |
|---|---|---|
| `pericia` | o **status** da perícia | 17 `PERÍCIA APROVADA`, 17 `EM ANÁLISE` |
| `laudo_pericia` | as **observações**, quando há | preenchida em 1 de 34 |

É `pericia` que decide se o laudo pode ser afirmado na ficha: o acordeão de
perícia da PDP só abre quando há texto **e** o status é `PERÍCIA APROVADA`. O
resto do código já lia assim — `PDPClientWrapper` anota `temLaudo` com a nota
*"o laudo está na ficha — não 'o carro foi periciado', que vale para todos"*.
Era o gate de publicação que destoava.

## Auditoria

`npm run auditoria:estoque` roda quatro seções — contagem por carroceria com
teto para `Hatch`, contradição entre nome e carroceria, URL com segmento
repetido e quem está fora da vitrine agora. Sai com código ≠ 0 quando há
achado.

A seção de "sem laudo cautelar" saiu em 29/08 junto com a regra: ela listava 33
dos 34 publicados, e relatório que acusa 97% do estoque todo dia é relatório
que ninguém lê.

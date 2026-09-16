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
| **Feed** | O sincronizador traz na importação. **Desde 30/08 ele não reescreve mais nada** — ver abaixo. | `marca`, `modelo`, `versao`, `ano`, `quilometragem`, `cambio`, `combustivel`, `cor`, `preco_original`, `whatsapp_images` |
| **Nosso** | O sync não conhece a coluna. O que o painel escreve fica. | `placa`, `motor`, `cor_interna`, `donos_anteriores`, `garantia_fabrica`, `preco_compra`, `descricao`, `descricao_seo`, `laudo_pericia`, `opcionais`, `status_tag`, `status_tag_color`, `vendido`, `tipo`, `perfis_uso`, `estado_cadastro` |
| **Override** | Coluna paralela à do feed. Preenchida, vence; vazia, vale o feed. | `modelo_override`, `versao_override` |
| **Do feed, mas nosso para editar** | Coluna que o feed preenche e o painel sobrescreve para valer, em veículo de qualquer origem. | `preco_promocional` |

### 🔴 A tabela acima mudou de sentido em 2026-08-30

A coluna "O que acontece" do Feed dizia *"o sincronizador reescreve a cada
ciclo; corrigir no painel dura até o próximo sync"*. **Isso deixou de ser
verdade.** A trava total (`20260829130000_f0k` + `20260830120000_f0q`) faz o
RevendaMais não atualizar linha nenhuma, de origem nenhuma — ele só INSERE
veículo novo, e o cron nem roda mais sozinho.

A tabela continua útil porque descreve **de onde o dado nasce**, e porque a
linha "Nosso" ainda é a única em que o painel pode escrever livremente. Mas o
medo que a organizava — "salvei e voltou sozinho" — não existe mais.

`preco_promocional` foi o primeiro campo a atravessar essa fronteira, em
2026-08-31, a pedido do dono. Ele nasce do feed e a loja o sobrescreve, em
veículo importado inclusive. Não virou "Nosso" porque o sync continua sabendo
dele; não é "Override" porque não há coluna paralela — a trava tornou o
override desnecessário. **Antes de criar um override novo, pergunte se ele
ainda é preciso.**

Uma ressalva que continua valendo: o preço de **tabela** (`preco`,
`preco_original`) segue editável só no veículo nativo. Não é limitação técnica,
é decisão de produto — enquanto o carro for do RevendaMais, quem define o preço
de lista é ele; quem define **promoção** é a loja.

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

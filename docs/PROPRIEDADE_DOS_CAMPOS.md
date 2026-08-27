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
| **Feed** | O sincronizador reescreve a cada ciclo. Corrigir no painel dura até o próximo sync. | `marca`, `modelo`, `versao`, `ano`, `quilometragem`, `cambio`, `combustivel`, `cor`, `preco_original`, `preco_promocional`, `whatsapp_images` |
| **Nosso** | O sync não conhece a coluna. O que o painel escreve fica. | `placa`, `motor`, `cor_interna`, `donos_anteriores`, `garantia_fabrica`, `preco_compra`, `descricao`, `descricao_seo`, `laudo_pericia`, `opcionais`, `status_tag`, `status_tag_color`, `vendido`, `tipo`, `perfis_uso` |
| **Override** | Coluna paralela à do feed. Preenchida, vence; vazia, vale o feed. | `modelo_override`, `versao_override` |

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

Desde 27/08, um item do checklist deixou de ser conselho:

| Item | Tira do ar? | Onde se resolve |
|---|---|---|
| menos de 8 fotos | **sim** | RevendaMais — as fotos vêm do feed |
| sem laudo cautelar | ainda não | painel — é campo nosso |

Um veículo bloqueado sai da vitrine, do feed de anúncios e do índice de busca,
mas **a ficha continua respondendo** — quem tem o link não bate em 404, e
resolver o item devolve o carro ao ar no ciclo seguinte. A regra vive em
`bloqueiosDePublicacao` (`src/lib/coerenciaDoCadastro.ts`) e o filtro é o
padrão de `getEstoque()`: ver o bloqueado exige pedir
`incluirNaoPublicaveis: true`.

### Por que o laudo ainda não bloqueia

O plano desta rodada previa que ligar o gate do laudo custaria **um** carro. A
medição feita antes de mergear, na coluna `laudo_pericia` dos 39 veículos
servidos em 27/08, deu outro número: **38 estão vazios**. Só a Saveiro
Trendline `8358193` tem texto, digitado à mão.

Ligar hoje não tiraria um anúncio do ar — tiraria a loja. Por isso a pendência
continua listada no painel e na auditoria, e a trava é uma constante de uma
linha: `LAUDO_BLOQUEIA_PUBLICACAO`. A seção 5 de `npm run auditoria:estoque`
imprime, por id, exatamente quem sairia do ar se ela virasse `true` — é a conta
a fazer antes de mexer.

O que essa pendência protege é literal: `aboutSettings.value1` afirma **"perícia
cautelar independente em 100% do estoque, laudo na ficha"**, e o SDR repete a
frase para o cliente. Enquanto a lista da seção 5 for longa, a saída é
preencher os laudos — não ligar o gate.

## Auditoria

`npm run auditoria:estoque` roda cinco seções — contagem por carroceria com
teto para `Hatch`, contradição entre nome e carroceria, URL com segmento
repetido, quem está fora da vitrine agora, e quem sairia se o laudo passasse a
bloquear. Sai com código ≠ 0 quando há achado; a seção 5 não conta como achado,
porque um comando sempre vermelho é um comando que ninguém lê.

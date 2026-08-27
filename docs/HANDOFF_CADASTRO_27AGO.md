# Coerência de cadastro e bloqueio de publicação — 27/08/2026

**Origem:** a auditoria de fichas feita antes do SDR entrar no ar
(`HANDOFF_CADASTRO_SYNC.md`).
**O que mudou no site:** três anúncios saem da vitrine. Nada mais muda para
quem visita.
**O que precisa de você:** as nove carrocerias e as fotos de três carros.

---

## O que a auditoria acertou

O argumento central estava certo e é o que guiou esta rodada: **erro de
carroceria não é cosmético** quando o mesmo campo alimenta a busca do site, o
SDR e o remarketing do Ads. E o motivo de ninguém ter percebido também estava
certo — o checklist de publicação valida **presença**, não correção. Os dez
veículos com carroceria errada tinham o campo preenchido; preenchido com o
valor errado, mas preenchido.

Três itens da lista, porém, já não valiam quando fui conferir:

| § | Item | Estado real |
|---|---|---|
| 3 | URL do Ka duplicada | já resolvido — os três Ka agrupados, cada um com caminho próprio |
| 4 | Credencial do GA4 | o código já existe; faltam três variáveis de ambiente no Vercel |
| 5.2.1 | "Hatch é nosso default" | premissa errada — o site nunca inventa carroceria. O `Hatch` vem do RevendaMais |

---

## O número que mudou o plano

O plano aprovado dizia que ligar o bloqueio por **laudo cautelar** custaria um
carro — o Celta. Antes de mergear, fui ler a coluna `laudo_pericia` dos 39
veículos servidos:

> **38 dos 39 estão com o campo vazio.**
> O único preenchido é a Saveiro Trendline `8358193`, com uma linha digitada à
> mão.

Ligar o gate hoje não tiraria um anúncio do ar. Tiraria a loja: a vitrine iria
de 39 para 1, o feed de anúncios junto e o sitemap atrás.

**Então o laudo não bloqueia — ainda.** Continua listado no painel e na
auditoria, como pendência, e a trava é uma constante de uma linha
(`LAUDO_BLOQUEIA_PUBLICACAO`). Quando os laudos estiverem preenchidos, ligar é
uma edição sem migração e sem deploy de banco.

Isso não descarta o argumento — ele é o mais forte do documento. O site afirma,
em texto: *"perícia cautelar independente em 100% do estoque, laudo na ficha"*.
Com 38 fichas vazias, essa frase é uma promessa que o site não cumpre, e o SDR
vai repeti-la ao cliente com a confiança de quem lê um campo. Só que é um
problema de **preenchimento**, e nenhum gate de código preenche laudo.

## O que sai do ar agora

O bloqueio que entra é o de **fotos**, e ele é pequeno e concreto:

| id | Veículo | Fotos |
|---|---|---|
| `8392516` | VW Kombi Standard 1.4 MI 4p | **nenhuma** |
| `8152210` | VW Parati CL 1.6 MI 4p | 1 |
| `8100652` | Fiat Uno Mille Fire Economy | 7 |

A vitrine passa de 39 para **36**. As duas primeiras fichas estavam no ar com
uma foto ou nenhuma — pior que não estar.

⚠️ **As fotos vêm do RevendaMais**, não do painel. Não há botão em `/admin` que
resolva: alguém precisa subi-las lá. Feito isso, o carro volta sozinho no ciclo
seguinte.

Um veículo bloqueado **não some**: continua inteiro no banco, aparece no painel
e a ficha continua respondendo para quem tem o link. O que ele perde é a
vitrine, o feed de anúncios e o índice de busca.

---

## O que passou a avisar sozinho

**Na ficha do veículo.** Ao abrir um carro cujo nome contradiz a carroceria, o
editor mostra o alerta ao lado do campo, com o motivo escrito — *"é van de
passageiros ou furgão, não hatch"*. Ele **só sinaliza**; nunca corrige sozinho.

Essa decisão é deliberada. O documento sugeria preencher automaticamente
"quando o campo estiver vazio", e isso nunca dispararia: nenhum dos 39 tem
carroceria vazia — o feed sempre manda algo, e é justamente por isso que o erro
é invisível. Escrever por cima apagaria a distinção entre *"alguém conferiu"* e
*"a tabela deduziu"*, e um modelo fora da tabela seguiria errado em silêncio,
parecendo revisado.

A tabela também aceita **mais de uma leitura por nome**, e isso veio da sua
decisão sobre a Saveiro: a Robust fica em `Utilitário`, a outra em `Picape`, e
o detector não reclama de nenhuma das duas. O que ele continua pegando é o erro
de verdade — Saveiro em `Hatch`, que era o que o feed mandava.

**No terminal.** `npm run auditoria:estoque` roda cinco seções de uma vez:
carrocerias com teto para `Hatch`, nome × carroceria, URLs com segmento
repetido, quem está fora da vitrine, e quem sairia se o laudo passasse a
bloquear. Sai com código ≠ 0 quando há achado, para caber em CI depois.

---

## Na sua mão

1. **As nove carrocerias** — a lista com id está em
   `docs/CARROCERIAS_A_CORRIGIR.md`. É painel, não código: `/estoque/perua`,
   `/estoque/van` e `/estoque/utilitario` nascem sozinhas quando você aplicar.
2. **As fotos dos três carros acima**, no RevendaMais.
3. **O câmbio do Onix Plus** — nome, campo e categoria discordam entre si, e só
   quem viu o carro sabe qual está certo.
4. **Os laudos**, quando der. É o que destrava o item 4 do documento original.
5. **GA4** — criar a conta de serviço e pôr `GA4_PROPERTY_ID`,
   `GA4_CLIENT_EMAIL` e `GA4_PRIVATE_KEY` no Vercel.

## Fora desta rodada

O §5.4 pedia extrair mais campos do texto do feed (motor, câmbio, cor interna).
Precisa do payload cru de um veículo do RevendaMais, que não tenho como ler
daqui — e a mesma regra vale para ele: sugestão a confirmar, nunca valor
gravado direto.

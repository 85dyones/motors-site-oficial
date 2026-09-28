# Carro "em preparação" — desenho

**Data:** 28/09/2026 · **Pedido e decisões:** do dono, na conversa de 28/09 · **Branch:** `feat/em-preparacao`

## O problema

Carro que acabou de chegar vai para o mercado com uma foto só — muitas vezes a
arte de "em preparação". No site ele não aparece: a régua de publicação exige
`MINIMO_DE_FOTOS = 4` (`src/lib/coerenciaDoCadastro.ts:233`), e o carro fica
"fora da vitrine" até a equipe fotografar. A loja perde a janela em que o carro
é novidade.

O dono pediu uma caixa no painel que libere a publicação com **uma foto de
cadastro**, mais uma **data prevista de chegada ao pátio**, e uma **contagem
regressiva** no site "criando expectativa". Preço e o resto da ficha aparecem
normalmente.

## Decisões do dono (28/09)

| Pergunta | Decisão |
|---|---|
| A data passou e o carro ainda tem menos de 4 fotos | **Continua no ar.** A contagem vira "CHEGA A QUALQUER MOMENTO" e o painel acusa "previsão vencida". |
| Formato da contagem | **Card em dias** ("CHEGA EM 5 DIAS"); **ficha com relógio** correndo (dias, horas, minutos, segundos) e a data. |
| Feed de anúncios (Meta e Google, `/api/feed/xml`) | **Só no site.** Fora do feed até ter as 4 fotos. |
| O desenho abaixo | Aprovado. |

## Modelo de dados

Migração `supabase/migrations/20260928150000_em_preparacao.sql`, aditiva:

- `estoque_motors.em_preparacao boolean not null default false`
- `estoque_motors.previsao_chegada_em timestamptz null`
- `check (not em_preparacao or previsao_chegada_em is not null)`: caixa marcada
  sem data não existe nem no banco.
- Rodapé de auto-registro no livro-razão (`supabase/README.md`, seção do
  rodapé).
- Processo da casa: **ensaio (ROLLBACK) primeiro; `--gravar` só com ordem
  explícita do dono.**

Os dois campos são **nossos**: entram em `CAMPOS_NOSSOS`
(`src/lib/estoqueEscrita.ts`) e em `docs/PROPRIEDADE_DOS_CAMPOS.md`. O sync do
RevendaMais nunca os escreve.

`mapVeiculoDbToVeiculo` (`src/lib/supabase.ts`) e o tipo `Veiculo`
(`src/types/index.ts`) ganham `em_preparacao: boolean` e
`previsao_chegada_em: string | null`. É dado público de propósito: a contagem é
do cliente.

## A régua de publicação

Tudo passa por `bloqueiosDePublicacao` / `publicavel`
(`src/lib/coerenciaDoCadastro.ts`), que são as únicas portas. Não há regra de
fotos no banco. Ninguém mais conta foto:

- `em_preparacao` **e** `previsao_chegada_em` preenchida → o mínimo que
  **bloqueia** passa a ser **1 foto** (`MINIMO_DE_FOTOS_EM_PREPARACAO = 1`).
- A pendência não bloqueante `fotos-incompletas` continua aparecendo abaixo de
  `FOTOS_DA_FICHA_COMPLETA`: a equipe segue vendo que falta foto.
- Caixa marcada sem data → a exceção não vale e a régua é a de sempre. O painel
  nem deixa salvar assim; a regra é a segunda defesa.
- Sem a caixa, nada muda.

Como a vitrine (`getEstoque`), a ficha, a home, a tabela do painel e o editor já
perguntam a `publicavel`, a exceção chega aos cinco lugares sem cópia da regra.

**Feed de anúncios:** `/api/feed/xml` passa a excluir o carro com a caixa
"em preparação" marcada e menos de `MINIMO_DE_FOTOS` fotos. É a única
superfície que se afasta da vitrine, por decisão do dono. Carro fora de
preparação segue a regra de hoje: o feed confia no corte do `getEstoque`.

**Foto de verdade:** o `/logo.png` que o mapper põe no carro sem foto não conta
como foto. A vitrine julga a linha crua e a ficha julga o objeto mapeado; com a
porta em uma foto, o logotipo passaria por foto de cadastro na ficha.

## Painel

**Editor do veículo** (`EditorDeVeiculo.tsx`). O `CadastroDeVeiculo.tsx` não
muda: o carro nativo nasce rascunho, e o cadastro termina com um link para o
editor, onde a caixa está.

- Caixa "Em preparação".
- Com ela marcada, aparece "Previsão de chegada ao pátio" (data e hora),
  obrigatória para salvar.
- A equipe desmarca quando o carro fica pronto. A caixa não se desliga sozinha:
  o carro pode ter as fotos e ainda estar no mecânico.
- O checklist de publicação diz "Publica com 1 foto (em preparação)" em vez de
  "faltam N de 4".

**Tabela do estoque** (`TabelaDeEstoque.tsx`):

- Selo "EM PREPARAÇÃO" na linha.
- Data vencida: aviso "previsão vencida há N dias". É aviso, não estado: o
  carro segue "Publicado", no mesmo espírito de `diasForaDoFeed`.

**Permissão:** os dois campos seguem a mesma alçada de `status_tag` em
`src/lib/permissoes.ts`.

## Site

**Função pura única** (`src/lib/emPreparacao.ts`), que o card, a ficha e o
painel consultam:

```ts
chegadaAoPatio(veiculo, agora): null
  | { fase: "a-caminho"; dias: number; data: Date }   // antes da data
  | { fase: "a-qualquer-momento"; data: Date }         // data já passou
```

`null` quando não está em preparação. `dias` conta **dias de calendário no
fuso de São Paulo**, não horas divididas por 24: é o que a pessoa lê no
calendário. Resultado: 0 → "CHEGA HOJE", 1 → "CHEGA AMANHÃ", n → "CHEGA EM n
DIAS". Faltando 16 horas numa segunda às 10h, a previsão é terça às 2h:
"AMANHÃ" — horas ÷ 24 diriam "HOJE".

**Card** (`CardVeiculo`, `src/components/modernist/primitivos.tsx`, server
component):

- Faixa "EM PREPARAÇÃO · CHEGA EM 5 DIAS" (ou "· CHEGA A QUALQUER MOMENTO").
- Em dias, então sem JavaScript: a página é regenerada, e dia não pisca.
- Convive com a `etiqueta` (`status_tag`): a faixa é outro elemento.

**Ficha** (`PDPClientWrapper.tsx`, client):

- Bloco "EM PREPARAÇÃO — CHEGA AO PÁTIO EM" com o relógio `05d 13h 22m 10s` e
  "previsão: 03/10 às 14h".
- O relógio é um componente cliente pequeno que só mostra os números depois de
  montar. O HTML servido traz só a data ("previsão: 03/10 às 14h"), então nada
  diverge na hidratação. (Corrigido no plano: a contagem em dias também
  divergiria na virada do dia.)
- `aria-live` fica **fora** do relógio: um leitor de tela anunciando cada
  segundo é ruído. A data vai em texto para o leitor.
- Preço, ficha técnica, botões de contato e financiamento: sem mudança.

**Vitrine da TV e balcão** (`VitrineTV.tsx`, `VitrineBalcao.tsx`): a mesma
faixa do card, em dias. Não há relógio correndo na TV.

## Testes

Todos por comportamento, e cada trava conferida quebrando o código com o
defeito real antes (memória "trava só vale se reprovar").

- `coerenciaDoCadastro`: 1 foto + caixa + data publica. 1 foto + caixa sem data
  não publica. 1 foto sem caixa não publica. 3 fotos sem caixa continua
  bloqueado. A pendência `fotos-incompletas` aparece nos dois casos.
- `chegadaAoPatio`:
  - a caminho, contando dias de calendário, inclusive na virada do dia em São
    Paulo;
  - "hoje" e "amanhã";
  - "a qualquer momento" depois da data;
  - `null` sem a caixa.
- Feed XML: carro em preparação com 1 foto fica fora; com 4 fotos entra.
- Card e ficha renderizados: a faixa e o bloco aparecem só com a caixa; o preço
  continua na tela.
- Painel: salvar com a caixa e sem data é recusado.
- `CAMPOS_NOSSOS` contém os dois campos: o sync não os apaga.

## Fora do escopo

- "Avise-me quando chegar" (captura de lead na ficha): candidato natural para
  depois; não foi pedido.
- Desligar a caixa sozinho quando chegam as fotos: decisão da equipe, não da
  régua.
- Arte automática de "em preparação" no lugar da foto: a foto de cadastro é a
  que a equipe subir.

## Riscos

- **Tráfego pago para carro sem fotos:** resolvido pela exclusão do feed. O
  carro ainda pode ser anunciado à mão; é escolha da equipe.
- **Data esquecida:** o aviso de "previsão vencida" no painel é o que pega. No
  site o carro não some (decisão do dono), e a frase deixa de prometer data.
- **Travas que leem a régua** (`tests/coerencia-do-cadastro.test.ts`,
  `tests/estoque-tabela.test.ts`, `tests/fotos-do-veiculo.test.ts`,
  `tests/rascunho-e-publicacao.test.ts`, `tests/cadastro-nativo.test.ts`,
  `tests/curadoria-multi-condicao.test.ts`, `tests/motor-do-match.test.ts`)
  precisam seguir verdes sem ser afrouxadas.

/**
 * O gênero gramatical de um modelo, de uma carroceria — e a concordância.
 *
 * ---------------------------------------------------------------------------
 * Por que este arquivo existe
 * ---------------------------------------------------------------------------
 * O dono apontou em 2026-08-25: **"a Volkswagen Saveiro", não "o Volkswagen
 * Saveiro"**. O defeito não era de uma frase. Todo o texto perene decidia o
 * gênero na hora de escrever o código, e as duas metades do sistema erravam em
 * direções opostas: `textoDosHubs.ts` e o hub de modelo cravavam **masculino**
 * ("seminovo", "um", "No … usado"); `estoque/[recorte]` cravava **feminino**
 * ("seminovas", "de cada dez avaliadas").
 *
 * Medido contra o estoque real de produção (35 pares marca/modelo no sitemap
 * de 2026-08-25): 6 dos 29 hubs de carro saíam errados — Saveiro, Kombi,
 * Strada, Parati, Spin, Titano —, mais os 4 hubs de moto, mais 5 das 8
 * carrocerias. Um quarto das páginas perenes.
 *
 * E não é só gramática. Quem procura escreve *"saveiro usada curitiba"*,
 * *"kombi usada"*, *"strada usada"*. O `<title>` que diz "Saveiro Seminovo"
 * perde a correspondência exata com a consulta que a página existe para pegar.
 *
 * ---------------------------------------------------------------------------
 * Como o gênero é decidido
 * ---------------------------------------------------------------------------
 * Três regras e um default, nesta ordem, e cada regra tenta sair de dado real
 * antes de sair de tabela:
 *
 *   1. Segmento `motos` → feminino. "a moto", "a CB", "a Dyna".
 *   2. `tipo === "Picape"` → feminino. "a picape" — e isso pega Saveiro,
 *      Strada e Titano **do dado**, além de qualquer Hilux, S10, Ranger, Toro
 *      ou Montana que entre depois, sem ninguém tocar nesta lista.
 *   3. Tabela de exceções por nome, só para o que as duas primeiras não
 *      alcançam: perua e van não têm campo que as denuncie.
 *   4. Default masculino — que é o comportamento anterior, então nada regride
 *      num modelo que ninguém previu.
 *
 * ⚠️ **Não tente adivinhar por terminação.** "Saveiro" é feminina e "Cruzeiro"
 * seria masculino; sufixo erraria com cara de acerto, que é o pior tipo de
 * erro num `<title>` indexado. A tabela é dado: incluir um modelo é uma linha.
 *
 * ---------------------------------------------------------------------------
 * Por que sem nenhum import
 * ---------------------------------------------------------------------------
 * Mesma razão de `lib/faixasDePreco.ts` e `lib/veiculoUrl.ts`: o texto dos hubs
 * roda no servidor, mas os rótulos de carroceria também aparecem em componente
 * de cliente. Um import de `./supabase` aqui arrastaria o cliente do banco para
 * o bundle do navegador. **Não acrescente import neste arquivo** sem conferir
 * quem o consome.
 */

export type Genero = "m" | "f";

/**
 * Modelos femininos que nem o segmento nem a carroceria denunciam.
 *
 * Perua, Van e Utilitário ganharam valor próprio em `CARROCERIAS` em
 * 2026-08-26, mas a tabela continua sendo a rede de segurança: a carroceria é
 * campo que o painel edita à mão, e um veículo que chegue do feed como "Hatch"
 * — que é o que o RevendaMais manda quando não sabe — não pode derrubar a
 * concordância da página inteira. Chaves normalizadas por `normalizar()`:
 * minúsculas, sem acento e sem pontuação.
 *
 * Saveiro, Strada, Montana e Oroch estão aqui **de propósito**, mesmo já
 * cobertas pela regra da picape: `tipo` é campo que o painel edita à mão, e
 * um veículo lançado sem carroceria não pode derrubar a concordância da página
 * inteira.
 */
const MODELOS_FEMININOS = new Set([
  // Picapes — redundante com a regra 2, e é para ser.
  "saveiro",
  "strada",
  "montana",
  "oroch",
  "toro",
  "titano",
  "hilux",
  "ranger",
  "s10",
  "amarok",
  "frontier",
  "l200",
  "triton",
  "maverick",
  "rampage",
  // Peruas, vans e furgões — aqui a tabela é a única fonte.
  "kombi",
  "parati",
  "spin",
  "zafira",
  "meriva",
  "livina",
  "fiorino",
  "doblo",
  "kangoo",
  "partner",
  "berlingo",
  "brasilia",
  "variant",
  "belina",
  "caravan",
  "ipanema",
  "quantum",
  "besta",
]);

/**
 * Modelos masculinos que as regras 1 e 2 marcariam errado.
 *
 * O Kia Bongo é o caso que abriu esta porta: o feed o classifica como picape,
 * mas ninguém em Curitiba diz "a Bongo" — é caminhão leve, e caminhão é
 * masculino. Lido na saída real antes de subir, não numa asserção.
 *
 * Esta lista **vence** o segmento e a carroceria. Use com parcimônia: cada
 * entrada é uma regra derrotada, e a regra normalmente está certa.
 */
const MODELOS_MASCULINOS = new Set(["bongo"]);

/**
 * Carrocerias femininas. As chaves são os valores de `CARROCERIAS`
 * (`lib/classificacaoVeiculo.ts`) — a lista não é importada de propósito, ver
 * a nota sobre imports no topo; `tests/genero-e-concordancia.test.ts` prende as
 * duas para que não possam divergir em silêncio.
 */
const CARROCERIAS_FEMININAS = new Set([
  "picape",
  "wagon",
  "perua",
  "van",
  // "motocicleta" faltava, e a função devolvia masculino para ela — lido na
  // saída real ao acrescentar as três novas, não numa asserção. Estava
  // mascarado porque a regra do segmento `motos` vem antes e já devolve
  // feminino, e porque `CARROCERIAS_COM_HUB` exclui Motocicleta: nenhuma
  // página chegava a escrever "o motocicleta". Mascarado não é corrigido.
  "motocicleta",
]);

/**
 * O plural de cada carroceria, escrito — não montado com `+ "s"`.
 *
 * O que havia antes era `` `${nome}s` `` seguido de `.toLowerCase()`, e saía
 * "Conversívels", "Hatchs" e — no `<h1>`, no `<title>` e nas quatro perguntas
 * do `FAQPage` — "suvs", com a sigla comida.
 */
const PLURAIS: Record<string, string> = {
  SUV: "SUVs",
  Sedan: "Sedans",
  Picape: "Picapes",
  Hatch: "Hatches",
  Motocicleta: "Motocicletas",
  Esportivo: "Esportivos",
  Conversível: "Conversíveis",
  Coupe: "Coupés",
  Wagon: "Wagons",
  Perua: "Peruas",
  Van: "Vans",
  // "Utilitários", não "Utilitárioes": o acento cai no plural.
  "Utilitário": "Utilitários",
  // "Caminhões", não "Caminhãos": o `-ão` átono faz plural em `-ões`, e a
  // regra genérica (`${palavra}s`) erraria exatamente aqui.
  "Caminhão": "Caminhões",
};

/**
 * As carrocerias que têm plural escrito nesta tabela.
 *
 * Existe para o teste: `generoDoVeiculo` não importa `CARROCERIAS` (ver a nota
 * sobre imports no topo), então sem isto um rótulo novo entraria no vocabulário
 * e cairia no `+ "s"` do fallback sem ninguém perceber.
 */
export const CARROCERIAS_COM_PLURAL: readonly string[] = Object.keys(PLURAIS);

/** Minúsculas, sem acento e sem pontuação — a forma em que a tabela é chaveada. */
function normalizar(valor: string): string {
  return (valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

interface ContextoDeGenero {
  /** `carros` ou `motos` — moto é feminina por padrão. */
  segmento?: string | null;
  /** A carroceria como o estoque a traz. Picape é feminina. */
  tipo?: string | null;
}

/**
 * O gênero de um modelo. Ver as quatro regras no topo do arquivo.
 *
 * `modelo` deve ser o rótulo limpo — "Saveiro", não "VW Saveiro Robust CD
 * 1.6" —, que é o que `rotuloDoModelo` devolve. A normalização tolera caixa e
 * acento, mas não sabe achar o nome dentro de uma versão inteira.
 */
export function generoDeModelo(modelo: string, contexto: ContextoDeGenero = {}): Genero {
  if (MODELOS_MASCULINOS.has(normalizar(modelo))) return "m";
  if ((contexto.segmento ?? "").trim().toLowerCase() === "motos") return "f";
  if (generoDeCarroceria(contexto.tipo ?? "") === "f" && (contexto.tipo ?? "").trim()) return "f";
  if (MODELOS_FEMININOS.has(normalizar(modelo))) return "f";
  return "m";
}

/** O gênero de uma carroceria: "a picape", "o SUV". Vazio devolve masculino. */
export function generoDeCarroceria(carroceria: string): Genero {
  return CARROCERIAS_FEMININAS.has(normalizar(carroceria)) ? "f" : "m";
}

/** "SUV" → "SUVs", "Conversível" → "Conversíveis". Preserva a caixa. */
export function pluralDeCarroceria(carroceria: string): string {
  const limpa = (carroceria ?? "").trim();
  if (!limpa) return limpa;
  const conhecida = Object.keys(PLURAIS).find((k) => normalizar(k) === normalizar(limpa));
  return conhecida ? PLURAIS[conhecida] : `${limpa}s`;
}

/**
 * O gênero que um segmento impõe ao texto do hub de marca.
 *
 * Uma marca não tem gênero próprio — "Volkswagen" cobre a Saveiro e o Polo. O
 * que decide o texto do hub de marca é o segmento: `/motos/honda` fala de motos
 * e concorda no feminino; `/carros/honda` fala de carros. Existe para que a
 * rota de marca não precise saber a regra.
 */
export function generoDoSegmento(segmento: string | null | undefined): Genero {
  return (segmento ?? "").trim().toLowerCase() === "motos" ? "f" : "m";
}

/** Escolhe entre a forma masculina e a feminina. O verbo de toda concordância daqui. */
export function concordar(genero: Genero, masculino: string, feminino: string): string {
  return genero === "f" ? feminino : masculino;
}

/** "seminovo" / "seminova" — e o plural, que é o que mais aparece em `<h1>`. */
export function seminovo(genero: Genero, plural = false): string {
  if (plural) return concordar(genero, "seminovos", "seminovas");
  return concordar(genero, "seminovo", "seminova");
}

/** "usado" / "usada". */
export function usado(genero: Genero, plural = false): string {
  if (plural) return concordar(genero, "usados", "usadas");
  return concordar(genero, "usado", "usada");
}

/** "avaliados" / "avaliadas" — a frase "de cada dez avaliados, três entram". */
export function avaliados(genero: Genero): string {
  return concordar(genero, "avaliados", "avaliadas");
}

/** Artigo indefinido: "um" / "uma". */
export function um(genero: Genero): string {
  return concordar(genero, "um", "uma");
}

/** Artigo definido: "o" / "a" — e "os" / "as". */
export function o(genero: Genero, plural = false): string {
  if (plural) return concordar(genero, "os", "as");
  return concordar(genero, "o", "a");
}

/** Artigo definido com maiúscula, para começo de frase: "O" / "A", "Os" / "As". */
export function O(genero: Genero, plural = false): string {
  const artigo = o(genero, plural);
  return artigo.charAt(0).toUpperCase() + artigo.slice(1);
}

/** Preposição `em` contraída: "no" / "na". */
export function no(genero: Genero, plural = false): string {
  if (plural) return concordar(genero, "nos", "nas");
  return concordar(genero, "no", "na");
}

/** "No" / "Na" para começo de frase. */
export function No(genero: Genero, plural = false): string {
  const contracao = no(genero, plural);
  return contracao.charAt(0).toUpperCase() + contracao.slice(1);
}

/** Possessivo de segunda pessoa: "seu" / "sua". */
export function seu(genero: Genero): string {
  return concordar(genero, "seu", "sua");
}

/**
 * O primeiro segmento da URL de um veículo — `carros` ou `motos`.
 *
 * Criado em 2026-08-19 (P6 da `RECOMENDACAO_SEO.md`). Até aqui toda ficha
 * morava em `/carros/…`, inclusive as 4 motocicletas do estoque: a URL
 * anunciava carro para quem procurava moto, e quem chegava por busca via
 * "carros" no endereço de uma Harley.
 *
 * Feito agora porque são **4 veículos**. Cada moto vendida com a URL antiga
 * indexada encarece a troca, e o dono confirmou que motos deixam de ser
 * exceção no estoque.
 *
 * ---------------------------------------------------------------------------
 * Por que um módulo próprio, e não uma string em cada lugar
 * ---------------------------------------------------------------------------
 * O prefixo não é só endereço: `LeadPopup` decide se está numa ficha olhando
 * para ele, e `analytics` classifica a página do mesmo jeito. Espalhar
 * `"/carros/"` por esses arquivos fazia a moto nascer sem popup de lead e
 * classificada como "outra página" — falha silenciosa, do tipo que só aparece
 * num relatório meses depois.
 *
 * Este arquivo não importa nada: serve tanto ao servidor quanto ao cliente.
 */

/** Os segmentos que servem ficha de veículo. Ordem irrelevante. */
export const SEGMENTOS_DE_PDP = ["carros", "motos"] as const;
export type SegmentoDePdp = (typeof SEGMENTOS_DE_PDP)[number];

/**
 * A carroceria que o feed usa para moto.
 *
 * Vem do RevendaMais como "Motocicleta" e passa por `resolveTipo` antes de
 * chegar aqui. A comparação ignora caixa porque o feed já mandou
 * "MOTOCICLETA" e "motocicleta" no mesmo ciclo, e usa `startsWith` para
 * cobrir "Motoneta" e afins sem inventar uma lista.
 */
function ehMotocicleta(tipo: string | null | undefined): boolean {
  return (tipo ?? "").trim().toLowerCase().startsWith("moto");
}

/**
 * Onde a ficha deste veículo mora.
 *
 * Sem `tipo`, cai em `carros` — que é o comportamento anterior e o caso da
 * esmagadora maioria. Um veículo que chegue aqui sem a carroceria gera link
 * para o segmento errado, e é por isso que a ficha **redireciona** em vez de
 * servir os dois: o endereço errado existe, mas não indexa.
 */
export function segmentoDoVeiculo(veiculo: { tipo?: string | null }): SegmentoDePdp {
  return ehMotocicleta(veiculo.tipo) ? "motos" : "carros";
}

/** Este caminho é a ficha de um veículo? Usado por popup de lead e tracking. */
export function ehCaminhoDePdp(caminho: string): boolean {
  return SEGMENTOS_DE_PDP.some((s) => caminho.startsWith(`/${s}/`));
}

/** Este segmento de URL serve ficha? Qualquer outro é 404 na rota. */
export function ehSegmentoDePdp(valor: string): valor is SegmentoDePdp {
  return (SEGMENTOS_DE_PDP as readonly string[]).includes(valor);
}

/**
 * A slugificação dos segmentos de URL de veículo, num lugar só.
 *
 * Nasceu dentro de `getVeiculoPdpUrl` (`lib/supabase.ts`) e vive aqui desde
 * que os hubs de marca e modelo passaram a existir: `/carros/jeep/renegade`
 * precisa gerar exatamente o mesmo segmento que a ficha usa, senão o hub não
 * casa com a URL do veículo que ele deveria listar — e o link interno cai num
 * 404 sem ninguém perceber.
 *
 * Comportamento preservado do original, defeitos incluídos: caractere
 * acentuado é REMOVIDO, não transliterado ("citroën" → "citron"). Corrigir
 * isso agora renomearia URLs de ficha já indexadas, que é exatamente o que a
 * §2.2.2b do plano manda não fazer. Quem quiser transliterar, faça numa
 * migração própria, com 301.
 */
/**
 * As abreviações que o RevendaMais manda coladas na versão.
 *
 * O feed escreve "VOLCANO 2.2 16V 4X4 TB DIE. AUT.", e a URL saía
 * `volcano-22-16v-4x4-tb-die-aut` — três palavras cortadas no meio. O dono
 * pediu em 2026-08-31: *"informações truncadas e repetidas, pode ser mais
 * clean e entregar dados relevantes para os indexadores"*.
 *
 * Tabela CURTA e por TOKEN INTEIRO, de propósito. Um `replace` solto em "aut"
 * comeria o miolo de qualquer palavra que o contenha; casando só o token
 * separado, "aut" vira "automatico" e nada mais é tocado. Só entram aqui as
 * abreviações que o feed usa de fato e que não têm outro sentido possível numa
 * versão de veículo — na dúvida, deixa como está: URL feia é melhor que URL
 * errada.
 */
const ABREVIACOES_DA_VERSAO: Record<string, string> = {
  aut: "automatico",
  die: "diesel",
  tb: "turbo",
  turbodie: "turbodiesel",
  cs: "cabine-simples",
  cd: "cabine-dupla",
};

/** Expande as abreviações conhecidas, token a token. */
function expandirAbreviacoes(slug: string): string {
  return slug
    .split("-")
    .map((t) => ABREVIACOES_DA_VERSAO[t] ?? t)
    .join("-");
}

export function slugificar(bruto: string): string {
  return bruto
    .toLowerCase()
    .trim()
    // O ponto vira HÍFEN, e não vazio.
    //
    // Enquanto ele era apagado por `[^a-z0-9-]`, "2.2" saía `22` — um motor
    // 2.2 anunciado na URL como "vinte e dois", e "1.0" virando "10". Não é
    // feiúra, é informação errada: quem lê o endereço lê outro carro.
    //
    // Corrigido em 2026-08-31, na mesma virada que encurtou a URL da ficha.
    // Mudar isto renomeia endereço, e foi por isso que esperou uma janela: o
    // site ainda não anuncia e quase nada indexou — *"se existe um momento
    // para alinhar e mudar, é este"*.
    .replace(/[.,/]/g, "-")
    // Acento vira a letra sem acento, e não o vazio.
    //
    // Sem esta linha, `[^a-z0-9-]` APAGAVA o caractere acentuado: `Utilitário`
    // saía `utilitrio` e `Conversível` saía `conversvel`. Os hubs continuavam
    // funcionando — as duas pontas usavam a mesma função —, mas a URL pública
    // ficava com a palavra escrita errada.
    //
    // Corrigido em 2026-08-28, e a hora importa: nenhum dos 35 veículos
    // servidos tem acento em marca, modelo ou versão (medido), então nenhuma
    // URL de ficha muda hoje. `Utilitário` e `Conversível` ainda não têm carro
    // — os dois hubs respondem 404. Depois que as carrocerias pendentes forem
    // aplicadas, `/estoque/utilitrio` existiria e seria indexado assim.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    // H\u00edfen duplo aparece quando o bruto trazia "2.2 " ou " / " \u2014 o ponto e a
    // barra viram h\u00edfen e o espa\u00e7o ao lado vira outro. Sem esta limpeza a URL
    // sai com `2-2--16v`, e h\u00edfen sobrando no fim ("aut.") deixaria `-aut-`.
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** O segmento de VERS\u00c3O, com as abrevia\u00e7\u00f5es do feed abertas por extenso. */
export function slugDeVersao(bruto: string): string {
  return expandirAbreviacoes(slugificar(bruto));
}

/**
 * O segmento de marca da URL — `jeep` em `/carros/jeep/renegade`.
 *
 * Sem fallback silencioso: marca vazia devolve "", e quem chama decide. O
 * `getVeiculoPdpUrl` mantém o dele ("veiculo"), que é comportamento antigo e
 * está gravado em URL indexada.
 */
export function slugDeMarca(marca: string): string {
  return slugificar(marca);
}

/**
 * O segmento de modelo — `renegade` em `/carros/jeep/renegade`.
 *
 * O RevendaMais manda o modelo com a marca na frente ("Chevrolet Cruze") e às
 * vezes com a versão no fim ("Cruze LTZ 1.4 Turbo"). As duas limpezas são as
 * mesmas que a ficha aplica; repeti-las aqui é o que garante que hub e ficha
 * cheguem ao mesmo texto.
 */
export function limparModelo(marca: string, modelo: string, versao: string): string {
  const marcaLower = marca.toLowerCase().trim();
  const versaoLower = versao.toLowerCase().trim();
  let limpo = modelo.toLowerCase().trim();

  if (marcaLower && limpo.startsWith(marcaLower)) {
    limpo = limpo.slice(marcaLower.length).trim();
  }
  if (versaoLower && limpo.endsWith(versaoLower)) {
    limpo = limpo.slice(0, limpo.length - versaoLower.length).trim();
  }

  return limpo;
}

/** O mesmo texto de `limparModelo`, já em forma de segmento de URL. */
export function slugDeModelo(marca: string, modelo: string, versao: string): string {
  return slugificar(limparModelo(marca, modelo, versao) || modelo);
}

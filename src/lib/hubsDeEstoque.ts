import type { Veiculo } from "../types";
import { getEstoque } from "./supabase";
import { CARROCERIAS } from "./classificacaoVeiculo";
import { PERFIS_DE_USO, type PerfilDeUso } from "./perfisDeUso";
// O preço vigente já vive em `regrasEstoque` — é o mesmo que a vitrine, os
// destaques e o feed usam. Duas versões dessa regra é como o filtro de preço
// e a etiqueta de promoção acabam discordando na mesma tela.
import { precoVigente } from "./regrasEstoque";
import { FAIXAS_DE_PRECO, type FaixaDePreco } from "./faixasDePreco";
// A concordância sai daqui, e é calculada a partir do HISTÓRICO — ver a nota
// em `generoDeModelo` mais abaixo, no ponto em que o hub é montado.
import {
  generoDeCarroceria,
  generoDeModelo,
  pluralDeCarroceria,
  type Genero,
} from "./generoDoVeiculo";
import {
  SEGMENTOS_DE_PDP,
  segmentoDoVeiculo,
  slugDeMarca,
  slugDeModelo,
  slugificar,
  type SegmentoDePdp,
} from "./veiculoUrl";

/**
 * As páginas perenes do estoque — marca, modelo e carroceria.
 *
 * O problema que este módulo resolve está no §2.2.1 do plano de aquisição: num
 * estoque que gira a cada 45 dias, a ficha do veículo é efêmera. Ela converte,
 * mas não acumula autoridade: quando o Renegade vende, todo o sinal que a URL
 * juntou morre com ela. E até 25/08/2026 `/carros/jeep` e `/carros/jeep/renegade`
 * respondiam 404 — não havia camada nenhuma acima da ficha.
 *
 * ---------------------------------------------------------------------------
 * A regra que sustenta tudo: hub é PERENE
 * ---------------------------------------------------------------------------
 * Um hub existe enquanto a loja já tiver vendido aquilo, não enquanto tiver em
 * estoque. `/carros/jeep/renegade` continua no ar com a grade vazia quando o
 * último Renegade sai — é o mesmo comportamento que `/destaques/[tag]` já tem,
 * e é o que permite (num pacote futuro) mandar a ficha vendida para o hub do
 * modelo em vez de para `/estoque`.
 *
 * Daí a assinatura de todas as funções aqui: `historico` decide se a página
 * existe, `disponiveis` decide o que ela mostra. Quem chama passa
 * `getEstoque({ incluirForaDoFeed: true })` no primeiro e o estoque vivo no
 * segundo. Confundir os dois faz o hub sumir junto com o carro.
 *
 * Marca que a loja nunca teve continua 404: sem isso o site abriria espaço de
 * URL infinito (`/carros/ferrari`, `/carros/qualquer-coisa`), que é exatamente
 * a página fina que o §2.3.3 manda não criar.
 */

export interface HubDeMarca {
  /** Como a loja escreve — "Jeep", "BMW". Sai do próprio estoque, não de lista fixa. */
  nome: string;
  slug: string;
  segmento: SegmentoDePdp;
  /** À venda agora. Pode ser lista vazia: o hub continua de pé. */
  veiculos: Veiculo[];
  /** Quantos modelos distintos a loja já teve dessa marca. */
  modelos: HubDeModelo[];
}

export interface HubDeModelo {
  nome: string;
  slug: string;
  /**
   * O gênero gramatical do modelo — "a Saveiro", "o Polo".
   *
   * Calculado a partir do **histórico**, nunca de `veiculos`: a lista de
   * disponíveis fica vazia justamente na página perene sem estoque, que é onde
   * o texto mais precisa concordar. Mesma regra que rege o módulo inteiro.
   */
  genero: Genero;
  /**
   * O hub limpo que este duplica, quando o feed colou a versão no modelo.
   *
   * `null` na esmagadora maioria. Ver `ehRotuloSujo` para o porquê e para o
   * que a rota faz com isso.
   */
  canonicalDe: string | null;
  marca: string;
  slugMarca: string;
  segmento: SegmentoDePdp;
  veiculos: Veiculo[];
}

export interface HubDePerfil extends PerfilDeUso {
  veiculos: Veiculo[];
}

export interface HubDeCarroceria {
  nome: string;
  slug: string;
  /** "a picape", "o SUV" — de `generoDeCarroceria`. */
  genero: Genero;
  /** "SUVs", "Conversíveis" — escrito, não montado com `+ "s"`. */
  plural: string;
  veiculos: Veiculo[];
}

/**
 * O nome do modelo como se escreve, sem o prefixo da marca nem o sufixo da
 * versão — "Renegade" a partir de "Jeep Renegade S T270 1.3 Tb 4x4 Flex Aut".
 *
 * Faz o mesmo recorte que `limparModelo` (`lib/veiculoUrl.ts`), mas preservando
 * a caixa: aquele existe para montar URL, e URL é minúscula por definição. As
 * duas versões precisam concordar sobre ONDE cortar — por isso o mesmo par de
 * comparações, sempre em minúscula, aplicado a índices da string original.
 */
export function rotuloDoModelo(marca: string, modelo: string, versao?: string | null): string {
  const marcaLimpa = (marca ?? "").trim();
  const versaoLimpa = (versao ?? "").trim();
  let texto = (modelo ?? "").trim();

  if (marcaLimpa && texto.toLowerCase().startsWith(marcaLimpa.toLowerCase())) {
    texto = texto.slice(marcaLimpa.length).trim();
  }
  if (versaoLimpa && texto.toLowerCase().endsWith(versaoLimpa.toLowerCase())) {
    texto = texto.slice(0, texto.length - versaoLimpa.length).trim();
  }

  return texto || (modelo ?? "").trim();
}

/**
 * Este rótulo ainda carrega a versão colada?
 *
 * O RevendaMais manda a versão dentro do modelo em parte do estoque, e quando
 * o campo `versao` não bate com o fim da string, `rotuloDoModelo` não tem o que
 * cortar. Medido no sitemap de produção em 2026-08-25, dois casos entre 35:
 *
 *   /carros/ford/ka-sedan-10-se-flex-4p      — duplica /carros/ford/ka
 *   /carros/honda/hr-v-ex-18-flexone-16v-5p-aut
 *
 * O `<title>` do primeiro saía "Ka Sedan 1.0 Se Flex 4p Seminovo em Curitiba",
 * competindo com o hub limpo pela mesma consulta.
 *
 * A limpeza NÃO é feita no slug: a URL já está de pé, a trilha da ficha aponta
 * para ela, e mexer em `slugDeModelo` renomearia página indexada. O hub sujo
 * continua respondendo e passa a declarar `canonical` para o limpo — decisão do
 * dono em 2026-08-25.
 *
 * Os marcadores são os que a versão traz e o nome de modelo não: cilindrada com
 * ponto, número de portas, câmbio, combustível, válvulas, turbo.
 */
export function rotuloLimpo(rotulo: string): string {
  const texto = (rotulo ?? "").trim();
  if (!ehRotuloSujo(texto)) return texto;

  // Corta no primeiro pedaço que traz dígito: é onde a versão começa.
  // "Ka Sedan 1.0 Se Flex 4p" → "Ka Sedan". "Hr-v Ex 1.8 …" → "Hr-v Ex".
  // Sem nada antes do corte, devolve o original — nome torto é melhor que
  // rótulo vazio no `<h1>`.
  const pedacos = texto.split(/\s+/);
  const corte = pedacos.findIndex((p) => /\d/.test(p));
  const limpo = (corte > 0 ? pedacos.slice(0, corte) : pedacos).join(" ");
  return limpo || texto;
}

export function ehRotuloSujo(rotulo: string): boolean {
  const texto = (rotulo ?? "").trim().toLowerCase();
  if (!texto) return false;
  return (
    /\d[.,]\d/.test(texto) ||
    /\b\d+\s?p\b/.test(texto) ||
    /\b\d+\s?v\b/.test(texto) ||
    /\b(aut|mec|flex|tb|turbo|gasolina|diesel|manual)\b/.test(texto)
  );
}

/**
 * A grafia mais usada de um rótulo, entre as que o estoque traz.
 *
 * O feed manda "JEEP", "Jeep" e "jeep" na mesma tabela. Escolher a mais
 * frequente é honesto — o site nunca inventa uma capitalização que o dado não
 * tem — e é estável: só muda se a loja passar a escrever diferente.
 */
function grafiaDominante(valores: string[]): string {
  const contagem = new Map<string, number>();
  for (const v of valores) {
    const limpo = (v ?? "").trim();
    if (!limpo) continue;
    contagem.set(limpo, (contagem.get(limpo) ?? 0) + 1);
  }
  let vencedor = "";
  let melhor = -1;
  for (const [valor, n] of contagem) {
    if (n > melhor) {
      melhor = n;
      vencedor = valor;
    }
  }
  return vencedor;
}

/** Só o que está à venda, na ordem em que o estoque veio. */
function disponiveisDe(lista: Veiculo[]): Veiculo[] {
  return lista.filter((v) => !v.vendido);
}

/**
 * Todos os hubs de marca de um segmento (`carros` ou `motos`).
 *
 * `historico` decide quais existem; `disponiveis` preenche as grades.
 */
export function hubsDeMarca(
  historico: Veiculo[],
  disponiveis: Veiculo[],
  segmento: SegmentoDePdp,
): HubDeMarca[] {
  const doSegmento = historico.filter((v) => segmentoDoVeiculo(v) === segmento);
  const porSlug = new Map<string, Veiculo[]>();

  for (const v of doSegmento) {
    const slug = slugDeMarca(v.marca);
    if (!slug) continue;
    porSlug.set(slug, [...(porSlug.get(slug) ?? []), v]);
  }

  const hubs: HubDeMarca[] = [];
  for (const [slug, linhas] of porSlug) {
    const nome = grafiaDominante(linhas.map((v) => v.marca));
    const veiculos = disponiveis.filter(
      (v) => segmentoDoVeiculo(v) === segmento && slugDeMarca(v.marca) === slug,
    );
    hubs.push({
      nome,
      slug,
      segmento,
      veiculos,
      modelos: hubsDeModelo(linhas, veiculos, segmento, slug),
    });
  }

  // Marca com carro à venda primeiro; entre elas, a de maior estoque. O hub
  // vazio continua listado, no fim — é perene, não é escondido.
  return hubs.sort(
    (a, b) => b.veiculos.length - a.veiculos.length || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Os hubs de modelo de uma marca. Mesma regra de existência dos de marca. */
export function hubsDeModelo(
  historico: Veiculo[],
  disponiveis: Veiculo[],
  segmento: SegmentoDePdp,
  slugMarca: string,
): HubDeModelo[] {
  const daMarca = historico.filter(
    (v) => segmentoDoVeiculo(v) === segmento && slugDeMarca(v.marca) === slugMarca,
  );
  const porSlug = new Map<string, Veiculo[]>();

  for (const v of daMarca) {
    const slug = slugDeModelo(v.marca, v.modelo, v.versao);
    if (!slug) continue;
    porSlug.set(slug, [...(porSlug.get(slug) ?? []), v]);
  }

  const hubs: HubDeModelo[] = [];
  for (const [slug, linhas] of porSlug) {
    // O nome EXIBIDO é o limpo; o slug continua sendo o que já está indexado.
    // Sem isso o `<h1>` do hub do Ka saía "Ford Ka Sedan 1.0 Se Flex 4p".
    const bruto = grafiaDominante(linhas.map((v) => rotuloDoModelo(v.marca, v.modelo, v.versao)));
    const nome = rotuloLimpo(bruto);
    hubs.push({
      nome,
      slug,
      // A carroceria sai do HISTÓRICO, não de `veiculos` — é a mesma regra que
      // rege o módulo. Um hub perene sem nenhuma unidade à venda continua
      // sabendo que Saveiro é picape, e por isso continua escrevendo "a
      // Saveiro" em vez de cair no masculino por falta de dado.
      genero: generoDeModelo(nome, {
        segmento,
        tipo: grafiaDominante(linhas.map((v) => v.tipo ?? "")),
      }),
      canonicalDe: null,
      marca: grafiaDominante(linhas.map((v) => v.marca)),
      slugMarca,
      segmento,
      veiculos: disponiveis.filter(
        (v) => slugDeModelo(v.marca, v.modelo, v.versao) === slug && slugDeMarca(v.marca) === slugMarca,
      ),
    });
  }

  // O hub sujo aponta para o limpo: mesmo prefixo de slug, rótulo sem versão.
  // Só depois de todos montados, porque um precisa enxergar o outro.
  // A sujeira é lida do SLUG, não do nome: o nome já foi limpo acima.
  for (const hub of hubs) {
    if (!ehRotuloSujo(hub.slug.replace(/-/g, " "))) continue;
    const limpo = hubs.find(
      (outro) => outro !== hub && hub.slug.startsWith(`${outro.slug}-`),
    );
    if (limpo) hub.canonicalDe = limpo.slug;
  }

  return hubs.sort(
    (a, b) => b.veiculos.length - a.veiculos.length || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Um hub de marca pelo segmento e slug da URL, ou `null` — que a rota vira 404. */
export function acharHubDeMarca(
  historico: Veiculo[],
  disponiveis: Veiculo[],
  segmento: SegmentoDePdp,
  slug: string,
): HubDeMarca | null {
  return hubsDeMarca(historico, disponiveis, segmento).find((h) => h.slug === slug) ?? null;
}

/** Um hub de modelo pelo par (marca, modelo) da URL, ou `null`. */
export function acharHubDeModelo(
  historico: Veiculo[],
  disponiveis: Veiculo[],
  segmento: SegmentoDePdp,
  slugMarca: string,
  slugModelo: string,
): HubDeModelo | null {
  return (
    hubsDeModelo(historico, disponiveis, segmento, slugMarca).find((h) => h.slug === slugModelo) ??
    null
  );
}

/**
 * As carrocerias que viram `/estoque/{carroceria}`.
 *
 * Lista fechada, tirada de `CARROCERIAS` — não do que o feed trouxe. Aceitar
 * segmento livre aqui abriria a mesma porta que o 404 de marca fecha, e a
 * carroceria é campo que o painel edita à mão: um erro de digitação viraria
 * URL indexável.
 *
 * `Motocicleta` fica de fora: moto tem segmento próprio (`/motos/…`) desde o P6
 * da `docs/RECOMENDACAO_SEO.md`, e `/estoque/motocicleta` competiria com ele.
 */
export const CARROCERIAS_COM_HUB = CARROCERIAS.filter((c) => c !== "Motocicleta");

export function hubsDeCarroceria(historico: Veiculo[], disponiveis: Veiculo[]): HubDeCarroceria[] {
  const jaTeve = new Set(
    historico.map((v) => slugificar(v.tipo ?? "")).filter(Boolean),
  );

  return CARROCERIAS_COM_HUB.filter((nome) => jaTeve.has(slugificar(nome)))
    .map((nome) => ({
      nome,
      slug: slugificar(nome),
      genero: generoDeCarroceria(nome),
      plural: pluralDeCarroceria(nome),
      veiculos: disponiveis.filter((v) => slugificar(v.tipo ?? "") === slugificar(nome)),
    }))
    .sort((a, b) => b.veiculos.length - a.veiculos.length || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Os hubs de perfil de uso — `/estoque/familia`, `/estoque/trabalho`.
 *
 * Diferente da carroceria em dois pontos, e os dois vêm de o perfil ser LISTA:
 *
 *   1. O mesmo veículo aparece em vários hubs, de propósito. Um HB20 urbano e
 *      econômico entra nas duas vitrines — é o motivo de a coluna ser array.
 *   2. O recorte sai de `disponiveis`, não do histórico. Perfil é decisão do
 *      painel, não do feed: um perfil que ninguém marcou hoje não descreve o
 *      pátio de ontem, e uma vitrine perene vazia aqui não teria o que contar.
 *      Marca e modelo são o contrário — lá o histórico É o argumento.
 */
export function hubsDePerfil(disponiveis: Veiculo[]): HubDePerfil[] {
  return PERFIS_DE_USO.map((perfil) => ({
    ...perfil,
    veiculos: disponiveis.filter((v) => (v.perfis_uso ?? []).includes(perfil.slug)),
  }))
    .filter((h) => h.veiculos.length > 0)
    .sort((a, b) => b.veiculos.length - a.veiculos.length || a.nome.localeCompare(b.nome, "pt-BR"));
}

export function acharHubDePerfil(disponiveis: Veiculo[], slug: string): HubDePerfil | null {
  return hubsDePerfil(disponiveis).find((h) => h.slug === slug) ?? null;
}

export function acharHubDeCarroceria(
  historico: Veiculo[],
  disponiveis: Veiculo[],
  slug: string,
): HubDeCarroceria | null {
  return hubsDeCarroceria(historico, disponiveis).find((h) => h.slug === slug) ?? null;
}

/**
 * Tudo que o sitemap precisa saber: o caminho de cada hub que existe hoje.
 *
 * Devolve caminho relativo, na ordem em que aparecem na navegação, para o
 * `sitemap.ts` só prefixar o domínio.
 */
export function caminhosDosHubs(historico: Veiculo[], disponiveis: Veiculo[]): string[] {
  const caminhos: string[] = [];

  for (const segmento of SEGMENTOS_DE_PDP) {
    for (const marca of hubsDeMarca(historico, disponiveis, segmento)) {
      caminhos.push(`/${segmento}/${marca.slug}`);
      for (const modelo of marca.modelos) {
        // Hub que aponta para outro fica FORA do sitemap. Listar uma URL que
        // manda o robô para outro endereço é sinal contraditório: o sitemap
        // diz "indexe isto", o `<link rel="canonical">` da própria página diz
        // "indexe aquilo".
        //
        // Encontrado em 2026-08-26 com `/carros/ford/ka-sedan-10-se-flex-4p`,
        // que estava no sitemap servido E canonicalizava para
        // `/carros/ford/ka`. A migração 20260826150000 corrige a origem dos
        // quatro casos conhecidos; esta regra é para o próximo, porque a
        // origem é o feed e o feed volta a errar.
        if (modelo.canonicalDe) continue;
        caminhos.push(`/${segmento}/${marca.slug}/${modelo.slug}`);
      }
    }
  }

  for (const carroceria of hubsDeCarroceria(historico, disponiveis)) {
    caminhos.push(`/estoque/${carroceria.slug}`);
  }

  // Só os perfis com veículo — `hubsDePerfil` já filtra. Vitrine de perfil
  // vazia não entra: ao contrário da faixa de preço, a lista aqui é decisão do
  // painel, e um perfil que ninguém marcou não tem história para contar.
  for (const perfil of hubsDePerfil(disponiveis)) {
    caminhos.push(`/estoque/${perfil.slug}`);
  }

  // As faixas entram sempre: a lista é fechada e a página existe mesmo vazia.
  for (const faixa of FAIXAS_DE_PRECO) {
    caminhos.push(`/estoque/${faixa.slug}`);
  }

  return caminhos;
}

export { disponiveisDe };

/**
 * Os dois recortes do estoque que toda página perene precisa, numa chamada.
 *
 * `historico` inclui quem saiu do feed — é ele que decide se a página EXISTE.
 * `disponiveis` é o que a grade mostra. Trocar um pelo outro faz o hub sumir
 * junto com o último carro da marca, que é exatamente o que ele existe para
 * impedir. As duas leituras são independentes, então vão em paralelo.
 */
export async function recortesDoEstoque(): Promise<{
  historico: Veiculo[];
  disponiveis: Veiculo[];
}> {
  const [historico, vivos] = await Promise.all([
    // `incluirNaoPublicaveis` no HISTÓRICO, e só nele: o papel dele é dizer
    // quais páginas já tiveram razão de existir. Um carro com fotos faltando
    // hoje pode ganhá-las amanhã, e um vendido em 2024 pode ser o único
    // registro de um modelo — filtrar aqui apagaria hub indexado por um
    // bloqueio reversível. `disponiveis`, que preenche as grades, respeita o
    // bloqueio porque vem de `getEstoque()` sem opção.
    getEstoque({ incluirForaDoFeed: true, incluirNaoPublicaveis: true }),
    getEstoque(),
  ]);
  return { historico, disponiveis: disponiveisDe(vivos) };
}

/**
 * Os hubs de faixa de preço.
 *
 * A lista em si vive em `lib/faixasDePreco.ts`, sem nenhum import: ela também é
 * lida por `lib/dataLayer.ts`, que roda no cliente, e este arquivo importa o
 * Supabase. A nota de lá explica os cortes escolhidos e por que não são os do
 * plano de aquisição.
 */
export { FAIXAS_DE_PRECO, type FaixaDePreco };

export interface HubDeFaixa extends FaixaDePreco {
  veiculos: Veiculo[];
}

export function hubsDeFaixa(disponiveis: Veiculo[]): HubDeFaixa[] {
  return FAIXAS_DE_PRECO.map((faixa) => ({
    ...faixa,
    veiculos: disponiveis.filter((v) => {
      const preco = precoVigente(v);
      return preco > 0 && preco >= faixa.min && preco < faixa.max;
    }),
  }));
}

export function acharHubDeFaixa(disponiveis: Veiculo[], slug: string): HubDeFaixa | null {
  return hubsDeFaixa(disponiveis).find((f) => f.slug === slug) ?? null;
}

/**
 * Para onde vai a URL de um veículo cujo ciclo terminou.
 *
 * A cascata do §2.2.2 do plano de aquisição, com uma regra que não se
 * negocia: **nunca para a home**. Redirecionar uma ficha para a raiz é o padrão
 * que o Google trata como soft-404 — ele descarta o sinal em vez de transferi-lo,
 * que é o oposto do motivo de existir do redirecionamento.
 *
 * Modelo → marca → `/estoque`. O hub do modelo é o destino natural: quem
 * procurava "renegade usado curitiba" e caiu num Renegade vendido continua
 * querendo um Renegade. Só desce um degrau quando o de cima não existe — e
 * como os hubs são perenes, na prática o destino quase sempre é o modelo.
 */
export function destinoDoVeiculoArquivado(
  veiculo: Veiculo,
  historico: Veiculo[],
  disponiveis: Veiculo[],
): string {
  const segmento = segmentoDoVeiculo(veiculo);
  const slugMarca = slugDeMarca(veiculo.marca);
  const slugModelo = slugDeModelo(veiculo.marca, veiculo.modelo, veiculo.versao);

  if (acharHubDeModelo(historico, disponiveis, segmento, slugMarca, slugModelo)) {
    return `/${segmento}/${slugMarca}/${slugModelo}`;
  }
  if (acharHubDeMarca(historico, disponiveis, segmento, slugMarca)) {
    return `/${segmento}/${slugMarca}`;
  }
  return "/estoque";
}

import type { Veiculo } from "../types";
import { getEstoque } from "./supabase";
import { CARROCERIAS } from "./classificacaoVeiculo";
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
  marca: string;
  slugMarca: string;
  segmento: SegmentoDePdp;
  veiculos: Veiculo[];
}

export interface HubDeCarroceria {
  nome: string;
  slug: string;
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
    hubs.push({
      nome: grafiaDominante(linhas.map((v) => rotuloDoModelo(v.marca, v.modelo, v.versao))),
      slug,
      marca: grafiaDominante(linhas.map((v) => v.marca)),
      slugMarca,
      segmento,
      veiculos: disponiveis.filter(
        (v) => slugDeModelo(v.marca, v.modelo, v.versao) === slug && slugDeMarca(v.marca) === slugMarca,
      ),
    });
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
      veiculos: disponiveis.filter((v) => slugificar(v.tipo ?? "") === slugificar(nome)),
    }))
    .sort((a, b) => b.veiculos.length - a.veiculos.length || a.nome.localeCompare(b.nome, "pt-BR"));
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
        caminhos.push(`/${segmento}/${marca.slug}/${modelo.slug}`);
      }
    }
  }

  for (const carroceria of hubsDeCarroceria(historico, disponiveis)) {
    caminhos.push(`/estoque/${carroceria.slug}`);
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
    getEstoque({ incluirForaDoFeed: true }),
    getEstoque(),
  ]);
  return { historico, disponiveis: disponiveisDe(vivos) };
}

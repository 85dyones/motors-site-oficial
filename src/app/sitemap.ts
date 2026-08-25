import { MetadataRoute } from "next";
import { getCarimbosDeConteudo, getEstoque, getVeiculoPdpUrl } from "../lib/supabase";
import { decidirPublicacao, getDatasDeVenda } from "../lib/publicacao";
import { getCachedSettings } from "../lib/settings";
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
  resolverDestaques,
} from "../lib/destaquesRapidos";

import { SITE_URL } from "../lib/site";
import { caminhosDosHubs, recortesDoEstoque } from "../lib/hubsDeEstoque";
import { CAMINHOS_GEO } from "../lib/paginasGeo";

/**
 * O sitemap acompanha o banco, não o build.
 *
 * Sem esta linha o arquivo é gerado uma única vez, na compilação, e congela.
 * Medido em produção em 2026-08-17: 88 veículos anunciados contra 41 na
 * vitrine. O descompasso corria nos dois sentidos — 53 URLs de carros que já
 * tinham saído do feed do RevendaMais (todas respondendo 200) e, do outro
 * lado, 6 carros que ENTRARAM depois do último deploy e que o Google nunca
 * soube que existiam. O segundo caso é o caro: estoque real invisível na busca
 * até o próximo deploy, sem nenhum sintoma no site.
 *
 * Uma hora é a mesma cadência do ISR da PDP e folgada para o sync do estoque,
 * que roda de 6 em 6 horas.
 */
export const revalidate = 3600;

/**
 * Slugs das landings de destaque que realmente existem.
 *
 * Antes esta lista era fixa: anunciava `curadoria` e `economicos`, que não
 * estão configuradas em produção, e omitia as categorias criadas no painel.
 * Agora sai do mesmo lugar que alimenta os chips da home — e só entra quem
 * tem veículo casando com a regra, para o Google não indexar grade vazia.
 */
async function destaquesParaSitemap(): Promise<string[]> {
  try {
    const [estoque, settings] = await Promise.all([getEstoque(), getCachedSettings()]);
    const tags = normalizarQuickTags(settings.quickTags);
    return resolverDestaques(
      tags.length > 0 ? tags : DESTAQUES_PADRAO,
      estoque.filter((v) => !v.vendido),
      normalizarStockOverrides(settings.stockOverrides),
    ).map((d) => d.slug);
  } catch (error) {
    console.error("[Sitemap] Falha ao resolver destaques:", error);
    return [];
  }
}

/**
 * Data das páginas institucionais, mantida à mão.
 *
 * Elas não têm carimbo em lugar nenhum — o texto vive no repositório e no
 * painel, não numa coluna com `updated_at`. `new Date()` aqui faria as sete
 * rotas anunciarem alteração de hora em hora, que é justamente o que tira a
 * credibilidade do `lastmod`.
 *
 * Uma constante é honesta e tem um custo claro: quem mudar o texto de /sobre,
 * /contato ou /privacidade precisa subir esta data junto. É pouco, e o esquecimento
 * erra para o lado seguro — anuncia antigo demais, nunca recente demais.
 */
const ATUALIZACAO_INSTITUCIONAL = new Date("2026-08-15T00:00:00Z");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // As leituras que alimentam o `lastmod`, a carência e as páginas perenes.
  // Independentes entre si, então vão juntas.
  const [carimbos, datasDeVenda, destaques, recortes] = await Promise.all([
    getCarimbosDeConteudo(),
    getDatasDeVenda(),
    destaquesParaSitemap(),
    recortesDoEstoque(),
  ]);

  /** Carimbo do veículo, ou nada. Sem invenção — ver `getCarimbosDeConteudo`. */
  const carimboDe = (id: string): Date | undefined => {
    const bruto = carimbos[String(id)];
    if (!bruto) return undefined;
    const d = new Date(bruto);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  // A home e o catálogo mudam quando o estoque muda: a data mais recente do
  // inventário é literalmente quando essas duas páginas passaram a mostrar
  // outra coisa.
  const carimbosValidos = Object.values(carimbos)
    .map((c) => new Date(c).getTime())
    .filter((t) => !Number.isNaN(t));
  const inventarioMudouEm =
    carimbosValidos.length > 0 ? new Date(Math.max(...carimbosValidos)) : undefined;

  const routes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: inventarioMudouEm,
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    {
      // Catálogo completo — a página que a home aponta como "ver todo o estoque"
      url: `${SITE_URL}/estoque`,
      lastModified: inventarioMudouEm,
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/carro-perfeito`,
      lastModified: ATUALIZACAO_INSTITUCIONAL,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/avaliacao`,
      lastModified: ATUALIZACAO_INSTITUCIONAL,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      // Destino da campanha de financiamento: a grade e o simulador acompanham
      // o estoque, então o carimbo é o do inventário, não o institucional.
      url: `${SITE_URL}/financiamento`,
      lastModified: inventarioMudouEm,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/garantia`,
      lastModified: ATUALIZACAO_INSTITUCIONAL,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/sobre`,
      lastModified: ATUALIZACAO_INSTITUCIONAL,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/contato`,
      lastModified: ATUALIZACAO_INSTITUCIONAL,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/privacidade`,
      lastModified: ATUALIZACAO_INSTITUCIONAL,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    // Landings de destaque: são recortes do estoque, então mudam com ele.
    ...destaques.map((slug) => ({
      url: `${SITE_URL}/destaques/${slug}`,
      lastModified: inventarioMudouEm,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    /**
     * Páginas de bairro e cidade.
     *
     * `weekly` e não `daily`: o texto é escrito à mão e não muda com o giro do
     * estoque — só a grade embaixo dele muda. Anunciar alteração diária num
     * conteúdo estável é o tipo de exagero que tira a credibilidade do arquivo
     * inteiro, e é a mesma razão de `ATUALIZACAO_INSTITUCIONAL` existir.
     */
    ...CAMINHOS_GEO.map((caminho) => ({
      url: `${SITE_URL}${caminho}`,
      lastModified: inventarioMudouEm,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    /**
     * Hubs perenes de marca, modelo e carroceria.
     *
     * Prioridade 0.8: acima das institucionais e abaixo das fichas, que são o
     * que de fato converte. Entram TODOS os hubs que existem — inclusive os de
     * grade vazia. Um hub que some do sitemap quando o último carro da marca é
     * vendido volta a ser efêmero, que é exatamente o defeito que ele existe
     * para corrigir.
     *
     * O arquivo continua único, sem índice: o limite de um sitemap é 50.000
     * URLs e este anda na casa das centenas. Dividir agora seria manutenção
     * sem ganho — a divisão em `sitemap-estoque.xml`, `sitemap-hubs.xml` e
     * afins só se paga quando o volume justificar.
     */
    ...caminhosDosHubs(recortes.historico, recortes.disponiveis).map((caminho) => ({
      url: `${SITE_URL}${caminho}`,
      lastModified: inventarioMudouEm,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];

  // Dynamic vehicle detail pages (PDP) fetched from Supabase
  try {
    const estoque = await getEstoque();

    const vehicleRoutes: MetadataRoute.Sitemap = [];
    for (const veiculo of estoque) {
      // `foraDoFeed: false` não é atalho: `getEstoque()` já descartou quem não
      // veio no último ciclo, então tudo que chega aqui está no feed. O que
      // ainda pode sair do índice é o carro vendido há mais que a carência.
      const publicacao = decidirPublicacao({
        vendido: veiculo.vendido,
        foraDoFeed: false,
        dataVenda: datasDeVenda[String(veiculo.id)],
      });
      if (publicacao.noindex) continue;

      vehicleRoutes.push({
        url: `${SITE_URL}${getVeiculoPdpUrl(veiculo)}`,
        lastModified: carimboDe(veiculo.id),
        changeFrequency: "daily" as const,
        priority: 0.9,
      });
    }

    return [...routes, ...vehicleRoutes];
  } catch (error) {
    console.error("[Sitemap] Dynamic generation failed, serving fallback static routes:", error);
    return routes;
  }
}

import type { Metadata } from "next";
import type {
  CardCompartilhamento,
  CompanySettings,
  CompartilhamentoSettings,
} from "../types";

/**
 * Prévia de link — o que WhatsApp, Facebook, Instagram e LinkedIn mostram
 * quando alguém cola uma URL do site.
 *
 * Antes de 2026-08-10 o site inteiro compartilhava a mesma coisa: `/logo.png`
 * declarado como 1200×630 no layout raiz. O arquivo é 1024×513, e o scraper
 * confia na dimensão declarada — daí o logo esticado. Pior, `/avaliacao` e
 * `/carro-perfeito` não declaravam `openGraph` nenhum e herdavam o card da
 * home inteiro, texto incluso: compartilhar a avaliação de veículo mostrava
 * "Motors Store | Encontre seu Veículo Premium dos Sonhos".
 *
 * Cascata da IMAGEM, e a página nunca fica sem card:
 *   1. imagem do contexto (a foto do veículo, na PDP);
 *   2. a arte que a loja subiu para AQUELA página, no painel;
 *   3. a arte padrão do painel, que vale para o site todo;
 *   4. o card gerado por `/og`, sempre 1200×630.
 *
 * Cascata do TEXTO, deliberadamente mais curta:
 *   1. o texto que a loja escreveu para AQUELA página;
 *   2. o texto de fábrica da página.
 *
 * O padrão do painel não entra no texto. Título global é precisamente o que
 * fazia a avaliação se anunciar como se fosse a home, e na PDP faria todo
 * veículo compartilhar a mesma frase no lugar do próprio modelo e preço. Arte
 * repetida no site inteiro é aceitável; título repetido não é.
 */

// Sem constante de domínio aqui de propósito, e agora por um motivo melhor: o
// endereço do site vive em `lib/site.ts` desde 2026-08-14. As URLs deste
// módulo continuam saindo RELATIVAS, e o Next as resolve contra o
// `metadataBase` do layout — que já lê de lá. Não há o que trocar aqui no dia
// em que a loja mudar de domínio.

/**
 * As páginas que a loja customiza no painel.
 *
 * `rotuloCard` é a versalete no alto do card gerado — é o que distingue uma
 * prévia da outra quando ninguém subiu arte. Os textos de fábrica moram aqui,
 * e não espalhados pelos `page.tsx`, para que o preview do painel mostre
 * exatamente o que o site publica.
 *
 * ⚠️ **Vocabulário.** Estes textos são a cara do site em WhatsApp e Facebook, e
 * até 2026-08-25 diziam "premium", "procedência garantida" e "melhores
 * condições" — as três colunas do lado *Evitar* de
 * `conteudo-seo/POSICIONAMENTO.md`, que o dono decidiu em 2026-08-17. O termo
 * da casa é **seleção**, e o argumento é o que a loja RECUSA: *de cada dez
 * avaliados, três entram*. Não reintroduzir.
 */
export const PAGINAS_COMPARTILHAVEIS = [
  {
    id: "home",
    nome: "Home",
    caminho: "/",
    rotuloCard: "",
    tituloPadrao: "Motors Store | Seminovos Selecionados em Curitiba",
    descricaoPadrao:
      "De cada dez veículos avaliados, três entram. Perícia cautelar independente, laudo na ficha assim que aprovado, preço no anúncio.",
  },
  {
    id: "estoque",
    nome: "Estoque",
    caminho: "/estoque",
    rotuloCard: "Estoque",
    tituloPadrao: "Seminovos selecionados em Curitiba",
    descricaoPadrao:
      "Todo veículo passa por perícia cautelar independente antes de entrar na vitrine. O laudo fica na ficha assim que aprovado.",
  },
  {
    id: "avaliacao",
    nome: "Avaliação Express",
    caminho: "/avaliacao",
    rotuloCard: "Avaliação Express",
    tituloPadrao: "Quanto vale o seu carro hoje",
    descricaoPadrao:
      "Dados oficiais da Tabela FIPE cruzados com o giro real do nosso estoque. Um consultor retorna no WhatsApp com a proposta.",
  },
  {
    id: "carroPerfeito",
    nome: "Garagem Profiler",
    caminho: "/carro-perfeito",
    rotuloCard: "Garagem Profiler",
    tituloPadrao: "Descubra o carro certo para o seu uso",
    descricaoPadrao:
      "Cinco perguntas, trinta segundos. Traçamos seu perfil de uso e um consultor envia três sugestões reais do estoque no WhatsApp.",
  },
  {
    id: "sobre",
    nome: "Quem Somos",
    caminho: "/sobre",
    rotuloCard: "Quem somos",
    tituloPadrao: "Tradição de showroom, curadoria de tecnologia",
    descricaoPadrao:
      "Conheça a história da Motors Store: um showroom tradicional em Curitiba que virou curadoria com IA e aceita três de cada dez carros avaliados.",
  },
  {
    id: "contato",
    nome: "Contato",
    caminho: "/contato",
    rotuloCard: "Fale conosco",
    tituloPadrao: "Agende sua visita ao showroom",
    descricaoPadrao:
      "Entre em contato com a Motors Store Oficial. Envie sua mensagem diretamente para nossa equipe em Curitiba para agendamentos e propostas.",
  },
  {
    id: "destaques",
    nome: "Destaques",
    caminho: "/destaques/…",
    rotuloCard: "Destaque",
    tituloPadrao: "Seleção de destaque em Curitiba",
    descricaoPadrao:
      "Um recorte do estoque que passou pela perícia cautelar independente. Procedência na ficha, e o laudo assim que a perícia é aprovada.",
  },
  {
    id: "privacidade",
    nome: "Privacidade",
    caminho: "/privacidade",
    rotuloCard: "Privacidade",
    tituloPadrao: "Como tratamos os seus dados",
    descricaoPadrao:
      "Como a Motors Store coleta, usa e protege seus dados pessoais, e como exercer seus direitos sob a LGPD.",
  },
] as const;

export type IdPaginaCompartilhavel =
  (typeof PAGINAS_COMPARTILHAVEIS)[number]["id"];

/**
 * A página do veículo não é customizável no painel: ela compartilha a foto e
 * o preço do próprio carro, que é sempre melhor do que qualquer arte fixa.
 * Só participa da cascata para herdar a arte padrão quando o veículo chega
 * sem foto utilizável.
 */
export type ContextoCompartilhamento = IdPaginaCompartilhavel | "pdp";

/** Proporção que Facebook e WhatsApp usam para o card grande. */
export const LARGURA_CARD = 1200;
export const ALTURA_CARD = 630;

function limpar(valor?: string | null): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Uma imagem só serve de prévia se o scraper conseguir buscá-la por HTTP.
 *
 * `data:` é o caso que morde: `/api/upload-branding` cai em base64 inline
 * quando o Storage falha, e o valor gravado no painel fica parecendo uma URL
 * válida — a prévia some sem erro nenhum. WebP é o outro: o painel converte
 * logo e favicon para WebP, e o WhatsApp não renderiza WebP em prévia de link.
 */
export function imagemServivelComoPrevia(url?: string | null): boolean {
  const valor = limpar(url);
  if (!valor) return false;
  if (valor.startsWith("data:")) return false;
  const semQuery = valor.split("?")[0].toLowerCase();
  if (semQuery.endsWith(".webp") || semQuery.endsWith(".svg")) return false;
  return true;
}

/**
 * URL do card gerado, para quando não há arte subida no painel.
 *
 * `/og`, e não `/api/og`: o `robots.ts` bloqueia `/api/` para todo agente, e o
 * crawler do Facebook — o mesmo que monta a prévia do WhatsApp — obedece
 * robots.txt ao buscar o `og:image`. Ver a nota em `src/app/og/route.tsx`.
 */
export function urlDoCardGerado(titulo: string, rotulo?: string): string {
  const params = new URLSearchParams({ titulo: limpar(titulo).slice(0, 120) });
  const marcador = limpar(rotulo);
  if (marcador) params.set("rotulo", marcador.slice(0, 40));
  return `/og?${params.toString()}`;
}

interface EntradaCompartilhamento {
  empresa: CompanySettings | null | undefined;
  pagina: ContextoCompartilhamento;
  /** Sobrepõe o texto de fábrica do catálogo. A `/estoque` usa para incluir a
   *  contagem do dia; a landing de destaque, para incluir o nome da tag. */
  tituloPadrao?: string;
  descricaoPadrao?: string;
  rotulo?: string;
  /** Caminho canônico da página, para o `og:url`. */
  caminho?: string;
  /** Imagem que vence o painel. Só a PDP usa: a foto do veículo. */
  imagemPreferida?: string;
  /**
   * `true` quando a imagem preferida tem proporção desconhecida (foto vinda do
   * RevendaMais). Aí não declaramos width/height — declarar dimensão errada é
   * exatamente o que esticava o logo da home.
   */
  imagemPreferidaSemDimensao?: boolean;
}

/**
 * Monta `openGraph` + `twitter` de uma página pública.
 *
 * Sempre `summary_large_image`: `summary` (que /sobre, /contato e /privacidade
 * usavam) renderiza uma miniatura quadrada de ~120px, e no WhatsApp vira uma
 * tarja quase invisível ao lado do texto.
 */
export function montarCompartilhamento({
  empresa,
  pagina,
  tituloPadrao,
  descricaoPadrao,
  rotulo,
  caminho,
  imagemPreferida,
  imagemPreferidaSemDimensao,
}: EntradaCompartilhamento): Pick<Metadata, "openGraph" | "twitter"> {
  const config: CompartilhamentoSettings = empresa?.compartilhamento ?? {};
  const doCatalogo =
    pagina === "pdp"
      ? undefined
      : PAGINAS_COMPARTILHAVEIS.find((p) => p.id === pagina);
  const proprio: CardCompartilhamento =
    pagina === "pdp" ? {} : config[pagina] ?? {};

  const titulo =
    limpar(proprio.titulo) ||
    limpar(tituloPadrao) ||
    doCatalogo?.tituloPadrao ||
    empresa?.name?.trim() ||
    "Motors Store";

  const descricao =
    limpar(proprio.descricao) ||
    limpar(descricaoPadrao) ||
    doCatalogo?.descricaoPadrao ||
    "";

  const marcador = limpar(rotulo) || doCatalogo?.rotuloCard || "";

  const doPainel = [proprio.imagemUrl, config.padrao?.imagemUrl]
    .map(limpar)
    .find(imagemServivelComoPrevia);

  const preferida = limpar(imagemPreferida);
  const usarPreferida = !!preferida && imagemServivelComoPrevia(preferida);

  // A arte do painel entra com dimensão declarada porque o upload a força em
  // 1200×630; a foto do veículo entra sem, porque vem do fornecedor num
  // tamanho que não controlamos e o scraper mede sozinho.
  const imagem = usarPreferida
    ? {
        url: preferida,
        alt: titulo,
        ...(imagemPreferidaSemDimensao
          ? {}
          : { width: LARGURA_CARD, height: ALTURA_CARD }),
      }
    : {
        url: doPainel ?? urlDoCardGerado(titulo, marcador),
        width: LARGURA_CARD,
        height: ALTURA_CARD,
        alt: titulo,
      };

  return {
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: empresa?.name?.trim() || "Motors Store",
      title: titulo,
      description: descricao,
      ...(caminho ? { url: caminho } : {}),
      images: [imagem],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
      images: [imagem.url],
    },
  };
}

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALTURA_CARD,
  LARGURA_CARD,
  PAGINAS_COMPARTILHAVEIS,
  imagemServivelComoPrevia,
  montarCompartilhamento,
  urlDoCardGerado,
} from "../src/lib/compartilhamento";
import type { CompanySettings } from "../src/types";

/**
 * Prévia de link — o card do WhatsApp, do Facebook e do LinkedIn.
 *
 * Três defeitos estavam em produção e cada um tem um teste aqui:
 *
 *  1. O layout raiz declarava `/logo.png` como 1200×630. O arquivo é
 *     1024×513, e o scraper estica a imagem para o que foi declarado — era daí
 *     o logo deformado da home.
 *  2. `/avaliacao` e `/carro-perfeito` não declaravam `openGraph` nenhum e
 *     herdavam o card da home inteiro: compartilhar a avaliação anunciava
 *     "Encontre seu Veículo Premium dos Sonhos".
 *  3. A PDP declarava toda foto como 800×600, qualquer que fosse a foto.
 *
 * O quarto teste cobre um defeito que a própria correção quase introduziu: se
 * o card padrão do painel valesse também para TEXTO, um título global voltaria
 * a sobrescrever o título de cada página — e, na PDP, o modelo e o preço de
 * cada veículo.
 */

const raiz = join(__dirname, "..");
const ler = (...caminho: string[]) => readFileSync(join(raiz, ...caminho), "utf-8");

const layout = ler("src", "app", "layout.tsx");
const pdp = ler(
  "src",
  "app",
  "carros",
  "[marca]",
  "[modelo]",
  "[versao]",
  "[slug_completo_com_id]",
  "page.tsx"
);

const EMPRESA_VAZIA = { name: "Motors Store" } as CompanySettings;

function empresaCom(compartilhamento: CompanySettings["compartilhamento"]) {
  return { name: "Motors Store", compartilhamento } as CompanySettings;
}

/** A imagem que o `montarCompartilhamento` publicou, já desempacotada. */
function imagemDe(meta: ReturnType<typeof montarCompartilhamento>) {
  const imagens = meta.openGraph?.images;
  return (Array.isArray(imagens) ? imagens[0] : imagens) as {
    url: string;
    width?: number;
    height?: number;
  };
}

describe("logo esticado da home", () => {
  it("o layout não declara mais o logo com dimensão que ele não tem", () => {
    // O arquivo é 1024×513. Qualquer declaração de tamanho junto de
    // `/logo.png` volta a mentir para o scraper.
    expect(layout).not.toMatch(/logo\.png[\s\S]{0,80}width/);
    expect(layout).not.toContain("images: [{ url: \"/logo.png\"");
  });

  it("o card gerado tem a proporção que declara", () => {
    const meta = montarCompartilhamento({
      empresa: EMPRESA_VAZIA,
      pagina: "home",
    });
    const imagem = imagemDe(meta);

    expect(imagem.url).toContain("/og");
    expect(imagem.width).toBe(LARGURA_CARD);
    expect(imagem.height).toBe(ALTURA_CARD);
    // 1200×630 é a proporção que Facebook e WhatsApp recortam sem sobra.
    expect(LARGURA_CARD / ALTURA_CARD).toBeCloseTo(1.9, 1);
  });
});

describe("cada página tem card próprio", () => {
  it("as rotas que herdavam a home agora declaram o seu", () => {
    for (const rota of ["avaliacao", "carro-perfeito"]) {
      const arquivo = ler("src", "app", rota, "page.tsx");
      expect(arquivo).toContain("montarCompartilhamento");
      expect(arquivo).toContain("generateMetadata");
    }
  });

  it("nenhuma página compartilha título com outra", () => {
    const titulos = PAGINAS_COMPARTILHAVEIS.map((p) => p.tituloPadrao);
    expect(new Set(titulos).size).toBe(titulos.length);
  });

  it("todas usam o card grande, e não a miniatura quadrada", () => {
    // `summary` renderiza ~120px de lado; no WhatsApp vira uma tarja ao lado
    // do texto. /sobre, /contato e /privacidade usavam isso.
    for (const pagina of PAGINAS_COMPARTILHAVEIS) {
      const meta = montarCompartilhamento({ empresa: EMPRESA_VAZIA, pagina: pagina.id });
      // `Twitter` é união discriminada pelo próprio `card`; o tipo não expõe a
      // chave antes de estreitar.
      expect((meta.twitter as { card?: string })?.card).toBe("summary_large_image");
    }
  });
});

describe("cascata da imagem", () => {
  it("a arte da página vence a arte padrão", () => {
    const meta = montarCompartilhamento({
      empresa: empresaCom({
        padrao: { imagemUrl: "https://cdn.exemplo/padrao.jpg" },
        sobre: { imagemUrl: "https://cdn.exemplo/sobre.jpg" },
      }),
      pagina: "sobre",
    });

    expect(imagemDe(meta).url).toBe("https://cdn.exemplo/sobre.jpg");
  });

  it("a arte padrão cobre quem não tem a sua", () => {
    const meta = montarCompartilhamento({
      empresa: empresaCom({ padrao: { imagemUrl: "https://cdn.exemplo/padrao.jpg" } }),
      pagina: "contato",
    });

    expect(imagemDe(meta).url).toBe("https://cdn.exemplo/padrao.jpg");
  });

  it("sem arte nenhuma, cai no card gerado — nunca em imagem vazia", () => {
    for (const pagina of PAGINAS_COMPARTILHAVEIS) {
      const imagem = imagemDe(
        montarCompartilhamento({ empresa: EMPRESA_VAZIA, pagina: pagina.id })
      );
      expect(imagem.url).toContain("/og?titulo=");
    }
  });
});

describe("imagem que o scraper não consegue buscar", () => {
  it("recusa data URL", () => {
    // `/api/upload-branding` cai em base64 inline quando o Storage falha. O
    // valor parece uma URL válida no painel e a prévia some sem erro nenhum.
    expect(imagemServivelComoPrevia("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
  });

  it("recusa WebP, que o WhatsApp não renderiza em prévia", () => {
    expect(
      imagemServivelComoPrevia("https://exemplo.supabase.co/logo-123.webp")
    ).toBe(false);
    expect(
      imagemServivelComoPrevia("https://exemplo.supabase.co/arte.jpg?v=2")
    ).toBe(true);
  });

  it("uma arte inservível não vaza para o card — cai no gerado", () => {
    const meta = montarCompartilhamento({
      empresa: empresaCom({ home: { imagemUrl: "data:image/png;base64,iVBORw0KGgo=" } }),
      pagina: "home",
    });

    expect(imagemDe(meta).url).toContain("/og");
  });
});

describe("o padrão do painel não sequestra o texto", () => {
  it("título e descrição padrão do painel não valem para outra página", () => {
    const meta = montarCompartilhamento({
      empresa: empresaCom({
        padrao: { titulo: "TÍTULO GLOBAL", descricao: "DESCRIÇÃO GLOBAL" },
      }),
      pagina: "avaliacao",
    });

    const avaliacao = PAGINAS_COMPARTILHAVEIS.find((p) => p.id === "avaliacao")!;
    expect(meta.openGraph?.title).toBe(avaliacao.tituloPadrao);
    expect(meta.openGraph?.description).toBe(avaliacao.descricaoPadrao);
  });

  it("o texto escrito para a própria página vence o de fábrica", () => {
    const meta = montarCompartilhamento({
      empresa: empresaCom({ contato: { titulo: "Venha tomar um café" } }),
      pagina: "contato",
    });

    expect(meta.openGraph?.title).toBe("Venha tomar um café");
  });
});

describe("página do veículo", () => {
  it("a foto do carro vence a arte do painel", () => {
    const meta = montarCompartilhamento({
      empresa: empresaCom({ padrao: { imagemUrl: "https://cdn.exemplo/padrao.jpg" } }),
      pagina: "pdp",
      tituloPadrao: "BMW X4 por R$ 318.900",
      imagemPreferida: "https://s3.carro57.com.br/foto.jpeg",
      imagemPreferidaSemDimensao: true,
    });

    expect(imagemDe(meta).url).toBe("https://s3.carro57.com.br/foto.jpeg");
  });

  it("não declara dimensão da foto do fornecedor", () => {
    // O 800×600 fixo era o mesmo defeito do logo: dimensão declarada que a
    // imagem não tem. Sem declaração, o scraper mede o arquivo.
    const imagem = imagemDe(
      montarCompartilhamento({
        empresa: EMPRESA_VAZIA,
        pagina: "pdp",
        tituloPadrao: "BMW X4 por R$ 318.900",
        imagemPreferida: "https://s3.carro57.com.br/foto.jpeg",
        imagemPreferidaSemDimensao: true,
      })
    );

    expect(imagem.width).toBeUndefined();
    expect(imagem.height).toBeUndefined();
    expect(pdp).not.toContain("width: 800");
  });

  it("veículo sem foto não fica sem card", () => {
    const meta = montarCompartilhamento({
      empresa: EMPRESA_VAZIA,
      pagina: "pdp",
      tituloPadrao: "BMW X4 por R$ 318.900",
      imagemPreferida: "",
      imagemPreferidaSemDimensao: true,
    });

    expect(imagemDe(meta).url).toContain("/og");
  });

  it("nenhum card do painel sobrescreve o título do veículo", () => {
    // A PDP não é página selecionável no painel. Se um dia virar, todo veículo
    // passa a compartilhar a mesma frase no lugar do próprio modelo e preço.
    const ids = PAGINAS_COMPARTILHAVEIS.map((p) => p.id as string);
    expect(ids).not.toContain("pdp");

    const meta = montarCompartilhamento({
      empresa: empresaCom({ padrao: { titulo: "TÍTULO GLOBAL" } }),
      pagina: "pdp",
      tituloPadrao: "BMW X4 por R$ 318.900",
    });
    expect(meta.openGraph?.title).toBe("BMW X4 por R$ 318.900");
  });

  it("o card do veículo não repete a versão já contida no modelo", () => {
    // O RevendaMais manda "X4 M40i 3.0 M Sport Edit V6 Turbo Aut" como modelo
    // E como versão. Somados, consumiam o título inteiro do card.
    expect(pdp).toContain("nomeDoVeiculo");
    expect(pdp).not.toContain("${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} por");
  });

  it("o <title> da busca usa o mesmo nome, sem repetir a versão", () => {
    // P3 da RECOMENDACAO_SEO (2026-08-19). Medido em produção antes: o X4
    // ocupava os 60 caracteres do Google só com a repetição, e preço e nome
    // da loja nunca apareciam no resultado.
    expect(pdp).toContain("title: `${nomeDoVeiculo} - ${priceText} | Motors Store`");
    expect(pdp).not.toContain("${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} - ${priceText}");
  });
});

describe("card gerado", () => {
  it("leva título e rótulo na query", () => {
    const url = urlDoCardGerado("Quanto vale o seu carro", "Avaliação Express");
    const params = new URLSearchParams(url.split("?")[1]);

    expect(params.get("titulo")).toBe("Quanto vale o seu carro");
    expect(params.get("rotulo")).toBe("Avaliação Express");
  });

  it("omite o rótulo quando não há", () => {
    expect(urlDoCardGerado("Motors Store")).not.toContain("rotulo=");
  });
});

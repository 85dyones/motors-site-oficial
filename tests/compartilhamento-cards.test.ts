import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALTURA_CARD,
  CARDS_GERADOS,
  LARGURA_CARD,
  PAGINAS_COMPARTILHAVEIS,
  cardGeradoDa,
  ehChaveDoCardGerado,
  fotoPodeVirarPrevia,
  imagemServivelComoPrevia,
  montarCompartilhamento,
  previaDaFotoDoVeiculo,
  urlDoCardGerado,
  type ChaveDoCardGerado,
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
  "[categoria]",
  "[marca]",
  "[modelo]",
  "[ficha]",
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
    alt?: string;
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
      expect(imagem.url).toBe(urlDoCardGerado(pagina.id));
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

  it("a foto do estoque passa por /og/foto e declara 1200×630", () => {
    // 23/09: no WhatsApp de PC/tablet a ficha saía sem foto. A capa original
    // (429 KB, 1920×1280) passa do teto de ~300 KB do servidor do WhatsApp Web.
    const foto = "https://s3.carro57.com.br/FC/9037/8453942_2_O_cb58bbb97c.jpeg";
    const previa = previaDaFotoDoVeiculo(foto);
    expect(previa.semDimensao).toBe(false);
    expect(new URLSearchParams(previa.url.split("?")[1]).get("u")).toBe(foto);

    const imagem = imagemDe(
      montarCompartilhamento({
        empresa: EMPRESA_VAZIA,
        pagina: "pdp",
        tituloPadrao: "BMW X1 por R$ 114.900",
        imagemPreferida: previa.url,
        imagemPreferidaSemDimensao: previa.semDimensao,
      })
    );
    expect(imagem.url.startsWith("/og/foto?")).toBe(true);
    expect(imagem.width).toBe(LARGURA_CARD);
    expect(imagem.height).toBe(ALTURA_CARD);
    expect(pdp).toContain("imagemPreferida: previa.url");
  });

  it("/og/foto só busca foto do nosso recorte", () => {
    expect(fotoPodeVirarPrevia("https://zwbqmzgnagfeqinqkolp.supabase.co/storage/v1/object/public/veiculos/1/a.jpg")).toBe(true);
    // Outra revenda no mesmo S3, outro projeto Supabase, e fuga por `..`.
    expect(fotoPodeVirarPrevia("https://s3.carro57.com.br/FC/1234/foto.jpeg")).toBe(false);
    expect(fotoPodeVirarPrevia("https://outro.supabase.co/storage/v1/object/public/a.jpg")).toBe(false);
    expect(fotoPodeVirarPrevia("https://s3.carro57.com.br/FC/9037/../1234/foto.jpeg")).toBe(false);
    expect(fotoPodeVirarPrevia("https://s3.carro57.com.br.evil.com/FC/9037/a.jpg")).toBe(false);

    const fora = previaDaFotoDoVeiculo("https://cdn.exemplo/foto.jpg");
    expect(fora).toEqual({ url: "https://cdn.exemplo/foto.jpg", semDimensao: true });
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
    /* Desde 2026-09-04 o formato do título mora em `lib/tituloDaFicha.ts` —
       o carro indisponível não anuncia preço, e essa decisão precisava ser
       chamável para ser testável (ver `tests/ficha-vendida.test.ts`).
       O que este caso trava continua sendo o mesmo: o que a ficha ENTREGA ao
       título é o nome deduplicado, e não a marca+modelo+versão somadas. */
    expect(pdp).toContain("nome: nomeDoVeiculo");
    expect(pdp).toContain("title: textos.titulo");
    expect(pdp).not.toContain("${veiculo.marca} ${veiculo.modelo} ${veiculo.versao} - ${priceText}");

    const titulo = ler("src", "lib", "tituloDaFicha.ts");
    expect(titulo).toContain("`${nome} - ${precoTexto} | Motors Store`");
  });
});

describe("card gerado: texto fixo, escolhido por chave (01/10)", () => {
  it("a URL escolhe um card, não carrega texto", () => {
    expect(urlDoCardGerado()).toBe("/og");
    expect(urlDoCardGerado("avaliacao")).toBe("/og?card=avaliacao");
    for (const chave of Object.keys(CARDS_GERADOS) as ChaveDoCardGerado[]) {
      expect(urlDoCardGerado(chave)).not.toMatch(/titulo=|rotulo=/);
    }
  });

  it("o título da página vai no texto da prévia, não na imagem", () => {
    const meta = montarCompartilhamento({
      empresa: EMPRESA_VAZIA,
      pagina: "guias",
      tituloPadrao: "Como ler um laudo cautelar",
    });
    expect(meta.openGraph?.title).toBe("Como ler um laudo cautelar");
    expect(imagemDe(meta).url).toBe("/og?card=guias");
    // O `alt` descreve a imagem, que tem o texto fixo do card.
    expect(imagemDe(meta).alt).toBe(CARDS_GERADOS.guias.titulo);
  });

  it("rótulo de card escolhe o card; rótulo livre fica no texto", () => {
    expect(cardGeradoDa("sobre", "Garantia")).toBe("garantia");
    expect(cardGeradoDa("estoque", "Financiamento")).toBe("financiamento");
    expect(cardGeradoDa("pdp", "Repasse")).toBe("repasse");
    expect(cardGeradoDa("estoque", "Jeep Compass")).toBe("estoque");
    expect(cardGeradoDa("pdp", "2021 · 45.000 km")).toBe("estoque");
    expect(cardGeradoDa("destaques", "Blindados")).toBe("destaques");
    // Lista fechada: o rótulo de um card do catálogo não troca o card de outra página.
    expect(cardGeradoDa("destaques", "Estoque")).toBe("destaques");
    expect(cardGeradoDa("estoque", "__proto__")).toBe("estoque");
  });

  it("chave só vale se for de um card de verdade", () => {
    expect(ehChaveDoCardGerado("estoque")).toBe(true);
    expect(ehChaveDoCardGerado("__proto__")).toBe(false);
    expect(ehChaveDoCardGerado("toString")).toBe(false);
    expect(ehChaveDoCardGerado(null)).toBe(false);
  });
});

describe("a rota /og", () => {
  vi.mock("../src/lib/settings", () => ({
    getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }),
  }));
  vi.mock("../src/app/og/recursos", async (original) => ({
    ...(await original<Record<string, unknown>>()),
    carregarArchivo: async () => null,
  }));

  const pedir = async (caminho: string) => {
    const { GET } = await import("../src/app/og/route");
    return GET(new Request(`https://www.motorsstore.com.br${caminho}`));
  };

  it("texto pela URL não desenha nada: vai para o card canônico", async () => {
    const r = await pedir("/og?titulo=Pix%20para%20reservar&rotulo=Promo%C3%A7%C3%A3o");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://www.motorsstore.com.br/og");
    expect(r.headers.get("cache-control")).toBeNull();
  });

  it("chave desconhecida ou parâmetro a mais também redirecionam", async () => {
    expect((await pedir("/og?card=inventado")).headers.get("location")).toBe("https://www.motorsstore.com.br/og");
    expect((await pedir("/og?card=estoque&x=1")).headers.get("location")).toBe(
      "https://www.motorsstore.com.br/og?card=estoque",
    );
  });

  it("a canônica desenha o card; sem a fonte, cache curto", async () => {
    const r = await pedir("/og?card=garantia");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("image/png");
    expect(r.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  }, 30_000);

  it("o código da rota não lê texto da URL", () => {
    const rota = ler("src", "app", "og", "route.tsx");
    const lidos = [...rota.matchAll(/searchParams\.get\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(lidos).toEqual(["card"]);
  });
});

describe("o card do painel vale só para a própria página (01/10)", () => {
  const painel = empresaCom({
    estoque: { titulo: "Título do painel para o estoque", descricao: "Descrição do painel", imagemUrl: "https://cdn.exemplo/estoque.jpg" },
    sobre: { titulo: "Título do Quem somos" },
    guias: { titulo: "Título do índice de guias" },
    destaques: { titulo: "Título dos destaques", imagemUrl: "https://cdn.exemplo/destaques.jpg" },
  });

  it("na própria página o painel vence", () => {
    const meta = montarCompartilhamento({ empresa: painel, pagina: "estoque", tituloPadrao: "12 carros", caminho: "/estoque" });
    expect(meta.openGraph?.title).toBe("Título do painel para o estoque");
    expect(imagemDe(meta).url).toBe("https://cdn.exemplo/estoque.jpg");
  });

  it("quem só usa a chave mantém o próprio título, descrição e imagem", () => {
    for (const [pagina, caminho, titulo] of [
      ["estoque", "/financiamento", "Financiamento de seminovo em Curitiba"],
      ["estoque", "/carros/jeep", "Jeep seminovos em Curitiba"],
      ["estoque", "/estoque/suv", "SUVs seminovos"],
      ["sobre", "/garantia", "Garantia do seminovo — Motors Store"],
      ["guias", "/guias/como-ler-um-laudo", "Como ler um laudo"],
    ] as const) {
      const meta = montarCompartilhamento({ empresa: painel, pagina, tituloPadrao: titulo, descricaoPadrao: "Própria", caminho });
      expect(meta.openGraph?.title, caminho).toBe(titulo);
      expect(meta.openGraph?.description, caminho).toBe("Própria");
      expect(imagemDe(meta).url, caminho).not.toContain("cdn.exemplo/estoque");
    }
  });

  it("no catálogo com curinga, a arte do painel vale para todas; o texto, não", () => {
    const meta = montarCompartilhamento({
      empresa: painel,
      pagina: "destaques",
      tituloPadrao: "Carros blindados em Curitiba",
      caminho: "https://www.motorsstore.com.br/destaques/blindados?utm_source=site",
    });
    expect(meta.openGraph?.title).toBe("Carros blindados em Curitiba");
    expect(imagemDe(meta).url).toBe("https://cdn.exemplo/destaques.jpg");
  });

  it("sem caminho (o padrão do layout) vale como antes", () => {
    const meta = montarCompartilhamento({ empresa: painel, pagina: "estoque", tituloPadrao: "x" });
    expect(meta.openGraph?.title).toBe("Título do painel para o estoque");
  });
});


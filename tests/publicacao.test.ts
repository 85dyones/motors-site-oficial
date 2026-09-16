import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CARENCIA_VENDIDO_DIAS,
  decidirPublicacao,
  diasDesde,
  type SinaisDoVeiculo,
} from "../src/lib/publicacao";
import { getSinaisDeEstoque } from "../src/lib/supabase";

/**
 * O que o site anuncia, e a quem.
 *
 * Medição em produção em 2026-08-17, com o sincronizador de volta ao ar: o
 * sitemap.xml listava 88 veículos e a vitrine mostrava 41. O descompasso corria
 * nos dois sentidos — 53 URLs de carros fora da vitrine respondendo 200 com
 * `schema.org/InStock` e botão de WhatsApp ativo, e 6 carros VIVOS que faltavam
 * no sitemap porque tinham entrado depois do último deploy.
 *
 * A causa dos dois era `src/app/sitemap.ts` não exportar `revalidate`, o que o
 * congelava no build. O feed XML nunca teve o problema por ser `force-dynamic`.
 *
 * Decisões do dono em 2026-08-17: sitemap revalidando de hora em hora; PDP de
 * carro fora do feed viva, marcada como indisponível e fora do índice; PDP de
 * carro vendido indexada por uma carência e só então fora; e `lastmod` saindo
 * de dado real, porque os portais — ao contrário do Google — reprocessam o item.
 */

const raiz = join(__dirname, "..");
const ler = (caminho: string) => readFileSync(join(raiz, caminho), "utf8");

const SITEMAP = "src/app/sitemap.ts";
const PDP = "src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx";
const WRAPPER = "src/components/PDPClientWrapper.tsx";
const SCHEMA_DO_VEICULO = "src/lib/schemaVeiculo.ts";

const AGORA = new Date("2026-08-17T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
/** Carimbo ISO de N dias antes de `AGORA`. */
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA).toISOString();

/** À venda e no feed, salvo o que cada teste mudar. */
const base: SinaisDoVeiculo = { vendido: false, foraDoFeed: false };

describe("decidirPublicacao — carro à venda", () => {
  it("não mexe em nada", () => {
    expect(decidirPublicacao(base, AGORA)).toEqual({
      indisponivel: false,
      rotulo: null,
      noindex: false,
      arquivar: false,
    });
  });
});

describe("decidirPublicacao — fora do feed", () => {
  const foraDoFeed = { ...base, foraDoFeed: true };

  it("sai do índice na hora e não afirma a venda", () => {
    // O feed some com o carro sem dizer por quê — repasse, reserva, anúncio
    // expirado. Não há carência aqui porque não há fato a sustentar: a página
    // não pode manter uma oferta que ninguém confirmou.
    expect(decidirPublicacao(foraDoFeed, AGORA)).toEqual({
      indisponivel: true,
      rotulo: "INDISPONÍVEL",
      noindex: true,
      // Fora do feed NÃO arquiva: o motivo da saída é desconhecido e o carro
      // pode voltar. Só venda consumada recicla a URL.
      arquivar: false,
    });
  });

  it("carimbo antigo não abre exceção — a saída do feed basta", () => {
    const antigo = { ...foraDoFeed, ultimaPresenca: haDias(400) };
    expect(decidirPublicacao(antigo, AGORA).noindex).toBe(true);
  });
});

describe("decidirPublicacao — carência do vendido", () => {
  const vendido = { ...base, vendido: true };

  it("venda recente continua indexada", () => {
    // A parte boa do tráfego: quem busca o modelo na semana seguinte à venda é
    // comprador daquele perfil, e a página já oferece similares.
    const r = decidirPublicacao({ ...vendido, dataVenda: haDias(10) }, AGORA);
    expect(r).toEqual({ indisponivel: true, rotulo: "VENDIDO", noindex: false, arquivar: false });
  });

  it("venda antiga sai do índice", () => {
    const r = decidirPublicacao({ ...vendido, dataVenda: haDias(120) }, AGORA);
    expect(r.noindex).toBe(true);
    expect(r.rotulo).toBe("VENDIDO");
  });

  it("o limite é exclusivo: no último dia da carência ainda está dentro", () => {
    const noLimite = decidirPublicacao(
      { ...vendido, dataVenda: haDias(CARENCIA_VENDIDO_DIAS) },
      AGORA
    );
    const passouUmDia = decidirPublicacao(
      { ...vendido, dataVenda: haDias(CARENCIA_VENDIDO_DIAS + 1) },
      AGORA
    );
    expect(noLimite.noindex).toBe(false);
    expect(passouUmDia.noindex).toBe(true);
  });

  it("sem data de venda, usa last_seen_at como proxy da saída", () => {
    // `veiculos_vendidos.data_venda` só existe para venda fechada pela tela do
    // Ciclo, que é de 2026-08-14. Carro marcado `vendido` direto no painel não
    // tem essa data — e esses são a maioria do acervo atual.
    const r = decidirPublicacao({ ...vendido, ultimaPresenca: haDias(200) }, AGORA);
    expect(r.noindex).toBe(true);
  });

  it("a data de venda vence o proxy quando as duas existem", () => {
    // Carro vendido ontem que sumiu do feed há um ano: o que vale é a venda.
    const r = decidirPublicacao(
      { ...vendido, dataVenda: haDias(1), ultimaPresenca: haDias(365) },
      AGORA
    );
    expect(r.noindex).toBe(false);
  });

  it("SEM NENHUMA data, a carência nunca vence", () => {
    // A regra de segurança: na dúvida, mantém indexado. Desindexar por falta de
    // informação custaria tráfego de carro que talvez nem esteja vendido, e
    // reindexar leva semanas — o erro não é simétrico.
    const r = decidirPublicacao(vendido, AGORA);
    expect(r.noindex).toBe(false);
    expect(r.indisponivel).toBe(true);
  });

  it("data ilegível é tratada como ausente, não como antiga", () => {
    // `new Date("qualquer coisa").getTime()` é NaN. Sem este cuidado, a
    // comparação com NaN devolveria false por acidente em vez de por regra —
    // certo pelo motivo errado, e frágil na próxima mudança.
    const r = decidirPublicacao({ ...vendido, dataVenda: "nao e uma data" }, AGORA);
    expect(r.noindex).toBe(false);
  });

  it("vendido E fora do feed é rotulado VENDIDO", () => {
    // O caso comum: vende e o anúncio sai do portal. Aqui o motivo da saída é
    // conhecido, então dizer "VENDIDO" afirma um fato — e a carência vale.
    const r = decidirPublicacao(
      { vendido: true, foraDoFeed: true, dataVenda: haDias(5) },
      AGORA
    );
    expect(r.rotulo).toBe("VENDIDO");
    expect(r.noindex).toBe(false);
  });
});

describe("diasDesde", () => {
  it("conta dias inteiros", () => {
    expect(diasDesde(haDias(3), AGORA)).toBe(3);
    expect(diasDesde(AGORA.toISOString(), AGORA)).toBe(0);
  });

  it("devolve null para ausente ou ilegível", () => {
    expect(diasDesde(null, AGORA)).toBeNull();
    expect(diasDesde(undefined, AGORA)).toBeNull();
    expect(diasDesde("", AGORA)).toBeNull();
    expect(diasDesde("14 de março", AGORA)).toBeNull();
  });
});

describe("getSinaisDeEstoque", () => {
  it("sem Supabase configurado, ninguém é declarado fora do feed", async () => {
    // A propriedade de segurança que mais importa no caminho de banco: falha
    // para "está no feed". Marcar carro como indisponível por causa de banco
    // fora do ar, env faltando ou tabela vazia é pior que o 200 enganoso que
    // esta função existe para corrigir — a loja perderia venda de carro que TEM.
    //
    // Nesta suíte não há `.env` (ver `vitest.config.ts`), então este é
    // literalmente o caminho de banco indisponível.
    await expect(getSinaisDeEstoque("8359268")).resolves.toEqual({
      foraDoFeed: false,
      ultimaPresenca: null,
    });
  });
});

describe("sitemap acompanha o banco", () => {
  it("exporta revalidate — sem isso ele congela no build", () => {
    const match = ler(SITEMAP).match(/export\s+const\s+revalidate\s*=\s*(\d+)/);
    expect(match, `${SITEMAP} precisa exportar \`revalidate\``).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  it("revalida pelo menos uma vez por ciclo de sync", () => {
    // O sync roda de 6 em 6 horas. Janela maior perderia ciclos inteiros.
    const segundos = Number(ler(SITEMAP).match(/export\s+const\s+revalidate\s*=\s*(\d+)/)![1]);
    expect(segundos).toBeLessThanOrEqual(6 * 60 * 60);
  });

  it("nenhum lastModified é `new Date()`", () => {
    // A regressão que o `revalidate` criaria: com o sitemap estático, `new
    // Date()` dava a data do build; revalidando, passaria a declarar "mudou
    // agora" para todas as URLs, de hora em hora. O Google descarta `lastmod`
    // assim, e os portais — que NÃO descartam — reprocessariam o catálogo
    // inteiro quatro vezes por dia sem nada ter mudado.
    expect(ler(SITEMAP)).not.toMatch(/lastModified:\s*new Date\(\s*\)/);
  });

  it("o lastmod do veículo sai do carimbo de conteúdo", () => {
    expect(ler(SITEMAP)).toMatch(/lastModified:\s*carimboDe\(veiculo\.id\)/);
  });

  it("exclui do sitemap o que está fora do índice", () => {
    // Coerência entre os dois canais: página com `noindex` anunciada no sitemap
    // é instrução contraditória ao crawler.
    expect(ler(SITEMAP)).toMatch(/if\s*\(\s*publicacao\.noindex\s*\)\s*continue/);
  });
});

describe("PDP fora de venda", () => {
  it("sai do índice mantendo os links rastreáveis", () => {
    const fonte = ler(PDP);
    // Sair do sitemap não desindexa: as 53 URLs órfãs seguiriam ranqueando.
    expect(fonte).toMatch(/publicacao\.noindex\s*\?\s*\{\s*robots:\s*\{\s*index:\s*false/);
    // `follow: true` preserva o rastreio dos similares — a página vira porta de
    // entrada para o estoque vivo em vez de beco sem saída.
    expect(fonte).toMatch(/index:\s*false,\s*follow:\s*true/);
  });

  it("declara OutOfStock pela mesma decisão que governa o selo", () => {
    // O `Car` saiu da página para `lib/schemaVeiculo.ts` em 2026-08-25, quando
    // ganhou os campos que faltavam (sku, bodyType, seller…). A decisão não
    // mudou de dono: a página continua passando `publicacao.indisponivel`
    // pronto, e é ele — não `veiculo.vendido` — que define a disponibilidade.
    expect(ler(PDP)).toMatch(/indisponivel:\s*publicacao\.indisponivel/);
    expect(ler(SCHEMA_DO_VEICULO)).toMatch(
      /availability:\s*opcoes\.indisponivel\s*\?\s*["']https:\/\/schema\.org\/OutOfStock/
    );
  });

  it("repassa a decisão pronta ao componente, sem recalcular", () => {
    const fonte = ler(PDP);
    expect(fonte).toMatch(/indisponivel=\{publicacao\.indisponivel\}/);
    expect(fonte).toMatch(/rotuloIndisponivel=\{publicacao\.rotulo\}/);
  });
});

describe("selo da PDP", () => {
  it("o selo, a foto em cinza e o CTA seguem o estado combinado", () => {
    // Contraprova: se qualquer um dos três voltar a ler `veiculo.vendido`
    // direto, o carro fora do feed volta a se apresentar como disponível.
    const fonte = ler(WRAPPER);
    expect(fonte).toMatch(/\{indisponivel\s*&&\s*\(/);
    expect(fonte).toMatch(/indisponivel\s*\?\s*["']filter grayscale/);
    expect(fonte).toMatch(/indisponivel\s*\?\s*["']CONSULTAR SIMILARES["']/);
  });

  it("o override do painel ainda consegue marcar venda no cliente", () => {
    // `stockOverrides` chega depois da montagem e pode marcar `vendido` sem que
    // o feed tenha mudado. O servidor manda, o override só acrescenta.
    expect(ler(WRAPPER)).toMatch(
      /indisponivel\s*=\s*indisponivelDoServidor\s*\|\|\s*veiculo\.vendido/
    );
  });
});

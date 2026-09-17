import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CARENCIA_VENDIDO_DIAS,
  CARENCIA_VENDIDO_NO_FEED_DIAS,
  decidirNoFeed,
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

/**
 * O catálogo de anúncios é o outro consumidor da mesma verdade — e ele erra
 * para o lado OPOSTO do índice de busca.
 *
 * Até 2026-09-06 o feed fazia `if (car.vendido) continue`: o carro sumia no dia
 * da venda. Sumir é pior do que parece — o Meta trata o item como deletado,
 * quebrando anúncio dinâmico ativo e público montado por `content_ids`. O
 * correto é o item continuar existindo, marcado indisponível, por pelo menos um
 * ciclo completo de re-busca, e só então sair.
 */
describe("decidirNoFeed — o carro no catálogo de anúncios", () => {
  const vendido: SinaisDoVeiculo = { vendido: true, foraDoFeed: false };

  it("carro à venda entra disponível", () => {
    expect(decidirNoFeed(base, AGORA)).toEqual({ publica: true, disponibilidade: "in_stock" });
  });

  it("vendido há poucos dias continua no catálogo, marcado indisponível", () => {
    expect(decidirNoFeed({ ...vendido, dataVenda: haDias(2) }, AGORA)).toEqual({
      publica: true,
      disponibilidade: "out_of_stock",
    });
  });

  it("o limite é exclusivo: no último dia da janela ainda está dentro", () => {
    const noLimite = decidirNoFeed(
      { ...vendido, dataVenda: haDias(CARENCIA_VENDIDO_NO_FEED_DIAS) },
      AGORA
    );
    const passouUmDia = decidirNoFeed(
      { ...vendido, dataVenda: haDias(CARENCIA_VENDIDO_NO_FEED_DIAS + 1) },
      AGORA
    );
    expect(noLimite.publica).toBe(true);
    expect(passouUmDia.publica).toBe(false);
  });

  it("data de venda no FUTURO não prende o carro no catálogo", () => {
    // `diasDesde` devolve NEGATIVO para data futura, e negativo é `<= 7`. Sem
    // guarda, um "2027" digitado no lugar de "2026" mantinha o carro anunciado
    // por um ano. O caminho existe inteiro: `data_venda` é `date not null` sem
    // CHECK, o fechamento do Ciclo valida km e valor mas não a data, e a tela
    // usa `<input type="date">` sem `max`.
    expect(decidirNoFeed({ ...vendido, dataVenda: haDias(-365) }, AGORA).publica).toBe(false);
    expect(decidirNoFeed({ ...vendido, dataVenda: haDias(-1) }, AGORA).publica).toBe(false);
    // E a fronteira de baixo continua dentro: vendido HOJE fica.
    expect(decidirNoFeed({ ...vendido, dataVenda: haDias(0) }, AGORA).publica).toBe(true);
  });

  it("a janela do catálogo é de uma semana, não a do índice", () => {
    // O valor exato, e não só a relação: com `toBeLessThan` sozinho, trocar o 7
    // por 89 passava verde, e o número é o que decide por quanto tempo a loja
    // anuncia carro que já vendeu.
    expect(CARENCIA_VENDIDO_NO_FEED_DIAS).toBe(7);
  });

  it("a janela do catálogo é MUITO menor que a do índice", () => {
    // Não é o mesmo número por acaso e não pode virar o mesmo. A PDP vendida
    // captura demanda quente por 90 dias; item de catálogo não captura nada —
    // não ranqueia, não é pesquisado. Aos 90, com o giro desta loja, o catálogo
    // teria tanto carro morto quanto vivo.
    expect(CARENCIA_VENDIDO_NO_FEED_DIAS).toBeLessThan(CARENCIA_VENDIDO_DIAS);
  });

  it("vendido SEM data de venda sai na hora — o oposto de decidirPublicacao", () => {
    // A inversão é deliberada, e é a decisão de maior consequência aqui.
    // `decidirPublicacao` erra para o lado de MANTER (sem data, a carência
    // nunca vence) porque tirar do índice cedo demais joga fora tráfego
    // recuperável. No catálogo o erro simétrico é anunciar carro que não
    // existe, que custa dinheiro por impressão. Sem data, sai.
    expect(decidirNoFeed({ ...vendido, dataVenda: null }, AGORA).publica).toBe(false);
    expect(decidirNoFeed(vendido, AGORA).publica).toBe(false);
  });

  it("NÃO usa last_seen_at como proxy — é o caso do Spin 8100626", () => {
    // O carro vendido na loja que segue anunciado no RevendaMais é
    // re-carimbado quatro vezes por dia, então `last_seen_at` nunca envelhece.
    // Com o proxy, esse carro ficaria `out_of_stock` no catálogo PARA SEMPRE —
    // pior que o comportamento antigo, que ao menos o tirava no dia.
    const recemCarimbado = { ...vendido, ultimaPresenca: haDias(0), dataVenda: null };
    expect(decidirNoFeed(recemCarimbado, AGORA).publica).toBe(false);

    // E o contrapositivo, para o teste não passar por acaso: com data de venda
    // recente ele entra, mesmo com a mesma última presença.
    const comData = { ...recemCarimbado, dataVenda: haDias(1) };
    expect(decidirNoFeed(comData, AGORA).publica).toBe(true);
  });

  it("carro fora do feed não vai ao catálogo", () => {
    // Motivo desconhecido — repasse, reserva, anúncio expirado. Anúncio pago
    // não sustenta oferta que ninguém confirmou.
    expect(decidirNoFeed({ ...base, foraDoFeed: true }, AGORA).publica).toBe(false);
  });

  it("nunca anuncia disponível o que a ficha mostra como VENDIDO", () => {
    // As duas réguas divergem no PRAZO de propósito; não podem divergir no
    // FATO. Um carro `in_stock` no catálogo levando a uma ficha com selo
    // VENDIDO é o anúncio que o Meta e o cliente reprovam pelo mesmo motivo.
    const cenarios: SinaisDoVeiculo[] = [
      { ...vendido, dataVenda: haDias(0) },
      { ...vendido, dataVenda: haDias(CARENCIA_VENDIDO_NO_FEED_DIAS) },
      { ...vendido, dataVenda: haDias(CARENCIA_VENDIDO_NO_FEED_DIAS + 1) },
      { ...vendido, ultimaPresenca: haDias(200) },
      { ...vendido, dataVenda: null, ultimaPresenca: null },
    ];

    for (const sinais of cenarios) {
      const ficha = decidirPublicacao(sinais, AGORA);
      const catalogo = decidirNoFeed(sinais, AGORA);
      expect(ficha.rotulo, JSON.stringify(sinais)).toBe("VENDIDO");
      expect(catalogo.disponibilidade, JSON.stringify(sinais)).toBe("out_of_stock");
    }
  });
});

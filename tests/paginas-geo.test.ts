import { describe, it, expect } from "vitest";
import { PAGINAS_GEO, CAMINHOS_GEO, acharPaginaGeo, outrasRegioes } from "../src/lib/paginasGeo";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { segmentarComLinks } from "../src/lib/linksNoTexto";

/**
 * As páginas de cidade e bairro — e a linha que separa uma delas de uma
 * página doorway.
 *
 * O arquivo que elas moram já escreve o risco: *"não transformar isto num
 * gerador de bairros. Se um dia entrar uma terceira, ela precisa de rota de
 * acesso, referências e perguntas próprias — escritas, não interpoladas"*.
 * Doorway é exatamente o contrário: trinta URLs iguais trocando o nome do
 * bairro, que o §2.3.3 do plano de aquisição proíbe.
 *
 * O aviso estava só em prosa até 2026-09-01. Estes testes o medem — porque a
 * regressão aqui é silenciosa: copiar o parágrafo de uma página para a outra e
 * trocar o nome do bairro não quebra build, teste nem lint, e o sintoma
 * aparece meses depois, numa queda de posição que ninguém liga à causa.
 *
 * Não travam o TEXTO — ele deve mudar. Travam a PROPRIEDADE que o faz valer:
 * cada página diz coisa própria, e cada uma ensina alguma coisa.
 */


/** As palavras de uma página, sem as curtas que toda frase tem. */
const palavras = (p: (typeof PAGINAS_GEO)[number]) =>
  new Set(
    p.paragrafos
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 4),
  );

describe("as páginas geo existem e se acham", () => {
  it("são de duas a seis, e o sitemap anuncia todas", () => {
    // O limite prático do §2.2.2 é seis, e cada uma custa texto de verdade.
    // Passar de duas sem esta trava falhar significa que alguém escreveu a
    // terceira à mão — que é o caminho certo. Passar dos seis, não.
    expect(PAGINAS_GEO.length).toBeGreaterThanOrEqual(2);
    expect(PAGINAS_GEO.length).toBeLessThanOrEqual(6);
    expect(CAMINHOS_GEO).toEqual(PAGINAS_GEO.map((p) => `/${p.slug}`));
  });

  it("slug desconhecido devolve null, não a primeira da lista", () => {
    expect(acharPaginaGeo("seminovos-batel")).toBeNull();
  });
});

/** Todos os pares de páginas, cada um uma vez. Com seis páginas são quinze. */
const PARES = PAGINAS_GEO.flatMap((a, i) => PAGINAS_GEO.slice(i + 1).map((b) => [a, b] as const));

describe("cada página diz coisa própria — não é doorway", () => {
  it("menos de metade do vocabulário é compartilhado, em todo par", () => {
    // Duas páginas sobre a mesma loja compartilham vocabulário de propósito
    // ("perícia", "estoque", "financiamento"). O que não pode é a maior parte
    // do texto ser a mesma com o nome do bairro trocado.
    //
    // Até 02/10/2026 a medida era só Curitiba × Bacacheri, pelos nomes. Com a
    // terceira página ela passou a valer para qualquer par: a quarta entra na
    // régua sem ninguém lembrar de acrescentá-la aqui.
    expect(PARES.length).toBeGreaterThanOrEqual(3);
    for (const [x, y] of PARES) {
      const a = palavras(x);
      const b = palavras(y);
      const comuns = [...a].filter((w) => b.has(w)).length;
      const proporcao = comuns / Math.min(a.size, b.size);
      expect(proporcao, `${x.slug} × ${y.slug}: ${comuns} palavras em comum`).toBeLessThan(0.5);
    }
  });

  it("nenhum parágrafo é PARECIDO com o de outra página", () => {
    // Igualdade exata não basta, e a primeira versão desta trava media só
    // isso: copiar o parágrafo e trocar duas palavras passava limpo — que é
    // justamente como uma doorway é escrita na prática. A mutação que provou
    // isso colou a abertura de um parágrafo de Curitiba no do Bacacheri e a
    // suíte inteira continuou verde.
    //
    // Aqui a medida é a sobreposição de vocabulário PARÁGRAFO A PARÁGRAFO, que
    // é onde a cópia mora — a média da página inteira dilui e esconde.
    const termos = (t: string) =>
      new Set(
        t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
          .split(/[^a-z0-9]+/).filter((w) => w.length > 4),
      );
    // Desde 30/09/2026 os textos têm subtítulos ("### ...") como elementos
    // próprios. Sozinho, um subtítulo tem de um a três termos, e uma palavra
    // em comum já reprovaria: o convite a afrouxar esta régua. Ele entra
    // colado ao bloco que abre, que é o texto que ele intitula.
    const blocos = (paragrafos: string[]) =>
      paragrafos.reduce<string[]>((acc, p, i) => {
        if (i > 0 && /^###\s/.test(paragrafos[i - 1].trim())) acc[acc.length - 1] += ` ${p}`;
        else acc.push(p);
        return acc;
      }, []);
    for (const [x, y] of PARES) {
      for (const b of blocos(x.paragrafos)) {
        const daqui = termos(b);
        for (const c of blocos(y.paragrafos)) {
          const dali = termos(c);
          const comuns = [...daqui].filter((w) => dali.has(w)).length;
          const razao = comuns / Math.min(daqui.size, dali.size);
          expect(razao, `${x.slug} "${b.slice(0, 50)}…" ≈ ${y.slug} "${c.slice(0, 50)}…"`).toBeLessThan(0.45);
        }
      }
    }
  });

  it("nenhuma pergunta do FAQ se repete entre páginas", () => {
    // `FAQPage` duplicado em duas URLs do mesmo site é sinal contraditório: as
    // duas pedem a mesma resposta direta na busca, e o Google escolhe uma.
    for (const [x, y] of PARES) {
      const daX = new Set(x.faq.map((f) => f.pergunta.toLowerCase()));
      for (const f of y.faq) {
        expect(daX.has(f.pergunta.toLowerCase()), `${x.slug} × ${y.slug}: ${f.pergunta}`).toBe(false);
      }
    }
  });
});

describe("cada página ENSINA alguma coisa — a régua de autoridade", () => {
  it("todas trazem verificação mecânica concreta, não só rota e horário", () => {
    // O parágrafo "o que olhar" é o que o relatório dos hubs chama de
    // autoridade: *"o parágrafo que só quem mexe com carro escreve"*. Sem ele
    // a página vira folheto de endereço — e folheto de endereço é o que uma
    // doorway é.
    // DOIS sinais no MESMO parágrafo, não um espalhado pela página. A primeira
    // versão pedia só um em qualquer lugar, e uma mutação que apagou a
    // verificação inteira do Bacacheri passou — sobrou a palavra "mecânico"
    // numa frase de logística, que não ensina nada. Um parágrafo "o que olhar"
    // de verdade cita mais de uma coisa a conferir.
    const SINAIS = [
      /assoalho/i, /mola/i, /parafuso/i, /maresia/i, /partida/i, /motor frio/i,
      /suspens/i, /embreagem/i, /c[âa]mbio/i, /mec[âa]nico/i, /pintura/i, /freio/i,
    ];
    for (const p of PAGINAS_GEO) {
      const melhor = Math.max(...p.paragrafos.map((t) => SINAIS.filter((s) => s.test(t)).length));
      expect(melhor, `${p.slug} não tem parágrafo que ensine o que verificar`).toBeGreaterThanOrEqual(2);
    }
  });

  it("nenhuma cita contagem de estoque — o texto envelheceria em uma semana", () => {
    // Regra escrita no próprio arquivo: *"o texto não cita número de veículos:
    // a grade abaixo dele já mostra o estoque do momento"*.
    for (const p of PAGINAS_GEO) {
      const tudo = [...p.paragrafos, ...p.faq.map((f) => f.resposta)].join(" ");
      expect(tudo, p.slug).not.toMatch(/\d+\s+(ve[íi]culos?|carros?|unidades?)\s+(no estoque|dispon)/i);
    }
  });

  it("o endereço é o mesmo em todas — NAP divergente é o pior erro de SEO local", () => {
    // A divergência de NAP do §0.5.6 já apareceu neste site uma vez, entre o
    // rótulo do rodapé e o link do WhatsApp. Duas páginas geo com endereços
    // diferentes seria a mesma falha, num lugar onde ela custa mais.
    const enderecos = PAGINAS_GEO.flatMap((p) =>
      [...p.paragrafos, ...p.faq.map((f) => f.resposta)]
        .join(" ")
        .match(/Rua [A-ZÁ-Ú][^,.]{3,40},\s*\d+/g) ?? [],
    );
    expect(enderecos.length).toBeGreaterThan(0);
    expect(new Set(enderecos).size, enderecos.join(" | ")).toBe(1);
  });
});

describe("o texto geo não põe o repasse no lugar do carro recusado (spec 2026-09-24 §10)", () => {
  // "Os outros sete vão para repasse antes de chegar à vitrine" fazia o leitor
  // supor que o carro de repasse é o que a perícia recusou. O repasse é outra
  // seção, com a conta e o laudo à mostra; a oração saiu no PR 4 do repasse.
  const frases = (p: (typeof PAGINAS_GEO)[number]) =>
    [p.descricao, ...p.paragrafos, ...p.faq.flatMap((f) => [f.pergunta, f.resposta])]
      .join(" ")
      .split(/(?<=[.!?])\s+/);

  it("nenhuma frase junta o repasse ao filtro da loja", () => {
    for (const p of PAGINAS_GEO) {
      for (const frase of frases(p).filter((f) => /repasse/i.test(f))) {
        expect(frase, p.slug).not.toMatch(/\b(sete|recusad\w*|reprovad\w*|n[ãa]o entra\w*)|chegar [àa] vitrine/i);
      }
    }
  });

  it("o filtro continua dito, e a frase termina nele", () => {
    const curitiba = PAGINAS_GEO.find((p) => p.slug === "seminovos-curitiba");
    expect(curitiba, "a página de Curitiba").toBeDefined();
    // A frase ganhou "na vitrine" em 05/10/2026, junto com "loja de carros
    // usados e seminovos" na abertura. O que a trava cobra não mudou: a
    // proporção fecha o parágrafo, sem oração sobre os outros sete depois dela.
    expect(curitiba!.paragrafos[0]).toMatch(/De cada dez veículos avaliados, três entram na vitrine\.$/);
    expect(curitiba!.paragrafos[0]).toMatch(/loja de carros usados e seminovos/);
  });
});

describe("as páginas de região não ficam órfãs (02/10/2026)", () => {
  // Até aqui só o sitemap as anunciava, e o Search Console mostrava
  // `/seminovos-bacacheri` como "detectada, mas não indexada".
  it("cada uma linka para todas as outras, com o título como âncora", () => {
    for (const p of PAGINAS_GEO) {
      const links = outrasRegioes(p.slug);
      expect(links.map((l) => l.href).sort()).toEqual(
        PAGINAS_GEO.filter((x) => x.slug !== p.slug).map((x) => `/${x.slug}`).sort(),
      );
      // Era `/^Seminovos /` até 05/10/2026, quando a de Curitiba virou "Carros
      // usados e seminovos em Curitiba". O que importa é a âncora ser o TÍTULO
      // da página de destino, e não o nome solto do lugar.
      for (const l of links) {
        const destino = PAGINAS_GEO.find((x) => `/${x.slug}` === l.href);
        expect(l.rotulo).toBe(destino?.titulo);
        expect(l.rotulo).toMatch(/seminovos /i);
      }
    }
  });

  it("a página desenha esse bloco", () => {
    const fonte = readFileSync(join(__dirname, "..", "src", "components", "PaginaGeoView.tsx"), "utf8");
    expect(fonte).toMatch(/titulo: "Outras regiões", links: outrasRegioes\(pagina\.slug\)/);
  });

  it("o resto do site entra por \"Bacacheri\": o termo leva à página do bairro", () => {
    const partes = segmentarComLinks("Estamos no Bacacheri e aceitamos seu usado na troca.", "/carros/ford/ka", new Set());
    expect(partes.find((x) => x.href === "/seminovos-bacacheri")?.texto).toBe("Bacacheri");
    // Na própria página do bairro o termo não vira link para ela mesma.
    const naPropria = segmentarComLinks("A loja fica no Bacacheri.", "/seminovos-bacacheri", new Set());
    expect(naPropria.some((x) => x.href === "/seminovos-bacacheri")).toBe(false);
  });
});

describe("um link por destino também nos chips de região", () => {
  it("a página que já linka o Bacacheri no texto não repete o chip", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: PaginaDeEstoque } = await import("../src/components/modernist/PaginaDeEstoque");
    for (const p of PAGINAS_GEO) {
      const html = renderToStaticMarkup(
        createElement(PaginaDeEstoque, {
          trilha: [{ rotulo: "Home", href: "/" }],
          titulo: p.titulo,
          veiculos: [],
          introducao: p.paragrafos,
          faq: p.faq,
          caminho: `/${p.slug}`,
          blocos: [{ titulo: "Outras regiões", links: outrasRegioes(p.slug) }],
        }),
      );
      for (const outra of PAGINAS_GEO.filter((x) => x.slug !== p.slug)) {
        const vezes = html.split(`href="/${outra.slug}"`).length - 1;
        expect(vezes, `${p.slug} → ${outra.slug}`).toBe(1);
      }
    }
  });
});

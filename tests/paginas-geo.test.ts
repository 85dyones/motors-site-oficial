import { describe, it, expect } from "vitest";
import { PAGINAS_GEO, CAMINHOS_GEO, acharPaginaGeo } from "../src/lib/paginasGeo";

/**
 * As duas páginas de cidade e bairro — e a linha que separa uma delas de uma
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

const curitiba = acharPaginaGeo("seminovos-curitiba")!;
const bacacheri = acharPaginaGeo("seminovos-bacacheri")!;

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

describe("as duas páginas geo existem e se acham", () => {
  it("são exatamente duas, e o sitemap anuncia as duas", () => {
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

describe("cada página diz coisa própria — não é doorway", () => {
  it("menos de metade do vocabulário é compartilhado", () => {
    // Duas páginas sobre a mesma loja compartilham vocabulário de propósito
    // ("perícia", "estoque", "financiamento"). O que não pode é a maior parte
    // do texto ser a mesma com o nome do bairro trocado.
    const a = palavras(curitiba);
    const b = palavras(bacacheri);
    const comuns = [...a].filter((w) => b.has(w)).length;
    const proporcao = comuns / Math.min(a.size, b.size);
    expect(proporcao, `${comuns} palavras em comum`).toBeLessThan(0.5);
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
    for (const b of bacacheri.paragrafos) {
      const daqui = termos(b);
      for (const c of curitiba.paragrafos) {
        const dali = termos(c);
        const comuns = [...daqui].filter((w) => dali.has(w)).length;
        const razao = comuns / Math.min(daqui.size, dali.size);
        expect(razao, `"${b.slice(0, 50)}…" ≈ "${c.slice(0, 50)}…"`).toBeLessThan(0.45);
      }
    }
  });

  it("nenhuma pergunta do FAQ se repete entre as duas", () => {
    // `FAQPage` duplicado em duas URLs do mesmo site é sinal contraditório: as
    // duas pedem a mesma resposta direta na busca, e o Google escolhe uma.
    const daCuritiba = new Set(curitiba.faq.map((f) => f.pergunta.toLowerCase()));
    for (const f of bacacheri.faq) {
      expect(daCuritiba.has(f.pergunta.toLowerCase()), f.pergunta).toBe(false);
    }
  });
});

describe("cada página ENSINA alguma coisa — a régua de autoridade", () => {
  it("as duas trazem verificação mecânica concreta, não só rota e horário", () => {
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

  it("o endereço é o mesmo nas duas — NAP divergente é o pior erro de SEO local", () => {
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

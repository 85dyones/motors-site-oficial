import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAMPANHAS, campanhaPorSlug, caminhoDaCampanha } from "../src/lib/campanhas";

/**
 * Os QR codes impressos e o registro de campanhas não podem divergir.
 *
 * QR não se corrige depois de impresso. Se alguém renomear o slug de uma
 * campanha — ou apagar a campanha do registro — o material que já está na rua
 * passa a apontar para um 404, e nada no site acusa: a página some, o QR
 * continua existindo em papel.
 *
 * Estas travas leem o manifesto que `scripts/gerar-qr-de-campanha.js` grava
 * junto dos arquivos, e o conferem contra o registro. É a única ponte entre o
 * que está impresso e o que o código serve.
 */

const RAIZ = path.join(process.cwd(), "docs", "campanhas");

interface Manifesto {
  slug: string;
  geradoEm: string;
  modulos: number;
  tamanhoMinimoMm: number;
  nivelDeCorrecao: string;
  pecas: { arquivo: string; rotulo: string; utm_content: string; url: string }[];
}

function manifestos(): { pasta: string; dados: Manifesto }[] {
  if (!fs.existsSync(RAIZ)) return [];
  return fs
    .readdirSync(RAIZ, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({
      pasta: e.name,
      arquivo: path.join(RAIZ, e.name, "qr-codes.json"),
    }))
    .filter((m) => fs.existsSync(m.arquivo))
    .map((m) => ({ pasta: m.pasta, dados: JSON.parse(fs.readFileSync(m.arquivo, "utf8")) }));
}

describe("os QR codes impressos apontam para campanhas que existem", () => {
  const todos = manifestos();

  it("há pelo menos um manifesto — senão tudo abaixo passa por vacuidade", () => {
    expect(todos.length).toBeGreaterThan(0);
  });

  it.each(todos.map((m) => [m.pasta, m] as const))(
    "%s: a campanha ainda está no registro",
    (_pasta, m) => {
      /*
       * O caso real: alguém renomeia o slug ou aposenta a campanha do
       * registro, e o papel que está na rua vira 404 — sem nada acusar, porque
       * o site não sabe o que foi impresso.
       */
      const campanha = campanhaPorSlug(m.dados.slug);
      expect(
        campanha,
        `há QR impresso para "${m.dados.slug}", que não está em CAMPANHAS`,
      ).toBeDefined();
    },
  );

  it.each(todos.map((m) => [m.pasta, m] as const))(
    "%s: cada URL aponta para o caminho da campanha, com a UTM da peça",
    (_pasta, m) => {
      const campanha = campanhaPorSlug(m.dados.slug)!;
      expect(m.dados.pecas.length).toBeGreaterThan(0);

      for (const peca of m.dados.pecas) {
        const url = new URL(peca.url);
        expect(url.pathname, `${peca.arquivo}: caminho errado`).toBe(caminhoDaCampanha(campanha));
        // Sem `utm_content` o lead diz que veio de QR, mas não de QUAL material
        // — e é isso que decide onde gastar impressão na próxima campanha.
        expect(url.searchParams.get("utm_content"), `${peca.arquivo}: sem utm_content`).toBe(
          peca.utm_content,
        );
        expect(url.searchParams.get("utm_campaign")).toBe(m.dados.slug);
        expect(url.protocol).toBe("https:");
      }
    },
  );

  it.each(todos.map((m) => [m.pasta, m] as const))(
    "%s: cada peça tem um utm_content distinto",
    (_pasta, m) => {
      const usados = m.dados.pecas.map((p) => p.utm_content);
      expect(new Set(usados).size, `utm_content repetido: ${usados.join(", ")}`).toBe(
        usados.length,
      );
    },
  );

  it.each(todos.map((m) => [m.pasta, m] as const))(
    "%s: os arquivos citados existem, em SVG e PNG",
    (_pasta, m) => {
      for (const peca of m.dados.pecas) {
        for (const ext of [".svg", ".png"]) {
          const arquivo = path.join(RAIZ, m.pasta, peca.arquivo + ext);
          expect(fs.existsSync(arquivo), `falta ${peca.arquivo}${ext}`).toBe(true);
        }
      }
    },
  );

  /*
   * Nível H (30% de correção) não é preciosismo: folder dobra no bolso e banner
   * de rua pega sol e dedo. E abaixo do tamanho mínimo os módulos ficam
   * pequenos demais para câmera de celular — o manifesto guarda os dois para
   * que a informação chegue à gráfica junto do arquivo.
   */
  it.each(todos.map((m) => [m.pasta, m] as const))(
    "%s: o manifesto guarda o que a gráfica precisa saber",
    (_pasta, m) => {
      expect(m.dados.nivelDeCorrecao).toBe("H");
      expect(m.dados.tamanhoMinimoMm).toBeGreaterThanOrEqual(30);
      expect(m.dados.modulos).toBeGreaterThan(0);
    },
  );
});

describe("toda campanha viva com material impresso está coberta", () => {
  it("nenhuma campanha do registro perdeu o manifesto do seu QR", () => {
    /*
     * O inverso da trava acima: campanha que TEVE QR impresso e depois perdeu a
     * pasta. Não exige QR para toda campanha — nem toda ação tem material
     * impresso —, mas exige que a pasta, uma vez criada, não fique órfã.
     */
    const pastas = fs.existsSync(RAIZ)
      ? fs
          .readdirSync(RAIZ, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [];

    for (const pasta of pastas) {
      const manifesto = path.join(RAIZ, pasta, "qr-codes.json");
      expect(
        fs.existsSync(manifesto),
        `docs/campanhas/${pasta} existe mas não tem qr-codes.json — ` +
          `sem ele nada liga o material impresso ao registro`,
      ).toBe(true);
      expect(CAMPANHAS.map((c) => c.slug), `pasta órfã: ${pasta}`).toContain(pasta);
    }
  });
});

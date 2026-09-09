import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { campanhaPorSlug, campanhaEstaViva } from "../src/lib/campanhas";
import { lerCodigo } from "./fonte";

const SLUG = "pole-position-2026";
const PAGINA = `src/app/(campanha)/${SLUG}/page.tsx`;

describe("a campanha está registrada", () => {
  it("existe, com as datas do folder", () => {
    const c = campanhaPorSlug(SLUG);
    expect(c).toBeDefined();
    expect(c!.nome).toBe("Pole Position");
    expect(c!.inicio).toBe("2026-09-12");
    expect(c!.fim).toBe("2026-09-20");
  });

  it("vive de 12 a 20 e morre em 21", () => {
    const c = campanhaPorSlug(SLUG)!;
    expect(campanhaEstaViva(c, new Date("2026-09-12T08:00:00-03:00"))).toBe(true);
    expect(campanhaEstaViva(c, new Date("2026-09-20T22:00:00-03:00"))).toBe(true);
    expect(campanhaEstaViva(c, new Date("2026-09-21T08:00:00-03:00"))).toBe(false);
  });
});

describe("a página", () => {
  const codigo = () => lerCodigo(PAGINA);

  it("declara canonical próprio — senão herda o do layout raiz, que não tem", () => {
    expect(codigo()).toMatch(/canonical/);
  });

  it("declara card de compartilhamento com arte própria", () => {
    expect(codigo()).toMatch(/montarCompartilhamento/);
    /*
     * `imagemPreferida:` COM os dois-pontos. Sem eles, a regex casa com
     * `imagemPreferidaSemDimensao`, que fica na linha de baixo — e apagar a
     * arte deixava o teste verde, com o card caindo no padrão do painel.
     * Provado por mutação na revisão.
     */
    expect(codigo()).toMatch(/imagemPreferida:\s*["']\/campanhas\//);
  });

  /*
   * `pagina: "sobre"` faria um card de "Quem Somos" customizado no painel
   * VENCER o título e a descrição desta LP — `montarCompartilhamento` resolve
   * `limpar(proprio.titulo) || limpar(tituloPadrao)`, e só `"pdp"` zera o
   * `proprio`. O card da campanha é o que circula no WhatsApp.
   */
  it("o card da campanha não pode ser sobrescrito pelo painel", () => {
    expect(codigo()).toMatch(/pagina:\s*["']pdp["']/);
    expect(codigo()).not.toMatch(/pagina:\s*["']sobre["']/);
  });

  /*
   * `robots.ts` bloqueia `/api/`. Um og:image servido dali responde 200 no
   * navegador e chega SEM IMAGEM no WhatsApp — que é justamente por onde a
   * campanha circula.
   */
  /*
   * `robots.ts` bloqueia `/api/`. Um og:image servido dali responde 200 no
   * navegador e chega SEM IMAGEM no WhatsApp — que é justamente por onde a
   * campanha circula.
   *
   * A primeira versão só olhava caminhos com extensão de imagem, e por isso
   * deixava passar `imagemPreferida: "/api/og?titulo=..."` — que é exatamente
   * a forma que `urlDoCardGerado` produz e exatamente a que o robots bloqueia.
   * Agora varre TODO caminho absoluto citado no arquivo.
   */
  it("nenhum caminho da página aponta para /api/", () => {
    const caminhos = [...codigo().matchAll(/["'](\/[^"'\s]*)["']/g)].map((m) => m[1]);
    expect(caminhos.length).toBeGreaterThan(0);
    for (const caminho of caminhos) {
      expect(caminho, `caminho sob /api/: ${caminho}`).not.toMatch(/^\/api\//);
    }
  });

  it("as artes que ela referencia existem mesmo em public/", () => {
    const caminhos = [...codigo().matchAll(/["'](\/campanhas\/[^"']+)["']/g)].map((m) => m[1]);
    expect(caminhos.length).toBeGreaterThan(0);
    for (const rel of caminhos) {
      const arquivo = path.join(process.cwd(), "public", ...rel.split("/").filter(Boolean));
      expect(fs.existsSync(arquivo), `arte ausente: ${rel}`).toBe(true);
    }
  });

  it("redireciona quando a data vence, e SÓ então", () => {
    expect(codigo()).toMatch(/permanentRedirect/);
    /*
     * `campanhaAcabou`, e não `!campanhaEstaViva`: a segunda forma mandava 308
     * PERMANENTE também antes do início, e o navegador guarda 308 para sempre
     * — quem abrisse o link na véspera não veria a LP nem durante o feirão.
     */
    expect(codigo()).toMatch(/campanhaAcabou/);
    expect(codigo()).not.toMatch(/!campanhaEstaViva/);
  });

  it("revalida rápido — o 308 só entra na revalidação", () => {
    expect(codigo()).toMatch(/export const revalidate = 300/);
  });

  it("usa o CTA de campanha, e não um link solto para o WhatsApp", () => {
    expect(codigo()).toMatch(/CtaDeCampanha/);
    expect(codigo()).not.toMatch(/href=["']https:\/\/(wa\.me|api\.whatsapp)/);
  });

  /*
   * O script anti-flicker do layout raiz troca os tokens `--brand-*` conforme
   * o tema salvo no navegador. A LP tem paleta própria, amostrada da arte do
   * folder — usar token faria a campanha aparecer em dourado para quem tem
   * `stealth-dark` salvo.
   */
  it("não usa os tokens de tema, que o visitante controla", () => {
    const texto = codigo();
    expect(texto).not.toMatch(/--brand-|bg-brand-|text-brand-|border-brand-/);
    /*
     * A família `mt-*` conta como token: `modernist.css` define
     * `--mt-bg: var(--brand-background, …)`, então `bg-mt-surface` segue o tema
     * salvo no navegador do mesmo jeito. E é como o resto do repositório
     * escreve — logo, é o jeito provável de a próxima LP nascer quebrada.
     */
    expect(texto).not.toMatch(/--mt-|\b(?:bg|text|border|fill|stroke)-mt-/);
    // E a paleta literal continua declarada, para o teste não passar por um
    // arquivo que simplesmente perdeu as cores.
    expect(texto).toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it("o endereço vem das configurações, e não escrito na página", () => {
    expect(codigo()).toMatch(/getCachedSettings/);
    expect(codigo()).not.toMatch(/Piazzetta/);
  });
});

describe("o conteúdo é o do folder, com as ressalvas", () => {
  const codigo = () => lerCodigo(PAGINA);

  it("traz a chamada", () => {
    expect(codigo()).toMatch(/largada para grandes oportunidades/i);
  });

  /*
   * Cobra a AFIRMAÇÃO de cada um dos seis, não a grafia do título. O item 3
   * teve o título reescrito para tirar o prazo de um campo `titulo` — exigido
   * pela trava `promessa-publica` —, e um teste preso à grafia reprovaria essa
   * mudança legítima enquanto deixaria passar a perda do argumento inteiro.
   */
  it("traz os seis argumentos do folder", () => {
    const texto = codigo();
    for (const [rotulo, marca] of [
      ["lives", /ofertas rel[âa]mpago/i],
      ["seleção", /escolhido e avaliado criteriosamente/i],
      ["120 dias", /at[ée] 120 dias para come[çc]ar a pagar/i],
      ["transferência", /transfer[êe]ncia fica por nossa conta/i],
      ["garantia", /garantia de motor e c[âa]mbio/i],
      ["perícia", /per[íi]cia cautelar independente/i],
    ] as const) {
      expect(marca.test(texto), `faltou o argumento: ${rotulo}`).toBe(true);
    }
  });

  /*
   * "garantia Motors Store" não existe em lugar nenhum do repositório — era
   * nome inventado, e num anúncio pago sem link de saída o visitante não tem
   * como descobrir o escopo. O que a loja dá está em `paginasInstitucionais`:
   * motor e câmbio, sem carência e sem franquia.
   */
  it("nomeia a garantia pelo escopo real, não por um nome inventado", () => {
    const texto = codigo();
    expect(texto).not.toMatch(/garantia\s+Motors\s+Store/i);
    expect(texto).toMatch(/motor e c[âa]mbio/i);
    expect(texto).toMatch(/sem car[êe]ncia e sem franquia/i);
    /*
     * O prazo entra no CORPO. Omiti-lo por completo deixava "contratada na
     * entrega, sem carência e sem franquia" ler como garantia aberta — e a
     * `/garantia` diz três meses. No título ele não pode entrar (é mínimo legal
     * de PJ e não se vende como diferencial); no corpo, é informação devida.
     */
    expect(texto).toMatch(/por tr[êe]s meses/i);
  });

  /*
   * `/_next/image` já respondeu 402 em produção nesta conta, e por isso as
   * fotos próprias do site vão com `unoptimized`. O herói de uma LP paga de
   * nove dias não pode depender de cota de otimização.
   */
  /*
   * O banner é a única imagem que a loja troca sem tocar em código, então o
   * layout não pode depender da PROPORÇÃO do arquivo. Com `h-auto`, uma foto
   * de outro formato mudaria a altura do hero e empurraria o texto ao lado —
   * defeito que só aparece depois da troca, quando ninguém está olhando o
   * código. Bloco de proporção fixa + `object-cover` resolve.
   */
  it("o banner tem bloco de proporção fixa, para a troca de foto não mexer no layout", () => {
    const texto = codigo();
    expect(texto).toMatch(/aspect-square/);
    expect(texto).toMatch(/object-cover/);
    // `fill` e `h-auto` são mutuamente exclusivos aqui: o segundo é o que
    // devolveria o controle da altura para o arquivo.
    const banner = texto.match(/<Image[\s\S]*?carro\.jpg[\s\S]*?\/>/)?.[0] ?? "";
    expect(banner, "o <Image> do banner não foi encontrado").not.toBe("");
    expect(banner).not.toMatch(/h-auto/);
  });

  it("o formato das artes está documentado onde a loja vai procurar", () => {
    const leiaMe = path.join(process.cwd(), "public", "campanhas", "LEIA-ME.md");
    expect(fs.existsSync(leiaMe), "falta public/campanhas/LEIA-ME.md").toBe(true);
    const texto = fs.readFileSync(leiaMe, "utf8");
    // As três medidas que o script gera precisam bater com as documentadas.
    for (const medida of ["1600 × 1600", "1200 × 630", "1600 × 400"]) {
      expect(texto, `o LEIA-ME não cita ${medida}`).toContain(medida);
    }
    expect(texto).toContain("preparar-arte-de-campanha.js");
  });

  /*
   * As medidas dos ARQUIVOS, e não só as documentadas. Escrevi o LEIA-ME
   * dizendo 1600×1600 enquanto o banner no disco tinha 900×912 — documentação
   * e realidade discordando no mesmo commit. Isso mede o disco.
   *
   * Também é a trava que pega foto trocada à mão, sem passar pelo script: ela
   * chega com a proporção errada e o `object-cover` a corta em silêncio.
   */
  it("as artes no disco têm as medidas documentadas", async () => {
    const sharp = (await import("sharp")).default;
    const esperado = [
      ["carro", 1600, 1600],
      ["og", 1200, 630],
      ["pista", 1600, 400],
    ] as const;

    for (const [sufixo, largura, altura] of esperado) {
      const arquivo = path.join(
        process.cwd(),
        "public",
        "campanhas",
        `${SLUG}-${sufixo}.jpg`,
      );
      expect(fs.existsSync(arquivo), `falta a arte: ${sufixo}`).toBe(true);
      const meta = await sharp(arquivo).metadata();
      expect(
        `${meta.width}x${meta.height}`,
        `${sufixo}: o arquivo não bate com o LEIA-ME`,
      ).toBe(`${largura}x${altura}`);
      // sRGB, não CMYK: arte de material impresso chega com as cores
      // invertidas ao navegador se ninguém converter.
      expect(meta.space, `${sufixo}: espaço de cor não é sRGB`).toBe("srgb");
    }
  });

  /*
   * O banner é a maior imagem da página e vai com `priority` — é o LCP no
   * celular, de onde vem quase todo o tráfego de campanha. Como as artes vão
   * com `unoptimized`, o navegador baixa exatamente estes bytes.
   */
  it("nenhuma arte passa de 300 KB", () => {
    for (const sufixo of ["carro", "og", "pista"]) {
      const arquivo = path.join(process.cwd(), "public", "campanhas", `${SLUG}-${sufixo}.jpg`);
      const kb = Math.round(fs.statSync(arquivo).size / 1024);
      expect(kb, `${sufixo}: ${kb} KB`).toBeLessThanOrEqual(300);
    }
  });

  it("o script de preparo declara as mesmas três medidas", () => {
    const script = lerCodigo("scripts/preparar-arte-de-campanha.js");
    for (const [l, a] of [
      [1600, 1600],
      [1200, 630],
      [1600, 400],
    ]) {
      expect(script, `o script não gera ${l}×${a}`).toMatch(
        new RegExp(`largura:\\s*${l},\\s*altura:\\s*${a}`),
      );
    }
  });

  it("as artes próprias não dependem da cota de otimização da Vercel", () => {
    const texto = codigo();
    const imagens = (texto.match(/<Image[\s\S]*?\/>/g) ?? []);
    expect(imagens.length).toBeGreaterThan(0);
    for (const img of imagens) {
      expect(img, `<Image> sem unoptimized: ${img.slice(0, 60)}`).toMatch(/unoptimized/);
    }
  });

  /*
   * Um título é lido sozinho. "Perícia cautelar aprovada" afirma que a perícia
   * DESTE carro está aprovada — o que o site nunca afirma e a medição
   * desmentiu. A afirmação de PROCESSO ("passa por perícia") é a verdadeira.
   */
  it("não afirma no título que a perícia está aprovada", () => {
    expect(codigo()).not.toMatch(/titulo:\s*["'][^"']*per[íi]cia[^"']*aprovad/i);
  });

  /*
   * `coerencia-da-pericia` já varre `src/` inteiro e pegaria isto — mas só na
   * suíte cheia. Aqui a falha aparece já ao rodar o teste da própria LP.
   */
  it("promete o laudo COM a condição de aprovação", () => {
    const texto = codigo();
    expect(texto).toMatch(/laudo/i);
    expect(texto).toMatch(/assim que aprovada/i);
  });

  it("não põe prazo em campo de título — quem decide o prazo é o banco", () => {
    expect(codigo()).not.toMatch(/titulo:\s*["'][^"']{0,24}\b\d+\s*(min|minutos?|horas?|dias?)\b/i);
  });

  it("o bônus vem com o 'podem chegar a', e não como promessa", () => {
    const texto = codigo();
    expect(texto).toMatch(/R\$ 10 mil/);
    expect(texto).toMatch(/podem chegar a/i);
  });

  it("os 120 dias vêm com a condicional do financiamento", () => {
    expect(codigo()).toMatch(/conforme as condições de financiamento/i);
  });

  it("transferência e tanque vêm com 'em veículos selecionados'", () => {
    expect(codigo()).toMatch(/[Ee]m veículos selecionados/);
  });

  /*
   * Regra 5 do CLAUDE.md: comunicação pública de recompra é proibida antes de
   * parecer jurídico e provisionamento. O folder não menciona; a LP também não.
   */
  it("não menciona recompra nem percentual de FIPE", () => {
    expect(codigo().toLowerCase()).not.toMatch(/recompra|fipe/);
  });

  /*
   * POSICIONAMENTO.md: 90 dias é o mínimo legal de PJ e não se vende como
   * diferencial. A garantia é afirmada; o diferencial fica na perícia.
   */
  it("não vende o prazo de garantia como diferencial", () => {
    const texto = codigo().toLowerCase();
    expect(texto).not.toMatch(/(3|três|90)\s*(meses|dias)\s*de\s*garantia/);
    expect(texto).not.toMatch(/garantia\s+exclusiva/);
  });

  it("não promete preço nem desconto que a loja não fixou", () => {
    expect(codigo().toLowerCase()).not.toMatch(/abaixo da tabela|menor preço|imperdível/);
  });
});

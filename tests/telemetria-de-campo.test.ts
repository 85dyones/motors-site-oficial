import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerCodigo } from "./fonte";

/**
 * Core Web Vitals de CAMPO — o número que ninguém no projeto tem.
 *
 * Todo diagnóstico de desempenho feito aqui até 2026-09-08 foi de laboratório:
 * `next build` e a tabela de tamanho por rota. Laboratório mede o que a
 * máquina que roda o build sente. Campo mede o que o comprador sente, no
 * aparelho dele, na rede dele — e é o campo que entra no sinal de busca.
 *
 * A consequência prática da ausência: a decisão de partir mais pedaços do
 * `PDPClientWrapper` em `next/dynamic` (item 3.3 do handoff de 08/09) não tem
 * como ser tomada. Ela depende de saber se a ficha passa de 200 ms de INP em
 * mobile, e isso não é observável em laboratório. Por isso 3.3 fica
 * condicionado a este item e não sobe junto — o wrapper já carrega o
 * `LeadCaptureModal` sob demanda desde antes, então o que está em jogo é a
 * galeria, o simulador e os similares, que disparam evento de tracking.
 *
 * Não existe teste aqui cobrando que 3.3 NÃO seja feito: seria uma trava
 * reprovando trabalho legítimo no dia em que o dado chegar. A sequência é nota,
 * não invariante.
 *
 * GA4 já está no site e mede audiência; não mede CWV por rota. As duas
 * ferramentas não se sobrepõem — e é por isso que `@vercel/analytics` NÃO
 * entra: seria um segundo contador de pageview em cima do GA4, ruído sem
 * pergunta a responder.
 */

const LAYOUT = "src/app/layout.tsx";

const pacote = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("o site coleta Web Vitals de campo", () => {
  it("o pacote do Speed Insights é dependência de produção", () => {
    // Em devDependencies o build da Vercel não o instala e o componente
    // quebra o build — falha barulhenta, mas na hora errada.
    expect(pacote.dependencies ?? {}).toHaveProperty("@vercel/speed-insights");
  });

  it("o layout raiz monta o coletor", () => {
    // No layout RAIZ e não numa página: CWV por rota só existe se o coletor
    // estiver em todas elas.
    const codigo = lerCodigo(LAYOUT);

    expect(codigo).toMatch(/from\s+"@vercel\/speed-insights\/next"/);
    expect(codigo).toMatch(/<SpeedInsights\s*\/>/);
  });

  it("não entra um segundo contador de audiência junto", () => {
    // `@vercel/analytics` é o pacote vizinho, e a tentação é instalar os dois.
    // A audiência já está no GA4; dois contadores de pageview é ruído.
    expect(pacote.dependencies ?? {}).not.toHaveProperty("@vercel/analytics");
    expect(lerCodigo(LAYOUT)).not.toMatch(/@vercel\/analytics/);
  });

  it("o coletor fica fora do que o consentimento controla", () => {
    // Speed Insights não identifica pessoa: mede tempo de render do próprio
    // site, sem cookie e sem id de usuário. Envolvê-lo no gate de marketing
    // faria a medição de desempenho depender de aceite — e mediria só quem
    // aceita, que é o pior recorte possível para uma métrica de performance.
    const codigo = lerCodigo(LAYOUT);
    const posicao = codigo.indexOf("<SpeedInsights");

    expect(posicao).toBeGreaterThan(-1);
    // Não pode estar dentro do banner de consentimento.
    const banner = /<CookieConsentBanner[\s\S]*?\/>/.exec(codigo);
    if (banner) {
      expect(posicao < banner.index || posicao > banner.index + banner[0].length).toBe(true);
    }
  });
});


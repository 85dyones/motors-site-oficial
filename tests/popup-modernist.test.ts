import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O pop-up de lead no sistema Modernist — 2026-08-22.
 *
 * Depois do redesign de 2026 o pop-up (e o modal de captura que o segue)
 * continuou na casca ANTIGA: vidro com desfoque, canto de 20px, gradiente na
 * barra e botão verde-esmeralda — em cima de um site inteiro de réguas e zero
 * raio. Foi o "modelo antigo, defasado" relatado pelo dono em 2026-08-22.
 *
 * O que este arquivo trava:
 *
 *   1. Nenhuma das duas peças fala a linguagem velha (raio, vidro, tema zinc
 *      do modal, verde de WhatsApp, tokens brand-* soltos).
 *   2. As duas falam os tokens do sistema (mt-*), e o CTA é o mt-btn-primario:
 *      vermelho só onde há decisão — a mesma régua de todo CTA do site.
 *   3. A roupa mudou e o comportamento não: gatilhos, countdown, anti-spam e o
 *      envio com nome real + Turnstile continuam onde estavam.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

/** Comentário pode citar a era antiga pelo nome; o código, não. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const popup = ler("src", "components", "LeadPopup.tsx");
const modal = ler("src", "components", "LeadCaptureModal.tsx");
const cookies = ler("src", "components", "CookieConsentBanner.tsx");

describe("a casca antiga não volta", () => {
  // rounded = qualquer raio; zinc/#25D366/#075E54 = o tema de chat escuro do
  // modal; emerald = o CTA verde; backdrop-blur e o gradiente = o vidro do
  // pop-up; brand- = os tokens de antes do redesign (mt-* deriva deles, mas
  // as peças do site falam mt-*).
  const marcasVelhas = [
    "rounded",
    "zinc-",
    "emerald-",
    "#25D366",
    "#075E54",
    "backdrop-blur",
    "bg-gradient-to-r",
    "brand-",
  ];
  for (const marca of marcasVelhas) {
    it(`pop-up sem "${marca}"`, () => {
      expect(semComentarios(popup)).not.toContain(marca);
    });
    it(`modal sem "${marca}"`, () => {
      expect(semComentarios(modal)).not.toContain(marca);
    });
    it(`aviso de cookies sem "${marca}"`, () => {
      expect(semComentarios(cookies)).not.toContain(marca);
    });
  }
});

describe("as peças falam Modernist", () => {
  it("o card do pop-up é acento e régua, com a sombra que só overlay tem", () => {
    expect(popup).toContain("border-t-4 border-mt-accent");
    expect(popup).toContain("shadow-[var(--mt-shadow-lg)]");
    expect(popup).toContain("mt-rotulo");
  });

  it("o CTA do pop-up é o botão primário do sistema", () => {
    expect(popup).toContain("mt-btn mt-btn-primario mt-btn-bloco");
  });

  it("o modal acompanha: cabeçalho invertido, pulso do DS e o mesmo botão", () => {
    expect(modal).toContain("bg-mt-inverso-fundo");
    expect(modal).toContain("mt-pulso");
    expect(modal).toContain("mt-btn mt-btn-primario mt-btn-bloco");
  });

  it("o aviso de cookies acompanha — e continua ACIMA do pop-up: consentimento antes de campanha", () => {
    expect(cookies).toContain("border-t-4 border-mt-accent");
    expect(cookies).toContain("mt-btn mt-btn-primario");
    expect(cookies).toContain("z-[9999]");
    expect(popup).toContain("z-[999]");
  });
});

describe("a roupa mudou, o comportamento não", () => {
  it("countdown, expiração e barra de progresso continuam", () => {
    expect(popup).toContain("formatCountdown");
    expect(popup).toContain("isExpired");
    expect(popup).toContain("progressPercent");
  });

  it("os seis guards do exit-intent continuam armados", () => {
    for (const guard of ["Guard 1", "Guard 2", "Guard 3", "Guard 4", "Guard 5", "Guard 6"]) {
      expect(popup).toContain(guard);
    }
  });

  it("o clique no CTA continua NÃO sendo lead: o envio passa pelo modal com Turnstile", () => {
    // Decisão do dono (2026-08-19): nome real antes de qualquer evento.
    expect(popup).toContain("setLeadPendente");
    expect(popup).toContain("LeadCaptureModal");
    expect(modal).toContain("Turnstile");
    expect(modal).toContain("turnstileToken");
  });

  it("o cooldown lido no disparo é o salvo no painel, não o default congelado", () => {
    // `triggerPopup` fecha sobre `settings`: com deps vazias, a checagem
    // anti-spam do disparo rodava para sempre com o cooldown de fábrica,
    // ignorando o que o admin salvou.
    expect(popup).toContain("}, [settings]);");
  });
});

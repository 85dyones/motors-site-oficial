/**
 * Contraste WCAG entre duas cores.
 *
 * A tela A2 do design doc do admin promete "contraste verificado
 * automaticamente" ao lado de cada papel de cor da paleta. Esta é a conta que
 * sustenta a promessa — fórmula da WCAG 2.1 (relative luminance + razão de
 * contraste), não estimativa nossa.
 *
 * Fica em `lib` e não dentro do componente porque é matemática pura e
 * testável: `tests/contraste.test.ts` cobre os pares conhecidos.
 */

/** Converte `#rgb` ou `#rrggbb` nos três canais 0–255. */
export function lerHex(hex: string): [number, number, number] | null {
  const limpo = hex.trim().replace(/^#/, "");

  if (limpo.length === 3) {
    const [r, g, b] = limpo.split("");
    return lerHex(`#${r}${r}${g}${g}${b}${b}`);
  }

  if (!/^[0-9a-fA-F]{6}$/.test(limpo)) return null;

  return [
    parseInt(limpo.slice(0, 2), 16),
    parseInt(limpo.slice(2, 4), 16),
    parseInt(limpo.slice(4, 6), 16),
  ];
}

/**
 * Luminância relativa (WCAG 2.1, §relative luminance).
 *
 * O canal é linearizado antes de entrar na soma ponderada — sem isso o
 * resultado erra feio nos tons médios, que é justamente onde as paletas da
 * loja vivem.
 */
function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Razão de contraste entre duas cores, de 1 (idênticas) a 21 (preto/branco).
 * Devolve `null` se qualquer um dos dois hexadecimais for inválido — quem
 * chama decide o que exibir, em vez de receber um número inventado.
 */
export function razaoDeContraste(corA: string, corB: string): number | null {
  const a = lerHex(corA);
  const b = lerHex(corB);
  if (!a || !b) return null;

  const la = luminancia(a);
  const lb = luminancia(b);
  const clara = Math.max(la, lb);
  const escura = Math.min(la, lb);

  return (clara + 0.05) / (escura + 0.05);
}

export type NivelDeContraste = "AAA" | "AA" | "AA GRANDE" | "INSUFICIENTE";

/**
 * Classifica a razão nos degraus da WCAG para **texto corrido**:
 * 7:1 AAA, 4.5:1 AA, 3:1 só para texto grande e elementos de interface.
 *
 * O readme do design system diz o mesmo em prosa: o par acento/fundo do
 * Modernist fica em torno de 3:1 — "enough for icons, large text and
 * interface chrome, not for body copy". Por isso 3:1 aparece rotulado como
 * `AA GRANDE`, e não como aprovação geral.
 */
export function nivelDeContraste(razao: number): NivelDeContraste {
  if (razao >= 7) return "AAA";
  if (razao >= 4.5) return "AA";
  if (razao >= 3) return "AA GRANDE";
  return "INSUFICIENTE";
}

/** Razão formatada como o padrão brasileiro de decimal: `4,7:1`. */
export function formatarRazao(razao: number): string {
  return `${razao.toFixed(1).replace(".", ",")}:1`;
}

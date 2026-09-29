import type { ThemeProperties, ThemeType } from "../types";

/**
 * As paletas do site — a fonte única.
 *
 * Quem lê daqui: o `ThemeContext` (troca de paleta no painel), o script
 * anti-flicker do `layout.tsx` (aplica a paleta antes da primeira pintura) e a
 * tela de aparência do admin. Até 29/09 o script tinha a sua própria cópia,
 * escrita à mão.
 *
 * `--brand-cobre` é a cor de IDENTIDADE para texto pequeno sobre o fundo claro:
 * marca no card, código do veículo, numeração de seção, rótulos em versalete,
 * réguas de destaque. A cor de AÇÃO é `--brand-primary`, e só ela vai em botão
 * e link que leva a algum lugar. Nas paletas que não são a do cobre, a
 * identidade cai num tom da própria paleta que passa de 4,5:1 — conferido em
 * `tests/cobre-da-marca.test.ts`.
 */
export const THEME_PRESETS: Record<ThemeType, ThemeProperties> = {
  /**
   * O cobre da marca — tarefa 3.1 da revisão de UI de 29/09, padrão do site
   * desde então (decisão D2 do plano: direto, sem convivência).
   *
   * - Papel #F6F4F1: o branco puxado para o cobre. Mais claro que o #F3F1EE da
   *   revisão porque a ferrugem (#C83F00), em texto, ficava em 4,47:1 nele.
   * - Tinta #1C1A19: o grafite.
   * - Cobre de texto #8A6647 (4,7:1 no papel, 4,9:1 no cartão). O cobre do
   *   logo, #B29172, fica em 2,8:1 no claro: só área grande ou fundo escuro
   *   (`--mt-cobre-marca`, em modernist.css).
   * - Cartão #FCFBF9, mais claro que o papel: com cartão mais escuro, o cobre
   *   de texto caía abaixo de 4,5:1 sobre ele.
   * - Rodapé em grafite. O #323137 do manual deixaria o cinza suave do sistema
   *   em 4,46:1 e o acento clareado em 4,15:1 — abaixo do AA.
   */
  "motors-cobre": {
    "--brand-background": "#F6F4F1",
    "--brand-foreground": "#1C1A19",
    "--brand-primary": "#C83F00",
    "--brand-primary-hover": "#9E3100",
    "--brand-gold": "#8A6647",
    "--brand-cobre": "#8A6647",
    "--brand-card": "#FCFBF9",
    "--brand-card-border": "#E3DED8",
    "--brand-border": "#E3DED8",
    "--brand-shadow": "rgba(28, 26, 25, 0.16)",
    "--brand-glass-bg": "rgba(246, 244, 241, 0.86)",
    "--brand-footer-bg": "#1C1A19",
  },
  // Paleta do redesign 2026 (design doc "Motors site modernista redesign").
  // Os tokens --mt-* de modernist.css derivam destes valores.
  "motors-modernist": {
    "--brand-background": "#f3f2f2",
    "--brand-foreground": "#201e1d",
    "--brand-primary": "#ec3013",
    "--brand-primary-hover": "#ae1800",
    "--brand-gold": "#ec3013",
    "--brand-cobre": "#ae1800",
    "--brand-card": "#eae9e9",
    "--brand-card-border": "#d7d3d3",
    "--brand-border": "#d7d3d3",
    "--brand-shadow": "rgba(45, 43, 43, 0.22)",
    "--brand-glass-bg": "rgba(243, 242, 242, 0.86)",
    "--brand-footer-bg": "#201e1d",
  },
  "luxury-light": {
    "--brand-background": "#fafafc",
    "--brand-foreground": "#1a1a23",
    "--brand-primary": "#C83F00",
    "--brand-primary-hover": "#9E3100",
    "--brand-gold": "#9E3100",
    "--brand-cobre": "#9E3100",
    "--brand-card": "#ffffff",
    "--brand-card-border": "#f3f4f6",
    "--brand-border": "#f1f3f5",
    "--brand-shadow": "rgba(0, 0, 0, 0.03)",
    "--brand-glass-bg": "rgba(255, 255, 255, 0.8)",
    "--brand-footer-bg": "#f1f3f5",
  },
  "stealth-dark": {
    "--brand-background": "#09090B",
    "--brand-foreground": "#F4F4F7",
    "--brand-primary": "#D4AF37",
    "--brand-primary-hover": "#bfa030",
    "--brand-gold": "#D4AF37",
    "--brand-cobre": "#D4AF37",
    "--brand-card": "#14141B",
    "--brand-card-border": "#24242b",
    "--brand-border": "#1e1e24",
    "--brand-shadow": "rgba(0, 0, 0, 0.5)",
    "--brand-glass-bg": "rgba(20, 20, 27, 0.85)",
    "--brand-footer-bg": "#09090B",
  },
  "sport-nardo": {
    "--brand-background": "#1A1D20",
    "--brand-foreground": "#FFFFFF",
    "--brand-primary": "#E30613",
    "--brand-primary-hover": "#c50510",
    "--brand-gold": "#E30613",
    "--brand-cobre": "#ff6b6b",
    "--brand-card": "#272B30",
    "--brand-card-border": "#363b42",
    "--brand-border": "#363b42",
    "--brand-shadow": "rgba(227, 6, 19, 0.08)",
    "--brand-glass-bg": "rgba(39, 43, 48, 0.85)",
    "--brand-footer-bg": "#1A1D20",
  },
};

/** A paleta de quem nunca trocou de tema — todo visitante do site. */
export const TEMA_PADRAO: ThemeType = "motors-cobre";

/** Paletas de fundo escuro: ganham a classe `dark` na raiz. */
export const TEMAS_ESCUROS: readonly ThemeType[] = ["stealth-dark", "sport-nardo"];

/**
 * O script que aplica a paleta ANTES da primeira pintura, gerado das paletas
 * acima. Lê a escolha salva no navegador (só quem trocou pelo painel tem uma)
 * e cai no padrão.
 */
export function scriptAntiFlicker(): string {
  // `<` escapado: o JSON vai dentro de um <script>, e um valor com "</script>"
  // fecharia a tag. Hoje são só hexadecimais — é para continuar seguro amanhã.
  const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  // O `try` cerca SÓ a leitura do navegador: com o armazenamento bloqueado,
  // `localStorage` lança, e a paleta padrão tem que ser aplicada mesmo assim.
  // `hasOwnProperty`, e não `p[t]`: "__proto__" ou "constructor" salvos no
  // navegador passavam pelo teste de existência.
  return `(function(){
var p=${json(THEME_PRESETS)};
var escuros=${json(TEMAS_ESCUROS)};
var t=null;
try{t=localStorage.getItem('ag_theme');}catch(e){}
if(!t||!Object.prototype.hasOwnProperty.call(p,t))t=${json(TEMA_PADRAO)};
var a=p[t],d=document.documentElement;
for(var k in a)d.style.setProperty(k,a[k]);
d.setAttribute('data-theme',t);
if(escuros.indexOf(t)>=0)d.classList.add('dark');
})();`;
}

/** A paleta existe? Sem cair em propriedade herdada ("__proto__"…). */
export function ehTema(t: unknown): t is ThemeType {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(THEME_PRESETS, t);
}

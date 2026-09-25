import localFont from "next/font/local";

/* As fontes do site moram no repositório desde 2026-09-25.
 *
 * Até ali vinham de `next/font/google`, que baixa os arquivos do Google Fonts
 * NA HORA DA BUILD. Quando essa busca falha, a build inteira cai com
 * "Can't resolve '@vercel/turbopack-next/internal/font/google/font'" ou
 * "Failed to fetch `Archivo` from Google Fonts" — e o código não tinha culpa.
 * Derrubou a build do CI e o deploy do b23ca20 (PR #143, 24/09) e o deploy de
 * produção do aa34ca2 (PR #147, 25/09); nas duas vezes, refazer o deploy
 * resolveu. Falha de rede de terceiro não pode segurar o site fora do ar.
 *
 * ---------------------------------------------------------------------------
 * Os arquivos são os MESMOS bytes que o site servia
 * ---------------------------------------------------------------------------
 * Baixados de fonts.gstatic.com com o User-Agent que o `next/font/google` do
 * Next 16.2.6 usa (Chrome 104 em macOS — o Google entrega variantes diferentes
 * por navegador), e conferidos por md5 contra os que a build do aa34ca2 emitiu:
 *
 *   archivo-latin.woff2 ....... Archivo v25  92895abae7c57c46cedefc6165191735
 *   archivo-latin-ext.woff2 ... Archivo v25  288d2a1c9f040cd642fcb5af2b5847f8
 *   archivo-vietnamese.woff2 .. Archivo v25  dbc5c2f39794d5b548b68d875b2e2018
 *   geist-latin.woff2 ......... Geist v5     f4634c3bc1fa7cb53247e1f2872adb5a
 *   geist-latin-ext.woff2 ..... Geist v5     49215a3bccaeb5d483f4cf8fceb24776
 *   geist-vietnamese.woff2 .... Geist v5     dea7cff2e11a000dc4e0e913992f9c21
 *   geist-cyrillic.woff2 ...... Geist v5     9a45f5a5937490fac6d4f5043a36c125
 *   geist-cyrillic-ext.woff2 .. Geist v5     f4a75186954722ca80df35984adf581d
 *
 * Licença: as duas são SIL Open Font License 1.1 (Archivo © The Archivo
 * Project Authors; Geist © The Geist Project Authors). A OFL permite
 * redistribuir junto com o software desde que a licença vá junto — por isso
 * `fonts/OFL-Archivo.txt` e `fonts/OFL-Geist.txt`, copiados de
 * github.com/google/fonts (ofl/archivo e ofl/geist).
 *
 * ---------------------------------------------------------------------------
 * Por que uma chamada por faixa de caracteres
 * ---------------------------------------------------------------------------
 * O Google entrega cada família fatiada por `unicode-range` (latin,
 * latin-ext, vietnamese e, na Geist, cyrillic e cyrillic-ext), e o navegador
 * só baixa a fatia de que o texto precisa. Para o site renderizar igual, as
 * fatias continuam fatias: `declarations` põe o `unicode-range` e o
 * `font-family` de cada uma, mas vale para a chamada inteira — daí uma chamada
 * por fatia, todas com o mesmo `font-family`, que é o que o CSS do Google
 * sempre declarou.
 *
 * Só a fatia latin é pré-carregada: era o que `subsets: ["latin"]` fazia. As
 * demais existem para o caractere raro (um "ł" num nome, um "₢") não cair na
 * fonte do sistema. Elas não precisam ser citadas em lugar nenhum: cada
 * chamada no topo do módulo vira um import com o próprio CSS, e a build o
 * mantém (conferido no CSS emitido em 25/09). O `export` é só para o lint não
 * ler como variável esquecida.
 *
 * ---------------------------------------------------------------------------
 * O nome da constante É o nome da família — não renomeie
 * ---------------------------------------------------------------------------
 * `next/font/local` escreve a variável CSS com o NOME DA CONSTANTE
 * (`--font-geist-sans: "Geist", …`), e não com o `font-family` das
 * `declarations`. Com a constante chamada `geistSans`, a variável apontava para
 * uma família "geistSans" que não existe, e o corpo do site inteiro caía na
 * fonte reserva sem erro nenhum. Por isso `Geist` e `Archivo`, com maiúscula:
 * a `font-family` computada fica idêntica à da época do Google.
 *
 * A reserva (`fallback`) também é a de antes: `adjustFontFallback: false`
 * desliga a que o Next calcularia do arquivo, e "Geist Fallback" / "Archivo
 * Fallback" são declaradas em `globals.css` com as métricas que o Google usava.
 *
 * Os valores são literais repetidos, e não constantes, porque `next/font`
 * exige literais nas opções — é analisado na compilação.
 */

// ---------------------------------------------------------------------------
// Geist — o corpo do site (`--font-sans`, em globals.css). Fonte variável:
// um arquivo por fatia cobre os pesos de 100 a 900.
// ---------------------------------------------------------------------------
export const Geist = localFont({
  src: [{ path: "./fonts/geist-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-geist-sans",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Geist Fallback"],
  declarations: [
    { prop: "font-family", value: "Geist" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

export const GeistLatinExt = localFont({
  src: [{ path: "./fonts/geist-latin-ext.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Geist" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

export const GeistVietnamese = localFont({
  src: [{ path: "./fonts/geist-vietnamese.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Geist" },
    {
      prop: "unicode-range",
      value:
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
});

export const GeistCyrillic = localFont({
  src: [{ path: "./fonts/geist-cyrillic.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Geist" },
    { prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  ],
});

export const GeistCyrillicExt = localFont({
  src: [{ path: "./fonts/geist-cyrillic-ext.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Geist" },
    {
      prop: "unicode-range",
      value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
    },
  ],
});

// ---------------------------------------------------------------------------
// Archivo — a tipografia do redesign Modernist (`--font-modernist`). Os três
// pesos são os que o design doc usa: 400 corrido, 600 rótulos em versalete,
// 800 títulos e botões.
//
// O arquivo é variável, e o Google declarava três faces com o MESMO arquivo e
// um peso fixo cada. Continua assim, e não `weight: "400 800"`: com três faces
// fixas, um `font-bold` (700) casa com a face 800, como sempre casou; com a
// faixa contínua ele passaria a desenhar 700 — um peso que o site nunca viu.
// ---------------------------------------------------------------------------
export const Archivo = localFont({
  src: [
    { path: "./fonts/archivo-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/archivo-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/archivo-latin.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-archivo",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Archivo Fallback"],
  declarations: [
    { prop: "font-family", value: "Archivo" },
    { prop: "font-stretch", value: "100%" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

export const ArchivoLatinExt = localFont({
  src: [
    { path: "./fonts/archivo-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "./fonts/archivo-latin-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/archivo-latin-ext.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Archivo" },
    { prop: "font-stretch", value: "100%" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

export const ArchivoVietnamese = localFont({
  src: [
    { path: "./fonts/archivo-vietnamese.woff2", weight: "400", style: "normal" },
    { path: "./fonts/archivo-vietnamese.woff2", weight: "600", style: "normal" },
    { path: "./fonts/archivo-vietnamese.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Archivo" },
    { prop: "font-stretch", value: "100%" },
    {
      prop: "unicode-range",
      value:
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
});

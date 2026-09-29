/**
 * A grafia canônica de marca, modelo e versão — "HB20", não "Hb20".
 *
 * ---------------------------------------------------------------------------
 * Por que existe (2026-09-21)
 * ---------------------------------------------------------------------------
 * O feed do RevendaMais chega em caixa baixa ("hb20 comfort 1.0 flex 12v mec.")
 * e o mapper subia tudo por `capitalizeWords`: primeira letra maiúscula, resto
 * minúsculo, palavra por palavra. Isso produz o nome errado justamente onde o
 * nome é a consulta: "Hb20" no `<title>`, no `<h1>` e na meta description de
 * uma vez, "Hr-v", "Cb 300f", "Tsi", "12v", "Citroen" sem trema. E a versão ia
 * crua, toda minúscula, para o `<h1>` da ficha.
 *
 * ---------------------------------------------------------------------------
 * A regra que não se negocia: só CAIXA muda
 * ---------------------------------------------------------------------------
 * Marca, modelo e versão também montam URL (`lib/veiculoUrl.ts`) e o recorte
 * do nome do hub (`rotuloDoModelo`). Os dois comparam em minúscula, e a URL
 * ainda passa por `slugificar`, que tira acento. Enquanto esta função mexer só
 * em maiúscula/minúscula — e no trema de "Citroën", que o `slugificar` apaga —,
 * nenhuma URL de ficha ou de hub muda. Por isso NÃO há aqui acento restaurado
 * em versão ("Automatico"), nem espaço removido ("hb 20" → "HB20"): os dois
 * renomeariam página indexada. A trava está em `tests/grafia-canonica.test.ts`,
 * que roda o estoque real de 21/09 inteiro pelo gerador de URL antes e depois.
 *
 * A única troca além da caixa é ESPAÇO → HÍFEN nos nomes que a marca escreve
 * com hífen (`COM_HIFEN`): "t cross" → "T-Cross". É segura pelo mesmo motivo:
 * `slugificar` já converte espaço em hífen, então "t cross" e "t-cross" dão o
 * MESMO slug. A URL sempre foi `t-cross`; o que estava errado era o nome na
 * tela — e é o nome na tela (`<title>`, `<h1>`) que casa com a busca de quem
 * digita o modelo como a Volkswagen escreve. (Pedido do dono em 21/09.)
 *
 * O override do painel (`modelo_override`, `versao_override`) continua acima
 * de tudo: quem escreve à mão escreve como quer.
 */

/** Marcas cuja grafia não sai de "primeira letra maiúscula". */
const MARCAS: Record<string, string> = {
  bmw: "BMW",
  byd: "BYD",
  gwm: "GWM",
  gm: "GM",
  vw: "VW",
  jtz: "JTZ",
  ram: "RAM",
  jac: "JAC",
  mini: "MINI",
  ktm: "KTM",
  citroen: "Citroën",
  "citroën": "Citroën",
  "harley-davidson": "Harley-Davidson",
  "mercedes-benz": "Mercedes-Benz",
  "land rover": "Land Rover",
  "alfa romeo": "Alfa Romeo",
  "caoa chery": "Caoa Chery",
  "royal enfield": "Royal Enfield",
};

/**
 * Tokens com grafia própria, que nenhuma regra geral acerta.
 *
 * Chave em minúscula; o valor tem de ser a MESMA sequência de letras, só com
 * outra caixa — a trava de URL reprova qualquer coisa além disso.
 */
const TOKENS: Record<string, string> = {
  hb20: "HB20",
  hb20s: "HB20S",
  hb20x: "HB20X",
  "hr-v": "HR-V",
  "cr-v": "CR-V",
  "wr-v": "WR-V",
  "br-v": "BR-V",
  "t-cross": "T-Cross",
  "gr-sport": "GR-Sport",
  "r-line": "R-Line",
  "gt-line": "GT-Line",
  "gsx-r": "GSX-R",
  "hi-torque": "Hi-Torque",
  i30: "i30",
  ix35: "ix35",
  sdrive: "sDrive",
  xdrive: "xDrive",
  flexone: "FlexOne",
  flexpower: "FlexPower",
  totalflex: "TotalFlex",
  "econo.flex": "Econo.Flex",
  powershift: "PowerShift",
  bluemedia: "BlueMedia",
  xgear: "XGear",
  "up!": "Up!",
};

/** Siglas só de letras que o feed usa em modelo e versão. Vão inteiras em maiúscula. */
const SIGLAS = new Set([
  "abs", "adv", "at", "awd", "cb", "cd", "ce", "cgi", "cl", "cs", "cvt", "dct",
  "dsg", "esdd", "ex", "exl", "exs", "ff", "fwd", "fxd", "gii", "giii", "gl",
  "gli", "gls", "gp", "gt", "gti", "hlx", "ls", "lt", "ltz", "lx", "mi", "mpfi",
  "mpi", "msi", "mt", "nxr", "pdk", "rc", "rs", "se", "sel", "srad", "ss", "st",
  "suv", "sv", "sw", "sx", "tb", "tdi", "tfsi", "tsi", "vhc", "xei", "xli",
  "xr", "xre",
]);

/**
 * Nomes que a marca escreve com hífen e o feed às vezes manda com espaço.
 *
 * Só entram pares em que a ÚNICA diferença é espaço ↔ hífen — é isso que os
 * mantém invisíveis para `slugificar`. Juntar palavras ("hb 20" → "hb20") muda
 * o slug e não pode entrar aqui.
 */
const COM_HIFEN: Array<[RegExp, string]> = [
  [/(^|\s)t\s+cross(?=\s|$)/gi, "$1t-cross"],
  [/(^|\s)hr\s+v(?=\s|$)/gi, "$1hr-v"],
  [/(^|\s)cr\s+v(?=\s|$)/gi, "$1cr-v"],
  [/(^|\s)wr\s+v(?=\s|$)/gi, "$1wr-v"],
  [/(^|\s)br\s+v(?=\s|$)/gi, "$1br-v"],
];

function comHifenDaMarca(texto: string): string {
  return COM_HIFEN.reduce((t, [padrao, troca]) => t.replace(padrao, troca), texto);
}

/** "citroen" → "Citroën"; "harley-davidson" → "Harley-Davidson"; resto, palavra a palavra. */
export function grafiaDaMarca(bruta: string | null | undefined): string {
  const limpa = (bruta ?? "").trim().replace(/\s+/g, " ");
  if (!limpa) return "";
  const conhecida = MARCAS[limpa.toLowerCase()];
  if (conhecida) return conhecida;
  return limpa
    .split(" ")
    .map((palavra) => palavra.split("-").map(capitalizar).join("-"))
    .join(" ");
}

/**
 * Modelo completo como o feed manda ("hb20 comfort 1.0 flex 12v mec.").
 * Colapsa espaço repetido — o mesmo que `capitalizeWords` fazia, para a
 * comparação com a versão continuar batendo.
 */
export function grafiaDoModelo(bruto: string | null | undefined): string {
  const limpo = (bruto ?? "").trim();
  if (!limpo) return "";
  return comHifenDaMarca(limpo).split(/\s+/).map(grafiaDoToken).join(" ");
}

/**
 * Versão ("highline 200 tsi 1.0 flex 12v aut."). Preserva o espaço como veio:
 * a versão era usada crua até aqui, e o recorte do modelo compara as duas.
 */
export function grafiaDaVersao(bruta: string | null | undefined): string {
  const limpa = (bruta ?? "").trim();
  if (!limpa) return "";
  // O mesmo hífen do modelo: o recorte do hub compara um com o outro, e os
  // dois têm de chegar escritos igual.
  return comHifenDaMarca(limpa)
    .split(/(\s+)/)
    .map((pedaco) => (/^\s+$/.test(pedaco) ? pedaco : grafiaDoToken(pedaco)))
    .join("");
}

/**
 * Marca, modelo e versão de um cadastro, cada um pela sua função acima, com o
 * resto do carro intacto. Nenhuma regra nova: é a composição que a rota de
 * leads passou a fazer no interesse do WhatsApp do repasse (#163, o
 * "FIAT PALIO 1.0 ECONOMY…" no Kanban), e que a ficha e o card do repasse
 * fazem no nome desde 29/09 (pedido do dono: o `<h1>` mostrava o cadastro em
 * maiúsculas). Só a caixa muda, então o slug, que o cadastro já gravou, não.
 */
export function grafiaDoCarro<T extends { marca: string; modelo: string; versao: string | null }>(carro: T): T {
  return {
    ...carro,
    marca: grafiaDaMarca(carro.marca),
    modelo: grafiaDoModelo(carro.modelo),
    versao: carro.versao === null ? null : grafiaDaVersao(carro.versao),
  };
}

function capitalizar(palavra: string): string {
  if (!palavra) return "";
  return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}

/** Uma palavra do feed na grafia certa. Exportada para o teste de regra. */
export function grafiaDoToken(token: string): string {
  if (!token) return token;
  const minusculo = token.toLowerCase();

  const exata = TOKENS[minusculo];
  if (exata) return exata;

  // Pontuação no fim ("aut.", "5p.", "ka+") sai do miolo e volta depois.
  const [, miolo = "", fim = ""] = minusculo.match(/^(.*?)([.!+]*)$/) ?? [];
  if (!miolo) return token;

  const exataDoMiolo = TOKENS[miolo];
  if (exataDoMiolo) return exataDoMiolo + fim;

  return regraDoMiolo(miolo) + fim;
}

function regraDoMiolo(m: string): string {
  // Número puro: "1.0", "2016", "1,0".
  if (/^\d+([.,]\d+)?$/.test(m)) return m;
  // Tração: "4x4", "4x2" — o x fica minúsculo.
  if (/^\d+x\d+$/.test(m)) return m;
  // Potência: "156cv" — cv minúsculo, como a ficha técnica escreve.
  if (/^\d+([.,]\d+)?cv$/.test(m)) return m;
  // Motor BMW: "20i", "320i".
  if (/^\d+i$/.test(m)) return m;
  // Número com sufixo: "16v", "5p", "1.0l", "1300l", "300f", "18sl", "1.0mt".
  if (/^\d+([.,]\d+)?[a-z]+$/.test(m)) {
    return m.replace(/[a-z]+$/, (s) => s.toUpperCase());
  }
  // Letra com número: "x1", "c3", "m40i", "t270", "at9", "ex2", "t200at".
  // O "i" logo depois do número é da BMW e fica minúsculo: "M40i", "X25i".
  if (/^[a-z]+\d+[a-z0-9]*$/.test(m)) {
    const i = /\di$/.test(m);
    const corpo = i ? m.slice(0, -1) : m;
    return corpo.toUpperCase() + (i ? "i" : "");
  }
  // Sigla com número hifenizado: "k-2500", "c-180", "v-8".
  if (/^[a-z]+-\d+$/.test(m)) return m.toUpperCase();
  // Letra sozinha: o "M" de "M Sport", o "W" de "750 W".
  if (/^[a-z]$/.test(m)) return m.toUpperCase();
  if (SIGLAS.has(m)) return m.toUpperCase();
  // Palavra composta: cada parte com a sua maiúscula.
  if (m.includes("-")) return m.split("-").map(capitalizar).join("-");
  return capitalizar(m);
}

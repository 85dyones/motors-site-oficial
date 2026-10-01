import { grafiaDaMarca, grafiaDaVersao, grafiaDoModelo } from "./grafiaCanonica";

/**
 * A grafia do cadastro do veículo para quem lê — o site e o painel.
 *
 * O feed do RevendaMais chega em caixa baixa ("automatico", "flex", "branco").
 * O site sempre mostrou esses campos na grafia da casa, pelas funções que
 * moravam dentro de `mapVeiculoDbToVeiculo` (`lib/supabase.ts`). A visão e o
 * editor do veículo no painel liam a linha do banco direto e mostravam o valor
 * cru — "renault captur intense 1.3 tb 16v flex 5p aut." no título (queixa do
 * dono em 01/10). As funções vieram para cá sem mudar uma vírgula, para o site
 * e o painel usarem a mesma régua; marca, modelo e versão seguem em
 * `grafiaCanonica.ts`, com a regra de não mudar URL.
 */

/** "automatico" → "Automático"; "aut. cvt" → "Automático CVT". Vazio vira "Automático" — ver `cadastroNaGrafia`. */
export const grafiaDoCambio = (c: string): string => {
  if (!c) return "Automático";
  const val = c.toLowerCase().trim();
  if (val.includes("manual")) return "Manual";
  if (val.includes("automatico") || val.includes("automático") || val.includes("automatic") || val.includes("pdk") || val.includes("zf8") || val.includes("aut")) {
    if (val.includes("pdk")) return "Automático PDK";
    if (val.includes("zf8")) return "Automático ZF8";
    if (val.includes("cvt")) return "Automático CVT";
    return "Automático";
  }
  return c.charAt(0).toUpperCase() + c.slice(1);
};

/** "flex" → "Flex"; "eletrico" → "Elétrico". Vazio vira "Flex" — ver `cadastroNaGrafia`. */
export const grafiaDoCombustivel = (c: string): string => {
  if (!c) return "Flex";
  const val = c.toLowerCase().trim();
  if (val.includes("gasolina") || val.includes("gasoline") || val.includes("petrol")) return "Gasolina";
  if (val.includes("diesel")) return "Diesel";
  if (val.includes("flex")) return "Flex";
  if (val.includes("eletrico") || val.includes("elétrico") || val.includes("ev")) return "Elétrico";
  if (val.includes("hibrido") || val.includes("híbrido") || val.includes("mhev")) return "Híbrido";
  return c.charAt(0).toUpperCase() + c.slice(1);
};

/** "branco" → "Branco"; "cinza grafite" → "Cinza Grafite". */
export const grafiaDaCor = (str: string): string => {
  if (!str) return "";
  return str
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
};

export interface CampoDoCadastro {
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  modelo_override?: string | null;
  versao_override?: string | null;
  cambio?: string | null;
  combustivel?: string | null;
  cor?: string | null;
}

export interface CadastroNaGrafia {
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
}

const cheio = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/**
 * O cadastro como o painel o mostra: cada campo na grafia da casa, e `null`
 * onde o cadastro não diz nada.
 *
 * O `null` é o ponto. `grafiaDoCambio("")` devolve "Automático", e
 * `grafiaDoCombustivel("")`, "Flex": no site, o mapeador só as chama com valor.
 * No painel, campo vazio é "Não informado" — afirmar câmbio automático num
 * carro sem câmbio no cadastro é escrever sobre o carro o que ninguém disse.
 *
 * O override do painel (`modelo_override`, `versao_override`) vai como foi
 * escrito, como no site.
 */
export function cadastroNaGrafia(v: CampoDoCadastro): CadastroNaGrafia {
  const marca = cheio(v.marca);
  const modelo = cheio(v.modelo);
  const versao = cheio(v.versao);
  const cambio = cheio(v.cambio);
  const combustivel = cheio(v.combustivel);
  const cor = cheio(v.cor);
  return {
    marca: marca && grafiaDaMarca(marca),
    modelo: cheio(v.modelo_override) ?? (modelo && grafiaDoModelo(modelo)),
    versao: cheio(v.versao_override) ?? (versao && grafiaDaVersao(versao)),
    cambio: cambio && grafiaDoCambio(cambio),
    combustivel: combustivel && grafiaDoCombustivel(combustivel),
    cor: cor && grafiaDaCor(cor),
  };
}

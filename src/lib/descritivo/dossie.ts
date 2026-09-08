import { formatPericia } from "../supabase";

/**
 * O dossiê do veículo — a única fonte de fato para o texto gerado.
 *
 * Duas decisões que vieram de medição, não de gosto (08/09/2026, spec §4):
 *
 * 1. O formato é `Rótulo: valor`, nunca JSON. Com JSON, o modelo trata as
 *    chaves como um saco de valores e transfere um para o rótulo do outro —
 *    "motor manual e carroceria branca" numa moto cujo câmbio é manual e cuja
 *    COR é branca. Os rótulos abaixo são desambiguadores de propósito.
 *
 * 2. Campo vazio não entra. O que não está no dossiê não existe para o texto,
 *    e a rota monta as proibições a partir da AUSÊNCIA de cada rótulo.
 */

export const ROTULOS = {
  marca: "Marca",
  modelo: "Modelo",
  anoModelo: "Ano do modelo",
  anoFabricacao: "Ano de fabricação",
  preco: "Preço anunciado (R$)",
  km: "Quilometragem rodada (km)",
  cambio: "Tipo de câmbio",
  combustivel: "Combustível",
  cor: "Cor da pintura",
  carroceria: "Tipo de carroceria",
  motorizacao: "Motorização",
  portas: "Número de portas",
  donos: "Donos anteriores",
  garantia: "Garantia de fábrica",
  opcionais: "Opcionais declarados",
  laudo: "Laudo da perícia",
} as const;

export type Rotulo = (typeof ROTULOS)[keyof typeof ROTULOS];
export type LinhaDoDossie = { rotulo: string; valor: string };

export type Dossie = {
  linhas: LinhaDoDossie[];
  periciaAprovada: boolean;
  opcionais: string[];
};

/** A linha de `estoque_motors` que o dossiê consome. */
export type VeiculoParaDossie = {
  marca?: string | null;
  modelo?: string | null;
  ano?: number | null;
  ano_fabricacao?: number | null;
  preco?: string | number | null;
  quilometragem?: number | string | null;
  cambio?: string | null;
  combustivel?: string | null;
  cor?: string | null;
  tipo?: string | null;
  motor?: string | null;
  portas?: number | string | null;
  donos_anteriores?: number | string | null;
  garantia_fabrica?: string | null;
  pericia?: string | null;
  laudo_pericia?: string | null;
  opcionais?: string | null;
};

const vazio = (x: unknown) => x === null || x === undefined || String(x).trim() === "";

export function montarDossie(v: VeiculoParaDossie): Dossie {
  const linhas: LinhaDoDossie[] = [];
  const por = (rotulo: string, valor: unknown) => {
    if (!vazio(valor)) linhas.push({ rotulo, valor: String(valor).trim() });
  };

  const numero = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR") : null;
  };

  por(ROTULOS.marca, v.marca);
  por(ROTULOS.modelo, v.modelo);
  por(ROTULOS.anoModelo, v.ano);
  por(ROTULOS.anoFabricacao, v.ano_fabricacao);
  por(ROTULOS.preco, vazio(v.preco) ? null : numero(v.preco));
  por(ROTULOS.km, vazio(v.quilometragem) ? null : numero(v.quilometragem));
  por(ROTULOS.cambio, v.cambio);
  por(ROTULOS.combustivel, v.combustivel);
  por(ROTULOS.cor, v.cor);
  por(ROTULOS.carroceria, v.tipo);
  por(ROTULOS.motorizacao, v.motor);
  // `portas` NÃO é código morto: a coluna existe em produção (medido em
  // 2026-09-08 — smallint, preenchida em 41 dos 85 veículos à venda), só que
  // sem migração versionada que a crie. É divergência entre o schema real e
  // o histórico do repositório — dívida do repositório, não deste branch.
  // Não remover por não achar a migração.
  por(ROTULOS.portas, v.portas);
  por(ROTULOS.donos, v.donos_anteriores);
  por(ROTULOS.garantia, v.garantia_fabrica);

  const opcionais = vazio(v.opcionais)
    ? []
    : String(v.opcionais).split(",").map((s) => s.trim()).filter(Boolean);
  if (opcionais.length > 0) por(ROTULOS.opcionais, opcionais.join("; "));

  const periciaAprovada = formatPericia(v.pericia ?? "") === "PERÍCIA APROVADA";

  // O laudo só entra COM a perícia aprovada. O X1 7803195 é o caso real: a
  // perícia está "Em análise" e o laudo descreve um exame completo — passá-lo
  // ao modelo é convidar a afirmação que a régua acabou de negar.
  if (periciaAprovada) por(ROTULOS.laudo, v.laudo_pericia);

  return { linhas, periciaAprovada, opcionais };
}

export function temRotulo(d: Dossie, rotulo: string): boolean {
  return d.linhas.some((l) => l.rotulo === rotulo);
}

export function dossieEmTexto(d: Dossie): string {
  return d.linhas.map((l) => `${l.rotulo}: ${l.valor}`).join("\n");
}

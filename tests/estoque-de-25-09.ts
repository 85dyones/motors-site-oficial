import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { disponiveisDe } from "../src/lib/regrasEstoque";
import { publicavel } from "../src/lib/coerenciaDoCadastro";
import type { Veiculo } from "../src/types";

/**
 * O pátio publicado em 25/09/2026, passado pelo mapper de verdade — o mesmo
 * fixture de `motor-do-match.test.ts` (as colunas estão descritas lá). Aqui
 * para os testes do Profiler que precisam de estoque real sem repetir a
 * leitura.
 */
type Linha = [
  number, string, string, string, string | null, string | null, number, number, string, string,
  string, string[] | null, number, number, number | null, string | null, string | null,
];

const LINHAS: Linha[] = JSON.parse(readFileSync(join(__dirname, "fixtures", "estoque-2026-09-25.json"), "utf8"));

export const ESTOQUE_DE_25_09: Veiculo[] = disponiveisDe(
  LINHAS.map(([id, marca, modelo, versao, mo, vo, ano, km, cambio, combustivel, tipo, perfis, po, pp, portas, motor, opcionais]) =>
    mapVeiculoDbToVeiculo({
      id, marca, modelo, versao, modelo_override: mo, versao_override: vo, ano, quilometragem: km,
      cambio, combustivel, tipo, perfis_uso: perfis, preco_original: po, preco_promocional: pp,
      portas, motor, opcionais, vendido: false,
      whatsapp_images: ["a", "b", "c", "d"],
    }),
  ).filter((v) => publicavel(v)),
);

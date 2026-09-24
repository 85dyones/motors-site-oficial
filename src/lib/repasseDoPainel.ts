/**
 * A linha inteira de `repasses`, como o PAINEL a lê: as colunas públicas
 * (pelo mesmo `repasseDaLinha` da leitura anônima) e as internas — quem
 * criou, quem validou, a nota da devolução.
 *
 * Só servidor: importa `leituraDosRepasses.ts`, que carrega o cliente anon.
 * Client component recebe o `RepasseDoPainel` já lido, por prop, e importa só
 * o TIPO (de `repasse.ts`).
 */
import { repasseDaLinha } from "./leituraDosRepasses";
import type { RepasseDoPainel } from "./repasse";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function repasseDoPainelDaLinha(linha: Record<string, unknown>): RepasseDoPainel | null {
  const base = repasseDaLinha(linha);
  if (!base) return null;
  return {
    ...base,
    criado_por: texto(linha.criado_por),
    enviado_em: texto(linha.enviado_em),
    validado_por: texto(linha.validado_por),
    validado_em: texto(linha.validado_em),
    devolvido_com: texto(linha.devolvido_com),
    updated_at: texto(linha.updated_at),
  };
}

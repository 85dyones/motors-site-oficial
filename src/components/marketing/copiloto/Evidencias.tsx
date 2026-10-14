import { numero, reais } from "./formato";

/**
 * A evidência de um achado ou de uma proposta, como o banco a guardou: listas
 * viram tabela, números viram uma linha. É genérico de propósito — cada regra
 * do copiloto guarda a prova no formato que a explica, e a tela não precisa
 * conhecer cada formato para mostrá-lo.
 */

const ROTULO: Record<string, string> = {
  termo: "Termo",
  termos: "Termos",
  campanha: "Campanha",
  campanhas: "Campanhas",
  grupo: "Grupo",
  grupos: "Grupos",
  custo: "Gasto 7d",
  custo7: "Gasto 7d",
  cliques: "Cliques",
  cliques7: "Cliques 7d",
  conversoes7: "Conversões 7d",
  motivos: "Motivo do Google",
  palavra: "Palavra-chave",
  palavras: "Palavras-chave",
  iq: "IQ",
  anuncio: "Anúncio",
  anuncios: "Anúncios",
  pagina: "Página",
  ctr: "CTR esperada",
  aprovacao: "Aprovação",
  situacao: "Situação",
  tipo: "Tipo",
  texto: "Texto",
  recursos: "Recursos",
  nome: "Nome",
  acoes: "Ações de conversão",
  ultimoDia: "Último registro",
  primaria: "Primária",
  verba: "Verba/dia",
  ritmoPct: "Ritmo (% da verba)",
  perdaPorVerba: "Perdido por verba",
  perdaPorRanking: "Perdido por classificação",
  leadsComGclid: "Leads com gclid",
  conversoesNoGoogle: "Conversões no Google",
  total: "Leads",
  doSite: "Leads do site",
  comGclid: "Com gclid",
  comUtmGoogle: "Com utm de Google pago",
  taxaPct: "Taxa (%)",
};

const EM_REAIS = new Set(["custo", "custo7", "verba"]);
const FRACAO = new Set(["perdaPorVerba", "perdaPorRanking"]);

function valor(chave: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") {
    if (EM_REAIS.has(chave)) return reais(v);
    if (FRACAO.has(chave)) return `${Math.round(v * 100)}%`;
    return numero(v);
  }
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : "—";
  return String(v);
}

export default function Evidencias({ evidencias, limite = 12 }: { evidencias: Record<string, unknown>; limite?: number }) {
  const listas = Object.entries(evidencias).filter(
    (e): e is [string, Record<string, unknown>[]] => Array.isArray(e[1]) && e[1].length > 0 && typeof e[1][0] === "object",
  );
  const soltos = Object.entries(evidencias).filter(([, v]) => !Array.isArray(v) && (typeof v !== "object" || v === null));

  if (listas.length === 0 && soltos.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-evidencias>
      {soltos.length > 0 && (
        <dl className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-mt-neutral-800">
          {soltos.map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="text-mt-neutral-700">{ROTULO[k] ?? k}:</dt>
              <dd className="m-0 font-semibold tabular-nums">{valor(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {listas.map(([k, linhas]) => {
        const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
        return (
          <div key={k} className="overflow-x-auto">
            <table className="mt-tabela text-[11px]">
              <caption className="pb-1 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-mt-neutral-700">
                {ROTULO[k] ?? k}
                {linhas.length > limite ? ` · ${limite} de ${linhas.length}` : ""}
              </caption>
              <thead>
                <tr>
                  {colunas.map((c) => (
                    <th key={c} scope="col" className={EM_REAIS.has(c) || typeof linhas[0][c] === "number" ? "mt-num text-right" : undefined}>
                      {ROTULO[c] ?? c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, limite).map((l, i) => (
                  <tr key={i}>
                    {colunas.map((c) => (
                      <td key={c} className={typeof l[c] === "number" ? "mt-num text-right" : undefined}>
                        {valor(c, l[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

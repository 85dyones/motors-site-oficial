"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "./ConfirmDialog";
import {
  calculateFinancing,
  taxaVariaMais,
  type ParametrosDoFinanciamento,
} from "../../lib/finance-calculator";
import {
  parametrosDaVigencia,
  validarVigenciaNova,
  vigenciaDosParametros,
} from "../../lib/parametrosDoFinanciamento";
import type { HistoricoDoFinanciamento } from "../../lib/parametrosDoFinanciamento-servidor";
import { avisoDeCredito, textoDaParcela, textoSemEstimativa } from "../../lib/textoDaParcela";

/**
 * `/admin/financiamento` — as condições do simulador do site.
 *
 * Quem abre: Administrador e Financeiro (matriz A17, "Editar texto legal e
 * condições de financiamento"). Quando: ao revisar as taxas contra o mercado,
 * ao mudar de banco parceiro, ou quando os bancos passam a aceitar outro ano.
 * Que decisão sai: **abrir uma vigência nova** — ou deixar como está.
 *
 * Salvar nunca edita a vigência atual: ela termina hoje e a nova começa, e o
 * histórico abaixo guarda o que o site já mostrou a cada cliente. O exemplo
 * ao vivo usa a MESMA conta da ficha (`calculateFinancing`) e o mesmo texto
 * de crédito (`textoDaParcela`), para quem edita ver o efeito antes de salvar.
 */
export default function CondicoesDoSimulador({
  vigente,
  historico,
}: {
  /** O que o site está usando agora — a vigência, ou os de fábrica. */
  vigente: ParametrosDoFinanciamento;
  historico: HistoricoDoFinanciamento;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const inicial = vigenciaDosParametros(vigente);
  // Na tela, a taxa com vírgula, como se escreve no Brasil; a validação lê as duas.
  const comVirgula = (n: number) => n.toFixed(2).replace(".", ",");

  const [taxaExcelenteAm, setTaxaExcelente] = useState(comVirgula(inicial.taxaExcelenteAm));
  const [taxaRegularAm, setTaxaRegular] = useState(comVirgula(inicial.taxaRegularAm));
  const [taxaRiscoAm, setTaxaRisco] = useState(comVirgula(inicial.taxaRiscoAm));
  const [anoDeReferencia, setAnoDeReferencia] = useState(String(inicial.anoDeReferencia));
  const [anoMaisAntigo, setAnoMaisAntigo] = useState(String(inicial.anoMaisAntigo));
  const [bancos, setBancos] = useState(inicial.bancosParceiros.join("\n"));
  const [fonteDasTaxas, setFonte] = useState(inicial.fonteDasTaxas);
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<{ tipo: "ok" | "erro"; texto: string; problemas?: string[] } | null>(null);

  const rascunho = {
    taxaExcelenteAm,
    taxaRegularAm,
    taxaRiscoAm,
    anoDeReferencia,
    anoMaisAntigo,
    bancosParceiros: bancos,
    fonteDasTaxas,
    descricao,
  };
  const validacao = validarVigenciaNova(rascunho);

  // O exemplo: um carro de R$ 60 mil com três anos, R$ 20 mil de entrada, 48×,
  // CLT — e um carro um ano mais velho que o último financiado.
  const exemplo = (() => {
    if (!validacao.ok) return null;
    const p = parametrosDaVigencia(validacao.valores);
    const ano = p.anoDeReferencia - 3;
    const r = calculateFinancing(
      { vehiclePrice: 60000, vehicleYear: ano, downPaymentValue: 20000, installments: 48, occupation: "clt" },
      p,
    );
    return {
      ano,
      parametros: p,
      texto: textoDaParcela({
        valor: r.parcela_mensal,
        prazo: 48,
        entrada: 20000,
        taxaMes: r.taxa_aplicada_mes_pct,
        cetAno: r.cet_anual_real_pct,
        total: r.total_pago_ao_final,
        aVista: 60000,
        taxaVariaMais: taxaVariaMais(ano, p),
      }),
    };
  })();

  const semTabela = !historico.tabela;

  const salvar = async () => {
    setRetorno(null);
    if (!validacao.ok) {
      setRetorno({ tipo: "erro", texto: "Confira os campos.", problemas: validacao.erros });
      return;
    }
    const ok = await confirm({
      title: "Abrir vigência nova",
      message:
        "A vigência atual termina hoje e a nova passa a valer no site em seguida — ficha do carro, " +
        "/financiamento e Garagem Profiler. A anterior fica guardada no histórico.",
      confirmLabel: "Sim, abrir vigência",
      cancelLabel: "Cancelar",
      type: "warning",
    });
    if (!ok) return;

    setSalvando(true);
    try {
      const res = await fetch("/api/financiamento/parametros", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validacao.valores),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRetorno({ tipo: "erro", texto: json.error || "Não deu para salvar.", problemas: json.problemas });
        return;
      }
      setDescricao("");
      setRetorno({ tipo: "ok", texto: "Vigência nova salva. O site já simula com ela." });
      router.refresh();
    } catch {
      setRetorno({ tipo: "erro", texto: "Sem conexão com o servidor. Nada foi salvo." });
    } finally {
      setSalvando(false);
    }
  };

  const campo = "mt-campo-caixa mt-foco";
  const dica = "m-0 mt-1.5 text-[11px] leading-relaxed text-mt-neutral-700";

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1.5 border-b-2 border-mt-regua pb-5">
        <div className="mt-rotulo mt-rotulo-accent">Financiamento</div>
        <h1 className="mt-titulo text-3xl md:text-4xl">Condições do simulador</h1>
        <p className="mt-1 max-w-[680px] text-sm text-mt-neutral-800">
          As taxas, o ano mais antigo que os bancos parceiros financiam e a lista desses bancos — o que o site usa
          para estimar parcela na ficha do carro, em /financiamento e no Garagem Profiler. Salvar abre uma vigência
          nova a partir de hoje; a anterior fica guardada abaixo.
        </p>
      </div>

      {semTabela && (
        <div className="border border-mt-accent-300 bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent">
          <strong className="font-extrabold">A tabela ainda não existe no banco.</strong> Falta aplicar a migração{" "}
          <code className="font-mono">20260928120000_parametros_financiamento</code>. Até lá o site simula com os
          valores abaixo, que são os de fábrica, e salvar não funciona.
        </div>
      )}

      <p className="m-0 text-xs text-mt-neutral-700">
        {vigente.id
          ? `Vigente desde ${dataCurta(vigente.vigenciaDesde)}.`
          : "O site está usando os valores de fábrica (os mesmos da primeira vigência)."}
      </p>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mt-rotulo mb-2 block">TAXA ESTIMADA POR PERFIL (% AO MÊS)</legend>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-mt-neutral-800">
                Bom
                <input className={campo} inputMode="decimal" value={taxaExcelenteAm} onChange={(e) => setTaxaExcelente(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-mt-neutral-800">
                Regular
                <input className={campo} inputMode="decimal" value={taxaRegularAm} onChange={(e) => setTaxaRegular(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-mt-neutral-800">
                De risco
                <input className={campo} inputMode="decimal" value={taxaRiscoAm} onChange={(e) => setTaxaRisco(e.target.value)} />
              </label>
            </div>
            <p className={dica}>
              O perfil sai da conta do simulador: ocupação, entrada e idade do carro. Vírgula ou ponto, tanto faz:
              1,95.
            </p>
          </fieldset>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="mt-rotulo">ANO DE REFERÊNCIA</span>
              <input className={campo} inputMode="numeric" value={anoDeReferencia} onChange={(e) => setAnoDeReferencia(e.target.value)} />
              <span className={dica}>A idade do carro conta a partir deste ano. Mude junto com as taxas.</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="mt-rotulo">ANO MAIS ANTIGO FINANCIADO</span>
              <input className={campo} inputMode="numeric" value={anoMaisAntigo} onChange={(e) => setAnoMaisAntigo(e.target.value)} />
              <span className={dica}>Carro de ano anterior aparece sem estimativa de parcela.</span>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="mt-rotulo">BANCOS PARCEIROS</span>
            <textarea className={`${campo} resize-y leading-relaxed`} rows={6} value={bancos} onChange={(e) => setBancos(e.target.value)} />
            <span className={dica}>Um por linha. Vão no aviso de crédito, ao lado de toda parcela, com &ldquo;entre outros&rdquo;.</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="mt-rotulo">FONTE DAS TAXAS</span>
            <input className={campo} value={fonteDasTaxas} onChange={(e) => setFonte(e.target.value)} />
            <span className={dica}>Aparece na tela: &ldquo;Parcela estimada pela …&rdquo;.</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="mt-rotulo">NOTA DA MUDANÇA (OPCIONAL)</span>
            <textarea
              className={`${campo} resize-y leading-relaxed`}
              rows={2}
              value={descricao}
              placeholder="Por que as condições mudaram — fica no histórico."
              onChange={(e) => setDescricao(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <div className="border border-mt-regua-fina bg-mt-surface p-5">
            <div className="mt-rotulo">COMO FICA NO SITE</div>
            {exemplo ? (
              <>
                <p className="m-0 mt-3 text-[12px] text-mt-neutral-700">
                  Carro de R$ 60.000, ano {exemplo.ano}, entrada de R$ 20.000, CLT:
                </p>
                <p className="m-0 mt-1 text-[22px] font-extrabold tracking-[-.02em] text-mt-accent">
                  {exemplo.texto.parcela}
                </p>
                <p className="m-0 mt-1 text-[11px] leading-relaxed text-mt-neutral-700">{exemplo.texto.detalhe}</p>
                {exemplo.texto.cautela && (
                  <p className="m-0 mt-1 text-[11px] leading-relaxed text-mt-neutral-700">{exemplo.texto.cautela}</p>
                )}
                <p className="m-0 mt-3 text-[11px] leading-relaxed text-mt-neutral-700">
                  Parcela estimada pela {exemplo.parametros.fonteDasTaxas}, com IOF.{" "}
                  {avisoDeCredito(exemplo.parametros.bancosParceiros)}
                </p>
                <p className="m-0 mt-3 border-t border-mt-regua-fina pt-3 text-[11px] leading-relaxed text-mt-neutral-700">
                  Carro de {exemplo.parametros.anoMaisAntigo - 1}: {textoSemEstimativa(exemplo.parametros.anoMaisAntigo)}
                </p>
              </>
            ) : (
              <ul className="m-0 mt-3 list-disc pl-4 text-[12px] leading-relaxed text-mt-accent">
                {!validacao.ok && validacao.erros.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>

          {retorno && (
            <div
              role="status"
              className={
                retorno.tipo === "ok"
                  ? "border border-mt-regua-fina bg-mt-surface px-4 py-3 text-xs font-semibold text-mt-ink"
                  : "border border-mt-accent-300 bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent"
              }
            >
              {retorno.texto}
              {retorno.problemas && retorno.problemas.length > 0 && (
                <ul className="m-0 mt-2 list-disc pl-4">
                  {retorno.problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={salvar}
            disabled={salvando || semTabela}
            className="mt-btn mt-btn-primario mt-foco self-start disabled:cursor-not-allowed disabled:opacity-50"
          >
            {salvando ? "SALVANDO…" : "SALVAR NOVA VIGÊNCIA"}
          </button>
        </div>
      </div>

      {historico.tabela && historico.vigencias.length > 0 && (
        <div className="mt-4">
          <div className="mt-rotulo mb-2">HISTÓRICO</div>
          <div className="overflow-x-auto border border-mt-regua-fina bg-mt-surface">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-mt-regua-fina text-[10px] uppercase tracking-[.12em] text-mt-neutral-700">
                  <th className="px-3 py-2 font-semibold">Vigência</th>
                  <th className="px-3 py-2 font-semibold">Bom · regular · risco</th>
                  <th className="px-3 py-2 font-semibold">Ano ref. · mais antigo</th>
                  <th className="px-3 py-2 font-semibold">Bancos</th>
                  <th className="px-3 py-2 font-semibold">Quem · nota</th>
                </tr>
              </thead>
              <tbody>
                {historico.vigencias.map((v) => (
                  <tr key={v.id} className="border-b border-mt-regua-fina align-top last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {dataCurta(v.parametros.vigenciaDesde)} → {v.vigenciaAte ? dataCurta(v.vigenciaAte) : <strong>vigente</strong>}
                    </td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      {[v.parametros.taxas.excelente, v.parametros.taxas.regular, v.parametros.taxas.risco]
                        .map((t) => `${(t * 100).toFixed(2).replace(".", ",")}%`)
                        .join(" · ")}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {v.parametros.anoDeReferencia} · {v.parametros.anoMaisAntigo}
                    </td>
                    <td className="px-3 py-2">{v.parametros.bancosParceiros.join(", ")}</td>
                    <td className="px-3 py-2">
                      {v.autor ?? "—"}
                      {v.descricao && <div className="mt-1 text-mt-neutral-700">{v.descricao}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** "28/09/2026" a partir de "2026-09-28" — sem fuso: é uma data, não um instante. */
function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

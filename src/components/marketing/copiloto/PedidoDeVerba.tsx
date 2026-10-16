"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TETO_DO_PEDIDO_DE_VERBA, descreverAcao } from "../../../lib/copilotoDeMidia";
import type { CampanhaParaPedido } from "../../../lib/copilotoDeMidia-servidor";
import { useConfirm } from "../../admin/ConfirmDialog";
import { quando, reais } from "./formato";

/**
 * Pedir mudança de verba (16/10/2026, pedido do dono: "aumentos pelo
 * copiloto").
 *
 * O diagnóstico só corta verba: aumento é decisão de quem paga, e é aqui que
 * ela é pedida. O pedido nasce proposta, aparece em "Para decidir" e passa
 * pela mesma aprovação; o script aplica na rodada seguinte e lê de volta. A
 * verba de agora é a que a sincronização gravou — o banco a lê de novo na hora
 * de gravar o pedido, e o script confere a da conta antes de mexer.
 */

/**
 * O Google cobra no mês até a verba diária × 30,4 (a média de dias do mês). É
 * a régua dele, e é ela que diz quanto um real a mais por dia pesa no mês.
 */
const DIAS_DO_MES_NO_GOOGLE = 30.4;

const centavos = (n: number) => Math.round(n * 100);

export default function PedidoDeVerba({ campanhas }: { campanhas: CampanhaParaPedido[] }) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [campanhaId, setCampanhaId] = useState(campanhas[0]?.id ?? "");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (campanhas.length === 0) return null;

  const campanha = campanhas.find((c) => c.id === campanhaId) ?? null;
  const nova = Number(valor.replace(",", "."));
  const digitou = valor.trim() !== "" && Number.isFinite(nova) && nova > 0;
  const problema =
    !campanha || !digitou
      ? null
      : centavos(nova) === centavos(campanha.verba)
        ? "Essa já é a verba da campanha."
        : nova > campanha.verba * TETO_DO_PEDIDO_DE_VERBA
          ? `O pedido vai até ${TETO_DO_PEDIDO_DE_VERBA}× a verba de agora (${reais(campanha.verba * TETO_DO_PEDIDO_DE_VERBA)} por dia).`
          : null;
  const diferenca = campanha && digitou ? centavos(nova) / 100 - campanha.verba : 0;
  const sinal = diferenca >= 0 ? "+" : "−";

  const pedir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campanha || !digitou || problema) return;
    const verbaNova = centavos(nova) / 100;
    const descricao = descreverAcao({ tipo: "mudar_verba", campanhaNome: campanha.nome, verbaAtual: campanha.verba, verbaNova });
    const ok = await confirm({
      title: "Pedir mudança de verba",
      message: `${descricao} (${sinal}${reais(Math.abs(diferenca) * DIAS_DO_MES_NO_GOOGLE)} por mês). O pedido entra em “Para decidir” e só vai para a conta depois de aprovado.`,
      confirmLabel: "Pedir",
    });
    if (!ok) return;
    setEnviando(true);
    setAviso(null);
    setErro(null);
    try {
      const res = await fetch("/api/marketing/copiloto/verba", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campanhaId: campanha.id, verbaNova, motivo: motivo.trim() || null }),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErro(r.error || "O pedido não foi gravado.");
        return;
      }
      setAviso("Pedido gravado. Aprove em “Para decidir” e o script aplica na próxima rodada.");
      setValor("");
      setMotivo("");
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor. Nada foi pedido.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={(e) => void pedir(e)} className="mt-cartao flex flex-col gap-4" data-pedido-de-verba>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-sm font-extrabold text-mt-ink">Pedir mudança de verba</h3>
        <span className="text-xs leading-relaxed text-mt-neutral-800">
          O diagnóstico só propõe corte. Aumento é decisão de quem paga e se pede aqui: o pedido passa pela mesma aprovação, e o script
          aplica na rodada seguinte e lê de volta.
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-mt-ink">Campanha</span>
          <select
            name="campanhaId"
            value={campanhaId}
            onChange={(e) => setCampanhaId(e.target.value)}
            className="mt-campo-caixa mt-foco"
          >
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} — {reais(c.verba)} por dia{c.situacao === "pausada" ? " (pausada)" : ""}
              </option>
            ))}
          </select>
          {campanha?.sincronizadoEm && (
            <span className="text-[11px] text-mt-neutral-700">Verba lida da conta em {quando(campanha.sincronizadoEm)}.</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-mt-ink">Nova verba por dia (R$)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            name="verbaNova"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="mt-campo-caixa mt-foco tabular-nums"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold text-mt-ink">Motivo (opcional)</span>
        <input
          type="text"
          name="motivo"
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="mt-campo-caixa mt-foco"
          placeholder="Vai para a proposta e para a trilha"
        />
      </label>
      {campanha && digitou && !problema && (
        <p className="m-0 text-xs tabular-nums text-mt-ink" data-impacto>
          {reais(campanha.verba)} → {reais(centavos(nova) / 100)} por dia: {sinal}
          {reais(Math.abs(diferenca))} por dia, até {sinal}
          {reais(Math.abs(diferenca) * DIAS_DO_MES_NO_GOOGLE)} por mês.
        </p>
      )}
      {(problema || aviso || erro) && (
        <p
          role={problema || erro ? "alert" : "status"}
          className="m-0 border-l-[3px] bg-mt-surface px-4 py-3 text-xs leading-relaxed text-mt-ink"
          style={{ borderColor: problema || erro ? "var(--cp-impeditivo)" : "var(--cp-ok)" }}
        >
          {problema ?? erro ?? aviso}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando || !digitou || problema !== null}
        className="mt-btn mt-btn-primario mt-foco cursor-pointer self-start px-4 py-2 text-[10px]"
        data-pedir-verba
      >
        {enviando ? "…" : "Pedir"}
      </button>
    </form>
  );
}

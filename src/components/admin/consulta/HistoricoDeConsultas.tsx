"use client";

import { useEffect, useRef, useState } from "react";
import {
  FILTROS_DO_HISTORICO,
  MIGRACAO_DO_REGISTRO_DE_MODELOS,
  ROTULO_DO_TIPO,
  type FiltroDoHistorico,
  type ItemDoHistorico,
  type LeituraDoHistorico,
} from "../../../lib/historicoDeConsultas";
import SinalDeEstado, { COR_DO_ESTADO } from "./SinalDeEstado";

/**
 * A aba "Histórico" de `/admin/consulta-veiculos` (dono, 08/10/2026): todas as
 * consultas da equipe — FIPE grátis, Por modelo e Por placa — numa lista com
 * pesquisa. Abrir um item não chama nenhum fornecedor: o modelo abre do que
 * está guardado, a placa da consulta guardada. Trazer os meses mais novos é o
 * "Atualizar dados" da aba que abrir.
 *
 * A pesquisa vai ao banco (`GET /api/consulta-placa/historico`), para achar
 * também o que não está entre os 40 mais recentes.
 */

const ROTULO_DO_FILTRO: Record<FiltroDoHistorico, string> = {
  todas: "Todas",
  fipe: "FIPE · grátis",
  modelo: "Por modelo",
  placa: "Por placa",
};

const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
};
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function custoNaTela(i: ItemDoHistorico): string {
  if (i.homologacao) return "teste";
  if (i.custo === null) return i.tipo === "fipe" ? "grátis" : "—";
  return i.custo === 0 ? "grátis" : reais(i.custo);
}

export default function HistoricoDeConsultas({ inicial, aoAbrir }: { inicial: LeituraDoHistorico; aoAbrir: (item: ItemDoHistorico) => void }) {
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState<FiltroDoHistorico>("todas");
  const [daPesquisa, setDaPesquisa] = useState<LeituraDoHistorico | null>(null);
  const [carregando, setCarregando] = useState(false);
  const pedido = useRef(0);
  // Sem pesquisa, a lista é a do servidor (que se renova depois de cada consulta nova).
  const semPesquisa = termo.trim() === "" && filtro === "todas";
  const leitura = semPesquisa ? inicial : (daPesquisa ?? inicial);

  // Com pesquisa ou filtro, o banco responde; a última resposta pedida é a que vale.
  useEffect(() => {
    if (semPesquisa) return;
    const meu = ++pedido.current;
    const relogio = setTimeout(async () => {
      setCarregando(true);
      try {
        const res = await fetch(`/api/consulta-placa/historico?${new URLSearchParams({ q: termo.trim(), tipo: filtro })}`);
        const json = (await res.json().catch(() => ({}))) as LeituraDoHistorico & { error?: string };
        if (meu !== pedido.current) return;
        setDaPesquisa(res.ok && json.ok ? json : { ok: false, motivo: json.error || "A pesquisa não voltou." });
      } catch {
        if (meu === pedido.current) setDaPesquisa({ ok: false, motivo: "Sem conexão com o servidor." });
      } finally {
        if (meu === pedido.current) setCarregando(false);
      }
    }, 300);
    return () => clearTimeout(relogio);
  }, [termo, filtro, semPesquisa]);

  const rotulo = "mt-rotulo";
  const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";

  return (
    <div className="mt-consulta flex w-full flex-col gap-4">
      <div className="nao-imprimir flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className={rotulo}>PESQUISAR</span>
          <input
            type="search"
            className="mt-campo-caixa mt-foco w-full"
            placeholder="Modelo, marca ou placa"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            data-pesquisa-do-historico
          />
        </label>
        <div role="radiogroup" aria-label="Tipo de consulta" className="mt-seg flex-wrap">
          {FILTROS_DO_HISTORICO.map((f) => (
            <label key={f} className="mt-seg-opt">
              <input type="radio" name="filtro-do-historico" value={f} checked={filtro === f} onChange={() => setFiltro(f)} />
              {ROTULO_DO_FILTRO[f]}
            </label>
          ))}
        </div>
      </div>
      <p className={dica}>Abrir uma consulta do histórico não faz nenhuma consulta nova e não custa nada. Para trazer os meses mais novos, use “Atualizar dados” depois de abrir.</p>

      {!leitura.ok && (
        <div role="alert" className="flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs text-mt-ink" style={{ borderColor: COR_DO_ESTADO.impeditivo }}>
          <SinalDeEstado estado="impeditivo" />
          <span>{leitura.motivo}</span>
        </div>
      )}
      {leitura.ok && leitura.semRegistroDeModelo && (
        <p className={dica} data-sem-registro>
          O registro das consultas de modelo ainda não existe no banco (migração <code className="font-mono">{MIGRACAO_DO_REGISTRO_DE_MODELOS}</code>): os
          modelos aparecem pelo que está guardado, sem quem consultou nem custo.
        </p>
      )}

      {leitura.ok && leitura.itens.length === 0 && (
        <p className="m-0 text-sm text-mt-neutral-800" data-historico-vazio>
          {termo.trim() || filtro !== "todas" ? "Nenhuma consulta com esse filtro." : "Nenhuma consulta feita ainda."}
        </p>
      )}

      {leitura.ok && leitura.itens.length > 0 && (
        <div className="overflow-x-auto" aria-busy={carregando}>
          <table className="mt-tabela text-xs" data-historico>
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Consulta</th>
                <th scope="col">Tipo</th>
                <th scope="col">Resultado</th>
                <th scope="col" className="mt-num">Custo</th>
                <th scope="col">Quem</th>
                <th scope="col" className="nao-imprimir">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {leitura.itens.map((i) => (
                <tr key={i.chave} data-item-do-historico={i.tipo}>
                  <td className="whitespace-nowrap tabular-nums">{quando(i.quando)}</td>
                  <td className={i.tipo === "placa" ? "font-mono font-extrabold tracking-wider" : "font-extrabold"}>{i.titulo}</td>
                  <td className="whitespace-nowrap">{ROTULO_DO_TIPO[i.tipo]}</td>
                  <td>{i.detalhe ?? "—"}</td>
                  <td className="mt-num whitespace-nowrap">{custoNaTela(i)}</td>
                  <td>{i.quem ?? "—"}</td>
                  <td className="nao-imprimir">
                    <button type="button" className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[11px]" onClick={() => aoAbrir(i)}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

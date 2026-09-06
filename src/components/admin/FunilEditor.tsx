"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  chaveDaEtapa,
  emMinutos,
  formatarPrazo,
  ordenarEtapas,
  separarPrazo,
  validarFunil,
  type EscopoDeMotivo,
  type EtapaDoFunil,
  type MotivoDoFunil,
  type TipoDeDesfecho,
  type UnidadeDePrazo,
} from "../../lib/funil";

/**
 * Configurar o funil — etapas, prazos e motivos.
 *
 * 2026-08-28: *"temos que ser capazes de editar o funil de vendas de acordo
 * com a necessidade"*.
 *
 * ---------------------------------------------------------------------------
 * A decisão de interface que define esta tela: ela SE EXPLICA
 * ---------------------------------------------------------------------------
 * O pedido do dono terminava com *"sem inchar as ferramentas... com uma curva
 * de adoção mais amigável"*. Uma tabela com as colunas "estagnação (min)" e
 * "transferência (min)" atenderia o requisito e não seria usada: quem abre
 * essa tela uma vez por trimestre não guarda o que cada coluna faz, preenche
 * qualquer número e descobre o efeito quando um lead sai da mão de alguém.
 *
 * Por isso cada linha escreve de volta, em português, a regra que ela acabou
 * de criar: *"cobra o vendedor depois de 2 dias parado e passa para outro
 * depois de 5 dias"*. A frase muda enquanto se digita. É a diferença entre
 * configurar um sistema e dizer o que a loja faz.
 *
 * Prazo em valor + unidade pelo mesmo motivo: o banco guarda minutos porque
 * 15 minutos não cabe em horas, mas ninguém escreve "7200" quando quer dizer
 * "5 dias".
 */

interface EtapaEditavel extends EtapaDoFunil {
  /** Só existe na tela: linha ainda não gravada pode ser removida de vez. */
  nova?: boolean;
  alertaValor: number | null;
  alertaUnidade: UnidadeDePrazo;
  transfValor: number | null;
  transfUnidade: UnidadeDePrazo;
}

function paraEdicao(e: EtapaDoFunil, nova = false): EtapaEditavel {
  const a = separarPrazo(e.estagnacao_minutos);
  const t = separarPrazo(e.transferencia_minutos);
  return {
    ...e,
    nova,
    alertaValor: a.valor,
    alertaUnidade: a.unidade,
    transfValor: t.valor,
    transfUnidade: t.unidade,
  };
}

/**
 * Campo a campo, e não `...resto`: a linha da tela carrega quatro campos que
 * só existem aqui (valor e unidade de cada prazo) e um marcador de "ainda não
 * gravada". Espalhar o objeto mandaria os cinco para o banco, e o PostgREST
 * recusaria a gravação inteira por causa de uma coluna que não existe.
 */
function paraBanco(e: EtapaEditavel): EtapaDoFunil {
  return {
    chave: e.chave,
    rotulo: e.rotulo,
    ordem: e.ordem,
    tipo: e.tipo,
    protegida: e.protegida,
    ativa: e.ativa,
    cor: e.cor ?? null,
    estagnacao_minutos: emMinutos(e.alertaValor, e.alertaUnidade),
    transferencia_minutos: emMinutos(e.transfValor, e.transfUnidade),
  };
}

/** A regra da linha, escrita como alguém contaria para o time. */
function comoFunciona(e: EtapaEditavel): string {
  const alerta = emMinutos(e.alertaValor, e.alertaUnidade);
  const transf = emMinutos(e.transfValor, e.transfUnidade);

  // Ganho e perdido deixaram de ser coluna em 2026-08-28 (*"não precisa de uma
  // aba de ganho ou perdido, só um botão para destinar"*). Dizer isso aqui
  // evita a pergunta óbvia de quem edita: "por que essa etapa não aparece no
  // quadro?"
  if (e.tipo === "ganho") {
    return "É o botão de fechar do card, não uma coluna do quadro. Pede o motivo e para o relógio.";
  }
  if (e.tipo === "perdido") {
    return "É o botão de perder do card, não uma coluna do quadro. Pede o motivo e para o relógio.";
  }
  if (e.tipo === "descartado") {
    return (
      "É o botão de descarte do card — spam, teste, contato equivocado. Pede o motivo, " +
      "para o relógio e fica FORA da taxa de conversão: não conta como ganho nem como perda."
    );
  }
  if (!alerta) return "Sem régua de tempo: nada é cobrado nesta etapa.";

  const cobra = `Cobra o vendedor no WhatsApp depois de ${formatarPrazo(alerta)} parado`;
  if (e.protegida) return `${cobra}, e nunca passa o lead para outro — etapa protegida.`;
  if (!transf) return `${cobra}. Não transfere sozinho.`;
  return `${cobra}, e passa para outro vendedor depois de ${formatarPrazo(transf)}.`;
}

export default function FunilEditor() {
  const [etapas, setEtapas] = useState<EtapaEditavel[]>([]);
  const [motivos, setMotivos] = useState<MotivoDoFunil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [podeEditar, setPodeEditar] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/funil/config");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Falha ao carregar o funil");
      if (d.migracaoPendente) {
        setMigracaoPendente(true);
        return;
      }
      setEtapas(ordenarEtapas(d.etapas ?? []).map((e: EtapaDoFunil) => paraEdicao(e)));
      setMotivos(d.motivos ?? []);
      setPodeEditar(Boolean(d.podeEditar));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterar = (chave: string, campos: Partial<EtapaEditavel>) =>
    setEtapas((atual) => atual.map((e) => (e.chave === chave ? { ...e, ...campos } : e)));

  const mover = (i: number, direcao: -1 | 1) =>
    setEtapas((atual) => {
      const destino = i + direcao;
      if (destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[destino]] = [copia[destino], copia[i]];
      return copia.map((e, n) => ({ ...e, ordem: n + 1 }));
    });

  const acrescentar = () => {
    const base = "Nova etapa";
    let rotulo = base;
    let n = 2;
    while (etapas.some((e) => e.rotulo === rotulo)) rotulo = `${base} ${n++}`;
    // A chave nasce do rótulo e nunca mais muda — é o que `leads.situacao`
    // grava. Renomear a etapa depois é seguro; a chave fica.
    const chave = `${chaveDaEtapa(rotulo)}_${Date.now().toString(36).slice(-4)}`;
    setEtapas((atual) => {
      // Entra ANTES das etapas terminais: ganho e perdido são o fim do funil,
      // e uma etapa nova depois delas nunca receberia card nenhum.
      const i = atual.findIndex((e) => e.tipo !== "aberta");
      const nova = paraEdicao(
        {
          chave,
          rotulo,
          ordem: 0,
          tipo: "aberta",
          estagnacao_minutos: 1440,
          transferencia_minutos: null,
          protegida: false,
          ativa: true,
          cor: null,
        },
        true,
      );
      const copia = [...atual];
      copia.splice(i < 0 ? copia.length : i, 0, nova);
      return copia.map((e, n2) => ({ ...e, ordem: n2 + 1 }));
    });
  };

  const problemas = useMemo(() => validarFunil(etapas.map(paraBanco)), [etapas]);

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/funil/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapas: etapas.map(paraBanco), motivos }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Falha ao salvar");
      setEtapas(ordenarEtapas(d.etapas ?? []).map((e: EtapaDoFunil) => paraEdicao(e)));
      setMotivos(d.motivos ?? []);
      setAviso("Funil salvo. O kanban já usa a nova régua.");
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const alterarMotivo = (chave: string, campos: Partial<MotivoDoFunil>) =>
    setMotivos((atual) => atual.map((m) => (m.chave === chave ? { ...m, ...campos } : m)));

  const acrescentarMotivo = (tipo: TipoDeDesfecho) =>
    setMotivos((atual) => [
      ...atual,
      {
        chave: `motivo_${Date.now().toString(36)}`,
        rotulo: "",
        tipo,
        ordem: atual.filter((m) => m.tipo === tipo).length + 1,
        ativo: true,
        escopo: "ambos",
      },
    ]);

  if (carregando) {
    return <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando o funil…</div>;
  }

  if (migracaoPendente) {
    return (
      <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
        <div className="text-[15px] font-extrabold tracking-[-.01em]">
          O funil editável ainda não existe no banco
        </div>
        <p className="mx-auto mt-2 max-w-[520px] text-xs leading-relaxed text-mt-neutral-700">
          Aplique a migração{" "}
          <code className="text-mt-ink">20260828120000_funil_de_vendas.sql</code> com{" "}
          <code className="text-mt-ink">supabase db push</code>. Até lá o kanban segue com as sete
          etapas fixas de sempre.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Leads</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Configurar funil</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            As etapas do kanban, quanto tempo um lead pode ficar parado em cada uma e por que a
            loja ganha ou perde um negócio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/leads"
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Voltar ao kanban
          </Link>
          <button
            onClick={salvar}
            disabled={salvando || problemas.length > 0 || !podeEditar}
            className="mt-btn mt-foco cursor-pointer bg-mt-ink px-4 py-2.5 text-[11px] text-mt-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Salvar funil"}
          </button>
        </div>
      </div>

      {!podeEditar && (
        <div className="border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          Você está vendo a régua do funil, mas quem a altera é o Administrador ou o Gestor — ela
          vale para a equipe inteira.
        </div>
      )}
      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          {aviso}
        </div>
      )}
      {problemas.length > 0 && (
        <ul className="flex flex-col gap-1 border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {/* ── etapas ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between border-b border-mt-regua-fina pb-2">
          <h2 className="mt-rotulo">Etapas do funil</h2>
          <button
            onClick={acrescentar}
            disabled={!podeEditar}
            className="mt-foco cursor-pointer text-[11px] text-mt-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            + etapa
          </button>
        </div>

        {etapas.map((e, i) => (
          <div
            key={e.chave}
            className={`flex flex-col gap-3 border p-4 ${
              e.ativa ? "border-mt-regua-fina bg-mt-surface" : "border-dashed border-mt-regua-fina bg-mt-bg"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-col">
                <button
                  onClick={() => mover(i, -1)}
                  disabled={i === 0 || !podeEditar}
                  aria-label={`Subir ${e.rotulo}`}
                  className="mt-foco cursor-pointer px-1 text-[10px] text-mt-neutral-600 hover:text-mt-accent disabled:opacity-20"
                >
                  ▲
                </button>
                <button
                  onClick={() => mover(i, 1)}
                  disabled={i === etapas.length - 1 || !podeEditar}
                  aria-label={`Descer ${e.rotulo}`}
                  className="mt-foco cursor-pointer px-1 text-[10px] text-mt-neutral-600 hover:text-mt-accent disabled:opacity-20"
                >
                  ▼
                </button>
              </div>

              <input
                value={e.rotulo}
                onChange={(ev) => alterar(e.chave, { rotulo: ev.target.value })}
                disabled={!podeEditar}
                aria-label={`Nome da etapa ${i + 1}`}
                className="mt-foco min-w-[160px] flex-1 border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[13px] font-extrabold text-mt-ink"
              />

              <select
                value={e.tipo}
                onChange={(ev) => alterar(e.chave, { tipo: ev.target.value as EtapaDoFunil["tipo"] })}
                disabled={!podeEditar}
                aria-label={`Tipo da etapa ${e.rotulo}`}
                className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[11px] text-mt-ink"
              >
                <option value="aberta">Em andamento</option>
                <option value="ganho">Ganho</option>
                <option value="perdido">Perdido</option>
                <option value="descartado">Não é oportunidade</option>
              </select>

              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-mt-neutral-700">
                <input
                  type="checkbox"
                  checked={e.ativa}
                  onChange={(ev) => alterar(e.chave, { ativa: ev.target.checked })}
                  disabled={!podeEditar}
                  className="mt-foco cursor-pointer accent-mt-accent"
                />
                ativa
              </label>

              {e.nova && (
                <button
                  onClick={() => setEtapas((a) => a.filter((x) => x.chave !== e.chave))}
                  className="mt-foco cursor-pointer text-[11px] text-mt-accent hover:underline"
                >
                  remover
                </button>
              )}
            </div>

            {e.tipo === "aberta" && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-mt-regua-fina pt-3">
                <Prazo
                  rotulo="Avisar depois de"
                  valor={e.alertaValor}
                  unidade={e.alertaUnidade}
                  desabilitado={!podeEditar}
                  aoMudar={(valor, unidade) =>
                    alterar(e.chave, { alertaValor: valor, alertaUnidade: unidade })
                  }
                />
                <Prazo
                  rotulo="Transferir depois de"
                  valor={e.transfValor}
                  unidade={e.transfUnidade}
                  desabilitado={!podeEditar || e.protegida}
                  aoMudar={(valor, unidade) =>
                    alterar(e.chave, { transfValor: valor, transfUnidade: unidade })
                  }
                />
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-mt-neutral-700">
                  <input
                    type="checkbox"
                    checked={e.protegida}
                    onChange={(ev) => alterar(e.chave, { protegida: ev.target.checked })}
                    disabled={!podeEditar}
                    className="mt-foco cursor-pointer accent-mt-accent"
                  />
                  nunca transferir
                </label>
              </div>
            )}

            {/* A regra desta linha, dita em português. Muda enquanto se digita. */}
            <p className="border-l-2 border-mt-regua bg-mt-bg px-3 py-2 text-[11px] leading-relaxed text-mt-neutral-800">
              {comoFunciona(e)}
            </p>
          </div>
        ))}

        <p className="text-[11px] leading-relaxed text-mt-neutral-700">
          Só as etapas <strong>em andamento</strong> viram coluna do quadro. Ganho, perdido e
          &ldquo;não é oportunidade&rdquo; são os botões no rodapé do card — o negócio fechado sai do quadro e vai para a lista de
          fechados, com motivo, observação e caminho de volta.
          <br />
          Etapa desmarcada some do kanban, mas continua aparecendo enquanto tiver lead dentro —
          nenhum card desaparece sem alguém tirá-lo de lá. Etapas nunca são apagadas: o histórico
          dos leads antigos aponta para elas.
        </p>
      </section>

      {/* ── motivos ────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="border-b border-mt-regua-fina pb-2">
          <h2 className="mt-rotulo">Motivos de ganho e de perda</h2>
        </div>
        <p className="max-w-[620px] text-[11px] leading-relaxed text-mt-neutral-700">
          São eles que o relatório agrupa. Lista curta funciona melhor que lista completa: motivo
          que ninguém escolhe vira ruído, e motivo demais faz o vendedor clicar no primeiro.{" "}
          <strong>Para quem vale</strong> decide em qual caixa o motivo aparece: quem chegou
          querendo comprar um carro, quem chegou querendo vender o dele, ou os dois.
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {(["perdido", "ganho", "descartado"] as TipoDeDesfecho[]).map((tipo) => (
            <div key={tipo} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <div className="text-[11px] font-extrabold uppercase tracking-[.1em]">
                  {tipo === "ganho"
                    ? "Ganhou porque"
                    : tipo === "descartado"
                      ? "Descartou porque"
                      : "Perdeu porque"}
                </div>
                <button
                  onClick={() => acrescentarMotivo(tipo)}
                  disabled={!podeEditar}
                  className="mt-foco cursor-pointer text-[11px] text-mt-accent hover:underline disabled:opacity-40"
                >
                  + motivo
                </button>
              </div>
              {motivos
                .filter((m) => m.tipo === tipo)
                .map((m) => (
                  <div key={m.chave} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.ativo}
                      onChange={(ev) => alterarMotivo(m.chave, { ativo: ev.target.checked })}
                      disabled={!podeEditar}
                      aria-label={`Motivo ativo: ${m.rotulo}`}
                      className="mt-foco cursor-pointer accent-mt-accent"
                    />
                    <input
                      value={m.rotulo}
                      onChange={(ev) => alterarMotivo(m.chave, { rotulo: ev.target.value })}
                      disabled={!podeEditar}
                      placeholder="Descreva o motivo"
                      aria-label={`Nome do motivo ${m.chave}`}
                      className={`mt-foco w-full border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[12px] ${
                        m.ativo ? "text-mt-ink" : "text-mt-neutral-500 line-through"
                      }`}
                    />
                    {tipo === "perdido" && (
                      <select
                        value={m.escopo ?? "ambos"}
                        onChange={(ev) =>
                          alterarMotivo(m.chave, {
                            escopo: ev.target.value as EscopoDeMotivo,
                          })
                        }
                        disabled={!podeEditar}
                        aria-label={`Para quem vale o motivo ${m.rotulo}`}
                        className="mt-foco w-[132px] shrink-0 cursor-pointer border border-mt-regua-fina bg-mt-bg px-1.5 py-1.5 text-[11px] text-mt-neutral-800"
                      >
                        <option value="compra">Quem quer comprar</option>
                        <option value="avaliacao">Quem quer vender</option>
                        <option value="ambos">Os dois</option>
                      </select>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Valor + unidade. O par que evita alguém digitar 7200 querendo dizer 5 dias. */
function Prazo({
  rotulo,
  valor,
  unidade,
  desabilitado,
  aoMudar,
}: {
  rotulo: string;
  valor: number | null;
  unidade: UnidadeDePrazo;
  desabilitado?: boolean;
  aoMudar: (valor: number | null, unidade: UnidadeDePrazo) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-mt-neutral-700">
      <span className="uppercase tracking-[.08em]">{rotulo}</span>
      <input
        type="number"
        min={1}
        value={valor ?? ""}
        placeholder="—"
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.value === "" ? null : Number(e.target.value), unidade)}
        aria-label={rotulo}
        className="mt-foco w-16 border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[12px] text-mt-ink tabular-nums disabled:opacity-40"
      />
      <select
        value={unidade}
        disabled={desabilitado}
        onChange={(e) => aoMudar(valor, e.target.value as UnidadeDePrazo)}
        aria-label={`Unidade de ${rotulo}`}
        className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-1.5 py-1.5 text-[11px] text-mt-ink disabled:opacity-40"
      >
        <option value="minutos">min</option>
        <option value="horas">horas</option>
        <option value="dias">dias</option>
      </select>
    </label>
  );
}

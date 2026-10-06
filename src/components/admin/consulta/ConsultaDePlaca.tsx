"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "../ConfirmDialog";
import {
  ROTULO_CONSERVACAO,
  ROTULO_MECANICA,
  recomendarAvaliacao,
  type EstadoConservacao,
  type EstadoMecanico,
  type ParametrosDaCurva,
} from "../../../lib/avaliacaoRecomendacao";
import { formatarCnpj } from "../../../lib/cnpj";
import {
  leituraAcimaDoHodometro,
  normalizarPlaca,
  quadroDeChecagens,
  qualificarCompra,
  serieDoGrafico,
  tendenciaDaFipe,
  type EstadoDaChecagem,
  type NivelDaQualificacao,
} from "../../../lib/consultaDePlaca";
import type { ConsultaGuardada, LeituraDasRecentes } from "../../../lib/consultaDePlaca-servidor";
import GraficoDaFipe from "./GraficoDaFipe";
import SinalDeEstado, { COR_DO_ESTADO, ROTULO_DO_ESTADO } from "./SinalDeEstado";

/**
 * `/admin/consulta-placa` — o retrato de um carro pela placa.
 *
 * Quem abre: Administrador, Gestor e Comercial (matriz, "Consultar placa de
 * veículo (consulta paga)"). Quando: o carro foi oferecido à loja, para compra
 * ou na troca, e ainda não é estoque. Que decisão sai: **seguir para a
 * vistoria, comprar com ressalva ou recusar** — e por quanto.
 *
 * A tela responde de longe antes de responder por escrito: a faixa do topo e
 * o quadro de checagens usam forma e cor (`SinalDeEstado`), e o texto vem
 * junto. O veredito é o da CONSULTA, e a faixa diz isso: vistoria e perícia
 * continuam valendo.
 *
 * A faixa de compra é a curva de deságio vigente (`parametros_avaliacao`), a
 * mesma conta de `/api/avaliacao`, recalculada ao vivo com o km e o estado
 * que o avaliador informa. Nenhum percentual mora aqui.
 */

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const centavos = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const km = (n: number) => `${n.toLocaleString("pt-BR")} km`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pp = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function dataCurta(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** "há 3 dias", para a consulta guardada dizer a idade que tem. */
function haQuanto(iso: string, agora: number): string {
  const dias = Math.floor((agora - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 60) return `há ${dias} dias`;
  return `há ${Math.floor(dias / 30)} meses`;
}

const ESTADO_DO_NIVEL: Record<NivelDaQualificacao, EstadoDaChecagem> = {
  nao_comprar: "impeditivo",
  ressalvas: "atencao",
  apto: "ok",
};

const TITULO_DO_NIVEL: Record<NivelDaQualificacao, string> = {
  nao_comprar: "Com impeditivo",
  ressalvas: "Com ressalvas",
  apto: "Sem impedimento",
};

const MECANICA: EstadoMecanico[] = ["excelente", "bom", "atencao", "ruim"];
const CONSERVACAO: EstadoConservacao[] = ["impecavel", "riscos", "reparos", "avariado"];
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

type Retorno = { tipo: "erro" | "aviso"; texto: string } | null;

export default function ConsultaDePlaca({
  recentes,
  curva,
  temToken,
  homologacao,
}: {
  recentes: LeituraDasRecentes;
  /** A curva de deságio vigente, ou `null` se não deu para ler. */
  curva: ParametrosDaCurva | null;
  temToken: boolean;
  /** O servidor está no modo de teste do fornecedor. */
  homologacao: boolean;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [placa, setPlaca] = useState("");
  const [consulta, setConsulta] = useState<ConsultaGuardada | null>(null);
  const [veioGuardada, setVeioGuardada] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  // Um relógio só por montagem: a idade da consulta não precisa andar sozinha.
  const [agora] = useState(() => Date.now());

  const [kmInformado, setKmInformado] = useState("");
  const [mecanica, setMecanica] = useState<EstadoMecanico>("bom");
  const [conservacao, setConservacao] = useState<EstadoConservacao>("riscos");

  const pedir = async (corpo: { placa: string; soGuardada?: boolean; refazer?: boolean }) => {
    const res = await fetch("/api/consulta-placa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = (await res.json().catch(() => ({}))) as {
      consulta?: ConsultaGuardada | null;
      guardada?: boolean;
      saldo?: number | null;
      aviso?: string;
      error?: string;
    };
    return { ok: res.ok, json };
  };

  const mostrar = (c: ConsultaGuardada, guardada: boolean) => {
    setConsulta(c);
    setVeioGuardada(guardada);
    setPlaca(c.placa);
    setKmInformado("");
    setMecanica("bom");
    setConservacao("riscos");
  };

  /** Primeiro o que já está guardado, de graça; só depois, com confirmação, o fornecedor. */
  const consultar = async (valor: string, refazer = false) => {
    setRetorno(null);
    const normalizada = normalizarPlaca(valor);
    if (!normalizada) {
      setRetorno({ tipo: "erro", texto: "Placa inválida. Use o formato ABC1234 ou ABC1D23." });
      return;
    }
    setCarregando(true);
    try {
      if (!refazer) {
        const guardada = await pedir({ placa: normalizada, soGuardada: true });
        if (!guardada.ok) {
          setRetorno({ tipo: "erro", texto: guardada.json.error || "Não deu para ler as consultas guardadas." });
          return;
        }
        if (guardada.json.consulta) {
          mostrar(guardada.json.consulta, true);
          return;
        }
      }

      if (!temToken) {
        setRetorno({ tipo: "erro", texto: "Falta configurar APIBRASIL_TOKEN na Vercel para consultar placa nova." });
        return;
      }
      const ok = await confirm({
        title: refazer ? "Consultar de novo no fornecedor" : "Placa ainda não consultada",
        message: homologacao
          ? `O painel está em modo de teste: a APIBrasil responde com um carro de exemplo, sem cobrar, e não com o ${normalizada}.`
          : `A consulta de ${normalizada} é cobrada pela APIBrasil no saldo da loja. ` +
            (refazer ? "A consulta guardada continua no histórico." : "Depois de feita, reabrir a mesma placa não custa nada."),
        confirmLabel: homologacao ? "Consultar em teste" : "Consultar e pagar",
        cancelLabel: "Cancelar",
        type: "warning",
      });
      if (!ok) return;

      const nova = await pedir({ placa: normalizada, refazer: true });
      if (!nova.ok || !nova.json.consulta) {
        setRetorno({ tipo: "erro", texto: nova.json.error || "A consulta não voltou." });
        return;
      }
      mostrar(nova.json.consulta, false);
      setSaldo(typeof nova.json.saldo === "number" ? nova.json.saldo : null);
      if (nova.json.aviso) setRetorno({ tipo: "aviso", texto: nova.json.aviso });
      // A lista de recentes é do servidor.
      router.refresh();
    } catch {
      setRetorno({ tipo: "erro", texto: "Sem conexão com o servidor. Antes de tentar de novo, confira o saldo no painel da APIBrasil." });
    } finally {
      setCarregando(false);
    }
  };

  const retrato = consulta?.retrato ?? null;

  // ── A avaliação ao vivo ────────────────────────────────────────────────────
  const kmNumero = /^\d{1,7}$/.test(kmInformado.replace(/\D/g, "")) ? Number(kmInformado.replace(/\D/g, "")) : null;
  const fipeAtual = retrato?.fipe?.valorAtual ?? null;
  const recomendacao = useMemo(
    () =>
      retrato && fipeAtual !== null
        ? recomendarAvaliacao({
            estadoMecanico: mecanica,
            estadoConservacao: conservacao,
            quilometragem: kmNumero,
            anoModelo: retrato.veiculo.anoModelo,
            // `recomendarAvaliacao` lê a FIPE como texto com centavos.
            fipeValor: fipeAtual.toFixed(2),
            parametros: curva,
          })
        : null,
    [retrato, fipeAtual, mecanica, conservacao, kmNumero, curva],
  );
  const leituraAcima = retrato ? leituraAcimaDoHodometro(retrato.leiturasDeKm, kmNumero) : null;
  const qualificacao = retrato
    ? qualificarCompra(retrato, { acimaDoTeto: recomendacao?.acima_do_teto === true, leituraAcima })
    : null;
  const checagens = retrato ? quadroDeChecagens(retrato) : [];
  const tendencia = retrato?.fipe ? tendenciaDaFipe(retrato.fipe.historico) : null;
  const pontos = useMemo(
    () =>
      retrato?.fipe
        ? serieDoGrafico(
            retrato.fipe.historico,
            recomendacao && !recomendacao.acima_do_teto ? { min: recomendacao.desconto_min, max: recomendacao.desconto_max } : null,
          )
        : [],
    [retrato, recomendacao],
  );
  // O aviso do site sobre documento não se aplica aqui: esta tela conferiu.
  const sinais = (recomendacao?.sinais ?? []).filter((s) => !s.startsWith("documento e procedência"));

  const rotulo = "mt-rotulo";
  const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";
  const secao = "flex flex-col gap-4 border-t-2 border-mt-regua pt-5";

  return (
    <div className="mt-consulta flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1.5 border-b-2 border-mt-regua pb-5">
        <div className="mt-rotulo mt-rotulo-accent">Estoque</div>
        <h1 className="mt-titulo text-3xl md:text-4xl">Consulta de placa</h1>
        <p className="mt-1 max-w-[680px] text-sm text-mt-neutral-800">
          O retrato do carro oferecido à loja, para compra ou na troca: o que impede, o que pede atenção, para onde
          vai a FIPE e quanto a curva de deságio manda pagar. Placa nova é cobrada pelo fornecedor; placa já
          consultada reabre sem custo.
        </p>
      </div>

      {homologacao && (
        <div className="flex items-start gap-3 border border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          <SinalDeEstado estado="nao_conferido" />
          <span>
            <strong className="font-extrabold">Modo de teste.</strong> A APIBrasil responde com um carro de exemplo e não
            cobra. Nada do que aparecer numa consulta nova serve para decidir compra.
          </span>
        </div>
      )}
      {!recentes.ok && (
        <div className="border border-mt-accent-300 bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent">
          <strong className="font-extrabold">
            {recentes.faltaMigracao ? "A tabela das consultas ainda não existe no banco." : "Não deu para ler as consultas guardadas."}
          </strong>{" "}
          {recentes.faltaMigracao ? (
            <>
              Falta aplicar a migração <code className="font-mono">20261006180000_consultas_de_placa</code>. Até lá nada é
              consultado nem cobrado.
            </>
          ) : (
            <span className="text-mt-neutral-700">({recentes.motivo})</span>
          )}
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void consultar(placa);
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={rotulo}>PLACA</span>
          <input
            className="mt-campo-caixa mt-foco w-44 font-mono text-lg uppercase tracking-[0.2em]"
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))}
            placeholder="ABC1D23"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby="dica-da-placa"
          />
        </label>
        <button type="submit" disabled={carregando} className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-3 text-[11px]">
          {carregando ? "Consultando…" : "Consultar"}
        </button>
        <p id="dica-da-placa" className={`${dica} basis-full`}>
          Antiga ou Mercosul, sem traço. A tela procura primeiro no que já foi consultado e só pede confirmação antes de
          gastar.
        </p>
      </form>

      {retorno && (
        <div
          role="alert"
          className="flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs text-mt-ink"
          style={{ borderColor: COR_DO_ESTADO[retorno.tipo === "erro" ? "impeditivo" : "atencao"] }}
        >
          <SinalDeEstado estado={retorno.tipo === "erro" ? "impeditivo" : "atencao"} />
          <span>{retorno.texto}</span>
        </div>
      )}

      {consulta && retrato && qualificacao && (
        <>
          {/* ── O veredito, para ler de longe ─────────────────────────────── */}
          <section
            aria-label="Qualificação da compra"
            data-nivel={qualificacao.nivel}
            className="flex flex-col gap-3 border-2 bg-mt-surface p-5"
            style={{
              borderColor: COR_DO_ESTADO[ESTADO_DO_NIVEL[qualificacao.nivel]],
              boxShadow: `inset 10px 0 0 ${COR_DO_ESTADO[ESTADO_DO_NIVEL[qualificacao.nivel]]}`,
              paddingLeft: 30,
            }}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SinalDeEstado estado={ESTADO_DO_NIVEL[qualificacao.nivel]} tamanho={44} />
              <div className="flex min-w-0 flex-col">
                <span className={rotulo}>QUALIFICAÇÃO PELA CONSULTA</span>
                <h2 className="mt-titulo m-0 text-2xl md:text-3xl">{qualificacao.titulo}</h2>
              </div>
              <div className="ml-auto flex flex-col items-end text-right">
                <span className="font-mono text-lg font-extrabold tracking-[0.18em]">{consulta.placa}</span>
                <span className="text-xs text-mt-neutral-800">
                  {retrato.veiculo.descricao ?? "Veículo sem descrição"}
                  {retrato.veiculo.anoFabricacao && retrato.veiculo.anoModelo
                    ? ` · ${retrato.veiculo.anoFabricacao}/${retrato.veiculo.anoModelo}`
                    : ""}
                </span>
              </div>
            </div>
            {qualificacao.motivos.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-mt-ink">
                {qualificacao.motivos.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span aria-hidden className="text-mt-neutral-600">
                      —
                    </span>
                    {m}
                  </li>
                ))}
              </ul>
            )}
            <p className={dica}>
              É o veredito dos registros, e não o da compra: a vistoria e a perícia cautelar continuam valendo, e
              reparo mal feito não aparece em consulta nenhuma.
            </p>
          </section>

          {/* ── O quadro de checagens ─────────────────────────────────────── */}
          <section aria-label="Checagens" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={`${rotulo} m-0`}>O QUE A CONSULTA CONFERIU</h2>
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11px] text-mt-neutral-800">
                {(["ok", "atencao", "impeditivo", "nao_conferido"] as const).map((e) => (
                  <li key={e} className="inline-flex items-center gap-1.5">
                    <SinalDeEstado estado={e} tamanho={14} />
                    {ROTULO_DO_ESTADO[e]}
                  </li>
                ))}
              </ul>
            </div>
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-5">
              {checagens.map((c) => (
                <li
                  key={c.chave}
                  data-checagem={c.chave}
                  data-estado={c.estado}
                  className="flex flex-col gap-1.5 border border-mt-regua-fina bg-mt-surface p-3"
                  style={{ borderTop: `4px solid ${COR_DO_ESTADO[c.estado]}` }}
                >
                  <div className="flex items-center gap-2">
                    <SinalDeEstado estado={c.estado} />
                    <span className="text-xs font-extrabold uppercase tracking-wider text-mt-ink">{c.rotulo}</span>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-mt-neutral-700">
                    {ROTULO_DO_ESTADO[c.estado]}
                  </span>
                  <span className="text-xs leading-snug text-mt-neutral-800">{c.resumo}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Os apontamentos por extenso ───────────────────────────────── */}
          {(retrato.apontamentos.length > 0 || retrato.naoVeio.length > 0) && (
            <section aria-label="Apontamentos" className={secao}>
              <h2 className={`${rotulo} m-0`}>APONTAMENTOS</h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {retrato.apontamentos.map((a, i) => (
                  <li key={`${a.chave}-${i}`} className="flex items-start gap-3 text-sm">
                    <SinalDeEstado estado={a.gravidade} />
                    <span>
                      <strong className="font-extrabold">{a.titulo}.</strong> {a.detalhe}
                    </span>
                  </li>
                ))}
                {retrato.naoVeio.map((b) => (
                  <li key={b.chave} className="flex items-start gap-3 text-sm">
                    <SinalDeEstado estado="nao_conferido" />
                    <span>
                      <strong className="font-extrabold">{b.titulo}.</strong> {b.detalhe}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── A faixa de compra, ao vivo ────────────────────────────────── */}
          <section aria-label="Faixa de compra" className={secao}>
            <h2 className={`${rotulo} m-0`}>FAIXA DE COMPRA</h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className={rotulo}>KM NO PAINEL</span>
                  <input
                    className="mt-campo-caixa mt-foco w-44 tabular-nums"
                    inputMode="numeric"
                    value={kmInformado}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 7);
                      setKmInformado(d ? Number(d).toLocaleString("pt-BR") : "");
                    }}
                    placeholder="0"
                  />
                  <span className={dica}>
                    {retrato.leiturasDeKm.length > 0
                      ? `Última leitura registrada: ${km(retrato.leiturasDeKm[retrato.leiturasDeKm.length - 1].km)} em ${dataCurta(retrato.leiturasDeKm[retrato.leiturasDeKm.length - 1].data)}.`
                      : "A consulta não trouxe leitura anterior de km."}
                  </span>
                </label>
                {leituraAcima && (
                  <div className="flex items-start gap-3 border-l-[3px] bg-mt-surface px-3 py-2 text-xs" style={{ borderColor: COR_DO_ESTADO.impeditivo }}>
                    <SinalDeEstado estado="impeditivo" />
                    <span>
                      O km informado é MENOR que uma leitura anterior: {km(leituraAcima.km)} em {dataCurta(leituraAcima.data)}.
                      Hodômetro não anda para trás.
                    </span>
                  </div>
                )}
                <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                  <legend className={`${rotulo} mb-1.5 block`}>MECÂNICA</legend>
                  <div className="mt-seg flex-wrap">
                    {MECANICA.map((v) => (
                      <label key={v} className="mt-seg-opt">
                        <input type="radio" name="mecanica" checked={mecanica === v} onChange={() => setMecanica(v)} />
                        <span>{maiuscula(ROTULO_MECANICA[v].replace(/^mecânica /, ""))}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                  <legend className={`${rotulo} mb-1.5 block`}>FUNILARIA</legend>
                  <div className="mt-seg flex-wrap">
                    {CONSERVACAO.map((v) => (
                      <label key={v} className="mt-seg-opt">
                        <input type="radio" name="conservacao" checked={conservacao === v} onChange={() => setConservacao(v)} />
                        <span>{maiuscula(ROTULO_CONSERVACAO[v].replace(/^funilaria /, ""))}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              <div className="flex flex-col gap-3">
                {fipeAtual === null ? (
                  <p className="m-0 text-sm text-mt-neutral-800">A consulta não trouxe o valor FIPE: não há faixa para calcular.</p>
                ) : !recomendacao ? (
                  <p className="m-0 text-sm text-mt-neutral-800">
                    Não deu para ler a curva de deságio vigente (<code className="font-mono">parametros_avaliacao</code>), então a
                    tela não sugere faixa. A FIPE do mês é {reais(fipeAtual)}.
                  </p>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      {/* Só o sinal de recusa: a faixa é uma conta, e um "ok" verde ao
                          lado do preço se leria como "pode comprar" num carro com impeditivo. */}
                      {recomendacao.acima_do_teto && <SinalDeEstado estado="impeditivo" tamanho={28} />}
                      <div className="flex flex-col">
                        {recomendacao.valor_sugerido_min !== null && recomendacao.valor_sugerido_max !== null ? (
                          <span className="mt-titulo text-2xl tabular-nums md:text-3xl" data-faixa-de-compra>
                            {recomendacao.valor_sugerido_min === recomendacao.valor_sugerido_max
                              ? reais(recomendacao.valor_sugerido_max)
                              : `${reais(recomendacao.valor_sugerido_min)} a ${reais(recomendacao.valor_sugerido_max)}`}
                          </span>
                        ) : (
                          <span className="mt-titulo text-2xl">Fora da faixa de compra</span>
                        )}
                        <span className="text-xs text-mt-neutral-800">
                          {recomendacao.faixa_label} · FIPE {reais(fipeAtual)}
                        </span>
                      </div>
                    </div>
                    <table className="mt-tabela text-xs">
                      <thead>
                        <tr>
                          <th scope="col">Componente</th>
                          <th scope="col">Por quê</th>
                          <th scope="col" className="mt-num">p.p.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recomendacao.componentes.map((c) => (
                          <tr key={c.nome}>
                            <td className="font-semibold">{maiuscula(c.nome)}</td>
                            <td>{c.motivo}</td>
                            <td className="mt-num">{c.pp_min === c.pp_max ? pp(c.pp_min) : `${pp(c.pp_min)} a ${pp(c.pp_max)}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sinais.length > 0 && (
                      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-mt-neutral-800">
                        {sinais.map((s) => (
                          <li key={s}>{maiuscula(s)}.</li>
                        ))}
                      </ul>
                    )}
                    <p className={dica}>
                      Curva vigente desde {dataCurta(recomendacao.parametros_desde)}. Preparação e margem entram depois da
                      vistoria; este é o valor da curva, antes delas.
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* ── A FIPE e a tendência ──────────────────────────────────────── */}
          {tendencia && retrato.fipe && (
            <section aria-label="FIPE e tendência" className={secao}>
              <h2 className={`${rotulo} m-0`}>FIPE E TENDÊNCIA DO VALOR DE COMPRA</h2>
              <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3">
                  <dt className={rotulo}>FIPE DE {MESES[Number(tendencia.referencia.slice(5)) - 1].toUpperCase()}/{tendencia.referencia.slice(2, 4)}</dt>
                  <dd className="mt-titulo m-0 text-xl tabular-nums">{reais(retrato.fipe.valorAtual ?? tendencia.valorAtual)}</dd>
                  <span className="text-[11px] text-mt-neutral-700">
                    {retrato.gratuito?.fipeOficial ? "Conferida na tabela pública" : "Valor do fornecedor"}
                  </span>
                </div>
                {tendencia.variacoes.map((v) => (
                  <div key={v.meses} className="flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3">
                    <dt className={rotulo}>EM {v.meses} MESES</dt>
                    <dd className="mt-titulo m-0 inline-flex items-center gap-1.5 text-xl tabular-nums">
                      <span aria-hidden>{v.pct < 0 ? "▼" : v.pct > 0 ? "▲" : "■"}</span>
                      {pct(v.pct)}
                    </dd>
                    <span className="text-[11px] tabular-nums text-mt-neutral-700">Era {reais(v.de)}</span>
                  </div>
                ))}
                <div className="flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3">
                  <dt className={rotulo}>DESDE O PICO</dt>
                  <dd className="mt-titulo m-0 text-xl tabular-nums">{pct(tendencia.pico.pct)}</dd>
                  <span className="text-[11px] tabular-nums text-mt-neutral-700">
                    {reais(tendencia.pico.valor)} em {MESES[tendencia.pico.mes - 1]}/{String(tendencia.pico.ano).slice(2)}
                  </span>
                </div>
              </dl>
              {tendencia.ritmo && (
                <div className="flex items-center gap-3 text-sm">
                  <SinalDeEstado estado={tendencia.ritmo === "acelerando" ? "atencao" : "ok"} />
                  <span>
                    {tendencia.ritmo === "acelerando"
                      ? "A queda está acelerando: os últimos 6 meses caíram mais que os 6 anteriores. Cada mês de pátio custa mais."
                      : tendencia.ritmo === "desacelerando"
                        ? "A queda está perdendo força: os últimos 6 meses caíram menos que os 6 anteriores."
                        : "A queda segue no mesmo ritmo dos 6 meses anteriores."}
                  </span>
                </div>
              )}
              <GraficoDaFipe pontos={pontos} />
              <p className={dica}>
                A FIPE anda atrás do mercado: o gráfico mostra o que já aconteceu com a tabela. A projeção é conta, e não
                previsão.
                {retrato.fipe.valorZeroKm !== null ? ` Zero km hoje: ${reais(retrato.fipe.valorZeroKm)}.` : ""}
              </p>
            </section>
          )}

          {/* ── O carro e a origem ────────────────────────────────────────── */}
          <section aria-label="Dados do veículo" className={secao}>
            <h2 className={`${rotulo} m-0`}>O CARRO</h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <table className="mt-tabela text-xs">
                <tbody>
                  {(
                    [
                      ["Versão na FIPE", [retrato.fipe?.marca, retrato.fipe?.modelo, retrato.fipe?.versao].filter(Boolean).join(" ") || null],
                      ["Código FIPE", retrato.fipe?.codigo ?? null],
                      ["Cor", retrato.veiculo.cor],
                      ["Combustível", retrato.veiculo.combustivel],
                      ["Motor", retrato.veiculo.cilindradas && retrato.veiculo.potenciaCv ? `${retrato.veiculo.cilindradas} cm³ · ${retrato.veiculo.potenciaCv} cv` : null],
                      ["Emplacado em", retrato.veiculo.municipio ? `${retrato.veiculo.municipio}${retrato.veiculo.uf ? ` / ${retrato.veiculo.uf}` : ""}` : null],
                      ["Procedência", retrato.veiculo.procedencia],
                      ["Chassi", retrato.veiculo.chassi],
                      ["Nº do motor", retrato.veiculo.motor],
                      ["Renavam", retrato.veiculo.renavam],
                    ] as Array<[string, string | null]>
                  )
                    .filter(([, v]) => v)
                    .map(([nome, v]) => (
                      <tr key={nome}>
                        <th scope="row" className="w-36 font-semibold">{nome}</th>
                        <td className={/Chassi|motor|Renavam|Código/.test(nome) ? "font-mono" : undefined}>{v}</td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <div className="flex flex-col gap-4 text-xs text-mt-neutral-800">
                <div className="flex flex-col gap-1">
                  <span className={rotulo}>DE ONDE VEIO</span>
                  <p className="m-0 text-sm text-mt-ink">
                    {retrato.gratuito?.empresaDoFaturamento
                      ? `Zero km faturado para ${retrato.gratuito.empresaDoFaturamento.nomeFantasia ?? retrato.gratuito.empresaDoFaturamento.razaoSocial ?? "empresa"}`
                      : retrato.primeiroFaturamento.para === "empresa"
                        ? "Zero km faturado para uma empresa"
                        : retrato.primeiroFaturamento.para === "pessoa"
                          ? "Zero km faturado para pessoa física"
                          : "A consulta não diz para quem o carro zero foi faturado"}
                    {retrato.primeiroFaturamento.uf ? ` (${retrato.primeiroFaturamento.uf})` : ""}.
                  </p>
                  {retrato.gratuito?.empresaDoFaturamento?.atividade && <p className="m-0">{retrato.gratuito.empresaDoFaturamento.atividade}.</p>}
                  {retrato.primeiroFaturamento.cnpj && <p className="m-0 font-mono">CNPJ {formatarCnpj(retrato.primeiroFaturamento.cnpj)}</p>}
                  {retrato.chassi?.origem && (
                    <p className="m-0">
                      Pelo chassi: fabricado em {retrato.chassi.origem}
                      {retrato.chassi.ano ? `, ano ${retrato.chassi.ano}` : ""}.
                    </p>
                  )}
                  {retrato.veiculo.emissaoDoCrv && <p className="m-0">Documento do dono atual emitido em {dataCurta(retrato.veiculo.emissaoDoCrv)}.</p>}
                </div>

                {retrato.gravames.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className={rotulo}>FINANCIAMENTOS</span>
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {retrato.gravames.map((g, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <SinalDeEstado estado={g.baixado ? "ok" : "impeditivo"} tamanho={16} />
                          <span>
                            {g.agente ?? "Agente não informado"}, {dataCurta(g.dataInclusao)}: {g.baixado ? "baixado" : "em aberto"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {retrato.anuncios.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className={rotulo}>JÁ FOI ANUNCIADO</span>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 tabular-nums">
                      {retrato.anuncios.map((a, i) => (
                        <li key={i}>
                          {dataCurta(a.data)}
                          {a.valor !== null ? ` · ${reais(a.valor)}` : ""}
                          {a.km !== null ? ` · ${km(a.km)}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {retrato.gratuito && retrato.gratuito.falhas.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className={rotulo}>CONSULTAS SEM CUSTO QUE NÃO VIERAM</span>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {retrato.gratuito.falhas.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-mt-regua-fina pt-4 text-xs text-mt-neutral-800">
            <span>
              {veioGuardada ? "Consulta guardada" : "Consulta nova"}, feita em {dataCurta(consulta.criadoEm)} ({haQuanto(consulta.criadoEm, agora)})
              {consulta.consultadoPor ? ` por ${consulta.consultadoPor}` : ""}
              {consulta.custo !== null ? ` · custou ${centavos(consulta.custo)}` : ""}
              {consulta.homologacao ? " · MODO DE TESTE" : ""}
              {saldo !== null ? ` · saldo na APIBrasil: ${centavos(saldo)}` : ""}
            </span>
            <button
              type="button"
              disabled={carregando}
              onClick={() => void consultar(consulta.placa, true)}
              className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
            >
              Consultar de novo (cobrado)
            </button>
          </footer>
        </>
      )}

      {recentes.ok && recentes.consultas.length > 0 && (
        <section aria-label="Consultas recentes" className={secao}>
          <h2 className={`${rotulo} m-0`}>CONSULTAS RECENTES · REABRIR NÃO CUSTA</h2>
          <div className="overflow-x-auto">
            <table className="mt-tabela text-xs">
              <thead>
                <tr>
                  <th scope="col">Placa</th>
                  <th scope="col">Veículo</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Quando</th>
                  <th scope="col">Quem</th>
                </tr>
              </thead>
              <tbody>
                {recentes.consultas.map((c) => (
                  <tr key={c.placa}>
                    <td>
                      <button
                        type="button"
                        className="mt-link-regua mt-foco cursor-pointer border-0 bg-transparent p-0 font-mono font-extrabold tracking-wider"
                        onClick={() => void consultar(c.placa)}
                      >
                        {c.placa}
                      </button>
                    </td>
                    <td>{c.descricao ?? "—"}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <SinalDeEstado estado={ESTADO_DO_NIVEL[c.nivel]} tamanho={14} />
                        {TITULO_DO_NIVEL[c.nivel]}
                      </span>
                    </td>
                    <td className="tabular-nums">{dataCurta(c.criadoEm)}</td>
                    <td>{c.consultadoPor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

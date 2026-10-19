"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "../ConfirmDialog";
import type { ParametrosDaCurva } from "../../../lib/avaliacaoRecomendacao";
import { formatarCnpj } from "../../../lib/cnpj";
import {
  leituraAcimaDoHodometro,
  normalizarPlaca,
  quadroDeChecagens,
  qualificarCompra,
  type EstadoDaChecagem,
  type NivelDaQualificacao,
} from "../../../lib/consultaDePlaca";
import type { ConsultaGuardada, LeituraDasRecentes } from "../../../lib/consultaDePlaca-servidor";
import { nivelDaPlaca, type NivelDaPlaca } from "../../../lib/niveisDaPlaca";
import type { AprofundarDaPlaca, NivelComPrecoDaPlaca } from "../../../lib/niveisDaPlaca-servidor";
import FaixaDeCompra, { useAvaliacao } from "./FaixaDeCompra";
import PainelDaFipe from "./PainelDaFipe";
import SinalDeEstado, { COR_DO_ESTADO, ROTULO_DO_ESTADO } from "./SinalDeEstado";

/**
 * A aba Por placa de `/admin/consulta-veiculos` — o retrato de um carro pela placa.
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
 *
 * Desde 19/10/2026 a consulta tem NÍVEIS com preço (`niveisDaPlaca.ts`):
 * placa nova abre os cartões dos níveis antes de cobrar, e a consulta
 * guardada oferece o APROFUNDAR — subir de nível pagando só o que falta.
 */

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const centavos = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const km = (n: number) => `${n.toLocaleString("pt-BR")} km`;


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


type Retorno = { tipo: "erro" | "aviso"; texto: string } | null;

/** O que a rota devolve. */
interface RespostaDaPlaca {
  consulta?: ConsultaGuardada | null;
  guardada?: boolean;
  saldo?: number | null;
  aviso?: string;
  error?: string;
  podeTerCobrado?: boolean;
  repeticao?: ConsultaGuardada;
  niveis?: NivelComPrecoDaPlaca[] | null;
  aprofundar?: AprofundarDaPlaca[];
  tabelaDePrecosEm?: string | null;
  avisoDosNiveis?: string | null;
}

const precoDoNivel = (p: number | null) => (p === null ? "sem estimativa" : p.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

export default function ConsultaDePlaca({
  recentes,
  curva,
  temToken,
  homologacao,
  placaDeFora = null,
}: {
  recentes: LeituraDasRecentes;
  /** Uma placa aberta pelo histórico. Cada objeto novo abre uma vez, do guardado (sem custo). */
  placaDeFora?: { placa: string } | null;
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
  const [niveis, setNiveis] = useState<NivelComPrecoDaPlaca[] | null>(null);
  const [aprofundar, setAprofundar] = useState<AprofundarDaPlaca[]>([]);
  const [tabelaDePrecosEm, setTabelaDePrecosEm] = useState<string | null>(null);
  const [avisoDosNiveis, setAvisoDosNiveis] = useState<string | null>(null);
  /** A placa esperando a escolha do nível (placa nova, ou "consultar de novo"). */
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  const [nivelEscolhido, setNivelEscolhido] = useState<NivelDaPlaca | null>(null);
  const pagando = useRef(false);
  // Um relógio só por montagem: a idade da consulta não precisa andar sozinha.
  const [agora] = useState(() => Date.now());

  const retrato = consulta?.retrato ?? null;
  const fipeAtual = retrato?.fipe?.valorAtual ?? null;
  const avaliacao = useAvaliacao(fipeAtual, retrato?.veiculo.anoModelo ?? null, curva);

  const pedir = async (corpo: { placa: string; soGuardada?: boolean; nivel?: NivelDaPlaca; aprofundarDe?: string | null; repetir?: boolean }) => {
    const res = await fetch("/api/consulta-placa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = (await res.json().catch(() => ({}))) as RespostaDaPlaca;
    return { ok: res.ok, status: res.status, json };
  };

  const guardarOpcoes = (json: RespostaDaPlaca) => {
    if (json.niveis !== undefined) setNiveis(json.niveis ?? null);
    if (json.aprofundar !== undefined) setAprofundar(json.aprofundar);
    if (json.tabelaDePrecosEm !== undefined) setTabelaDePrecosEm(json.tabelaDePrecosEm ?? null);
    if (json.avisoDosNiveis !== undefined) setAvisoDosNiveis(json.avisoDosNiveis ?? null);
  };

  const mostrar = (c: ConsultaGuardada, guardada: boolean) => {
    setConsulta(c);
    setVeioGuardada(guardada);
    setPlaca(c.placa);
    avaliacao.zerar();
  };

  /**
   * Primeiro o que já está guardado, de graça. Sem guardada (ou com
   * `escolherNivel`), abre os cartões dos níveis; só a escolha e a
   * confirmação levam ao fornecedor.
   */
  const consultar = async (valor: string, escolherNivel = false) => {
    setRetorno(null);
    const normalizada = normalizarPlaca(valor);
    if (!normalizada) {
      setRetorno({ tipo: "erro", texto: "Placa inválida. Use o formato ABC1234 ou ABC1D23." });
      return;
    }
    setCarregando(true);
    try {
      const guardada = await pedir({ placa: normalizada, soGuardada: true });
      if (!guardada.ok) {
        setRetorno({ tipo: "erro", texto: guardada.json.error || "Não deu para ler as consultas guardadas." });
        return;
      }
      guardarOpcoes(guardada.json);
      if (guardada.json.consulta && !escolherNivel) {
        mostrar(guardada.json.consulta, true);
        setEscolhendo(null);
        return;
      }
      if (!guardada.json.consulta) setConsulta(null);
      setPlaca(normalizada);
      setNivelEscolhido(null);
      setEscolhendo(normalizada);
    } catch {
      setRetorno({ tipo: "erro", texto: "Sem conexão com o servidor." });
    } finally {
      setCarregando(false);
    }
  };

  /** Paga um nível (ou o aprofundar de uma guardada), com confirmação e a trava contra repetição. */
  const pagar = async (placaAlvo: string, nivel: NivelDaPlaca, preco: number | null, produtos: string[], aprofundarDe: string | null = null) => {
    // Duplo clique, ou um clique durante a confirmação: uma consulta paga por vez.
    if (pagando.current) return;
    pagando.current = true;
    try {
      await pagarUmaVez(placaAlvo, nivel, preco, produtos, aprofundarDe);
    } finally {
      pagando.current = false;
    }
  };

  const pagarUmaVez = async (placaAlvo: string, nivel: NivelDaPlaca, preco: number | null, produtos: string[], aprofundarDe: string | null) => {
    setRetorno(null);
    if (!temToken) {
      setRetorno({ tipo: "erro", texto: "Falta configurar APIBRASIL_TOKEN na Vercel para consultar." });
      return;
    }
    const rotuloDoNivel = nivelDaPlaca(nivel)?.rotulo ?? nivel;
    const ok = await confirm({
      title: aprofundarDe ? `Aprofundar para ${rotuloDoNivel}` : `Consulta ${rotuloDoNivel}`,
      message: homologacao
        ? `O painel está em modo de teste: a APIBrasil responde com um carro de exemplo, sem cobrar, e não com o ${placaAlvo}.`
        : `${placaAlvo}: ${produtos.join(" + ")}. ` +
          (preco === null ? "O preço não está na tabela; o valor exato vem na resposta." : `Cerca de ${precoDoNivel(preco)} no saldo da APIBrasil (o valor exato vem na resposta).`) +
          (aprofundarDe ? " O que a consulta guardada já tem é reaproveitado, sem pagar de novo." : ""),
      confirmLabel: homologacao ? "Consultar em teste" : "Consultar e pagar",
      cancelLabel: "Cancelar",
      type: "warning",
    });
    if (!ok) return;

    setCarregando(true);
    try {
      let resposta = await pedir({ placa: placaAlvo, nivel, aprofundarDe });
      if (resposta.status === 409 && resposta.json.repeticao) {
        const anterior = resposta.json.repeticao;
        const repetir = await confirm({
          title: "Consultada há pouco",
          message: `${resposta.json.error ?? ""} (${dataCurta(anterior.criadoEm)}${anterior.consultadoPor ? `, ${anterior.consultadoPor}` : ""}.)`,
          confirmLabel: "Consultar de novo e pagar",
          cancelLabel: "Abrir a guardada",
          type: "warning",
        });
        if (!repetir) {
          mostrar(anterior, true);
          setEscolhendo(null);
          return;
        }
        resposta = await pedir({ placa: placaAlvo, nivel, aprofundarDe, repetir: true });
      }
      if (!resposta.ok || !resposta.json.consulta) {
        const semCorpo = !resposta.json.error || resposta.status >= 500;
        const cobrou = resposta.json.podeTerCobrado || (semCorpo && !resposta.json.error);
        setRetorno({
          tipo: "erro",
          texto:
            (resposta.json.error || "A consulta não voltou a tempo.") +
            (cobrou && !homologacao && !/PODE ter sido cobrada|confira o saldo/i.test(resposta.json.error ?? "") ? " Ela PODE ter sido cobrada: confira o saldo no painel da APIBrasil antes de repetir." : ""),
        });
        return;
      }
      mostrar(resposta.json.consulta, false);
      setEscolhendo(null);
      setNivelEscolhido(null);
      setAprofundar(resposta.json.aprofundar ?? []);
      setSaldo(typeof resposta.json.saldo === "number" ? resposta.json.saldo : null);
      if (resposta.json.aviso) setRetorno({ tipo: "aviso", texto: resposta.json.aviso });
      // A lista de recentes é do servidor.
      router.refresh();
    } catch {
      setRetorno({ tipo: "erro", texto: "Sem conexão com o servidor. A consulta PODE ter sido feita: confira o saldo no painel da APIBrasil antes de repetir." });
    } finally {
      setCarregando(false);
    }
  };

  // A placa que veio do histórico: `consultar` tenta o guardado primeiro, e o guardado não custa.
  const ultimaDeFora = useRef<{ placa: string } | null>(null);
  useEffect(() => {
    if (!placaDeFora || placaDeFora === ultimaDeFora.current) return;
    ultimaDeFora.current = placaDeFora;
    void consultar(placaDeFora.placa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placaDeFora]);

  const leituraAcima = retrato ? leituraAcimaDoHodometro(retrato.leiturasDeKm, avaliacao.kmNumero) : null;
  const qualificacao = retrato
    ? qualificarCompra(retrato, { acimaDoTeto: avaliacao.recomendacao?.acima_do_teto === true, leituraAcima })
    : null;
  const checagens = retrato ? quadroDeChecagens(retrato) : [];

  const rotulo = "mt-rotulo";
  const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";
  const secao = "flex flex-col gap-4 border-t-2 border-mt-regua pt-5";

  return (
    <div className="mt-consulta flex w-full flex-col gap-6">
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
        className="nao-imprimir flex flex-wrap items-end gap-3"
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

      {escolhendo && (
        <section aria-label="Nível da consulta" className="nao-imprimir flex flex-col gap-3" data-escolher-nivel>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={`${rotulo} m-0`}>NÍVEL DA CONSULTA · {escolhendo}</h2>
            <button type="button" className="mt-link-regua mt-foco cursor-pointer border-0 bg-transparent p-0 text-[11px]" onClick={() => setEscolhendo(null)}>
              Cancelar
            </button>
          </div>
          {avisoDosNiveis && <p className={`${dica} font-bold`}>{avisoDosNiveis}</p>}
          {!temToken && <p className={`${dica} font-bold`}>Falta configurar APIBRASIL_TOKEN na Vercel: dá para ver os níveis e os preços, mas não consultar.</p>}
          {niveis && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {niveis.map((n) => (
                  <label
                    key={n.id}
                    data-nivel-da-placa={n.id}
                    className={`flex cursor-pointer flex-col gap-1 border-2 bg-mt-surface p-4 ${nivelEscolhido === n.id ? "border-mt-ink" : "border-mt-regua-fina"}`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-extrabold text-mt-ink">
                        <input type="radio" name="nivel-da-placa" value={n.id} checked={nivelEscolhido === n.id} onChange={() => setNivelEscolhido(n.id)} />
                        {n.rotulo}
                      </span>
                      <span className="text-sm font-extrabold tabular-nums text-mt-ink">{precoDoNivel(n.preco)}</span>
                    </span>
                    <span className="text-xs text-mt-neutral-800">{n.traz}</span>
                    {n.deixaDeFora && <span className="text-[11px] text-mt-neutral-700">Fica de fora: {n.deixaDeFora}</span>}
                    <span className="text-[11px] text-mt-neutral-600">{n.nomesDosProdutos.join(" + ")}</span>
                  </label>
                ))}
              </div>
              <p className={dica}>
                Preço de referência da tabela da APIBrasil{tabelaDePrecosEm ? ` de ${dataCurta(tabelaDePrecosEm)}` : ""}; o valor exato vem na resposta e fica no histórico. Depois, dá para
                aprofundar pagando só o que faltar.
              </p>
              <button
                type="button"
                disabled={carregando || !temToken || !nivelEscolhido}
                className="mt-btn mt-btn-primario mt-foco cursor-pointer self-start px-5 py-3 text-[11px]"
                onClick={() => {
                  const n = niveis.find((x) => x.id === nivelEscolhido);
                  if (n) void pagar(escolhendo, n.id, n.preco, n.nomesDosProdutos);
                }}
                data-consultar-nivel
              >
                {carregando
                  ? "Consultando…"
                  : nivelEscolhido
                    ? `Consultar · ${homologacao ? "teste" : precoDoNivel(niveis.find((x) => x.id === nivelEscolhido)?.preco ?? null)}`
                    : "Escolha o nível"}
              </button>
            </>
          )}
        </section>
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

          <FaixaDeCompra avaliacao={avaliacao} fipeAtual={fipeAtual} leiturasDeKm={retrato.leiturasDeKm} leituraAcima={leituraAcima} />

          {retrato.fipe && (
            <PainelDaFipe
              historico={retrato.fipe.historico}
              fipeAtual={fipeAtual}
              desagio={avaliacao.desagio}
              origem={retrato.gratuito?.fipeOficial ? "Conferida na tabela pública" : "Valor do fornecedor"}
              zeroKm={retrato.fipe.valorZeroKm}
            />
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

          {/* Fora do papel, como sempre esteve: até 13/10 a impressão tirava
              todo `<footer>` pela tag; agora é pela classe. */}
          <footer className="nao-imprimir flex flex-wrap items-center justify-between gap-3 border-t border-mt-regua-fina pt-4 text-xs text-mt-neutral-800">
            <span>
              {veioGuardada ? "Consulta guardada" : "Consulta nova"} · nível {nivelDaPlaca(consulta.nivel ?? retrato.nivel ?? "completo")?.rotulo}, feita em{" "}
              {dataCurta(consulta.criadoEm)} ({haQuanto(consulta.criadoEm, agora)})
              {consulta.consultadoPor ? ` por ${consulta.consultadoPor}` : ""}
              {consulta.custo !== null ? ` · custou ${centavos(consulta.custo)}` : ""}
              {consulta.homologacao ? " · MODO DE TESTE" : ""}
              {saldo !== null ? ` · saldo na APIBrasil: ${centavos(saldo)}` : ""}
            </span>
            <span className="flex flex-wrap gap-2">
              {consulta.id &&
                aprofundar.map((a) => (
                  <button
                    key={a.nivel}
                    type="button"
                    disabled={carregando || a.nomesDosProdutos.length === 0}
                    data-reaproveita={a.aprofundarDe ? "sim" : "nao"}
                    onClick={() => void pagar(consulta.placa, a.nivel, a.preco, a.nomesDosProdutos, a.aprofundarDe)}
                    className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
                    title={a.reaproveitados > 0 ? `Reaproveita ${a.reaproveitados} ${a.reaproveitados === 1 ? "produto" : "produtos"} desta consulta` : undefined}
                    data-aprofundar={a.nivel}
                  >
                    Aprofundar: {a.rotulo} · {homologacao ? "teste" : `+${precoDoNivel(a.preco)}`}
                  </button>
                ))}
              <button
                type="button"
                disabled={carregando}
                onClick={() => void consultar(consulta.placa, true)}
                className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
              >
                Consultar de novo (cobrado)
              </button>
            </span>
          </footer>
        </>
      )}

      {recentes.ok && recentes.consultas.length > 0 && (
        <section aria-label="Consultas recentes" className={`nao-imprimir ${secao}`}>
          <h2 className={`${rotulo} m-0`}>CONSULTAS RECENTES · REABRIR NÃO CUSTA</h2>
          <div className="overflow-x-auto">
            <table className="mt-tabela text-xs">
              <thead>
                <tr>
                  <th scope="col">Placa</th>
                  <th scope="col">Veículo</th>
                  <th scope="col">Nível</th>
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
                    <td>{nivelDaPlaca(c.nivelDaConsulta)?.rotulo ?? "—"}</td>
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

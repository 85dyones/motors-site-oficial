"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ParametrosDaCurva } from "../../../lib/avaliacaoRecomendacao";
import { MESES_DO_RITMO, MESES_PROJETADOS, serieDoGrafico, tendenciaDaFipe, type EstadoDaChecagem } from "../../../lib/consultaDePlaca";
import { listarAnos, listarMarcas, listarModelos, type OpcaoFipe } from "../../../lib/consultaFipe";
import {
  MESES_DE_HISTORICO,
  alertaDeMercado,
  mesesSeguidosDeQueda,
  ritmoMensalEmReais,
  variacaoMesAMes,
  type EstadoDaTendencia,
  type MercadoDoModelo,
} from "../../../lib/mercadoPorModelo";
import type { LeituraDosModelos, ModeloRecente } from "../../../lib/mercadoPorModelo-servidor";
import FaixaDeCompra, { useAvaliacao } from "./FaixaDeCompra";
import GraficoDeBarras from "./GraficoDeBarras";
import PainelDaFipe from "./PainelDaFipe";
import SinalDeEstado, { COR_DO_ESTADO } from "./SinalDeEstado";

/**
 * A aba "Por modelo" de `/admin/consulta-placa` — a primeira análise de
 * compra, sem custo (pedido do dono em 06/10/2026).
 *
 * Quem abre: quem avalia carro (Administrador, Gestor, Comercial). Quando:
 * ANTES de gastar uma consulta de placa — o cliente disse o carro pelo
 * telefone, ou apareceu um lote. Que decisão sai: **vale olhar este modelo?
 * e por quanto, sabendo para onde a tabela dele está indo**.
 *
 * A tela não sabe nada do carro em si, e diz isso: leilão, sinistro, gravame
 * e débito só existem na aba da placa. Aqui é a tabela FIPE pública, mês a
 * mês, e a curva de deságio da loja.
 *
 * Tudo que se afirma sai de `lib/mercadoPorModelo.ts`, por comparação: a
 * série contra ela mesma e o ano contra o ano vizinho. Nenhum percentual de
 * "caiu muito" mora aqui.
 */

const TIPO = "carros" as const;

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const milhares = (n: number) => `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (p: { ano: number; mes: number }) => `${MESES[p.mes - 1]}/${String(p.ano).slice(2)}`;

/** A forma que desenha cada estado da tendência, e o nome que ela leva. */
const SINAL_DA_TENDENCIA: Record<EstadoDaTendencia, { estado: EstadoDaChecagem; rotulo: string }> = {
  estavel: { estado: "ok", rotulo: "Estável" },
  caindo: { estado: "atencao", rotulo: "Atenção" },
  acelerando: { estado: "impeditivo", rotulo: "Alerta" },
  sem_serie: { estado: "nao_conferido", rotulo: "Sem série" },
};

type Lista = { carregando: boolean; opcoes: OpcaoFipe[]; erro: string | null };
const VAZIA: Lista = { carregando: false, opcoes: [], erro: null };

export default function ConsultaPorModelo({ curva, recentes }: { curva: ParametrosDaCurva | null; recentes: LeituraDosModelos }) {
  const router = useRouter();
  const [marcas, setMarcas] = useState<Lista>({ ...VAZIA, carregando: true });
  const [modelos, setModelos] = useState<Lista>(VAZIA);
  const [anos, setAnos] = useState<Lista>(VAZIA);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");

  const [mercado, setMercado] = useState<MercadoDoModelo | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const avaliacao = useAvaliacao(mercado?.fipeAtual ?? null, mercado?.anoModelo ?? null, curva);

  // As marcas, uma vez. A cascata é a da `/avaliacao`: a porta da loja
  // primeiro, e a API pública como reserva.
  useEffect(() => {
    let vivo = true;
    listarMarcas(TIPO)
      .then((opcoes) => vivo && setMarcas({ carregando: false, opcoes, erro: opcoes.length ? null : "A FIPE não devolveu as marcas." }))
      .catch(() => vivo && setMarcas({ carregando: false, opcoes: [], erro: "Não deu para carregar as marcas da FIPE." }));
    return () => {
      vivo = false;
    };
  }, []);

  const escolherMarca = async (codigo: string) => {
    setMarca(codigo);
    setModelo("");
    setAno("");
    setAnos(VAZIA);
    if (!codigo) return setModelos(VAZIA);
    setModelos({ carregando: true, opcoes: [], erro: null });
    try {
      setModelos({ carregando: false, opcoes: await listarModelos(TIPO, codigo), erro: null });
    } catch {
      setModelos({ carregando: false, opcoes: [], erro: "Não deu para carregar os modelos." });
    }
  };

  /** Só anos de verdade: o "zero km" da FIPE (32000) não é ano-modelo. */
  const soAnos = (opcoes: OpcaoFipe[]) => opcoes.filter((o) => /^(19|20)\d{2}-\d{1,2}$/.test(o.codigo));

  const escolherModelo = async (codigo: string, marcaDoModelo = marca): Promise<OpcaoFipe[]> => {
    setModelo(codigo);
    setAno("");
    if (!codigo) {
      setAnos(VAZIA);
      return [];
    }
    setAnos({ carregando: true, opcoes: [], erro: null });
    try {
      const opcoes = soAnos(await listarAnos(TIPO, marcaDoModelo, codigo));
      setAnos({ carregando: false, opcoes, erro: null });
      return opcoes;
    } catch {
      setAnos({ carregando: false, opcoes: [], erro: "Não deu para carregar os anos." });
      return [];
    }
  };

  const analisar = async (pedido: { marca: string; modelo: string; ano: string; anos: string[] }) => {
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/consulta-placa/modelo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: TIPO, ...pedido }),
      });
      const json = (await res.json().catch(() => ({}))) as { mercado?: MercadoDoModelo; avisos?: string[]; error?: string };
      if (!res.ok || !json.mercado) {
        setErro(json.error || "A análise não voltou.");
        return;
      }
      setMercado(json.mercado);
      setAvisos(json.avisos ?? []);
      avaliacao.zerar();
      // "Modelos já consultados" é do servidor.
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  };

  /** Reabre um modelo já consultado: os anos vêm da FIPE, o histórico já está guardado. */
  const reabrir = async (m: ModeloRecente) => {
    setErro(null);
    await escolherMarca(m.marcaCodigo);
    const opcoes = await escolherModelo(m.modeloCodigo, m.marcaCodigo);
    setAno(m.ano);
    await analisar({ marca: m.marcaCodigo, modelo: m.modeloCodigo, ano: m.ano, anos: opcoes.map((o) => o.codigo) });
  };

  // ── A leitura da série ─────────────────────────────────────────────────────
  const tendencia = useMemo(() => (mercado ? tendenciaDaFipe(mercado.historico) : null), [mercado]);
  const alerta = useMemo(() => (mercado ? alertaDeMercado(mercado, tendencia) : null), [mercado, tendencia]);
  const variacoes = useMemo(() => (mercado ? variacaoMesAMes(mercado.historico) : []), [mercado]);
  const projetado = useMemo(() => {
    const pontos = mercado ? serieDoGrafico(mercado.historico, null).filter((p) => p.projetado) : [];
    return pontos.length > 0 ? pontos[pontos.length - 1] : null;
  }, [mercado]);
  const seguidos = mercado ? mesesSeguidosDeQueda(mercado.historico) : 0;
  const ritmo = mercado ? ritmoMensalEmReais(mercado.historico) : null;
  const sinal = alerta ? SINAL_DA_TENDENCIA[alerta.estado] : null;

  const rotulo = "mt-rotulo";
  const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";
  const secao = "flex flex-col gap-4 border-t-2 border-mt-regua pt-5";
  const seletor = "mt-campo-caixa mt-foco w-full";
  const cartao = "flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3";

  return (
    <div className="mt-consulta flex w-full flex-col gap-6">
      <form
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (marca && modelo && ano) void analisar({ marca, modelo, ano, anos: anos.opcoes.map((o) => o.codigo) });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={rotulo}>MARCA</span>
          <select className={seletor} value={marca} onChange={(e) => void escolherMarca(e.target.value)} disabled={marcas.carregando}>
            <option value="">{marcas.carregando ? "Carregando…" : "Escolha"}</option>
            {marcas.opcoes.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>MODELO</span>
          <select className={seletor} value={modelo} onChange={(e) => void escolherModelo(e.target.value)} disabled={!marca || modelos.carregando}>
            <option value="">{modelos.carregando ? "Carregando…" : marca ? "Escolha" : "Escolha a marca"}</option>
            {modelos.opcoes.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>ANO-MODELO</span>
          <select className={seletor} value={ano} onChange={(e) => setAno(e.target.value)} disabled={!modelo || anos.carregando}>
            <option value="">{anos.carregando ? "Carregando…" : modelo ? "Escolha" : "Escolha o modelo"}</option>
            {anos.opcoes.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={carregando || !ano} className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-3 text-[11px]">
          {carregando ? "Analisando…" : "Analisar"}
        </button>
        <p className={`${dica} sm:col-span-4`}>
          Sem custo: só a tabela FIPE pública e a curva de deságio da loja. A primeira análise de um modelo leva alguns
          segundos, porque busca {MESES_DE_HISTORICO} meses de tabela; depois ele abre na hora.
        </p>
      </form>

      {[marcas.erro, modelos.erro, anos.erro, erro].filter(Boolean).map((texto) => (
        <div key={texto} role="alert" className="flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs text-mt-ink" style={{ borderColor: COR_DO_ESTADO.impeditivo }}>
          <SinalDeEstado estado="impeditivo" />
          <span>{texto}</span>
        </div>
      ))}

      {mercado && alerta && sinal && (
        <>
          {/* ── O alerta de tendência, para ler de longe ──────────────────── */}
          <section
            aria-label="Tendência de desvalorização"
            data-tendencia={alerta.estado}
            className="flex flex-col gap-3 border-2 bg-mt-surface p-5"
            style={{ borderColor: COR_DO_ESTADO[sinal.estado], boxShadow: `inset 10px 0 0 ${COR_DO_ESTADO[sinal.estado]}`, paddingLeft: 30 }}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SinalDeEstado estado={sinal.estado} tamanho={44} rotulo={sinal.rotulo} />
              <div className="flex min-w-0 flex-col">
                <span className={rotulo}>TENDÊNCIA DO MODELO · {sinal.rotulo.toUpperCase()}</span>
                <h2 className="mt-titulo m-0 text-2xl md:text-3xl">{alerta.titulo}</h2>
              </div>
              <div className="ml-auto flex flex-col items-end text-right">
                <span className="text-sm font-extrabold text-mt-ink">
                  {[mercado.marca, mercado.modelo].filter(Boolean).join(" ") || "Modelo"} · {mercado.anoModelo}
                </span>
                <span className="text-xs text-mt-neutral-800">
                  {[mercado.combustivel, mercado.codigoFipe ? `FIPE ${mercado.codigoFipe}` : null].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-mt-ink">
              {alerta.linhas.map((l) => (
                <li key={l} className="flex gap-2">
                  <span aria-hidden className="text-mt-neutral-600">
                    —
                  </span>
                  {l}
                </li>
              ))}
            </ul>
            <p className={dica}>
              É a tendência da TABELA deste modelo, e não a avaliação de um carro. Leilão, sinistro, financiamento e
              débitos só aparecem na aba Por placa.
            </p>
          </section>

          {avisos.map((a) => (
            <div key={a} className="flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs text-mt-ink" style={{ borderColor: COR_DO_ESTADO.atencao }}>
              <SinalDeEstado estado="atencao" />
              <span>{a}</span>
            </div>
          ))}

          {/* ── O que a queda custa ───────────────────────────────────────── */}
          <section aria-label="O que a queda custa" className="flex flex-col gap-3">
            <h2 className={`${rotulo} m-0`}>O QUE A TENDÊNCIA CUSTA</h2>
            <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className={cartao}>
                <dt className={rotulo}>MESES SEGUIDOS DE QUEDA</dt>
                <dd className="mt-titulo m-0 text-xl tabular-nums" data-meses-de-queda>
                  {seguidos}
                </dd>
                <span className="text-[11px] text-mt-neutral-700">{seguidos === 0 ? "O último mês não caiu" : "Contando do mês atual para trás"}</span>
              </div>
              <div className={cartao}>
                <dt className={rotulo}>CADA MÊS DE PÁTIO</dt>
                <dd className="mt-titulo m-0 inline-flex items-center gap-1.5 text-xl tabular-nums">
                  {ritmo === null ? (
                    "—"
                  ) : (
                    <>
                      <span aria-hidden>{ritmo < 0 ? "▼" : ritmo > 0 ? "▲" : "■"}</span>
                      {reais(Math.abs(ritmo))}
                    </>
                  )}
                </dd>
                <span className="text-[11px] text-mt-neutral-700">
                  {ritmo === null ? "Sem seis meses de série" : `${ritmo < 0 ? "Perde" : ritmo > 0 ? "Ganha" : "Não muda"} de tabela, na média de ${MESES_DO_RITMO} meses`}
                </span>
              </div>
              <div className={cartao}>
                <dt className={rotulo}>FIPE EM {MESES_PROJETADOS} MESES</dt>
                <dd className="mt-titulo m-0 text-xl tabular-nums">{projetado ? reais(projetado.fipe) : "—"}</dd>
                <span className="text-[11px] tabular-nums text-mt-neutral-700">
                  {projetado ? `${pct(Math.round(((projetado.fipe - mercado.fipeAtual) / mercado.fipeAtual) * 1000) / 10)} se o ritmo continuar` : "Sem série para projetar"}
                </span>
              </div>
              <div className={cartao}>
                <dt className={rotulo}>FAIXA NO PERÍODO</dt>
                <dd className="mt-titulo m-0 text-xl tabular-nums">
                  {milhares(Math.min(...mercado.historico.map((p) => p.valor)))} a {milhares(Math.max(...mercado.historico.map((p) => p.valor)))}
                </dd>
                <span className="text-[11px] text-mt-neutral-700">Menor e maior FIPE em {mercado.historico.length} meses</span>
              </div>
            </dl>
          </section>

          <FaixaDeCompra avaliacao={avaliacao} fipeAtual={mercado.fipeAtual} semDocumento />

          <PainelDaFipe historico={mercado.historico} fipeAtual={mercado.fipeAtual} desagio={avaliacao.desagio} origem="Tabela FIPE pública" mostrarRitmo={false} />

          {/* ── Mês a mês ─────────────────────────────────────────────────── */}
          {variacoes.length > 1 && (
            <section aria-label="Variação mês a mês" className={secao}>
              <h2 className={`${rotulo} m-0`}>VARIAÇÃO DA TABELA, MÊS A MÊS</h2>
              <GraficoDeBarras
                descricao="Variação percentual da FIPE em cada mês contra o mês anterior"
                formatoDoEixo={(v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                barras={variacoes.map((v) => ({ rotulo: mesAno(v), valor: v.pct, dica: [pct(v.pct), `${v.reais < 0 ? "−" : "+"}${reais(Math.abs(v.reais))} no mês`] }))}
              />
              <p className={dica}>Barra para baixo é mês em que a tabela caiu. Barras crescendo para baixo são a queda acelerando.</p>
            </section>
          )}

          {/* ── Ano contra ano ────────────────────────────────────────────── */}
          {mercado.porAno.length > 1 && (
            <section aria-label="Valor por ano-modelo" className={secao}>
              <h2 className={`${rotulo} m-0`}>O MESMO MODELO, ANO A ANO</h2>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <GraficoDeBarras
                  descricao="Valor FIPE de hoje para cada ano-modelo deste carro"
                  formatoDoEixo={milhares}
                  formatoDoDestaque={reais}
                  barras={[...mercado.porAno].reverse().map((a) => ({
                    rotulo: String(a.anoModelo),
                    valor: a.valor,
                    destaque: a.escolhido,
                    dica: [reais(a.valor), ...(a.abaixoDoSeguintePct !== null ? [`${pct(a.abaixoDoSeguintePct)} contra o ${a.anoModelo + 1}`] : [])],
                  }))}
                />
                <table className="mt-tabela text-xs">
                  <thead>
                    <tr>
                      <th scope="col">Ano</th>
                      <th scope="col" className="mt-num">FIPE hoje</th>
                      <th scope="col" className="mt-num">Contra o ano seguinte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mercado.porAno.map((a) => (
                      <tr key={a.ano} data-ano={a.anoModelo} className={a.escolhido ? "font-extrabold" : undefined}>
                        <td>
                          {a.anoModelo}
                          {a.escolhido ? " · escolhido" : ""}
                        </td>
                        <td className="mt-num">{reais(a.valor)}</td>
                        <td className="mt-num">{a.abaixoDoSeguintePct !== null ? pct(a.abaixoDoSeguintePct) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={dica}>
                A última coluna é o que um ano de idade custa neste modelo, na tabela de hoje. Degrau grande entre dois
                anos costuma ser troca de geração ou de motor: vale conferir qual é qual antes de comprar o mais velho.
              </p>
            </section>
          )}

          {mercado.mesesQueFaltaram > 0 && (
            <p className={dica}>
              {mercado.mesesQueFaltaram} {mercado.mesesQueFaltaram === 1 ? "mês do período não veio" : "meses do período não vieram"} da FIPE
              nesta leitura. Analisar de novo busca só o que falta.
            </p>
          )}
        </>
      )}

      {recentes.ok && recentes.modelos.length > 0 && (
        <section aria-label="Modelos já consultados" className={secao}>
          <h2 className={`${rotulo} m-0`}>MODELOS JÁ CONSULTADOS · ABREM NA HORA</h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {recentes.modelos.map((m) => (
              <li key={`${m.marcaCodigo}-${m.modeloCodigo}-${m.ano}`}>
                <button
                  type="button"
                  disabled={carregando}
                  onClick={() => void reabrir(m)}
                  className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-2 text-[11px] normal-case tracking-normal"
                >
                  {m.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!recentes.ok && recentes.faltaMigracao && (
        <p className={dica}>
          A tabela do histórico ainda não existe no banco (migração <code className="font-mono">20261006190000_fipe_historico</code>): a
          análise funciona, mas nada fica guardado.
        </p>
      )}
    </div>
  );
}

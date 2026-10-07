"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoDaChecagem } from "../../../lib/consultaDePlaca";
import {
  FILTROS_DE_DESTINATARIO,
  ROTULO_DA_SITUACAO,
  ROTULO_DO_CRITERIO,
  ROTULO_DO_ESTAGIO,
  ROTULO_DO_FILTRO,
  ehCriterioDeCarro,
  estagioDoEnvio,
  passaNoFiltro,
  quandoDoEstagio,
  taxa,
  type CampanhaDeSmsDetalhada,
  type EstagioDoEnvio,
  type FiltroDeDestinatario,
  type JanelaDeInteresse,
  type RespostaDoLote,
  type ResumoDaCampanha,
  type SituacaoDaCampanha,
} from "../../../lib/smsCampanhas";
import { useConfirm } from "../../admin/ConfirmDialog";
import SinalDeEstado, { COR_DO_ESTADO } from "../../admin/consulta/SinalDeEstado";
import { SEM_CARRO, SINAL_DA_SITUACAO, rotuloDoCarroDaCampanha } from "./CampanhasDeSms";
import { rotuloDoDestinoDoLink, rotuloDoTempoDeCompra } from "./rotulosDaCampanha";

/**
 * `/admin/marketing/sms/[id]` — o envio e o monitoramento de UMA campanha.
 *
 * Quem abre: Administrador e Marketing. Quando: logo depois de criar (para
 * enviar) e nos dias seguintes (para ler). Que decisão sai: **mando agora?** e,
 * depois, **essa mensagem trouxe gente de volta — repito a fórmula em outro
 * carro (ou perfil) ou mudo?**
 *
 * O envio é em lotes: cada chamada à rota manda um, e a tela chama de novo
 * enquanto houver fila. Sair da página pausa o envio (a campanha fica
 * "Enviando" e continua de onde parou); nada é mandado duas vezes.
 *
 * Dado pessoal: a tabela recebe primeiro nome e telefone mascarado. O nome só
 * vira link para a ficha do lead quando a página diz que o papel pode abri-la.
 */

/** Lotes seguidos sem a fila andar antes de a tela desistir de insistir. */
const LOTES_PARADOS_TOLERADOS = 3;

const SINAL_DO_ESTAGIO: Record<EstagioDoEnvio, EstadoDaChecagem> = {
  na_fila: "nao_conferido",
  enviado: "ok",
  na_operadora: "ok",
  clicou: "ok",
  respondeu: "ok",
  saiu: "atencao",
  falhou: "impeditivo",
};

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (n: number) => n.toLocaleString("pt-BR");
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const rotuloDaJanela = (j: JanelaDeInteresse) => (j === null ? "em qualquer época" : `nos últimos ${j} dias`);
const pessoas = (n: number) => `${numero(n)} ${n === 1 ? "pessoa" : "pessoas"}`;

export default function MonitorDaCampanhaDeSms({
  campanha,
  podeAbrirLead = false,
}: {
  campanha: CampanhaDeSmsDetalhada;
  /** O papel de quem abriu pode ver a ficha do lead: o nome vira link. Marketing não pode. */
  podeAbrirLead?: boolean;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();

  // O que os lotes devolveram por cima do que a página trouxe. Quando o
  // servidor entrega uma leitura nova (`router.refresh()`), ela volta a mandar.
  const [base, setBase] = useState(campanha);
  const [aoVivo, setAoVivo] = useState<{ situacao: SituacaoDaCampanha; resumo: ResumoDaCampanha } | null>(null);
  if (base !== campanha) {
    setBase(campanha);
    setAoVivo(null);
  }

  const [enviando, setEnviando] = useState(false);
  const [interrompendo, setInterrompendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroDeDestinatario>("todos");

  const emCurso = useRef(false);
  const parar = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      // Saiu da página: o laço para no próximo lote, e a campanha continua de onde ficou.
      montado.current = false;
    };
  }, []);

  const situacao = aoVivo?.situacao ?? campanha.situacao;
  const resumo = aoVivo?.resumo ?? campanha.resumo;
  const processados = resumo.enviados + resumo.falhas;
  const faltam = Math.max(0, resumo.publico - processados);

  /** O laço de lotes: um por chamada, enquanto houver fila e ninguém mandar parar. */
  const rodarLotes = async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    parar.current = false;
    setEnviando(true);
    setAviso(null);
    setErro(null);
    let restavam = Number.POSITIVE_INFINITY;
    let parados = 0;
    try {
      while (montado.current && !parar.current) {
        const res = await fetch(`/api/marketing/sms/${campanha.id}/enviar`, { method: "POST" });
        const lote = (await res.json().catch(() => ({}))) as Partial<RespostaDoLote> & { error?: string };
        if (!res.ok || !lote.resumo || !lote.situacao) {
          setErro(lote.error || "O envio não respondeu. Nada foi mandado duas vezes: dá para continuar de onde parou.");
          break;
        }
        // Com a interrupção pedida, o lote que estava no ar traz os números, e não a situação:
        // quem responde por ela é a rota de interromper.
        const doLote = { situacao: lote.situacao, resumo: lote.resumo };
        setAoVivo((antes) => (parar.current && antes ? { situacao: antes.situacao, resumo: doLote.resumo } : doLote));
        if (lote.aviso) {
          setAviso(lote.aviso);
          break;
        }
        const restam = lote.restam ?? 0;
        if (!(restam > 0 && lote.situacao === "enviando")) break;
        parados = restam < restavam ? 0 : parados + 1;
        restavam = restam;
        if (parados >= LOTES_PARADOS_TOLERADOS) {
          setAviso(`A fila não andou em ${LOTES_PARADOS_TOLERADOS} lotes seguidos. O envio foi pausado; tente continuar em alguns minutos.`);
          break;
        }
      }
    } catch {
      setErro("Sem conexão com o servidor. Nada foi mandado duas vezes: dá para continuar de onde parou.");
    } finally {
      emCurso.current = false;
      if (montado.current) {
        setEnviando(false);
        // A tabela de destinatários é do servidor.
        router.refresh();
      }
    }
  };

  const enviar = async () => {
    const ok = await confirm({
      title: "Enviar a campanha",
      message: `${pessoas(resumo.publico)} ${resumo.publico === 1 ? "vai" : "vão"} receber este SMS agora, a ${campanha.tamanho.partes} SMS por pessoa. Cada envio é cobrado, e não dá para desfazer depois de enviado.`,
      confirmLabel: `Enviar para ${pessoas(resumo.publico)}`,
      cancelLabel: "Ainda não",
      type: "warning",
    });
    if (ok) await rodarLotes();
  };

  const continuar = async () => {
    const ok = await confirm({
      title: "Continuar o envio",
      message: `Faltam ${pessoas(faltam)}. Quem já recebeu não recebe de novo. Cada envio é cobrado, e não dá para desfazer.`,
      confirmLabel: "Continuar envio",
      cancelLabel: "Ainda não",
      type: "warning",
    });
    if (ok) await rodarLotes();
  };

  const interromper = async () => {
    const ok = await confirm({
      title: "Interromper o envio",
      message: `Quem já recebeu continua tendo recebido. ${pessoas(faltam)} ${faltam === 1 ? "fica" : "ficam"} sem a mensagem, e a campanha não pode ser retomada depois.`,
      confirmLabel: "Interromper",
      cancelLabel: "Continuar enviando",
      type: "danger",
    });
    if (!ok) return;
    parar.current = true;
    setInterrompendo(true);
    setErro(null);
    try {
      const res = await fetch(`/api/marketing/sms/${campanha.id}/interromper`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { situacao?: SituacaoDaCampanha; error?: string };
      if (!res.ok || !json.situacao) {
        setErro(json.error || "A interrupção não respondeu.");
        return;
      }
      const nova = json.situacao;
      setAoVivo((antes) => ({ situacao: nova, resumo: antes?.resumo ?? campanha.resumo }));
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      if (montado.current) setInterrompendo(false);
    }
  };

  // ── O funil ────────────────────────────────────────────────────────────────
  const funil = [
    { chave: "publico", rotulo: "Público", valor: resumo.publico, pct: null as number | null, base: "pessoas no recorte" },
    { chave: "enviados", rotulo: "Enviados", valor: resumo.enviados, pct: taxa(resumo.enviados, resumo.publico), base: "do público" },
    { chave: "na-operadora", rotulo: "Na operadora", valor: resumo.naOperadora, pct: taxa(resumo.naOperadora, resumo.enviados), base: "dos enviados" },
    { chave: "clicaram", rotulo: "Clicaram", valor: resumo.clicaram, pct: taxa(resumo.clicaram, resumo.enviados), base: "dos enviados" },
    { chave: "responderam", rotulo: "Responderam", valor: resumo.responderam, pct: taxa(resumo.responderam, resumo.enviados), base: "dos enviados" },
  ];
  const escala = Math.max(resumo.publico, 1);

  const destinoDoLink = rotuloDoDestinoDoLink(campanha.destino);
  // Sem carro, o lugar do carro diz para onde o link leva.
  const carroDaCampanha = campanha.veiculoId === null && destinoDoLink !== "" ? `${SEM_CARRO} · link para ${destinoDoLink}` : rotuloDoCarroDaCampanha(campanha);

  const linhas = useMemo(() => campanha.envios.filter((e) => passaNoFiltro(e, filtro)), [campanha.envios, filtro]);
  const contagem = (f: FiltroDeDestinatario) => campanha.envios.filter((e) => passaNoFiltro(e, f)).length;

  const rotulo = "mt-rotulo";
  const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";
  const secao = "flex flex-col gap-4 border-t-2 border-mt-regua pt-5";
  const faixa = "flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs leading-relaxed text-mt-ink";
  const cartaoMenor = "flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3";

  return (
    <div className="mt-consulta mx-auto flex w-full max-w-6xl flex-col gap-6" data-monitor-da-campanha={campanha.id}>
      <header className="flex flex-col gap-3">
        <Link href="/admin/marketing/sms" className="mt-rotulo mt-foco self-start no-underline hover:underline">
          ← MARKETING · CAMPANHAS DE SMS
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="mt-titulo m-0 text-3xl md:text-4xl">{campanha.nome}</h1>
          <span className="inline-flex items-center gap-2 text-sm font-extrabold text-mt-ink" data-situacao={situacao}>
            <SinalDeEstado estado={SINAL_DA_SITUACAO[situacao]} tamanho={24} rotulo={ROTULO_DA_SITUACAO[situacao]} />
            {ROTULO_DA_SITUACAO[situacao]}
          </span>
        </div>
        <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-2 text-sm text-mt-ink sm:grid-cols-3">
          <div className="flex flex-col" data-carro-da-campanha={campanha.veiculoId ?? "sem-carro"}>
            <dt className={rotulo}>CARRO</dt>
            <dd className="m-0">
              {campanha.veiculoId !== null ? (
                <Link href={`/admin/estoque/${campanha.veiculoId}`} className="mt-foco font-extrabold text-mt-ink underline underline-offset-2">
                  {carroDaCampanha}
                </Link>
              ) : (
                carroDaCampanha
              )}
            </dd>
          </div>
          <div className="flex flex-col" data-quem-recebe>
            <dt className={rotulo}>QUEM RECEBE</dt>
            <dd className="m-0">
              {ehCriterioDeCarro(campanha.criterio)
                ? `Interesse em: ${ROTULO_DO_CRITERIO[campanha.criterio].toLowerCase()}, ${rotuloDaJanela(campanha.janelaDias)}`
                : `Perfil: ${ROTULO_DO_CRITERIO[campanha.criterio].toLowerCase()}, com contato ${rotuloDaJanela(campanha.janelaDias)}`}
              {typeof campanha.compraHaMeses === "number" && (
                <span className="tabular-nums" data-filtro-de-compra>
                  , comprou há pelo menos {rotuloDoTempoDeCompra(campanha.compraHaMeses)}
                </span>
              )}
              {destinoDoLink !== "" && (
                <span className="block break-words text-xs text-mt-neutral-800" data-destino-do-link>
                  O link leva para {destinoDoLink}.
                </span>
              )}
            </dd>
          </div>
          <div className="flex flex-col" data-canais-da-campanha>
            <dt className={rotulo}>CANAIS</dt>
            <dd className="m-0 break-words">{campanha.canais.length === 0 ? "Todos os canais" : campanha.canais.join(", ")}</dd>
          </div>
          <div className="flex flex-col" data-descanso-da-campanha>
            <dt className={rotulo}>DESCANSO</dt>
            <dd className="m-0 tabular-nums">
              {campanha.descansoDias > 0
                ? `${campanha.descansoDias} dias: quem recebeu outra campanha nesse intervalo ficou de fora`
                : "Sem descanso"}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className={rotulo}>CRIADA</dt>
            <dd className="m-0 tabular-nums">
              {dataHora(campanha.criadoEm)}
              {campanha.criadoPorNome ? ` · ${campanha.criadoPorNome}` : ""}
              {campanha.enviadaEm ? ` · enviada em ${dataHora(campanha.enviadaEm)}` : ""}
            </dd>
          </div>
        </dl>
      </header>

      {campanha.homologacao && (
        <div role="status" className={faixa} style={{ borderColor: COR_DO_ESTADO.atencao }} data-aviso="homologacao">
          <SinalDeEstado estado="atencao" />
          <span>
            <strong>Atenção:</strong> o fornecedor está em modo de homologação. Os envios desta campanha são de teste: nenhum SMS
            chega ao celular de ninguém, e os números abaixo não são de gente de verdade.
          </span>
        </div>
      )}

      {/* ── A mensagem ──────────────────────────────────────────────────────── */}
      <section aria-label="Mensagem" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className={rotulo}>O MOLDE</span>
          <p className="m-0 whitespace-pre-wrap break-words border border-mt-regua-fina p-3 font-mono text-xs leading-relaxed text-mt-neutral-800" data-molde>
            {campanha.mensagem}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span className={rotulo}>COMO CHEGA</span>
          <p className="m-0 whitespace-pre-wrap break-words border border-mt-regua-fina bg-mt-surface p-3 font-mono text-xs leading-relaxed text-mt-ink" data-exemplo>
            {campanha.exemplo}
          </p>
          <span className="text-[11px] tabular-nums text-mt-neutral-700">
            {numero(campanha.tamanho.caracteres)} caracteres · {campanha.tamanho.partes} SMS por destinatário
            {campanha.tamanho.unicode ? " · fora do alfabeto padrão" : ""}
          </span>
        </div>
      </section>

      {/* ── As ações ────────────────────────────────────────────────────────── */}
      <section aria-label="Envio" className={secao} data-acoes={situacao}>
        <h2 className={`${rotulo} m-0`}>ENVIO</h2>

        {(enviando || situacao === "enviando" || (processados > 0 && situacao !== "rascunho")) && (
          <div className="flex flex-col gap-1.5" data-progresso>
            <div
              role="progressbar"
              aria-label="Progresso do envio"
              aria-valuemin={0}
              aria-valuemax={resumo.publico}
              aria-valuenow={processados}
              aria-valuetext={`${numero(processados)} de ${numero(resumo.publico)}`}
              className="h-3 w-full border border-mt-regua bg-mt-bg"
            >
              <div className="h-full" style={{ width: `${taxa(processados, resumo.publico)}%`, background: "var(--cp-serie-fipe)" }} />
            </div>
            <span className="text-xs tabular-nums text-mt-ink" data-progresso-texto>
              {numero(processados)} de {numero(resumo.publico)} processados · {taxa(processados, resumo.publico)}%
              {resumo.falhas > 0 ? ` · ${numero(resumo.falhas)} ${resumo.falhas === 1 ? "falhou" : "falharam"}` : ""}
              {enviando ? " · enviando…" : ""}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {situacao === "rascunho" && !enviando && (
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={resumo.publico === 0}
              className="mt-btn mt-btn-primario mt-foco cursor-pointer px-6 py-3 text-[11px]"
              data-enviar
            >
              Enviar para {pessoas(resumo.publico)}
            </button>
          )}
          {situacao === "enviando" && !enviando && (
            <button type="button" onClick={() => void continuar()} disabled={interrompendo} className="mt-btn mt-btn-primario mt-foco cursor-pointer px-6 py-3 text-[11px]" data-continuar>
              Continuar envio
            </button>
          )}
          {(enviando || situacao === "enviando") && situacao !== "interrompida" && situacao !== "enviada" && (
            <button type="button" onClick={() => void interromper()} disabled={interrompendo} className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-5 py-3 text-[11px]" data-interromper>
              {interrompendo ? "Interrompendo…" : "Interromper"}
            </button>
          )}
          <button type="button" onClick={() => router.refresh()} className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-5 py-3 text-[11px]" data-atualizar>
            Atualizar
          </button>
        </div>

        {situacao === "rascunho" && !enviando && (
          <p className={dica}>
            {resumo.publico === 0
              ? "Esta campanha não tem destinatário. Crie outra com um recorte mais largo."
              : "Rascunho: o público já está congelado, e nada foi enviado. O envio pede confirmação."}
          </p>
        )}
        {enviando && <p className={dica}>Mantenha esta página aberta até o fim. Se ela fechar, o envio pausa e continua daqui, sem repetir ninguém.</p>}
        {situacao === "enviando" && !enviando && (
          <p className={dica}>O envio parou no meio (a página foi fechada, ou o fornecedor recusou um lote). Continuar não repete quem já recebeu.</p>
        )}
        {situacao === "enviada" && <p className={dica}>Envio concluído. Cliques, respostas e pedidos de saída continuam chegando: use Atualizar.</p>}
        {situacao === "interrompida" && <p className={dica}>Envio interrompido: quem estava na fila não recebeu, e a campanha não é retomada.</p>}

        {aviso && (
          <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.atencao }} data-aviso-do-lote>
            <SinalDeEstado estado="atencao" rotulo="Envio pausado" />
            <span>
              <strong>Envio pausado:</strong> {aviso}
            </span>
          </div>
        )}
        {erro && (
          <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-erro-do-envio>
            <SinalDeEstado estado="impeditivo" rotulo="Erro" />
            <span>{erro}</span>
          </div>
        )}
      </section>

      {/* ── O funil ─────────────────────────────────────────────────────────── */}
      <section aria-label="Funil da campanha" className={secao}>
        <h2 className={`${rotulo} m-0`}>FUNIL</h2>
        <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-5">
          {funil.map((f) => (
            <div key={f.chave} className="mt-cartao flex flex-col gap-0.5" data-etapa={f.chave}>
              <dt className={rotulo}>{f.rotulo.toUpperCase()}</dt>
              <dd className="mt-titulo m-0 text-3xl tabular-nums">{numero(f.valor)}</dd>
              <span className="text-[11px] tabular-nums text-mt-neutral-700">{f.pct === null ? f.base : `${f.pct}% ${f.base}`}</span>
            </div>
          ))}
        </dl>

        {/* Uma série, uma cor; todas as barras na mesma escala, a partir do zero (o público é 100%). */}
        <div
          role="img"
          aria-label={`Funil: ${funil.map((f) => `${f.rotulo} ${numero(f.valor)}`).join(", ")}`}
          className="flex flex-col gap-1.5"
          data-grafico-do-funil
        >
          {funil.map((f) => (
            <div key={f.chave} className="grid grid-cols-[104px_minmax(0,1fr)_56px] items-center gap-3 text-xs" data-barra={f.chave}>
              <span className="text-mt-neutral-800">{f.rotulo}</span>
              <span className="block h-4 border-l border-mt-regua">
                <span className="block h-full" style={{ width: `${Math.round((f.valor / escala) * 1000) / 10}%`, minWidth: f.valor > 0 ? 2 : 0, background: "var(--cp-serie-fipe)" }} />
              </span>
              <span className="text-right font-extrabold tabular-nums text-mt-ink">{numero(f.valor)}</span>
            </div>
          ))}
        </div>
        <p className={dica}>
          “Na operadora” é o último aviso que o fornecedor dá: a operadora recebeu a mensagem. Ele não confirma a entrega no
          aparelho. “Clicaram” conta pessoas, e não cliques ({numero(resumo.cliques)} {resumo.cliques === 1 ? "clique" : "cliques"} no total).
        </p>

        <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className={cartaoMenor} data-cartao="falhas">
            <dt className={rotulo}>FALHARAM</dt>
            <dd className="mt-titulo m-0 text-xl tabular-nums">{numero(resumo.falhas)}</dd>
            <span className="text-[11px] tabular-nums text-mt-neutral-700">{taxa(resumo.falhas, resumo.publico)}% do público · recusados, sem resposta ou fora da lista</span>
          </div>
          <div className={cartaoMenor} data-cartao="sairam">
            <dt className={rotulo}>SAÍRAM DA LISTA</dt>
            <dd className="mt-titulo m-0 text-xl tabular-nums">{numero(resumo.sairam)}</dd>
            <span className="text-[11px] tabular-nums text-mt-neutral-700">{taxa(resumo.sairam, resumo.enviados)}% dos enviados · não recebem mais SMS</span>
          </div>
          <div className={cartaoMenor} data-cartao="custo">
            <dt className={rotulo}>CUSTO</dt>
            <dd className="mt-titulo m-0 text-xl tabular-nums">{reais(resumo.custo)}</dd>
            <span className="text-[11px] text-mt-neutral-700">O que o fornecedor disse ter cobrado</span>
          </div>
          <div className={cartaoMenor} data-cartao="partes">
            <dt className={rotulo}>SMS COBRADOS</dt>
            <dd className="mt-titulo m-0 text-xl tabular-nums">{numero(resumo.partes)}</dd>
            <span className="text-[11px] text-mt-neutral-700">Partes: mensagem longa conta mais de um por pessoa</span>
          </div>
          <div className={cartaoMenor} data-cartao="leads-novos">
            <dt className={rotulo}>LEADS NOVOS PELO LINK</dt>
            <dd className="mt-titulo m-0 text-xl tabular-nums">{numero(campanha.leadsNovos)}</dd>
            <span className="break-all text-[11px] text-mt-neutral-700">
              Entraram no site com utm_campaign=<code className="font-mono">{campanha.utm}</code>
            </span>
          </div>
        </dl>
      </section>

      {/* ── Os destinatários ────────────────────────────────────────────────── */}
      <section aria-label="Destinatários" className={secao}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={`${rotulo} m-0`}>DESTINATÁRIOS</h2>
          <div role="radiogroup" aria-label="Filtrar destinatários" className="mt-seg flex-wrap">
            {FILTROS_DE_DESTINATARIO.map((f) => (
              <label key={f} className="mt-seg-opt tabular-nums">
                <input type="radio" name="filtro-de-destinatario" value={f} checked={filtro === f} onChange={() => setFiltro(f)} />
                {ROTULO_DO_FILTRO[f]} · {numero(contagem(f))}
              </label>
            ))}
          </div>
        </div>

        {campanha.envios.length === 0 ? (
          <p className="m-0 text-sm text-mt-neutral-800">Esta campanha não tem destinatário.</p>
        ) : linhas.length === 0 ? (
          <p className="m-0 text-sm text-mt-neutral-800" data-sem-linhas>
            Ninguém neste recorte ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-tabela min-w-[720px] text-xs" data-destinatarios>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Telefone</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Quando</th>
                  <th scope="col" className="mt-num text-right">Cliques</th>
                  <th scope="col">Resposta</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((e) => {
                  const estagio = estagioDoEnvio(e);
                  const quando = quandoDoEstagio(e);
                  const nome = e.primeiroNome || "Sem nome";
                  return (
                    <tr key={e.id} data-envio={e.id} data-estagio={estagio}>
                      <td>
                        {podeAbrirLead && e.leadId ? (
                          <Link href={`/admin/leads/${e.leadId}`} className="mt-foco font-extrabold text-mt-ink underline underline-offset-2">
                            {nome}
                          </Link>
                        ) : (
                          nome
                        )}
                      </td>
                      <td className="mt-num whitespace-nowrap">{e.telefoneMascarado}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <SinalDeEstado estado={SINAL_DO_ESTAGIO[estagio]} tamanho={16} rotulo={ROTULO_DO_ESTAGIO[estagio]} />
                          {ROTULO_DO_ESTAGIO[estagio]}
                        </span>
                      </td>
                      <td className="mt-num whitespace-nowrap">{quando ? dataHora(quando) : "—"}</td>
                      <td className="mt-num text-right">{e.cliques > 0 ? numero(e.cliques) : "—"}</td>
                      <td className="max-w-[320px] break-words">
                        {e.resposta ? `“${e.resposta}”` : e.situacao === "falhou" && e.erro ? <span className="text-mt-neutral-700">Erro: {e.erro}</span> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className={dica}>
          A situação é o ponto mais avançado a que cada pessoa chegou. Telefone e sobrenome não aparecem aqui: o contato fica na
          ficha do lead, para quem pode abri-la.
        </p>
      </section>
    </div>
  );
}

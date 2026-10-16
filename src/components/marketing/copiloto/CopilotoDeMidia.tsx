"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { EstadoDaChecagem } from "../../../lib/consultaDePlaca";
import {
  QUEM_PEDIU_SEM_NOME,
  ROTULO_DA_GRAVIDADE,
  ROTULO_DA_REGRA,
  ROTULO_DA_SITUACAO,
  ROTULO_DO_GRUPO,
  classificarTermo,
  descreverAcao,
  type Gravidade,
} from "../../../lib/copilotoDeMidia";
import type { AcaoNaTela, Leitura, LeituraDoCopiloto } from "../../../lib/copilotoDeMidia-servidor";
import SinalDeEstado, { COR_DO_ESTADO } from "../../admin/consulta/SinalDeEstado";
import { useConfirm } from "../../admin/ConfirmDialog";
import Evidencias from "./Evidencias";
import PedidoDeVerba from "./PedidoDeVerba";
import PropostasDoCopiloto from "./PropostasDoCopiloto";
import RegrasDoCopiloto from "./RegrasDoCopiloto";
import { SINAL_DA_GRAVIDADE, SINAL_DA_SITUACAO, diaMes, haQuanto, numero, quando, reais } from "./formato";

/**
 * `/admin/marketing/copiloto` — o Copiloto de Mídia (pedido do dono em
 * 14/10/2026, depois de uma semana de R$ 357 no Google sem conversão).
 *
 * Quem abre: Marketing ou Administrador. Quando: de manhã, depois do
 * diagnóstico diário que o script da conta manda (a hora está nas regras).
 * Que decisão sai: **aprovar ou recusar cada mudança proposta na conta** —
 * negativar termo, pausar grupo, cortar verba — e, quando a medição acusa
 * problema, consertar a medição antes de cortar qualquer coisa. Aumento de
 * verba o diagnóstico não propõe: uma pessoa o pede aqui (`PedidoDeVerba`), e
 * ele passa pela mesma aprovação.
 *
 * O script aplica o que foi aprovado na rodada seguinte (de hora em hora), lê
 * de volta da conta e devolve o resultado; o histórico mostra o que ele leu.
 */

const PAREDE_DE_TERMOS = 60;

export default function CopilotoDeMidia({ leitura, migracao }: { leitura: Leitura<LeituraDoCopiloto>; migracao: string }) {
  const [todosOsTermos, setTodosOsTermos] = useState(false);
  const dados = leitura.ok ? leitura.valor : null;
  const diag = dados?.diagnostico ?? null;
  const resumo = diag?.resumo ?? null;

  const avisos: Array<{ chave: string; estado: EstadoDaChecagem; rotulo: string; texto: ReactNode }> = [];
  if (!leitura.ok) {
    avisos.push({
      chave: leitura.faltaMigracao ? "migracao" : "leitura",
      estado: "impeditivo",
      rotulo: leitura.faltaMigracao ? "Configuração" : "Erro",
      texto: leitura.faltaMigracao ? (
        <>
          As tabelas do copiloto ainda não existem no banco. Aplique a migração <code className="font-mono">{migracao}</code> no Supabase
          e depois cole o script novo na conta do Google Ads.
        </>
      ) : (
        <>O copiloto não pôde ser lido: {leitura.motivo}</>
      ),
    });
  } else if (!diag) {
    avisos.push({
      chave: "sem-diagnostico",
      estado: "atencao",
      rotulo: "Atenção",
      texto: (
        <>
          Nenhum diagnóstico chegou ainda. Cole a versão nova de <code className="font-mono">scripts/google-ads-script.js</code> na conta do
          Google Ads (Ferramentas → Ações em massa → Scripts) e clique em “Visualizar”: a prévia manda o primeiro diagnóstico na hora.
        </>
      ),
    });
  }
  if (dados) {
    if (dados.scriptParado) {
      avisos.push({
        chave: "script-parado",
        estado: "impeditivo",
        rotulo: "Script",
        texto: dados.ultimaSincronizacao ? (
          <>O script da conta não sincroniza desde {quando(dados.ultimaSincronizacao)}. Enquanto ele não rodar, nada aprovado é aplicado.</>
        ) : (
          <>O script da conta nunca sincronizou. Enquanto ele não rodar, nada aprovado é aplicado.</>
        ),
      });
    }
  }
  if (diag?.previa) {
    avisos.push({
      chave: "previa",
      estado: "atencao",
      rotulo: "Prévia",
      texto: <>Este diagnóstico veio de um “Visualizar” no Google Ads. Os números são de verdade; a rodada automática traz o do dia.</>,
    });
  }
  for (const [secao, msg] of Object.entries(diag?.erros ?? {})) {
    avisos.push({
      chave: `erro-${secao}`,
      estado: "atencao",
      rotulo: "Leitura",
      texto: (
        <>
          O script não conseguiu ler <strong>{secao}</strong> da conta: {msg}. As regras que dependem disso não concluem nada hoje.
        </>
      ),
    });
  }

  // Já vêm do maior gasto para o menor (`lerCopiloto`). A classe é a das
  // regras de hoje, que podem ter mudado depois do diagnóstico.
  const regras = dados?.regras ?? null;
  const termos = (diag?.termos ?? []).map((t) => ({ ...t, classe: regras ? classificarTermo(t.termo, regras.parametros).grupo : null }));
  const agora = dados ? Date.parse(dados.lidoEm) : 0;

  return (
    <div className="mt-consulta mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="mt-rotulo">MARKETING</span>
        <h1 className="mt-titulo m-0 text-3xl md:text-4xl">Copiloto de Mídia</h1>
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-mt-neutral-800">
          Todo dia o script da conta do Google Ads manda o retrato dos últimos 7 dias: termos de pesquisa, verba, anúncios parados e
          medição. As regras viram propostas — negativar termo, pausar grupo, cortar verba —, e nada muda na conta sem aprovação aqui.
          Aumento de verba se pede aqui e passa pela mesma aprovação. O script aplica na rodada seguinte, lê de volta e registra.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums text-mt-neutral-700" data-pulso>
          {diag && (
            <span>
              Diagnóstico de {diaMes(diag.janela.de)} a {diaMes(diag.janela.ate)}, recebido {haQuanto(diag.recebidoEm, agora)}
            </span>
          )}
          {dados?.ultimaSincronizacao && <span>Script: última rodada {haQuanto(dados.ultimaSincronizacao, agora)}</span>}
          <Link href="/admin/marketing/midia-paga" className="mt-foco underline underline-offset-2">
            Mídia paga
          </Link>
        </div>
      </header>

      {avisos.length > 0 && (
        <div className="flex flex-col gap-2" data-avisos>
          {avisos.map((a) => (
            <div
              key={a.chave}
              role={a.estado === "impeditivo" ? "alert" : "status"}
              data-aviso={a.chave}
              className="flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs leading-relaxed text-mt-ink"
              style={{ borderColor: COR_DO_ESTADO[a.estado] }}
            >
              <SinalDeEstado estado={a.estado} rotulo={a.rotulo} />
              <span>
                <strong>{a.rotulo}:</strong> {a.texto}
              </span>
            </div>
          ))}
        </div>
      )}

      {resumo && (
        <section aria-label="Resumo dos 7 dias" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-resumo>
          <Numero rotulo="Gasto no Google" valor={reais(resumo.custo7)} detalhe={`${numero(resumo.cliques7)} cliques · ${numero(resumo.conversoes7)} conversões`} />
          <Numero
            rotulo="Em termos sem conversão"
            valor={reais(resumo.custoSemConversao)}
            detalhe={resumo.custo7 > 0 ? `${Math.round((resumo.custoSemConversao / resumo.custo7) * 100)}% do gasto da Pesquisa` : "—"}
          />
          <Numero
            rotulo="Leads com gclid"
            valor={`${numero(resumo.leads.comGclid)} de ${numero(resumo.leads.doSite)}`}
            detalhe={`leads do site no período (${numero(resumo.leads.total)} com o WhatsApp); conta gbraid e wbraid, o gclid do iPhone`}
          />
          <Numero
            rotulo="Medição"
            valor={resumo.medicaoConfiavel ? "Confiável" : "Com problema"}
            detalhe={resumo.medicaoConfiavel ? "Zero conversão é zero conversão." : "Sem pausa nem corte de verba até consertar."}
            estado={resumo.medicaoConfiavel ? "ok" : "impeditivo"}
          />
        </section>
      )}

      {dados && (
        <section aria-label="Para decidir" className="flex flex-col gap-4 border-t-2 border-mt-regua pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="mt-titulo m-0 text-xl">Para decidir</h2>
            <span className="text-xs text-mt-neutral-700">O aprovado vai para a conta na próxima rodada do script, e pode ser desfeito.</span>
          </div>
          <PropostasDoCopiloto abertas={dados.abertas} achados={dados.achados} agora={agora} />
          <PedidoDeVerba campanhas={dados.campanhas} />
        </section>
      )}

      {dados && dados.achados.length > 0 && (
        <section aria-label="Achados" className="flex flex-col gap-4 border-t-2 border-mt-regua pt-6">
          <h2 className="mt-titulo m-0 text-xl">Achados</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {dados.achados.map((a) => (
              <li key={a.id} className="mt-cartao flex flex-col gap-2" data-achado={a.regra} data-gravidade={a.gravidade}>
                <div className="flex items-start gap-3">
                  <SinalDeEstado estado={SINAL_DA_GRAVIDADE[a.gravidade as Gravidade]} tamanho={18} rotulo={`Gravidade ${ROTULO_DA_GRAVIDADE[a.gravidade]}`} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mt-neutral-700">
                      {ROTULO_DA_REGRA[a.regra]}
                      {a.grupo ? ` · ${ROTULO_DO_GRUPO[a.grupo]}` : ""} · {ROTULO_DA_GRAVIDADE[a.gravidade]}
                    </span>
                    <span className="text-sm font-extrabold text-mt-ink">{a.titulo}</span>
                    <span className="text-xs leading-relaxed text-mt-neutral-800">{a.detalhe}</span>
                  </div>
                </div>
                {Object.keys(a.evidencias ?? {}).length > 0 && (
                  <details className="pl-8 text-xs">
                    <summary className="mt-foco cursor-pointer select-none text-[11px] font-semibold text-mt-neutral-700">Ver os números</summary>
                    <div className="pt-2">
                      <Evidencias evidencias={a.evidencias} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {termos.length > 0 && (
        <section aria-label="Termos de pesquisa" className="flex flex-col gap-3 border-t-2 border-mt-regua pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="mt-titulo m-0 text-xl">Termos de pesquisa · 7 dias</h2>
            <span className="text-xs tabular-nums text-mt-neutral-700">
              {numero(termos.length)} termos com gasto, do maior para o menor
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-tabela min-w-[760px] text-xs" data-termos>
              <thead>
                <tr>
                  <th scope="col">Termo</th>
                  <th scope="col">Campanha</th>
                  <th scope="col">Classe</th>
                  <th scope="col" className="mt-num text-right">Gasto</th>
                  <th scope="col" className="mt-num text-right">Cliques</th>
                  <th scope="col" className="mt-num text-right">Conversões</th>
                </tr>
              </thead>
              <tbody>
                {(todosOsTermos ? termos : termos.slice(0, PAREDE_DE_TERMOS)).map((t, i) => (
                  <tr key={`${t.campanhaId}:${t.grupoId}:${t.termo}:${i}`}>
                    <td className="font-semibold text-mt-ink">
                      {t.termo}
                      {t.status && t.status.includes("EXCLUDED") && <span className="ml-2 text-[10px] font-normal text-mt-neutral-700">já negativado</span>}
                      {t.status === "ADDED" && <span className="ml-2 text-[10px] font-normal text-mt-neutral-700">é palavra-chave</span>}
                    </td>
                    <td>{t.campanha}</td>
                    <td>{t.classe ? ROTULO_DO_GRUPO[t.classe] : "—"}</td>
                    <td className="mt-num text-right">{reais(t.custo)}</td>
                    <td className="mt-num text-right">{numero(t.cliques)}</td>
                    <td className="mt-num text-right">{numero(t.conversoes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {termos.length > PAREDE_DE_TERMOS && (
            <button
              type="button"
              onClick={() => setTodosOsTermos((v) => !v)}
              className="mt-btn mt-btn-contorno mt-foco cursor-pointer self-start px-4 py-2 text-[10px]"
            >
              {todosOsTermos ? "Mostrar só os maiores" : `Mostrar os ${numero(termos.length)}`}
            </button>
          )}
        </section>
      )}

      {dados && dados.historico.length > 0 && (
        <section aria-label="Histórico" className="flex flex-col gap-3 border-t-2 border-mt-regua pt-6">
          <h2 className="mt-titulo m-0 text-xl">Histórico · 30 dias</h2>
          <Historico acoes={dados.historico} />
        </section>
      )}

      {dados?.regras && (
        <section aria-label="Regras do diagnóstico" className="flex flex-col gap-3 border-t-2 border-mt-regua pt-6">
          <details>
            <summary className="mt-foco cursor-pointer select-none">
              <h2 className="mt-titulo m-0 inline text-xl">Regras do diagnóstico</h2>
              <span className="ml-3 text-xs text-mt-neutral-700">
                {dados.regras.parametros.concorrentes.length} concorrente(s) · {dados.regras.parametros.cidadesFora.length} cidade(s) fora da área
              </span>
            </summary>
            <div className="pt-4">
              <RegrasDoCopiloto regras={dados.regras} />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, estado }: { rotulo: string; valor: string; detalhe: string; estado?: EstadoDaChecagem }) {
  return (
    <div className="mt-cartao flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mt-neutral-700">{rotulo}</span>
      <span className="inline-flex items-center gap-2 text-xl font-extrabold tabular-nums text-mt-ink">
        {estado && <SinalDeEstado estado={estado} tamanho={18} rotulo={valor} />}
        {valor}
      </span>
      <span className="text-[11px] leading-snug text-mt-neutral-700">{detalhe}</span>
    </div>
  );
}

function Historico({ acoes }: { acoes: AcaoNaTela[] }) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const desfazer = async (a: AcaoNaTela) => {
    const ok = await confirm({
      title: "Desfazer na conta",
      message: `${descreverAcao(a)} — o script faz o inverso na próxima rodada e lê de volta.`,
      confirmLabel: "Desfazer",
    });
    if (!ok) return;
    setOcupado(a.id);
    setErro(null);
    try {
      const res = await fetch("/api/marketing/copiloto/desfazer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErro(r.error || "O desfazer não foi gravado.");
      else router.refresh();
    } catch {
      setErro("Sem conexão com o servidor. Nada foi desfeito.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {erro && (
        <p role="alert" className="m-0 text-xs text-mt-ink">
          {erro}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="mt-tabela min-w-[860px] text-xs" data-historico>
          <thead>
            <tr>
              <th scope="col">Mudança</th>
              <th scope="col">Situação</th>
              <th scope="col">Quem decidiu</th>
              <th scope="col">O script leu de volta</th>
              <th scope="col">
                <span className="sr-only">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {acoes.map((a) => (
              <tr key={a.id} data-historico-acao={a.id}>
                <td className="text-mt-ink">
                  {descreverAcao(a)}
                  {a.desfazAcaoId && <div className="text-[11px] text-mt-neutral-700">desfazer</div>}
                  {a.pedido && <div className="text-[11px] text-mt-neutral-700">pedido de {a.pedidaPorNome ?? QUEM_PEDIU_SEM_NOME}</div>}
                </td>
                <td>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <SinalDeEstado estado={SINAL_DA_SITUACAO[a.situacao]} tamanho={16} rotulo={ROTULO_DA_SITUACAO[a.situacao]} />
                    {ROTULO_DA_SITUACAO[a.situacao]}
                  </span>
                  {a.concluidaEm && <div className="text-[11px] tabular-nums text-mt-neutral-700">{quando(a.concluidaEm)}</div>}
                </td>
                <td>
                  {a.decididaPorNome ?? "—"}
                  {a.decididaEm && <div className="text-[11px] tabular-nums text-mt-neutral-700">{quando(a.decididaEm)}</div>}
                </td>
                <td className="text-[11px] leading-snug">
                  {a.erro ? a.erro : a.lidoDeVolta && Object.keys(a.lidoDeVolta).length > 0 ? lido(a.lidoDeVolta) : "—"}
                </td>
                <td className="text-right">
                  {a.situacao === "aplicada" && !a.desfeita && (
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => void desfazer(a)}
                      className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[10px]"
                      data-desfazer
                    >
                      {ocupado === a.id ? "…" : "Desfazer"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** O que o script leu, em português. */
function lido(l: Record<string, unknown>): string {
  if (typeof l.verba === "number") return `verba de ${reais(l.verba)} por dia`;
  if (l.negativa === true) return "a negativa está na campanha";
  if (l.negativa === false) return "a negativa não está mais na campanha";
  if (l.situacao === "PAUSED") return "o grupo está pausado";
  if (l.situacao === "ENABLED") return "o grupo está ativo";
  return JSON.stringify(l);
}

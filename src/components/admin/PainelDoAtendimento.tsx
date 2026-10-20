"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ROTULO_DO_MOTIVO_DA_ENTREGA, type PesosDoAquecimento } from "../../lib/aquecimento";
import {
  NOMES_DAS_CADENCIAS,
  QUANDO_A_CADENCIA_COMECA,
  ROTULO_DA_CADENCIA,
  type ReguaDeCadencias,
} from "../../lib/cadencias";
import type { ConfigDoAtendimento } from "../../lib/configDoAtendimento";
import { formatarPrazo } from "../../lib/funil";
import type { RelatorioDoAtendimento } from "../../lib/relatorioDoAtendimento";
import { Segmentado } from "./SegmentadoDoPainel";
import FotosDoEstoque from "./atendimento/FotosDoEstoque";

/**
 * Leads → Atendimento IA (2026-10-20).
 *
 * Quem abre: o dono e o gestor, no começo do dia, para ver de onde vieram os
 * leads, o que o assistente entregou e se a equipe atendeu; o vendedor, para
 * ver os próprios números (a rota recorta pelo escopo). E o dono, uma vez,
 * para LIGAR o assistente depois de conferir a configuração.
 *
 * Três abas: Desempenho (todos que veem lead), Configuração e Fotos (Admin e
 * Gestor — as duas só aparecem se a rota de configuração responder). Fotos é
 * onde se confere e corrige como o modelo de visão separou as fotos de cada
 * carro em camadas.
 */

type Aba = "desempenho" | "configuracao" | "fotos";

interface RespostaDoRelatorio extends RelatorioDoAtendimento {
  veAEquipe: boolean;
  avisos: string[];
  migracaoPendente?: boolean;
  aviso?: string;
}

interface RespostaDaConfig {
  config: ConfigDoAtendimento;
  fabrica: ConfigDoAtendimento;
  integracoes: { deepseek: boolean; evolution: boolean; n8n: boolean };
  migracaoPendente?: boolean;
  aviso?: string;
}

const PERIODOS = [7, 30, 90] as const;

const ROTULO_DO_PESO: Record<keyof PesosDoAquecimento, string> = {
  interesse_especifico: "Carro definido",
  interesse_generico: "Só a categoria ou o tipo",
  orcamento: "Disse quanto quer gastar",
  pagamento: "Disse a forma de pagamento",
  entrada: "Disse a entrada",
  troca: "Ofereceu carro na troca",
  prazo_imediato: "Prazo: até 15 dias",
  prazo_este_mes: "Prazo: este mês",
  prazo_proximos_meses: "Prazo: próximos meses",
  prazo_sem_pressa: "Prazo: sem pressa",
  quer_visitar: "Quer visitar ou fazer test-drive",
  visita_combinada: "Combinou o dia da visita",
  pediu_condicao: "Pediu desconto, avaliação ou financiamento",
  engajamento: "Mandou 3 mensagens ou mais",
  so_pesquisando: "Disse que só está pesquisando",
  desinteresse: "Mostrou desinteresse",
};

const FAIXA_DE_ERRO = "border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800";
const FAIXA_DE_AVISO = "border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800";
const CAMPO = "mt-foco border border-mt-regua bg-mt-surface px-2.5 py-2 text-[13px] text-mt-ink";

const minutos = (m: number | null) => (m === null ? "sem registro" : formatarPrazo(m));
const porcento = (n: number) => `${Math.round(n)}%`;

export default function PainelDoAtendimento() {
  const [aba, setAba] = useState<Aba>("desempenho");
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [relatorio, setRelatorio] = useState<RespostaDoRelatorio | null>(null);
  const [erroDoRelatorio, setErroDoRelatorio] = useState("");
  const [config, setConfig] = useState<RespostaDaConfig | null>(null);
  const [erroDaConfig, setErroDaConfig] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/atendimento/relatorio?dias=${dias}`, { cache: "no-store" })
      .then(async (r) => {
        const corpo = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok) {
          setErroDoRelatorio(corpo?.error ?? "Não deu para ler o relatório.");
          return;
        }
        setErroDoRelatorio("");
        setRelatorio(corpo);
      })
      .catch(() => {
        if (vivo) setErroDoRelatorio("Não deu para ler o relatório.");
      });
    return () => {
      vivo = false;
    };
  }, [dias]);

  useEffect(() => {
    // Quem não configura recebe 403 — e a aba simplesmente não aparece. Outra
    // falha, para quem configura, vira aviso: sumir com a aba em silêncio
    // deixava o dono procurando onde ligar o assistente (teste de 20/10/2026).
    void fetch("/api/atendimento/config", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) {
          setConfig(await r.json());
          return;
        }
        if (r.status === 403) return;
        const corpo = await r.json().catch(() => null);
        setErroDaConfig(corpo?.error ? `${corpo.error} (HTTP ${r.status})` : `HTTP ${r.status}`);
      })
      .catch(() => setErroDaConfig("sem resposta do servidor"));
  }, []);

  const abas = [
    { valor: "desempenho" as const, rotulo: "Desempenho" },
    ...(config
      ? [
          { valor: "configuracao" as const, rotulo: "Configuração" },
          { valor: "fotos" as const, rotulo: "Fotos" },
        ]
      : []),
  ];

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Leads</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Atendimento IA</h1>
          <p className="mt-1 max-w-[660px] text-sm text-mt-neutral-800">
            O assistente atende o WhatsApp da loja, qualifica e só passa ao vendedor o lead que esquentou. Aqui ficam
            de onde os leads vieram, como a equipe recebeu o que ele entregou e a configuração dele.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config && (
            <span
              className={`border px-2 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] ${
                config.config.ativo ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800" : "border-mt-regua-fina text-mt-neutral-700"
              }`}
            >
              {config.config.ativo ? "Assistente ligado" : "Assistente desligado"}
            </span>
          )}
          <Link href="/admin/leads" className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]">
            Voltar ao quadro
          </Link>
        </div>
      </div>

      {erroDaConfig && (
        <div role="alert" className={FAIXA_DE_ERRO} data-erro-da-config>
          Não deu para ler a configuração do assistente: {erroDaConfig}. As abas Configuração e Fotos voltam quando ela
          responder.
        </div>
      )}

      {config && !config.config.ativo && aba !== "configuracao" && (
        <div className={`${FAIXA_DE_AVISO} flex flex-wrap items-center justify-between gap-3`} data-assistente-desligado>
          <span>
            <strong>O assistente está desligado</strong> — ele não responde ninguém no WhatsApp até ser ligado.
          </span>
          <button type="button" onClick={() => setAba("configuracao")} className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-2 text-[11px]">
            Ligar em Configuração
          </button>
        </div>
      )}

      {abas.length > 1 && <Segmentado rotulo="Seção" opcoes={abas} valor={aba} aoEscolher={setAba} />}

      {aba === "desempenho" && (
        <Desempenho
          dias={dias}
          aoMudarDias={setDias}
          relatorio={relatorio}
          erro={erroDoRelatorio}
        />
      )}
      {aba === "configuracao" && config && <Configuracao inicial={config} aoGravar={setConfig} />}
      {aba === "fotos" && config && <FotosDoEstoque />}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Desempenho
// ----------------------------------------------------------------------------

function Desempenho({
  dias,
  aoMudarDias,
  relatorio,
  erro,
}: {
  dias: number;
  aoMudarDias: (d: (typeof PERIODOS)[number]) => void;
  relatorio: RespostaDoRelatorio | null;
  erro: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={dias === p}
            onClick={() => aoMudarDias(p)}
            className={`mt-foco cursor-pointer border px-3 py-2 text-[11px] ${
              dias === p ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800" : "border-mt-regua-fina text-mt-neutral-700 hover:border-mt-accent"
            }`}
          >
            {p} dias
          </button>
        ))}
      </div>

      {erro && <div className={FAIXA_DE_ERRO}>{erro}</div>}
      {relatorio?.migracaoPendente && <div className={FAIXA_DE_AVISO}>{relatorio.aviso}</div>}
      {relatorio?.avisos?.map((a) => (
        <div key={a} className={FAIXA_DE_AVISO}>
          {a}
        </div>
      ))}

      {!relatorio && !erro && <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando…</div>}

      {relatorio && !relatorio.migracaoPendente && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">O assistente</h2>
            <div className="grid grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-5">
              <Numero rotulo="Conversas" valor={String(relatorio.assistente.conversas)} nota={`${relatorio.assistente.respostas} respostas enviadas`} />
              <Numero
                rotulo="Entregues"
                valor={String(relatorio.assistente.entregues)}
                nota={`${porcento(relatorio.assistente.taxa_de_entrega)} das conversas`}
              />
              <Numero
                rotulo="Até a entrega"
                valor={relatorio.assistente.ate_a_entrega_mediana === null ? "—" : formatarPrazo(relatorio.assistente.ate_a_entrega_mediana)}
                nota="mediana, do primeiro contato"
              />
              <Numero
                rotulo="Custo do modelo"
                valor={`US$ ${relatorio.assistente.custo_estimado_usd.toFixed(2)}`}
                nota={`${relatorio.assistente.chamadas_ao_modelo} chamadas · estimativa fora do pico`}
              />
              <Numero rotulo="Pediram para parar" valor={String(relatorio.assistente.optouts)} nota="opt-out" />
            </div>
            {Object.keys(relatorio.assistente.por_motivo).length > 0 && (
              <p className="m-0 text-[11px] text-mt-neutral-700">
                Por que entregou:{" "}
                {Object.entries(relatorio.assistente.por_motivo)
                  .map(([motivo, n]) => `${motivo === "painel" ? "pelo painel" : ROTULO_DO_MOTIVO_DA_ENTREGA[motivo as keyof typeof ROTULO_DO_MOTIVO_DA_ENTREGA]?.toLowerCase() ?? motivo} (${n})`)
                  .join(" · ")}
              </p>
            )}
            <p className="m-0 text-[11px] text-mt-neutral-700 tabular-nums">
              Leads abertos do período por temperatura: quentes {relatorio.temperatura.quente} · mornos {relatorio.temperatura.morno} · frios{" "}
              {relatorio.temperatura.frio} · sem leitura {relatorio.temperatura.sem_leitura}
            </p>
          </section>

          <Tabela
            titulo="De onde vieram"
            colunas={["Origem", "Leads", "Com o assistente", "Quentes", "Entregues", "Ganhos", "Perdidos", "Conversão"]}
            linhas={relatorio.origens.map((o) => [
              o.origem,
              o.leads,
              o.conversaram,
              o.quentes,
              o.entregues,
              o.ganhos,
              o.perdidos,
              porcento(o.conversao),
            ])}
            vazio="Nenhum lead no período."
            nota="Conversão: ganhos ÷ (ganhos + perdidos), a régua do funil. “Anúncio → WhatsApp” é a conversa que nasceu de anúncio de clique para o WhatsApp."
          />

          <Tabela
            titulo={relatorio.veAEquipe ? "A equipe com os leads do assistente" : "Os leads que o assistente te entregou"}
            colunas={["Vendedor", "Recebidos", "Confirmou o aviso", "Tempo até confirmar", "Tempo até o 1º contato", "Sem contato", "Ganhos", "Perdidos", "Conversão"]}
            linhas={relatorio.equipe.map((v) => [
              v.vendedor,
              v.recebidos,
              v.confirmados,
              minutos(v.confirmacao_mediana),
              minutos(v.primeiro_contato_mediana),
              v.sem_contato,
              v.ganhos,
              v.perdidos,
              porcento(v.conversao),
            ])}
            vazio="Nenhum lead entregue pelo assistente no período."
            nota="Confirmou: respondeu ao resumo no WhatsApp da loja. Primeiro contato: o primeiro atendimento registrado depois do aviso (resposta pelo painel, pelo celular da loja ou registro no lead). Quem atende do próprio número aparece aqui quando registra o contato."
          />

          <section className="flex flex-col gap-2">
            <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">Cadências de reaquecimento</h2>
            <div className="grid grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-4">
              <Numero rotulo="Toques enviados" valor={String(relatorio.cadencias.toques)} />
              <Numero rotulo="Leads tocados" valor={String(relatorio.cadencias.leads_tocados)} />
              <Numero rotulo="Reaquecidos" valor={String(relatorio.cadencias.reaquecidos)} nota="responderam depois do toque" />
              <Numero rotulo="Em andamento" valor={String(relatorio.cadencias.em_andamento)} nota="com toque marcado agora" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="border-b border-mt-regua-fina py-4 pr-4 lg:border-b-0 lg:border-r lg:pl-4 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
      <div className="mt-rotulo">{rotulo}</div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums">{valor}</div>
      {nota && <div className="mt-1 text-[10px] text-mt-neutral-600">{nota}</div>}
    </div>
  );
}

function Tabela({
  titulo,
  colunas,
  linhas,
  vazio,
  nota,
}: {
  titulo: string;
  colunas: string[];
  linhas: (string | number)[][];
  vazio: string;
  nota?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="m-0 border border-dashed border-mt-regua-fina bg-mt-surface p-4 text-xs text-mt-neutral-700">{vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[12px]">
            <thead>
              <tr className="border-b border-mt-regua-fina text-[10px] uppercase tracking-[.08em] text-mt-neutral-600">
                {colunas.map((c, i) => (
                  <th key={c} className={`py-2 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={String(l[0])} className="border-b border-mt-regua-fina">
                  {l.map((celula, i) => (
                    <td key={i} className={`py-2 ${i === 0 ? "text-left font-semibold" : "text-right tabular-nums"}`}>
                      {celula}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nota && <p className="m-0 text-[10px] leading-relaxed text-mt-neutral-600">{nota}</p>}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Configuração
// ----------------------------------------------------------------------------

function Configuracao({ inicial, aoGravar }: { inicial: RespostaDaConfig; aoGravar: (r: RespostaDaConfig) => void }) {
  const [c, setC] = useState<ConfigDoAtendimento>(inicial.config);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const integracoes = inicial.integracoes;
  const faltam = [
    !integracoes.deepseek && "DEEPSEEK_API_KEY (o modelo)",
    !integracoes.evolution && "EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCIA (o WhatsApp da loja)",
    !integracoes.n8n && "ATENDIMENTO_MOTOR_TOKEN (a porta do n8n)",
  ].filter(Boolean) as string[];

  const mudar = <K extends keyof ConfigDoAtendimento>(campo: K, valor: ConfigDoAtendimento[K]) => {
    setOk("");
    setC((atual) => ({ ...atual, [campo]: valor }));
  };
  const mudarCadencia = (nome: keyof ReguaDeCadencias, mudanca: (atual: ReguaDeCadencias[typeof nome]) => ReguaDeCadencias[typeof nome]) =>
    mudar("cadencias", { ...c.cadencias, [nome]: mudanca(c.cadencias[nome]) });

  /** `ativo` explícito: o botão de ligar/desligar grava na hora, com o resto da tela. */
  async function gravar(ativo: boolean = c.ativo) {
    if (ativo && !inicial.config.ativo && faltam.length > 0) {
      setErro(`Antes de ligar, configure na Vercel: ${faltam.join("; ")}.`);
      return;
    }
    setGravando(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/atendimento/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo,
          nome_do_assistente: c.nome_do_assistente,
          apresentacao: c.apresentacao,
          informar_preco: c.informar_preco,
          avisar_a_partir: c.avisar_a_partir,
          distribuicao: c.distribuicao,
          limiar_morno: c.limiares.morno,
          limiar_quente: c.limiares.quente,
          pesos: c.pesos,
          regras_da_loja: c.regras_da_loja,
          cadencias: c.cadencias,
        }),
      });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error(corpo?.error ?? "Não deu para gravar.");
      setC(corpo.config);
      aoGravar({ ...inicial, config: corpo.config, integracoes: corpo.integracoes ?? inicial.integracoes });
      setOk(
        corpo.config.ativo && !inicial.config.ativo
          ? "Assistente ligado. Ele responde a partir da próxima mensagem."
          : !corpo.config.ativo && inicial.config.ativo
            ? "Assistente desligado. Os leads que estavam com ele voltam para a equipe."
            : "Gravado. Vale a partir da próxima mensagem.",
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para gravar.");
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-8">
      {inicial.migracaoPendente && <div className={FAIXA_DE_AVISO}>{inicial.aviso}</div>}
      {faltam.length > 0 && (
        <div className={FAIXA_DE_AVISO}>
          Falta configurar na Vercel: {faltam.join("; ")}. Sem isso o assistente não responde — e, se ligado, devolve
          cada lead à equipe com o motivo.
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">Ligar</h2>
        <div className="flex flex-wrap items-center gap-4 text-[13px]" data-ligar>
          <span
            className={`border px-2 py-1 text-[10px] font-extrabold uppercase tracking-[.1em] ${
              inicial.config.ativo ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800" : "border-mt-regua-fina text-mt-neutral-700"
            }`}
          >
            {inicial.config.ativo ? "Ligado" : "Desligado"}
          </span>
          <button
            type="button"
            onClick={() => void gravar(!inicial.config.ativo)}
            disabled={gravando}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-60"
          >
            {inicial.config.ativo ? "Desligar o assistente" : "Ligar o assistente"}
          </button>
          <span className="max-w-[460px] text-mt-neutral-700">
            Grava na hora, junto com o resto desta tela. Ligado, ele responde o WhatsApp da loja — mensagem a cliente de
            verdade — e, enquanto qualifica, o prazo do funil não conta para o vendedor.
          </span>
        </div>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">Nome do assistente</span>
          <input value={c.nome_do_assistente} maxLength={40} onChange={(e) => mudar("nome_do_assistente", e.target.value)} className={`${CAMPO} max-w-[240px]`} />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">Como ele se apresenta</span>
          <input
            value={c.apresentacao}
            maxLength={160}
            placeholder="a versão digital do …"
            onChange={(e) => mudar("apresentacao", e.target.value)}
            className={`${CAMPO} max-w-[480px]`}
          />
          <span className="text-[11px] text-mt-neutral-700">
            Vem depois do nome: &ldquo;{c.nome_do_assistente}{c.apresentacao.trim() ? `, ${c.apresentacao.trim()}` : ""}&rdquo;. Ele sempre diz que é um assistente virtual se perguntarem.
          </span>
        </label>
        <label className="flex items-start gap-3 text-[13px]">
          <input type="checkbox" checked={c.informar_preco} onChange={(e) => mudar("informar_preco", e.target.checked)} className="mt-1" />
          <span>
            Informar o preço anunciado do catálogo.{" "}
            <span className="text-mt-neutral-700">
              Desligado, o assistente diz que a equipe passa o valor — e nenhum balão sai com valor que o cliente não disse.
              Desconto, parcela e avaliação da troca ele nunca decide.
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">Quando o lead vai ao vendedor</h2>
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span>Avisar a partir de</span>
          <Segmentado
            rotulo="Avisar a partir de"
            opcoes={[
              { valor: "morno", rotulo: "Morno" },
              { valor: "quente", rotulo: "Quente" },
            ]}
            valor={c.avisar_a_partir === "morno" ? "morno" : "quente"}
            aoEscolher={(v) => mudar("avisar_a_partir", v)}
          />
        </div>
        <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
          Pedir para falar com uma pessoa, ou pedir desconto, avaliação ou financiamento, entrega na hora com qualquer nota.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span>Lead sem responsável</span>
          <Segmentado
            rotulo="Distribuição"
            opcoes={[
              { valor: "administrador", rotulo: "O administrador escolhe" },
              { valor: "rodizio", rotulo: "Rodízio automático" },
            ]}
            valor={c.distribuicao}
            aoEscolher={(v) => mudar("distribuicao", v)}
          />
        </div>
        <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
          {c.distribuicao === "administrador"
            ? "O resumo vai a quem distribui e ao gestor; quando o responsável for escolhido no painel, o resumo segue para ele."
            : "O vendedor ativo com menos leads abertos recebe na hora, com o resumo no WhatsApp."}{" "}
          Fora das 8h às 20h, e aos domingos, o aviso espera a abertura.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">Morno a partir de</span>
            <input
              type="number"
              min={1}
              max={99}
              value={c.limiares.morno}
              onChange={(e) => mudar("limiares", { ...c.limiares, morno: Number(e.target.value) })}
              className={`${CAMPO} w-24 tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">Quente a partir de</span>
            <input
              type="number"
              min={2}
              max={100}
              value={c.limiares.quente}
              onChange={(e) => mudar("limiares", { ...c.limiares, quente: Number(e.target.value) })}
              className={`${CAMPO} w-24 tabular-nums`}
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">Quanto cada coisa esquenta</h2>
        <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
          A nota é a soma do que o cliente disse (0 a 100). O modelo só preenche a ficha; quem soma é esta tabela, e cada
          ponto aparece como motivo na aba Aquecimento do lead.
        </p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {(Object.keys(ROTULO_DO_PESO) as (keyof PesosDoAquecimento)[]).map((chave) => (
            <label key={chave} className="flex items-center justify-between gap-3 border-b border-mt-regua-fina py-1.5 text-[12px]">
              <span>{ROTULO_DO_PESO[chave]}</span>
              <input
                type="number"
                min={-100}
                max={100}
                value={c.pesos[chave]}
                onChange={(e) => mudar("pesos", { ...c.pesos, [chave]: Number(e.target.value) })}
                className={`${CAMPO} w-20 text-right tabular-nums`}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">O que a loja quer que o assistente saiba</h2>
        <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
          O estoque, a garantia, o financiamento, o endereço e o horário ele já lê do site. Aqui vai o que não está lá:
          política de troca, documentos para financiar, um jeito de falar.
        </p>
        <textarea
          rows={6}
          maxLength={4000}
          value={c.regras_da_loja}
          onChange={(e) => mudar("regras_da_loja", e.target.value)}
          className={`${CAMPO} w-full resize-y`}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="mt-rotulo border-b border-mt-regua-fina pb-2">Cadências de reaquecimento</h2>
        <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
          No máximo três toques, só no horário da loja, e só para quem escreveu para a loja. Param quando o cliente
          responde ou pede para sair. O assistente escreve cada toque a partir do texto abaixo; sem o modelo, sai o texto
          como está. Use {"{nome}"} e {"{interesse}"}.
        </p>
        {NOMES_DAS_CADENCIAS.map((nome) => (
          <fieldset key={nome} className="m-0 flex flex-col gap-2 border border-mt-regua-fina p-4">
            <legend className="px-1 text-[12px] font-extrabold">{ROTULO_DA_CADENCIA[nome]}</legend>
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={c.cadencias[nome].ativa}
                onChange={(e) => mudarCadencia(nome, (atual) => ({ ...atual, ativa: e.target.checked }))}
              />
              Ligada · {QUANDO_A_CADENCIA_COMECA[nome]}
            </label>
            {c.cadencias[nome].passos.map((passo, i) => (
              <div key={i} className="flex flex-col gap-1 border-t border-mt-regua-fina pt-2 sm:flex-row sm:items-start sm:gap-3">
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-mt-neutral-700">
                  Toque {i + 1}, depois de
                  <input
                    type="number"
                    min={1}
                    max={2160}
                    value={passo.apos_horas}
                    onChange={(e) =>
                      mudarCadencia(nome, (atual) => ({
                        ...atual,
                        passos: atual.passos.map((p, j) => (j === i ? { ...p, apos_horas: Number(e.target.value) } : p)),
                      }))
                    }
                    className={`${CAMPO} w-20 tabular-nums`}
                  />
                  h
                </label>
                <textarea
                  rows={2}
                  maxLength={600}
                  value={passo.modelo}
                  aria-label={`Texto do toque ${i + 1} de ${ROTULO_DA_CADENCIA[nome]}`}
                  onChange={(e) =>
                    mudarCadencia(nome, (atual) => ({
                      ...atual,
                      passos: atual.passos.map((p, j) => (j === i ? { ...p, modelo: e.target.value } : p)),
                    }))
                  }
                  className={`${CAMPO} w-full resize-y`}
                />
              </div>
            ))}
          </fieldset>
        ))}
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t-2 border-mt-regua bg-mt-bg py-4">
        <button
          type="button"
          onClick={() => void gravar()}
          disabled={gravando}
          className="mt-btn mt-btn-primario mt-foco px-5 py-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {gravando ? "GRAVANDO…" : "GRAVAR →"}
        </button>
        <button type="button" onClick={() => setC(inicial.fabrica)} className="mt-foco cursor-pointer border border-mt-regua-fina bg-transparent px-3 py-2 text-[11px] text-mt-neutral-800 hover:border-mt-accent">
          Voltar aos valores de fábrica
        </button>
        {inicial.config.atualizado_em && (
          <span className="text-[11px] text-mt-neutral-600">
            Última mudança {new Date(inicial.config.atualizado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            {inicial.config.atualizado_por ? ` por ${inicial.config.atualizado_por}` : ""}
          </span>
        )}
        {erro && <span role="alert" className="text-[12px] text-mt-accent-800">{erro}</span>}
        {ok && <span className="text-[12px] text-mt-neutral-800">{ok}</span>}
      </div>
    </div>
  );
}

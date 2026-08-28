"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SEM_DONO,
  filtrarPorResponsavel,
  iniciais,
  opcoesDeResponsavel,
} from "../../lib/leadsKanban";
import {
  ETAPAS_PADRAO,
  espera,
  etapasVisiveis,
  formatarPrazo,
  linkDeConversa,
  mensagemParaCliente,
  minutosParado,
  nivelDeEstagnacao,
  ordenarEtapas,
  type EtapaDoFunil,
  type LeadDoFunil,
  type MotivoDoFunil,
  type NivelDeEstagnacao,
} from "../../lib/funil";
import ModalDeDesfecho, { type DesfechoEscolhido } from "./ModalDeDesfecho";

/**
 * Tela A8 do design doc — o funil de leads.
 *
 * Fonte: a tabela `leads` (migração 20260807210000), alimentada por
 * `/api/leads` a cada formulário enviado no site.
 *
 * ---------------------------------------------------------------------------
 * O que mudou em 2026-08-28, e por quê
 * ---------------------------------------------------------------------------
 * O dono pediu cinco coisas de uma vez. Quatro tocam esta tela:
 *
 * 1. **As colunas vêm do banco.** Antes eram um `const ETAPAS` aqui dentro,
 *    espelhando um `check` no Postgres — mudar o funil exigia deploy E
 *    migração, na ordem certa. Agora vêm de `funil_etapas` junto com os leads,
 *    na MESMA resposta: buscar em duas chamadas desenharia, por um instante, o
 *    funil errado, e um lead numa coluna que a tela ainda não conhece não tem
 *    onde cair.
 *
 * 2. **Ganho e perdido pedem motivo.** Arrastar para a coluna terminal abre a
 *    caixa de motivos; sem escolha, o card volta. É a única forma de o
 *    relatório de perdas existir — motivo opcional é motivo vazio.
 *
 * 3. **A navegação ganhou uma barra.** *"uma barra de slide seria ideal além
 *    das setas"*. São três formas de andar pelo funil convivendo: o trilho de
 *    etapas (clique e vá), a barra (arraste contínuo) e as setas do card
 *    (mova o lead). Cada uma serve a um gesto diferente, e a do meio é a que
 *    faltava no tablet de balcão, onde a rolagem lateral com o dedo compete
 *    com o arrastar do card.
 *
 * 4. **O WhatsApp saiu do texto e virou botão.** *"um atalho para falar com o
 *    cliente pelo whatsapp direto do card"*. Com a mensagem já escrita, e —
 *    esta é a parte que não se vê — registrando o contato: abrir a conversa
 *    reinicia o relógio da estagnação, para o vendedor não ser cobrado por
 *    não ter feito o que acabou de fazer.
 *
 * ---------------------------------------------------------------------------
 * O que continua igual, de propósito
 * ---------------------------------------------------------------------------
 * **Arrastar E setas.** O desenho pede arrastar; `dnd` nativo não funciona no
 * toque nem no teclado, e esta tela roda no tablet de balcão da loja. As duas
 * formas convivem. Tirar as setas quebraria o tablet sem ninguém perceber,
 * porque não é erro, é ausência.
 */

interface Lead extends LeadDoFunil {
  telefone: string | null;
  interesse: string | null;
  canal: string | null;
  responsavel: string | null;
  observacoes: string | null;
  /** `created_at`, não `criado_em`: a tabela é preexistente e já usava esse
   *  nome — ver a nota na migração 20260807210000. */
  created_at: string;
}

/** Telefone só com dígitos → (41) 99999-9999. */
function formatarTelefone(t: string | null): string {
  if (!t) return "";
  const d = t.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/** A moldura do card, por nível de apodrecimento. Régua, nunca sombra. */
const MOLDURA: Record<NivelDeEstagnacao, string> = {
  ok: "border-mt-regua-fina bg-mt-surface",
  atencao: "border-mt-regua-fina border-l-[3px] border-l-mt-neutral-600 bg-mt-surface",
  estagnado: "border-mt-regua-fina border-l-[3px] border-l-mt-accent bg-mt-accent-100",
  transferir: "border-mt-accent border-l-[3px] border-l-mt-accent bg-mt-accent-100",
};

const AVISO: Record<NivelDeEstagnacao, string | null> = {
  ok: null,
  atencao: "esfriando",
  estagnado: "parado",
  transferir: "vai passar para outro vendedor",
};

export default function LeadsKanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [atendentes, setAtendentes] = useState<string[]>([]);
  const [etapas, setEtapas] = useState<EtapaDoFunil[]>(ETAPAS_PADRAO);
  const [motivos, setMotivos] = useState<MotivoDoFunil[]>([]);
  const [podeConfigurar, setPodeConfigurar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [agregado, setAgregado] = useState<{ total: number; porSituacao: Record<string, number> } | null>(null);

  const [filtroResponsavel, setFiltroResponsavel] = useState("");
  const [soParados, setSoParados] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [anotando, setAnotando] = useState<string | null>(null);
  const [fechando, setFechando] = useState<{ lead: Lead; etapa: EtapaDoFunil } | null>(null);

  const trilho = useRef<HTMLDivElement>(null);
  const colunas = useRef<Record<string, HTMLDivElement | null>>({});
  const [progresso, setProgresso] = useState(0);
  const [rolavel, setRolavel] = useState(false);

  // O relógio só anda quando a tela repinta, e o kanban fica aberto o dia
  // inteiro no balcão. Sem este tique, um card que apodrece às 14h continua
  // branco até alguém recarregar — e a cor que ninguém vê mudar não avisa
  // nada. Um minuto é a menor unidade que a tela mostra.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/leads/gerenciar");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Falha ao carregar leads");
      if (d.migracaoPendente) {
        setMigracaoPendente(true);
      } else if (d.somenteAgregado) {
        setAgregado({ total: d.total, porSituacao: d.porSituacao });
      } else {
        setLeads(d.leads ?? []);
        setAtendentes((d.atendentes ?? []).map((a: { nome: string }) => a.nome));
        // Sem `funil_etapas` no banco, o funil de sempre. Uma tela sem coluna
        // nenhuma faria os leads sumirem — ausência sem erro, de novo não.
        setEtapas(d.etapas?.length ? ordenarEtapas(d.etapas) : ETAPAS_PADRAO);
        setMotivos(d.motivos ?? []);
        setPodeConfigurar(Boolean(d.podeConfigurar));
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Grava um campo do lead. Otimista: a tela reage na hora e recarrega do
   * servidor se der errado — o inverso (esperar a rede) faz o card "pular"
   * de volta e parecer que o clique não pegou.
   */
  const salvar = useCallback(
    async (id: string, campos: Record<string, unknown>) => {
      // `contato` é uma AÇÃO, não um campo do lead: ele vai no corpo do PATCH
      // e não pode entrar no objeto local, senão o card passa a carregar uma
      // propriedade que nenhum tipo descreve e que a próxima leitura do
      // servidor não traz de volta.
      const camposDoLead = { ...campos };
      delete camposDoLead.contato;
      setLeads((atual) =>
        atual.map((l) =>
          l.id === id
            ? {
                ...l,
                ...(camposDoLead as Partial<Lead>),
                // O toque humano reinicia o relógio no banco (gatilho da
                // migração 20260828120000). Refletir aqui evita o card ficar
                // vermelho até o próximo `carregar()`.
                ultimo_contato_em: new Date().toISOString(),
              }
            : l,
        ),
      );
      try {
        const res = await fetch("/api/leads/gerenciar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...campos }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Falha ao salvar");
        }
      } catch (e: any) {
        setErro(e.message);
        // Recarrega em vez de restaurar um retrato tirado antes da chamada:
        // com vários consultores mexendo na mesma fila, o retrato local já
        // pode estar velho, e restaurá-lo desfaria o trabalho de outro.
        carregar();
      }
    },
    [carregar],
  );

  /**
   * Move o card. Se o destino é etapa terminal, a caixa de motivos entra na
   * frente — o card só chega lá com um "por quê" junto.
   */
  const mover = useCallback(
    (id: string, chave: string) => {
      const etapa = etapas.find((e) => e.chave === chave);
      const lead = leads.find((l) => l.id === id);
      if (!lead || !etapa) return;
      if (etapa.tipo === "ganho" || etapa.tipo === "perdido") {
        setFechando({ lead, etapa });
        return;
      }
      salvar(id, { situacao: chave });
    },
    [etapas, leads, salvar],
  );

  const confirmarDesfecho = useCallback(
    (escolha: DesfechoEscolhido) => {
      if (!fechando) return;
      const { lead, etapa } = fechando;
      setFechando(null);
      salvar(lead.id, {
        situacao: etapa.chave,
        desfecho_motivo: escolha.motivo,
        desfecho_valor: escolha.valor || null,
        desfecho_nota: escolha.nota || null,
      });
    },
    [fechando, salvar],
  );

  /**
   * O atalho do WhatsApp. Abre a conversa E registra o contato.
   *
   * O registro é o que faz o botão valer mais que um link: sem ele, o vendedor
   * que acabou de falar com o cliente recebe, uma hora depois, um alerta
   * cobrando que fale com o cliente. Dois desses e ninguém lê mais alerta.
   *
   * A gravação é solta (`void`) de propósito: a janela do WhatsApp abre no
   * clique, sem esperar a rede. Registro que falha vira, no pior caso, um
   * lembrete a mais — bem melhor que um clique que trava.
   */
  const falarNoWhatsApp = useCallback(
    (lead: Lead) => {
      void salvar(lead.id, { contato: "whatsapp" });
    },
    [salvar],
  );

  const visiveis = useMemo(() => {
    const porResponsavel = filtrarPorResponsavel(leads, filtroResponsavel);
    if (!soParados) return porResponsavel;
    return porResponsavel.filter((l) => {
      const n = nivelDeEstagnacao(l, etapas.find((e) => e.chave === l.situacao), agora);
      return n === "estagnado" || n === "transferir";
    });
  }, [leads, filtroResponsavel, soParados, etapas, agora]);

  const colunasVisiveis = useMemo(() => etapasVisiveis(etapas, leads), [etapas, leads]);

  const opcoesResponsavel = useMemo(
    () => opcoesDeResponsavel(atendentes, leads),
    [atendentes, leads],
  );

  const semDono = useMemo(() => leads.filter((l) => !l.responsavel).length, [leads]);

  const parados = useMemo(
    () =>
      leads.filter((l) => {
        const n = nivelDeEstagnacao(l, etapas.find((e) => e.chave === l.situacao), agora);
        return n === "estagnado" || n === "transferir";
      }).length,
    [leads, etapas, agora],
  );

  // ── a barra de navegação ───────────────────────────────────────────────
  const medir = useCallback(() => {
    const el = trilho.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 8px de folga: sub-pixel de layout faz `scrollWidth` passar do
    // `clientWidth` por meio pixel em telas grandes, e a barra apareceria
    // sem ter para onde deslizar.
    setRolavel(max > 8);
    setProgresso(max > 0 ? Math.round((el.scrollLeft / max) * 100) : 0);
  }, []);

  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir, colunasVisiveis.length, visiveis.length]);

  const deslizar = (valor: number) => {
    const el = trilho.current;
    if (!el) return;
    el.scrollLeft = (valor / 100) * (el.scrollWidth - el.clientWidth);
    setProgresso(valor);
  };

  /**
   * Leva a coluna escolhida para a vista.
   *
   * Pela diferença entre os retângulos, e não por `offsetLeft`: aquele mede a
   * partir do primeiro ancestral posicionado, que aqui pode ser qualquer coisa
   * acima na página — e o trilho pararia no lugar errado sem dar erro.
   */
  const irParaEtapa = (chave: string) => {
    const el = trilho.current;
    const col = colunas.current[chave];
    if (!el || !col) return;
    const delta = col.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollTo({ left: el.scrollLeft + delta - 4, behavior: "smooth" });
  };

  /**
   * Rolagem automática ao arrastar perto da borda.
   *
   * Sem isto, mover um card do "Novo" para o "Perdido" num funil de sete
   * colunas é impossível no mouse: o cursor chega na borda da tela e o trilho
   * não anda. É o par natural da barra — ela resolve a navegação, esta resolve
   * o arrasto.
   */
  const arrastarNaBorda = (clientX: number) => {
    const el = trilho.current;
    if (!el || !arrastando) return;
    const { left, right } = el.getBoundingClientRect();
    const zona = 80;
    if (clientX < left + zona) el.scrollLeft -= 18;
    else if (clientX > right - zona) el.scrollLeft += 18;
  };

  if (carregando) {
    return <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando leads…</div>;
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Geral</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Leads</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            Cada contato enviado pelo site entra aqui. Mover entre etapas é o registro do
            atendimento — o WhatsApp continua sendo onde a conversa acontece.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/leads/relatorio"
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Ganhos e perdas
          </Link>
          {podeConfigurar && (
            <Link
              href="/admin/leads/funil"
              className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
            >
              Configurar funil
            </Link>
          )}
          <button
            onClick={carregar}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}

      {migracaoPendente ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          <div className="text-[15px] font-extrabold tracking-[-.01em]">
            A tabela de leads ainda não existe
          </div>
          <p className="mx-auto mt-2 max-w-[460px] text-xs leading-relaxed text-mt-neutral-700">
            Aplique a migração <code className="text-mt-ink">20260807210000_leads.sql</code> com{" "}
            <code className="text-mt-ink">supabase db push</code>. A partir daí, todo formulário
            enviado no site passa a aparecer nesta tela.
          </p>
        </div>
      ) : agregado ? (
        // Marketing vê volume, não pessoas — regra da matriz A17.
        <div>
          <div className="mt-rotulo mb-3">Volume por etapa</div>
          <div className="grid grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-7">
            {ETAPAS_PADRAO.map((e) => (
              <div key={e.chave} className="border-b border-mt-regua-fina py-4 pr-4 lg:border-b-0 lg:border-r lg:pl-4 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
                <div className="mt-rotulo">{e.rotulo}</div>
                <div className="mt-2 text-2xl font-extrabold tabular-nums">
                  {agregado.porSituacao[e.chave] ?? 0}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-mt-neutral-700">
            Seu perfil vê o volume agregado. Nome e telefone ficam com Comercial e
            Administrador, conforme a matriz de permissões.
          </p>
        </div>
      ) : leads.length === 0 ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          <div className="text-[15px] font-extrabold tracking-[-.01em]">Nenhum lead ainda</div>
          <p className="mx-auto mt-2 max-w-[460px] text-xs leading-relaxed text-mt-neutral-700">
            Os contatos enviados pelos formulários do site aparecem aqui assim que chegam.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="filtro-responsavel"
              className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700"
            >
              Responsável
            </label>
            <select
              id="filtro-responsavel"
              value={filtroResponsavel}
              onChange={(e) => setFiltroResponsavel(e.target.value)}
              className="mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-3 py-2 text-xs text-mt-ink"
            >
              <option value="">Todos ({leads.length})</option>
              <option value={SEM_DONO}>Sem responsável ({semDono})</option>
              {opcoesResponsavel.map((n) => (
                <option key={n} value={n}>
                  {n} ({leads.filter((l) => l.responsavel === n).length})
                </option>
              ))}
            </select>
            {filtroResponsavel && (
              <button
                onClick={() => setFiltroResponsavel("")}
                className="mt-foco cursor-pointer text-[11px] text-mt-accent hover:underline"
              >
                limpar
              </button>
            )}

            {/* O filtro que a régua de estagnação torna possível: a fila do dia
                é a dos parados, e ela costuma ser dez cards num quadro de
                duzentos. */}
            <button
              type="button"
              onClick={() => setSoParados((v) => !v)}
              aria-pressed={soParados}
              className={`mt-foco cursor-pointer border px-3 py-2 text-[11px] ${
                soParados
                  ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800"
                  : "border-mt-regua-fina text-mt-neutral-700 hover:border-mt-accent"
              }`}
            >
              Só os parados ({parados})
            </button>

            <span className="ml-auto text-[11px] text-mt-neutral-600">
              Arraste o card, use as setas ou a barra
            </span>
          </div>

          {/* ── trilho de etapas: clique e o quadro vai ─────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {colunasVisiveis.map((etapa) => {
                const total = visiveis.filter((l) => l.situacao === etapa.chave).length;
                return (
                  <button
                    key={etapa.chave}
                    type="button"
                    onClick={() => irParaEtapa(etapa.chave)}
                    title={
                      etapa.estagnacao_minutos
                        ? `Cobra em ${formatarPrazo(etapa.estagnacao_minutos)}` +
                          (etapa.protegida || !etapa.transferencia_minutos
                            ? " · não transfere"
                            : ` · transfere em ${formatarPrazo(etapa.transferencia_minutos)}`)
                        : "Sem régua de tempo"
                    }
                    className="mt-foco cursor-pointer border border-mt-regua-fina px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[.08em] text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink"
                  >
                    {etapa.rotulo}
                    <span className="ml-1.5 tabular-nums text-mt-neutral-600">{total}</span>
                    {!etapa.ativa && <span className="ml-1 text-mt-accent">arquivada</span>}
                  </button>
                );
              })}
            </div>

            {/* ── a barra de slide ─────────────────────────────────────────
                Some quando o quadro cabe na tela: controle que não controla
                nada é ruído. `input[type=range]` e não uma barra desenhada à
                mão porque ele já vem com teclado, leitor de tela e toque. */}
            {rolavel && (
              <label className="flex items-center gap-3">
                <span className="sr-only">Percorrer o funil</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={progresso}
                  onChange={(e) => deslizar(Number(e.target.value))}
                  aria-label="Percorrer o funil"
                  className="mt-foco h-1.5 w-full cursor-pointer appearance-none rounded-none bg-mt-regua-fina accent-mt-accent"
                />
                <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-mt-neutral-600">
                  {progresso}%
                </span>
              </label>
            )}
          </div>

          <div
            ref={trilho}
            onScroll={medir}
            onDragOver={(e) => arrastarNaBorda(e.clientX)}
            className="relative flex gap-0.5 overflow-x-auto pb-4"
          >
            {colunasVisiveis.map((etapa) => {
              const daEtapa = visiveis.filter((l) => l.situacao === etapa.chave);
              const alvo = colunaAlvo === etapa.chave && arrastando !== null;
              const i = colunasVisiveis.findIndex((e) => e.chave === etapa.chave);
              return (
                <div
                  key={etapa.chave}
                  ref={(el) => {
                    colunas.current[etapa.chave] = el;
                  }}
                  className="flex w-[240px] flex-none flex-col"
                  // Soltar aqui move o lead. O `preventDefault` no dragOver é
                  // o que autoriza o drop — sem ele o navegador recusa.
                  onDragOver={(e) => {
                    if (!arrastando) return;
                    e.preventDefault();
                    setColunaAlvo(etapa.chave);
                  }}
                  onDragLeave={() => setColunaAlvo((c) => (c === etapa.chave ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = arrastando || e.dataTransfer.getData("text/plain");
                    const lead = leads.find((l) => l.id === id);
                    if (lead && lead.situacao !== etapa.chave) mover(id, etapa.chave);
                    setArrastando(null);
                    setColunaAlvo(null);
                  }}
                >
                  <div
                    className={`flex items-baseline gap-2 border-b-2 px-3 py-2.5 ${
                      i === 0 ? "border-mt-accent bg-mt-ink text-mt-bg" : "border-mt-regua"
                    }`}
                    style={i !== 0 && etapa.cor ? { borderBottomColor: etapa.cor } : undefined}
                  >
                    <span className="text-[11px] font-extrabold uppercase tracking-[.1em]">
                      {etapa.rotulo}
                    </span>
                    <span
                      className={`ml-auto text-[11px] tabular-nums ${
                        i === 0 ? "text-mt-neutral-400" : "text-mt-neutral-700"
                      }`}
                    >
                      {daEtapa.length}
                    </span>
                  </div>

                  <div
                    className={`flex min-h-[80px] flex-col gap-0.5 p-1 transition-colors ${
                      alvo ? "bg-mt-accent-100 outline-dashed outline-1 outline-mt-accent" : ""
                    }`}
                  >
                    {daEtapa.map((l) => {
                      const nivel = nivelDeEstagnacao(l, etapa, agora);
                      const aviso = AVISO[nivel];
                      const conversa = linkDeConversa(
                        l.telefone,
                        mensagemParaCliente(l, { vendedor: l.responsavel }),
                      );
                      return (
                        <div
                          key={l.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", l.id);
                            e.dataTransfer.effectAllowed = "move";
                            setArrastando(l.id);
                          }}
                          onDragEnd={() => {
                            setArrastando(null);
                            setColunaAlvo(null);
                          }}
                          className={`border p-3 ${MOLDURA[nivel]} ${
                            arrastando === l.id ? "opacity-40" : "cursor-grab"
                          }`}
                        >
                          <div className="text-[13px] font-extrabold tracking-[-.01em]">
                            {l.nome}
                          </div>
                          {l.interesse && (
                            <div className="mt-1 text-[11px] leading-snug text-mt-neutral-800">
                              {l.interesse}
                            </div>
                          )}

                          {/* O atalho do dono: conversa aberta com o texto já
                              escrito, e o contato registrado no mesmo clique. */}
                          {conversa ? (
                            <a
                              href={conversa}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => falarNoWhatsApp(l)}
                              // Sem desligar o arrasto no link, o navegador
                              // arrasta a âncora em vez do card e o drop nunca
                              // dispara. Falha muda: o card só não se move.
                              draggable={false}
                              className="mt-foco mt-2 flex items-center justify-center gap-1.5 border border-mt-accent bg-mt-bg px-2 py-1.5 text-[11px] font-semibold text-mt-accent hover:bg-mt-accent-100"
                            >
                              WhatsApp
                              <span className="tabular-nums font-normal text-mt-neutral-700">
                                {formatarTelefone(l.telefone)}
                              </span>
                            </a>
                          ) : (
                            l.telefone && (
                              <div className="mt-1.5 text-[11px] tabular-nums text-mt-neutral-700">
                                {formatarTelefone(l.telefone)}
                              </div>
                            )
                          )}

                          <div className="mt-2 flex items-center gap-2 border-t border-mt-regua-fina pt-2">
                            <span className="text-[10px] uppercase tracking-[.08em] text-mt-neutral-600">
                              {l.canal || "site"}
                            </span>
                            <span className="ml-auto text-[10px] tabular-nums text-mt-neutral-700">
                              {espera(l.created_at, agora)}
                            </span>
                          </div>

                          {aviso && (
                            <div
                              className={`mt-1.5 text-[10px] font-semibold uppercase tracking-[.08em] ${
                                nivel === "atencao" ? "text-mt-neutral-700" : "text-mt-accent-800"
                              }`}
                            >
                              {aviso} há {formatarPrazo(minutosParado(l, agora))}
                            </div>
                          )}

                          <div className="mt-2 flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className={`flex h-5 w-5 shrink-0 items-center justify-center text-[9px] font-extrabold ${
                                l.responsavel
                                  ? "bg-mt-ink text-mt-bg"
                                  : "border border-dashed border-mt-regua text-mt-neutral-500"
                              }`}
                            >
                              {l.responsavel ? iniciais(l.responsavel) : "—"}
                            </span>
                            <select
                              value={l.responsavel ?? ""}
                              onChange={(e) => salvar(l.id, { responsavel: e.target.value || null })}
                              aria-label={`Responsável por ${l.nome}`}
                              className="mt-foco w-full cursor-pointer border border-mt-regua-fina bg-mt-bg px-1.5 py-1 text-[10px] text-mt-ink"
                            >
                              <option value="">Sem responsável</option>
                              {opcoesResponsavel.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>

                          {anotando === l.id ? (
                            <textarea
                              autoFocus
                              defaultValue={l.observacoes ?? ""}
                              rows={3}
                              placeholder="O que foi combinado…"
                              // Grava ao sair do campo: salvar a cada tecla
                              // seria uma requisição por letra.
                              onBlur={(e) => {
                                const texto = e.target.value.trim();
                                if (texto !== (l.observacoes ?? "")) {
                                  salvar(l.id, { observacoes: texto || null });
                                }
                                setAnotando(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setAnotando(null);
                              }}
                              className="mt-foco mt-1.5 w-full resize-none border border-mt-regua-fina bg-mt-bg p-1.5 text-[11px] leading-snug text-mt-ink outline-none focus:border-mt-accent"
                            />
                          ) : l.observacoes ? (
                            <button
                              onClick={() => setAnotando(l.id)}
                              aria-label={`Editar anotação de ${l.nome}`}
                              className="mt-foco mt-1.5 w-full cursor-pointer border-l-2 border-mt-regua bg-mt-bg px-2 py-1 text-left text-[11px] leading-snug text-mt-neutral-800 hover:border-mt-accent"
                            >
                              {l.observacoes}
                            </button>
                          ) : (
                            <button
                              onClick={() => setAnotando(l.id)}
                              className="mt-foco mt-1.5 cursor-pointer text-[10px] text-mt-neutral-600 hover:text-mt-accent"
                            >
                              + anotação
                            </button>
                          )}

                          <div className="mt-2 flex gap-1">
                            <button
                              onClick={() => mover(l.id, colunasVisiveis[i - 1].chave)}
                              disabled={i <= 0}
                              aria-label={`Voltar ${l.nome} uma etapa`}
                              className="mt-foco cursor-pointer border border-mt-regua-fina px-2 py-1 text-[10px] text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              ←
                            </button>
                            <button
                              onClick={() => mover(l.id, colunasVisiveis[i + 1].chave)}
                              disabled={i >= colunasVisiveis.length - 1}
                              aria-label={`Avançar ${l.nome} uma etapa`}
                              className="mt-foco flex-1 cursor-pointer border border-mt-regua-fina px-2 py-1 text-[10px] font-semibold text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              Avançar →
                            </button>
                          </div>

                          {/* Ganho e perdido saem do fluxo das setas: fechar
                              negócio não é "avançar uma etapa", é um desfecho —
                              e ele custa um clique de qualquer coluna. */}
                          {etapa.tipo === "aberta" && (
                            <div className="mt-1 flex gap-1">
                              {colunasVisiveis
                                .filter((e) => e.tipo === "ganho" || e.tipo === "perdido")
                                .map((e) => (
                                  <button
                                    key={e.chave}
                                    onClick={() => mover(l.id, e.chave)}
                                    aria-label={`Marcar ${l.nome} como ${e.rotulo}`}
                                    className="mt-foco flex-1 cursor-pointer border border-mt-regua-fina px-2 py-1 text-[10px] text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink"
                                  >
                                    {e.rotulo}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {fechando && (
        <ModalDeDesfecho
          etapa={fechando.etapa}
          motivos={motivos}
          lead={fechando.lead}
          aoConfirmar={confirmarDesfecho}
          aoCancelar={() => setFechando(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tela A8 do design doc — kanban de leads.
 *
 * Agora tem fonte: a tabela `leads` (migração 20260807210000), alimentada por
 * `/api/leads` a cada formulário enviado no site. Antes disso o lead existia
 * só no webhook do n8n — quem não abrisse o n8n não sabia que alguém pediu
 * contato.
 *
 * Duas diferenças em relação ao desenho:
 *
 * 1. **Botões em vez de arrastar**, como na A3: `dnd` de verdade quebra no
 *    toque e no teclado, e mover com dois cliques resolve o mesmo problema.
 * 2. **Sem SLA colorido por tempo.** O doc mostra "SLA 3 MIN" e "FORA DO
 *    SLA"; nenhum acordo de tempo de resposta foi definido, e pintar de
 *    vermelho um prazo que ninguém combinou é inventar meta. Mostramos o
 *    tempo de espera cru — o julgamento fica com quem atende.
 */

interface Lead {
  id: string;
  nome: string;
  telefone: string | null;
  interesse: string | null;
  canal: string | null;
  situacao: string;
  responsavel: string | null;
  /** `created_at`, não `criado_em`: a tabela é preexistente e já usava esse
   *  nome — ver a nota na migração 20260807210000. */
  created_at: string;
}

const ETAPAS: Array<{ id: string; rotulo: string }> = [
  { id: "novo", rotulo: "Novo" },
  { id: "em_contato", rotulo: "Em contato" },
  { id: "proposta", rotulo: "Proposta" },
  { id: "visita", rotulo: "Visita" },
  { id: "negociacao", rotulo: "Negociação" },
  { id: "fechado", rotulo: "Fechado" },
  { id: "perdido", rotulo: "Perdido" },
];

/** Espera desde a entrada, em texto curto. */
function espera(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Telefone só com dígitos → (41) 99999-9999. */
function formatarTelefone(t: string | null): string {
  if (!t) return "";
  const d = t.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export default function LeadsKanban() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [agregado, setAgregado] = useState<{ total: number; porSituacao: Record<string, number> } | null>(null);

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

  const mover = async (id: string, situacao: string) => {
    // Otimista: a lista reordena na hora e volta ao servidor em seguida.
    setLeads((atual) => atual.map((l) => (l.id === id ? { ...l, situacao } : l)));
    try {
      const res = await fetch("/api/leads/gerenciar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, situacao }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha ao mover");
      }
    } catch (e: any) {
      setErro(e.message);
      carregar(); // desfaz o otimismo com o estado real
    }
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
        <button
          onClick={carregar}
          className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
        >
          Atualizar
        </button>
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
            {ETAPAS.map((e) => (
              <div key={e.id} className="border-b border-mt-regua-fina py-4 pr-4 lg:border-b-0 lg:border-r lg:last:border-r-0">
                <div className="mt-rotulo">{e.rotulo}</div>
                <div className="mt-2 text-2xl font-extrabold tabular-nums">
                  {agregado.porSituacao[e.id] ?? 0}
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
        <div className="flex gap-0.5 overflow-x-auto pb-4">
          {ETAPAS.map((etapa) => {
            const daEtapa = leads.filter((l) => l.situacao === etapa.id);
            return (
              <div key={etapa.id} className="flex w-[240px] flex-none flex-col">
                <div
                  className={`flex items-baseline gap-2 border-b-2 px-3 py-2.5 ${
                    etapa.id === "novo"
                      ? "border-mt-accent bg-mt-ink text-mt-bg"
                      : "border-mt-regua"
                  }`}
                >
                  <span className="text-[11px] font-extrabold uppercase tracking-[.1em]">
                    {etapa.rotulo}
                  </span>
                  <span
                    className={`ml-auto text-[11px] tabular-nums ${
                      etapa.id === "novo" ? "text-mt-neutral-400" : "text-mt-neutral-700"
                    }`}
                  >
                    {daEtapa.length}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 p-1">
                  {daEtapa.map((l) => {
                    const i = ETAPAS.findIndex((e) => e.id === l.situacao);
                    return (
                      <div
                        key={l.id}
                        className="border border-mt-regua-fina bg-mt-surface p-3"
                      >
                        <div className="text-[13px] font-extrabold tracking-[-.01em]">
                          {l.nome}
                        </div>
                        {l.interesse && (
                          <div className="mt-1 text-[11px] leading-snug text-mt-neutral-800">
                            {l.interesse}
                          </div>
                        )}
                        {l.telefone && (
                          <a
                            href={`https://wa.me/${l.telefone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-foco mt-1.5 block text-[11px] font-semibold text-mt-accent tabular-nums hover:underline"
                          >
                            {formatarTelefone(l.telefone)}
                          </a>
                        )}
                        <div className="mt-2 flex items-center gap-2 border-t border-mt-regua-fina pt-2">
                          <span className="text-[10px] uppercase tracking-[.08em] text-mt-neutral-600">
                            {l.canal || "site"}
                          </span>
                          <span className="ml-auto text-[10px] tabular-nums text-mt-neutral-700">
                            {espera(l.created_at)}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-1">
                          <button
                            onClick={() => mover(l.id, ETAPAS[i - 1].id)}
                            disabled={i <= 0}
                            aria-label={`Voltar ${l.nome} uma etapa`}
                            className="mt-foco cursor-pointer border border-mt-regua-fina px-2 py-1 text-[10px] text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            ←
                          </button>
                          <button
                            onClick={() => mover(l.id, ETAPAS[i + 1].id)}
                            disabled={i >= ETAPAS.length - 1}
                            aria-label={`Avançar ${l.nome} uma etapa`}
                            className="mt-foco flex-1 cursor-pointer border border-mt-regua-fina px-2 py-1 text-[10px] font-semibold text-mt-neutral-700 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Avançar →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

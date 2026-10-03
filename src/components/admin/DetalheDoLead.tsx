"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ehTipoDeDesfecho,
  nivelDeEstagnacao,
  ordenarEtapas,
  type EtapaDoFunil,
} from "../../lib/funil";
import { leadEstaAberto, type CampoDosDados, type ItemDoHistorico } from "../../lib/gestaoDoLead";
import {
  AVISO_DE_LEAD_FECHADO,
  FORM_DO_REGISTRO_VAZIO,
  PERGUNTA_DO_DESCARTE,
  comTipo,
  estadoDoRegistro,
  formAoConcluir,
  formAoRemarcar,
  mensagemDeQuemChegou,
  registroEmAndamento,
  urlDoLead,
  type DetalheDaApi,
  type FormDoRegistro,
  type LeadDaFila,
  type LeadDoDetalhe,
  type ResumoDoLead,
} from "../../lib/filaDoFunil";
import { criarMover } from "../../lib/leadsKanban";
import { aplicarMudanca, type MudancaDeEtiquetas } from "../../lib/etiquetas";
import { definirNomeNaTrilha } from "../../lib/nomeNaTrilha";
import ModalDeDesfecho, { type DesfechoEscolhido } from "./ModalDeDesfecho";
import CabecalhoDoLead from "./lead/CabecalhoDoLead";
import DadosDoNegocio from "./lead/DadosDoNegocio";
import HistoricoDoLead from "./lead/HistoricoDoLead";
import ProximoPassoDoLead from "./lead/ProximoPassoDoLead";
import RegistroDeInteracao from "./lead/RegistroDeInteracao";
import { NivelDoTituloDeBloco } from "./lead/TituloDeBloco";

/**
 * O detalhe do lead: um componente, dois layouts (desenho de 23/09/2026).
 *
 *   · `gaveta`: 600px à direita, sobre o quadro, com rolagem própria. Vale em
 *     telas de 1024px ou mais, abaixo da barra de topo. Não tem véu: o quadro
 *     continua em uso ao lado. Esc fecha; o foco entra nela ao abrir e volta ao
 *     card ao fechar (quem devolve o foco é quem a abriu). Com um registro
 *     começado, Esc não fecha, e FECHAR ou a troca de card perguntam antes.
 *   · `pagina`: `/admin/leads/[id]`, o destino dos links e das telas estreitas.
 *
 * Os cinco blocos são os mesmos, na mesma ordem no HTML (h, p, c, t, d). Na
 * página larga, eles se reposicionam por `grid-template-areas`.
 *
 * Os dados vêm de `GET /api/leads/[id]`. Etapa, responsável e desfecho gravam
 * pelo `PATCH /api/leads/gerenciar`, com as travas de sempre; o registro, o
 * "Chegou na loja" e os dados do negócio, pelas rotas do próprio lead.
 *
 * A gravação segue o padrão do quadro: otimista, e em caso de falha o detalhe
 * relê o lead do servidor e SÓ DEPOIS mostra o erro (`falhou`). Restaurar um
 * retrato local desfaria o trabalho de outro consultor.
 */

export type LayoutDoDetalhe = "gaveta" | "pagina";

/** A leitura do lead falhou: a frase da rota e o status, que decide o que a tela faz. */
class ErroDeLeitura extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

/** Onde cada bloco cai na página larga. Na gaveta e na página estreita, a ordem do HTML. */
const AREA: Record<"h" | "p" | "c" | "t" | "d", string> = {
  h: "xl:[grid-area:h]",
  p: "xl:[grid-area:p] xl:border-l xl:border-mt-regua-fina",
  c: "xl:[grid-area:c] xl:border-t-0",
  t: "xl:[grid-area:t]",
  d: "xl:[grid-area:d] xl:border-t-0 xl:border-r xl:border-mt-regua-fina",
};

const FAIXA_DE_ERRO = "border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800";
const FAIXA_DE_AVISO = "border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800";
const LINK = "mt-foco mt-alvo text-[11px] text-mt-neutral-800 underline underline-offset-2 hover:text-mt-accent-hover";

export default function DetalheDoLead({
  id,
  layout,
  versao = 0,
  etiquetasDaConta,
  saidaPendente = false,
  aoFechar,
  aoDescartar,
  aoManter,
  aoMudarRascunho,
  aoSumir,
  aoMudarLead,
  aoSairDeSincronia,
}: {
  id: string;
  layout: LayoutDoDetalhe;
  /** Sobe quando o quadro gravou algo neste lead: o detalhe relê. */
  versao?: number;
  /** As etiquetas da conta do Chatwoot, quando quem monta já as leu. */
  etiquetasDaConta?: readonly string[];
  /** Quem montou quer sair deste lead (outro card foi clicado) e há registro começado. */
  saidaPendente?: boolean;
  aoFechar?: () => void;
  /** A pessoa escolheu descartar o registro começado. Sem isto, vale `aoFechar`. */
  aoDescartar?: () => void;
  /** A pessoa escolheu continuar escrevendo. */
  aoManter?: () => void;
  /** O registro passou a ter (ou deixou de ter) algo que se perderia ao sair. */
  aoMudarRascunho?: (emAndamento: boolean) => void;
  /** A releitura respondeu 404: o lead saiu do escopo de quem olha. */
  aoSumir?: () => void;
  /** O lead mudou aqui: o quadro atualiza o card sem reler a fila. */
  aoMudarLead?: (id: string, campos: Partial<LeadDaFila>) => void;
  /** Uma gravação falhou: o quadro relê a fila. */
  aoSairDeSincronia?: () => void;
}) {
  const [dados, setDados] = useState<DetalheDaApi | null>(null);
  const [erroDeLeitura, setErroDeLeitura] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [chegando, setChegando] = useState(false);
  const [fechando, setFechando] = useState<EtapaDoFunil | null>(null);
  const [form, setForm] = useState<FormDoRegistro>(FORM_DO_REGISTRO_VAZIO);
  /** FECHAR foi tocado com um registro começado: a gaveta pergunta antes. */
  const [querFechar, setQuerFechar] = useState(false);
  /** Este lead já foi lido uma vez: um 404 depois disso é o lead saindo do escopo. */
  const jaLido = useRef(false);
  const [etiquetasLidas, setEtiquetasLidas] = useState<string[]>([]);
  const caixa = useRef<HTMLDivElement>(null);
  const campoDoTexto = useRef<HTMLTextAreaElement>(null);

  // O relógio só anda quando a tela repinta. Um minuto é a menor unidade que
  // ela mostra (o mesmo tique do quadro).
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const ler = useCallback(async (): Promise<DetalheDaApi> => {
    const res = await fetch(`/api/leads/${encodeURIComponent(id)}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new ErroDeLeitura(d.error || "Não deu para abrir este lead.", res.status);
    jaLido.current = true;
    return d as DetalheDaApi;
  }, [id]);

  // `aoSumir` é lido pelo ref, e não entra nas dependências da leitura: quem
  // monta passa uma função nova a cada pintura, e o efeito de leitura releria o
  // lead a cada pintura do quadro.
  const aoSumirAtual = useRef(aoSumir);
  useEffect(() => {
    aoSumirAtual.current = aoSumir;
  }, [aoSumir]);

  /**
   * A leitura falhou. Um 404 em lead que já estava na tela é o lead saindo do
   * escopo de quem olha (o vendedor passou o lead adiante): quem montou fecha
   * a gaveta e relê a fila. O resto vira faixa de erro.
   */
  const leituraFalhou = useCallback((e: unknown) => {
    if (e instanceof ErroDeLeitura && e.status === 404 && jaLido.current && aoSumirAtual.current) {
      aoSumirAtual.current();
      return;
    }
    setErroDeLeitura(e instanceof Error ? e.message : "Não deu para abrir este lead.");
  }, []);

  // Lê ao montar e a cada `versao` nova. Quem troca de lead remonta o
  // componente (a `key` é o id): o estado de um lead nunca aparece em outro.
  useEffect(() => {
    let vivo = true;
    ler()
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setErroDeLeitura("");
      })
      .catch((e: unknown) => {
        if (vivo) leituraFalhou(e);
      });
    return () => {
      vivo = false;
    };
  }, [ler, versao, leituraFalhou]);

  /** Relê em silêncio: o que está na tela fica até o novo chegar. */
  const recarregar = useCallback(async () => {
    try {
      const d = await ler();
      setDados(d);
      setErroDeLeitura("");
    } catch (e: unknown) {
      leituraFalhou(e);
    }
  }, [ler, leituraFalhou]);

  /** A gravação falhou: relê o lead e só depois mostra o porquê. */
  const falhou = useCallback(
    (mensagem: string) => {
      void recarregar().finally(() => setErro(mensagem));
      aoSairDeSincronia?.();
    },
    [recarregar, aoSairDeSincronia],
  );

  // As etiquetas da conta do Chatwoot, quando quem montou não as trouxe (a
  // página). Falhou, o select fica com as que o lead já tem.
  const precisaLerEtiquetas = etiquetasDaConta === undefined && dados?.etiquetasEditaveis === true;
  useEffect(() => {
    if (!precisaLerEtiquetas) return;
    let vivo = true;
    fetch("/api/leads/etiquetas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && Array.isArray(d?.etiquetas)) setEtiquetasLidas(d.etiquetas);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [precisaLerEtiquetas]);

  // O nome do lead na trilha do topo, só na página.
  const nome = dados?.lead.nome ?? null;
  useEffect(() => {
    if (layout !== "pagina") return;
    definirNomeNaTrilha(nome);
    return () => definirNomeNaTrilha(null);
  }, [layout, nome]);

  // Gaveta: o foco entra ao abrir, e Esc fecha. Com a caixa de motivos aberta,
  // o Esc é dela.
  useEffect(() => {
    if (layout === "gaveta") caixa.current?.focus();
  }, [layout]);
  // Com registro começado, Esc não fecha: uma tecla não pode apagar o que foi
  // escrito. E com uma caixa modal aberta (a de motivos, daqui ou do quadro), o
  // Esc é dela.
  const emAndamento = registroEmAndamento(form);
  useEffect(() => {
    if (layout !== "gaveta" || !aoFechar) return;
    const naTecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || emAndamento) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      aoFechar();
    };
    document.addEventListener("keydown", naTecla);
    return () => document.removeEventListener("keydown", naTecla);
  }, [layout, aoFechar, emAndamento]);

  /** Toda mudança do registro passa por aqui: quem montou sabe se há algo a perder. */
  const mudarForm = useCallback(
    (novo: FormDoRegistro) => {
      setForm(novo);
      aoMudarRascunho?.(registroEmAndamento(novo));
    },
    [aoMudarRascunho],
  );

  const pedirParaFechar = () => {
    if (emAndamento) setQuerFechar(true);
    else aoFechar?.();
  };

  const etapas = useMemo(() => ordenarEtapas(dados?.etapas ?? []), [dados?.etapas]);
  const lead = dados?.lead ?? null;

  /** Junta campos no lead da tela e avisa o quadro. */
  const aplicar = useCallback(
    (campos: Partial<LeadDoDetalhe>, novoItem?: ItemDoHistorico | null) => {
      setDados((atual) =>
        atual
          ? {
              ...atual,
              lead: { ...atual.lead, ...campos },
              historico: novoItem ? [novoItem, ...atual.historico] : atual.historico,
            }
          : atual,
      );
      // O relógio da tela acompanha o que acabou de ser gravado: um passo
      // marcado para "agora" não pode se ler como futuro até o próximo tique.
      setAgora(Date.now());
      aoMudarLead?.(id, campos);
    },
    [id, aoMudarLead],
  );

  /**
   * Grava pelo `PATCH /api/leads/gerenciar`: etapa, responsável, desfecho,
   * contato e os valores da avaliação. Otimista, como no quadro.
   */
  const gravar = useCallback(
    async (campos: Record<string, unknown>, { reiniciaORelogio = true }: { reiniciaORelogio?: boolean } = {}) => {
      // `contato` é uma AÇÃO, não um campo do lead: vai no corpo e não entra
      // no objeto local.
      const doLead: Record<string, unknown> = { ...campos };
      delete doLead.contato;
      if (typeof campos.situacao === "string") {
        // O gatilho do banco carimba o desfecho quando a etapa é terminal, e o
        // limpa ao sair dela. A tela reflete na hora, para o lead fechado sair
        // do quadro e entrar na lista de Fechados sem esperar a releitura.
        const tipo = etapas.find((e) => e.chave === campos.situacao)?.tipo;
        doLead.desfecho = ehTipoDeDesfecho(tipo) ? tipo : null;
        doLead.desfecho_em = ehTipoDeDesfecho(tipo) ? new Date().toISOString() : null;
      }
      // O toque humano reinicia o relógio no banco. Os valores da avaliação,
      // não: a tela não mostra um relógio que o banco não reiniciou.
      if (reiniciaORelogio) doLead.ultimo_contato_em = new Date().toISOString();
      // Trocar o dono pode escrever etiqueta no Chatwoot (a passagem do SDR):
      // enquanto isso, responsável e etiquetas travam.
      const escreveNoChatwoot = "responsavel" in campos;
      if (escreveNoChatwoot) setOcupado(true);
      aplicar(doLead as Partial<LeadDoDetalhe>);
      try {
        const res = await fetch("/api/leads/gerenciar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...campos }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Falha ao salvar");
        if (Array.isArray(d.etiquetas)) aplicar({ etiquetas: d.etiquetas });
        if (typeof d.aviso === "string" && d.aviso) setAviso(d.aviso);
        // Etapa e responsável mudam o histórico, os vizinhos e as sugestões.
        if ("situacao" in campos || "responsavel" in campos) void recarregar();
      } catch (e: unknown) {
        falhou(e instanceof Error ? e.message : "Falha ao salvar");
      } finally {
        if (escreveNoChatwoot) setOcupado(false);
      }
    },
    [id, etapas, aplicar, recarregar, falhou],
  );

  /** Mover: etapa terminal pede o motivo; as abertas gravam direto. A regra é de `criarMover`. */
  const mover = (leadId: string, chave: string) =>
    criarMover({
      etapas,
      leads: lead ? [lead] : [],
      pedirMotivo: (_lead, etapa) => setFechando(etapa),
      gravar: (_id, campos) => void gravar(campos),
    })(leadId, chave);

  const confirmarDesfecho = (escolha: DesfechoEscolhido) => {
    if (!fechando) return;
    const etapa = fechando;
    setFechando(null);
    void gravar({
      situacao: etapa.chave,
      desfecho_motivo: escolha.motivo,
      desfecho_valor: escolha.valor || null,
      desfecho_nota: escolha.nota || null,
    });
  };

  /** Põe ou tira etiqueta da conversa. Manda a MUDANÇA, nunca a lista. */
  const salvarEtiquetas = async (mudanca: MudancaDeEtiquetas) => {
    if (!lead) return;
    setOcupado(true);
    aplicar({ etiquetas: aplicarMudanca(lead.etiquetas ?? [], mudanca) });
    try {
      const res = await fetch("/api/leads/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...mudanca }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Falha ao gravar as etiquetas");
      if (Array.isArray(d.etiquetas)) aplicar({ etiquetas: d.etiquetas });
      if (typeof d.aviso === "string" && d.aviso) setAviso(d.aviso);
    } catch (e: unknown) {
      falhou(e instanceof Error ? e.message : "Falha ao gravar as etiquetas");
    } finally {
      setOcupado(false);
    }
  };

  /** Os dados do negócio, pelo `PATCH /api/leads/[id]/dados`. Não reinicia o relógio. */
  const gravarDados = async (campos: Partial<Record<CampoDosDados, string | number | null>>) => {
    aplicar(campos as Partial<LeadDoDetalhe>);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}/dados`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campos),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Falha ao gravar os dados do negócio");
      if (d.dados && typeof d.dados === "object") {
        const gravados = { ...(d.dados as Record<string, unknown>) };
        delete gravados.id;
        aplicar(gravados as Partial<LeadDoDetalhe>);
      }
      // O carro vinculado vem montado pela rota do detalhe (nome, km, preço).
      if ("veiculo_id" in campos) void recarregar();
    } catch (e: unknown) {
      falhou(e instanceof Error ? e.message : "Falha ao gravar os dados do negócio");
    }
  };

  /** O resumo que as rotas de registro devolvem: o card e o detalhe mudam juntos. */
  const aplicarResumo = (resumo: ResumoDoLead | null | undefined, item: ItemDoHistorico | null | undefined) => {
    if (resumo) {
      const campos: Record<string, unknown> = { ...resumo };
      delete campos.id;
      aplicar(campos as Partial<LeadDoDetalhe>, item);
    }
  };

  const registrar = async () => {
    if (!lead || registrando) return;
    const estado = estadoDoRegistro(form, { aberto: leadEstaAberto(lead) }, Date.now());
    if (!estado.pode) return;
    setRegistrando(true);
    setErro("");
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}/interacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(estado.corpo),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Falha ao registrar");
      aplicarResumo(d.lead, d.item);
      mudarForm(FORM_DO_REGISTRO_VAZIO);
      if (typeof d.aviso === "string" && d.aviso) setAviso(d.aviso);
      // Gravou e a rota não conseguiu reler: o detalhe relê.
      if (!d.lead || !d.item) void recarregar();
    } catch (e: unknown) {
      // O que foi escrito fica no formulário: a pessoa não digita de novo.
      falhou(e instanceof Error ? e.message : "Falha ao registrar");
    } finally {
      setRegistrando(false);
    }
  };

  const chegou = async () => {
    if (!lead || chegando) return;
    setChegando(true);
    setErro("");
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}/chegou`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.codigo === "lead_fechado") {
        setAviso(AVISO_DE_LEAD_FECHADO);
        return;
      }
      if (!res.ok) throw new Error(d.error || "Falha ao registrar a chegada");
      aplicarResumo(d.lead, d.item);
      const etapa = etapas.find((e) => e.chave === d.situacao);
      setAviso(d.aviso || mensagemDeQuemChegou(d, etapa?.rotulo ?? "a etapa de visita"));
      // O movimento é anotado no histórico pelo gatilho do banco.
      void recarregar();
    } catch (e: unknown) {
      falhou(e instanceof Error ? e.message : "Falha ao registrar a chegada");
    } finally {
      setChegando(false);
    }
  };

  /** Começa um registro a partir de outro bloco, e leva o foco ao texto. */
  const comecarRegistro = (novo: FormDoRegistro) => {
    mudarForm(novo);
    campoDoTexto.current?.focus();
  };

  const etiquetasDisponiveis = useMemo(
    () =>
      [...new Set([...(etiquetasDaConta ?? etiquetasLidas), ...(lead?.etiquetas ?? [])])].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [etiquetasDaConta, etiquetasLidas, lead?.etiquetas],
  );

  const naPagina = layout === "pagina";
  const area = (bloco: keyof typeof AREA) => (naPagina ? AREA[bloco] : "");

  let conteudo: React.ReactNode;
  if (!dados || !lead) {
    conteudo = erroDeLeitura ? (
      <div role="alert" className={`m-6 ${FAIXA_DE_ERRO}`}>
        {erroDeLeitura}
      </div>
    ) : (
      <p role="status" className="m-0 px-6 py-16 text-center text-xs text-mt-neutral-700">
        Carregando o lead…
      </p>
    );
  } else {
    const aberto = leadEstaAberto(lead);
    const nivel = nivelDeEstagnacao(
      lead,
      etapas.find((e) => e.chave === lead.situacao),
      agora,
    );
    const faixas = [
      erro && (
        <div key="erro" role="alert" className={FAIXA_DE_ERRO}>
          {erro}
        </div>
      ),
      erroDeLeitura && (
        <div key="leitura" role="alert" className={FAIXA_DE_ERRO}>
          Não deu para atualizar este lead: {erroDeLeitura}
        </div>
      ),
      ...dados.avisos.map((a) => (
        <div key={`aviso-${a}`} className={FAIXA_DE_AVISO}>
          {a}
        </div>
      )),
      aviso && (
        <div key="status" role="status" className={`flex items-start gap-3 ${FAIXA_DE_AVISO}`}>
          <span className="flex-1">{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso("")}
            aria-label="Fechar o aviso"
            className="mt-foco mt-alvo cursor-pointer border-0 bg-transparent p-0 text-mt-neutral-600 hover:text-mt-accent-hover"
          >
            ×
          </button>
        </div>
      ),
    ].filter(Boolean);

    conteudo = (
      <>
        {faixas.length > 0 && <div className={`flex flex-col gap-2 ${naPagina ? "" : "px-6 pt-4"}`}>{faixas}</div>}
        <NivelDoTituloDeBloco.Provider value={naPagina ? "h2" : "h3"}>
          <div
            data-blocos
            className={
              naPagina
                ? "grid grid-cols-1 border border-mt-regua-fina xl:grid-cols-[320px_minmax(0,1fr)_320px] xl:grid-rows-[auto_auto_1fr] xl:[grid-template-areas:'h_h_h'_'d_c_p'_'d_t_p']"
                : "flex flex-col"
            }
          >
            <CabecalhoDoLead
              lead={lead}
              aberto={aberto}
              nivel={nivel}
              agora={agora}
              etapas={etapas}
              atendentes={dados.atendentes.map((a) => a.nome)}
              podeTirarDono={dados.podeRemoverResponsavel}
              ocupado={ocupado}
              chegando={chegando}
              tituloDaPagina={naPagina}
              className={area("h")}
              aoMover={(chave) => mover(lead.id, chave)}
              aoMudarResponsavel={(responsavel) => void gravar({ responsavel })}
              aoConversar={() => {
                // Abrir a conversa registra o contato: sem isso, quem acabou
                // de falar com o cliente é cobrado por não ter falado.
                void gravar({ contato: "whatsapp" });
                mudarForm(comTipo(form, "whatsapp"));
              }}
              aoLigar={() => mudarForm(comTipo(form, "ligacao"))}
              aoChegar={() => void chegou()}
            />
            <ProximoPassoDoLead
              lead={lead}
              aberto={aberto}
              agora={agora}
              className={area("p")}
              aoConcluir={(passo) => comecarRegistro(formAoConcluir(passo))}
              aoRemarcar={(passo) => comecarRegistro(formAoRemarcar(passo))}
            />
            <RegistroDeInteracao
              form={form}
              aoMudar={mudarForm}
              aberto={aberto}
              etapa={lead.situacao}
              agora={agora}
              registrando={registrando}
              refDoTexto={campoDoTexto}
              className={area("c")}
              aoRegistrar={() => void registrar()}
            />
            <HistoricoDoLead historico={dados.historico} className={area("t")} />
            <DadosDoNegocio
              lead={lead}
              veiculo={dados.veiculo}
              etiquetasDisponiveis={etiquetasDisponiveis}
              etiquetasEditaveis={dados.etiquetasEditaveis}
              ocupado={ocupado}
              className={area("d")}
              aoGravar={(campos) => void gravarDados(campos)}
              aoIncluirEtiqueta={(e) => void salvarEtiquetas({ incluir: [e] })}
              aoRetirarEtiqueta={(e) => void salvarEtiquetas({ retirar: [e] })}
              aoSalvarAvaliacao={(campo, valor) => void gravar({ [campo]: valor }, { reiniciaORelogio: false })}
            />
          </div>
        </NivelDoTituloDeBloco.Provider>
      </>
    );
  }

  const modal = fechando && lead && dados && (
    <ModalDeDesfecho
      etapa={fechando}
      motivos={dados.motivos}
      lead={lead}
      aoConfirmar={confirmarDesfecho}
      aoCancelar={() => setFechando(null)}
    />
  );

  if (naPagina) {
    const vizinhos = dados?.vizinhos;
    return (
      <div data-layout="pagina" className="flex w-full flex-col gap-4">
        <nav aria-label="Navegação entre leads" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/admin/leads" className={LINK}>
            ← voltar para o quadro
          </Link>
          {vizinhos && (vizinhos.anterior || vizinhos.proximo) && (
            <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-mt-neutral-600">
              {vizinhos.anterior && (
                <Link href={urlDoLead(vizinhos.anterior)} className={LINK}>
                  ← lead anterior
                </Link>
              )}
              {vizinhos.anterior && vizinhos.proximo && <span aria-hidden="true">·</span>}
              {vizinhos.proximo && (
                <Link href={urlDoLead(vizinhos.proximo)} className={LINK}>
                  próximo lead da coluna →
                </Link>
              )}
            </span>
          )}
        </nav>
        {conteudo}
        {modal}
      </div>
    );
  }

  return (
    <>
      <div
        ref={caixa}
        id="detalhe-do-lead"
        role="dialog"
        aria-label={nome ? `Detalhe do lead ${nome}` : "Detalhe do lead"}
        tabIndex={-1}
        data-layout="gaveta"
        className="fixed bottom-0 right-0 top-16 z-30 flex w-[600px] max-w-full flex-col overflow-y-auto border-l-2 border-mt-ink bg-mt-bg shadow-[var(--mt-shadow-lg)] outline-none"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-mt-regua-fina bg-mt-bg px-6 py-3">
          <Link href={urlDoLead(id)} className={LINK}>
            abrir em página inteira
          </Link>
          <button
            type="button"
            onClick={pedirParaFechar}
            className="mt-foco mt-alvo cursor-pointer border-0 bg-transparent p-0 text-[11px] font-extrabold tracking-[.1em] text-mt-ink hover:text-mt-accent-hover"
          >
            FECHAR ✕
          </button>
        </div>
        {/* A pergunta mora na gaveta, e não numa caixa do navegador: o que foi
            escrito continua à vista enquanto a pessoa decide. */}
        {emAndamento && (querFechar || saidaPendente) && (
          <div
            role="alert"
            data-descarte
            className="sticky top-[45px] z-10 flex flex-wrap items-center gap-3 border-b border-l-[3px] border-b-mt-regua-fina border-l-mt-accent bg-mt-accent-100 px-6 py-3 text-xs text-mt-accent-800"
          >
            <span className="flex-1 font-semibold">{PERGUNTA_DO_DESCARTE}</span>
            <button
              type="button"
              onClick={() => {
                setQuerFechar(false);
                (aoDescartar ?? aoFechar)?.();
              }}
              className="mt-btn mt-btn-contorno mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => {
                setQuerFechar(false);
                aoManter?.();
                campoDoTexto.current?.focus();
              }}
              className="mt-btn mt-btn-tinta mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
            >
              Continuar escrevendo
            </button>
          </div>
        )}
        {conteudo}
      </div>
      {modal}
    </>
  );
}

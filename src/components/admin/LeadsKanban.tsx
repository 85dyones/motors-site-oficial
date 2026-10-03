"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SEM_DONO, criarMover, filtrarPorResponsavel, resumoDaBusca } from "../../lib/leadsKanban";
import {
  ETAPAS_PADRAO,
  ehTipoDeDesfecho,
  etapasDoQuadro,
  formatarPrazo,
  nivelDeEstagnacao,
  ordenarEtapas,
  type EtapaDoFunil,
  type MotivoDoFunil,
} from "../../lib/funil";
import { AVISO_DE_BUSCA_INVALIDA, filtroDaBusca } from "../../lib/gestaoDoLead";
import {
  AVISO_DE_LEAD_QUE_SAIU,
  aoMudarAUrl,
  aoMudarOEstado,
  aoVoltarOuAvancar,
  contarChips,
  contarEscopos,
  filtrarParados,
  filtrarPorChip,
  filtrarPorEscopo,
  iniciarSincronia,
  linhaDaBusca,
  padroesDoFunil,
  textoDoVazio,
  urlDoFunil,
  urlDoLead,
  type ChipDoFunil,
  type EstadoNaUrl,
  type LeadDaFila,
} from "../../lib/filaDoFunil";
import ModalDeDesfecho, { type DesfechoEscolhido } from "./ModalDeDesfecho";
import CardDoLead from "./CardDoLead";
import ControlesDoFunil from "./ControlesDoFunil";
import DetalheDoLead from "./DetalheDoLead";
import FechadosDoFunil from "./FechadosDoFunil";
import ListaDoDia from "./ListaDoDia";

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
 * 2. **Ganho e perdido são BOTÃO, não coluna.** Segunda rodada com o dono:
 *    *"não precisa de uma aba de ganho ou perdido, só um botão para
 *    destinar"*. É também o que quem opera funil há anos recomenda — *"nunca
 *    crie etapas Fechado"*: uma coluna terminal só cresce, e um quadro com
 *    duas colunas que nunca esvaziam deixa de ser um quadro de trabalho. As
 *    etapas continuam existindo no banco (é o que `leads.situacao` grava);
 *    o que sumiu foi o lugar delas na tela.
 *
 *    Fechar pede motivo, e o motivo abre a caixa. Sem escolha, nada é gravado
 *    — é a única forma de o relatório de perdas existir, porque motivo
 *    opcional é motivo vazio.
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
 *
 * **E o lead fechado não some.** Ele sai do quadro — é o que "sem coluna"
 * significa — mas ganha uma lista própria, com o motivo, a observação e um
 * caminho de volta. Card que desaparece sem deixar endereço é a falha muda que
 * este projeto persegue desde o primeiro dia.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-17 — a busca pela referência da mensagem
 * ---------------------------------------------------------------------------
 * O "(Ref: 0DCB1CDC)" do fim da mensagem de WhatsApp passa a ter onde ser
 * procurado. A regra mora em `lib/leadsKanban` (`normalizarRef`,
 * `resumoDaBusca`) e na rota; aqui ficam três cuidados de tela, cada um contra
 * um jeito de o lead achado parecer não achado:
 *
 * - o campo mora FORA do ramo que some quando não há lead — senão a busca
 *   vazia apagaria o próprio campo, e não haveria como desfazê-la;
 * - o que a tela diz vem do que o SERVIDOR confirmou (`refNaTela`), e não do
 *   que ela pediu: "nenhum lead ainda" é verdade para a fila vazia e mentira
 *   para a busca vazia;
 * - buscar limpa os filtros de responsável e de parados, que foram escolhidos
 *   para a fila e esconderiam justamente o lead procurado.
 *
 * ---------------------------------------------------------------------------
 * 2026-10-03 — a gestão do lead (desenho em `docs/design/gestao_do_lead`)
 * ---------------------------------------------------------------------------
 * O card emagreceu e o lead ganhou um DETALHE. O que mudou nesta tela:
 *
 * - **O card é o do desenho** (`CardDoLead`): nome, interesse, última
 *   interação, próximo passo, o link da conversa e as setas. Responsável,
 *   anotação e desfecho foram para o detalhe (`DetalheDoLead`), que abre ao
 *   clicar no card: gaveta em tela de 1024px ou mais, página abaixo disso.
 * - **Uma busca só** (`?busca=` da rota): nome, telefone ou referência, com
 *   pausa de digitação. Os três cuidados da busca por referência continuam: o
 *   campo mora fora do ramo que some, a tela diz o que o servidor confirmou
 *   (`buscaNaTela`), e buscar limpa o filtro que esconderia o lead achado.
 * - **Escopo e vista** (`lib/filaDoFunil`): o Comercial puro só recebe os
 *   leads dele, abre na Lista do dia e não tem o que alternar; quem vê a
 *   equipe abre no Quadro, em "Equipe", e "Minha fila" são os leads com o nome
 *   dele. Os chips "Atrasados" e "Hoje" contam sobre escopo e busca.
 * - **O trilho de etapas clicável saiu**; a barra de slide e as setas ficam.
 * - **A vista, o escopo e o lead aberto moram na URL** (`?vista=`, `?escopo=`,
 *   `?lead=`), para o link e para o voltar do navegador. A tela a escreve com
 *   `history.replaceState`: abrir um lead não vai ao servidor. A RECARGA da
 *   tela continua levando à Visão geral (`lib/recargaDoPainel`).
 * - **"Parados" e "Sem responsável"** voltaram como chips: o primeiro é o "só
 *   os parados" de antes, para todos; o segundo é do Administrador, que é quem
 *   enxerga o lead sem dono e o distribui. Ele força o Quadro: lead sem dono
 *   não tem próximo passo, e não aparece na Lista do dia.
 * - **Registro começado não se perde**: com algo escrito no detalhe, trocar de
 *   card pergunta antes (a pergunta mora na gaveta).
 * - **Reler a fila não desmonta a tela.** Só a primeira leitura mostra
 *   "Carregando": com a busca ao digitar e a gaveta aberta, trocar a tela
 *   inteira por um aviso apagaria o campo de busca e o que estava sendo
 *   escrito no detalhe.
 */

/** A partir daqui a gaveta cabe ao lado do trilho do painel. */
const CONSULTA_DA_GAVETA = "(min-width: 1024px)";

function assinarLargura(aoMudar: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const consulta = window.matchMedia(CONSULTA_DA_GAVETA);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

const telaLarga = () => typeof window.matchMedia !== "function" || window.matchMedia(CONSULTA_DA_GAVETA).matches;

/** A pausa de digitação antes de a busca sair. */
const PAUSA_DA_BUSCA_MS = 350;

/** Leva o foco de volta a quem abriu o detalhe: o card, a linha da lista. */
function focarQuemAbriu(id: string) {
  const alvo = [...document.querySelectorAll<HTMLElement>("[data-abre-lead]")].find(
    (el) => el.dataset.abreLead === id,
  );
  alvo?.focus();
}

interface BuscaNaTela {
  termo?: string | null;
  tipo?: "nome" | "telefone" | "ref";
  ref?: string;
}

export default function LeadsKanban({ meuNome = null }: { meuNome?: string | null }) {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadDaFila[]>([]);
  const [etapas, setEtapas] = useState<EtapaDoFunil[]>(ETAPAS_PADRAO);
  const [motivos, setMotivos] = useState<MotivoDoFunil[]>([]);
  const [podeConfigurar, setPodeConfigurar] = useState(false);
  // Quem só enxerga os próprios leads (o vendedor) não precisa ler o próprio
  // nome em cada card, nem tem "Equipe" para alternar. A regra de quem vê o
  // quê é do servidor (`escopoDeLeads`).
  const [soOsMeus, setSoOsMeus] = useState(false);
  /** O `escopo` da rota: "todos" é o Administrador, o único que vê lead sem dono. */
  const [escopoDoServidor, setEscopoDoServidor] = useState<string | null>(null);
  // As etiquetas (2026-09-25): as vistas nas conversas vêm com a fila; as
  // criadas na conta do Chatwoot vêm depois, numa leitura à parte, para a fila
  // não esperar a API. Guardadas separadas porque `carregar` renova a
  // primeira e não pode apagar a segunda.
  const [etiquetasVistas, setEtiquetasVistas] = useState<string[]>([]);
  const [etiquetasDaConta, setEtiquetasDaConta] = useState<string[]>([]);
  const [etiquetasEditaveis, setEtiquetasEditaveis] = useState(false);
  // Das duas da passagem, as que não existem na conta do Chatwoot — gravadas
  // na conversa, mas invisíveis na tela de lá. Ver GET `/api/leads/etiquetas`.
  const [faltamNaConta, setFaltamNaConta] = useState<string[]>([]);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  // O que deu certo pela metade: a gravação valeu e algo ao lado dela não.
  // Não é `erro`: o card não voltou atrás.
  const [avisoDaGravacao, setAvisoDaGravacao] = useState("");
  /** Leituras secundárias da fila que falharam (`avisos` da rota). */
  const [avisosDaFila, setAvisosDaFila] = useState<string[]>([]);
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [agregado, setAgregado] = useState<{ total: number; porSituacao: Record<string, number> } | null>(null);

  const [chip, setChip] = useState<ChipDoFunil | null>(null);
  const [soParados, setSoParados] = useState(false);
  const [soSemDono, setSoSemDono] = useState(false);
  /** Há registro começado no detalhe aberto (quem diz é o detalhe). */
  const [rascunhoAberto, setRascunhoAberto] = useState(false);
  /** O card que foi clicado com um registro começado em outro lead. */
  const [trocaPendente, setTrocaPendente] = useState<string | null>(null);

  // ── a busca única ─────────────────────────────────────────────────────
  // Três estados, e não um, porque respondem a perguntas diferentes:
  /** O que está escrito no campo. */
  const [buscaDigitada, setBuscaDigitada] = useState("");
  /** O que a tela PEDIU ao servidor; `null` é a fila. É o que `carregar` lê. */
  const [buscaPedida, setBuscaPedida] = useState<string | null>(null);
  /** O que o servidor CONFIRMOU: o que os `leads` na tela são. É o que ela diz. */
  const [buscaNaTela, setBuscaNaTela] = useState<BuscaNaTela | null>(null);

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [fechando, setFechando] = useState<{ lead: LeadDaFila; etapa: EtapaDoFunil } | null>(null);
  const [vendoFechados, setVendoFechados] = useState(false);
  /** Sobe quando o quadro grava algo no lead aberto: o detalhe relê. */
  const [versaoDoAberto, setVersaoDoAberto] = useState(0);

  const trilho = useRef<HTMLDivElement>(null);
  const [progresso, setProgresso] = useState(0);
  const [rolavel, setRolavel] = useState(false);

  // ── a vista, o escopo e o lead aberto, em sincronia com a URL ─────────
  // A tela reage no clique e escreve a URL com `history.replaceState` (sem ida
  // ao servidor). A URL que muda por fora (um link, o voltar do navegador) é
  // adotada. Ver `SincroniaComAUrl`.
  const queryDaUrl = useSearchParams().toString();
  const [sincronia, setSincronia] = useState(() => iniciarSincronia(queryDaUrl));
  if (queryDaUrl !== sincronia.ultimaQuery) {
    setSincronia(aoMudarAUrl(sincronia, queryDaUrl, typeof window === "undefined" ? queryDaUrl : window.location.search));
  }
  const naUrl = sincronia.estado;

  const navegar = (parcial: Partial<EstadoNaUrl>) => {
    const proxima = aoMudarOEstado(sincronia, parcial);
    if (proxima === sincronia) return;
    setSincronia(proxima);
    window.history.replaceState(window.history.state, "", urlDoFunil(proxima.estado));
  };

  // O voltar e o avançar do navegador: vale o que a barra de endereços mostra.
  useEffect(() => {
    const aoVoltar = () => setSincronia((s) => aoVoltarOuAvancar(s, window.location.search));
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  // A gaveta só existe em tela larga. Abaixo disso o detalhe é a página.
  const largo = useSyncExternalStore(assinarLargura, telaLarga, () => true);
  const leadNaGaveta = largo ? naUrl.lead : null;
  useEffect(() => {
    if (naUrl.lead && !largo) router.replace(urlDoLead(naUrl.lead));
  }, [naUrl.lead, largo, router]);

  // O relógio só anda quando a tela repinta, e o kanban fica aberto o dia
  // inteiro no balcão. Sem este tique, um card que apodrece às 14h continua
  // branco até alguém abrir a tela de novo — e a cor que ninguém vê mudar não
  // avisa nada. Um minuto é a menor unidade que a tela mostra.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  /**
   * Lê a fila — ou, com `buscaPedida`, a busca. Sem parâmetro de propósito.
   *
   * Quem chama é o botão Atualizar (`onClick={carregar}`), a falha de gravação
   * e o efeito de montagem, e os três querem a mesma coisa: reler o que está
   * pedido. Um parâmetro aqui receberia, do `onClick`, o `MouseEvent` — e a
   * URL sairia com `busca=[object Object]`, o defeito que a primeira versão
   * da busca (26/08) achou no próprio botão.
   *
   * `pedido` numera as leituras: com a busca ao digitar, a resposta de um
   * termo antigo pode chegar depois da do novo, e não pode pintar por cima.
   */
  const pedido = useRef(0);
  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch(
        buscaPedida
          ? `/api/leads/gerenciar?busca=${encodeURIComponent(buscaPedida)}`
          : "/api/leads/gerenciar",
      );
      const d = await res.json();
      if (meu !== pedido.current) return;
      if (!res.ok) throw new Error(d.error || "Falha ao carregar leads");
      if (d.migracaoPendente) {
        setMigracaoPendente(true);
      } else if (d.somenteAgregado) {
        setAgregado({ total: d.total, porSituacao: d.porSituacao });
      } else {
        setLeads(d.leads ?? []);
        // Junto com os leads, e só quando eles chegam: se a busca falhar, a
        // tela continua mostrando — e dizendo — o que mostrava antes.
        setBuscaNaTela(d.busca ?? null);
        // Sem `funil_etapas` no banco, o funil de sempre. Uma tela sem coluna
        // nenhuma faria os leads sumirem — ausência sem erro, de novo não.
        setEtapas(d.etapas?.length ? ordenarEtapas(d.etapas) : ETAPAS_PADRAO);
        setMotivos(d.motivos ?? []);
        setPodeConfigurar(Boolean(d.podeConfigurar));
        setSoOsMeus(d.escopo === "meus");
        setEscopoDoServidor(typeof d.escopo === "string" ? d.escopo : null);
        setEtiquetasVistas(d.etiquetasDisponiveis ?? []);
        setEtiquetasEditaveis(Boolean(d.etiquetasEditaveis));
        setAvisosDaFila(Array.isArray(d.avisos) ? d.avisos : []);
      }
    } catch (e: unknown) {
      if (meu === pedido.current) setErro(e instanceof Error ? e.message : "Falha ao carregar leads");
    } finally {
      if (meu === pedido.current) {
        setCarregando(false);
        setPrimeiraCarga(false);
      }
    }
  }, [buscaPedida]);

  // Roda na montagem e a cada `buscaPedida` nova — é assim que buscar e voltar
  // para a fila disparam a leitura.
  useEffect(() => {
    carregar();
  }, [carregar]);

  // As etiquetas criadas na conta do Chatwoot, uma vez, e só se dá para
  // editar. Falhou, o detalhe fica com as vistas nas conversas e as duas da
  // passagem — que é o que a rota devolve de qualquer jeito.
  useEffect(() => {
    if (!etiquetasEditaveis) return;
    let vivo = true;
    fetch("/api/leads/etiquetas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        if (Array.isArray(d?.etiquetas)) setEtiquetasDaConta(d.etiquetas);
        if (Array.isArray(d?.faltamNaConta)) setFaltamNaConta(d.faltamNaConta);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [etiquetasEditaveis]);

  const etiquetasDisponiveis = useMemo(
    () =>
      [...new Set([...etiquetasVistas, ...etiquetasDaConta])].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [etiquetasVistas, etiquetasDaConta],
  );

  // ── a busca: digitar, pausar, pedir ───────────────────────────────────
  const aoBuscar = (valor: string) => {
    setBuscaDigitada(valor);
    if (filtroDaBusca(valor)) {
      // Buscar limpa os filtros escolhidos para a fila, que esconderiam
      // justamente o lead procurado.
      setChip(null);
      setSoParados(false);
      setSoSemDono(false);
    } else {
      // Campo vazio ou termo curto demais: a tela volta para a fila.
      setBuscaPedida(null);
    }
  };

  useEffect(() => {
    const termo = buscaDigitada.trim();
    if (!termo || !filtroDaBusca(termo)) return;
    const t = setTimeout(() => setBuscaPedida(termo), PAUSA_DA_BUSCA_MS);
    return () => clearTimeout(t);
  }, [buscaDigitada]);

  /**
   * Enter no campo: busca agora. Pedir de novo o que já está pedido não muda
   * estado nenhum — e sem mudança o efeito de leitura não roda. Por isso o
   * mesmo pedido chama `carregar` direto: o lead que não existia há um minuto
   * pode ter acabado de chegar.
   */
  const enviarBusca = () => {
    const termo = buscaDigitada.trim();
    if (termo && !filtroDaBusca(termo)) {
      setErro(AVISO_DE_BUSCA_INVALIDA);
      return;
    }
    const pedir = termo || null;
    if (pedir === buscaPedida) void carregar();
    else setBuscaPedida(pedir);
  };

  const limparBusca = () => {
    setBuscaDigitada("");
    setBuscaPedida(null);
  };

  /**
   * A gravação falhou: relê a fila e SÓ DEPOIS mostra o porquê.
   *
   * Na ordem inversa o aviso nunca aparecia — `carregar` começa limpando o
   * erro, e o `setErro` de quem falhou era apagado no mesmo lote, antes de a
   * tela pintar. Foi assim até 25/09: a recusa "só o Comercial recebe lead"
   * voltava da rota e sumia, e o card só "pulava" de volta, sem dizer nada.
   */
  const falhou = useCallback(
    (mensagem: string) => {
      void carregar().finally(() => setErro(mensagem));
    },
    [carregar],
  );

  /**
   * Grava um campo do lead. Otimista: a tela reage na hora e relê do servidor
   * se der errado — o inverso (esperar a rede) faz o card "pular" de volta e
   * parecer que o clique não pegou.
   */
  const salvar = useCallback(
    async (id: string, campos: Record<string, unknown>) => {
      // `contato` é uma AÇÃO, não um campo do lead: ele vai no corpo do PATCH
      // e não pode entrar no objeto local, senão o card passa a carregar uma
      // propriedade que nenhum tipo descreve e que a próxima leitura do
      // servidor não traz de volta.
      const camposDoLead: Record<string, unknown> = { ...campos };
      delete camposDoLead.contato;
      if (typeof campos.situacao === "string") {
        // O gatilho do banco carimba o desfecho na etapa terminal e o limpa ao
        // sair dela. Refletir aqui é o que tira o lead fechado do quadro (e o
        // reaberto da lista de Fechados) sem esperar a próxima leitura.
        const tipo = etapas.find((e) => e.chave === campos.situacao)?.tipo;
        camposDoLead.desfecho = ehTipoDeDesfecho(tipo) ? tipo : null;
        camposDoLead.desfecho_em = ehTipoDeDesfecho(tipo) ? new Date().toISOString() : null;
      }
      setLeads((atual) =>
        atual.map((l) =>
          l.id === id
            ? {
                ...l,
                ...(camposDoLead as Partial<LeadDaFila>),
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
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(d.error || "Falha ao salvar");
        }
        if (Array.isArray(d.etiquetas)) {
          setLeads((atual) => atual.map((l) => (l.id === id ? { ...l, etiquetas: d.etiquetas } : l)));
        }
        if (typeof d.aviso === "string" && d.aviso) setAvisoDaGravacao(d.aviso);
        // O detalhe aberto mostra a etapa e o histórico deste lead: relê.
        setVersaoDoAberto((v) => v + 1);
      } catch (e: any) {
        // Relê em vez de restaurar um retrato tirado antes da chamada: com
        // vários consultores mexendo na mesma fila, o retrato local já pode
        // estar velho, e restaurá-lo desfaria o trabalho de outro.
        falhou(e.message);
      }
    },
    [falhou, etapas],
  );

  /**
   * Move o card. Se o destino é etapa terminal — ganho, perdido OU descarte —,
   * a caixa de motivos entra na frente: o card só chega lá com um "por quê".
   *
   * A decisão inteira mora em `criarMover` (`lib/leadsKanban`), e o que sobra
   * aqui é a fiação: quem são as etapas, quem são os leads, o que é "pedir
   * motivo" nesta tela e o que é "gravar". Ela saiu daqui porque dentro do
   * componente só podia ser testada LENDO o arquivo — e foi uma lista escrita
   * aqui, `ganho || perdido`, que deixou todo descarte sem motivo desde
   * 2026-08-28. Ver o cabeçalho de `criarMover`.
   */
  const mover = (id: string, chave: string) =>
    criarMover({
      etapas,
      leads,
      pedirMotivo: (lead, etapa) => setFechando({ lead, etapa }),
      gravar: salvar,
    })(id, chave);

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
   * O atalho da conversa. Abre a conversa E registra o contato.
   *
   * O registro é o que faz o link valer mais que um link: sem ele, o vendedor
   * que acabou de falar com o cliente recebe, uma hora depois, um alerta
   * cobrando que fale com o cliente. Dois desses e ninguém lê mais alerta.
   *
   * A gravação é solta (`void`) de propósito: a janela abre no clique, sem
   * esperar a rede. Registro que falha vira, no pior caso, um lembrete a
   * mais — bem melhor que um clique que trava.
   */
  const falarNoWhatsApp = useCallback(
    (lead: LeadDaFila) => {
      void salvar(lead.id, { contato: "whatsapp" });
    },
    [salvar],
  );

  /** O detalhe mudou o lead (registro, etapa, responsável): o card acompanha. */
  const aoMudarLead = useCallback((id: string, campos: Partial<LeadDaFila>) => {
    setLeads((atual) => atual.map((l) => (l.id === id ? { ...l, ...campos } : l)));
    // O relógio da tela acompanha: o passo que acabou de ser gravado para
    // "agora" não pode se ler como futuro até o próximo tique.
    setAgora(Date.now());
  }, []);

  const aoSairDeSincronia = useCallback(() => {
    void carregar();
  }, [carregar]);

  // ── o que a tela mostra: escopo, busca e chip ─────────────────────────
  const buscando = buscaNaTela !== null;
  const padroes = padroesDoFunil(soOsMeus ? "meus" : null, meuNome);
  const escopo = naUrl.escopo ?? padroes.escopo;
  const vista = naUrl.vista ?? padroes.vista;

  const noEscopo = useMemo(
    () => filtrarPorEscopo(leads, { temEscopo: padroes.temEscopo, escopo, meuNome, buscando }),
    [leads, padroes.temEscopo, escopo, meuNome, buscando],
  );

  /** Os que ainda estão em jogo — o quadro é só deles. */
  const emAberto = useMemo(() => noEscopo.filter((l) => !l.desfecho), [noEscopo]);

  // Os chips contam sobre escopo e busca, nunca sobre o total.
  const contasDosChips = useMemo(() => contarChips(emAberto, agora), [emAberto, agora]);
  const contasDoEscopo = useMemo(() => contarEscopos(leads, meuNome), [leads, meuNome]);
  // "Sem responsável" é do Administrador (`escopo: "todos"`): só ele recebe o
  // lead sem dono. "Parados" é de todos.
  const veSemDono = escopoDoServidor === "todos";
  const semDono = useMemo(() => filtrarPorResponsavel(emAberto, SEM_DONO), [emAberto]);
  const parados = useMemo(() => filtrarParados(emAberto, etapas, agora), [emAberto, etapas, agora]);
  /** O que os filtros de ligar e desligar deixam: é o que a Lista do dia agrupa. */
  const filtrados = useMemo(() => {
    const porDono = soSemDono && veSemDono ? filtrarPorResponsavel(emAberto, SEM_DONO) : emAberto;
    return soParados ? filtrarParados(porDono, etapas, agora) : porDono;
  }, [emAberto, soSemDono, veSemDono, soParados, etapas, agora]);
  const visiveis = useMemo(() => filtrarPorChip(filtrados, chip, agora), [filtrados, chip, agora]);

  // As colunas do quadro são só as etapas ABERTAS: ganho e perdido viraram
  // botão. Passa `emAberto` e não `leads` de propósito — `etapasDoQuadro`
  // mantém à vista a coluna arquivada que ainda tem card, e um lead fechado
  // numa etapa arquivada ressuscitaria a coluna sem ninguém entender por quê.
  const colunasVisiveis = useMemo(() => etapasDoQuadro(etapas, emAberto), [etapas, emAberto]);

  const fechados = useMemo(
    () =>
      noEscopo
        .filter((l) => l.desfecho)
        .sort(
          (a, b) =>
            new Date(b.desfecho_em ?? b.created_at).getTime() -
            new Date(a.desfecho_em ?? a.created_at).getTime(),
        ),
    [noEscopo],
  );

  const rotuloDoMotivo = useCallback(
    (chave?: string | null) =>
      chave ? motivos.find((m) => m.chave === chave)?.rotulo ?? chave : null,
    [motivos],
  );

  const rotuloDaEtapa = useCallback(
    (chave: string) => etapas.find((e) => e.chave === chave)?.rotulo ?? chave,
    [etapas],
  );

  /**
   * Devolve o lead ao funil, na etapa que a pessoa escolher.
   *
   * A etapa é escolhida e não adivinhada: o gatilho do banco limpa o desfecho
   * ao sair de uma etapa terminal, mas não sabe de onde o lead veio — isso
   * está no rastro, e adivinhar errado colocaria um negócio em "Proposta" sem
   * que proposta nenhuma existisse.
   */
  const reabrir = useCallback(
    (id: string, chave: string) => salvar(id, { situacao: chave }),
    [salvar],
  );

  /**
   * O que a busca achou além do quadro: lead fechado não está nas colunas, e
   * a busca que acha só um lead fechado desenharia colunas vazias — quadro
   * vazio se lê como "não achei". Na busca por referência, também o aviso de
   * mais de um lead com o mesmo código (`resumoDaBusca`).
   */
  const alemDoQuadro = useMemo(() => {
    if (!buscaNaTela || leads.length === 0) return null;
    const resumo = resumoDaBusca(buscaNaTela.ref ?? "", leads);
    const frases = buscaNaTela.ref ? resumo.frases : resumo.fechados > 0 ? [resumo.frases[1]] : [];
    return frases.length > 0 ? { frases, fechados: resumo.fechados } : null;
  }, [buscaNaTela, leads]);

  const termoInvalido = buscaDigitada.trim() !== "" && !filtroDaBusca(buscaDigitada);

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
    // Depois de pintar: o quadro acabou de mudar de largura (colunas, cards,
    // a gaveta que abriu ao lado).
    const quadro = requestAnimationFrame(medir);
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", medir);
    };
  }, [medir, colunasVisiveis.length, visiveis.length, vista, leadNaGaveta]);

  const deslizar = (valor: number) => {
    const el = trilho.current;
    if (!el) return;
    el.scrollLeft = (valor / 100) * (el.scrollWidth - el.clientWidth);
    setProgresso(valor);
  };

  /**
   * Rolagem automática ao arrastar perto da borda.
   *
   * Sem isto, mover um card da primeira para a última coluna é impossível no
   * mouse: o cursor chega na borda da tela e o trilho não anda. É o par
   * natural da barra — ela resolve a navegação, esta resolve o arrasto.
   */
  const arrastarNaBorda = (clientX: number) => {
    const el = trilho.current;
    if (!el || !arrastando) return;
    const { left, right } = el.getBoundingClientRect();
    const zona = 80;
    if (clientX < left + zona) el.scrollLeft -= 18;
    else if (clientX > right - zona) el.scrollLeft += 18;
  };

  // ── abrir e fechar o detalhe ──────────────────────────────────────────
  const abrirLead = (id: string) => {
    // Abaixo de 1024px a gaveta não cabe: o detalhe é a página.
    if (!largo) {
      router.push(urlDoLead(id));
      return;
    }
    if (id === leadNaGaveta) return;
    // Há um registro começado no lead aberto: a gaveta pergunta antes de trocar.
    if (leadNaGaveta && rascunhoAberto) {
      setTrocaPendente(id);
      return;
    }
    navegar({ lead: id });
  };

  const fecharLead = () => {
    const id = naUrl.lead;
    setRascunhoAberto(false);
    setTrocaPendente(null);
    navegar({ lead: null });
    if (id) focarQuemAbriu(id);
  };

  /** "Descartar": segue para o card que foi clicado, ou fecha a gaveta. */
  const descartarRascunho = () => {
    const destino = trocaPendente;
    if (!destino) {
      fecharLead();
      return;
    }
    setRascunhoAberto(false);
    setTrocaPendente(null);
    navegar({ lead: destino });
  };

  /**
   * O lead aberto saiu do escopo de quem olha (o vendedor passou o lead
   * adiante, e a releitura respondeu 404): a gaveta fecha, a fila é relida, e a
   * tela diz o que houve. O aviso entra DEPOIS da releitura, como em `falhou`.
   */
  const aoSumirOLead = () => {
    setRascunhoAberto(false);
    setTrocaPendente(null);
    navegar({ lead: null });
    void carregar().finally(() => setAvisoDaGravacao(AVISO_DE_LEAD_QUE_SAIU));
  };

  if (primeiraCarga) {
    return (
      <div role="status" className="py-16 text-center text-xs text-mt-neutral-700">
        Carregando leads…
      </div>
    );
  }

  const semLeads = leads.length === 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Geral</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Leads</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            Cada contato enviado pelo site entra aqui. Abra o lead para registrar o que aconteceu e
            definir o próximo passo; a conversa continua no WhatsApp.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* `aria-live` e não `role="status"`: os avisos da tela é que são status. */}
          <span aria-live="polite" className="text-[11px] text-mt-neutral-700">
            {carregando ? "Atualizando…" : ""}
          </span>
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
        <div role="alert" className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}

      {avisosDaFila.map((aviso) => (
        <div key={aviso} className="border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          {aviso}
        </div>
      ))}

      {faltamNaConta.length > 0 && (
        <div className="border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          No Chatwoot, falta criar a etiqueta {faltamNaConta.join(" e ")} na conta. A passagem do SDR
          grava {faltamNaConta.length > 1 ? "as duas" : "ela"} na conversa, mas o Chatwoot só mostra
          etiqueta criada.
        </div>
      )}

      {avisoDaGravacao && (
        <div
          role="status"
          className="flex items-start gap-3 border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800"
        >
          <span className="flex-1">{avisoDaGravacao}</span>
          <button
            type="button"
            onClick={() => setAvisoDaGravacao("")}
            aria-label="Fechar o aviso"
            className="mt-foco cursor-pointer text-mt-neutral-600 hover:text-mt-accent"
          >
            ×
          </button>
        </div>
      )}

      {/* ── a linha de controles ───────────────────────────────────────────
          FORA do bloco condicional de baixo de propósito: a busca que não
          acha nada esvazia `leads`, e um campo que morasse no ramo de "há
          leads" sumiria junto — sem campo, sem como desfazer a busca.
          Marketing não a vê: a rota recusa a busca a quem fica no agregado. */}
      {!migracaoPendente && !agregado && (
        <ControlesDoFunil
          busca={buscaDigitada}
          aoBuscar={aoBuscar}
          aoEnviarBusca={enviarBusca}
          aoLimparBusca={limparBusca}
          linhaDaBusca={buscando ? linhaDaBusca(leads.length, !soOsMeus) : null}
          dicaDaBusca={termoInvalido ? AVISO_DE_BUSCA_INVALIDA : null}
          buscando={buscando}
          temEscopo={padroes.temEscopo}
          escopo={escopo}
          contasDoEscopo={contasDoEscopo}
          aoMudarEscopo={(novo) => navegar({ escopo: novo })}
          vista={vista}
          aoMudarVista={(nova) => {
            // Lead sem dono não tem próximo passo: na Lista do dia o filtro
            // deixaria a tela vazia sem dizer por quê.
            if (nova === "lista") setSoSemDono(false);
            navegar({ vista: nova });
          }}
          chip={chip}
          contasDosChips={contasDosChips}
          aoMudarChip={setChip}
          parados={parados.length}
          soParados={soParados}
          aoAlternarParados={() => setSoParados((v) => !v)}
          semResponsavel={veSemDono ? semDono.length : null}
          soSemResponsavel={soSemDono && veSemDono}
          aoAlternarSemResponsavel={() => {
            // Ligar o filtro leva ao Quadro: é onde o lead sem dono está.
            if (!soSemDono) navegar({ vista: "quadro" });
            setSoSemDono((v) => !v);
          }}
          fechados={fechados.length}
          vendoFechados={vendoFechados}
          aoAlternarFechados={() => setVendoFechados((v) => !v)}
        />
      )}

      {alemDoQuadro && (
        <div
          role="status"
          className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs leading-relaxed text-mt-accent-800"
        >
          <strong>{alemDoQuadro.frases[0]}</strong> {alemDoQuadro.frases.slice(1).join(" ")}
          {alemDoQuadro.fechados > 0 && !vendoFechados && (
            <button
              type="button"
              onClick={() => setVendoFechados(true)}
              className="mt-foco ml-2 cursor-pointer font-semibold underline"
            >
              ver os fechados
            </button>
          )}
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
      ) : semLeads ? (
        <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-10 text-center">
          {buscaNaTela?.ref ? (
            <>
              <div className="text-[15px] font-extrabold tracking-[-.01em]">
                Nenhum lead com a referência {buscaNaTela.ref}
              </div>
              {/* A ressalva não é rodapé. Sem ela o atendente conclui que
                  digitou errado e tenta de novo — quando o contato pode
                  simplesmente não ter virado lead com rastreio: o `ag_uid` só
                  é gravado por `/api/leads`, desde 2026-09-02, e só quem envia
                  um formulário passa por ela. O lead que o Chatwoot cria de
                  uma conversa nasce sem ele. */}
              <p className="mx-auto mt-2 max-w-[520px] text-xs leading-relaxed text-mt-neutral-700">
                Confira os oito caracteres. Se estiverem certos, este contato não virou lead com
                referência: ela só fica guardada quando a pessoa envia um formulário do site, e só
                nos leads recebidos a partir de 02/09/2026. Nesses casos, procure pelo nome ou
                pelo telefone.
              </p>
            </>
          ) : buscando ? (
            <>
              <div className="text-[15px] font-extrabold tracking-[-.01em]">Nenhum lead encontrado</div>
              <p className="mx-auto mt-2 max-w-[520px] text-xs leading-relaxed text-mt-neutral-700">
                Confira o que foi digitado. A busca por nome diferencia acento: “Joao” não acha “João”.
                {soOsMeus ? " Ela procura só entre os seus leads." : ""}
              </p>
            </>
          ) : (
            <>
              <div className="text-[15px] font-extrabold tracking-[-.01em]">Nenhum lead ainda</div>
              <p className="mx-auto mt-2 max-w-[460px] text-xs leading-relaxed text-mt-neutral-700">
                Os contatos enviados pelos formulários do site aparecem aqui assim que chegam.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {vista === "lista" ? (
            <ListaDoDia
              leads={filtrados}
              agora={agora}
              chip={chip}
              rotuloDaEtapa={rotuloDaEtapa}
              leadAberto={leadNaGaveta}
              temEscopo={padroes.temEscopo}
              buscando={buscando}
              aoAbrir={abrirLead}
              aoVerNoQuadro={() => {
                setChip(null);
                navegar({ vista: "quadro" });
              }}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {visiveis.length === 0 && (
                <p className="m-0 border border-dashed border-mt-regua-fina bg-mt-surface p-6 text-center text-xs text-mt-neutral-700">
                  {textoDoVazio(padroes.temEscopo)}
                </p>
              )}

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
                    className="mt-range mt-foco"
                  />
                  <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-mt-neutral-600">
                    {progresso}%
                  </span>
                </label>
              )}

              <div
                ref={trilho}
                onScroll={medir}
                onDragOver={(e) => arrastarNaBorda(e.clientX)}
                className="relative flex gap-0.5 overflow-x-auto pb-4"
              >
                {colunasVisiveis.map((etapa, i) => {
                  const daEtapa = visiveis.filter((l) => l.situacao === etapa.chave);
                  const alvo = colunaAlvo === etapa.chave && arrastando !== null;
                  return (
                    <div
                      key={etapa.chave}
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
                        // A régua de tempo da etapa, que morava no trilho de
                        // etapas clicável.
                        title={
                          etapa.estagnacao_minutos
                            ? `Cobra em ${formatarPrazo(etapa.estagnacao_minutos)}` +
                              (etapa.protegida || !etapa.transferencia_minutos
                                ? " · não transfere"
                                : ` · transfere em ${formatarPrazo(etapa.transferencia_minutos)}`)
                            : "Sem régua de tempo"
                        }
                      >
                        <span className="text-[11px] font-extrabold uppercase tracking-[.1em]">
                          {etapa.rotulo}
                        </span>
                        {!etapa.ativa && (
                          <span className={`text-[10px] ${i === 0 ? "text-mt-neutral-400" : "text-mt-accent-800"}`}>
                            arquivada
                          </span>
                        )}
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
                        {daEtapa.map((l) => (
                          <CardDoLead
                            key={l.id}
                            lead={l}
                            nivel={nivelDeEstagnacao(l, etapa, agora)}
                            agora={agora}
                            soOsMeus={soOsMeus}
                            aberto={leadNaGaveta === l.id}
                            arrastando={arrastando === l.id}
                            podeVoltar={i > 0}
                            podeAvancar={i < colunasVisiveis.length - 1}
                            aoAbrir={abrirLead}
                            aoVoltar={() => mover(l.id, colunasVisiveis[i - 1].chave)}
                            aoAvancar={() => mover(l.id, colunasVisiveis[i + 1].chave)}
                            aoConversar={falarNoWhatsApp}
                            aoComecarArrasto={(e) => {
                              e.dataTransfer.setData("text/plain", l.id);
                              e.dataTransfer.effectAllowed = "move";
                              setArrastando(l.id);
                            }}
                            aoTerminarArrasto={() => {
                              setArrastando(null);
                              setColunaAlvo(null);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* Com a gaveta aberta, as últimas colunas ficariam atrás dela:
                    este respiro deixa o trilho rolar até elas aparecerem. */}
                {leadNaGaveta && <div aria-hidden="true" className="w-[572px] flex-none" />}
              </div>
            </div>
          )}

          {/* ── os fechados ──────────────────────────────────────────────
              Ganho e perdido saíram do quadro; esta é a lista onde eles
              moram, com o caminho de volta. */}
          {vendoFechados && (
            <FechadosDoFunil
              fechados={fechados}
              etapasAbertas={colunasVisiveis}
              rotuloDoMotivo={rotuloDoMotivo}
              aoReabrir={reabrir}
              aoAbrir={abrirLead}
            />
          )}
        </>
      )}

      {leadNaGaveta && (
        <DetalheDoLead
          key={leadNaGaveta}
          id={leadNaGaveta}
          layout="gaveta"
          versao={versaoDoAberto}
          etiquetasDaConta={etiquetasDisponiveis}
          saidaPendente={trocaPendente !== null}
          aoFechar={fecharLead}
          aoDescartar={descartarRascunho}
          aoManter={() => setTrocaPendente(null)}
          aoMudarRascunho={setRascunhoAberto}
          aoSumir={aoSumirOLead}
          aoMudarLead={aoMudarLead}
          aoSairDeSincronia={aoSairDeSincronia}
        />
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

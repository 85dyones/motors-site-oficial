"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { getEstoque, Veiculo } from "../lib/supabase";
import { disponiveisDe, precoVigente } from "../lib/regrasEstoque";
import { logFlowInitiated, getActiveAgUid, getMatchParamsRespeitandoRecusa, getUtmParameters, rastreamentoRecusado, sufixoRef, trackCarMatch, trackLeadSubmission, trackContactClick, trackPassoDoProfiler } from "../lib/telemetry";
import { precoDoCarro } from "../lib/fichaDoMotor";
import {
  antesDe,
  cambioUnicoDe,
  carrosDoLead,
  comCambio,
  comItemAlternado,
  comJeitoAlternado,
  comLeva,
  depoisDe,
  idsDasRespostas,
  ordemFixa,
  perfilAteOJeito,
  perfilDe,
  PERGUNTAS,
  RESPOSTAS_EM_BRANCO,
  quantosSobram,
  sequenciaDe,
  tetoDe,
  textoDaContagem,
  type EstadoQuiz,
  type IdDaPergunta,
  type PorMes,
  type RespostasDoQuiz,
} from "../lib/perguntasDoProfiler";
import type { ParametrosDoFinanciamento } from "../lib/finance-calculator";
import { avisoDeCredito } from "../lib/textoDaParcela";
import {
  carrosNaFaixa,
  criteriosDoPerfil,
  elegivel,
  faixasDoPatio,
  ITENS_QUE_NAO_PODEM_FALTAR,
  MAXIMO_DO_QUE_NAO_PODE_FALTAR,
  nomeCurto,
  OCUPACOES,
  PISO_DO_VALOR_EXATO,
  pisoDoValorExato,
  PRAZOS_DO_POR_MES,
  PREFERENCIAS,
  type ChaveDeFiltro,
  type ChaveDePreferencia,
  type ItemQueNaoPodeFaltar,
  type Jeito,
  type Leva,
  type Ocupacao,
  type PerfilDoQuiz,
  type PreferenciaDeCambio,
  type Recomendacao,
} from "../lib/motorDoMatch";
import LeadCaptureModal from "./LeadCaptureModal";
import ResultadoDoProfiler from "./ResultadoDoProfiler";
import { useTheme } from "../app/ThemeContext";
import { Rotulo, Seta } from "./modernist/primitivos";
import { linkWhatsApp, telefoneDoLead } from "../lib/whatsapp";
import { ACOES } from "../lib/turnstile";

/**
 * Tela 04 — Garagem Profiler, na linguagem Modernist.
 *
 * O quiz ocupa a tela inteira em fundo escuro, com o perfil se formando na
 * coluna clara ao lado — comparativo tipo assistente de compra, como no
 * design doc. A régua de progresso substitui a trilha de bolinhas.
 *
 * O que NÃO mudou: perguntas, pontuação, faixas de orçamento derivadas do
 * estoque, curador por texto livre, chamadas de telemetria e o payload
 * enviado ao n8n. Isto aqui é troca de camada de apresentação; os textos
 * longos que vão no payload continuam saindo das funções `format*`.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-25 — "Três do Pátio" (fase 1)
 * ---------------------------------------------------------------------------
 * As perguntas continuam as mesmas (mais a opção Hatch); o que mudou foi o que
 * se faz com elas. O motor de etiquetas deu lugar ao motor de fatos
 * (`lib/motorDoMatch.ts`): o resultado são três carros com o porquê de cada
 * um, sem "% COMPATÍVEL" e sem a animação de 3,2 s que fingia calcular. Spec:
 * `docs/superpowers/specs/2026-09-25-garagem-profiler-tres-do-patio-design.md`.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-25 — perguntas-fato (fase 2)
 * ---------------------------------------------------------------------------
 * As perguntas 02 a 05 deixaram de perguntar desejo ("o que mais pesa na sua
 * escolha?") e passaram a perguntar FATO: quem vai no carro, que jeito de
 * carro, o câmbio e o que não pode faltar. Cada opção mostra, antes do toque,
 * quantos carros do pátio sobram com ela — a mesma conta do resultado
 * (`carrosNaFaixa`), sobre o estoque que esta tela já baixou. A 03 some para
 * quem leva carga, e a 04 some quando tudo o que sobrou tem o mesmo câmbio.
 * O PRAZO saiu do quiz: não escolhe carro, e virou pergunta opcional no
 * resultado, para o consultor.
 */

/** As respostas do quiz — o tipo e as regras de fluxo moram em `lib/perguntasDoProfiler`. */
type AnswerState = RespostasDoQuiz;

/** Segundos por pergunta usados no "faltam N · ~Ns" — o ritmo do design doc. */
const SEGUNDOS_POR_PERGUNTA = 6;

/**
 * Uma opção de resposta. `resumo` é o rótulo curto do painel lateral; o texto
 * que vai para o consultor é o `titulo`, pelos formatadores `format*` — o
 * mesmo que o cliente tocou.
 *
 * A letra não mora aqui: ela sai da posição na tela, porque a 05 esconde o
 * diesel de quem não leva carga, e uma letra fixa pularia do B para o D.
 */
interface Opcao<T extends string> {
  id: T;
  titulo: string;
  desc: string;
  resumo: string;
}

/**
 * ⚠️ Desde a fase 2 as perguntas são de FATO, e cada `desc` diz o que a
 * opção faz com o pátio.
 *
 * As perguntas anteriores — OBJETIVO ("Um carro melhor que o meu") e
 * EXPERIÊNCIA ("O que mais pesa na sua escolha?") — eram quase a mesma
 * pergunta com palavras diferentes, e nenhuma das duas separava carro: a
 * resposta virava preferência que só reordenava, e o resultado saía igual
 * para quase todo mundo. Os ids antigos (`family`, `status`, `comfort`…)
 * continuam valendo em `/api/match` para quem mandar o formato da fase 1, e
 * nos leads já gravados.
 */
const OPCOES_LEVA: readonly Opcao<Leva>[] = [
  { id: "eu", titulo: "Eu e mais um", desc: "Qualquer carro do pátio serve.", resumo: "Eu e mais um" },
  { id: "familia", titulo: "Família, criança na cadeirinha", desc: "Só carros de 4 portas ou mais.", resumo: "Família" },
  { id: "carga", titulo: "Carga, ferramenta, mercadoria", desc: "Só picape, utilitário ou van.", resumo: "Carga" },
];

/** A 03 aceita várias. "Tanto faz" limpa a escolha e segue. */
const OPCOES_JEITO: readonly Opcao<Jeito>[] = [
  { id: "Hatch", titulo: "Hatch", desc: "Compacto, fácil de estacionar.", resumo: "Hatch" },
  { id: "Sedan", titulo: "Sedã", desc: "Porta-malas separado e grande.", resumo: "Sedã" },
  { id: "SUV", titulo: "SUV", desc: "Mais alto, dirige-se de cima.", resumo: "SUV" },
  { id: "Perua", titulo: "Perua ou minivan", desc: "Espaço de sobra para gente e bagagem.", resumo: "Perua" },
];

const OPCOES_CAMBIO: readonly Opcao<PreferenciaDeCambio>[] = [
  { id: "so_automatico", titulo: "Só automático", desc: "Manual fica de fora.", resumo: "Só automático" },
  { id: "prefiro_automatico", titulo: "Prefiro automático", desc: "Automáticos na frente, sem tirar os manuais.", resumo: "Prefere automático" },
  { id: "tanto_faz", titulo: "Tanto faz", desc: "O câmbio não decide.", resumo: "Tanto faz" },
  { id: "prefiro_manual", titulo: "Prefiro manual", desc: "Manuais na frente, sem tirar os automáticos.", resumo: "Prefere manual" },
];

/**
 * A 05 sai da lista do motor (`ITENS_QUE_NAO_PODEM_FALTAR`) — uma lista só,
 * para a tela não oferecer item que o motor não sabe avaliar. O `desc` diz a
 * diferença que importa: ano, km e diesel TIRAM carro; item de ficha só põe
 * na frente, porque ficha vazia não prova carro sem o item.
 */
const OPCOES_NAO_PODE_FALTAR: readonly (Opcao<ItemQueNaoPodeFaltar> & { corta: boolean; soComCarga: boolean })[] =
  ITENS_QUE_NAO_PODEM_FALTAR.map((item) => ({
    id: item.id,
    titulo: item.rotulo,
    desc: item.corta ? "Quem não tem sai da lista." : "Vai na frente quando consta na ficha.",
    resumo: item.rotulo,
    corta: item.corta,
    soComCarga: item.soComCarga === true,
  }));

/**
 * O prazo saiu do quiz em 25/09 (fase 2) e virou pergunta opcional no
 * resultado. Os ids ficam: são os de `TAGS_DA_RESPOSTA` e os de lead antigo.
 */
const OPCOES_PRAZO: readonly Opcao<Exclude<AnswerState["timeline"], "">>[] = [
  { id: "immediate", titulo: "Nas próximas semanas", desc: "", resumo: "Imediato" },
  { id: "researching", titulo: "No próximo mês", desc: "", resumo: "Pesquisando" },
  { id: "future", titulo: "Sem pressa, só olhando", desc: "", resumo: "Sondando" },
];

/**
 * Onde os controles do POR MÊS começam. A entrada começa em "Sem entrada":
 * ela é a estimativa da pessoa, e um valor pré-posto viraria, no resultado,
 * "a entrada que você informou" sem que ninguém tivesse informado nada
 * (revisão de 27/09).
 */
// Sem as condições do simulador: elas vêm da página, e o `CarMatch` as junta.
const PORMES_INICIAL: Omit<PorMes, "parametros"> = { parcela: 1500, entrada: 0, prazo: 48, ocupacao: "clt", troca: false };

/** A ocupação na voz do quiz. Muda a taxa estimada, pela pontuação do simulador. */
const ROTULO_DA_OCUPACAO: Record<Ocupacao, string> = {
  clt: "CLT (carteira assinada)",
  publico: "Funcionário público",
  aposentado: "Aposentado ou pensionista",
  autonomo: "Autônomo ou PJ",
  outros: "Outro",
};

function formatShort(v: number): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)} mil`;
  return v.toLocaleString("pt-BR");
}

/**
 * "até R$ 75 mil", "de R$ 50 mil a R$ 75 mil", "acima de R$ 175 mil".
 *
 * A faixa "acima de" guarda `Number.MAX_SAFE_INTEGER` como teto, e a mensagem
 * antiga o imprimia: "até R$ 9007199254.7M" chegava ao WhatsApp da loja na voz
 * do cliente.
 */
/** "parcela até R$ 1.500/mês em 48×, com R$ 20 mil de entrada". */
function textoDoPorMes(p: PorMes): string {
  const parcela = p.parcela.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const entrada = p.entrada > 0 ? `com R$ ${formatShort(p.entrada)} de entrada` : "sem entrada";
  return `parcela até ${parcela}/mês em ${p.prazo}×, ${entrada}${p.troca ? " (tenho carro na troca)" : ""}`;
}

function textoDoOrcamentoDe(min: number, max: number): string {
  const semTeto = !max || max >= Number.MAX_SAFE_INTEGER;
  if (semTeto) return min > 0 ? `acima de R$ ${formatShort(min)}` : "sem teto definido";
  return min > 0 ? `de R$ ${formatShort(min)} a R$ ${formatShort(max)}` : `até R$ ${formatShort(max)}`;
}

/* ────────────────────────────────────────────────────────────────────────
   Peças da tela
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Opção de resposta: letra em vermelho, título e descrição.
 * Sem raio, sem sombra — a borda de 2px é o que marca a seleção.
 *
 * `contagem` é o número antes do toque ("7 carros", "0 nessa faixa"). A opção
 * que zera continua clicável: leva ao resultado com o "e se", que diz o que
 * afrouxar — esconder a opção esconderia também o motivo.
 */
function OpcaoQuiz({
  letra,
  titulo,
  desc,
  contagem,
  zerada = false,
  selecionada,
  desabilitada = false,
  onClick,
}: {
  letra: string;
  titulo: string;
  desc?: string;
  contagem?: string | null;
  zerada?: boolean;
  selecionada: boolean;
  desabilitada?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecionada}
      disabled={desabilitada}
      className={`mt-foco flex w-full items-start gap-4 border-2 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 lg:gap-[18px] lg:px-6 lg:py-[22px] ${
        selecionada
          ? "border-mt-accent bg-[color-mix(in_srgb,var(--mt-accent)_14%,transparent)]"
          : "border-mt-inverso-regua-fina hover:border-mt-inverso-regua"
      }`}
    >
      <span className="mt-0.5 text-[11px] font-extrabold tracking-[.1em] text-mt-accent lg:mt-1 lg:text-xs">
        {letra}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-extrabold leading-tight tracking-[-.02em] lg:text-[21px]">
          {titulo}
        </span>
        {desc && (
          <span className="mt-1.5 block text-xs leading-snug text-mt-inverso-suave lg:text-[13px]">
            {desc}
          </span>
        )}
      </span>
      {contagem && (
        <span
          className={`mt-0.5 shrink-0 text-right text-[11px] font-extrabold tracking-[.06em] lg:mt-1 lg:text-xs ${
            zerada ? "text-mt-inverso-suave" : "text-mt-inverso"
          }`}
        >
          {contagem}
        </span>
      )}
    </button>
  );
}

/**
 * Régua de progresso — "02 / 05 · QUEM VAI" e a barra vermelha.
 *
 * A conta é a da sequência DESTA pessoa: quem leva carga não vê a 03, e a
 * régua diz "02 / 04" em vez de prometer uma pergunta que não vem.
 */
function ReguaProgresso({ posicao, total, rotulo }: { posicao: number; total: number; rotulo: string }) {
  const percentual = ((posicao + 1) / total) * 100;
  const doisDigitos = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="mt-9 lg:mt-13">
      <div className="flex items-baseline gap-3 lg:gap-3.5">
        <span className="text-xs font-extrabold tracking-[.12em] text-mt-accent lg:text-[13px]">
          {doisDigitos(posicao + 1)} / {doisDigitos(total)}
        </span>
        <span className="text-[11px] tracking-[.08em] text-mt-inverso-suave lg:text-xs">
          {rotulo}
        </span>
      </div>
      <div className="mt-3 h-0.5 bg-mt-inverso-regua-fina lg:mt-3.5">
        <div
          className="h-0.5 bg-mt-accent transition-[width] duration-300"
          style={{ width: `${percentual}%` }}
        />
      </div>
    </div>
  );
}

export default function CarMatch({
  parametros,
}: {
  /**
   * As taxas, o ano mais antigo financiado e os bancos parceiros — a vigência
   * de `parametros_financiamento`, lida pela página no servidor. A contagem da
   * aba POR MÊS usa estes; a rota usa os mesmos, lidos do mesmo cache.
   */
  parametros: ParametrosDoFinanciamento;
}) {
  const { companySettings } = useTheme();
  const [gameState, setGameState] = useState<EstadoQuiz>("intro");
  const [answers, setAnswers] = useState<AnswerState>(RESPOSTAS_EM_BRANCO);
  const [estoque, setEstoque] = useState<Veiculo[]>([]);
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");

  // O resultado do motor de fatos, e o que a pessoa faz com ele.
  const [recomendacao, setRecomendacao] = useState<Recomendacao | null>(null);
  const [buscaFalhou, setBuscaFalhou] = useState(false);
  /** Filtros tirados pelo "e se". O teto nunca entra aqui. */
  const [afrouxados, setAfrouxados] = useState<ChaveDeFiltro[]>([]);
  /** "QUERO VER ESTE" — ids dos carros marcados, até os três do resultado. */
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  /** "NÃO É PRA MIM" na carta "Já pensou neste?" — ela some até refazer. */
  const [coringasRecusados, setCoringasRecusados] = useState<string[]>([]);
  /**
   * O lead leva carros ("quero ver"), só o pedido ("me avise quando chegar"),
   * ou — quando a consulta ao estoque falhou — um pedido de ajuda. Falha nossa
   * não pode chegar ao consultor como "não tem o carro que eu quero".
   */
  const [modoDoLead, setModoDoLead] = useState<"carros" | "aviso" | "ajuda">("carros");

  // ─── Dynamic budget ranges computed from real inventory ───
  interface BudgetRange {
    id: string;
    min: number;
    max: number;
    title: string;
    count: number;
    desc: string;
  }
  // Custom budget and upsell settings
  const [budgetTab, setBudgetTab] = useState<"presets" | "custom" | "porMes" | "ai">("presets");
  /**
   * A aba POR MÊS enquanto a pessoa mexe — vira resposta só no CONFIRMAR.
   * A entrada é a estimativa DELA: dinheiro e o que espera da troca (decisão
   * do dono em 25/09). O site não avalia o carro dela aqui.
   */
  const [rascunhoPorMes, setRascunhoPorMes] = useState<PorMes>(() => ({ ...PORMES_INICIAL, parametros }));
  /** `null` = ainda não mexeram no slider; o valor sai da mediana do pátio. */
  const [customMaxBudget, setCustomMaxBudget] = useState<number | null>(null);
  const [allowUpsell, setAllowUpsell] = useState<boolean>(true);

  // AI curator state variables
  const [aiQuery, setAiQuery] = useState<string>("");
  const [isAiCuratorActive, setIsAiCuratorActive] = useState<boolean>(false);

  // Lead modal states
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  // Fetch tracking ID and Supabase inventory
  useEffect(() => {
    const uid = getActiveAgUid();
    setAgUid(uid);
    logFlowInitiated("Car Match Profiler", uid);

    async function loadInventory() {
      const data = await getEstoque();
      setEstoque(data);
    }
    loadInventory();
  }, []);

  /**
   * Os carros que o Profiler pode sugerir — a mesma régua do motor
   * (`elegivel`): sem a moto e sem carro de cadastro divergente. Contar com
   * outra régua fazia a faixa prometer 8 carros e o resultado achar 7.
   */
  const carrosDoPatio = useMemo(() => disponiveisDe(estoque).filter(elegivel), [estoque]);

  /**
   * O perfil de agora e o que sobra com ele — a mesma conta que o motor faz
   * no servidor. É o "SOBRAM N DE M" e a base das contagens das opções.
   */
  const perfilAtual = useMemo(() => perfilDe(answers, carrosDoPatio), [answers, carrosDoPatio]);
  const restantes = useMemo(
    () => carrosNaFaixa(carrosDoPatio, criteriosDoPerfil(perfilAtual)),
    [carrosDoPatio, perfilAtual],
  );
  const cambioUnico = useMemo(() => cambioUnicoDe(answers, carrosDoPatio), [answers, carrosDoPatio]);
  const sequencia = useMemo(() => sequenciaDe(answers, carrosDoPatio), [answers, carrosDoPatio]);
  /** Sem estoque carregado não há o que contar — a opção fica sem número. */
  const semContagem = carrosDoPatio.length === 0;

  /**
   * Quantos sobram se a pessoa tocar nesta opção: a MESMA transição que o
   * toque grava (`comLeva`, `comCambio`…), passada pelas mesmas regras de
   * pulo — ver `lib/perguntasDoProfiler`.
   */
  const sobramCom = (novas: AnswerState): number => quantosSobram(novas, carrosDoPatio);

  /**
   * As faixas de orçamento — as quatro opções da pergunta 01.
   *
   * `useMemo`, e não `useState` + efeito: o estado nascia `[]` e a tela
   * desenhava, no lugar das opções, quatro caixas cinza vazias, `aria-hidden`
   * e sem clique. Enquanto o estoque não chegava, a primeira pergunta ficava
   * literalmente impossível de responder — e o único botão à vista era
   * VOLTAR. Reproduzido no navegador em 28/08, e é o que o dono relatou duas
   * vezes: **"não consegui responder as perguntas"**.
   *
   * O memo tem fallback, então nunca devolve lista vazia: sem estoque, valem
   * as faixas de reserva. Esqueleto de carregamento é aceitável quando dura um
   * instante e é evidente que é esqueleto; não é aceitável quando é a única
   * coisa entre a pessoa e a pergunta.
   */
  const faixasDeOrcamento = useMemo<BudgetRange[]>(() => {
    // O cálculo mora em `faixasDoPatio` desde 25/09 — quantil, faixas de
    // reserva e a ponta de cima com teto —, para o teste de regressão do motor
    // usar exatamente as faixas que esta tela oferece. A moto fica de fora da
    // conta: o Profiler não a sugere, e contá-la prometeria um carro a mais.
    const precos = carrosDoPatio.map((v) => precoVigente(v)).filter((p) => p > 0);
    const semEstoque = precos.length < 4;
    return faixasDoPatio(precos).map((f) => ({
      id: f.id,
      min: f.min,
      // O filtro é TETO; a faixa "acima de" não tem, e a resposta guarda o
      // sentinela que o resto do componente já conhecia.
      max: f.max ?? Number.MAX_SAFE_INTEGER,
      title: f.titulo,
      count: f.quantos,
      // Sem estoque não há como contar: a descrição some em vez de dizer zero.
      desc: semEstoque ? "" : f.quantos === 1 ? "1 veículo nesta faixa" : `${f.quantos} veículos nesta faixa`,
    }));
  }, [carrosDoPatio]);

  /**
   * Os limites do slider de "VALOR EXATO", tirados do pátio.
   *
   * Estavam cravados em `min={100000}` — mais que o DOBRO do carro mais caro
   * da metade de baixo do estoque. Medido em 28/08: o mais barato custa
   * R$ 23.900 e a mediana é R$ 62.900, ou seja, quem usasse esta aba não
   * conseguia dizer um orçamento que descrevesse dois terços da vitrine. É o
   * mesmo resquício do catálogo fictício que estava nas etiquetas.
   *
   * As faixas prontas da outra aba já saíam do estoque; esta ficou para trás.
   */
  const faixaDoSlider = useMemo(() => {
    const precos = carrosDoPatio
      .map((v) => precoVigente(v))
      .filter((p) => p > 0);
    if (precos.length === 0) return { min: 20000, max: 500000, mediana: 60000, passo: 5000 };
    const ordenados = [...precos].sort((a, b) => a - b);
    const piso = Math.max(5000, Math.floor(ordenados[0] / 5000) * 5000);
    const teto = Math.ceil(ordenados[ordenados.length - 1] / 5000) * 5000;
    const meio = ordenados[Math.floor(ordenados.length / 2)];
    return {
      min: piso,
      max: teto,
      mediana: Math.round(meio / 5000) * 5000,
      passo: teto - piso > 200000 ? 10000 : 5000,
    };
  }, [carrosDoPatio]);

  /**
   * O valor do slider: o que a pessoa escolheu, ou a mediana do pátio.
   *
   * A mediana como ponto de partida vinha de um efeito que chamava
   * `setCustomMaxBudget` quando o estoque chegava. Derivar é mais simples e
   * tira uma escrita de estado dentro de efeito — e o valor nunca fica fora
   * da faixa que a loja comporta.
   */
  const orcamentoDoSlider = Math.min(
    Math.max(customMaxBudget ?? faixaDoSlider.mediana, faixaDoSlider.min),
    faixaDoSlider.max,
  );

  /**
   * VALOR EXATO vira a faixa de 70% do valor até ele. Sem piso, quem dizia
   * "R$ 80 mil" recebia um Uno de R$ 26.900 como sugestão — o motor ordena por
   * ano e km, e o teto sozinho não dizia o que a pessoa quer gastar.
   */
  const confirmCustomBudget = () => {
    setAnswers((prev) => ({
      ...prev,
      budgetMin: pisoDoValorExato(orcamentoDoSlider),
      budgetMax: orcamentoDoSlider,
      porMes: null,
    }));
    setTimeout(() => {
      setGameState("q2");
    }, 200);
  };

  /**
   * O rótulo que o consultor lê é o MESMO que o cliente clicou.
   *
   * Estes quatro formatadores eram `switch` com o texto copiado das opções —
   * uma segunda cópia dos mesmos títulos, noutro lugar do arquivo. Copiar não
   * quebra no dia em que se copia; quebra no dia em que só uma das duas é
   * atualizada, e aí o CRM registra uma resposta que ninguém escolheu.
   *
   * Foi o que quase aconteceu ao reescrever o texto de 2026-08-29: as opções
   * viraram "Um carro melhor que o meu" e o `switch` continuaria mandando
   * "Status, Exclusividade & Design" para o WhatsApp do consultor.
   */
  const rotuloDaOpcao = (
    opcoes: readonly { id: string; titulo: string }[],
    id: string,
  ) => opcoes.find((o) => o.id === id)?.titulo ?? "";

  // Pergunta não respondida (ou pulada) sai como "" — e não como um rótulo
  // que ninguém tocou.
  const formatLeva = (leva: PerfilDoQuiz["leva"]) => rotuloDaOpcao(OPCOES_LEVA, leva ?? "");
  const formatJeitos = (jeitos: readonly string[]) => jeitos.map((j) => rotuloDaOpcao(OPCOES_JEITO, j)).filter(Boolean);
  const formatCambio = (cambio: PerfilDoQuiz["cambio"]) => rotuloDaOpcao(OPCOES_CAMBIO, cambio ?? "");
  const formatNaoPodeFaltar = (itens: readonly string[]) =>
    itens.map((i) => rotuloDaOpcao(OPCOES_NAO_PODE_FALTAR, i)).filter(Boolean);
  const formatTimeline = (timeline: AnswerState["timeline"]) => rotuloDaOpcao(OPCOES_PRAZO, timeline);

  /** O pedido em uma linha, na voz do cliente: "até R$ 75 mil, Família, SUV". */
  const resumoDoPedido = () =>
    [
      textoDoOrcamento(),
      formatLeva(perfilAtual.leva),
      ...formatJeitos(perfilAtual.jeitos ?? []),
      formatCambio(perfilAtual.cambio),
      ...formatNaoPodeFaltar(perfilAtual.naoPodeFaltar ?? []),
    ]
      .filter(Boolean)
      .join(", ");

  const semTeto = tetoDe(answers.budgetMax) === null;
  const textoDoOrcamento = () =>
    answers.porMes ? textoDoPorMes(answers.porMes) : textoDoOrcamentoDe(answers.budgetMin, answers.budgetMax);
  /** A 01 foi respondida — por faixa, valor exato, texto ou POR MÊS. */
  const orcamentoRespondido = answers.budgetMax > 0 || answers.porMes !== null;

  const nomeDoQuiz = companySettings?.carMatchTitle || "Garagem Profiler";

  const abrirLead = (modo: "carros" | "aviso" | "ajuda") => {
    setModoDoLead(modo);
    setIsLeadModalOpen(true);
  };

  const alternarEscolhido = (id: string) =>
    setEscolhidos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  /** "NÃO É PRA MIM": a carta some, e deixa de ir no lead se estava marcada. */
  const recusarCoringa = (id: string) => {
    setCoringasRecusados((atual) => (atual.includes(id) ? atual : [...atual, id]));
    setEscolhidos((atual) => atual.filter((x) => x !== id));
  };

  /** O "e se": tira um filtro e refaz a busca. O teto nunca sai. */
  const afrouxar = (filtro: ChaveDeFiltro) => {
    setAfrouxados((atual) => (atual.includes(filtro) ? atual : [...atual, filtro]));
    setEscolhidos([]);
    setGameState("loading");
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken?: string }) => {
    const utmParams = getUtmParameters();
    // `telefoneDoLead` normaliza o que veio do campo — que agora chega
    // mascarado, "(41) 99737-2165". As três linhas que estavam aqui tinham um
    // `cleanPhone` que não limpava nada: com 15 caracteres o teste de
    // comprimento falhava e o número seguia para o CRM com parênteses dentro
    // do `remoteJid`. Ver o comentário em `lib/whatsapp.ts`.
    const telefone = telefoneDoLead(leadData.whatsapp);
    const formattedPhone = telefone.comDDI ?? "";
    const remoteJid = telefone.remoteJid;

    // Voz do CLIENTE: é ele quem envia esta mensagem para a loja. Desde 25/09
    // ela nomeia os carros — o consultor abre a conversa sabendo quais separar,
    // e a coluna `interesse` do lead (que é esta mensagem) deixa de dizer só
    // "Curadoria Especial".
    // Os marcados em QUERO VER ESTE (a carta "Já pensou neste?" só com FAZ
    // SENTIDO), ou os três — ver `carrosDoLead` em lib/perguntasDoProfiler.
    const carros = carrosDoLead(recomendacao, escolhidos, modoDoLead);
    // No POR MÊS a pessoa pensa em parcela: a mensagem leva a estimativa junto
    // — e a entrada que a gerou, senão o consultor lê "48× R$ 1.298" sem saber
    // de onde saiu. Parcela zero não vira "48× R$ 0": é a entrada cobrindo.
    const nomeComPreco = (c: (typeof carros)[number]) => {
      const base = `${nomeCurto(c.veiculo)} (${formatPrice(precoDoCarro(c.veiculo))}`;
      if (!answers.porMes || c.parcela === null) return `${base})`;
      if (!(c.parcela > 0)) return `${base}, a minha entrada cobre)`;
      const entrada = Math.min(answers.porMes.entrada, precoDoCarro(c.veiculo));
      const comEntrada = entrada > 0 ? `com ${formatPrice(entrada)} de entrada` : "sem entrada";
      return `${base}; pelo site, ≈ ${answers.porMes.prazo}× ${formatPrice(c.parcela)} ${comEntrada})`;
    };
    // A troca vai dita ao consultor — é ele quem avalia o carro.
    const troca = answers.porMes?.troca ? " Tenho carro para dar na troca." : "";
    const lista =
      carros.length === 1
        ? `o ${nomeComPreco(carros[0])}`
        : carros.length > 1
          ? `estes carros: ${carros.slice(0, -1).map(nomeComPreco).join(", ")} e ${nomeComPreco(carros[carros.length - 1])}`
          : "";
    // Os filtros do motor quando a busca respondeu; senão (a consulta falhou)
    // o pedido montado aqui mesmo, com o que a pessoa tocou.
    const pedido = recomendacao?.filtros.length ? recomendacao.filtros.join(", ") : resumoDoPedido();
    const finalMsg =
      carros.length > 0
        ? `Olá! Montei meu perfil no ${nomeDoQuiz} do site e quero ver ${lista}. Estão disponíveis?${troca}${sufixoRef()}`
        : modoDoLead === "ajuda"
          ? `Olá! Montei meu perfil no ${nomeDoQuiz} do site (${pedido}). Podem me mostrar as opções do pátio?${troca}${sufixoRef()}`
          : `Olá! Montei meu perfil no ${nomeDoQuiz} do site e não achei exatamente o que procuro: ${pedido}. Podem me avisar quando chegar um carro assim?${troca}${sufixoRef()}`;

    // Dispara telemetria de conversão (Lead) no GA4/Meta Pixel ANTES do POST,
    // para reaproveitar o mesmo event_id na deduplicação do CAPI (servidor).
    //
    // O valor é o do primeiro carro escolhido; sem carro, o teto — e nunca o
    // sentinela da faixa "acima de", que mandava 9 quatrilhões como valor de
    // conversão para o Ads.
    const valorDoLead = carros.length > 0 ? precoDoCarro(carros[0].veiculo) : semTeto ? 0 : answers.budgetMax;
    const phoneE164 = telefone.e164;
    const eventId = trackLeadSubmission(
      { marca: "CarMatch", modelo: "Curadoria Especial", preco: valorDoLead },
      finalMsg,
      {
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        email: leadData.email,
        phoneE164,
        tipoDeLead: "curadoria",
        formId: "form-garagem-profiler",
      }
    );
    const { fbp, fbc } = getMatchParamsRespeitandoRecusa();

    const payload = {
      remoteJid,
      telefone: formattedPhone,
      tipo: "lead_curadoria_especial",
      canal: "Garagem Match Profiler",
      mensagem: finalMsg,
      perfil_curadoria: {
        orcamento_maximo: semTeto || answers.porMes ? null : answers.budgetMax,
        orcamento_minimo: answers.budgetMin,
        quem_vai: formatLeva(perfilAtual.leva),
        jeito: formatJeitos(perfilAtual.jeitos ?? []).join(", "),
        cambio: formatCambio(perfilAtual.cambio),
        nao_pode_faltar: formatNaoPodeFaltar(perfilAtual.naoPodeFaltar ?? []).join(", "),
        urgencia: formatTimeline(answers.timeline),
        resumo_ia: isAiCuratorActive
          ? `IA Request: ${aiQuery}. Pedido: ${resumoDoPedido()}.`
          : `Busca: ${resumoDoPedido()}.${answers.timeline ? ` Prazo: ${formatTimeline(answers.timeline)}.` : ""}`
      },
      intencao: {
        // Prazo virou pergunta opcional no resultado: sem resposta não é
        // "BAIXO" — é não informado.
        nivel:
          answers.timeline === "immediate"
            ? "ALTO"
            : answers.timeline === "researching"
              ? "MÉDIO"
              : answers.timeline === "future"
                ? "BAIXO"
                : "NÃO INFORMADO",
        ticket: !semTeto && !answers.porMes && answers.budgetMax >= 200000 ? "PREMIUM" : "NORMAL"
      },
      cliente: {
        nome: leadData.nome,
        email: leadData.email,
        whatsapp: leadData.whatsapp
      },
      utm: utmParams,
      // `/api/leads` repassa ao n8n só uma lista fechada de campos, e o
      // `perfil_curadoria` acima NÃO está nela — o consultor nunca o recebeu.
      // `intencao_busca` está, e por isso o que o consultor precisa ler vai
      // aqui: os filtros e os carros, com o porquê de cada um.
      intencao_busca: {
        aiQuery: aiQuery || "",
        budgetTab: budgetTab,
        modo: modoDoLead,
        orcamento: textoDoOrcamento(),
        filtros: recomendacao?.filtros ?? [],
        afrouxados,
        prazo: formatTimeline(answers.timeline),
        // As respostas como o cliente as tocou — o card do Kanban
        // (`leads.perfil`, lib/perfilDoLead) as mostra ao consultor.
        perfil: {
          leva: formatLeva(perfilAtual.leva),
          jeitos: formatJeitos(perfilAtual.jeitos ?? []),
          cambio: formatCambio(perfilAtual.cambio),
          nao_pode_faltar: formatNaoPodeFaltar(perfilAtual.naoPodeFaltar ?? []),
        },
        na_faixa: recomendacao ? recomendacao.naFaixa : null,
        // A aba POR MÊS, quando usada. A entrada é a estimativa do cliente
        // (dinheiro e o que ele espera da troca) — não é avaliação nossa.
        por_mes: answers.porMes
          ? {
              parcela: answers.porMes.parcela,
              entrada: answers.porMes.entrada,
              prazo: answers.porMes.prazo,
              ocupacao: ROTULO_DA_OCUPACAO[answers.porMes.ocupacao],
              troca: answers.porMes.troca,
            }
          : null,
        carros: carros.map((c) => ({
          id: c.veiculo.id,
          nome: nomeCurto(c.veiculo),
          preco: precoDoCarro(c.veiculo),
          lugar: c.lugar,
          manchete: c.manchete,
          pesa_contra: c.pesaContra,
          parcela: c.parcela,
        })),
      },
      agUid: agUid,
      eventId,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      fbp,
      fbc
    };

    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          turnstileToken: leadData.turnstileToken
        })
      });
    } catch (fetchError: any) {
      console.warn("[Lead Submit CarMatch] Network error (non-blocking):", fetchError.message);
    }

    // O histórico local serve ao `LeadCaptureModal`, que preenche nome e
    // telefone na próxima vez. Desde 25/09 ele não leva mais o perfil —
    // orçamento e respostas não servem ao preenchimento — e não grava nada
    // para quem recusou o rastreamento em /privacidade.
    if (!rastreamentoRecusado()) {
      try {
        const rawHistory = localStorage.getItem("ag_leads_history");
        const history = rawHistory ? JSON.parse(rawHistory) : [];
        history.push({
          agUid,
          timestamp: new Date().toISOString(),
          tipoLead: "lead_curadoria_especial",
          cliente: {
            nome: leadData.nome,
            email: leadData.email,
            whatsapp: leadData.whatsapp
          }
        });
        localStorage.setItem("ag_leads_history", JSON.stringify(history));
      } catch (e) {
        console.warn("[Telemetry] Failed to save lead payload to history:", e);
      }
    }

    const whatsappUrl = linkWhatsApp(companySettings, finalMsg);
    // Consequência do lead recém-registrado — ver `pos_lead` em `lib/dataLayer.ts`.
    trackContactClick("whatsapp", "CarMatch - Conversão WhatsApp", { pos_lead: true });
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const parseFreeTextQuery = (text: string) => {
    const lower = text.toLowerCase();
    // O ano não é orçamento: "um SUV 2020" virava teto de R$ 202 mil, e desde
    // 25/09 o teto é filtro que corta.
    const semAnos = lower.replace(/\b(19|20)\d{2}\b/g, " ");

    let parsedBudget = 0;
    const milMatch = semAnos.match(/(\d+)\s*(?:mil|k)/);
    // O número inteiro, com ou sem ponto de milhar: "80.000", "80000" e "80".
    // A expressão anterior lia só os três primeiros dígitos, e "R$ 80000"
    // virava R$ 800 mil. E número colado em letra é nome de carro, não
    // dinheiro: "hb20" não é orçamento de R$ 20 mil.
    const rawNumberMatch = semAnos.match(/(?:^|[^a-z0-9.,])(\d{1,3}(?:\.\d{3})+|\d{4,7}|\d{2,3})(?![0-9a-z])/);

    if (milMatch) {
      parsedBudget = parseInt(milMatch[1]) * 1000;
    } else if (rawNumberMatch) {
      const num = parseInt(rawNumberMatch[1].replace(/\./g, ""));
      if (num > 1000) parsedBudget = num;
      else if (num > 0) parsedBudget = num * 1000;
    }

    // Sem valor no texto, sem teto — e não R$ 1 milhão, número que ninguém
    // disse e que ia para o WhatsApp do consultor como orçamento do cliente.
    if (parsedBudget === 0) parsedBudget = Number.MAX_SAFE_INTEGER;

    // `""` quando o texto não disse — e não um palpite.
    //
    // Antes o objetivo caía em "status" e a experiência era cravada em "tech",
    // sem que ninguém tivesse escolhido nenhum dos dois. Como este caminho
    // pulava direto para o resultado, a pessoa terminava o quiz com duas
    // respostas que nunca deu — e o consultor recebia o perfil como se fossem
    // dela.
    //
    // Desde a fase 2 a leitura é por PALAVRA inteira, sem acento: "programa"
    // e "grama" não viram a picape RAM (era o `includes("ram")` de antes), e
    // "sedã" casa com "seda" e "sedan". O que o texto disser fica só
    // PRÉ-SELECIONADO: a pessoa passa pelas perguntas e confirma.
    const palavras = new Set(
      lower
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
    const disse = (...termos: string[]) => termos.some((t) => palavras.has(t));

    let leva: AnswerState["leva"] = "";
    if (disse("familia", "filho", "filhos", "filha", "filhas", "crianca", "criancas", "cadeirinha", "bebe")) {
      leva = "familia";
    } else if (
      disse("carga", "ferramenta", "ferramentas", "mercadoria", "mercadorias", "cacamba", "picape", "picapes", "caminhonete", "ram", "hilux", "saveiro", "strada", "toro")
    ) {
      leva = "carga";
    }

    const jeitos: Jeito[] = [];
    if (disse("suv", "suvs", "jeep")) jeitos.push("SUV");
    if (disse("seda", "sedas", "sedan", "sedans")) jeitos.push("Sedan");
    if (disse("hatch", "hatches")) jeitos.push("Hatch");
    if (disse("perua", "peruas", "minivan", "minivans")) jeitos.push("Perua");

    let cambio: AnswerState["cambio"] = "";
    if (disse("automatico", "automatica")) cambio = "so_automatico";
    else if (disse("manual")) cambio = "prefiro_manual";

    const naoPodeFaltar: ItemQueNaoPodeFaltar[] = [];
    // Quem pedia "esportivo" ganhava um aviso de que o pátio não tem cupê; na
    // fase 2 a emoção se pede como motor turbo, na 05.
    if (disse("turbo", "esportivo", "esportiva")) naoPodeFaltar.push("turbo");
    if (disse("4x4")) naoPodeFaltar.push("4x4");
    if (disse("diesel") && leva === "carga") naoPodeFaltar.push("diesel");
    if (disse("camera")) naoPodeFaltar.push("camera");
    if (disse("multimidia")) naoPodeFaltar.push("multimidia");

    return {
      budgetMax: parsedBudget,
      leva,
      jeitos,
      cambio,
      naoPodeFaltar: naoPodeFaltar.slice(0, MAXIMO_DO_QUE_NAO_PODE_FALTAR),
    };
  };

  /**
   * "DESCREVER" é uma forma de responder a pergunta 01, não um atalho para o fim.
   *
   * -------------------------------------------------------------------------
   * O que mudou em 2026-08-28
   * -------------------------------------------------------------------------
   * Esta aba vive sob o título "Qual a faixa de investimento para a próxima
   * garagem?", ao lado de FAIXA e VALOR EXATO. As outras duas respondem a
   * pergunta e avançam para a 02. Esta pulava para o resultado, preenchendo as
   * cinco respostas sozinha — com EXPERIÊNCIA e PRAZO cravados no código.
   *
   * O dono relatou exatamente isso: **"não consegui responder todas"**. Não era
   * impressão; o fluxo terminava sem perguntar.
   *
   * Agora o texto livre serve para o que ele consegue: fixa o orçamento e
   * deixa PRÉ-SELECIONADO o que disse com todas as letras ("um SUV para a
   * família" marca objetivo e carroceria). O que ele não disse continua em
   * branco, e a pessoa responde — vendo a pré-seleção e podendo trocá-la.
   */
  const confirmAiCuratorQuery = () => {
    if (!aiQuery.trim()) return;

    const parsed = parseFreeTextQuery(aiQuery);

    // Lista vazia vira `null` ("a responder"), e não "Tanto faz"/"Nada
    // disso": o texto não ter falado de carroceria não é resposta.
    setAnswers((prev) => ({
      ...prev,
      budgetMin: 0,
      budgetMax: parsed.budgetMax,
      porMes: null,
      leva: parsed.leva,
      jeitos: parsed.jeitos.length > 0 ? parsed.jeitos : null,
      cambio: parsed.cambio,
      naoPodeFaltar: parsed.naoPodeFaltar.length > 0 ? parsed.naoPodeFaltar : null,
    }));

    setIsAiCuratorActive(true);

    setTimeout(() => {
      setGameState("q2");
    }, 200);
  };

  const selectBudget = (range: BudgetRange) => {
    setAnswers((prev) => ({ ...prev, budgetMin: range.min, budgetMax: range.max, porMes: null }));
    setTimeout(() => { setGameState("q2"); }, 200);
  };

  /**
   * POR MÊS responde a 01 pela parcela. O orçamento em preço fica zerado: a
   * faixa passa a ser a parcela de cada carro, na conta do simulador.
   */
  const confirmarPorMes = () => {
    setAnswers((prev) => ({ ...prev, budgetMin: 0, budgetMax: 0, porMes: { ...rascunhoPorMes } }));
    setTimeout(() => { setGameState("q2"); }, 200);
  };

  /**
   * Tocar na opção já avança, como sempre foi — com 200 ms para ver o toque.
   * O relógio fica guardado para VOLTAR (ou outro toque) cancelá-lo: sem isso,
   * tocar e voltar dentro dos 200 ms avançava mesmo assim.
   */
  const avanco = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarAvanco = () => {
    if (avanco.current) clearTimeout(avanco.current);
    avanco.current = null;
  };
  const irPara = (destino: EstadoQuiz) => {
    cancelarAvanco();
    avanco.current = setTimeout(() => {
      avanco.current = null;
      setGameState(destino);
    }, 200);
  };

  const selectLeva = (leva: Leva) => {
    const novas = comLeva(answers, leva);
    setAnswers(novas);
    // O destino sai das respostas NOVAS: marcar carga tira a 03 da sequência.
    irPara(depoisDe("q2", novas, carrosDoPatio));
  };

  const alternarJeito = (jeito: Jeito) => setAnswers((prev) => comJeitoAlternado(prev, jeito));

  const jeitoTantoFaz = () => {
    const novas: AnswerState = { ...answers, jeitos: [] };
    setAnswers(novas);
    irPara(depoisDe("q3", novas, carrosDoPatio));
  };

  const confirmarJeitos = () => {
    cancelarAvanco();
    setGameState(depoisDe("q3", answers, carrosDoPatio));
  };

  const selectCambio = (cambio: PreferenciaDeCambio) => {
    const novas = comCambio(answers, cambio);
    setAnswers(novas);
    irPara(depoisDe("q4", novas, carrosDoPatio));
  };

  /** Até três. Com três marcados, os outros esperam alguém ser desmarcado. */
  const alternarItem = (item: ItemQueNaoPodeFaltar) => setAnswers((prev) => comItemAlternado(prev, item));

  const verResultado = (itens?: ItemQueNaoPodeFaltar[]) => {
    cancelarAvanco();
    setAnswers((prev) => ({ ...prev, naoPodeFaltar: itens ?? prev.naoPodeFaltar ?? [] }));
    setGameState("loading");
  };

  /** O prazo, no resultado: opcional, e tocar de novo desmarca. */
  const escolherPrazo = (timeline: AnswerState["timeline"]) =>
    setAnswers((prev) => ({ ...prev, timeline: prev.timeline === timeline ? "" : timeline }));

  /**
   * A busca: as respostas vão para `/api/match`, que roda o motor de fatos
   * sobre o estoque do servidor.
   *
   * Sem animação. Até 25/09 a tela segurava 3,2 s com "Calculando
   * compatibilidade de perfil" mesmo quando o servidor já tinha respondido —
   * espera fingida antes de um resultado genérico. Agora o resultado aparece
   * quando chega.
   */
  useEffect(() => {
    if (gameState !== "loading") return;
    let cancelado = false;
    // Ids, e nunca rótulos nem orçamento: é o que vai ao GA4, ao Pixel e à
    // CAPI como termo de busca.
    const ids = idsDasRespostas(perfilAtual);

    fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perfil: {
          leva: perfilAtual.leva,
          jeitos: perfilAtual.jeitos,
          cambio: perfilAtual.cambio,
          naoPodeFaltar: perfilAtual.naoPodeFaltar,
        },
        // POR MÊS vai dentro do orçamento: é ele que faz a faixa. Só o que a
        // pessoa disse — as taxas a rota lê do banco, não do corpo.
        orcamento: {
          ...perfilAtual.orcamento,
          parcela: perfilAtual.parcela
            ? {
                max: perfilAtual.parcela.max,
                entrada: perfilAtual.parcela.entrada,
                prazo: perfilAtual.parcela.prazo,
                ocupacao: perfilAtual.parcela.ocupacao,
              }
            : null,
        },
        afrouxar: afrouxados,
        // Quem recusou o rastreamento não manda identificador para a consulta.
        ag_uid: rastreamentoRecusado() ? undefined : getActiveAgUid(),
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (cancelado) return;
        const r: Recomendacao | undefined = data?.recomendacao;
        if (!r) throw new Error("resposta sem recomendação");
        setRecomendacao(r);
        setBuscaFalhou(false);
        // O disparo vive aqui, não no início da busca: antes ele saía com
        // results_count fixo em 0 e o GA4 registrava toda busca como vazia.
        //
        // Os ids das respostas, como sempre foram — e não os filtros em texto,
        // que levariam o orçamento ("de R$ 55 mil a R$ 75 mil") ao Pixel e à
        // CAPI. A contagem é a da faixa: o complemento abaixo do piso não é
        // resultado da busca.
        trackCarMatch(ids, r.naFaixa);
      })
      .catch((err) => {
        if (cancelado) return;
        console.error("[CarMatch] A consulta ao estoque falhou:", err);
        setRecomendacao(null);
        setBuscaFalhou(true);
        trackCarMatch(ids, 0);
      })
      .finally(() => {
        if (!cancelado) setGameState("results");
      });

    return () => {
      cancelado = true;
    };
  }, [gameState, perfilAtual, afrouxados]);

  // O funil passo a passo, para medir onde a pessoa desiste. Só o nome do
  // passo vai para o GA4 — nada de resposta nem de orçamento.
  useEffect(() => {
    if (gameState !== "loading") trackPassoDoProfiler(gameState);
  }, [gameState]);

  const handleReset = () => {
    setAnswers(RESPOSTAS_EM_BRANCO);
    setBudgetTab("presets");
    setRascunhoPorMes({ ...PORMES_INICIAL, parametros });
    setAllowUpsell(true);
    setAiQuery("");
    setIsAiCuratorActive(false);
    setRecomendacao(null);
    setBuscaFalhou(false);
    setAfrouxados([]);
    setEscolhidos([]);
    setCoringasRecusados([]);
    setModoDoLead("carros");
    setGameState("intro");
  };

  const formatPrice = (value: number): string => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  };

  /* ──────────────────────────────────────────────────────────────────────
     Painel "seu perfil, ao vivo"

     Tudo aqui sai do estoque que já está carregado no cliente. Nada de
     percentual de compatibilidade inventado: o que se mostra é o recorte
     real do estoque diante do orçamento respondido.
     ────────────────────────────────────────────────────────────────────── */

  /**
   * Composição por carroceria do que SOBRA com as respostas até aqui — dado
   * real, não score. Antes era só o recorte do orçamento; agora acompanha
   * cada toque, como o "SOBRAM N DE M".
   */
  const composicaoEstoque = useMemo(() => {
    const total = restantes.length;
    if (total === 0) return [];

    const contagem = new Map<string, number>();
    for (const v of restantes) {
      const chave = (v.tipo || "").trim() || "Outros";
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }

    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([tipo, quantidade]) => ({
        tipo,
        quantidade,
        percentual: Math.round((quantidade / total) * 100),
      }));
  }, [restantes]);

  const respostasDoPainel = useMemo(() => {
    const resumo = (opcoes: readonly { id: string; resumo: string }[], id: string) =>
      opcoes.find((o) => o.id === id)?.resumo ?? "";
    const jeito =
      answers.leva === "carga"
        ? "Picape, utilitário ou van"
        : answers.jeitos === null
          ? ""
          : answers.jeitos.length === 0
            ? "Tanto faz"
            : answers.jeitos.map((j) => resumo(OPCOES_JEITO, j)).join(", ");
    const itens = perfilAtual.naoPodeFaltar ?? [];
    return [
      {
        numero: "01",
        rotulo: "ORÇAMENTO",
        valor: answers.porMes
          ? [
              `Até ${answers.porMes.parcela.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}/mês`,
              `${answers.porMes.prazo}×`,
              answers.porMes.entrada > 0 ? `entrada R$ ${formatShort(answers.porMes.entrada)}` : "sem entrada",
            ].join(" · ")
          : answers.budgetMax
            ? textoDoOrcamentoDe(answers.budgetMin, answers.budgetMax).replace(/^./, (l) => l.toUpperCase())
            : "",
      },
      { numero: "02", rotulo: "QUEM VAI", valor: resumo(OPCOES_LEVA, answers.leva) },
      { numero: "03", rotulo: "JEITO", valor: jeito },
      {
        numero: "04",
        rotulo: "CÂMBIO",
        // Pergunta pulada mostra o fato que a pulou, e não "a responder".
        valor: cambioUnico
          ? cambioUnico === "manual"
            ? "Todos manuais"
            : "Todos automáticos"
          : resumo(OPCOES_CAMBIO, answers.cambio),
      },
      {
        numero: "05",
        rotulo: "NÃO PODE FALTAR",
        valor:
          answers.naoPodeFaltar === null
            ? ""
            : itens.length === 0
              ? "Nada disso"
              : itens.map((i) => resumo(OPCOES_NAO_PODE_FALTAR, i)).join(", "),
      },
    ];
  }, [answers, perfilAtual, cambioUnico]);

  const perguntaAtual = PERGUNTAS.find((p) => p.id === gameState) ?? null;
  const emPergunta = perguntaAtual !== null;
  // A pergunta atual pode ter saído da sequência enquanto a pessoa está nela
  // (o estoque chegou depois e a 04 deixou de separar carro): a régua conta a
  // posição dela pela ordem fixa, e a inclui no total.
  const naSequencia = perguntaAtual ? sequencia.includes(perguntaAtual.id) : false;
  const posicaoNaSequencia = perguntaAtual
    ? sequencia.filter((id) => ordemFixa(id) < ordemFixa(perguntaAtual.id)).length
    : -1;
  const totalDePerguntas = sequencia.length + (perguntaAtual && !naSequencia ? 1 : 0);
  const perguntasQueFaltam = perguntaAtual ? totalDePerguntas - (posicaoNaSequencia + 1) : 0;
  const mostrarPainel = gameState === "intro" || emPergunta;

  /** Volta uma pergunta — pulando as que esta pessoa não viu; da primeira, para a abertura. */
  const voltarPergunta = () => {
    if (!perguntaAtual) return;
    cancelarAvanco();
    setGameState(antesDe(perguntaAtual.id, answers, carrosDoPatio));
  };

  /** O que a tela diz sobre a pergunta que sumiu — no lugar dela, na seguinte. */
  const notasDaPergunta = (id: IdDaPergunta): string[] => {
    const notas: string[] = [];
    if (answers.leva === "carga" && ordemFixa(id) > ordemFixa("q3") && antesDe(id, answers, carrosDoPatio) === "q2") {
      notas.push("Com carga, o jeito de carro já está decidido: picape, utilitário ou van.");
    }
    if (cambioUnico && id === "q5") {
      const n = carrosNaFaixa(carrosDoPatio, criteriosDoPerfil(perfilAteOJeito(answers))).length;
      notas.push(
        `Pulamos o câmbio: ${n === 1 ? "o carro que sobrou é" : `os ${n} carros que sobraram são todos`} ${
          cambioUnico === "manual" ? (n === 1 ? "manual" : "manuais") : n === 1 ? "automático" : "automáticos"
        }.`,
      );
    }
    return notas;
  };

  const tituloBarra = (companySettings?.carMatchTitle || "Garagem Profiler").toUpperCase();

  return (
    <section
      id="match-garagem"
      aria-label="Garagem Profiler"
      className="flex flex-col bg-mt-inverso-fundo font-modernist text-mt-inverso lg:min-h-[840px] lg:flex-row lg:items-stretch"
    >
      {/* ─────────── Coluna do fluxo ─────────── */}
      <div className="flex min-w-0 flex-1 flex-col px-[18px] py-8 lg:px-14 lg:py-11">
        <div className="flex items-center gap-3.5">
          <span className="h-6 w-2 shrink-0 bg-mt-cobre-marca" aria-hidden="true" />
          <span className="text-[13px] font-extrabold tracking-[.02em] lg:text-[15px]">
            {tituloBarra}
          </span>
          <Link
            href="/"
            className="mt-foco mt-alvo ml-auto text-[11px] tracking-[.1em] text-mt-inverso-suave no-underline transition-colors hover:text-mt-inverso lg:text-xs"
          >
            SAIR
          </Link>
        </div>

        {/* ─── Abertura ─── */}
        {gameState === "intro" && (
          <div className="mt-10 flex flex-1 flex-col lg:mt-12">
            <div className="max-w-[640px]">
              <Rotulo accent className="text-[11px] tracking-[.18em] text-mt-cobre-marca">
                CONSULTORIA
              </Rotulo>
              <h1 className="mt-display m-0 mt-5 text-[38px] text-mt-inverso lg:text-[66px]">
                Cinco perguntas até o carro certo.
              </h1>
              <p className="m-0 mt-5 max-w-[520px] text-sm leading-relaxed text-mt-inverso-suave lg:text-base">
                Cada opção mostra, antes do toque, quantos carros do pátio sobram
                com ela. No fim, três carros, com o que cada um atende do seu
                pedido e o que pesa contra.
              </p>
            </div>

            <div className="mt-9 flex border-t-2 border-mt-inverso-regua pt-4 lg:mt-11">
              {[
                { valor: "05", rotulo: "PERGUNTAS, NO MÁXIMO" },
                { valor: "30s", rotulo: "PARA RESPONDER" },
                { valor: carrosDoPatio.length > 0 ? String(carrosDoPatio.length) : "—", rotulo: "CARROS NO PÁTIO" },
              ].map((item) => (
                <div key={item.rotulo} className="flex-1">
                  <div className="text-[28px] font-extrabold leading-none lg:text-[34px]">
                    {item.valor}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold tracking-[.14em] text-mt-inverso-suave">
                    {item.rotulo}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-9 lg:mt-auto lg:pt-11">
              <button
                type="button"
                onClick={() => setGameState("q1")}
                className="mt-btn mt-btn-primario mt-foco"
              >
                MONTAR MEU PERFIL
                <Seta size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Perguntas ─── */}
        {emPergunta && (
          <>
            <ReguaProgresso
              posicao={Math.max(0, posicaoNaSequencia)}
              total={totalDePerguntas}
              rotulo={perguntaAtual?.rotulo ?? ""}
            />

            {/* 01 — Orçamento */}
            {gameState === "q1" && (
              <div className="flex flex-1 flex-col">
                <h2 className="mt-display m-0 mt-9 max-w-[640px] text-[30px] text-mt-inverso lg:mt-11 lg:text-[52px]">
                  Qual a faixa de investimento para a próxima garagem?
                </h2>

                {/* Modo de responder: faixa pronta, valor exato, parcela ou texto
                    livre. Quatro abas não cabem numa linha de celular: lá
                    viram grade 2×2, e do tablet para cima voltam a ser linha. */}
                <div className="mt-8 grid grid-cols-2 border-2 border-mt-inverso-regua sm:flex sm:w-max">
                  {([
                    { id: "presets", rotulo: "FAIXA" },
                    { id: "custom", rotulo: "VALOR EXATO" },
                    { id: "porMes", rotulo: "POR MÊS" },
                    { id: "ai", rotulo: "DESCREVER" },
                  ] as const).map((aba, i) => (
                    <button
                      key={aba.id}
                      type="button"
                      onClick={() => setBudgetTab(aba.id)}
                      aria-pressed={budgetTab === aba.id}
                      className={`mt-foco px-3.5 py-3 text-[11px] font-extrabold tracking-[.08em] transition-colors sm:px-5 lg:px-7 lg:text-[13px] ${
                        i % 2 === 1 ? "border-l-2 border-mt-inverso-regua" : ""
                      } ${i >= 2 ? "border-t-2 border-mt-inverso-regua sm:border-t-0" : ""} ${
                        i === 2 ? "sm:border-l-2" : ""
                      } ${
                        budgetTab === aba.id
                          ? "bg-mt-accent text-mt-inverso"
                          : "text-mt-inverso-suave hover:text-mt-inverso"
                      }`}
                    >
                      {aba.rotulo}
                    </button>
                  ))}
                </div>

                {budgetTab === "presets" && (
                  <div className="mt-6 grid gap-0.5 md:grid-cols-2">
                    {faixasDeOrcamento.map((range, i) => (
                          <OpcaoQuiz
                            key={range.id}
                            letra={String.fromCharCode(65 + i)}
                            titulo={range.title}
                            desc={range.desc}
                            selecionada={answers.budgetMax === range.max && answers.budgetMin === range.min}
                            onClick={() => selectBudget(range)}
                          />
                    ))}
                  </div>
                )}

                {budgetTab === "custom" && (
                  <div className="mt-6 max-w-[560px] border-2 border-mt-inverso-regua-fina p-6 lg:p-8">
                    <Rotulo className="text-[11px] tracking-[.16em] text-mt-inverso-suave">
                      LIMITE DE INVESTIMENTO
                    </Rotulo>
                    <div className="mt-2 text-[38px] font-extrabold tracking-[-.04em] lg:text-[46px]">
                      {formatPrice(orcamentoDoSlider)}
                    </div>
                    <p className="m-0 mt-2 text-[12px] leading-relaxed text-mt-inverso-suave">
                      Mostramos carros de R$ {formatShort(pisoDoValorExato(orcamentoDoSlider))} a R${" "}
                      {formatShort(orcamentoDoSlider)}.
                    </p>
                    <input
                      type="range"
                      min={faixaDoSlider.min}
                      max={faixaDoSlider.max}
                      step={faixaDoSlider.passo}
                      value={orcamentoDoSlider}
                      onChange={(e) => setCustomMaxBudget(Number(e.target.value))}
                      aria-label="Limite de investimento"
                      className="mt-range mt-foco mt-6 [--mt-range-trilho:var(--mt-inverso-regua)]"
                    />
                    <button
                      type="button"
                      onClick={confirmCustomBudget}
                      className="mt-btn mt-btn-primario mt-foco mt-7"
                    >
                      CONFIRMAR
                      <Seta size={15} />
                    </button>
                  </div>
                )}

                {budgetTab === "porMes" && (() => {
                  const r = rascunhoPorMes;
                  const mudar = (m: Partial<PorMes>) => setRascunhoPorMes((atual) => ({ ...atual, ...m }));
                  const piso = Math.round(r.parcela * PISO_DO_VALOR_EXATO);
                  // A mesma conta do resultado: quantos têm parcela entre 70%
                  // e 100% do que a pessoa disse, com os filtros já respondidos.
                  const n = semContagem ? null : sobramCom({ ...answers, budgetMin: 0, budgetMax: 0, porMes: r });
                  return (
                    <div className="mt-6 max-w-[560px] border-2 border-mt-inverso-regua-fina p-6 lg:p-8">
                      <Rotulo className="text-[11px] tracking-[.16em] text-mt-inverso-suave">
                        PARCELA QUE CABE NO MÊS
                      </Rotulo>
                      <div className="mt-2 text-[38px] font-extrabold tracking-[-.04em] lg:text-[46px]">
                        {formatPrice(r.parcela)}
                      </div>
                      <input
                        type="range"
                        min={500}
                        max={5000}
                        step={50}
                        value={r.parcela}
                        onChange={(e) => mudar({ parcela: Number(e.target.value) })}
                        aria-label="Parcela que cabe no mês"
                        aria-valuetext={`${formatPrice(r.parcela)} por mês`}
                        className="mt-range mt-foco mt-4 [--mt-range-trilho:var(--mt-inverso-regua)]"
                      />

                      <Rotulo className="mt-7 block text-[11px] tracking-[.16em] text-mt-inverso-suave">
                        ENTRADA
                      </Rotulo>
                      <div className="mt-1.5 text-2xl font-extrabold tracking-[-.03em]">
                        {r.entrada > 0 ? formatPrice(r.entrada) : "Sem entrada"}
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={150000}
                        step={1000}
                        value={r.entrada}
                        onChange={(e) => mudar({ entrada: Number(e.target.value) })}
                        aria-label="Entrada"
                        aria-valuetext={r.entrada > 0 ? formatPrice(r.entrada) : "Sem entrada"}
                        className="mt-range mt-foco mt-4 [--mt-range-trilho:var(--mt-inverso-regua)]"
                      />
                      <p className="m-0 mt-2 text-[12px] leading-relaxed text-mt-inverso-suave">
                        Conte o dinheiro e, se tiver carro para a troca, quanto você espera que ele cubra. É a
                        sua estimativa: o carro é avaliado com a gente, depois.
                      </p>
                      <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13px]">
                        <input
                          type="checkbox"
                          checked={r.troca}
                          onChange={(e) => mudar({ troca: e.target.checked })}
                          className="mt-foco h-4 w-4 accent-[var(--mt-accent)]"
                        />
                        Tenho carro para dar na troca
                      </label>
                      {r.troca && r.entrada === 0 && (
                        <p className="m-0 mt-2 text-[12px] leading-relaxed text-mt-inverso">
                          Se o carro da troca entra na entrada, some acima o valor que você espera dele.
                        </p>
                      )}

                      <Rotulo className="mt-7 block text-[11px] tracking-[.16em] text-mt-inverso-suave">PRAZO</Rotulo>
                      <div className="mt-2.5 flex w-max border-2 border-mt-inverso-regua">
                        {PRAZOS_DO_POR_MES.map((prazo, i) => (
                          <button
                            key={prazo}
                            type="button"
                            onClick={() => mudar({ prazo })}
                            aria-pressed={r.prazo === prazo}
                            className={`mt-foco px-4 py-2 text-xs font-extrabold transition-colors ${
                              i > 0 ? "border-l-2 border-mt-inverso-regua" : ""
                            } ${r.prazo === prazo ? "bg-mt-accent text-mt-inverso" : "text-mt-inverso-suave hover:text-mt-inverso"}`}
                          >
                            {prazo}×
                          </button>
                        ))}
                      </div>

                      <label className="mt-7 block">
                        <Rotulo className="text-[11px] tracking-[.16em] text-mt-inverso-suave">
                          OCUPAÇÃO · MUDA A TAXA ESTIMADA
                        </Rotulo>
                        <select
                          value={r.ocupacao}
                          onChange={(e) => mudar({ ocupacao: e.target.value as Ocupacao })}
                          className="mt-campo mt-foco mt-2 w-full border-b-2 border-mt-inverso-regua bg-transparent pb-2 text-mt-inverso"
                        >
                          {OCUPACOES.map((o) => (
                            <option key={o} value={o} className="bg-mt-inverso-fundo">
                              {ROTULO_DA_OCUPACAO[o]}
                            </option>
                          ))}
                        </select>
                      </label>

                      {n !== null && (
                        <p className="m-0 mt-7 text-[13px] font-extrabold leading-snug" aria-live="polite">
                          {n === 0
                            ? `Nenhum carro do pátio com parcela entre ${formatPrice(piso)} e ${formatPrice(r.parcela)} hoje.`
                            : `${n === 1 ? "1 carro" : `${n} carros`} com parcela entre ${formatPrice(piso)} e ${formatPrice(r.parcela)}.`}
                        </p>
                      )}
                      <p className="m-0 mt-2 text-[11px] leading-relaxed text-mt-inverso-suave">
                        Parcela estimada pela {parametros.fonteDasTaxas}, com IOF. Os bancos parceiros
                        financiam carros de {parametros.anoMaisAntigo} em diante: um mais antigo só entra se a
                        sua entrada pagar ele inteiro. {avisoDeCredito(parametros.bancosParceiros)}
                      </p>
                      <button type="button" onClick={confirmarPorMes} className="mt-btn mt-btn-primario mt-foco mt-6">
                        CONFIRMAR
                        <Seta size={15} />
                      </button>
                    </div>
                  );
                })()}

                {budgetTab === "ai" && (
                  <div className="mt-6 max-w-[560px] border-2 border-mt-inverso-regua-fina p-6 lg:p-8">
                    <Rotulo className="text-[11px] tracking-[.16em] text-mt-inverso-suave">
                      DESCREVA O QUE VOCÊ PROCURA
                    </Rotulo>
                    <textarea
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      placeholder="Ex.: um SUV para a família, até R$ 350 mil, para viagens de estrada"
                      rows={3}
                      aria-label="Descreva o que você procura"
                      className="mt-campo mt-foco mt-4 resize-none border-b-2 border-mt-inverso-regua bg-transparent pb-3 text-mt-inverso placeholder:text-mt-inverso-suave"
                    />
                    <button
                      type="button"
                      onClick={confirmAiCuratorQuery}
                      disabled={!aiQuery.trim()}
                      className="mt-btn mt-btn-primario mt-foco mt-6"
                    >
                      MONTAR PERFIL
                      <Seta size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 02 — Quem vai */}
            {gameState === "q2" && (
              <BlocoPergunta
                titulo="O que o carro vai levar?"
                opcoes={OPCOES_LEVA.map((o) => {
                  const n = semContagem ? null : sobramCom(comLeva(answers, o.id));
                  return {
                    ...o,
                    contagem: n === null ? null : textoDaContagem(n),
                    zerada: n === 0,
                    selecionada: answers.leva === o.id,
                    onClick: () => selectLeva(o.id),
                  };
                })}
              />
            )}

            {/* 03 — Jeito de carro (várias) */}
            {gameState === "q3" && (
              <BlocoPergunta
                titulo="Que jeito de carro?"
                subtitulo="Pode marcar mais de um."
                opcoes={[
                  ...OPCOES_JEITO.map((o) => {
                    // Várias respostas: o número de cada jeito é o dele
                    // sozinho — é o que o "SOBRAM" diz se só ele ficar
                    // marcado, e os números somam entre si.
                    const n = semContagem ? null : sobramCom({ ...answers, jeitos: [o.id] });
                    return {
                      ...o,
                      contagem: n === null ? null : textoDaContagem(n),
                      zerada: n === 0,
                      selecionada: (answers.jeitos ?? []).includes(o.id),
                      onClick: () => alternarJeito(o.id),
                    };
                  }),
                  {
                    id: "tanto-faz",
                    titulo: "Tanto faz",
                    desc: "Mostrem o que o pátio tiver.",
                    contagem: semContagem ? null : textoDaContagem(sobramCom({ ...answers, jeitos: [] })),
                    zerada: false,
                    selecionada: answers.jeitos !== null && answers.jeitos.length === 0,
                    onClick: jeitoTantoFaz,
                  },
                ]}
              />
            )}

            {/* 04 — Câmbio */}
            {gameState === "q4" && (
              <BlocoPergunta
                titulo="Trocar marcha no trânsito?"
                notas={notasDaPergunta("q4")}
                opcoes={OPCOES_CAMBIO.map((o) => {
                  const n = semContagem ? null : sobramCom(comCambio(answers, o.id));
                  return {
                    ...o,
                    contagem: n === null ? null : textoDaContagem(n),
                    zerada: n === 0,
                    selecionada: answers.cambio === o.id,
                    onClick: () => selectCambio(o.id),
                  };
                })}
              />
            )}

            {/* 05 — O que não pode faltar (até três) */}
            {gameState === "q5" && (() => {
              const marcados = perfilAtual.naoPodeFaltar ?? [];
              const cheio = marcados.length >= MAXIMO_DO_QUE_NAO_PODE_FALTAR;
              const visiveis = OPCOES_NAO_PODE_FALTAR.filter((o) => !o.soComCarga || answers.leva === "carga");
              return (
                <BlocoPergunta
                  titulo="O que não pode faltar?"
                  subtitulo={`Até ${MAXIMO_DO_QUE_NAO_PODE_FALTAR}. Ano, km e diesel tiram da lista quem não tem; o resto põe na frente quem tem na ficha.`}
                  notas={notasDaPergunta("q5")}
                  opcoes={[
                    ...visiveis.map((o) => {
                      const selecionada = marcados.includes(o.id);
                      // Item que corta: quantos sobram se ele entrar. Item de
                      // ficha não tira carro — o número honesto é em quantos
                      // dos que sobram ele consta (na ficha ou, para turbo e
                      // 4x4, no nome da versão).
                      let contagem: string | null = null;
                      let zerada = false;
                      if (cheio && !selecionada) {
                        // Desabilitada: um quarto item não entra, e um número
                        // aqui não diria nada sobre ela.
                      } else if (!semContagem && o.corta) {
                        // Marcado: o que sobra com ele. Desmarcado: o que
                        // sobraria se entrasse.
                        const n = selecionada ? restantes.length : sobramCom(comItemAlternado(answers, o.id));
                        contagem = textoDaContagem(n);
                        zerada = n === 0;
                      } else if (!semContagem && restantes.length > 0) {
                        const pref = o.id as ChaveDePreferencia;
                        const n = restantes.filter((v) => PREFERENCIAS[pref].avaliar(v) === "atende").length;
                        contagem = `consta em ${n} de ${restantes.length}`;
                        zerada = n === 0;
                      }
                      return {
                        ...o,
                        contagem,
                        zerada,
                        selecionada,
                        desabilitada: cheio && !selecionada,
                        onClick: () => alternarItem(o.id),
                      };
                    }),
                    {
                      id: "nada-disso",
                      titulo: "Nada disso",
                      desc: "Nenhum destes decide.",
                      contagem: semContagem ? null : textoDaContagem(sobramCom({ ...answers, naoPodeFaltar: [] })),
                      zerada: false,
                      selecionada: answers.naoPodeFaltar !== null && answers.naoPodeFaltar.length === 0,
                      onClick: () => verResultado([]),
                    },
                  ]}
                />
              );
            })()}

            {/* Navegação. Nas perguntas de uma resposta não há "PRÓXIMA":
                escolher já avança, que é como o fluxo sempre funcionou. As de
                várias respostas (03 e 05) têm o botão de seguir. */}
            <div className="mt-8 flex flex-wrap items-center gap-5 lg:mt-9">
              {gameState === "q3" && (
                <button
                  type="button"
                  onClick={confirmarJeitos}
                  disabled={(answers.jeitos ?? []).length === 0}
                  className="mt-btn mt-btn-primario mt-foco disabled:cursor-not-allowed disabled:opacity-40"
                >
                  CONTINUAR
                  <Seta size={15} />
                </button>
              )}
              {gameState === "q5" && (
                <button type="button" onClick={() => verResultado()} className="mt-btn mt-btn-primario mt-foco">
                  VER RESULTADO
                  <Seta size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={voltarPergunta}
                className="mt-btn mt-foco border-2 border-mt-inverso-regua text-mt-neutral-300"
              >
                VOLTAR
              </button>
              {perguntasQueFaltam > 0 && (
                <span className="text-xs text-mt-inverso-suave">
                  {perguntasQueFaltam === 1 ? "Falta 1 pergunta" : `Faltam ${perguntasQueFaltam} perguntas`} · ~
                  {perguntasQueFaltam * SEGUNDOS_POR_PERGUNTA}s
                </span>
              )}
            </div>

            {/* No celular o painel fica lá embaixo; a conta que importa
                acompanha a pergunta. */}
            {!semContagem && orcamentoRespondido && (
              <div className="sticky bottom-0 z-10 -mx-[18px] mt-6 border-t-2 border-mt-inverso-regua bg-mt-inverso-fundo px-[18px] pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
                <span className="text-[11px] font-extrabold tracking-[.12em]">
                  SOBRAM {restantes.length} DE {carrosDoPatio.length}
                </span>
              </div>
            )}
          </>
        )}

        {/* ─── Buscando ─── */}
        {gameState === "loading" && (
          <div className="flex flex-1 flex-col justify-center py-16 lg:py-24">
            <Rotulo accent className="text-[11px] tracking-[.18em] text-mt-cobre-marca">
              TRÊS DO PÁTIO
            </Rotulo>
            <p
              aria-live="polite"
              className="mt-display m-0 mt-5 max-w-[720px] text-[26px] text-mt-inverso lg:text-[44px]"
            >
              {carrosDoPatio.length > 0
                ? `Cruzando suas respostas com os ${carrosDoPatio.length} carros do pátio`
                : "Cruzando suas respostas com o pátio"}
            </p>
          </div>
        )}

        {/* ─── Resultado ─── */}
        {gameState === "results" && (
          <ResultadoDoProfiler
            recomendacao={recomendacao}
            falhou={buscaFalhou}
            escolhidos={escolhidos}
            afrouxados={afrouxados}
            onAlternar={alternarEscolhido}
            coringaRecusado={
              recomendacao?.coringa ? coringasRecusados.includes(recomendacao.coringa.veiculo.id) : false
            }
            onRecusarCoringa={recusarCoringa}
            troca={answers.porMes?.troca ?? false}
            prazo={answers.timeline}
            opcoesDePrazo={OPCOES_PRAZO}
            onPrazo={(id) => escolherPrazo(id as AnswerState["timeline"])}
            onAfrouxar={afrouxar}
            onFalar={() =>
              abrirLead(buscaFalhou || !recomendacao ? "ajuda" : recomendacao.cartoes.length > 0 ? "carros" : "aviso")
            }
            onAvisar={() => abrirLead("aviso")}
            onRefazer={handleReset}
          />
        )}
      </div>

      {/* ─────────── Painel: o perfil se formando ─────────── */}
      {mostrarPainel && (
        <aside
          aria-label="Seu perfil, ao vivo"
          className="flex shrink-0 flex-col bg-mt-bg px-[18px] py-8 text-mt-ink lg:w-[456px] lg:px-10 lg:py-11"
        >
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            SEU PERFIL, AO VIVO
          </Rotulo>
          <h2 className="mt-titulo m-0 mt-3 text-[28px] lg:text-4xl">
            Curadoria em formação
          </h2>

          <div className="mt-6 border-t-2 border-mt-regua lg:mt-7">
            {respostasDoPainel.map((r) => (
              <div
                key={r.numero}
                className="flex items-center gap-3.5 border-b border-mt-regua-fina py-3.5"
              >
                <span className="w-5 text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-600">
                  {r.numero}
                </span>
                <span className="w-[104px] shrink-0 text-[11px] tracking-[.06em] text-mt-neutral-600 lg:text-xs">
                  {r.rotulo}
                </span>
                <span
                  className={`ml-auto text-right text-sm font-extrabold ${
                    r.valor ? "text-mt-accent" : "text-mt-neutral-600"
                  }`}
                >
                  {r.valor || "a responder"}
                </span>
              </div>
            ))}
          </div>

          {composicaoEstoque.length > 0 && (
            <div className="mt-8">
              <Rotulo className="text-[11px] tracking-[.16em]">
                {orcamentoRespondido
                  ? "O QUE SOBRA COM SUAS RESPOSTAS"
                  : "COMPOSIÇÃO DO ESTOQUE"}
              </Rotulo>
              <div className="mt-3.5 flex flex-col gap-3.5">
                {composicaoEstoque.map((linha) => (
                  <div key={linha.tipo}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-sm font-extrabold tracking-[-.01em]">
                        {linha.tipo}
                      </span>
                      <span className="text-[13px] font-extrabold text-mt-accent">
                        {linha.percentual}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-mt-neutral-300">
                      <div
                        className="h-1.5 bg-mt-accent transition-[width] duration-300"
                        style={{ width: `${linha.percentual}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-3 text-[11px] leading-relaxed text-mt-neutral-600">
                Participação por carroceria entre os veículos disponíveis — não é
                nota de compatibilidade.
              </p>
            </div>
          )}

          <div className="mt-8 border-t-2 border-mt-regua pt-5 lg:mt-auto">
            <p className="m-0 text-[13px] leading-relaxed text-mt-neutral-800">
              No fim, você vê <strong>três carros do pátio</strong>, com o porquê
              de cada um, e escolhe quais quer ver com o consultor.
            </p>
            {!semContagem && (
              <div className="mt-3.5 flex items-center gap-2.5">
                <span className="mt-pulso h-2 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
                <span className="text-[11px] tracking-[.1em] text-mt-neutral-600">
                  {orcamentoRespondido
                    ? `SOBRAM ${restantes.length} DE ${carrosDoPatio.length}`
                    : `${carrosDoPatio.length} CARROS NO PÁTIO`}
                </span>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Lead Capture Modal */}
      <LeadCaptureModal
        action={ACOES.carmatch}
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
      />
    </section>
  );
}

/**
 * Perguntas 02 a 05: título grande e a grade de opções.
 * A 01 fica fora porque tem três modos de resposta.
 *
 * Cada opção chega pronta — contagem, seleção e o que o toque faz —, porque
 * as de uma resposta avançam e as de várias alternam, e isso é decisão de
 * quem chama, não do bloco.
 */
function BlocoPergunta({
  titulo,
  subtitulo,
  notas = [],
  opcoes,
}: {
  titulo: string;
  subtitulo?: string;
  notas?: readonly string[];
  opcoes: readonly {
    id: string;
    titulo: string;
    desc: string;
    contagem?: string | null;
    zerada?: boolean;
    selecionada: boolean;
    desabilitada?: boolean;
    onClick: () => void;
  }[];
}) {
  return (
    <div className="flex flex-1 flex-col">
      {notas.map((nota) => (
        <p key={nota} className="m-0 mt-7 max-w-[640px] border-l-2 border-mt-cobre-marca pl-3 text-[13px] leading-relaxed text-mt-inverso">
          {nota}
        </p>
      ))}
      <h2 className="mt-display m-0 mt-9 max-w-[640px] text-[30px] text-mt-inverso lg:mt-11 lg:text-[52px]">
        {titulo}
      </h2>
      {subtitulo && (
        <p className="m-0 mt-3 max-w-[640px] text-[13px] leading-relaxed text-mt-inverso-suave">{subtitulo}</p>
      )}
      <div className="mt-8 grid gap-0.5 md:grid-cols-2 lg:mt-auto">
        {opcoes.map((opcao, i) => (
          <OpcaoQuiz
            key={opcao.id}
            letra={String.fromCharCode(65 + i)}
            titulo={opcao.titulo}
            desc={opcao.desc}
            contagem={opcao.contagem}
            zerada={opcao.zerada}
            selecionada={opcao.selecionada}
            desabilitada={opcao.desabilitada}
            onClick={opcao.onClick}
          />
        ))}
      </div>
    </div>
  );
}

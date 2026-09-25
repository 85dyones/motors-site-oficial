"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getEstoque, Veiculo } from "../lib/supabase";
import { disponiveisDe, precoVigente } from "../lib/regrasEstoque";
import { logFlowInitiated, getActiveAgUid, getMatchParamsRespeitandoRecusa, getUtmParameters, rastreamentoRecusado, sufixoRef, trackCarMatch, trackLeadSubmission, trackContactClick, trackPassoDoProfiler } from "../lib/telemetry";
import { ehMoto, precoDoCarro } from "../lib/fichaDoMotor";
import { faixasDoPatio, nomeCurto, pisoDoValorExato, type ChaveDeFiltro, type Recomendacao } from "../lib/motorDoMatch";
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
 */

interface AnswerState {
  budgetMin: number;
  budgetMax: number;
  objective: "status" | "family" | "efficiency" | "offroad" | "";
  experience: "performance" | "comfort" | "tech" | "economy" | "";
  style: "suv" | "sedan" | "hatch" | "sport" | "pickup" | "open" | "";
  timeline: "immediate" | "researching" | "future" | "";
}

type EstadoQuiz = "intro" | "q1" | "q2" | "q3" | "q4" | "q5" | "loading" | "results";

/**
 * As cinco perguntas, na ordem. Alimenta a régua de progresso e a lista do
 * painel lateral — antes as duas coisas tinham cada uma a sua lista.
 */
const PERGUNTAS = [
  { id: "q1", numero: "01", rotulo: "ORÇAMENTO" },
  { id: "q2", numero: "02", rotulo: "OBJETIVO" },
  { id: "q3", numero: "03", rotulo: "EXPERIÊNCIA" },
  { id: "q4", numero: "04", rotulo: "ESTILO" },
  { id: "q5", numero: "05", rotulo: "PRAZO" },
] as const;

/** Segundos por pergunta usados no "faltam N · ~Ns" — o ritmo do design doc. */
const SEGUNDOS_POR_PERGUNTA = 6;

/**
 * Opções de cada pergunta.
 *
 * `resumo` é o rótulo curto do painel lateral. O texto que vai no payload
 * continua vindo de `formatObjective`/`formatExperience`/… — mexer nestes
 * títulos não muda o que o n8n recebe.
 */
/**
 * ⚠️ O texto foi reescrito em 2026-08-29, e os IDS ficaram.
 *
 * O anterior era de loja premium — "Status, Exclusividade & Design",
 * "Tecnologia, Inovação & Eficiência". Num pátio cuja mediana é R$ 62.900 e
 * que começa em R$ 23.900, ninguém se reconhece nessas palavras. O dono
 * apontou o passo duas vezes.
 *
 * Os ids não mudam porque são a chave de `TAGS_DA_RESPOSTA` (lib/car-match) e
 * do que já foi gravado em lead antigo. Trocar `status` por `melhor-carro`
 * renomearia dado histórico para ganhar nada: o visitante nunca vê o id.
 */
const OPCOES_OBJETIVO = [
  { id: "family", letra: "A", titulo: "Espaço para a família", desc: "Viajar e levar todo mundo com conforto.", resumo: "Família" },
  { id: "status", letra: "B", titulo: "Um carro melhor que o meu", desc: "Mais equipado, mais presença.", resumo: "Subir de carro" },
  { id: "efficiency", letra: "C", titulo: "Rodar barato na cidade", desc: "Economia e facilidade no dia a dia.", resumo: "Cidade" },
  { id: "offroad", letra: "D", titulo: "Trabalho e estrada", desc: "Carga, 4x4 ou muita quilometragem.", resumo: "Trabalho" },
] as const;

/**
 * A 03 pergunta o que PESA na escolha; a 02, para que o carro serve.
 *
 * As duas eram quase a mesma pergunta com palavras diferentes — "Tecnologia,
 * Inovação & Eficiência" na 02 e "Tecnologia & Conectividade" na 03. Quem
 * respondia a primeira não sabia o que a segunda queria de diferente.
 */
const OPCOES_EXPERIENCIA = [
  { id: "performance", letra: "A", titulo: "Motor e desempenho", desc: "Força para ultrapassar e pegar estrada.", resumo: "Desempenho" },
  { id: "comfort", letra: "B", titulo: "Conforto e silêncio", desc: "Rodar macio e cansar menos no trânsito.", resumo: "Conforto" },
  { id: "tech", letra: "C", titulo: "Facilidade no dia a dia", desc: "Câmbio automático e fácil de manobrar.", resumo: "Praticidade" },
  { id: "economy", letra: "D", titulo: "Custo de manter", desc: "Consumo, revisão e revenda.", resumo: "Custo" },
] as const;

/**
 * Hatch entrou em 25/09: são 16 dos 36 carros do pátio e não havia como
 * pedi-los. Quem marca "Aberto a Sugestões" não filtra carroceria nenhuma.
 */
const OPCOES_ESTILO = [
  { id: "suv", letra: "A", titulo: "SUVs Imponentes", desc: "", resumo: "SUV" },
  { id: "sedan", letra: "B", titulo: "Sedans Elegantes", desc: "", resumo: "Sedã" },
  { id: "hatch", letra: "C", titulo: "Hatches Práticos", desc: "", resumo: "Hatch" },
  { id: "sport", letra: "D", titulo: "Esportivos / Coupés", desc: "", resumo: "Esportivo" },
  { id: "pickup", letra: "E", titulo: "Picapes", desc: "", resumo: "Picape" },
  { id: "open", letra: "F", titulo: "Aberto a Sugestões", desc: "", resumo: "Sem preferência" },
] as const;

const OPCOES_PRAZO = [
  { id: "immediate", letra: "A", titulo: "Imediato", desc: "Pronto para fechar negócio nas próximas semanas.", resumo: "Imediato" },
  { id: "researching", letra: "B", titulo: "Pesquisando", desc: "Mapeando opções para compra no próximo mês.", resumo: "Pesquisando" },
  { id: "future", letra: "C", titulo: "Apenas Sondando", desc: "Acompanhando o mercado sem pressa.", resumo: "Sondando" },
] as const;

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
 */
function OpcaoQuiz({
  letra,
  titulo,
  desc,
  selecionada,
  onClick,
}: {
  letra: string;
  titulo: string;
  desc?: string;
  selecionada: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecionada}
      className={`mt-foco flex w-full items-start gap-4 border-2 p-4 text-left transition-colors lg:gap-[18px] lg:px-6 lg:py-[22px] ${
        selecionada
          ? "border-mt-accent bg-[color-mix(in_srgb,var(--mt-accent)_14%,transparent)]"
          : "border-mt-inverso-regua-fina hover:border-mt-inverso-regua"
      }`}
    >
      <span className="mt-0.5 text-[11px] font-extrabold tracking-[.1em] text-mt-accent lg:mt-1 lg:text-xs">
        {letra}
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] font-extrabold leading-tight tracking-[-.02em] lg:text-[21px]">
          {titulo}
        </span>
        {desc && (
          <span className="mt-1.5 block text-xs leading-snug text-mt-inverso-suave lg:text-[13px]">
            {desc}
          </span>
        )}
      </span>
    </button>
  );
}

/** Régua de progresso — "02 / 05 · USO PRINCIPAL" e a barra vermelha. */
function ReguaProgresso({ indice }: { indice: number }) {
  const pergunta = PERGUNTAS[indice];
  const percentual = ((indice + 1) / PERGUNTAS.length) * 100;

  return (
    <div className="mt-9 lg:mt-13">
      <div className="flex items-baseline gap-3 lg:gap-3.5">
        <span className="text-xs font-extrabold tracking-[.12em] text-mt-accent lg:text-[13px]">
          {pergunta.numero} / 0{PERGUNTAS.length}
        </span>
        <span className="text-[11px] tracking-[.08em] text-mt-inverso-suave lg:text-xs">
          {pergunta.rotulo}
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

export default function CarMatch() {
  const { companySettings } = useTheme();
  const [gameState, setGameState] = useState<EstadoQuiz>("intro");
  const [answers, setAnswers] = useState<AnswerState>({ budgetMin: 0, budgetMax: 0, objective: "", experience: "", style: "", timeline: "" });
  const [estoque, setEstoque] = useState<Veiculo[]>([]);
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");

  // O resultado do motor de fatos, e o que a pessoa faz com ele.
  const [recomendacao, setRecomendacao] = useState<Recomendacao | null>(null);
  const [buscaFalhou, setBuscaFalhou] = useState(false);
  /** Filtros tirados pelo "e se". O teto nunca entra aqui. */
  const [afrouxados, setAfrouxados] = useState<ChaveDeFiltro[]>([]);
  /** "QUERO VER ESTE" — ids dos carros marcados, até os três do resultado. */
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  /** O lead leva carros ("quero ver") ou só o pedido ("me avise quando chegar"). */
  const [modoDoLead, setModoDoLead] = useState<"carros" | "aviso">("carros");

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
  const [budgetTab, setBudgetTab] = useState<"presets" | "custom" | "ai">("presets");
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

  /** Os carros à venda — sem a moto, que o Profiler nunca sugere. */
  const carrosDoPatio = useMemo(() => disponiveisDe(estoque).filter((v) => !ehMoto(v)), [estoque]);

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
      budgetMax: orcamentoDoSlider
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
  ) => opcoes.find((o) => o.id === id)?.titulo ?? "Não definido";

  const formatObjective = (obj: AnswerState["objective"]) => rotuloDaOpcao(OPCOES_OBJETIVO, obj);
  const formatExperience = (exp: AnswerState["experience"]) => rotuloDaOpcao(OPCOES_EXPERIENCIA, exp);
  const formatStyle = (style: AnswerState["style"]) => rotuloDaOpcao(OPCOES_ESTILO, style);
  const formatTimeline = (timeline: AnswerState["timeline"]) => rotuloDaOpcao(OPCOES_PRAZO, timeline);

  const semTeto = !answers.budgetMax || answers.budgetMax >= Number.MAX_SAFE_INTEGER;
  const textoDoOrcamento = () => textoDoOrcamentoDe(answers.budgetMin, answers.budgetMax);

  const nomeDoQuiz = companySettings?.carMatchTitle || "Garagem Profiler";

  /** Os carros que o lead leva: os marcados em QUERO VER ESTE, ou os três. */
  const carrosDoLead = () => {
    if (modoDoLead === "aviso") return [];
    const cartoes = recomendacao?.cartoes ?? [];
    const marcados = cartoes.filter((c) => escolhidos.includes(c.veiculo.id));
    return marcados.length > 0 ? marcados : cartoes;
  };

  const abrirLead = (modo: "carros" | "aviso") => {
    setModoDoLead(modo);
    setIsLeadModalOpen(true);
  };

  const alternarEscolhido = (id: string) =>
    setEscolhidos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

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
    const carros = carrosDoLead();
    const nomeComPreco = (c: (typeof carros)[number]) =>
      `${nomeCurto(c.veiculo)} (${formatPrice(precoDoCarro(c.veiculo))})`;
    const lista =
      carros.length === 1
        ? `o ${nomeComPreco(carros[0])}`
        : carros.length > 1
          ? `estes carros: ${carros.slice(0, -1).map(nomeComPreco).join(", ")} e ${nomeComPreco(carros[carros.length - 1])}`
          : "";
    const pedido = recomendacao?.filtros.length ? recomendacao.filtros.join(", ") : textoDoOrcamento();
    const finalMsg =
      carros.length > 0
        ? `Olá! Montei meu perfil no ${nomeDoQuiz} do site e quero ver ${lista}. Estão disponíveis?${sufixoRef()}`
        : `Olá! Montei meu perfil no ${nomeDoQuiz} do site e não achei exatamente o que procuro: ${pedido}. Podem me avisar quando chegar um carro assim?${sufixoRef()}`;

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
        orcamento_maximo: semTeto ? null : answers.budgetMax,
        orcamento_minimo: answers.budgetMin,
        objetivo_principal: formatObjective(answers.objective),
        experiencia_valorizada: formatExperience(answers.experience),
        estilo_preferido: formatStyle(answers.style),
        urgencia: formatTimeline(answers.timeline),
        resumo_ia: isAiCuratorActive
          ? `IA Request: ${aiQuery}. Cliente focado em ${formatObjective(answers.objective)} e ${formatExperience(answers.experience)} com urgência ${formatTimeline(answers.timeline)} e orçamento ${textoDoOrcamento()}.`
          : `Busca: ${formatStyle(answers.style)}, foco em ${formatObjective(answers.objective)} e ${formatExperience(answers.experience)}, orçamento ${textoDoOrcamento()}. Prazo: ${formatTimeline(answers.timeline)}.`
      },
      intencao: {
        nivel: answers.timeline === "immediate" ? "ALTO" : answers.timeline === "researching" ? "MÉDIO" : "BAIXO",
        ticket: !semTeto && answers.budgetMax >= 200000 ? "PREMIUM" : "NORMAL"
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
        carros: carros.map((c) => ({
          id: c.veiculo.id,
          nome: nomeCurto(c.veiculo),
          preco: precoDoCarro(c.veiculo),
          lugar: c.lugar,
          manchete: c.manchete,
          pesa_contra: c.pesaContra,
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

    let parsedBudget = 0;
    const milMatch = lower.match(/(\d+)\s*(?:mil|k)/);
    const rawNumberMatch = lower.match(/(?:r\$)?\s*(\d{2,3})(?:\.\d{3})*(?:,00)?/);

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
    let obj: AnswerState["objective"] = "";
    if (lower.includes("família") || lower.includes("familia") || lower.includes("viagem") || lower.includes("viajar") || lower.includes("filho") || lower.includes("espaço")) {
      obj = "family";
    } else if (lower.includes("cidade") || lower.includes("trabalho") || lower.includes("diário") || lower.includes("diario") || lower.includes("economia")) {
      obj = "efficiency";
    } else if (lower.includes("trilha") || lower.includes("offroad") || lower.includes("terra") || lower.includes("sítio") || lower.includes("fazenda")) {
      obj = "offroad";
    }

    let style: AnswerState["style"] = "";
    if (lower.includes("suv") || lower.includes("4x4") || lower.includes("jeep")) {
      style = "suv";
    } else if (lower.includes("sedã") || lower.includes("sedan")) {
      style = "sedan";
    } else if (lower.includes("esportivo") || lower.includes("porsche") || lower.includes("coupé")) {
      style = "sport";
    } else if (lower.includes("picape") || lower.includes("caminhonete") || /\bram\b/.test(lower) || lower.includes("hilux")) {
      // `\bram\b`, e não `includes("ram")`: "programa" e "grama" viravam
      // picape — e desde 25/09 carroceria é filtro que corta.
      style = "pickup";
    } else if (/\bhatch\b/.test(lower)) {
      style = "hatch";
    }

    return { budgetMax: parsedBudget, objective: obj, style };
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

    setAnswers((prev) => ({
      ...prev,
      budgetMin: 0,
      budgetMax: parsed.budgetMax,
      objective: parsed.objective,
      style: parsed.style,
    }));

    setIsAiCuratorActive(true);

    setTimeout(() => {
      setGameState("q2");
    }, 200);
  };

  const selectBudget = (range: BudgetRange) => {
    setAnswers((prev) => ({ ...prev, budgetMin: range.min, budgetMax: range.max }));
    setTimeout(() => { setGameState("q2"); }, 200);
  };

  const selectObjective = (objective: AnswerState["objective"]) => {
    setAnswers((prev) => ({ ...prev, objective }));
    setTimeout(() => { setGameState("q3"); }, 200);
  };

  const selectExperience = (experience: AnswerState["experience"]) => {
    setAnswers((prev) => ({ ...prev, experience }));
    setTimeout(() => { setGameState("q4"); }, 200);
  };

  const selectStyle = (style: AnswerState["style"]) => {
    setAnswers((prev) => ({ ...prev, style }));
    setTimeout(() => { setGameState("q5"); }, 200);
  };

  const selectTimeline = (timeline: AnswerState["timeline"]) => {
    setAnswers((prev) => ({ ...prev, timeline }));
    setGameState("loading");
  };

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
    const teto = !answers.budgetMax || answers.budgetMax >= Number.MAX_SAFE_INTEGER ? null : answers.budgetMax;

    fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        respostas: { objetivo: answers.objective, experiencia: answers.experience, estilo: answers.style },
        orcamento: { min: answers.budgetMin, max: teto },
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
        trackCarMatch(r.filtros, r.cartoes.length);
      })
      .catch((err) => {
        if (cancelado) return;
        console.error("[CarMatch] A consulta ao estoque falhou:", err);
        setRecomendacao(null);
        setBuscaFalhou(true);
        trackCarMatch([], 0);
      })
      .finally(() => {
        if (!cancelado) setGameState("results");
      });

    return () => {
      cancelado = true;
    };
  }, [gameState, answers, afrouxados]);

  // O funil passo a passo, para medir onde a pessoa desiste. Só o nome do
  // passo vai para o GA4 — nada de resposta nem de orçamento.
  useEffect(() => {
    if (gameState !== "loading") trackPassoDoProfiler(gameState);
  }, [gameState]);

  const handleReset = () => {
    setAnswers({ budgetMin: 0, budgetMax: 0, objective: "", experience: "", style: "", timeline: "" });
    setBudgetTab("presets");
    setAllowUpsell(true);
    setAiQuery("");
    setIsAiCuratorActive(false);
    setRecomendacao(null);
    setBuscaFalhou(false);
    setAfrouxados([]);
    setEscolhidos([]);
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

  // Piso e teto, como o motor — e sem a moto, que o Profiler não sugere.
  const estoqueCompativel = useMemo(() => {
    if (!answers.budgetMax) return carrosDoPatio;
    return carrosDoPatio.filter((v) => {
      const preco = precoVigente(v);
      return preco >= answers.budgetMin && preco <= answers.budgetMax;
    });
  }, [carrosDoPatio, answers.budgetMin, answers.budgetMax]);

  /** Composição por carroceria do que cabe no orçamento — dado real, não score. */
  const composicaoEstoque = useMemo(() => {
    const total = estoqueCompativel.length;
    if (total === 0) return [];

    const contagem = new Map<string, number>();
    for (const v of estoqueCompativel) {
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
  }, [estoqueCompativel]);

  const respostasDoPainel = useMemo(() => {
    const valor = (v: string | undefined) => v ?? "";
    return [
      {
        numero: "01",
        rotulo: "ORÇAMENTO",
        valor: answers.budgetMax
          ? textoDoOrcamentoDe(answers.budgetMin, answers.budgetMax).replace(/^./, (l) => l.toUpperCase())
          : "",
      },
      { numero: "02", rotulo: "OBJETIVO", valor: valor(OPCOES_OBJETIVO.find((o) => o.id === answers.objective)?.resumo) },
      { numero: "03", rotulo: "EXPERIÊNCIA", valor: valor(OPCOES_EXPERIENCIA.find((o) => o.id === answers.experience)?.resumo) },
      { numero: "04", rotulo: "ESTILO", valor: valor(OPCOES_ESTILO.find((o) => o.id === answers.style)?.resumo) },
      { numero: "05", rotulo: "PRAZO", valor: valor(OPCOES_PRAZO.find((o) => o.id === answers.timeline)?.resumo) },
    ];
  }, [answers]);

  const indicePergunta = PERGUNTAS.findIndex((p) => p.id === gameState);
  const emPergunta = indicePergunta >= 0;
  const restantes = emPergunta ? PERGUNTAS.length - (indicePergunta + 1) : 0;
  const mostrarPainel = gameState === "intro" || emPergunta;

  /** Volta uma pergunta; da primeira, volta para a abertura. */
  const voltarPergunta = () => {
    if (indicePergunta <= 0) {
      setGameState("intro");
      return;
    }
    setGameState(PERGUNTAS[indicePergunta - 1].id as EstadoQuiz);
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
          <span className="h-6 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
          <span className="text-[13px] font-extrabold tracking-[.02em] lg:text-[15px]">
            {tituloBarra}
          </span>
          <Link
            href="/"
            className="mt-foco ml-auto text-[11px] tracking-[.1em] text-mt-inverso-suave no-underline transition-colors hover:text-mt-inverso lg:text-xs"
          >
            SAIR
          </Link>
        </div>

        {/* ─── Abertura ─── */}
        {gameState === "intro" && (
          <div className="mt-10 flex flex-1 flex-col lg:mt-12">
            <div className="max-w-[640px]">
              <Rotulo accent className="text-[11px] tracking-[.18em]">
                CONSULTORIA
              </Rotulo>
              <h1 className="mt-display m-0 mt-5 text-[38px] text-mt-inverso lg:text-[66px]">
                Cinco perguntas até o carro certo.
              </h1>
              <p className="m-0 mt-5 max-w-[520px] text-sm leading-relaxed text-mt-inverso-suave lg:text-base">
                Cruzamos suas respostas com o pátio de hoje e mostramos três
                carros, com o que cada um atende do seu pedido e o que pesa contra.
              </p>
            </div>

            <div className="mt-9 flex border-t-2 border-mt-inverso-regua pt-4 lg:mt-11">
              {[
                { valor: "05", rotulo: "PERGUNTAS" },
                { valor: "30s", rotulo: "PARA RESPONDER" },
                { valor: carrosDoPatio.length > 0 ? String(carrosDoPatio.length) : "—", rotulo: "CARROS NO PÁTIO" },
              ].map((item) => (
                <div key={item.rotulo} className="flex-1">
                  <div className="text-[28px] font-extrabold leading-none lg:text-[34px]">
                    {item.valor}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold tracking-[.14em] text-mt-inverso-suave">
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
                INICIAR CURADORIA
                <Seta size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ─── Perguntas ─── */}
        {emPergunta && (
          <>
            <ReguaProgresso indice={indicePergunta} />

            {/* 01 — Orçamento */}
            {gameState === "q1" && (
              <div className="flex flex-1 flex-col">
                <h2 className="mt-display m-0 mt-9 max-w-[640px] text-[30px] text-mt-inverso lg:mt-11 lg:text-[52px]">
                  Qual a faixa de investimento para a próxima garagem?
                </h2>

                {/* Modo de responder: faixa pronta, valor exato ou texto livre */}
                <div className="mt-8 flex w-max border-2 border-mt-inverso-regua">
                  {([
                    { id: "presets", rotulo: "FAIXA" },
                    { id: "custom", rotulo: "VALOR EXATO" },
                    { id: "ai", rotulo: "DESCREVER" },
                  ] as const).map((aba, i) => (
                    <button
                      key={aba.id}
                      type="button"
                      onClick={() => setBudgetTab(aba.id)}
                      className={`mt-foco px-5 py-3 text-[11px] font-extrabold tracking-[.08em] transition-colors lg:px-7 lg:text-[13px] ${
                        i > 0 ? "border-l-2 border-mt-inverso-regua" : ""
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
                    <Rotulo className="text-[10px] tracking-[.16em] text-mt-inverso-suave">
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

                {budgetTab === "ai" && (
                  <div className="mt-6 max-w-[560px] border-2 border-mt-inverso-regua-fina p-6 lg:p-8">
                    <Rotulo className="text-[10px] tracking-[.16em] text-mt-inverso-suave">
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

            {/* 02 — Objetivo */}
            {gameState === "q2" && (
              <BlocoPergunta
                titulo="Qual o principal objetivo na sua próxima compra?"
                opcoes={OPCOES_OBJETIVO}
                selecionado={answers.objective}
                onSelecionar={(id) => selectObjective(id as AnswerState["objective"])}
              />
            )}

            {/* 03 — Experiência */}
            {gameState === "q3" && (
              <BlocoPergunta
                titulo="O que mais pesa na sua escolha?"
                opcoes={OPCOES_EXPERIENCIA}
                selecionado={answers.experience}
                onSelecionar={(id) => selectExperience(id as AnswerState["experience"])}
              />
            )}

            {/* 04 — Estilo */}
            {gameState === "q4" && (
              <BlocoPergunta
                titulo="Qual carroceria mais atrai você hoje?"
                opcoes={OPCOES_ESTILO}
                selecionado={answers.style}
                onSelecionar={(id) => selectStyle(id as AnswerState["style"])}
              />
            )}

            {/* 05 — Prazo */}
            {gameState === "q5" && (
              <BlocoPergunta
                titulo="Qual o seu prazo ideal para fechar negócio?"
                opcoes={OPCOES_PRAZO}
                selecionado={answers.timeline}
                onSelecionar={(id) => selectTimeline(id as AnswerState["timeline"])}
              />
            )}

            {/* Navegação. Não há "PRÓXIMA": escolher uma opção já avança, que
                é como o fluxo sempre funcionou em produção. */}
            <div className="mt-8 flex flex-wrap items-center gap-5 lg:mt-9">
              <button
                type="button"
                onClick={voltarPergunta}
                className="mt-btn mt-foco border-2 border-mt-inverso-regua text-mt-neutral-300"
              >
                VOLTAR
              </button>
              {restantes > 0 && (
                <span className="text-xs text-mt-inverso-suave">
                  {restantes === 1 ? "Falta 1 pergunta" : `Faltam ${restantes} perguntas`} · ~
                  {restantes * SEGUNDOS_POR_PERGUNTA}s
                </span>
              )}
            </div>
          </>
        )}

        {/* ─── Buscando ─── */}
        {gameState === "loading" && (
          <div className="flex flex-1 flex-col justify-center py-16 lg:py-24">
            <Rotulo accent className="text-[11px] tracking-[.18em]">
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
            onAfrouxar={afrouxar}
            onFalar={() => abrirLead(recomendacao && recomendacao.cartoes.length > 0 ? "carros" : "aviso")}
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
                    r.valor ? "text-mt-accent" : "text-mt-neutral-500"
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
                {answers.budgetMax
                  ? "O QUE CABE NO SEU ORÇAMENTO"
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
            {estoqueCompativel.length > 0 && (
              <div className="mt-3.5 flex items-center gap-2.5">
                <span className="mt-pulso h-2 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
                <span className="text-[11px] tracking-[.1em] text-mt-neutral-600">
                  {estoqueCompativel.length}{" "}
                  {answers.budgetMax ? "CARROS NA SUA FAIXA AGORA" : "CARROS NO PÁTIO"}
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
 */
function BlocoPergunta({
  titulo,
  opcoes,
  selecionado,
  onSelecionar,
}: {
  titulo: string;
  opcoes: readonly { id: string; letra: string; titulo: string; desc: string }[];
  selecionado: string;
  onSelecionar: (id: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="mt-display m-0 mt-9 max-w-[640px] text-[30px] text-mt-inverso lg:mt-11 lg:text-[52px]">
        {titulo}
      </h2>
      <div className="mt-8 grid gap-0.5 md:grid-cols-2 lg:mt-auto">
        {opcoes.map((opcao) => (
          <OpcaoQuiz
            key={opcao.id}
            letra={opcao.letra}
            titulo={opcao.titulo}
            desc={opcao.desc}
            selecionada={selecionado === opcao.id}
            onClick={() => onSelecionar(opcao.id)}
          />
        ))}
      </div>
    </div>
  );
}

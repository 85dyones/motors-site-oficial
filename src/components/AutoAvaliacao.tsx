"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { logFlowInitiated, getActiveAgUid, getMatchParamsRespeitandoRecusa, getUtmParameters, idDoEventoDaAvaliacao, sufixoRef, trackAppraisalSubmit, trackLeadSubmission, trackContactClick } from "../lib/telemetry";
import LeadCaptureModal from "./LeadCaptureModal";
import Turnstile, { type TurnstileHandle } from "./Turnstile";
import { ACOES } from "../lib/turnstile";
import SaidaDoCaptcha from "./SaidaDoCaptcha";
import { useTheme } from "../app/ThemeContext";
import { IconeWhatsApp, Rotulo, Seta } from "./modernist/primitivos";
import TextoCinetico from "./modernist/TextoCinetico";
import TextoQueRola from "./modernist/TextoQueRola";
import Hodometro from "./modernist/Hodometro";
import { linkWhatsApp, mascararTelefone, telefoneDoLead } from "../lib/whatsapp";
import {
  consultarValor,
  formatarValorFipe,
  listarAnos,
  listarMarcas,
  listarModelos,
  type OpcaoFipe,
} from "../lib/consultaFipe";

/**
 * Tela 05 — Avaliação Express, na linguagem Modernist.
 *
 * Duas colunas: o formulário em régua à esquerda, a prévia do resultado na
 * faixa escura à direita. A prévia mora aqui dentro, e não na página, porque
 * depende do valor que a consulta FIPE devolve enquanto o usuário preenche.
 *
 * O que NÃO mudou: a cascata marca → modelo → ano na API da FIPE, os três
 * passos, o Turnstile, as chamadas de telemetria e o payload enviado ao
 * backend. Isto aqui é troca de camada de apresentação.
 *
 * Uma diferença deliberada em relação ao design doc: o doc mostra uma "faixa
 * estimada" (R$ 61.400 — R$ 66.900) em volta do valor FIPE. Ela não existe
 * aqui, por decisão do dono em 2026-08-06: o formulário coleta os dados e a
 * regra de precificação vai no JSON que o n8n recebe, para o consultor abrir
 * o lead já com a faixa sugerida. O cliente vê a referência FIPE e nada mais
 * — nenhum valor de compra é prometido antes da vistoria presencial.
 *
 * A regra em si mora em `lib/avaliacaoRecomendacao.ts`, isolada e testada.
 *
 * Sobre a moldura da coluna escura (2026-08-06): ela dizia "PRÉVIA DO
 * RESULTADO" e "COMO CHEGAMOS NESSE NÚMERO" em volta do valor FIPE. Nenhum
 * código inflava o número — ele é a FIPE crua —, mas a moldura fazia o
 * cliente ler 100% da FIPE como a oferta da loja, e a loja compra abaixo
 * dela em qualquer estado de conservação. Criar expectativa acima do que se
 * vai pagar é o mesmo erro de mostrar um valor inventado. Agora a FIPE
 * aparece rotulada como ponto de partida do mercado, e a avaliação é
 * declaradamente do consultor.
 *
 * Sobre a FIPE fora do ar (2026-09-24): a cascata foi para
 * `lib/consultaFipe.ts`, que confere cada resposta e tenta a rota da loja
 * antes da API pública. Quando mesmo assim a FIPE não responde, o passo 01
 * vira três campos de texto — marca, modelo e ano — e a avaliação segue: o
 * consultor confere a FIPE depois. Antes, o limite de taxa da API derrubava a
 * página inteira, e quem quer vender o carro não tem nada a ver com isso.
 */

interface Step1Data {
  marca: string;
  modelo: string;
  ano: string;
}

interface Step2Data {
  estadoMecanico: string;
  estadoConservacao: string;
  /** Só dígitos; a máscara de milhar é aplicada na exibição. */
  quilometragem: string;
  observacoes: string;
}

interface Step3Data {
  nome: string;
  whatsapp: string;
}

/**
 * O que a medição (GA4, Meta, CAPI) recebe no lugar de marca e modelo quando
 * eles foram DIGITADOS. Na cascata os dois vêm da lista fechada da FIPE; no
 * texto livre são o que a pessoa escreveu, e texto livre de cliente não vai
 * para pixel de terceiro — pode trazer nome, placa, telefone.
 */
const DIGITADO_NA_MEDICAO = "(digitado)";

/** Ano digitado à mão: quatro dígitos, de 1950 até o ano que vem. */
function anoDigitadoValido(ano: string): boolean {
  if (!/^\d{4}$/.test(ano)) return false;
  const n = Number(ano);
  return n >= 1950 && n <= new Date().getFullYear() + 1;
}

const PASSOS = [
  { numero: "01", titulo: "Seu veículo" },
  { numero: "02", titulo: "Estado e quilometragem" },
  { numero: "03", titulo: "Contato e proposta" },
];

const TIPOS_VEICULO = [
  { id: "carros", rotulo: "CARROS" },
  { id: "motos", rotulo: "MOTOS" },
  { id: "caminhoes", rotulo: "CAMINHÕES" },
] as const;

const ESTADO_MECANICO = [
  { val: "excelente", label: "Excelente", desc: "Funcionamento perfeito" },
  { val: "bom", label: "Bom", desc: "Apenas revisões preventivas" },
  { val: "atencao", label: "Requer Atenção", desc: "Pequenos barulhos/ajustes" },
  { val: "ruim", label: "Ruim", desc: "Problemas mecânicos graves" },
];

const ESTADO_CONSERVACAO = [
  { val: "impecavel", label: "Impecável", desc: "Sem detalhes ou riscos" },
  { val: "riscos", label: "Pequenos Riscos", desc: "Pequenos arranhões de uso" },
  { val: "reparos", label: "Amassados leves", desc: "Pequenos retoques pendentes" },
  { val: "avariado", label: "Avariado / Batido", desc: "Necessita funilaria expressa" },
];

/**
 * O que a coluna escura explica embaixo do valor.
 *
 * Não é mais "como chegamos nesse número": o número é da FIPE, não nosso.
 * É o caminho até a proposta — e ele diz, sem rodeio, que a compra fica
 * abaixo da FIPE. Sem percentuais: a faixa da regra é insumo do consultor,
 * o cliente nunca vê valor de compra antes da vistoria.
 */
const COMO_A_PROPOSTA_E_FEITA = [
  "A compra da loja fica abaixo da FIPE. Estado, quilometragem, opcionais e histórico de revisões definem o quanto.",
  "O consultor confere os dados, faz a vistoria em Curitiba e envia a avaliação pelo WhatsApp.",
];

/* ────────────────────────────────────────────────────────────────────────
   Campo de escolha com busca

   O sistema não usa caixa de input: usa uma linha com rótulo em cima,
   separada por régua. A régua fica vermelha quando o campo está resolvido —
   é o que substitui o antigo selo verde "Selecionado: X".
   ──────────────────────────────────────────────────────────────────────── */

function SearchableCombobox({
  id,
  label,
  placeholder,
  items,
  value,
  displayValue,
  onSelect,
  onClear,
  loading,
  disabled,
  emptyMessage,
  toolParamDescription,
}: {
  id: string;
  label: string;
  placeholder: string;
  items: { key: string; label: string }[];
  value: string;
  displayValue: string;
  onSelect: (key: string, label: string) => void;
  onClear: () => void;
  loading: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  toolParamDescription?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isUserTyping = useRef(false);

  // Sync display value when parent changes it — but NOT while user is actively typing
  useEffect(() => {
    if (!isUserTyping.current) {
      setSearch(displayValue);
    }
  }, [displayValue]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        isUserTyping.current = false;
        // If no valid selection, revert to display value
        if (!value) setSearch(displayValue);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value, displayValue]);

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const filtered = search.trim() && search !== displayValue
    ? items.filter((i) => normalize(i.label).includes(normalize(search)))
    : items;

  const handleSelect = (key: string, label: string) => {
    isUserTyping.current = false;
    setSearch(label);
    setOpen(false);
    onSelect(key, label);
  };

  const handleClear = () => {
    isUserTyping.current = false;
    setSearch("");
    setOpen(true);
    onClear();
    inputRef.current?.focus();
  };

  return (
    <div className={`relative py-4 pr-0 md:pr-6 ${disabled ? "opacity-45" : ""}`}>
      <label
        className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]"
        htmlFor={id}
      >
        {label}
      </label>

      <div
        className={`flex items-center gap-3 border-b-2 pb-2 transition-colors ${
          value ? "border-mt-accent" : "border-mt-regua-fina"
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled || loading}
          placeholder={loading ? "Carregando…" : placeholder}
          value={search}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            isUserTyping.current = true;
            setSearch(e.target.value);
            setOpen(true);
            // If user modifies text after having a selection, clear it
            if (value) {
              isUserTyping.current = true;
              onClear();
            }
          }}
          className="mt-campo mt-foco min-w-0 flex-1 disabled:cursor-not-allowed"
          toolparamdescription={toolParamDescription}
        />

        {search && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Limpar ${label.toLowerCase()}`}
            className="mt-foco shrink-0 text-mt-neutral-600 transition-colors hover:text-mt-ink"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
            className={`shrink-0 ${loading ? "mt-pulso" : ""} text-mt-accent`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </div>

      {open && !disabled && !loading && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-[calc(100%-4px)] z-50 max-h-56 overflow-y-auto border-2 border-mt-ink bg-mt-bg md:right-6"
        >
          {filtered.length > 0 ? (
            filtered.map((item) => {
              const isSelected = value === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelect(item.key, item.label)}
                  className={`mt-foco flex w-full items-center justify-between gap-3 border-b border-mt-regua-fina px-4 py-2.5 text-left text-[13px] transition-colors last:border-b-0 ${
                    isSelected
                      ? "bg-mt-accent text-mt-inverso"
                      : "text-mt-neutral-800 hover:bg-mt-surface"
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-5">
              <p className="m-0 text-xs text-mt-neutral-700">
                {emptyMessage || `Nenhum resultado para "${search}"`}
              </p>
              <p className="m-0 mt-1 text-[11px] text-mt-neutral-600">
                Verifique a ortografia e tente novamente.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Opção quadrada de estado — mesma gramática das opções do Profiler. */
function OpcaoEstado({
  label,
  desc,
  selecionada,
  onClick,
}: {
  label: string;
  desc: string;
  selecionada: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecionada}
      className={`mt-foco mt-rola-alvo flex flex-col items-start border-2 p-3.5 text-left transition-colors ${
        selecionada
          ? "border-mt-accent bg-mt-accent-100"
          : "border-mt-regua-fina hover:border-mt-regua"
      }`}
    >
      {/* O rótulo gira letra a letra no mouse (`TextoQueRola`). */}
      <span className="text-[13px] font-extrabold leading-tight">
        <TextoQueRola texto={label} />
      </span>
      <span className="mt-1 text-[11px] leading-snug text-mt-neutral-600">{desc}</span>
    </button>
  );
}

export default function AutoAvaliacao() {
  const { companySettings, webhooks } = useTheme();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  // De onde o painel do passo entra (Onda 2 do plano de movimento): pela
  // direita ao avançar, pela esquerda ao voltar, e de lugar nenhum na carga —
  // o passo 01 é o conteúdo da página e não entra animado.
  const [entrada, setEntrada] = useState<"frente" | "tras" | null>(null);
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");
  const [loading, setLoading] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [captchaBloqueado, setCaptchaBloqueado] = useState(false);

  // Type of vehicle
  const [vehicleType, setVehicleType] = useState<"carros" | "motos" | "caminhoes">("carros");

  // Form states
  const [step1, setStep1] = useState<Step1Data>({ marca: "", modelo: "", ano: "" });
  const [step2, setStep2] = useState<Step2Data>({ estadoMecanico: "", estadoConservacao: "", quilometragem: "", observacoes: "" });
  const [step3, setStep3] = useState<Step3Data>({ nome: "", whatsapp: "" });

  // ─── FIPE API States ───
  const [fipeBrands, setFipeBrands] = useState<OpcaoFipe[]>([]);
  const [fipeModels, setFipeModels] = useState<OpcaoFipe[]>([]);
  const [fipeYears, setFipeYears] = useState<OpcaoFipe[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  // A FIPE não respondeu na cascata: o passo 01 vira texto livre. Ver o
  // cabeçalho do arquivo.
  const [fipeFora, setFipeFora] = useState(false);
  // O efeito das marcas precisa saber se está VOLTANDO do texto livre sem
  // depender de `fipeFora` — senão entrar no texto livre refaria a busca.
  const fipeForaRef = useRef(false);
  useEffect(() => {
    fipeForaRef.current = fipeFora;
  }, [fipeFora]);
  // O carro foi escolhido, mas o valor não veio. A cascata segue; a coluna
  // escura avisa que o consultor confere a referência.
  const [fipeSemValor, setFipeSemValor] = useState(false);
  // Incrementar refaz a busca de marcas — é o "tentar a FIPE de novo".
  const [tentativaFipe, setTentativaFipe] = useState(0);

  // Selected FIPE IDs (needed for cascading API calls)
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedYearId, setSelectedYearId] = useState("");

  // FIPE Value states
  const [fipeValor, setFipeValor] = useState("");
  const [fipeCodigo, setFipeCodigo] = useState("");
  // Mês de referência devolvido pela própria API — é o que autoriza dizer
  // "tabela de agosto/2026" sem chutar a data.
  const [fipeMesReferencia, setFipeMesReferencia] = useState("");

  // Display labels
  const [brandDisplay, setBrandDisplay] = useState("");
  const [modelDisplay, setModelDisplay] = useState("");
  const [yearDisplay, setYearDisplay] = useState("");

  /**
   * A geração da cascata. Toda troca de marca, modelo ou tipo a avança, e uma
   * busca de modelos ou anos só aplica a resposta — boa ou falha — se ainda
   * for da geração em que nasceu.
   *
   * Sem isto, com a FIPE lenta: o cliente escolhia Fiat, trocava para Ford
   * antes de os modelos da Fiat chegarem, escolhia Ka 2019, via a FIPE — e a
   * busca VELHA da Fiat, falhando depois, jogava o formulário no texto livre,
   * apagava a FIPE boa e enviava o carro como digitado (achado da revisão de
   * 24/09, reproduzido no jsdom).
   */
  const geracaoDaCascata = useRef(0);
  const invalidarBuscasDaCascata = useCallback(() => {
    geracaoDaCascata.current += 1;
    setLoadingModels(false);
    setLoadingYears(false);
  }, []);

  // Handler for changing vehicle type tab
  const handleVehicleTypeChange = (type: "carros" | "motos" | "caminhoes") => {
    invalidarBuscasDaCascata();
    setVehicleType(type);
    setStep1({ marca: "", modelo: "", ano: "" });
    setSelectedBrandId("");
    setSelectedModelId("");
    setSelectedYearId("");
    setFipeValor("");
    setFipeCodigo("");
    setFipeMesReferencia("");
    setFipeSemValor(false);
    setBrandDisplay("");
    setModelDisplay("");
    setYearDisplay("");
    setFipeModels([]);
    setFipeYears([]);
  };

  /**
   * A FIPE falhou no meio da cascata: o passo 01 vira texto livre, com o que
   * já tinha sido escolhido preenchido. Marca e modelo escolhidos continuam
   * valendo; o que sai são os códigos, que só servem à cascata.
   */
  const entrarNoPreenchimentoAMao = useCallback(() => {
    invalidarBuscasDaCascata();
    setFipeFora(true);
    setSelectedBrandId("");
    setSelectedModelId("");
    setSelectedYearId("");
    setYearDisplay("");
    setFipeModels([]);
    setFipeYears([]);
    setFipeValor("");
    setFipeCodigo("");
    setFipeMesReferencia("");
    setFipeSemValor(false);
  }, [invalidarBuscasDaCascata]);

  // ─── Fetch Brands when vehicleType changes ───
  //
  // `vivo` descarta a resposta de uma busca que ficou velha: trocar de CARROS
  // para MOTOS no meio da primeira não pode deixar as marcas de carro na tela.
  useEffect(() => {
    let vivo = true;
    const buscarMarcas = async () => {
      setLoadingBrands(true);
      try {
        const marcas = await listarMarcas(vehicleType);
        if (!vivo) return;
        // Lista vazia de marcas é FIPE quebrada, não "nenhuma marca".
        if (marcas.length === 0) throw new Error("A FIPE devolveu a lista de marcas vazia.");
        setFipeBrands(marcas);
        // Voltando do texto livre ("tentar a FIPE de novo"), o que foi
        // digitado não pode ficar em `step1` sem aparecer nos campos da
        // cascata — o botão de avançar liberaria um carro que ninguém escolheu.
        if (fipeForaRef.current) {
          setStep1({ marca: "", modelo: "", ano: "" });
          setBrandDisplay("");
          setModelDisplay("");
          setYearDisplay("");
        }
        setFipeFora(false);
      } catch (err) {
        if (!vivo) return;
        console.error("[FIPE] Erro ao buscar marcas:", err);
        setFipeBrands([]);
        entrarNoPreenchimentoAMao();
      } finally {
        if (vivo) setLoadingBrands(false);
      }
    };
    buscarMarcas();
    return () => {
      vivo = false;
    };
  }, [vehicleType, tentativaFipe, entrarNoPreenchimentoAMao]);

  // ─── Fetch Models when brand changes ───
  const fetchModels = useCallback(async (brandId: string) => {
    const minha = ++geracaoDaCascata.current;
    setLoadingModels(true);
    setFipeModels([]);
    setFipeYears([]);
    try {
      const modelos = await listarModelos(vehicleType, brandId);
      if (geracaoDaCascata.current !== minha) return;
      setFipeModels(modelos);
    } catch (err) {
      if (geracaoDaCascata.current !== minha) return;
      console.error("[FIPE] Erro ao buscar modelos:", err);
      entrarNoPreenchimentoAMao();
    } finally {
      if (geracaoDaCascata.current === minha) setLoadingModels(false);
    }
  }, [vehicleType, entrarNoPreenchimentoAMao]);

  // ─── Fetch Years when model changes ───
  const fetchYears = useCallback(async (brandId: string, modelId: string) => {
    const minha = ++geracaoDaCascata.current;
    setLoadingYears(true);
    setFipeYears([]);
    try {
      const anos = await listarAnos(vehicleType, brandId, modelId);
      if (geracaoDaCascata.current !== minha) return;
      // Filter out "32000" (zero-km placeholder) and sort descending
      const filtered = anos
        .filter((y) => !y.codigo.startsWith("32000"))
        .sort((a, b) => {
          const yearA = parseInt(a.nome);
          const yearB = parseInt(b.nome);
          return yearB - yearA;
        });
      setFipeYears(filtered);
    } catch (err) {
      if (geracaoDaCascata.current !== minha) return;
      console.error("[FIPE] Erro ao buscar anos:", err);
      entrarNoPreenchimentoAMao();
    } finally {
      if (geracaoDaCascata.current === minha) setLoadingYears(false);
    }
  }, [vehicleType, entrarNoPreenchimentoAMao]);

  // ─── Fetch FIPE Value details when year is selected ───
  useEffect(() => {
    if (!selectedBrandId || !selectedModelId || !selectedYearId) {
      setFipeValor("");
      setFipeCodigo("");
      setFipeMesReferencia("");
      setFipeSemValor(false);
      return;
    }

    let vivo = true;
    const buscarValor = async () => {
      setFipeSemValor(false);
      try {
        const v = await consultarValor(vehicleType, selectedBrandId, selectedModelId, selectedYearId);
        if (!vivo) return;
        if (!v) {
          setFipeSemValor(true);
          return;
        }
        setFipeValor(formatarValorFipe(v.valor));
        setFipeCodigo(v.codigo);
        setFipeMesReferencia(v.mesReferencia);
      } catch (err) {
        if (!vivo) return;
        // Sem valor, a avaliação segue: o carro está identificado, e a
        // referência o consultor confere. Não é motivo para o texto livre.
        console.error("[FIPE] Erro ao buscar detalhes de valor:", err);
        setFipeSemValor(true);
      }
    };
    buscarValor();
    return () => {
      vivo = false;
    };
  }, [selectedBrandId, selectedModelId, selectedYearId, vehicleType]);

  // Fetch tracking ID on mount
  useEffect(() => {
    const uid = getActiveAgUid();
    setAgUid(uid);
    logFlowInitiated("Auto-Avaliação", uid);
  }, []);

  // A regra morava aqui e foi para `lib/whatsapp.ts` quando o
  // `LeadCaptureModal` ganhou campo de telefone: a mesma máscara escrita duas
  // vezes diverge na primeira correção — e divergiu, no fixo (ver lá).
  const handleWhatsappChange = (value: string) => {
    setStep3((prev) => ({ ...prev, whatsapp: mascararTelefone(value) }));
  };

  // ─── FIPE Cascading Handlers ───
  const handleBrandSelect = (brandId: string, brandName: string) => {
    setSelectedBrandId(brandId);
    setBrandDisplay(brandName);
    setStep1((prev) => ({ ...prev, marca: brandName, modelo: "", ano: "" }));
    // Reset downstream
    setSelectedModelId("");
    setModelDisplay("");
    setYearDisplay("");
    setFipeYears([]);
    // Fetch models
    fetchModels(brandId);
  };

  const handleBrandClear = () => {
    invalidarBuscasDaCascata();
    setSelectedBrandId("");
    setBrandDisplay("");
    setStep1({ marca: "", modelo: "", ano: "" });
    setSelectedModelId("");
    setModelDisplay("");
    setYearDisplay("");
    setFipeModels([]);
    setFipeYears([]);
  };

  const handleModelSelect = (modelId: string, modelName: string) => {
    setSelectedModelId(modelId);
    setModelDisplay(modelName);
    setStep1((prev) => ({ ...prev, modelo: modelName, ano: "" }));
    // Reset year
    setYearDisplay("");
    // Fetch years
    fetchYears(selectedBrandId, modelId);
  };

  const handleModelClear = () => {
    invalidarBuscasDaCascata();
    setSelectedModelId("");
    setModelDisplay("");
    setStep1((prev) => ({ ...prev, modelo: "", ano: "" }));
    setYearDisplay("");
    setFipeYears([]);
  };

  const handleYearSelect = (yearCode: string, yearName: string) => {
    setYearDisplay(yearName);
    setSelectedYearId(yearCode);
    // Extract just the year number for display
    const yearNum = yearName.split(" ")[0];
    setStep1((prev) => ({ ...prev, ano: yearNum }));
  };

  const handleYearClear = () => {
    setYearDisplay("");
    setSelectedYearId("");
    setFipeValor("");
    setFipeCodigo("");
    setFipeMesReferencia("");
    setStep1((prev) => ({ ...prev, ano: "" }));
  };

  /**
   * A faixa de compra NÃO é calculada aqui desde 2026-09-24. A régua virou a
   * curva de `parametros_avaliacao`, que só o servidor lê (RLS de staff), e
   * `/api/avaliacao` sempre recalculou a faixa a partir dos fatos — a daqui
   * era ignorada lá e só servia para parar no localStorage e no console do
   * próprio cliente, que é quem nunca deveria ver a faixa. O formulário manda
   * os fatos; a faixa nasce no servidor.
   */
  const quilometragemNumerica = step2.quilometragem ? Number(step2.quilometragem) : null;

  // Validation checkers for button enabling
  //
  // No texto livre, o ano é conferido aqui — na cascata ele vem da lista da
  // FIPE e não precisa.
  const isStep1Valid = fipeFora
    ? Boolean(step1.marca.trim() && step1.modelo.trim() && anoDigitadoValido(step1.ano))
    : Boolean(step1.marca && step1.modelo && step1.ano);

  // Navigations
  const handleNextStep = () => {
    if (step === 1) {
      if (!isStep1Valid) return;
      setEntrada("frente");
      setStep(2);
    } else if (step === 2) {
      if (!step2.estadoMecanico || !step2.estadoConservacao) return;
      setEntrada("frente");
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    if (step > 1 && step <= 3) {
      setEntrada("tras");
      setStep((prev) => (prev - 1) as 1 | 2 | 3);
    }
  };

  /** A classe do painel do passo: só anima depois de um clique. */
  const painelDoPasso = entrada ? "mt-passo-entra" : undefined;

  // Submit Lead & Dispatch Telemetry Event
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!step3.nome || step3.whatsapp.length < 14) return;
    if (!turnstileToken) {
      alert("Aguardando verificação de segurança (Anti-Spam)...");
      return;
    }

    setLoading(true);

    const activeUid = getActiveAgUid();

    // O id do evento nasce ANTES do envio. `/api/avaliacao` grava `event_id`
    // desde agosto, mas este formulário nunca o mandava: o id só era gerado
    // depois, dentro do tracking — e a linha do lead ficava sem como ser
    // cruzada com o `CompleteRegistration` do pixel e da CAPI (0 de 2
    // avaliações com `event_id` em 2026-09-20). O portão da oposição fica em
    // `idDoEventoDaAvaliacao`, na camada de medição.
    const eventIdDaAvaliacao = idDoEventoDaAvaliacao();

    // POST to backend API route for Lead capturing
    try {
      const response = await fetch("/api/avaliacao", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marca: step1.marca.trim(),
          modelo: step1.modelo.trim(),
          ano: Number(step1.ano) || step1.ano,
          estado: `${step2.estadoMecanico} / ${step2.estadoConservacao}`,
          nome: step3.nome,
          telefone: step3.whatsapp,
          ag_uid: activeUid,
          tipo_veiculo: vehicleType,
          fipe_valor: fipeValor,
          fipe_codigo: fipeCodigo,
          fipe_mes_referencia: fipeMesReferencia,
          // Marca, modelo e ano digitados porque a FIPE não respondeu: o
          // consultor precisa saber que o carro não saiu da tabela.
          veiculo_digitado: fipeFora,
          // Campos que o consultor precisa para aplicar a regra de compra.
          // `observacoes` já era coletado e era descartado antes de chegar
          // ao n8n — só ia parar no histórico do localStorage.
          quilometragem: quilometragemNumerica,
          estado_mecanico: step2.estadoMecanico,
          estado_conservacao: step2.estadoConservacao,
          observacoes: step2.observacoes,
          utm: getUtmParameters(),
          eventId: eventIdDaAvaliacao,
          // `fbp`/`fbc` como as outras superfícies de lead — e já `null` para
          // quem se opôs. A rota grava junto com o `utm` (lib/contextoDeMidia).
          ...getMatchParamsRespeitandoRecusa(),
          turnstileToken
        }),
      });

      if (response.ok) {
        let numericValue = 0;
        if (fipeValor) {
          numericValue = Number(fipeValor.replace(/[^\d]/g, "")) / 100;
        }
        const marcaNaMedicao = fipeFora ? DIGITADO_NA_MEDICAO : step1.marca;
        const modeloNaMedicao = fipeFora ? DIGITADO_NA_MEDICAO : step1.modelo;
        trackAppraisalSubmit(vehicleType, marcaNaMedicao, modeloNaMedicao, String(step1.ano), numericValue, eventIdDaAvaliacao);
      } else {
        // Token do Turnstile é de uso único e já foi gasto no siteverify. Sem
        // pedir outro, uma segunda tentativa reenviaria o mesmo e levaria 403
        // de novo — sem saída, porque o formulário não recarrega sozinho.
        setTurnstileToken("");
        turnstileRef.current?.reset();
      }
    } catch (error) {
      console.error("[Auto-Avaliação] Failed to send lead to backend API:", error);
      setTurnstileToken("");
      turnstileRef.current?.reset();
    }

    // Simulate premium processing delay
    await new Promise((resolve) => setTimeout(resolve, 1400));

    // Telemetry structure for data_agent and log_agent coordination
    const leadPayload = {
      agUid: agUid,
      timestamp: new Date().toISOString(),
      tipoLead: "auto_avaliacao",
      veiculo: {
        marca: step1.marca,
        modelo: step1.modelo,
        ano: step1.ano,
        tipo_veiculo: vehicleType,
        fipe_valor: fipeValor,
        fipe_codigo: fipeCodigo,
      },
      condicoes: {
        estadoMecanico: step2.estadoMecanico,
        estadoConservacao: step2.estadoConservacao,
        quilometragem: quilometragemNumerica,
        observacoes: step2.observacoes || "Nenhuma observação inserida",
      },
      cliente: {
        nome: step3.nome,
        whatsapp: step3.whatsapp,
      },
    };

    if (typeof window !== "undefined") {
      // 1. Log to console for real-time telemetry inspection
      console.log("📈 [Antigravity Telemetry] Lead Auto-Avaliação Enviado:", leadPayload);

      // 2. Save globally to window object for log_agent / data_agent hooks
      (window as any).ag_last_lead = leadPayload;

      // 3. Trigger a custom window event for reactive sub-modules
      const telemetryEvent = new CustomEvent("agTelemetryLead", { detail: leadPayload });
      window.dispatchEvent(telemetryEvent);

      // 4. Save to LocalStorage leads history
      const prevLeads = JSON.parse(localStorage.getItem("ag_leads_history") || "[]");
      localStorage.setItem("ag_leads_history", JSON.stringify([...prevLeads, leadPayload]));
    }

    setLoading(false);
    setStep(4); // Success screen
  };

  // Reset form
  const handleReset = () => {
    setStep1({ marca: "", modelo: "", ano: "" });
    setStep2({ estadoMecanico: "", estadoConservacao: "", quilometragem: "", observacoes: "" });
    setStep3({ nome: "", whatsapp: "" });
    setSelectedBrandId("");
    setSelectedModelId("");
    setSelectedYearId("");
    setFipeValor("");
    setFipeCodigo("");
    setFipeMesReferencia("");
    setBrandDisplay("");
    setModelDisplay("");
    setYearDisplay("");
    setFipeModels([]);
    setFipeYears([]);
    setFipeSemValor(false);
    setVehicleType("carros");
    setTurnstileToken("");
    setCaptchaBloqueado(false);
    setStep(1);
  };

  /**
   * Sai do texto livre e refaz a busca de marcas. O que foi digitado só é
   * descartado se a FIPE responder — ver o efeito das marcas; se ela falhar
   * de novo, a pessoa volta aos campos com o texto dela intacto.
   */
  const tentarFipeDeNovo = () => {
    setTentativaFipe((n) => n + 1);
  };

  const handleWhatsappAvaliacaoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      // "da minha moto", não "do meu Moto" — o artigo acompanha o tipo.
      const posseVeiculo = vehicleType === "motos" ? "da minha moto" : (vehicleType === "caminhoes" ? "do meu caminhão" : "do meu carro");
      const leadMessage = `Olá! Enviei a avaliação ${posseVeiculo} ${step1.marca} ${step1.modelo} no site. Gostaria de falar com um avaliador.${sufixoRef()}`;
      setActiveMessage(leadMessage);
      setIsLeadModalOpen(true);
    }
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken: string }) => {
    const utmParams = getUtmParameters();

    // `telefoneDoLead` normaliza o que veio do campo — que agora chega
    // mascarado, "(41) 99737-2165". As três linhas que estavam aqui tinham um
    // `cleanPhone` que não limpava nada: com 15 caracteres o teste de
    // comprimento falhava e o número seguia para o CRM com parênteses dentro
    // do `remoteJid`. Ver o comentário em `lib/whatsapp.ts`.
    const telefone = telefoneDoLead(leadData.whatsapp);
    const formattedPhone = telefone.comDDI ?? "";
    const remoteJid = telefone.remoteJid;

    // Dispara telemetria de conversão (Lead) no GA4/Meta Pixel ANTES do POST,
    // para reaproveitar o mesmo event_id na deduplicação do CAPI (servidor)
    const fipeNumericValue = fipeValor ? Number(fipeValor.replace(/[^\d]/g, "")) / 100 : 0;
    const phoneE164 = telefone.e164;
    const eventId = trackLeadSubmission(
      fipeFora
        ? { marca: DIGITADO_NA_MEDICAO, modelo: DIGITADO_NA_MEDICAO, preco: fipeNumericValue }
        : { marca: step1.marca, modelo: step1.modelo, preco: fipeNumericValue },
      // A mensagem cita o carro — no texto livre, com as palavras do cliente.
      fipeFora ? "Avaliação com o veículo digitado" : activeMessage,
      {
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        email: leadData.email,
        phoneE164,
        // `contato`, e não `avaliacao`: o lead da avaliação já foi contado no
        // `trackAppraisalSubmit`, quando o formulário com nome e telefone foi
        // enviado. Este modal é o passo seguinte, opcional — quem clicou em
        // "falar com um avaliador" depois de já ter enviado. Marcar os dois
        // como `avaliacao` inflaria a conversão de captação, que é justamente a
        // que a loja usa para decidir verba de compra de estoque.
        tipoDeLead: "contato",
        formId: "form-avaliacao-falar-com-avaliador",
      }
    );
    const { fbp, fbc } = getMatchParamsRespeitandoRecusa();

    const payload = {
      remoteJid,
      telefone: formattedPhone,
      tipo: "lead_whatsapp",
      canal: "Appraisal Chat",
      mensagem: activeMessage,
      veiculo: {
        marca: step1.marca,
        modelo: step1.modelo,
        ano: step1.ano,
        tipo_veiculo: vehicleType,
        fipe_valor: fipeValor,
        fipe_codigo: fipeCodigo,
        // `veiculo_contexto` saiu em 27/08. Ele mandava dois valores FIXOS no
        // código — `perfil_uso` derivado só do tipo de veículo e
        // `tipo_badge: "BAIXA KM"` — para o CRM, em toda avaliação, inclusive
        // nas de carro com 200.000 km. É afirmação inventada sobre o carro do
        // cliente, num campo que o consultor lê como se fosse dado.
        //
        // O que sobra é o que este canal realmente sabe: marca, modelo, ano e
        // FIPE. Quilometragem e estado só existem quando o formulário foi
        // enviado, e aí quem os manda é `POST /api/avaliacao`.
      },
      cliente: {
        nome: leadData.nome,
        email: leadData.email,
        whatsapp: leadData.whatsapp
      },
      utm: utmParams,
      intencao_busca: {},
      agUid: agUid,
      eventId,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      fbp,
      fbc
    };

    // Dispatch lead via secure server proxy api
    // Wrapped: API failures must NEVER block the client from reaching WhatsApp
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          turnstileToken: leadData.turnstileToken
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn("[Lead Submit Avaliacao] API returned error (non-blocking):", errorData?.error || response.status);
      }
    } catch (fetchError: any) {
      console.warn("[Lead Submit Avaliacao] Network error (non-blocking):", fetchError.message);
    }

    // Save lead to history
    try {
      const rawHistory = localStorage.getItem("ag_leads_history");
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      history.push({
        agUid,
        timestamp: new Date().toISOString(),
        tipoLead: "lead_whatsapp_avaliacao",
        cliente: {
          nome: leadData.nome,
          email: leadData.email,
          whatsapp: leadData.whatsapp
        },
        veiculo: {
          marca: step1.marca,
          modelo: step1.modelo,
          ano: step1.ano,
          tipo_veiculo: vehicleType,
          fipe_valor: fipeValor,
          fipe_codigo: fipeCodigo
        }
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(history));
    } catch (e) {
      console.warn("[Telemetry] Failed to save lead payload to history:", e);
    }

    // Redirect to WhatsApp - ALWAYS executes regardless of API outcome
    const whatsappUrl = linkWhatsApp(companySettings, activeMessage);
    // Consequência do lead recém-registrado — ver `pos_lead` em `lib/dataLayer.ts`.
    trackContactClick("whatsapp", "Avaliação - Conversão WhatsApp", { pos_lead: true });
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  // A quilometragem entrou como obrigatória junto com a regra de
  // precificação (2026-08-06): sem ela o consultor não consegue aplicar a
  // faixa de 30%, que depende do limite de 150.000 km.
  const isStep2Valid =
    step2.estadoMecanico && step2.estadoConservacao && step2.quilometragem;
  const isStep3Valid = step3.nome && step3.whatsapp.replace(/\D/g, "").length >= 10;

  // Convert FIPE data to combobox items
  const brandItems = fipeBrands.map((b) => ({ key: b.codigo, label: b.nome }));
  const modelItems = fipeModels.map((m) => ({ key: String(m.codigo), label: m.nome }));
  const yearItems = fipeYears.map((y) => ({ key: y.codigo, label: y.nome }));

  const nomeDoVeiculo = [step1.marca, step1.modelo].filter(Boolean).join(" ").toUpperCase();
  const doSeuVeiculo =
    vehicleType === "motos" ? "da sua moto" : vehicleType === "caminhoes" ? "do seu caminhão" : "do seu carro";
  // O resumo do passo 03 mostrava a chave crua com `capitalize` — "Atencao",
  // "Impecavel", sem acento. O rótulo é o mesmo que a pessoa clicou.
  const rotuloMecanica = ESTADO_MECANICO.find((o) => o.val === step2.estadoMecanico)?.label ?? "";
  const rotuloConservacao = ESTADO_CONSERVACAO.find((o) => o.val === step2.estadoConservacao)?.label ?? "";
  const tituloDaTela = companySettings?.avaliacaoExpressTitle || "Avaliação Express";

  return (
    <section
      id="avaliacao-express"
      aria-label="Avaliação Express"
      className="flex flex-col bg-mt-bg font-modernist text-mt-ink lg:flex-row lg:items-stretch"
    >
      {/* ─────────── Coluna do formulário ─────────── */}
      <div className="min-w-0 flex-1 px-[18px] py-10 lg:border-r-2 lg:border-mt-regua lg:px-11 lg:py-14">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          VENDA OU TROCA
        </Rotulo>
        {/* As palavras acendem uma a uma (`TextoCinetico`, "carga"): é o
            maior texto da página e conta para o LCP já no primeiro quadro. */}
        <h1 className="mt-titulo m-0 mt-3 text-[38px] lg:text-[64px] lg:leading-[.95]">
          <TextoCinetico texto={tituloDaTela} modo="carga" />
        </h1>
        {/* Até 24/09/2026 esta linha dizia "Dados oficiais da Tabela FIPE
            cruzados com o giro real do nosso estoque" — e nenhum código cruza
            FIPE com giro de estoque: a página mostra a FIPE, e a faixa de
            compra é a curva de `parametros_avaliacao`, que também não lê giro.
            A frase afirmava um cálculo que não existe. */}
        <p className="m-0 mt-5 max-w-[520px] text-sm leading-relaxed text-mt-neutral-800 lg:text-base">
          Referência oficial da Tabela FIPE, na versão exata do seu carro. Um
          consultor retorna no WhatsApp com a proposta.
        </p>

        {/* Trilho de passos */}
        {/* Grade de três colunas iguais, e não `flex`: a régua vermelha do
            passo ativo mede um terço e desliza um terço por passo, então as
            colunas precisam ter exatamente a mesma largura. */}
        {step < 4 && (
          <div className="relative mt-9 grid grid-cols-3 border-t-2 border-mt-regua lg:mt-10">
            {PASSOS.map((passo, i) => {
              const numero = i + 1;
              const ativo = numero === step;
              const concluido = numero < step;
              return (
                <button
                  key={passo.numero}
                  type="button"
                  onClick={() => {
                    if (!concluido) return;
                    setEntrada("tras");
                    setStep(numero as 1 | 2 | 3);
                  }}
                  disabled={!concluido}
                  aria-current={ativo ? "step" : undefined}
                  className={`mt-foco flex-1 border-r border-mt-regua-fina py-4 pl-4 pr-4 text-left first:pl-0 last:border-r-0 last:pr-0 ${
                    concluido ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span
                    className={`block text-[11px] font-extrabold tracking-[.12em] ${
                      ativo ? "text-mt-accent" : "text-mt-neutral-500"
                    }`}
                  >
                    {passo.numero}
                  </span>
                  <span
                    className={`mt-2 block text-[13px] font-extrabold leading-tight tracking-[-.01em] lg:text-[15px] ${
                      ativo ? "text-mt-ink" : "text-mt-neutral-500"
                    }`}
                  >
                    {passo.titulo}
                  </span>
                </button>
              );
            })}
            {/* A régua do passo ativo, sobre a borda de cima: desliza até o
                próximo em vez de saltar (`.mt-passo-regua`, modernist.css). */}
            <span
              aria-hidden="true"
              className="mt-passo-regua pointer-events-none absolute -top-0.5 left-0 h-0.5 w-1/3 bg-mt-accent"
              style={{ transform: `translateX(${(step - 1) * 100}%)` }}
            />
          </div>
        )}

        <form
          toolname="auto_avaliacao_veiculo"
          tooldescription="Inicia a avaliação comercial de um veículo para troca ou venda na Motors Store, retornando os preços oficiais da FIPE."
          onSubmit={handleSubmit}
          className="mt-8"
        >
          <input type="hidden" name="tipo_veiculo" value={vehicleType} toolparamdescription="Categoria de automóvel (carros, motos ou caminhoes)." />
          <input type="hidden" name="estado_mecanico" value={step2.estadoMecanico} toolparamdescription="Estado mecânico do veículo (excelente, bom, atencao, ruim)." />
          <input type="hidden" name="estado_conservacao" value={step2.estadoConservacao} toolparamdescription="Estado de conservação da lataria/funilaria (impecavel, riscos, reparos, avariado)." />

          {/* ─── 01 · Seu veículo ─── */}
          {step === 1 && (
            <div className={painelDoPasso} data-entrada={entrada ?? undefined}>
              <Rotulo className="text-[10px] tracking-[.16em]">TIPO DE VEÍCULO</Rotulo>
              <div className="mt-3 flex w-full border-2 border-mt-ink md:w-max">
                {TIPOS_VEICULO.map((tipo, i) => (
                  <button
                    key={tipo.id}
                    type="button"
                    onClick={() => handleVehicleTypeChange(tipo.id)}
                    aria-pressed={vehicleType === tipo.id}
                    className={`mt-foco mt-rola-alvo flex-1 px-4 py-3 text-[12px] font-extrabold tracking-[.08em] transition-colors md:flex-none md:px-7 md:text-[13px] ${
                      i > 0 ? "border-l-2 border-mt-ink" : ""
                    } ${
                      vehicleType === tipo.id
                        ? "bg-mt-accent text-mt-inverso"
                        : "text-mt-ink hover:bg-mt-surface"
                    }`}
                  >
                    <TextoQueRola texto={tipo.rotulo} />
                  </button>
                ))}
              </div>

              {fipeFora ? (
                <div className="mt-9 border-t-2 border-mt-regua pt-5">
                  <p
                    role="status"
                    className="m-0 border-l-2 border-mt-accent pl-3.5 text-[12.5px] font-semibold leading-relaxed text-mt-neutral-800"
                  >
                    A Tabela FIPE não respondeu agora. Digite os dados {doSeuVeiculo} e
                    siga: o consultor confere a referência FIPE antes da proposta.
                  </p>
                  <button
                    type="button"
                    onClick={tentarFipeDeNovo}
                    disabled={loadingBrands}
                    className="mt-foco mt-3 text-[11px] font-extrabold tracking-[.08em] text-mt-accent underline underline-offset-4 disabled:cursor-wait disabled:no-underline disabled:opacity-60"
                  >
                    {loadingBrands ? "CONSULTANDO A FIPE…" : "TENTAR A FIPE DE NOVO"}
                  </button>

                  <div className="mt-4 grid md:grid-cols-2 md:gap-x-2">
                    {(
                      [
                        { id: "marca-digitada", campo: "marca", rotulo: "MARCA", exemplo: "Ex.: Fiat", max: 40 },
                        { id: "modelo-digitado", campo: "modelo", rotulo: "MODELO E VERSÃO", exemplo: "Ex.: Argo Drive 1.0", max: 80 },
                      ] as const
                    ).map((c) => (
                      <div key={c.id} className="py-4 pr-0 md:pr-6">
                        <label className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]" htmlFor={c.id}>
                          {c.rotulo}
                        </label>
                        <input
                          id={c.id}
                          type="text"
                          autoComplete="off"
                          maxLength={c.max}
                          placeholder={c.exemplo}
                          value={step1[c.campo]}
                          onChange={(e) => setStep1((prev) => ({ ...prev, [c.campo]: e.target.value }))}
                          className={`mt-campo mt-foco border-b-2 pb-2 transition-colors ${
                            step1[c.campo].trim() ? "border-mt-accent" : "border-mt-regua-fina"
                          }`}
                        />
                      </div>
                    ))}
                    <div className="py-4 pr-0 md:pr-6">
                      <label className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]" htmlFor="ano-digitado">
                        ANO DO MODELO
                      </label>
                      <input
                        id="ano-digitado"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Ex.: 2021"
                        value={step1.ano}
                        onChange={(e) =>
                          setStep1((prev) => ({ ...prev, ano: e.target.value.replace(/\D/g, "").slice(0, 4) }))
                        }
                        className={`mt-campo mt-foco border-b-2 pb-2 transition-colors ${
                          anoDigitadoValido(step1.ano) ? "border-mt-accent" : "border-mt-regua-fina"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              ) : (
              <div className="mt-9 grid border-t-2 border-mt-regua md:grid-cols-2 md:gap-x-2">
                <SearchableCombobox
                  id="brand-search-fipe"
                  label="MARCA"
                  placeholder="Digite ou busque a marca…"
                  items={brandItems}
                  value={selectedBrandId}
                  displayValue={brandDisplay}
                  onSelect={handleBrandSelect}
                  onClear={handleBrandClear}
                  loading={loadingBrands}
                  toolParamDescription="Marca do automóvel de acordo com a base oficial FIPE."
                />

                <SearchableCombobox
                  id="model-search-fipe"
                  label="MODELO"
                  placeholder={selectedBrandId ? "Busque o modelo…" : "Selecione a marca primeiro"}
                  items={modelItems}
                  value={selectedModelId}
                  displayValue={modelDisplay}
                  onSelect={handleModelSelect}
                  onClear={handleModelClear}
                  loading={loadingModels}
                  disabled={!selectedBrandId}
                  emptyMessage="Nenhum modelo encontrado"
                  toolParamDescription="Modelo correspondente à marca na base FIPE."
                />

                <SearchableCombobox
                  id="year-search-fipe"
                  label="ANO / COMBUSTÍVEL"
                  placeholder={selectedModelId ? "Busque o ano…" : "Selecione o modelo primeiro"}
                  items={yearItems}
                  value={yearDisplay ? fipeYears.find((y) => y.nome === yearDisplay)?.codigo || "" : ""}
                  displayValue={yearDisplay}
                  onSelect={handleYearSelect}
                  onClear={handleYearClear}
                  loading={loadingYears}
                  disabled={!selectedModelId}
                  emptyMessage="Nenhum ano encontrado"
                  toolParamDescription="Ano modelo e combustível do veículo na base FIPE."
                />
              </div>
              )}

              <button
                type="button"
                disabled={!isStep1Valid}
                onClick={handleNextStep}
                className="mt-btn mt-btn-primario mt-foco mt-rola-alvo mt-9"
              >
                <TextoQueRola texto="AVANÇAR PARA ESTADO DO VEÍCULO" />
                <Seta />
              </button>
            </div>
          )}

          {/* ─── 02 · Estado e conservação ─── */}
          {step === 2 && (
            <div className={painelDoPasso} data-entrada={entrada ?? undefined}>
              <Rotulo className="text-[10px] tracking-[.16em]">ESTADO MECÂNICO</Rotulo>
              <div className="mt-3 grid gap-0.5 sm:grid-cols-2">
                {ESTADO_MECANICO.map((opt) => (
                  <OpcaoEstado
                    key={opt.val}
                    label={opt.label}
                    desc={opt.desc}
                    selecionada={step2.estadoMecanico === opt.val}
                    onClick={() => setStep2((prev) => ({ ...prev, estadoMecanico: opt.val }))}
                  />
                ))}
              </div>

              <div className="mt-8">
                <Rotulo className="text-[10px] tracking-[.16em]">
                  FUNILARIA & CONSERVAÇÃO EXTERNA
                </Rotulo>
                <div className="mt-3 grid gap-0.5 sm:grid-cols-2">
                  {ESTADO_CONSERVACAO.map((opt) => (
                    <OpcaoEstado
                      key={opt.val}
                      label={opt.label}
                      desc={opt.desc}
                      selecionada={step2.estadoConservacao === opt.val}
                      onClick={() => setStep2((prev) => ({ ...prev, estadoConservacao: opt.val }))}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-8 border-t-2 border-mt-regua pt-4">
                <label
                  className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]"
                  htmlFor="km-input"
                >
                  QUILOMETRAGEM
                </label>
                <div
                  className={`flex items-baseline gap-2 border-b-2 pb-2 transition-colors ${
                    step2.quilometragem ? "border-mt-accent" : "border-mt-regua-fina"
                  }`}
                >
                  <input
                    id="km-input"
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="Ex.: 68.000"
                    value={
                      step2.quilometragem
                        ? Number(step2.quilometragem).toLocaleString("pt-BR")
                        : ""
                    }
                    onChange={(e) =>
                      setStep2((prev) => ({
                        ...prev,
                        // Guarda só dígitos; o teto de 7 casas evita que um
                        // dedo pesado mande 9.999.999.999 km para o consultor.
                        quilometragem: e.target.value.replace(/\D/g, "").slice(0, 7),
                      }))
                    }
                    className="mt-campo mt-foco min-w-0 flex-1"
                    toolparamdescription="Quilometragem atual do veículo, em quilômetros."
                  />
                  <span className="shrink-0 text-[13px] font-semibold text-mt-neutral-600">
                    km
                  </span>
                </div>
                <p className="m-0 mt-2 text-[11px] leading-relaxed text-mt-neutral-600">
                  É o dado que mais pesa na avaliação, depois da versão.
                </p>
              </div>

              <div className="mt-8 border-t-2 border-mt-regua pt-4">
                <label
                  className="mt-rotulo mb-2 flex items-center justify-between text-[10px] tracking-[.14em]"
                  htmlFor="obs-textarea"
                >
                  OBSERVAÇÕES / OPCIONAIS EXTRAS
                  <span className="text-mt-neutral-500">OPCIONAL</span>
                </label>
                <textarea
                  id="obs-textarea"
                  placeholder="Ex.: teto solar, pneus novos, único dono, manual e chave reserva…"
                  value={step2.observacoes}
                  onChange={(e) => setStep2((prev) => ({ ...prev, observacoes: e.target.value }))}
                  rows={2}
                  className="mt-campo mt-foco resize-none border-b-2 border-mt-regua-fina pb-2"
                  toolparamdescription="Observações ou opcionais extras instalados no veículo."
                />
              </div>

              <div className="mt-9 flex flex-wrap gap-0.5">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="mt-btn mt-btn-contorno mt-foco mt-rola-alvo"
                >
                  <TextoQueRola texto="VOLTAR" />
                </button>
                <button
                  type="button"
                  disabled={!isStep2Valid}
                  onClick={handleNextStep}
                  className="mt-btn mt-btn-primario mt-foco mt-rola-alvo"
                >
                  <TextoQueRola texto="AVANÇAR PARA CONTATO" />
                  <Seta />
                </button>
              </div>
            </div>
          )}

          {/* ─── 03 · Contato e proposta ─── */}
          {step === 3 && (
            <div className={painelDoPasso} data-entrada={entrada ?? undefined}>
              <div className="border-t-2 border-mt-regua">
                <div className="flex justify-between gap-4 border-b border-mt-regua-fina py-3 text-[13px]">
                  <span className="text-mt-neutral-600">Veículo</span>
                  <span className="text-right font-extrabold">
                    {step1.marca} {step1.modelo} ({step1.ano})
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-b border-mt-regua-fina py-3 text-[13px]">
                  <span className="text-mt-neutral-600">Mecânica / conservação</span>
                  <span className="text-right font-extrabold">
                    {rotuloMecanica} / {rotuloConservacao}
                  </span>
                </div>
                {fipeValor && (
                  <div className="flex justify-between gap-4 border-b border-mt-regua-fina py-3 text-[13px]">
                    <span className="text-mt-neutral-600">
                      Referência FIPE{" "}
                      <span className="text-mt-neutral-500">(mercado)</span>
                    </span>
                    <span className="text-right font-extrabold text-mt-accent">{fipeValor}</span>
                  </div>
                )}
              </div>

              <div className="mt-8 grid md:grid-cols-2 md:gap-x-2">
                <div className="py-4 pr-0 md:pr-6">
                  <label className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]" htmlFor="nome-input">
                    SEU NOME COMPLETO
                  </label>
                  <input
                    id="nome-input"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    placeholder="Digite seu nome…"
                    value={step3.nome}
                    onChange={(e) => setStep3((prev) => ({ ...prev, nome: e.target.value }))}
                    className={`mt-campo mt-foco border-b-2 pb-2 transition-colors ${
                      step3.nome ? "border-mt-accent" : "border-mt-regua-fina"
                    }`}
                    toolparamdescription="Nome completo do responsável pela solicitação de avaliação."
                  />
                </div>

                <div className="py-4 pr-0 md:pr-6">
                  <label className="mt-rotulo mb-2 block text-[10px] tracking-[.14em]" htmlFor="whatsapp-input">
                    WHATSAPP
                  </label>
                  <input
                    id="whatsapp-input"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="numeric"
                    required
                    placeholder="(00) 00000-0000"
                    value={step3.whatsapp}
                    onChange={(e) => handleWhatsappChange(e.target.value)}
                    className={`mt-campo mt-foco border-b-2 pb-2 transition-colors ${
                      step3.whatsapp.replace(/\D/g, "").length >= 10
                        ? "border-mt-accent"
                        : "border-mt-regua-fina"
                    }`}
                    toolparamdescription="Número de WhatsApp com DDD para contato."
                  />
                </div>
              </div>

              <p className="m-0 mt-2 text-[11px] leading-relaxed text-mt-neutral-600">
                O consultor recebe estes dados e envia a avaliação pelo
                WhatsApp. A FIPE acima é referência de mercado — a proposta de
                compra fica abaixo dela e é confirmada na vistoria.
              </p>

              <div className="mt-8 flex flex-wrap gap-0.5">
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="mt-btn mt-btn-contorno mt-foco mt-rola-alvo"
                >
                  <TextoQueRola texto="VOLTAR" />
                </button>
                <button
                  type="submit"
                  disabled={!isStep3Valid || loading || !turnstileToken}
                  className="mt-btn mt-btn-primario mt-foco mt-rola-alvo"
                >
                  <TextoQueRola texto={loading ? "CALCULANDO…" : "SOLICITAR PROPOSTA"} />
                  {!loading && <Seta />}
                </button>
              </div>
            </div>
          )}

          {/* ─── 04 · Enviado ─── */}
          {step === 4 && (
            <div className="border-t-2 border-mt-regua pt-8">
              <Rotulo accent className="text-[11px] tracking-[.18em]">
                PROPOSTA A CAMINHO
              </Rotulo>
              <h2 className="mt-titulo m-0 mt-4 text-[30px] lg:text-[44px]">
                <TextoCinetico texto={`Obrigado, ${step3.nome.split(" ")[0]}.`} modo="gesto" />
              </h2>
              <p className="m-0 mt-5 max-w-[520px] text-sm leading-relaxed text-mt-neutral-800">
                Nossos avaliadores receberam o seu{" "}
                <strong>
                  {vehicleType === "motos" ? "moto" : vehicleType === "caminhoes" ? "caminhão" : "carro"}{" "}
                  {step1.marca} {step1.modelo} {step1.ano}
                </strong>{" "}
                e enviam a avaliação e as opções de troca no WhatsApp{" "}
                <strong>{step3.whatsapp}</strong>.
              </p>

              <div className="mt-9 flex flex-wrap gap-0.5">
                <button
                  type="button"
                  onClick={handleWhatsappAvaliacaoClick}
                  className="mt-btn mt-btn-primario mt-foco mt-rola-alvo"
                >
                  <IconeWhatsApp />
                  <TextoQueRola texto="ABRIR CONVERSA NO WHATSAPP" />
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-btn mt-btn-contorno mt-foco mt-rola-alvo"
                >
                  <TextoQueRola texto="NOVA AVALIAÇÃO" />
                </button>
              </div>
            </div>
          )}

          {/* Turnstile fica montado desde o passo 01, como em produção: ele
              resolve o desafio em segundo plano e o token já está pronto
              quando o usuário chega no envio. Montar só no passo 03 deixaria
              o botão desabilitado esperando. */}
          {step < 4 && (
            <div className="mt-9 border-t border-mt-regua-fina pt-5">
              <Turnstile
                ref={turnstileRef}
                action={ACOES.avaliacao}
                onSuccess={(token) => {
                  setTurnstileToken(token);
                  setCaptchaBloqueado(false);
                }}
                onExpire={() => setTurnstileToken("")}
                onError={() => setCaptchaBloqueado(true)}
              />

              {captchaBloqueado && (
                <SaidaDoCaptcha
                  mensagem={
                    step1.marca && step1.modelo
                      ? `Olá! Quero avaliar meu ${step1.marca} ${step1.modelo}${step1.ano ? ` ${step1.ano}` : ""}.`
                      : undefined
                  }
                  onTentarNovamente={() => {
                    setCaptchaBloqueado(false);
                    setTurnstileToken("");
                    turnstileRef.current?.reset();
                  }}
                />
              )}
            </div>
          )}
        </form>
      </div>

      {/* ─────────── Prévia do resultado ─────────── */}
      <aside
        aria-label="Prévia do resultado"
        className="shrink-0 bg-mt-inverso-fundo px-[18px] py-10 text-mt-inverso lg:w-[470px] lg:px-10 lg:py-14"
      >
        <Rotulo className="text-[11px] tracking-[.18em] text-mt-accent-400">
          PONTO DE PARTIDA
        </Rotulo>
        <h2 className="mt-titulo m-0 mt-3 text-[28px] text-mt-inverso lg:text-[32px]">
          <TextoCinetico texto="Referência FIPE" modo="carga" />
        </h2>

        <div className="mt-6 border-t-2 border-mt-inverso-regua pt-5">
          {fipeValor ? (
            <>
              <div className="text-xs tracking-[.06em] text-mt-inverso-suave">
                {nomeDoVeiculo}
                {step1.ano ? ` · ${step1.ano}` : ""}
              </div>
              {/* A FIPE chega rodando como o hodômetro, do zero até o valor, as
                  unidades primeiro; trocar a versão roda só o que mudou. */}
              <div className="mt-2.5 text-[38px] font-extrabold leading-none tracking-[-.04em] lg:text-[44px]">
                <Hodometro texto={fipeValor} chega="montagem" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {fipeCodigo && (
                  <span className="bg-mt-accent-800 px-2.5 py-1 text-[11px] font-semibold text-mt-accent-300">
                    CÓDIGO {fipeCodigo}
                  </span>
                )}
                {fipeMesReferencia && (
                  <span className="text-xs text-mt-inverso-suave">
                    tabela de {fipeMesReferencia}
                  </span>
                )}
              </div>

              {/* O aviso mora aqui, colado no número, e não no rodapé da
                  coluna: é ele que impede o cliente de sair da tela achando
                  que a loja vai pagar a FIPE cheia. */}
              <p className="m-0 mt-5 border-l-2 border-mt-accent pl-3.5 text-[12.5px] font-semibold leading-relaxed text-mt-neutral-300">
                Este é o valor de mercado da tabela, não a nossa proposta. A
                loja compra abaixo da FIPE — a avaliação do seu veículo vem do
                consultor.
              </p>
            </>
          ) : fipeFora || fipeSemValor ? (
            // Sem número, e sem inventar um: quem confere é o consultor.
            <p className="m-0 text-sm leading-relaxed text-mt-neutral-400">
              A Tabela FIPE não respondeu agora. A avaliação segue com os
              dados que você informar, e o consultor confere a referência FIPE
              da versão exata antes de enviar a proposta.
            </p>
          ) : (
            <p className="m-0 text-sm leading-relaxed text-mt-neutral-400">
              Escolha marca, modelo e ano ao lado. O valor oficial da Tabela
              FIPE para a versão exata aparece aqui — como referência de
              mercado, não como proposta de compra.
            </p>
          )}
        </div>

        <div className="mt-8 border-t border-mt-inverso-regua-fina pt-5">
          <Rotulo className="text-[10px] tracking-[.16em] text-mt-inverso-suave">
            COMO A PROPOSTA É FEITA
          </Rotulo>
          <div className="mt-3.5">
            {[
              fipeMesReferencia
                ? `A FIPE oficial de ${fipeMesReferencia}, na versão exata, é o ponto de partida.`
                : "A FIPE oficial, na versão exata do seu veículo, é o ponto de partida.",
              ...COMO_A_PROPOSTA_E_FEITA,
            ].map((item) => (
              <div
                key={item}
                className="flex gap-3 border-b border-mt-inverso-regua-fina py-3 text-[13px] leading-snug"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-mt-accent"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span className="text-mt-neutral-300">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sem botão aqui, e é decisão de 27/08.
            ------------------------------------------------------------------
            Este bloco tinha um "RECEBER PROPOSTA REAL" que, no passo 03,
            aparecia ao lado do "SOLICITAR PROPOSTA" do formulário. Dois CTAs
            principais prometendo a mesma coisa na mesma tela — foi assim que o
            dono notou.

            O problema não era o layout. Aquele botão chamava
            `handleWhatsappAvaliacaoClick`, que é o botão do PASSO 04, e o
            `<aside>` renderiza em todos os passos. Quem clicasse antes de
            enviar:

              · pulava o passo 02 inteiro, e o consultor recebia um lead sem
                quilometragem — o campo que `isStep2Valid` torna obrigatório
                justamente porque a faixa de 30% depende do limite de
                150.000 km;
              · mandava no WhatsApp "Enviei a avaliação do meu carro X no
                site", frase que só é verdade depois do envio (e que, nos
                passos 01–02, saía com a marca vazia no meio);
              · era contado como `contato` em vez de `avaliacao` — a conversão
                pela qual a loja decide verba de compra de estoque.

            Tirar o botão daqui conserta os três de uma vez, porque
            `handleWhatsappAvaliacaoClick` passa a ser alcançável só no passo
            04, onde a frase e a classificação são verdadeiras. O atalho de
            WhatsApp continua existindo lá, na coluna da esquerda.

            O parágrafo fica: sem o botão ele explica o processo, em vez de
            qualificar um CTA. */}
        <div className="mt-8">
          <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-500">
            Quem envia a avaliação é o consultor, com os dados que você
            informou. A proposta final depende de vistoria presencial em
            Curitiba.
          </p>
        </div>
      </aside>

      {/* Positive Friction Lead Capture Modal */}
      <LeadCaptureModal
        action={ACOES.avaliacaoWhatsapp}
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
        initialNome={step3.nome}
        initialWhatsapp={step3.whatsapp}
        vehicleInfo={{
          marca: step1.marca,
          modelo: step1.modelo,
          ano: step1.ano
        }}
      />
    </section>
  );
}

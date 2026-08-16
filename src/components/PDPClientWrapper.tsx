"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Veiculo, truncateString, getVeiculoPdpUrl } from "../lib/supabase";
import { CardVeiculo, LinkRegua } from "./modernist/primitivos";
import { getUtmParameters, getActiveAgUid, trackVehicleView, trackLeadSubmission, trackContactClick, META_CONTENT_TYPE } from "../lib/telemetry";
import { getMatchParams } from "../lib/tracking-identity";
import { useTheme } from "../app/ThemeContext";
import { linkWhatsApp } from "../lib/whatsapp";

const LeadCaptureModal = dynamic(() => import("./LeadCaptureModal"), { ssr: false });
const CalculadoraFinanciamento = dynamic(() => import("./CalculadoraFinanciamento"), { ssr: false });

interface PDPClientWrapperProps {
  veiculo: Veiculo;
  /** Três veículos próximos deste, resolvidos no servidor. */
  similares?: Veiculo[];
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

function formatKm(value: number): string {
  if (value === 0) return "Sem Uso (0 km)";
  return `${value.toLocaleString("pt-BR")} km`;
}

function getShortVehicleId(id: string): string {
  if (!id) return "";
  const parts = id.split("-");
  if (parts.length > 1) {
    const last2 = parts.slice(-2).join("-").toUpperCase();
    if (last2.length >= 4) return last2;
  }
  return id.substring(0, 8).toUpperCase();
}

export default function PDPClientWrapper({ veiculo: initialVeiculo, similares = [] }: PDPClientWrapperProps) {
  const { companySettings, stockOverrides } = useTheme();

  /**
   * O veículo exibido é derivado, não estado.
   *
   * Eram duas coisas: um `useState` inicializado com a prop e dois efeitos
   * que o re-sincronizavam — um quando a prop mudava, outro quando os
   * overrides do painel chegavam. Nada além desses efeitos escrevia nele,
   * então era estado derivado disfarçado, pagando um render extra a cada
   * navegação entre PDPs. `useMemo` faz o mesmo em um passo só.
   */
  const veiculo: Veiculo = useMemo(() => {
    const itemOverrides = stockOverrides?.[initialVeiculo.id];
    return itemOverrides ? { ...initialVeiculo, ...itemOverrides } : initialVeiculo;
  }, [initialVeiculo, stockOverrides]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [opcionaisOpen, setOpcionaisOpen] = useState(true);
  const [periciaOpen, setPericiaOpen] = useState(true);
  
  // Lightbox fullscreen photo viewing states
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);

// Lead modal states
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState("");
  const [activeChannel, setActiveChannel] = useState("WhatsApp Proposta");
  // Simulação de financiamento anexada ao lead: preenchida quando o lead
  // nasce do simulador, zerada nos demais fluxos de contato.
  const [activeSimulacao, setActiveSimulacao] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  const carouselRef = useRef<HTMLDivElement>(null);

  const displayImages = veiculo.whatsapp_images && veiculo.whatsapp_images.length > 0
    ? veiculo.whatsapp_images
    : veiculo.web_full_images;

  // Handle body scroll locking when lightbox is active
  useEffect(() => {
    if (isLightboxOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isLightboxOpen]);

  // Handle lightbox keyboard navigation (Escape to close, Arrows to navigate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return;
      if (e.key === "Escape") {
        setIsLightboxOpen(false);
      } else if (e.key === "ArrowRight") {
        setLightboxImageIndex((prev) => (prev + 1) % displayImages.length);
      } else if (e.key === "ArrowLeft") {
        setLightboxImageIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen, displayImages.length]);

  // Fetch tracking ID from LocalStorage on mount
  useEffect(() => {
    const uid = getActiveAgUid();

    // Dynamic page view logger
    console.log(`[Antigravity Log] PageView iniciada para o veículo: ${veiculo.marca} ${veiculo.modelo} ID: ${veiculo.id}`);

    // Dispara telemetria de visualização do item no GA4/Meta Pixel
    const viewEventId = trackVehicleView({
      id: veiculo.id,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      preco: veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original
    });

    // Espelha o ViewContent via Conversions API (mesmo event_id = dedup no Meta)
    if (viewEventId) {
      const { fbp, fbc } = getMatchParams();
      fetch("/api/capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: "ViewContent",
          eventId: viewEventId,
          eventSourceUrl: window.location.href,
          fbp,
          fbc,
          externalId: uid,
          customData: {
            content_ids: [veiculo.id],
            content_type: META_CONTENT_TYPE,
            content_name: `${veiculo.marca} ${veiculo.modelo}`,
            value: veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original,
            currency: "BRL"
          }
        })
      }).catch((err) => console.warn("[CAPI] ViewContent dispatch failed (non-blocking):", err));
    }

    // Track seen vehicle history for homepage personalization
    if (typeof window !== "undefined") {
      try {
        const seenRaw = localStorage.getItem("ag_seen_vehicles");
        const seenArr: string[] = seenRaw ? JSON.parse(seenRaw) : [];
        if (!seenArr.includes(veiculo.id)) {
          seenArr.push(veiculo.id);
          localStorage.setItem("ag_seen_vehicles", JSON.stringify(seenArr));
        }
      } catch (e) {
        console.warn("[Telemetry] Failed to track seen vehicle:", e);
      }
    }
  }, [veiculo]);

  // Track scroll inside horizontal scroll-snap gallery to highlight corresponding thumbnail
  const handleCarouselScroll = () => {
    if (carouselRef.current) {
      const { scrollLeft, clientWidth } = carouselRef.current;
      const newIndex = Math.round(scrollLeft / clientWidth);
      setActiveImageIndex(newIndex);
    }
  };

  // Scroll carousel to selected image index on thumbnail click
  const scrollCarouselTo = (index: number) => {
    if (carouselRef.current) {
      const clientWidth = carouselRef.current.clientWidth;
      carouselRef.current.scrollTo({
        left: index * clientWidth,
        behavior: "smooth"
      });
      setActiveImageIndex(index);
    }
  };

  const hasDiscount =
    veiculo.preco_promocional > 0 &&
    veiculo.preco_promocional < veiculo.preco_original;
  
  const finalPrice = hasDiscount ? veiculo.preco_promocional : veiculo.preco_original;

  // Split comma-separated features into array
  const featuresList = veiculo.opcionais
    ? veiculo.opcionais.split(",").map((f) => f.trim()).filter(Boolean)
    : [];

  // WhatsApp lead url creation with client-side tracking reference
  const whatsappNumber = companySettings.whatsappRaw;
  
  // O `ag_uid` é lido na hora do clique, e não guardado em estado: ele pode
  // ser gravado depois da montagem da página, e o valor fresco é o que deve
  // ir para a mensagem e para o payload do lead.
  const handleWhatsappPDPClick = () => {
    if (typeof window !== "undefined") {
      const agUid = getActiveAgUid();
      setActiveChannel("WhatsApp Proposta");
      const msg = veiculo.vendido
        ? `Olá! Vi o anúncio no site do ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano} que foi vendido. Gostaria de saber se possuem modelos semelhantes disponíveis. (Ref: ${agUid})`
        : `Olá! Vi o anúncio no site e gostaria de saber mais sobre o ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano}. (Ref: ${agUid})`;
      
      setActiveMessage(msg);
      setActiveSimulacao(null);
      setIsLeadModalOpen(true);
    }
  };

  const handleProposalClick = () => {
    if (typeof window !== "undefined") {
      const agUid = getActiveAgUid();
      setActiveChannel("WhatsApp Dúvidas");
      const msg = `Olá! Gostaria de tirar dúvidas com o vendedor sobre o veículo ${veiculo.marca} ${veiculo.modelo} ${veiculo.ano}. (Ref: ${agUid})`;
      setActiveMessage(msg);
      setActiveSimulacao(null);
      setIsLeadModalOpen(true);
    }
  };

  const handleTradeInClick = () => {
    if (typeof window !== "undefined") {
      const agUid = getActiveAgUid();
      setActiveChannel("WhatsApp Usado na Troca");
      const msg = `Olá! Estou analisando o ${veiculo.marca} ${veiculo.modelo} (${veiculo.ano}) no site e gostaria de avaliar meu veículo como entrada na troca! (Ref: ${agUid})`;
      setActiveMessage(msg);
      setActiveSimulacao(null);
      setIsLeadModalOpen(true);
    }
  };

  const handleTestDriveClick = () => {
    if (typeof window !== "undefined") {
      const agUid = getActiveAgUid();
      setActiveChannel("Agendamento Test-Drive");
      const msg = `Olá! Gostaria de agendar um horário para ver o ${veiculo.marca} ${veiculo.modelo} (${veiculo.ano}) e fazer um test-drive no showroom! (Ref: ${agUid})`;
      setActiveMessage(msg);
      setActiveSimulacao(null);
      setIsLeadModalOpen(true);
    }
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken?: string }) => {
    const agUid = getActiveAgUid();
    const utmParams = getUtmParameters();
    const tipoBadge = veiculo.baixa_km ? "BAIXA KM" : (veiculo.unico_dono ? "ÚNICO DONO" : (veiculo.cautelar_100 ? "CAUTELAR 100%" : "BAIXA KM"));

    const cleanPhone = leadData.whatsapp;
    const formattedPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? "55" + cleanPhone : cleanPhone;
    const remoteJid = formattedPhone ? `${formattedPhone}@s.whatsapp.net` : "";

    // Dispara telemetria de conversão (Lead) no GA4/Meta Pixel ANTES do POST,
    // para reaproveitar o mesmo event_id na deduplicação do CAPI (servidor)
    const phoneE164 = formattedPhone ? `+${formattedPhone}` : null;
    const eventId = trackLeadSubmission({
      id: veiculo.id,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      preco: veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original
    }, activeMessage, {
      googleAdsId: companySettings?.googleAdsId,
      googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
      email: leadData.email,
      phoneE164
    });
    const { fbp, fbc } = getMatchParams();

    const payload = {
      remoteJid,
      telefone: formattedPhone,
      tipo: "lead_whatsapp",
      canal: activeChannel,
      mensagem: activeMessage,
      veiculo: {
        id: veiculo.id,
        marca: veiculo.marca,
        modelo: veiculo.modelo,
        versao: veiculo.versao,
        ano: veiculo.ano,
        preco: veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original,
        vendido: !!veiculo.vendido,
        veiculo_contexto: {
          categoria: veiculo.tipo || "N/A",
          tipo_badge: tipoBadge
        }
      },
      simulacao_financiamento: activeSimulacao || null,
      cliente: {
        nome: leadData.nome,
        email: leadData.email,
        whatsapp: leadData.whatsapp
      },
      utm: {
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        utm_content: utmParams.utm_content
      },
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
        console.warn("[Lead Submit PDP] API returned error (non-blocking):", errorData?.error || response.status);
      }
    } catch (fetchError) {
      console.warn(
"[Lead Submit PDP] Network error (non-blocking):",
        fetchError instanceof Error ? fetchError.message : fetchError,
      );
    }

    // Save lead to history
    try {
      const rawHistory = localStorage.getItem("ag_leads_history");
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      history.push({
        agUid,
        timestamp: new Date().toISOString(),
        tipoLead: "lead_whatsapp_pdp",
        cliente: {
          nome: leadData.nome,
          email: leadData.email,
          whatsapp: leadData.whatsapp
        },
        veiculo: {
          id: veiculo.id,
          marca: veiculo.marca,
          modelo: veiculo.modelo
        }
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(history));
    } catch (e) {
      console.warn("[Telemetry] Failed to save lead payload to history:", e);
    }

    // Redirect to WhatsApp - ALWAYS executes regardless of API outcome
    const whatsappUrl = linkWhatsApp(companySettings, activeMessage);
    trackContactClick("whatsapp", "PDP - Conversão WhatsApp");
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  // ⚠️  TRAÇÃO e LUGARES saíram da régua — não existe dado real para elas.
  //
  // Até aqui as duas linhas eram calculadas a partir do NOME DO MODELO e
  // exibidas ao cliente como ficha técnica. `calculateTração()` devolvia
  // "Integral (4x4 / AWD)" para uma lista de sete modelos, "Traseira (RWD)"
  // para a família 911, e "Dianteira (FWD)" para TODO O RESTO: Amarok, S10 e
  // Compass 4x4 eram anunciados como tração dianteira. `calculateLugares()`
  // tinha o mesmo desenho, com "5 Lugares" de fallback.
  //
  // Verificado contra produção em 2026-08-06: `estoque_motors` tem 28 colunas
  // em 88 veículos e NENHUMA de tração, lugares, portas ou assentos. O sync do
  // n8n consome 21 campos do XML do RevendaMais (MAKE, MODEL, GEAR, FUEL,
  // BODY_TYPE, COLOR…) e nenhum deles traz essa informação — não é caso de
  // mapper que esqueceu de ler a coluna, a coluna não existe.
  //
  // Sem fonte, a linha sai da régua em vez de mostrar palpite (mesma regra de
  // src/components/modernist/VitrineTV.tsx:62). Se algum dia o feed passar a
  // trazer o dado, é só voltar a linha lendo `veiculo.*` e ocultá-la quando
  // vier vazia. Afirmar tração errada sobre um veículo é afirmação falsa sobre
  // o produto — CDC art. 37, o mesmo motivo do commit fdd9785.

  // Specs array with premium custom inline SVGs
  const quickSpecs = [
    { 
      label: "CÂMBIO", 
      value: veiculo.cambio, 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
      ) 
    },
    { 
      label: "QUILOMETRAGEM", 
      value: formatKm(veiculo.quilometragem), 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ) 
    },
    { 
      label: "COMBUSTÍVEL", 
      value: veiculo.combustivel, 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.105-7.5 11.25-7.5 11.25S4.5 17.605 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
      ) 
    },
    {
      label: "COR EXTERNA",
      value: veiculo.cor, 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122A3 3 0 0 0 10.5 15h3a3 3 0 0 0 .97-2.122M2.25 12a9.75 9.75 0 1 1 19.5 0 9.75 9.75 0 0 1-19.5 0Z" />
        </svg>
      ) 
    },
    {
      label: "CATEGORIA",
      value: veiculo.tipo,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
        </svg>
      )
    }
    // Célula sem dado real sai da régua — mesma regra da matriz de
    // especificações, mais abaixo, e da vitrine da TV. Desde 2026-08-06 o
    // mapper não inventa mais default: `cambio`, `combustivel`, `cor` e `tipo`
    // chegam vazios quando o feed do RevendaMais não traz o campo
    // (`combustivel` está ausente em 19 dos 88 veículos em produção). Sem este
    // filtro, esses 19 exibem o rótulo "COMBUSTÍVEL" sobre um valor em branco,
    // e o mesmo vale para "CATEGORIA" desde que o default "Premium" saiu.
    //
    // O `.trim()` aqui é redundante hoje — o mapper já normaliza (supabase.ts:
    // `cor` passa por `.trim()`, e os demais saem de `format*()`). Fica como
    // cinto e suspensório: este filtro é a última barreira antes da tela, e
    // custa menos que descobrir pela PDP que a normalização mudou.
  ].filter((spec) => spec.value && spec.value.trim() !== "");

  const renderSidebar = (isMobile: boolean) => {
    // SEO: Only the mobile sidebar renders an <h1> (appears first in DOM).
    // The desktop sidebar uses <h2> with identical styling to avoid duplicate H1s.
    const HeadingTag = isMobile ? "h1" : "h2";
    // O alternador de visibilidade abaixo tem que falar em `flex`, não em
    // `block`: `gap` só existe em container flex ou grid, e é ele que separa os
    // cinco blocos desta coluna. Com `lg:block`, o `lg:gap-8` da mesma linha
    // virava regra morta — variante de media query é emitida depois do
    // utilitário sem prefixo, então `lg:block` ganhava do `flex` e o container
    // voltava a ser bloco. Até 2026-08-06 a coluna tinha 28px entre os blocos
    // no celular e 0 no desktop, com a régua de especificações encostada no
    // preço e o preço encostado no botão do consultor.
    return (
      <aside
        className={`flex w-full flex-col gap-7 bg-transparent p-0 print:hidden lg:gap-8 ${
          isMobile ? "flex lg:hidden" : "hidden lg:flex"
        }`}
      >
        {/* Marca, código, modelo e versão */}
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[.18em] text-mt-accent">
            {veiculo.marca}
            {veiculo.id && ` · COD. ${veiculo.id}`}
          </span>

          <HeadingTag className="mt-titulo m-0 mt-2.5 text-[30px] leading-none text-mt-ink lg:text-[40px]">
            {veiculo.modelo}
          </HeadingTag>

          <p className="m-0 mt-1 text-sm text-mt-neutral-700">
            {truncateString(veiculo.versao, 45)}
          </p>

          {veiculo.pericia &&
            !veiculo.pericia.toLowerCase().includes("análise") &&
            !veiculo.pericia.toLowerCase().includes("analise") && (
              <span className="mt-3 flex w-fit items-center gap-2 bg-mt-inverso-fundo px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[.12em] text-mt-inverso">
                <span className="mt-pulso h-1.5 w-1.5 bg-mt-accent" aria-hidden="true" />
                {veiculo.pericia}
              </span>
            )}
        </div>

        {/* Especificações rápidas em régua */}
        <div className="grid grid-cols-2 border-t-2 border-mt-regua">
          {quickSpecs.map((spec) => (
            <div key={spec.label} className="border-b border-mt-regua-fina py-3">
              <div className="text-[9px] font-semibold tracking-[.14em] text-mt-neutral-600">
                {spec.label}
              </div>
              <div className="mt-1 truncate text-base font-extrabold text-mt-ink">
                {spec.value}
              </div>
            </div>
          ))}
        </div>

        {/* Preço */}
        <div>
          <div className="text-[10px] font-semibold tracking-[.16em] text-mt-neutral-600">
            {hasDiscount ? "PREÇO PROMOCIONAL" : "À VISTA"}
          </div>
          <div className="mt-1.5 text-[38px] font-extrabold leading-none tracking-[-.04em] lg:text-[48px]">
            {formatPrice(finalPrice)}
          </div>
          {hasDiscount && (
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <span className="bg-mt-accent-100 px-2.5 py-1 text-[11px] font-semibold text-mt-accent-800">
                ABAIXO DO PREÇO ANTERIOR
              </span>
              <span className="text-xs text-mt-neutral-600 line-through">
                {formatPrice(veiculo.preco_original)}
              </span>
            </div>
          )}
          {/* Não existe linha de FIPE aqui, e é deliberado.
              O redesign tinha reintroduzido "Referência FIPE" partindo de que
              o valor vinha do banco. Não vem: `fipe` não é coluna de
              `estoque_motors` — todo carro caía no default "Consulta Fipe",
              dado inventado apresentado ao cliente como fato. Removido da
              matriz de especificações por decisão do dono em 2026-08-06
              (ver comentário na matriz, mais abaixo); manter o bloco aqui
              recriaria o mesmo problema no primeiro carro que trouxesse
              qualquer texto nesse campo. */}
        </div>

        {/* Ações */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={handleWhatsappPDPClick}
 className="mt-btn mt-btn-primario mt-btn-bloco mt-foco px-5 py-[18px] text-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[19px] w-[19px]" aria-hidden="true">
              <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
            </svg>
            {veiculo.vendido ? "CONSULTAR SIMILARES" : "FALAR COM O CONSULTOR"}
          </button>
          <button
            type="button"
            onClick={handleProposalClick}
 className="mt-btn mt-btn-contorno mt-btn-bloco mt-foco px-5 py-3.5 text-xs tracking-[.08em]"
          >
            TIRAR DÚVIDAS COM O VENDEDOR
          </button>
          {/* Segunda linha de ações da tela 03: simular leva à faixa do
              simulador nesta mesma página; a troca abre o fluxo já existente. */}
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => document.getElementById("simulador")?.scrollIntoView({ behavior: "smooth" })}
 className="mt-btn mt-btn-contorno mt-foco flex-1 justify-center px-3 py-3.5 text-center text-[11px] leading-tight tracking-[.06em]"
            >
              SIMULAR FINANCIAMENTO
            </button>
            <button
              type="button"
              onClick={handleTradeInClick}
 className="mt-btn mt-btn-contorno mt-foco flex-1 justify-center px-3 py-3.5 text-center text-[11px] leading-tight tracking-[.06em]"
            >
              DAR MEU CARRO DE ENTRADA
            </button>
          </div>
        </div>

        {/* Social Share & Print Row */}
        <div className="flex items-center justify-between border-t border-brand-border/40 pt-4 mt-1 select-none">
          <button
            onClick={() => window.print()}
 className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-brand-text/80 hover:text-brand-primary border border-brand-border/80 hover:border-brand-primary/50 hover:bg-brand-primary/5 px-3 py-2  transition-all duration-300 select-none cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 9H5.25" />
            </svg>
            Imprimir Ficha
          </button>
          
          <div className="flex items-center gap-2.5">
            {/* WHATSAPP */}
            <button
              onClick={() => {
                const text = `🚗 ${veiculo.marca} ${veiculo.modelo} - ${veiculo.ano}\n💰 ${formatPrice(hasDiscount ? veiculo.preco_promocional : veiculo.preco_original)}\n📋 ${veiculo.versao}\n\n🔗 ${typeof window !== 'undefined' ? window.location.href : ''}`;
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
              }}
 className="flex items-center justify-center h-9 w-9  border border-brand-border/80 text-brand-text/75 hover:text-white hover:bg-emerald-600 hover:border-emerald-600 transition-all duration-300 cursor-pointer"
              aria-label="Compartilhar ficha do veículo no WhatsApp"
              title="Compartilhar no WhatsApp"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="h-4 w-4">
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
              </svg>
            </button>

            {/* INSTAGRAM SHARE / COPY LINK */}
            <div className="relative flex items-center">
              <button
                onClick={handleCopyLink}
 className="flex items-center justify-center h-9 w-9  border border-brand-border/80 text-brand-text/75 hover:text-white hover:bg-gradient-to-tr hover:from-amber-500 hover:via-pink-500 hover:to-purple-600 hover:border-transparent transition-all duration-300 cursor-pointer"
                aria-label="Compartilhar ficha do veículo no Instagram"
                title="Copiar link para Instagram"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="h-4.5 w-4.5">
                  <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9s-58-34.5-93.9-36.2c-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.5 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2s34.5-58 36.2-93.9c2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/>
                </svg>
              </button>
              {copied && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-950 text-white text-[9px] font-bold   whitespace-nowrap animate-bounce border border-brand-border/40 uppercase tracking-widest">
                  Link copiado!
                </div>
              )}
            </div>

            {/* FACEBOOK */}
            <button
              onClick={() => {
                const url = typeof window !== 'undefined' ? window.location.href : '';
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'width=600,height=400');
              }}
 className="flex items-center justify-center h-9 w-9  border border-brand-border/80 text-brand-text/75 hover:text-white hover:bg-blue-600 hover:border-blue-600 transition-all duration-300 cursor-pointer"
              aria-label="Compartilhar ficha do veículo no Facebook"
              title="Compartilhar no Facebook"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" fill="currentColor" className="h-4 w-4">
                <path d="M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.8 0 29.4.2 47.6 2.5L324.8 2C297.1 .4 268 0 245.6 0 147.9 0 99.5 41.6 99.5 145.5v56H16v97.8H80z" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    );
  };

  return (
    <div id="pdp-vehicle-root" data-vehicle-id={veiculo.id} data-price={finalPrice} className="w-full pb-24 bg-brand-bg text-brand-text transition-colors duration-300 flex flex-col print:pb-0">
      
      {/* PRINT ONLY HEADER */}
      <div className="hidden print:flex flex-col gap-4 border-b-2 border-black pb-4 mb-6">
        {/* Dealership header row */}
        <div className="flex flex-row justify-between items-center">
          <div>
            <span className="text-xl font-black tracking-widest text-black uppercase">{companySettings.name}</span>
            <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider">Ficha Técnica de Showroom</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-mono text-zinc-500 block">ID: {getShortVehicleId(veiculo.id)}</span>
            <span className="text-[9px] text-zinc-500 block">Gerado em: {new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        {/* Vehicle details row */}
        <div className="flex flex-row justify-between items-end mt-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{veiculo.marca}</span>
            <div className="text-2xl font-bold text-black leading-tight mt-0.5">{veiculo.modelo}</div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide mt-1">
              {veiculo.versao} • Ano {veiculo.ano} • {veiculo.cor}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block leading-none mb-1">Preço de Venda</span>
            {hasDiscount ? (
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-zinc-400 line-through leading-none">De {formatPrice(veiculo.preco_original)}</span>
                <span className="text-lg font-black text-black tracking-tight mt-1">Por {formatPrice(veiculo.preco_promocional)}</span>
              </div>
            ) : (
              <span className="text-lg font-black text-black tracking-tight">{formatPrice(veiculo.preco_original)}</span>
            )}
          </div>
        </div>
      </div>

      {/* PRINT ONLY FEATURED IMAGE */}
      <div className="hidden print:block w-full mb-6">
        {displayImages[0] && (
          <div className="relative w-full h-[320px] bg-zinc-100  overflow-hidden border border-zinc-200">
            {/* `<img>` cru de propósito: este bloco só existe na impressão da
                ficha, e o `next/image` serve um srcset que a impressora não
                aproveita. Mesma exceção do card em `modernist/primitivos`. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImages[0]}
              alt={`${veiculo.marca} ${veiculo.modelo}`}
 className="w-full h-full object-cover print-main-image"
            />
          </div>
        )}
      </div>

      {/* SINGLE MAIN GRID CONTAINER FOR LAYOUT (Gallery, Sidebar, Description, Accordions, Matriz) */}
      <div className="w-full mx-auto max-w-[1600px] px-0 md:px-8 mt-0 md:mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start print:grid-cols-1 print:gap-6 print:px-0 print:mt-0">
        
        {/* Left Column: Gallery, Mobile Sidebar, Description, and Accordions (spans 8 cols on lg) */}
        <div className="w-full lg:col-span-7 xl:col-span-8 flex flex-col gap-6 max-sm:gap-4 print:col-span-12 print:gap-6">
          
          {/* Gallery block */}
          <section className="w-full flex flex-col gap-3 max-sm:gap-1.5 print:hidden">
            {/* Images container fitted to generous, gorgeous full-bleed responsive heights and styled with bg-zinc-950 */}
            <div className="relative w-full aspect-video landscape:max-h-[75vh] bg-mt-inverso-fundo group border-none p-0 m-0 overflow-hidden">
              {/* Horizontal scroll snap container */}
              <div
                ref={carouselRef}
                onScroll={handleCarouselScroll}
 className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none gap-0"
                style={{ scrollBehavior: "smooth" }}
              >
                {displayImages.map((imgUrl, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      setLightboxImageIndex(index);
                      setIsLightboxOpen(true);
                    }}
 className="w-full h-full snap-center snap-always flex-shrink-0 relative border-none p-0 m-0 cursor-pointer"
                  >
                    <Image
                      src={imgUrl}
                      alt={`${veiculo.marca} ${veiculo.modelo} - Imagem ${index + 1}`}
                      fill
                      priority={index === 0}
                      fetchPriority={index === 0 ? "high" : "auto"}
 className={`object-cover w-full h-full border-none p-0 m-0 ${veiculo.vendido ? "filter grayscale-[30%] opacity-75" : ""}`}
                      sizes="(max-width: 1024px) 100vw, 900px"
                    />
                  </div>
                ))}
              </div>

              {/* Setas de navegação. No mobile a galeria tem ~210px de altura
                  e 48px de seta cobriam o carro; 36px porque ali a seta é
                  atalho secundário — o gesto primário é o arrasto do próprio
                  carrossel (snap-x logo acima). */}
              {displayImages.length > 1 && (
                <>
                  <button
                    onClick={() => scrollCarouselTo((activeImageIndex - 1 + displayImages.length) % displayImages.length)}
 className="mt-foco absolute left-0 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center bg-[rgba(20,18,18,.72)] text-mt-inverso transition-colors hover:bg-mt-accent sm:h-12 sm:w-12"
                    aria-label="Imagem anterior"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="h-3.5 w-3.5 sm:h-4 sm:w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => scrollCarouselTo((activeImageIndex + 1) % displayImages.length)}
 className="mt-foco absolute right-0 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center bg-[rgba(20,18,18,.72)] text-mt-inverso transition-colors hover:bg-mt-accent sm:h-12 sm:w-12"
                    aria-label="Próxima imagem"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="h-3.5 w-3.5 sm:h-4 sm:w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </>
              )}

              {/* Etiqueta de estado, colada no canto — o sistema não flutua
                  selo com sombra e raio, encosta na quina da célula. */}
              {veiculo.status_tag && (
                <div className="mt-etiqueta mt-etiqueta-accent absolute left-0 top-0 z-30 gap-2 text-[10px]">
                  <span className="mt-pulso h-1.5 w-1.5 bg-mt-inverso" aria-hidden="true" />
                  {veiculo.status_tag.toUpperCase()}
                </div>
              )}

              {/* Contador de fotos — "03 / 42" do design doc */}
              {displayImages.length > 0 && (
                <div className="pointer-events-none absolute bottom-0 right-0 z-30 bg-[rgba(20,18,18,.85)] px-3.5 py-2 text-xs font-semibold tracking-[.08em] text-mt-inverso">
                  {String(activeImageIndex + 1).padStart(2, "0")} / {displayImages.length}
                </div>
              )}

              {/* Fullscreen Trigger Button */}
              <button
                onClick={() => {
                  setLightboxImageIndex(activeImageIndex);
                  setIsLightboxOpen(true);
                }}
 className="mt-foco absolute right-0 top-0 z-30 flex h-11 w-11 cursor-pointer items-center justify-center bg-[rgba(20,18,18,.72)] text-mt-inverso transition-colors hover:bg-mt-accent"
                title="Visualizar em tela cheia"
                aria-label="Visualizar fotos do veículo em tela cheia"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0-5.25-5.25" />
                </svg>
              </button>

              {/* Sold overlay */}
              {veiculo.vendido && (
                <div className="absolute inset-0 bg-zinc-950/45 flex items-center justify-center z-20 backdrop-blur-[0.5px] pointer-events-none">
                  <div className="bg-black/80 backdrop-blur-md border border-red-500/30 px-6 py-3   flex items-center gap-2">
                    <span className="h-2 w-2  bg-red-500 animate-pulse" />
                    <span className="text-[11px] font-black tracking-[0.25em] text-white uppercase">
                      VENDIDO
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Grade de miniaturas — tela 03 do design doc: células 4:3
                separadas por 2px, a última escura com "+N VER GALERIA".
                Substitui a faixa rolável antiga; a navegação foto a foto
                continua nas setas e no arrasto do carrossel. No mobile são
                três células (duas fotos), no desktop quatro (três fotos). */}
            {displayImages.length > 1 && (
              /* Flex e não grade: a grade tem um número fixo de colunas e o
                 carro com só duas ou três fotos ficava com células vazias no
                 fim da linha. Com `flex-1` as células dividem a largura seja
                 qual for a quantidade. */
              <div className="flex gap-0.5 bg-mt-bg">
                {displayImages.slice(1, 4).map((imgUrl, i) => {
                  const index = i + 1;
                  return (
                    <button
                      key={index}
                      onClick={() => scrollCarouselTo(index)}
 className={`mt-foco relative aspect-[4/3] flex-1 cursor-pointer overflow-hidden bg-mt-neutral-300 ${i === 2 ? "hidden sm:block" : ""}`}
                      aria-label={`Visualizar foto ${index + 1}`}
                    >
                      <Image
                        src={imgUrl}
                        alt={`${veiculo.marca} ${veiculo.modelo} — miniatura ${index + 1}`}
                        fill
 className="object-cover"
                        sizes="(max-width: 640px) 33vw, 240px"
                      />
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    setLightboxImageIndex(0);
                    setIsLightboxOpen(true);
                  }}
 className="mt-foco grid aspect-[4/3] flex-1 cursor-pointer place-items-center bg-mt-inverso-fundo text-mt-inverso"
                  aria-label="Ver todas as fotos do veículo"
                >
                  <span className="text-center">
                    {displayImages.length > 3 && (
                      <span className="block text-[22px] font-extrabold leading-none sm:hidden">
                        +{displayImages.length - 3}
                      </span>
                    )}
                    {displayImages.length > 4 && (
                      <span className="hidden text-[26px] font-extrabold leading-none sm:block">
                        +{displayImages.length - 4}
                      </span>
                    )}
                    <span className="mt-1.5 block text-[10px] font-semibold tracking-[.14em] text-mt-inverso-suave">
                      VER GALERIA
                    </span>
                  </span>
                </button>
              </div>
            )}
          </section>

          {/* Mobile Sidebar (only blocks on mobile, hidden on lg desktop) */}
          <div className="px-4 md:px-0 block lg:hidden print:hidden">
            {renderSidebar(true)}
          </div>

          {/* Description Section */}
          <div className="px-4 md:px-0 print:px-0">
            <section className="bg-brand-card border border-brand-border/40 p-6 md:p-8 max-sm:p-4   print-avoid-break">
              <h3 className="text-xs font-black uppercase tracking-widest text-brand-primary border-b border-brand-border pb-3 mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5A3.375 3.375 0 0 0 10.125 2.25H3.75A1.125 1.125 0 0 0 2.625 3.375v17.25c0 .621.504 1.125 1.125 1.125h16.5a1.125 1.125 0 0 0 1.125-1.125V14.25z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 16.5h16.5M3.75 12h16.5M3.75 7.5h7.5" />
                </svg>
                DESCRIÇÃO DO VEÍCULO
              </h3>
              {veiculo.descricao && /<[a-z][\s\S]*>/i.test(veiculo.descricao) ? (
                <div 
 className="text-base text-brand-text/75 leading-relaxed font-normal max-w-4xl rich-text-content"
                  dangerouslySetInnerHTML={{ __html: veiculo.descricao }}
                />
              ) : (
                <p className="text-base text-brand-text/75 leading-relaxed font-normal max-w-4xl whitespace-pre-line">
                  {veiculo.descricao}
                </p>
              )}
            </section>
          </div>

          {/* Accordion: Opcionais e Acessórios.
              Some quando o feed não traz opcionais — o que hoje é o caso de 87
              dos 88 veículos. Antes, esses 87 exibiam uma lista fabricada
              ("Teto solar, Multimídia, Rodas de liga leve, Câmera de ré");
              manter a seção vazia só trocaria a mentira por uma caixa oca. */}
          {featuresList.length > 0 && (
          <div className="px-4 md:px-0 print:px-0">
            <div className="bg-brand-card border border-brand-card-border   overflow-hidden transition-all duration-300 print-avoid-break">
              <button
                onClick={() => setOpcionaisOpen(!opcionaisOpen)}
 className="w-full flex items-center justify-between p-5 max-sm:p-4 text-left font-black text-base text-brand-text"
                aria-expanded={opcionaisOpen}
              >
                <span className="uppercase tracking-widest text-sm max-sm:text-xs">OPCIONAIS E ACESSÓRIOS DE SÉRIE</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2.5"
                  stroke="currentColor"
                  className={`w-4 h-4 text-brand-primary transition-transform duration-300 print:hidden ${
                    opcionaisOpen ? "rotate-180" : ""
                  }`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              
              <div
                className={`transition-all duration-300 overflow-hidden print:max-h-none print:p-6 print:border-t print:block ${
                  opcionaisOpen ? "max-h-[1000px] border-t border-brand-border p-6 max-sm:p-4" : "max-h-0"
                }`}
              >
                <ul className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 text-xs text-brand-text/70">
                  {featuresList.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="text-brand-primary font-black text-sm">✓</span>
                      <span className="font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          )}

          {/* Accordion: Perícia Cautelar.
              Renderizado SÓ quando o feed traz um laudo de verdade E a perícia
              está aprovada. Antes era incondicional: os 88 veículos exibiam
"LAUDO TÉCNICO APROVADO — Histórico livre de sinistros e leilão"
              com um texto de perícia fabricado, incluindo carros cuja perícia
              está "Em análise". Afirmar laudo limpo sobre carro não periciado é
              o tipo de declaração que gera passivo direto de CDC. */}
          {veiculo.laudo_pericia && veiculo.pericia === "PERÍCIA APROVADA" && (
          <div className="px-4 md:px-0 print:px-0">
            <div className="bg-brand-card border border-brand-card-border   overflow-hidden transition-all duration-300 print-avoid-break">
              <button
                onClick={() => setPericiaOpen(!periciaOpen)}
 className="w-full flex items-center justify-between p-5 max-sm:p-4 text-left font-black text-base text-brand-text"
                aria-expanded={periciaOpen}
              >
                <span className="uppercase tracking-widest text-sm max-sm:text-xs">LAUDO DE PERÍCIA CAUTELAR CERTIFICADO</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2.5"
                  stroke="currentColor"
                  className={`w-4 h-4 text-brand-primary transition-transform duration-300 print:hidden ${
                    periciaOpen ? "rotate-180" : ""
                  }`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              
              <div
                className={`transition-all duration-300 overflow-hidden print:max-h-none print:p-6 print:border-t print:block ${
                  periciaOpen ? "max-h-[500px] border-t border-brand-border p-6 max-sm:p-4" : "max-h-0"
                }`}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/10 text-emerald-600 p-2.5 ">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08ZM12 8.25a.75.75 0 0 1 .75.75v3.25a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 6a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-emerald-600 uppercase tracking-wide">LAUDO TÉCNICO APROVADO</h4>
                      <p className="text-[10px] text-brand-text/75 font-extrabold uppercase tracking-wider">Histórico livre de sinistros e leilão</p>
                    </div>
                  </div>
                  <p className="text-xs text-brand-text/70 leading-relaxed italic bg-brand-bg p-4  border border-brand-border font-medium">
                    &ldquo;{veiculo.laudo_pericia}&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>
          )}

        </div>

        {/* Right Column: Desktop Sidebar and Matriz de Especificações (spans 5 cols on lg) */}
        <div className="w-full lg:col-span-5 xl:col-span-4 flex flex-col gap-6 max-sm:gap-4 px-4 lg:px-0 print:col-span-12 print:px-0 print:gap-6">
          
          {/* Desktop Sidebar (only blocks on lg desktop, hidden on mobile) */}
          <div className="hidden lg:block print:hidden">
            {renderSidebar(false)}
          </div>

          {/* Specification Matrix Table */}
          <aside className="bg-brand-card border border-brand-border/40 p-6 max-sm:p-4   w-full print-avoid-break">
            <h3 className="text-sm font-black uppercase tracking-widest text-brand-primary border-b border-brand-border pb-4 mb-4">
              MATRIZ DE ESPECIFICAÇÕES
            </h3>

            {/* Matrix detailed table */}
            <div className="flex flex-col divide-y divide-brand-border/40 print:grid print:grid-cols-2 print:gap-x-8 print:gap-y-0 print:divide-y-0">
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">MARCA</span>
                <span className="text-brand-text font-extrabold">{veiculo.marca}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">MODELO</span>
                <span className="text-brand-text font-extrabold">{veiculo.modelo}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">ANO / MODELO</span>
                <span className="text-brand-text font-extrabold">{veiculo.ano}</span>
              </div>
              <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                <span className="text-brand-gold font-bold uppercase">QUILOMETRAGEM</span>
                <span className="text-brand-text font-extrabold">{formatKm(veiculo.quilometragem)}</span>
              </div>
              {/* Linha sem dado real é OCULTADA, não exibida vazia nem com
                  default. `combustivel` está ausente em 19 dos 88 veículos e
                  vinha preenchido com "Flex" — inclusive em elétricos e diesel. */}
              {veiculo.cambio && (
                <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                  <span className="text-brand-gold font-bold uppercase">TRANSMISSÃO</span>
                  <span className="text-brand-text font-extrabold">{veiculo.cambio}</span>
                </div>
              )}
              {veiculo.combustivel && (
                <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                  <span className="text-brand-gold font-bold uppercase">COMBUSTÍVEL</span>
                  <span className="text-brand-text font-extrabold">{veiculo.combustivel}</span>
                </div>
              )}
              {/* DIREÇÃO não entra nesta matriz: o valor era adivinhado a
                  partir do nome do modelo e do texto livre da descrição —
                  chute apresentado ao lado de km e ano, que são dados reais
                  do feed. A função que fazia esse palpite foi removida em
                  2026-08-06; se a direção voltar, tem que vir do feed. */}
              {veiculo.cor && (
                <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                  <span className="text-brand-gold font-bold uppercase">COR EXTERNA</span>
                  <span className="text-brand-text font-extrabold">{veiculo.cor}</span>
                </div>
              )}
              {/* ID interno e FIPE ficam FORA da matriz, por decisão do dono
                  (2026-08-06): o ID é dado operacional da loja, e `fipe` nem
                  existe no banco — todo carro exibia o default "Consulta Fipe",
                  um dado inventado apresentado ao cliente como fato. O ID
                  segue disponível no cabeçalho de impressão da ficha. */}
              {veiculo.tipo && (
                <div className="flex justify-between py-2 text-[11px] max-sm:py-1.5 print:border-b print:border-zinc-200 print:py-1">
                  <span className="text-brand-gold font-bold uppercase">CARROCERIA</span>
                  <span className="text-brand-text font-extrabold">{veiculo.tipo}</span>
                </div>
              )}

            </div>

          {/* Direct contact CTA box in side desk bar — Re-structured for High Conversion Trade-In & Showroom Visit */}
          <div className="mt-6 pt-6 border-t border-brand-border/40 flex flex-col gap-4 print:hidden">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10  bg-brand-primary/10 border border-brand-primary flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5 text-brand-primary">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </div>
                <div>
                  <h5 className="text-xs font-black text-brand-text uppercase leading-none">Seu Usado na Troca ou Test-Drive</h5>
                  {/* "Supervalorização FIPE" prometia pagar acima da tabela.
                      A loja compra abaixo da FIPE em qualquer estado de
                      conservação (regra em `lib/avaliacaoRecomendacao.ts`),
                      então a frase criava uma expectativa que o consultor
                      teria que desmontar no atendimento. Trocada em
                      2026-08-06. */}
                  <p className="text-[10px] text-brand-text/75 font-semibold tracking-wide uppercase mt-1">Avaliação com base na FIPE + Visita no Showroom</p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleTradeInClick}
 className="w-full h-12 bg-green-600 hover:bg-green-500 text-white font-extrabold text-[11px] uppercase tracking-widest  flex items-center justify-center gap-2 active:scale-95  hover: transition-all duration-300 cursor-pointer"
                  style={{ minHeight: "48px" }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 .999.999 0 0 0-.987 1.106v7.635m12-6.677h-12" />
                  </svg>
                  <span>Avaliar Meu Carro na Troca</span>
                </button>

                <button
                  onClick={handleTestDriveClick}
 className="w-full h-11 bg-brand-card hover:bg-brand-primary/10 text-brand-primary font-extrabold text-[10px] uppercase tracking-widest  flex items-center justify-center gap-2 border border-brand-primary/40 hover:border-brand-primary transition-all duration-300 cursor-pointer active:scale-95"
                  style={{ minHeight: "44px" }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  <span>Agendar Test-Drive / Visita</span>
                </button>
              </div>
            </div>
          </aside>

        </div>

      </div>

      {/* 5. STICKY BOTTOM BAR (Mobile Thumb Zone CTA — High-Impact Dual Action) */}
      <div className="pb-safe fixed bottom-0 left-0 right-0 z-40 flex items-center gap-0.5 bg-mt-bg pt-0.5 md:hidden print:hidden">
        <button
          onClick={handleTradeInClick}
 className="mt-btn mt-btn-contorno mt-foco flex-none justify-center px-3 py-3 text-center text-[11px] leading-tight tracking-[.06em]"
          style={{ minHeight: "44px", width: "96px" }}
        >
          USADO<br />NA TROCA
        </button>
        <button
          onClick={handleWhatsappPDPClick}
 className="mt-btn mt-btn-primario mt-foco flex-1 px-4 py-[18px] text-[13px] tracking-[.08em]"
          style={{ minHeight: "44px" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
          </svg>
          <span>CHAMAR NO WHATSAPP</span>
        </button>
      </div>

      {/* 6. LIGHTBOX MODAL (Fullscreen View - Full 100vw x 100vh Landscape Optimized) */}
      {isLightboxOpen && (
        <div className="fixed inset-0 bg-black/98 z-[9999] backdrop-blur-xl flex flex-col justify-between p-0 transition-all duration-300 select-none print:hidden overflow-hidden">
          {/* Top Bar with Floating Controls & Counter */}
          <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between w-full p-3 sm:p-5 bg-gradient-to-b from-black/85 via-black/50 to-transparent pointer-events-auto">
            <div className="flex items-center gap-3">
              <span className="text-white text-xs sm:text-sm font-black uppercase tracking-widest drop- truncate max-w-[200px] sm:max-w-md">
                {veiculo.marca} {veiculo.modelo}
              </span>
              <span className="text-white/80 text-[10px] sm:text-xs font-bold tracking-widest uppercase bg-white/10 px-2.5 py-0.5  border border-white/15 backdrop-blur-md">
                {lightboxImageIndex + 1} / {displayImages.length}
              </span>
            </div>

            <button
              onClick={() => setIsLightboxOpen(false)}
 className="h-10 w-10 sm:h-11 sm:w-11  bg-black/60 hover:bg-white hover:text-black text-white flex items-center justify-center transition-all duration-300 border border-white/20 active:scale-95 cursor-pointer  backdrop-blur-md"
              title="Fechar tela cheia"
              aria-label="Fechar visualização em tela cheia"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main Fullscreen Image area: Takes 100% of viewport width and height */}
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden p-0 m-0">
            {/* Left navigation arrow.
                Sempre `displayImages`, nunca `web_full_images` direto: a
                galeria e as miniaturas indexam `displayImages` (whatsapp com
                fallback), e o lightbox lendo o outro array abria a foto errada
                — ou estourava — quando os dois divergiam. */}
            {displayImages.length > 1 && (
              <button
                onClick={() => setLightboxImageIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length)}
 className="absolute left-3 sm:left-6 z-50 h-11 w-11 sm:h-14 sm:w-14  bg-black/50 hover:bg-brand-primary text-white flex items-center justify-center border border-white/20 backdrop-blur-md transition-all duration-300 active:scale-95 cursor-pointer "
                aria-label="Imagem anterior"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}

            {/* Edge-to-Edge Image rendering */}
            <div className="relative w-full h-full max-w-full max-h-full flex items-center justify-center p-0">
              <Image
                src={displayImages[lightboxImageIndex]}
                alt={`${veiculo.marca} ${veiculo.modelo} - Imagem ampliada ${lightboxImageIndex + 1}`}
                fill
 className="object-contain w-full h-full p-2 sm:p-4"
                sizes="100vw"
                priority
              />
            </div>

            {/* Right navigation arrow */}
            {displayImages.length > 1 && (
              <button
                onClick={() => setLightboxImageIndex((prev) => (prev + 1) % displayImages.length)}
 className="absolute right-3 sm:right-6 z-50 h-11 w-11 sm:h-14 sm:w-14  bg-black/50 hover:bg-brand-primary text-white flex items-center justify-center border border-white/20 backdrop-blur-md transition-all duration-300 active:scale-95 cursor-pointer "
                aria-label="Próxima imagem"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Simulador — "Monte sua parcela" ───
          Faixa própria, largura da página, como na tela 03 do design doc.
          Antes vivia dentro da coluna lateral, com o visual antigo. */}
      <section
        id="simulador"
        aria-label="Simulador de financiamento"
        className="mx-auto mt-16 w-full max-w-[1600px] px-[18px] font-modernist md:px-8 print:hidden"
      >
        <CalculadoraFinanciamento
          vehiclePrice={veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original}
          vehicleYear={parseInt(String(veiculo.ano).split('/')[0] || "2020", 10)}
          vehicleName={`${veiculo.marca} ${veiculo.modelo}`}
          onSimulateClick={(msg, simulacaoData) => {
            if (typeof window !== "undefined") {
              setActiveChannel("Simulação de Financiamento");
              setActiveMessage(`${msg} (Ref: ${getActiveAgUid()})`);
              setActiveSimulacao(simulacaoData ? { ...simulacaoData } : null);
              setIsLeadModalOpen(true);
            }
          }}
        />
      </section>

      {/* ─── Também no seu perfil ───
          Fecha a página como no design doc: três do estoque próximos a este,
          no mesmo card do resto do site. */}
      {similares.length > 0 && (
        <section
          aria-label="Veículos semelhantes"
          className="mx-auto mt-16 w-full max-w-[1600px] px-[18px] font-modernist md:px-8 print:hidden"
        >
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-3.5">
            <h2 className="mt-titulo m-0 text-[26px] text-mt-ink lg:text-[32px]">
              Também no seu perfil
            </h2>
            <LinkRegua href="/estoque">VER TODOS</LinkRegua>
          </div>
          <div className="grid gap-x-7 gap-y-9 pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {similares.map((similar) => (
              <CardVeiculo
                key={similar.id}
                veiculo={similar}
                href={getVeiculoPdpUrl(similar)}
                densidade="destaque"
              />
            ))}
          </div>
        </section>
      )}

      {/* Positive Friction Lead Capture Modal */}
      <LeadCaptureModal
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
        vehicleInfo={{
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          ano: veiculo.ano
        }}
      />

      {/* PRINT ONLY FOOTER */}
      <div className="hidden print:flex flex-row justify-between items-center border-t border-zinc-200 pt-4 mt-8 print-avoid-break">
        <div className="text-[9px] text-zinc-500 leading-normal">
          <span className="font-bold text-zinc-700 block uppercase tracking-wider mb-0.5">{companySettings.name}</span>
          <span>{companySettings.address}</span>
          {companySettings.cnpj && <span className="block mt-0.5 font-mono">CNPJ: {companySettings.cnpj}</span>}
        </div>
        <div className="text-right text-[9px] text-zinc-500 leading-normal">
          <span className="font-bold text-zinc-700 block uppercase tracking-wider mb-0.5">Contato & Atendimento</span>
          <span>Tel: {companySettings.phone} • WhatsApp: {companySettings.whatsapp}</span>
          <span className="block mt-0.5">{companySettings.hours.replace(/\n/g, " | ")}</span>
        </div>
      </div>

    </div>
  );
}

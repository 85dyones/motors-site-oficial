"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { QrDaFicha } from "../lib/qrDaFicha";
import FichaImpressa from "./modernist/FichaImpressa";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Veiculo, truncateString, getVeiculoPdpUrl } from "../lib/supabase";
import { modeloEVersaoParaExibir } from "../lib/estoqueTabela";
import { CardVeiculo, LinkRegua } from "./modernist/primitivos";
import { getUtmParameters, getActiveAgUid, getMatchParamsRespeitandoRecusa, sufixoRef, trackVehicleView, trackLeadSubmission, trackContactClick, META_CONTENT_TYPE } from "../lib/telemetry";
import { useTheme } from "../app/ThemeContext";
import { linkWhatsApp, telefoneDoLead } from "../lib/whatsapp";
import { nomeComAno, nomeDoVeiculo } from "../lib/nomeDoVeiculo";
import {
  mensagemDeDuvidas,
  mensagemDeInteresse,
  mensagemDeTestDrive,
  mensagemDeTroca,
} from "../lib/mensagensDoVeiculo";
import { pushFichaTecnica, pushGaleria, pushInicioDeFormulario } from "../lib/dataLayer";
import { ACOES } from "../lib/turnstile";
import type { ParametrosDoFinanciamento } from "../lib/finance-calculator";
// O bloco de laudo pendente é componente próprio, e o porquê está escrito lá:
// é o que deixa a trava RENDERIZAR o texto em vez de garimpá-lo na fonte.
import BlocoLaudoPendente from "./BlocoLaudoPendente";
import PonteDoGuiaDoLaudo from "./PonteDoGuiaDoLaudo";
import RelogioDaChegada from "./RelogioDaChegada";
import SecaoDaFicha from "./ficha/SecaoDaFicha";
import LaudoAprovado from "./ficha/LaudoAprovado";
import TrocaOuTestDrive from "./ficha/TrocaOuTestDrive";
import CompartilharFicha from "./ficha/CompartilharFicha";
import GaleriaEmTelaCheia from "./ficha/GaleriaEmTelaCheia";
import FotoDaFicha from "./ficha/FotoDaFicha";

const LeadCaptureModal = dynamic(() => import("./LeadCaptureModal"), { ssr: false });
const CalculadoraFinanciamento = dynamic(() => import("./CalculadoraFinanciamento"), { ssr: false });


interface PDPClientWrapperProps {
  veiculo: Veiculo;
  /** Três veículos próximos deste, resolvidos no servidor. */
  similares?: Veiculo[];
  /**
   * O carro não está à venda: vendido, ou fora do feed do último sync.
   *
   * Decidido no servidor por `lib/publicacao.ts` e recebido pronto. O
   * componente não recalcula estado de disponibilidade — a mesma regra
   * governa o selo, o `schema.org` e o `noindex`, e ela mora num lugar só.
   */
  indisponivel?: boolean;
  /**
   * O que o selo escreve.
   *
   * "VENDIDO" e "INDISPONÍVEL" não são sinônimos, e a diferença é de honestidade:
   * o feed do RevendaMais some com o carro sem dizer por quê — pode ter ido a
   * repasse, estar reservado ou ter tido o anúncio expirado. Afirmar a venda
   * sem saber é inventar um fato.
   */
  rotuloIndisponivel?: "VENDIDO" | "INDISPONÍVEL" | null;
  /**
   * Caminhos dos hubs perenes desta marca e deste modelo, resolvidos no
   * servidor pelo mesmo slug que monta a URL da ficha.
   *
   * Existem desde 2026-08-25. Antes deles a ficha era um beco: o visitante que
   * quisesse "outro Renegade" só tinha o catálogo inteiro, e o rastreador não
   * tinha caminho da ficha efêmera para uma página que sobrevive à venda do
   * carro. São 39 fichas apontando para os hubs — o link interno que faz a
   * página perene existir na navegação, e não só no sitemap.
   */
  caminhoDaMarca?: string;
  caminhoDoModelo?: string;
  /**
   * O QR do anúncio, já codificado no servidor — `null` quando não há
   * endereço para apontar. Só a impressão o desenha.
   */
  qrDaFicha?: QrDaFicha | null;
  /**
   * As condições do simulador — a vigência de `parametros_financiamento`,
   * lida no servidor. A calculadora não conhece taxa de cabeça.
   */
  parametrosDoFinanciamento: ParametrosDoFinanciamento;
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

export default function PDPClientWrapper({
  veiculo: initialVeiculo,
  similares = [],
  indisponivel: indisponivelDoServidor = false,
  rotuloIndisponivel: rotuloDoServidor = null,
  caminhoDaMarca,
  caminhoDoModelo,
  qrDaFicha = null,
  parametrosDoFinanciamento,
}: PDPClientWrapperProps) {
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

  /**
   * A decisão vem do servidor, mas o override do painel ainda pode chegar
   * depois — `stockOverrides` marca venda no cliente sem que o feed tenha
   * mudado. Por isso o `||`: o servidor manda, e o override só acrescenta.
   */
  const indisponivel = indisponivelDoServidor || veiculo.vendido;
  const rotuloIndisponivel = veiculo.vendido ? "VENDIDO" : rotuloDoServidor ?? "INDISPONÍVEL";

  // O feed grava o modelo com a versão embutida na cauda — sem o corte, o
  // título sai em três linhas e a linha de baixo repete tudo em caixa baixa.
  const { modelo: modeloExibido, versao: versaoExibida } = modeloEVersaoParaExibir(
    veiculo.modelo,
    veiculo.versao,
  );

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
  const carouselRef = useRef<HTMLDivElement>(null);

  const displayImages = veiculo.whatsapp_images && veiculo.whatsapp_images.length > 0
    ? veiculo.whatsapp_images
    : veiculo.web_full_images;

  // A trava de rolagem e o teclado da tela cheia moram em
  // `ficha/GaleriaEmTelaCheia`, que só existe montada enquanto está aberta.

  // Fetch tracking ID from LocalStorage on mount
  useEffect(() => {
    const uid = getActiveAgUid();

    // Dynamic page view logger
    console.log(`[Antigravity Log] PageView iniciada para o veículo: ${veiculo.marca} ${veiculo.modelo} ID: ${veiculo.id}`);

    // Dispara telemetria de visualização do item no GA4/Meta Pixel
    // Os campos além de id/marca/modelo/preço alimentam só o `dataLayer`
    // (`view_vehicle` + espelho de e-commerce): são eles que permitem público
    // de remarketing por carroceria, faixa de preço e câmbio sem novo deploy.
    // O que vai para o GA4 e para o Pixel não mudou.
    const viewEventId = trackVehicleView({
      id: veiculo.id,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      preco: veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original,
      versao: veiculo.versao,
      ano: veiculo.ano,
      quilometragem: veiculo.quilometragem,
      cambio: veiculo.cambio,
      combustivel: veiculo.combustivel,
      tipo: veiculo.tipo,
      cor: veiculo.cor,
      nome: nomeDoVeiculo(veiculo),
      donos: veiculo.donos_anteriores,
      // O laudo está na ficha — não "o carro foi periciado", que vale para
      // todos. Ver a nota em `pushVeiculo`.
      temLaudo: Boolean((veiculo.laudo_pericia ?? "").trim()),
      primeiraVez: veiculo.first_seen_at,
    });

    // Espelha o ViewContent via Conversions API (mesmo event_id = dedup no Meta)
    if (viewEventId) {
      // `viewEventId` já é null na recusa, então aqui só chega quem não se
      // opôs e o valor é o mesmo de `getMatchParams`. A versão com portão fica
      // mesmo assim: se a guarda de cima mudar, a ficha não volta a mandar os
      // identificadores de quem se opôs.
      const { fbp, fbc } = getMatchParamsRespeitandoRecusa();
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
      const ref = sufixoRef();
      setActiveChannel("WhatsApp Proposta");
      // Os textos, e a distinção entre "vendido" e "não está mais disponível",
      // vivem em `lib/mensagensDoVeiculo.ts` — onde dá para testá-los.
      const msg = mensagemDeInteresse(
        veiculo,
        veiculo.vendido ? "vendido" : indisponivel ? "indisponivel" : "a-venda",
        ref,
      );

      setActiveMessage(msg);
      setActiveSimulacao(null);
      setIsLeadModalOpen(true);
    }
  };

  const handleProposalClick = () => {
    if (typeof window !== "undefined") {
      setActiveChannel("WhatsApp Dúvidas");
      const msg = mensagemDeDuvidas(veiculo, sufixoRef());
      setActiveMessage(msg);
      setActiveSimulacao(null);
      setIsLeadModalOpen(true);
    }
  };

  const handleTradeInClick = () => {
    if (typeof window !== "undefined") {
      setActiveChannel("WhatsApp Usado na Troca");
      const msg = mensagemDeTroca(veiculo, sufixoRef());
      setActiveMessage(msg);
      setActiveSimulacao(null);
      setIsLeadModalOpen(true);
    }
  };

  const handleTestDriveClick = () => {
    if (typeof window !== "undefined") {
      setActiveChannel("Agendamento Test-Drive");
      const msg = mensagemDeTestDrive(veiculo, sufixoRef());
      setActiveMessage(msg);
      setActiveSimulacao(null);
      setIsLeadModalOpen(true);
    }
  };

  const handleLeadSubmit = async (leadData: { nome: string; email: string; whatsapp: string; turnstileToken?: string }) => {
    const agUid = getActiveAgUid();
    const utmParams = getUtmParameters();
    const tipoBadge = veiculo.baixa_km ? "BAIXA KM" : (veiculo.unico_dono ? "ÚNICO DONO" : (veiculo.cautelar_100 ? "CAUTELAR 100%" : "BAIXA KM"));

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
    const phoneE164 = telefone.e164;
    const eventId = trackLeadSubmission({
      id: veiculo.id,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      preco: veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original
    }, activeMessage, {
      googleAdsId: companySettings?.googleAdsId,
      googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
      email: leadData.email,
      phoneE164,
      tipoDeLead: "proposta",
      formId: "form-proposta-veiculo",
    });
    const { fbp, fbc } = getMatchParamsRespeitandoRecusa();

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
      // O objeto INTEIRO, não uma cópia campo a campo.
      //
      // Remontá-lo à mão descartava `gclid`, `gbraid`, `wbraid`, `utm_term` e
      // `fbclid` — e este é um dos dois caminhos de maior volume do site. Sem
      // o click id, o lead chega ao CRM sem como voltar à palavra-chave que o
      // gerou, e a conversão offline não tem o que subir. A captura já
      // existia em `getUtmParameters`; o que faltava era não jogar fora aqui.
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
    // `pos_lead`: este clique é a CONSEQUÊNCIA do lead que acabou de ser
    // registrado, não uma intenção nova. Sem a marca, o mesmo envio contaria
    // duas vezes no Ads e o CPA apareceria pela metade.
    trackContactClick("whatsapp", "PDP - Conversão WhatsApp", {
      vehicle_id: veiculo.id,
      vehicle_name: nomeDoVeiculo(veiculo),
      vehicle_price: finalPrice,
      pos_lead: true,
    });
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

  // A régua da ficha: a ÚNICA lista de especificações da página desde a
  // revisão de UI de 29/09 (tarefa 2.3). Até ali havia uma segunda, a
  // "MATRIZ DE ESPECIFICAÇÕES", na coluna da direita, que repetia estas cinco
  // linhas mais marca, modelo e ano. Marca e modelo já estão no título; o ano
  // entrou aqui. Os ícones, que nunca eram desenhados, saíram junto.
  const quickSpecs = [
    { label: "ANO", value: veiculo.ano ? String(veiculo.ano) : "" },
    { label: "QUILOMETRAGEM", value: formatKm(veiculo.quilometragem) },
    { label: "CÂMBIO", value: veiculo.cambio },
    { label: "COMBUSTÍVEL", value: veiculo.combustivel },
    { label: "COR EXTERNA", value: veiculo.cor },
    { label: "CARROCERIA", value: veiculo.tipo },
    // Célula sem dado real sai da régua — mesma regra da vitrine da TV. Desde 2026-08-06 o
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

  /**
   * Abre a galeria em tela cheia e registra a interação.
   *
   * Os três gatilhos de lightbox (foto do carrossel, botão de tela cheia e
   * "ver todas") passavam a mesma dupla de `setState` copiada. Concentrar aqui
   * é o que garante que `view_gallery` saia dos três — e não do que alguém
   * lembrar de instrumentar depois.
   */
  const abrirGaleria = (indice: number) => {
    setLightboxImageIndex(indice);
    setIsLightboxOpen(true);
    pushGaleria(veiculo.id, indice + 1);
  };

  /**
   * `form_start` — o sinal de abandono de formulário.
   *
   * Preso à abertura do modal e não aos cinco botões que a disparam
   * (informações, dúvidas, troca, test-drive, indisponível): o que interessa
   * medir é a intenção declarada, e ela é a mesma nos cinco.
   */
  const formularioJaAnunciado = useRef(false);
  useEffect(() => {
    if (!isLeadModalOpen) {
      formularioJaAnunciado.current = false;
      return;
    }
    // O `veiculo` é derivado dos overrides do painel, que chegam depois do
    // primeiro render: sem esta trava, o modal aberto quando eles chegassem
    // anunciaria `form_start` duas vezes para a mesma intenção.
    if (formularioJaAnunciado.current) return;
    formularioJaAnunciado.current = true;

    pushInicioDeFormulario("form-proposta-veiculo", {
      vehicle_id: veiculo.id,
      vehicle_name: nomeDoVeiculo(veiculo),
      vehicle_price: finalPrice,
    });
  }, [isLeadModalOpen, veiculo, finalPrice]);

  /**
   * "S T270 1.3 Tb 4x4 Flex Aut · 2022 · Curitiba".
   *
   * Sai do mesmo `versaoExibida` que a tela já mostrava — não de `veiculo.versao`
   * cru — para o heading e o card do catálogo continuarem falando a mesma coisa.
   */
  const complementoDoTitulo = [
    versaoExibida ? truncateString(versaoExibida, 45) : "",
    veiculo.ano ? String(veiculo.ano) : "",
    "Curitiba",
  ]
    .filter(Boolean)
    .join(" · ");

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
        {/* Código, marca + modelo no título, versão como subtítulo.
            Padrão alinhado ao da RevendaMais por decisão de 2026-08-20:
            "marca + modelo, especificações abaixo como subtítulo". A marca
            saiu do rótulo para não aparecer duas vezes. */}
        <div className="flex flex-col">
          {veiculo.id && (
            <span className="text-[11px] font-semibold uppercase tracking-[.18em] text-mt-accent">
              {`COD. ${veiculo.id}`}
            </span>
          )}

          {/* Versão, ano e cidade entraram DENTRO do heading em 2026-08-25.
              O <h1> era só "Jeep Renegade" — sem versão, sem ano, sem praça —
              enquanto a linha de versão vivia num <p> logo abaixo, fora dele
              (§0.5.5 item 1 do plano de aquisição). O heading é o segundo campo
              de maior peso on-page depois do <title>, e a busca desta praça é
              geográfica: "renegade usado curitiba", não "renegade".

              O desenho da tela não mudou — o subtítulo continua na mesma
              posição, no mesmo tamanho. Mudou só de elemento, e ganhou o ano e
              a cidade, que o visitante também quer ler. */}
          <HeadingTag className="mt-titulo m-0 mt-2.5 text-[30px] leading-none text-mt-ink lg:text-[40px]">
            <span className="block">
              {veiculo.marca} {modeloExibido}
            </span>
            {/* Texto de verdade entre os dois blocos (2026-09-21). Sem ele o
                `textContent` deste `<h1>` colava modelo e versão —
                "Volkswagen Virtushighline 200 tsi…" —, e é o `textContent` que
                o rastreador lê. Entre duas caixas de bloco o espaço não rende. */}
            {complementoDoTitulo && " "}
            {complementoDoTitulo && (
              <span className="mt-1.5 block text-sm font-normal leading-snug tracking-normal text-mt-neutral-700">
                {complementoDoTitulo}
              </span>
            )}
          </HeadingTag>

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

        {/* Carro em preparação: a contagem até o pátio, antes do preço —
            decisão do dono em 28/09. O preço e o resto da ficha seguem iguais.
            Fora do vendido e do indisponível: contar a chegada de um carro
            que não está à venda é prometer o que não existe (revisão final,
            28/09). A guarda é a mesma do bloco do laudo pendente. */}
        {!indisponivel && <RelogioDaChegada veiculo={veiculo} />}

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
            {indisponivel ? "CONSULTAR SIMILARES" : "FALAR COM O CONSULTOR"}
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

        <CompartilharFicha veiculo={veiculo} precoTexto={formatPrice(finalPrice)} />
      </aside>
    );
  };

  return (
    <div id="pdp-vehicle-root" data-vehicle-id={veiculo.id} data-price={finalPrice} className="flex w-full flex-col bg-mt-bg pb-24 font-modernist text-mt-ink print:pb-0">
      
      {/* A folha A4 — o desenho `Ficha Impressa.dc.html` portado.
          É a única coisa que vai ao papel: o `@media print` esconde o
          resto desta ficha de tela. */}
      <FichaImpressa
        veiculo={veiculo}
        empresa={companySettings}
        fotos={displayImages}
        qr={qrDaFicha}
        modeloExibido={modeloExibido}
        versaoExibida={versaoExibida}
        codigo={getShortVehicleId(veiculo.id)}
      />

      {/* Trilha até os hubs perenes.
          Não é enfeite: é o caminho de volta que a ficha nunca teve. Quem chega
          por busca num Renegade específico e quer ver os outros só tinha o
          catálogo inteiro; e o rastreador não tinha ligação nenhuma entre uma
          URL que morre na venda e uma página que sobrevive a ela. O
          `BreadcrumbList` da página declara exatamente estes mesmos degraus. */}
      {caminhoDaMarca && (
        <nav
          aria-label="Trilha"
          className="mx-auto w-full max-w-[1600px] px-4 pt-4 text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600 md:px-8 print:hidden"
        >
          <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
            HOME
          </Link>{" "}
          /{" "}
          <Link
            href="/estoque"
            className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink"
          >
            ESTOQUE
          </Link>{" "}
          /{" "}
          <Link
            href={caminhoDaMarca}
            className="mt-foco uppercase text-mt-neutral-600 no-underline hover:text-mt-ink"
          >
            {veiculo.marca}
          </Link>
          {caminhoDoModelo && (
            <>
              {" "}
              /{" "}
              <Link
                href={caminhoDoModelo}
                className="mt-foco uppercase text-mt-ink no-underline hover:text-mt-accent"
              >
                {modeloExibido}
              </Link>
            </>
          )}
        </nav>
      )}

      {/* A grade da ficha: galeria e seções à esquerda, preço à direita. */}
      <div className="w-full mx-auto max-w-[1600px] px-0 md:px-8 mt-0 md:mt-4 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start print:grid-cols-1 print:gap-6 print:px-0 print:mt-0">
        
        {/* Left Column: Gallery, Mobile Sidebar, Description, and Accordions (spans 8 cols on lg) */}
        <div className="flex w-full flex-col gap-10 max-sm:gap-8 lg:col-span-7 xl:col-span-8 print:col-span-12">
          
          {/* Gallery block */}
          <section className="w-full flex flex-col gap-3 max-sm:gap-1.5 print:hidden">
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
                    onClick={() => abrirGaleria(index)}
 className="w-full h-full snap-center snap-always flex-shrink-0 relative border-none p-0 m-0 cursor-pointer"
                  >
                    <FotoDaFicha
                      src={imgUrl}
                      alt={`${veiculo.marca} ${veiculo.modelo} - Imagem ${index + 1}`}
                      fill
                      priority={index === 0}
                      fetchPriority={index === 0 ? "high" : "auto"}
 className={`object-cover w-full h-full border-none p-0 m-0 ${indisponivel ? "filter grayscale-[30%] opacity-75" : ""}`}
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
                onClick={() => abrirGaleria(activeImageIndex)}
 className="mt-foco absolute right-0 top-0 z-30 flex h-11 w-11 cursor-pointer items-center justify-center bg-[rgba(20,18,18,.72)] text-mt-inverso transition-colors hover:bg-mt-accent"
                title="Visualizar em tela cheia"
                aria-label="Visualizar fotos do veículo em tela cheia"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0-5.25-5.25" />
                </svg>
              </button>

              {/* Selo de indisponibilidade — "VENDIDO" ou "INDISPONÍVEL" */}
              {indisponivel && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[rgba(20,18,18,.45)]">
                  <div className="mt-etiqueta gap-2.5 px-5 py-3 text-[11px] tracking-[.22em]">
                    <span className="h-2 w-2 bg-mt-accent" aria-hidden="true" />
                    {rotuloIndisponivel}
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
                      <FotoDaFicha
                        src={imgUrl}
                        alt={`${veiculo.marca} ${veiculo.modelo} — miniatura ${index + 1}`}
                        fill
 className="object-cover"
                        sizes="(max-width: 640px) 33vw, 240px"
                      />
                    </button>
                  );
                })}
                {/* Sem `aria-label`: o nome acessível sai do que está escrito
                    ("+12 VER GALERIA") mais o complemento só para o leitor de
                    tela. Com o `aria-label` antigo ("Ver todas as fotos do
                    veículo"), quem usa comando de voz dizia "ver galeria" e o
                    botão não respondia — o nome não continha o texto visível
                    (WCAG 2.5.3, auditoria axe `label-content-name-mismatch`).
                    Um `aria-label` só não resolve: o "+N" muda com a largura
                    da tela, e o texto escondido por CSS sai do nome sozinho. */}
                <button
                  onClick={() => abrirGaleria(0)}
 className="mt-foco grid aspect-[4/3] flex-1 cursor-pointer place-items-center bg-mt-inverso-fundo text-mt-inverso"
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
                    <span className="sr-only">
                      {` — todas as ${displayImages.length} fotos do veículo`}
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

          {/* Descrição. Some quando o feed não traz texto: uma seção com
              título sobre nada é caixa oca, a mesma regra dos opcionais.

              Os títulos da ficha seguem a hierarquia do nome do carro (o `h1`
              da barra mobile, ou o `h2` da barra desktop): as seções — esta,
              os opcionais, o laudo e a troca — são `h2` (em `SecaoDaFicha`),
              e o "laudo aprovado", dentro do laudo, é `h3` (em
              `LaudoAprovado`). Até 2026-09-25 eram
              `h3`, `h4` e `h5`, e o leitor de tela que navega por títulos
              pulava níveis que não existiam (auditoria axe, `heading-order`).
              O tamanho vem das classes, não da tag. */}
          {veiculo.descricao?.trim() && (
          <div className="px-4 md:px-0 print:px-0">
            <SecaoDaFicha titulo="Descrição do veículo">
              {/<[a-z][\s\S]*>/i.test(veiculo.descricao) ? (
                <div
                  className="rich-text-content max-w-[68ch] text-[15px] leading-relaxed text-mt-neutral-800"
                  dangerouslySetInnerHTML={{ __html: veiculo.descricao }}
                />
              ) : (
                <p className="m-0 max-w-[68ch] whitespace-pre-line text-[15px] leading-relaxed text-mt-neutral-800">
                  {veiculo.descricao}
                </p>
              )}
            </SecaoDaFicha>
          </div>
          )}

          {/* Accordion: Opcionais e Acessórios.
              Some quando o feed não traz opcionais — o que hoje é o caso de 87
              dos 88 veículos. Antes, esses 87 exibiam uma lista fabricada
              ("Teto solar, Multimídia, Rodas de liga leve, Câmera de ré");
              manter a seção vazia só trocaria a mentira por uma caixa oca. */}
          {featuresList.length > 0 && (
          <div className="px-4 md:px-0 print:px-0">
            <SecaoDaFicha
              titulo="Opcionais e acessórios"
              recolhivel={{
                aberto: opcionaisOpen,
                idDoCorpo: "ficha-opcionais",
                aoAlternar: () => {
                  if (!opcionaisOpen) pushFichaTecnica(veiculo.id);
                  setOpcionaisOpen(!opcionaisOpen);
                },
              }}
            >
              <ul className="m-0 grid list-none grid-cols-1 gap-x-8 p-0 sm:grid-cols-2">
                {featuresList.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2.5 border-b border-mt-regua-fina py-2.5 text-sm text-mt-neutral-800"
                  >
                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-mt-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </SecaoDaFicha>
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
            <SecaoDaFicha
              titulo="Laudo cautelar"
              recolhivel={{
                aberto: periciaOpen,
                idDoCorpo: "ficha-laudo",
                aoAlternar: () => {
                  if (!periciaOpen) pushFichaTecnica(veiculo.id);
                  setPericiaOpen(!periciaOpen);
                },
              }}
            >
              <LaudoAprovado laudo={veiculo.laudo_pericia}>
                {/* A mesma ponte do bloco pendente: o laudo aprovado diz o
                    RESULTADO, e o guia diz o que o exame cobre. As 33 fichas
                    com laudo publicado (medido em 17/09) ficavam sem nenhum
                    link para a Onda 1. */}
                <PonteDoGuiaDoLaudo className="m-0 text-sm leading-relaxed text-mt-neutral-700" />
              </LaudoAprovado>
            </SecaoDaFicha>
          </div>
          )}

          {/* Laudo ainda não publicado: DIZ ISSO, em vez de calar.
              O bloco acima resolveu não afirmar laudo limpo sobre carro não
              periciado — certo, e continua. Mas o silêncio criou outro
              problema: em 2026-09-03, dezessete dos trinta e seis veículos
              publicados não tinham a perícia marcada como aprovada, e nas
              fichas deles o assunto simplesmente não existia, enquanto a FAQ
              da mesma página prometia "o laudo fica na ficha do carro". Quem
              procurava não achava e não sabia por quê.

              ⚠️ O TEXTO FALA DO LAUDO, NÃO DA PERÍCIA. A primeira versão dizia
              "perícia cautelar em andamento", e estava errada: a perícia É
              feita antes de o veículo entrar na vitrine (confirmado pelo dono
              em 2026-09-04) — o que falta é o RESULTADO chegar, porque o sync
              do RevendaMais não traz o campo. Afirmar "em andamento" sobre um
              exame já concluído é o mesmo erro do bloco acima, invertido:
              inventar estado de processo a partir de ausência de dado.

              Desde 2026-09-08, por decisão do dono, a ficha não promete mais
              publicação: manda PEDIR. O laudo existe desde antes da vitrine e
              fica com a loja — dizer "é publicado aqui assim que aprovado" só
              se cumpria nas fichas em que o feed traz a perícia aprovada; nas
              outras virava espera sem prazo, que é o defeito que este bloco
              veio corrigir. O caminho agora é o vendedor, a qualquer tempo.

              E por isso o bloco passou a olhar `indisponivel` (09/09): "a
              qualquer tempo" é compromisso em aberto, e na ficha de um carro
              VENDIDO — que fica no ar durante a carência — ele ficava ao lado
              de um botão que já diz "CONSULTAR SIMILARES". Prometer laudo de
              carro que saiu do pátio não ajuda ninguém a decidir nada; aqui o
              silêncio é honesto, porque não há mais compra para apoiar. O
              bloco do laudo APROVADO segue aparecendo no vendido: aquele é
              documento que existe e está publicado, não promessa.

              A guarda é `indisponivel`, e ela é MAIS LARGA que "vendido": vale
              também para o carro que sumiu do feed, cujo motivo o próprio
              `publicacao.ts` diz não saber ("pode ser repasse, reserva ou
              anúncio expirado, e o carro pode voltar"). É de propósito, e é a
              mesma régua do CTA logo acima — se a página já parou de vender
              aquele carro, ela também para de prometer atendimento sobre ele.
              Quando o carro volta ao feed, o bloco volta junto. */}
          {!indisponivel && !(veiculo.laudo_pericia && veiculo.pericia === "PERÍCIA APROVADA") && <BlocoLaudoPendente />}

        </div>

        {/* Coluna da direita: a barra do preço (só no desktop) e, embaixo,
            troca e test-drive. A "MATRIZ DE ESPECIFICAÇÕES" que ficava aqui
            saiu em 29/09 (tarefa 2.3): repetia a régua da barra, logo acima,
            linha por linha. A folha impressa não dependia dela — só
            `#ficha-impressa` vai ao papel. */}
        <div className="flex w-full flex-col gap-10 px-4 max-sm:gap-8 lg:col-span-5 lg:px-0 xl:col-span-4 print:hidden">
          <div className="hidden lg:block">
            {renderSidebar(false)}
          </div>

          <TrocaOuTestDrive aoAvaliar={handleTradeInClick} aoAgendar={handleTestDriveClick} />
        </div>

      </div>

      {/* ------------------------------------------------------------------
          5. A BARRA FIXA DO MOBILE
          ------------------------------------------------------------------
          Refeita em 2026-08-31, com o print do dono na mão: *"essa proporção
          dos botões no mobile está poluindo muito o layout, precisamos de um
          ajuste que deixe mais minimalista, como fica na versão desktop"*.

          O que estava errado não era a existência dos dois botões — era eles
          não combinarem em NADA. Quatro divergências somadas, cada uma
          pequena, todas visíveis juntas:

            largura   96px fixos  ×  flex-1        (um espremido, outro imenso)
            altura    py-3        ×  py-[18px]     (36px de diferença no total)
            corpo     11px        ×  13px
            rótulo    quebrado à mão com <br />    (duas linhas contra uma)

          O desktop já resolve o mesmo par logo acima, no bloco "Ações": dois
          botões `flex-1` com o MESMO `py-3.5`, o mesmo `text-[11px]` e o mesmo
          tracking, sem quebra forçada. É essa régua que desce para cá.

          A proporção 1 : 1.8 mantém o WhatsApp como ação dominante — ele é o
          CTA da página — sem espremer o outro num carimbo de 96px. E o
          `minHeight` de 44px continua nos dois: é o alvo mínimo de toque, e
          era a única coisa que os dois já tinham em comum. */}
      <div className="pb-safe fixed bottom-0 left-0 right-0 z-40 flex items-stretch gap-0.5 bg-mt-bg pt-0.5 md:hidden print:hidden">
        <button
          onClick={handleTradeInClick}
          className="mt-btn mt-btn-contorno mt-foco flex-1 justify-center px-3 py-3.5 text-center text-[11px] leading-tight tracking-[.06em]"
          style={{ minHeight: "44px" }}
        >
          USADO NA TROCA
        </button>
        <button
          onClick={handleWhatsappPDPClick}
          className="mt-btn mt-btn-primario mt-foco flex-[1.8] justify-center gap-2 px-3 py-3.5 text-center text-[11px] leading-tight tracking-[.06em]"
          style={{ minHeight: "44px" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
          </svg>
          <span>CHAMAR NO WHATSAPP</span>
        </button>
      </div>

      {/* 6. As fotos em tela cheia. */}
      {isLightboxOpen && (
        <GaleriaEmTelaCheia
          imagens={displayImages}
          indice={lightboxImageIndex}
          aoMudar={setLightboxImageIndex}
          aoFechar={() => setIsLightboxOpen(false)}
          nome={`${veiculo.marca} ${modeloExibido}`}
        />
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
          vehicleId={veiculo.id}
          vehiclePrice={veiculo.preco_promocional > 0 ? veiculo.preco_promocional : veiculo.preco_original}
          vehicleYear={parseInt(String(veiculo.ano).split('/')[0] || "2020", 10)}
          vehicleName={nomeComAno(veiculo)}
          parametros={parametrosDoFinanciamento}
          onSimulateClick={(msg, simulacaoData) => {
            if (typeof window !== "undefined") {
              // Sem simulação (carro que os bancos parceiros não financiam, e a
              // calculadora oferece o consultor): o lead é pergunta sobre
              // pagamento, não simulação — e o painel não deve ler outra coisa.
              setActiveChannel(simulacaoData ? "Simulação de Financiamento" : "WhatsApp Dúvidas");
              setActiveMessage(`${msg}${sufixoRef()}`);
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
        action={ACOES.pdp}
        isOpen={isLeadModalOpen}
        onClose={() => setIsLeadModalOpen(false)}
        onSubmit={handleLeadSubmit}
        vehicleInfo={{
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          versao: veiculo.versao,
          ano: veiculo.ano
        }}
      />

    </div>
  );
}

"use client";

import { useState, type CSSProperties } from "react";

import { useTheme } from "../../app/ThemeContext";
import { getActiveAgUid, getUtmParameters, trackLeadSubmission } from "../../lib/telemetry";
import { generateEventId, getMatchParams } from "../../lib/tracking-identity";
import { linkWhatsApp, telefoneDoLead } from "../../lib/whatsapp";
import { ACOES } from "../../lib/turnstile";
import { montarLeadDeCampanha, mensagemDaCampanha } from "../../lib/leadDeCampanha";
import type { Campanha } from "../../lib/campanhas";
import LeadCaptureModal from "../LeadCaptureModal";

/**
 * O CTA das landing pages de campanha.
 *
 * UM CTA por página, ancorado em quantos pontos o design quiser — é o mesmo
 * botão e o mesmo modal, não destinos diferentes. Decisão do dono em 08/09.
 *
 * O lead entra sem `veiculo_id`: numa campanha não existe "o veículo", e o
 * consultor descobre o carro na conversa. O custo foi aceito explicitamente —
 * a CAPI vai sem `content_ids`.
 *
 * **Por que modal e não `<a href="wa.me">`:** o link solto troca captura com
 * contexto por link genérico — sem lead gravado, sem Turnstile, sem Pixel/CAPI
 * e sem UTM. A PDP já perdeu isso uma vez.
 *
 * A ordem do envio importa e não é estilo: grava o lead, DEPOIS conta a
 * conversão, DEPOIS abre o WhatsApp. Contar antes infla a métrica com quem
 * desistiu no meio e ensina o Ads a comprar esse clique.
 */
export default function CtaDeCampanha({
  campanha,
  rotulo,
  className,
  style,
}: {
  campanha: Campanha;
  rotulo?: string;
  className?: string;
  /**
   * Cor do botão por `style`, e não por classe arbitrária do Tailwind.
   * `bg-[#EC3013]` chega ao elemento mas a regra CSS pode não ser gerada — já
   * aconteceu neste repositório, e o sintoma é uma classe presente sem efeito
   * nenhum, com as vizinhas funcionando.
   */
  style?: CSSProperties;
}) {
  const { companySettings } = useTheme();
  const [aberto, setAberto] = useState(false);

  async function enviar(lead: {
    nome: string;
    email: string;
    whatsapp: string;
    turnstileToken: string;
  }) {
    // Gerado ANTES do POST para o pixel do navegador e a CAPI do servidor
    // compartilharem o mesmo id — é o que deduplica o evento no Meta.
    const eventId = generateEventId("Lead");
    const { fbp, fbc } = getMatchParams();

    const corpo = montarLeadDeCampanha(lead, campanha, {
      agUid: getActiveAgUid(),
      eventId,
      turnstileToken: lead.turnstileToken,
      utm: getUtmParameters(),
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      fbp,
      fbc,
    });

    // Nunca bloqueia: o visitante está a caminho do WhatsApp, e falha de
    // gravação nossa não pode segurá-lo. Perder o registro é ruim; travar o
    // contato é pior.
    try {
      const resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      /*
       * 403 é o token do Turnstile recusado — expirado, ou reenviado depois de
       * gasto. Nada foi persistido: sem linha em `leads`, sem UTM, sem
       * `ag_uid`, sem n8n e sem CAPI.
       *
       * Engolir aqui e seguir contaria uma conversão FANTASMA no Ads e no Meta,
       * em tráfego pago, para um lead que não existe em lugar nenhum — e
       * contradiria o docblock acima. Lançar devolve o controle ao
       * `LeadCaptureModal`, que descarta o token, remonta o desafio e diz ao
       * visitante o que houve. É o que `EncomendaDeCarro` faz no mesmo caso.
       */
      if (resposta.status === 403) {
        throw new Error("turnstile-recusado");
      }
      if (!resposta.ok) {
        console.warn("[CtaDeCampanha] /api/leads recusou (não bloqueante):", resposta.status);
      }
    } catch (erro) {
      if (erro instanceof Error && erro.message === "turnstile-recusado") throw erro;
      // Falha de REDE continua não bloqueando: o visitante está a caminho do
      // WhatsApp, e perder o registro é ruim, mas travar o contato é pior.
      console.warn("[CtaDeCampanha] rede falhou (não bloqueante):", erro);
    }

    const telefone = telefoneDoLead(lead.whatsapp);
    trackLeadSubmission({ marca: campanha.nome, modelo: "Campanha", preco: 0 }, corpo.mensagem, {
      presetEventId: eventId,
      googleAdsId: companySettings?.googleAdsId,
      googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
      phoneE164: telefone.e164,
      // "contato", e não um valor novo. `TipoDeLead` tem cinco literais, e os
      // cinco estão DOCUMENTADOS em `TRACKING_SPEC.md` como o contrato de
      // `lead_type`. Acrescentar um sexto é permitido pela regra 7 (adição, não
      // renomeação), mas obrigaria a mexer no doc e no container do GTM — o que
      // não se faz quatro dias antes de a campanha começar. O lead de campanha
      // é um contato sem veículo, que é o que "contato" descreve.
      //
      // A granularidade não se perde: `form_id` chega ao dataLayer com o slug,
      // e o banco guarda `canal` com o nome da campanha.
      tipoDeLead: "contato",
      formId: `form-${campanha.slug}`,
    });

    setAberto(false);
    window.open(
      linkWhatsApp(companySettings, mensagemDaCampanha(campanha)),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={className} style={style}>
        {rotulo ?? `Quero as condições do ${campanha.nome}`}
      </button>
      <LeadCaptureModal
        isOpen={aberto}
        onClose={() => setAberto(false)}
        onSubmit={enviar}
        action={ACOES.campanha}
      />
    </>
  );
}

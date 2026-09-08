"use client";

import { useState } from "react";

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
}: {
  campanha: Campanha;
  rotulo?: string;
  className?: string;
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
      if (!resposta.ok) {
        console.warn("[CtaDeCampanha] /api/leads recusou (não bloqueante):", resposta.status);
      }
    } catch (erro) {
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
      <button type="button" onClick={() => setAberto(true)} className={className}>
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

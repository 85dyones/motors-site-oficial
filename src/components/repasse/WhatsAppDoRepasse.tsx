"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useTheme } from "../../app/ThemeContext";
import { pushInicioDeFormulario } from "../../lib/dataLayer";
import {
  FORM_DO_WHATSAPP,
  VEICULO_DA_PERGUNTA,
  montarLeadDoWhatsApp,
  type CarroDoWhatsApp,
} from "../../lib/leadDoRepasse";
import type { WhatsappDaLoja } from "../../lib/loteDoRepasse";
import {
  mensagemDePerguntaDoRepasse,
  mensagemDoRepasse,
  type EstadoDoRepasseNaMensagem,
} from "../../lib/mensagensDoVeiculo";
import { nomeDoVeiculo } from "../../lib/nomeDoVeiculo";
import {
  getActiveAgUid,
  getMatchParamsRespeitandoRecusa,
  getUtmParameters,
  rastreamentoRecusado,
  sufixoRef,
  trackContactClick,
  trackLeadSubmission,
} from "../../lib/telemetry";
import { generateEventId } from "../../lib/tracking-identity";
import { ACOES } from "../../lib/turnstile";
import { linkWhatsApp, numeroDaLoja, telefoneDoLead } from "../../lib/whatsapp";
import { IconeWhatsApp } from "../modernist/primitivos";

const LeadCaptureModal = dynamic(() => import("../LeadCaptureModal"), { ssr: false });

/** O carro do botão, com o estado que escolhe a mensagem; `null` é a pergunta sem carro. */
export type AssuntoDoWhatsApp = { carro: CarroDoWhatsApp; estado: EstadoDoRepasseNaMensagem } | { carro: null };

const assinarNada = () => () => {};
const noNavegador = () => true;
const noServidor = () => false;

/**
 * Todo botão de WhatsApp do repasse (pedido do dono em 28/09): "ao clicar no
 * botão 'quero este repasse', o mecanismo precisa funcionar exatamente como o
 * 'falar com o consultor': abrir a tela de pré-cadastro e depois ir para o
 * WhatsApp, mantendo as particularidades de cada um, mas com o mesmo padrão
 * de entrada".
 *
 * O padrão de entrada é o da ficha do estoque: o botão abre o
 * `LeadCaptureModal` (o mesmo, carregado à parte), o envio grava o lead e só
 * então o WhatsApp abre. As particularidades são do repasse: a mensagem
 * (`mensagemDoRepasse`, com "Ref.: repasse 3f9a1c", ou a da pergunta), o
 * canal `repasse-whatsapp`, a ação `ACOES.repasse` do captcha e nenhum id de
 * repasse na medição — ele não existe em catálogo nenhum (`repasse-sem-view-item`).
 *
 * **Por que botão e não `<a href>` para o WhatsApp:** o link solto troca
 * captura com contexto por link genérico — sem lead gravado, sem Turnstile,
 * sem o Lead no Pixel e na CAPI. Era o que o repasse fazia até aqui.
 *
 * A ordem do envio é a do CTA de campanha: grava o lead, DEPOIS conta a
 * conversão, DEPOIS abre o WhatsApp — com o `eventId` gerado antes do POST,
 * para o Pixel e a CAPI deduplicarem. E o POST NUNCA bloqueia: falhou, avisa
 * no console e o WhatsApp abre do mesmo jeito. Perder o registro é ruim;
 * travar o contato é pior.
 *
 * O modal sai num portal no `<body>`, e não aqui dentro: a barra fixa do
 * celular é `fixed z-40`, e um `z-[9999]` preso dentro dela ficaria por baixo
 * do cabeçalho (`sticky z-50`), com o botão de fechar escondido. Só monta no
 * navegador — no servidor não há `document`, e o modal nem é desenhado.
 *
 * Sem número da loja, sem botão: o que o link vazio já fazia.
 */
export default function WhatsAppDoRepasse({
  assunto,
  whatsappDaLoja,
  origem,
  className = "mt-btn mt-btn-primario mt-foco",
  children,
}: {
  assunto: AssuntoDoWhatsApp;
  /** Só o número — nunca o `companySettings` inteiro na ilha. */
  whatsappDaLoja: WhatsappDaLoja;
  /** O ponto de origem no relatório: `repasse-ficha`, `repasse-barra`, `repasse-card`, `repasse-perguntas`. */
  origem: string;
  className?: string;
  children: ReactNode;
}) {
  const { companySettings } = useTheme();
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const montado = useSyncExternalStore(assinarNada, noNavegador, noServidor);

  if (!numeroDaLoja(whatsappDaLoja)) return null;

  const carro = assunto.carro;
  // O que a medição sabe do carro: nome e preço. O id do repasse fica de fora
  // de propósito — no Pixel ele viraria id de catálogo de um carro que o
  // catálogo não tem.
  const noRelatorio = carro ? { vehicle_name: nomeDoVeiculo(carro), vehicle_price: carro.preco } : {};

  function abrir() {
    // O `ref` do rastreio é lido no clique, como na ficha do estoque: ele pode
    // ser gravado depois da montagem da página, e o valor fresco é o que viaja.
    const ref = sufixoRef();
    setMensagem(assunto.carro !== null ? mensagemDoRepasse(assunto.carro, assunto.estado, ref) : mensagemDePerguntaDoRepasse(ref));
    pushInicioDeFormulario(FORM_DO_WHATSAPP, noRelatorio);
    setAberto(true);
  }

  async function enviar(lead: { nome: string; email: string; whatsapp: string; turnstileToken: string }) {
    // Gerado ANTES do POST para o pixel do navegador e a CAPI do servidor
    // compartilharem o mesmo id. Só para quem não se opôs em /privacidade:
    // `/api/leads` espelha o Lead na CAPI sempre que recebe `eventId`.
    const eventId = rastreamentoRecusado() ? null : generateEventId("Lead");
    const { fbp, fbc } = getMatchParamsRespeitandoRecusa();
    const agUid = getActiveAgUid();

    const corpo = montarLeadDoWhatsApp(
      carro,
      { nome: lead.nome, email: lead.email, whatsapp: lead.whatsapp, mensagem, caminho: window.location.pathname },
      {
        agUid,
        eventId,
        turnstileToken: lead.turnstileToken,
        utm: getUtmParameters(),
        eventSourceUrl: window.location.href,
        fbp,
        fbc,
      },
    );

    // Nunca bloqueia, nem no 403 do captcha: o visitante está a caminho do
    // WhatsApp, como na ficha do estoque.
    try {
      const resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!resposta.ok) {
        console.warn("[WhatsAppDoRepasse] /api/leads recusou (não bloqueante):", resposta.status);
      }
    } catch (erro) {
      console.warn("[WhatsAppDoRepasse] rede falhou (não bloqueante):", erro);
    }

    const telefone = telefoneDoLead(lead.whatsapp);
    trackLeadSubmission(
      carro ? { marca: carro.marca, modelo: carro.modelo, preco: carro.preco } : { ...VEICULO_DA_PERGUNTA, preco: 0 },
      mensagem,
      {
        // Na recusa, `eventId` é null: a função gera um id só para o
        // `dataLayer` e volta antes de disparar qualquer coisa.
        presetEventId: eventId ?? undefined,
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        email: lead.email,
        phoneE164: telefone.e164,
        // Tipos que o funil já conhece (`TipoDeLead`): o carro é "proposta",
        // como o mesmo botão da ficha do estoque; a pergunta sem carro é
        // "contato", como o CTA de campanha.
        tipoDeLead: carro ? "proposta" : "contato",
        formId: FORM_DO_WHATSAPP,
      },
    );

    // O histórico que o modal lê para vir preenchido na próxima vez — o mesmo
    // da ficha do estoque. Só o contato: o carro não entra.
    try {
      const bruto = localStorage.getItem("ag_leads_history");
      const lido: unknown = bruto ? JSON.parse(bruto) : [];
      const historico = Array.isArray(lido) ? lido : [];
      historico.push({
        agUid,
        timestamp: new Date().toISOString(),
        tipoLead: "lead_whatsapp_repasse",
        cliente: { nome: lead.nome, email: lead.email, whatsapp: lead.whatsapp },
      });
      localStorage.setItem("ag_leads_history", JSON.stringify(historico));
    } catch (erro) {
      console.warn("[WhatsAppDoRepasse] histórico do lead não gravado:", erro);
    }

    // `pos_lead`: este clique é a CONSEQUÊNCIA do lead que acabou de ser
    // registrado, não uma intenção nova. Sem a marca, o mesmo envio contaria
    // duas vezes no Ads.
    trackContactClick("whatsapp", origem, { ...noRelatorio, pos_lead: true });
    window.open(linkWhatsApp(whatsappDaLoja, mensagem), "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button type="button" onClick={abrir} className={className}>
        <IconeWhatsApp size={17} />
        {children}
      </button>
      {montado &&
        createPortal(
          <LeadCaptureModal
            isOpen={aberto}
            onClose={() => setAberto(false)}
            onSubmit={enviar}
            action={ACOES.repasse}
            vehicleInfo={carro ? { marca: carro.marca, modelo: carro.modelo, versao: carro.versao, ano: carro.ano_modelo } : undefined}
          />,
          document.body,
        )}
    </>
  );
}

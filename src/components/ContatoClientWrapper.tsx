"use client";

import { useState, useEffect } from "react";
import { getActiveAgUid, getUtmParameters, trackLeadSubmission } from "../lib/telemetry";
import { generateEventId, getMatchParams } from "../lib/tracking-identity";
import { useTheme } from "../app/ThemeContext";

export default function ContatoClientWrapper() {
  const { webhooks, companySettings } = useTheme();
  const [agUid, setAgUid] = useState("ag_ref_nao_localizado");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  // Fetch tracking ID on mount
  useEffect(() => {
    const uid = getActiveAgUid();
    setAgUid(uid);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) return;

    setStatus("sending");

    const utmParams = getUtmParameters();
    // Gerado antes do POST para poder ser reaproveitado no pixel do browser
    // (que só dispara depois de confirmado o sucesso, mais abaixo) — mesmo
    // event_id nos dois lados garante a deduplicação no Meta.
    const eventId = generateEventId("Lead");
    const { fbp, fbc } = getMatchParams();

    const payload = {
      agUid,
      timestamp: new Date().toISOString(),
      tipo: "contato_mensagem",
      canal: "Formulário Contato",
      mensagem: message,
      cliente: {
        nome: name,
        email,
        whatsapp: phone
      },
      utm: utmParams,
      intencao_busca: {},
      eventId,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      fbp,
      fbc
    };

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn("[Contato] API retornou erro:", errorData?.error || response.status);
        setStatus("error");
        return;
      }

      // Dispara telemetria de conversão (Lead) no GA4/Meta Pixel, reaproveitando o event_id
      const phoneDigits = phone.replace(/\D/g, "");
      const phoneE164 = phoneDigits ? `+${phoneDigits.length === 10 || phoneDigits.length === 11 ? `55${phoneDigits}` : phoneDigits}` : null;
      trackLeadSubmission({ marca: "Contato", modelo: "Formulário Geral", preco: 0 }, message, {
        presetEventId: eventId,
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        email,
        phoneE164
      });

      setStatus("success");
      // Clear inputs
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
    } catch (error) {
      console.error("[Contato] Falha de conexão ao enviar lead:", error);
      setStatus("error");
    }
  };

  /* Campo em régua: rótulo em versalete, linha de 1px, sem caixa nem raio. */
  const campo = "border-b border-mt-regua-fina py-3.5";
  const rotulo =
    "block text-[10px] font-semibold tracking-[.14em] text-mt-neutral-600 mb-1.5";

  return (
    <div className="w-full font-modernist">
      {status === "success" ? (
        <div className="border-t-2 border-mt-regua py-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-2 w-2 bg-mt-accent" aria-hidden="true" />
            <span className="text-[10px] font-semibold tracking-[.16em] text-mt-accent">
              MENSAGEM RECEBIDA
            </span>
          </div>
          <h3 className="mt-titulo m-0 text-[28px]">Um consultor vai te chamar.</h3>
          <p className="m-0 mt-3 max-w-[420px] text-[14px] leading-relaxed text-mt-neutral-800">
            Suas informações foram enviadas ao nosso fluxo de atendimento. O
            contato costuma sair no WhatsApp em poucos minutos.
          </p>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="mt-btn mt-btn-contorno mt-foco mt-7"
          >
            ENVIAR NOVA MENSAGEM
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col">
          {status === "error" && (
            <div
              role="alert"
              className="mb-5 border-2 border-mt-accent bg-mt-accent-100 px-4 py-3 text-[13px] leading-relaxed text-mt-accent-800"
            >
              Não foi possível enviar sua mensagem agora. Tente novamente ou fale
              com a gente pelo WhatsApp.
            </div>
          )}

          <div className="border-t-2 border-mt-regua">
            <div className={campo}>
              <label htmlFor="name-input" className={rotulo}>
                NOME
              </label>
              <input
                id="name-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como podemos te chamar"
                className="mt-campo mt-foco"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
              <div className={campo}>
                <label htmlFor="email-input" className={rotulo}>
                  E-MAIL
                </label>
                <input
                  id="email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="mt-campo mt-foco"
                />
              </div>
              <div className={campo}>
                <label htmlFor="phone-input" className={rotulo}>
                  WHATSAPP
                </label>
                <input
                  id="phone-input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(41) 00000-0000"
                  className="mt-campo mt-foco"
                />
              </div>
            </div>

            <div className={campo}>
              <label htmlFor="msg-input" className={rotulo}>
                O QUE VOCÊ PROCURA
              </label>
              <textarea
                id="msg-input"
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="SUV automático até R$ 350 mil, por exemplo"
                className="mt-campo mt-foco resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={status === "sending"}
            className="mt-btn mt-btn-primario mt-foco mt-7 w-max"
          >
            {status === "sending" ? (
              <>
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin border-2 border-white/30 border-t-white"
                  aria-hidden="true"
                />
                ENVIANDO...
              </>
            ) : (
              "ENVIAR MENSAGEM"
            )}
          </button>
        </form>
      )}
    </div>
  );
}

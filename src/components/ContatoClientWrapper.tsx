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

  return (
    <div className="w-full max-w-xl mx-auto animate-fadeIn">
      <div className="bg-brand-card border border-brand-card-border rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_var(--brand-shadow)] relative overflow-hidden transition-all duration-300">
        {/* Soft Gold glow background */}
        <div className="absolute -left-12 -top-12 h-24 w-24 rounded-full bg-brand-primary/5 blur-xl pointer-events-none" />

        {status === "success" ? (
          <div className="flex flex-col items-center text-center py-8 animate-fadeIn">
            <div className="h-12 w-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-full flex items-center justify-center mb-4 text-xl font-bold">
              ✓
            </div>
            <h3 className="text-base font-bold text-brand-text uppercase tracking-wider">
              Mensagem Recebida!
            </h3>
            <p className="text-xs text-brand-text/50 max-w-xs mt-2 leading-relaxed font-light">
              Obrigado por entrar em contato. Suas informações foram enviadas ao nosso fluxo n8n e um consultor fará contato via WhatsApp em poucos minutos.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-6 text-[10px] font-bold uppercase tracking-widest text-brand-primary hover:text-brand-primary-hover transition-colors underline"
            >
              Enviar Nova Mensagem
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {status === "error" && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-[11px] font-medium leading-relaxed px-4 py-3 rounded-xl">
                Não foi possível enviar sua mensagem agora. Tente novamente ou fale com a gente pelo WhatsApp.
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name-input" className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                Nome Completo
              </label>
              <input
                id="name-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="EX: CRISTIANO RONALDO"
                className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl focus:border-brand-primary text-xs outline-none uppercase font-thin tracking-wider transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email-input" className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                  E-mail
                </label>
                <input
                  id="email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="EX: CONTATO@DOMINIO.COM"
                  className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl focus:border-brand-primary text-xs outline-none uppercase font-thin tracking-wider transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone-input" className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                  WhatsApp / Celular
                </label>
                <input
                  id="phone-input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="EX: (11) 99999-9999"
                  className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl focus:border-brand-primary text-xs outline-none uppercase font-thin tracking-wider transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="msg-input" className="text-[9px] font-bold text-brand-text/40 uppercase tracking-widest">
                Mensagem
              </label>
              <textarea
                id="msg-input"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="EX: GOSTARIA DE RECEBER DETALHES DE FINANCIAMENTO E OPÇÕES DE PORSCHE 911 NO ESTOQUE..."
                className="w-full p-3.5 bg-brand-bg text-brand-text placeholder-brand-text/30 border border-brand-card-border rounded-xl focus:border-brand-primary text-xs outline-none resize-none uppercase font-thin tracking-wider transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={status === "sending"}
              className={`w-full h-12 bg-gradient-to-r from-brand-primary to-brand-primary-hover text-white font-extrabold text-[11px] uppercase tracking-widest rounded-xl shadow-md hover:opacity-95 active:scale-95 transition-all duration-200 mt-2 flex items-center justify-center gap-1.5 ${
                status === "sending" ? "opacity-75 cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              {status === "sending" ? (
                <>
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  ENVIANDO...
                </>
              ) : (
                "ENVIAR MENSAGEM"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

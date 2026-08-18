"use client";

import { useState, useEffect } from "react";
import Turnstile from "./Turnstile";

export interface LeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (leadData: { nome: string; email: string; whatsapp: string; turnstileToken: string }) => Promise<void>;
  initialNome?: string;
  initialWhatsapp?: string;
  vehicleInfo?: {
    marca: string;
    modelo: string;
    ano?: string | number;
  };
}

export default function LeadCaptureModal({
  isOpen,
  onClose,
  onSubmit,
  initialNome = "",
  initialWhatsapp = "",
  vehicleInfo
}: LeadCaptureModalProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Sync initial values and load history for background variables (email, phone)
  useEffect(() => {
    if (isOpen) {
      setNome(initialNome);
      setWhatsapp(initialWhatsapp);
      setEmail("");
      setErrorMsg("");
      setTurnstileToken("");
      setLoading(false);

      // Load existing details from history in localStorage to enrich payload where possible
      try {
        const rawHistory = localStorage.getItem("ag_leads_history");
        if (rawHistory) {
          const history = JSON.parse(rawHistory);
          if (Array.isArray(history) && history.length > 0) {
            const latest = history[history.length - 1];
            if (latest?.cliente) {
              if (!initialNome && latest.cliente.nome) setNome(latest.cliente.nome);
              if (!initialWhatsapp && latest.cliente.whatsapp) setWhatsapp(latest.cliente.whatsapp);
              if (latest.cliente.email) setEmail(latest.cliente.email);
            }
          }
        }
      } catch (e) {
        console.warn("[Modal] Failed to read from leads history:", e);
      }
    }
  }, [isOpen, initialNome, initialWhatsapp]);

  // Lock body scroll while the modal is open (same pattern as the PDP lightbox)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isNameValid = nome.trim().length >= 2;

  // On touch/narrow viewports the virtual keyboard plus the card height push
  // the submit button out of view — only steal focus where a physical
  // keyboard is the norm.
  const shouldAutoFocus =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: fine)").matches &&
    window.innerWidth >= 768;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!isNameValid) {
      setErrorMsg("Por favor, digite seu nome.");
      return;
    }

    if (!turnstileToken) {
      setErrorMsg("Aguardando validação de segurança Turnstile...");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        nome: nome.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        turnstileToken
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Ocorreu um erro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-title"
    >
      {/* Modal Card - Styled like a premium WhatsApp prompt */}
      <div 
        className="relative w-full max-w-sm max-h-[calc(100dvh-2rem)] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-y-auto overscroll-contain flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* WhatsApp-Style Header */}
        <div className="sticky top-0 z-10 bg-[#075E54] p-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            {/* Avatar block */}
            <div className="relative h-10 w-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/10">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white/80">
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
              </svg>
              {/* Online pulse green badge */}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#25D366] border-2 border-[#075E54]" />
            </div>

            <div className="flex flex-col">
              <span id="lead-modal-title" className="text-sm font-bold text-white tracking-tight leading-tight">Motors Store</span>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors duration-200 h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 cursor-pointer"
            aria-label="Fechar modal"
            disabled={loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-4 bg-zinc-950">
          {vehicleInfo && (
            <div className="bg-[#075E54]/10 border border-[#075E54]/20 rounded-lg p-2.5 text-[11px] text-[#25D366] font-medium">
              Interesse no veículo: <strong className="text-white font-bold">{vehicleInfo.marca} {vehicleInfo.modelo} {vehicleInfo.ano ? `(${vehicleInfo.ano})` : ""}</strong>
            </div>
          )}

          <p className="text-xs text-zinc-300 font-medium leading-relaxed">
            Olá! Para iniciar sua conversa com nossos consultores no WhatsApp, por favor informe o seu nome:
          </p>

          <form
            onSubmit={handleFormSubmit}
            toolname="solicitar_atendimento_whatsapp"
            tooldescription="Registra o nome do cliente interessado para iniciar o contato direto no WhatsApp com a equipe da Motors Store."
            className="flex flex-col gap-4"
          >
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold px-3 py-2.5 rounded-xl flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Name Input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lead-name-input" className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">
                Seu Nome Completo
              </label>
              <input
                id="lead-name-input"
                type="text"
                required
                autoFocus={shouldAutoFocus}
                disabled={loading}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Digite seu nome..."
                className="w-full h-11 px-4 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 transition-all duration-300 outline-none focus:border-[#25D366] focus:bg-zinc-900/50"
                toolparamdescription="Nome completo do cliente interessado para iniciar a negociação."
              />
            </div>

            {/* Cloudflare Turnstile Verification */}
            <Turnstile onSuccess={(token) => setTurnstileToken(token)} />

            {/* WhatsApp Green Action Button */}
            <button
              type="submit"
              disabled={loading || !isNameValid || !turnstileToken}
              className={`w-full h-12 rounded-xl text-white font-bold uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all duration-300 mt-2 border border-transparent ${
                !isNameValid || !turnstileToken
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : loading
                  ? "bg-[#25D366]/80 text-white cursor-wait"
                  : "bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 shadow-[0_4px_15px_rgba(37,211,102,0.25)] hover:shadow-[0_4px_20px_rgba(37,211,102,0.35)] cursor-pointer"
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Redirecionando...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-4 h-4">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                  </svg>
                  <span>Iniciar Conversa</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

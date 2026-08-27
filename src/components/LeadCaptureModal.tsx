"use client";

import { useState, useEffect, useRef } from "react";
import Turnstile, { type TurnstileHandle } from "./Turnstile";
import { mascararTelefone, normalizarNumero } from "../lib/whatsapp";
import { IconeWhatsApp } from "./modernist/primitivos";

export interface LeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (leadData: { nome: string; email: string; whatsapp: string; turnstileToken: string }) => Promise<void>;
  /**
   * A superfície que abriu o modal — `pdp`, `carmatch`, `popup`,
   * `avaliacao_whatsapp`. Vai para o widget como `action` e volta assinada pela
   * Cloudflare, para o servidor conferir. Obrigatória de propósito: superfície
   * nova que esquecer de passar não compila, em vez de nascer sem conferência.
   * Os valores moram em `lib/turnstile.ts`.
   */
  action: string;
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
  action,
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
  const turnstileRef = useRef<TurnstileHandle>(null);

  // Sync initial values and load history for background variables (email, phone)
  useEffect(() => {
    if (isOpen) {
      setNome(initialNome);
      setWhatsapp(mascararTelefone(initialWhatsapp));
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
              if (!initialWhatsapp && latest.cliente.whatsapp)
                setWhatsapp(mascararTelefone(latest.cliente.whatsapp));
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

  // Fixo com DDD (10) ou celular (11). A mesma faixa que `telefoneDoLead`
  // aceita — abaixo dela o lead chegaria ao CRM com `remoteJid` inválido, que
  // é pior do que chegar sem telefone.
  const digitosDoTelefone = normalizarNumero(whatsapp);
  const isPhoneValid = digitosDoTelefone.length === 10 || digitosDoTelefone.length === 11;

  // O e-mail é opcional: só atrapalha se estiver preenchido e torto. Regra
  // permissiva de propósito — campo opcional que barra envio custa lead.
  const isEmailValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

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

    if (!isPhoneValid) {
      setErrorMsg("Informe um WhatsApp com DDD — (41) 90000-0000.");
      return;
    }

    if (!isEmailValid) {
      setErrorMsg("O e-mail parece incompleto. Corrija ou deixe em branco.");
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
      // Token do Turnstile é de uso único: o `onSubmit` acima já o gastou no
      // siteverify, mesmo tendo falhado depois. Sem descartar e pedir outro, o
      // próximo clique reenviaria o mesmo token queimado, a Cloudflare
      // responderia `timeout-or-duplicate`, e o visitante ficaria preso num
      // "Falha na verificação de segurança" que nenhuma tentativa resolve.
      setTurnstileToken("");
      turnstileRef.current?.reset();
      setErrorMsg(err.message || "Ocorreu um erro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-mt-inverso-fundo/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-title"
    >
      {/* Cartão na linguagem Modernist (2026-08-22). A versão anterior imitava
          um chat escuro de WhatsApp — casca de antes do redesign, alienígena em
          qualquer tela do site atual. O que fica da ideia: cabeçalho invertido
          (bloco escuro é recurso do sistema) e o indicador "online" com o pulso
          do DS. Sombra permitida aqui: overlay é a elevação de topo. */}
      <div
        className="relative flex w-full max-w-sm max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto overscroll-contain border-t-4 border-mt-accent bg-mt-bg shadow-[var(--mt-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho invertido — quem atende, e o sinal de que há gente agora */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-mt-inverso-fundo px-5 py-4 text-mt-inverso">
          <div className="flex flex-col gap-1">
            <span className="mt-rotulo text-mt-inverso-suave">Atendimento no WhatsApp</span>
            <span id="lead-modal-title" className="text-[15px] font-extrabold leading-tight tracking-[-.01em]">
              Motors Store
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[.08em] text-mt-inverso-suave">
              <span className="mt-pulso h-1.5 w-1.5 bg-mt-accent" aria-hidden="true" />
              ONLINE AGORA
            </span>
          </div>

          <button
            onClick={onClose}
            className="mt-foco flex h-10 w-10 cursor-pointer items-center justify-center border border-mt-inverso-regua-fina text-mt-inverso-suave transition-colors duration-200 hover:text-mt-inverso"
            aria-label="Fechar modal"
            disabled={loading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Corpo */}
        <div className="flex flex-col gap-4 p-6">
          {vehicleInfo && (
            <div className="border-l-[3px] border-mt-accent bg-mt-surface px-3.5 py-2.5 text-[11px] text-mt-neutral-700">
              Interesse no veículo:{" "}
              <strong className="font-extrabold text-mt-ink">
                {vehicleInfo.marca} {vehicleInfo.modelo} {vehicleInfo.ano ? `(${vehicleInfo.ano})` : ""}
              </strong>
            </div>
          )}

          <p className="m-0 text-xs font-medium leading-relaxed text-mt-neutral-800">
            Olá! Para iniciar sua conversa com nossos consultores no WhatsApp, informe seu nome e
            o número em que prefere ser atendido:
          </p>

          <form
            onSubmit={handleFormSubmit}
            toolname="solicitar_atendimento_whatsapp"
            tooldescription="Registra nome, WhatsApp e e-mail do cliente interessado para iniciar o contato direto no WhatsApp com a equipe da Motors Store."
            className="flex flex-col gap-4"
          >
            {errorMsg && (
              <div className="flex items-center gap-2 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3.5 py-2.5 text-xs font-semibold text-mt-accent-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ⚠️ Os campos ficam `readOnly` durante o envio, NUNCA `disabled`.

                A conversão otimizada do Ads é lida do DOM no instante em que o
                `generate_lead` entra no dataLayer — e esse instante cai dentro
                do `onSubmit`, com `loading` já em `true`. Campo `disabled` é
                exatamente o tipo de coisa que um varredor de formulário
                descarta, e o formulário de `/contato`, que é o único que
                comprovadamente entrega hash em produção, não desabilita nada.
                `readOnly` trava a edição do mesmo jeito e mantém o campo
                indistinguível de um campo comum para quem lê o DOM. */}

            {/* Name Input */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lead-name-input" className="mt-rotulo pl-1">
                Seu Nome Completo
              </label>
              <input
                id="lead-name-input"
                name="name"
                type="text"
                autoComplete="name"
                required
                autoFocus={shouldAutoFocus}
                readOnly={loading}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Digite seu nome..."
                className="h-11 w-full border border-mt-regua-fina bg-mt-surface px-4 text-sm text-mt-ink placeholder:text-mt-neutral-500 outline-none transition-colors duration-200 focus:border-mt-accent"
                toolparamdescription="Nome completo do cliente interessado para iniciar a negociação."
              />
            </div>

            {/* WhatsApp — obrigatório.

                Dois motivos, e o segundo é o que pesa. (1) Sem telefone o lead
                chega ao CRM com `remoteJid` vazio: se a pessoa fecha o
                WhatsApp sem mandar a mensagem, a loja fica com um nome e nada
                para onde responder. (2) As conversões otimizadas do Ads leem o
                DOM no instante do `generate_lead` — nome sozinho dá match
                ZERO. O que a detecção automática procura é `type="tel"` e
                `autocomplete="tel"`.

                ⚠️ Desde 26/08 o contêiner usa `user_data` MANUAL, e no modo
                manual o Google não varre o DOM: quem casa o campo é o seletor
                CSS da variável `upd - dados do lead`. Ou seja, **o `id` daqui
                é load-bearing** — renomear exige editar a variável no GTM, ou
                o match some sem erro nenhum. Ver §6.1 de
                `docs/GTM_CONFIGURACAO.md`. Os atributos acima ficam: servem
                teclado e autofill no celular, e são o caminho de volta se o
                modo mudar outra vez.

                Sem `aria-label`: o `<label htmlFor>` logo acima já dá o nome
                acessível, e um `aria-label="Telefone"` por cima dele faria o
                leitor de tela anunciar uma coisa e a tela mostrar outra. */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lead-phone-input" className="mt-rotulo pl-1">
                Seu WhatsApp
              </label>
              <input
                id="lead-phone-input"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                required
                readOnly={loading}
                value={whatsapp}
                onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
                placeholder="(41) 00000-0000"
                className="h-11 w-full border border-mt-regua-fina bg-mt-surface px-4 text-sm text-mt-ink placeholder:text-mt-neutral-500 outline-none transition-colors duration-200 focus:border-mt-accent"
                toolparamdescription="Número de WhatsApp com DDD do cliente interessado."
              />
            </div>

            {/* E-mail — opcional.

                ⚠️ Os IDs são `lead-phone-input`/`lead-email-input`, e NÃO
                `phone-input`/`email-input` como o handoff sugeriu: este modal
                sobe pelo `LeadPopup`, que está montado no layout raiz e
                portanto aparece em `/contato`, onde aqueles dois IDs já
                existem. Dois elementos com o mesmo `id` na mesma página fazem
                `document.querySelector` devolver o primeiro em ordem de
                documento — ambiguidade justamente no instante da conversão.
                Custava nada quando a detecção era automática, que casa por
                `type`/`autocomplete`/`name`. Hoje o custo é uma linha de
                seletor no GTM — e a troca segue valendo, porque `id` duplicado
                quebraria o match de qualquer modo. */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lead-email-input" className="mt-rotulo pl-1">
                Seu E-mail <span className="font-normal normal-case tracking-normal text-mt-neutral-500">(opcional)</span>
              </label>
              <input
                id="lead-email-input"
                name="email"
                type="email"
                autoComplete="email"
                readOnly={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="h-11 w-full border border-mt-regua-fina bg-mt-surface px-4 text-sm text-mt-ink placeholder:text-mt-neutral-500 outline-none transition-colors duration-200 focus:border-mt-accent"
                toolparamdescription="E-mail do cliente interessado, opcional."
              />
            </div>

            {/* Cloudflare Turnstile Verification */}
            <Turnstile
              ref={turnstileRef}
              action={action}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken("")}
            />

            {/* CTA — vermelho porque é o ponto de decisão do diálogo */}
            <button
              type="submit"
              disabled={loading || !isNameValid || !isPhoneValid || !isEmailValid || !turnstileToken}
              className={`mt-btn mt-btn-primario mt-btn-bloco mt-foco mt-2 text-xs uppercase ${
                loading ? "cursor-wait" : "cursor-pointer"
              }`}
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Redirecionando...
                </>
              ) : (
                <>
                  <IconeWhatsApp size={17} />
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

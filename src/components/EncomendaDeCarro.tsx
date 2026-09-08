"use client";

import { useRef, useState } from "react";

import { useTheme } from "../app/ThemeContext";
import { getActiveAgUid, getUtmParameters, trackLeadSubmission } from "../lib/telemetry";
import { generateEventId, getMatchParams } from "../lib/tracking-identity";
import { telefoneDoLead } from "../lib/whatsapp";
import { ACOES } from "../lib/turnstile";
import {
  FAIXAS_DA_ENCOMENDA,
  montarEncomenda,
  substantivoDoSegmento,
  type ContextoDaEncomenda,
} from "../lib/encomenda";
import Turnstile, { type TurnstileHandle } from "./Turnstile";
import SaidaDoCaptcha from "./SaidaDoCaptcha";

/**
 * "Encomende seu carro" — a saída do hub sem estoque que entra no funil.
 *
 * ---------------------------------------------------------------------------
 * O que substitui, e o que continua
 * ---------------------------------------------------------------------------
 * O hub sem estoque já tinha texto, alternativas, FAQ e um CTA de WhatsApp
 * (`avisarHref`). O problema do `wa.me` não é o canal: é que o contato
 * acontecia **fora do sistema** — sem linha em `leads`, sem CAPI, sem Kanban,
 * sem atribuição. São 32 hubs de modelo e 5 de marca nessa condição, e a
 * intenção de quem chega neles é a de melhor qualidade do site.
 *
 * Este formulário substitui o `avisarHref` NOS DOIS HUBS de marca e modelo. Os
 * recortes de `/estoque/[recorte]` continuam com o botão de WhatsApp, e o
 * WhatsApp continua no cabeçalho e no rodapé de toda página — nada some.
 *
 * ---------------------------------------------------------------------------
 * Três campos, e o que fica de fora
 * ---------------------------------------------------------------------------
 * Nome, WhatsApp e faixa de preço. Marca e modelo vêm das props da rota, não
 * digitados: a pessoa já disse o que quer ao chegar nesta URL, e pedir de novo
 * é cobrar trabalho que a página já tem.
 *
 * Nada de e-mail e nada de CPF. Crédito ruim é a maior causa de perda de lead,
 * e formulário curto qualifica menos e converte mais — a qualificação é do
 * consultor, depois. Nada de FIPE, "abaixo da tabela" ou desconto (mesma regra
 * de `/avaliacao`), e nada de prazo: "em 7 dias" é promessa que a loja não
 * controla, porque o carro depende de aparecer um que passe na perícia.
 *
 * ---------------------------------------------------------------------------
 * Tracking: o mesmo `Lead`, com outro nome de conteúdo
 * ---------------------------------------------------------------------------
 * Regra 7 do CLAUDE.md — evento novo com nome novo, não. É o `generate_lead`
 * do `dataLayer` e o `Lead` do Meta que já existem; o que distingue esta
 * origem é o `form_id` e o `content_name`. `tipoDeLead` reaproveita
 * `"curadoria"`, que é o valor de quem pede à loja para procurar um carro —
 * inventar um sexto valor mudaria o que o container do GTM recebe sem que
 * ninguém tenha ajustado a tag do outro lado.
 */
export default function EncomendaDeCarro({
  marca,
  modelo = null,
  caminho,
  segmento,
}: ContextoDaEncomenda) {
  const { companySettings } = useTheme();

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [faixa, setFaixa] = useState(FAIXAS_DA_ENCOMENDA[1]?.slug ?? "");
  const [estado, setEstado] = useState<"parado" | "enviando" | "pronto" | "erro">("parado");

  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);
  /* Separado de `estado === "erro"` pela mesma razão que em `/contato`: erro
     genérico se resolve tentando de novo, falha de captcha não — se o desafio
     está bloqueado, continua bloqueado no segundo clique. */
  const [captchaBloqueado, setCaptchaBloqueado] = useState(false);

  /* O `ag_uid` é LIDO no envio, e não guardado em estado por um efeito.
   *
   * `getActiveAgUid` só lê — localStorage, `window.ag_uid`, cookie, nessa
   * ordem — e não cria nada. Guardá-lo num `useState` alimentado por
   * `useEffect` (como as telas mais antigas fazem) rende três coisas piores:
   * uma renderização a mais, um valor que pode envelhecer se o rastreador
   * gravar o id depois da montagem, e o erro `set-state-in-effect` do lint.
   * Lendo na hora do POST, o valor é sempre o mais recente que existe. */

  const descartarToken = () => {
    setTurnstileToken("");
    turnstileRef.current?.reset();
  };

  const oQue = [marca, modelo].filter(Boolean).join(" ");
  const substantivo = substantivoDoSegmento(segmento);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nome.trim() || !whatsapp.trim() || estado === "enviando") return;

    setEstado("enviando");

    // Gerado ANTES do POST para o pixel do navegador e a CAPI do servidor
    // compartilharem o mesmo id — é o que deduplica o evento no Meta.
    const eventId = generateEventId("Lead");
    const { fbp, fbc } = getMatchParams();

    const corpo = montarEncomenda(
      { nome: nome.trim(), whatsapp: whatsapp.trim(), faixa },
      { marca, modelo, caminho, segmento },
      {
        agUid: getActiveAgUid(),
        eventId,
        turnstileToken,
        utm: getUtmParameters(),
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
        fbp,
        fbc,
      },
    );

    try {
      const resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });

      if (!resposta.ok) {
        // O token é de uso único e já foi gasto no siteverify: sem pedir outro,
        // o "tentar de novo" reenviaria o mesmo e levaria 403 para sempre.
        descartarToken();
        if (resposta.status === 403) {
          setCaptchaBloqueado(true);
          setEstado("parado");
          return;
        }
        setEstado("erro");
        return;
      }
    } catch {
      // Falha de rede não pode virar tela quebrada — mas aqui, ao contrário do
      // fluxo de WhatsApp, NÃO há redirecionamento salvando o contato: se o
      // POST não passou, o lead não existe em lugar nenhum. Então dizemos.
      setEstado("erro");
      return;
    }

    // Só depois do sucesso. Um `generate_lead` por tentativa infla a conversão
    // e ensina o Ads a comprar clique de quem desiste no meio.
    const telefone = telefoneDoLead(whatsapp);
    trackLeadSubmission(
      { marca, modelo: modelo || "Encomenda", preco: 0 },
      corpo.mensagem,
      {
        presetEventId: eventId,
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        phoneE164: telefone.e164,
        tipoDeLead: "curadoria",
        formId: "form-encomenda",
      },
    );

    setEstado("pronto");
    descartarToken();
  }

  if (captchaBloqueado) {
    return (
      <SaidaDoCaptcha
        mensagem="Não conseguimos concluir a verificação de segurança."
        onTentarNovamente={() => setCaptchaBloqueado(false)}
      />
    );
  }

  if (estado === "pronto") {
    return (
      <div className="border-2 border-mt-accent bg-mt-surface p-5">
        <p className="m-0 text-[15px] font-extrabold text-mt-ink">Anotado.</p>
        {/* Diz o que ACONTECE, e não quando. Ver a nota de `mensagemDaEncomenda`. */}
        <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-mt-neutral-800">
          Quando entrar, um consultor te chama no WhatsApp.
        </p>
      </div>
    );
  }

  const campo =
    "w-full border border-mt-regua bg-mt-bg px-3 py-2.5 text-[14px] text-mt-ink outline-none focus:border-mt-accent";

  return (
    <form onSubmit={enviar} className="max-w-[520px] border-2 border-mt-regua p-5">
      <h3 className="mt-titulo m-0 text-[18px] lg:text-[20px]">Encomende seu {substantivo}</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-mt-neutral-800">
        {oQue
          ? `Diga como falar com você e a faixa que procura. Quando entrar ${oQue}, um consultor avisa.`
          : "Diga como falar com você e a faixa que procura."}
      </p>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">
            Nome
          </span>
          <input
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="name"
            className={campo}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">
            WhatsApp
          </span>
          <input
            type="tel"
            required
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            autoComplete="tel"
            inputMode="tel"
            placeholder="(41) 90000-0000"
            className={campo}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">
            Faixa de preço
          </span>
          <select
            value={faixa}
            onChange={(e) => setFaixa(e.target.value)}
            className={campo}
          >
            {FAIXAS_DA_ENCOMENDA.map((f) => (
              <option key={f.slug} value={f.slug}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Montado desde o início, como em produção: com `interaction-only` o
          widget não ocupa espaço enquanto passa despercebido. */}
      <div className="mt-3">
        <Turnstile
          ref={turnstileRef}
          action={ACOES.encomenda}
          onSuccess={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken("")}
          onError={() => setTurnstileToken("")}
        />
      </div>

      <button
        type="submit"
        disabled={estado === "enviando"}
        className="mt-btn mt-btn-primario mt-foco mt-4 disabled:opacity-60"
      >
        {estado === "enviando" ? "ENVIANDO..." : "QUERO SER AVISADO"}
      </button>

      {estado === "erro" && (
        <p className="m-0 mt-3 text-[13px] text-mt-accent">
          Não conseguimos enviar agora. Tente de novo em instantes.
        </p>
      )}
    </form>
  );
}

"use client";

import { useRef, useState } from "react";

import { useTheme } from "../../app/ThemeContext";
import { NOME_DO_TURNO, TURNOS_DO_EXAME, type DiaDoExame, type TurnoDoExame } from "../../lib/exameNoPatio";
import { FORM_DO_EXAME, mensagemDeErroDaRota, montarLeadDoExame, type CarroParaOExame } from "../../lib/leadDoRepasse";
import { ANCORA_DO_EXAME, ERROS_DO_REPASSE, FICHA_DO_REPASSE, LISTA_DO_REPASSE } from "../../lib/paginaDoRepasse";
import {
  getActiveAgUid,
  getMatchParamsRespeitandoRecusa,
  getUtmParameters,
  rastreamentoRecusado,
  trackLeadSubmission,
} from "../../lib/telemetry";
import { generateEventId } from "../../lib/tracking-identity";
import { ACOES } from "../../lib/turnstile";
import { mascararTelefone, telefoneDoLead } from "../../lib/whatsapp";
import SaidaDoCaptcha from "../SaidaDoCaptcha";
import Turnstile, { type TurnstileHandle } from "../Turnstile";

const ROTULO = "text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700";
const CAMPO =
  "w-full border border-mt-regua bg-mt-bg px-3 py-2.5 text-[14px] text-mt-ink outline-none focus:border-mt-accent";
const opcao = (ativa: boolean) =>
  `mt-foco cursor-pointer border-2 px-3 py-2 text-[12px] font-extrabold tracking-[.06em] ${
    ativa ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua text-mt-ink"
  }`;

/**
 * O exame no pátio (spec §7.2, decisões 6 e 12 do PR 3). Os dias vêm prontos
 * do servidor (`diasDoExame`): três dias de loja aberta depois de hoje, em
 * Curitiba; turno da tarde e "vou levar o meu mecânico" já marcados, como na
 * prancha.
 *
 * Não é lista: sem linha de consentimento (como a Encomenda), só "Confirmamos
 * o horário pelo WhatsApp." — o dado serve para marcar o horário, base que a
 * `/privacidade` já declara. Tracking no molde da lista: `eventId` antes do
 * POST, medição só depois do 2xx, `formId: "form-exame-repasse"`.
 */
export default function ExameNoPatio({ carro, dias, titulo }: { carro: CarroParaOExame; dias: DiaDoExame[]; titulo: string }) {
  const { companySettings } = useTheme();
  const F = FICHA_DO_REPASSE;

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [dia, setDia] = useState(dias[0]?.data ?? "");
  const [turno, setTurno] = useState<TurnoDoExame>("tarde");
  const [levaMecanico, setLevaMecanico] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState("");

  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [captchaBloqueado, setCaptchaBloqueado] = useState(false);
  const descartarToken = () => {
    setTurnstileToken("");
    turnstileRef.current?.reset();
  };

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const telefone = telefoneDoLead(whatsapp);
    if (!nome.trim()) {
      setErro(ERROS_DO_REPASSE.nome);
      return;
    }
    if (!telefone.comDDI) {
      setErro(ERROS_DO_REPASSE.whatsapp);
      return;
    }
    setErro("");
    setEnviando(true);

    const eventId = rastreamentoRecusado() ? null : generateEventId("Lead");
    const { fbp, fbc } = getMatchParamsRespeitandoRecusa();
    const corpo = montarLeadDoExame(
      carro,
      { nome, whatsapp, dia, turno, levaMecanico },
      {
        agUid: getActiveAgUid(),
        eventId,
        turnstileToken,
        utm: getUtmParameters(),
        eventSourceUrl: window.location.href,
        fbp,
        fbc,
      },
    );

    let resposta: Response;
    try {
      resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
    } catch {
      setErro(ERROS_DO_REPASSE.generico);
      setEnviando(false);
      return;
    }

    if (!resposta.ok) {
      descartarToken();
      setEnviando(false);
      if (resposta.status === 403) {
        setCaptchaBloqueado(true);
        return;
      }
      setErro(mensagemDeErroDaRota(await resposta.json().catch(() => null)));
      return;
    }

    trackLeadSubmission({ marca: carro.marca, modelo: carro.modelo, preco: carro.preco }, corpo.mensagem, {
      presetEventId: eventId ?? undefined,
      googleAdsId: companySettings?.googleAdsId,
      googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
      phoneE164: telefone.e164,
      tipoDeLead: "curadoria",
      formId: FORM_DO_EXAME,
    });
    setPronto(true);
    setEnviando(false);
    descartarToken();
  }

  if (captchaBloqueado) {
    return <SaidaDoCaptcha mensagem={LISTA_DO_REPASSE.captcha} onTentarNovamente={() => setCaptchaBloqueado(false)} />;
  }

  return (
    <section id={ANCORA_DO_EXAME} className="border-t-2 border-mt-regua px-[18px] py-10 lg:px-10">
      <p className="mt-rotulo mt-rotulo-accent m-0">{F.exameRotulo}</p>
      <h2 className="mt-titulo m-0 mt-2 text-[28px] lg:text-[36px]">{titulo}</h2>
      <p className="m-0 mt-2 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">{F.exameTexto}</p>

      {pronto ? (
        <div role="status" className="mt-6 max-w-[560px] border-2 border-mt-accent p-5">
          <p className="m-0 text-[15px] font-extrabold">{F.pedidoEnviado}</p>
          <p className="m-0 mt-1.5 text-[13px] text-mt-neutral-800">{F.confirmamos}</p>
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="mt-6 grid max-w-[560px] gap-4">
          <label className="grid gap-1.5">
            <span className={ROTULO}>{LISTA_DO_REPASSE.nome}</span>
            <input
              type="text"
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              readOnly={enviando}
              autoComplete="name"
              placeholder={LISTA_DO_REPASSE.nomeExemplo}
              className={CAMPO}
            />
          </label>
          <label className="grid gap-1.5">
            <span className={ROTULO}>{LISTA_DO_REPASSE.whatsapp}</span>
            <input
              type="tel"
              name="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
              readOnly={enviando}
              autoComplete="tel"
              inputMode="tel"
              placeholder={LISTA_DO_REPASSE.whatsappExemplo}
              className={CAMPO}
            />
          </label>

          <fieldset className="m-0 border-0 p-0">
            <legend className={ROTULO}>{F.dia}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {dias.map((d) => (
                <label key={d.data} className={opcao(dia === d.data)}>
                  <input type="radio" name="dia" value={d.data} checked={dia === d.data} onChange={() => setDia(d.data)} className="sr-only" />
                  {d.rotulo}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="m-0 border-0 p-0">
            <legend className={ROTULO}>{F.turno}</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TURNOS_DO_EXAME.map((t) => (
                <label key={t} className={opcao(turno === t)}>
                  <input type="radio" name="turno" value={t} checked={turno === t} onChange={() => setTurno(t)} className="sr-only" />
                  {NOME_DO_TURNO[t]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px]">
            <input type="checkbox" name="mecanico" checked={levaMecanico} onChange={(e) => setLevaMecanico(e.target.checked)} />
            {F.levaMecanico}
          </label>

          <Turnstile
            ref={turnstileRef}
            action={ACOES.repasse}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken("")}
            onError={() => setTurnstileToken("")}
          />

          <button type="submit" disabled={enviando} className="mt-btn mt-btn-primario mt-foco justify-self-start disabled:opacity-60">
            {enviando ? LISTA_DO_REPASSE.enviando : F.pedirHorario}
          </button>

          {erro && (
            <p role="alert" className="m-0 text-[13px] text-mt-accent">
              {erro}
            </p>
          )}

          <p className="m-0 text-[12px] text-mt-neutral-700">{F.confirmamos}</p>
        </form>
      )}
    </section>
  );
}

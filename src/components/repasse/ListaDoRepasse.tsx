"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";

import { useTheme } from "../../app/ThemeContext";
import type { TrilhaDoRepasse } from "../../lib/avisosDoRepasse";
import { cnpjValido } from "../../lib/cnpj";
import {
  CARROCERIAS_DA_LISTA,
  FORM_DA_LISTA,
  FORM_DA_LISTA_LOJISTA,
  VEICULO_DA_LISTA,
  mensagemDeErroDaRota,
  montarLeadDaLista,
  type CarroceriaDaLista,
} from "../../lib/leadDoRepasse";
import {
  ANCORA_DA_LISTA,
  ANCORA_DA_LISTA_LOJISTA,
  ANCORA_DO_LOTE,
  CAMINHO_DO_REPASSE,
  ERROS_DO_REPASSE,
  HEROI_DO_REPASSE,
  LISTA_DO_REPASSE,
  NOME_DA_CARROCERIA,
  textoDaConfirmacao,
  tituloDaConfirmacao,
} from "../../lib/paginaDoRepasse";
import { FAIXAS_DO_REPASSE, type FaixaDoRepasse } from "../../lib/repasse";
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

export type ContextoDaLista = "pagina" | "vazio" | "ficha" | "nao-encontrado";

const assinarEndereco = (avisar: () => void) => {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
};
const lerEndereco = () => window.location.hash;
const enderecoNoServidor = () => "";

interface Inscrito {
  trilha: TrilhaDoRepasse;
  nome: string;
  faixa: FaixaDoRepasse | null;
  carrocerias: CarroceriaDaLista[];
}

const ROTULO = "text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700";
const CAMPO =
  "w-full border border-mt-regua bg-mt-bg px-3 py-2.5 text-[14px] text-mt-ink outline-none focus:border-mt-accent";

/**
 * A lista do repasse (spec §7.1, §7.4 e §8; decisões 5, 6, 9 e 10 do PR 3).
 *
 * Um componente, duas trilhas — "compro para usar" e "sou lojista" —, usado
 * na página, no vazio, na ficha vendida ou reservada e no endereço que não
 * abre carro. `#lista-lojista` no endereço abre na trilha lojista: é para lá
 * que "CADASTRAR MEU CNPJ" aponta. A escolha da pessoa vale até o endereço
 * mudar de novo (o herói pode mandar para a outra trilha depois).
 *
 * Tracking no molde de `EncomendaDeCarro.tsx`: `eventId` antes do POST e só
 * para quem não se opôs; `fbp`/`fbc` pela recusa; valores lidos no envio;
 * `trackLeadSubmission` SÓ depois do 2xx, com `tipoDeLead: "curadoria"` (a
 * tag do GTM não conhece valor novo) e o `formId` da trilha. 403 é o captcha
 * e tem saída própria; o resto mostra só texto de `ERROS_DO_REPASSE`.
 *
 * A linha de consentimento é a da §7.4, aprovada para a `/privacidade` — não a
 * das pranchas.
 */
export default function ListaDoRepasse({ contexto, cabecalho = true }: { contexto: ContextoDaLista; cabecalho?: boolean }) {
  const { companySettings } = useTheme();
  const L = LISTA_DO_REPASSE;

  const endereco = useSyncExternalStore(assinarEndereco, lerEndereco, enderecoNoServidor);
  const [escolha, setEscolha] = useState<{ trilha: TrilhaDoRepasse; endereco: string } | null>(null);
  const trilha: TrilhaDoRepasse =
    escolha && escolha.endereco === endereco
      ? escolha.trilha
      : endereco === `#${ANCORA_DA_LISTA_LOJISTA}`
        ? "lojista"
        : "consumidor";
  const lojista = trilha === "lojista";

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [faixa, setFaixa] = useState<FaixaDoRepasse>(FAIXAS_DO_REPASSE[1].id);
  const [carrocerias, setCarrocerias] = useState<CarroceriaDaLista[]>([]);
  const [cnpj, setCnpj] = useState("");
  const [lojaCidade, setLojaCidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [inscrito, setInscrito] = useState<Inscrito | null>(null);

  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [captchaBloqueado, setCaptchaBloqueado] = useState(false);
  const descartarToken = () => {
    setTurnstileToken("");
    turnstileRef.current?.reset();
  };

  const comLote = contexto === "pagina";
  const rotuloDoBotao = lojista ? L.botaoLojista : contexto === "pagina" ? L.botaoUsar : L.botaoProximo;

  function alternar(c: CarroceriaDaLista) {
    setCarrocerias((atual) => (atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const telefone = telefoneDoLead(whatsapp);
    const problema = !nome.trim()
      ? ERROS_DO_REPASSE.nome
      : !telefone.comDDI
        ? ERROS_DO_REPASSE.whatsapp
        : lojista && !cnpjValido(cnpj)
          ? ERROS_DO_REPASSE.cnpj
          : lojista && !lojaCidade.trim()
            ? ERROS_DO_REPASSE.loja
            : "";
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    setEnviando(true);

    // Gerado ANTES do POST para o pixel e a CAPI dividirem o mesmo id; nulo
    // para quem se opôs em /privacidade (a rota só espelha no CAPI com id).
    const eventId = rastreamentoRecusado() ? null : generateEventId("Lead");
    const { fbp, fbc } = getMatchParamsRespeitandoRecusa();
    const corpo = montarLeadDaLista(
      {
        trilha,
        nome,
        whatsapp,
        faixa: lojista ? null : faixa,
        carrocerias: lojista ? [] : carrocerias,
        cnpj: lojista ? cnpj : "",
        lojaCidade: lojista ? lojaCidade : "",
        caminho: window.location.pathname,
      },
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
      // O token é de uso único e já foi gasto no siteverify.
      descartarToken();
      setEnviando(false);
      if (resposta.status === 403) {
        setCaptchaBloqueado(true);
        return;
      }
      setErro(mensagemDeErroDaRota(await resposta.json().catch(() => null)));
      return;
    }

    // Só depois do sucesso: a pessoa está na lista, e aí sim é conversão.
    trackLeadSubmission({ ...VEICULO_DA_LISTA[trilha], preco: 0 }, corpo.mensagem, {
      presetEventId: eventId ?? undefined,
      googleAdsId: companySettings?.googleAdsId,
      googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
      phoneE164: telefone.e164,
      tipoDeLead: "curadoria",
      formId: lojista ? FORM_DA_LISTA_LOJISTA : FORM_DA_LISTA,
    });
    setInscrito({ trilha, nome, faixa: lojista ? null : faixa, carrocerias: lojista ? [] : carrocerias });
    setEnviando(false);
    descartarToken();
  }

  if (captchaBloqueado) {
    return <SaidaDoCaptcha mensagem={L.captcha} onTentarNovamente={() => setCaptchaBloqueado(false)} />;
  }

  const trilhaClasse = (ativa: boolean) =>
    `mt-foco border-2 px-3 py-2 text-[11px] font-extrabold tracking-[.1em] ${
      ativa ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua text-mt-ink"
    }`;

  return (
    <section id={ANCORA_DA_LISTA} className="scroll-mt-24">
      <span id={ANCORA_DA_LISTA_LOJISTA} aria-hidden="true" />
      {cabecalho && (
        <>
          <p className="mt-rotulo mt-rotulo-accent m-0">{L.rotulo}</p>
          <h2 className="mt-titulo m-0 mt-2 text-3xl md:text-[40px]">{L.titulo}</h2>
          {lojista ? (
            <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[14px] text-mt-neutral-800">
              {L.vantagensLojista.map((v) => (
                <li key={v}>
                  <span aria-hidden="true" className="mr-2 font-extrabold text-mt-accent">
                    ✓
                  </span>
                  {v}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-3 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">{L.textoUsar}</p>
          )}
        </>
      )}

      {inscrito ? (
        <div role="status" className="mt-6 max-w-[560px] border-2 border-mt-accent p-5">
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">
            <span aria-hidden="true">✓ </span>
            {inscrito.trilha === "lojista" ? L.trilhaLojista : L.trilhaUsar}
          </p>
          {inscrito.trilha === "lojista" ? (
            <>
              <p className="m-0 mt-2 text-[17px] font-extrabold">{L.confirmacaoLojistaTitulo}</p>
              <p className="m-0 mt-1.5 text-[14px] text-mt-neutral-800">{L.confirmacaoLojistaTexto}</p>
            </>
          ) : (
            <>
              <p className="m-0 mt-2 text-[17px] font-extrabold">{tituloDaConfirmacao(inscrito.nome)}</p>
              <p className="m-0 mt-1.5 text-[14px] text-mt-neutral-800">
                {textoDaConfirmacao({ faixa: inscrito.faixa, carrocerias: inscrito.carrocerias, comLote })}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {comLote && (
                  <a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DO_LOTE}`} className="mt-btn mt-btn-tinta mt-foco">
                    {L.verLote}
                  </a>
                )}
                <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
                  {L.verEstoque}
                </Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <form onSubmit={enviar} noValidate className="mt-6 grid max-w-[560px] gap-4">
          <div role="group" aria-label={HEROI_DO_REPASSE.legenda} className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!lojista} onClick={() => setEscolha({ trilha: "consumidor", endereco })} className={trilhaClasse(!lojista)}>
              <span className="hidden sm:inline">{L.trilhaUsar}</span>
              <span className="sm:hidden">{L.trilhaUsarCurta}</span>
            </button>
            <button type="button" aria-pressed={lojista} onClick={() => setEscolha({ trilha: "lojista", endereco })} className={trilhaClasse(lojista)}>
              {L.trilhaLojista}
            </button>
          </div>

          <label className="grid gap-1.5">
            <span className={ROTULO}>{L.nome}</span>
            <input
              type="text"
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              readOnly={enviando}
              autoComplete="name"
              placeholder={L.nomeExemplo}
              className={CAMPO}
            />
          </label>

          <label className="grid gap-1.5">
            <span className={ROTULO}>{L.whatsapp}</span>
            <input
              type="tel"
              name="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
              readOnly={enviando}
              autoComplete="tel"
              inputMode="tel"
              placeholder={L.whatsappExemplo}
              className={CAMPO}
            />
          </label>

          {lojista ? (
            <>
              <label className="grid gap-1.5">
                <span className={ROTULO}>{L.cnpj}</span>
                <input
                  type="text"
                  name="cnpj"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  readOnly={enviando}
                  inputMode="numeric"
                  placeholder={L.cnpjExemplo}
                  className={CAMPO}
                />
              </label>
              <label className="grid gap-1.5">
                <span className={ROTULO}>{L.lojaCidade}</span>
                <input
                  type="text"
                  name="loja"
                  value={lojaCidade}
                  onChange={(e) => setLojaCidade(e.target.value)}
                  readOnly={enviando}
                  autoComplete="organization"
                  placeholder={L.lojaCidadeExemplo}
                  className={CAMPO}
                />
              </label>
            </>
          ) : (
            <>
              <label className="grid gap-1.5">
                <span className={ROTULO}>{L.faixa}</span>
                <select name="faixa" value={faixa} onChange={(e) => setFaixa(e.target.value as FaixaDoRepasse)} className={CAMPO}>
                  {FAIXAS_DO_REPASSE.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="m-0 border-0 p-0">
                <legend className={ROTULO}>{L.tipo}</legend>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
                  {CARROCERIAS_DA_LISTA.map((c) => (
                    <label key={c} className="flex items-center gap-2">
                      <input type="checkbox" name={`carroceria-${c}`} checked={carrocerias.includes(c)} onChange={() => alternar(c)} />
                      {NOME_DA_CARROCERIA[c].rotulo}
                    </label>
                  ))}
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="carroceria-tanto-faz" checked={carrocerias.length === 0} onChange={() => setCarrocerias([])} />
                    {L.tantoFaz}
                  </label>
                </div>
              </fieldset>
            </>
          )}

          <Turnstile
            ref={turnstileRef}
            action={ACOES.repasse}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken("")}
            onError={() => setTurnstileToken("")}
          />

          <button type="submit" disabled={enviando} className="mt-btn mt-btn-primario mt-foco justify-self-start disabled:opacity-60">
            {enviando ? L.enviando : rotuloDoBotao}
          </button>

          {erro && (
            <p role="alert" className="m-0 text-[13px] text-mt-accent">
              {erro}
            </p>
          )}

          <p className="m-0 text-[12px] leading-relaxed text-mt-neutral-700">
            {L.consentimento}{" "}
            <Link href="/privacidade#dados" className="mt-foco underline underline-offset-2">
              {L.politica}
            </Link>
            .
          </p>
        </form>
      )}
    </section>
  );
}

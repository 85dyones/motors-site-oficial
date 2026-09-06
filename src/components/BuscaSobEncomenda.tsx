"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Turnstile, { type TurnstileHandle } from "./Turnstile";
import SaidaDoCaptcha from "./SaidaDoCaptcha";
import { mascararTelefone, telefoneDoLead } from "../lib/whatsapp";
import { getActiveAgUid, getUtmParameters, trackLeadSubmission } from "../lib/telemetry";
import { getMatchParams } from "../lib/tracking-identity";
import { ACOES } from "../lib/turnstile";
import { type Genero } from "../lib/generoDoVeiculo";
import {
  CANAL_BUSCA_ENCOMENDA,
  FAIXAS_DE_INVESTIMENTO,
  PRAZOS,
  mensagemDoPedido,
  textoDaBusca,
  type PedidoDeBusca,
} from "../lib/buscaSobEncomenda";

/**
 * A saída do hub sem carro — a oferta que substitui a lista de espera.
 *
 * `"use client"` e mesmo assim NO HTML DO SERVIDOR: client component montado
 * por server component é renderizado no servidor na primeira resposta. A
 * diretiva governa hidratação e bundle, não presença no HTML. É o que permite
 * ao Googlebot ver a oferta na página que ele já ranqueia — /carros/citroen tem
 * 67 impressões e nenhum Citroën.
 *
 * O formulário abre INLINE, não em modal: modal em mobile custa conversão, e
 * modal fechado não é conteúdo servido.
 */

export interface AlvoDaBusca {
  marca: string;
  /** Ausente na página de marca. É ele que escolhe a variante. */
  modelo?: string;
  caminho: string;
  genero: Genero;
  /** Vira `datalist` do campo de modelo, na página de marca. */
  modelosConhecidos?: string[];
  /**
   * O `wa.me` de sempre — o beco de emergência.
   *
   * Falha do nosso endpoint não pode custar o contato: é o único caminho que
   * não depende de nada nosso estar de pé.
   */
  avisarHref?: string;
}

const ANOS = Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i);

export default function BuscaSobEncomenda({
  marca,
  modelo,
  caminho,
  genero,
  modelosConhecidos = [],
  avisarHref = "",
}: AlvoDaBusca) {
  const texto = textoDaBusca({ marca, modelo, genero });

  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<PedidoDeBusca | null>(null);
  const [erro, setErro] = useState("");
  const [captchaBloqueado, setCaptchaBloqueado] = useState(false);
  const [token, setToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [modeloDesejado, setModeloDesejado] = useState(modelo ?? "");
  const [investimento, setInvestimento] = useState("");
  const [anoMin, setAnoMin] = useState("");
  const [temTroca, setTemTroca] = useState("");
  const [prazo, setPrazo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [detalhar, setDetalhar] = useState(false);
  /** Honeypot. Nome que NÃO colide com coluna de `leads`. */
  const [apelido, setApelido] = useState("");

  const montarPedido = (): PedidoDeBusca => ({
    marca,
    modelo_desejado: modeloDesejado.trim(),
    investimento,
    pagina_origem: caminho,
    ano_min: anoMin ? Number(anoMin) : null,
    tem_troca: temTroca === "" ? null : temTroca === "sim",
    prazo: prazo || null,
    observacao: observacao.trim() || null,
  });

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    // Honeypot: robô preencheu o campo que humano não vê. Some em silêncio —
    // dizer "recusado" ensina o robô a tentar de novo sem ele.
    if (apelido.trim() !== "") {
      setEnviado(montarPedido());
      return;
    }

    setErro("");
    setEnviando(true);

    const pedido = montarPedido();
    const mensagem = mensagemDoPedido(pedido);
    const telefone = telefoneDoLead(whatsapp);

    const eventId = trackLeadSubmission(
      { marca, modelo: modeloDesejado.trim() || marca, preco: 0 },
      mensagem,
      { tipoDeLead: "contato", formId: "form-busca-encomenda", phoneE164: telefone.e164 },
    );
    const { fbp, fbc } = getMatchParams();
    const utmParams = getUtmParameters();

    try {
      const resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteJid: telefone.remoteJid,
          telefone: telefone.comDDI ?? "",
          tipo: "lead_busca_encomenda",
          canal: CANAL_BUSCA_ENCOMENDA,
          mensagem,
          veiculo: null,
          cliente: { nome: nome.trim(), email: "", whatsapp },
          busca_encomenda: pedido,
          utm: {
            ...utmParams,
            utm_source: utmParams.utm_source || "busca-encomenda",
            utm_medium: utmParams.utm_medium || "organico",
            utm_campaign: utmParams.utm_campaign || caminho,
          },
          intencao_busca: { pagina_origem: caminho, modelo_desejado: pedido.modelo_desejado },
          agUid: getActiveAgUid(),
          eventId,
          eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
          fbp,
          fbc,
          turnstileToken: token,
        }),
      });

      if (!resposta.ok) throw new Error(String(resposta.status));
      setEnviado(pedido);
    } catch (fetchError) {
      // Sem log aqui, um 500 do /api/leads não deixa rastro nenhum no
      // console — só o beco do wa.me funcionando, sem ninguém saber por que
      // o funil principal parou.
      console.warn(
        "[Lead Submit Busca Encomenda] Falha ao registrar o pedido:",
        fetchError instanceof Error ? fetchError.message : fetchError,
      );
      // Token do Turnstile é de uso único: sem o reset, o segundo clique manda
      // o mesmo token queimado e leva 403.
      turnstileRef.current?.reset();
      setToken("");
      setErro("Não consegui registrar o pedido agora.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    const resumo = encodeURIComponent(mensagemDoPedido(enviado));
    return (
      <div className="border-b border-mt-regua-fina py-10">
        <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Recebido.</h2>
        <p className="m-0 mt-3 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">
          Um consultor vai te chamar no WhatsApp com o que encontrar.
        </p>
        <div className="mt-6 flex flex-wrap gap-0.5">
          {avisarHref && (
            <a
              href={`${avisarHref.split("?")[0]}?text=${resumo}`}
              className="mt-btn mt-btn-primario mt-foco"
              target="_blank"
              rel="noopener noreferrer"
            >
              FALAR AGORA NO WHATSAPP
            </a>
          )}
          {enviado.tem_troca === true && (
            <Link href="/avaliacao" className="mt-btn mt-btn-contorno mt-foco">
              AVALIAR MEU CARRO NA TROCA
            </Link>
          )}
          {/* Regra 6 vale também depois do envio. Sem isto, quem não marcou
              troca e chega numa loja sem WhatsApp configurado (`linkWhatsApp`
              devolve "") vê uma tela de sucesso sem link nenhum — o beco que
              esta feature veio desfazer, reaparecendo no fim dela. */}
          <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
            VER TODO O ESTOQUE
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-mt-regua-fina py-10">
      <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">{texto.titulo}</h2>
      <p className="m-0 mt-3 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">
        {texto.paragrafo}
      </p>
      <p className="m-0 mt-2 max-w-[560px] text-[13px] font-extrabold text-mt-ink">{texto.selo}</p>

      <div className="mt-6 flex flex-wrap gap-0.5">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-btn mt-btn-primario mt-foco"
          aria-expanded={aberto}
          aria-controls="form-busca-encomenda"
        >
          {texto.rotuloPrimario}
        </button>
        {/* Regra 6 do CLAUDE.md: "ver todo o estoque" sempre acessível. */}
        <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
          {modelo ? "VER O QUE TEM HOJE NO ESTOQUE" : "VER TODO O ESTOQUE"}
        </Link>
        {!modelo && (
          <Link href="/carro-perfeito" className="mt-btn mt-btn-contorno mt-foco">
            NÃO SEI QUAL MODELO — ME AJUDA A ESCOLHER
          </Link>
        )}
      </div>

      {aberto && (
        <form id="form-busca-encomenda" onSubmit={enviar} className="mt-8 max-w-[560px]">
          <div className="mt-rotulo mb-3">
            Busca sob encomenda — {[marca, modelo].filter(Boolean).join(" ")}
          </div>

          <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-nome">
            Nome
          </label>
          <input
            id="bse-nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
          />

          <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-zap">
            WhatsApp
          </label>
          <input
            id="bse-zap"
            required
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
            className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
          />

          <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-modelo">
            Que carro você procura
          </label>
          <input
            id="bse-modelo"
            required
            list={modelosConhecidos.length > 0 ? "bse-modelos" : undefined}
            value={modeloDesejado}
            onChange={(e) => setModeloDesejado(e.target.value)}
            className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
          />
          {modelosConhecidos.length > 0 && (
            <datalist id="bse-modelos">
              {modelosConhecidos.map((m) => (
                <option key={m} value={`${marca} ${m}`} />
              ))}
            </datalist>
          )}

          <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-inv">
            Quanto pretende investir
          </label>
          <select
            id="bse-inv"
            required
            value={investimento}
            onChange={(e) => setInvestimento(e.target.value)}
            className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
          >
            <option value="">Selecione</option>
            {FAIXAS_DE_INVESTIMENTO.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>

          {/* Honeypot: fora da ordem de tabulação e escondido de leitor de tela. */}
          <input
            type="text"
            name="apelido"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />

          <button
            type="button"
            onClick={() => setDetalhar((v) => !v)}
            className="mt-foco mb-4 text-[12px] font-semibold text-mt-accent underline"
            aria-expanded={detalhar}
          >
            {detalhar ? "menos detalhes" : "detalhar mais (opcional)"}
          </button>

          {detalhar && (
            <div className="mb-4 border-l-2 border-mt-regua-fina pl-4">
              <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-ano">
                Ano, no mínimo
              </label>
              <select
                id="bse-ano"
                value={anoMin}
                onChange={(e) => setAnoMin(e.target.value)}
                className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
              >
                <option value="">tanto faz</option>
                {ANOS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <fieldset className="mb-4">
                <legend className="text-[12px] font-semibold text-mt-neutral-600">
                  Tem carro na troca?
                </legend>
                {[
                  { v: "sim", r: "Sim" },
                  { v: "nao", r: "Não" },
                ].map(({ v, r }) => (
                  <label key={v} className="mr-4 inline-flex items-center gap-1.5 text-[14px]">
                    <input
                      type="radio"
                      name="bse-troca"
                      value={v}
                      checked={temTroca === v}
                      onChange={(e) => setTemTroca(e.target.value)}
                    />
                    {r}
                  </label>
                ))}
              </fieldset>

              <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-prazo">
                Prazo
              </label>
              <select
                id="bse-prazo"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
              >
                <option value="">sem definir</option>
                {PRAZOS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>

              <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-obs">
                Mais alguma coisa
              </label>
              <textarea
                id="bse-obs"
                maxLength={300}
                rows={3}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="mt-foco w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
              />
            </div>
          )}

          <Turnstile
            ref={turnstileRef}
            action={ACOES.buscaEncomenda}
            onSuccess={setToken}
            onError={() => setCaptchaBloqueado(true)}
            onExpire={() => setToken("")}
          />

          {captchaBloqueado && <SaidaDoCaptcha mensagem={mensagemDoPedido(montarPedido())} />}

          {erro && (
            <p className="m-0 mb-3 text-[13px] text-mt-neutral-800">
              {erro}{" "}
              {avisarHref && (
                <a
                  href={`${avisarHref.split("?")[0]}?text=${encodeURIComponent(mensagemDoPedido(montarPedido()))}`}
                  className="mt-foco underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Fale direto no WhatsApp
                </a>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || !token}
            className="mt-btn mt-btn-primario mt-foco disabled:opacity-50"
          >
            {enviando ? "ENVIANDO…" : "ENVIAR PEDIDO"}
          </button>

          {/* Condicionado de propósito. A redação anterior — "você só decide
              quando o carro estiver na sua frente, com o laudo cautelar
              independente" — prometia o documento sem a ressalva que as outras
              12 citações do repositório carregam. Decisão do dono, 2026-09-06.
              ", já aprovado" no fim é acréscimo desta rodada, não do brief: a
              frase decidida termina em "na ficha." e cai na mesma trava de CDC
              que ela busca respeitar — tests/coerencia-da-pericia.test.ts exige
              a raiz "aprovad" perto de "laudo…ficha". O acréscimo só explicita
              o que "passou na perícia" já implicava. */}
          <p className="m-0 mt-4 text-[12px] leading-relaxed text-mt-neutral-600">
            A Motors Store não cobra pela busca. Só entra na sua frente o que passou na perícia,
            com o laudo cautelar independente na ficha, já aprovado.
          </p>
        </form>
      )}
    </div>
  );
}

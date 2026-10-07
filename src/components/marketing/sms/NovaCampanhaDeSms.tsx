"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SITE_HOST } from "../../../lib/site";
import {
  CODIGO_DE_EXEMPLO,
  CRITERIOS_DE_PUBLICO,
  JANELAS_DE_INTERESSE,
  MENSAGEM_PADRAO,
  PARTES_MAXIMAS,
  RODAPE_DE_SAIDA,
  ROTULO_DO_CRITERIO,
  TAMANHO_MAXIMO_DO_NOME,
  VARIAVEIS_DA_MENSAGEM,
  caminhoDoLinkCurto,
  montarMensagem,
  precoNoSms,
  semAcento,
  tamanhoDoSms,
  type CarroDaCampanha,
  type CriterioDePublico,
  type JanelaDeInteresse,
  type PedidoDeCampanha,
  type PreviaDaCampanha,
} from "../../../lib/smsCampanhas";
import SinalDeEstado, { COR_DO_ESTADO } from "../../admin/consulta/SinalDeEstado";

/**
 * O formulário de nova campanha de SMS, em quatro passos numa página só.
 *
 * Quem abre: Administrador e Marketing. Quando: um carro baixou de preço, ou
 * está parado, e há gente que já olhou para ele. Que decisão sai: **para quem
 * mandar, o que dizer e quanto isso custa** — antes de gastar um centavo.
 *
 * Criar NÃO envia. A campanha nasce rascunho, com o público congelado, e o
 * envio é um segundo gesto, na tela de monitoramento.
 *
 * A tela nunca vê contato de lead: a prévia que volta do servidor é contagem.
 * A mensagem "como chega" é montada aqui com um nome de exemplo, pela mesma
 * `montarMensagem` do envio — o que se lê é o que sai.
 */

const NOME_DE_EXEMPLO = "Maria";
const JANELA_PADRAO: JanelaDeInteresse = 180;

const rotuloDaJanela = (j: JanelaDeInteresse) => (j === null ? "Sempre" : `${j} dias`);
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (n: number) => n.toLocaleString("pt-BR");
const normal = (s: string) => semAcento(s).toLowerCase();

/** Quem casou com o critério e ficou de fora: o motivo, como a tela o escreve. */
const MOTIVOS_DE_FORA: Array<{ chave: keyof PreviaDaCampanha["fora"]; rotulo: string }> = [
  { chave: "semCelular", rotulo: "sem celular" },
  { chave: "saiuDaLista", rotulo: "pediram para sair" },
  { chave: "jaComprou", rotulo: "já compraram" },
  { chave: "desistiu", rotulo: "desistiram deste interesse" },
  { chave: "descartado", rotulo: "descartados pela equipe (spam, teste)" },
  { chave: "repetido", rotulo: "número repetido" },
];

type RespostaDaPrevia = { previa?: PreviaDaCampanha; error?: string };
type RespostaDeCriar = { id?: string; error?: string };
type RespostaDoTeste = { ok?: boolean; texto?: string; error?: string };

/** O corpo de um POST em JSON. O `fetch` fica escrito em cada chamada, com o caminho literal: é o que a guarda de rotas lê. */
const emJson = (corpo: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

async function ler<T>(res: Response): Promise<{ ok: boolean; json: T }> {
  const json = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, json };
}

export default function NovaCampanhaDeSms({
  carros,
  impedimento = null,
}: {
  carros: CarroDaCampanha[];
  /** Por que não dá para criar agora (falta a tabela, falta a chave de serviço). `null` libera. */
  impedimento?: string | null;
}) {
  const router = useRouter();
  const caixaDaMensagem = useRef<HTMLTextAreaElement>(null);

  const [busca, setBusca] = useState("");
  const [veiculoId, setVeiculoId] = useState<number | null>(null);
  const [criterio, setCriterio] = useState<CriterioDePublico>("mesmo_veiculo");
  const [janelaDias, setJanelaDias] = useState<JanelaDeInteresse>(JANELA_PADRAO);
  const [mensagem, setMensagem] = useState<string>(MENSAGEM_PADRAO);
  const [nomeDigitado, setNomeDigitado] = useState<string | null>(null);

  // A prévia guarda o retrato do pedido com que foi calculada: mudou o carro,
  // o critério, o período ou a mensagem, e ela deixa de valer sem efeito algum.
  const [previa, setPrevia] = useState<{ chave: string; dados: PreviaDaCampanha } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [telefoneDoTeste, setTelefoneDoTeste] = useState("");
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null);

  const carro = carros.find((c) => c.id === veiculoId) ?? null;
  const carrosFiltrados = useMemo(() => {
    const termos = normal(busca).split(/\s+/).filter(Boolean);
    // O escolhido fica na lista mesmo fora do filtro: o select não pode mostrar um carro e valer outro.
    return carros.filter((c) => c.id === veiculoId || termos.every((t) => normal(c.rotulo).includes(t)));
  }, [carros, busca, veiculoId]);

  const comoChega = carro
    ? montarMensagem(mensagem, {
        nome: NOME_DE_EXEMPLO,
        carro: carro.rotulo,
        preco: precoNoSms(carro.preco),
        link: `${SITE_HOST}${caminhoDoLinkCurto(CODIGO_DE_EXEMPLO)}`,
      })
    : null;
  const tamanho = comoChega ? tamanhoDoSms(comoChega) : null;
  const semLink = !mensagem.includes("{link}");
  const mensagemVazia = mensagem.trim() === "";
  const longaDemais = tamanho !== null && tamanho.partes > PARTES_MAXIMAS;
  const mensagemServe = !mensagemVazia && !semLink && !longaDemais;

  const chave = JSON.stringify([veiculoId, criterio, janelaDias, mensagem.trim()]);
  const previaValida = previa !== null && previa.chave === chave ? previa.dados : null;
  const previaVencida = previa !== null && previaValida === null;

  const sugestaoDeNome = carro ? `${carro.rotulo} · ${ROTULO_DO_CRITERIO[criterio]}`.slice(0, TAMANHO_MAXIMO_DO_NOME) : "";
  const nome = nomeDigitado ?? sugestaoDeNome;

  const ocupado = calculando || criando;
  const podeCalcular = carro !== null && mensagemServe && !ocupado;
  const podeCriar =
    impedimento === null && carro !== null && mensagemServe && previaValida !== null && previaValida.destinatarios > 0 && nome.trim() !== "" && !ocupado;

  const pedido = (comNome: string): PedidoDeCampanha | null =>
    veiculoId === null ? null : { nome: comNome, veiculoId, criterio, janelaDias, mensagem: mensagem.trim() };

  /** Põe a variável onde o cursor está, e devolve o cursor para depois dela. */
  const inserir = (variavel: string) => {
    const caixa = caixaDaMensagem.current;
    const inicio = caixa?.selectionStart ?? mensagem.length;
    const fim = caixa?.selectionEnd ?? mensagem.length;
    setMensagem(mensagem.slice(0, inicio) + variavel + mensagem.slice(fim));
    requestAnimationFrame(() => {
      caixa?.focus();
      caixa?.setSelectionRange(inicio + variavel.length, inicio + variavel.length);
    });
  };

  const calcular = async () => {
    const corpo = pedido("prévia");
    if (!corpo || !podeCalcular) return;
    setErro(null);
    setCalculando(true);
    try {
      const { ok, json } = await ler<RespostaDaPrevia>(await fetch("/api/marketing/sms/previa", emJson(corpo)));
      if (!ok || !json.previa) {
        setErro(json.error || "O cálculo do público não voltou.");
        return;
      }
      setPrevia({ chave, dados: json.previa });
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setCalculando(false);
    }
  };

  const criar = async () => {
    const corpo = pedido(nome.trim());
    if (!corpo || !podeCriar) return;
    setErro(null);
    setCriando(true);
    try {
      const { ok, json } = await ler<RespostaDeCriar>(await fetch("/api/marketing/sms", emJson(corpo)));
      if (!ok || !json.id) {
        setErro(json.error || "A campanha não foi criada.");
        setCriando(false);
        return;
      }
      // Segue ocupado até a navegação: um segundo clique criaria outra campanha.
      router.push(`/admin/marketing/sms/${json.id}`);
    } catch {
      setErro("Sem conexão com o servidor.");
      setCriando(false);
    }
  };

  const testar = async () => {
    if (veiculoId === null || !mensagemServe || testando) return;
    setTeste(null);
    setTestando(true);
    try {
      const { ok, json } = await ler<RespostaDoTeste>(await fetch("/api/marketing/sms/teste", emJson({ telefone: telefoneDoTeste, veiculoId, mensagem: mensagem.trim() })));
      if (!ok || !json.texto) setTeste({ ok: false, texto: json.error || "O teste não foi enviado." });
      else setTeste({ ok: true, texto: json.texto });
    } catch {
      setTeste({ ok: false, texto: "Sem conexão com o servidor." });
    } finally {
      setTestando(false);
    }
  };

  const rotulo = "mt-rotulo";
  const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";
  const passo = "flex flex-col gap-3 border-t-2 border-mt-regua pt-5";
  const campo = "mt-campo-caixa mt-foco w-full";
  const faixa = "flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs text-mt-ink";

  return (
    <form
      aria-label="Nova campanha de SMS"
      data-nova-campanha
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void criar();
      }}
    >
      {/* ── 1 · O carro ─────────────────────────────────────────────────────── */}
      <section aria-label="Carro" className={passo}>
        <h3 className={`${rotulo} m-0`}>1 · CARRO</h3>
        {carros.length === 0 ? (
          <p className="m-0 text-sm text-mt-neutral-800">Nenhum carro à venda no estoque para anunciar agora.</p>
        ) : (
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="flex flex-col gap-1">
              <span className={rotulo}>FILTRAR</span>
              <input
                type="search"
                className={campo}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Marca, modelo ou ano"
                autoComplete="off"
                data-busca-de-carro
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={rotulo}>
                CARRO DA CAMPANHA · {numero(carrosFiltrados.length)} DE {numero(carros.length)}
              </span>
              <select
                className={campo}
                value={veiculoId ?? ""}
                onChange={(e) => setVeiculoId(e.target.value === "" ? null : Number(e.target.value))}
                data-carro-da-campanha
              >
                <option value="">Escolha</option>
                {carrosFiltrados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo} · {c.preco !== null ? precoNoSms(c.preco) : "sem preço"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {carro && carro.preco === null && (
          <p className={dica}>Este carro está sem preço no estoque: a variável {"{preco}"} sai como “sob consulta”.</p>
        )}
      </section>

      {/* ── 2 · Quem recebe ─────────────────────────────────────────────────── */}
      <section aria-label="Quem recebe" className={passo}>
        <h3 className={`${rotulo} m-0`}>2 · QUEM RECEBE</h3>
        <div className="flex flex-col gap-1">
          <span className={dica}>Quem já demonstrou interesse em…</span>
          <div role="radiogroup" aria-label="Critério do público" className="mt-seg flex-wrap self-start">
            {CRITERIOS_DE_PUBLICO.map((c) => (
              <label key={c} className="mt-seg-opt">
                <input type="radio" name="criterio-do-publico" value={c} checked={criterio === c} onChange={() => setCriterio(c)} />
                {ROTULO_DO_CRITERIO[c]}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className={dica}>…nos últimos</span>
          <div role="radiogroup" aria-label="Período do interesse" className="mt-seg flex-wrap self-start">
            {JANELAS_DE_INTERESSE.map((j) => (
              <label key={String(j)} className="mt-seg-opt">
                <input type="radio" name="janela-de-interesse" value={String(j)} checked={janelaDias === j} onChange={() => setJanelaDias(j)} />
                {rotuloDaJanela(j)}
              </label>
            ))}
          </div>
        </div>
        <p className={dica}>
          Fica sempre de fora quem já comprou (aqui ou fora), quem desistiu daquele interesse, lead descartado, quem não tem celular e quem pediu para sair.
        </p>
      </section>

      {/* ── 3 · A mensagem ──────────────────────────────────────────────────── */}
      <section aria-label="Mensagem" className={passo}>
        <h3 className={`${rotulo} m-0`}>3 · MENSAGEM</h3>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className={rotulo}>O QUE VOCÊ ESCREVE</span>
              <textarea
                ref={caixaDaMensagem}
                className={`${campo} min-h-[120px] resize-y leading-relaxed`}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={4}
                data-molde-da-mensagem
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className={dica}>Inserir:</span>
              {VARIAVEIS_DA_MENSAGEM.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => inserir(v)}
                  className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-2.5 py-1.5 font-mono text-[11px] normal-case tracking-normal"
                  data-variavel={v}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className={dica}>
              Acento e cedilha são removidos no envio: com eles, cada SMS cabe menos da metade e custa mais que o dobro. O
              rodapé “{RODAPE_DE_SAIDA}” entra sempre, mesmo que você não o escreva: é o direito de quem recebe.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className={rotulo}>COMO CHEGA NO CELULAR</span>
            {comoChega && tamanho ? (
              <>
                <p className="m-0 whitespace-pre-wrap break-words border border-mt-regua-fina bg-mt-surface p-4 font-mono text-[13px] leading-relaxed text-mt-ink" data-como-chega>
                  {comoChega}
                </p>
                <p className="m-0 text-xs tabular-nums text-mt-neutral-800" data-tamanho-da-mensagem>
                  {numero(tamanho.caracteres)} {tamanho.caracteres === 1 ? "caractere" : "caracteres"} · {tamanho.partes}{" "}
                  {tamanho.partes === 1 ? "SMS" : "SMS (partes)"} por destinatário
                </p>
                <p className={dica}>
                  Medido com o nome “{NOME_DE_EXEMPLO}” e um link de exemplo. Nome mais comprido soma caracteres; o link de
                  cada pessoa tem sempre este tamanho.
                </p>
              </>
            ) : (
              <p className="m-0 border border-dashed border-mt-regua-fina p-4 text-xs text-mt-neutral-700" data-como-chega-vazio>
                Escolha o carro para ver a mensagem como ela chega, com o tamanho e o custo por destinatário.
              </p>
            )}

            {mensagemVazia && (
              <div className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-aviso-da-mensagem="vazia">
                <SinalDeEstado estado="impeditivo" rotulo="Bloqueado" />
                <span>
                  <strong>Bloqueado:</strong> escreva a mensagem.
                </span>
              </div>
            )}
            {!mensagemVazia && semLink && (
              <div className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-aviso-da-mensagem="sem-link">
                <SinalDeEstado estado="impeditivo" rotulo="Bloqueado" />
                <span>
                  <strong>Bloqueado:</strong> a mensagem precisa do {"{link}"}. Sem ele não há como medir quem abriu.
                </span>
              </div>
            )}
            {tamanho && tamanho.unicode && (
              <div className={faixa} style={{ borderColor: COR_DO_ESTADO.atencao }} data-aviso-da-mensagem="unicode">
                <SinalDeEstado estado="atencao" />
                <span>
                  <strong>Atenção:</strong> há um caractere fora do alfabeto do SMS (emoji ou símbolo). Com ele, cada parte cabe
                  só 70 caracteres.
                </span>
              </div>
            )}
            {tamanho && tamanho.partes > 1 && !longaDemais && (
              <div className={faixa} style={{ borderColor: COR_DO_ESTADO.atencao }} data-aviso-da-mensagem="partes">
                <SinalDeEstado estado="atencao" />
                <span>
                  <strong>Atenção:</strong> a mensagem passou de um SMS. Cada destinatário custa {tamanho.partes} SMS.
                </span>
              </div>
            )}
            {tamanho && longaDemais && (
              <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-aviso-da-mensagem="longa-demais">
                <SinalDeEstado estado="impeditivo" rotulo="Bloqueado" />
                <span>
                  <strong>Bloqueado:</strong> a mensagem ocupa {tamanho.partes} SMS, e o limite é {PARTES_MAXIMAS}. Encurte o texto
                  para calcular o público e criar a campanha.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border border-mt-regua-fina p-4">
          <span className={rotulo}>ENVIAR TESTE PARA MIM</span>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 sm:max-w-xs">
              <span className={dica}>Seu celular, com DDD</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                className={campo}
                value={telefoneDoTeste}
                onChange={(e) => setTelefoneDoTeste(e.target.value)}
                placeholder="(41) 90000-0000"
                data-telefone-do-teste
              />
            </label>
            <button
              type="button"
              onClick={() => void testar()}
              disabled={testando || carro === null || !mensagemServe || telefoneDoTeste.replace(/\D/g, "").length < 10}
              className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-3 text-[11px]"
              data-enviar-teste
            >
              {testando ? "Enviando…" : "Enviar teste"}
            </button>
          </div>
          <p className={dica}>Envia UM SMS de verdade para o número digitado, com esta mensagem e este carro. Custa um envio.</p>
          {teste && (
            <div role="status" className={faixa} style={{ borderColor: COR_DO_ESTADO[teste.ok ? "ok" : "impeditivo"] }} data-resultado-do-teste={teste.ok ? "ok" : "erro"}>
              <SinalDeEstado estado={teste.ok ? "ok" : "impeditivo"} rotulo={teste.ok ? "Enviado" : "Não enviado"} />
              <span className="min-w-0 break-words">
                <strong>{teste.ok ? "Teste enviado:" : "Teste não enviado:"}</strong> {teste.texto}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── 4 · Público e custo ─────────────────────────────────────────────── */}
      <section aria-label="Público e custo" className={passo}>
        <h3 className={`${rotulo} m-0`}>4 · PÚBLICO E CUSTO</h3>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void calcular()}
            disabled={!podeCalcular}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-5 py-3 text-[11px]"
            data-calcular-publico
          >
            {calculando ? "Calculando…" : previaValida ? "Calcular de novo" : "Calcular público"}
          </button>
          {!carro && <span className={dica}>Escolha o carro para calcular.</span>}
          {previaVencida && !calculando && (
            <span className="inline-flex items-center gap-2 text-xs text-mt-ink" data-previa-vencida>
              <SinalDeEstado estado="atencao" tamanho={16} />
              <span>
                <strong>Atenção:</strong> o pedido mudou depois do cálculo. Calcule o público de novo antes de criar.
              </span>
            </span>
          )}
        </div>

        {previaValida && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-previa-do-publico aria-live="polite">
            <div className="mt-cartao flex flex-col gap-0.5">
              <span className={rotulo}>RECEBEM</span>
              <span className="mt-titulo text-3xl tabular-nums" data-destinatarios>
                {numero(previaValida.destinatarios)}
              </span>
              <span className="text-[11px] text-mt-neutral-700">
                {previaValida.destinatarios === 1 ? "pessoa" : "pessoas"} · {ROTULO_DO_CRITERIO[criterio].toLowerCase()} · {rotuloDaJanela(janelaDias).toLowerCase()}
              </span>
            </div>
            <div className="mt-cartao flex flex-col gap-0.5">
              <span className={rotulo}>CUSTO ESTIMADO</span>
              <span className="mt-titulo text-3xl tabular-nums" data-custo-estimado>
                {previaValida.custoEstimado !== null && previaValida.precoPorParte !== null ? reais(previaValida.custoEstimado) : "—"}
              </span>
              <span className="text-[11px] tabular-nums text-mt-neutral-700">
                {previaValida.precoPorParte !== null
                  ? `${numero(previaValida.destinatarios)} × ${previaValida.tamanho.partes} SMS × ${reais(previaValida.precoPorParte)}`
                  : "Preço por SMS não configurado (SMS_PRECO_POR_PARTE)"}
              </span>
            </div>
            <div className="mt-cartao flex flex-col gap-1">
              <span className={rotulo}>FICARAM DE FORA</span>
              {MOTIVOS_DE_FORA.some((m) => previaValida.fora[m.chave] > 0) ? (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-mt-ink" data-fora-do-publico>
                  {MOTIVOS_DE_FORA.filter((m) => previaValida.fora[m.chave] > 0).map((m) => (
                    <li key={m.chave} className="flex justify-between gap-3">
                      <span>{m.rotulo}</span>
                      <span className="font-extrabold tabular-nums">{numero(previaValida.fora[m.chave])}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-mt-neutral-800">Ninguém: todos que casaram com o critério recebem.</span>
              )}
            </div>
            {previaValida.destinatarios === 0 && (
              <div className={`${faixa} sm:col-span-3`} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-publico-vazio>
                <SinalDeEstado estado="impeditivo" rotulo="Bloqueado" />
                <span>
                  <strong>Sem destinatário:</strong> ninguém casa com este recorte. Alargue o critério ou o período.
                </span>
              </div>
            )}
          </div>
        )}

        <label className="flex max-w-xl flex-col gap-1">
          <span className={rotulo}>NOME DA CAMPANHA</span>
          <input
            type="text"
            className={campo}
            value={nome}
            maxLength={TAMANHO_MAXIMO_DO_NOME}
            onChange={(e) => setNomeDigitado(e.target.value)}
            placeholder="Escolha o carro para sugerir um nome"
            data-nome-da-campanha
          />
          <span className={dica}>Só a equipe vê. É o nome que aparece na lista e no monitoramento.</span>
        </label>

        {erro && (
          <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }}>
            <SinalDeEstado estado="impeditivo" rotulo="Erro" />
            <span>{erro}</span>
          </div>
        )}
        {impedimento && (
          <div className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-impedimento>
            <SinalDeEstado estado="impeditivo" rotulo="Bloqueado" />
            <span>{impedimento}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!podeCriar} className="mt-btn mt-btn-primario mt-foco cursor-pointer px-6 py-3 text-[11px]" data-criar-campanha>
            {criando ? "Criando…" : "Criar campanha"}
          </button>
          <span className={dica}>Criar não envia nada: a campanha fica em rascunho, e o envio é confirmado na tela seguinte.</span>
        </div>
      </section>
    </form>
  );
}

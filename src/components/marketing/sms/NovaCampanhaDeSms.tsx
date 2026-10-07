"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SITE_HOST } from "../../../lib/site";
import {
  CODIGO_DE_EXEMPLO,
  CRITERIOS_DE_CARRO,
  CRITERIOS_DE_PERFIL,
  DESCANSOS_EM_DIAS,
  DESCANSO_PADRAO,
  DESTINOS_SEM_CARRO,
  DIAS_DO_INTERESSE_RECENTE,
  JANELAS_DE_INTERESSE,
  MENSAGEM_PADRAO,
  MENSAGEM_PADRAO_DE_TROCA,
  MENSAGEM_PADRAO_SEM_CARRO,
  PARTES_MAXIMAS,
  RODAPE_DE_SAIDA,
  ROTULO_DO_CRITERIO,
  ROTULO_DO_DESTINO,
  ROTULO_DO_SINAL,
  SINAIS_DE_AFINIDADE,
  TAMANHO_MAXIMO_DO_NOME,
  TEMPOS_DESDE_A_COMPRA,
  VARIAVEIS_DA_MENSAGEM,
  caminhoDoLinkCurto,
  ehCriterioDeCarro,
  montarMensagem,
  percentualDeMatch,
  precoNoSms,
  semAcento,
  tamanhoDoSms,
  type CarroDaCampanha,
  type CriterioDePublico,
  type DescansoEmDias,
  type DestinoSemCarro,
  type JanelaDeInteresse,
  type PedidoDeCampanha,
  type PreviaDaCampanha,
  type TempoDesdeACompra,
} from "../../../lib/smsCampanhas";
import SinalDeEstado, { COR_DO_ESTADO } from "../../admin/consulta/SinalDeEstado";
import { destinoNaFrase, rotuloDoTempoDeCompra } from "./rotulosDaCampanha";

/**
 * O formulário de nova campanha de SMS, em quatro passos numa página só.
 *
 * Quem abre: Administrador e Marketing. Quando: um carro baixou de preço, ou
 * está parado, e há gente que já olhou para ele; ou há um recado para a base
 * (interessados, clientes). Que decisão sai: **para quem mandar, o que dizer e
 * quanto isso custa** — antes de gastar um centavo.
 *
 * O público é escolhido de dois jeitos (pedido do dono em 07/10/2026): POR
 * CARRO, em relação ao carro da campanha, ou POR PERFIL, sem olhar que carro a
 * pessoa viu. Por perfil o carro é opcional: sem ele o link leva ao estoque, e
 * a mensagem não pode usar {carro} nem {preco}.
 *
 * Criar NÃO envia. A campanha nasce rascunho, com o público congelado, e o
 * envio é um segundo gesto, na tela de monitoramento.
 *
 * HORA DE TROCAR (pedido do dono em 07/10/2026): em Clientes e Todos dá para
 * ficar só com quem comprou há tempo bastante, e sem carro o link pode levar à
 * avaliação do usado. O atalho no alto do passo 1 arma os cinco campos de uma vez.
 *
 * A PRÉVIA DE LEADS: além de quantos recebem e quanto custa, o cálculo devolve
 * o alcance de cada critério para o mesmo carro (as camadas), a distribuição do
 * público por percentual de match e uma amostra das primeiras pessoas.
 *
 * A tela nunca vê contato de lead: a prévia que volta do servidor é contagem,
 * primeiro nome e telefone mascarado.
 * A mensagem "como chega" é montada aqui com um nome de exemplo, pela mesma
 * `montarMensagem` do envio — o que se lê é o que sai.
 */

const NOME_DE_EXEMPLO = "Maria";
const JANELA_PADRAO: JanelaDeInteresse = 180;

type ModoDoPublico = "carro" | "perfil";
const MODOS_DO_PUBLICO: Array<{ modo: ModoDoPublico; rotulo: string }> = [
  { modo: "carro", rotulo: "Por carro" },
  { modo: "perfil", rotulo: "Por perfil" },
];

/** O que cada perfil quer dizer, na linha de baixo do seletor. */
const EXPLICACAO_DO_PERFIL: Record<(typeof CRITERIOS_DE_PERFIL)[number], string> = {
  interessados: "quem procurou a loja e ainda não comprou, com ou sem carro identificado",
  clientes: "quem já comprou na loja",
  todos: "os dois",
};

/** As variáveis que só existem com carro escolhido. */
const VARIAVEIS_DE_CARRO = /\{(carro|preco)\}/;

/** O que o atalho "hora de trocar seu carro" arma, além do perfil Clientes e da mensagem de troca. */
const MESES_DA_TROCA: TempoDesdeACompra = 24;
const DESTINO_DA_TROCA: DestinoSemCarro = "avaliacao";
const DESTINO_PADRAO: DestinoSemCarro = "estoque";
const CHAVES_DE_DESTINO = Object.keys(DESTINOS_SEM_CARRO) as DestinoSemCarro[];
/** "o link leva …": a preposição muda com o destino. */
const LEVA_PARA: Record<DestinoSemCarro, string> = { estoque: "ao estoque", avaliacao: "à avaliação do usado" };
/** As mensagens que a tela propõe: quem tem uma delas na caixa não escreveu nada que se perca. */
const MENSAGENS_PADRAO: string[] = [MENSAGEM_PADRAO, MENSAGEM_PADRAO_SEM_CARRO, MENSAGEM_PADRAO_DE_TROCA];

/** O filtro de data de compra só existe nestes perfis: o servidor recusa nos outros. */
const aceitaFiltroDeCompra = (c: CriterioDePublico) => c === "clientes" || c === "todos";

/** Uma série só, a mesma do funil do monitor. Rótulo e valor vão sempre escritos ao lado. */
const COR_DA_SERIE = "var(--cp-serie-fipe)";

const POR_EXTENSO = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const emLista = (itens: string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);
/** Como o match é calculado, numa frase montada das constantes do cálculo. */
const EXPLICACAO_DO_MATCH = `São ${POR_EXTENSO[SINAIS_DE_AFINIDADE.length] ?? SINAIS_DE_AFINIDADE.length} sinais, ${percentualDeMatch(SINAIS_DE_AFINIDADE.slice(0, 1))}% cada: ${emLista(
  SINAIS_DE_AFINIDADE.map((s) => (s === "recente" ? `${ROTULO_DO_SINAL[s]} (últimos ${DIAS_DO_INTERESSE_RECENTE} dias)` : ROTULO_DO_SINAL[s])),
)}.`;

const rotuloDoTempo = (t: TempoDesdeACompra) => (t === null ? "Qualquer data" : rotuloDoTempoDeCompra(t));
const dataCurta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });
};
/** A largura de uma barra, em relação à maior da série. */
const largura = (valor: number, maior: number) => `${maior > 0 ? Math.round((valor / maior) * 1000) / 10 : 0}%`;
/**
 * A amostra chega do servidor já mascarada. Se um dia chegar um número
 * inteiro, a tela não o escreve: a máscara tem sete dígitos, e um telefone, dez ou mais.
 */
const soMascarado = (telefone: string) => (telefone.replace(/\D/g, "").length > 7 ? "••••" : telefone);
const soPrimeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || "Sem nome";

const rotuloDaJanela = (j: JanelaDeInteresse) => (j === null ? "Sempre" : `${j} dias`);
const rotuloDoDescanso = (d: DescansoEmDias) => (d === 0 ? "Sem descanso" : `${d} dias`);
const hojeEmDiaEMes = () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
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
  { chave: "semInteresse", rotulo: "marcados sem interesse na origem" },
  { chave: "descanso", rotulo: "receberam campanha há pouco" },
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
  canais = [],
  impedimento = null,
}: {
  carros: CarroDaCampanha[];
  /** Os canais que existem na base, para o filtro. Vazio esconde o filtro. */
  canais?: string[];
  /** Por que não dá para criar agora (falta a tabela, falta a chave de serviço). `null` libera. */
  impedimento?: string | null;
}) {
  const router = useRouter();
  const caixaDaMensagem = useRef<HTMLTextAreaElement>(null);

  const [busca, setBusca] = useState("");
  const [veiculoId, setVeiculoId] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoDoPublico>("carro");
  // Cada modo lembra o critério que tinha: ir e voltar não desfaz a escolha.
  const [criterioDoModo, setCriterioDoModo] = useState<Record<ModoDoPublico, CriterioDePublico>>({ carro: CRITERIOS_DE_CARRO[0], perfil: CRITERIOS_DE_PERFIL[0] });
  const [janelaDias, setJanelaDias] = useState<JanelaDeInteresse>(JANELA_PADRAO);
  const [canaisEscolhidos, setCanaisEscolhidos] = useState<string[]>([]);
  const [descansoDias, setDescansoDias] = useState<DescansoEmDias>(DESCANSO_PADRAO);
  const [compraHaMeses, setCompraHaMeses] = useState<TempoDesdeACompra>(null);
  const [destino, setDestino] = useState<DestinoSemCarro>(DESTINO_PADRAO);
  // O atalho de troca encontrou uma mensagem escrita à mão: pergunta antes de trocar o texto.
  const [ofereceMensagemDeTroca, setOfereceMensagemDeTroca] = useState(false);
  // `null` é "ainda não mexeu": a mensagem padrão acompanha ter ou não ter carro.
  const [mensagemDigitada, setMensagemDigitada] = useState<string | null>(null);
  const [nomeDigitado, setNomeDigitado] = useState<string | null>(null);
  const [hoje] = useState(hojeEmDiaEMes);

  // A prévia guarda o retrato do pedido com que foi calculada: mudou o modo, o
  // critério, o carro, o período, os canais, o descanso ou a mensagem, e ela
  // deixa de valer sem efeito algum.
  const [previa, setPrevia] = useState<{ chave: string; dados: PreviaDaCampanha } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [telefoneDoTeste, setTelefoneDoTeste] = useState("");
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null);

  const porPerfil = modo === "perfil";
  const criterio = criterioDoModo[modo];
  const carro = carros.find((c) => c.id === veiculoId) ?? null;
  /** Campanha sem carro: só por perfil. O link leva ao destino escolhido. */
  const semCarro = porPerfil && carro === null;
  /** O que vai no pedido: fora de Clientes/Todos não há filtro de compra, e com carro o destino é a ficha. */
  const comFiltroDeCompra = porPerfil && aceitaFiltroDeCompra(criterio);
  const compraDoPedido: TempoDesdeACompra = comFiltroDeCompra ? compraHaMeses : null;
  const destinoDoPedido: DestinoSemCarro = semCarro ? destino : DESTINO_PADRAO;
  const mensagem = mensagemDigitada ?? (semCarro ? MENSAGEM_PADRAO_SEM_CARRO : MENSAGEM_PADRAO);
  const setMensagem = setMensagemDigitada;
  // Na ordem em que a tela os lista, e só os que ainda existem na base.
  const canaisDoPedido = canais.filter((c) => canaisEscolhidos.includes(c));
  const carrosFiltrados = useMemo(() => {
    const termos = normal(busca).split(/\s+/).filter(Boolean);
    // O escolhido fica na lista mesmo fora do filtro: o select não pode mostrar um carro e valer outro.
    return carros.filter((c) => c.id === veiculoId || termos.every((t) => normal(c.rotulo).includes(t)));
  }, [carros, busca, veiculoId]);

  const temAlvo = carro !== null || semCarro;
  const comoChega = temAlvo
    ? montarMensagem(mensagem, {
        nome: NOME_DE_EXEMPLO,
        // Sem carro a prévia usa só nome e link.
        carro: carro?.rotulo ?? "",
        preco: carro ? precoNoSms(carro.preco) : "",
        link: `${SITE_HOST}${caminhoDoLinkCurto(CODIGO_DE_EXEMPLO)}`,
      })
    : null;
  const tamanho = comoChega ? tamanhoDoSms(comoChega) : null;
  const semLink = !mensagem.includes("{link}");
  const mensagemVazia = mensagem.trim() === "";
  const longaDemais = tamanho !== null && tamanho.partes > PARTES_MAXIMAS;
  /** Espelha `lerPedidoDeCampanha`: sem carro, {carro} e {preco} não têm o que mostrar. */
  const variavelSemCarro = semCarro && VARIAVEIS_DE_CARRO.test(mensagem);
  const mensagemServe = !mensagemVazia && !semLink && !longaDemais && !variavelSemCarro;

  const chave = JSON.stringify([modo, carro?.id ?? null, criterio, janelaDias, canaisDoPedido, descansoDias, compraDoPedido, destinoDoPedido, mensagem.trim()]);
  const previaValida = previa !== null && previa.chave === chave ? previa.dados : null;
  const previaVencida = previa !== null && previaValida === null;
  // O servidor pode ser mais velho que a tela: lista que não veio é lista vazia.
  const camadas = previaValida?.camadas ?? [];
  const faixas = previaValida?.faixasDeMatch ?? [];
  const amostra = previaValida?.amostra ?? [];
  const maiorCamada = Math.max(0, ...camadas.map((c) => c.pessoas));
  const maiorFaixa = Math.max(0, ...faixas.map((f) => f.pessoas));
  /** Por perfil não há match: a coluna some. */
  const amostraTemMatch = amostra.some((p) => p.match !== null);

  const sugestaoDeNome = carro
    ? `${carro.rotulo} · ${ROTULO_DO_CRITERIO[criterio]}`.slice(0, TAMANHO_MAXIMO_DO_NOME)
    : semCarro
      ? `${ROTULO_DO_CRITERIO[criterio]} · ${hoje}`
      : "";
  const nome = nomeDigitado ?? sugestaoDeNome;

  const ocupado = calculando || criando;
  const podeCalcular = temAlvo && mensagemServe && !ocupado;
  const podeCriar =
    impedimento === null && temAlvo && mensagemServe && previaValida !== null && previaValida.destinatarios > 0 && nome.trim() !== "" && !ocupado;

  const pedido = (comNome: string): PedidoDeCampanha | null =>
    temAlvo
      ? { nome: comNome, veiculoId: carro?.id ?? null, criterio, janelaDias, canais: canaisDoPedido, descansoDias, compraHaMeses: compraDoPedido, destino: destinoDoPedido, mensagem: mensagem.trim() }
      : null;

  /** Sair de Clientes/Todos zera o filtro de compra: voltar não o traz de volta escondido. */
  const escolherModo = (m: ModoDoPublico) => {
    setModo(m);
    if (m === "carro") setCompraHaMeses(null);
  };
  /** Escolhe o critério no modo a que ele pertence (é o que as camadas da prévia fazem com um clique). */
  const escolherCriterio = (c: CriterioDePublico) => {
    const doModo: ModoDoPublico = ehCriterioDeCarro(c) ? "carro" : "perfil";
    setModo(doModo);
    setCriterioDoModo((antes) => ({ ...antes, [doModo]: c }));
    if (!aceitaFiltroDeCompra(c)) setCompraHaMeses(null);
  };

  /** O atalho: clientes que compraram há tempo bastante, sem carro, com o link para a avaliação. */
  const armarCampanhaDeTroca = () => {
    setModo("perfil");
    setCriterioDoModo((antes) => ({ ...antes, perfil: "clientes" }));
    setCompraHaMeses(MESES_DA_TROCA);
    setVeiculoId(null);
    setDestino(DESTINO_DA_TROCA);
    const escritaAMao = mensagemDigitada !== null && mensagemDigitada.trim() !== "" && !MENSAGENS_PADRAO.includes(mensagemDigitada);
    if (escritaAMao) setOfereceMensagemDeTroca(true);
    else setMensagemDigitada(MENSAGEM_PADRAO_DE_TROCA);
  };
  const usarMensagemDeTroca = () => {
    setMensagemDigitada(MENSAGEM_PADRAO_DE_TROCA);
    setOfereceMensagemDeTroca(false);
  };
  const perguntaDaTroca = ofereceMensagemDeTroca && mensagem !== MENSAGEM_PADRAO_DE_TROCA;

  const alternarCanal = (canal: string) => setCanaisEscolhidos((antes) => (antes.includes(canal) ? antes.filter((c) => c !== canal) : [...antes, canal]));

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
    if (!temAlvo || !mensagemServe || testando) return;
    setTeste(null);
    setTestando(true);
    try {
      const { ok, json } = await ler<RespostaDoTeste>(await fetch("/api/marketing/sms/teste", emJson({ telefone: telefoneDoTeste, veiculoId: carro?.id ?? null, mensagem: mensagem.trim() })));
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
      {/* ── 1 · Quem recebe ─────────────────────────────────────────────────── */}
      <section aria-label="Quem recebe" className={passo}>
        <h3 className={`${rotulo} m-0`}>1 · QUEM RECEBE</h3>
        <div className="flex flex-col gap-1.5" data-atalhos>
          <button type="button" onClick={armarCampanhaDeTroca} className="mt-btn mt-btn-contorno mt-foco cursor-pointer self-start px-4 py-2.5 text-[11px]" data-atalho-de-troca>
            Campanha de troca: hora de trocar seu carro
          </button>
          <span className={dica}>
            Num clique: perfil {ROTULO_DO_CRITERIO.clientes}, comprou há pelo menos {rotuloDoTempo(MESES_DA_TROCA)}, sem carro, link para{" "}
            {destinoNaFrase(DESTINO_DA_TROCA)} e a mensagem de troca. Dá para ajustar tudo depois.
          </span>
          {perguntaDaTroca && (
            <div role="status" className={`${faixa} flex-wrap`} style={{ borderColor: COR_DO_ESTADO.atencao }} data-pergunta-da-troca>
              <SinalDeEstado estado="atencao" />
              <span className="min-w-0 flex-1 basis-64">
                <strong>Atenção:</strong> a mensagem que você escreveu foi mantida. A de troca é: <span className="font-mono">{MENSAGEM_PADRAO_DE_TROCA}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                <button type="button" onClick={usarMensagemDeTroca} className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-2.5 py-1.5 text-[11px]" data-usar-mensagem-de-troca>
                  Usar a mensagem de troca
                </button>
                <button type="button" onClick={() => setOfereceMensagemDeTroca(false)} className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-2.5 py-1.5 text-[11px]" data-manter-a-mensagem>
                  Manter a minha
                </button>
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className={dica}>Como escolher o público</span>
          <div role="radiogroup" aria-label="Modo do público" className="mt-seg flex-wrap self-start">
            {MODOS_DO_PUBLICO.map((m) => (
              <label key={m.modo} className="mt-seg-opt">
                <input type="radio" name="modo-do-publico" value={m.modo} checked={modo === m.modo} onChange={() => escolherModo(m.modo)} />
                {m.rotulo}
              </label>
            ))}
          </div>
        </div>

        {porPerfil ? (
          <div className="flex flex-col gap-1">
            <span className={dica}>Sem olhar que carro a pessoa viu:</span>
            <div role="radiogroup" aria-label="Critério do público" className="mt-seg flex-wrap self-start">
              {CRITERIOS_DE_PERFIL.map((c) => (
                <label key={c} className="mt-seg-opt">
                  <input type="radio" name="criterio-do-publico" value={c} checked={criterio === c} onChange={() => escolherCriterio(c)} />
                  {ROTULO_DO_CRITERIO[c]}
                </label>
              ))}
            </div>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0" data-explicacao-dos-perfis>
              {CRITERIOS_DE_PERFIL.map((c) => (
                <li key={c} className={dica}>
                  <strong className={criterio === c ? "text-mt-ink" : undefined}>{ROTULO_DO_CRITERIO[c]}:</strong> {EXPLICACAO_DO_PERFIL[c]}.
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className={dica}>Quem já demonstrou interesse em…</span>
            <div role="radiogroup" aria-label="Critério do público" className="mt-seg flex-wrap self-start">
              {CRITERIOS_DE_CARRO.map((c) => (
                <label key={c} className="mt-seg-opt">
                  <input type="radio" name="criterio-do-publico" value={c} checked={criterio === c} onChange={() => escolherCriterio(c)} />
                  {ROTULO_DO_CRITERIO[c]}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className={dica} data-rotulo-do-periodo>
            {porPerfil ? "…com contato nos últimos" : "…nos últimos"}
          </span>
          <div role="radiogroup" aria-label={porPerfil ? "Período do contato" : "Período do interesse"} className="mt-seg flex-wrap self-start">
            {JANELAS_DE_INTERESSE.map((j) => (
              <label key={String(j)} className="mt-seg-opt">
                <input type="radio" name="janela-de-interesse" value={String(j)} checked={janelaDias === j} onChange={() => setJanelaDias(j)} />
                {rotuloDaJanela(j)}
              </label>
            ))}
          </div>
        </div>

        {comFiltroDeCompra && (
          <div className="flex flex-col gap-1" data-filtro-de-compra>
            <span className={dica}>Comprou há pelo menos…</span>
            <div role="radiogroup" aria-label="Tempo desde a compra" className="mt-seg flex-wrap self-start">
              {TEMPOS_DESDE_A_COMPRA.map((t) => (
                <label key={String(t)} className="mt-seg-opt">
                  <input type="radio" name="tempo-desde-a-compra" value={String(t)} checked={compraHaMeses === t} onChange={() => setCompraHaMeses(t)} />
                  {rotuloDoTempo(t)}
                </label>
              ))}
            </div>
            <span className={dica}>Com o filtro ligado, só entra quem tem data de compra conhecida.</span>
          </div>
        )}

        {canais.length > 0 && (
          <details className="border border-mt-regua-fina" data-filtro-de-canal>
            <summary className="mt-foco cursor-pointer px-3 py-2 text-xs font-extrabold text-mt-ink">
              Filtrar por canal ·{" "}
              <span className="tabular-nums" data-canais-escolhidos>
                {canaisDoPedido.length === 0 ? "todos os canais" : `${numero(canaisDoPedido.length)} ${canaisDoPedido.length === 1 ? "escolhido" : "escolhidos"}`}
              </span>
            </summary>
            <div className="flex flex-col gap-2 border-t border-mt-regua-fina p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={dica}>Só quem chegou por estes canais. Nenhum marcado vale por todos.</span>
                <button
                  type="button"
                  onClick={() => setCanaisEscolhidos([])}
                  disabled={canaisDoPedido.length === 0}
                  className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-2.5 py-1.5 text-[11px]"
                  data-limpar-canais
                >
                  Limpar
                </button>
              </div>
              <div className="grid max-h-56 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {canais.map((c) => (
                  <label key={c} className="flex min-h-[28px] items-center gap-2 text-xs text-mt-ink">
                    <input type="checkbox" className="mt-foco" checked={canaisEscolhidos.includes(c)} onChange={() => alternarCanal(c)} data-canal={c} />
                    <span className="min-w-0 break-words">{c}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        )}

        <div className="flex flex-col gap-1">
          <span className={rotulo}>DESCANSO</span>
          <div role="radiogroup" aria-label="Descanso entre campanhas" className="mt-seg flex-wrap self-start">
            {DESCANSOS_EM_DIAS.map((d) => (
              <label key={d} className="mt-seg-opt">
                <input type="radio" name="descanso-da-campanha" value={d} checked={descansoDias === d} onChange={() => setDescansoDias(d)} />
                {rotuloDoDescanso(d)}
              </label>
            ))}
          </div>
          <span className={dica}>
            {descansoDias === 0
              ? "Sem descanso: quem recebeu outra campanha ontem recebe esta também."
              : "Quem recebeu qualquer campanha nesse intervalo fica de fora desta."}
          </span>
        </div>

        <p className={dica} data-sempre-de-fora>
          {porPerfil
            ? criterio === "interessados"
              ? "Fica sempre de fora quem já comprou (aqui ou fora), lead descartado, quem está marcado sem interesse, quem não tem celular, quem pediu para sair e quem está no descanso."
              : "Quem já comprou NÃO fica de fora neste perfil. Fica sempre de fora lead descartado, quem está marcado sem interesse, quem não tem celular, quem pediu para sair e quem está no descanso."
            : "Fica sempre de fora quem já comprou (aqui ou fora), quem desistiu daquele interesse, lead descartado, quem está marcado sem interesse, quem não tem celular, quem pediu para sair e quem está no descanso."}
        </p>
      </section>

      {/* ── 2 · O carro ─────────────────────────────────────────────────────── */}
      <section aria-label="Carro" className={passo}>
        <h3 className={`${rotulo} m-0`}>2 · CARRO{porPerfil ? " (OPCIONAL)" : ""}</h3>
        {carros.length === 0 && !porPerfil ? (
          <p className="m-0 text-sm text-mt-neutral-800">Nenhum carro à venda no estoque para anunciar agora. Por perfil, a campanha pode sair sem carro.</p>
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
                <option value="">{porPerfil ? `Sem carro: o link leva ${LEVA_PARA[destino]}` : "Escolha"}</option>
                {carrosFiltrados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo} · {c.preco !== null ? precoNoSms(c.preco) : "sem preço"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {semCarro && (
          <div className="flex flex-col gap-1" data-destino-do-link>
            <span className={dica}>O link leva para</span>
            <div role="radiogroup" aria-label="Destino do link" className="mt-seg flex-wrap self-start">
              {CHAVES_DE_DESTINO.map((d) => (
                <label key={d} className="mt-seg-opt">
                  <input type="radio" name="destino-do-link" value={d} checked={destino === d} onChange={() => setDestino(d)} />
                  {ROTULO_DO_DESTINO[d]}
                </label>
              ))}
            </div>
          </div>
        )}
        {semCarro && (
          <p className={dica} data-sem-carro>
            Sem carro: o link de cada pessoa abre {destinoNaFrase(destino)}, e a mensagem não pode usar {"{carro}"} nem {"{preco}"}.
          </p>
        )}
        {porPerfil && carro && <p className={dica}>Com carro escolhido, o link de cada pessoa abre a ficha dele.</p>}
        {carro && carro.preco === null && (
          <p className={dica}>Este carro está sem preço no estoque: a variável {"{preco}"} sai como “sob consulta”.</p>
        )}
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
                  disabled={semCarro && VARIAVEIS_DE_CARRO.test(v)}
                  title={semCarro && VARIAVEIS_DE_CARRO.test(v) ? "Só com carro escolhido" : undefined}
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
            {variavelSemCarro && (
              <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-aviso-da-mensagem="variavel-sem-carro">
                <SinalDeEstado estado="impeditivo" rotulo="Bloqueado" />
                <span>
                  <strong>Bloqueado:</strong> sem carro escolhido, a mensagem não pode usar {"{carro}"} nem {"{preco}"}. Tire a variável do
                  texto ou escolha um carro.
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
              disabled={testando || !temAlvo || !mensagemServe || telefoneDoTeste.replace(/\D/g, "").length < 10}
              className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-3 text-[11px]"
              data-enviar-teste
            >
              {testando ? "Enviando…" : "Enviar teste"}
            </button>
          </div>
          <p className={dica}>Envia UM SMS de verdade para o número digitado, com esta mensagem{semCarro ? " e o link do estoque" : " e este carro"}. Custa um envio.
            {semCarro && destino !== DESTINO_PADRAO ? ` O link do teste abre sempre o estoque; na campanha, ele abre ${destinoNaFrase(destino)}.` : ""}
          </p>
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
          {!temAlvo && <span className={dica}>Escolha o carro para calcular.</span>}
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
                {canaisDoPedido.length > 0 ? ` · ${numero(canaisDoPedido.length)} ${canaisDoPedido.length === 1 ? "canal" : "canais"}` : ""}
                {compraDoPedido !== null ? ` · comprou há pelo menos ${rotuloDoTempo(compraDoPedido)}` : ""}
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
                  <strong>Sem destinatário:</strong> ninguém casa com este recorte. Alargue o critério, o período ou os canais, ou diminua o descanso.
                </span>
              </div>
            )}
          </div>
        )}

        {previaValida && (camadas.length > 0 || faixas.length > 0) && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {camadas.length > 0 && (
              <div className="flex flex-col gap-2" data-camadas>
                <h4 className="m-0 text-sm font-extrabold text-mt-ink">Quem procurou este carro, e quem procurou parecido</h4>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {camadas.map((c) => {
                    const escolhida = c.criterio === criterio;
                    return (
                      <li key={c.criterio}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!escolhida) escolherCriterio(c.criterio);
                          }}
                          aria-pressed={escolhida}
                          title={escolhida ? "O público desta prévia" : "Clique para usar este público"}
                          className={`mt-foco grid w-full cursor-pointer grid-cols-[minmax(0,150px)_minmax(0,1fr)_64px] items-center gap-3 border bg-transparent px-2 py-1.5 text-left text-xs text-mt-ink hover:bg-mt-surface ${escolhida ? "border-mt-regua" : "border-transparent"}`}
                          data-camada={c.criterio}
                          data-escolhida={escolhida ? "sim" : "nao"}
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                            <span className={escolhida ? "font-extrabold" : undefined}>{ROTULO_DO_CRITERIO[c.criterio]}</span>
                            {escolhida && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-mt-neutral-800" data-marca-de-escolhido>
                                <SinalDeEstado estado="ok" tamanho={14} rotulo="Escolhido" />
                                escolhido
                              </span>
                            )}
                          </span>
                          <span className="block h-4 border-l border-mt-regua">
                            <span className="block h-full" style={{ width: largura(c.pessoas, maiorCamada), minWidth: c.pessoas > 0 ? 2 : 0, background: COR_DA_SERIE }} />
                          </span>
                          <span className="text-right font-extrabold tabular-nums">{numero(c.pessoas)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className={dica}>
                  Pessoas que cada critério alcança, para o mesmo carro, período, canais e descanso. Clique para usar este público: a prévia
                  precisa ser calculada de novo.
                </p>
              </div>
            )}
            {faixas.length > 0 && (
              <div className="flex flex-col gap-2" data-faixas-de-match>
                <h4 className="m-0 text-sm font-extrabold text-mt-ink">Público por percentual de match</h4>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {faixas.map((f) => (
                    <li key={f.match} className="grid grid-cols-[48px_minmax(0,1fr)_64px] items-center gap-3 px-2 py-1.5 text-xs text-mt-ink" data-faixa={f.match}>
                      <span className="tabular-nums">{f.match}%</span>
                      <span className="block h-4 border-l border-mt-regua">
                        <span className="block h-full" style={{ width: largura(f.pessoas, maiorFaixa), minWidth: f.pessoas > 0 ? 2 : 0, background: COR_DA_SERIE }} />
                      </span>
                      <span className="text-right font-extrabold tabular-nums">{numero(f.pessoas)}</span>
                    </li>
                  ))}
                </ul>
                <p className={dica} data-explicacao-do-match>
                  {EXPLICACAO_DO_MATCH}
                </p>
              </div>
            )}
          </div>
        )}

        {previaValida && amostra.length > 0 && (
          <div className="flex flex-col gap-2" data-amostra>
            <h4 className="m-0 text-sm font-extrabold text-mt-ink">
              {amostra.length === 1 ? "A primeira pessoa do público" : `As primeiras ${numero(amostra.length)} pessoas do público`}
            </h4>
            <div className="overflow-x-auto">
              <table className="mt-tabela min-w-[560px] text-xs">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Telefone</th>
                    <th scope="col">Carro que olhou</th>
                    <th scope="col">Quando</th>
                    {amostraTemMatch && <th scope="col">Match</th>}
                  </tr>
                </thead>
                <tbody>
                  {amostra.map((p, i) => (
                    <tr key={i} data-pessoa-da-amostra>
                      <td>{soPrimeiroNome(p.primeiroNome)}</td>
                      <td className="mt-num whitespace-nowrap">{soMascarado(p.telefoneMascarado)}</td>
                      <td className="max-w-[260px] break-words">{p.olhou ?? "—"}</td>
                      <td className="mt-num whitespace-nowrap">{p.quando ? dataCurta(p.quando) : "sem data"}</td>
                      {amostraTemMatch && (
                        <td data-match={p.match ?? "sem"}>
                          {p.match === null ? (
                            "—"
                          ) : (
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <span className="w-9 text-right font-extrabold tabular-nums">{p.match}%</span>
                              <span className="block h-2 w-16 border-l border-mt-regua" aria-hidden="true">
                                <span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, p.match))}%`, background: COR_DA_SERIE }} />
                              </span>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`${dica} tabular-nums`} data-ordem-da-amostra>
              Na ordem de envio: {amostraTemMatch ? "maior match primeiro, depois o contato mais recente" : "o contato mais recente primeiro"}. É uma amostra:{" "}
              {numero(amostra.length)} de {numero(previaValida.destinatarios)}.
            </p>
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
            placeholder={porPerfil ? "Nome da campanha" : "Escolha o carro para sugerir um nome"}
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

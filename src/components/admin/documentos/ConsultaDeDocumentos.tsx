"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "../ConfirmDialog";
import { formatarCnpj, soCaracteresDoCnpj, cnpjValido } from "../../../lib/cnpj";
import { cpfValido, formatarCpf, soDigitosDoCpf } from "../../../lib/cpf";
import { FINALIDADES, type Finalidade, type Nivel, type NivelDaConsulta } from "../../../lib/consultaDeDocumento";
import type { ConsultaDeDocumentoNaLista, LeituraDoHistoricoDeDocumentos, LinkDoRelatorio } from "../../../lib/consultaDeDocumento-servidor";
import { relatorioEmHtml, type RelatorioDeDocumento, type TipoDeDocumento } from "../../../lib/relatorioDeDocumento";

/**
 * `/admin/consulta-documentos` — consulta de CPF e de CNPJ em níveis, com o
 * relatório na tela, em PDF (a impressão do navegador) e num link para
 * enviar, e o histórico de buscas (dono, 18/10/2026).
 *
 * Antes de cobrar: a tela mostra o preço de referência de cada nível e as
 * consultas deste documento já feitas na janela dos parâmetros, que reabrem
 * sem custo; e pede a finalidade e a declaração de que o titular está negociando
 * com a loja (LGPD). A confirmação diz o valor.
 *
 * O relatório da tela é o mesmo HTML do PDF e do link (`relatorioEmHtml`),
 * num iframe sem script: o que vem do fornecedor é texto de terceiros.
 */

type Aba = TipoDeDocumento | "historico";

interface NivelComPreco extends NivelDaConsulta {
  /** Da tabela vigente; `null` quando falta o preço de algum produto. */
  preco: number | null;
  nomesDosProdutos: string[];
}

interface Aberta {
  id: string | null;
  relatorio: RelatorioDeDocumento;
  item: ConsultaDeDocumentoNaLista | null;
  links: LinkDoRelatorio[];
  custo: number | null;
  avisos: string[];
  /** Quando os links foram lidos: "vencido" é contado a partir daqui (a tela não lê o relógio ao desenhar). */
  lidoEm: number;
}

/** Lido só nos tratadores (depois de um fetch), nunca ao desenhar (`react-hooks/purity`). */
const horaDaLeitura = () => Date.now();
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const precoDoNivel = (n: NivelComPreco) => (n.preco === null ? "sem estimativa" : reais(n.preco));
const dataCurta = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const SITUACAO: Record<ConsultaDeDocumentoNaLista["situacao"], string> = { completa: "", parcial: " · parcial", falhou: " · não voltou" };

/** O que a rota de consultar devolve, no sucesso e no erro. */
interface RespostaDaConsulta {
  id?: string | null;
  relatorio?: RelatorioDeDocumento;
  custo?: number | null;
  avisos?: string[];
  error?: string;
  podeTerCobrado?: boolean;
  repeticao?: ConsultaDeDocumentoNaLista;
}
const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
};

const rotulo = "mt-rotulo";
const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";
const campo = "mt-campo-caixa mt-foco w-full";
const aviso = "flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs text-mt-ink";

export default function ConsultaDeDocumentos({ historico, temToken, homologacao }: { historico: LeituraDoHistoricoDeDocumentos; temToken: boolean; homologacao: boolean }) {
  const [aba, setAba] = useState<Aba>("cpf");
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const abrirGuardada = async (id: string) => {
    setErro(null);
    const res = await fetch(`/api/consulta-documento/${id}`);
    const json = (await res.json().catch(() => ({}))) as { relatorio?: RelatorioDeDocumento; item?: ConsultaDeDocumentoNaLista; links?: LinkDoRelatorio[]; error?: string };
    if (!res.ok || !json.relatorio) {
      setErro(json.error || "Não deu para abrir a consulta.");
      return;
    }
    setAberta({ id, relatorio: json.relatorio, item: json.item ?? null, links: json.links ?? [], custo: null, avisos: [], lidoEm: horaDaLeitura() });
  };

  const ABAS: Array<{ chave: Aba; texto: string }> = [
    { chave: "cpf", texto: "CPF · PESSOA" },
    { chave: "cnpj", texto: "CNPJ · EMPRESA" },
    { chave: "historico", texto: "HISTÓRICO" },
  ];

  return (
    <div className="mt-consulta mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className={rotulo}>CONSULTAS</span>
        <h1 className="mt-titulo m-0 text-3xl md:text-4xl">Consulta de CPF e CNPJ</h1>
        <div role="radiogroup" aria-label="Tipo de consulta" className="mt-seg flex-wrap self-start">
          {ABAS.map((a) => (
            <label key={a.chave} className="mt-seg-opt">
              <input type="radio" name="aba-documento" value={a.chave} checked={aba === a.chave} onChange={() => setAba(a.chave)} />
              {a.texto}
            </label>
          ))}
        </div>
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-mt-neutral-800">
          Cadastro, compliance e crédito de quem compra, vende ou financia com a loja. Cada consulta é paga e fica no histórico; a mesma consulta reabre sem custo.
          É dado pessoal: use só para a finalidade declarada.
        </p>
        {homologacao && (
          <div className={aviso} style={{ borderColor: "var(--cp-atencao)" }}>
            <strong>Modo de teste da APIBrasil.</strong> As consultas não cobram e respondem com dados de exemplo.
          </div>
        )}
        {!temToken && (
          <div className={aviso} style={{ borderColor: "var(--cp-impeditivo)" }} role="alert">
            Falta configurar APIBRASIL_TOKEN na Vercel: dá para ver o histórico, mas não consultar.
          </div>
        )}
      </header>

      <div hidden={aba !== "cpf"} data-aba="cpf">
        <FormularioDeDocumento tipo="cpf" temToken={temToken} homologacao={homologacao} aoAbrirGuardada={abrirGuardada} aoConsultar={setAberta} />
      </div>
      <div hidden={aba !== "cnpj"} data-aba="cnpj">
        <FormularioDeDocumento tipo="cnpj" temToken={temToken} homologacao={homologacao} aoAbrirGuardada={abrirGuardada} aoConsultar={setAberta} />
      </div>
      <div hidden={aba !== "historico"} data-aba="historico">
        <HistoricoDeDocumentos inicial={historico} aoAbrir={(id) => void abrirGuardada(id)} />
      </div>

      {erro && (
        <div role="alert" className={aviso} style={{ borderColor: "var(--cp-impeditivo)" }}>
          {erro}
        </div>
      )}
      {/* `key`: trocar de consulta zera o link gerado e o erro — o link de um cliente nunca fica na tela de outro. */}
      {aberta && <PainelDoRelatorio key={aberta.id ?? aberta.relatorio.geradoEm} aberta={aberta} aoMudar={setAberta} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O formulário
// ─────────────────────────────────────────────────────────────────────────────

function FormularioDeDocumento({
  tipo,
  temToken,
  homologacao,
  aoAbrirGuardada,
  aoConsultar,
}: {
  tipo: TipoDeDocumento;
  temToken: boolean;
  homologacao: boolean;
  aoAbrirGuardada: (id: string) => Promise<void>;
  aoConsultar: (a: Aberta) => void;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [documento, setDocumento] = useState("");
  const [niveis, setNiveis] = useState<NivelComPreco[] | null>(null);
  const [recentes, setRecentes] = useState<ConsultaDeDocumentoNaLista[]>([]);
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [finalidade, setFinalidade] = useState<Finalidade | "">("");
  const [ciente, setCiente] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** O erro de carregar os níveis fica separado: um `estimar` que volta bem não pode apagar o aviso de que a consulta pode ter sido cobrada. */
  const [erroDosNiveis, setErroDosNiveis] = useState<string | null>(null);
  const [tabelaDePrecosEm, setTabelaDePrecosEm] = useState<string | null>(null);
  const [diasRecentes, setDiasRecentes] = useState<number | null>(null);
  /** Sobe depois de cada consulta: o `estimar` roda de novo e traz a recém-feita em "já consultado". */
  const [rodada, setRodada] = useState(0);

  const normalizado = tipo === "cpf" ? soDigitosDoCpf(documento) : soCaracteresDoCnpj(documento);
  const valido = tipo === "cpf" ? cpfValido(normalizado) : cnpjValido(normalizado);
  const escolhido = niveis?.find((n) => n.id === nivel) ?? null;

  // Com o documento válido, o servidor diz os níveis, os preços e o que já foi consultado. Não cobra.
  const pedido = useRef(0);
  useEffect(() => {
    if (!valido) return;
    const meu = ++pedido.current;
    void (async () => {
      let res: Response;
      try {
        res = await fetch("/api/consulta-documento", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ acao: "estimar", tipo, documento: normalizado }) });
      } catch {
        if (meu === pedido.current) setErroDosNiveis("Sem conexão com o servidor: não deu para carregar os níveis.");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        niveis?: NivelComPreco[];
        recentes?: ConsultaDeDocumentoNaLista[];
        tabelaDePrecosEm?: string;
        diasDeConsultaRecente?: number;
        error?: string;
      };
      if (meu !== pedido.current) return;
      if (!res.ok || !json.niveis) {
        setErroDosNiveis(json.error || "Não deu para carregar os níveis.");
        return;
      }
      setErroDosNiveis(null);
      setNiveis(json.niveis);
      setRecentes(json.recentes ?? []);
      setTabelaDePrecosEm(json.tabelaDePrecosEm ?? null);
      setDiasRecentes(json.diasDeConsultaRecente ?? null);
    })();
  }, [valido, normalizado, tipo, rodada]);

  const formatado = tipo === "cpf" ? formatarCpf(normalizado) : formatarCnpj(normalizado);

  /** Manda a consulta. Devolve a repetição recusada (409), para a tela perguntar. */
  const enviar = async (n: NivelComPreco, repetir: boolean): Promise<{ repeticao: ConsultaDeDocumentoNaLista; motivo: string } | null> => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/consulta-documento", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "consultar", tipo, documento: normalizado, nivel: n.id, finalidade, titularCiente: ciente, repetir }),
      });
      const json = (await res.json().catch(() => ({}))) as RespostaDaConsulta;
      if (res.status === 409 && json.repeticao) return { repeticao: json.repeticao, motivo: json.error ?? "" };
      if (!res.ok || !json.relatorio) {
        // Sem corpo de erro (504 da Vercel, 500 cru) não dá para saber se o fornecedor cobrou.
        const semResposta = !json.error || res.status >= 500;
        const cobrou = json.podeTerCobrado || (semResposta && !json.error);
        setErro(
          (json.error || "A consulta não voltou a tempo.") +
            (cobrou && !homologacao ? " Ela PODE ter sido cobrada: antes de repetir, confira o histórico e o saldo no painel da APIBrasil." : ""),
        );
        // Pode ter cobrado: a declaração volta em branco, e o próximo clique é uma decisão nova.
        if (cobrou) setCiente(false);
        // A tentativa que falhou também fica no histórico.
        if (json.id || semResposta) {
          setRodada((v) => v + 1);
          router.refresh();
        }
        return null;
      }
      aoConsultar({ id: json.id ?? null, relatorio: json.relatorio, item: null, links: [], custo: json.custo ?? null, avisos: json.avisos ?? [], lidoEm: horaDaLeitura() });
      // Feita a consulta, o formulário volta a pedir nível e declaração: mais um clique não cobra de novo.
      setNivel(null);
      setCiente(false);
      setRodada((v) => v + 1);
      router.refresh();
      return null;
    } catch {
      setErro("Sem conexão com o servidor. A consulta PODE ter sido feita: antes de repetir, confira o histórico e o saldo no painel da APIBrasil.");
      return null;
    } finally {
      setCarregando(false);
    }
  };

  const consultar = async () => {
    if (!valido || !escolhido || !finalidade || !ciente || carregando) return;
    const jaFeita = recentes.find((r) => r.nivel === escolhido.id);
    const ok = await confirm({
      title: "Consulta paga",
      message:
        `${escolhido.rotulo} de ${formatado}: ${escolhido.nomesDosProdutos.join(" + ")}. ` +
        (homologacao ? "Em modo de teste: não cobra." : escolhido.preco === null ? "O preço deste nível não está na tabela; o valor exato vem na resposta." : `Cerca de ${reais(escolhido.preco)} no saldo da APIBrasil (o valor exato vem na resposta).`) +
        (jaFeita ? ` Este nível já foi consultado em ${quando(jaFeita.quando)} por ${jaFeita.quem ?? "alguém da equipe"}: dá para abrir aquela sem custo.` : ""),
      confirmLabel: homologacao ? "Consultar em teste" : "Consultar e pagar",
      type: "warning",
    });
    if (!ok) return;
    const recusa = await enviar(escolhido, false);
    if (!recusa) return;
    const { repeticao } = recusa;
    // A anterior que falhou não tem o que abrir: o aviso é sobre o saldo.
    const falhou = repeticao.situacao === "falhou";
    const repetir = await confirm({
      title: falhou ? "Tentativa anterior pode ter sido cobrada" : "Consultado há pouco",
      message: falhou
        ? `${recusa.motivo} (${quando(repeticao.quando)}, ${repeticao.quem ?? "alguém da equipe"}.)`
        : `${repeticao.nivelRotulo} de ${formatado} foi consultado em ${quando(repeticao.quando)} por ${repeticao.quem ?? "alguém da equipe"}. Abrir aquela não custa nada; consultar de novo cobra outra vez.`,
      confirmLabel: "Consultar de novo e pagar",
      cancelLabel: falhou ? "Cancelar" : "Abrir a anterior",
      type: "warning",
    });
    if (repetir) await enviar(escolhido, true);
    else if (!falhou) await aoAbrirGuardada(repeticao.id);
  };

  return (
    <div className="flex flex-col gap-5">
      <label className="flex max-w-sm flex-col gap-1">
        <span className={rotulo}>{tipo === "cpf" ? "CPF" : "CNPJ"}</span>
        <input
          className={`${campo} font-mono tracking-wider`}
          inputMode={tipo === "cpf" ? "numeric" : "text"}
          autoComplete="off"
          placeholder={tipo === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
          value={documento}
          onChange={(e) => {
            // Uma resposta do `estimar` ainda no ar é de outro documento: descarta.
            pedido.current++;
            setDocumento(e.target.value);
            setNiveis(null);
            setNivel(null);
            setRecentes([]);
          }}
          onBlur={() => valido && setDocumento(tipo === "cpf" ? formatarCpf(normalizado) : formatarCnpj(normalizado))}
          data-documento={tipo}
        />
        {documento && !valido && normalizado.length >= (tipo === "cpf" ? 11 : 14) && <span className="text-[11px] font-bold text-mt-ink">Dígitos não conferem.</span>}
      </label>

      {recentes.length > 0 && (
        <section className="flex flex-col gap-2 border border-mt-regua-fina bg-mt-surface p-4" data-recentes>
          <span className={rotulo}>JÁ CONSULTADO NOS ÚLTIMOS {diasRecentes ?? "—"} DIAS · REABRIR NÃO CUSTA</span>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {recentes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 text-xs">
                <span>
                  {quando(r.quando)} · {r.nivelRotulo}
                  {SITUACAO[r.situacao]} · {r.quem ?? "—"}
                </span>
                <button type="button" className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[11px]" onClick={() => void aoAbrirGuardada(r.id)}>
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {niveis && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={`${rotulo} mb-2`}>NÍVEL DA CONSULTA</legend>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {niveis.map((n) => (
              <label
                key={n.id}
                className={`flex cursor-pointer flex-col gap-1 border-2 bg-mt-surface p-4 ${nivel === n.id ? "border-mt-ink" : "border-mt-regua-fina"}`}
                data-nivel={n.id}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-extrabold text-mt-ink">
                    <input type="radio" name={`nivel-${tipo}`} value={n.id} checked={nivel === n.id} onChange={() => setNivel(n.id)} />
                    {n.rotulo}
                  </span>
                  <span className="text-sm font-extrabold tabular-nums text-mt-ink">{precoDoNivel(n)}</span>
                </span>
                <span className="text-xs text-mt-neutral-800">{n.traz}</span>
                {n.deixaDeFora && <span className="text-[11px] text-mt-neutral-700">Fica de fora: {n.deixaDeFora}</span>}
                <span className="text-[11px] text-mt-neutral-600">{n.nomesDosProdutos.join(" + ")}</span>
              </label>
            ))}
          </div>
          <p className={dica}>
            Preço de referência da tabela da APIBrasil{tabelaDePrecosEm ? ` de ${dataCurta(tabelaDePrecosEm)}` : ""}; o valor exato de cada consulta vem na resposta e fica no histórico.
          </p>
        </fieldset>
      )}

      {niveis && (
        <div className="flex flex-col gap-3">
          <label className="flex max-w-sm flex-col gap-1">
            <span className={rotulo}>FINALIDADE (LGPD)</span>
            <select className={campo} value={finalidade} onChange={(e) => setFinalidade(e.target.value as Finalidade | "")} data-finalidade>
              <option value="">Escolha</option>
              {(Object.keys(FINALIDADES) as Finalidade[]).map((f) => (
                <option key={f} value={f}>
                  {FINALIDADES[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-xs text-mt-ink">
            <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} data-ciente />
            <span>O titular está em negociação com a loja e sabe que seus dados serão consultados para esta finalidade.</span>
          </label>
          <button
            type="button"
            className="mt-btn mt-btn-primario mt-foco cursor-pointer self-start px-5 py-3 text-[11px]"
            disabled={carregando || !temToken || !valido || !escolhido || !finalidade || !ciente}
            onClick={() => void consultar()}
            data-consultar
          >
            {carregando ? "Consultando…" : escolhido ? `Consultar · ${homologacao ? "teste" : precoDoNivel(escolhido)}` : "Escolha o nível"}
          </button>
        </div>
      )}

      {erroDosNiveis && (
        <div role="alert" className={aviso} style={{ borderColor: "var(--cp-impeditivo)" }}>
          {erroDosNiveis}
        </div>
      )}
      {erro && (
        <div role="alert" className={aviso} style={{ borderColor: "var(--cp-impeditivo)" }}>
          {erro}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O relatório: tela, PDF e link
// ─────────────────────────────────────────────────────────────────────────────

function PainelDoRelatorio({ aberta, aoMudar }: { aberta: Aberta; aoMudar: (a: Aberta) => void }) {
  const { confirm } = useConfirm();
  const quadro = useRef<HTMLIFrameElement>(null);
  const [link, setLink] = useState<{ id: string | null; url: string; expiraEm: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const html = useMemo(
    () => relatorioEmHtml(aberta.relatorio, { rodape: "Documento confidencial da Motors Store. Dados pessoais protegidos pela LGPD.", imprimir: false }),
    [aberta.relatorio],
  );

  const ajustarAltura = () => {
    const corpo = quadro.current?.contentDocument?.documentElement;
    if (quadro.current && corpo) quadro.current.style.height = `${corpo.scrollHeight + 16}px`;
  };

  const imprimir = () => {
    if (aberta.id) window.open(`/api/consulta-documento/${aberta.id}/relatorio`, "_blank", "noopener");
    else quadro.current?.contentWindow?.print();
  };

  const recarregarLinks = async () => {
    if (!aberta.id) return;
    const res = await fetch(`/api/consulta-documento/${aberta.id}`);
    const json = (await res.json().catch(() => ({}))) as { links?: LinkDoRelatorio[] };
    if (res.ok) aoMudar({ ...aberta, links: json.links ?? [], lidoEm: horaDaLeitura() });
  };

  const gerarLink = async () => {
    if (!aberta.id) return;
    setErro(null);
    const res = await fetch(`/api/consulta-documento/${aberta.id}/links`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; expiraEm?: string; error?: string };
    if (!res.ok || !json.url || !json.expiraEm) {
      setErro(json.error || "Não deu para criar o link.");
      return;
    }
    setLink({ id: json.id ?? null, url: json.url, expiraEm: json.expiraEm });
    setCopiado(false);
    await recarregarLinks();
  };

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const revogar = async (id: string) => {
    const ok = await confirm({ title: "Revogar link", message: "Quem tiver o link deixa de abrir o relatório. Não dá para desfazer.", confirmLabel: "Revogar", type: "danger" });
    if (!ok) return;
    const res = await fetch(`/api/consulta-documento/links/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setErro(json.error || "Não deu para revogar o link.");
      return;
    }
    if (link?.id === id) setLink(null);
    await recarregarLinks();
  };

  const agora = aberta.lidoEm;
  return (
    <section aria-label="Relatório" className="flex flex-col gap-4 border-t-2 border-mt-regua pt-5" data-relatorio-aberto>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className={rotulo}>RELATÓRIO · {aberta.relatorio.nivel.toUpperCase()}</span>
          <span className="text-lg font-extrabold text-mt-ink">
            {aberta.relatorio.titular ?? aberta.relatorio.documento} <span className="font-mono text-sm font-normal text-mt-neutral-700">{aberta.relatorio.documento}</span>
          </span>
          {aberta.custo !== null && <span className="text-[11px] text-mt-neutral-700">Esta consulta custou {reais(aberta.custo)}.</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2 text-[11px]" onClick={imprimir} data-imprimir-relatorio>
            Imprimir / salvar PDF
          </button>
          <button
            type="button"
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2 text-[11px]"
            onClick={() => void gerarLink()}
            disabled={!aberta.id}
            title={aberta.id ? undefined : "A consulta não ficou guardada: sem registro não há link."}
            data-gerar-link
          >
            Gerar link para enviar
          </button>
        </div>
      </div>

      {aberta.avisos.map((a) => (
        <div key={a} className={aviso} style={{ borderColor: "var(--cp-atencao)" }}>
          {a}
        </div>
      ))}
      {erro && (
        <div role="alert" className={aviso} style={{ borderColor: "var(--cp-impeditivo)" }}>
          {erro}
        </div>
      )}

      {link && (
        <div className="flex flex-col gap-2 border border-mt-regua bg-mt-surface p-4" data-link-gerado>
          <span className={rotulo}>LINK PARA ENVIAR · VALE ATÉ {quando(link.expiraEm)}</span>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${campo} max-w-xl font-mono text-xs`} readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-2 text-[11px]" onClick={() => void copiar()}>
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className={dica}>Quem tiver o link abre o relatório até a validade, sem login. Mande só para quem precisa (banco, financeira, o próprio titular). Este endereço não aparece de novo: guarde ou gere outro.</p>
        </div>
      )}

      {aberta.links.length > 0 && (
        <div className="overflow-x-auto">
          <table className="mt-tabela text-xs" data-links>
            <thead>
              <tr>
                <th scope="col">Criado</th>
                <th scope="col">Por</th>
                <th scope="col">Vale até</th>
                <th scope="col" className="mt-num">
                  Aberturas
                </th>
                <th scope="col">Situação</th>
                <th scope="col">
                  <span className="sr-only">Revogar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {aberta.links.map((l) => {
                const vencido = new Date(l.expiraEm).getTime() < agora;
                return (
                  <tr key={l.id}>
                    <td className="tabular-nums">{quando(l.criadoEm)}</td>
                    <td>{l.quem ?? "—"}</td>
                    <td className="tabular-nums">{quando(l.expiraEm)}</td>
                    <td className="mt-num">{l.acessos}</td>
                    <td>{l.revogadoEm ? "Revogado" : vencido ? "Vencido" : "Ativo"}</td>
                    <td>
                      {!l.revogadoEm && !vencido && (
                        <button type="button" className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[11px]" onClick={() => void revogar(l.id)}>
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <iframe
        ref={quadro}
        title={`Relatório de ${aberta.relatorio.documento}`}
        srcDoc={html}
        // Sem script dentro: só a cópia do mesmo-origem para medir a altura e imprimir.
        sandbox="allow-same-origin allow-modals"
        onLoad={ajustarAltura}
        className="w-full border border-mt-regua-fina bg-white"
        style={{ minHeight: 480 }}
        data-quadro-do-relatorio
      />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O histórico
// ─────────────────────────────────────────────────────────────────────────────

function HistoricoDeDocumentos({ inicial, aoAbrir }: { inicial: LeituraDoHistoricoDeDocumentos; aoAbrir: (id: string) => void }) {
  const [termo, setTermo] = useState("");
  const [tipo, setTipo] = useState<"" | TipoDeDocumento>("");
  const [daPesquisa, setDaPesquisa] = useState<LeituraDoHistoricoDeDocumentos | null>(null);
  const pedido = useRef(0);
  const semPesquisa = termo.trim() === "" && tipo === "";
  const leitura = semPesquisa ? inicial : (daPesquisa ?? inicial);

  useEffect(() => {
    if (semPesquisa) return;
    const meu = ++pedido.current;
    const relogio = setTimeout(async () => {
      const res = await fetch(`/api/consulta-documento?${new URLSearchParams({ q: termo.trim(), tipo })}`);
      const json = (await res.json().catch(() => ({}))) as LeituraDoHistoricoDeDocumentos & { error?: string };
      if (meu !== pedido.current) return;
      setDaPesquisa(res.ok && json.ok ? json : { ok: false, faltaMigracao: false, motivo: json.error || "A pesquisa não voltou." });
    }, 300);
    return () => clearTimeout(relogio);
  }, [termo, tipo, semPesquisa]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className={rotulo}>PESQUISAR</span>
          <input type="search" className={campo} placeholder="Nome, razão social, ou o começo do CPF/CNPJ" value={termo} onChange={(e) => setTermo(e.target.value)} data-pesquisa-documentos />
        </label>
        <div role="radiogroup" aria-label="Documento" className="mt-seg">
          {(
            [
              ["", "Todos"],
              ["cpf", "CPF"],
              ["cnpj", "CNPJ"],
            ] as Array<["" | TipoDeDocumento, string]>
          ).map(([v, t]) => (
            <label key={t} className="mt-seg-opt">
              <input type="radio" name="tipo-historico" value={v} checked={tipo === v} onChange={() => setTipo(v)} />
              {t}
            </label>
          ))}
        </div>
      </div>
      <p className={dica}>Abrir uma consulta do histórico não consulta de novo e não custa nada.</p>

      {!leitura.ok && (
        <div role="alert" className={aviso} style={{ borderColor: "var(--cp-impeditivo)" }}>
          {leitura.faltaMigracao ? "As tabelas das consultas ainda não existem no banco (migração 20261018120000_consultas_de_documento)." : leitura.motivo}
        </div>
      )}
      {leitura.ok && leitura.itens.length === 0 && <p className="m-0 text-sm text-mt-neutral-800">{semPesquisa ? "Nenhuma consulta feita ainda." : "Nenhuma consulta com esse filtro."}</p>}
      {leitura.ok && leitura.itens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="mt-tabela text-xs" data-historico-documentos>
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Documento</th>
                <th scope="col">Nome</th>
                <th scope="col">Nível</th>
                <th scope="col">Finalidade</th>
                <th scope="col" className="mt-num">
                  Custo
                </th>
                <th scope="col">Quem</th>
                <th scope="col">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {leitura.itens.map((i) => (
                <tr key={i.id} data-consulta={i.tipo}>
                  <td className="whitespace-nowrap tabular-nums">{quando(i.quando)}</td>
                  <td className="whitespace-nowrap font-mono">{i.documento}</td>
                  <td className="font-extrabold">{i.nome ?? "—"}</td>
                  <td>
                    {i.nivelRotulo}
                    {SITUACAO[i.situacao]}
                  </td>
                  <td>{i.finalidade}</td>
                  <td className="mt-num whitespace-nowrap">{i.homologacao ? "teste" : i.custo === null ? "—" : reais(i.custo)}</td>
                  <td>{i.quem ?? "—"}</td>
                  <td>
                    <button type="button" className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[11px]" onClick={() => aoAbrir(i.id)}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

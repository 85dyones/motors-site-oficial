"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CONTATOS_POR_LOTE,
  agruparPorPessoa,
  lerPlanilha,
  type ContatoImportado,
  type OrigemDeImportacao,
  type RespostaDoLoteDeImportacao,
  type ResumoDaPlanilha,
} from "../../../lib/baseDeMarketing";
import type { LeituraDaBase } from "../../../lib/baseDeMarketing-servidor";
import type { EstadoDaChecagem } from "../../../lib/consultaDePlaca";
import { useConfirm } from "../../admin/ConfirmDialog";
import SinalDeEstado, { COR_DO_ESTADO } from "../../admin/consulta/SinalDeEstado";
import { lerArquivoComoTabela } from "./lerArquivo";

/**
 * `/admin/marketing/base` — a base de contatos das campanhas, e a importação
 * dela a partir de planilha (pedido do dono em 07/10/2026: "preciso ser capaz
 * de fazer upload da lista de interessados ou migrar minha base Revenda
 * completa para o site novo").
 *
 * Quem abre: Administrador e Marketing. Quando: na migração do RevendaMais, e
 * sempre que houver uma lista nova para somar. Que decisão sai: **este arquivo
 * entra? Quanta gente ele traz, e de que tipo?** — a prévia responde antes de
 * qualquer coisa subir, e o histórico deixa desfazer.
 *
 * O arquivo é lido NO NAVEGADOR. Só o que `lerPlanilha` reconhece vira
 * `ContatoImportado` e sobe; CPF, RG, endereço e qualquer outra coluna ficam
 * na máquina de quem fez o upload.
 *
 * Nada aqui lista pessoa: a base e a prévia são contagem.
 */

const ROTULO_DA_ORIGEM: Record<OrigemDeImportacao, string> = {
  revenda_mais: "Exportação do RevendaMais",
  planilha: "Planilha comum",
};

/** Quantos canais e marcas a tela lista antes de resumir o resto. */
const ITENS_NA_LISTA = 12;

const numero = (n: number) => n.toLocaleString("pt-BR");
const pessoas = (n: number) => `${numero(n)} ${n === 1 ? "pessoa" : "pessoas"}`;
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

interface ArquivoLido {
  nome: string;
  origem: OrigemDeImportacao;
  resumo: ResumoDaPlanilha;
  contatos: ContatoImportado[];
  colunasIgnoradas: string[];
}

const SOMA_ZERADA: RespostaDoLoteDeImportacao = { contatosNovos: 0, contatosAtualizados: 0, registrosNovos: 0, recusados: 0 };

interface ImportacaoEmCurso {
  id: string;
  arquivo: string;
  total: number;
  /** Quantas pessoas já foram aceitas pela rota (o começo do próximo lote). */
  enviadas: number;
  soma: RespostaDoLoteDeImportacao;
  estado: "enviando" | "parada" | "concluida";
  erro: string | null;
}

const emJson = (metodo: string, corpo: unknown): RequestInit => ({ method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

async function ler<T>(res: Response): Promise<{ ok: boolean; json: T & { error?: string } }> {
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, json };
}

/** Uma lista de contagens com barra proporcional. Uma série, uma cor, todas na mesma escala. */
function ListaComBarras({ titulo, itens, vazio, chave }: { titulo: string; itens: Array<{ nome: string; pessoas: number }>; vazio: string; chave: string }) {
  const mostrados = itens.slice(0, ITENS_NA_LISTA);
  const escala = Math.max(1, ...mostrados.map((i) => i.pessoas));
  return (
    <div className="flex flex-col gap-2" data-lista={chave}>
      <span className="mt-rotulo">{titulo}</span>
      {mostrados.length === 0 ? (
        <span className="text-xs text-mt-neutral-800">{vazio}</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {mostrados.map((i) => (
            <li key={i.nome} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_64px] items-center gap-3 text-xs">
              <span className="truncate text-mt-neutral-800" title={i.nome}>
                {i.nome}
              </span>
              <span className="block h-3 border-l border-mt-regua" aria-hidden="true">
                <span className="block h-full" style={{ width: `${Math.round((i.pessoas / escala) * 1000) / 10}%`, minWidth: 2, background: "var(--cp-serie-fipe)" }} />
              </span>
              <span className="text-right font-extrabold tabular-nums text-mt-ink">{numero(i.pessoas)}</span>
            </li>
          ))}
        </ul>
      )}
      {itens.length > mostrados.length && (
        <span className="text-[11px] tabular-nums text-mt-neutral-700">
          e mais {numero(itens.length - mostrados.length)} com menos gente
        </span>
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, nota, chave }: { rotulo: string; valor: number; nota?: string; chave: string }) {
  return (
    <div className="mt-cartao flex flex-col gap-0.5" data-cartao={chave}>
      <dt className="mt-rotulo">{rotulo}</dt>
      <dd className="mt-titulo m-0 text-3xl tabular-nums">{numero(valor)}</dd>
      {nota && <span className="text-[11px] tabular-nums text-mt-neutral-700">{nota}</span>}
    </div>
  );
}

export default function BaseDeContatos({
  leitura,
  migracao,
  semChaveDeServico = false,
}: {
  leitura: LeituraDaBase;
  /** O nome da migração que cria as tabelas da base, para o aviso. */
  migracao: string;
  /** A porta devolveu 503: falta `SUPABASE_SERVICE_ROLE_KEY`, e nada pôde ser lido. */
  semChaveDeServico?: boolean;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const campoDoArquivo = useRef<HTMLInputElement>(null);

  const [lendo, setLendo] = useState(false);
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<ArquivoLido | null>(null);
  const [importacao, setImportacao] = useState<ImportacaoEmCurso | null>(null);
  const [erroDeCriar, setErroDeCriar] = useState<string | null>(null);

  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [desfeita, setDesfeita] = useState<{ ok: boolean; texto: string } | null>(null);

  const emCurso = useRef(false);
  const importando = importacao?.estado === "enviando";

  // Fechar a aba no meio deixa a importação pela metade: o navegador pergunta antes.
  useEffect(() => {
    if (!importando) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [importando]);

  const faltaMigracao = !leitura.ok && leitura.faltaMigracao;
  const impedimento = semChaveDeServico
    ? "Falta a chave de serviço do banco no servidor: não dá para importar agora."
    : faltaMigracao
      ? "As tabelas da base ainda não existem no banco: não dá para importar agora."
      : null;

  const avisos: Array<{ chave: string; estado: EstadoDaChecagem; rotulo: string; texto: ReactNode }> = [];
  if (semChaveDeServico) {
    avisos.push({
      chave: "servico",
      estado: "impeditivo",
      rotulo: "Configuração",
      texto: (
        <>
          Falta a variável <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> no servidor. Sem ela a base não pode ser lida
          nem receber importação.
        </>
      ),
    });
  }
  if (faltaMigracao) {
    avisos.push({
      chave: "migracao",
      estado: "impeditivo",
      rotulo: "Configuração",
      texto: (
        <>
          As tabelas da base de contatos ainda não existem no banco. Aplique a migração <code className="font-mono">{migracao}</code> no
          Supabase para liberar a importação.
        </>
      ),
    });
  }
  if (!leitura.ok && !leitura.faltaMigracao && !semChaveDeServico) {
    avisos.push({ chave: "leitura", estado: "impeditivo", rotulo: "Erro", texto: <>A base não pôde ser lida: {leitura.motivo}</> });
  }

  const resumo = leitura.ok ? leitura.resumo : null;
  const importacoes = leitura.ok ? leitura.importacoes : [];

  // ── Ler o arquivo, no navegador ────────────────────────────────────────────
  const escolher = async (file: File | undefined) => {
    if (!file || importando) return;
    setArquivo(null);
    setErroDoArquivo(null);
    setErroDeCriar(null);
    setImportacao(null);
    setLendo(true);
    try {
      const planilha = lerPlanilha(await lerArquivoComoTabela(file));
      if (!planilha.ok) {
        setErroDoArquivo(planilha.motivo);
        return;
      }
      const { contatos, resumo: resumoDaPlanilha } = agruparPorPessoa(planilha.linhas, planilha.origem);
      setArquivo({ nome: file.name, origem: planilha.origem, resumo: resumoDaPlanilha, contatos, colunasIgnoradas: planilha.colunasIgnoradas });
    } catch (e) {
      setErroDoArquivo(e instanceof Error && e.name === "ErroDeLeituraDoArquivo" ? e.message : "Não consegui ler o arquivo. Salve como CSV e envie de novo.");
    } finally {
      setLendo(false);
    }
  };

  // ── Enviar os lotes, em sequência ──────────────────────────────────────────
  const enviarLotes = async (de: ImportacaoEmCurso, contatos: ContatoImportado[]) => {
    if (emCurso.current) return;
    emCurso.current = true;
    let atual: ImportacaoEmCurso = { ...de, estado: "enviando", erro: null };
    setImportacao(atual);
    try {
      while (atual.enviadas < contatos.length) {
        const fatia = contatos.slice(atual.enviadas, atual.enviadas + CONTATOS_POR_LOTE);
        let resposta: { ok: boolean; json: Partial<RespostaDoLoteDeImportacao> & { error?: string } };
        try {
          resposta = await ler<Partial<RespostaDoLoteDeImportacao>>(await fetch(`/api/marketing/base/importacoes/${atual.id}/lote`, emJson("POST", { contatos: fatia })));
        } catch {
          atual = { ...atual, estado: "parada", erro: "Sem conexão com o servidor." };
          break;
        }
        if (!resposta.ok || typeof resposta.json.contatosNovos !== "number") {
          atual = { ...atual, estado: "parada", erro: resposta.json.error || "O servidor não aceitou este lote." };
          break;
        }
        const r = resposta.json;
        atual = {
          ...atual,
          enviadas: atual.enviadas + fatia.length,
          soma: {
            contatosNovos: atual.soma.contatosNovos + (r.contatosNovos ?? 0),
            contatosAtualizados: atual.soma.contatosAtualizados + (r.contatosAtualizados ?? 0),
            registrosNovos: atual.soma.registrosNovos + (r.registrosNovos ?? 0),
            recusados: atual.soma.recusados + (r.recusados ?? 0),
          },
        };
        setImportacao(atual);
      }
      if (atual.estado === "enviando") atual = { ...atual, estado: "concluida" };
      setImportacao(atual);
      if (atual.estado === "concluida") {
        // O arquivo já entrou: sai da tela para não ser importado de novo por engano.
        setArquivo(null);
        if (campoDoArquivo.current) campoDoArquivo.current.value = "";
      }
    } finally {
      emCurso.current = false;
      // O resumo da base e o histórico são do servidor, e já mudaram mesmo que tenha parado no meio.
      router.refresh();
    }
  };

  const importar = async () => {
    if (!arquivo || arquivo.contatos.length === 0 || impedimento || emCurso.current) return;
    const lotes = Math.ceil(arquivo.contatos.length / CONTATOS_POR_LOTE);
    const ok = await confirm({
      title: "Importar para a base de contatos",
      message: `${pessoas(arquivo.resumo.pessoas)} de “${arquivo.nome}” ${arquivo.resumo.pessoas === 1 ? "entra" : "entram"} na base das campanhas, em ${numero(lotes)} ${lotes === 1 ? "lote" : "lotes"}. Quem já está na base (mesmo celular) é atualizado, e não duplicado. Dá para desfazer depois, no histórico.`,
      confirmLabel: `Importar ${pessoas(arquivo.resumo.pessoas)}`,
      cancelLabel: "Ainda não",
      type: "warning",
    });
    if (!ok) return;
    setErroDeCriar(null);
    let id: string;
    try {
      const { ok: criou, json } = await ler<{ id?: string }>(
        await fetch("/api/marketing/base/importacoes", emJson("POST", { origem: arquivo.origem, arquivo: arquivo.nome, linhas: arquivo.resumo.linhas })),
      );
      if (!criou || !json.id) {
        setErroDeCriar(json.error || "A importação não foi aberta. Nada entrou na base.");
        return;
      }
      id = json.id;
    } catch {
      setErroDeCriar("Sem conexão com o servidor. Nada entrou na base.");
      return;
    }
    await enviarLotes({ id, arquivo: arquivo.nome, total: arquivo.contatos.length, enviadas: 0, soma: SOMA_ZERADA, estado: "enviando", erro: null }, arquivo.contatos);
  };

  const continuar = async () => {
    if (!arquivo || !importacao || importacao.estado !== "parada") return;
    await enviarLotes(importacao, arquivo.contatos);
  };

  const desfazer = async (id: string, nomeDoArquivo: string | null, novas: number) => {
    const ok = await confirm({
      title: "Desfazer a importação",
      message: `Remove da base ${novas === 1 ? "a pessoa" : `as ${numero(novas)} pessoas`} que esta importação CRIOU${nomeDoArquivo ? ` (“${nomeDoArquivo}”)` : ""} , com TODOS os registros dessas pessoas (inclusive os que outra importação acrescentou a elas) e os envios de SMS feitos para elas. Pessoas que já existiam antes ficam na base, do jeito que esta importação as deixou: quem ela marcou como cliente continua cliente. Se você importou outro arquivo depois deste, importe-o de novo em seguida. Não tem volta.`,
      confirmLabel: "Desfazer importação",
      cancelLabel: "Manter",
      type: "danger",
    });
    if (!ok) return;
    setDesfeita(null);
    setDesfazendo(id);
    try {
      const { ok: desfez, json } = await ler<{ contatosRemovidos?: number; registrosRemovidos?: number }>(await fetch(`/api/marketing/base/importacoes/${id}`, { method: "DELETE" }));
      if (!desfez) {
        setDesfeita({ ok: false, texto: json.error || "A importação não foi desfeita." });
        return;
      }
      setDesfeita({
        ok: true,
        texto: `${pessoas(json.contatosRemovidos ?? 0)} e ${numero(json.registrosRemovidos ?? 0)} ${json.registrosRemovidos === 1 ? "registro saiu" : "registros saíram"} da base.`,
      });
      router.refresh();
    } catch {
      setDesfeita({ ok: false, texto: "Sem conexão com o servidor." });
    } finally {
      setDesfazendo(null);
    }
  };

  const rotulo = "mt-rotulo";
  const dica = "m-0 text-[11px] leading-relaxed text-mt-neutral-700";
  const secao = "flex flex-col gap-4 border-t-2 border-mt-regua pt-6";
  const faixa = "flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs leading-relaxed text-mt-ink";
  const previa = arquivo?.resumo ?? null;
  const pct = importacao && importacao.total > 0 ? Math.round((importacao.enviadas / importacao.total) * 100) : 0;

  return (
    <div className="mt-consulta mx-auto flex w-full max-w-6xl flex-col gap-8" data-base-de-contatos>
      <header className="flex flex-col gap-3">
        <span className={rotulo}>MARKETING</span>
        <h1 className="mt-titulo m-0 text-3xl md:text-4xl">Base de contatos</h1>
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-mt-neutral-800">
          A base de pessoas das campanhas, importada de planilha. Não é a fila de leads dos vendedores: quem entra aqui não vai para
          o kanban nem dispara alerta.
        </p>
        <Link href="/admin/marketing/sms" className="mt-foco self-start text-sm text-mt-ink underline underline-offset-2">
          ← Campanhas de SMS
        </Link>
      </header>

      {avisos.length > 0 && (
        <div className="flex flex-col gap-2" data-avisos-de-configuracao>
          {avisos.map((a) => (
            <div key={a.chave} role="alert" data-aviso={a.chave} className={faixa} style={{ borderColor: COR_DO_ESTADO[a.estado] }}>
              <SinalDeEstado estado={a.estado} rotulo={a.rotulo} />
              <span>
                <strong>{a.rotulo}:</strong> {a.texto}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── O resumo da base ────────────────────────────────────────────────── */}
      <section aria-label="Resumo da base" className="flex flex-col gap-4">
        <h2 className="mt-titulo m-0 text-xl">Resumo da base</h2>
        {!resumo ? (
          <div className="mt-cartao flex flex-col gap-1" data-base-indisponivel>
            <span className="text-sm font-extrabold text-mt-ink">O resumo não está disponível.</span>
            <span className="text-xs leading-relaxed text-mt-neutral-800">Veja o aviso no alto da página.</span>
          </div>
        ) : resumo.pessoas === 0 ? (
          <div className="mt-cartao flex flex-col gap-1" data-base-vazia>
            <span className="text-sm font-extrabold text-mt-ink">A base está vazia.</span>
            <span className="text-xs leading-relaxed text-mt-neutral-800">
              O primeiro passo é exportar os leads (e, se quiser, os clientes) do RevendaMais e escolher o arquivo logo abaixo. A tela
              mostra quantas pessoas ele traz antes de qualquer coisa entrar.
            </span>
          </div>
        ) : (
          <>
            <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-5" data-resumo-da-base>
              <Cartao chave="pessoas" rotulo="PESSOAS" valor={resumo.pessoas} nota="um celular, uma pessoa" />
              <Cartao chave="interessados-com-carro" rotulo="INTERESSADOS COM CARRO" valor={resumo.interessadosComCarro} nota="servem às campanhas por carro" />
              <Cartao chave="interessados-sem-carro" rotulo="INTERESSADOS SEM CARRO" valor={resumo.interessadosSemCarro} nota="só às campanhas por perfil" />
              <Cartao chave="clientes" rotulo="CLIENTES" valor={resumo.clientes} nota={`${numero(resumo.comDataDeCompra)} com data de compra`} />
              <Cartao chave="sem-interesse" rotulo="SEM INTERESSE" valor={resumo.semInteresse} nota="não recebem campanha" />
            </dl>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ListaComBarras chave="canais" titulo="CANAIS" itens={resumo.canais.map((c) => ({ nome: c.canal, pessoas: c.pessoas }))} vazio="Nenhum canal registrado." />
              <ListaComBarras chave="marcas" titulo="MARCAS MAIS PROCURADAS" itens={resumo.marcas.map((m) => ({ nome: m.marca, pessoas: m.pessoas }))} vazio="Nenhuma marca registrada." />
            </div>
            <p className={dica}>As barras contam pessoas. Quem chegou por dois canais, ou olhou duas marcas, conta nas duas.</p>
          </>
        )}
      </section>

      {/* ── Importar ────────────────────────────────────────────────────────── */}
      <section aria-label="Importar" className={secao}>
        <h2 className="mt-titulo m-0 text-xl">Importar planilha</h2>
        <label className="flex max-w-xl flex-col gap-1">
          <span className={rotulo}>ARQUIVO</span>
          <input
            ref={campoDoArquivo}
            type="file"
            accept=".xls,.xlsx,.csv,.txt,.html"
            className="mt-campo-caixa mt-foco w-full"
            disabled={lendo || importando}
            onChange={(e) => void escolher(e.target.files?.[0])}
            data-arquivo-da-base
          />
          <span className={dica}>
            A exportação do RevendaMais (.xls), Excel (.xlsx) ou CSV. O arquivo é lido neste navegador: nada sobe antes de você
            conferir a prévia e confirmar.
          </span>
        </label>

        {lendo && (
          <p role="status" className="m-0 text-xs text-mt-ink" data-lendo-arquivo>
            Lendo o arquivo…
          </p>
        )}
        {erroDoArquivo && (
          <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-erro-do-arquivo>
            <SinalDeEstado estado="impeditivo" rotulo="Arquivo recusado" />
            <span>
              <strong>Arquivo recusado:</strong> {erroDoArquivo}
            </span>
          </div>
        )}

        {arquivo && previa && (
          <div className="flex flex-col gap-4" data-previa-da-planilha>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-mt-ink">
              <strong className="break-all">{arquivo.nome}</strong>
              <span className="text-xs text-mt-neutral-800" data-origem-reconhecida={arquivo.origem}>
                {ROTULO_DA_ORIGEM[arquivo.origem]}
              </span>
              <span className="text-xs tabular-nums text-mt-neutral-800" data-periodo-da-planilha>
                {previa.de && previa.ate ? `de ${dia(previa.de)} até ${dia(previa.ate)}` : "sem data nas linhas"}
              </span>
            </div>

            <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4" data-numeros-da-previa>
              <Cartao chave="previa-linhas" rotulo="LINHAS LIDAS" valor={previa.linhas} nota={`${numero(previa.semCelular)} sem celular, que ficam de fora`} />
              <Cartao chave="previa-pessoas" rotulo="PESSOAS" valor={previa.pessoas} nota="um celular, uma pessoa" />
              <Cartao chave="previa-clientes" rotulo="CLIENTES" valor={previa.clientes} nota={`${numero(previa.comDataDeCompra)} com data de compra`} />
              <Cartao chave="previa-sem-interesse" rotulo="MARCADOS SEM INTERESSE" valor={previa.semInteresse} nota="entram, e não recebem campanha" />
              <Cartao chave="previa-com-carro" rotulo="INTERESSADOS COM CARRO" valor={previa.interessadosComCarro} />
              <Cartao chave="previa-sem-carro" rotulo="INTERESSADOS SEM CARRO" valor={previa.interessadosSemCarro} />
              <Cartao chave="previa-registros" rotulo="REGISTROS COM CARRO" valor={previa.registrosComCarro} nota="linhas que dizem que carro foi" />
            </dl>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ListaComBarras chave="previa-canais" titulo="CANAIS NO ARQUIVO" itens={previa.canais.map((c) => ({ nome: c.canal, pessoas: c.pessoas }))} vazio="O arquivo não diz o canal." />
              <ListaComBarras chave="previa-marcas" titulo="MARCAS NO ARQUIVO" itens={previa.marcas.map((m) => ({ nome: m.marca, pessoas: m.pessoas }))} vazio="O arquivo não diz a marca." />
            </div>

            <div className={faixa} style={{ borderColor: COR_DO_ESTADO.nao_conferido }} data-colunas-ignoradas>
              <SinalDeEstado estado="nao_conferido" rotulo="Colunas ignoradas" />
              <span className="min-w-0 break-words">
                <strong>Colunas ignoradas ({numero(arquivo.colunasIgnoradas.length)}):</strong>{" "}
                {arquivo.colunasIgnoradas.length > 0 ? arquivo.colunasIgnoradas.join(", ") : "nenhuma"}. Colunas não reconhecidas, como CPF, RG e
                endereço, NÃO são enviadas ao servidor: ficam neste computador.
              </span>
            </div>

            {previa.pessoas === 0 && (
              <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-previa-sem-pessoas>
                <SinalDeEstado estado="impeditivo" rotulo="Bloqueado" />
                <span>
                  <strong>Sem ninguém para importar:</strong> nenhuma linha tem celular válido (com DDD e o 9 na frente).
                </span>
              </div>
            )}

            {impedimento && (
              <div className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-impedimento>
                <SinalDeEstado estado="impeditivo" rotulo="Bloqueado" />
                <span>{impedimento}</span>
              </div>
            )}

            {(!importacao || importacao.estado === "concluida") && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void importar()}
                  disabled={previa.pessoas === 0 || impedimento !== null}
                  className="mt-btn mt-btn-primario mt-foco cursor-pointer px-6 py-3 text-[11px]"
                  data-importar
                >
                  Importar {pessoas(previa.pessoas)}
                </button>
                <span className={dica}>Pede confirmação. Quem já está na base é atualizado, e não duplicado.</span>
              </div>
            )}
          </div>
        )}

        {erroDeCriar && (
          <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-erro-de-criar>
            <SinalDeEstado estado="impeditivo" rotulo="Erro" />
            <span>{erroDeCriar}</span>
          </div>
        )}

        {importacao && (
          <div className="flex flex-col gap-3 border border-mt-regua-fina p-4" data-importacao={importacao.estado} aria-live="polite">
            <span className="inline-flex items-center gap-2 text-sm font-extrabold text-mt-ink">
              <SinalDeEstado
                estado={importacao.estado === "concluida" ? "ok" : importacao.estado === "parada" ? "impeditivo" : "atencao"}
                tamanho={20}
                rotulo={importacao.estado === "concluida" ? "Concluída" : importacao.estado === "parada" ? "Parada" : "Importando"}
              />
              {importacao.estado === "concluida" ? "Importação concluída" : importacao.estado === "parada" ? "Importação parada" : "Importando…"}
              <span className="break-all font-normal text-mt-neutral-800">· {importacao.arquivo}</span>
            </span>
            <div className="flex flex-col gap-1.5">
              <div
                role="progressbar"
                aria-label="Progresso da importação"
                aria-valuemin={0}
                aria-valuemax={importacao.total}
                aria-valuenow={importacao.enviadas}
                aria-valuetext={`${numero(importacao.enviadas)} de ${numero(importacao.total)} pessoas`}
                className="h-3 w-full border border-mt-regua bg-mt-bg"
              >
                <div className="h-full" style={{ width: `${pct}%`, background: "var(--cp-serie-fipe)" }} />
              </div>
              <span className="text-xs tabular-nums text-mt-ink" data-progresso-da-importacao>
                {numero(importacao.enviadas)} de {numero(importacao.total)} pessoas enviadas · {pct}%
              </span>
            </div>
            <dl className="m-0 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4" data-contadores-da-importacao>
              {(
                [
                  ["novas", "PESSOAS NOVAS", importacao.soma.contatosNovos],
                  ["atualizadas", "ATUALIZADAS", importacao.soma.contatosAtualizados],
                  ["registros", "REGISTROS NOVOS", importacao.soma.registrosNovos],
                  ["recusadas", "RECUSADAS", importacao.soma.recusados],
                ] as const
              ).map(([chave, titulo, valor]) => (
                <div key={chave} className="flex flex-col gap-0.5 border border-mt-regua-fina bg-mt-surface p-3" data-contador={chave}>
                  <dt className={rotulo}>{titulo}</dt>
                  <dd className="mt-titulo m-0 text-xl tabular-nums">{numero(valor)}</dd>
                </div>
              ))}
            </dl>
            {importacao.estado === "enviando" && <p className={dica}>Mantenha esta página aberta até o fim. Os lotes vão um de cada vez.</p>}
            {importacao.estado === "parada" && (
              <>
                <div role="alert" className={faixa} style={{ borderColor: COR_DO_ESTADO.impeditivo }} data-erro-do-lote>
                  <SinalDeEstado estado="impeditivo" rotulo="Erro" />
                  <span>
                    <strong>Parou no meio:</strong> {importacao.erro} {pessoas(importacao.enviadas)} de {numero(importacao.total)} já{" "}
                    {importacao.enviadas === 1 ? "entrou" : "entraram"} na base; continuar retoma do lote que falhou, sem repetir ninguém.
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void continuar()} disabled={!arquivo} className="mt-btn mt-btn-primario mt-foco cursor-pointer px-6 py-3 text-[11px]" data-continuar-importacao>
                    Continuar
                  </button>
                  <span className={dica}>Faltam {pessoas(importacao.total - importacao.enviadas)}.</span>
                </div>
              </>
            )}
            {importacao.estado === "concluida" && (
              <p className="m-0 text-xs leading-relaxed text-mt-ink" data-resumo-final>
                {pessoas(importacao.soma.contatosNovos)} {importacao.soma.contatosNovos === 1 ? "nova" : "novas"}, {numero(importacao.soma.contatosAtualizados)}{" "}
                {importacao.soma.contatosAtualizados === 1 ? "atualizada" : "atualizadas"}, {numero(importacao.soma.registrosNovos)}{" "}
                {importacao.soma.registrosNovos === 1 ? "registro novo" : "registros novos"}
                {importacao.soma.recusados > 0 ? ` e ${numero(importacao.soma.recusados)} ${importacao.soma.recusados === 1 ? "recusada" : "recusadas"} pelo servidor (celular inválido)` : ""}. A
                importação aparece no histórico abaixo, de onde dá para desfazer.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── O histórico ─────────────────────────────────────────────────────── */}
      <section aria-label="Histórico de importações" className={secao}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="mt-titulo m-0 text-xl">Histórico de importações</h2>
          {importacoes.length > 0 && (
            <span className="text-xs tabular-nums text-mt-neutral-700">
              {numero(importacoes.length)} {importacoes.length === 1 ? "importação" : "importações"}
            </span>
          )}
        </div>

        {desfeita && (
          <div role={desfeita.ok ? "status" : "alert"} className={faixa} style={{ borderColor: COR_DO_ESTADO[desfeita.ok ? "ok" : "impeditivo"] }} data-importacao-desfeita={desfeita.ok ? "ok" : "erro"}>
            <SinalDeEstado estado={desfeita.ok ? "ok" : "impeditivo"} rotulo={desfeita.ok ? "Desfeita" : "Erro"} />
            <span>
              <strong>{desfeita.ok ? "Importação desfeita:" : "Não desfeita:"}</strong> {desfeita.texto}
            </span>
          </div>
        )}

        {importacoes.length === 0 ? (
          <div className="mt-cartao flex flex-col gap-1" data-historico-vazio>
            <span className="text-sm font-extrabold text-mt-ink">{leitura.ok ? "Nenhuma importação ainda." : "O histórico não está disponível."}</span>
            <span className="text-xs leading-relaxed text-mt-neutral-800">
              {leitura.ok ? "Cada arquivo importado vira uma linha aqui, com o que ele trouxe e a opção de desfazer." : "Veja o aviso no alto da página."}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-tabela min-w-[920px] text-xs" data-historico-de-importacoes>
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Quem</th>
                  <th scope="col">Arquivo</th>
                  <th scope="col">Origem</th>
                  <th scope="col" className="mt-num text-right">Linhas</th>
                  <th scope="col" className="mt-num text-right">Pessoas novas</th>
                  <th scope="col" className="mt-num text-right">Atualizadas</th>
                  <th scope="col" className="mt-num text-right">Registros novos</th>
                  <th scope="col">
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {importacoes.map((i) => (
                  <tr key={i.id} data-importacao-do-historico={i.id}>
                    <td className="mt-num whitespace-nowrap">{dataHora(i.criadoEm)}</td>
                    <td>{i.criadoPorNome ?? "—"}</td>
                    <td className="max-w-[240px] break-all">{i.arquivo ?? "—"}</td>
                    <td>{ROTULO_DA_ORIGEM[i.origem] ?? i.origem}</td>
                    <td className="mt-num text-right">{numero(i.linhas)}</td>
                    <td className="mt-num text-right">{numero(i.contatosNovos)}</td>
                    <td className="mt-num text-right">{numero(i.contatosAtualizados)}</td>
                    <td className="mt-num text-right">{numero(i.registrosNovos)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => void desfazer(i.id, i.arquivo, i.contatosNovos)}
                        disabled={desfazendo !== null || importando}
                        className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-2 text-[11px]"
                        data-desfazer={i.id}
                      >
                        {desfazendo === i.id ? "Desfazendo…" : "Desfazer"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`${dica} mt-2`}>
              Desfazer remove as pessoas que aquela importação criou, com todos os registros delas. Quem já existia antes fica na base como a importação deixou (o que foi atualizado não volta atrás). Depois de desfazer, importe de novo os arquivos que vieram depois.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

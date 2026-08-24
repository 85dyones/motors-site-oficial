"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readFileWithEncodingAutoDetect } from "@/lib/encodingUtils";
import { dataDeHoje } from "../../lib/financeiroDia";

/**
 * Conciliação bancária — P4 do briefing de 2026-08-21.
 *
 * A tela é desenhada ao contrário do instinto: o que ocupa o centro NÃO é o
 * que conciliou, é o que **sobrou**. Conciliado é uma linha de resumo; as duas
 * listas grandes são "está no banco e não no sistema" (tarifa, juros, débito
 * que ninguém lançou) e "está no sistema e não no banco" (pagamento
 * registrado que nunca compensou).
 *
 * É onde mora o trabalho dela. Uma tela que celebra "97% conciliado" e esconde
 * os 3% inverte a utilidade da ferramenta.
 */

interface LinhaExtrato {
  id: string;
  fitid: string;
  data: string;
  valor: number | string;
  tipo: "entrada" | "saida";
  descricao: string;
  movimentacao_id: string | null;
  conciliado_como: "automatico" | "manual" | null;
}

interface Movimentacao {
  id: string;
  data_movimentacao: string;
  valor: number | string;
  tipo: "entrada" | "saida";
  descricao: string;
  forma_pagamento?: string | null;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
  icone?: string;
}

interface Sugestao {
  fitid: string;
  candidatos: { movimentacaoId: string; distanciaEmDias: number }[];
}

interface Estado {
  periodo: { inicio: string; fim: string };
  linhas: LinhaExtrato[];
  movimentacoes: Movimentacao[];
  prontasParaCasar: { fitid: string; movimentacaoId: string }[];
  sugestoes: Sugestao[];
  soNoBanco: LinhaExtrato[];
  soNoSistema: Movimentacao[];
  resumo: {
    linhasDoBanco: number;
    conciliadas: number;
    aConfirmar: number;
    soNoBanco: number;
    soNoSistema: number;
    valorSoNoBanco: number;
    valorSoNoSistema: number;
  };
}

const formatPrice = (value: number | string) => {
  const n = typeof value === "number" ? value : parseFloat(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const formatDate = (dateStr: string) => {
  const p = dateStr.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : dateStr;
};

export default function ConciliacaoBancaria() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Lançar a partir do extrato: qual linha, e a classificação que só uma
  // pessoa sabe dar.
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lancando, setLancando] = useState<string | null>(null);
  const [categoriaEscolhida, setCategoriaEscolhida] = useState("");
  const [parceiro, setParceiro] = useState("");

  const hoje = dataDeHoje();
  const [inicio, setInicio] = useState(() => `${hoje.slice(0, 7)}-01`);
  const [fim, setFim] = useState(hoje);

  const entradaDeArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async (de: string, ate: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/financeiro/conciliacao?inicio=${de}&fim=${ate}`);
      const body = await res.json();
      if (res.ok) {
        setEstado(body);
        setErro("");
      } else {
        setErro(body.error || "Falha ao carregar a conciliação.");
      }
    } catch {
      setErro("Erro ao se conectar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar(inicio, fim);
  }, [inicio, fim, carregar]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/financeiro/categorias", { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          setCategorias(body.categories || body.categorias || []);
        }
      } catch {
        // Sem categorias o botão de lançar fica sem opção e a rota recusa
        // com mensagem — melhor que derrubar a tela inteira da conciliação.
      }
    })();
  }, []);

  /** Importa o OFX e roda o casamento; sem arquivo, só roda o casamento. */
  const enviar = async (conteudo?: string) => {
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch(`/api/financeiro/conciliacao?inicio=${inicio}&fim=${fim}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conteudo ? { conteudo } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        setErro(body.error || "Falha ao processar o extrato.");
        return;
      }
      const partes: string[] = [];
      if (conteudo) {
        partes.push(`${body.importadas} linha(s) importada(s)`);
        if (body.repetidas > 0) {
          partes.push(`${body.repetidas} já estavam aqui (reimportação não duplica)`);
        }
      }
      partes.push(`${body.casadas} conciliada(s) automaticamente`);
      if (body.aConfirmar > 0) partes.push(`${body.aConfirmar} aguardam sua confirmação`);
      setAviso(partes.join(" · "));
      carregar(inicio, fim);
    } catch {
      setErro("Erro ao se conectar com o servidor.");
    } finally {
      setOcupado(false);
    }
  };

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro("");
    try {
      // O mesmo leitor do importador do RevendaMais: OFX de banco brasileiro
      // costuma vir em Latin-1, e ler como UTF-8 estraga todo acento.
      const conteudo = await readFileWithEncodingAutoDetect(arquivo);
      await enviar(conteudo);
    } catch {
      setErro("Não consegui ler o arquivo.");
    } finally {
      // Permite subir o MESMO arquivo de novo (o input não dispara `change`
      // com o mesmo valor) — acontece depois de corrigir um lançamento.
      if (entradaDeArquivo.current) entradaDeArquivo.current.value = "";
    }
  };

  const conciliarLinha = async (linhaId: string, movimentacaoId: string) => {
    setOcupado(true);
    setErro("");
    try {
      const res = await fetch(`/api/financeiro/conciliacao/${linhaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimentacao_id: movimentacaoId }),
      });
      const body = await res.json();
      if (res.ok) {
        setAviso("Conciliado.");
        carregar(inicio, fim);
      } else {
        setErro(body.error || "Falha ao conciliar.");
      }
    } catch {
      setErro("Erro de rede.");
    } finally {
      setOcupado(false);
    }
  };

  const abrirLancamento = (l: LinhaExtrato) => {
    setLancando(l.id);
    setCategoriaEscolhida("");
    // O extrato já traz o texto do banco; quem lança ajusta se quiser.
    setParceiro("");
    setErro("");
    setAviso("");
  };

  const lancar = async (l: LinhaExtrato) => {
    setOcupado(true);
    setErro("");
    try {
      const res = await fetch(`/api/financeiro/conciliacao/${l.id}/lancar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria_id: categoriaEscolhida,
          parceiro: parceiro || undefined,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setAviso(
          `Lançado e conciliado: ${l.descricao} · ${formatPrice(l.valor)}. A conta entra no caixa com a data do extrato.`,
        );
        setLancando(null);
        setCategoriaEscolhida("");
        setParceiro("");
        carregar(inicio, fim);
      } else {
        setErro(body.error || "Falha ao lançar.");
      }
    } catch {
      setErro("Erro ao se conectar com o servidor.");
    } finally {
      setOcupado(false);
    }
  };

  const desfazer = async (linhaId: string) => {
    setOcupado(true);
    setErro("");
    try {
      const res = await fetch(`/api/financeiro/conciliacao/${linhaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desfazer: true }),
      });
      const body = await res.json();
      if (res.ok) {
        setAviso("Conciliação desfeita — a linha volta para a lista.");
        carregar(inicio, fim);
      } else {
        setErro(body.error || "Falha ao desfazer.");
      }
    } catch {
      setErro("Erro de rede.");
    } finally {
      setOcupado(false);
    }
  };

  const movPorId = new Map((estado?.movimentacoes ?? []).map((m) => [m.id, m]));
  const linhaPorFitid = new Map((estado?.linhas ?? []).map((l) => [l.fitid, l]));
  const conciliadas = (estado?.linhas ?? []).filter((l) => l.movimentacao_id);

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl">
      {/* Ações */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 select-none">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-mt-neutral-700 uppercase tracking-wider">De</span>
            <input
              type="date"
              value={inicio}
              onChange={(e) => e.target.value && setInicio(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 cursor-pointer focus:outline-none focus:border-mt-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-mt-neutral-700 uppercase tracking-wider">Até</span>
            <input
              type="date"
              value={fim}
              onChange={(e) => e.target.value && setFim(e.target.value)}
              className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-10 cursor-pointer focus:outline-none focus:border-mt-accent"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => enviar()}
            disabled={ocupado}
            className="h-10 px-4 bg-mt-surface hover:bg-mt-accent-100 text-mt-ink border border-mt-regua-fina text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60"
            title="Roda o casamento de novo, sem subir arquivo — útil depois de lançar o que faltava"
          >
            Conciliar de novo
          </button>
          <input
            ref={entradaDeArquivo}
            type="file"
            accept=".ofx,.OFX,text/plain,application/x-ofx"
            onChange={aoEscolherArquivo}
            className="hidden"
          />
          <button
            onClick={() => entradaDeArquivo.current?.click()}
            disabled={ocupado}
            className="h-10 px-4 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60"
          >
            {ocupado ? "Processando..." : "Importar extrato OFX"}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-mt-neutral-700 max-w-[640px] select-none">
        Baixe o extrato no internet banking em formato <strong>OFX</strong> (alguns bancos
        chamam de &ldquo;Money&rdquo; ou &ldquo;Dinheiro Fácil&rdquo;). Pode subir o mesmo
        período mais de uma vez — linha repetida não duplica.
      </p>

      {aviso && (
        <div className="bg-mt-surface border border-mt-regua-fina text-mt-accent-800 text-xs px-4 py-3 select-none">
          {aviso}
        </div>
      )}
      {erro && (
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-3 select-none">
          {erro}
        </div>
      )}

      {isLoading || !estado ? (
        <div className="py-16 text-center text-xs text-mt-neutral-700">Carregando...</div>
      ) : (
        <>
          {/* Régua de KPIs. As duas últimas são as que importam. */}
          <div className="grid select-none grid-cols-1 border-t-2 border-mt-regua sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                rotulo: "Linhas do banco",
                valor: String(estado.resumo.linhasDoBanco),
                cor: "text-mt-ink",
                nota: `${estado.resumo.conciliadas} conciliada(s)`,
              },
              {
                rotulo: "Aguardando confirmação",
                valor: String(estado.sugestoes.length),
                cor: estado.sugestoes.length > 0 ? "text-mt-accent" : "text-mt-ink",
                nota: "mais de um candidato — você decide",
              },
              {
                rotulo: "No banco, fora do sistema",
                valor: formatPrice(estado.resumo.valorSoNoBanco),
                cor: estado.resumo.soNoBanco > 0 ? "text-mt-accent" : "text-mt-ink",
                nota: `${estado.resumo.soNoBanco} lançamento(s) · tarifa, juros, débito não lançado`,
              },
              {
                rotulo: "No sistema, fora do banco",
                valor: formatPrice(estado.resumo.valorSoNoSistema),
                cor: estado.resumo.soNoSistema > 0 ? "text-mt-accent" : "text-mt-ink",
                nota: `${estado.resumo.soNoSistema} lançamento(s) · registrado e não compensado`,
              },
            ].map((k) => (
              <div
                key={k.rotulo}
                className="flex flex-col gap-2 border-b border-mt-regua-fina px-0 py-4 pr-5 lg:border-b-0 lg:border-r lg:last:border-r-0"
              >
                <span className="mt-rotulo">{k.rotulo}</span>
                <span className={`text-2xl font-extrabold tracking-[-.03em] tabular-nums ${k.cor}`}>
                  {k.valor}
                </span>
                <span className="text-[11px] leading-tight text-mt-neutral-700">{k.nota}</span>
              </div>
            ))}
          </div>

          {estado.prontasParaCasar.length > 0 && (
            <div className="bg-mt-surface border border-mt-accent-300 px-4 py-3 flex items-center justify-between gap-4 select-none">
              <span className="text-xs text-mt-ink">
                <strong>{estado.prontasParaCasar.length}</strong> linha(s) têm par exato e ainda
                não foram conciliadas.
              </span>
              <button
                onClick={() => enviar()}
                disabled={ocupado}
                className="h-9 px-4 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60 shrink-0"
              >
                Conciliar
              </button>
            </div>
          )}

          {/* Sugestões — o gesto humano que o motor não faz sozinho. */}
          {estado.sugestoes.length > 0 && (
            <Secao
              titulo="Aguardando sua confirmação"
              descricao="Mais de um lançamento do sistema tem o mesmo valor e data próxima. Escolher sozinho é onde uma conciliação erra caro e em silêncio — por isso a escolha é sua."
              contagem={estado.sugestoes.length}
            >
              <div className="flex flex-col divide-y divide-mt-regua-fina">
                {estado.sugestoes.map((s) => {
                  const linha = linhaPorFitid.get(s.fitid);
                  if (!linha) return null;
                  return (
                    <div key={s.fitid} className="py-4 flex flex-col gap-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-bold text-mt-ink">{linha.descricao}</span>
                          <span className="text-[10px] text-mt-neutral-600">
                            Extrato · {formatDate(linha.data)}
                          </span>
                        </div>
                        <span
                          className={`text-[14px] font-extrabold tabular-nums shrink-0 ${
                            linha.tipo === "entrada" ? "text-mt-accent-800" : "text-mt-accent"
                          }`}
                        >
                          {linha.tipo === "entrada" ? "+" : "−"} {formatPrice(linha.valor)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 pl-4 border-l-2 border-mt-regua-fina">
                        {s.candidatos.map((c) => {
                          const m = movPorId.get(c.movimentacaoId);
                          return (
                            <div key={c.movimentacaoId} className="flex items-center justify-between gap-3">
                              <span className="text-[11px] text-mt-neutral-700">
                                {m?.descricao ?? "(movimentação)"} ·{" "}
                                {m ? formatDate(m.data_movimentacao) : "—"}
                                {c.distanciaEmDias > 0 && (
                                  <span className="text-mt-neutral-600">
                                    {" "}
                                    ({c.distanciaEmDias}d de diferença)
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() => conciliarLinha(linha.id, c.movimentacaoId)}
                                disabled={ocupado}
                                className="h-7 px-3 border border-mt-regua-fina text-mt-neutral-700 hover:border-mt-accent hover:text-mt-accent text-[9px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60 shrink-0"
                              >
                                É esta
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Secao>
          )}

          {/* As duas listas que justificam a tela. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <Secao
              titulo="No banco, fora do sistema"
              descricao="Dinheiro que se moveu na conta e não existe no caixa — tarifa, juros, débito que ninguém lançou. Clique em Lançar: valor, data e descrição já vêm do banco, você só classifica."
              contagem={estado.soNoBanco.length}
              vazio="Tudo que passou pelo banco está lançado. ✓"
            >
              <div className="flex flex-col divide-y divide-mt-regua-fina">
                {estado.soNoBanco.map((l) => (
                  <div key={l.id} className="py-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[13px] font-bold text-mt-ink truncate">{l.descricao}</span>
                        <span className="text-[10px] text-mt-neutral-600">{formatDate(l.data)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[13px] font-extrabold tabular-nums ${
                            l.tipo === "entrada" ? "text-mt-accent-800" : "text-mt-accent"
                          }`}
                        >
                          {l.tipo === "entrada" ? "+" : "−"} {formatPrice(l.valor)}
                        </span>
                        {lancando !== l.id && (
                          <button
                            onClick={() => abrirLancamento(l)}
                            disabled={ocupado}
                            className="h-7 px-2.5 border border-mt-regua-fina text-mt-neutral-700 hover:border-mt-accent hover:text-mt-accent font-bold text-[9px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-60"
                            title="Criar o lançamento no caixa com os dados desta linha"
                          >
                            Lançar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Valor, data e descrição vêm prontos do banco. A
                        categoria é a única coisa que uma pessoa acrescenta —
                        e é ela que faz a linha significar algo no DRE. */}
                    {lancando === l.id && (
                      <div className="flex flex-col gap-2 border-l-2 border-mt-accent-300 pl-3">
                        <select
                          value={categoriaEscolhida}
                          onChange={(e) => setCategoriaEscolhida(e.target.value)}
                          autoFocus
                          className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-9 w-full focus:outline-none focus:border-mt-accent cursor-pointer"
                        >
                          <option value="">Categoria (obrigatória)...</option>
                          {categorias
                            .filter((c) =>
                              l.tipo === "entrada" ? c.tipo === "receita" : c.tipo === "despesa",
                            )
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.icone} {c.nome}
                              </option>
                            ))}
                        </select>
                        <input
                          type="text"
                          value={parceiro}
                          onChange={(e) => setParceiro(e.target.value)}
                          placeholder={l.tipo === "entrada" ? "Cliente (opcional)" : "Fornecedor (opcional)"}
                          className="bg-mt-bg border border-mt-regua-fina text-xs text-mt-ink px-3 h-9 w-full focus:outline-none focus:border-mt-accent"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLancando(null)}
                            className="h-8 px-3 border border-mt-regua-fina text-mt-neutral-700 hover:text-mt-ink text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => lancar(l)}
                            disabled={!categoriaEscolhida || ocupado}
                            className="h-8 px-3 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso text-[9px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                          >
                            {ocupado ? "Lançando..." : "Lançar e conciliar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Secao>

            <Secao
              titulo="No sistema, fora do banco"
              descricao="Lançado no caixa e ainda não visto pelo banco. Pode ser pagamento que não compensou, ou registrado na conta bancária errada."
              contagem={estado.soNoSistema.length}
              vazio="Todo lançamento do caixa apareceu no banco. ✓"
            >
              <div className="flex flex-col divide-y divide-mt-regua-fina">
                {estado.soNoSistema.map((m) => (
                  <div key={m.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[13px] font-bold text-mt-ink truncate">{m.descricao}</span>
                      <span className="text-[10px] text-mt-neutral-600">
                        {formatDate(m.data_movimentacao)}
                        {m.forma_pagamento && ` · ${m.forma_pagamento}`}
                      </span>
                    </div>
                    <span
                      className={`text-[13px] font-extrabold tabular-nums shrink-0 ${
                        m.tipo === "entrada" ? "text-mt-accent-800" : "text-mt-accent"
                      }`}
                    >
                      {m.tipo === "entrada" ? "+" : "−"} {formatPrice(m.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </Secao>
          </div>

          {/* Conciliado fica no fim, e fechado: é o que já não precisa de atenção. */}
          {conciliadas.length > 0 && (
            <details className="bg-mt-surface border border-mt-regua-fina p-6">
              <summary className="cursor-pointer select-none text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">
                Conciliado no período{" "}
                <span className="font-normal text-mt-neutral-700 text-xs">
                  ({conciliadas.length})
                </span>
              </summary>
              <div className="flex flex-col divide-y divide-mt-regua-fina mt-4 border-t border-mt-regua-fina">
                {conciliadas.map((l) => (
                  <div key={l.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[13px] text-mt-ink truncate">{l.descricao}</span>
                      <span className="text-[10px] text-mt-neutral-600">
                        {formatDate(l.data)} ·{" "}
                        {l.conciliado_como === "manual" ? "confirmado por pessoa" : "automático"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[13px] font-extrabold tabular-nums text-mt-neutral-700">
                        {formatPrice(l.valor)}
                      </span>
                      <button
                        onClick={() => desfazer(l.id)}
                        disabled={ocupado}
                        className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-600 hover:text-mt-accent cursor-pointer disabled:opacity-60"
                      >
                        Desfazer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  contagem,
  vazio,
  children,
}: {
  titulo: string;
  descricao: string;
  contagem: number;
  vazio?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 border-b border-mt-regua-fina pb-3 select-none">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-extrabold tracking-[-.01em] text-mt-ink">{titulo}</h3>
          <span className="text-[10px] font-bold text-mt-neutral-600 uppercase tracking-wider shrink-0">
            {contagem}
          </span>
        </div>
        <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">{descricao}</p>
      </div>
      {contagem === 0 && vazio ? (
        <div className="py-6 text-center text-xs text-mt-neutral-600">{vazio}</div>
      ) : (
        children
      )}
    </div>
  );
}

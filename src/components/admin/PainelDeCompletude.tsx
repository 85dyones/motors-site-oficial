"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

/**
 * Painel de completude do registro — manual §3.2, meta §9 (≥ 80%).
 *
 * "Indicador de completude por vendedor, visível e comparativo."
 *
 * Decisões de leitura, e o porquê de cada uma:
 *
 *   • **Ranking sem pódio.** Posição aparece como número, não como medalha, e
 *     não há destaque para o primeiro. O indicador existe para completar
 *     cadastro, não para premiar — e placar com pódio é o que faz gente
 *     preencher qualquer coisa para subir de posição.
 *
 *   • **A lista vem junto do número.** Cada vendedor abre para ver QUAIS
 *     vendas e QUAIS campos. Indicador sem a lista do que o compõe vira
 *     placar; com a lista, vira tarefa.
 *
 *   • **Base pequena avisa.** Com poucas vendas, uma venda incompleta despenca
 *     o percentual — então o painel diz quantas vendas sustentam cada linha,
 *     e avisa quando o número é frágil demais para comparar.
 *
 *   • **Venda sem vendedor não é de ninguém.** Ela aparece separada, nunca
 *     dentro do ranking: atribuí-la a alguém seria cobrar a pessoa errada.
 */

const META = 0.8; // §9: "Completude de registro nas vendas novas ≥ 80%"

/** Abaixo disto, o percentual oscila demais para comparar pessoas. */
const MINIMO_PARA_COMPARAR = 5;

const NOME_DA_PENDENCIA: Record<string, string> = {
  vendedor: "vendedor",
  versao: "versão",
  cep: "CEP",
  data_nascimento: "nascimento",
  consentimento_canais: "canal consentido",
};

interface LinhaDoRanking {
  vendedor_id: string | null;
  vendedor_nome: string;
  vendas: number;
  vendas_completas: number;
  campos_pendentes: number;
  completude: number;
  posicao: number;
}

interface VendaPendente {
  veiculo_vendido_id: string;
  data_venda: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  vendedor_id: string | null;
  vendedor_nome: string;
  cliente_nome: string;
  pendencias: string[];
}

interface Resposta {
  ranking: LinhaDoRanking[];
  vendas_pendentes: VendaPendente[];
  total_vendas: number;
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const dataBr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR");

function Pendencia({ nome }: { nome: string }) {
  return (
    <span className="border border-mt-regua px-1.5 py-0.5 text-[10px] uppercase tracking-[.08em] text-mt-neutral-700">
      {NOME_DA_PENDENCIA[nome] ?? nome}
    </span>
  );
}

export default function PainelDeCompletude() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/ciclo/completude");
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(json?.error ?? "Não foi possível carregar o painel.");
        return;
      }
      setDados(json as Resposta);
    } catch {
      setErro("Falha de rede ao carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const semAtribuicao = useMemo(
    () => (dados?.vendas_pendentes ?? []).filter((v) => !v.vendedor_id),
    [dados],
  );

  const geral = useMemo(() => {
    const r = dados?.ranking ?? [];
    if (r.length === 0) return null;
    const vendas = r.reduce((n, l) => n + l.vendas, 0);
    const pendentes = r.reduce((n, l) => n + l.campos_pendentes, 0);
    return { vendas, completude: vendas === 0 ? 0 : 1 - pendentes / (vendas * 5) };
  }, [dados]);

  if (carregando) {
    return <p className="p-6 text-[13px] text-mt-neutral-700">Carregando o registro das vendas…</p>;
  }

  if (erro) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="border border-mt-regua-fina bg-mt-surface p-6">
          <span className="mt-rotulo mt-rotulo-accent">PAINEL INDISPONÍVEL</span>
          <p role="alert" className="mt-2 text-[13px] leading-relaxed text-mt-ink">
            {erro}
          </p>
          <button
            type="button"
            onClick={carregar}
            className="mt-foco mt-4 border border-mt-regua-fina px-4 py-2 text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const ranking = dados?.ranking ?? [];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <span className="mt-rotulo mt-rotulo-accent">REGISTRO DAS VENDAS</span>
      <h1 className="mt-2 text-[22px] font-extrabold tracking-[-.02em] text-mt-ink">
        Completude por vendedor
      </h1>
      <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-mt-neutral-700">
        Os campos obrigatórios do fechamento já são bloqueados no formulário — o que se mede aqui
        é o que ele deixa passar em branco. A meta do programa é <strong>{pct(META)}</strong>.
        Sem canal consentido, o cliente não recebe nada do Ciclo: é a pendência que mais custa.
      </p>

      {geral && (
        <div className="mt-6 border border-mt-regua-fina bg-mt-surface p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
            Completude geral
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[28px] font-extrabold tracking-[-.02em] text-mt-ink tabular-nums">
              {pct(geral.completude)}
            </span>
            <span className="text-[13px] text-mt-neutral-700 tabular-nums">
              em {geral.vendas.toLocaleString("pt-BR")}{" "}
              {geral.vendas === 1 ? "venda" : "vendas"}
            </span>
            <span
              className={`ml-auto border px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] ${
                geral.completude >= META
                  ? "border-mt-ink text-mt-ink"
                  : "border-mt-regua text-mt-neutral-700"
              }`}
            >
              {geral.completude >= META ? "NA META" : "ABAIXO DA META"}
            </span>
          </div>
        </div>
      )}

      {ranking.length === 0 ? (
        <p className="mt-6 border-l-2 border-mt-ink bg-mt-bg p-4 text-[13px] leading-relaxed text-mt-ink">
          Nenhuma venda registrada ainda. O indicador começa a existir com a primeira venda
          fechada — até lá não há o que medir, e isso não é falha do painel.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["#", "Vendedor", "Vendas", "Completas", "Completude", ""].map((h) => (
                  <th
                    key={h}
                    className="border-b border-mt-regua-fina py-2 pr-4 text-left text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranking.map((l) => {
                const chave = l.vendedor_id ?? l.vendedor_nome;
                const frouxo = l.vendas < MINIMO_PARA_COMPARAR;
                const dele = (dados?.vendas_pendentes ?? []).filter(
                  (v) => (v.vendedor_id ?? "(sem vendedor)") === (l.vendedor_id ?? "(sem vendedor)"),
                );
                return (
                  // `Fragment` com chave, não `<>`: a chave pertence ao
                  // elemento raiz do map, e o atalho não aceita nenhuma.
                  <Fragment key={chave}>
                    <tr className="border-b border-mt-regua-fina">
                      <td className="py-3 pr-4 tabular-nums text-mt-neutral-700">{l.posicao}</td>
                      <td className="py-3 pr-4 font-semibold text-mt-ink">{l.vendedor_nome}</td>
                      <td className="py-3 pr-4 tabular-nums text-mt-neutral-700">{l.vendas}</td>
                      <td className="py-3 pr-4 tabular-nums text-mt-neutral-700">
                        {l.vendas_completas}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="tabular-nums font-semibold text-mt-ink">
                          {pct(l.completude)}
                        </span>
                        {frouxo && (
                          <span
                            className="ml-2 text-[10px] text-mt-neutral-700"
                            title={`Com menos de ${MINIMO_PARA_COMPARAR} vendas, uma venda incompleta move muito o percentual.`}
                          >
                            base pequena
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        {dele.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAberto(aberto === chave ? null : chave)}
                            className="mt-foco border border-mt-regua-fina px-3 py-1 text-[10px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700"
                          >
                            {aberto === chave ? "Fechar" : `Ver ${dele.length}`}
                          </button>
                        )}
                      </td>
                    </tr>
                    {aberto === chave && (
                      <tr>
                        <td colSpan={6} className="bg-mt-bg px-4 py-3">
                          <ul className="m-0 flex list-none flex-col gap-2 p-0">
                            {dele.map((v) => (
                              <li key={v.veiculo_vendido_id} className="flex flex-wrap items-center gap-2">
                                <span className="text-[12px] text-mt-ink">
                                  {dataBr(v.data_venda)} · {v.cliente_nome}
                                  {v.placa ? ` · ${v.placa}` : ""}
                                </span>
                                {v.pendencias.map((p) => (
                                  <Pendencia key={p} nome={p} />
                                ))}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {semAtribuicao.length > 0 && (
        <div className="mt-8 border border-mt-regua-fina bg-mt-surface p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
            Vendas sem vendedor atribuído
          </div>
          <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-mt-neutral-700">
            Ficam fora do ranking de propósito — atribuí-las a alguém seria cobrar a pessoa
            errada. Vendas novas recebem o vendedor da sessão sozinhas; estas vieram por outro
            caminho.
          </p>
          <ul className="mt-3 flex list-none flex-col gap-2 p-0">
            {semAtribuicao.map((v) => (
              <li key={v.veiculo_vendido_id} className="text-[12px] text-mt-ink">
                {dataBr(v.data_venda)} · {v.cliente_nome}
                {v.placa ? ` · ${v.placa}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

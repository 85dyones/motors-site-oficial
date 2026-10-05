"use client";

import { useEffect, useState } from "react";
import {
  contar,
  diaDoInteresse,
  emPorcento,
  periodoDoInteresse,
  resumoDoInteresseEmTexto,
} from "../../lib/carrosDeInteresseNaTela";
import type { RelatorioDoVeiculo } from "../../lib/veiculosDeInteresse";

/**
 * "Interesse e objeções": o relatório de um carro (pedido do dono em
 * 05/10/2026).
 *
 * Quem abre é o gestor ou o dono, na tela do carro, para duas decisões: o que
 * dizer ao dono de um carro consignado, e o que fazer com um carro da loja que
 * é visto e não é escolhido (preço, preparo, anúncio). Mostra quantos
 * atendimentos consideraram o carro, quantos o escolheram, quantos o
 * descartaram e por quê, com as notas dos vendedores.
 *
 * Os dados vêm de `GET /api/estoque/[id]/interesse`, que só traz contagens,
 * motivos e notas: nenhum lead é identificado. "Copiar resumo" leva os números
 * e os motivos em texto, sem as notas (são texto livre de vendedor).
 *
 * Sem a estrutura no banco (`veiculos_disponivel: false`), o bloco não existe,
 * e ele só aparece depois de a primeira resposta dizer que existe.
 */

type Leitura =
  /** `aVista: false` é a primeira leitura: nada é desenhado até a rota dizer que o relatório existe. */
  | { estado: "lendo"; aVista: boolean }
  | { estado: "erro"; mensagem: string }
  | { estado: "indisponivel" }
  | { estado: "pronto"; nome: string | null; relatorio: RelatorioDoVeiculo };

type Copia = { estado: "nada" } | { estado: "copiado" } | { estado: "falhou"; texto: string };

const NUMERO = "m-0 text-xl font-extrabold tabular-nums";

export default function InteresseDoVeiculo({
  veiculoId,
  nome,
  className = "flex flex-col gap-4 border-t-2 border-mt-regua pt-5",
}: {
  /** `estoque_motors.id`. Carro de repasse tem outro tipo de id e não tem este relatório. */
  veiculoId: number | string;
  /** O nome do carro como a tela que monta já o escreve. Sem ele, vale o da rota. */
  nome?: string;
  className?: string;
}) {
  const [leitura, setLeitura] = useState<Leitura>({ estado: "lendo", aVista: false });
  const [tentativa, setTentativa] = useState(0);
  const [copia, setCopia] = useState<Copia>({ estado: "nada" });

  useEffect(() => {
    let vivo = true;
    fetch(`/api/estoque/${encodeURIComponent(String(veiculoId))}/interesse`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) throw new Error(d.error || "Não deu para ler o interesse neste carro.");
        if (d.veiculos_disponivel !== true || !d.relatorio) setLeitura({ estado: "indisponivel" });
        else setLeitura({ estado: "pronto", nome: d.veiculo?.rotulo ?? null, relatorio: d.relatorio as RelatorioDoVeiculo });
      })
      .catch((e: unknown) => {
        if (vivo) setLeitura({ estado: "erro", mensagem: e instanceof Error ? e.message : "Não deu para ler o interesse neste carro." });
      });
    return () => {
      vivo = false;
    };
  }, [veiculoId, tentativa]);

  // Enquanto não se sabe se o relatório existe, o bloco não aparece: título e
  // "Carregando" que somem em seguida eram um pisca em toda tela de carro.
  if (leitura.estado === "indisponivel" || (leitura.estado === "lendo" && !leitura.aVista)) return null;

  const r = leitura.estado === "pronto" ? leitura.relatorio : null;
  const nomeDoCarro = nome ?? (leitura.estado === "pronto" ? leitura.nome : null);

  const copiar = async () => {
    if (!r) return;
    const texto = resumoDoInteresseEmTexto(nomeDoCarro, r);
    try {
      await navigator.clipboard.writeText(texto);
      setCopia({ estado: "copiado" });
    } catch {
      // Sem permissão de área de transferência: o texto fica à vista para copiar à mão.
      setCopia({ estado: "falhou", texto });
    }
  };

  const periodo = r ? periodoDoInteresse(r) : null;

  return (
    <section id="interesse" aria-labelledby="interesse-titulo" data-interesse className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="interesse-titulo" className="mt-rotulo m-0">
          Interesse e objeções
        </h2>
        {r && r.total > 0 && (
          <button type="button" onClick={() => void copiar()} className="mt-btn mt-btn-contorno mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11">
            Copiar resumo
          </button>
        )}
      </div>

      {leitura.estado === "lendo" && (
        <p role="status" className="m-0 text-sm text-mt-neutral-700">
          Carregando o interesse neste carro…
        </p>
      )}

      {leitura.estado === "erro" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          <span className="flex-1">{leitura.mensagem}</span>
          <button
            type="button"
            onClick={() => {
              setLeitura({ estado: "lendo", aVista: true });
              setTentativa((n) => n + 1);
            }}
            className="mt-foco cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-mt-accent-800 underline pointer-coarse:min-h-11"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {r && r.total === 0 && <p className="m-0 text-sm text-mt-neutral-700">Ainda não há atendimento registrado para este carro.</p>}

      {r && r.total > 0 && (
        <>
          <p role="status" className={copia.estado === "copiado" ? "m-0 text-xs text-mt-neutral-800" : "sr-only"}>
            {copia.estado === "copiado" ? "Resumo copiado. Ele leva os números e os motivos; as notas ficam de fora." : ""}
          </p>
          {copia.estado === "falhou" && (
            <label className="flex flex-col gap-1 text-xs text-mt-neutral-800">
              <span>Não deu para copiar sozinho. Selecione o texto abaixo e copie.</span>
              <textarea
                readOnly
                rows={8}
                value={copia.texto}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-foco w-full max-w-prose border border-mt-regua-fina bg-mt-surface p-2 text-[12px] leading-snug text-mt-ink"
              />
            </label>
          )}

          <dl className="m-0 grid grid-cols-2 gap-y-3 text-xs sm:grid-cols-4">
            {(
              [
                ["Consideraram", r.total, null],
                ["Em avaliação", r.em_avaliacao, r.percentuais.em_avaliacao],
                ["Escolhido", r.escolhido, r.percentuais.escolhido],
                ["Descartado", r.descartado, r.percentuais.descartado],
              ] as Array<[string, number, number | null]>
            ).map(([rotulo, valor, parte]) => (
              <div key={rotulo} className="flex flex-col gap-1">
                <dt className="mt-rotulo">{rotulo}</dt>
                <dd className={NUMERO}>
                  {valor.toLocaleString("pt-BR")}
                  {parte !== null && <span className="ml-1.5 text-xs font-normal text-mt-neutral-700">{emPorcento(parte)}</span>}
                </dd>
              </div>
            ))}
          </dl>

          <p className="m-0 text-xs leading-relaxed text-mt-neutral-700">
            {contar(r.total, "atendimento considerou este carro", "atendimentos consideraram este carro")}
            {periodo ? `, ${periodo}` : ""}.
            {r.sem_resolucao > 0 &&
              ` ${contar(
                r.sem_resolucao,
                "dos que estão em avaliação é de um atendimento já encerrado, sem resolução para o carro",
                "dos que estão em avaliação são de atendimentos já encerrados, sem resolução para o carro",
              )}.`}
          </p>

          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-xs font-bold">Por que foi descartado</h3>
            {r.motivos.length === 0 ? (
              <p className="m-0 text-sm text-mt-neutral-700">Nenhum descarte com motivo até agora.</p>
            ) : (
              <ul role="list" data-motivos className="m-0 flex max-w-prose list-none flex-col gap-2.5 p-0">
                {r.motivos.map((m) => (
                  <li key={m.motivo} data-motivo={m.motivo} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{m.rotulo}</span>
                      <span className="flex-none tabular-nums text-mt-neutral-800">
                        {m.total.toLocaleString("pt-BR")}
                        <span aria-hidden="true"> · </span>
                        <span className="sr-only">, </span>
                        {emPorcento(m.percentual)}
                        <span className="sr-only"> dos descartes</span>
                      </span>
                    </div>
                    <div aria-hidden="true" className="h-2 w-full border border-mt-regua-fina bg-mt-surface">
                      <div data-barra className="h-full bg-mt-ink" style={{ width: `${Math.max(0, Math.min(100, m.percentual))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {r.motivos.length > 0 && <p className="m-0 text-[11px] text-mt-neutral-700">O percentual é sobre os descartes deste carro.</p>}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-xs font-bold">Notas dos vendedores</h3>
            {r.notas.length === 0 ? (
              <p className="m-0 text-sm text-mt-neutral-700">Nenhuma nota registrada.</p>
            ) : (
              <ul role="list" data-notas className="m-0 flex list-none flex-col divide-y divide-mt-regua-fina p-0">
                {r.notas.map((n, i) => (
                  <li key={`${n.em ?? ""}-${i}`} className="flex flex-col gap-0.5 py-2 text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold">{n.motivo_rotulo ?? "Sem motivo"}</span>
                      <span className="ml-auto flex-none tabular-nums text-mt-neutral-700">{diaDoInteresse(n.em) ?? ""}</span>
                    </div>
                    <p className="m-0 max-w-prose text-sm leading-snug text-mt-neutral-800 [overflow-wrap:anywhere]">{n.texto}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import BotaoDeResolverErro from "./BotaoDeResolverErro";
import FiltrosDaFilaDeErros from "./FiltrosDaFilaDeErros";
import { EstatisticasRegua } from "../modernist/primitivos";
import {
  ROTULO_DA_NATUREZA,
  ROTULO_DA_ORIGEM,
  desdeQuando,
  explicarVazio,
  formatarContagem,
  formatarMomento,
  temRecorte,
  type FiltrosDaFila,
  type GrupoDeErros,
  type ResultadoDaFila,
} from "../../lib/filaDeErros";

/**
 * A fila de triagem de exceções — tela `/admin/erros`.
 *
 * ---------------------------------------------------------------------------
 * Quem abre, quando, que decisão sai
 * ---------------------------------------------------------------------------
 * Abre o **dono**, quando o WhatsApp avisou de uma falha ou na rotina de olhar
 * o dia. Sai uma de duas decisões, as duas em um clique: **abrir o grupo para
 * corrigir agora** (lá estão o stack, o `release` do deploy e o `digest`) ou
 * **marcar como resolvido**, tirando-o da fila. Um grupo resolvido que voltar a
 * acontecer reaparece sozinho no topo, porque a ocorrência nova nasce com
 * `resolvido_em` nulo.
 *
 * ---------------------------------------------------------------------------
 * Componente de SERVIDOR
 * ---------------------------------------------------------------------------
 * Sem `"use client"`, e isso é decisão, não descuido. Os dados desta tela são
 * `mensagem` (até 2000 caracteres) e, no detalhe, `stack` (até 8000) — passá-los
 * como prop para um componente cliente os mandaria DUAS vezes ao navegador: uma
 * no HTML e outra no payload do RSC. Aqui só duas ilhas são cliente: o filtro
 * (que navega) e o botão de resolver (que grava e pede `router.refresh()`).
 *
 * O carregamento é o `loading.tsx` do segmento; o erro de leitura vira faixa
 * vermelha no lugar da lista, com o motivo que o PostgREST devolveu.
 */
export default function FilaDeErros({
  filtros,
  resultado,
  coletaLigada,
}: {
  filtros: FiltrosDaFila;
  resultado: ResultadoDaFila;
  /** `OBSERVABILIDADE === "1"` — lido no servidor, na página. */
  coletaLigada: boolean;
}) {
  const grupos = resultado.ok ? resultado.grupos : [];
  const abertos = grupos.filter((g) => !g.resolvido).length;

  const vazio = explicarVazio({
    coletaLigada,
    comRecorte: temRecorte(filtros),
    totalSemRecorte: resultado.ok ? resultado.totalSemRecorte : null,
  });

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex select-none flex-col gap-1.5 border-b-2 border-mt-regua pb-5">
        <div className="mt-rotulo mt-rotulo-accent">Operação</div>
        <h1 className="mt-titulo text-3xl md:text-4xl">Erros do site</h1>
        <p className="mt-1 max-w-[680px] text-sm text-mt-neutral-800">
          O que quebrou para quem estava navegando, agrupado por defeito — e não
          por ocorrência, senão uma página com problema enche a tela de cópias de
          si mesma. Abra um grupo para corrigir, ou marque como resolvido para
          tirá-lo da fila. Se voltar a acontecer, ele volta para cá sozinho.
        </p>
      </div>

      {/* A régua de números. Todos vêm de consulta: os dois primeiros do
          `count` exato do PostgREST e da janela lida; o terceiro é o valor da
          env que o gravador consulta. Nenhum é estimado. */}
      <EstatisticasRegua
        itens={[
          {
            valor: resultado.ok ? formatarContagem(abertos) : "—",
            rotulo: "GRUPOS ABERTOS NA JANELA",
            accent: abertos > 0,
          },
          {
            valor:
              resultado.ok && resultado.totalNoRecorte !== null
                ? formatarContagem(resultado.totalNoRecorte)
                : "—",
            rotulo: "OCORRÊNCIAS NO RECORTE",
          },
          {
            valor: coletaLigada ? "LIGADA" : "DESLIGADA",
            rotulo: "COLETA DE ERRO",
            accent: !coletaLigada,
          },
        ]}
      />

      {!coletaLigada && (
        <div className="border border-mt-accent-300 bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent">
          <strong className="font-extrabold">A coleta está desligada.</strong> Enquanto
          a variável <code className="font-mono">OBSERVABILIDADE</code> não valer{" "}
          <code className="font-mono">1</code> no ambiente, nada novo é gravado — o que
          esta tela mostra é o que já havia. Fila vazia aqui não significa site sem erro.
        </div>
      )}

      <FiltrosDaFilaDeErros
        filtros={filtros}
        ambientesVistos={resultado.ok ? resultado.ambientesVistos : []}
      />

      {!resultado.ok ? (
        <div className="border border-mt-accent-300 bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent">
          Não foi possível ler a fila: {resultado.motivo}
        </div>
      ) : grupos.length === 0 ? (
        <div className="border border-mt-regua-fina bg-mt-surface p-8">
          <div
            className={`text-sm font-extrabold ${vazio.alerta ? "text-mt-accent" : "text-mt-ink"}`}
          >
            {vazio.titulo}
          </div>
          <p className="mt-2 max-w-[560px] text-xs leading-relaxed text-mt-neutral-700">
            {vazio.detalhe}
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-mt-regua-fina border border-mt-regua-fina bg-mt-surface">
          {grupos.map((g) => (
            <LinhaDoGrupo key={g.hash} grupo={g} ambienteFixado={Boolean(filtros.ambiente)} />
          ))}
        </div>
      )}

      {/* O rodapé existe para DIZER o alcance da leitura. Agrupamento feito
          sobre uma janela é uma verdade parcial, e parcial não declarada vira
          "não há mais nada" na cabeça de quem lê.
          Com zero linha lida ele sai: "agrupado sobre as 0 ocorrências" não
          informa nada, e o bloco de vazio logo acima já explicou o silêncio. */}
      {resultado.ok && resultado.lidas > 0 && (
        <p className="text-[10px] leading-relaxed text-mt-neutral-600">
          Agrupado sobre as{" "}
          <strong className="font-bold tabular-nums text-mt-neutral-700">
            {formatarContagem(resultado.lidas)}
          </strong>{" "}
          ocorrências mais recentes
          {resultado.totalNoRecorte !== null && (
            <>
              {" "}
              de{" "}
              <strong className="font-bold tabular-nums text-mt-neutral-700">
                {formatarContagem(resultado.totalNoRecorte)}
              </strong>{" "}
              no recorte
            </>
          )}
          .{" "}
          {resultado.totalNoRecorte !== null && resultado.totalNoRecorte > resultado.lidas
            ? "Grupo cuja última ocorrência é mais antiga que a janela não aparece aqui — amplie em “ocorrências lidas”."
            : "É o recorte inteiro."}{" "}
          O texto do erro (<code className="font-mono">stack</code>) não é lido nesta
          lista, só no detalhe de um grupo.
        </p>
      )}
    </div>
  );
}

/**
 * Uma linha da fila.
 *
 * Empilha no celular e abre em duas colunas no desktop: o dono abre esta tela
 * no telefone depois de o WhatsApp avisar, e uma tabela de sete colunas ali é
 * rolagem horizontal.
 */
function LinhaDoGrupo({
  grupo,
  ambienteFixado,
}: {
  grupo: GrupoDeErros;
  /**
   * O recorte já escolheu um ambiente?
   *
   * Se escolheu, repetir "production" em cada linha é ruído — todas são. Se não
   * escolheu, o ambiente PRECISA aparecer: sem ele, um erro de `preview` (que
   * não afeta cliente nenhum) tem a mesma cara de um erro de produção.
   */
  ambienteFixado: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between ${
        grupo.resolvido ? "opacity-60" : ""
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/erros/${grupo.hash}`}
            className="mt-foco text-sm font-extrabold text-mt-ink no-underline hover:text-mt-accent"
          >
            {grupo.assunto}
          </Link>
          {grupo.origens.map((o) => (
            <Selo key={o}>{ROTULO_DA_ORIGEM[o] ?? o}</Selo>
          ))}
          {/* Vermelho só onde há decisão: produção é o que alcança cliente. Um
              erro de `preview` na mesma lista é informação, não urgência. */}
          {!ambienteFixado &&
            grupo.ambientes.map((a) => (
              <Selo key={a} accent={a === "production"}>
                {a}
              </Selo>
            ))}
          {/* `ambos` quer dizer que este erro também foi ao WhatsApp. Quem abre
              a fila precisa saber quais já acordaram alguém — e quais estão
              aqui esperando que alguém note. */}
          {grupo.naturezas.includes("ambos") && (
            <Selo>{ROTULO_DA_NATUREZA.ambos}</Selo>
          )}
          {grupo.resolvido && <Selo>resolvido</Selo>}
          {/* O aviso da ressalva conhecida: um grupo pode conter defeitos
              diferentes quando o dedupe do navegador colapsa tudo numa chave
              só. O `digest` é o que os separa — e está no detalhe. */}
          {grupo.digests.length > 1 && (
            <Selo accent>{grupo.digests.length} digests</Selo>
          )}
        </div>

        {grupo.rota && (
          <div className="font-mono text-[11px] text-mt-neutral-700">{grupo.rota}</div>
        )}

        <p className="line-clamp-2 max-w-[720px] break-words text-xs leading-relaxed text-mt-neutral-800">
          {grupo.mensagem}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-mt-neutral-600">
          <span>
            última:{" "}
            <strong className="font-bold tabular-nums text-mt-neutral-700">
              {formatarMomento(grupo.ultima)}
            </strong>{" "}
            ({desdeQuando(grupo.ultima)})
          </span>
          <span aria-hidden="true">·</span>
          <span>
            primeira na janela:{" "}
            <span className="tabular-nums">{formatarMomento(grupo.primeira)}</span>
          </span>
          {grupo.suprimidas > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span
                title="Ocorrências idênticas engolidas pela carência de 10 s do gravador — elas viajam na linha seguinte"
              >
                <span className="tabular-nums">{formatarContagem(grupo.suprimidas)}</span>{" "}
                suprimidas
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-2">
        <div className="text-right">
          <div className="text-2xl font-extrabold leading-none tabular-nums text-mt-ink">
            {formatarContagem(grupo.vezes)}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-[.14em] text-mt-neutral-600">
            {grupo.vezes === 1 ? "vez" : "vezes"}
          </div>
          <div className="mt-1 text-[10px] tabular-nums text-mt-neutral-600">
            {formatarContagem(grupo.ocorrencias)} linha
            {grupo.ocorrencias === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Link
            href={`/admin/erros/${grupo.hash}`}
            className="mt-foco text-[10px] font-bold uppercase tracking-wider text-mt-accent no-underline hover:underline"
          >
            Abrir detalhe
          </Link>
          <BotaoDeResolverErro hash={grupo.hash} resolvido={grupo.resolvido} />
        </div>
      </div>
    </div>
  );
}

/** O marcador do sistema: régua de 1px, caixa alta, sem arredondamento. */
export function Selo({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={`border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
        accent
          ? "border-mt-accent-300 bg-mt-accent-100 text-mt-accent"
          : "border-mt-regua-fina bg-mt-bg text-mt-neutral-700"
      }`}
    >
      {children}
    </span>
  );
}

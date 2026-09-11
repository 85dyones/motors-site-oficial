import Link from "next/link";
import BotaoDeResolverErro from "./BotaoDeResolverErro";
import { Selo } from "./FilaDeErros";
import {
  POR_PAGINA_NO_DETALHE,
  ROTULO_DA_NATUREZA,
  ROTULO_DA_ORIGEM,
  desdeQuando,
  formatarContagem,
  formatarMomento,
  type OcorrenciaDoDetalhe,
  type ResultadoDoGrupo,
} from "../../lib/filaDeErros";

/**
 * O detalhe de um grupo — onde a decisão "corrigir agora" é tomada.
 *
 * ---------------------------------------------------------------------------
 * É aqui, e só aqui, que o `stack` é lido
 * ---------------------------------------------------------------------------
 * A lista não o traz de propósito: o teto da coluna é 8000 caracteres, e uma
 * fila de 200 ocorrências com stack custaria até 1,6 MB de egress por abertura,
 * num projeto que já apertou a cota do plano Free. Aqui são 20 por página, e
 * quem abriu pediu.
 *
 * ---------------------------------------------------------------------------
 * O `digest` em destaque — a ressalva que esta tela não conserta
 * ---------------------------------------------------------------------------
 * O dedupe do capturador do navegador colapsa TODO erro de servidor visto pelo
 * navegador numa chave só: em produção a mensagem do React é fixa e o stack tem
 * uma linha. Consequência: pode existir um grupo gordo de
 * <code>navegador:boundary</code> com defeitos DIFERENTES dentro dele.
 *
 * O que os separa é o `digest` — o mesmo que o Next atribui ao erro de servidor
 * e que liga esta linha à que o servidor gravou pelo mesmo erro. Por isso ele
 * aparece no alto, com a contagem de quantos existem nesta página, e cada um é
 * um link que recorta a leitura. O capturador não é consertado aqui (é outro
 * PR); esta tela só é desenhada sabendo do defeito.
 */
export default function DetalheDoGrupoDeErros({
  hash,
  resultado,
  digest,
  voltarPara,
}: {
  hash: string;
  resultado: ResultadoDoGrupo;
  /** Recorte ativo por digest, quando há. */
  digest?: string;
  /** A URL da fila com o recorte de onde se veio. */
  voltarPara: string;
}) {
  if (!resultado.ok) {
    return (
      <div className="flex w-full max-w-5xl flex-col gap-6">
        <Voltar href={voltarPara} />
        <div className="border border-mt-accent-300 bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent">
          Não foi possível ler este grupo: {resultado.motivo}
        </div>
      </div>
    );
  }

  const { ocorrencias, total, pagina, abertas, digestsNaPagina } = resultado;
  const amostra = ocorrencias[0];
  const resolvido = abertas === 0;
  const totalPaginas = total ? Math.max(1, Math.ceil(total / POR_PAGINA_NO_DETALHE)) : 1;

  const enderecoDaPagina = (n: number) => {
    const p = new URLSearchParams();
    if (n > 1) p.set("pagina", String(n));
    if (digest) p.set("digest", digest);
    const consulta = p.toString();
    return `/admin/erros/${hash}${consulta ? `?${consulta}` : ""}`;
  };

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <Voltar href={voltarPara} />

      {/* Cabeçalho do grupo */}
      <div className="flex flex-col gap-3 border-b-2 border-mt-regua pb-5">
        <div className="mt-rotulo mt-rotulo-accent">Erro do site</div>
        <h1 className="mt-titulo break-words text-2xl md:text-3xl">
          {amostra?.assunto ?? "Grupo sem ocorrência nesta página"}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {amostra && <Selo>{ROTULO_DA_ORIGEM[amostra.origem] ?? amostra.origem}</Selo>}
          {amostra && (
            <Selo>{ROTULO_DA_NATUREZA[amostra.natureza] ?? amostra.natureza}</Selo>
          )}
          {amostra && <Selo>{amostra.ambiente}</Selo>}
          {resolvido && <Selo>resolvido</Selo>}
        </div>

        {amostra?.rota && (
          <div className="font-mono text-xs text-mt-neutral-700">{amostra.rota}</div>
        )}

        {amostra && (
          <p className="max-w-[760px] break-words text-sm leading-relaxed text-mt-ink">
            {amostra.mensagem}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-mt-neutral-600">
            <span>
              <strong className="font-bold tabular-nums text-mt-neutral-700">
                {total === null ? "—" : formatarContagem(total)}
              </strong>{" "}
              ocorrência{total === 1 ? "" : "s"} registrada{total === 1 ? "" : "s"}
              {digest ? " neste digest" : ""}
            </span>
            <span>
              <strong className="font-bold tabular-nums text-mt-neutral-700">
                {abertas === null ? "—" : formatarContagem(abertas)}
              </strong>{" "}
              em aberto no grupo
            </span>
            <span className="font-mono">{hash}</span>
          </div>
          <BotaoDeResolverErro hash={hash} resolvido={resolvido} tamanho="grande" />
        </div>
      </div>

      {/* Os digests — a régua que separa defeitos dentro do mesmo grupo */}
      {digestsNaPagina.length > 0 && (
        <div className="flex flex-col gap-2 border border-mt-regua-fina bg-mt-surface p-4">
          <div className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-700">
            Digests nesta página
          </div>
          {digestsNaPagina.length > 1 && (
            <p className="text-[11px] leading-relaxed text-mt-accent">
              São {digestsNaPagina.length} digests diferentes debaixo do mesmo agrupamento
              — muito provavelmente <strong>defeitos diferentes</strong>. A mensagem do
              React em produção é a mesma para todos, então o agrupamento não consegue
              separá-los; o digest consegue. Recorte por um deles antes de concluir
              qualquer coisa sobre este grupo.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {digestsNaPagina.map((d) => (
              <Link
                key={d}
                href={`/admin/erros/${hash}?digest=${d}`}
                className={`mt-foco border px-2.5 py-1 font-mono text-[10px] no-underline transition-colors ${
                  d === digest
                    ? "border-mt-accent bg-mt-accent-100 text-mt-accent"
                    : "border-mt-regua-fina bg-mt-bg text-mt-neutral-700 hover:border-mt-accent hover:text-mt-accent"
                }`}
              >
                {d}
              </Link>
            ))}
            {digest && (
              <Link
                href={`/admin/erros/${hash}`}
                className="mt-foco border border-mt-regua-fina bg-mt-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-mt-neutral-700 no-underline hover:border-mt-accent hover:text-mt-accent"
              >
                Ver todos
              </Link>
            )}
          </div>
        </div>
      )}

      {/* As ocorrências */}
      {ocorrencias.length === 0 ? (
        <div className="border border-mt-regua-fina bg-mt-surface p-8 text-xs text-mt-neutral-700">
          Nenhuma ocorrência nesta página. O grupo pode ter sido apagado pela retenção de
          90 dias, ou o recorte por digest não tem linha aqui.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ocorrencias.map((o) => (
            <Ocorrencia key={o.id} ocorrencia={o} />
          ))}
        </div>
      )}

      {/* Paginação — de verdade, porque aqui cada linha pode pesar 8 KB */}
      {total !== null && total > POR_PAGINA_NO_DETALHE && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mt-regua-fina pt-3">
          <span className="text-[10px] text-mt-neutral-600">
            Mostrando{" "}
            <strong className="font-bold tabular-nums text-mt-neutral-700">
              {(pagina - 1) * POR_PAGINA_NO_DETALHE + 1}–
              {Math.min(pagina * POR_PAGINA_NO_DETALHE, total)}
            </strong>{" "}
            de <strong className="font-bold tabular-nums text-mt-neutral-700">{total}</strong>{" "}
            · da mais recente para a mais antiga
          </span>
          <div className="flex items-center gap-2">
            <PaginaLink href={enderecoDaPagina(pagina - 1)} desativado={pagina <= 1}>
              Anterior
            </PaginaLink>
            <span className="text-[10px] tabular-nums text-mt-neutral-600">
              {pagina} / {totalPaginas}
            </span>
            <PaginaLink
              href={enderecoDaPagina(pagina + 1)}
              desativado={pagina >= totalPaginas}
            >
              Próxima
            </PaginaLink>
          </div>
        </div>
      )}
    </div>
  );
}

/** Uma ocorrência: o contexto em cima, o stack embaixo. */
function Ocorrencia({ ocorrencia: o }: { ocorrencia: OcorrenciaDoDetalhe }) {
  return (
    <div className="border border-mt-regua-fina bg-mt-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mt-regua-fina px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mt-neutral-700">
          <strong className="font-bold tabular-nums text-mt-ink">
            {formatarMomento(o.criado_em)}
          </strong>
          <span className="text-mt-neutral-600">({desdeQuando(o.criado_em)})</span>
          {o.suprimidas > 0 && (
            <span
              className="text-mt-neutral-600"
              title="Ocorrências idênticas engolidas pela carência de 10 s antes desta linha"
            >
              + <span className="tabular-nums">{formatarContagem(o.suprimidas)}</span>{" "}
              suprimidas
            </span>
          )}
        </div>
        {o.resolvido_em && <Selo>resolvido {formatarMomento(o.resolvido_em)}</Selo>}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-2">
        <Campo rotulo="Digest" destaque valor={o.digest} />
        <Campo rotulo="Release (SHA do deploy)" valor={o.release} mono />
        <Campo rotulo="URL" valor={o.url} mono />
        <Campo rotulo="Método" valor={o.metodo} />
        <Campo rotulo="Identificador de navegação" valor={o.ag_uid} mono />
        <Campo rotulo="Navegador" valor={o.navegador} />
      </dl>

      {o.stack ? (
        <pre className="overflow-x-auto border-t border-mt-regua-fina bg-mt-bg px-4 py-3 font-mono text-[10px] leading-relaxed text-mt-neutral-800">
          {o.stack}
        </pre>
      ) : (
        <div className="border-t border-mt-regua-fina px-4 py-2.5 text-[10px] text-mt-neutral-600">
          Sem stack — o gravador recebeu o erro sem ele.
        </div>
      )}
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  mono = false,
  destaque = false,
}: {
  rotulo: string;
  valor: string | null;
  mono?: boolean;
  destaque?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-bold uppercase tracking-wider text-mt-neutral-600">
        {rotulo}
      </dt>
      {/* Campo vazio vira travessão em vez de sumir: branco no lugar de um dado
          é indistinguível de dado que ninguém pensou em mostrar. */}
      <dd
        className={`break-words text-[11px] ${mono || destaque ? "font-mono" : ""} ${
          destaque ? "font-bold text-mt-accent" : "text-mt-neutral-800"
        }`}
      >
        {valor || "—"}
      </dd>
    </div>
  );
}

function PaginaLink({
  href,
  desativado,
  children,
}: {
  href: string;
  desativado: boolean;
  children: React.ReactNode;
}) {
  const classe =
    "mt-foco border border-mt-regua-fina px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider no-underline";
  if (desativado) {
    return <span className={`${classe} text-mt-neutral-600 opacity-40`}>{children}</span>;
  }
  return (
    <Link
      href={href}
      className={`${classe} text-mt-neutral-700 hover:border-mt-accent hover:text-mt-accent`}
    >
      {children}
    </Link>
  );
}

function Voltar({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mt-foco text-[10px] font-bold uppercase tracking-wider text-mt-accent no-underline hover:underline"
    >
      ← Voltar para a fila
    </Link>
  );
}

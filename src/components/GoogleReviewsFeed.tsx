/**
 * Seção de reputação — renderizada no servidor, a partir do próprio banco.
 *
 * Era uma casca do Elfsight: `"use client"`, IntersectionObserver e um
 * `<Script>` de terceiro que só então buscava as avaliações. Três saltos entre
 * o visitante ver a seção e a seção ter conteúdo, e um plano gratuito com teto
 * de visualizações no meio do caminho.
 *
 * Agora o HTML já sai com as avaliações dentro. Sem estado, sem efeito, sem
 * script de terceiro — o único recurso externo que resta é a foto do autor, e
 * ela é opcional (ver `Avatar`).
 *
 * Quem decide se a seção existe é a home: sem dado, `getReputacaoGoogle()`
 * devolve `null` e a seção inteira não é renderizada. Este componente nunca
 * precisa desenhar estado vazio — e por isso não há como ele publicar uma
 * caixa de "widget não configurado" em produção, que era o que acontecia.
 */

import {
  formatarNota,
  selecionarParaVitrine,
  tempoRelativo,
  type AvaliacaoGoogle,
  type PainelReputacao,
} from "../lib/avaliacoesGoogle";

function Estrelas({ nota, rotulo }: { nota: number; rotulo?: string }) {
  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={rotulo ?? `${formatarNota(nota)} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((posicao) => (
        <svg
          key={posicao}
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${posicao <= Math.round(nota) ? "text-mt-accent" : "text-mt-neutral-300"}`}
          fill="currentColor"
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

/**
 * Foto do autor, com monograma quando ela não existe.
 *
 * A URL aponta para o CDN do Google — é a única requisição a terceiro que
 * sobrou nesta seção. Fica porque as regras de exibição do Google pedem a
 * identificação do autor, e vai com `no-referrer` para não vazar a página de
 * origem, e `loading="lazy"` para não competir com o LCP da home.
 */
function Avatar({ nome, fotoUrl }: { nome: string; fotoUrl: string | null }) {
  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-9 w-9 shrink-0 object-cover"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center bg-mt-neutral-300 text-sm font-extrabold text-mt-neutral-700"
    >
      {nome.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function CartaoAvaliacao({ avaliacao }: { avaliacao: AvaliacaoGoogle }) {
  const quando = tempoRelativo(avaliacao.publicadaEm);

  return (
    <article className="flex flex-col gap-3 border-t border-mt-regua-fina pt-5">
      <div className="flex items-center gap-3">
        <Avatar nome={avaliacao.autorNome} fotoUrl={avaliacao.autorFotoUrl} />
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">{avaliacao.autorNome}</div>
          <div className="mt-1 flex items-center gap-2">
            <Estrelas nota={avaliacao.nota} rotulo={`${avaliacao.nota} de 5 estrelas`} />
            {quando && <span className="text-[11px] text-mt-neutral-600">{quando}</span>}
          </div>
        </div>
      </div>

      {/* O texto vai inteiro e sem edição — reescrever ou cortar avaliação de
          cliente é adulterar depoimento, além de contrariar as regras de
          exibição do Google. Quem controla o tamanho é o CSS, não o servidor. */}
      <p className="m-0 text-sm leading-relaxed text-mt-neutral-800">{avaliacao.comentario}</p>

      {avaliacao.respostaTexto && (
        <div className="border-l-2 border-mt-regua pl-3.5">
          <div className="mt-rotulo mb-1.5">RESPOSTA DA MOTORS</div>
          <p className="m-0 text-[13px] leading-relaxed text-mt-neutral-700">
            {avaliacao.respostaTexto}
          </p>
        </div>
      )}
    </article>
  );
}

export default function GoogleReviewsFeed({ painel }: { painel: PainelReputacao }) {
  const { reputacao } = painel;
  const avaliacoes = selecionarParaVitrine(painel.avaliacoes);

  return (
    <div className="flex flex-col gap-8 pt-8">
      {/* Cabeçalho: a nota que o cliente vai conferir no Google, e o caminho
          para conferir. O link não é cortesia — nota exibida fora do Google
          precisa levar de volta à fonte. */}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-5 border-b-2 border-mt-regua pb-6">
        <div>
          <div className="mt-rotulo mb-2">NOTA NO GOOGLE</div>
          <div className="flex items-baseline gap-3">
            <span className="mt-display text-[56px] lg:text-[72px]">
              {formatarNota(reputacao.notaMedia)}
            </span>
            <span className="text-sm font-semibold text-mt-neutral-600">/ 5</span>
          </div>
        </div>

        <div className="pb-2">
          <Estrelas
            nota={reputacao.notaMedia}
            rotulo={`Média de ${formatarNota(reputacao.notaMedia)} de 5 estrelas`}
          />
          <div className="mt-2 text-xs text-mt-neutral-600">
            {reputacao.totalAvaliacoes}{" "}
            {reputacao.totalAvaliacoes === 1 ? "avaliação" : "avaliações"} de clientes
          </div>
        </div>

        {reputacao.urlPerfil && (
          <a
            href={reputacao.urlPerfil}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-foco mb-2 ml-auto text-[11px] font-extrabold tracking-[.12em] text-mt-accent no-underline"
          >
            VER TODAS NO GOOGLE
          </a>
        )}
      </div>

      {avaliacoes.length > 0 && (
        <div className="grid grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-2 desktop:grid-cols-3">
          {avaliacoes.map((avaliacao) => (
            <CartaoAvaliacao key={avaliacao.id} avaliacao={avaliacao} />
          ))}
        </div>
      )}
    </div>
  );
}

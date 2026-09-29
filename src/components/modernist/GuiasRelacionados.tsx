import Link from "next/link";
import type { GuiaRelacionado } from "../../lib/guiasNoSite";
import { NOME_DA_SECAO } from "../../lib/guias";

/**
 * Os guias que respondem à próxima pergunta de quem está na página.
 *
 * Mesmo desenho do card de saída dos guias (`app/guias/[slug]/page.tsx`):
 * título em caixa alta e uma linha de apoio. O `<h2>` é da página que chama,
 * porque a pergunta muda — "Antes de avaliar" não é "Antes de comprar um Onix".
 *
 * Lista vazia não desenha nada: cabeçalho seguido de nada é ruído, a mesma
 * regra dos blocos de `PaginaDeEstoque`.
 *
 * Sem `"use client"` de propósito: o bloco é só link, e entra também dentro do
 * `SobreClientWrapper` como elemento pronto.
 */
export default function GuiasRelacionados({
  titulo,
  guias,
  className = "",
}: {
  titulo: string;
  guias: readonly GuiaRelacionado[];
  className?: string;
}) {
  if (guias.length === 0) return null;

  return (
    <section className={`border-t-2 border-mt-regua py-8 ${className}`}>
      <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">{titulo}</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {guias.map((guia) => (
          <Link
            key={guia.href}
            href={guia.href}
            className="mt-foco flex flex-col gap-2 border border-mt-regua p-4 no-underline hover:border-mt-accent"
          >
            <span className="text-[12px] font-extrabold uppercase tracking-[.06em] text-mt-ink">
              {guia.titulo}
            </span>
            <span className="text-[12px] leading-relaxed text-mt-neutral-800">{guia.apoio}</span>
          </Link>
        ))}
      </div>
      <Link
        href="/guias"
        className="mt-foco mt-4 inline-block text-[12px] font-semibold text-mt-ink underline decoration-mt-accent underline-offset-2 hover:text-mt-accent"
      >
        Todos os {NOME_DA_SECAO}
      </Link>
    </section>
  );
}

/**
 * Faixa do Instagram — grade de publicações curadas no painel.
 *
 * Era uma casca do Elfsight, com o mesmo problema da seção de reputação: script
 * de terceiro, plano gratuito com teto de visualizações e, sem o ID
 * configurado, uma caixa de "widget não configurado" publicada na home.
 *
 * O que a loja escolhe no painel vira esta grade. A regra do sistema Modernist
 * vale aqui inteira: a foto sangra na célula, sem moldura e sem arredondamento.
 *
 * Sem publicação curada a home não renderiza esta seção — ver `page.tsx`.
 */

import type { PublicacaoInstagram } from "../lib/instagramCuradoria";

function Quadro({ publicacao }: { publicacao: PublicacaoInstagram }) {
  const foto = (
    // Não é `next/image`: o campo do painel aceita tanto o upload para o
    // Storage quanto uma URL colada à mão, e host fora de `remotePatterns`
    // derruba o otimizador em runtime. A perda é o resize automático; o ganho é
    // a home não quebrar por causa de um endereço digitado no admin.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={publicacao.imagemUrl}
      alt={publicacao.legenda ?? "Publicação da Motors no Instagram"}
      loading="lazy"
      className="aspect-square w-full object-cover"
    />
  );

  const legenda = publicacao.legenda && (
    <div className="mt-2.5 line-clamp-2 text-[11px] leading-snug text-mt-neutral-600">
      {publicacao.legenda}
    </div>
  );

  if (!publicacao.permalink) {
    return (
      <figure className="m-0">
        {foto}
        {legenda && <figcaption>{legenda}</figcaption>}
      </figure>
    );
  }

  return (
    <a
      href={publicacao.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-foco group block no-underline"
    >
      <div className="overflow-hidden">
        <div className="transition-transform duration-500 group-hover:scale-[1.03]">{foto}</div>
      </div>
      {legenda}
    </a>
  );
}

export default function InstagramFeed({
  publicacoes,
}: {
  publicacoes: PublicacaoInstagram[];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-6 sm:grid-cols-3 desktop:grid-cols-6">
      {publicacoes.map((publicacao) => (
        <Quadro key={publicacao.id} publicacao={publicacao} />
      ))}
    </div>
  );
}

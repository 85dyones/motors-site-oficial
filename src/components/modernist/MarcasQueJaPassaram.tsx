import Link from "next/link";

import type { Veiculo } from "../../types";
import { hubsDeMarca } from "../../lib/hubsDeEstoque";
import { SEGMENTOS_DE_PDP } from "../../lib/veiculoUrl";

/**
 * As marcas que a loja já vendeu e não tem à venda hoje — como link.
 *
 * ---------------------------------------------------------------------------
 * O buraco que este bloco fecha
 * ---------------------------------------------------------------------------
 * O hub de marca é PERENE: `/carros/toyota` continua no ar, e no sitemap,
 * depois que o último Corolla sai. É o ponto inteiro dele — o sinal que a URL
 * juntou não morre com o carro.
 *
 * Só que o índice de `/estoque` filtra `veiculos.length > 0`, e por boas
 * razões: marca com e sem carro na mesma lista confunde quem está comprando, e
 * a contagem "0" ao lado do nome comunica loja vazia. O efeito colateral é que
 * a marca sem estoque perde o único link interno que tinha e vira URL órfã —
 * existe no sitemap e em navegação nenhuma.
 *
 * Medido em produção em 2026-09-08, cruzando o sitemap com um rastreio de três
 * níveis a partir da home: 12 hubs sem nenhum link apontando para eles. Cinco
 * de marca (Toyota, Citroën, Mercedes-Benz, JTZ, Suzuki) e os sete de modelo
 * pendurados neles, que só são alcançáveis pela marca.
 *
 * ---------------------------------------------------------------------------
 * Por que a assinatura NÃO tem segmento
 * ---------------------------------------------------------------------------
 * `hubsDeMarca` pede um segmento, e todos os seis chamadores do repositório
 * passam `"carros"` — a página de estoque, os recortes, a página geo, o rodapé.
 * Resultado: o segmento `motos` inteiro nunca entrou em navegação nenhuma, com
 * ou sem estoque. `/motos/honda` só é alcançável hoje porque uma ficha de moto
 * aponta para ele; no dia em que a última moto Honda vender, ele fica órfão
 * exatamente como a Suzuki já está.
 *
 * Este componente recebe `historico` e `disponiveis` e varre `SEGMENTOS_DE_PDP`
 * por conta própria. Não é possível chamá-lo pela metade — que é a única forma
 * de a correção não se desfazer sozinha no próximo segmento que o site ganhar.
 *
 * A decisão de QUEM entra mora aqui dentro, junto do desenho, e não na página:
 * um `.filter` no ponto de montagem seria invisível para o teste que renderiza
 * o bloco. Ver `tests/nenhum-hub-orfao.test.ts`.
 */
export default function MarcasQueJaPassaram({
  historico,
  disponiveis,
}: {
  historico: Veiculo[];
  disponiveis: Veiculo[];
}) {
  // Sem unidade à venda AGORA, em qualquer segmento. `historico` é a fonte de
  // existência: marca que a loja nunca teve não vira link, senão o bloco abriria
  // espaço de URL infinito apontando para 404.
  const semEstoque = SEGMENTOS_DE_PDP.flatMap((segmento) =>
    hubsDeMarca(historico, disponiveis, segmento).filter((m) => m.veiculos.length === 0),
  );

  if (semEstoque.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Marcas que já passaram pela loja</h2>
      <p className="m-0 mt-2 max-w-[620px] text-[13px] leading-relaxed text-mt-neutral-800">
        Sem unidade à venda no momento. O estoque gira — se você procura uma destas, avise que a
        gente busca.
      </p>
      {/* Link simples, sem moldura e sem contagem.
          A moldura é do bloco de cima, onde ela separa opções que existem
          agora; repetida aqui, daria a estes o mesmo peso visual dos que têm
          carro no pátio. E "TOYOTA 0" comunicaria loja vazia — a contagem é
          notícia boa lá em cima e seria o contrário aqui. */}
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
        {semEstoque.map((m) => (
          <li key={`${m.segmento}/${m.slug}`}>
            <Link
              href={`/${m.segmento}/${m.slug}`}
              className="mt-foco text-[12px] font-semibold uppercase tracking-[.06em] text-mt-neutral-700 underline decoration-mt-regua underline-offset-4 hover:text-mt-ink hover:decoration-mt-accent"
            >
              {m.nome}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

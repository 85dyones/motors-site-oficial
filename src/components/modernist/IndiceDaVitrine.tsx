import Link from "next/link";
import type { Veiculo } from "../../types";
import { indiceDaVitrine } from "../../lib/vitrine";

/**
 * O índice de fichas, renderizado no servidor.
 *
 * Existe como componente — e não como um `.map()` solto dentro de
 * `app/estoque/page.tsx` — por um motivo específico, levantado na revisão de
 * 2026-09-04: a lista precisa cobrir o estoque INTEIRO, e um `.slice(0, 9)`
 * enfiado no `.map()` do JSX devolve o defeito sem que teste nenhum perceba.
 * Enquanto a decisão morava na página, o único guarda possível era `grep` na
 * marcação, e `grep` não vê regra invertida.
 *
 * Aqui ela vira comportamento verificável: o componente é síncrono, não busca
 * dado e não usa hook de roteador, então o teste o renderiza de verdade com
 * `renderToStaticMarkup` e CONTA os links que saíram. Recortar a lista, ou
 * apagar o bloco, fica vermelho.
 *
 * `GradeDeVeiculos` nasceu pelo mesmo motivo e é o precedente do repositório:
 * marcação que o servidor precisa garantir mora em componente próprio.
 */
export default function IndiceDaVitrine({ disponiveis }: { disponiveis: Veiculo[] }) {
  const fichas = indiceDaVitrine(disponiveis);

  // Cabeçalho seguido de nada é ruído para quem lê e landmark vazio para quem
  // usa leitor de tela. E a âncora que aponta para cá, no fallback do
  // <Suspense>, é escondida pelo mesmo motivo — as duas seguem a mesma régua.
  if (fichas.length === 0) return null;

  return (
    // `scroll-mt-24` porque o header é `sticky top-0`: sem a folga, a âncora
    // deixa o título embaixo dele. Mesma régua que `/privacidade` já usa.
    <section id="todos-os-veiculos" className="mb-8 scroll-mt-24">
      <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">
        Todos os veículos à venda <span className="text-mt-accent">{fichas.length}</span>
      </h2>
      <ul className="m-0 mt-4 list-none columns-1 gap-x-8 p-0 sm:columns-2 lg:columns-3">
        {fichas.map((ficha) => (
          <li key={ficha.id} className="mb-1.5 break-inside-avoid">
            <Link
              href={ficha.href}
              className="mt-foco text-[13px] text-mt-neutral-800 no-underline hover:text-mt-accent hover:underline"
            >
              {ficha.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

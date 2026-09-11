"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Os caminhos de volta, tirados da URL que não achou carro.
 *
 * ---------------------------------------------------------------------------
 * Por que este componente existe, num pacote que se orgulha de não criar
 * componente novo
 * ---------------------------------------------------------------------------
 * `not-found.tsx` é Server Component e **não recebe props** — a documentação
 * do Next 16 é literal: *"not-found.js or global-not-found.js components do
 * not accept any props"*. Não há `params`, e não há cabeçalho confiável com o
 * caminho concreto. A mesma página da documentação dá o único caminho:
 * *"If you need to use Client Component hooks like `usePathname` to display
 * content based on the path, you must fetch data on the client-side instead"*.
 *
 * Então este componente existe porque a plataforma obriga. E ele faz o mínimo
 * que a obrigação exige: **manipulação de string, nenhum dado**. Nenhum
 * veículo, nenhuma chamada de rede, nada que engorde o payload de uma página
 * que só aparece quando algo já deu errado.
 *
 * ---------------------------------------------------------------------------
 * O que ele NÃO tenta adivinhar
 * ---------------------------------------------------------------------------
 * Não escolhe carro "parecido" a partir do slug. Quem cai aqui chegou por URL
 * truncada em app de mensagem, link velho para um id que nunca existiu ou erro
 * de digitação — o slug é entrada NÃO CONFIÁVEL. Cascatear similares por uma
 * marca digitada errada devolve um carrossel da marca errada com cara de
 * acerto, que é pior do que uma seleção honesta do estoque de hoje.
 *
 * Marca e modelo viram LINK, que é verificável pelo próprio visitante ao
 * clicar, e não recomendação, que ele teria de acreditar.
 */

/** `robust-cd-1-6` → `Robust Cd 1 6`. Sem inventar acento nem pontuação. */
function comoTitulo(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export default function SaidaDaFichaSumida() {
  const caminho = usePathname() ?? "";
  const partes = caminho.split("/").filter(Boolean);

  // `/carros/volkswagen/saveiro/<ficha>` — quatro segmentos. Menos que isso é
  // uma URL que nem chegou a parecer uma ficha, e aí não há marca nem modelo
  // para oferecer: a página segue com o estoque e o "ver todo o estoque", que
  // já bastam para não ser um beco.
  if (partes.length < 3) return null;

  const [categoria, marca, modelo] = partes;
  const nomeDaMarca = comoTitulo(marca);
  const nomeDoModelo = comoTitulo(modelo);

  return (
    <nav aria-label="Caminhos de volta" className="mt-8 flex flex-col gap-3">
      {/* Âncoras descritivas: quem lê com leitor de tela, ou quem varre a
          página com os olhos, precisa saber para onde vai sem ler a frase
          inteira em volta. "Clique aqui" e "ver todos" não dizem nada. */}
      <Link href={`/${categoria}/${marca}/${modelo}`} className="mt-link-regua mt-foco">
        Ver todos os {nomeDaMarca} {nomeDoModelo} no estoque
      </Link>
      <Link href={`/${categoria}/${marca}`} className="mt-link-regua mt-foco">
        Ver todos os {nomeDaMarca} no estoque
      </Link>
    </nav>
  );
}

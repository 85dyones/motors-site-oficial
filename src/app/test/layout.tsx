import { notFound } from "next/navigation";

/**
 * O harness de testes existe só em desenvolvimento — e agora o SERVIDOR sabe
 * disso.
 *
 * ---------------------------------------------------------------------------
 * O que estava errado
 * ---------------------------------------------------------------------------
 * `page.tsx` é `"use client"` e a guarda dele (`IS_DEV`) roda no navegador.
 * Em produção o React até trocava a tela por "Área Restrita", mas o HTML saía
 * inteiro: 41 KB respondidos com **200**, título "Motors Store | Fora da
 * Curva", sem `noindex`, e o bundle do harness junto.
 *
 * A única proteção era `Disallow: /test` no robots.txt — que pede ao rastreador
 * para não VISITAR, e não impede o Google de indexar a URL se alguém a linkar
 * de fora. Uma página de teste de lead e funil ranqueando no nome da loja é o
 * tipo de coisa que ninguém descobre até estar acontecendo.
 *
 * ---------------------------------------------------------------------------
 * As duas travas, e por que as duas
 * ---------------------------------------------------------------------------
 * `notFound()` em produção resolve: a rota passa a responder **404** e o que
 * volta é a página de não-encontrado do site — 21 KB, contra os 41 KB de
 * antes. O chunk do harness some; o layout raiz e os bundles dele continuam
 * saindo, porque é uma página do site como outra qualquer. Provado no
 * artefato do build: `.next/server/app/test.meta` traz `"status": 404`.
 *
 * Não tira função de ninguém — a página já se recusava a funcionar fora do
 * desenvolvimento, então o que sai do ar é só a casca. Vale também para o
 * preview da Vercel, onde `NODE_ENV` é `production`: lá o harness já não
 * rodava, pelo mesmo motivo.
 *
 * O `noindex` fica junto, e não é redundância inútil: se um dia alguém precisar
 * abrir o harness em produção e remover o `notFound`, a rota não volta ao
 * índice de brinde. A ordem importa — a trava que se remove por engano é
 * sempre a que estava sozinha.
 */
export const metadata = {
  robots: { index: false, follow: false },
};

export default function LayoutDoHarnessDeTestes({
  children,
}: {
  children: React.ReactNode;
}) {
  /* `NODE_ENV` é o mesmo critério que a página já usava para si — a diferença é
     que aqui ele decide no servidor, antes de qualquer byte sair. */
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <>{children}</>;
}

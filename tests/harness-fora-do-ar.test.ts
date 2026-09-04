import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { lerCodigo } from "./fonte";

/**
 * O harness de testes não é servido em produção.
 *
 * ---------------------------------------------------------------------------
 * O que estava errado
 * ---------------------------------------------------------------------------
 * `src/app/test/page.tsx` é `"use client"`, e a guarda dele (`IS_DEV`) roda no
 * NAVEGADOR. Em produção o React trocava a tela por "Área Restrita", mas o
 * servidor já tinha respondido: `curl -A Googlebot https://motorsstore.com.br/test`
 * devolvia **200**, 41 KB, título "Motors Store | Fora da Curva", sem
 * `noindex`, com o bundle do harness de testes de lead e funil junto.
 *
 * A única proteção era `Disallow: /test` no robots.txt — que pede ao rastreador
 * para não visitar, e não impede o Google de indexar a URL se alguém a linkar
 * de fora.
 */

describe("a rota /test", () => {
  const caminho = "src/app/test/layout.tsx";

  it("tem um layout de servidor — a guarda do cliente não basta", () => {
    /* `page.tsx` não pode resolver isto sozinho: componente de cliente não
       exporta `metadata` e não roda antes da resposta. O layout é servidor por
       padrão, e é o único lugar da rota onde as duas coisas cabem. */
    expect(existsSync(caminho), "o layout de servidor da rota /test sumiu").toBe(true);
  });

  it("responde 404 em produção — sem HTML, sem bundle", () => {
    const layout = lerCodigo(caminho);
    expect(layout).toContain('process.env.NODE_ENV === "production"');
    expect(layout).toContain("notFound()");
  });

  it("e declara noindex, para o caso de alguém remover o 404", () => {
    /* Não é redundância inútil. Se um dia o harness precisar abrir em
       produção e o `notFound` sair, a rota não volta ao índice de brinde — a
       trava que se remove por engano é sempre a que estava sozinha. */
    const layout = lerCodigo(caminho);
    expect(layout).toContain("robots: { index: false, follow: false }");
  });

  it("a página em si continua se recusando a funcionar fora do desenvolvimento", () => {
    // A guarda antiga fica: ela é a que protege quem roda `next start` local
    // com NODE_ENV de produção, e não custa nada.
    const page = lerCodigo("src/app/test/page.tsx");
    expect(page).toContain('process.env.NODE_ENV === "development"');
  });
});

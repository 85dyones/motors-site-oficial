import { describe, it, expect, vi, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Veiculo } from "../src/types";

/**
 * A auditoria não pode relatar sobre carro que não existe.
 *
 * Em 2026-09-01 `npm run auditoria:estoque` rodou sem `.env.local` carregada.
 * Sem credencial, `getEstoque()` cai no `MOCK_ESTOQUE` — Porsche 911 de
 * R$ 998.000, Defender 110, BYD Dolphin — e o relatório saiu formatado,
 * completo e plausível: slug, nome do veículo, contagem de fotos, código de
 * saída. Nada nele dizia que o pátio era inventado.
 *
 * Virou conclusão apresentada ao dono e escrita num commit ("cinco carros de
 * ticket alto fora da vitrine"). O estoque real tinha quatro bloqueados, todos
 * de entrada: Kombi, Parati, Sandero, Voyage.
 *
 * O que torna o defeito caro não é errar — é errar com a APARÊNCIA de acerto.
 * Relatório que quebra ninguém cita; relatório bonito vira decisão. Daí o
 * invariante que este arquivo guarda: na dúvida, a auditoria não roda.
 */

const RAIZ = join(__dirname, "..");
const SCRIPT = join("scripts", "auditoria-estoque.ts");

describe("ehEstoqueDeContingencia", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reconhece a lista que o próprio getEstoque devolve sem credencial", async () => {
    /* Sem crava id nenhum de propósito: zerar as variáveis e reavaliar o módulo
       faz `getEstoque` percorrer o caminho REAL da contingência. Se um dia
       alguém trocar os cinco carros fictícios, este teste continua valendo — é
       a lista de verdade que está sendo julgada, não uma cópia dela aqui.

       E não há rede envolvida: cliente não configurado nem chega a consultar. */
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.resetModules();

    const { getEstoque, ehEstoqueDeContingencia } = await import("../src/lib/supabase");
    const lista = await getEstoque({ incluirForaDoFeed: true, incluirNaoPublicaveis: true });

    expect(lista.length).toBeGreaterThan(0);
    expect(ehEstoqueDeContingencia(lista)).toBe(true);
  });

  it("não confunde o pátio real com o mock", async () => {
    const { ehEstoqueDeContingencia } = await import("../src/lib/supabase");

    // Os dois formatos de id que existem em produção: inteiro do RevendaMais e
    // a faixa ≥ 900000001 do veículo nascido no painel.
    const patio = [
      { id: "5417803" },
      { id: "900000001" },
    ] as Pick<Veiculo, "id">[];

    expect(ehEstoqueDeContingencia(patio)).toBe(false);
  });

  it("lista vazia não é contingência — é outro problema, com outra mensagem", async () => {
    const { ehEstoqueDeContingencia } = await import("../src/lib/supabase");
    expect(ehEstoqueDeContingencia([])).toBe(false);
  });
});

describe("o script não importa o supabase antes de carregar a env", () => {
  /**
   * Este é o teste de uma sutileza que some numa arrumação de imports.
   *
   * `src/lib/supabase.ts` lê `process.env` numa `const` de topo de módulo, e
   * import estático é avaliado ANTES de qualquer statement do arquivo que
   * importa. Um `import { getEstoque } from "../src/lib/supabase"` no topo faz
   * a URL do Supabase congelar em `""` antes do `loadEnvFile` rodar — e o
   * comando volta a nunca funcionar, sem nenhum erro.
   *
   * A trava pegaria (falha segura), mas o sintoma seria "a auditoria não roda
   * mais" sem ninguém saber por quê. Melhor um vermelho que diz o motivo.
   */
  it("chega ao módulo por await import(), não por import estático", () => {
    // `split(/\r?\n/)`: o repo guarda LF e o checkout no Windows entrega CRLF.
    const linhas = readFileSync(join(RAIZ, SCRIPT), "utf8").split(/\r?\n/);
    const importaEstatico = linhas.some(
      (l) => /^import\s/.test(l) && /["']\.\.\/src\/lib\/supabase["']/.test(l) && !/^import type\s/.test(l),
    );
    expect(importaEstatico).toBe(false);
  });
});

/**
 * `npx tsx` resolve na rede quando não há cache. Sem ele, PULA — não fica
 * vermelho. Mesma disciplina de `migracoes-executam.test.ts`: vermelho por
 * ausência de infraestrutura ensina a ignorar vermelho.
 */
/* Comando numa string só, e não `(comando, args[])`: no Windows o `npx` é um
   `.cmd`, que o Node se recusa a executar sem shell — e passar array COM shell
   é o que dispara o DEP0190. Como a linha é constante literal, não há argumento
   de fora para escapar. */
const temTsx =
  spawnSync("npx --no-install tsx --version", { cwd: RAIZ, encoding: "utf8", shell: true }).status === 0;

describe.skipIf(!temTsx)("a auditoria se recusa a rodar, de ponta a ponta", () => {
  it(
    "sem credencial: sai com código ≠ 0, diz o que fazer, e não estampa carro fictício",
    () => {
      /* String VAZIA, não `undefined`: variável já presente no ambiente
         sobrevive ao `process.loadEnvFile` — inclusive vazia (medido). É o que
         torna este teste determinístico haja ou não `.env.local` na árvore. */
      const r = spawnSync(`npx --no-install tsx ${SCRIPT}`, {
        cwd: RAIZ,
        env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
        encoding: "utf8",
        shell: true,
      });
      const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;

      expect(r.status).not.toBe(0);
      // Diz o que fazer, não só que deu errado.
      expect(saida).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
      expect(saida).toMatch(/MOCK_ESTOQUE/);
      // A asserção que descreve o defeito de 01/09.
      expect(saida).not.toMatch(/Porsche/i);
    },
    120_000,
  );
});

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Configuração do runner de testes (Pacote 0.5, item 4).
 *
 * Os critérios de aceite dos Pacotes 1–9 exigem prova por teste automatizado
 * ("confirme por teste, não por inspeção visual"). Este arquivo inaugura essa
 * infraestrutura — até aqui o projeto não tinha nenhuma.
 *
 * Ambiente `node`: os testes atuais cobrem lógica pura, migrações e invariantes
 * do repositório. Testes de componente (Pacotes 6 e 7) vão precisar de
 * `environment: "jsdom"` e do plugin React — adicionar quando chegarem.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Sem acesso a banco nesta fase: nenhum teste aqui abre conexão.
    // Os testes de RLS do Pacote 1 exigem instância Supabase de teste (ver
    // AUDITORIA.md §5.7) e vão precisar de um projeto/branch dedicado.
  },
});

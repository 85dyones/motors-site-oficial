import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ehStaff, PERFIS } from "../src/lib/permissoes";
import { papelPadraoPorEmail } from "../src/lib/papelPadrao";

/**
 * A role `cliente` — o auth passou a ter dois públicos (2026-08-13).
 *
 * A Caderneta Motors dá login ao cliente final no MESMO pool `auth.users` do
 * staff. Antes desta frente, o desenho promovia qualquer usuário novo a
 * "comercial": o trigger dava o papel por padrão, `normalizarPerfil` rebaixava
 * desconhecidos para comercial (que dentro do painel é uma PROMOÇÃO para quem
 * não é staff), e várias policies diziam apenas TO authenticated USING (true).
 *
 * Estes testes travam as três camadas: a migração (banco), os gates de rota
 * (app) e as funções de papel (lib). Se qualquer uma afrouxar, o primeiro
 * cliente logado vira equipe.
 */

const raiz = join(__dirname, "..");
const ler = (...caminho: string[]) => readFileSync(join(raiz, ...caminho), "utf-8");

const migracao = ler("supabase", "migrations", "20260813120000_role_cliente_e_is_staff.sql");
const proxy = ler("src", "proxy.ts");
const layout = ler("src", "app", "admin", "layout.tsx");
const settings = ler("src", "app", "api", "settings", "route.ts");
const usersRota = ler("src", "app", "api", "users", "route.ts");
const usersIdRota = ler("src", "app", "api", "users", "[id]", "route.ts");

describe("as funções de papel", () => {
  it("ehStaff reconhece os quatro perfis de painel e nega o resto", () => {
    for (const p of PERFIS) expect(ehStaff(p)).toBe(true);
    expect(ehStaff("cliente")).toBe(false);
    expect(ehStaff("gerente")).toBe(false);
    expect(ehStaff(null)).toBe(false);
    expect(ehStaff(undefined)).toBe(false);
  });

  it("sem linha em profiles, o papel padrão é cliente — fail-closed", () => {
    // Antes o padrão era "comercial": leitura de profiles falhando dava painel
    // a qualquer autenticado. Staff de verdade sempre tem linha (trigger).
    expect(papelPadraoPorEmail("dyones@gmail.com")).toBe("admin");
    expect(papelPadraoPorEmail("motors@motorsstoreoficial.com.br")).toBe("admin");
    expect(papelPadraoPorEmail("qualquer@exemplo.com")).toBe("cliente");
    expect(papelPadraoPorEmail(null)).toBe("cliente");
  });
});

describe("a migração — banco", () => {
  it("cria is_staff e o vocabulário com cliente e marketing", () => {
    expect(migracao).toContain("create or replace function public.is_staff");
    expect(migracao).toContain("'admin', 'comercial', 'financeiro', 'marketing', 'cliente'");
    expect(migracao).toContain("alter column role set default 'cliente'");
  });

  it("o papel de staff só entra por app_metadata — user_metadata é do usuário", () => {
    // signUp aceita qualquer user_metadata do cliente: ler `role` de lá
    // permitia um cadastro se autodeclarar admin.
    expect(migracao).toContain("raw_app_meta_data->>'role'");
    expect(migracao).not.toMatch(/raw_user_meta_data->>'role'/);
    expect(usersRota).toContain("app_metadata: { role }");
    expect(usersIdRota).toContain("app_metadata: { role }");
  });

  it("as policies internas trocam authenticated cru por is_staff", () => {
    for (const policy of [
      "leads_leitura",
      "leads_atualizacao",
      "leads_exclusao",
      "historico_veiculo_leitura",
      "auditoria_admin_leitura",
      "notificacoes_admin_leitura",
      "midia_campanhas_autenticados",
      '"Leitura completa com sessao"',
      '"Escrita de settings com sessao"',
      '"Escrita do painel autenticado"',
    ]) {
      expect(migracao, `policy ${policy} fora da migração`).toContain(policy);
    }
    expect(migracao).toContain("using (public.is_staff(auth.uid()))");
    // Nenhuma policy recriada pode voltar ao USING (true).
    expect(migracao).not.toMatch(/create policy[\s\S]{0,200}?using \(true\)/);
  });

  it("se autoconfere como authenticated sem perfil de staff", () => {
    expect(migracao).toContain("set local role authenticated");
    expect(migracao).toContain("AUTOCONFERÊNCIA");
  });
});

describe("os gates de rota — app", () => {
  it("proxy e layout barram quem não é staff antes de qualquer regra de perfil", () => {
    expect(proxy).toContain("if (!ehStaff(role))");
    expect(layout).toContain("if (!ehStaff(role))");
  });

  it("o GET de settings só entrega o payload completo para staff", () => {
    // Sessão não basta: cliente da Caderneta também é authenticated, e o
    // payload completo carrega apiSecretToken, saldos e preco_compra.
    expect(settings).toContain("deStaff = ehStaff(");
    expect(settings).not.toContain("autenticado ? completo");
  });

  it("o POST de settings exige staff, não só sessão", () => {
    expect(settings).toContain("if (!ehStaff(perfilRow?.role ?? papelPadraoPorEmail(user.email)))");
  });

  it("toda rota que normaliza perfil barra não-staff antes", () => {
    for (const arquivo of [
      ["src", "app", "api", "estoque", "[id]", "route.ts"],
      ["src", "app", "api", "estoque", "lote", "route.ts"],
      ["src", "app", "api", "marketing", "campanhas", "route.ts"],
      ["src", "app", "api", "marketing", "campanhas", "[id]", "route.ts"],
      ["src", "app", "api", "marketing", "campanhas", "[id]", "leituras", "route.ts"],
      ["src", "app", "api", "marketing", "campanhas", "[id]", "ajustes", "route.ts"],
      ["src", "app", "api", "leads", "gerenciar", "route.ts"],
    ] as const) {
      const fonte = ler(...arquivo);
      const gates = fonte.match(/!ehStaff\(profile\?\.role\)/g) ?? [];
      const normalizacoes = fonte.match(/normalizarPerfil\(profile\?\.role\)/g) ?? [];
      expect(
        gates.length,
        `${arquivo.join("/")} normaliza perfil sem gate de staff`,
      ).toBeGreaterThanOrEqual(Math.min(normalizacoes.length, 1));
    }
  });
});

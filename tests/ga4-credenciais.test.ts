import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ler, lerCodigo } from "./fonte";
import { mascararGa4 } from "../src/app/api/settings/route";

/**
 * Credenciais do GA4 — painel primeiro, env de reserva, chave que não volta.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * Até 27/08 o GA4 era a única integração da casa que só se ligava por variável
 * de ambiente. Todo o resto que é segredo configurável — o `apiSecretToken` do
 * n8n à frente — já se resolvia pelo painel, com a env de reserva. A diferença
 * prática não é de estilo: pelo painel quem liga o recurso é o dono; pela env,
 * quem tem acesso à Vercel e sabe redeployar.
 *
 * Mover a credencial para o banco cria dois modos de falhar que não existiam, e
 * são estes que as asserções abaixo protegem:
 *
 *   1. a chave privada vazando para a tela a cada abertura de Configurações;
 *   2. o salvamento do formulário APAGANDO a chave, porque o campo mascarado
 *      volta vazio e um upsert ingênuo grava o vazio por cima.
 *
 * O segundo é o traiçoeiro: quem salvar o ID da propriedade derruba o
 * analytics, e o sintoma aparece dias depois como "parou sozinho".
 */

describe("1 · a chave privada não volta para a tela", () => {
  const completo = {
    companySettings: { phone: "41 3333-4444" },
    ga4: {
      propertyId: "123456789",
      clientEmail: "painel@projeto.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nSEGREDOxyz\n-----END PRIVATE KEY-----\n",
    },
  };

  it("a máscara troca a chave por um booleano", () => {
    const saida = mascararGa4(completo) as any;
    expect(saida.ga4.privateKey).toBeUndefined();
    expect(saida.ga4.privateKeyConfigurada).toBe(true);
    // O resto sobrevive: sem `propertyId` e `clientEmail` a tela não teria o
    // que mostrar, e o dono não saberia qual conta está ligada.
    expect(saida.ga4.propertyId).toBe("123456789");
    expect(saida.ga4.clientEmail).toContain("gserviceaccount.com");
    expect(saida.companySettings.phone).toBe("41 3333-4444");
  });

  it("a chave não aparece em NENHUM lugar do JSON servido", () => {
    // Asserção sobre o corpo inteiro, e não sobre o campo: se alguém um dia
    // copiar a credencial para outro canto do payload — um `integracoes`, um
    // `debug` —, o teste do campo passaria e este cai.
    const corpo = JSON.stringify(mascararGa4(completo));
    expect(corpo).not.toContain("SEGREDOxyz");
    expect(corpo).not.toContain("BEGIN PRIVATE KEY");
  });

  it("chave em branco não vira `configurada ✓`", () => {
    const saida = mascararGa4({ ga4: { propertyId: "1", privateKey: "   " } }) as any;
    expect(saida.ga4.privateKeyConfigurada).toBe(false);
  });

  it("payload sem `ga4` atravessa intacto", () => {
    // O GET de visitante anônimo nunca traz a linha; a máscara não pode
    // inventar um objeto vazio e fazer a tela achar que há credencial.
    // `ga4: undefined` explícito: o tipo do parâmetro exige a chave, e um
    // objeto que nem a declara não é o caso que interessa aqui — o GET sempre
    // monta o payload com todas as chaves de `getCachedSettings`.
    const semGa4 = { companySettings: { phone: "x" }, ga4: undefined };
    expect(mascararGa4(semGa4)).toBe(semGa4);
    expect((mascararGa4({ ga4: null }) as any).ga4).toBeNull();
  });

  it("o GET aplica a máscara no ramo de staff", () => {
    const rota = lerCodigo("src/app/api/settings/route.ts");
    expect(rota).toMatch(/deStaff \? mascararGa4\(completo\)/);
  });
});

describe("2 · salvar sem a chave preserva a chave", () => {
  const rota = lerCodigo("src/app/api/settings/route.ts");
  const bloco = rota.slice(rota.indexOf('if (ga4) {'), rota.indexOf('if (popups) {'));

  it("o POST lê a linha atual antes de gravar", () => {
    expect(bloco.length).toBeGreaterThan(200);
    expect(bloco).toContain('.eq("id", "ga4")');
    expect(bloco).toMatch(/privateKey/);
  });

  it("a leitura acontece justamente quando o corpo vem sem chave", () => {
    // É o caso normal, não a exceção: a tela nunca recebe a chave, então
    // quase todo salvamento chega sem ela.
    expect(bloco).toMatch(/if \(!String\(ga4\.privateKey \?\? ""\)\.trim\(\)\)/);
  });

  it("`privateKeyConfigurada` não é gravada no banco", () => {
    // É campo de RESPOSTA. Gravado, viraria dado obsoleto assim que a chave
    // mudasse, e um dia alguém o leria como verdade.
    expect(bloco).toContain("delete paraGravar.privateKeyConfigurada");
  });
});

describe("3 · painel primeiro, env de reserva", () => {
  const fonte = lerCodigo("src/lib/analytics.ts");

  it("cada campo cai na env por conta própria", () => {
    // Tudo-ou-nada por fonte quebraria quem já tem as envs e escrever só o
    // `propertyId` no painel — a gravação parcial derrubaria o recurso.
    for (const campo of ["GA4_PROPERTY_ID", "GA4_CLIENT_EMAIL", "GA4_PRIVATE_KEY"]) {
      expect(fonte, campo).toContain(`process.env.${campo}`);
    }
    expect(fonte).toContain("getCachedSettings");
  });

  it("faltando qualquer um dos três, devolve `null` — nunca zero", () => {
    // `null` é o que as telas do painel já esperam para desenhar "—". Zero
    // seria um número, e número mente: parece que ninguém visitou.
    expect(fonte).toMatch(/if \(!propertyId \|\| !clientEmail \|\| !privateKey\) return null;/);
  });

  it("o relatório usa o `propertyId` resolvido, não a env crua", () => {
    // Era a terceira leitura de `process.env`, escondida na URL do runReport:
    // com credencial vinda do painel, ela apontaria para a propriedade errada
    // (ou para nenhuma) enquanto o token seria o certo — 403 sem explicação.
    expect(fonte).toContain("properties/${cred.propertyId}");
    expect(fonte).not.toContain("properties/${process.env");
  });

  it("o cache do token é chaveado pela conta de serviço", () => {
    // Sem a chave, trocar a conta no painel deixava o token da conta ANTIGA
    // valendo por até uma hora.
    expect(fonte).toMatch(/tokenCache\.conta === cred\.clientEmail/);
  });

  it("falha ao ler settings não apaga a credencial de ambiente", () => {
    // Settings fora do ar não pode derrubar o analytics de quem configurou por
    // env: seria uma falha de um subsistema apagando outro.
    const trecho = fonte.slice(fonte.indexOf("export async function credenciaisDoGa4"));
    expect(trecho).toContain("catch");
  });
});

describe("4 · a credencial não sai para o site público", () => {
  it("`ga4` fica fora do recorte público", () => {
    // A função é whitelist — por isso a linha nova nasce privada. O teste
    // existe para o dia em que alguém a transformar em blacklist "para
    // simplificar".
    const fonte = ler("src/lib/settings.ts");
    const inicio = fonte.indexOf("export function recortePublicoDeSettings");
    expect(inicio).toBeGreaterThan(-1);
    expect(fonte.slice(inicio)).not.toMatch(/^\s*ga4:/m);
  });

  it("a RLS anônima não lista `ga4`", () => {
    // A whitelist de ids da migração 20260812120000. Se `ga4` entrasse ali, a
    // chave privada responderia à anon key — a mesma que vai no bundle.
    const migracao = ler("supabase/migrations/20260812120000_rls_leitura_de_site_settings.sql");
    const policy = migracao.slice(migracao.indexOf("Leitura anonima do recorte publico"));
    expect(policy).toContain("'company'");
    expect(policy).not.toContain("'ga4'");
  });

  it("nenhum componente de cliente lê a chave", () => {
    const painel = lerCodigo("src/components/ConfiguracoesClientWrapper.tsx");
    // O campo é de escrita: o estado local existe para o que foi digitado,
    // nunca para o que veio do servidor.
    expect(painel).not.toMatch(/setGa4PrivateKey\(\s*contextGa4/);
    expect(painel).toContain("privateKeyConfigurada");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A Garagem Motors — manual v1.1 §6.3, fase 1.
 *
 * O que este arquivo trava é o desenho de segurança do pacote, porque é ele
 * que não pode derivar num refactor:
 *
 *   1. A Garagem lê e escreve com o cliente DA SESSÃO, sob RLS. Chave de
 *      serviço não aparece em página nem rota de /garagem.
 *   2. O vínculo auth↔cliente nasce na venda e tem rede de segurança no
 *      login — e nenhum dos dois caminhos toca em papel.
 *   3. O link mágico verifica por token_hash no servidor, porque e-mail não
 *      garante mesmo navegador (PKCE) e fragmento não chega ao servidor.
 *   4. O destino pós-login é decidido pelo papel: cliente na Garagem, staff
 *      no painel. Cliente não escolhe destino por parâmetro.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

const migracao = ler("supabase", "migrations", "20260815180000_garagem_vinculo_do_cliente.sql");
const rotaConfirm = ler("src", "app", "api", "auth", "confirm", "route.ts");
const rotaCallback = ler("src", "app", "api", "auth", "callback", "route.ts");
const template = ler("supabase", "templates", "magic-link.html");
const rotaVendas = ler("src", "app", "api", "ciclo", "vendas", "route.ts");
const paginaGaragem = ler("src", "app", "garagem", "page.tsx");
const entrada = ler("src", "components", "garagem", "GaragemEntrada.tsx");
const veiculoComp = ler("src", "components", "garagem", "GaragemVeiculo.tsx");
const rotaKm = ler("src", "app", "api", "garagem", "km", "route.ts");
const rotaRevisoes = ler("src", "app", "api", "garagem", "revisoes", "route.ts");
const robots = ler("src", "app", "robots.ts");
const proxy = ler("src", "proxy.ts");
const fundacao = ler("supabase", "migrations", "20260813150000_ciclo_fundacao_de_dados.sql");

describe("o vínculo auth↔cliente", () => {
  it("a venda cria a conta e liga o vínculo — e-mail confirmado, sem segundo aviso", () => {
    expect(rotaVendas).toContain("createUser");
    expect(rotaVendas).toContain("email_confirm: true");
    expect(rotaVendas).toContain("vincular_auth_por_email");
    // Depois da transação da venda: soluço do Auth não desfaz venda gravada.
    expect(rotaVendas).toContain('garagem = "falhou"');
  });

  it("a reivindicação usa o e-mail do JWT — o chamador não escolhe o que reivindica", () => {
    expect(migracao).toContain("auth.jwt()->>'email'");
    expect(migracao).not.toMatch(/reivindicar_garagem\s*\([^)]*text/);
  });

  it("nenhum vínculo rouba vínculo existente", () => {
    // O lado da venda só preenche quando está nulo…
    expect(migracao).toContain("and c.auth_user_id is null");
    // …e o lado do login também, além de não vincular quem já tem cliente.
    expect(migracao).toContain("where c2.auth_user_id is null");
    expect(migracao).toContain("where c3.auth_user_id = auth.uid()");
  });

  it("vincular_auth_por_email é do service_role; reivindicar é do authenticated", () => {
    expect(migracao).toMatch(
      /revoke all on function public\.vincular_auth_por_email[^;]*from public, anon, authenticated/,
    );
    expect(migracao).toMatch(
      /grant execute on function public\.reivindicar_garagem[^;]*to authenticated/,
    );
  });

  it("nenhuma das funções toca em papel — vincular não é promover", () => {
    // Regra 2-b: papel de staff só entra por app_metadata. As funções de
    // vínculo não escrevem em profiles nem em raw_app_meta_data.
    const corpoDasFuncoes = migracao.slice(
      migracao.indexOf("create or replace function"),
      migracao.indexOf("-- 3. Autoconferência"),
    );
    expect(corpoDasFuncoes).not.toContain("update public.profiles");
    expect(corpoDasFuncoes).not.toContain("raw_app_meta_data");
  });

  it("a autoconferência cobre os dois lados e a recusa do e-mail alheio", () => {
    for (const cenario of [
      "usuário novo nasceu com papel",
      "vincular_auth_por_email não achou o usuário pelo e-mail",
      "reivindicar_garagem não vinculou",
      "reivindicar repetido vinculou de novo",
      "reivindicou cliente de OUTRO e-mail",
    ]) {
      expect(migracao, `cenário ausente: ${cenario}`).toContain(cenario);
    }
  });
});

describe("o link mágico entra por token_hash", () => {
  it("o template aponta para /api/auth/confirm, não para o ConfirmationURL", () => {
    // ConfirmationURL depende do fluxo que PEDIU o link: fora do PKCE, o
    // token volta em fragmento (#access_token) e o servidor nunca o vê — foi
    // o "volta para a entrada" de 2026-08-15. token_hash independe de onde o
    // link é aberto.
    expect(template).not.toContain("{{ .ConfirmationURL }}");
    const ocorrencias = template.match(/api\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=email/g);
    expect(ocorrencias, "o link precisa aparecer no botão E no texto de apoio").toHaveLength(2);
  });

  it("a rota verifica no servidor e trata link vencido sem beco sem saída", () => {
    expect(rotaConfirm).toContain("verifyOtp");
    expect(rotaConfirm).toContain("token_hash");
    // Vencido volta para a entrada da Garagem, onde se pede outro.
    expect(rotaConfirm).toContain("/garagem?erro=link-vencido");
  });

  it("o destino é papel, não parâmetro: cliente vai para a Garagem sempre", () => {
    expect(rotaConfirm).toContain("ehStaff(profile)");
    // O redirect do cliente é fixo — sem interpolação de next.
    expect(rotaConfirm).toContain("`${origin}/garagem`");
  });

  it("?next= continua sanitizado nas duas rotas de auth", () => {
    for (const rota of [rotaConfirm, rotaCallback]) {
      expect(rota).toContain('rawNext.startsWith("/")');
      expect(rota).toContain('!rawNext.startsWith("//")');
    }
  });
});

describe("a página e as rotas da Garagem", () => {
  it("nada na Garagem usa a chave de serviço — RLS decide tudo", () => {
    for (const [nome, conteudo] of [
      ["page", paginaGaragem],
      ["km", rotaKm],
      ["revisoes", rotaRevisoes],
    ] as const) {
      expect(conteudo, `${nome} importou o cliente admin`).not.toContain(
        "createAdminSupabaseClient",
      );
    }
  });

  it("staff é mandado ao painel; sem vínculo há saída humana, não beco", () => {
    expect(paginaGaragem).toContain('redirect("/admin")');
    expect(paginaGaragem).toContain("reivindicar_garagem");
    // Normalizado: o JSX quebra a frase em linhas.
    expect(paginaGaragem.replace(/\s+/g, " ")).toContain("fale com a loja");
  });

  it("a entrada responde NEUTRO — não confirma quem é cliente", () => {
    expect(entrada).toContain("shouldCreateUser: false");
    expect(entrada).toContain("Se ");
    expect(entrada).toContain("estiver no cadastro");
    // Nenhum ramo que diferencie "e-mail não encontrado".
    expect(entrada).not.toMatch(/não encontrado|nao encontrado|não cadastrado/i);
  });

  it("o registro do cliente nasce como cliente, pendente, sem carimbo", () => {
    expect(rotaRevisoes).toContain('origem_registro: "cliente"');
    expect(rotaRevisoes).not.toContain("confirmada_em");
    expect(rotaRevisoes).not.toContain("carimbar_revisao");
    expect(rotaKm).toContain('origem: "cliente"');
    // E a RLS da fundação é quem obriga — as rotas apenas concordam com ela.
    expect(fundacao).toContain("and origem_registro = 'cliente'");
    expect(fundacao).toContain("and origem = 'cliente'");
  });

  it("recusa da RLS vira 403 com mensagem de dono, não 500 genérico", () => {
    for (const rota of [rotaKm, rotaRevisoes]) {
      expect(rota).toContain('"42501"');
      expect(rota).toContain("não está na sua garagem");
    }
  });

  it("não registrar nunca penaliza — e a tela diz isso", () => {
    expect(veiculoComp).toContain("não muda nada no seu programa");
  });

  it("o vocabulário é o da marca: sem recompra, sem caderneta, sem saldo", () => {
    // O banimento é sobre o que RENDERIZA — comentário explicando por que a
    // palavra não aparece pode citá-la. Tira os comentários antes de medir.
    const semComentarios = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    for (const conteudo of [paginaGaragem, entrada, veiculoComp]) {
      const visivel = semComentarios(conteudo).toLowerCase();
      expect(visivel).not.toContain("recompra");
      expect(visivel).not.toContain("caderneta");
      expect(visivel).not.toContain("saldo");
    }
    expect(veiculoComp).toContain("Diário de bordo");
    expect(veiculoComp.toLowerCase()).toContain("procedência");
  });

  it("a consulta da página não carrega campo que o cliente não deve ver", () => {
    // O contrato traz garantia e plano; os campos de recompra ficam fora do
    // select — nascem nulos hoje, mas payload é payload.
    expect(paginaGaragem).not.toContain("recompra_valor");
    expect(paginaGaragem).not.toContain("custo_aquisicao");
    expect(paginaGaragem).not.toContain("valor_venda");
  });
});

describe("o fim do acompanhamento — o carro que saiu da Garagem", () => {
  // O bloco "PRÓXIMA REVISÃO" tem TRÊS ramos e a ordem deles é a regra:
  // `saiu_em` primeiro, `proxima` depois. Invertida, o ex-dono lê
  // "PRÓXIMA REVISÃO: <data futura>" — o programa prometendo serviço a quem já
  // saiu — e nada quebra: o componente compila, os outros testes passam, e o
  // erro só aparece na tela de um cliente que não é mais cliente.
  const bloco = veiculoComp.slice(veiculoComp.indexOf("PRÓXIMA REVISÃO"));

  it("a saída é testada ANTES da próxima janela", () => {
    // Sem o `: ` na frente, de propósito: a inversão troca `) : proxima ?` por
    // `{proxima ?`, e uma busca ancorada nos dois-pontos falharia dizendo que o
    // ramo "sumiu" em vez de dizer que a ORDEM mudou.
    const saiu = bloco.indexOf("veiculo.saiu_em ?");
    const prox = bloco.indexOf("proxima ?");
    expect(saiu, "o ramo de saiu_em sumiu do bloco da próxima revisão").toBeGreaterThan(-1);
    expect(prox, "o ramo de proxima sumiu do bloco da próxima revisão").toBeGreaterThan(-1);
    expect(saiu, "proxima é testada antes de saiu_em — o ex-dono vê data futura").toBeLessThan(
      prox,
    );
  });

  it("os três ramos dizem coisas diferentes, e nenhum promete ao ex-dono", () => {
    const texto = veiculoComp.replace(/\s+/g, " ");
    // 1. saiu: encerra e garante o histórico.
    expect(texto).toContain("Acompanhamento encerrado em");
    expect(texto).toContain("O diário de bordo abaixo continua seu.");
    // 2. tem janela aberta: o intervalo, o número e o KM previsto.
    expect(bloco).toContain("dataBr(proxima.janela_inicio)");
    expect(bloco).toContain("dataBr(proxima.janela_fim)");
    expect(texto).toContain("por volta de");
    // 3. sem janela ainda: nem promessa, nem beco.
    expect(texto).toContain("Estamos calculando a próxima janela.");
  });

  it("a promessa de que o histórico fica é a mesma da rota que marca a saída", () => {
    // A rota não apaga nada, e a tela diz exatamente isso ao cliente.
    expect(veiculoComp).toContain("continua seu");
  });
});

describe("o entorno", () => {
  it("/garagem está fora de busca", () => {
    const disallows = robots.match(/disallow: \[[^\]]*\]/gi) ?? [];
    expect(disallows.length).toBeGreaterThanOrEqual(2);
    for (const linha of disallows) {
      expect(linha).toContain('"/garagem"');
    }
    expect(paginaGaragem).toContain("index: false");
  });

  it("o middleware renova a sessão da Garagem sem virar porteiro", () => {
    // Server Component não grava cookie: sem a parada no middleware, a
    // rotação do refresh token mataria a sessão do cliente em ~1h.
    expect(proxy).toContain('path.startsWith("/garagem")');
    expect(proxy).toMatch(/"\/garagem\/:path\*"/);
    expect(proxy).toMatch(/"\/api\/garagem\/:path\*"/);
    // E a parada NÃO redireciona — a página decide o que mostrar.
    const trecho = proxy.slice(
      proxy.indexOf('path.startsWith("/garagem")'),
      proxy.indexOf("// 2. Auth protection"),
    );
    expect(trecho).not.toContain("redirect");
  });

  it("a página de login aponta o cliente para a Garagem", () => {
    const login = ler("src", "app", "login", "page.tsx");
    expect(login).toContain('href="/garagem"');
  });
});

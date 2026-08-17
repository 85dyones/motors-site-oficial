import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "Meus dados" — §6.3-D e §6.3-E, o fecho da fase 2.
 *
 * O bloco transforma obrigação de LGPD em prova de que não há nada escondido.
 * O que este arquivo trava:
 *
 *   1. O consentimento é escrito por função de escopo estreito, NUNCA por
 *      policy de UPDATE — a tabela `clientes` dá grant em todas as colunas ao
 *      mesmo papel que a equipe usa, e uma policy abriria cpf_cnpj e
 *      auth_user_id junto.
 *   2. Recusar nunca penaliza: nenhum cálculo do programa lê este campo.
 *   3. Chave que não liga nada não vira botão (a régua do §6.3-D v1.1).
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

const migracao = ler("supabase", "migrations", "20260815230000_consentimento_do_cliente.sql");
const rota = ler("src", "app", "api", "garagem", "consentimento", "route.ts");
const componente = ler("src", "components", "garagem", "MeusDados.tsx");
const exportacao = ler("src", "app", "garagem", "meus-dados", "page.tsx");
const pagina = ler("src", "app", "garagem", "page.tsx");
const motorSql = ler("supabase", "migrations", "20260814180000_motor_de_gatilhos.sql");
const conformidadeSql = ler("supabase", "migrations", "20260814150000_carimbo_e_conformidade.sql");

describe("a escrita do consentimento", () => {
  it("é função de escopo estreito, não policy de UPDATE", () => {
    expect(migracao).toContain("create or replace function public.atualizar_consentimento_canais");
    expect(migracao).toContain("security definer");
    // A policy que NÃO pode existir.
    expect(migracao).not.toMatch(/create policy \w+ on public\.clientes\s+for update/);
    expect(rota).toContain("atualizar_consentimento_canais");
  });

  it("escreve uma coluna só, da linha de quem chamou", () => {
    const corpo = migracao.slice(
      migracao.indexOf("create or replace function"),
      migracao.indexOf("comment on function"),
    );
    expect(corpo).toContain("set consentimento_canais = v_novo");
    expect(corpo).toContain("where auth_user_id = auth.uid()");
    // Nada de cadastro, nada de vínculo.
    expect(corpo).not.toContain("cpf_cnpj =");
    expect(corpo).not.toContain("auth_user_id =" + " v_");
    expect(corpo).not.toContain("email =");
  });

  it("preserva o que não é canal e deixa a escolha datada", () => {
    expect(migracao).toContain("v_atual\n            || jsonb_build_object(");
    expect(migracao).toContain("'atualizado_em'");
    expect(migracao).toContain("'atualizado_por', 'cliente'");
  });

  it("exige booleano de verdade — string vazia não vira 'desligou tudo'", () => {
    expect(rota).toContain('typeof corpo?.whatsapp !== "boolean"');
    expect(migracao).toContain("p_whatsapp is null or p_email is null");
  });

  it("a autoconferência cobre o que define a regra", () => {
    for (const cenario of [
      "desligar o WhatsApp não gravou",
      "o e-mail foi junto sem ser pedido",
      "a chave sms sumiu do jsonb",
      "a escolha não ficou datada",
      "não deu para desligar todos os canais",
      "o cadastro mudou junto com o consentimento",
      "cliente reescreveu o próprio cadastro por UPDATE direto",
    ]) {
      expect(migracao, `cenário ausente: ${cenario}`).toContain(cenario);
    }
  });
});

describe("recusar nunca penaliza", () => {
  it("o consentimento só apaga o envio — não entra em conformidade nem em índice", () => {
    // O motor lê o campo para SUPRIMIR, com motivo audível.
    expect(motorSql).toContain("'sem_canal_consentido'");
    // E nada do cálculo do programa olha para ele.
    expect(conformidadeSql).not.toContain("consentimento_canais");
  });

  it("desligar tudo é permitido, e a tela diz o que acontece", () => {
    expect(componente).toContain("Desligar não muda nada no seu programa");
    expect(componente).toContain("nem de revisão");
  });

  it("o e-mail de acesso continua chegando mesmo com o canal desligado", () => {
    // O link mágico é a porta da área — não é comunicação de marketing.
    expect(componente).toContain("mesmo desligado");
  });
});

describe("chave que não liga nada não vira botão", () => {
  it("localização e telemetria não aparecem — não há provedor", () => {
    const visivel = componente.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
    expect(visivel).not.toContain("localização");
    expect(visivel).not.toContain("rastreamento");
    expect(visivel).not.toContain("telemetria");
  });

  it("só existem as duas chaves que têm efeito hoje", () => {
    const chaves = componente.match(/<Chave\b/g) ?? [];
    expect(chaves).toHaveLength(2);
    expect(componente).toContain('id="canal-whatsapp"');
    expect(componente).toContain('id="canal-email"');
  });

  it("histórico de manutenção é informação, não chave", () => {
    expect(componente).toContain("sempre ativo");
    expect(componente).not.toMatch(/<Chave[^>]*historico/i);
  });
});

describe("a exportação", () => {
  it("usa a impressão do navegador — sem dependência de PDF", () => {
    const pacote = JSON.parse(ler("package.json"));
    const deps = Object.keys({ ...pacote.dependencies, ...pacote.devDependencies });
    for (const proibida of ["pdfkit", "puppeteer", "jspdf", "@react-pdf/renderer", "playwright"]) {
      expect(deps, `dependência de PDF entrou: ${proibida}`).not.toContain(proibida);
    }
    expect(ler("src", "components", "garagem", "BotaoImprimir.tsx")).toContain("window.print()");
  });

  it("é um documento que se entende fora de contexto — o §6.3-E pede compartilhável", () => {
    expect(exportacao).toContain("Emitido em");
    expect(exportacao).toContain("MOTORS STORE");
    expect(exportacao).toContain("Diário de bordo");
    expect(exportacao).toContain("Registros de quilometragem");
  });

  it("diz o que a loja NÃO tem — é a prova de que nada está escondido", () => {
    expect(exportacao).toContain("não guarda traçado de localização");
  });

  it("explica que só a revisão verificada conta", () => {
    expect(exportacao).toContain("verificada pela loja");
    expect(exportacao).toContain("etiqueta de troca de óleo");
  });

  it("exige sessão de cliente, e manda staff para o painel", () => {
    expect(exportacao).toContain('redirect("/garagem")');
    expect(exportacao).toContain('redirect("/admin")');
    expect(exportacao).toContain("ehStaff");
    expect(exportacao).not.toContain("createAdminSupabaseClient");
    expect(exportacao).toContain("index: false");
  });

  it("o botão de impressão some no papel", () => {
    expect(exportacao).toContain("print:hidden");
  });
});

describe("o bloco na garagem", () => {
  it("entra na página, com o cliente da sessão", () => {
    expect(pagina).toContain("MeusDados");
    expect(pagina).toContain("consentimento_canais");
    expect(pagina).not.toContain("createAdminSupabaseClient");
  });

  it("o documento aparece mascarado na tela, inteiro só na exportação", () => {
    // Na garagem o CPF fica parcial; quem pede o documento completo é o
    // titular, na página que ele mesmo abre para levar embora.
    expect(componente).toContain("mascararDocumento");
    expect(exportacao).toContain('rotulo="Documento" valor={cliente.cpf_cnpj}');
  });
});

import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * A correspondência do pixel — por que o servidor manda e-mail e telefone.
 *
 * A mídia mediu o ViewContent em **4,4 de 10** em 2026-09-02: cobertura de
 * 100% em `user_agent`, `fbp` e `external_id`, e **zero** em `em`/`ph`.
 * Correspondência ruim, num orçamento apertado, é dinheiro comprando o público
 * errado — o Meta acerta pouca gente e cobra igual.
 *
 * O `Lead` nunca teve esse problema: ele acontece dentro de `/api/leads`, que
 * tem o e-mail e o telefone digitados. O buraco era o evento de NAVEGAÇÃO —
 * quem abre uma ficha não digita nada, então só o servidor pode reconhecê-lo.
 *
 * E o reconhecimento dependia de um elo que **nunca existiu**: `leads.ag_uid`
 * estava vazio em 100% das linhas (0 de 11), embora o valor estivesse na mão
 * da rota e já viajasse para o Meta como `external_id`.
 *
 * O que este arquivo trava, e cada item é uma forma de a correção morrer sem
 * ninguém notar — a rota devolve 204 aconteça o que acontecer:
 *
 *   1. A busca existe e é pelo `ag_uid`.
 *   2. O que ela acha entra em `userData` como `email`/`phone`, que é onde
 *      `sendCapiEvent` procura para hashear.
 *   3. O sentinela `ag_ref_nao_localizado` não vira consulta.
 *   4. Falha na busca não derruba o evento.
 *   5. A PII não volta para o navegador.
 *   6. Quem for ligar a fila do n8n é avisado de que aquele ramo mandaria os
 *      dois em claro.
 */

const capi = lerCodigo("src/app/api/capi/route.ts");
const leads = lerCodigo("src/app/api/leads/route.ts");
const lib = lerCodigo("src/lib/meta-capi.ts");
const migracao = ler("supabase/migrations/20260902130000_indice_do_ag_uid_no_lead.sql");

describe("o evento de navegação reconhece quem já é lead", () => {
  it("busca o lead pelo `ag_uid` que chegou como externalId", () => {
    expect(capi).toContain('.from("leads")');
    expect(capi).toContain('.eq("ag_uid", uidDoLead)');
    // O mais RECENTE: quem preencheu duas vezes tem duas linhas, e a última é
    // a que descreve a pessoa hoje.
    expect(capi).toContain('.order("created_at", { ascending: false })');
    expect(capi).toContain(".limit(1)");

    /* E o resultado precisa CHEGAR nas variáveis. Uma mutação que trocou
       `email = data?.email` por `email = null` sobreviveu a todas as outras
       asserções deste arquivo: elas provavam que a consulta existe e que o
       campo é enviado, nunca que um alimenta o outro. O evento continuaria
       saindo, anônimo, com a busca rodando à toa a cada ficha aberta. */
    expect(capi, "a busca roda e o resultado não é usado").toContain("email = data?.email");
    expect(capi, "a busca roda e o resultado não é usado").toContain("telefone = data?.telefone");
  });

  it("o que a busca acha entra onde o hash acontece", () => {
    // `sendCapiEvent` procura `userData.email` e `userData.phone`. Colocar o
    // valor em qualquer outro campo é enviar nada, sem erro nenhum.
    const bloco = capi.slice(capi.indexOf("userData: {"), capi.indexOf("customData:"));
    expect(bloco).toContain("email,");
    expect(bloco).toContain("phone: telefone,");

    // E o hash é do lado do servidor, não do cliente.
    expect(lib).toContain("createHash(\"sha256\")");
    expect(lib).toContain("hashPhone");
  });

  it("o sentinela de quem não tem rastreio não vira consulta", () => {
    // `ag_ref_nao_localizado` é o valor de quem chegou sem `ag_uid`. Consultar
    // por ele varreria o índice atrás de uma linha que nunca existe — e, se um
    // dia alguém gravasse o sentinela, devolveria o lead ERRADO para todo
    // visitante anônimo. É a mesma guarda que o insert do lead aplica.
    expect(capi).toContain('externalId !== "ag_ref_nao_localizado"');
    expect(leads).toContain('ag_ref_nao_localizado" ? resolvedAgUid : null');
  });

  it("falha na busca não derruba o evento", () => {
    // Melhor esforço: sem o lead, o evento vai anônimo — que é como ia antes,
    // e melhor que não ir.
    const bloco = capi.slice(capi.indexOf("if (uidDoLead)"), capi.indexOf("const webhookTracking"));
    expect(bloco).toContain("try {");
    expect(bloco).toContain("catch");
    expect(bloco).toContain("não bloqueante");
  });

  it("a PII não volta para o navegador — a rota responde 204 sem corpo", () => {
    /* A rota é pública e sem captcha. Se ela dissesse ao chamador se o
       visitante é conhecido, viraria oráculo: dá para varrer `ag_uid` e
       descobrir quem tem cadastro. O 204 sem corpo em TODOS os caminhos é o
       que impede isso, e é anterior a esta mudança — o que muda é que agora
       existe algo a vazar. */
    expect(capi).toContain("new NextResponse(null, { status: 204 })");
    const respostas = capi.match(/return new NextResponse\([^)]*\)/g) ?? [];
    expect(respostas.length, "apareceu uma resposta que não é o 204 mudo").toBe(1);
    // E nenhum retorno de JSON escapou pelo meio.
    expect(capi).not.toContain("NextResponse.json");
  });

  it("o ramo do n8n avisa que mandaria os dois em claro", () => {
    /* Esta é a única asserção do arquivo que lê a fonte CRUA, e é de
       propósito: o que se cobra aqui é o AVISO, que é comentário. `lerCodigo`
       descarta comentários — usá-lo aqui reprovava um aviso que estava escrito
       (foi o que aconteceu na primeira versão).

       O hash mora em `sendCapiEvent`, que é o outro caminho. Quem ligar a fila
       sem ler isso enfileira PII em claro no histórico do n8n para ganhar
       retry — troca ruim, e silenciosa. */
    const bruto = ler("src/app/api/capi/route.ts");
    const ramo = bruto.slice(bruto.indexOf("if (webhookTracking)"), bruto.indexOf("} else if (pixelId)"));
    expect(ramo).toMatch(/em claro|sem hash/i);
  });
});

describe("o índice que sustenta a busca", () => {
  it("é parcial e na ordem que a consulta pede", () => {
    // Sem `created_at desc` no índice, o `limit 1` volta a ordenar. Sem o
    // parcial, o índice carrega as linhas antigas que nunca serão consultadas.
    expect(migracao).toContain("on public.leads (ag_uid, created_at desc)");
    expect(migracao).toContain("where ag_uid is not null");
  });

  it("a migração cobra a FORMA, não só a existência", () => {
    // Índice com o nome certo e a coluna errada passaria numa checagem por
    // nome — e a consulta seguiria varrendo a tabela, sem nada acusando.
    expect(migracao).toContain("ag_uid, created_at DESC");
    expect(migracao).toContain("não na forma que a consulta pede");
  });
});

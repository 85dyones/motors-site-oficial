import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import { mascararTelefone, telefoneDoLead } from "../src/lib/whatsapp";

/**
 * As conversões otimizadas do Google Ads — o que depende do HTML.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * O handoff de 2026-08-26 mediu em produção e achou duas coisas. A primeira foi
 * resolvida no contêiner (a Tag do Google do `AW-18360613832` não existia, e
 * todo hit do Ads saía "adiado" — enfileirado e descartado). A segunda depende
 * de código, e é esta:
 *
 * > Nome sozinho gera match ZERO. O Google exige e-mail, telefone, ou nome +
 * > endereço completo.
 *
 * O `LeadCaptureModal` — que serve ficha, CarMatch, pop-up e avaliação, os
 * quatro fluxos — renderizava **um** campo, o nome. Ou seja: o fluxo de maior
 * volume não contribuía nada para o match.
 *
 * Só que a detecção automática do Ads não lê estado do React nem `dataLayer`:
 * ela varre o **DOM** no instante do `generate_lead`, procurando `type`,
 * `autocomplete` e `name`. Então o que o teste precisa prender não é "o campo
 * existe" — é a marcação, atributo por atributo, e o instante.
 *
 * Três invariantes, e nenhum deles aparece num teste de comportamento:
 *
 *   1. Os campos carregam os sinais que a varredura procura (§1 abaixo).
 *   2. Eles estão montados e preenchidos QUANDO o push acontece (§2) — o
 *      §3.2 do handoff chama isto de "o detalhe que mais passa batido em SPA".
 *   3. Nenhum dado pessoal entra no `dataLayer` (§4). A captura é do lado do
 *      GTM, lendo o DOM; mandar e-mail ou telefone na camada seria vazar PII
 *      para toda tag do contêiner sem ganhar nada.
 */

const modal = ler("src/components/LeadCaptureModal.tsx");
const avaliacao = ler("src/components/AutoAvaliacao.tsx");
const contato = ler("src/components/ContatoClientWrapper.tsx");

/**
 * O bloco `<input …/>` que carrega um `id`.
 *
 * Existe para o teste falar do campo e não do arquivo: `disabled={loading}` é
 * legítimo no botão de fechar e no CTA, e proibido no input — uma busca no
 * arquivo inteiro não sabe distinguir os dois.
 */
function campoComId(fonte: string, id: string): string {
  const inicio = fonte.indexOf(`id="${id}"`);
  expect(inicio, `campo #${id} não encontrado`).toBeGreaterThan(-1);
  const abre = fonte.lastIndexOf("<input", inicio);
  const fecha = fonte.indexOf("/>", inicio);
  expect(abre).toBeGreaterThan(-1);
  expect(fecha).toBeGreaterThan(abre);
  return fonte.slice(abre, fecha + 2);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · a marcação que a detecção automática lê", () => {
  // O checklist do §3.1 do handoff, na ordem de força que ele mesmo dá:
  // `type` é o sinal principal, `autocomplete` o segundo, `name` o terceiro.
  const esperado: Record<string, [string, string, string]> = {
    // campo                         → [type, autoComplete, name]
    "modal:lead-phone-input": ["tel", "tel", "phone"],
    "modal:lead-email-input": ["email", "email", "email"],
    "modal:lead-name-input": ["text", "name", "name"],
    "avaliacao:whatsapp-input": ["tel", "tel", "phone"],
    "avaliacao:nome-input": ["text", "name", "name"],
    "contato:phone-input": ["tel", "tel", "phone"],
    "contato:email-input": ["email", "email", "email"],
    "contato:name-input": ["text", "name", "name"],
  };

  const fontes: Record<string, string> = { modal, avaliacao, contato };

  for (const [chave, [tipo, autocompletar, nome]] of Object.entries(esperado)) {
    const [arquivo, id] = chave.split(":");
    it(`#${id} (${arquivo}) declara type/autocomplete/name`, () => {
      const campo = campoComId(fontes[arquivo], id);
      expect(campo).toContain(`type="${tipo}"`);
      expect(campo).toContain(`autoComplete="${autocompletar}"`);
      expect(campo).toContain(`name="${nome}"`);
    });
  }

  it("os campos de telefone pedem teclado numérico", () => {
    for (const campo of [
      campoComId(modal, "lead-phone-input"),
      campoComId(avaliacao, "whatsapp-input"),
      campoComId(contato, "phone-input"),
    ]) {
      expect(campo).toContain('inputMode="numeric"');
    }
  });

  it("o telefone do modal é obrigatório e o e-mail não", () => {
    // Sem telefone o lead chega ao CRM com `remoteJid` vazio: se a pessoa
    // fecha o WhatsApp sem mandar a mensagem, sobra um nome e nada para onde
    // responder. O e-mail é bônus de match — obrigatório, só espantaria lead.
    expect(campoComId(modal, "lead-phone-input")).toMatch(/\brequired\b/);
    expect(campoComId(modal, "lead-email-input")).not.toMatch(/\brequired\b/);
  });

  it("o nome acessível vem do <label>, sem aria-label por cima", () => {
    // `aria-label` SOBRESCREVE o rótulo visível. Com "Seu WhatsApp" na tela e
    // `aria-label="Telefone"` no campo, o leitor de tela anuncia uma coisa e a
    // tela mostra outra — é o "Label in Name" da WCAG 2.5.3. O handoff sugeriu
    // `aria-label` porque presumia campo sem rótulo; aqui há rótulo.
    for (const id of ["lead-name-input", "lead-phone-input", "lead-email-input"]) {
      expect(modal, id).toContain(`htmlFor="${id}"`);
      expect(campoComId(modal, id), id).not.toContain("aria-label");
    }
  });

  it("o modal NÃO repete os ids de /contato", () => {
    // `LeadPopup` está montado no layout raiz, então este modal pode abrir em
    // cima de `/contato` — que já tem `#phone-input` e `#email-input`. Dois
    // elementos com o mesmo id fazem `querySelector` devolver o primeiro em
    // ordem de documento: ambiguidade no exato instante da conversão.
    // Trocar o id não custa nada, porque a varredura casa por
    // `type`/`autocomplete`/`name` — o id ela não usa.
    expect(modal).not.toContain('id="phone-input"');
    expect(modal).not.toContain('id="email-input"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · o campo existe no DOM no instante da conversão", () => {
  it("o modal só fecha DEPOIS do onSubmit", () => {
    // O push do `generate_lead` acontece dentro do `onSubmit`. Inverter estas
    // duas linhas desmonta o formulário antes da varredura e a conversão sai
    // sem dado nenhum — sem erro, sem log, sem nada na tela.
    const codigo = lerCodigo("src/components/LeadCaptureModal.tsx");
    const envio = codigo.indexOf("await onSubmit(");
    const fechamento = codigo.indexOf("onClose();");
    expect(envio).toBeGreaterThan(-1);
    expect(fechamento).toBeGreaterThan(envio);
  });

  it("os campos ficam readOnly durante o envio, nunca disabled", () => {
    // `loading` já é `true` quando o push sai. Campo `disabled` é exatamente o
    // que um varredor de formulário descarta — e `/contato`, o único fluxo que
    // comprovadamente entrega hash em produção, não desabilita nada.
    for (const id of ["lead-name-input", "lead-phone-input", "lead-email-input"]) {
      const campo = campoComId(modal, id);
      expect(campo).toContain("readOnly={loading}");
      expect(campo).not.toContain("disabled=");
    }
  });

  it("/contato mede antes de limpar e de trocar de tela", () => {
    const codigo = lerCodigo("src/components/ContatoClientWrapper.tsx");
    const medida = codigo.indexOf("trackLeadSubmission(");
    expect(medida).toBeGreaterThan(-1);
    for (const depois of ['setStatus("success")', 'setName("")', 'setEmail("")', 'setPhone("")']) {
      expect(codigo.indexOf(depois), depois).toBeGreaterThan(medida);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · o telefone chega normalizado ao CRM e ao Ads", () => {
  it("celular e fixo com DDD viram os três formatos", () => {
    expect(telefoneDoLead("(41) 99737-2165")).toEqual({
      digitos: "41997372165",
      comDDI: "5541997372165",
      remoteJid: "5541997372165@s.whatsapp.net",
      e164: "+5541997372165",
    });
    expect(telefoneDoLead("4133334444").remoteJid).toBe("554133334444@s.whatsapp.net");
  });

  it("número incompleto vira lead SEM telefone, não lead com telefone errado", () => {
    // O Evolution não conversa com `remoteJid` inválido e o Ads não casa um
    // E.164 torto. Campo vazio o CRM sabe tratar; lixo, não.
    for (const bruto of ["", "41999", "(41) 9", null, undefined]) {
      expect(telefoneDoLead(bruto)).toEqual({
        digitos: null,
        comDDI: null,
        remoteJid: "",
        e164: null,
      });
    }
  });

  it("a máscara é a mesma nas duas telas e é idempotente", () => {
    expect(mascararTelefone("41997372165")).toBe("(41) 99737-2165");
    expect(mascararTelefone("(41) 99737-2165")).toBe("(41) 99737-2165");
    expect(mascararTelefone("419")).toBe("(41) 9");
    expect(mascararTelefone("41")).toBe("41");
    expect(mascararTelefone("")).toBe("");
    // Dígito a mais não estica o campo — o corte é em 11 dígitos.
    expect(mascararTelefone("419973721650000")).toBe("(41) 99737-2165");
  });

  it("fixo é 4+4, não 5+4", () => {
    // A máscara que veio da avaliação cortava sempre em 5+4 e escrevia
    // "(41) 33334-444" — número que não existe. Não incomodava lá, num campo
    // chamado WHATSAPP; no modal o telefone é obrigatório e fixo aparece.
    expect(mascararTelefone("4133334444")).toBe("(41) 3333-4444");
    expect(mascararTelefone("(41) 3333-4444")).toBe("(41) 3333-4444");
    // Celular a meio caminho passa por 10 dígitos e aparece como fixo — é o
    // comportamento de toda máscara brasileira. O 11º dígito reposiciona.
    expect(mascararTelefone("4199737216")).toBe("(41) 9973-7216");
    expect(mascararTelefone("41997372165")).toBe("(41) 99737-2165");
  });

  it("os quatro fluxos normalizam pelo mesmo lugar", () => {
    // A linha que estava aqui tinha um `cleanPhone` que não limpava nada:
    //     const cleanPhone = leadData.whatsapp;
    // Com o valor mascarado (15 caracteres) o teste de comprimento falhava e o
    // número seguia inteiro — `remoteJid: "(41) 99737-2165@s.whatsapp.net"`.
    const fluxos = [
      "src/components/PDPClientWrapper.tsx",
      "src/components/CarMatch.tsx",
      "src/components/LeadPopup.tsx",
      "src/components/AutoAvaliacao.tsx",
    ];
    for (const fluxo of fluxos) {
      const codigo = lerCodigo(fluxo);
      expect(codigo, fluxo).toContain("telefoneDoLead(leadData.whatsapp)");
      expect(codigo, fluxo).not.toContain("const cleanPhone");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · nenhum dado pessoal na camada de dados", () => {
  it("o dataLayer não publica nome, e-mail nem telefone", () => {
    // §3.3 do handoff. A captura é do lado do GTM, lendo o DOM — mandar PII na
    // camada exporia o dado a toda tag do contêiner sem melhorar o match.
    const camada = lerCodigo("src/lib/dataLayer.ts");
    // A busca é pela CHAVE de objeto, não pela palavra solta: `click_phone`
    // mora aqui de direito — é o evento de clique no telefone da loja, sem
    // número nenhum junto —, e um `grep` cru acusaria o nome do evento.
    // `nome` fica fora da lista de propósito: é o nome do VEÍCULO em
    // `VeiculoDaCamada`, e é dado público — está no <h1> da ficha.
    for (const chave of [
      "email", "phone", "phone_number", "telefone", "whatsapp",
      "user_data", "cpf", "first_name", "last_name",
    ]) {
      expect(camada, chave).not.toMatch(new RegExp(`\\b${chave}\\s*:`, "i"));
    }
  });

  it("o config do AW- é do contêiner, não do IntegrationsTracker", () => {
    // §2.1/§5 do handoff: a Tag do Google do `AW-18360613832` vive no
    // contêiner porque o `IntegrationsTracker` nunca configurou o destino do
    // Ads — sem `config` os hits saíam adiados. Duplicar aqui é que quebraria.
    const tracker = lerCodigo("src/components/IntegrationsTracker.tsx");
    expect(tracker).not.toMatch(/config["'`\s,]+["'`]AW-/);
  });
});

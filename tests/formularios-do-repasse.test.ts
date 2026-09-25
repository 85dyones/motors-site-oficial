// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ERROS_DO_REPASSE, LISTA_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import { lerCodigo } from "./fonte";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * Os dois formulários do repasse, montados de verdade (molde
 * `avaliacao-fipe-fora-fiacao`). Dublês: o `fetch`, o Turnstile (que fora do
 * navegador não carrega o script da Cloudflare), o tema e a medição — que só
 * anota. O resto é o código de produção.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ companySettings: { googleAdsId: "", googleAdsConversionLabel: "" } }),
}));
vi.mock("../src/components/Turnstile", () => ({
  default: function TurnstileFalso({ onSuccess }: { onSuccess: (t: string) => void }) {
    useEffect(() => {
      onSuccess("token-de-teste");
    }, [onSuccess]);
    return null;
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const medicao = vi.hoisted(() => ({ leads: [] as unknown[][] }));
vi.mock("../src/lib/telemetry", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/telemetry")>();
  return {
    ...real,
    trackLeadSubmission: (...args: unknown[]) => {
      medicao.leads.push(args);
      return null;
    },
  };
});

const { default: ListaDoRepasse } = await import("../src/components/repasse/ListaDoRepasse");
const { default: ExameNoPatio } = await import("../src/components/repasse/ExameNoPatio");

let container: HTMLDivElement;
let root: Root;
let posts: Array<{ url: string; corpo: Record<string, unknown> }>;
let resposta: { status: number; corpo: unknown };

beforeEach(() => {
  medicao.leads = [];
  posts = [];
  resposta = { status: 200, corpo: { success: true } };
  // Resposta como objeto simples, no molde de `avaliacao-fipe-fora-fiacao`:
  // o componente só lê `ok`, `status` e `json()`.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opcoes?: RequestInit) => {
      posts.push({ url: String(url), corpo: JSON.parse(String(opcoes?.body ?? "{}")) });
      return {
        ok: resposta.status >= 200 && resposta.status < 300,
        status: resposta.status,
        json: async () => resposta.corpo,
      } as never;
    }),
  );
  window.history.replaceState(null, "", "/repasse");
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

async function montar(elemento: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(elemento));
}

function digitar(el: HTMLInputElement | HTMLSelectElement, valor: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
const campo = (nome: string) => container.querySelector(`[name="${nome}"]`) as HTMLInputElement;
const botao = (texto: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(texto)) as HTMLButtonElement;
async function enviar() {
  await act(async () => {
    (container.querySelector("form") as HTMLFormElement).requestSubmit();
  });
  // O envio é assíncrono (fetch → json → medição → estado): quatro voltas do
  // relógio, como o `assentar` de `avaliacao-fipe-fora-fiacao`.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

describe("a ação do captcha nos dois formulários (a outra metade do par)", () => {
  it.each(["src/components/repasse/ListaDoRepasse.tsx", "src/components/repasse/ExameNoPatio.tsx"])(
    "%s declara action={ACOES.repasse}",
    (arquivo) => {
      expect(lerCodigo(arquivo)).toMatch(/action=\{ACOES\.repasse\}/);
    },
  );
});

describe("a lista do repasse", () => {
  it("compra para usar: posta o corpo da lista, mede DEPOIS do 2xx e confirma com o perfil", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => digitar(campo("nome"), "Ana Souza"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await act(async () => campo("carroceria-hatch").click());
    await enviar();

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/leads");
    expect(posts[0].corpo).toMatchObject({
      canal: "repasse",
      turnstileToken: "token-de-teste",
      cliente: { nome: "Ana Souza", whatsapp: "(41) 99737-2165" },
      intencao_busca: { repasse: { tipo: "lista", trilha: "consumidor", faixa: "30-50", carrocerias: ["hatch"], caminho: "/repasse" } },
    });
    expect(medicao.leads).toHaveLength(1);
    expect(medicao.leads[0][2]).toMatchObject({ tipoDeLead: "curadoria", formId: "form-lista-repasse" });
    expect(container.textContent).toContain("Pronto, Ana. Você está na lista do repasse.");
    expect(container.textContent).toContain("Quando entrar um hatch de R$ 30 mil a R$ 50 mil");
  });

  it("a linha de consentimento é a da §7.4, com o link para /privacidade#dados", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    expect(container.textContent).toContain(LISTA_DO_REPASSE.consentimento);
    expect(container.querySelector('a[href="/privacidade#dados"]')?.textContent).toBe(LISTA_DO_REPASSE.politica);
  });

  it("o botão muda com o contexto e a trilha", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "vazio" }));
    expect(botao(LISTA_DO_REPASSE.botaoProximo)).toBeDefined();
    await act(async () => botao(LISTA_DO_REPASSE.trilhaLojista).click());
    expect(botao(LISTA_DO_REPASSE.botaoLojista)).toBeDefined();
  });

  it("#lista-lojista no endereço abre na trilha lojista", async () => {
    window.history.replaceState(null, "", "/repasse#lista-lojista");
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    expect(campo("cnpj")).not.toBeNull();
    expect(container.querySelector("#lista")).not.toBeNull();
    expect(container.querySelector("#lista-lojista")).not.toBeNull();
  });

  it("lojista: CNPJ que não fecha para no navegador, sem POST", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => botao(LISTA_DO_REPASSE.trilhaLojista).click());
    await act(async () => digitar(campo("nome"), "Auto Bom"));
    await act(async () => digitar(campo("whatsapp"), "41999990000"));
    await act(async () => digitar(campo("cnpj"), "11.222.333/0001-82"));
    await act(async () => digitar(campo("loja"), "Auto Bom, Curitiba"));
    await enviar();
    expect(posts).toEqual([]);
    expect(container.textContent).toContain(ERROS_DO_REPASSE.cnpj);
  });

  it("lojista: posta CNPJ, loja e cidade, e confirma o cadastro", async () => {
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => botao(LISTA_DO_REPASSE.trilhaLojista).click());
    await act(async () => digitar(campo("nome"), "Auto Bom"));
    await act(async () => digitar(campo("whatsapp"), "41999990000"));
    await act(async () => digitar(campo("cnpj"), "11.222.333/0001-81"));
    await act(async () => digitar(campo("loja"), "Auto Bom, Curitiba"));
    await enviar();
    expect(posts[0].corpo).toMatchObject({
      canal: "repasse-lojista",
      intencao_busca: { repasse: { trilha: "lojista", cnpj: "11.222.333/0001-81", loja_cidade: "Auto Bom, Curitiba" } },
    });
    expect(medicao.leads[0][2]).toMatchObject({ formId: "form-lista-repasse-lojista" });
    expect(container.textContent).toContain(LISTA_DO_REPASSE.confirmacaoLojistaTitulo);
  });

  it("403 do captcha: a saída do captcha, e nenhuma conversão", async () => {
    resposta = { status: 403, corpo: { error: "Falha na verificação de segurança (Anti-Spam)." } };
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => digitar(campo("nome"), "Ana"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await enviar();
    expect(medicao.leads).toEqual([]);
    expect(container.textContent).toContain(LISTA_DO_REPASSE.captcha);
  });

  it("500 da lista: a mensagem da rota, e nenhuma conversão", async () => {
    resposta = { status: 500, corpo: { error: ERROS_DO_REPASSE.lista } };
    await montar(createElement(ListaDoRepasse, { contexto: "pagina" }));
    await act(async () => digitar(campo("nome"), "Ana"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await enviar();
    expect(medicao.leads).toEqual([]);
    expect(container.textContent).toContain(ERROS_DO_REPASSE.lista);
  });
});

describe("o exame no pátio", () => {
  const CARRO = repasseDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
  const DIAS = [
    { data: "2026-09-24", rotulo: "Qui 24", rotuloCompleto: "Qui 24/09" },
    { data: "2026-09-25", rotulo: "Sex 25", rotuloCompleto: "Sex 25/09" },
    { data: "2026-09-26", rotulo: "Sáb 26", rotuloCompleto: "Sáb 26/09" },
  ];

  it("posta o dia, o turno e o mecânico; mede depois do 2xx; sem linha de consentimento", async () => {
    await montar(createElement(ExameNoPatio, { carro: CARRO, dias: DIAS, titulo: "Marque um horário para ver o Kwid" }));
    expect(container.textContent).not.toContain(LISTA_DO_REPASSE.consentimento);
    expect(container.textContent).toContain("Confirmamos o horário pelo WhatsApp.");
    await act(async () => digitar(campo("nome"), "Ana Souza"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await act(async () => (container.querySelector('input[value="2026-09-26"]') as HTMLInputElement).click());
    await enviar();
    expect(posts[0].corpo).toMatchObject({
      canal: "repasse-exame",
      mensagem: "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.",
      intencao_busca: { repasse: { tipo: "exame", repasse_id: CARRO.id, dia: "2026-09-26", turno: "tarde", leva_mecanico: true } },
    });
    expect(posts[0].corpo).not.toHaveProperty("veiculo");
    expect(medicao.leads[0][2]).toMatchObject({ tipoDeLead: "curadoria", formId: "form-exame-repasse" });
    expect(container.textContent).toContain("Pedido enviado.");
  });

  it("409 do carro que saiu: a mensagem da rota, sem conversão", async () => {
    resposta = { status: 409, corpo: { error: ERROS_DO_REPASSE.exameFechado } };
    await montar(createElement(ExameNoPatio, { carro: CARRO, dias: DIAS, titulo: "x" }));
    await act(async () => digitar(campo("nome"), "Ana"));
    await act(async () => digitar(campo("whatsapp"), "41997372165"));
    await enviar();
    expect(medicao.leads).toEqual([]);
    expect(container.textContent).toContain(ERROS_DO_REPASSE.exameFechado);
  });
});

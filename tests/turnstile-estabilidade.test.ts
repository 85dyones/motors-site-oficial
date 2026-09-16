import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * O widget do Turnstile não pode ser recriado a cada tecla.
 *
 * O componente monta o desafio dentro de um `useEffect`, e o cleanup desse
 * efeito chama `turnstile.remove()`. Enquanto os callbacks (`onSuccess`,
 * `onError`, `onExpire`) estiveram no array de dependências, todo consumidor
 * que passava arrow inline — e todos passam — fazia o efeito rodar de novo a
 * cada render. Como os formulários têm input controlado, "a cada render"
 * quer dizer "a cada tecla".
 *
 * Medido em 2026-08-20 no LeadCaptureModal, em `next dev` e também na build
 * de produção: digitar um nome de 16 letras gerava 16 `remove` + 16 `render`
 * e nenhum token; o token só aparecia ~1,6 s depois da última tecla. Como o
 * modal trava o envio sem token (`disabled={... || !turnstileToken}`) e os
 * canais do modal exigem captcha no servidor, esse intervalo cai bem em cima
 * da hora de enviar.
 *
 * A estabilidade mora no próprio Turnstile, não no consumidor: assim o
 * consumidor continua escrevendo arrow inline sem quebrar nada.
 */

const raiz = join(__dirname, "..");
const CAMINHO = join(raiz, "src", "components", "Turnstile.tsx");
const fonte = readFileSync(CAMINHO, "utf8");
/** Mesmo código, com espaços em branco normalizados. */
const normalizada = fonte.replace(/\s+/g, " ");

const CALLBACKS = ["onSuccess", "onError", "onExpire"];

/** Todo array de dependências de `useEffect` do arquivo. */
function arraysDeDependencia(codigo: string): string[] {
  const achados: string[] = [];
  const re = /\}\s*,\s*\[([^\]]*)\]\s*\)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) achados.push(m[1]);
  return achados;
}

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

describe("estabilidade do widget Turnstile", () => {
  it("nenhum efeito depende da identidade dos callbacks", () => {
    const deps = arraysDeDependencia(fonte);
    expect(deps.length).toBeGreaterThan(0);

    for (const dep of deps) {
      const nomes = dep.split(",").map((n) => n.trim()).filter(Boolean);
      for (const callback of CALLBACKS) {
        expect(
          nomes,
          `"${callback}" no array de dependências recria o widget a cada render`
        ).not.toContain(callback);
      }
    }
  });

  it("os callbacks são lidos por ref, não capturados pelo closure", () => {
    // Com dependências vazias, chamar a prop direto congelaria o callback do
    // primeiro render — o token chegaria para uma função velha.
    const opcoes = normalizada.slice(normalizada.indexOf("window.turnstile.render("));
    expect(opcoes.length).toBeGreaterThan(0);

    for (const callback of CALLBACKS) {
      expect(
        opcoes.includes(`${callback}Ref.current`),
        `"${callback}" precisa ser lido por ref dentro do render`
      ).toBe(true);
      expect(
        opcoes.includes(`${callback}(`),
        `"${callback}" é chamado direto dentro do render; use ${callback}Ref.current`
      ).toBe(false);
    }
  });

  it("as refs acompanham o valor mais recente da prop", () => {
    // Sem esse efeito de sincronização a ref guardaria o primeiro valor.
    for (const callback of CALLBACKS) {
      expect(
        normalizada.includes(`${callback}Ref.current = ${callback};`),
        `falta sincronizar ${callback}Ref a cada render`
      ).toBe(true);
    }
  });

  it("é este arquivo que os formulários importam", () => {
    // Guarda contra o teste ficar verde vigiando um arquivo que ninguém usa.
    const consumidores = arquivosDeCodigo(join(raiz, "src")).filter((caminho) =>
      /from\s+["'][^"']*\/Turnstile["']/.test(readFileSync(caminho, "utf8"))
    );
    expect(consumidores.length).toBeGreaterThan(0);
  });
});

/**
 * Toda superfície protegida declara a sua `action`.
 *
 * A `action` é fixada no navegador, na montagem do widget, e volta assinada
 * pela Cloudflare na resposta do siteverify — o cliente não troca depois. O
 * servidor confere contra a lista da rota, então superfície que esquecer de
 * declarar leva 403 e o lead some. Aqui isso falha no CI, não em produção.
 */
/**
 * Os blocos de atributos de cada uso de `<Nome ... />` no arquivo.
 *
 * O lookahead não é firula: sem ele, `<Turnstile` casa dentro de
 * `useRef<TurnstileHandle>(null)` e o teste acusa um uso que não existe.
 */
function lerFonte(relativo: string): string {
  return readFileSync(join(raiz, relativo), "utf8");
}

function usosDoComponente(fonte: string, nome: string): string[] {
  const normalizado = fonte.replace(/\s+/g, " ");
  return normalizado
    .split(new RegExp(`<${nome}(?=[\\s>])`))
    .slice(1)
    .map((trecho) => trecho.slice(0, trecho.indexOf("/>")));
}

describe("a action de cada superfície", () => {
  const arquivos = arquivosDeCodigo(join(raiz, "src"));

  it("todo <Turnstile> recebe uma action", () => {
    const usos = arquivos.filter((caminho) => {
      const fonte = readFileSync(caminho, "utf8");
      return /<Turnstile[\s>]/.test(fonte) && !caminho.endsWith("Turnstile.tsx");
    });
    expect(usos.length).toBeGreaterThan(0);

    for (const caminho of usos) {
      for (const atributos of usosDoComponente(readFileSync(caminho, "utf8"), "Turnstile")) {
        expect(atributos, `${caminho}: <Turnstile> sem action`).toMatch(/action=/);
      }
    }
  });

  it("todo <LeadCaptureModal> recebe uma action", () => {
    const usos = arquivos.filter((caminho) =>
      /<LeadCaptureModal[\s>]/.test(readFileSync(caminho, "utf8"))
    );
    expect(usos.length).toBeGreaterThan(0);

    for (const caminho of usos) {
      for (const atributos of usosDoComponente(readFileSync(caminho, "utf8"), "LeadCaptureModal")) {
        expect(atributos, `${caminho}: <LeadCaptureModal> sem action`).toMatch(/action=/);
      }
    }
  });

  it("as actions do código são as que o servidor aceita", () => {
    // Uma action escrita à mão num consumidor, fora do mapa de `lib/turnstile.ts`,
    // seria recusada pelo servidor. Passar pelo mapa é o que mantém os dois
    // lados em sincronia.
    const usos = arquivos.filter((caminho) => {
      const fonte = readFileSync(caminho, "utf8");
      return /<(Turnstile|LeadCaptureModal)[\s>]/.test(fonte) && !caminho.endsWith("Turnstile.tsx");
    });
    for (const caminho of usos) {
      const fonte = readFileSync(caminho, "utf8");
      for (const nome of ["Turnstile", "LeadCaptureModal"]) {
        for (const atributos of usosDoComponente(fonte, nome)) {
          const action = atributos.match(/action=\{([^}]+)\}/);
          if (!action) continue;
          expect(action[1].trim(), `${caminho}: action fora do mapa de lib/turnstile.ts`)
            .toMatch(/^(ACOES\.\w+|action)$/);
        }
      }
    }
  });

  it("o reset do token gasto está ao alcance dos formulários", () => {
    // Token do Turnstile é de uso único. Sem um reset exposto, um envio que
    // falha deixa o formulário reenviando o mesmo token queimado para sempre.
    expect(fonte).toMatch(/useImperativeHandle/);
    expect(fonte).toMatch(/reset:/);
  });
});

/**
 * Nenhum formulário pode morrer no erro do captcha.
 *
 * Quando o desafio não completa — extensão de privacidade bloqueando
 * `challenges.cloudflare.com`, rede filtrando o script, aba aberta desde antes
 * de um deploy — o botão de enviar fica `disabled` e o visitante não recebe
 * explicação nenhuma. Quem chegou até ali já digitou nome e telefone.
 *
 * A saída é `SaidaDoCaptcha`: explica o que houve e oferece o WhatsApp da loja
 * (link `wa.me`, resolvido no navegador, que NÃO cria lead — o gate do servidor
 * continua inteiro). Este teste existe para que a próxima superfície protegida
 * não nasça sem ela.
 */
describe("a saída quando o captcha não passa", () => {
  const superficies = arquivosDeCodigo(join(raiz, "src")).filter((caminho) => {
    if (caminho.endsWith("Turnstile.tsx")) return false;
    return /<Turnstile(?=[\s>])/.test(readFileSync(caminho, "utf8"));
  });

  it("há superfícies para conferir", () => {
    expect(superficies.length).toBeGreaterThan(0);
  });

  it("todo formulário com desafio trata o onError", () => {
    for (const caminho of superficies) {
      for (const atributos of usosDoComponente(readFileSync(caminho, "utf8"), "Turnstile")) {
        expect(atributos, `${caminho}: <Turnstile> sem onError — o desafio pode falhar em silêncio`)
          .toMatch(/onError=/);
      }
    }
  });

  it("todo formulário com desafio oferece uma saída", () => {
    for (const caminho of superficies) {
      const fonte = readFileSync(caminho, "utf8");
      expect(fonte, `${caminho}: sem <SaidaDoCaptcha> — o visitante fica sem caminho`)
        .toMatch(/<SaidaDoCaptcha/);
    }
  });

  it("a saída não cria lead — só abre conversa", () => {
    // Se um dia alguém "resolver" a falha do captcha postando o lead assim
    // mesmo, o gate do servidor vira enfeite. A saída pode abrir o WhatsApp e
    // pode voltar para a home; não pode chamar as rotas protegidas.
    const saida = lerFonte("src/components/SaidaDoCaptcha.tsx");
    expect(saida).not.toMatch(/\/api\/leads/);
    expect(saida).not.toMatch(/\/api\/avaliacao/);
    expect(saida).not.toMatch(/fetch\(/);
    expect(saida).toMatch(/linkWhatsApp/);
  });
});

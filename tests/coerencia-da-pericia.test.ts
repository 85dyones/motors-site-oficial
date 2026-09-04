import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { lerCodigo, ler } from "./fonte";

/**
 * O site tem uma verdade só sobre a perícia cautelar.
 *
 * ---------------------------------------------------------------------------
 * O que estava errado
 * ---------------------------------------------------------------------------
 * Três superfícies diziam coisas diferentes sobre o mesmo fato, e um
 * assistente de IA que cruzasse as três via a contradição:
 *
 *   - a FAQ de `/estoque`, de todo hub e de `/garantia`: "o laudo fica
 *     disponível na ficha do carro";
 *   - o `llms.txt`, que os crawlers de IA leem primeiro: "laudos de perícia
 *     cautelar aprovados 100%";
 *   - a FICHA, que só abre o bloco do laudo quando `pericia === "PERÍCIA
 *     APROVADA"` — e em 2026-09-03 dezessete dos trinta e seis veículos
 *     publicados estavam "EM ANÁLISE".
 *
 * Em metade da vitrine a promessa não se cumpria, e quem procurava o laudo não
 * achava nem descobria por quê: a ficha simplesmente não falava do assunto.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * Nenhuma superfície pública promete o laudo SEM a condição de aprovação, e a
 * ficha diz o estado real em vez de calar. O bloco do laudo aprovado continua
 * condicional — afirmar laudo limpo sobre carro não periciado é passivo de
 * CDC, e essa parte já estava certa.
 */

/** Varre o texto que vai ao público em busca da promessa sem ressalva. */
function arquivosDeTexto(): string[] {
  const raizes = ["src/lib", "src/app", "src/components"];
  const achados: string[] = [];
  const visitar = (dir: string) => {
    let entradas: string[];
    try {
      entradas = readdirSync(dir);
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const caminho = join(dir, entrada);
      /* `admin` fica de fora: é texto que a EQUIPE lê, não promessa ao
         público. `CadastroDeVeiculo.tsx` explica ao operador que o laudo
         aparece na ficha e é cobrado no checklist — descrição correta do
         sistema, e não uma afirmação que um cliente ou um LLM vá citar. */
      if (statSync(caminho).isDirectory()) {
        if (entrada === "admin") continue;
        visitar(caminho);
      } else if (/\.tsx?$/.test(entrada)) {
        achados.push(caminho);
      }
    }
  };
  for (const raiz of raizes) visitar(raiz);
  return achados;
}

describe("a promessa do laudo carrega a condição", () => {
  it("nenhum texto público diz que o laudo está na ficha SEM dizer 'assim que aprovada'", () => {
    /* A frase antiga aparecia em cinco lugares — dois em `textoDosHubs.ts`,
       dois em `paginasInstitucionais.ts` e um na description da ficha. Passar
       por quatro e esquecer o quinto deixa a contradição de pé, então a
       verificação varre o código inteiro em vez de conferir arquivo a arquivo. */
    const infratores: string[] = [];

    for (const caminho of arquivosDeTexto()) {
      const bruto = readFileSync(caminho, "utf8");
      // Sem comentários: o histórico do defeito CITA a frase antiga, e citá-la
      // para explicar por que ela saiu não é reincidir nela.
      const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // Junta quebras de linha e concatenações para a frase ser vista inteira.
      const corrido = fonte.replace(/"\s*\+\s*\r?\n?\s*"/g, "").replace(/\s+/g, " ");

      /* O regex NÃO exige verbo colado. A primeira versão pedia
         `laudo (fica|está|é publicado)`, e por isso deixou passar nove
         superfícies: "laudo na ficha" seco, "laudo DE CADA UNIDADE fica
         disponível", "laudo de perícia de cada veículo na ficha". Uma delas
         estava na MESMA página que eu tinha acabado de corrigir duas vezes. */
      const trechos = corrido.match(/laudo[^.]{0,90}?(?:na ficha|ficha do|ficha de)[^.]{0,60}/gi) ?? [];
      for (const trecho of trechos) {
        if (!/aprovad/i.test(trecho)) {
          infratores.push(`${caminho}: ${trecho.slice(0, 110)}`);
        }
      }
    }

    expect(infratores, `promessa sem ressalva:\n${infratores.join("\n")}`).toEqual([]);
  });

  it("o llms.txt não afirma 'aprovados 100%'", () => {
    /* É o primeiro arquivo que um crawler de IA lê, e a afirmação era falsa no
       dia em que foi medida: 19 aprovados de 36 publicados. */
    const llms = ler("public/llms.txt");
    expect(llms).not.toMatch(/aprovad\w*\s*100\s*%/i);
    expect(llms).not.toMatch(/100\s*%\s*aprovad/i);
  });
});

describe("a ficha diz o estado real da perícia", () => {
  const pdp = lerCodigo("src/components/PDPClientWrapper.tsx");

  it("o laudo aprovado continua condicional — nada de afirmar sobre carro não periciado", () => {
    // Esta parte já estava certa e não pode regredir: era o defeito original,
    // com 88 veículos exibindo "LAUDO TÉCNICO APROVADO" fabricado.
    expect(pdp).toContain('veiculo.laudo_pericia && veiculo.pericia === "PERÍCIA APROVADA"');
  });

  it("quando NÃO está aprovada, a ficha fala — em vez de ficar muda", () => {
    /* O silêncio era o outro lado do mesmo problema: a FAQ da mesma página
       prometia o laudo, e a ficha não explicava a ausência. */
    expect(pdp).toContain('!(veiculo.laudo_pericia && veiculo.pericia === "PERÍCIA APROVADA")');
    expect(pdp).toContain("Perícia cautelar em andamento");
  });

  it("o texto do estado pendente NÃO afirma resultado", () => {
    // "Em andamento" descreve o processo. Qualquer palavra sobre o resultado
    // seria inventar o que ainda não se sabe — o mesmo erro, do outro lado.
    const i = pdp.indexOf("Perícia cautelar em andamento");
    const bloco = pdp.slice(i, i + 420);
    expect(bloco).not.toMatch(/aprovad[oa]\b(?!\s*\.|\s*<)/i);
    expect(bloco).not.toMatch(/sem apontamento|livre de sinistro|impecável/i);
    expect(bloco).toContain("assim que aprovado");
  });
});

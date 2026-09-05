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
      /* `de cada` entrou na alternância em 2026-09-05, e pelo mesmo motivo que
         as três anteriores: a revisão da F1 achou "onde fica o laudo DE CADA
         VEÍCULO" num card novo de `/avaliacao` — décima superfície, e a
         primeira escrita DEPOIS desta trava existir. A frase afirma laudo
         publicado para todos sem nunca dizer "ficha", então passava reto.

         O padrão do defeito é sempre o mesmo: quem escreve quer dizer "o laudo
         é público" e escolhe um jeito novo de dizer onde ele está. Por isso a
         alternância cobre o LUGAR ("ficha") e a QUANTIFICAÇÃO ("de cada"), que
         são as duas formas de afirmar a mesma coisa. */
      /* A cauda vai até o PONTO FINAL, e não mais 60 caracteres.

         Com `de cada` na alternância, o gatilho passou a casar mais cedo na
         frase, e a janela fixa cortava antes da ressalva: "laudo de cada
         unidade fica disponível na ficha do carro, no site, assim q|ue a
         perícia é aprovada" (`paginasGeo.ts`) virou infrator com o texto
         CORRETO. A ressalva mora na mesma frase que a promessa — então a
         frase é a unidade certa de leitura, em vez de um número de caracteres
         escolhido a dedo. */
      const trechos =
        corrido.match(/laudo[^.]{0,90}?(?:na ficha|ficha do|ficha de|de cada)[^.]*/gi) ?? [];
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

  it("quando o laudo NÃO está publicado, a ficha fala — em vez de ficar muda", () => {
    /* O silêncio era o outro lado do mesmo problema: a FAQ da mesma página
       prometia o laudo, e a ficha não explicava a ausência. */
    expect(pdp).toContain('!(veiculo.laudo_pericia && veiculo.pericia === "PERÍCIA APROVADA")');
    expect(pdp).toContain("Laudo cautelar");
  });

  it("o texto fala do LAUDO, e não inventa estado da perícia", () => {
    /* A primeira versão dizia "perícia cautelar em andamento", e estava
       errada: a perícia É feita antes de o veículo entrar na vitrine
       (confirmado pelo dono em 2026-09-04) — o que falta é o resultado
       chegar, porque o sync do RevendaMais não traz o campo.
       Afirmar "em andamento" sobre exame já concluído é inventar processo a
       partir de ausência de dado — o mesmo erro do bloco do laudo aprovado,
       invertido. */
    const i = pdp.indexOf("                Laudo cautelar");
    expect(i, "o bloco do laudo pendente sumiu").toBeGreaterThan(-1);
    /* Janela pelo FIM do bloco e espaço NORMALIZADO. Medir em caracteres
       apodrece a cada reflow, e o JSX quebra a frase no meio — "…assim\n
       que aprovado" — então comparar com o texto cru falha por um espaço. */
    const fim = pdp.indexOf("</div>", i);
    const bloco = pdp.slice(i, fim > i ? fim + 6 : i + 700).replace(/\s+/g, " ");

    expect(bloco, "voltou a afirmar estado de processo").not.toMatch(/em andamento|em análise/i);
    // E continua sem afirmar RESULTADO, que é o que de fato não se sabe.
    expect(bloco).not.toMatch(/sem apontamento|livre de sinistro|impecável|aprovada\b/i);
    expect(bloco).toContain("assim que aprovado");
  });
});

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
      } else if (/\.(tsx?|json)$/.test(entrada)) {
        /* `.json` entrou em 2026-09-05, e a lição já tinha sido aprendida ao
           lado: `promessa-publica` recebeu este mesmo conserto em `ad5c5d4`
           ("o texto errado estava no .json que a varredura nao lia"), e este
           arquivo foi editado no dia seguinte sem levá-la junto.

           O que estava escapando: `src/lib/aboutSettings.json` publica em
           `/sobre` a frase "O laudo de cada carro fica disponível para
           consulta mediante solicitação" — promessa sem ressalva, dentro de
           `src/lib`, invisível só porque o filtro pedia `.tsx`.

           ⚠️ **E isto cobre o FALLBACK, não o publicado.** `getCachedSettings`
           lê `site_settings` primeiro; o `.json` só vale quando o banco não
           responde (o que ainda importa: é o que o crawler recebe no HTML
           pré-hidratação). Em 05/09/2026 a linha `about` do banco publicava
           "Laudo Cautelar 100% Aprovado" com 35 aprovados de 83 não vendidos —
           afirmação falsa, fora do alcance de qualquer teste que leia o
           repositório. Junto com 30 páginas de hub servidas por
           `textos_de_hub`. Trava de arquivo não vê texto que mora em tabela;
           para medir o que o site DIZ, varra o HTML servido. */
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
      /* A cauda é 120 — nem 60, nem a frase inteira. Os dois extremos falham,
         em direções opostas, e cada um foi medido:

         · **60** dava FALSO POSITIVO. Com `de cada` na alternância o gatilho
           casa mais cedo, e a janela cortava antes da ressalva: "laudo de cada
           unidade fica disponível na ficha do carro, no site, assim q|ue a
           perícia é aprovada" (`paginasGeo.ts`) virava infrator com o texto
           CORRETO.

         · **`[^.]*`, até o ponto final**, dava FALSO NEGATIVO — e este é pior,
           porque a trava existe para pegar exatamente o que ele deixa passar.
           A revisão construiu o caso: "O laudo fica na ficha do carro para
           todo mundo ver antes mesmo de visitar a loja, e a nossa oficina
           parceira do Bacacheri é credenciada e aprovada pelo Inmetro" passa
           limpo. O "aprovada" está na mesma frase, mas fala da OFICINA. Como a
           varredura roda sobre a fonte com espaço colapsado, a cauda ainda
           atravessa fronteira de string e pode pescar um álibi da propriedade
           vizinha — hoje já há trechos casados com 230 e 247 caracteres.

         120 é o melhor ponto medido, não uma cura: zero falso positivo no
         repositório e pega o caso acima. A margem é medida, não chutada — dos
         20 trechos que casam hoje, o `aprovad` mais distante está no offset 78
         (`paginasGeo.ts`). Se um texto novo legítimo passar de 120, o certo é
         aproximar a ressalva da promessa, não esticar este número.

         **O que 120 ainda NÃO pega**, medido na revisão de 05/09 e registrado
         aqui para ninguém supor cobertura que não existe: um álibi curto que
         fale de outra coisa ("…e a nossa oficina do Bacacheri é aprovada pelo
         Inmetro", 106 chars; "…com o seu crédito já aprovado pelo banco"), e
         uma segunda promessa que comece dentro da janela da primeira, engolida
         pela cauda gulosa. Nenhuma janela finita fecha um heurístico de "tem
         'aprovad' por perto" — isto é uma rede, não uma prova. A prova é ler o
         texto. */
      const trechos =
        corrido.match(/laudo[^.]{0,90}?(?:na ficha|ficha do|ficha de|de cada)[^.]{0,120}/gi) ?? [];
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

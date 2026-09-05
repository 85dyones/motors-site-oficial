import { unstable_cache } from "next/cache";
import { recortesDoEstoque } from "../../../lib/hubsDeEstoque";
import { getVeiculoPdpUrl } from "../../../lib/supabase";
import { nomeComAno } from "../../../lib/nomeDoVeiculo";
import { resolveTipoCombustivel } from "../../../lib/regrasEstoque";
import { SITE_URL } from "../../../lib/site";
import { GARANTIA_MESES } from "../../../lib/paginasInstitucionais";
import type { Veiculo } from "../../../types";

/**
 * A ficha técnica do pátio, escrita para o assistente do WhatsApp ler.
 *
 * ---------------------------------------------------------------------------
 * Por que esta rota existe, e por que ela não é o `llms-full.txt`
 * ---------------------------------------------------------------------------
 * Pedido do dono em 05/09/2026: o Ney precisa saber o mínimo sobre o carro
 * antes de abrir o atendimento — "não vai discutir valores, mas pode sanar
 * dúvidas do anúncio, aquecer o lead antes do consultor".
 *
 * O Captain do Chatwoot **não tem chamada de função** (`/captain/assistants/1/
 * tools` devolve 404, medido em 05/09). A única forma de ele conhecer o pátio
 * é DOCUMENTO INGERIDO, que é uma fotografia: o que entrar aqui fica congelado
 * até a próxima ingestão.
 *
 * Isso decide o conteúdo. Dado que ENVELHECE MAL e cujo erro é caro fica de
 * fora; dado que envelhece bem entra:
 *
 *   - **Preço: FORA.** Muda sem aviso, e um preço velho repetido no privado é
 *     a pior forma de errar. O `llms-full.txt` publica preço de propósito — ele
 *     serve a buscadores, que recarregam. Este arquivo serve a um assistente,
 *     que decora. São públicos diferentes com necessidades opostas, e é por
 *     isso que são duas rotas e não uma.
 *   - **Disponibilidade: FORA.** Nenhuma linha aqui diz "está disponível". A
 *     lista é dos veículos à venda no momento em que ela foi gerada, e o
 *     cabeçalho diz isso ao assistente com todas as letras.
 *   - **Ficha técnica: DENTRO.** Ano, km, câmbio, combustível, cor, carroceria,
 *     motor, opcionais e o estado da perícia mudam pouco ou nunca enquanto o
 *     carro está no pátio.
 *
 * ---------------------------------------------------------------------------
 * Um bloco por carro, cada um se bastando
 * ---------------------------------------------------------------------------
 * O Captain fatia o documento em pedaços e recupera o pedaço mais parecido com
 * a pergunta. Um bloco que dependa do cabeçalho para se identificar chega ao
 * modelo sem saber de que carro fala — por isso marca, modelo e ano se repetem
 * em toda linha de título, mesmo custando bytes.
 */

/**
 * O teto que o Chatwoot impõe ao documento ingerido.
 *
 * Medido em 05/09/2026: o Captain guardou **exatamente 15000 bytes** de um
 * arquivo de 25.854 e cortou o resto — 21 dos 36 carros entraram, e o
 * vigésimo primeiro parou no meio do título. Nada avisa: o documento fica com
 * `status: available` e o assistente simplesmente não conhece metade do pátio.
 *
 * A margem de 1000 existe porque o corte é do lado deles e a conta é do nosso:
 * acentuação em UTF-8 ocupa dois bytes e `String.length` conta caracteres.
 */
const TETO_DO_CAPTAIN = 15000;
const MARGEM = 1000;

/**
 * O que o assistente precisa saber ANTES de ler a lista.
 *
 * `noPatio` é o pátio inteiro; `nesteArquivo` é quantos couberam. Quando os
 * dois divergem, o cabeçalho diz — porque um assistente que acha que viu tudo
 * responde "não temos" com convicção sobre um carro que a loja tem.
 */
function cabecalho(noPatio: number, nesteArquivo: number, geradoEm: string): string {
  const faltando = noPatio - nesteArquivo;
  return [
    "# Fichas técnicas do pátio da Motors Store",
    "",
    "Este arquivo existe para o atendente virtual da loja responder dúvidas de",
    "ficha — ano, quilometragem, câmbio, cor, opcionais e estado da perícia.",
    "",
    "## Como usar, e o que NÃO está aqui",
    "",
    "- **Não há preço neste arquivo, de propósito.** O preço muda sem aviso.",
    "  Quem informa o valor do dia é o consultor. Nunca estime, nunca deduza um",
    "  preço a partir de outro carro, e nunca diga que não tem acesso — apenas",
    "  siga a conversa e encaminhe.",
    "- **Esta lista é uma fotografia**, tirada na data abaixo. Ela mostra o que",
    "  estava à venda naquele momento. NÃO afirme que um carro está disponível",
    "  nem que deixou de estar: quem confirma é o consultor.",
    "- Um carro que não aparece aqui pode ter entrado depois. Não diga que a",
    "  loja não tem — pergunte e encaminhe.",
    "- A lista de opcionais pode estar **abreviada** para o arquivo caber. Se o",
    "  cliente perguntar por um item que não está aqui, não diga que o carro não",
    "  tem: pergunte e encaminhe.",
    "",
    ...(faltando > 0
      ? [
          `- **Este arquivo tem ${nesteArquivo} dos ${noPatio} veículos do pátio.** Os outros`,
          `  ${faltando} não couberam. Nunca diga que a loja não tem um carro só porque`,
          "  ele não está aqui — pergunte e encaminhe.",
        ]
      : []),
    "",
    `Garantia de todos: ${GARANTIA_MESES} meses de motor e câmbio, contados da entrega.`,
    `Veículos no pátio: ${noPatio}`,
    `Veículos neste arquivo: ${nesteArquivo}`,
    `Gerada em: ${geradoEm}`,
    "",
    "---",
    "",
  ].join("\n");
}

/**
 * Corta a lista de opcionais numa vírgula, para caber no orçamento.
 *
 * Cortar no meio de "Ar-condicion" faria o assistente ler um opcional que não
 * existe. A vírgula é a fronteira natural da lista, e é onde o corte não
 * inventa item.
 */
/**
 * O que a linha de opcionais custa ALÉM do texto dela.
 *
 * O rótulo, o sufixo do corte e a quebra de linha. A primeira versão dividia o
 * orçamento só pelo texto e ignorava estes 32 bytes por carro: com 36 carros o
 * arquivo saía 1.051 bytes ACIMA do teto — bem dentro da margem, mas a margem
 * existe para o erro deles, não para o meu.
 */
const CUSTO_DA_LINHA_DE_OPCIONAIS = "- Opcionais: ".length + " (lista abreviada)".length + 1;

function opcionaisQueCabem(opcionais: string, orcamento: number): string {
  const texto = String(opcionais || "").trim();
  if (orcamento <= 0) return "";
  if (texto.length <= orcamento) return texto;

  const cortado = texto.slice(0, Math.max(0, orcamento));
  const ultimaVirgula = cortado.lastIndexOf(",");
  // Sem vírgula no trecho, o primeiro item já não cabe: melhor omitir do que
  // publicar meia palavra.
  if (ultimaVirgula < 0) return "";
  return `${cortado.slice(0, ultimaVirgula)} (lista abreviada)`;
}

/** Uma linha só quando o campo existe — campo vazio vira lixo no meio da ficha. */
function linha(rotulo: string, valor: string | number | null | undefined): string {
  const texto = String(valor ?? "").trim();
  return texto ? `- ${rotulo}: ${texto}\n` : "";
}

/**
 * O estado da perícia, em português de gente.
 *
 * `formatPericia` já normalizou no mapper, e o único valor que autoriza falar
 * em laudo é `PERÍCIA APROVADA` — a mesma régua que abre o laudo na ficha. Um
 * carro em análise NÃO vira "sem perícia": ele passou, o laudo é que ainda não
 * está publicado, e a diferença importa para quem pergunta.
 */
function estadoDaPericia(veiculo: Veiculo): string {
  // A ressalva vem DEPOIS de "na ficha" nas duas frases, e não por estilo:
  // `tests/coerencia-da-pericia.test.ts` varre o repositório atrás de
  // "laudo … na ficha" sem "aprovad" nos 60 caracteres seguintes, e pegou a
  // primeira versão desta rota. A trava está certa — a promessa do laudo só
  // vale com a condição colada nela, e uma frase que a carrega antes lê bem
  // aqui e mal quando o Captain recorta o pedaço.
  return veiculo.pericia === "PERÍCIA APROVADA"
    ? "laudo na ficha do carro, perícia aprovada"
    : "feita — todo carro passa antes da vitrine; o laudo entra na ficha assim que aprovada";
}

function ficha(veiculo: Veiculo, orcamentoDeOpcionais: number): string {
  // `nomeComAno`, e não `marca + modelo + versão`: o feed do RevendaMais já
  // embute a versão dentro do modelo, e concatenar produz "BMW X4 M40i 3.0 M
  // Sport Edit V6 Turbo Aut 2020 — m40i 3.0 m sport edit v6 turbo aut". É o
  // mesmo defeito que `tests/schema-do-veiculo.test.ts` guarda no JSON-LD e no
  // feed de anúncios; aqui ele custaria o título de TODO bloco que o Captain
  // recupera — que é justamente o que identifica o carro para ele.
  // Uma linha para a ficha inteira, em vez de doze rótulos.
  //
  // A versão de doze linhas gastava ~690 bytes por carro e o arquivo dava
  // 20.998 com o pátio de hoje — 6 KB acima do teto do Captain, medido no
  // teste. Rótulo repetido 36 vezes ("Câmbio: ", "Combustível: ") é orçamento
  // gasto em pontuação, e o que se paga com ele é carro cortado do fim.
  //
  // Marca, modelo, versão e ano saíram das linhas porque já estão no título —
  // e o título é justamente o que identifica o bloco quando o Captain o
  // recorta.
  const especificacoes = [
    typeof veiculo.quilometragem === "number" && veiculo.quilometragem > 0
      ? `${veiculo.quilometragem.toLocaleString("pt-BR")} km`
      : "",
    veiculo.cambio,
    resolveTipoCombustivel(veiculo),
    veiculo.tipo,
    veiculo.motor ? `motor ${veiculo.motor}` : "",
    veiculo.cor,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  let bloco = `## ${nomeComAno(veiculo)}\n\n`;
  bloco += linha("Ficha", especificacoes);
  bloco += linha("Perícia", estadoDaPericia(veiculo));
  bloco += linha("Opcionais", opcionaisQueCabem(veiculo.opcionais ?? "", orcamentoDeOpcionais));
  // A garantia saiu daqui para o cabeçalho: ela é a mesma para todo carro, e
  // repetida 36 vezes custava 2 KB de um orçamento de 15.
  bloco += linha("Ficha no site", `${SITE_URL}${getVeiculoPdpUrl(veiculo)}`);

  return `${bloco}\n---\n\n`;
}

/**
 * Uma hora de cache, igual ao `llms-full.txt`.
 *
 * O sincronizador do RevendaMais roda de 6 em 6 horas, então uma hora aqui não
 * atrasa nada — e a fotografia que o Captain guarda é muito mais velha que
 * isso de qualquer jeito.
 */
/**
 * Monta o arquivo inteiro. **Pura de propósito** — é o que permite ao teste
 * medir o resultado com um pátio sintético de qualquer tamanho, em vez de só
 * afirmar coisas sobre o texto do código.
 *
 * A regra que ela garante: **todo carro entra**. Ficha curta para os 36 vale
 * mais que ficha completa para 21 e nada para os outros 15, que foi o que o
 * teto do Captain fez na primeira ingestão.
 *
 * Mede-se a ficha SEM opcionais primeiro, porque é o piso incompressível; o
 * que sobra até o teto é o que se pode gastar com eles. Pátio grande dá
 * opcional curto, e isso é preferível a carro ausente.
 */
export function montarFichas(todos: Veiculo[], geradoEm: string): string {
  if (todos.length === 0) return cabecalho(0, 0, geradoEm);

  const teto = TETO_DO_CAPTAIN - MARGEM;

  /**
   * Quantos carros cabem, com a ficha no mínimo (sem opcionais).
   *
   * O orçamento de opcionais só encolhe os opcionais — a ficha base é
   * incompressível, e com pátio grande ela sozinha estoura. A primeira versão
   * ignorava isso e devolvia 20.998 bytes para 36 carros; o Captain cortava o
   * excedente no meio de um título, calado.
   *
   * Quando não couber, o corte é AQUI e é declarado no cabeçalho. Perder os
   * últimos e dizer quantos é honesto; perder metade sem avisar não é.
   */
  const bases = todos.map((v) => ficha(v, 0).length);
  let cabem = 0;
  let acumulado = cabecalho(todos.length, todos.length, geradoEm).length;
  while (cabem < todos.length && acumulado + bases[cabem] <= teto) {
    acumulado += bases[cabem];
    cabem += 1;
  }

  const dentro = todos.slice(0, cabem);
  const topo = cabecalho(todos.length, dentro.length, geradoEm);

  // O que sobra depois das fichas mínimas é o que se pode gastar com
  // opcionais, dividido igualmente. Pátio grande dá opcional curto, e isso é
  // preferível a carro ausente.
  const minimo = dentro.map((v) => ficha(v, 0)).join("");
  const sobra = teto - topo.length - minimo.length;
  const orcamento =
    dentro.length > 0
      ? Math.max(0, Math.floor(sobra / dentro.length) - CUSTO_DA_LINHA_DE_OPCIONAIS)
      : 0;

  return topo + dentro.map((v) => ficha(v, orcamento)).join("");
}

const fichasDoPatio = unstable_cache(
  async (): Promise<string> => {
    const { disponiveis } = await recortesDoEstoque();
    return montarFichas(
      disponiveis,
      new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    );
  },
  ["fichas-para-o-assistente"],
  { tags: ["inventory"], revalidate: 3600 },
);

export async function GET() {
  return new Response(await fichasDoPatio(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

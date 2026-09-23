import { getVeiculoPdpUrl } from "./supabase";
import { nomeComAno } from "./nomeDoVeiculo";
import { resolveTipoCombustivel } from "./regrasEstoque";
import { SITE_URL } from "./site";
import { GARANTIA_KM_TEXTO, GARANTIA_MESES } from "./paginasInstitucionais";
import type { Veiculo } from "../types";

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
    `Garantia de todos: ${GARANTIA_MESES} meses de motor e câmbio, ou ${GARANTIA_KM_TEXTO} km — o que vier primeiro —, contados da entrega.`,
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
  // Na frase do carro aprovado a ressalva vem DEPOIS de "na ficha", e não por
  // estilo: `tests/coerencia-da-pericia.test.ts` varre o repositório atrás de
  // "laudo … na ficha" sem "aprovad" na cauda, e pegou a primeira versão desta
  // rota. A trava está certa — a promessa do laudo só vale com a condição
  // colada nela, e uma frase que a carrega antes lê bem aqui e mal quando o
  // Captain recorta o pedaço.
  //
  // A frase do carro NÃO aprovado mudou em 2026-09-09, e o motivo é de
  // operação, não de trava: desde 08/09 a ficha desses carros manda o cliente
  // SOLICITAR O LAUDO AO VENDEDOR. O vendedor é o Ney. Ele respondia "o laudo
  // entra na ficha assim que aprovada" — devolvia o cliente para a página de
  // onde ele acabou de vir, e o caminho morria no salto seguinte. Mandar de
  // volta ao site é uma das proibições escritas nas diretrizes dele (que vivem
  // no Chatwoot, não aqui — este comentário cita, não prova).
  //
  // "É só pedir", e NÃO "eu envio": o Captain não anexa arquivo, e todo o resto
  // dos dois documentos dele manda encaminhar ao humano ("quem confirma é o
  // consultor"). Prometer entrega — por qual canal, em quanto tempo — seria
  // compromisso novo que ninguém na loja assumiu por escrito.
  return veiculo.pericia === "PERÍCIA APROVADA"
    ? "laudo na ficha do carro, perícia aprovada"
    : "feita — todo carro passa antes da vitrine; o laudo fica com a loja e é só pedir";
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

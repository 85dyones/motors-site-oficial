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

/** O que o assistente precisa saber ANTES de ler a lista. */
function cabecalho(quantos: number, geradoEm: string): string {
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
    "",
    `Veículos nesta fotografia: ${quantos}`,
    `Gerada em: ${geradoEm}`,
    "",
    "---",
    "",
  ].join("\n");
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
    ? "o laudo está na ficha do carro no site — perícia aprovada"
    : "a perícia foi feita, e todo carro passa por ela antes de entrar na vitrine; o laudo entra na ficha assim que aprovada";
}

function ficha(veiculo: Veiculo): string {
  // `nomeComAno`, e não `marca + modelo + versão`: o feed do RevendaMais já
  // embute a versão dentro do modelo, e concatenar produz "BMW X4 M40i 3.0 M
  // Sport Edit V6 Turbo Aut 2020 — m40i 3.0 m sport edit v6 turbo aut". É o
  // mesmo defeito que `tests/schema-do-veiculo.test.ts` guarda no JSON-LD e no
  // feed de anúncios; aqui ele custaria o título de TODO bloco que o Captain
  // recupera — que é justamente o que identifica o carro para ele.
  let bloco = `## ${nomeComAno(veiculo)}\n\n`;
  bloco += linha("Marca", veiculo.marca);
  bloco += linha("Modelo", veiculo.modelo);
  bloco += linha("Versão", String(veiculo.versao || "").trim());
  bloco += linha("Ano", veiculo.ano);
  bloco += linha(
    "Quilometragem",
    typeof veiculo.quilometragem === "number" && veiculo.quilometragem > 0
      ? `${veiculo.quilometragem.toLocaleString("pt-BR")} km`
      : "",
  );
  bloco += linha("Câmbio", veiculo.cambio);
  bloco += linha("Combustível", resolveTipoCombustivel(veiculo));
  bloco += linha("Cor", veiculo.cor);
  bloco += linha("Carroceria", veiculo.tipo);
  bloco += linha("Motor", veiculo.motor);
  bloco += linha("Opcionais", veiculo.opcionais);
  bloco += linha("Perícia cautelar", estadoDaPericia(veiculo));
  bloco += linha("Garantia", `${GARANTIA_MESES} meses de motor e câmbio, contados da entrega`);
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
const fichasDoPatio = unstable_cache(
  async (): Promise<string> => {
    const { disponiveis } = await recortesDoEstoque();
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    return cabecalho(disponiveis.length, agora) + disponiveis.map(ficha).join("");
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

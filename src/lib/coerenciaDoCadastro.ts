/**
 * Quando o nome do veículo contradiz a carroceria salva.
 *
 * ---------------------------------------------------------------------------
 * Por que isto existe
 * ---------------------------------------------------------------------------
 * O handoff de 2026-08-27 auditou as fichas públicas antes do SDR entrar no ar
 * e achou dez carrocerias erradas. Nove delas eram `Hatch` — incluindo duas
 * Kombi, uma Parati e um Bongo.
 *
 * A tentação é culpar o código. Não é: `resolveTipo` (`lib/supabase.ts`) nunca
 * inventa carroceria — ele normaliza a caixa do que o feed manda e devolve
 * string vazia quando não vem nada. O `Hatch` vem do RevendaMais, que o usa
 * como lixeira, e o RevendaMais não é nosso para consertar.
 *
 * O que dá para fazer do lado de cá é **perceber**. Um Bongo cadastrado como
 * hatch é detectável pelo nome; o checklist de publicação não pegava porque
 * ele valida presença, não correção — o campo estava preenchido, só que com o
 * valor errado.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ Só sinaliza. Nunca escreve.
 * ---------------------------------------------------------------------------
 * O handoff sugeria preencher automaticamente "quando o campo estiver vazio".
 * Medido nos 39 veículos servidos em 2026-08-27: **nenhum tem carroceria
 * vazia**. A regra nunca dispararia, e a metade que vale é o alerta.
 *
 * Escrever por cima seria pior que não fazer nada: apagaria a distinção entre
 * "alguém conferiu" e "a tabela deduziu", e um modelo fora da tabela seguiria
 * errado em silêncio parecendo revisado. É a mesma razão pela qual o §5.4
 * daquele documento pede que o MOTOR extraído da versão entre como sugestão a
 * confirmar, e não como valor final.
 *
 * ---------------------------------------------------------------------------
 * Sem imports além de tipos
 * ---------------------------------------------------------------------------
 * O alerta é desenhado no editor de veículo, que é componente de cliente. Um
 * import de `./supabase` aqui arrastaria o cliente do banco para o bundle do
 * navegador — mesma nota de `lib/perfisDeUso.ts` e `lib/faixasDePreco.ts`.
 */

export interface RegraDeCoerencia {
  /** Como o modelo aparece no nome. Casado como palavra, não como substring. */
  termos: readonly string[];
  /**
   * As carrocerias ACEITÁVEIS para esse nome. A primeira é a sugerida.
   *
   * Plural porque nem todo nome implica um valor só, e forçar um produziria
   * exatamente o ruído que este módulo existe para evitar. O caso que ensinou
   * isto: o dono classificou a **Saveiro Robust** como `Utilitário` de
   * propósito — cabine simples, comprada para trabalho — enquanto a outra
   * Saveiro fica em `Picape`. As duas leituras são defensáveis, e um detector
   * que reclamasse da escolha dele seria desligado na primeira semana.
   *
   * O alerta só dispara quando o valor salvo não está em NENHUMA da lista.
   */
  carrocerias: readonly string[];
  /** A frase que o alerta mostra. Escrita, não montada. */
  porque: string;
  /**
   * Termos que ANULAM a regra quando aparecem no mesmo nome.
   *
   * Existe por causa do Ford Ka: "Ka **Sedan** SE 1.5" é sedã, mas "Ka SE Plus
   * 1.0 **HA**" é hatch — "HA" é a sigla da Ford, e "Plus" só significa sedã na
   * Chevrolet. Sem esta lista o detector acusaria o Ka certo e viraria ruído.
   */
  exceto?: readonly string[];
}

/**
 * As regras, tiradas dos casos reais do pátio — não de um catálogo genérico.
 *
 * Cada linha existe porque um veículo do estoque a exigiu, e a frase de
 * `porque` é o que alguém precisa ler para decidir se concorda. Discordar é
 * previsto: o dono conhece o carro, a tabela conhece o nome.
 */
export const REGRAS_DE_COERENCIA: readonly RegraDeCoerencia[] = [
  {
    // `Utilitário` é aceitável aqui por decisão do dono em 2026-08-27: picape
    // de cabine simples comprada para trabalho é utilitário na prática, e ele
    // classificou a Saveiro Robust assim. O que a regra continua pegando é o
    // erro de verdade — Saveiro ou Strada em `Hatch`, que foi o caso do feed.
    termos: ["saveiro", "strada", "titano", "toro", "montana", "oroch", "hilux", "s10", "ranger", "amarok"],
    carrocerias: ["Picape", "Utilitário"],
    porque: "é picape — caçamba aberta. `Utilitário` também vale para cabine simples de trabalho",
  },
  {
    termos: ["kombi", "ducato", "jumper", "boxer", "master", "sprinter", "daily"],
    carrocerias: ["Van"],
    porque: "é van de passageiros ou furgão, não hatch",
  },
  {
    // Sem "hr": o hífen conta como fronteira de palavra, então "hr" casaria
    // dentro de **HR-V** e mandaria um SUV virar utilitário. Foi lido na saída,
    // não numa asserção. O HR da Hyundai não está no pátio; quando estiver,
    // entra como "hr-2500" ou pelo nome completo, nunca como duas letras.
    termos: ["bongo", "accelo", "delivery", "iveco daily chassi"],
    // `Caminhão` entrou na lista fechada em 29/08 e passa a ser a leitura
    // sugerida: o Bongo É um caminhão leve. `Utilitário` continua aceito
    // porque descreve o mesmo veículo de outro ângulo, e o detector não
    // reclama de quem viu o carro.
    carrocerias: ["Caminhão", "Utilitário"],
    porque: "é caminhão leve — carga sobre chassi, cabine separada",
  },
  {
    termos: ["voyage", "prisma", "virtus", "cruze", "corolla", "fluence", "sentra", "versa", "logan", "siena", "grand siena"],
    carrocerias: ["Sedan"],
    porque: "é sedã de três volumes",
  },
  {
    // "Onix Plus" e "Ka Sedan" precisam do par de palavras: "Onix" sozinho é
    // hatch e "Ka" sozinho também. Casar só "plus" pegaria o Ford Ka SE Plus,
    // que é hatch — daí os termos compostos.
    termos: ["onix plus", "ka sedan", "classe c", "320i", "c-180", "c 180"],
    carrocerias: ["Sedan"],
    porque: "a nomenclatura do fabricante marca a versão sedã",
    exceto: ["ha c", "hatch"],
  },
  {
    termos: ["parati", "spacefox", "quantum", "ipanema", "caravan", "belina"],
    carrocerias: ["Perua"],
    porque: "é perua — carroceria alongada sobre plataforma de sedã",
  },
  {
    termos: ["spin", "livina", "meriva", "zafira", "touran", "picasso"],
    carrocerias: ["Perua", "Van"],
    porque: "é monovolume — `Perua` ou `Van`, nunca hatch",
  },
];

/** Minúsculas, sem acento — a forma em que os termos são comparados. */
function normalizar(valor: string): string {
  return (valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * O termo aparece no nome como PALAVRA, não como pedaço de outra?
 *
 * `includes` cru casaria "hr" dentro de "Hr-v" e mandaria um SUV virar
 * utilitário. A fronteira é o que separa detector de gerador de ruído.
 */
function contemTermo(nome: string, termo: string): boolean {
  const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(nome);
}

export interface Divergencia {
  /** A carroceria sugerida — a primeira da lista de aceitáveis. */
  esperada: string;
  /** Todas as leituras defensáveis daquele nome, para o alerta oferecer. */
  aceitaveis: readonly string[];
  /** A carroceria que está salva hoje. */
  atual: string;
  /** A frase para a tela: "é picape — caçamba aberta…". */
  porque: string;
}

/**
 * A carroceria salva contradiz o nome? `null` quando concorda ou quando a
 * tabela não tem opinião — silêncio é a resposta certa para o que ela não sabe.
 */
export function divergenciaDeCarroceria(veiculo: {
  marca?: string | null;
  modelo?: string | null;
  versao?: string | null;
  tipo?: string | null;
}): Divergencia | null {
  const nome = normalizar(
    [veiculo.marca, veiculo.modelo, veiculo.versao].filter(Boolean).join(" "),
  );
  if (!nome) return null;

  const atual = (veiculo.tipo ?? "").trim();

  for (const regra of REGRAS_DE_COERENCIA) {
    if ((regra.exceto ?? []).some((t) => contemTermo(nome, normalizar(t)))) continue;
    if (!regra.termos.some((t) => contemTermo(nome, normalizar(t)))) continue;
    // Aceitável = silêncio. O detector só fala quando o valor salvo não está
    // em nenhuma das leituras defensáveis daquele nome.
    if (regra.carrocerias.some((c) => normalizar(c) === normalizar(atual))) return null;
    return {
      esperada: regra.carrocerias[0],
      aceitaveis: regra.carrocerias,
      atual: atual || "— sem carroceria —",
      porque: regra.porque,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Bloqueio de publicação
// ---------------------------------------------------------------------------

/**
 * Quantas fotos um anúncio precisa para ir ao ar.
 *
 * O número já era regra: o checklist de publicação cobra oito desde sempre.
 * O que mudou em 2026-08-27 é ele deixar de ser aviso e virar porta.
 *
 * ⚠️ **As fotos vêm do feed**, não do painel. Um carro com seis fotos não se
 * conserta em `/admin` — alguém precisa subi-las no RevendaMais. Se isso
 * travar carro demais, baixar aqui é uma linha; é por isso que o número tem
 * nome em vez de estar solto no meio de um `if`.
 *
 * Medido nos 39 veículos servidos em 2026-08-27: **três** ficam abaixo de oito
 * — duas fichas com UMA foto (Kombi `8392516`, Parati `8152210`) e o Uno
 * `8100652` com sete. Anúncio de uma foto é pior que anúncio nenhum.
 */
export const MINIMO_DE_FOTOS = 8;

export interface MotivoDeBloqueio {
  /** Chave estável, para o relatório de auditoria agrupar. */
  id: "poucas-fotos";
  /** A frase que o painel e o relatório mostram. */
  texto: string;
  /**
   * Este motivo TIRA o carro do ar, ou é só pendência a resolver?
   *
   * Hoje é sempre `true`, porque sobrou um motivo só — o laudo saiu da lista em
   * 29/08 e era justamente o que valia `false`. O campo fica porque a distinção
   * é da INTERFACE, não desta função: a tabela A6, o editor A15 e a tela de
   * cadastro separam "falta para poder publicar" de "pendência que não tira do
   * ar", e a fila de rascunhos ordena por isso.
   *
   * Enquanto for sempre `true`, as frases de "não tira do ar" dessas telas não
   * têm como aparecer. É dívida conhecida, não engano: some no dia em que
   * entrar o segundo motivo, ou vira remoção deliberada se ele nunca vier.
   */
  bloqueia: boolean;
}

/**
 * O que impede este veículo de ir à vitrine — lista vazia significa liberado.
 *
 * ---------------------------------------------------------------------------
 * O laudo saiu daqui em 2026-08-29, e a razão é de domínio
 * ---------------------------------------------------------------------------
 * A versão anterior tratava `laudo_pericia` vazio como "carro não periciado", e
 * chegou a bloquear publicação por isso. **A leitura estava errada**, e quem
 * corrigiu foi o dono: *"parta do pressuposto de que 100% dos carros são
 * periciados; o campo existe para colocar observações sobre apontamentos
 * pontuais"*.
 *
 * Ou seja, campo vazio quer dizer **sem apontamentos** — o melhor caso, não uma
 * pendência. Bloquear por isso era punir o carro impecável.
 *
 * O resto do código já lia certo, o que torna o engano mais fácil de repetir:
 * `PDPClientWrapper` anota `temLaudo` com a nota *"o laudo está na ficha — não
 * 'o carro foi periciado', que vale para todos"*, e o acordeão de perícia só
 * abre quando há texto E `pericia === "PERÍCIA APROVADA"`. Era o gate de
 * publicação que destoava.
 *
 * O status da perícia mora em outra coluna, `pericia` — medida em 29/08 nos 34
 * publicados: 17 `PERÍCIA APROVADA` e 17 `EM ANÁLISE`. É ela que diz se o laudo
 * pode ser afirmado na ficha; `laudo_pericia` só carrega o que foi observado.
 *
 * ---------------------------------------------------------------------------
 * O que sobrou, e por que continua bloqueando
 * ---------------------------------------------------------------------------
 * Fotos. Anúncio com uma foto é pior que anúncio nenhum, e é conserto de quem
 * sobe o carro no RevendaMais — não julgamento sobre o veículo.
 *
 * Não apaga, não marca vendido e não some do painel: o veículo continua
 * inteiro no banco e visível em `/admin`, só fora das superfícies públicas.
 * Subir a oitava foto o devolve à vitrine no ciclo seguinte.
 */
export function bloqueiosDePublicacao(veiculo: {
  whatsapp_images?: unknown;
  /**
   * De onde a linha veio: `painel` é o cadastro nativo do admin (2026-08-29),
   * qualquer outra coisa — inclusive ausente — é o sync do RevendaMais. Só
   * muda o TEXTO da pendência: quem tem de subir a foto é outra pessoa em cada
   * caso, e mandar o operador esperar o feed de um carro que ele mesmo
   * cadastrou seria uma instrução falsa. A régua é a mesma para os dois.
   */
  origem?: string | null;
}): MotivoDeBloqueio[] {
  const motivos: MotivoDeBloqueio[] = [];

  const fotos = Array.isArray(veiculo.whatsapp_images)
    ? veiculo.whatsapp_images.filter(Boolean).length
    : 0;
  if (fotos < MINIMO_DE_FOTOS) {
    const deOndeVemAFoto =
      veiculo.origem === "painel"
        ? "suba as fotos pelo painel"
        : "as fotos vêm do RevendaMais";
    motivos.push({
      id: "poucas-fotos",
      // O texto varia com a origem porque quem sobe a foto é outra pessoa em
      // cada caso: no carro do RevendaMais a foto vem do feed; no cadastrado
      // aqui (2026-08-29), pelo próprio painel. Mandar o operador esperar o
      // feed de um carro que ele mesmo cadastrou seria instrução falsa.
      texto: `${fotos} de ${MINIMO_DE_FOTOS} fotos — ${deOndeVemAFoto}`,
      bloqueia: true,
    });
  }

  return motivos;
}

/** Atalho para os filtros. Ver `bloqueiosDePublicacao` para o porquê. */
// `laudo_pericia` saiu da assinatura junto com a regra (29/08): a função não o
// lê mais, e mantê-lo no tipo faria quem chama pensar que ele ainda pesa.
export function publicavel(veiculo: {
  whatsapp_images?: unknown;
  origem?: string | null;
}): boolean {
  // `.some(bloqueia)`, e não `.length === 0`: a lista pode trazer pendência que
  // não tira do ar. Hoje não traz — ver `MotivoDeBloqueio.bloqueia` —, mas quem
  // acrescentar o segundo motivo não deve precisar lembrar de mudar isto aqui
  // para o carro não sumir da vitrine por uma observação.
  return !bloqueiosDePublicacao(veiculo).some((m) => m.bloqueia);
}

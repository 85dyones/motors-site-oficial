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
    //
    // A Ford F-250 entrou em 25/09: chegou do feed como `Hatch`, sem nenhuma
    // regra que a pegasse, e o Garagem Profiler a oferecia a quem pedia hatch.
    // F-1000, L200 e Frontier vieram junto por serem o mesmo caso no mercado
    // de seminovos de Curitiba, com nome inconfundível.
    termos: ["saveiro", "strada", "titano", "toro", "montana", "oroch", "hilux", "s10", "ranger", "amarok", "f-250", "f-1000", "l200", "frontier"],
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
    // O Corolla Cross é SUV, e "corolla" o acusava de sedã: o editor mostrava
    // um alerta falso, e o Profiler — que tira da busca o carro com
    // divergência — o escondia de quem pedia SUV. Achado em 25/09.
    exceto: ["corolla cross"],
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
 *
 * Devolve a expressão, e não o teste: ela é montada uma vez por termo, em
 * `REGRAS_MONTADAS`, e usada em todas as chamadas.
 */
function comoPalavra(termo: string): RegExp {
  const escapado = normalizar(termo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`);
}

/**
 * A tabela com os termos já normalizados e as expressões já montadas.
 *
 * Até 28/09 cada chamada normalizava e compilava de novo as 57 expressões da
 * tabela — que não mudam entre uma chamada e outra. O Garagem Profiler chama
 * este detector para cada carro de cada contagem (`elegivel`, em
 * `lib/motorDoMatch.ts`), inclusive no navegador, a cada opção do quiz. Medido
 * naquele dia nas 3120 contagens de `tests/motor-do-match.test.ts`: 5,1 dos
 * 5,2 s eram este detector, e o caso estourava o `testTimeout` na suíte cheia.
 * Com as expressões montadas uma vez só, as mesmas contagens levam 0,6 s.
 *
 * Reusar a expressão dá o mesmo resultado que montar outra: sem as flags `g`
 * e `y`, `test` não guarda `lastIndex` entre uma chamada e a seguinte. Quem
 * trava isso é "nem guarda nada de uma chamada para a outra", em
 * `tests/coerencia-do-cadastro.test.ts`.
 */
const REGRAS_MONTADAS = REGRAS_DE_COERENCIA.map((regra) => ({
  regra,
  exceto: (regra.exceto ?? []).map(comoPalavra),
  termos: regra.termos.map(comoPalavra),
}));

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

  for (const { regra, exceto, termos } of REGRAS_MONTADAS) {
    if (exceto.some((palavra) => palavra.test(nome))) continue;
    if (!termos.some((palavra) => palavra.test(nome))) continue;
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
 * Quantas fotos um anúncio precisa para IR AO AR.
 *
 * ---------------------------------------------------------------------------
 * Era oito. Virou quatro em 2026-09-01, e as oito não sumiram
 * ---------------------------------------------------------------------------
 * Decisão do dono: *"esta trava de 8 fotos pode ser um complicado, acho que 4
 * fotos boas são suficiente pra iniciar e deixar publicado, mas continuar
 * marcando incompleto até as 8 internamente"*.
 *
 * A régua antiga misturava duas perguntas numa: "este anúncio já é bom o
 * bastante para existir?" e "esta ficha está completa?". Elas têm respostas
 * diferentes — quatro fotos boas vendem carro, e a oitava é capricho que não
 * pode custar semanas de vitrine. Agora são duas constantes e dois motivos.
 *
 * Medido na produção no dia da mudança, nos 38 publicados e não vendidos: dois
 * carros entram na vitrine — o SpaceFox `8429524` com cinco fotos e o Uno
 * `8100652` com **sete**, que estava fora por uma única foto. Os dois abaixo da
 * porta continuam fora — Parati `8152210` com uma foto, Kombi `8392516` sem
 * nenhuma —, e é o que se quer: anúncio de uma foto é pior que anúncio nenhum.
 *
 * ⚠️ Baixar mais este número não é gratuito. Ele governa vitrine, feed de
 * anúncios e sitemap ao mesmo tempo — um carro magro entra no catálogo de
 * remarketing ao lado dos completos.
 */
export const MINIMO_DE_FOTOS = 4;

/**
 * Quantas fotos a ficha precisa para estar COMPLETA — cobrança interna.
 *
 * Não bloqueia nada. Vira a pendência `fotos-incompletas`, que o painel mostra
 * como "não tira do ar" e que a fila de rascunhos não conta como impedimento.
 * É a antiga régua de publicação, preservada no lugar certo: a meta de
 * material, não a porta.
 *
 * Oito é o enquadramento que o checklist descreve — frente, traseira, duas
 * laterais, interior, painel, porta-malas e motor.
 */
export const FOTOS_DA_FICHA_COMPLETA = 8;

/**
 * Quantas fotos o carro EM PREPARAÇÃO precisa para ir ao ar: a de cadastro.
 *
 * Pedido do dono em 28/09/2026: carro que acabou de chegar ia ao mercado com
 * uma foto só, e a porta de quatro o escondia do site na janela em que ele é
 * novidade. A exceção vale só com a caixa marcada E a data prevista de
 * chegada ao pátio (`liberadoEmPreparacao`) — é a data que faz da foto única
 * uma promessa com prazo, e não um anúncio magro.
 *
 * O feed de anúncios NÃO aceita a exceção (`entraNoFeedDeAnuncios`): anúncio
 * pago com foto de cadastro rende pouco, e a decisão do dono foi "só no site".
 */
export const MINIMO_DE_FOTOS_EM_PREPARACAO = 1;

/**
 * O último degrau do mapper quando o carro não tem foto nenhuma — não é foto.
 *
 * `mapVeiculoDbToVeiculo` preenche `whatsapp_images` com `url_imagem` ou, sem
 * nada, com este caminho. A vitrine julga a linha crua e a ficha julga o
 * objeto mapeado: com a porta em quatro a diferença nunca mudou a resposta
 * (0 ou 1 foto, fora do mesmo jeito), mas com a porta em UMA o logotipo passaria
 * por foto de cadastro.
 */
const FOTO_DE_QUEDA_DO_MAPPER = "/logo.png";

function contarFotos(whatsappImages: unknown): number {
  return Array.isArray(whatsappImages)
    ? whatsappImages.filter((foto) => Boolean(foto) && foto !== FOTO_DE_QUEDA_DO_MAPPER).length
    : 0;
}

/** Se a exceção do carro em preparação vale: a caixa marcada E uma data de verdade. */
export function liberadoEmPreparacao(veiculo: {
  em_preparacao?: unknown;
  previsao_chegada_em?: unknown;
}): boolean {
  if (veiculo.em_preparacao !== true) return false;
  const data = veiculo.previsao_chegada_em;
  return typeof data === "string" && data.trim() !== "" && !Number.isNaN(Date.parse(data));
}

const fotoOuFotos = (n: number) => (n === 1 ? "foto" : "fotos");

export interface MotivoDeBloqueio {
  /** Chave estável, para o relatório de auditoria agrupar. */
  id: "poucas-fotos" | "fotos-incompletas";
  /** A frase que o painel e o relatório mostram. */
  texto: string;
  /**
   * Este motivo TIRA o carro do ar, ou é só pendência a resolver?
   *
   * Foi sempre `true` entre 29/08 e 01/09 — o laudo, que era o único caso de
   * `false`, tinha saído da régua, e este campo ficou anotado como dívida: as
   * frases de "não tira do ar" das telas não tinham como aparecer.
   *
   * Deixou de ser dívida. `fotos-incompletas` é um motivo real que não
   * bloqueia, e os sete consumidores que já filtravam por este campo passaram a
   * exercer o ramo que nunca rodava — sem nenhum deles precisar mudar.
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
  em_preparacao?: unknown;
  previsao_chegada_em?: unknown;
}): MotivoDeBloqueio[] {
  const motivos: MotivoDeBloqueio[] = [];

  const fotos = contarFotos(veiculo.whatsapp_images);
  // A porta baixa para uma foto SÓ com a caixa e a data — ver
  // `MINIMO_DE_FOTOS_EM_PREPARACAO`.
  const minimo = liberadoEmPreparacao(veiculo) ? MINIMO_DE_FOTOS_EM_PREPARACAO : MINIMO_DE_FOTOS;

  // ---------------------------------------------------------------------------
  // Uma instrução só, desde 2026-09-01
  // ---------------------------------------------------------------------------
  // Até aqui este texto variava com a origem: no carro do painel dizia "suba as
  // fotos pelo painel", no do feed dizia "as fotos vêm do RevendaMais". A
  // distinção fazia sentido enquanto a galeria recusava veículo do sync.
  //
  // Ela caiu na F0.5 — a trava tirou do RevendaMais o poder de reescrever foto,
  // e a galeria passou a valer para qualquer origem. Manter os dois textos
  // deixaria a tela mandando o operador para o RevendaMais em 100% do estoque,
  // que é `origem = 'sync'` inteiro.
  //
  // O custo disso era medido: entre os 38 publicados e não vendidos, dois
  // estavam abaixo da porta de quatro fotos (Kombi e Parati) e outros com a
  // ficha incompleta — todos com esta pendência mandando resolver noutro
  // sistema. O `origem` saiu da assinatura junto com o texto: parâmetro que não
  // muda mais nada convida a acreditar que muda.
  //
  // O botão "Importar fotos do feed" (#75) não pede uma segunda frase: ele mora
  // na mesma galeria, que desde a fusão com o #45 (16/09) aceita envio em carro
  // de qualquer origem. "Pelo painel" continua verdade nos dois caminhos.
  const deOndeVemAFoto = "suba as fotos pelo painel";

  // ---------------------------------------------------------------------------
  // Duas faixas, dois motivos — e só a primeira fecha a porta
  // ---------------------------------------------------------------------------
  // Até 01/09 havia uma faixa só: menos de oito, fora do ar. A régua passou a
  // distinguir "bom o bastante para existir" de "ficha completa", e o `else if`
  // é o que impede os dois motivos de aparecerem juntos — um carro com duas
  // fotos está bloqueado, não bloqueado E incompleto. Listar as duas coisas
  // faria a tela cobrar da pessoa uma tarefa que ela nem pode começar.
  if (fotos < minimo) {
    motivos.push({
      id: "poucas-fotos",
      texto: `${fotos} de ${minimo} ${fotoOuFotos(minimo)} para publicar — ${deOndeVemAFoto}`,
      bloqueia: true,
    });
  } else if (fotos < FOTOS_DA_FICHA_COMPLETA) {
    motivos.push({
      id: "fotos-incompletas",
      // Diz que está no ar ANTES de dizer o que falta. Sem isso o operador lê
      // um número em vermelho e conclui que o carro não está publicado — que é
      // exatamente a confusão que a régua de oito criava.
      texto:
        `no ar com ${fotos} ${fotoOuFotos(fotos)} — a ficha completa pede ${FOTOS_DA_FICHA_COMPLETA} ` +
        `(${deOndeVemAFoto})`,
      bloqueia: false,
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
  em_preparacao?: unknown;
  previsao_chegada_em?: unknown;
}): boolean {
  // `.some(bloqueia)`, e não `.length === 0`: a lista pode trazer pendência que
  // não tira do ar. Hoje não traz — ver `MotivoDeBloqueio.bloqueia` —, mas quem
  // acrescentar o segundo motivo não deve precisar lembrar de mudar isto aqui
  // para o carro não sumir da vitrine por uma observação.
  return !bloqueiosDePublicacao(veiculo).some((m) => m.bloqueia);
}

/**
 * Se o carro entra no feed de anúncios (Meta e Google, `/api/feed/xml`).
 *
 * O feed confia na vitrine — o `getEstoque` já cortou quem não cumpre a régua —
 * com UMA exceção: o carro em preparação só entra com as quatro fotos de
 * sempre. Decisão do dono em 28/09/2026, "só no site": anúncio pago com a foto
 * de cadastro rende pouco, e a Meta pode reprovar imagem genérica.
 *
 * Olha a CAIXA, não a data: sem data a vitrine já o recusa abaixo de quatro, e
 * com data o feed recusa do mesmo jeito.
 */
export function entraNoFeedDeAnuncios(veiculo: {
  whatsapp_images?: unknown;
  em_preparacao?: unknown;
}): boolean {
  if (veiculo.em_preparacao !== true) return true;
  return contarFotos(veiculo.whatsapp_images) >= MINIMO_DE_FOTOS;
}

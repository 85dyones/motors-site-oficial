/**
 * Cadastro nativo de veículo — a régua do que nasce no painel.
 *
 * ---------------------------------------------------------------------------
 * Por que existe um módulo só para isto
 * ---------------------------------------------------------------------------
 * `lib/estoqueEscrita.ts` é o caminho de ALTERAR veículo: ele conhece
 * `CAMPOS_NOSSOS` — a ficha própria que o sync do RevendaMais não toca — e
 * registra no histórico o que mudou. Criar é outro ato: os campos que o
 * editor A15 mostra como "do feed · sobrescrito a cada sync" (marca, modelo,
 * ano, preço, km) são exatamente os que ninguém pode digitar ali e alguém
 * PRECISA digitar aqui, porque não há feed nenhum para trazê-los.
 *
 * Daí a divisão em três listas, e não uma:
 *
 *   `CAMPOS_DE_NASCIMENTO`  o que só o cadastro escreve — a identidade do
 *                           carro. Governados pelo gate da rota inteira
 *                           ("Publicar ou despublicar veículo"), porque criar
 *                           um veículo É pôr um veículo no ar.
 *   `CAMPOS_DE_DOCUMENTO`   documento interno que o editor ainda não edita
 *                           (`chassi`). Governado pela linha própria da A17.
 *   `CAMPOS_NOSSOS`         a ficha do painel, importada de `estoqueEscrita` —
 *                           mesma lista, mesmo gate campo a campo do editor.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ O que este módulo NUNCA escreve, e por quê (migração 20260829130000)
 * ---------------------------------------------------------------------------
 * `id`, `origem`, `last_seen_at` e `first_seen_at` são INFERIDOS pelo banco:
 *
 * - `id` vem do default da sequence `estoque_motors_nativo_seq`, que começa em
 *   900.000.001 — faixa disjunta da do feed (6,1M–8,4M). Mandar id daqui
 *   derrubaria a única coisa que torna a colisão impossível em vez de
 *   improvável.
 * - `origem` é deduzida DA FAIXA do id pelo trigger `marcar_origem`, de
 *   propósito: se a rota pudesse mandá-la, um esquecimento faria o veículo
 *   nascer `sync` e virar alvo do RevendaMais — o oposto do que o dono pediu.
 * - `last_seen_at` é a ASSINATURA DO SYNC. O trigger `trava_do_sync` reconhece
 *   o RevendaMais por ele: escrita que mexe nessa coluna num veículo de origem
 *   `painel` é ignorada. Se uma rota do painel a escrevesse, ela passaria a
 *   parecer o sync — e a trava inteira deixaria de valer. Este é o motivo pelo
 *   qual a lista abaixo tem nome e teste próprio.
 * - `first_seen_at` o trigger carimba no INSERT. Escrever aqui deixaria alguém
 *   antedatar o relógio de "dias em pátio" da tela A6.
 */

import { campoNegadoAoPerfil, ehStaff, perfisDe, podeFazer } from "./permissoes";
import { extrairCamposNossos } from "./estoqueEscrita";
import {
  colunasDaPromocao,
  precoEfetivo,
  recusaDaPromocao,
  temPromocao,
} from "./precoPromocional";
import { recusaPorPisoDeCusto } from "./pisoDePreco";

/** Um campo obrigatório vazio ou um valor impossível, com o texto pronto. */
export interface ProblemaDoCadastro {
  campo: string;
  mensagem: string;
}

/**
 * A identidade do veículo — o que o feed traria e aqui alguém digita.
 *
 * `preco_original` NÃO está na lista porque não é campo de formulário: o
 * cadastro tem UM preço anunciado, e `normalizarCadastro` o grava nas duas
 * colunas. Ver a nota em `PRECO_EM_DUAS_COLUNAS`.
 */
export const CAMPOS_DE_NASCIMENTO = [
  "marca",
  "modelo",
  "versao",
  "ano",
  "ano_fabricacao",
  "quilometragem",
  "cambio",
  "combustivel",
  "cor",
  "preco",
  // Entrou em 2026-08-31, a pedido do dono ("precisamos do preço promocional
  // também no cadastro e ajustes"). Opcional: em branco significa sem
  // promoção, que segue sendo a verdade da maioria dos carros que entram.
  // O que ele muda na gravação é o `preco` efetivo — ver `normalizarCadastro`.
  "preco_promocional",
] as const;

export type CampoDeNascimento = (typeof CAMPOS_DE_NASCIMENTO)[number];

/**
 * Documento interno que o cadastro grava e o editor A15 ainda não edita.
 *
 * `placa` não está aqui: ela já é `CAMPOS_NOSSOS` desde a ficha própria do
 * painel (20260807160000), e passa pelo mesmo caminho do editor. `chassi`
 * entrou no banco com o feed (20260817140000) e nunca ganhou campo de tela —
 * quem cadastra um carro que não veio do RevendaMais é a única pessoa que
 * tem o documento na mão. A linha da A17 que o governa é a mesma da placa:
 * "Preencher documentação do veículo (placa, renavam)".
 */
export const CAMPOS_DE_DOCUMENTO = ["chassi", "renavam"] as const;

/**
 * O que a rota nunca manda ao banco, aconteça o que acontecer.
 *
 * Não é defesa contra o formulário — nenhuma das listas acima os contém, então
 * eles já não entrariam. É defesa contra o futuro: no dia em que alguém copiar
 * uma linha inteira de veículo para "duplicar cadastro", esta lista é o que
 * impede a cópia de trazer junto o carimbo do sync. Ver o cabeçalho.
 */
export const CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE = [
  "id",
  "origem",
  "last_seen_at",
  "first_seen_at",
  // Migração 20260830120000: todo carro nasce `rascunho`, e o trigger o força
  // no INSERT — mandar outro valor no payload não adianta. Está aqui pela mesma
  // razão dos quatro de cima: no dia em que alguém acrescentar o campo a um dos
  // grupos do formulário, a rota passaria a poder PUBLICAR no nascimento, que é
  // exatamente o que a decisão do dono de 30/08 desfez. Publicar é ato de quem
  // tem a linha da A17, depois da revisão — nunca efeito de um cadastro.
  "estado_cadastro",
] as const;

/**
 * Sem estes seis não existe cadastro.
 *
 * Os cinco primeiros são o mínimo que a VITRINE precisa ler. O `chassi` entrou
 * em 2026-08-29, quando o cadastro passou a nascer no núcleo (migração
 * 20260829170000): lá o chassi é a identidade do veículo — `unique (org_id,
 * chassi)` — e é uma das três chaves da guarda de duplicidade que o dono pediu
 * (placa, renavam e chassi). A função do banco recusa sem ele; exigir aqui é
 * dizer isso no formulário, e não depois de o operador preencher tudo.
 *
 * Não é burocracia: carro sem chassi não se escritura no RENAVE nem se põe em
 * NF-e — se ele não está à mão, o cadastro ainda não pode ser feito.
 */
export const CAMPOS_OBRIGATORIOS_DO_CADASTRO = [
  "marca",
  "modelo",
  "ano",
  "preco",
  "quilometragem",
  "chassi",
] as const;

/**
 * O preço vai para `preco` E `preco_original`, com o mesmo valor.
 *
 * Não é redundância nossa — é o esquema que o feed deixou. O mapper público lê
 * `preco_original` e só cai em `preco` na falta dele (`mapVeiculoDbToVeiculo`);
 * o seletor de veículo de `/api/estoque` e o `order("preco")` dos similares
 * leem `preco`. Gravar em uma só faria o carro aparecer com preço em metade
 * das superfícies e R$ 0 na outra metade — e o R$ 0 é o tipo de erro que
 * ninguém vê no painel, só o cliente.
 *
 * `preco_promocional` ficou de fora até 2026-08-31, com a justificativa de que
 * "zero é a verdade de um carro que acabou de entrar" e de que o editor A15 não
 * alterava preço nenhum. O dono pediu o campo nas duas telas, e a justificativa
 * não sobreviveu ao dado: 16 dos 38 veículos ativos estavam em promoção, todos
 * vindos do sync, e nenhum deles podia ser alterado pela loja. Agora a promoção
 * é opcional aqui e no editor — vazia continua significando zero, e zero
 * continua significando sem promoção.
 *
 * Ele NÃO entra nesta constante porque não é uma terceira coluna do mesmo
 * valor: `preco` e `preco_original` recebem o mesmo número, e a promoção é
 * outro número, que por sua vez reescreve `preco`. Ver `lib/precoPromocional.ts`.
 */
export const PRECO_EM_DUAS_COLUNAS = ["preco", "preco_original"] as const;

/**
 * Piso e teto de ANO — sanidade de digitação, não regra de negócio.
 *
 * O teto é o ano que vem porque o ano-MODELO legitimamente se adianta ao
 * calendário (um 2027 vendido em 2026). O piso existe para pegar o dedo que
 * digitou 202 ou 20222, não para dizer que a loja não vende carro antigo.
 */
export const ANO_MINIMO = 1900;
export const anoMaximo = (hoje: Date = new Date()) => hoje.getFullYear() + 1;

const ROTULO: Record<string, string> = {
  marca: "Marca",
  modelo: "Modelo",
  versao: "Versão",
  ano: "Ano do modelo",
  ano_fabricacao: "Ano de fabricação",
  quilometragem: "Quilometragem",
  cambio: "Câmbio",
  combustivel: "Combustível",
  cor: "Cor",
  preco: "Preço anunciado",
  preco_promocional: "Preço promocional",
  placa: "Placa",
  chassi: "Chassi",
};

const vazio = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * Texto vira número; o que não vira, devolve `null`.
 *
 * ---------------------------------------------------------------------------
 * O ponto não é separador de milhar aqui — e essa suposição custava 100x
 * ---------------------------------------------------------------------------
 * A primeira versão fazia `replace(/\./g, "")` para aceitar o teclado pt-BR
 * (`89.900,00`). Só que todo campo numérico da tela é `type="number"`, e o DOM
 * devolve nesses campos a forma CANÔNICA, com ponto decimal. Resultado medido
 * na revisão: `"118900.50"` virava **11.890.050** e `"38400.7"` de
 * quilometragem virava 384.007 — e a validação não pegava, porque ela roda
 * sobre a linha já normalizada, onde 11 milhões é um inteiro positivo
 * perfeitamente válido. Preço e KM não têm teto (o `ano` tem, e por isso
 * escapou). Pior: esse KM é a primeira notação de odômetro do veículo
 * (Emenda 01, §5.2).
 *
 * A regra agora não adivinha: **quem manda é a vírgula**. Com vírgula, é
 * pt-BR — o ponto que sobrar é milhar. Sem vírgula, o número é como veio, e
 * ponto é decimal. É o que casa com `type="number"` e continua aceitando
 * quem cole "89.900,00" de uma planilha.
 */
export function numeroOuNulo(v: unknown): number | null {
  if (vazio(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  const texto = String(v).trim();
  const bruto = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;

  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

/**
 * As duas formas de placa brasileira: ABC1234 e a Mercosul ABC1D23.
 *
 * Bloqueia de propósito, ao contrário do CPF em `vendaFechamento` (que só
 * confere tamanho): placa é o que identifica o carro no DETRAN, na NF-e e no
 * RENAVE que vem aí, e um caractere trocado hoje é um documento errado depois.
 * As duas máscaras cobrem 100% do que circula — não há formato legítimo de
 * fora delas para recusar por engano.
 */
export function placaEhValida(valor: string): boolean {
  const p = (valor ?? "").toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z]{3}\d{4}$/.test(p) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p);
}

/** Chassi (VIN) tem 17 posições e não usa I, O nem Q — regra do próprio padrão. */
export function chassiEhPlausivel(valor: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test((valor ?? "").toUpperCase().replace(/[\s-]/g, ""));
}

/**
 * Só os campos de nascimento, já convertidos ao tipo da coluna.
 *
 * Corpo que não é objeto devolve `{}` em vez de estourar — mesma decisão de
 * `extrairCamposNossos`: entrada malformada merece 400, não 500.
 */
export function normalizarCadastro(corpo: unknown): Record<string, unknown> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return {};
  const fonte = corpo as Record<string, unknown>;
  const linha: Record<string, unknown> = {};

  for (const campo of CAMPOS_DE_NASCIMENTO) {
    if (!(campo in fonte)) continue;
    const bruto = fonte[campo];

    if (campo === "ano" || campo === "ano_fabricacao" || campo === "quilometragem") {
      const n = numeroOuNulo(bruto);
      linha[campo] = n === null ? null : Math.trunc(n);
      continue;
    }
    if (campo === "preco" || campo === "preco_promocional") {
      linha[campo] = numeroOuNulo(bruto);
      continue;
    }
    // Texto: `trim` e nada mais. A capitalização de exibição é do mapper
    // (`capitalizeWords`), como para o que vem do feed — normalizar aqui faria
    // o veículo do painel parecer diferente do resto da vitrine.
    const texto = bruto === null || bruto === undefined ? "" : String(bruto).trim();
    linha[campo] = texto === "" ? null : texto;
  }

  // O preço mora em duas colunas — ver `PRECO_EM_DUAS_COLUNAS`. O digitado é o
  // preço ANUNCIADO, o "de": vai para `preco_original`.
  if ("preco" in linha && linha.preco !== null) {
    linha.preco_original = linha.preco;
  }

  // A promoção, quando houver, muda o EFETIVO — a coluna `preco`, que é a que a
  // vitrine ordena. `preco_original` fica com o de tabela, senão o de/por da
  // ficha não teria "de". Carro cadastrado já em oferta é caso real: o dono
  // pediu o campo aqui, e não só no editor.
  //
  // Sempre normaliza para 0 quando vazio, em vez de deixar a coluna nula: é o
  // vocabulário que o resto do sistema fala para "sem promoção".
  if ("preco_promocional" in linha) {
    const derivado = colunasDaPromocao(
      linha.preco_promocional as number | null,
      (linha.preco_original ?? null) as number | null,
    );
    linha.preco_promocional = derivado.preco_promocional;
    if (derivado.preco !== null) linha.preco = derivado.preco;
  }

  return linha;
}

/**
 * A DECISÃO do cadastro, separada do transporte HTTP.
 *
 * Existe porque a revisão mediu: com o gate morando dentro do handler, os
 * testes só conseguiam afirmar que o TEXTO do gate está no arquivo. Mutação
 * provou o custo — desarmar `ehStaff`, desarmar `podeFazer`, trocar a
 * montagem da linha por um `Object.assign` do corpo hostil: quatro mutantes
 * sobreviviam à suíte inteira. O que a rota faz de fato (autenticar, ler o
 * perfil, gravar) fica lá; a régua vem para cá, onde um teste consegue
 * exercê-la de verdade, sem mock de Supabase.
 *
 * A ordem das recusas é a da rota, e importa: primeiro "não é da equipe"
 * (403 genérico, não conta o que existe do outro lado), depois "não cadastra",
 * depois o filtro campo a campo, e só então os dados.
 */
/**
 * As portas de entrada que a F0 sabe registrar.
 *
 * `troca` fica de fora e a função do banco também a recusa: a constraint
 * `troca_exige_venda` (spec 10) pede a venda que gerou o crédito, e negócio
 * ainda não existe na operação. Oferecê-la aqui produziria uma entrada
 * mentindo sobre de onde o carro veio. `lote` é momento B, declarado na spec.
 */
export const MODALIDADES_DO_CADASTRO = [
  "compra_direta",
  "consignacao",
  "parceria",
  "repasse",
] as const;
export type ModalidadeDoCadastro = (typeof MODALIDADES_DO_CADASTRO)[number];

export const ROTULO_DA_MODALIDADE: Record<ModalidadeDoCadastro, string> = {
  compra_direta: "Compra direta",
  consignacao: "Consignação",
  parceria: "Parceria",
  repasse: "Repasse",
};

export type DecisaoDoCadastro =
  | { ok: true; linha: Record<string, unknown>; modalidade: ModalidadeDoCadastro }
  | { ok: false; status: number; erro: string; problemas?: ProblemaDoCadastro[] };

export function decidirCadastro(
  corpo: unknown,
  perfilBruto: Parameters<typeof perfisDe>[0],
): DecisaoDoCadastro {
  if (!ehStaff(perfilBruto)) {
    return { ok: false, status: 403, erro: "Acesso restrito à equipe" };
  }
  const perfil = perfisDe(perfilBruto);

  // Criar veículo É pôr veículo no ar: quem cadastra é quem publica.
  if (podeFazer(perfil, "Publicar ou despublicar veículo") !== "faz") {
    return { ok: false, status: 403, erro: "Seu perfil não cadastra veículo" };
  }

  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { ok: false, status: 400, erro: "Corpo inválido" };
  }

  const nascimento = normalizarCadastro(corpo);
  const nossos = extrairCamposNossos(corpo);
  const documento = extrairCamposDeDocumento(corpo);

  const negado = campoNegadoAoPerfil(perfil, [
    ...Object.keys(nossos),
    ...Object.keys(documento),
  ]);
  if (negado) {
    return {
      ok: false,
      status: 403,
      erro: `Seu perfil não preenche "${negado.campo}" (${negado.acao})`,
    };
  }

  const linha = montarLinhaDoCadastro(nascimento, nossos, documento);

  const problemas = validarCadastroDeVeiculo(linha);
  if (problemas.length > 0) {
    return {
      ok: false,
      status: 422,
      erro: "Faltam dados para cadastrar o veículo.",
      problemas,
    };
  }

  // A porta de entrada. Vem do formulário porque o núcleo registra a aquisição
  // de verdade desde 2026-08-29 ("precisa entrar já") — e registrar tudo como
  // compra direta faria a `veiculo_entradas` mentir sobre carro de terceiro,
  // que é justamente o que as constraints da spec 10 existem para impedir.
  //
  // Modalidade desconhecida é RECUSA, nunca queda para o padrão: cair em
  // "compra direta" silenciosamente registraria uma troca como compra própria
  // — a mentira que este campo existe para evitar.
  const escolhida = (corpo as Record<string, unknown>).modalidade;
  let modalidade: ModalidadeDoCadastro = "compra_direta";
  if (escolhida !== undefined && escolhida !== null && escolhida !== "") {
    if (!MODALIDADES_DO_CADASTRO.includes(escolhida as ModalidadeDoCadastro)) {
      return {
        ok: false,
        status: 422,
        erro:
          escolhida === "troca"
            ? "Troca não existe sem a venda que a gerou (spec 10). Registre a venda primeiro; nesta fase use compra direta, consignação, parceria ou repasse."
            : `Porta de entrada desconhecida: "${String(escolhida)}".`,
      };
    }
    modalidade = escolhida as ModalidadeDoCadastro;
  }

  return { ok: true, linha, modalidade };
}

/** Só os campos de documento, em caixa alta e sem separador. */
export function extrairCamposDeDocumento(corpo: unknown): Record<string, unknown> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return {};
  const fonte = corpo as Record<string, unknown>;
  const doc: Record<string, unknown> = {};
  for (const campo of CAMPOS_DE_DOCUMENTO) {
    if (!(campo in fonte)) continue;
    const texto = String(fonte[campo] ?? "").toUpperCase().replace(/[\s-]/g, "");
    doc[campo] = texto === "" ? null : texto;
  }
  return doc;
}

/**
 * Tudo que impede este cadastro de virar linha. Lista vazia = pode gravar.
 *
 * Devolve TODOS os problemas de uma vez, como `validarFechamentoDeVenda`: quem
 * está cadastrando com o carro no pátio precisa da lista inteira, não
 * descobrir campo a campo a cada tentativa.
 *
 * Recebe o corpo BRUTO (o que veio do formulário ou da rota), não a linha
 * normalizada: a mesma função roda nos dois lados, e do lado do formulário o
 * que existe é o que a pessoa digitou.
 */
export function validarCadastroDeVeiculo(
  corpo: Record<string, unknown>,
  hoje: Date = new Date(),
): ProblemaDoCadastro[] {
  const problemas: ProblemaDoCadastro[] = [];
  const falta = (campo: string, mensagem?: string) =>
    problemas.push({ campo, mensagem: mensagem ?? `${ROTULO[campo] ?? campo} é obrigatório.` });

  for (const campo of CAMPOS_OBRIGATORIOS_DO_CADASTRO) {
    if (vazio(corpo[campo])) falta(campo);
  }

  const ano = numeroOuNulo(corpo.ano);
  const teto = anoMaximo(hoje);
  if (ano !== null && (ano < ANO_MINIMO || ano > teto)) {
    falta("ano", `Ano do modelo entre ${ANO_MINIMO} e ${teto}.`);
  }

  const fabricacao = numeroOuNulo(corpo.ano_fabricacao);
  if (fabricacao !== null && (fabricacao < ANO_MINIMO || fabricacao > teto)) {
    falta("ano_fabricacao", `Ano de fabricação entre ${ANO_MINIMO} e ${teto}.`);
  }
  // O carro é fabricado no ano do modelo ou no anterior — nunca depois dele.
  if (ano !== null && fabricacao !== null && fabricacao > ano) {
    falta("ano_fabricacao", "O ano de fabricação não pode ser depois do ano do modelo.");
  }

  const km = numeroOuNulo(corpo.quilometragem);
  if (!vazio(corpo.quilometragem) && km === null) {
    falta("quilometragem", "Quilometragem precisa ser um número.");
  }
  // Zero é legítimo (seminovo de repasse com 0 km existe); negativo, não.
  if (km !== null && km < 0) {
    falta("quilometragem", "Quilometragem não pode ser negativa.");
  }

  const preco = numeroOuNulo(corpo.preco);
  if (!vazio(corpo.preco) && preco === null) {
    falta("preco", "Preço precisa ser um número.");
  }
  if (preco !== null && preco <= 0) {
    falta("preco", "O preço anunciado precisa ser maior que zero.");
  }

  // Promoção: opcional, mas se vier tem de ser menor que o anunciado. A régua é
  // a mesma que o editor A15 e a rota de escrita aplicam — uma função só, para
  // as três bocas não divergirem sobre o que é uma promoção válida.
  const promocional = numeroOuNulo(corpo.preco_promocional);
  if (!vazio(corpo.preco_promocional) && promocional === null) {
    falta("preco_promocional", "Preço promocional precisa ser um número.");
  } else {
    const recusa = recusaDaPromocao(promocional, preco);
    if (recusa) falta("preco_promocional", recusa);
  }

  // O piso de custo, no cadastro. Aqui o custo é digitado na mesma tela, então
  // a trava vale desde o primeiro carro — diferente do editor, onde ela fica
  // silenciosa nos 36 veículos sem `preco_compra` lançado.
  //
  // A recusa nomeia o valor porque quem enxerga este campo é, por definição,
  // quem pode ver custo: a seção inteira some para os outros perfis.
  const custo = numeroOuNulo(corpo.preco_compra);
  const abaixoDoPiso = recusaPorPisoDeCusto(precoEfetivo(promocional, preco), custo, {
    podeVerCusto: true,
  });
  if (abaixoDoPiso) {
    // Cobra no campo que o operador acabou de mexer: se há promoção, foi ela
    // que afundou o preço; senão, foi o anunciado.
    falta(temPromocao(promocional, preco) ? "preco_promocional" : "preco", abaixoDoPiso);
  }

  if (!vazio(corpo.placa) && !placaEhValida(String(corpo.placa))) {
    falta("placa", "Placa no formato ABC1D23 (Mercosul) ou ABC1234.");
  }
  if (!vazio(corpo.chassi) && !chassiEhPlausivel(String(corpo.chassi))) {
    falta("chassi", "Chassi tem 17 caracteres e não usa as letras I, O e Q.");
  }

  return problemas;
}

/**
 * A linha final, pronta para o INSERT — e a última porta antes do banco.
 *
 * Recebe os três grupos já filtrados por quem sabe filtrá-los (a rota) e
 * remove, no fim, tudo que só o banco decide. É redundante hoje e é o ponto
 * que evita a regressão de amanhã — ver `CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE`.
 */
export function montarLinhaDoCadastro(
  ...grupos: Array<Record<string, unknown>>
): Record<string, unknown> {
  const linha: Record<string, unknown> = Object.assign({}, ...grupos);
  for (const proibido of CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE) {
    delete linha[proibido];
  }
  return linha;
}

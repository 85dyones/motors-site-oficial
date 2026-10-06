/**
 * Consulta de placa — o retrato do carro que a loja avalia para comprar.
 *
 * Pedido do dono em 06/10/2026: digitar a placa e saber tudo do carro, se há
 * impeditivo e para onde o preço dele está indo. Hoje isso chega como um PDF
 * de R$ 60 da vistoria parceira; a fonte escolhida foi a APIBrasil, produto
 * "Veículos Total" (`tipo: "veiculos-total"`), conferida campo a campo contra
 * um laudo desses.
 *
 * A consulta é MESCLADA (pedido do dono no mesmo dia): o que só existe pago
 * vem da APIBrasil; o que dá para saber sem custo entra por cima, e nenhuma
 * falha da parte gratuita derruba a consulta.
 *
 *   pago ........ cadastro, gravame, leilão, sinistro, roubo e furto, débitos,
 *                 restrições e a série mensal da FIPE
 *   sem custo ... o chassi decodificado aqui mesmo (ano e origem, conferidos
 *                 contra o cadastro); a empresa que comprou o carro zero, pelo
 *                 CNPJ de faturamento (BrasilAPI); e a FIPE do mês conferida na
 *                 fonte pública pelo código FIPE (BrasilAPI). As duas últimas
 *                 moram em `consultaGratuita.ts`, e `mesclarGratuito` as junta.
 *
 * Este arquivo é a parte PURA: lê a resposta do fornecedor e devolve o
 * retrato. Sem rede e sem banco, para o teste exercê-lo com as duas respostas
 * reais guardadas em `tests/fixtures/apibrasil/`. A rede mora em
 * `apiBrasil.ts`; a porta, em `/api/consulta-placa`.
 *
 * ---------------------------------------------------------------------------
 * Dado pessoal não entra no retrato
 * ---------------------------------------------------------------------------
 * A resposta traz nome e CPF do proprietário (`baseEstadual.pronome`,
 * `historicoProprietarios[].proprietario`/`cpfCnpj`) e o CPF de quem financiou
 * (`gravame[].documentoFinanciado`). Nada disso serve à decisão de compra, e é
 * o mesmo dado que tirou o laudo cautelar da ficha pública (LGPD). O retrato é
 * montado campo a campo, por lista positiva: o que não está escrito aqui não
 * passa. Dos documentos fica só a CONTAGEM de quantos diferentes aparecem.
 * A resposta crua nunca é gravada, e a tabela recusa as chaves pessoais
 * (`consultas_de_placa_sem_dado_pessoal`).
 *
 * O CNPJ de faturamento fica: é de empresa (a concessionária ou a locadora que
 * comprou o carro zero) e diz de onde o carro veio. Documento de pessoa física
 * no mesmo campo é descartado.
 *
 * ---------------------------------------------------------------------------
 * Bloco que não veio não é "nada consta"
 * ---------------------------------------------------------------------------
 * Na comparação de 06/10 a placa do Paraná voltou SEM `baseEstadual`: débitos,
 * multas e restrições do Detran simplesmente não estavam na resposta, e o
 * laudo da vistoria mostrava uma taxa de licenciamento em aberto. Ausência de
 * bloco vira item de `naoVeio`, com o que deixou de ser conferido — nunca um
 * zero. O mesmo vale para o recall, que chega como objeto vazio.
 */

export const PRODUTO_VEICULOS_TOTAL = "veiculos-total";

/** Linha da matriz de permissões que abre a tela, a rota e a tabela. */
export const ACAO_CONSULTAR_PLACA = "Consultar placa de veículo (consulta paga)";

/** Os papéis de `ACAO_CONSULTAR_PLACA`, como a RLS da tabela os escreve. */
export const PAPEIS_QUE_CONSULTAM_PLACA = ["admin", "gestor", "comercial"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// A placa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A placa em maiúsculas e sem separador, ou `null` se não for uma das duas
 * máscaras que circulam (ABC1234 e a Mercosul ABC1D23). Mesma régua de
 * `placaEhValida` (`cadastroDeVeiculo.ts`); aqui ela devolve a forma canônica,
 * que é a chave do cache.
 */
export function normalizarPlaca(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const p = valor.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z]{3}\d{4}$/.test(p) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p) ? p : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// O retrato
// ─────────────────────────────────────────────────────────────────────────────

export interface PontoDaFipe {
  ano: number;
  mes: number;
  valor: number;
}

export interface FipeDoRetrato {
  codigo: string | null;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  valorAtual: number | null;
  valorZeroKm: number | null;
  /** Do mês mais antigo para o mais novo. */
  historico: PontoDaFipe[];
}

export interface GravameDoRetrato {
  agente: string | null;
  situacao: string | null;
  /** AAAA-MM-DD. */
  dataInclusao: string | null;
  /** O fornecedor marca "Atual" ou "Histórico". */
  atual: boolean;
  /** A situação diz que o agente financeiro já deu baixa. */
  baixado: boolean;
}

export interface AnuncioDoRetrato {
  /** AAAA-MM-DD. */
  data: string | null;
  km: number | null;
  valor: number | null;
  fotos: number;
}

export interface LeituraDeKm {
  /** AAAA-MM-DD. */
  data: string | null;
  km: number;
}

export type GravidadeDoApontamento = "impeditivo" | "atencao";

export interface Apontamento {
  chave: string;
  gravidade: GravidadeDoApontamento;
  titulo: string;
  detalhe: string;
}

export interface BlocoQueNaoVeio {
  chave: string;
  titulo: string;
  /** O que deixou de ser conferido por causa disso. */
  detalhe: string;
}

export interface DebitosDoRetrato {
  ipva: number | null;
  licenciamento: number | null;
  multas: number | null;
  dpvat: number | null;
}

/** O que o próprio chassi diz, lido sem consultar ninguém. */
export interface LeituraDoChassi {
  /** Ano pela 10ª posição; `null` se a posição não é um código de ano. */
  ano: number | null;
  /** Onde foi fabricado, pela 1ª posição; `null` se não está na lista curta. */
  origem: string | null;
  /** O ano do chassi bate com o ano de fabricação ou com o ano-modelo do cadastro. */
  confereComOCadastro: boolean | null;
}

/** A empresa do CNPJ de faturamento, como a Receita a cadastra (dado público de empresa). */
export interface EmpresaDoFaturamento {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnae: string | null;
  atividade: string | null;
  /** O CNAE principal é locação de automóveis sem condutor (7711-0/00). */
  locadora: boolean;
}

/** A FIPE do mês na fonte pública, para o código FIPE e o ano-modelo do carro. */
export interface FipeOficial {
  valor: number;
  mesReferencia: string | null;
}

/** A parte sem custo da consulta. `falhas` diz o que foi tentado e não veio. */
export interface DadosGratuitos {
  empresaDoFaturamento: EmpresaDoFaturamento | null;
  fipeOficial: FipeOficial | null;
  falhas: string[];
}

export interface RetratoDaConsulta {
  placa: string;
  veiculo: {
    descricao: string | null;
    marca: string | null;
    anoFabricacao: number | null;
    anoModelo: number | null;
    cor: string | null;
    combustivel: string | null;
    categoria: string | null;
    tipo: string | null;
    procedencia: string | null;
    municipio: string | null;
    uf: string | null;
    potenciaCv: number | null;
    cilindradas: number | null;
    chassi: string | null;
    motor: string | null;
    renavam: string | null;
    /** `baseNacional.dtUltimaAtualizacao`, AAAA-MM-DD. */
    ultimaAtualizacao: string | null;
    /** `baseEstadual.dataEmissaoCrv`, AAAA-MM-DD: desde quando o dono atual tem o documento. */
    emissaoDoCrv: string | null;
  };
  fipe: FipeDoRetrato | null;
  /** O carro zero foi faturado para empresa ou para pessoa; o CNPJ só no primeiro caso. */
  primeiroFaturamento: { para: "empresa" | "pessoa" | null; cnpj: string | null; uf: string | null };
  gravames: GravameDoRetrato[];
  debitos: DebitosDoRetrato | null;
  leilao: { consta: boolean; registros: number; descricao: string | null };
  sinistro: { consta: boolean; descricao: string | null };
  rouboFurto: { consta: boolean; ativa: boolean };
  locadora: boolean | null;
  /** `null` quando o bloco veio vazio: não dá para dizer que não há recall. */
  recallsPendentes: number | null;
  risco: { indice: number | null; parecer: string | null };
  anuncios: AnuncioDoRetrato[];
  leiturasDeKm: LeituraDeKm[];
  /**
   * Contagens tiradas dos documentos pessoais, que não ficam: quantos donos o
   * histórico lista e quantos documentos diferentes aparecem nos gravames.
   */
  pessoas: { donosNoHistorico: number; financiadosDistintos: number };
  chassi: LeituraDoChassi | null;
  /** `null` até `mesclarGratuito` rodar; a consulta paga vale sem ele. */
  gratuito: DadosGratuitos | null;
  apontamentos: Apontamento[];
  naoVeio: BlocoQueNaoVeio[];
}

export type LeituraDaResposta =
  | { ok: true; retrato: RetratoDaConsulta; custo: number | null; saldo: number | null; homologacao: boolean }
  | { ok: false; motivo: string };

type Objeto = Record<string, unknown>;

function objeto(v: unknown): Objeto | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : null;
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Número como o fornecedor escreve. A documentação dele avisa que os números
 * chegam como texto com separador inconstante, e as duas respostas guardadas
 * confirmam: "116904.00", "87000", "0,00" e "30,000" (trinta reais, com três
 * casas). Regra: havendo vírgula, ela é o decimal e ponto é milhar; sem
 * vírgula, o ponto é o decimal. Não usar para identificador (chassi, renavam).
 */
export function numeroDoFornecedor(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

function inteiro(v: unknown): number | null {
  const n = numeroDoFornecedor(v);
  return n !== null && Number.isInteger(n) ? n : null;
}

/** "16/04/2026" ou "24/02/2026 16:08:30" → "2026-04-16". Data impossível vira `null`. */
export function dataDoFornecedor(v: unknown): string | null {
  const t = texto(v);
  const m = t?.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  return d.getUTCFullYear() === Number(ano) && d.getUTCMonth() === Number(mes) - 1 && d.getUTCDate() === Number(dia)
    ? `${ano}-${mes}-${dia}`
    : null;
}

const soDigitos = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : "");

/** O fornecedor escreve a ausência de restrição de vários jeitos; todos começam assim. */
function nadaConsta(v: unknown): boolean {
  const t = texto(v);
  return t === null || /^(nada consta|n[aã]o consta|n[aã]o existe|sem restri)/i.test(t);
}

function lerFipe(dados: Objeto): FipeDoRetrato | null {
  const basicos = objeto(dados.dadosBasicosDoVeiculo);
  const info = objeto(lista(basicos?.informacoesFipe)[0]);
  const codigoFipe = objeto(lista(dados.codigoFipe)[0]);
  if (!info && !codigoFipe) return null;

  const historico: PontoDaFipe[] = [];
  for (const p of lista(info?.historicoPreco)) {
    const o = objeto(p);
    // `predicao: true` seria projeção do fornecedor, e não a tabela publicada.
    if (!o || o.predicao === true) continue;
    const ano = inteiro(o.ano);
    const mes = inteiro(o.mes);
    const valor = numeroDoFornecedor(o.valor);
    if (ano === null || mes === null || mes < 1 || mes > 12 || valor === null || valor <= 0) continue;
    historico.push({ ano, mes, valor });
  }
  historico.sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  return {
    codigo: texto(codigoFipe?.codigo),
    marca: texto(info?.marca),
    modelo: texto(info?.modelo),
    versao: texto(info?.versao),
    valorAtual: numeroDoFornecedor(info?.valorAtual) ?? historico[historico.length - 1]?.valor ?? null,
    valorZeroKm: numeroDoFornecedor(codigoFipe?.valorZeroKM),
    historico,
  };
}

function lerGravames(dados: Objeto): { gravames: GravameDoRetrato[]; financiadosDistintos: number } {
  const gravames: GravameDoRetrato[] = [];
  const documentos = new Set<string>();
  for (const g of lista(dados.gravame)) {
    const o = objeto(g);
    if (!o) continue;
    const situacao = texto(o.situacao) ?? texto(o.gravame);
    gravames.push({
      agente: texto(o.agente),
      situacao,
      dataInclusao: dataDoFornecedor(o.dataInclusao),
      atual: /^atual$/i.test(texto(o.observacoes) ?? ""),
      baixado: /baixad/i.test(situacao ?? ""),
    });
    // O documento serve só para contar quantos diferentes aparecem.
    const doc = soDigitos(o.documentoFinanciado);
    if (doc) documentos.add(doc);
  }
  return { gravames, financiadosDistintos: documentos.size };
}

function lerAnuncios(dados: Objeto): AnuncioDoRetrato[] {
  const anuncios: AnuncioDoRetrato[] = [];
  for (const a of lista(dados.historicoAnuncios)) {
    const o = objeto(a);
    if (!o) continue;
    anuncios.push({
      data: dataDoFornecedor(o.data),
      km: inteiro(o.km),
      valor: numeroDoFornecedor(o.valor),
      fotos: lista(o.fotos).length,
    });
  }
  return anuncios.sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
}

function lerLeiturasDeKm(dados: Objeto): LeituraDeKm[] {
  const leituras: LeituraDeKm[] = [];
  for (const k of lista(dados.historicoKm)) {
    const o = objeto(k);
    const km = inteiro(o?.km);
    if (!o || km === null || km < 0) continue;
    leituras.push({ data: dataDoFornecedor(o.dataInclusao), km });
  }
  return leituras.sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
}

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** AAAA-MM-DD → DD/MM/AAAA, para o texto dos apontamentos. */
function dataPorExtenso(iso: string | null): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "data não informada";
}

/**
 * Lê a resposta da APIBrasil para `veiculos-total`.
 *
 * O fornecedor devolve erro com HTTP 200: o que decide é `error === false`
 * (aviso da documentação dele). `placaPedida` é a que a loja digitou; resposta
 * de outra placa é recusada, para um retrato nunca ser gravado na chave errada
 * (em homologação o fornecedor responde com a placa de exemplo dele, e aí a
 * conferência não se aplica).
 */
export function lerRespostaDaApiBrasil(corpo: unknown, placaPedida: string): LeituraDaResposta {
  const raiz = objeto(corpo);
  if (!raiz) return { ok: false, motivo: "A APIBrasil respondeu algo que não é JSON de consulta." };
  if (raiz.error !== false) {
    return { ok: false, motivo: texto(raiz.message) ?? "A APIBrasil recusou a consulta sem dizer o motivo." };
  }
  const dados = objeto(raiz.data);
  if (!dados) return { ok: false, motivo: "A APIBrasil respondeu sem os dados do veículo." };

  const homologacao = raiz.homolog === true || raiz.api_limit_for === "homolog";
  const placaDaResposta = normalizarPlaca(dados.placa);
  if (!homologacao && placaDaResposta !== placaPedida) {
    return {
      ok: false,
      motivo: `A APIBrasil respondeu sobre outra placa (${placaDaResposta ?? "ilegível"}). Nada foi gravado.`,
    };
  }

  const nacional = objeto(dados.baseNacional);
  const estadual = objeto(dados.baseEstadual);
  const fipe = lerFipe(dados);
  const { gravames, financiadosDistintos } = lerGravames(dados);
  const leilaoBruto = objeto(dados.leilao);
  const sinistroBruto = objeto(dados.indicioSinistro);
  const rouboBruto = objeto(dados.rouboFurto);
  const recallBruto = objeto(dados.recall);
  const riscoBruto = objeto(dados.analiseRisco);
  const locadoraBruto = objeto(dados.registroEmLocadora);

  const registrosDeLeilao = lista(leilaoBruto?.registros).length;
  const descricaoDoLeilao = semEmoji(texto(leilaoBruto?.descricao));
  const leilao = {
    consta: registrosDeLeilao > 0 || (descricaoDoLeilao !== null && !nadaConsta(descricaoDoLeilao)),
    registros: registrosDeLeilao,
    descricao: descricaoDoLeilao,
  };

  const descricaoDoSinistro = semEmoji(texto(sinistroBruto?.descricao));
  const sinistro = {
    consta: texto(sinistroBruto?.classificacao) !== null || (descricaoDoSinistro !== null && !nadaConsta(descricaoDoSinistro)),
    descricao: descricaoDoSinistro,
  };

  const rouboFurto = {
    consta:
      rouboBruto?.constaOcorrencia === true ||
      lista(rouboBruto?.historico).length > 0 ||
      /^veiculo indica/i.test(texto(nacional?.ocorrencia) ?? ""),
    ativa: rouboBruto?.constaOcorrenciaAtiva === true,
  };

  // O bloco de recall chega como objeto com tudo nulo quando o fornecedor não
  // consultou: só há resposta quando ele descreve o retorno ou lista pendências.
  const pendencias = lista(recallBruto?.recallsPendente).length + lista(recallBruto?.detalhes).length;
  const recallsPendentes = pendencias > 0 ? pendencias : texto(recallBruto?.descricaoRetorno) !== null ? 0 : null;

  const debitos: DebitosDoRetrato | null = estadual
    ? {
        ipva: numeroDoFornecedor(estadual.debitoIpva),
        licenciamento: numeroDoFornecedor(estadual.debitoLicenciamento),
        multas: numeroDoFornecedor(estadual.debitoMultas),
        dpvat: numeroDoFornecedor(estadual.debitoDpvat),
      }
    : null;

  const docFaturado = soDigitos(dados.docFaturado ?? nacional?.docFaturado);
  const tipoFaturado = texto(nacional?.tipoDocFaturado);
  const faturadoParaEmpresa = docFaturado.length === 14 && tipoFaturado !== "FISICA";

  // ── Os apontamentos ────────────────────────────────────────────────────────
  const apontamentos: Apontamento[] = [];
  const impeditivo = (chave: string, titulo: string, detalhe: string) =>
    apontamentos.push({ chave, gravidade: "impeditivo", titulo, detalhe });
  const atencao = (chave: string, titulo: string, detalhe: string) =>
    apontamentos.push({ chave, gravidade: "atencao", titulo, detalhe });

  const gravamesAbertos = gravames.filter((g) => !g.baixado && g.situacao !== null);
  for (const g of gravamesAbertos) {
    impeditivo(
      "gravame",
      "Financiamento em aberto",
      `${g.agente ?? "Agente financeiro não informado"}, incluído em ${dataPorExtenso(g.dataInclusao)}: "${g.situacao}". ` +
        "Só transfere depois da quitação e da baixa.",
    );
  }
  // A restrição financeira das bases, quando nenhum gravame aberto a explica.
  const restricaoFinanceira = [estadual?.restricaoFinanceira, nacional?.restricaoFinanciadora].find((r) => !nadaConsta(r));
  if (gravamesAbertos.length === 0 && restricaoFinanceira !== undefined) {
    impeditivo(
      "restricao_financeira",
      "Restrição financeira",
      `A base do Detran registra "${texto(restricaoFinanceira)}", sem gravame aberto na lista. Confirmar com o banco antes de comprar.`,
    );
  }

  if (rouboFurto.ativa) {
    impeditivo("roubo_furto", "Roubo ou furto em aberto", "Há ocorrência ATIVA de roubo ou furto. Não é compra.");
  } else if (rouboFurto.consta) {
    atencao("roubo_furto_historico", "Histórico de roubo ou furto", "Há ocorrência já encerrada. Conferir a recuperação e a numeração na perícia.");
  }

  if (!nadaConsta(estadual?.restricaoRenajud) || texto(nacional?.indicadorRestricaoRenajud) === "SIM") {
    impeditivo("renajud", "Bloqueio judicial (Renajud)", "Há restrição judicial registrada no Renajud. Não transfere enquanto durar.");
  }

  // `restricaoAdminisrativa` é a grafia do fornecedor.
  const outras: Array<[string, string, unknown]> = [
    ["restricao_judicial", "Restrição judicial", estadual?.restricaoJudicial],
    ["restricao_administrativa", "Restrição administrativa", estadual?.restricaoAdminisrativa],
    ["restricao_tributaria", "Restrição tributária", estadual?.restricaoTributaria],
    ["restricao_guincho", "Restrição de guincho", estadual?.restricaoGuincho],
    ["restricao_ambiental", "Restrição ambiental", estadual?.restricaoAmbiental],
  ];
  for (const [chave, titulo, valor] of outras) {
    if (!nadaConsta(valor)) impeditivo(chave, titulo, `A base estadual registra "${texto(valor)}".`);
  }

  // Restrições genéricas das duas bases. A alienação já saiu acima, como gravame.
  const genericas = new Set<string>();
  for (const base of [estadual, nacional]) {
    if (!base) continue;
    for (const [chave, valor] of Object.entries(base)) {
      if (!/^(outrasRestricoes|restricao)\d+$/.test(chave) || nadaConsta(valor)) continue;
      const t = texto(valor)!;
      if (!/alienac/i.test(t)) genericas.add(t);
    }
  }
  for (const t of genericas) impeditivo("restricao_outra", "Outra restrição", `As bases registram "${t}".`);

  const situacao = texto(estadual?.situacaoVeiculo) ?? texto(nacional?.situacaoVeiculo);
  if (situacao !== null && !/^circulacao$/i.test(situacao)) {
    impeditivo("situacao", "Situação do veículo", `O cadastro diz "${situacao}", e não "em circulação".`);
  }

  if (leilao.consta) {
    impeditivo(
      "leilao",
      "Passagem por leilão",
      leilao.registros > 0
        ? `${leilao.registros} ${leilao.registros === 1 ? "registro" : "registros"} de leilão.`
        : (leilao.descricao ?? "Consta registro de leilão."),
    );
  }

  if (sinistro.consta) {
    atencao("sinistro", "Indício de sinistro", sinistro.descricao ?? "Consta indício de sinistro. Conferir estrutura na perícia.");
  }

  const comunicacao = texto(estadual?.comunicacaoVenda);
  if ((comunicacao !== null && !nadaConsta(comunicacao)) || texto(nacional?.indicadorComunicacaoVendas) === "SIM") {
    atencao("comunicacao_de_venda", "Comunicação de venda", "Consta comunicação de venda: quem vende pode não ser quem está no documento.");
  }

  if (debitos) {
    const itens: Array<[string, number | null]> = [
      ["IPVA", debitos.ipva],
      ["licenciamento", debitos.licenciamento],
      ["multas", debitos.multas],
      ["DPVAT", debitos.dpvat],
    ];
    const abertos = itens.filter(([, v]) => v !== null && v > 0) as Array<[string, number]>;
    if (abertos.length > 0) {
      atencao(
        "debitos",
        "Débitos em aberto",
        `${abertos.map(([nome, v]) => `${nome} ${reais(v)}`).join(", ")}. Somam ${reais(abertos.reduce((s, [, v]) => s + v, 0))}.`,
      );
    }
  }

  const locadora = typeof locadoraBruto?.registroEmLocadora === "boolean" ? locadoraBruto.registroEmLocadora : null;
  if (locadora === true) atencao("locadora", "Registro em locadora", "O carro já foi de locadora ou de frota.");

  if (recallsPendentes !== null && recallsPendentes > 0) {
    atencao("recall", "Recall pendente", `${recallsPendentes} ${recallsPendentes === 1 ? "chamado" : "chamados"} de recall sem atendimento.`);
  }

  const donosNoHistorico = lista(dados.historicoProprietarios).length;
  if (financiadosDistintos > Math.max(1, donosNoHistorico)) {
    atencao(
      "donos",
      "Mais donos do que o histórico mostra",
      `Os financiamentos estão em nome de ${financiadosDistintos} documentos diferentes, e o histórico de proprietários lista ${donosNoHistorico}.`,
    );
  }

  // ── O que não veio ─────────────────────────────────────────────────────────
  const naoVeio: BlocoQueNaoVeio[] = [];
  if (!estadual) {
    naoVeio.push({
      chave: "base_estadual",
      titulo: "Base estadual (Detran)",
      detalhe: "Débitos, multas, restrições estaduais e a data do documento NÃO foram conferidos nesta consulta.",
    });
  }
  if (!nacional) {
    naoVeio.push({
      chave: "base_nacional",
      titulo: "Base nacional",
      detalhe: "Restrições nacionais, Renajud e comunicação de venda NÃO foram conferidos nesta consulta.",
    });
  }
  if (!Array.isArray(dados.gravame)) {
    naoVeio.push({ chave: "gravame", titulo: "Gravame", detalhe: "A lista de financiamentos NÃO veio nesta consulta." });
  }
  if (!leilaoBruto) {
    naoVeio.push({ chave: "leilao", titulo: "Leilão", detalhe: "A passagem por leilão NÃO foi conferida nesta consulta." });
  }
  if (!sinistroBruto) {
    naoVeio.push({ chave: "sinistro", titulo: "Indício de sinistro", detalhe: "O indício de sinistro NÃO foi conferido nesta consulta." });
  }
  if (recallsPendentes === null) {
    naoVeio.push({ chave: "recall", titulo: "Recall", detalhe: "O bloco de recall veio vazio: não dá para dizer que não há chamado pendente." });
  }
  if (donosNoHistorico === 0) {
    naoVeio.push({ chave: "proprietarios", titulo: "Histórico de proprietários", detalhe: "A lista veio vazia: a quantidade de donos não foi conferida." });
  }
  if (!fipe || fipe.valorAtual === null) {
    naoVeio.push({ chave: "fipe", titulo: "Tabela FIPE", detalhe: "O valor FIPE não veio: a faixa de compra não pode ser calculada." });
  }

  // O chassi contra o cadastro. A norma deixa o fabricante escolher entre o
  // ano de fabricação e o ano-modelo na 10ª posição, então bater com qualquer
  // um dos dois confere.
  const chassi = decodificarChassi(
    texto(dados.chassi),
    [inteiro(dados.anoFabricacao), inteiro(dados.anoModelo)].filter((a): a is number => a !== null),
  );
  if (chassi && chassi.confereComOCadastro === false) {
    atencao(
      "chassi_ano",
      "Ano do chassi diferente do cadastro",
      `O chassi indica ${chassi.ano}, e o cadastro diz ${inteiro(dados.anoFabricacao) ?? "?"}/${inteiro(dados.anoModelo) ?? "?"}. Conferir a numeração na perícia.`,
    );
  }

  const basicos = objeto(dados.dadosBasicosDoVeiculo);
  const retrato: RetratoDaConsulta = {
    placa: placaDaResposta ?? placaPedida,
    veiculo: {
      descricao: texto(dados.marcaModelo) ?? texto(basicos?.descricao),
      marca: texto(basicos?.marca),
      anoFabricacao: inteiro(dados.anoFabricacao),
      anoModelo: inteiro(dados.anoModelo),
      cor: texto(dados.corVeiculo) ?? texto(nacional?.cor),
      combustivel: texto(dados.combustivel),
      categoria: texto(dados.categoria),
      tipo: texto(dados.tipoVeiculo),
      procedencia: texto(dados.procedencia),
      municipio: texto(dados.municipio),
      uf: texto(dados.uf),
      potenciaCv: inteiro(dados.potencia),
      cilindradas: inteiro(dados.cilindradas),
      chassi: texto(dados.chassi),
      motor: texto(dados.numMotor),
      renavam: texto(dados.renavam),
      ultimaAtualizacao: dataDoFornecedor(dados.dtUltimaAtualizacao),
      emissaoDoCrv: dataDoFornecedor(estadual?.dataEmissaoCrv),
    },
    fipe,
    primeiroFaturamento: {
      para: faturadoParaEmpresa ? "empresa" : docFaturado.length === 11 ? "pessoa" : null,
      cnpj: faturadoParaEmpresa ? docFaturado : null,
      uf: texto(dados.ufFaturado) ?? texto(nacional?.ufFaturado),
    },
    gravames,
    debitos,
    leilao,
    sinistro,
    rouboFurto,
    locadora,
    recallsPendentes,
    risco: { indice: inteiro(riscoBruto?.indiceRisco), parecer: semEmoji(texto(riscoBruto?.parecer)) },
    anuncios: lerAnuncios(dados),
    leiturasDeKm: lerLeiturasDeKm(dados),
    pessoas: { donosNoHistorico, financiadosDistintos },
    chassi,
    gratuito: null,
    apontamentos,
    naoVeio,
  };

  return {
    ok: true,
    retrato,
    custo: numeroDoFornecedor(raiz.tax) ?? numeroDoFornecedor(raiz.valor_consulta),
    saldo: numeroDoFornecedor(raiz.balance),
    homologacao,
  };
}

/** O fornecedor fecha os pareceres com emoji; o painel não usa. */
function semEmoji(t: string | null): string | null {
  return t === null ? null : t.replace(/[\p{Extended_Pictographic}️]/gu, "").trim() || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A tendência do preço
// ─────────────────────────────────────────────────────────────────────────────

export interface VariacaoDaFipe {
  meses: number;
  /** Valor da tabela naquele mês passado. */
  de: number;
  /** Variação até o mês mais recente, em % (negativa quando caiu). */
  pct: number;
}

export interface TendenciaDaFipe {
  /** O mês mais recente da série, "AAAA-MM". */
  referencia: string;
  valorAtual: number;
  /** Só as janelas que a série alcança. */
  variacoes: VariacaoDaFipe[];
  pico: { ano: number; mes: number; valor: number; pct: number };
  /**
   * A queda dos últimos 6 meses comparada com a dos 6 anteriores. `null` sem
   * 12 meses de série ou quando nenhuma das duas metades caiu.
   */
  ritmo: "acelerando" | "desacelerando" | "estavel" | null;
}

/** As janelas que a tela mostra. É recorte de leitura, e não régua de compra. */
export const JANELAS_DA_TENDENCIA = [6, 12, 24] as const;

const pctEntre = (de: number, ate: number) => Math.round(((ate - de) / de) * 1000) / 10;

/**
 * Para onde a FIPE do carro está indo, a partir da série mensal que a consulta
 * traz. A FIPE anda atrás do mercado: isto descreve o que já aconteceu com a
 * tabela, e não uma previsão.
 */
export function tendenciaDaFipe(historico: PontoDaFipe[]): TendenciaDaFipe | null {
  if (historico.length === 0) return null;
  const serie = [...historico].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const ultimo = serie[serie.length - 1];
  const indice = (p: PontoDaFipe) => p.ano * 12 + p.mes;
  // Por mês de calendário, e não por posição: a série pode ter buraco.
  const haMeses = (meses: number) => serie.find((p) => indice(p) === indice(ultimo) - meses) ?? null;

  const variacoes: VariacaoDaFipe[] = [];
  for (const meses of JANELAS_DA_TENDENCIA) {
    const ponto = haMeses(meses);
    if (ponto) variacoes.push({ meses, de: ponto.valor, pct: pctEntre(ponto.valor, ultimo.valor) });
  }

  const pico = serie.reduce((maior, p) => (p.valor > maior.valor ? p : maior), serie[0]);

  let ritmo: TendenciaDaFipe["ritmo"] = null;
  const seis = haMeses(6);
  const doze = haMeses(12);
  if (seis && doze) {
    const recente = pctEntre(seis.valor, ultimo.valor);
    const anterior = pctEntre(doze.valor, seis.valor);
    if (recente < 0 || anterior < 0) {
      ritmo = recente < anterior ? "acelerando" : recente > anterior ? "desacelerando" : "estavel";
    }
  }

  return {
    referencia: `${ultimo.ano}-${String(ultimo.mes).padStart(2, "0")}`,
    valorAtual: ultimo.valor,
    variacoes,
    pico: { ano: pico.ano, mes: pico.mes, valor: pico.valor, pct: pctEntre(pico.valor, ultimo.valor) },
    ritmo,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O hodômetro contra as leituras que a consulta trouxe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A maior leitura anterior que supera o km informado agora, ou `null`.
 * Odômetro não anda para trás: km do painel abaixo de uma leitura registrada
 * antes é sinal de adulteração ou de erro de digitação, e nenhum dos dois é
 * número de mercado.
 */
export function leituraAcimaDoHodometro(leituras: LeituraDeKm[], kmInformado: number | null): LeituraDeKm | null {
  if (kmInformado === null || !Number.isFinite(kmInformado)) return null;
  return leituras.reduce<LeituraDeKm | null>(
    (maior, l) => (l.km > kmInformado && (maior === null || l.km > maior.km) ? l : maior),
    null,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O chassi, lido aqui mesmo (sem custo)
// ─────────────────────────────────────────────────────────────────────────────

/** A 10ª posição do chassi, na ordem da norma: 30 códigos, que se repetem a cada 30 anos. */
const CODIGOS_DE_ANO = "ABCDEFGHJKLMNPRSTVWXY123456789";
const PRIMEIRO_ANO_DO_CICLO = 1980;

/** A 1ª posição: onde o carro foi fabricado. Lista curta, só do que roda aqui. */
const ORIGEM_PELO_CHASSI: Record<string, string> = {
  "9": "Brasil",
  "8": "Argentina ou outro país da América do Sul",
  "3": "México",
  "1": "Estados Unidos",
  "4": "Estados Unidos",
  "5": "Estados Unidos",
  "2": "Canadá",
  J: "Japão",
  K: "Coreia do Sul",
  L: "China",
  M: "Índia ou Tailândia",
  S: "Reino Unido",
  V: "França ou Espanha",
  W: "Alemanha",
  Z: "Itália",
};

/**
 * Ano e origem pelo próprio chassi (VIN de 17 posições).
 *
 * O código de ano se repete a cada 30 anos ("M" é 1991 e 2021), então o ano
 * sai do ciclo que mais se aproxima do cadastro; sem cadastro, do ciclo mais
 * recente que não passa do ano que vem.
 */
export function decodificarChassi(
  chassi: string | null,
  anosDoCadastro: number[] = [],
  hoje: Date = new Date(),
): LeituraDoChassi | null {
  const vin = (chassi ?? "").toUpperCase().replace(/\s/g, "");
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;

  const posicao = CODIGOS_DE_ANO.indexOf(vin[9]);
  let ano: number | null = null;
  if (posicao >= 0) {
    const candidatos: number[] = [];
    for (let a = PRIMEIRO_ANO_DO_CICLO + posicao; a <= hoje.getUTCFullYear() + 1; a += CODIGOS_DE_ANO.length) {
      candidatos.push(a);
    }
    const referencia = anosDoCadastro.length > 0 ? Math.max(...anosDoCadastro) : null;
    ano =
      candidatos.length === 0
        ? null
        : referencia === null
          ? candidatos[candidatos.length - 1]
          : candidatos.reduce((melhor, a) => (Math.abs(a - referencia) < Math.abs(melhor - referencia) ? a : melhor));
  }

  return {
    ano,
    origem: ORIGEM_PELO_CHASSI[vin[0]] ?? null,
    confereComOCadastro: ano === null || anosDoCadastro.length === 0 ? null : anosDoCadastro.includes(ano),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A mescla com o que veio sem custo
// ─────────────────────────────────────────────────────────────────────────────

/** CNAE de locação de automóveis sem condutor: o primeiro dono foi locadora. */
export const CNAE_DE_LOCADORA = "7711000";

/** A partir de quanto a FIPE pública e a do fornecedor são "diferentes": um real, o arredondamento. */
const TOLERANCIA_DA_FIPE_EM_REAIS = 1;

/**
 * Junta ao retrato pago o que a consulta gratuita trouxe. Devolve um retrato
 * NOVO; o de entrada não muda.
 *
 *   * a FIPE pública preenche o valor atual quando o fornecedor não o mandou,
 *     e vira apontamento quando os dois divergem (a tela usa a pública: é a
 *     tabela que o cliente consulta);
 *   * empresa de faturamento com CNAE de locadora vira apontamento, mesmo que
 *     o fornecedor tenha dito que não há registro em locadora.
 */
export function mesclarGratuito(retrato: RetratoDaConsulta, gratuito: DadosGratuitos): RetratoDaConsulta {
  const apontamentos = [...retrato.apontamentos];
  let fipe = retrato.fipe;
  let naoVeio = retrato.naoVeio;

  const oficial = gratuito.fipeOficial;
  if (oficial && fipe) {
    const pago = fipe.valorAtual;
    if (pago !== null && Math.abs(pago - oficial.valor) > TOLERANCIA_DA_FIPE_EM_REAIS) {
      apontamentos.push({
        chave: "fipe_divergente",
        gravidade: "atencao",
        titulo: "FIPE do fornecedor diferente da tabela pública",
        detalhe: `A consulta paga trouxe ${reais(pago)}, e a tabela pública do mês diz ${reais(oficial.valor)}. A conta usa a pública.`,
      });
    }
    fipe = { ...fipe, valorAtual: oficial.valor };
    naoVeio = naoVeio.filter((b) => b.chave !== "fipe");
  }

  const empresa = gratuito.empresaDoFaturamento;
  if (empresa?.locadora && !apontamentos.some((a) => a.chave === "locadora")) {
    apontamentos.push({
      chave: "locadora",
      gravidade: "atencao",
      titulo: "Primeiro dono foi locadora",
      detalhe: `O carro zero foi faturado para ${empresa.nomeFantasia ?? empresa.razaoSocial ?? "uma locadora"}, cuja atividade principal é locação de automóveis.`,
    });
  }

  return { ...retrato, fipe, apontamentos, naoVeio, gratuito };
}

// ─────────────────────────────────────────────────────────────────────────────
// O quadro de checagens e a qualificação — o aviso que se lê de longe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os quatro estados de uma checagem. `nao_conferido` existe para o bloco que
 * não veio: ele nunca aparece como "ok".
 */
export type EstadoDaChecagem = "ok" | "atencao" | "impeditivo" | "nao_conferido";

export interface Checagem {
  chave: string;
  rotulo: string;
  estado: EstadoDaChecagem;
  resumo: string;
}

/**
 * O quadro que a tela desenha: uma linha por pergunta que a loja faz de todo
 * carro, na ordem em que ela reprova (leilão primeiro). Cada linha sai dos
 * apontamentos e do que não veio; nada aqui decide de novo.
 */
export function quadroDeChecagens(retrato: RetratoDaConsulta): Checagem[] {
  const aponta = (...chaves: string[]) => retrato.apontamentos.filter((a) => chaves.includes(a.chave));
  const faltou = (...chaves: string[]) => retrato.naoVeio.some((b) => chaves.includes(b.chave));

  const linha = (
    chave: string,
    rotulo: string,
    achados: Apontamento[],
    semConferencia: boolean,
    limpo: string,
  ): Checagem => {
    if (achados.length > 0) {
      const grave = achados.some((a) => a.gravidade === "impeditivo");
      return { chave, rotulo, estado: grave ? "impeditivo" : "atencao", resumo: achados.map((a) => a.titulo).join("; ") };
    }
    if (semConferencia) return { chave, rotulo, estado: "nao_conferido", resumo: "Não veio nesta consulta" };
    return { chave, rotulo, estado: "ok", resumo: limpo };
  };

  const semEstadual = faltou("base_estadual");
  const semNacional = faltou("base_nacional");

  return [
    linha("leilao", "Leilão", aponta("leilao"), faltou("leilao"), "Sem registro"),
    linha("sinistro", "Sinistro", aponta("sinistro"), faltou("sinistro"), "Sem indício"),
    linha("gravame", "Financiamento", aponta("gravame", "restricao_financeira"), faltou("gravame"), "Sem gravame em aberto"),
    linha("roubo_furto", "Roubo e furto", aponta("roubo_furto", "roubo_furto_historico"), semNacional, "Sem ocorrência"),
    linha("renajud", "Bloqueio judicial", aponta("renajud", "restricao_judicial"), semNacional && semEstadual, "Nada consta"),
    linha(
      "restricoes",
      "Restrições do Detran",
      aponta("restricao_administrativa", "restricao_tributaria", "restricao_guincho", "restricao_ambiental", "restricao_outra", "situacao", "comunicacao_de_venda"),
      semEstadual,
      "Nada consta",
    ),
    linha("debitos", "Débitos e multas", aponta("debitos"), retrato.debitos === null, "Sem débito"),
    linha("donos", "Donos anteriores", aponta("donos", "locadora"), faltou("proprietarios"), donosPorExtenso(retrato)),
    linha("chassi", "Numeração do chassi", aponta("chassi_ano"), retrato.chassi?.confereComOCadastro !== true, "Ano confere com o cadastro"),
    linha("recall", "Recall", aponta("recall"), faltou("recall"), "Sem chamado pendente"),
  ];
}

function donosPorExtenso(retrato: RetratoDaConsulta): string {
  const n = retrato.pessoas.donosNoHistorico;
  return `${n} ${n === 1 ? "dono" : "donos"} no histórico`;
}

export type NivelDaQualificacao = "nao_comprar" | "ressalvas" | "apto";

export interface Qualificacao {
  nivel: NivelDaQualificacao;
  titulo: string;
  /** Uma frase curta por motivo, do mais grave para o menos. */
  motivos: string[];
}

/**
 * O veredito da CONSULTA, para compra direta ou aceite na troca. Não é o da
 * compra: vistoria e perícia continuam valendo, e a tela diz isso.
 *
 *   nao_comprar .. há impeditivo, ou o deságio já passa do teto da curva
 *   ressalvas .... há ponto de atenção, ou algo não foi conferido
 *   apto ......... nada apontado e nada faltando
 *
 * `acimaDoTeto` vem da recomendação da curva (`recomendarAvaliacao`), e
 * `leituraAcima` de `leituraAcimaDoHodometro`: os dois dependem do km e do
 * estado que o avaliador informa na tela.
 */
export function qualificarCompra(
  retrato: RetratoDaConsulta,
  avaliacao: { acimaDoTeto?: boolean; leituraAcima?: LeituraDeKm | null } = {},
): Qualificacao {
  const impeditivos = retrato.apontamentos.filter((a) => a.gravidade === "impeditivo").map((a) => a.titulo);
  const atencoes = retrato.apontamentos.filter((a) => a.gravidade === "atencao").map((a) => a.titulo);
  const faltas = retrato.naoVeio.map((b) => `${b.titulo}: não conferido`);

  if (avaliacao.leituraAcima) {
    impeditivos.push(
      `Hodômetro abaixo de leitura anterior (${avaliacao.leituraAcima.km.toLocaleString("pt-BR")} km em ${dataPorExtenso(avaliacao.leituraAcima.data)})`,
    );
  }
  if (avaliacao.acimaDoTeto) impeditivos.push("Deságio acima do teto da curva: recusar ou encaminhar como repasse");

  if (impeditivos.length > 0) {
    return { nivel: "nao_comprar", titulo: "Não comprar como está", motivos: [...impeditivos, ...atencoes, ...faltas] };
  }
  if (atencoes.length > 0 || faltas.length > 0) {
    return { nivel: "ressalvas", titulo: "Comprar só com ressalvas", motivos: [...atencoes, ...faltas] };
  }
  return { nivel: "apto", titulo: "Sem impedimento na consulta", motivos: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// A faixa de compra ao longo da série, e para onde ela vai
// ─────────────────────────────────────────────────────────────────────────────

export interface PontoDoGrafico {
  ano: number;
  mes: number;
  fipe: number;
  /** FIPE menos o maior e o menor deságio da faixa; `null` sem faixa. */
  compraMin: number | null;
  compraMax: number | null;
  /** O ponto é projeção, e não tabela publicada. */
  projetado: boolean;
}

/** Quantos meses de série o gráfico mostra, e quantos projeta. Recorte de tela. */
export const MESES_NO_GRAFICO = 36;
export const MESES_PROJETADOS = 3;
/** A projeção repete o ritmo médio destes últimos meses. */
export const MESES_DO_RITMO = 6;

/**
 * A série do gráfico: a FIPE mês a mês, a faixa de compra que o deságio de
 * HOJE daria em cada mês, e uma projeção curta.
 *
 * A projeção é aritmética, e a tela a rotula assim: repete a variação média
 * mensal dos últimos `MESES_DO_RITMO` meses. Serve para ver quanto a tabela
 * tende a ter andado enquanto o carro espera no pátio, e não para prever o
 * mercado. Sem `MESES_DO_RITMO` meses seguidos de série, não há projeção.
 */
export function serieDoGrafico(
  historico: PontoDaFipe[],
  desagio: { min: number; max: number } | null,
): PontoDoGrafico[] {
  const serie = [...historico].sort((a, b) => a.ano - b.ano || a.mes - b.mes).slice(-MESES_NO_GRAFICO);
  if (serie.length === 0) return [];

  const ponto = (ano: number, mes: number, fipe: number, projetado: boolean): PontoDoGrafico => ({
    ano,
    mes,
    fipe,
    // O maior deságio dá o menor valor.
    compraMin: desagio ? Math.round(fipe * (1 - desagio.max / 100)) : null,
    compraMax: desagio ? Math.round(fipe * (1 - desagio.min / 100)) : null,
    projetado,
  });

  const pontos = serie.map((p) => ponto(p.ano, p.mes, p.valor, false));

  const ultimo = serie[serie.length - 1];
  const indice = (p: { ano: number; mes: number }) => p.ano * 12 + p.mes;
  const base = serie.find((p) => indice(p) === indice(ultimo) - MESES_DO_RITMO);
  if (base && base.valor > 0) {
    const taxaMensal = Math.pow(ultimo.valor / base.valor, 1 / MESES_DO_RITMO);
    let valor = ultimo.valor;
    for (let i = 1; i <= MESES_PROJETADOS; i++) {
      valor *= taxaMensal;
      const n = indice(ultimo) + i - 1;
      pontos.push(ponto(Math.floor(n / 12), (n % 12) + 1, Math.round(valor), true));
    }
  }
  return pontos;
}

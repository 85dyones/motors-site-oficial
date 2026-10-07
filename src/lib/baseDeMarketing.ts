/**
 * A base de marketing — a leitura de uma planilha de contatos, a parte pura
 * (pedido do dono em 07/10/2026).
 *
 * "Preciso ser capaz de fazer upload da lista de interessados ou migrar minha
 * base Revenda completa para o site novo, após fazer um filtro e correlacionar
 * veículos de interesse passado." E depois: "a plataforma não precisa deixar
 * de fora, podemos ter segmentações dos leads e escolher por carro ou perfil".
 *
 * POR QUE NÃO VAI PARA `leads`
 * ---------------------------------------------------------------------------
 * `leads` é a fila de trabalho do vendedor: tem kanban, alerta de lead parado,
 * funil e relatório. Sete mil contatos antigos lá dentro enterrariam os leads
 * de hoje e disparariam alerta para cada um. A base importada mora em
 * `marketing_contatos` / `marketing_interesses`, e as campanhas leem as DUAS
 * fontes. Quem responde a uma campanha e chama a loja vira lead pelo caminho
 * de sempre.
 *
 * O QUE O ARQUIVO DO REVENDAMAIS TRAZ (exportação de leads, conferida em
 * 07/10/2026 com 7.964 linhas)
 * ---------------------------------------------------------------------------
 * Uma "planilha" que é uma tabela HTML, com as colunas Id, Título, Cliente,
 * E-mail, Telefone, Tipo, Canal, Estágio, Atendente, Data criação, Ultima
 * Integração, Conversão, Motivo, Empresa, Marcador, Veículo.
 *   - `Veículo` é texto: "MODELO VERSÃO MARCA Placa: ABC1D23". Sem ano, sem
 *     preço. Mais da metade das linhas vem só com "Placa:".
 *   - Não há coluna de "comprou". Quem comprou aparece pelo TÍTULO: as linhas
 *     "[Pós-Venda] vendedor: …" trazem o carro comprado e a data; as
 *     "[Aniversário do cliente] …" dizem só que a pessoa é cliente.
 *   - A mesma pessoa aparece em várias linhas (um telefone chegou a 21).
 *
 * O ARQUIVO DE CLIENTES DO REVENDAMAIS (conferido no mesmo dia, 13.669 linhas)
 * ---------------------------------------------------------------------------
 * É o complemento: não traz veículo, mas traz `data_ultima_compra` e
 * `quantidade_veic_comprados`, que são a única fonte confiável de QUEM COMPROU
 * e QUANDO. Os dois arquivos se juntam pelo celular.
 *
 * Ele também traz CPF, RG, nome da mãe, nascimento e endereço. NADA disso é
 * lido: `lerPlanilha` só reconhece as colunas da lista `CABECALHOS`, e o que
 * não está nela nem sai do navegador de quem fez o upload.
 *
 * Planilha comum (CSV ou Excel) também entra, com cabeçalhos livres: nome,
 * telefone, e-mail, veículo, marca, modelo, placa, data, canal.
 */
import { telefoneParaSms } from "./smsCampanhas";

export { familiaDoModelo, marcaCanonica } from "./familiaDoModelo";

// ─────────────────────────────────────────────────────────────────────────────
// A planilha
// ─────────────────────────────────────────────────────────────────────────────

/** De onde veio o arquivo. Decide como o título e o marcador são lidos. */
export const ORIGENS_DE_IMPORTACAO = ["revenda_mais", "planilha"] as const;
export type OrigemDeImportacao = (typeof ORIGENS_DE_IMPORTACAO)[number];

/** O que uma linha conta sobre a pessoa. */
export const TIPOS_DE_REGISTRO = ["interesse", "compra", "cliente"] as const;
export type TipoDeRegistro = (typeof TIPOS_DE_REGISTRO)[number];

/** Uma linha da planilha, já com as colunas reconhecidas. Ainda sem juízo. */
export interface LinhaDaPlanilha {
  /** O id da linha na origem (o `Id` do RevendaMais). É o que impede a mesma linha de entrar duas vezes. */
  origemId: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  canal: string | null;
  marcador: string | null;
  titulo: string | null;
  estagio: string | null;
  /** ISO, ou `null` se a data não foi entendida. */
  ocorreuEm: string | null;
  veiculoTexto: string | null;
  marca: string | null;
  modelo: string | null;
  placa: string | null;
  /** A data da última compra, quando a planilha tem a coluna (arquivo de clientes). ISO. */
  comprouEm: string | null;
  /** Quantos carros a pessoa já comprou, quando a planilha diz. */
  compras: number | null;
}

const semAcentoMinusculo = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
/** Cabeçalho para comparar: sem acento, minúsculo, com "_" virando espaço. */
const cabecalhoNormal = (s: string) => semAcentoMinusculo(s).replace(/_/g, " ").replace(/\s+/g, " ");

/** Cabeçalho → campo. A primeira coluna que casar leva. */
const CABECALHOS: Array<[keyof LinhaDaPlanilha, RegExp]> = [
  ["origemId", /^(id|codigo|cod|clie cod)$/],
  ["titulo", /^titulo$/],
  ["nome", /^(cliente|nome|nome completo|contato)$/],
  ["email", /^e-?mail$/],
  ["telefone", /^(telefone|celular|whatsapp|fone|telefone 1|tel|telefone celular)$/],
  ["canal", /^(canal|origem|midia|fonte)$/],
  ["estagio", /^(estagio|etapa|status|situacao)$/],
  ["marcador", /^(marcador|etiqueta|tag)$/],
  ["ocorreuEm", /^(data criacao|data de criacao|data|criado em|data do contato|data cadastro|data de cadastro)$/],
  ["comprouEm", /^(data ultima compra|data da ultima compra|data da compra|data compra|comprou em)$/],
  ["compras", /^(quantidade veic comprados|quantidade de veiculos comprados|compras|veiculos comprados)$/],
  ["veiculoTexto", /^(veiculo|carro|veiculo de interesse|interesse)$/],
  ["marca", /^marca$/],
  ["modelo", /^modelo$/],
  ["placa", /^placa$/],
];

/** "31/12/2025 23:38:18", "31/12/2025" ou ISO → ISO (meio-dia de Brasília quando não há hora). */
export function dataDaPlanilha(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, d, m, a, h = "12", min = "00", s = "00"] = br;
    const data = new Date(`${a}-${m}-${d}T${h}:${min}:${s}-03:00`);
    return Number.isNaN(data.getTime()) || data.getUTCFullYear() < 2000 ? null : data.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const data = new Date(t.length === 10 ? `${t}T12:00:00-03:00` : t);
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
  }
  return null;
}

export type LeituraDaPlanilha =
  | { ok: true; origem: OrigemDeImportacao; linhas: LinhaDaPlanilha[]; colunasIgnoradas: string[] }
  | { ok: false; motivo: string };

/**
 * A tabela crua (primeira linha é o cabeçalho) → linhas reconhecidas.
 *
 * Exige só a coluna de telefone: sem ela não há para quem mandar nada. A
 * origem é "revenda_mais" quando o cabeçalho tem Título, Marcador e Veículo
 * juntos, que é a assinatura da exportação deles.
 */
export function lerPlanilha(tabela: string[][]): LeituraDaPlanilha {
  const [cabecalho, ...corpo] = tabela.filter((l) => l.some((c) => c.trim() !== ""));
  if (!cabecalho || corpo.length === 0) return { ok: false, motivo: "O arquivo está vazio ou só tem o cabeçalho." };

  const coluna = new Map<keyof LinhaDaPlanilha, number>();
  const ignoradas: string[] = [];
  cabecalho.forEach((titulo, i) => {
    const t = cabecalhoNormal(titulo);
    const achado = CABECALHOS.find(([campo, re]) => re.test(t) && !coluna.has(campo));
    if (achado) coluna.set(achado[0], i);
    else if (t !== "") ignoradas.push(titulo.trim());
  });
  if (!coluna.has("telefone")) return { ok: false, motivo: 'Não achei a coluna de telefone. O cabeçalho precisa ter "Telefone", "Celular" ou "WhatsApp".' };

  const origem: OrigemDeImportacao = coluna.has("titulo") && coluna.has("marcador") && coluna.has("veiculoTexto") ? "revenda_mais" : "planilha";
  const valor = (linha: string[], campo: keyof LinhaDaPlanilha) => {
    const i = coluna.get(campo);
    const v = i === undefined ? "" : (linha[i] ?? "").replace(/\s+/g, " ").trim();
    return v === "" ? null : v;
  };
  const linhas = corpo.map((l): LinhaDaPlanilha => ({
    origemId: valor(l, "origemId"),
    nome: valor(l, "nome"),
    email: valor(l, "email"),
    telefone: valor(l, "telefone"),
    canal: valor(l, "canal"),
    marcador: valor(l, "marcador"),
    titulo: valor(l, "titulo"),
    estagio: valor(l, "estagio"),
    ocorreuEm: dataDaPlanilha(valor(l, "ocorreuEm")),
    veiculoTexto: valor(l, "veiculoTexto"),
    marca: valor(l, "marca"),
    modelo: valor(l, "modelo"),
    placa: valor(l, "placa"),
    comprouEm: dataDaPlanilha(valor(l, "comprouEm")),
    compras: /^\d+$/.test(valor(l, "compras") ?? "") ? Number(valor(l, "compras")) : null,
  }));
  return { ok: true, origem, linhas, colunasIgnoradas: ignoradas };
}

// ─────────────────────────────────────────────────────────────────────────────
// O veículo
// ─────────────────────────────────────────────────────────────────────────────

/** Marcas de mais de uma palavra: sem isto "DISCOVERY LAND ROVER" viraria marca "ROVER". */
export const MARCAS_DE_DUAS_PALAVRAS = ["land rover", "caoa chery", "alfa romeo", "aston martin", "great wall", "rolls royce", "mini cooper", "mercedes benz"];

/**
 * As marcas que o RevendaMais escreve por extenso. Serve para consertar a
 * marca que a exportação CORTA no fim do texto: "FASTBACK IMPETUS 200 T. AUT
 * (HIBRÍDO) FI" é um Fiat, e "FI" só é começo de uma marca desta lista.
 */
export const MARCAS_CONHECIDAS = [
  "AUDI", "BMW", "BYD", "CHERY", "CHEVROLET", "CHRYSLER", "CITROEN", "DODGE", "FIAT", "FORD", "GWM", "HARLEY-DAVIDSON", "HONDA", "HYUNDAI", "IVECO", "JAC", "JAGUAR", "JEEP", "KAWASAKI", "KIA", "LEXUS",
  "MERCEDES-BENZ", "MINI", "MITSUBISHI", "NISSAN", "PEUGEOT", "PORSCHE", "RAM", "RENAULT", "SMART", "SSANGYONG", "SUBARU", "SUZUKI", "TOYOTA", "TROLLER", "VOLKSWAGEN", "VOLVO", "YAMAHA",
];

/** A marca inteira quando o texto é o começo de UMA marca conhecida; senão, o próprio texto. */
function marcaPorExtenso(marca: string): string {
  const m = marca.toUpperCase();
  if (MARCAS_CONHECIDAS.includes(m) || m.length < 2) return marca;
  const candidatas = MARCAS_CONHECIDAS.filter((c) => c.startsWith(m));
  return candidatas.length === 1 ? candidatas[0] : marca;
}

export interface VeiculoDaPlanilha {
  marca: string | null;
  /** Modelo e versão, como vieram ("TIGUAN ALLSPACE R-LINE 350 TSI 2.0 4X4"). */
  modelo: string | null;
  /** Só letras e dígitos, maiúscula. `null` quando não veio ou não tem forma de placa. */
  placa: string | null;
}

const placaLimpa = (texto: string | null | undefined) => {
  const p = (texto ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) ? p : null;
};

/**
 * O veículo de uma linha.
 *
 * No RevendaMais vem num texto só, com a MARCA NO FIM e a placa depois:
 * "TIGUAN ALLSPACE R-LINE 350 TSI 2.0 4X4 VOLKSWAGEN Placa: BCU4A07". Em
 * planilha comum, marca, modelo e placa podem vir em colunas próprias, e elas
 * mandam. `null` em tudo quando a linha não fala de carro.
 */
export function veiculoDaLinha(linha: Pick<LinhaDaPlanilha, "veiculoTexto" | "marca" | "modelo" | "placa">, origem: OrigemDeImportacao): VeiculoDaPlanilha {
  const m = (linha.veiculoTexto ?? "").match(/^(.*?)\s*Placa:\s*(\S*)\s*$/i);
  const descricao = (m ? m[1] : (linha.veiculoTexto ?? "")).trim();
  const placa = placaLimpa(linha.placa) ?? placaLimpa(m?.[2]);
  if (linha.marca || linha.modelo) return { marca: linha.marca, modelo: linha.modelo ?? (descricao || null), placa };
  if (descricao === "") return { marca: null, modelo: null, placa };

  const palavras = descricao.split(" ");
  if (origem !== "revenda_mais" || palavras.length < 2) return { marca: null, modelo: descricao, placa };
  const duas = palavras.slice(-2).join(" ");
  const corte = MARCAS_DE_DUAS_PALAVRAS.includes(duas.toLowerCase()) && palavras.length > 2 ? 2 : 1;
  return { marca: marcaPorExtenso(palavras.slice(-corte).join(" ")), modelo: palavras.slice(0, -corte).join(" "), placa };
}

// ─────────────────────────────────────────────────────────────────────────────
// O que a linha diz da pessoa
// ─────────────────────────────────────────────────────────────────────────────

/** Marcadores do RevendaMais que dizem "não procurem mais esta pessoa". */
export const MARCADORES_SEM_INTERESSE = ["nao tem interesse", "perda concorrencia", "comprou em outro lugar", "nao perturbe"];
/** Marcadores que dizem "já é cliente". */
export const MARCADORES_DE_CLIENTE = ["cliente nosso!", "cliente nosso", "pos venda"];

/**
 * O tipo do registro.
 *   compra ...... "[Pós-Venda] …" — traz o carro comprado e a data
 *   cliente ..... "[Aniversário do cliente] …", estágio GANHO ou marcador de cliente — é cliente, sem dizer de quê
 *   interesse ... todo o resto
 */
export function tipoDoRegistro(linha: Pick<LinhaDaPlanilha, "titulo" | "estagio" | "marcador">): TipoDeRegistro {
  const titulo = semAcentoMinusculo(linha.titulo ?? "");
  if (/^\[pos-?venda\]/.test(titulo)) return "compra";
  if (/^\[aniversario do cliente\]/.test(titulo)) return "cliente";
  if (semAcentoMinusculo(linha.estagio ?? "") === "ganho") return "cliente";
  if (MARCADORES_DE_CLIENTE.includes(semAcentoMinusculo(linha.marcador ?? ""))) return "cliente";
  return "interesse";
}

export const ehSemInteresse = (marcador: string | null | undefined) => MARCADORES_SEM_INTERESSE.includes(semAcentoMinusculo(marcador ?? ""));

// ─────────────────────────────────────────────────────────────────────────────
// Por pessoa
// ─────────────────────────────────────────────────────────────────────────────

/** Um registro de uma pessoa: um carro que ela olhou, ou o carro que comprou. */
export interface RegistroImportado {
  origemId: string | null;
  tipo: "interesse" | "compra";
  marca: string | null;
  modelo: string | null;
  placa: string | null;
  canal: string | null;
  marcador: string | null;
  /** ISO. Sem data na linha, a hora da importação entra no servidor. */
  ocorreuEm: string | null;
}

/** Uma pessoa, como vai para o servidor. O telefone é a identidade. */
export interface ContatoImportado {
  telefone: string;
  nome: string | null;
  email: string | null;
  cliente: boolean;
  /** A data da compra mais recente, quando a planilha diz. É o que um upsell futuro vai usar. */
  comprouEm: string | null;
  semInteresse: boolean;
  canais: string[];
  /**
   * A data mais antiga e a mais nova entre as linhas da pessoa (cadastro,
   * contato, compra). É o que o filtro de período usa em campanha por perfil;
   * `null` quando a planilha não tem data nenhuma para ela.
   */
  primeiroContatoEm: string | null;
  ultimoContatoEm: string | null;
  registros: RegistroImportado[];
}

export interface ResumoDaPlanilha {
  linhas: number;
  /** Linhas sem celular válido (vazio, fixo, número torto). */
  semCelular: number;
  pessoas: number;
  clientes: number;
  comDataDeCompra: number;
  semInteresse: number;
  /** Não clientes, por terem ou não um carro identificado. */
  interessadosComCarro: number;
  interessadosSemCarro: number;
  registrosComCarro: number;
  de: string | null;
  ate: string | null;
  /** Os canais, do mais comum para o menos. */
  canais: Array<{ canal: string; pessoas: number }>;
  marcas: Array<{ marca: string; pessoas: number }>;
}

const nomeUtil = (nome: string | null) => (nome && /\p{L}{2}/u.test(nome) ? nome : null);

/**
 * As linhas viram pessoas: uma por celular, com todos os registros dela.
 *
 * Linha sem celular válido fica de fora (não há como falar com ela por SMS, e
 * o telefone é a chave). Linha de aniversário marca a pessoa como cliente e
 * não vira registro. Interesse sem carro NÃO é descartado: a pessoa entra, e
 * serve às campanhas por perfil.
 */
export function agruparPorPessoa(linhas: LinhaDaPlanilha[], origem: OrigemDeImportacao): { contatos: ContatoImportado[]; resumo: ResumoDaPlanilha } {
  const porTelefone = new Map<string, ContatoImportado>();
  let semCelular = 0;
  let registrosComCarro = 0;
  let de: string | null = null;
  let ate: string | null = null;

  for (const linha of linhas) {
    const telefone = telefoneParaSms(linha.telefone);
    if (!telefone) {
      semCelular++;
      continue;
    }
    let c = porTelefone.get(telefone);
    if (!c) {
      c = { telefone, nome: null, email: null, cliente: false, comprouEm: null, semInteresse: false, canais: [], primeiroContatoEm: null, ultimoContatoEm: null, registros: [] };
      porTelefone.set(telefone, c);
    }
    c.nome ??= nomeUtil(linha.nome);
    c.email ??= linha.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linha.email) ? linha.email.toLowerCase() : null;
    if (linha.canal && !c.canais.includes(linha.canal)) c.canais.push(linha.canal);
    if (ehSemInteresse(linha.marcador)) c.semInteresse = true;
    if (linha.ocorreuEm) {
      if (!c.primeiroContatoEm || linha.ocorreuEm < c.primeiroContatoEm) c.primeiroContatoEm = linha.ocorreuEm;
      if (!c.ultimoContatoEm || linha.ocorreuEm > c.ultimoContatoEm) c.ultimoContatoEm = linha.ocorreuEm;
      if (!de || linha.ocorreuEm < de) de = linha.ocorreuEm;
      if (!ate || linha.ocorreuEm > ate) ate = linha.ocorreuEm;
    }

    // O arquivo de clientes diz a compra em colunas próprias, sem carro: marca a pessoa e segue.
    if (linha.comprouEm || (linha.compras ?? 0) > 0) {
      c.cliente = true;
      if (linha.comprouEm && (!c.comprouEm || linha.comprouEm > c.comprouEm)) c.comprouEm = linha.comprouEm;
    }
    const tipo = tipoDoRegistro(linha);
    if (tipo !== "interesse") c.cliente = true;
    if (tipo === "cliente") continue;
    const veiculo = veiculoDaLinha(linha, origem);
    if (tipo === "compra" && linha.ocorreuEm && (!c.comprouEm || linha.ocorreuEm > c.comprouEm)) c.comprouEm = linha.ocorreuEm;
    // Linha que não fala de carro nem veio de um canal não é um registro: é só o cadastro da pessoa.
    if (!veiculo.modelo && !veiculo.marca && tipo === "interesse" && !linha.canal && !linha.titulo) continue;
    if (veiculo.modelo || veiculo.marca) registrosComCarro++;
    c.registros.push({ origemId: linha.origemId, tipo, marca: veiculo.marca, modelo: veiculo.modelo, placa: veiculo.placa, canal: linha.canal, marcador: linha.marcador, ocorreuEm: linha.ocorreuEm });
  }

  const contatos = [...porTelefone.values()];
  const temCarro = (c: ContatoImportado) => c.registros.some((r) => r.tipo === "interesse" && (r.modelo || r.marca));
  const contar = (chaves: (c: ContatoImportado) => string[]) => {
    const n = new Map<string, number>();
    for (const c of contatos) for (const k of new Set(chaves(c))) n.set(k, (n.get(k) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  return {
    contatos,
    resumo: {
      linhas: linhas.length,
      semCelular,
      pessoas: contatos.length,
      clientes: contatos.filter((c) => c.cliente).length,
      comDataDeCompra: contatos.filter((c) => c.comprouEm).length,
      semInteresse: contatos.filter((c) => c.semInteresse).length,
      interessadosComCarro: contatos.filter((c) => !c.cliente && temCarro(c)).length,
      interessadosSemCarro: contatos.filter((c) => !c.cliente && !temCarro(c)).length,
      registrosComCarro,
      de,
      ate,
      canais: contar((c) => c.canais).map(([canal, pessoas]) => ({ canal, pessoas })),
      marcas: contar((c) => c.registros.flatMap((r) => (r.marca ? [r.marca.toUpperCase()] : []))).slice(0, 15).map(([marca, pessoas]) => ({ marca, pessoas })),
    },
  };
}

/** Quantas pessoas vão em cada chamada de importação. Cabe folgado no limite de corpo da rota. */
export const CONTATOS_POR_LOTE = 400;

/** O que o servidor aceita de UM contato: recusa o que não tem forma, corta o que é comprido demais. */
export function lerContatoImportado(bruto: unknown): ContatoImportado | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const telefone = telefoneParaSms(typeof b.telefone === "string" ? b.telefone : null);
  if (!telefone) return null;
  const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
  const data = (v: unknown) => (typeof v === "string" && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null);
  const registros = (Array.isArray(b.registros) ? b.registros : []).slice(0, 60).flatMap((r): RegistroImportado[] => {
    if (!r || typeof r !== "object") return [];
    const x = r as Record<string, unknown>;
    return [
      {
        origemId: texto(x.origemId, 40),
        tipo: x.tipo === "compra" ? "compra" : "interesse",
        marca: texto(x.marca, 40),
        modelo: texto(x.modelo, 120),
        placa: placaLimpa(typeof x.placa === "string" ? x.placa : null),
        canal: texto(x.canal, 60),
        marcador: texto(x.marcador, 60),
        ocorreuEm: data(x.ocorreuEm),
      },
    ];
  });
  return {
    telefone,
    nome: nomeUtil(texto(b.nome, 120)),
    email: texto(b.email, 160),
    cliente: b.cliente === true || registros.some((r) => r.tipo === "compra"),
    comprouEm: data(b.comprouEm),
    semInteresse: b.semInteresse === true,
    canais: (Array.isArray(b.canais) ? b.canais : []).flatMap((c) => texto(c, 60) ?? []).slice(0, 20),
    primeiroContatoEm: data(b.primeiroContatoEm),
    ultimoContatoEm: data(b.ultimoContatoEm),
    registros,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O que a tela da base mostra
// ─────────────────────────────────────────────────────────────────────────────

/** A base como está no banco. Só contagem: nenhuma pessoa. */
export interface ResumoDaBase {
  pessoas: number;
  clientes: number;
  comDataDeCompra: number;
  semInteresse: number;
  interessadosComCarro: number;
  interessadosSemCarro: number;
  canais: Array<{ canal: string; pessoas: number }>;
  marcas: Array<{ marca: string; pessoas: number }>;
}

export interface ImportacaoNaLista {
  id: string;
  origem: OrigemDeImportacao;
  arquivo: string | null;
  linhas: number;
  contatosNovos: number;
  contatosAtualizados: number;
  registrosNovos: number;
  criadoEm: string;
  criadoPorNome: string | null;
}

/** O que cada lote devolve. A tela soma. */
export interface RespostaDoLoteDeImportacao {
  contatosNovos: number;
  contatosAtualizados: number;
  registrosNovos: number;
  /** Contatos do lote que o servidor recusou (sem celular válido depois de conferir de novo). */
  recusados: number;
}

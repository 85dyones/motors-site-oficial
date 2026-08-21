/**
 * Leitor de extrato bancário OFX — a fonte da conciliação (P4 do briefing).
 *
 * "Outra coisa que faço por lá é a conciliação bancária" — adm/financeira,
 * 2026-08-21. É o último dos seis pedidos dela que ainda vivia fora do painel.
 *
 * ---------------------------------------------------------------------------
 * Por que OFX, e não Open Finance
 * ---------------------------------------------------------------------------
 * Decisão de 2026-08-21. OFX é um arquivo que o banco já entrega hoje, de
 * graça, pelo próprio internet banking — sem contrato, sem certificação, sem
 * fornecedor. Open Finance dá extrato ao vivo, mas custa contrato e prazo, e
 * é decisão de negócio que pode acontecer depois. O motor de correspondência
 * (`lib/conciliacao.ts`) não sabe de onde veio a linha: trocar a FONTE um dia
 * não joga fora o que se constrói agora.
 *
 * ---------------------------------------------------------------------------
 * O que este parser é, e o que ele não é
 * ---------------------------------------------------------------------------
 * OFX 1.x é SGML — tags que abrem e frequentemente não fecham, com um
 * cabeçalho `chave:valor` antes. OFX 2.x é XML de verdade. Bancos brasileiros
 * emitem 1.0.2 na esmagadora maioria. Em vez de um parser SGML completo, este
 * arquivo extrai o que a conciliação usa, do bloco que importa (`STMTTRN`), e
 * ignora o resto do documento.
 *
 * Isso é deliberado: um parser genérico de SGML seria muito mais código para
 * cobrir campos que ninguém lê. O preço é que um arquivo exótico pode não ser
 * entendido — e por isso `lerOfx` NUNCA devolve lista vazia em silêncio:
 * arquivo que não parece OFX levanta erro com o motivo, para a tela dizer
 * "não consegui ler este arquivo" em vez de "seu extrato está vazio".
 */

export interface LancamentoDoExtrato {
  /**
   * `FITID` — o identificador que o BANCO dá à transação. É a chave de
   * idempotência da importação: reimportar o mesmo extrato (ou um extrato que
   * se sobrepõe ao anterior, o caso comum de quem baixa "últimos 30 dias" toda
   * semana) não pode duplicar linha nenhuma.
   */
  fitid: string;
  /** `YYYY-MM-DD`, já no fuso da loja — ver `dataDePosted`. */
  data: string;
  /**
   * Sempre POSITIVO. O lado mora em `tipo`, como em todo o resto do módulo
   * (`movimentacoes`, aportes de investidor, contadores de `conta_vencida`).
   */
  valor: number;
  tipo: "entrada" | "saida";
  /** `MEMO` ou `NAME` — o texto que o banco imprime no extrato. */
  descricao: string;
}

export interface ExtratoOfx {
  /** `BANKID`/`ACCTID` quando o arquivo declara — identifica a conta bancária. */
  banco: string | null;
  conta: string | null;
  lancamentos: LancamentoDoExtrato[];
}

/** Erro de leitura com motivo legível — a tela mostra isto ao usuário. */
export class ErroDeOfx extends Error {}

/**
 * `DTPOSTED` vem como `YYYYMMDD` ou `YYYYMMDDHHMMSS[.xxx][fuso]`.
 *
 * Só os oito primeiros dígitos são lidos, de propósito: a hora do banco não
 * interessa à conciliação (que trabalha por dia), e interpretá-la traria de
 * volta o problema de fuso que o módulo inteiro evita comparando texto
 * `YYYY-MM-DD`. Ver `financeiroDia.dataDeHoje`.
 */
export function dataDePosted(bruto: string): string | null {
  const m = /^\s*(\d{4})(\d{2})(\d{2})/.exec(bruto);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  if (+mes < 1 || +mes > 12 || +dia < 1 || +dia > 31) return null;
  return `${ano}-${mes}-${dia}`;
}

/**
 * `TRNAMT` para número. O OFX usa ponto decimal, mas há emissor brasileiro que
 * manda vírgula — aceitar os dois custa uma linha e evita um extrato inteiro
 * virar zero.
 */
export function valorDeTrnamt(bruto: string): number | null {
  const limpo = bruto.trim().replace(",", ".");
  if (!/^[-+]?\d+(\.\d+)?$/.test(limpo)) return null;
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Lê o valor de uma tag simples dentro de um trecho (SGML ou XML). */
function tag(trecho: string, nome: string): string | null {
  // SGML: `<MEMO>texto` até a próxima tag ou fim de linha.
  // XML:  `<MEMO>texto</MEMO>` — o mesmo padrão casa, e o `</MEMO>` fica de
  // fora porque `[^<]*` para no `<`.
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i").exec(trecho);
  return m ? m[1].trim() : null;
}

/**
 * Desfaz as entidades que aparecem em OFX — as cinco do XML e as numéricas.
 * Sem isto, `MERC&AMP;PAGO` chega na tela como está.
 */
function desescapar(texto: string): string {
  return texto
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // `&amp;` por último: desfazer antes recriaria entidades a partir de
    // `&amp;lt;`.
    .replace(/&amp;/gi, "&");
}

/**
 * Lê um extrato OFX.
 *
 * Levanta `ErroDeOfx` quando o conteúdo não parece OFX, ou quando parece mas
 * não tem transação nenhuma — os dois casos precisam de mensagens diferentes
 * na tela, e nenhum deles pode ser confundido com "extrato sem movimento".
 */
export function lerOfx(conteudo: string): ExtratoOfx {
  if (!conteudo || !/<STMTTRN>/i.test(conteudo)) {
    // A checagem é pelo bloco de transação, não pela palavra "OFX": arquivo
    // truncado no meio do download tem cabeçalho e não tem conteúdo.
    if (!/OFXHEADER|<OFX>/i.test(conteudo ?? "")) {
      throw new ErroDeOfx(
        "Este arquivo não parece um extrato OFX. Baixe o extrato do internet banking no formato OFX (também chamado de Money ou Dinheiro Fácil).",
      );
    }
    throw new ErroDeOfx(
      "O arquivo é OFX mas não traz nenhuma transação. Confira o período selecionado no internet banking.",
    );
  }

  const banco = tag(conteudo, "BANKID");
  const conta = tag(conteudo, "ACCTID");

  const lancamentos: LancamentoDoExtrato[] = [];
  const ignorados: string[] = [];

  // Cada `<STMTTRN>` até o próximo `<STMTTRN>` ou o fim — funciona no SGML
  // (onde `</STMTTRN>` pode faltar) e no XML.
  const blocos = conteudo.split(/<STMTTRN>/i).slice(1);

  for (const bloco of blocos) {
    const trecho = bloco.split(/<\/STMTTRN>/i)[0];

    const posted = tag(trecho, "DTPOSTED");
    const trnamt = tag(trecho, "TRNAMT");
    const fitid = tag(trecho, "FITID");

    const data = posted ? dataDePosted(posted) : null;
    const valorBruto = trnamt ? valorDeTrnamt(trnamt) : null;

    // Linha sem data, sem valor ou sem FITID não é conciliável: sem FITID não
    // há como impedir duplicata na reimportação, e é melhor deixar de fora com
    // aviso do que importar algo que vai duplicar depois.
    if (!data || valorBruto === null || !fitid) {
      ignorados.push(fitid ?? posted ?? "(linha sem identificação)");
      continue;
    }

    // Valor zero não é movimento de dinheiro — alguns bancos emitem para
    // marcar evento (saldo, aviso). Fora da conciliação.
    if (valorBruto === 0) continue;

    const descricao =
      desescapar(tag(trecho, "MEMO") ?? tag(trecho, "NAME") ?? "").trim() ||
      "(sem descrição no extrato)";

    lancamentos.push({
      fitid,
      data,
      valor: Math.abs(Math.round(valorBruto * 100)) / 100,
      // O sinal do OFX é a única fonte do lado: `TRNTYPE` mente com frequência
      // (banco que manda DEBIT com valor positivo existe), o sinal não.
      tipo: valorBruto < 0 ? "saida" : "entrada",
      descricao,
    });
  }

  if (lancamentos.length === 0) {
    throw new ErroDeOfx(
      ignorados.length > 0
        ? `Nenhuma transação legível: ${ignorados.length} linha(s) vieram sem data, valor ou identificador do banco (FITID).`
        : "O arquivo é OFX mas não traz nenhuma transação com valor.",
    );
  }

  return { banco, conta, lancamentos };
}

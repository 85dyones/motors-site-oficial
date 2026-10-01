/**
 * Dinheiro digitado no costume brasileiro — e só ele.
 *
 * ---------------------------------------------------------------------------
 * Por que existe (01/10/2026)
 * ---------------------------------------------------------------------------
 * Os campos de dinheiro do editor eram `<input type="number">` com
 * `Number(e.target.value)`. Medido no navegador embutido (Chrome 152, pt-BR),
 * num campo idêntico: "75.154,40" perde a vírgula — o Chrome a descarta por
 * ser o segundo separador — e chega como "75.15440", que `Number` lê 75,1544;
 * "113.000" chega como "113.000", que `Number` lê 113. Foi assim que o Captur
 * 8506096 e o City 8517481 ganharam custo de R$ 75 e R$ 113, e o piso de custo
 * ficou desarmado nos dois.
 *
 * O campo numérico destrói a informação ANTES do `onChange`, então nenhuma
 * leitura conserta isso depois. O campo de dinheiro passa a ser texto
 * (`inputMode="decimal"`, para o teclado do celular continuar numérico), e o
 * texto é lido aqui.
 *
 * ---------------------------------------------------------------------------
 * A régua: não adivinhar
 * ---------------------------------------------------------------------------
 * Aceita só as formas em que o valor é um só:
 *
 *   - `75154`        inteiro
 *   - `75154,40`     vírgula decimal, uma ou duas casas
 *   - `75.154,40`    ponto de milhar em grupos de três, centavos opcionais
 *   - `75.154`       idem, sem centavos — e por isso `113.000` é 113 mil
 *   - `118900.50`    ponto decimal com uma ou duas casas — o que vem de
 *                    planilha e de API, e que `cadastro-nativo.test.ts` exige
 *                    desde a revisão de 29/08 (o bug de 100x)
 *
 * O resto é RECUSADO com a forma certa na mensagem: `75.15440`, `75,154`
 * (três casas depois da vírgula não é centavo, é milhar digitado com vírgula),
 * `1,234.56`. Adivinhar é o que gravou 75,15 num carro de 92.900.
 *
 * `numeroOuNulo` (em `cadastroDeVeiculo.ts`) continua sendo a leitura de ano,
 * quilometragem e donos; esta é só para reais.
 */

export interface LeituraEmReais {
  /** `null` quando vazio OU quando não deu para ler — `erro` distingue. */
  valor: number | null;
  /** O que mostrar a quem digitou; `null` quando leu (ou quando estava vazio). */
  erro: string | null;
}

const FORMAS_ACEITAS: Array<{ forma: RegExp; ptBR: boolean }> = [
  { forma: /^\d+$/, ptBR: false },
  { forma: /^\d+,\d{1,2}$/, ptBR: true },
  { forma: /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/, ptBR: true },
  { forma: /^\d+\.\d{1,2}$/, ptBR: false },
];

const comoEscrever = "Escreva como na nota: 75.154,40 ou 75154,40.";

export function lerReais(digitado: unknown): LeituraEmReais {
  if (digitado === null || digitado === undefined) return { valor: null, erro: null };
  if (typeof digitado === "number") {
    return Number.isFinite(digitado)
      ? { valor: digitado, erro: null }
      : { valor: null, erro: `Valor em reais inválido. ${comoEscrever}` };
  }

  const original = String(digitado);
  // "R$" e espaço de qualquer tipo — inclusive o U+00A0 que `toLocaleString`
  // põe entre o símbolo e o número, para colar de uma tela formatada funcionar.
  const texto = original.replace(/R\$/gi, "").replace(/\s/g, "");
  if (texto === "") return { valor: null, erro: null };

  const casou = FORMAS_ACEITAS.find((f) => f.forma.test(texto));
  if (!casou) {
    return { valor: null, erro: `Não entendi "${original.trim()}". ${comoEscrever}` };
  }
  const canonico = casou.ptBR ? texto.replace(/\./g, "").replace(",", ".") : texto;
  return { valor: Number(canonico), erro: null };
}

/** A leitura sem a mensagem: o valor, ou `null` (vazio ou ilegível). */
export function reaisOuNulo(digitado: unknown): number | null {
  return lerReais(digitado).valor;
}

/**
 * O valor do banco como ele aparece no campo — `75.154,40`, `113.000`.
 *
 * Aceita texto porque o PostgREST devolve `numeric` como string ("65900.00").
 * Centavos só aparecem quando existem, e o que sai daqui `lerReais` lê de
 * volta como o mesmo número.
 */
export function reaisParaCampo(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  const temCentavos = Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: temCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

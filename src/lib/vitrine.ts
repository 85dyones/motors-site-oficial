import type { Veiculo } from "../types";
import { nomeComAno } from "./nomeDoVeiculo";
import { getVeiculoPdpUrl } from "./supabase";

/**
 * As duas decisões da vitrine que não podiam ficar só na marcação.
 *
 * Ambas são regra de projeto, não estilo — e as duas já foram quebradas por
 * uma edição de JSX que parecia inofensiva. Estão aqui porque função pura se
 * testa por comportamento; `grep` na marcação passa mesmo depois de a regra
 * virar o contrário dela.
 *
 * ---------------------------------------------------------------------------
 * 1. Toda ficha à venda precisa de um `<a>` no HTML servido
 * ---------------------------------------------------------------------------
 * `/estoque` renderiza a grade dentro de um `<Suspense>`, e o fallback mostra
 * a primeira leva — 9 cards. Medido contra a produção em 2026-09-04: o HTML
 * servido trazia **9** links de ficha e **36** URLs no `ItemList` (34 carros e
 * 2 motos; contar só `/carros/` foi o que me fez escrever 34 aqui). As outras
 * 27 existiam só no JSON-LD.
 *
 * `ItemList` informa, mas não é link de navegação: não passa autoridade e não
 * dá caminho a quem lê a página sem executar JavaScript. Na prática a regra 6
 * do projeto — "vitrine ordena, nunca esconde" — valia para quem roda JS e não
 * valia para o resto.
 *
 * `indiceDaVitrine` é a lista que o servidor publica como link de verdade.
 * Cobre o estoque disponível INTEIRO de propósito: recortá-la é exatamente o
 * defeito que ela existe para impedir, e é o que o teste vigia.
 *
 * ---------------------------------------------------------------------------
 * 2. Recolher no mobile não pode recolher no desktop
 * ---------------------------------------------------------------------------
 * O `<aside>` dos filtros vem ANTES da grade num `flex flex-col lg:flex-row`:
 * no desktop vira a coluna da esquerda, no celular vira um bloco inteiro
 * empilhado em cima do primeiro carro. O pedido do dono em 2026-09-04 foi o
 * estoque aparecendo de cara no celular, com os filtros atrás de um botão.
 *
 * A tentação é remover o `<aside>` da árvore quando está recolhido. Não dá:
 * decidir isso exige medir a janela no cliente, o que dá divergência de
 * hidratação e um piscar de campos na primeira pintura — a mesma armadilha
 * que `BuscaRegua.tsx` documenta no `soDesktop`. Some por CSS, e o estado dos
 * filtros marcados sobrevive ao recolher.
 *
 * `painelDeFiltro` guarda o par que não pode se separar: esconder no mobile e
 * continuar visível no desktop.
 */

/** Uma ficha no índice servido: o link e o texto que o rastreador lê. */
export interface FichaNoIndice {
  id: string;
  /** Caminho da ficha, o mesmo que a grade e o `ItemList` usam. */
  href: string;
  /** O nome sem a versão repetida — `nomeComAno`, a fonte única do projeto. */
  rotulo: string;
}

/**
 * O índice de fichas que o HTML de `/estoque` precisa publicar.
 *
 * Um item por veículo disponível, na ordem em que a vitrine os recebe. Estoque
 * vazio devolve lista vazia — o bloco de navegação some junto, porque
 * cabeçalho seguido de nada é ruído para quem lê e landmark vazio para quem
 * usa leitor de tela.
 */
export function indiceDaVitrine(disponiveis: Veiculo[]): FichaNoIndice[] {
  return disponiveis.map((veiculo) => ({
    id: String(veiculo.id),
    href: getVeiculoPdpUrl(veiculo),
    rotulo: nomeComAno(veiculo),
  }));
}

/**
 * Onde um controle existe só abaixo do `lg`.
 *
 * Um nome só para os cinco lugares que recolhem no celular e não no desktop —
 * os três do `Catalogo`, e a âncora "VER TODO O ESTOQUE" que o fallback do
 * `<Suspense>` serve em `/estoque`. Escrito à mão, cada um vira um `lg:hidden`
 * solto esperando virar `hidden`; e o que sobra solto é o convite para o
 * próximo. A quinta ocorrência foi achada na revisão de 2026-09-04, depois de
 * eu já ter fechado as outras quatro.
 */
export const SO_NO_CELULAR = "lg:hidden";

/** Como o painel de filtro se apresenta agora. */
export interface PainelDeFiltro {
  /** Classes de visibilidade do `<aside>`. */
  classe: string;
  /** Classes de visibilidade do botão que alterna o painel. */
  classeDoBotao: string;
  /** O que o botão diz. */
  rotulo: string;
}

/**
 * A visibilidade do painel de filtro, dado o que o cliente escolheu.
 *
 * `lg:block` aparece nos DOIS estados de propósito: no desktop o filtro é a
 * coluna da esquerda e não recolhe nunca.
 *
 * `classeDoBotao` mora aqui, e não solto na marcação, porque na revisão de
 * 2026-09-04 ficou claro que isto é um TRIO, não um par: a classe do `<aside>`,
 * o rótulo, e a visibilidade do botão. Com o botão fora da função, trocar o
 * `lg:hidden` dele por `hidden` deixava o painel recolhido no celular e **sem
 * nenhuma forma de abrir** — beco sem saída funcional, suíte inteira verde.
 * Junto, o par "esconde o painel / mostra o botão" tem teste dos dois lados.
 */
export function painelDeFiltro(aberto: boolean): PainelDeFiltro {
  return {
    classe: aberto ? "lg:block" : "hidden lg:block",
    classeDoBotao: SO_NO_CELULAR,
    rotulo: aberto ? "FECHAR FILTROS" : "FILTROS",
  };
}

/** A partir de quantos filtros ativos o atalho de limpar tudo compensa. */
export const FILTROS_PARA_LIMPAR_TUDO = 2;

/**
 * Se o atalho "LIMPAR TUDO" da régua de chips aparece.
 *
 * Ele existe porque o "LIMPAR (N)" do topo do painel nasce escondido no
 * celular junto com o painel. Logo: só quando o painel está FECHADO — com ele
 * aberto os dois apareceriam na mesma tela, que foi o defeito que a revisão de
 * 04/09 apontou no comentário ("só onde some" não era verdade).
 *
 * E a partir de dois filtros: com um só, remover o chip custa o mesmo toque.
 */
export function mostrarLimparTudo(filtrosAtivos: number, painelAberto: boolean): boolean {
  return !painelAberto && filtrosAtivos >= FILTROS_PARA_LIMPAR_TUDO;
}

/**
 * Se `/estoque` tem índice de fichas para publicar.
 *
 * A página precisa saber disso para decidir se serve a âncora do fallback, e
 * `IndiceDaVitrine` para decidir se renderiza. Antes cada um derivava o próprio
 * predicado, e eles só concordavam porque `indiceDaVitrine` é 1:1 com o pátio:
 * bastaria ela passar a filtrar para a âncora morta voltar sem teste nenhum
 * ver. Uma pergunta, uma resposta.
 */
export function vitrineTemFichas(disponiveis: Veiculo[]): boolean {
  return indiceDaVitrine(disponiveis).length > 0;
}

/**
 * ---------------------------------------------------------------------------
 * 3. Buscar por digitação, sem deixar documento vazar pela busca
 * ---------------------------------------------------------------------------
 * Pedido do dono em 2026-09-04, no mesmo lote do filtro recolhido: um campo
 * para digitar modelo e característica, em vez de caçar a caixa certa numa
 * coluna de cinco grupos.
 *
 * A implementação óbvia — varrer o objeto inteiro do veículo — é a errada, e
 * de um jeito que nenhum teste de comportamento pegaria: `Veiculo` tem
 * `placa`, e um dia terá mais campo operacional. Buscar em cima do objeto
 * transformaria a vitrine num oráculo de placa: digita, e a ficha que aparece
 * CONFIRMA que aquela placa é daquele carro. Não precisa exibir o dado para
 * vazá-lo — basta responder sobre ele.
 *
 * Por isso a busca lê uma LISTA BRANCA de campos, nunca o objeto. Campo novo
 * no tipo não entra sozinho; alguém precisa escrever o nome dele aqui, e o
 * teste vigia os dois lados.
 *
 * O mapper público de `supabase.ts` também não devolve `placa` — mas as duas
 * defesas existem porque protegem coisas diferentes: lá é o que trafega para o
 * cliente, aqui é o que a vitrine aceita responder.
 */

/** Os campos que a busca lê. Público, e escolhido um a um. */
export const CAMPOS_DA_BUSCA = [
  "marca",
  "modelo",
  "versao",
  "ano",
  "cor",
  "cambio",
  "combustivel",
  "tipo",
  "motor",
  "opcionais",
] as const;

/**
 * Os campos que a busca NUNCA lê, ainda que estejam no objeto.
 *
 * Documento do veículo é dado operacional do painel — a mesma regra que tira
 * `placa` do mapper público. Está escrito aqui, e não só ausente da lista de
 * cima, para o teste poder afirmar a proibição em vez de só constatar a
 * omissão: lista que não se afirma é lista que cresce sem revisão.
 */
export const CAMPOS_FORA_DA_BUSCA = ["placa", "renavam", "chassi", "preco_compra"] as const;

/** Minúscula e sem acento — quem digita "cambio" acha "Câmbio". */
export function normalizarParaBusca(texto: string): string {
  return (texto ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Os termos de uma busca.
 *
 * Espaço separa termos e TODOS precisam casar, em qualquer campo e em qualquer
 * ordem: "onix automatico" acha o Onix de câmbio automático, e "automatico
 * onix" acha o mesmo carro. Busca vazia devolve lista vazia, que é o sinal de
 * "não filtra nada" — e não de "não casa nada".
 */
export function termosDaBusca(termo: string): string[] {
  return normalizarParaBusca(termo).split(/\s+/).filter(Boolean);
}

/**
 * Como cada campo da lista branca é lido.
 *
 * Um mapa tipado, e não `veiculo[campo]` com um cast: assim acrescentar um
 * nome a `CAMPOS_DA_BUSCA` **não compila** enquanto ninguém escrever o leitor
 * dele aqui. A lista branca deixa de depender de disciplina e passa a depender
 * do compilador — que é a diferença entre uma regra e um comentário.
 */
const LEITORES: Record<(typeof CAMPOS_DA_BUSCA)[number], (v: Veiculo) => string> = {
  marca: (v) => v.marca ?? "",
  modelo: (v) => v.modelo ?? "",
  versao: (v) => v.versao ?? "",
  ano: (v) => String(v.ano ?? ""),
  cor: (v) => v.cor ?? "",
  cambio: (v) => v.cambio ?? "",
  combustivel: (v) => v.combustivel ?? "",
  tipo: (v) => v.tipo ?? "",
  motor: (v) => v.motor ?? "",
  opcionais: (v) => v.opcionais ?? "",
};

/** O texto de um veículo, montado só a partir de `CAMPOS_DA_BUSCA`. */
export function textoBuscavel(veiculo: Veiculo): string {
  return normalizarParaBusca(
    CAMPOS_DA_BUSCA.map((campo) => LEITORES[campo](veiculo))
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Se um veículo casa com o que foi digitado.
 *
 * Sem termo, casa — a busca vazia não é um filtro que reprova todo mundo, e
 * essa inversão é o defeito clássico deste tipo de campo: a vitrine amanhece
 * vazia porque alguém tratou "" como um termo.
 */
export function casaComABusca(veiculo: Veiculo, termos: string[]): boolean {
  if (termos.length === 0) return true;
  const texto = textoBuscavel(veiculo);
  return termos.every((termo) => texto.includes(termo));
}

/**
 * O rótulo do chip da busca ativa, ou `null` quando não há busca.
 *
 * Aspas curvas, as mesmas de `mensagemDeVitrineVazia`: o chip fica ao lado de
 * chips de filtro que são palavra solta em caixa alta ("FLEX", "AUTOMÁTICO"),
 * e sem elas o que a pessoa digitou se confunde com uma opção do painel.
 */
export function chipDaBusca(termo: string): string | null {
  const limpo = (termo ?? "").trim();
  return limpo ? `“${limpo.toUpperCase()}”` : null;
}

/**
 * O que a tela diz quando a vitrine filtrada não devolve nada.
 *
 * Antes era uma frase só — "Nenhum veículo com essa combinação de filtros" —
 * e ela mente para quem chegou ali digitando: a pessoa procurou uma palavra,
 * não marcou caixa nenhuma, e a tela responde falando de filtros. Erro que
 * explica errado é pior que erro sem explicação, porque manda procurar no
 * lugar errado.
 *
 * `outrosFiltros` é a contagem SEM a busca — é o que separa "não achei a
 * palavra" de "a palavra existe, os filtros é que a excluíram".
 */
export function mensagemDeVitrineVazia(termo: string, outrosFiltros: number): string {
  const limpo = (termo ?? "").trim();
  if (limpo && outrosFiltros > 0) return `Nenhum veículo para “${limpo}” com esses filtros.`;
  if (limpo) return `Nenhum veículo para “${limpo}”.`;
  return "Nenhum veículo com essa combinação de filtros.";
}

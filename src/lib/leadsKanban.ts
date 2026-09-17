/**
 * Regras do kanban de leads que não dependem de React.
 *
 * Vivem aqui, e não dentro do componente, porque são as únicas partes
 * testáveis da tela A8: o resto é arrastar, soltar e pintar. O padrão é o
 * mesmo de `avaliacaoRecomendacao` e `estatisticasEstoque`.
 */
import { ehTipoDeDesfecho, type EtapaDoFunil } from "./funil";

/** Valor sentinela do filtro para "ninguém pegou este lead ainda". */
export const SEM_DONO = " sem-dono";

/** O mínimo que as regras precisam saber de um lead. */
export interface LeadFiltravel {
  responsavel: string | null;
}

/**
 * Iniciais do responsável, para caber nos 20px do rodapé do card.
 *
 * Primeira e última palavra: "João Silva Pereira" vira "JP", não "JS". É o
 * que distingue dois consultores de mesmo primeiro nome, que é o caso que
 * importa numa loja pequena.
 */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Aplica o filtro de responsável.
 *
 * Filtro vazio devolve tudo — inclusive os sem dono. O sentinela `SEM_DONO`
 * começa com espaço de propósito: nome de gente nunca começa com espaço, então
 * ele não colide com um consultor de verdade.
 */
export function filtrarPorResponsavel<T extends LeadFiltravel>(leads: T[], filtro: string): T[] {
  if (!filtro) return leads;
  if (filtro === SEM_DONO) return leads.filter((l) => !l.responsavel);
  return leads.filter((l) => l.responsavel === filtro);
}

/**
 * Nomes que aparecem no seletor: os cadastrados no painel mais os que já
 * estão gravados em algum lead.
 *
 * Os dois, porque `responsavel` é texto e não chave estrangeira (migração
 * 20260807210000): consultor que saiu da empresa some do cadastro, mas o
 * histórico dele continua nos leads antigos. Sem a união, o filtro deixaria
 * de encontrar esses leads e eles sumiriam da tela sem explicação.
 */
export function opcoesDeResponsavel(
  cadastrados: string[],
  leads: LeadFiltravel[],
): string[] {
  const nomes = new Set(cadastrados.filter(Boolean));
  for (const l of leads) if (l.responsavel) nomes.add(l.responsavel);
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * A fiação de `mover` — o que o gesto precisa saber e o que ele pode fazer.
 *
 * Recebida em vez de fechada por closure porque é o que torna o gesto
 * executável fora do React: o teste passa duas funções de mentira e CHAMA
 * `mover`, em vez de ler o componente e afirmar coisas sobre o texto dele.
 */
export interface FiacaoDoMover<L extends { id: string }> {
  etapas: EtapaDoFunil[];
  leads: L[];
  /** Abre a caixa de motivos. O card só chega no desfecho com um "por quê". */
  pedirMotivo: (lead: L, etapa: EtapaDoFunil) => void;
  /** Grava direto. Só para etapa que não encerra o negócio. */
  gravar: (id: string, campos: Record<string, unknown>) => void;
}

/**
 * Mover o card para `chave`: ou pede o motivo, ou grava.
 *
 * ---------------------------------------------------------------------------
 * Por que isto não mora dentro do componente
 * ---------------------------------------------------------------------------
 * A decisão daqui esteve errada desde 2026-08-28. `mover` perguntava
 * `tipo === "ganho" || tipo === "perdido"`, uma lista que nasceu certa quando
 * o funil tinha dois desfechos e ficou errada sem mudar uma letra quando
 * entrou o terceiro: os botões de descarte chamavam o mesmo `mover`, caíam no
 * `gravar` do fim, e a caixa de motivos nunca abria. O card não ficava preso
 * — por isso ninguém viu —, o motivo é que sumia: todo descarte chegou ao
 * banco com `desfecho_motivo` nulo.
 *
 * E a única prova que existia era um teste que lia a GRAFIA da guarda, e que
 * por isso passou a EXIGIR o defeito. Asserção sobre o texto de um `if` prova
 * aquele `if` e mais nada: um `if` a mais antes da guarda, uma exceção depois
 * dela ou uma cadeia `else if` restauram o defeito com a condição lida
 * intacta.
 *
 * Aqui o teste executa o gesto: chama `mover` com uma etapa de cada tipo e
 * conta quem foi chamado. Degrau novo em qualquer lugar desta função roda
 * junto. Quem é desfecho se pergunta a `ehTipoDeDesfecho`, que conhece os três
 * — e o quarto, no dia em que existir.
 */
export function criarMover<L extends { id: string }>(f: FiacaoDoMover<L>) {
  return (id: string, chave: string): void => {
    const etapa = f.etapas.find((e) => e.chave === chave);
    const lead = f.leads.find((l) => l.id === id);
    if (!lead || !etapa) return;
    if (ehTipoDeDesfecho(etapa.tipo)) {
      f.pedirMotivo(lead, etapa);
      return;
    }
    f.gravar(id, { situacao: chave });
  };
}

// ---------------------------------------------------------------------------
// A busca pela referência da mensagem — o "(Ref: 0DCB1CDC)"
// ---------------------------------------------------------------------------
//
// Desde 2026-08-19 a mensagem pré-preenchida de WhatsApp de quem tem rastreio
// termina com os 8 primeiros caracteres do `ag_uid`, em caixa alta
// (`sufixoRef`, em `lib/telemetry.ts`). O comentário de `refCurta` diz para que
// o código existe: achar o lead quando a mensagem chega à loja sem casar com o
// formulário — o cliente digitou um número e mandou de outro. Desde 2026-09-02
// `/api/leads` grava o `ag_uid` no lead; faltava o caminho de volta, do código
// até a linha.
//
// As três funções abaixo são esse caminho, fora do React: o que o atendente
// colou vira o código (`normalizarRef`), o código vira o filtro do banco
// (`padraoDaRef`), e o que voltou vira o aviso da tela (`resumoDaBusca`).

/**
 * A frase da recusa — uma só para a tela e para a rota.
 *
 * A tela confere antes de sair, para não gastar viagem com entrada
 * incompleta; a rota confere de novo, porque a URL aceita qualquer coisa. Duas
 * frases para a mesma recusa seriam o atendente lendo coisas diferentes
 * conforme o caminho.
 */
export const AVISO_DE_REF_INVALIDA =
  "A referência tem 8 caracteres, como em 0DCB1CDC — ou cole a mensagem inteira do cliente.";

/** "(Ref: 0DCB1CDC)", "Ref:0DCB1CDC", "referência 0dcb1cdc": o rótulo e os oito. */
const REF_ROTULADA = /\bref(?:er[eê]ncia)?[\s:#-]*([0-9a-f]{8})(?![0-9a-f])/gi;
/** O `ag_uid` inteiro, de onde a referência é cortada. */
const UUID_INTEIRO = /\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Só o código, com ou sem parênteses em volta. */
const REF_SOLTA = /^\(?\s*([0-9a-f]{8})\s*\)?$/i;

/**
 * O que o atendente colou → o código que o cliente leu, ou `""`.
 *
 * O que chega ao campo varia: o código digitado (quase sempre em minúsculas),
 * o "(Ref: 0DCB1CDC)" copiado da conversa, a mensagem INTEIRA do cliente, ou o
 * `ag_uid` completo tirado de uma nota. Os quatro levam ao mesmo lead.
 *
 * ---------------------------------------------------------------------------
 * Por que ler o rótulo, e não juntar os hexadecimais
 * ---------------------------------------------------------------------------
 * A primeira versão desta função (commit 5bab534, de 26/08, que não chegou ao
 * `main`) jogava fora tudo o que não era hexadecimal e ficava com os 8
 * primeiros. Isso aceita demais, e calado:
 *
 *   - a mensagem inteira colada virava sopa: toda letra de `a` a `f` e todo
 *     dígito do texto entravam na conta antes do código do fim, que nunca era
 *     lido — "Olá! Tenho interesse no Onix 2022. (Ref: 0DCB1CDC)" dava
 *     `EEEE2022`;
 *   - o telefone digitado no campo errado, "41999990000", virava `41999990`,
 *     uma referência de aparência perfeita;
 *   - "Ref:0DCB1CDC" só escapava de virar `E0DCB1CD` — o `e` de "Ref" é
 *     hexadecimal — porque o rótulo era tirado antes, e só no COMEÇO do texto.
 *
 * Nos três a busca voltava vazia, e "nenhum lead com a referência 41999990"
 * faz o atendente concluir que o lead não existe. Aqui o código só é aceito
 * quando dá para dizer DE ONDE ele veio: de um rótulo, de um UUID inteiro, ou
 * de um campo que contém o código e nada mais. O resto devolve `""`, e quem
 * chama mostra `AVISO_DE_REF_INVALIDA` em vez de fazer uma busca que não acha.
 *
 * Duas referências DIFERENTES no mesmo texto — duas mensagens coladas juntas —
 * também devolvem `""`: escolher uma seria adivinhar de qual cliente se trata.
 */
export function normalizarRef(entrada: string): string {
  const texto = (entrada ?? "").trim();

  const achadas = new Set<string>();
  for (const padrao of [REF_ROTULADA, UUID_INTEIRO]) {
    for (const m of texto.matchAll(padrao)) achadas.add(m[1].toUpperCase());
  }
  if (achadas.size > 0) return achadas.size === 1 ? [...achadas][0] : "";

  const solta = REF_SOLTA.exec(texto);
  return solta ? solta[1].toUpperCase() : "";
}

/**
 * O padrão de `ilike` sobre `leads.ag_uid` que devolve os leads de uma
 * referência.
 *
 * É o inverso de `refCurta`, que só imprime código quando o `ag_uid` começa
 * com 8 hexadecimais e um hífen, e imprime esses 8 em caixa alta. Logo, "o
 * cliente leu 0DCB1CDC" é exatamente "o `ag_uid` começa com 0DCB1CDC e hífen,
 * sem distinguir caixa" — `0DCB1CDC-%` em `ilike`. O hífen não é enfeite: sem
 * ele, `0dcb1cdcf…` casaria, e para esse `ag_uid` `refCurta` não imprime
 * referência nenhuma.
 *
 * Só aceita o que sai de `normalizarRef` — oito hexadecimais, onde `%` e `_`
 * não cabem. O resto estoura aqui mesmo: um curinga vindo da URL
 * transformaria a busca de UM lead numa listagem.
 */
export function padraoDaRef(ref: string): string {
  if (!/^[0-9A-F]{8}$/.test(ref)) {
    throw new Error(`Referência fora de forma para o filtro: "${ref}"`);
  }
  return `${ref}-%`;
}

/** O mínimo que o aviso da busca precisa saber de um lead. */
export interface LeadDaBusca {
  ag_uid?: string | null;
  desfecho?: string | null;
}

/**
 * O aviso da busca que ACHOU — o que a tela diz além do quadro.
 *
 * Duas coisas que o quadro sozinho esconderia:
 *
 * 1. **Lead fechado não está no quadro.** Desde 2026-08-28 ganho, perdido e
 *    descarte saíram das colunas para a lista de Fechados. A busca que acha só
 *    um lead fechado desenharia colunas vazias — e quadro vazio se lê como
 *    "não achei".
 * 2. **Mais de um lead com a mesma referência.** Quase sempre é o mesmo
 *    aparelho enviando mais de um formulário: o `ag_uid` é do navegador, e o
 *    rastreio inteiro é igual. Rastreios DIFERENTES com os mesmos oito
 *    primeiros caracteres são raros, mas possíveis — o prefixo não é chave —,
 *    e nesse caso o atendente precisa conferir antes de responder à pessoa
 *    errada.
 */
export function resumoDaBusca(
  ref: string,
  leads: LeadDaBusca[],
): { frases: string[]; fechados: number } {
  const total = leads.length;
  const fechados = leads.filter((l) => l.desfecho).length;
  const frases = [`${total === 1 ? "1 lead" : `${total} leads`} com a referência ${ref}.`];

  if (fechados > 0) {
    frases.push(
      fechados < total
        ? `${fechados === 1 ? "Um deles já foi fechado e está" : `${fechados} deles já foram fechados e estão`} na lista de Fechados, fora do quadro.`
        : `${total === 1 ? "Ele já foi fechado e está" : "Todos já foram fechados e estão"} na lista de Fechados, fora do quadro.`,
    );
  }

  if (total > 1) {
    const rastreios = new Set(leads.map((l) => (l.ag_uid ?? "").toLowerCase()));
    frases.push(
      rastreios.size === 1
        ? `O rastreio é o mesmo nos ${total}: foi o mesmo aparelho que enviou mais de um formulário.`
        : "Há rastreios diferentes com os mesmos oito primeiros caracteres — confira nome e telefone antes de responder.",
    );
  }

  return { frases, fechados };
}

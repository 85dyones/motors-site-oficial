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

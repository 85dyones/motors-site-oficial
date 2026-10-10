/**
 * A atribuição feita no Chatwoot volta para o painel (2026-10-03).
 *
 * Quando um ADMINISTRADOR dá a conversa a um vendedor dentro do Chatwoot, o
 * lead do painel ganha esse vendedor como `leads.responsavel`. Atribuição
 * feita por quem não é admin, por automação, ou para quem não é Comercial
 * ativo não muda nada.
 *
 * Este módulo é só régua: lê texto, compara nome e decide. Não fala com banco
 * nem com rede, e por isso cabe inteiro num teste de unidade.
 *
 * ---------------------------------------------------------------------------
 * Por que a régua lê uma FRASE
 * ---------------------------------------------------------------------------
 * O webhook do Chatwoot não diz QUEM atribuiu. O único vestígio é a mensagem
 * de atividade que ele escreve na conversa. Formatos conferidos na instalação
 * da loja (pt_BR) e os equivalentes em inglês:
 *
 *   Atribuído a %{assignee_name} por %{user_name}
 *   Atribuído a %{assignee_name} via %{team_name} por %{user_name}
 *   %{user_name} atribuiu a si mesmo essa conversa
 *   Conversa desatribuída por %{user_name}
 *
 *   Assigned to %{assignee_name} by %{user_name}
 *   Assigned to %{assignee_name} via %{team_name} by %{user_name}
 *   %{user_name} self-assigned this conversation
 *
 * ⚠️ A atribuição a um TIME tem a mesma cara ("Atribuído a Comercial por
 * Fulano"). Aqui ela vira `para: "Comercial"`, que não é perfil de ninguém, e
 * a decisão recusa como destino que não é do Comercial.
 *
 * ---------------------------------------------------------------------------
 * Por que o casamento é por NOME
 * ---------------------------------------------------------------------------
 * O e-mail do agente no Chatwoot nem sempre é o do painel; o nome é o mesmo
 * nos dois. Então quem casa é o nome normalizado (sem acento, sem caixa,
 * espaços colapsados) contra `profiles.full_name`. Nome que casa com mais de
 * um perfil ativo não casa com nenhum: escolher um dos dois seria dar o lead
 * a alguém por sorteio.
 *
 * O e-mail só DESEMPATA entre perfis que já casaram pelo nome. Ele nunca
 * passa por cima do nome escrito na nota: a nota de time ("Atribuído a
 * Comercial por Fulano") chega com o e-mail de quem o Chatwoot sorteou dentro
 * do time, e aceitar o e-mail sozinho daria o lead a quem o admin não nomeou.
 *
 * A normalização é só para COMPARAR. O que se grava é o `full_name` do
 * perfil, aparado nas pontas e mais nada: `escopoDeLeads` compara
 * `leads.responsavel` com o nome do perfil só com `trim`, e um espaço interno
 * "consertado" aqui deixaria o vendedor sem ver o próprio lead.
 *
 * ---------------------------------------------------------------------------
 * Por que o autor também é conferido no Chatwoot
 * ---------------------------------------------------------------------------
 * O nome que aparece na nota é o nome de exibição do agente, e o agente pode
 * editá-lo. Um vendedor que se renomeasse para o nome do dono escreveria
 * notas "por" ele. Por isso, quando a lista de agentes do Chatwoot é dada, o
 * nome do autor precisa casar com EXATAMENTE UM agente, e esse agente precisa
 * ser `administrator` lá, além de ser admin ativo no painel. Dois agentes com
 * o mesmo nome recusam: um deles pode ser o impostor.
 */

export type NotaDeAtribuicao =
  | { tipo: "atribuida"; para: string; por: string }
  | { tipo: "propria"; por: string }
  | { tipo: "removida"; por: string };

export type MotivoSemResponsavel =
  | "autor-nao-e-admin"
  | "destino-nao-e-comercial"
  | "sem-nota"
  | "nome-ambiguo"
  | "remocao";

export type DecisaoDeResponsavel =
  | { responsavel: string; autor: string; motivo?: undefined }
  | { responsavel: null; motivo: MotivoSemResponsavel };

/** O que a régua precisa saber de cada linha de `profiles`. */
export interface PerfilDaAtribuicao {
  full_name: string | null;
  email?: string | null;
  papeis?: string[] | null;
  is_active?: boolean | null;
}

/** Um agente da conta, como `GET /agents` do Chatwoot devolve. */
export interface AgenteDoChatwoot {
  /** O id do agente na conta — é o que a atribuição de conversa pede. */
  id?: unknown;
  name?: unknown;
  available_name?: unknown;
  email?: unknown;
  role?: unknown;
}

/** Uma mensagem da conversa, como a API do Chatwoot devolve. */
export interface MensagemDoChatwoot {
  message_type?: unknown;
  content?: unknown;
  created_at?: unknown;
}

/** Espaços colapsados e pontas aparadas. */
function aparar(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

/**
 * O nome como se compara: sem acento, sem caixa, espaços colapsados.
 * "  JOÃO   da Silva " e "Joao da silva" são a mesma pessoa.
 */
export function normalizarNome(nome: string | null | undefined): string {
  return aparar(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Corta no ÚLTIMO separador: o nome do destino pode conter " por " ou " a ". */
function cortarNoUltimo(textoInteiro: string, separador: string): [string, string] | null {
  const i = textoInteiro.toLowerCase().lastIndexOf(separador);
  if (i < 0) return null;
  const antes = aparar(textoInteiro.slice(0, i));
  const depois = aparar(textoInteiro.slice(i + separador.length));
  return antes && depois ? [antes, depois] : null;
}

const PREFIXOS_DE_ATRIBUICAO: Array<{ prefixo: RegExp; por: string }> = [
  { prefixo: /^atribu[ií]d[oa] a /i, por: " por " },
  { prefixo: /^assigned to /i, por: " by " },
];

const FINAIS_DE_PROPRIA = [/ atribuiu a si mesm[oa] ess[ae] conversa\.?$/i, / self-assigned this conversation\.?$/i];

const PREFIXOS_DE_REMOCAO = [/^conversa desatribu[ií]da por /i, /^conversation unassigned by /i];

/**
 * A mensagem de atividade vira fato. `null` quando o texto não é nota de
 * atribuição (mudança de etiqueta, de status, de prioridade).
 */
export function lerNotaDeAtribuicao(texto: unknown): NotaDeAtribuicao | null {
  if (typeof texto !== "string") return null;
  const frase = aparar(texto);
  if (!frase) return null;

  for (const { prefixo, por } of PREFIXOS_DE_ATRIBUICAO) {
    const m = prefixo.exec(frase);
    if (!m) continue;
    const partes = cortarNoUltimo(frase.slice(m[0].length), por);
    if (!partes) return null;
    const [destino, autor] = partes;
    // "via <time>" fica entre o destino e o autor. O time não interessa: quem
    // recebe o lead é a pessoa.
    const semTime = cortarNoUltimo(destino, " via ");
    return { tipo: "atribuida", para: semTime ? semTime[0] : destino, por: autor };
  }

  for (const final of FINAIS_DE_PROPRIA) {
    const m = final.exec(frase);
    if (!m) continue;
    const autor = aparar(frase.slice(0, m.index));
    return autor ? { tipo: "propria", por: autor } : null;
  }

  for (const prefixo of PREFIXOS_DE_REMOCAO) {
    const m = prefixo.exec(frase);
    if (!m) continue;
    const autor = aparar(frase.slice(m[0].length));
    return autor ? { tipo: "removida", por: autor } : null;
  }

  return null;
}

/** Quem a nota diz que ficou com a conversa. `null` na remoção. */
export function destinoDaNota(nota: NotaDeAtribuicao): string | null {
  if (nota.tipo === "atribuida") return nota.para;
  if (nota.tipo === "propria") return nota.por;
  return null;
}

/** É mensagem de atividade? O Chatwoot manda `2` na API e "activity" no webhook. */
export function ehMensagemDeAtividade(tipo: unknown): boolean {
  return tipo === 2 || tipo === "2" || tipo === "activity";
}

/** O carimbo da mensagem em milissegundos. A API manda segundos; o webhook, às vezes ISO. */
export function instanteDaMensagem(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    // Abaixo de 1e11 só pode ser segundos: em milissegundos seria 1973.
    return v < 1e11 ? v * 1000 : v;
  }
  if (typeof v === "string" && v.trim()) {
    if (/^\d+$/.test(v.trim())) return instanteDaMensagem(Number(v.trim()));
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export interface NotaDatada {
  nota: NotaDeAtribuicao;
  /** Quando o Chatwoot escreveu a nota, em milissegundos. `null` se não veio. */
  em: number | null;
}

/**
 * A nota de atribuição MAIS RECENTE entre as mensagens de uma conversa.
 *
 * Só atividade conta: um cliente que escreva "Atribuído a Fulano por Dono"
 * não atribui nada. A ordem da lista não é pressuposta; quem decide é o
 * carimbo, e no empate (ou sem carimbo) ganha a que veio depois na lista.
 */
export function notaMaisRecente(mensagens: readonly MensagemDoChatwoot[]): NotaDatada | null {
  let melhor: NotaDatada | null = null;
  for (const m of mensagens) {
    if (!m || typeof m !== "object" || !ehMensagemDeAtividade(m.message_type)) continue;
    const nota = lerNotaDeAtribuicao(m.content);
    if (!nota) continue;
    const em = instanteDaMensagem(m.created_at);
    if (!melhor || (em ?? 0) >= (melhor.em ?? 0)) melhor = { nota, em };
  }
  return melhor;
}

/**
 * A nota confere com quem o evento diz que está com a conversa?
 *
 * Quando o evento traz o nome do responsável atual, a nota precisa apontar
 * para ele. Se não aponta, é nota de OUTRA atribuição, e agir por ela daria o
 * lead a quem já não está com a conversa. Sem nome no evento não há o que
 * conferir.
 */
export function notaConfere(nota: NotaDeAtribuicao, responsavelNoChatwoot: string | null | undefined): boolean {
  if (!responsavelNoChatwoot) return true;
  const destino = destinoDaNota(nota);
  return destino !== null && normalizarNome(destino) === normalizarNome(responsavelNoChatwoot);
}

/**
 * A nota já foi superada por uma troca de dono mais nova no painel?
 *
 * Sem isto, uma nota velha é reaplicada: o admin atribui no Chatwoot, alguém
 * troca o dono no painel, e o próximo evento da conversa (uma etiqueta) lê a
 * mesma nota e desfaz a troca. Sem carimbo de um dos lados não dá para
 * afirmar que é velha, e a nota vale.
 */
export function notaSuperada(
  notaEm: number | null,
  responsavelDesde: string | null | undefined,
): boolean {
  if (notaEm === null || !responsavelDesde) return false;
  const desde = Date.parse(responsavelDesde);
  return !Number.isNaN(desde) && notaEm <= desde;
}

export type MotivoDeNotaVelha = "nota-sem-data" | "nota-anterior-ao-lead" | "nota-anterior-a-ultima-troca";

/**
 * A nota é velha demais para valer neste lead? `null` = vale.
 *
 * Quando o evento DISSE que o responsável mudou, a nota é a dessa mudança e
 * só perde para uma troca de dono mais nova no painel.
 *
 * Quando o evento só CARREGA um responsável, a nota lida pode ser de dias
 * atrás, e aí a régua aperta: ela precisa ter data e ser mais nova que o
 * próprio lead. O caso que isto fecha: o negócio é encerrado, o cliente volta
 * a escrever na mesma conversa, nasce um lead NOVO, e a nota antiga daquela
 * conversa cairia nele como se alguém o tivesse atribuído.
 */
export function motivoDeNotaVelha(entrada: {
  notaEm: number | null;
  explicito: boolean;
  leadCriadoEm: string | null | undefined;
  responsavelDesde: string | null | undefined;
}): MotivoDeNotaVelha | null {
  const { notaEm, explicito, leadCriadoEm, responsavelDesde } = entrada;
  if (!explicito) {
    if (notaEm === null) return "nota-sem-data";
    const criado = leadCriadoEm ? Date.parse(leadCriadoEm) : Number.NaN;
    // Sem a data do lead não dá para afirmar que a nota é dele.
    if (Number.isNaN(criado) || notaEm <= criado) return "nota-anterior-ao-lead";
  }
  return notaSuperada(notaEm, responsavelDesde) ? "nota-anterior-a-ultima-troca" : null;
}

const ativo = (p: PerfilDaAtribuicao) => p.is_active === true;
const tem = (p: PerfilDaAtribuicao, papel: string) => (p.papeis ?? []).includes(papel);

type Achado = { perfil: PerfilDaAtribuicao } | { perfil: null; ambiguo: boolean };

const emailLimpo = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/**
 * O perfil ATIVO com este nome.
 *
 * O nome manda. O e-mail só escolhe entre os que JÁ casaram pelo nome, quando
 * há mais de um; nunca traz para a conta um perfil de outro nome. Continua
 * ambíguo se o e-mail não aponta exatamente um deles.
 */
function acharPerfil(
  nome: string,
  email: string | null | undefined,
  perfis: readonly PerfilDaAtribuicao[],
): Achado {
  const alvo = normalizarNome(nome);
  if (!alvo) return { perfil: null, ambiguo: false };
  const iguais = perfis.filter((p) => ativo(p) && normalizarNome(p.full_name) === alvo);
  if (iguais.length === 1) return { perfil: iguais[0] };
  if (iguais.length === 0) return { perfil: null, ambiguo: false };

  const doEmail = emailLimpo(email);
  const escolhidos = doEmail ? iguais.filter((p) => emailLimpo(p.email) === doEmail) : [];
  return escolhidos.length === 1 ? { perfil: escolhidos[0] } : { perfil: null, ambiguo: true };
}

/** Os agentes do Chatwoot que atendem por este nome (`name` ou `available_name`). */
function agentesComNome(nome: string, agentes: readonly AgenteDoChatwoot[]): AgenteDoChatwoot[] {
  const alvo = normalizarNome(nome);
  if (!alvo) return [];
  return agentes.filter(
    (a) =>
      a &&
      typeof a === "object" &&
      [a.name, a.available_name].some((n) => typeof n === "string" && normalizarNome(n) === alvo),
  );
}

/**
 * O `full_name` a gravar em `leads.responsavel`, ou `null` com o motivo.
 *
 *   - quem atribuiu precisa ser admin ativo no painel;
 *   - com `agentes` (a lista do Chatwoot), o nome do autor precisa ser de
 *     exatamente um agente, e ele `administrator` lá;
 *   - quem recebeu (na atribuição a si mesmo, o próprio autor) precisa ser
 *     Comercial ativo;
 *   - remoção não muda nada nesta versão.
 *
 * `emailDoDestino` é o e-mail do agente que o EVENTO traz como responsável
 * atual. A nota só tem nomes; o e-mail do autor vem da lista de agentes. Os
 * dois só desempatam homônimos, ver `acharPerfil`.
 *
 * ⚠️ `agentes` é opcional para a régua poder ser testada em partes. A rota
 * SEMPRE passa a lista, e recusa antes de chegar aqui se não conseguiu lê-la.
 */
export function decidirResponsavel(entrada: {
  nota: NotaDeAtribuicao | null | undefined;
  perfis: readonly PerfilDaAtribuicao[];
  emailDoDestino?: string | null;
  agentes?: readonly AgenteDoChatwoot[];
}): DecisaoDeResponsavel {
  const { nota, perfis, emailDoDestino, agentes } = entrada;
  if (!nota) return { responsavel: null, motivo: "sem-nota" };
  if (nota.tipo === "removida") return { responsavel: null, motivo: "remocao" };

  let emailDoAutor: string | null = null;
  if (agentes) {
    const iguais = agentesComNome(nota.por, agentes);
    if (iguais.length > 1) return { responsavel: null, motivo: "nome-ambiguo" };
    if (iguais.length === 0 || iguais[0].role !== "administrator") {
      return { responsavel: null, motivo: "autor-nao-e-admin" };
    }
    emailDoAutor = emailLimpo(iguais[0].email) || null;
  }

  const autor = acharPerfil(nota.por, emailDoAutor, perfis);
  if (!autor.perfil) {
    return { responsavel: null, motivo: autor.ambiguo ? "nome-ambiguo" : "autor-nao-e-admin" };
  }
  if (!tem(autor.perfil, "admin")) return { responsavel: null, motivo: "autor-nao-e-admin" };

  let destino: Achado = autor;
  if (nota.tipo === "atribuida") {
    // O e-mail do evento primeiro; sem ele, o do agente de mesmo nome na lista.
    const doChatwoot = agentes ? agentesComNome(nota.para, agentes) : [];
    const email =
      emailLimpo(emailDoDestino) || (doChatwoot.length === 1 ? emailLimpo(doChatwoot[0].email) : "");
    destino = acharPerfil(nota.para, email, perfis);
  }
  if (!destino.perfil) {
    return { responsavel: null, motivo: destino.ambiguo ? "nome-ambiguo" : "destino-nao-e-comercial" };
  }
  if (!tem(destino.perfil, "comercial")) {
    return { responsavel: null, motivo: "destino-nao-e-comercial" };
  }

  // Só `trim`, como o PATCH do painel grava e como `escopoDeLeads` compara.
  // Colapsar espaço interno aqui gravaria um nome que não é o do perfil.
  return {
    responsavel: (destino.perfil.full_name ?? "").trim(),
    autor: (autor.perfil.full_name ?? "").trim(),
  };
}

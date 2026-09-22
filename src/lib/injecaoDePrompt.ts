/**
 * Peneira de injeção de prompt no conteúdo que o painel grava.
 *
 * ---------------------------------------------------------------------------
 * Por que um módulo, e não a função no arquivo de quem usa
 * ---------------------------------------------------------------------------
 * Até 2026-09-22 esta função existia DUAS vezes, copiada byte a byte: uma em
 * `src/app/api/settings/route.ts` e outra em
 * `src/components/ConfiguracoesClientWrapper.tsx`. Cópia de regra de segurança
 * não fica igual por muito tempo — cada lado ganha um padrão novo na hora em
 * que alguém percebe um caso, e a diferença só aparece no dia do incidente.
 *
 * Pior que isso: das duas cópias, a do servidor NUNCA era chamada. A única
 * referência ao nome dela era a recursão dentro do próprio corpo, o que faz a
 * função parecer usada para quem lê rápido. Quem barrava de fato era a do
 * cliente, que roda no navegador — `curl`, Postman ou script com token de staff
 * passavam direto. A rota agora chama esta aqui antes de qualquer gravação.
 *
 * ---------------------------------------------------------------------------
 * O que ela promete, e o que não
 * ---------------------------------------------------------------------------
 * É lista de padrões, não compreensão de texto: pega a instrução escrita em
 * inglês, na forma canônica, e não pega paráfrase nem a mesma ordem em
 * português. Serve como defesa em profundidade atrás do `ehStaff` — encarece o
 * caminho óbvio de quem pegou uma sessão emprestada —, e não como garantia de
 * que nada hostil entra em `site_settings`. Prometer o segundo seria mentira
 * confortável.
 */

/**
 * Os padrões, na grafia que já rodava nas duas cópias.
 *
 * ⚠️ **Sem a flag `g`, e isso é requisito e não descuido.** A regex é literal de
 * módulo, compartilhada por todas as chamadas: com `g`, `lastIndex` sobrevive
 * entre os `.test()` e a segunda pergunta sobre a mesma string devolve `false`.
 * Numa varredura recursiva, que chama `.test()` uma vez por campo, isso vira
 * peneira que deixa passar um salvamento sim, outro não.
 *
 * O alcance de `act\s+as\s+a` não tem borda de palavra à esquerda: ele casa
 * dentro de "compact as a", "impact as a". Em texto português isso não aparece,
 * e a grafia foi mantida como estava de propósito — este módulo nasceu de uma
 * MUDANÇA DE LUGAR, não de regra. Apertar a borda muda o que o painel já
 * recusa hoje no navegador, e isso é outra tarefa, com outro PR.
 */
export const REGEX_INJECAO_DE_PROMPT =
  /(ignore\s+all\s+(?:previous\s+)?instructions|system\s+prompt|you\s+are\s+a\s+bot|act\s+as\s+a|new\s+instruction|jailbreak\b)/i;

/**
 * Varre o valor inteiro — objeto, lista, texto — atrás de um dos padrões.
 *
 * Recursiva porque o corpo do POST de `/api/settings` é envelope de envelopes
 * (`popups[].campanha.texto`) e nenhum campo de risco fica na raiz. Folha que
 * não é texto (número de saldo, booleano de override, `null` de campo apagado)
 * responde `false` em vez de estourar: a rota devolveria 500 no lugar de salvar.
 */
export function temInjecaoDePrompt(valor: unknown): boolean {
  if (typeof valor === "string") {
    return REGEX_INJECAO_DE_PROMPT.test(valor);
  }
  if (typeof valor === "object" && valor !== null) {
    const registro = valor as Record<string, unknown>;
    for (const chave in registro) {
      if (temInjecaoDePrompt(registro[chave])) {
        return true;
      }
    }
  }
  return false;
}

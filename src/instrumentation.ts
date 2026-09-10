import type { Instrumentation } from "next";
import { registrarFalha } from "./lib/observabilidade";

/**
 * A captura do servidor — exceção que nenhum `catch` do projeto pegou.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui, e não num SDK
 * ---------------------------------------------------------------------------
 * `onRequestError` é hook NATIVO do Next: ele já é chamado para erro de Server
 * Component, de route handler, de Server Action e do `proxy.ts`. Não precisa
 * de biblioteca de fornecedor e, o que mais importa, **não toca o
 * `next.config.ts`** — que carrega o `redirects()` do alias com o negativo
 * `(?!api/)` de que quatro workflows do n8n dependem. Envolver aquele arquivo
 * era o único ponto do desenho que ameaçava a conversão.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ O Next AWAIT-a esta função
 * ---------------------------------------------------------------------------
 * `next/dist/server/base-server.js:450`. Tudo que a gravação demorar entra no
 * tempo da resposta de erro — daí o teto de 2 s e o disjuntor de 60 s em
 * `registrarFalha`. Um erro aqui dentro é engolido pelo Next (`:458`), então
 * `registrarFalha` nunca lançar não é zelo: é o que evita erro invisível
 * dentro do capturador de erros.
 *
 * ---------------------------------------------------------------------------
 * O que NÃO é gravado
 * ---------------------------------------------------------------------------
 * `request.headers` é o dicionário inteiro, e nele vem o `sb-*-auth-token` de
 * quem está logado no painel, mais o `Authorization` de chamada autenticada.
 * Gravar o dict seria pôr a sessão do staff numa tabela que a própria equipe
 * consulta pela tela. Daí sair daqui só o `user-agent` (que diz em qual
 * navegador o defeito acontece) e o `ag_uid` (que liga o erro a quem navegou),
 * extraídos um a um — nunca o objeto.
 *
 * Não há `register()`: o `org_id` vem do default da tabela `erros`, e nenhum
 * destino de erro consulta o banco para descobrir de quem é o erro.
 */

/** O valor de um cookie no cabeçalho bruto, sem `next/headers`. */
function cookie(cabecalho: string | string[] | undefined, nome: string): string | null {
  if (!cabecalho) return null;
  const bruto = Array.isArray(cabecalho) ? cabecalho.join("; ") : cabecalho;
  for (const parte of bruto.split(";")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() === nome) return parte.slice(igual + 1).trim() || null;
  }
  return null;
}

function primeiro(valor: string | string[] | undefined): string | null {
  if (!valor) return null;
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

export const onRequestError: Instrumentation.onRequestError = async (
  erro,
  requisicao,
  contexto,
) => {
  // A porta de erro não pode gerar erro que volte pela própria porta: seria um
  // laço que enche a tabela sozinho.
  if (requisicao.path.startsWith("/api/erros")) return;

  await registrarFalha(
    "quebra",
    // `routerKind` seria sempre "App Router" e não distinguiria nada.
    // `routeType` separa render, route, action e proxy — que é a primeira
    // pergunta de quem abre a triagem.
    `servidor:${contexto.routeType}`,
    erro,
    {
      origem: "servidor",
      // O PADRÃO da rota (`/carros/[categoria]/…`), que é o que agrupa; o
      // caminho concreto vai em `url`, sem a query.
      rota: contexto.routePath,
      url: requisicao.path,
      metodo: requisicao.method,
      navegador: primeiro(requisicao.headers["user-agent"]),
      ag_uid: cookie(requisicao.headers["cookie"], "ag_uid"),
      digest: typeof erro === "object" && erro !== null && "digest" in erro
        ? String((erro as { digest?: unknown }).digest)
        : null,
      extra: {
        renderSource: contexto.renderSource ?? null,
        revalidateReason: contexto.revalidateReason ?? null,
      },
    },
  );
};

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A migração VIVA de uma função de banco — não o arquivo que tem o nome dela.
 *
 * `fechar_venda_ciclo` já foi redefinida por `create or replace` em migrações
 * cujo nome não a menciona. O teste do fechamento abria a de 2026-08-14 por
 * nome e passou três dias verde validando código morto — exatamente o que ele
 * existia para impedir. Quem procura pela definição não erra de novo.
 *
 * A busca é INSENSÍVEL A MAIÚSCULAS de propósito, e isso não é detalhe de
 * estilo: `20260818120000_falha_envio_nao_penaliza.sql` traz
 * `CREATE OR REPLACE FUNCTION` em caixa alta, porque a definição foi extraída
 * do banco com `pg_get_functiondef` em vez de redigitada. Com a comparação
 * sensível a caixa, esta função pulava justamente o arquivo que a revisão de
 * 2026-08-20 provou ser o mais perigoso de perder de vista — e devolvia como
 * "viva" uma definição de quatro dias antes.
 *
 * A regra que decide entre esta função e ler a migração pelo nome: se a
 * asserção é sobre o que o banco FAZ hoje, use `migracaoViva`. Se é sobre o que
 * uma migração PROVOU quando rodou (a autoconferência dela, um backfill de uma
 * vez só), leia o arquivo dela pelo nome — esse texto é histórico e não muda.
 */
export function migracaoViva(funcao: string, raiz = join(__dirname, "..")): string {
  const dir = join(raiz, "supabase", "migrations");
  const assinatura = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${funcao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`,
    "i",
  );
  const encontradas = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf-8"))
    .filter((texto) => assinatura.test(texto));
  if (encontradas.length === 0) {
    throw new Error(`nenhuma migração define ${funcao}`);
  }
  return encontradas[encontradas.length - 1];
}

/**
 * Só o TEXTO da função viva, do `create or replace` ao fecha-cifrão.
 *
 * `migracaoViva` devolve o arquivo inteiro, e um arquivo hospeda várias
 * funções. Isso basta para asserção positiva ("o texto contém X"), mas
 * envenena a negativa: `expect(arquivo).not.toContain("km_estimado")` reprova
 * porque OUTRA função do mesmo arquivo cita o nome. Quando a asserção é sobre
 * o que uma função NÃO faz, é este recorte que serve.
 */
export function definicaoViva(funcao: string, raiz = join(__dirname, "..")): string {
  const texto = migracaoViva(funcao, raiz);
  const abertura = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${funcao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`,
    "gi",
  );
  // A ÚLTIMA ocorrência no arquivo: uma migração pode redefinir a mesma função
  // duas vezes, e a que vale é a de baixo.
  let inicio = -1;
  for (let m = abertura.exec(texto); m !== null; m = abertura.exec(texto)) inicio = m.index;
  if (inicio < 0) throw new Error(`assinatura de ${funcao} não encontrada na migração viva`);

  const corpo = texto.slice(inicio);
  const cifrao = /(^|\n)\s*as\s+(\$[A-Za-z_]*\$)/i.exec(corpo);
  if (!cifrao) throw new Error(`corpo de ${funcao} não encontrado (sem cifrão de abertura)`);
  const tag = cifrao[2];
  const fim = corpo.indexOf(tag, cifrao.index + cifrao[0].length);
  if (fim < 0) throw new Error(`corpo de ${funcao} não fecha o cifrão ${tag}`);
  return corpo.slice(0, fim + tag.length);
}

/** O NOME do arquivo da migração viva — para mensagem de erro que localiza. */
export function arquivoDaMigracaoViva(funcao: string, raiz = join(__dirname, "..")): string {
  const dir = join(raiz, "supabase", "migrations");
  const assinatura = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${funcao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`,
    "i",
  );
  const encontrados = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => assinatura.test(readFileSync(join(dir, f), "utf-8")));
  if (encontrados.length === 0) {
    throw new Error(`nenhuma migração define ${funcao}`);
  }
  return encontrados[encontrados.length - 1];
}

import { redirect } from "next/navigation";

/**
 * Rota mantida viva só para redirecionar (2026-08-24).
 *
 * "Compras de insumos" e "Despesas recorrentes" deixaram de ser telas: insumo
 * virou três campos na conta a pagar, e recorrência virou um check no mesmo
 * formulário — *"insumo é um tipo de compra, recorrência é um tipo de
 * vencimento"*, nas palavras do dono.
 *
 * O arquivo não é apagado porque link salvo, favorito do navegador e aba
 * aberta há três dias continuam apontando para cá. Um 404 na cara de quem
 * tinha o caminho de cor é pior que um redirecionamento silencioso — e quem
 * chega aqui encontra exatamente o que veio buscar, num lugar só.
 */
export default function RotaAposentada() {
  redirect("/admin/financeiro/contas-pagar");
}

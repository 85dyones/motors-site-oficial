/**
 * A carência do vendido — módulo puro, sem imports.
 *
 * Vive sozinha aqui porque tem DOIS consumidores com necessidades opostas:
 * `publicacao.ts` (server-only, usa `unstable_cache` e a chave de serviço) e
 * `repasse.ts`, que vai para o NAVEGADOR nos PRs 2 e 3 (a ilha cliente
 * `LoteDoRepasse` aplica `aparecePublicamente` no cliente). Se a constante
 * morasse em `publicacao.ts`, o primeiro import de `repasse.ts` num client
 * component arrastaria `unstable_cache(...)` — rodando no topo do módulo —
 * para o bundle do navegador. `publicacao.ts` reexporta esta constante para
 * quem já importava de lá continuar igual.
 */

/**
 * Quanto tempo a PDP de um carro vendido continua no índice de busca.
 *
 * Os dois extremos são ruins por motivos opostos. Tirar do índice na hora joga
 * fora a melhor parte do tráfego: quem procura "BMW X1 2019 usado" na semana
 * seguinte à venda é comprador daquele perfil, e a página já oferece OutOfStock
 * mais a lista de similares — é lead, não decepção. Manter para sempre é o
 * outro extremo: a loja vende continuamente, então em doze meses o índice
 * descreveria centenas de carros mortos contra as ~41 vagas vivas.
 *
 * Noventa dias captura a demanda enquanto ela é quente e limpa quando esfria.
 * Decisão do dono em 2026-08-17.
 */
export const CARENCIA_VENDIDO_DIAS = 90;

import type { Veiculo } from "../types";
import { contaDoRepasse, type CarroceriaDoRepasse, type Repasse } from "./repasse";
import { disponiveisDe, precoVigente } from "./regrasEstoque";

/**
 * "Também no seu perfil" — os vizinhos de estoque no rodapé da PDP.
 *
 * A primeira versão ordenava por carroceria igual e, dentro dela, por menor
 * distância de preço. Em produção isso pôs um Kia Bongo, uma Strada Ranch e um
 * Polo na página do Camaro SS: os três estão cadastrados como "Hatch", o Camaro
 * também está, e carroceria igual era a chave primária — bastava a etiqueta
 * bater para passar na frente de um X1 ou de um Tiguan muito mais próximos em
 * preço. Sem teto de distância, "o mais próximo" do carro mais caro do pátio
 * ainda estava 36% abaixo dele.
 *
 * Daí as três regras aqui. Elas assumem que o cadastro de `tipo` é falível —
 * porque é — e por isso nenhuma delas confia em `tipo` sozinho.
 */

/**
 * Faixa de preço aceitável, relativa ao veículo da página.
 *
 * Assimétrica de propósito: quem olha um carro aceita ser puxado para cima com
 * mais folga do que para baixo — mostrar algo bem mais barato lê como "achamos
 * que você não banca este". Não é número de negócio (nada aqui vem do manual),
 * é limite de vizinhança visual; mexer nos dois valores muda só o que aparece
 * nesta seção.
 */
export const PISO_DA_BANDA = 0.7;
export const TETO_DA_BANDA = 1.4;

/**
 * Quanto vale a mesma carroceria, medido na moeda da comparação: pontos de
 * distância relativa de preço. Com 0.08, carroceria igual empata com estar 8%
 * mais perto no preço — desempata entre candidatos parecidos e não sequestra a
 * ordem quando a etiqueta está errada.
 */
export const BONUS_DE_CARROCERIA = 0.08;

/** Duas rodas e quatro rodas não são vizinhos, mesmo custando o mesmo. */
function ehMotocicleta(v: Veiculo): boolean {
  return (v.tipo || "").trim().toLowerCase() === "motocicleta";
}

function mesmaCarroceria(tipo: string, v: Veiculo): boolean {
  const ta = tipo.trim().toLowerCase();
  const tb = (v.tipo || "").trim().toLowerCase();
  return ta.length > 0 && ta === tb;
}

/**
 * A referência de uma vizinhança: um preço, uma carroceria no vocabulário do
 * feed ("Hatch", "SUV"…; "" quando não se sabe) e se é moto. `id` tira a
 * própria ficha da lista; é `null` quando a página não é do estoque (o
 * repasse).
 */
export interface ReferenciaDosParecidos {
  id: string | null;
  preco: number;
  tipo: string;
  moto: boolean;
}

/**
 * Os `limite` veículos do estoque mais próximos da referência — o núcleo
 * de `escolherSimilares`, extraído em 25/09 para a ficha do repasse usar a
 * mesma régua sem ser um `Veiculo`.
 *
 * Devolve menos que `limite` — inclusive nenhum — quando não há candidato
 * dentro da banda. A seção some da página nesse caso, que é melhor que
 * completar a grade com vizinho ruim.
 */
export function vizinhosPorPreco(ref: ReferenciaDosParecidos, estoque: Veiculo[], limite = 3): Veiculo[] {
  const precoBase = ref.preco;
  if (!(precoBase > 0)) return [];

  const piso = precoBase * PISO_DA_BANDA;
  const teto = precoBase * TETO_DA_BANDA;

  return disponiveisDe(estoque)
    .filter((v) => {
      if (ref.id !== null && v.id === ref.id) return false;
      if (ehMotocicleta(v) !== ref.moto) return false;
      const preco = precoVigente(v);
      return preco >= piso && preco <= teto;
    })
    .map((v) => {
      const distancia = Math.abs(precoVigente(v) - precoBase) / precoBase;
      return {
        veiculo: v,
        pontuacao: distancia - (mesmaCarroceria(ref.tipo, v) ? BONUS_DE_CARROCERIA : 0),
      };
    })
    .sort((a, b) => {
      if (a.pontuacao !== b.pontuacao) return a.pontuacao - b.pontuacao;
      // Desempate estável: a PDP é ISR, e ordem que muda entre builds troca os
      // cards sem nenhuma razão visível para quem está olhando.
      return a.veiculo.id.localeCompare(b.veiculo.id);
    })
    .slice(0, limite)
    .map((c) => c.veiculo);
}

/** Os vizinhos de estoque no rodapé da PDP. A régua é `vizinhosPorPreco`. */
export function escolherSimilares(atual: Veiculo, estoque: Veiculo[], limite = 3): Veiculo[] {
  return vizinhosPorPreco(
    { id: atual.id, preco: precoVigente(atual), tipo: atual.tipo || "", moto: ehMotocicleta(atual) },
    estoque,
    limite,
  );
}

/**
 * A carroceria do repasse no vocabulário do feed do estoque (`CARROCERIAS`
 * em `classificacaoVeiculo.ts`; o feed normaliza para "Hatch", "Sedan",
 * "SUV", "Picape"). "outro" não tem par e não ganha bônus.
 */
export const TIPO_NO_FEED: Record<CarroceriaDoRepasse, string> = {
  hatch: "Hatch",
  seda: "Sedan",
  suv: "SUV",
  picape: "Picape",
  outro: "",
};

/**
 * "Prefere com garantia?" — três carros do estoque na ficha do repasse
 * (spec §7.2). A referência é a FIPE, ou "você gasta" sem ela: o carro com
 * garantia do mesmo porte custa perto da FIPE, e pelo preço de repasse a
 * banda cortaria justamente ele.
 */
export function parecidosDoRepasse(
  r: Pick<Repasse, "preco" | "fipe_valor" | "itens_de_estado" | "carroceria">,
  estoque: Veiculo[],
  limite = 3,
): Veiculo[] {
  const conta = contaDoRepasse(r);
  return vizinhosPorPreco(
    { id: null, preco: conta.fipe ?? conta.voceGasta, tipo: r.carroceria ? TIPO_NO_FEED[r.carroceria] : "", moto: false },
    estoque,
    limite,
  );
}

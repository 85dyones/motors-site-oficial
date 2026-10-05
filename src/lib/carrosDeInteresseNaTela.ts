/**
 * Os carros de interesse do lead e o relatório por veículo, no que só a TELA
 * precisa: as frases, a previsão do que uma gravação vai mudar e o resumo em
 * texto do relatório. Puro, sem I/O.
 *
 * As regras (motivos, o que vale num descarte, o veículo principal) moram em
 * `veiculosDeInteresse.ts`, e o contrato das rotas em `docs/GESTAO_DO_LEAD.md`,
 * seção 7. Aqui nada decide: o servidor responde com a lista relida, e ela
 * vale sobre o que a tela previu.
 */
import { linhaDoVeiculo, type DetalheDaApi } from "./filaDoFunil";
import {
  ROTULO_DO_MOTIVO_DE_DESCARTE,
  ehMotivoDeDescarte,
  type RelatorioDoVeiculo,
  type SituacaoDaOpcao,
  type VeiculoDeInteresse,
} from "./veiculosDeInteresse";

/** Um carro de `GET /api/estoque/busca`. */
export interface CarroDaBusca {
  id: number;
  rotulo: string;
  ano?: number | null;
  km?: number | null;
  preco?: number | null;
  placa_final?: string;
  foto?: string;
  vendido?: boolean;
  publicado?: boolean;
}

/** O corpo de `PATCH /api/leads/[id]/veiculos/[opcao]`, no que a tela manda. */
export interface MudancaDaOpcao {
  situacao?: SituacaoDaOpcao;
  motivo_descarte?: string;
  nota?: string | null;
  principal?: true;
}

/** Um item de `POST /api/leads/[id]/veiculos/resolver`. */
export interface ItemDaResolucao {
  opcao: string;
  situacao: "escolhido" | "descartado";
  motivo_descarte?: string;
  nota?: string;
}

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "R$ 62.900", com espaço comum (o `Intl` põe um espaço não separável). */
export const emReais = (valor: number): string => reais.format(valor).replace(/\s/g, " ");

/** "1 carro" ou "3 carros": a contagem com o nome no número certo. */
export function contar(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : plural}`;
}

/**
 * "Estoque · 45.000 km · R$ 59.900", "Vendido · ...", "Fora do estoque": a
 * linha embaixo do nome de cada opção.
 */
export function linhaDaOpcao(v: Pick<VeiculoDeInteresse, "no_estoque" | "vendido" | "km" | "preco_atual">): string {
  if (v.no_estoque === false) return "Fora do estoque";
  if (v.no_estoque === null) return "Não deu para consultar o estoque agora";
  return linhaDoVeiculo({ km: v.km, preco: v.preco_atual, vendido: v.vendido === true });
}

/** "era R$ 62.900" quando o preço mudou desde que o carro entrou no lead; senão `null`. */
export function precoDeAntes(v: Pick<VeiculoDeInteresse, "preco_na_epoca" | "preco_atual" | "no_estoque">): string | null {
  if (v.no_estoque !== true || v.preco_na_epoca === null || v.preco_atual === null) return null;
  return v.preco_na_epoca === v.preco_atual ? null : `era ${emReais(v.preco_na_epoca)}`;
}

/** A segunda linha de um carro na busca: "2020 · 45.000 km · R$ 59.900 · placa final 1D23". */
export function linhaDoCarroDaBusca(c: CarroDaBusca): string {
  const partes: string[] = [];
  if (typeof c.ano === "number") partes.push(String(c.ano));
  if (typeof c.km === "number") partes.push(`${c.km.toLocaleString("pt-BR")} km`);
  if (typeof c.preco === "number") partes.push(emReais(c.preco));
  if (c.placa_final) partes.push(`placa final ${c.placa_final}`);
  return partes.join(" · ");
}

/**
 * As opções que o bloco desenha, a partir do detalhe.
 *
 * `disponivel: false` é o painel antes da migração (ou uma resposta sem o
 * campo): o lead tem um carro só. A opção única vem de `veiculos` quando a
 * rota a manda, e de `veiculo` / `lead.veiculo_id` quando não.
 */
export function opcoesDoDetalhe(
  dados: Pick<DetalheDaApi, "lead" | "veiculo" | "veiculos" | "veiculos_disponivel">,
): { veiculos: VeiculoDeInteresse[]; disponivel: boolean } {
  const disponivel = dados.veiculos_disponivel === true;
  if (Array.isArray(dados.veiculos) && (disponivel || dados.veiculos.length > 0)) {
    return { veiculos: disponivel ? dados.veiculos : dados.veiculos.slice(0, 1), disponivel };
  }
  const id = dados.veiculo?.id ?? dados.lead.veiculo_id ?? null;
  if (id === null) return { veiculos: [], disponivel };
  const carro = dados.veiculo;
  return {
    disponivel,
    veiculos: [
      {
        id: null,
        veiculo_id: Number(id),
        rotulo: carro?.nome || `Veículo nº ${id}`,
        preco_na_epoca: null,
        preco_atual: carro?.preco ?? null,
        km: carro?.km ?? null,
        no_estoque: carro !== null,
        vendido: carro ? carro.vendido : null,
        situacao: "em_avaliacao",
        motivo_descarte: null,
        motivo_rotulo: null,
        nota: null,
        adicionado_por: null,
        criado_em: null,
        resolvido_por: null,
        resolvido_em: null,
        principal: true,
      },
    ],
  };
}

/**
 * "Tornar principal" cabe nesta opção? A regra é a de `planejarResolucoes`: o
 * carro não está descartado e nenhum outro está escolhido (o escolhido é
 * sempre o principal).
 */
export function podeTornarPrincipal(v: VeiculoDeInteresse, todas: readonly VeiculoDeInteresse[]): boolean {
  return !v.principal && v.situacao !== "descartado" && !todas.some((o) => o.situacao === "escolhido");
}

/** O carro que a busca devolveu, como a opção que ele vai virar (até o servidor responder). */
export function opcaoProvisoria(carro: CarroDaBusca, primeira: boolean): VeiculoDeInteresse {
  return {
    id: null,
    veiculo_id: carro.id,
    rotulo: carro.rotulo,
    preco_na_epoca: carro.preco ?? null,
    preco_atual: carro.preco ?? null,
    km: carro.km ?? null,
    no_estoque: true,
    vendido: carro.vendido === true,
    situacao: "em_avaliacao",
    motivo_descarte: null,
    motivo_rotulo: null,
    nota: null,
    adicionado_por: null,
    criado_em: null,
    resolvido_por: null,
    resolvido_em: null,
    principal: primeira,
  };
}

/**
 * O que a lista vira com uma mudança, antes de o servidor responder.
 *
 * Só o que a regra garante: escolher torna o carro o principal e reabre o
 * outro escolhido; descartar grava o motivo; reabrir limpa o motivo e mantém a
 * nota. Para quem passa o principal quando ele é descartado, a tela espera a
 * resposta.
 */
export function preverMudanca(
  veiculos: readonly VeiculoDeInteresse[],
  veiculoId: number,
  mudanca: MudancaDaOpcao,
): VeiculoDeInteresse[] {
  const viraPrincipal = mudanca.situacao === "escolhido" || mudanca.principal === true;
  return veiculos.map((v) => {
    if (v.veiculo_id !== veiculoId) {
      return {
        ...v,
        principal: viraPrincipal ? false : v.principal,
        situacao: mudanca.situacao === "escolhido" && v.situacao === "escolhido" ? "em_avaliacao" : v.situacao,
      };
    }
    const situacao = mudanca.situacao ?? v.situacao;
    const motivo = situacao === "descartado" ? (mudanca.motivo_descarte ?? v.motivo_descarte) : null;
    return {
      ...v,
      situacao,
      motivo_descarte: motivo,
      motivo_rotulo: motivo && ehMotivoDeDescarte(motivo) ? ROTULO_DO_MOTIVO_DE_DESCARTE[motivo] : motivo,
      nota: mudanca.nota === undefined ? v.nota : mudanca.nota,
      principal: viraPrincipal ? true : v.principal,
    };
  });
}

// ---------------------------------------------------------------------------
// O relatório por veículo
// ---------------------------------------------------------------------------

/** "37,5%" e "50%": o percentual como a tela o escreve. */
export function emPorcento(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** "02/09/2026", no calendário da loja. `null` para data ausente ou ilegível. */
export function diaDoInteresse(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "de 02/09/2026 a 01/10/2026", "em 02/09/2026", ou `null` sem data nenhuma. */
export function periodoDoInteresse(r: Pick<RelatorioDoVeiculo, "primeiro_interesse_em" | "ultimo_interesse_em">): string | null {
  const primeiro = diaDoInteresse(r.primeiro_interesse_em);
  const ultimo = diaDoInteresse(r.ultimo_interesse_em);
  if (primeiro && ultimo && primeiro !== ultimo) return `de ${primeiro} a ${ultimo}`;
  const unico = primeiro ?? ultimo;
  return unico ? `em ${unico}` : null;
}

/**
 * O relatório em texto corrido, para mandar ao dono de um carro consignado.
 *
 * Leva só contagens, motivos e datas. As NOTAS ficam de fora: são texto livre
 * do vendedor, e nada garante que não tragam nome ou telefone de cliente, nem
 * que sirvam para quem está fora da loja. Sem tom de venda e sem travessão.
 */
export function resumoDoInteresseEmTexto(nomeDoCarro: string | null | undefined, r: RelatorioDoVeiculo): string {
  const linhas: string[] = [];
  const nome = (nomeDoCarro ?? "").trim();
  linhas.push(nome ? `Interesse no ${nome}` : "Interesse no carro");
  const periodo = periodoDoInteresse(r);
  if (periodo) linhas.push(`Atendimentos registrados ${periodo}`);
  linhas.push("");
  linhas.push(`Atendimentos em que o carro foi considerado: ${r.total}`);
  linhas.push(`Ainda em avaliação: ${r.em_avaliacao}`);
  linhas.push(`Escolheram este carro: ${r.escolhido}`);
  linhas.push(`Descartaram este carro: ${r.descartado}`);
  if (r.motivos.length > 0) {
    linhas.push("");
    linhas.push("Motivos de quem descartou:");
    for (const m of r.motivos) linhas.push(`- ${m.rotulo}: ${m.total} (${emPorcento(m.percentual)})`);
  }
  return linhas.join("\n");
}

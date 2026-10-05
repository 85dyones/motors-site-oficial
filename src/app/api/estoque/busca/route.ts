import { NextResponse, type NextRequest } from "next/server";
import { lerComoEquipe } from "../../../../lib/colunasDoEstoque";
import { normalizarEstadoCadastro } from "../../../../lib/estadoDoCadastro";
import { sessaoDeLeads } from "../../../../lib/gestaoDoLead-servidor";
import { grafiaDoCarro } from "../../../../lib/grafiaCanonica";
import { nomeComAno } from "../../../../lib/nomeDoVeiculo";
import {
  LIMITE_DA_BUSCA_DE_CARRO,
  MINIMO_DA_BUSCA_DE_CARRO,
  filtroDaBuscaDeCarro,
  finalDaPlaca,
} from "../../../../lib/veiculosDeInteresse";

export const dynamic = "force-dynamic";

/** O que o seletor mostra de cada carro, mais a placa para o `placa_final`. */
const COLUNAS = "id, marca, modelo, versao, ano, quilometragem, preco, vendido, estado_cadastro, url_imagem, placa";

/**
 * A busca de carro do seletor de veículo de interesse (05/10/2026): o dono
 * pediu que o carro seja ESCOLHIDO BUSCANDO, e não digitando o código.
 * Contrato em `docs/GESTAO_DO_LEAD.md`, "Veículos de interesse".
 *
 * `GET /api/estoque/busca?q=` devolve até 12 carros: marca, modelo, versão e
 * ano (cada palavra em qualquer um), o código do carro, e a placa.
 *
 * ---------------------------------------------------------------------------
 * Quem busca, e a placa
 * ---------------------------------------------------------------------------
 * A porta é a dos leads (`sessaoDeLeads`): equipe ativa que vê lead. É quem
 * usa o seletor.
 *
 * A placa é coluna interna. Hoje toda a EQUIPE a lê, e só a equipe, pela view
 * `estoque_motors_equipe` (`lib/colunasDoEstoque`): é por onde esta leitura
 * vai, com a sessão, e é o banco quem corta quem não é equipe. A rota não
 * alarga isso: busca pela placa quem já a lê, e a resposta leva só os QUATRO
 * ÚLTIMOS caracteres (`placa_final`), o bastante para distinguir dois carros
 * iguais no pátio. Chassi, renavam, custo e FIPE não são pedidos ao banco.
 *
 * Carro vendido e carro fora da vitrine VÊM, com `vendido` e `publicado`: o
 * cliente pergunta pelo carro que viu ontem, e a tela é quem avisa.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const filtro = filtroDaBuscaDeCarro(new URL(request.url).searchParams.get("q"), { comPlaca: true });
    if (!filtro) {
      return NextResponse.json(
        {
          error: `Digite ao menos ${MINIMO_DA_BUSCA_DE_CARRO} caracteres: marca, modelo, ano, placa ou código do carro.`,
          codigo: "busca_curta",
        },
        { status: 400 },
      );
    }

    const { data, error } = await lerComoEquipe((origem) => {
      let consulta = supabase.from(origem).select(COLUNAS);
      // Um `or` por palavra: o carro casa com TODAS, cada uma em qualquer coluna.
      for (const ramo of filtro.ramos) consulta = consulta.or(ramo);
      return consulta
        .order("vendido", { ascending: true, nullsFirst: true })
        .order("id", { ascending: false })
        .limit(LIMITE_DA_BUSCA_DE_CARRO);
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const veiculos = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((v) => {
      const placaFinal = finalDaPlaca(v.placa);
      const foto = typeof v.url_imagem === "string" && v.url_imagem.trim() !== "" ? v.url_imagem : null;
      return {
        id: Number(v.id),
        rotulo: nomeComAno({
          ...grafiaDoCarro({
            marca: String(v.marca ?? ""),
            modelo: String(v.modelo ?? ""),
            versao: typeof v.versao === "string" ? v.versao : null,
          }),
          ano: v.ano as number | string | null,
        }),
        ano: v.ano ?? null,
        km: v.quilometragem ?? null,
        preco: v.preco ?? null,
        ...(placaFinal ? { placa_final: placaFinal } : {}),
        ...(foto ? { foto } : {}),
        vendido: v.vendido === true,
        publicado: normalizarEstadoCadastro(v.estado_cadastro) === "publicado",
      };
    });

    return NextResponse.json({ veiculos, termos: filtro.termos });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

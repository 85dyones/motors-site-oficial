import { NextRequest, NextResponse } from "next/server";
import { configuracaoDaApiBrasil } from "../../../lib/apiBrasil";
import { cnpjValido, soCaracteresDoCnpj } from "../../../lib/cnpj";
import { cpfValido, soDigitosDoCpf } from "../../../lib/cpf";
import { PRODUTOS, lerPedidoDeDocumento, niveisDe, precoDeReferencia } from "../../../lib/consultaDeDocumento";
import {
  autorizarConsultaDeDocumento,
  consultasRecentesDoDocumento,
  executarConsulta,
  lerHistoricoDeDocumentos,
} from "../../../lib/consultaDeDocumento-servidor";

export const dynamic = "force-dynamic";
// Os produtos de crédito juntam vários bureaus e podem levar dezenas de segundos.
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `/api/consulta-documento` — a consulta de CPF e CNPJ (dono, 18/10/2026).
 *
 * `POST { acao: "estimar", tipo, documento }`: não cobra. Devolve os níveis
 * com o preço de referência de cada um e as consultas deste documento já
 * feitas nos últimos 90 dias (que reabrem sem custo).
 *
 * `POST { acao: "consultar", tipo, documento, nivel, finalidade, titularCiente }`:
 * cobra. Finalidade e declaração do titular são obrigatórias (LGPD).
 *
 * `GET ?q=&tipo=`: o histórico, com pesquisa.
 *
 * A porta é a ação "Consultar CPF e CNPJ (consulta paga)": Administrador,
 * Gestor, Comercial e Financeiro, a mesma RLS das tabelas.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarConsultaDeDocumento();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });
  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (corpo?.acao === "estimar") {
    const tipo = corpo.tipo === "cpf" || corpo.tipo === "cnpj" ? corpo.tipo : null;
    const bruto = typeof corpo.documento === "string" ? corpo.documento : "";
    const documento = tipo === "cpf" ? soDigitosDoCpf(bruto) : soCaracteresDoCnpj(bruto);
    if (!tipo || (tipo === "cpf" ? !cpfValido(documento) : !cnpjValido(documento))) {
      return NextResponse.json({ error: tipo === "cnpj" ? "CNPJ inválido: confira os dígitos." : "CPF inválido: confira os dígitos." }, { status: 400, headers: SEM_CACHE });
    }
    const { token, homologacao } = configuracaoDaApiBrasil();
    return NextResponse.json(
      {
        niveis: niveisDe(tipo).map((n) => ({ ...n, preco: precoDeReferencia(n), nomesDosProdutos: n.produtos.map((p) => PRODUTOS[p].nome) })),
        recentes: await consultasRecentesDoDocumento(porta.supabase, tipo, documento),
        temToken: token !== null,
        homologacao,
      },
      { headers: SEM_CACHE },
    );
  }

  if (corpo?.acao !== "consultar") return NextResponse.json({ error: "Pedido sem ação." }, { status: 400, headers: SEM_CACHE });
  const leitura = lerPedidoDeDocumento(corpo);
  if (!leitura.ok) return NextResponse.json({ error: leitura.motivo }, { status: 400, headers: SEM_CACHE });
  const { token, homologacao } = configuracaoDaApiBrasil();
  const r = await executarConsulta(porta.supabase, leitura.pedido, { token, homologacao });
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ id: r.id, relatorio: r.relatorio, custo: r.custo, avisos: r.avisos }, { headers: SEM_CACHE });
}

export async function GET(request: NextRequest) {
  const porta = await autorizarConsultaDeDocumento();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });
  const p = request.nextUrl.searchParams;
  const tipo = p.get("tipo") === "cpf" || p.get("tipo") === "cnpj" ? (p.get("tipo") as "cpf" | "cnpj") : null;
  const leitura = await lerHistoricoDeDocumentos(porta.supabase, { termo: (p.get("q") ?? "").slice(0, 60) || null, tipo });
  if (!leitura.ok) return NextResponse.json({ error: leitura.motivo, faltaMigracao: leitura.faltaMigracao }, { status: 502, headers: SEM_CACHE });
  return NextResponse.json(leitura, { headers: SEM_CACHE });
}

import { NextRequest, NextResponse } from "next/server";
import { configuracaoDaApiBrasil } from "../../../lib/apiBrasil";
import { cnpjValido, soCaracteresDoCnpj } from "../../../lib/cnpj";
import { cpfValido, soDigitosDoCpf } from "../../../lib/cpf";
import { PRODUTOS, lerPedidoDeDocumento, niveisDe, precoDeReferencia } from "../../../lib/consultaDeDocumento";
import {
  MIGRACAO_DAS_CONSULTAS_DE_DOCUMENTO,
  autorizarConsultaDeDocumento,
  clienteDeGravacao,
  consultasRecentesDoDocumento,
  executarConsulta,
  lerHistoricoDeDocumentos,
  lerParametrosDaConsulta,
} from "../../../lib/consultaDeDocumento-servidor";

export const dynamic = "force-dynamic";
// Os produtos de crédito juntam vários bureaus e podem levar dezenas de segundos.
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `/api/consulta-documento` — a consulta de CPF e CNPJ (dono, 18/10/2026).
 *
 * `POST { acao: "estimar", tipo, documento }`: não cobra nem chama o
 * fornecedor. Devolve os níveis com o preço de referência (da tabela vigente
 * em `parametros_consulta_documento`) e as consultas deste documento da
 * janela dos parâmetros, que reabrem sem custo.
 *
 * `POST { acao: "consultar", tipo, documento, nivel, finalidade, titularCiente, repetir? }`:
 * cobra. Finalidade e declaração do titular são obrigatórias (LGPD). A mesma
 * consulta feita há pouco volta 409 com a anterior, até vir `repetir: true`.
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
  const leituraDosParametros = await lerParametrosDaConsulta(porta.supabase);
  if (!leituraDosParametros.ok) {
    const motivo = leituraDosParametros.faltaMigracao ? `Falta a migração ${MIGRACAO_DAS_CONSULTAS_DE_DOCUMENTO} no banco.` : leituraDosParametros.motivo;
    return NextResponse.json({ error: motivo }, { status: 503, headers: SEM_CACHE });
  }
  const parametros = leituraDosParametros.parametros;

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
        niveis: niveisDe(tipo).map((n) => ({ ...n, preco: precoDeReferencia(n, parametros.precos), nomesDosProdutos: n.produtos.map((p) => PRODUTOS[p].nome) })),
        recentes: await consultasRecentesDoDocumento(porta.supabase, tipo, documento, { dias: parametros.diasDeConsultaRecente, homologacao }),
        diasDeConsultaRecente: parametros.diasDeConsultaRecente,
        tabelaDePrecosEm: parametros.tabelaDePrecosEm,
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
  const r = await executarConsulta(
    porta.supabase,
    { ...leitura.pedido, repetir: corpo.repetir === true },
    { token, homologacao, usuarioId: porta.usuarioId, parametros, gravacao: clienteDeGravacao() },
  );
  if (!r.ok && r.status === 409) return NextResponse.json({ error: r.motivo, repeticao: r.repeticao }, { status: 409, headers: SEM_CACHE });
  if (!r.ok) return NextResponse.json({ error: r.motivo, id: r.id, podeTerCobrado: r.podeTerCobrado }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ id: r.id, situacao: r.situacao, relatorio: r.relatorio, custo: r.custo, avisos: r.avisos }, { headers: SEM_CACHE });
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

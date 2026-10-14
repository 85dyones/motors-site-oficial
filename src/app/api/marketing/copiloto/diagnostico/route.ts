import { NextResponse, type NextRequest } from "next/server";
import { diagnosticar, validarDiagnostico } from "../../../../../lib/copilotoDeMidia";
import {
  autorizarScript,
  contarLeadsDaJanela,
  gravarDiagnostico,
  lerRegras,
  motivoDoErro,
} from "../../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/copiloto/diagnostico` — o retrato diário da conta.
 *
 * Valida (`validarDiagnostico`: forma torta recusa o retrato inteiro, e é o
 * sinal de que o script colado na conta está desatualizado), conta os leads
 * da mesma janela, aplica as regras vigentes da loja (`diagnosticar`) e grava
 * retrato, achados e propostas numa transação
 * (`midia_copiloto_gravar_diagnostico`). A resposta é só a contagem: o
 * registro do script diz quantas propostas esperam aprovação.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarScript(request.headers);
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const validacao = validarDiagnostico(await request.json().catch(() => null));
  if (!validacao.ok) {
    console.warn(`[Copiloto] diagnóstico recusado: ${validacao.erro}`);
    return NextResponse.json({ error: `diagnóstico recusado: ${validacao.erro}` }, { status: 400, headers: SEM_CACHE });
  }
  const d = validacao.valor;

  try {
    const regras = await lerRegras(porta.admin);
    if (!regras.ok) {
      const { status, motivo } = regras.faltaMigracao ? motivoDoErro({ code: "42P01" }) : { status: 500, motivo: regras.motivo };
      return NextResponse.json({ error: motivo }, { status, headers: SEM_CACHE });
    }
    // O calendário dos leads é o da conta: o "ontem" do Google é o ontem dela.
    const leads = await contarLeadsDaJanela(porta.admin, d.janela, d.conta.fuso ?? "UTC");
    const resultado = diagnosticar(d, leads, regras.valor.parametros);
    const gravado = await gravarDiagnostico(porta.admin, d, resultado);
    return NextResponse.json({ ok: true, ...gravado }, { headers: SEM_CACHE });
  } catch (erro) {
    const { status, motivo } = motivoDoErro(erro);
    console.error(`[Copiloto] /diagnostico: ${motivo}`);
    return NextResponse.json({ error: motivo }, { status, headers: SEM_CACHE });
  }
}

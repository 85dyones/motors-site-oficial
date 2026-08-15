import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { autorizarMotor } from "../../../../../lib/ciclo/autorizacaoDoMotor";
import {
  mensagemDaFilaDeVerificacao,
  type PendenteDeVerificacao,
} from "../../../../../lib/ciclo/motor";
import { urlDoSite } from "../../../../../lib/site";

export const dynamic = "force-dynamic";

/**
 * O aviso de verificação, do lado de dentro: a fila da A21 que ninguém
 * carimbou.
 *
 * Este é o gatilho que não aponta para o cliente e sim para a loja. Lançamento
 * sem carimbo não conta para a conformidade do §1.4 (regra do §5.7: registrar
 * não é o ativo, o carimbo é) — uma fila parada trava o indicador que destrava
 * o programa inteiro, e trava em silêncio.
 *
 * Pendente = sem carimbo E sem recusa. A recusa saiu da definição em
 * `20260814180000_motor_de_gatilhos.sql`: antes dela, um lançamento recusado
 * ficava na fila para sempre e este aviso cobraria a equipe todo dia por algo
 * que já estava resolvido.
 */
export async function GET(request: Request) {
  const auth = await autorizarMotor(request);
  if (auth.erro) return auth.erro;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    console.error("[Ciclo/Motor] SUPABASE_SERVICE_ROLE_KEY ausente — fila de verificação indisponível.");
    return NextResponse.json(
      { error: "Motor de gatilhos indisponível: credencial de serviço não configurada." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("manutencoes")
    .select(
      `id, data_servico, km_registrado, origem_registro, url_etiqueta_atual, criada_em,
       veiculo:veiculos_vendidos ( placa, cliente:clientes ( nome ) )`,
    )
    .is("confirmada_em", null)
    .is("recusada_em", null)
    .order("criada_em", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[Ciclo/Motor] Falha ao ler a fila de verificação:", error.message);
    return NextResponse.json(
      { error: "Não foi possível ler a fila de verificação." },
      { status: 502 },
    );
  }

  const agora = Date.now();
  const itens: PendenteDeVerificacao[] = (data ?? []).map((m: any) => ({
    id: m.id,
    placa: m.veiculo?.placa ?? "—",
    cliente: m.veiculo?.cliente?.nome ?? "—",
    data_servico: m.data_servico,
    km_registrado: m.km_registrado ?? null,
    origem_registro: m.origem_registro,
    tem_etiqueta: Boolean(m.url_etiqueta_atual),
    dias_na_fila: Math.max(
      0,
      Math.floor((agora - new Date(m.criada_em).getTime()) / 86_400_000),
    ),
  }));

  return NextResponse.json({
    ok: true,
    pendentes: itens.length,
    // `null` quando a fila está vazia: o workflow não manda nada, e o aviso
    // continua significando alguma coisa no dia em que aparece.
    mensagem: mensagemDaFilaDeVerificacao(itens, urlDoSite("/admin/ciclo/verificacao")),
    itens,
  });
}

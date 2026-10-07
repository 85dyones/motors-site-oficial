import { NextRequest, NextResponse } from "next/server";
import { configuracaoDaApiBrasil, consultarVeiculosTotal } from "../../../lib/apiBrasil";
import {
  PRODUTO_VEICULOS_TOTAL,
  lerRespostaDaApiBrasil,
  mesclarGratuito,
  normalizarPlaca,
} from "../../../lib/consultaDePlaca";
import {
  MIGRACAO_DA_CONSULTA_DE_PLACA,
  autorizarConsultaDePlaca,
  gravarConsulta,
  lerUltimaConsulta,
  type ConsultaGuardada,
} from "../../../lib/consultaDePlaca-servidor";
import { consultarGratuito } from "../../../lib/consultaGratuita";
import { registrarFalha } from "../../../lib/observabilidade";

export const dynamic = "force-dynamic";
// A consulta paga espera até 45 s pelo fornecedor, e a gratuita vem depois.
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/consulta-placa` — o retrato de um carro pela placa.
 *
 * Corpo: `{ placa, refazer?, soGuardada? }`. `soGuardada` pergunta só pelo que
 * já está no banco e nunca chega ao fornecedor: é o primeiro passo da tela,
 * que só então pede a confirmação de quem vai gastar.
 *
 * A ordem existe para não gastar dinheiro à toa:
 *   1. sessão e papel (matriz: Administrador, Gestor, Comercial);
 *   2. placa numa das duas máscaras;
 *   3. a consulta GUARDADA dessa placa. Havendo uma e sem `refazer`, é ela que
 *      volta, sem custo. Esta leitura roda SEMPRE, mesmo com `refazer`: é ela
 *      que descobre a tabela ausente ANTES de pagar por um retrato que não
 *      teria onde ser guardado;
 *   4. o token do fornecedor;
 *   5. a consulta paga, uma chamada, sem nova tentativa (`lib/apiBrasil.ts`);
 *   6. a parte sem custo, mesclada por cima (`lib/consultaGratuita.ts`). Ela
 *      nunca derruba a consulta;
 *   7. gravar. Se a gravação falhar, o retrato VOLTA assim mesmo, com o aviso:
 *      a consulta já foi paga, e perdê-la seria pagar de novo.
 *
 * A resposta crua do fornecedor (que traz nome e CPF de proprietário) não é
 * gravada nem devolvida: só o retrato sai daqui.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarConsultaDePlaca();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const corpo = (await request.json().catch(() => null)) as { placa?: unknown; refazer?: unknown; soGuardada?: unknown } | null;
  const placa = normalizarPlaca(corpo?.placa);
  if (!placa) {
    return NextResponse.json(
      { error: "Placa inválida. Use o formato ABC1234 ou ABC1D23.", codigo: "placa_invalida" },
      { status: 400, headers: SEM_CACHE },
    );
  }

  const guardada = await lerUltimaConsulta(porta.supabase, placa);
  if (!guardada.ok) {
    return NextResponse.json(
      {
        error: guardada.faltaMigracao
          ? `A tabela das consultas ainda não existe no banco: falta aplicar a migração ${MIGRACAO_DA_CONSULTA_DE_PLACA}. Nada foi consultado nem cobrado.`
          : "Não deu para ler as consultas guardadas agora. Nada foi consultado nem cobrado.",
        codigo: guardada.faltaMigracao ? "falta_migracao" : "leitura_falhou",
      },
      { status: 503, headers: SEM_CACHE },
    );
  }
  if (guardada.consulta && corpo?.refazer !== true) {
    return NextResponse.json({ consulta: guardada.consulta, guardada: true }, { headers: SEM_CACHE });
  }

  if (corpo?.soGuardada === true) {
    return NextResponse.json({ consulta: guardada.consulta, guardada: true }, { headers: SEM_CACHE });
  }

  const { token, homologacao } = configuracaoDaApiBrasil();
  if (!token) {
    return NextResponse.json(
      { error: "Falta configurar APIBRASIL_TOKEN na Vercel. Nada foi consultado nem cobrado.", codigo: "sem_token" },
      { status: 503, headers: SEM_CACHE },
    );
  }

  const rede = await consultarVeiculosTotal(placa, { token, homologacao });
  if (!rede.ok) {
    // Sem saldo é PARADA, e não quebra: a tela funciona, quem parou foi o
    // fornecedor, e quem resolve é o dono, pondo crédito. Vai ao WhatsApp.
    if (rede.status === 402) {
      await registrarFalha("parada", "apibrasil-sem-saldo", "A consulta de placa parou: a conta da APIBrasil está sem saldo.", {
        rota: "/api/consulta-placa",
        metodo: "POST",
        origem: "servidor",
      });
    }
    return NextResponse.json(
      { error: rede.motivo, podeTerCobrado: rede.podeTerCobrado },
      { status: rede.status, headers: SEM_CACHE },
    );
  }

  const leitura = lerRespostaDaApiBrasil(rede.corpo, placa);
  if (!leitura.ok) {
    return NextResponse.json({ error: leitura.motivo, podeTerCobrado: false }, { status: 502, headers: SEM_CACHE });
  }

  const gratuito = await consultarGratuito({
    cnpj: leitura.retrato.primeiroFaturamento.cnpj,
    codigoFipe: leitura.retrato.fipe?.codigo ?? null,
    anoModelo: leitura.retrato.veiculo.anoModelo,
  });
  const retrato = mesclarGratuito(leitura.retrato, gratuito);

  const gravacao = await gravarConsulta(porta.supabase, {
    placa,
    produto: PRODUTO_VEICULOS_TOTAL,
    retrato,
    custo: leitura.custo,
    homologacao: leitura.homologacao,
  });
  if (!gravacao.ok) {
    console.error("[Consulta de placa] A consulta foi paga e não foi gravada:", gravacao.motivo);
    await registrarFalha("quebra", "consulta-de-placa-nao-gravada", gravacao.motivo, {
      rota: "/api/consulta-placa",
      metodo: "POST",
      origem: "servidor",
    });
    const avulsa: ConsultaGuardada = {
      id: null,
      placa,
      retrato,
      custo: leitura.custo,
      homologacao: leitura.homologacao,
      criadoEm: new Date().toISOString(),
      consultadoPor: null,
    };
    return NextResponse.json(
      {
        consulta: avulsa,
        guardada: false,
        saldo: leitura.saldo,
        aviso: "A consulta foi feita e cobrada, mas NÃO foi guardada. Não feche esta tela: abrir a placa de novo vai cobrar outra vez.",
      },
      { headers: SEM_CACHE },
    );
  }

  return NextResponse.json({ consulta: gravacao.consulta, guardada: false, saldo: leitura.saldo }, { headers: SEM_CACHE });
}

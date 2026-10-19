import { NextRequest, NextResponse } from "next/server";
import { configuracaoDaApiBrasil } from "../../../lib/apiBrasil";
import { normalizarPlaca } from "../../../lib/consultaDePlaca";
import { MIGRACAO_DA_CONSULTA_DE_PLACA, autorizarConsultaDePlaca, lerUltimaConsulta } from "../../../lib/consultaDePlaca-servidor";
import { nivelDaPlaca } from "../../../lib/niveisDaPlaca";
import {
  MIGRACAO_DOS_NIVEIS_DA_PLACA,
  consultarPlacaPorNivel,
  lerParametrosDaPlaca,
  niveisComPreco,
  opcoesDeAprofundar,
} from "../../../lib/niveisDaPlaca-servidor";
import { registrarFalha } from "../../../lib/observabilidade";

export const dynamic = "force-dynamic";
// Os produtos esperam até 45 s pelo fornecedor (todos de uma vez), e a parte gratuita vem depois.
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/consulta-placa` — o retrato de um carro pela placa, em níveis
 * (dono, 19/10/2026).
 *
 * Corpo:
 *   `{ placa, soGuardada: true }` — nunca chega ao fornecedor. Devolve a
 *     consulta guardada (se houver), os níveis com o preço da tabela vigente
 *     e, para a guardada, quanto custa aprofundar até cada nível acima.
 *   `{ placa, nivel, aprofundarDe?, repetir? }` — cobra. `aprofundarDe` é o
 *     id de uma consulta guardada desta placa: os produtos dela são
 *     reaproveitados e só os que faltam são pagos. O mesmo nível da mesma
 *     placa consultado há pouco volta 409 até vir `repetir`.
 *   `{ placa, refazer: true }` sem `nivel` — compatibilidade: é o completo.
 *
 * A ordem existe para não gastar dinheiro à toa: sessão e papel; placa; a
 * consulta guardada (descobre a tabela ausente ANTES de pagar); os
 * parâmetros (preços e prazos); o token; a consulta paga, sem nova
 * tentativa; a parte sem custo; gravar — e, se a gravação falhar, o retrato
 * volta assim mesmo, com o aviso: a consulta já foi paga.
 *
 * A resposta crua do fornecedor (nome e CPF de proprietário) não é gravada
 * nem devolvida: só o retrato e os fragmentos, sem dado pessoal.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarConsultaDePlaca();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const corpo = (await request.json().catch(() => null)) as {
    placa?: unknown;
    refazer?: unknown;
    soGuardada?: unknown;
    nivel?: unknown;
    aprofundarDe?: unknown;
    repetir?: unknown;
  } | null;
  const placa = normalizarPlaca(corpo?.placa);
  if (!placa) {
    return NextResponse.json({ error: "Placa inválida. Use o formato ABC1234 ou ABC1D23.", codigo: "placa_invalida" }, { status: 400, headers: SEM_CACHE });
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

  const { token, homologacao } = configuracaoDaApiBrasil();
  const parametros = await lerParametrosDaPlaca(porta.supabase);

  if (corpo?.soGuardada === true) {
    return NextResponse.json(
      {
        consulta: guardada.consulta,
        guardada: true,
        niveis: parametros.ok ? niveisComPreco(parametros.parametros.precos) : null,
        aprofundar: parametros.ok && guardada.consulta ? opcoesDeAprofundar(guardada.consulta, parametros.parametros, homologacao) : [],
        tabelaDePrecosEm: parametros.ok ? parametros.parametros.tabelaDePrecosEm : null,
        avisoDosNiveis: parametros.ok
          ? null
          : parametros.faltaMigracao
            ? `Falta aplicar a migração ${MIGRACAO_DOS_NIVEIS_DA_PLACA}: as consultas guardadas abrem, mas consultar de novo espera por ela.`
            : parametros.motivo,
      },
      { headers: SEM_CACHE },
    );
  }

  const nivel = corpo?.nivel === undefined && corpo?.refazer === true ? nivelDaPlaca("completo") : nivelDaPlaca(corpo?.nivel);
  if (!nivel) return NextResponse.json({ error: "Escolha o nível da consulta.", codigo: "sem_nivel" }, { status: 400, headers: SEM_CACHE });

  if (!parametros.ok) {
    return NextResponse.json(
      {
        error: parametros.faltaMigracao ? `Falta aplicar a migração ${MIGRACAO_DOS_NIVEIS_DA_PLACA}. Nada foi consultado nem cobrado.` : `${parametros.motivo} Nada foi consultado nem cobrado.`,
        codigo: parametros.faltaMigracao ? "falta_migracao" : "sem_parametros",
      },
      { status: 503, headers: SEM_CACHE },
    );
  }
  if (!token) {
    return NextResponse.json({ error: "Falta configurar APIBRASIL_TOKEN na Vercel. Nada foi consultado nem cobrado.", codigo: "sem_token" }, { status: 503, headers: SEM_CACHE });
  }

  const r = await consultarPlacaPorNivel(
    porta.supabase,
    { placa, nivel: nivel.id, aprofundarDe: typeof corpo?.aprofundarDe === "string" ? corpo.aprofundarDe : null, repetir: corpo?.repetir === true },
    { token, homologacao, parametros: parametros.parametros },
  );

  if (!r.ok && r.status === 409) return NextResponse.json({ error: r.motivo, repeticao: r.repeticao }, { status: 409, headers: SEM_CACHE });
  if (!r.ok) {
    // Sem saldo é PARADA, e não quebra: quem resolve é o dono, pondo crédito. Vai ao WhatsApp.
    if (r.status === 402) {
      await registrarFalha("parada", "apibrasil-sem-saldo", "A consulta de placa parou: a conta da APIBrasil está sem saldo.", { rota: "/api/consulta-placa", metodo: "POST", origem: "servidor" });
    }
    // Nada voltou, mas pode ter cobrado: não há linha no banco para contar, então fica o registro da falha.
    if (r.status !== 402 && r.podeTerCobrado) {
      await registrarFalha("quebra", "consulta-de-placa-sem-retorno", `A consulta de ${placa} (${nivel.rotulo}) não voltou e pode ter sido cobrada.`, { rota: "/api/consulta-placa", metodo: "POST", origem: "servidor" });
    }
    return NextResponse.json({ error: r.motivo, podeTerCobrado: r.podeTerCobrado }, { status: r.status, headers: SEM_CACHE });
  }

  if (!r.gravada) {
    await registrarFalha("quebra", "consulta-de-placa-nao-gravada", "A consulta de placa foi paga e não foi gravada.", { rota: "/api/consulta-placa", metodo: "POST", origem: "servidor" });
  }
  const aprofundar = r.consulta.id ? opcoesDeAprofundar(r.consulta, parametros.parametros, homologacao) : [];
  return NextResponse.json(
    {
      consulta: r.consulta,
      guardada: false,
      saldo: r.saldo,
      aprofundar,
      avisos: r.avisos,
      // Compatibilidade com a tela antiga: um aviso só.
      aviso: r.avisos.length ? r.avisos.join(" ") : undefined,
    },
    { headers: SEM_CACHE },
  );
}

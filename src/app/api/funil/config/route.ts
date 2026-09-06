import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import {
  chaveDaEtapa,
  ehTipoDeDesfecho,
  ehTipoDeEtapa,
  motivosDepoisDeGravar,
  ordenarEtapas,
  validarFunil,
  type EtapaDoFunil,
  type MotivoDoFunil,
} from "../../../../lib/funil";

export const dynamic = "force-dynamic";

/**
 * O funil, editável — etapas e motivos numa porta só (tela A8-config).
 *
 * 2026-08-28, pedido do dono: *"temos que ser capazes de editar o funil de
 * vendas de acordo com a necessidade"*.
 *
 * **Uma rota para as duas coleções, e não duas rotas.** Etapas e motivos são
 * editados na mesma tela, no mesmo gesto ("salvar o funil"), e são
 * interdependentes: desativar a etapa de perdido sem mexer nos motivos deixa
 * uma lista de motivos que nada mais alcança. Salvar junto é o que permite
 * validar o conjunto ANTES de gravar qualquer parte dele.
 *
 * **Ler é de todo staff; escrever é de quem responde pelo processo.** O
 * kanban precisa das etapas para desenhar as colunas — negar a leitura ao
 * Comercial deixaria a tela sem colunas. Mudar a régua, não: quem mexe no
 * funil mexe no prazo de cobrança de todo mundo. A RLS repete a mesma régua;
 * as duas camadas precisam concordar.
 */
async function sessao() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile)) {
    return { erro: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  return { supabase, perfis: perfisDe(profile), erro: null as null };
}

export async function GET() {
  try {
    const s = await sessao();
    if (s.erro) return s.erro;
    const { supabase, perfis } = s;

    const [etapas, motivos] = await Promise.all([
      supabase.from("funil_etapas").select("*").order("ordem"),
      supabase.from("funil_motivos").select("*").order("tipo").order("ordem"),
    ]);

    // Antes da migração 20260828120000 as tabelas não existem. A tela mostra o
    // aviso de migração pendente em vez de um erro cru — mesma conduta do
    // kanban, que já convive com esse estado desde agosto.
    if (etapas.error) {
      if (ehTabelaOuColunaAusente(etapas.error)) {
        return NextResponse.json({ migracaoPendente: true, etapas: [], motivos: [] });
      }
      return NextResponse.json({ error: etapas.error.message }, { status: 500 });
    }

    return NextResponse.json({
      etapas: ordenarEtapas((etapas.data ?? []) as EtapaDoFunil[]),
      motivos: (motivos.data ?? []) as MotivoDoFunil[],
      podeEditar: podeFazer(perfis, "Configurar o funil de vendas") === "faz",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Grava o funil inteiro de uma vez.
 *
 * A ordem dos três passos importa e não é acidental:
 *
 *  1. **valida o conjunto**, antes de tocar no banco. Uma tela que grava
 *     metade e depois recusa a outra metade deixa o funil num estado que
 *     ninguém pediu.
 *  2. **cria e atualiza** (upsert por chave).
 *  3. **desativa** o que sumiu da tela — nunca apaga. Etapa apagada levaria
 *     junto os leads que estão nela (a FK recusaria, e o dono veria um erro
 *     de banco sem tradução). Desativar mantém o histórico e a coluna
 *     continua aparecendo no kanban enquanto tiver card dentro.
 */
export async function PUT(request: NextRequest) {
  try {
    const s = await sessao();
    if (s.erro) return s.erro;
    const { supabase, perfis } = s;

    // A matriz A17 é a fonte, e não um `includes` escrito aqui: em 2026-08-19
    // o multi-papel já mostrou o custo de cada rota inventar o próprio recorte
    // — quem é comercial E gestor precisa valer pelo mais permissivo dos dois.
    if (podeFazer(perfis, "Configurar o funil de vendas") !== "faz") {
      return NextResponse.json(
        { error: "Só Administrador e Gestor mudam o funil — ele vale para a equipe inteira." },
        { status: 403 },
      );
    }

    const corpo = await request.json().catch(() => ({} as any));
    const etapasRecebidas: any[] = Array.isArray(corpo?.etapas) ? corpo.etapas : [];
    const motivosRecebidos: any[] = Array.isArray(corpo?.motivos) ? corpo.motivos : [];

    if (etapasRecebidas.length === 0) {
      return NextResponse.json({ error: "Nenhuma etapa recebida." }, { status: 400 });
    }

    const etapas: EtapaDoFunil[] = etapasRecebidas.map((e, i) => ({
      // Chave só nasce uma vez. Se veio do cliente, é etapa que já existe —
      // reescrevê-la a partir do rótulo renomeado quebraria a FK de todo lead
      // parado nela.
      chave: (e.chave || chaveDaEtapa(e.rotulo || "")).trim(),
      rotulo: String(e.rotulo ?? "").trim(),
      ordem: Number.isFinite(e.ordem) ? Number(e.ordem) : i + 1,
      // Recusa, não converte. O ternário que estava aqui virava `aberta`
      // qualquer tipo desconhecido — e no dia em que entrou o descarte ele
      // transformaria a etapa terminal numa coluna do quadro, em silêncio.
      tipo: e.tipo as EtapaDoFunil["tipo"],
      estagnacao_minutos: numeroOuNulo(e.estagnacao_minutos),
      transferencia_minutos: numeroOuNulo(e.transferencia_minutos),
      protegida: e.protegida === true,
      ativa: e.ativa !== false,
      cor: e.cor ? String(e.cor) : null,
    }));

    const tipoInvalido = etapasRecebidas.find((e) => !ehTipoDeEtapa(e.tipo));
    if (tipoInvalido) {
      return NextResponse.json(
        { error: `Tipo de etapa desconhecido: "${tipoInvalido.tipo}".` },
        { status: 422 },
      );
    }

    const semChave = etapas.find((e) => !e.chave);
    if (semChave) {
      return NextResponse.json(
        { error: `A etapa "${semChave.rotulo}" não gerou uma chave válida. Use letras no nome.` },
        { status: 400 },
      );
    }

    const motivoInvalido = motivosRecebidos
      .filter((m) => String(m?.rotulo ?? "").trim())
      .find((m) => !ehTipoDeDesfecho(m.tipo));
    if (motivoInvalido) {
      return NextResponse.json(
        { error: `Tipo de motivo desconhecido: "${motivoInvalido.tipo}".` },
        { status: 422 },
      );
    }

    const motivos: MotivoDoFunil[] = motivosRecebidos
      .filter((m) => String(m?.rotulo ?? "").trim())
      .map((m, i) => ({
        chave: (m.chave || chaveDaEtapa(m.rotulo)).trim(),
        rotulo: String(m.rotulo).trim(),
        tipo: m.tipo as MotivoDoFunil["tipo"],
        ordem: Number.isFinite(m.ordem) ? Number(m.ordem) : i + 1,
        ativo: m.ativo !== false,
      }));

    // A mesma guarda que as etapas já tinham. `chaveDaEtapa("???")` devolve
    // string vazia, e um motivo sem chave é gravado, vira botão na caixa e
    // estoura na hora de fechar — dos dois lados, com mensagem diferente.
    const motivoSemChave = motivos.find((m) => !m.chave);
    if (motivoSemChave) {
      return NextResponse.json(
        {
          error:
            `O motivo "${motivoSemChave.rotulo}" não gerou uma chave válida. Use letras no nome.`,
        },
        { status: 400 },
      );
    }

    // A validação vem DEPOIS de normalizar os motivos, e recebe os dois.
    // Antes ela só via as etapas, e por isso não tinha como perceber uma
    // etapa terminal ativa sem nenhum motivo ativo para oferecer — o beco
    // sem saída que a revisão de 05/09 encontrou.
    //
    // O que ela julga é o estado DEPOIS de gravar, e não a lista do corpo:
    // `motivosDepoisDeGravar` explica por quê.
    //
    // E quando não dá para saber, ela recebe `null` em vez de uma lista vazia.
    // A primeira versão só tratava `error`, e a revisão de 06/09 mostrou o
    // furo: a RLS deste projeto bloqueia devolvendo `200`, `[]` e `error`
    // nulo. Num PUT que só mexe em prazo de etapa — corpo sem motivo nenhum —
    // isso virava três erros acusando o dono de ter deixado o funil sem saída.
    const { data: motivosAtuais, error: erroMotivosAtuais } = await supabase
      .from("funil_motivos")
      .select("*");
    const atuais = (motivosAtuais ?? []) as MotivoDoFunil[];
    const conhecidos = !erroMotivosAtuais && atuais.length > 0;
    const problemas = validarFunil(
      etapas,
      conhecidos
        ? motivosDepoisDeGravar(atuais, motivos)
        : motivos.length > 0
          ? motivos
          : null,
    );
    if (problemas.length > 0) {
      return NextResponse.json({ error: problemas.join(" "), problemas }, { status: 422 });
    }


    const agora = new Date().toISOString();
    const { error: erroEtapas } = await supabase
      .from("funil_etapas")
      .upsert(etapas.map((e) => ({ ...e, atualizada_em: agora })), { onConflict: "chave" });
    if (erroEtapas) {
      return NextResponse.json({ error: erroEtapas.message }, { status: 500 });
    }

    if (motivos.length > 0) {
      const { error: erroMotivos } = await supabase
        .from("funil_motivos")
        .upsert(motivos, { onConflict: "chave" });
      if (erroMotivos) {
        return NextResponse.json({ error: erroMotivos.message }, { status: 500 });
      }
    }

    // O que sumiu da tela é DESATIVADO, nunca apagado — ver o cabeçalho.
    const chavesEtapas = etapas.map((e) => e.chave);
    await supabase
      .from("funil_etapas")
      .update({ ativa: false, atualizada_em: agora })
      .not("chave", "in", `(${chavesEtapas.map((c) => `"${c}"`).join(",")})`);

    if (motivos.length > 0) {
      const chavesMotivos = motivos.map((m) => m.chave);
      await supabase
        .from("funil_motivos")
        .update({ ativo: false })
        .not("chave", "in", `(${chavesMotivos.map((c) => `"${c}"`).join(",")})`);
    }

    const [depoisEtapas, depoisMotivos] = await Promise.all([
      supabase.from("funil_etapas").select("*").order("ordem"),
      supabase.from("funil_motivos").select("*").order("tipo").order("ordem"),
    ]);

    return NextResponse.json({
      ok: true,
      etapas: ordenarEtapas((depoisEtapas.data ?? []) as EtapaDoFunil[]),
      motivos: (depoisMotivos.data ?? []) as MotivoDoFunil[],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Número positivo ou nulo — string vazia do formulário vira "sem prazo". */
function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

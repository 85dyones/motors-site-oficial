import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { campoNegadoAoPerfil, ehStaff, perfisDe } from "../../../../../lib/permissoes";
import { normalizarId } from "../../../../../lib/estoqueEscrita";
import { montarDossie } from "../../../../../lib/descritivo/dossie";
import { primeiraFraseDe, validarDescritivo, type CampoDeTexto } from "../../../../../lib/descritivo/validacao";
import { gerarTexto } from "../../../../../lib/descritivo/gerar";

export const dynamic = "force-dynamic";

/**
 * Endurecimento de 16/09/2026 (revisão final do #76; ajustado no mesmo dia
 * de 30 para 35, decisão do coordenador sobre a dúvida 1 da entrega). Gerações
 * medidas em produção desde o #76: 1,1 a 4,3 s — folga grande sobre qualquer
 * um dos dois valores.
 *
 * 35, e não 30: o `TIMEOUT_MS` de `gerar.ts` (30 s) é quem de fato aborta a
 * chamada à OpenAI. Com os dois tetos iguais, o abort interno e o limite da
 * função na Vercel disparavam praticamente juntos, e a mensagem genérica de
 * timeout podia não terminar de sair antes da Vercel encerrar a função. Os 5
 * s a mais são a folga para a rota montar e devolver essa resposta DEPOIS do
 * abort — `tests/descritivo-limite.test.ts` trava essa relação lendo os dois
 * valores do código (`maxDuration` >= `TIMEOUT_MS` / 1000 + 5), não um número
 * fixo, para a folga não regredir em silêncio se `TIMEOUT_MS` mudar.
 */
export const maxDuration = 35;

/**
 * Gera uma SUGESTÃO de texto para o veículo. NÃO grava.
 *
 * A gravação continua no PATCH da rota irmã, que já valida campo por perfil e
 * já alimenta o histórico do veículo — uma porta de escrita só.
 *
 * O veículo é lido do BANCO, nunca do corpo: senão bastaria mandar
 * `pericia: "Aprovado"` no JSON para liberar a afirmação de laudo aprovado
 * num carro cujo exame não fechou.
 */

const CAMPOS: CampoDeTexto[] = ["descricao", "descricao_seo"];

/**
 * Uma linha por geração no log da Vercel, com o prefixo `[descritivo]` para a
 * busca achar.
 *
 * Existe desde 14/09/2026, por decisão do dono. Até ali a rota não registrava
 * nada: o log da Vercel mostrava quatro respostas 422 em 13 e 14/09, e nenhuma
 * dizia o campo, a regra, os tokens ou o tempo da chamada.
 *
 * Só medidas e nomes de regra. O texto gerado fica fora: quem pediu já o vê no
 * painel, aprovado ou reprovado.
 */
type Registro = {
  veiculo: string;
  campo: CampoDeTexto;
  status: number;
  ms: number;
  regras?: string[];
  caracteres?: number;
  primeiraFrase?: number;
  tokensEntrada?: number;
  tokensSaida?: number;
  motivo?: string;
};

function registrar(registro: Registro) {
  console.info("[descritivo]", JSON.stringify(registro));
}

/**
 * Limite de uso (endurecimento de 16/09/2026, achado da revisão final do
 * #76: a rota estava no ar desde 15/09 sem nenhum teto de cliques).
 *
 * Upstash `Ratelimit`, o mesmo pacote de `src/proxy.ts` — mas mora AQUI, como
 * em `src/app/api/erros/route.ts`: o matcher do proxy cobre as rotas de
 * conversão (`/api/leads`, `/api/avaliacao`) e o motor do ciclo, e editá-lo
 * por causa de uma rota de painel autenticado seria mexer no caminho de
 * conversão para um problema que não é dele.
 *
 * A chave junta usuário e veículo: dez cliques de UM usuário no MESMO veículo
 * numa hora é reclique de quem está ajustando o texto (o caso a barrar); dez
 * cliques de dez usuários em dez veículos é uso normal do painel, e a mesma
 * régua não pode confundir os dois.
 *
 * O env é lido A CADA CHAMADA (não uma vez no topo do módulo, diferente de
 * `proxy.ts`) para o teste poder isolar o caso "sem Redis configurado" com
 * `vi.resetModules()` — o mesmo recurso de `tests/erros-rota.test.ts`.
 */
let instanciaLimitador: Ratelimit | null = null;

function limitadorDeGeracao(): Ratelimit | null {
  if (instanciaLimitador) return instanciaLimitador;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    instanciaLimitador = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "@upstash/ratelimit/descritivo",
    });
    return instanciaLimitador;
  } catch (e) {
    // Redis fora é bypass, como em `src/proxy.ts:80-82`: a rota segue sem
    // limite em vez de derrubar o gerador por causa do limitador.
    console.error("[descritivo] Falha ao iniciar o limitador Upstash. Seguindo sem limite:", e);
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis, full_name")
      .eq("id", user.id)
      .single();

    // Cliente da Garagem é authenticated sem ser staff; normalizar sem barrar
    // o promoveria a "comercial".
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = perfisDe(profile);

    const body = await request.json().catch(() => ({}));
    const campo = body?.campo as CampoDeTexto;
    if (!CAMPOS.includes(campo)) {
      return NextResponse.json(
        { error: `Campo inválido. Esperado ${CAMPOS.join(" ou ")}.` },
        { status: 400 },
      );
    }

    // Quem não grava o campo não gera sugestão para ele. Mesma régua do PATCH.
    const negado = campoNegadoAoPerfil(perfil, [campo]);
    if (negado) {
      return NextResponse.json(
        { error: `Seu perfil não altera "${negado.campo}" (${negado.acao})` },
        { status: 403 },
      );
    }

    // Limite de uso, por usuário da equipe e por veículo — ver o docblock de
    // `limitadorDeGeracao`. Antes da leitura do veículo e da chamada à
    // OpenAI, as duas caras: sem isto quem estoura ainda pagaria o preço das
    // duas.
    const limite = limitadorDeGeracao();
    if (limite) {
      const inicioLimite = Date.now();
      try {
        const { success } = await limite.limit(`${user.id}:${id}`);
        if (!success) {
          registrar({
            veiculo: id,
            campo,
            status: 429,
            ms: Date.now() - inicioLimite,
            motivo: "Limite de 10 gerações por veículo nesta hora excedido.",
          });
          return NextResponse.json(
            { error: "Muitas gerações para este veículo nesta hora. Limite de 10 por hora — tente novamente mais tarde." },
            { status: 429 },
          );
        }
      } catch (err) {
        console.error("[descritivo] Falha ao consultar o limitador Upstash. Seguindo sem limite:", err);
      }
    }

    const { data: veiculo, error: erroVeiculo } = await supabase
      .from("estoque_motors")
      .select("*")
      .eq("id", normalizarId(id))
      .maybeSingle();

    // Mesma ordem da rota irmã (GET de api/estoque/[id]/route.ts): falha de
    // banco, de rede ou bloqueio de RLS é 500 com a mensagem, não 404. Sem
    // isto, `data: null` por erro de leitura respondia "Veículo não
    // encontrado" para um carro que a pessoa está editando naquele instante.
    if (erroVeiculo) {
      return NextResponse.json({ error: erroVeiculo.message }, { status: 500 });
    }
    if (!veiculo) {
      return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
    }

    const dossie = montarDossie(veiculo);
    const inicio = Date.now();
    const saida = await gerarTexto({
      dossie,
      campo,
      chave: process.env.OPENAI_API_KEY ?? "",
    });
    const ms = Date.now() - inicio;

    if (!saida.ok) {
      registrar({ veiculo: id, campo, status: saida.status, ms, motivo: saida.motivo });
      // Endurecimento de 16/09/2026: a mensagem da OpenAI (rede, 4xx, 5xx ou
      // timeout — sempre 502 em `gerar.ts`) não vai mais ao navegador; o
      // detalhe já foi para o log `[descritivo]` na linha acima. O 503 é
      // diagnóstico NOSSO (falta `OPENAI_API_KEY`, checado antes de qualquer
      // chamada de rede) e continua específico — é o dono/operação lendo, não
      // a OpenAI falando.
      const mensagem =
        saida.status === 502
          ? "Não foi possível gerar agora; tente de novo em instantes."
          : saida.motivo;
      return NextResponse.json({ error: mensagem }, { status: saida.status });
    }

    const motivos = validarDescritivo(saida.texto, dossie, campo);
    const medidas = {
      veiculo: id,
      campo,
      ms,
      regras: motivos.map((m) => m.regra),
      caracteres: saida.texto.length,
      primeiraFrase: primeiraFraseDe(saida.texto).length,
      tokensEntrada: saida.entrada,
      tokensSaida: saida.saida,
    };
    if (motivos.length > 0) {
      registrar({ ...medidas, status: 422 });
      return NextResponse.json({ error: "O texto gerado não passou na conferência.", motivos, texto: saida.texto }, { status: 422 });
    }

    registrar({ ...medidas, status: 200 });
    return NextResponse.json({
      texto: saida.texto,
      caracteres: saida.texto.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Falha inesperada" }, { status: 500 });
  }
}

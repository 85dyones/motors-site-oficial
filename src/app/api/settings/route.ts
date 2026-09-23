import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { ehStaff } from "../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../lib/papelPadrao";
import { temInjecaoDePrompt } from "../../../lib/injecaoDePrompt";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const companyPath = path.join(process.cwd(), "src/lib/companySettings.json");
const aboutPath = path.join(process.cwd(), "src/lib/aboutSettings.json");

import { getCachedSettings, recortePublicoDeSettings } from "../../../lib/settings";
import { mascararGa4 } from "../../../lib/mascaraDoGa4";

/**
 * Settings do site. O corpo da resposta depende de haver sessão.
 *
 * Até 2026-08-06 este GET era aberto e devolvia TUDO a qualquer visitante
 * anônimo — verificado contra produção: `preco_compra` de veículo (o custo de
 * aquisição da loja) e as URLs internas do n8n saíam na resposta. `bankBalances`
 * e `apiSecretToken` vinham no envelope e estavam vazios só por acaso: no dia em
 * que fossem preenchidos pelo painel, nasceriam públicos.
 *
 * Visitante anônimo — e cliente logado da Garagem — recebe o recorte
 * público; só sessão de STAFF recebe o payload completo, que é o que o painel
 * admin consome. O POST também exige staff.
 */
export async function GET() {
  const completo = await getCachedSettings();

  let deStaff = false;
  try {
    const client = await createServerSupabaseClient();
    const { data } = await client.auth.getUser();
    if (data?.user) {
      // Sessão não basta mais: cliente da Garagem também é `authenticated`.
      // O payload completo carrega token, saldos e preco_compra — só staff vê.
      const { data: perfil } = await client
        .from("profiles")
        .select("role, papeis")
        .eq("id", data.user.id)
        .single();
      // A linha inteira do perfil, não só `role`: com multi-papel o papel de
      // equipe pode ser o segundo do array (ex.: {cliente, comercial}), e o
      // primário sozinho negaria staff de verdade.
      deStaff = ehStaff(perfil ?? papelPadraoPorEmail(data.user.email));
    }
  } catch (err: any) {
    // Sem sessão utilizável — segue como anônimo, que é o caminho seguro.
    console.warn("[Settings API] Checagem de sessão no GET falhou:", err?.message);
  }

  // `mascararGa4` só no ramo de staff: o recorte público é whitelist e nunca
  // chegou a incluir `ga4`.
  const corpo = deStaff ? mascararGa4(completo) : recortePublicoDeSettings(completo);

  return NextResponse.json(corpo, {
    headers: {
      // `private` importa: sem isso um proxy compartilhado poderia servir a
      // resposta autenticada de um admin para o próximo visitante anônimo.
      "Cache-Control": "private, no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

    const body = await request.json();

    /**
     * A peneira de injeção de prompt, sobre o corpo INTEIRO e antes de tudo.
     *
     * Ela existia desde sempre neste arquivo e nunca era chamada: a única
     * referência a `hasPromptInjection` era a recursão dentro do próprio corpo,
     * o que a fazia parecer usada. Quem barrava de fato era a cópia de
     * `ConfiguracoesClientWrapper.tsx` — código de cliente, que roda no
     * navegador. `curl` com token de staff entrava direto. Agora a função mora
     * em `lib/injecaoDePrompt.ts` e os dois lados chamam a mesma.
     *
     * Por que AQUI, antes até da checagem de sessão: esta rota tem duas portas
     * de escrita, e a segunda — a cópia de reserva em `src/lib/*.json` — fica
     * FORA do bloco do Supabase e também roda no Dev Bypass, onde não há
     * autenticação nenhuma. Checar depois do `ehStaff` deixaria essa porta
     * descoberta e criaria a chance de gravação parcial: uma tabela já escrita
     * quando o campo hostil aparecesse na seguinte.
     *
     * O preço é conhecido e aceito: requisição sem sessão com padrão no corpo
     * recebe 400 em vez de 401. Não vaza nada — a lista de padrões viaja no
     * bundle do painel desde que a versão de cliente existe.
     */
    if (temInjecaoDePrompt(body)) {
      console.warn("[Settings API] Gravação barrada: padrão de injeção de prompt no corpo.");
      return NextResponse.json(
        {
          error:
            "O conteúdo contém termos não permitidos (potencial injeção de instruções). Remova comandos em inglês semelhantes a instruções de sistema e salve de novo.",
        },
        { status: 400 },
      );
    }

    const {
      companySettings,
      aboutSettings,
      webhooks,
      popups,
      quickTags,
      stockOverrides,
      carouselVehicleIds,
      destaquesDaSemana,
      vitrineTv,
      bankBalances,
      procedencia,
      instagramCuradoria,
      areasHome,
      ga4
    } = body;

    const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

    if (isSupabaseConfigured) {
      let requestSupabase: any = null;
      let user = null;
      let authError = null;

      // 1. Try cookie-based session first
      try {
        const client = await createServerSupabaseClient();
        const { data } = await client.auth.getUser();
        if (data?.user) {
          user = data.user;
          requestSupabase = client;
        }
      } catch (err: any) {
        console.warn("[Settings API] Cookie-based auth check failed:", err.message);
      }

      // 2. Fallback to header-based Bearer token
      if (!user && token) {
        try {
          const client = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          });
          const { data, error } = await client.auth.getUser();
          if (data?.user) {
            user = data.user;
            requestSupabase = client;
          } else {
            authError = error;
          }
        } catch (err: any) {
          console.warn("[Settings API] Token-based auth check failed:", err.message);
        }
      }

      if (!user) {
        console.warn("[Settings API] Write blocked: unauthorized request", authError?.message);
        return NextResponse.json({ error: "Sessão inválida ou ausente. Faça login novamente." }, { status: 401 });
      }

      // Só staff mexe em settings. A RLS (is_staff) já barraria os upserts,
      // mas a gravação nos JSON locais abaixo não passa pelo banco.
      const { data: perfilRow } = await requestSupabase
        .from("profiles")
        .select("role, papeis")
        .eq("id", user.id)
        .single();
      // A linha inteira, não só `role` — mesmo motivo do GET: papel de equipe
      // pode ser o segundo do array.
      if (!ehStaff(perfilRow ?? papelPadraoPorEmail(user.email))) {
        return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
      }

      // 3. Write to Supabase using the authenticated client
      if (companySettings) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "company", data: companySettings, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for company:", error.message);
          return NextResponse.json({ error: `Falha ao salvar configurações corporativas: ${error.message}` }, { status: 500 });
        }
      }

      if (aboutSettings) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "about", data: aboutSettings, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for about:", error.message);
          return NextResponse.json({ error: `Falha ao salvar informações da empresa: ${error.message}` }, { status: 500 });
        }
      }

      if (webhooks) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "webhooks", data: webhooks, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for webhooks:", error.message);
          return NextResponse.json({ error: `Falha ao salvar webhooks: ${error.message}` }, { status: 500 });
        }
      }

      if (ga4) {
        // A tela nunca recebe a chave privada (ver `mascararGa4`), então ela
        // também nunca volta no corpo do salvamento. Gravar o que veio, cru,
        // apagaria a credencial toda vez que alguém salvasse o ID da
        // propriedade — e o sintoma apareceria dias depois, como "o GA4 parou
        // sozinho", sem nada no log ligando uma coisa à outra.
        //
        // Então: chave nova no corpo vence; corpo sem chave preserva a
        // guardada. Limpar de verdade exige apagar a linha no banco, que é
        // deliberado o bastante para não acontecer por engano.
        let paraGravar: Record<string, unknown> = { ...ga4 };
        delete paraGravar.privateKeyConfigurada; // campo de resposta, não de dado

        if (!String(ga4.privateKey ?? "").trim()) {
          const { data: atual } = await requestSupabase
            .from("site_settings")
            .select("data")
            .eq("id", "ga4")
            .maybeSingle();
          const chaveGuardada = atual?.data?.privateKey;
          if (chaveGuardada) paraGravar = { ...paraGravar, privateKey: chaveGuardada };
          else delete paraGravar.privateKey;
        }

        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "ga4", data: paraGravar, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for ga4:", error.message);
          return NextResponse.json({ error: `Falha ao salvar credenciais do GA4: ${error.message}` }, { status: 500 });
        }
      }

      if (popups) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "popups", data: popups, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for popups:", error.message);
          return NextResponse.json({ error: `Falha ao salvar popups: ${error.message}` }, { status: 500 });
        }
      }

      if (quickTags) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "quick_tags", data: quickTags, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for quickTags:", error.message);
          return NextResponse.json({ error: `Falha ao salvar tags rápidas: ${error.message}` }, { status: 500 });
        }
      }

      if (stockOverrides) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "stock_overrides", data: stockOverrides, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for stockOverrides:", error.message);
          return NextResponse.json({ error: `Falha ao salvar customizações de estoque: ${error.message}` }, { status: 500 });
        }
      }

      if (carouselVehicleIds) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "carousel_vehicles", data: carouselVehicleIds, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for carouselVehicleIds:", error.message);
          return NextResponse.json({ error: `Falha ao salvar carrossel de veículos: ${error.message}` }, { status: 500 });
        }
      }

      // A curadoria da GRADE da home ("Destaques da semana"), separada da
      // do banner de propósito — mesma nota de `destaquesDaSemanaRow` em
      // `lib/settings.ts`.
      if (destaquesDaSemana) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "destaques_da_semana", data: destaquesDaSemana, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for destaquesDaSemana:", error.message);
          return NextResponse.json({ error: `Falha ao salvar destaques da semana: ${error.message}` }, { status: 500 });
        }
      }

      // A curadoria da TV do showroom. Linha própria desde 2026-09-22: ela e o
      // banner da home tinham tetos incompatíveis dividindo a mesma lista.
      if (vitrineTv) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "vitrine_tv", data: vitrineTv, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for vitrineTv:", error.message);
          return NextResponse.json({ error: `Falha ao salvar a vitrine da TV: ${error.message}` }, { status: 500 });
        }
      }

      if (procedencia) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "procedencia", data: procedencia, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for procedencia:", error.message);
          return NextResponse.json({ error: `Falha ao salvar a faixa de procedência: ${error.message}` }, { status: 500 });
        }
      }

      // Envelope `{ publicacoes: [...] }`, e não o array pelado, porque a
      // guarda destes blocos é a truthiness do valor: esvaziar a faixa no
      // painel manda `[]`, que é truthy como objeto mas seria fácil de
      // confundir com "nada a salvar" em qualquer refatoração do guard. Com o
      // envelope, remover a última publicação salva de fato.
      if (instagramCuradoria) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "instagram_curadoria", data: instagramCuradoria, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for instagramCuradoria:", error.message);
          return NextResponse.json({ error: `Falha ao salvar a faixa do Instagram: ${error.message}` }, { status: 500 });
        }
      }

      // Ordem e visibilidade das seções da home (tela A3). Envelope
      // `{ ordem, ocultas }` pela mesma razão do bloco acima: `ocultas: []`
      // é estado legítimo (nada escondido) e precisa sobreviver ao guard.
      if (areasHome) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "areas_home", data: areasHome, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for areasHome:", error.message);
          return NextResponse.json({ error: `Falha ao salvar as áreas da home: ${error.message}` }, { status: 500 });
        }
      }

      if (bankBalances) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "bank_balances", data: bankBalances, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for bankBalances:", error.message);
          return NextResponse.json({ error: `Falha ao salvar saldos bancários: ${error.message}` }, { status: 500 });
        }
      }
    } else {
      console.info("[Settings API] Supabase credentials not set, writing to local config only (Dev Bypass).");
    }

    console.log("[Settings API] Settings saved to Supabase successfully. Invalidating cache...");
    
    // Invalidate the settings cache tag on Edge
    try {
      revalidateTag("site_settings", "max");
      revalidateTag("settings", "max");
    } catch (rErr) {
      console.warn("[Settings API] revalidateTag failed:", rErr);
    }

    // 4. Optional local JSON file backup write (errors here are non-critical)
    try {
      if (companySettings) {
        await fs.writeFile(companyPath, JSON.stringify(companySettings, null, 2), "utf-8");
      }
      if (aboutSettings) {
        await fs.writeFile(aboutPath, JSON.stringify(aboutSettings, null, 2), "utf-8");
      }
    } catch (fsErr) {
      console.warn("[Settings API] Local file backup write failed (non-critical):", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings API] Failed to save settings:", error);
    return NextResponse.json({ error: "Falha interna ao processar salvamento." }, { status: 500 });
  }
}

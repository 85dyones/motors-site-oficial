import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { ehStaff } from "../../lib/permissoes";
import { saldoDasMovimentacoes } from "../../lib/investidores";
import { Rotulo } from "../../components/modernist/primitivos";
import InvestidorEntrada from "../../components/investidor/InvestidorEntrada";
import BotaoSairInvestidor from "../../components/investidor/BotaoSairInvestidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Área do Investidor — Motors Store",
  description: "Seus aportes, retiradas e saldo na operação.",
  // Área logada, como /garagem, /login e /admin.
  robots: { index: false, follow: false },
};

/**
 * A área do investidor — o "painel que mostrasse isso pra eles também" que o
 * dono pediu no briefing de 2026-08-21, e o papel `investidor` que ele pediu
 * em seguida.
 *
 * Desenhada no molde da Garagem, e pelas mesmas razões:
 *
 *  - **Somente leitura.** Ele confere, não lança. Quem registra aporte e
 *    retirada é o financeiro, no painel. A policy do banco só concede SELECT,
 *    então nem uma rota escrita por engano conseguiria gravar por aqui.
 *  - **Sem chave de serviço.** Toda leitura sai com o usuário DA SESSÃO, sob
 *    RLS (`investidores.perfil_id = auth.uid()`). Se a policy não deixa, a
 *    tela não mostra — é a regra 2-b do CLAUDE.md aplicada à página. Com
 *    chave de serviço, um filtro errado entregaria o extrato de um sócio ao
 *    outro, e não haveria segunda barreira.
 *  - **`error` é sempre lido.** A RLS devolve vazio, mas uma coluna ausente
 *    derruba a query inteira no PostgREST — sem checar, isso viraria "você
 *    não tem movimentação" na cara de quem tem, sem log nenhum. É o modo de
 *    falha que já derrubou o painel de margens neste projeto.
 */
export default async function InvestidorPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Moldura>
        <InvestidorEntrada linkVencido={erro === "link-vencido"} />
      </Moldura>
    );
  }

  // Staff não vive aqui — quem opera a loja vê tudo no painel.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();
  if (ehStaff(perfil)) {
    redirect("/admin/financeiro/investidores");
  }

  const campos = "id, nome, ativo";
  let { data: investidor, error: erroInvestidor } = await supabase
    .from("investidores")
    .select(campos)
    .eq("perfil_id", user.id)
    .maybeSingle();

  if (erroInvestidor) {
    console.error("[Investidor] Falha ao ler o cadastro:", erroInvestidor.message);
    return <Indisponivel />;
  }

  // Sem vínculo ainda: liga pelo e-mail que o link mágico provou — a gêmea de
  // `reivindicar_garagem()`. Idempotente e barata; só roda uma vez na vida de
  // cada investidor, e evita que alguém tenha que digitar UUID no painel.
  if (!investidor) {
    const { error: erroVinculo } = await supabase.rpc("reivindicar_investidor");
    if (erroVinculo) {
      console.error("[Investidor] Falha ao reivindicar o vínculo:", erroVinculo.message);
    }
    ({ data: investidor, error: erroInvestidor } = await supabase
      .from("investidores")
      .select(campos)
      .eq("perfil_id", user.id)
      .maybeSingle());
    if (erroInvestidor) {
      console.error("[Investidor] Falha ao reler o cadastro:", erroInvestidor.message);
      return <Indisponivel />;
    }
  }

  if (!investidor) {
    return (
      <Moldura>
        <div className="flex flex-col gap-4 border-t-2 border-mt-regua pt-6">
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            ÁREA DO INVESTIDOR
          </Rotulo>
          <h1 className="mt-titulo m-0 text-[28px]">Não achamos o seu cadastro</h1>
          <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
            Você entrou como <strong>{user.email}</strong>, mas nenhum investidor está
            vinculado a esse e-mail. Fale com a loja — a equipe faz o vínculo e o seu
            extrato aparece aqui.
          </p>
          <div className="pt-2">
            <BotaoSairInvestidor />
          </div>
        </div>
      </Moldura>
    );
  }

  const { data: movimentacoes, error: erroExtrato } = await supabase
    .from("movimentacoes_investidor")
    .select("id, tipo, valor, data, descricao, forma_pagamento, veiculo_id")
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });

  if (erroExtrato) {
    console.error("[Investidor] Falha ao ler o extrato:", erroExtrato.message);
    return <Indisponivel />;
  }

  const saldo = saldoDasMovimentacoes(movimentacoes ?? []);

  return (
    <Moldura larga>
      <div className="flex items-start justify-between gap-4 border-t-2 border-mt-regua pt-6">
        <div className="flex flex-col gap-1.5">
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            ÁREA DO INVESTIDOR
          </Rotulo>
          <h1 className="mt-titulo m-0 text-[28px]">{investidor.nome}</h1>
        </div>
        <BotaoSairInvestidor />
      </div>

      {/* Régua de números, na anatomia das telas do painel. */}
      <div className="grid select-none grid-cols-1 border-t border-mt-regua-fina sm:grid-cols-3">
        {[
          { rotulo: "Aportado", valor: saldo.aportado, cor: "text-mt-accent-800" },
          { rotulo: "Retirado", valor: saldo.retirado, cor: "text-mt-accent" },
          { rotulo: "Saldo na operação", valor: saldo.saldo, cor: "text-mt-ink" },
        ].map((n) => (
          <div
            key={n.rotulo}
            className="flex flex-col gap-2 border-b border-mt-regua-fina py-4 pr-5 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <span className="mt-rotulo">{n.rotulo}</span>
            <span className={`text-2xl font-extrabold tracking-[-.03em] tabular-nums ${n.cor}`}>
              {formatarReal(n.valor)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="mt-titulo m-0 text-[18px]">Extrato</h2>
        {(movimentacoes ?? []).length === 0 ? (
          <p className="m-0 text-[14px] text-mt-neutral-700">
            Nenhuma movimentação registrada até aqui.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-mt-regua-fina border-t border-mt-regua-fina">
            {(movimentacoes ?? []).map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-4 py-3.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-bold text-mt-ink">{m.descricao}</span>
                  <span className="text-[11px] text-mt-neutral-600">
                    {formatarData(m.data)}
                    {m.forma_pagamento === "veiculo" && " · em veículo"}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-[14px] font-extrabold tabular-nums ${
                    m.tipo === "aporte" ? "text-mt-accent-800" : "text-mt-accent"
                  }`}
                >
                  {m.tipo === "aporte" ? "+" : "−"} {formatarReal(m.valor)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="m-0 border-t border-mt-regua-fina pt-4 text-[11px] leading-relaxed text-mt-neutral-600">
        Os lançamentos são feitos pela administração da loja. Se algo não bater com o
        seu controle, fale com a equipe — esta tela é de consulta.
      </p>
    </Moldura>
  );
}

function formatarReal(valor: number | string): string {
  const n = typeof valor === "number" ? valor : parseFloat(valor);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data: string): string {
  const partes = data.split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : data;
}

/**
 * A tela que ASSUME o erro em vez de transferi-lo ao investidor — a lição de
 * `R1` (a Garagem dizia "não há veículo" quando a consulta falhava).
 */
function Indisponivel() {
  return (
    <Moldura>
      <div className="flex flex-col gap-4 border-t-2 border-mt-regua pt-6">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          INDISPONÍVEL NO MOMENTO
        </Rotulo>
        <h1 className="mt-titulo m-0 text-[28px]">Não conseguimos carregar seu extrato</h1>
        <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
          A falha é nossa, não do seu cadastro. Tente de novo em alguns minutos; se
          continuar, fale com a loja.
        </p>
        <div className="pt-2">
          <BotaoSairInvestidor />
        </div>
      </div>
    </Moldura>
  );
}

function Moldura({
  children,
  larga = false,
}: {
  children: React.ReactNode;
  larga?: boolean;
}) {
  return (
    // `<div>`, não `<main>`: o layout raiz já abre um `<main>` — mesmo motivo
    // da Garagem e da página de login.
    <div className="flex min-h-[70vh] w-full flex-col items-center bg-mt-bg px-[18px] py-16 font-modernist text-mt-ink">
      <div className={`flex w-full flex-col gap-8 ${larga ? "max-w-[720px]" : "max-w-[420px]"}`}>
        {children}
      </div>
    </div>
  );
}

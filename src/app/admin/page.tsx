import Link from "next/link";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { getEstoque } from "../../lib/supabase";
import { getCachedSettings } from "../../lib/settings";
import { resumoDeVisitas } from "../../lib/analytics";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Visão Geral — Motors Showcase",
  description: "O que exige ação hoje: estoque, financeiro e integrações.",
};

/**
 * Tela A1 do design doc — visão geral do painel.
 *
 * A rota `/admin` respondia 404: o painel não tinha porta de entrada, e quem
 * digitasse o endereço batia em nada.
 *
 * O doc desenha esta tela em torno de leads (fila de resposta, funil da
 * semana, visitas ao catálogo). Nada disso existe: não há tabela de leads —
 * o lead vai para o webhook do n8n — nem coleta de analytics no banco. Em vez
 * de encher a tela com número inventado, os blocos sem fonte aparecem
 * nomeados e explicados, e o que sobra é construído sobre dado real:
 * estoque, contas e mídia paga.
 */

interface Alerta {
  titulo: string;
  detalhe: string;
  acao: string;
  href: string;
  urgente: boolean;
}

export default async function AdminVisaoGeralPage() {
  const supabase = await createServerSupabaseClient();

  const [estoque, settings, visitas] = await Promise.all([
    // `incluirPlaca`: o alerta de ficha própria incompleta conta placa entre
    // os campos. Rota do painel, atrás do guarda de sessão do layout.
    //
    // `incluirNaoPublicaveis`: o carro bloqueado por falta de laudo ou de fotos
    // sai da vitrine, não do painel — é AQUI que o bloqueio se resolve. Filtrar
    // nesta chamada esconderia o veículo justamente de quem tem como
    // desbloqueá-lo, e o contador de pendências desta tela nasceria mentindo.
    getEstoque({ incluirForaDoFeed: true, incluirPlaca: true, incluirNaoPublicaveis: true }),
    getCachedSettings(),
    // `null` quando o GA4 não tem credencial de leitura — a tela mostra "—".
    resumoDeVisitas(30),
  ]);

  const hoje = new Date().toISOString().split("T")[0];

  // Contas vencidas — mesma regra do dashboard financeiro.
  const { data: contasVencidas } = await supabase
    .from("contas")
    .select("valor")
    .or(`status.eq.vencido,and(status.eq.pendente,data_vencimento.lt.${hoje})`);

  const totalVencido = (contasVencidas ?? []).reduce(
    (acc, c: any) => acc + Number(c.valor || 0),
    0,
  );

  const { count: campanhasNoAr } = await supabase
    .from("midia_campanhas")
    .select("id", { count: "exact", head: true })
    .eq("situacao", "no_ar");

  // Leads aguardando primeiro contato — a fila que abre a tela A1 no doc.
  // `error` ignorado de propósito: antes da migração de leads a consulta
  // falha, e o painel deve seguir funcionando sem ela.
  const { data: leadsNovos } = await supabase
    .from("leads")
    .select("id, nome, interesse, canal, created_at")
    .eq("situacao", "novo")
    .order("created_at", { ascending: false })
    .limit(6);

  const disponiveis = estoque.filter((v) => !v.vendido);
  const vendidos = estoque.length - disponiveis.length;

  // Overrides gravados só no JSON: o sintoma do bug corrigido em 2026-08-07.
  // Enquanto houver divergência, o site anuncia carro já vendido.
  const overridesBrutos = (settings.stockOverrides as any)?.overrides ?? {};
  const vendidosNoJson = Object.entries(overridesBrutos)
    .filter(([, campos]: [string, any]) => campos?.vendido === true)
    .map(([id]) => id);
  const divergentes = vendidosNoJson.filter((id) => {
    const v = estoque.find((e) => e.id === id);
    return v && !v.vendido;
  });

  const semFotos = disponiveis.filter(
    (v) => v.whatsapp_images.filter((f) => f && f !== "/logo.png").length < 8,
  );
  const semFichaPropria = disponiveis.filter(
    (v) => !v.placa || !v.motor || !v.garantia_fabrica,
  );

  const alertas: Alerta[] = [];

  if ((leadsNovos ?? []).length > 0) {
    alertas.push({
      titulo: `${leadsNovos!.length} lead(s) aguardando primeiro contato`,
      detalhe: leadsNovos!
        .slice(0, 3)
        .map((l: any) => `${l.nome}${l.interesse ? ` · ${l.interesse}` : ""}`)
        .join(" — "),
      acao: "ABRIR LEADS",
      href: "/admin/leads",
      urgente: true,
    });
  }

  if (divergentes.length > 0) {
    alertas.push({
      titulo: `${divergentes.length} veículo(s) vendidos ainda anunciados`,
      detalhe:
        "Marcados como vendidos no painel, mas a coluna do banco segue disponível — o site continua exibindo. Reconciliação pendente.",
      acao: "ABRIR ESTOQUE",
      href: "/admin/estoque",
      urgente: true,
    });
  }

  if (totalVencido > 0) {
    alertas.push({
      titulo: `${(contasVencidas ?? []).length} título(s) vencidos`,
      detalhe: `${totalVencido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em atraso, somando todos os vencimentos anteriores a hoje.`,
      acao: "ABRIR CONTAS A PAGAR",
      href: "/admin/financeiro/contas-pagar",
      urgente: true,
    });
  }

  if (semFotos.length > 0) {
    alertas.push({
      titulo: `${semFotos.length} anúncio(s) com menos de 8 fotos`,
      detalhe:
        "O checklist de publicação pede frente, traseira, laterais, interior, painel e porta-malas.",
      acao: "ABRIR ESTOQUE",
      href: "/admin/estoque",
      urgente: false,
    });
  }

  if (semFichaPropria.length > 0) {
    alertas.push({
      titulo: `${semFichaPropria.length} veículo(s) sem ficha própria completa`,
      detalhe:
        "Placa, motor e garantia são nossos — o feed não os traz, e sem eles a ficha do site fica incompleta.",
      acao: "PREENCHER FICHA",
      href: "/admin/estoque",
      urgente: false,
    });
  }

  if ((campanhasNoAr ?? 0) === 0) {
    alertas.push({
      titulo: "Nenhuma campanha de mídia no ar",
      detalhe:
        "Sem campanha registrada, o painel não consegue calcular custo por lead nem atribuir venda a anúncio.",
      acao: "ABRIR MÍDIA PAGA",
      href: "/admin/marketing/midia-paga",
      urgente: false,
    });
  }

  const kpis = [
    {
      rotulo: "Veículos publicados",
      valor: `${disponiveis.length} / ${estoque.length}`,
      nota: vendidos > 0 ? `${vendidos} marcados como vendidos` : "nenhum vendido marcado",
      cor: "text-mt-ink",
    },
    {
      rotulo: "Em atraso",
      valor: totalVencido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      nota: `${(contasVencidas ?? []).length} título(s)`,
      cor: totalVencido > 0 ? "text-mt-accent" : "text-mt-ink",
    },
    {
      rotulo: "Campanhas no ar",
      valor: String(campanhasNoAr ?? 0),
      nota: "mídia paga registrada",
      cor: "text-mt-ink",
    },
    {
      rotulo: "Visitas ao catálogo",
      valor: visitas === null ? "—" : visitas.catalogo.toLocaleString("pt-BR"),
      nota:
        visitas === null
          ? "GA4 sem credencial de leitura"
          : `${visitas.total.toLocaleString("pt-BR")} no site · 30 dias`,
      cor: "text-mt-ink",
    },
    {
      rotulo: "Anúncios incompletos",
      valor: String(semFotos.length),
      nota: "menos de 8 fotos",
      cor: semFotos.length > 0 ? "text-mt-accent-800" : "text-mt-ink",
    },
  ];

  const data = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-1.5 border-b-2 border-mt-regua pb-5">
        <div className="mt-rotulo mt-rotulo-accent">Painel</div>
        <h1 className="mt-titulo text-3xl md:text-4xl first-letter:uppercase">{data}</h1>
        <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
          O que exige ação hoje, calculado sobre o estoque, o financeiro e a mídia paga.
        </p>
      </div>

      {/* Régua de KPIs */}
      <div className="grid select-none grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-5">
        {kpis.map((k) => (
          <div
            key={k.rotulo}
            className="flex flex-col gap-2 border-b border-mt-regua-fina py-4 pr-5 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <span className="mt-rotulo">{k.rotulo}</span>
            <span className={`text-2xl font-extrabold tracking-[-.03em] tabular-nums ${k.cor}`}>
              {k.valor}
            </span>
            <span className="text-[11px] leading-tight text-mt-neutral-700">{k.nota}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-8 xl:flex-row">
        {/* Precisa de atenção */}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-baseline gap-3 border-b-2 border-mt-regua pb-2.5">
            <h2 className="text-[17px] font-extrabold tracking-[-.015em]">Precisa de atenção</h2>
            <span className="ml-auto text-[11px] text-mt-neutral-700">
              {alertas.length === 0 ? "nada pendente" : `${alertas.length} item(ns)`}
            </span>
          </div>

          {alertas.length === 0 ? (
            <p className="py-8 text-center text-xs text-mt-neutral-700">
              Nada exige ação agora — estoque, contas e mídia em dia.
            </p>
          ) : (
            alertas.map((a) => (
              <div key={a.titulo} className="flex gap-3 border-b border-mt-regua-fina py-3.5">
                <div
                  className={`mt-1.5 h-2 w-2 flex-none ${a.urgente ? "bg-mt-accent" : "bg-mt-neutral-500"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold tracking-[-.01em]">{a.titulo}</div>
                  <p className="mt-1 text-xs leading-relaxed text-mt-neutral-800">{a.detalhe}</p>
                  <Link
                    href={a.href}
                    className="mt-foco mt-2 inline-block text-[11px] font-extrabold tracking-[.1em] text-mt-ink hover:text-mt-accent"
                  >
                    {a.acao} →
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Atalhos + o que o doc pede e ainda não temos */}
        <div className="w-full flex-none xl:w-[340px]">
          <div className="mb-3 border-b-2 border-mt-regua pb-2.5">
            <h2 className="text-[17px] font-extrabold tracking-[-.015em]">Ir direto para</h2>
          </div>
          <div className="flex flex-col">
            {[
              ["Estoque", "/admin/estoque"],
              ["Leads", "/admin/leads"],
              ["Contas a pagar", "/admin/financeiro/contas-pagar"],
              ["Mídia paga", "/admin/marketing/midia-paga"],
              ["Aparência e cores", "/admin/configuracoes?tab=aparencia"],
              ["Usuários e permissões", "/admin/usuarios"],
            ].map(([rotulo, href]) => (
              <Link
                key={href}
                href={href}
                className="mt-foco flex items-center border-b border-mt-regua-fina py-2.5 text-[13px] font-semibold text-mt-ink hover:text-mt-accent"
              >
                {rotulo}
                <span className="ml-auto text-mt-neutral-500">→</span>
              </Link>
            ))}
          </div>

          {/* Honestidade sobre o que o design doc desenha e o backend não
              sustenta ainda — melhor nomear a lacuna que preencher com
              número inventado. */}
          <div className="mt-6 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
            <div className="mt-rotulo mb-2">Ainda sem fonte de dados</div>
            <p className="text-xs leading-relaxed text-mt-neutral-800">
              A <strong>fila de leads</strong> deste desenho já existe, na tela de Leads. O que
              falta é o <strong>funil da semana</strong>: ele compara etapa a etapa entre
              períodos, e a tabela guarda a situação atual do lead, não a data em que cada
              etapa foi alcançada. Sem esse histórico, qualquer taxa de conversão semanal
              seria chute.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

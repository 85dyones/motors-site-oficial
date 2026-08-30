import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { apenasDoUltimoSync, mapVeiculoDbToVeiculo } from "../../../lib/supabase";
import { getCachedSettings } from "../../../lib/settings";
import { paginasMaisVistas } from "../../../lib/analytics";
import { normalizarQuickTags, normalizarStockOverrides } from "../../../lib/destaquesRapidos";
import { bloqueiosDePublicacao } from "../../../lib/coerenciaDoCadastro";
import {
  classificarEstado,
  contarLeadsPorVeiculo,
  mapaDeVisitas,
  versaoParaExibir,
  type LinhaDeEstoque,
} from "../../../lib/estoqueTabela";
import TabelaDeEstoque from "../../../components/admin/TabelaDeEstoque";
import { diasEmEstoque } from "../../../lib/dataLayer";
import { perfisDe, podeFazer } from "../../../lib/permissoes";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Estoque — Motors Store",
  description: "Todos os veículos, estado de publicação e desempenho de cada anúncio.",
};

/**
 * Tela A6 do design doc — a tabela de estoque.
 *
 * Substitui a aba de cards de `/admin/configuracoes?tab=estoque`, onde editar
 * um carro era rolar uma lista de 88 fichas abertas. O doc pede o contrário:
 * uma linha por veículo, densa, com filtro por estado e ação em lote — o carro
 * inteiro abre no editor (A15).
 *
 * O que o doc desenha e não está aqui, por não haver fonte:
 *
 * - **Coluna FIPE.** `fipe` é lida pelo mapper mas NÃO existe no banco
 *   (registrado no baseline `20260803120000`). A coluna sairia vazia em 100%
 *   das linhas.
 * - **Rascunho e reservado.** São estados do fluxo de revisão (A16). O que
 *   existe é `vendido`, o carimbo de sync e a régua de publicação — daí os
 *   quatro estados reais, incluindo "fora da vitrine": cadastrado, visível
 *   aqui, e ainda assim fora do ar porque `bloqueiosDePublicacao` o segura.
 * - **Importar planilha.** Continua sem existir: importação em lote precisa de
 *   conciliação (qual coluna é qual, o que fazer com duplicado) que a tela de
 *   um veículo por vez não precisa.
 *
 * **"+ Novo veículo" passou a existir em 2026-08-29** — adendo do dono, junto
 * com a trava do sync (migração 20260829130000). O estoque não entra mais só
 * pelo RevendaMais: o carro de troca, repasse ou consignado nasce em
 * `/admin/estoque/novo`, com id de faixa própria, e o sync nunca o altera. O
 * botão só aparece para quem publica veículo (A17) — daí `podeCriar` vir
 * resolvido do servidor.
 */
export default async function AdminEstoquePage() {
  const supabase = await createServerSupabaseClient();

  const [{ data: brutos }, settings, paginas] = await Promise.all([
    supabase
      .from("estoque_motors")
      .select("*")
      .order("created_at", { ascending: false }),
    getCachedSettings(),
    // `null` quando o GA4 não tem credencial de leitura — a célula mostra "—".
    // Uma consulta só para a lista inteira, não uma por veículo.
    paginasMaisVistas(30, 1000),
  ]);

  const linhasDoBanco = (brutos ?? []) as Array<Record<string, any>>;

  // Quem cadastra veículo é quem publica (A17) — Admin e Comercial. Resolvido
  // aqui, no servidor, porque a régua da casa é esconder o que é negado: o
  // botão nem chega ao HTML de quem não pode usá-lo.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user!.id)
    .single();
  const podeCriar = podeFazer(perfisDe(profile), "Publicar ou despublicar veículo") === "faz";

  // Leads por veículo: dado real desde a migração 20260807210000. `error`
  // ignorado de propósito — a tabela de estoque não pode deixar de abrir
  // porque a de leads falhou.
  const { data: leads } = await supabase.from("leads").select("veiculo_id");
  const leadsPorVeiculo = contarLeadsPorVeiculo((leads ?? []) as Array<{ veiculo_id: any }>);

  const visitasPorVeiculo = mapaDeVisitas(paginas);

  // Quem veio no último ciclo de sync. Fora dessa lista = fora do feed.
  const idsNoUltimoSync = new Set(
    apenasDoUltimoSync(linhasDoBanco as Array<{ last_seen_at?: string | null }>).map((l: any) =>
      String(l.id),
    ),
  );

  const overrides = normalizarStockOverrides(settings.stockOverrides);
  const quickTags = normalizarQuickTags(settings.quickTags);
  const destacados = Array.isArray(settings.carouselVehicleIds)
    ? (settings.carouselVehicleIds as string[]).map(String)
    : [];

  const linhas: LinhaDeEstoque[] = linhasDoBanco.map((bruto) => {
    const v = mapVeiculoDbToVeiculo(bruto);
    const id = String(bruto.id);
    const imagens = Array.isArray(v.whatsapp_images) ? v.whatsapp_images : [];
    // A contagem sai da LINHA CRUA, não do objeto mapeado. O mapper inventa uma
    // foto quando o array está vazio (`url_imagem`, ou `/logo.png` quando nem
    // isso existe) e `bloqueiosDePublicacao` conta `whatsapp_images` e mais
    // nada. Contadas em lugares diferentes, a coluna mostraria "1/8" ao lado de
    // um bloqueio escrito "0 de 8 fotos": dois números sobre o mesmo carro na
    // mesma linha.
    const fotos = Array.isArray(bruto.whatsapp_images)
      ? bruto.whatsapp_images.filter(Boolean).length
      : 0;
    const promocional = Number(v.preco_promocional || 0);
    const cheio = Number(v.preco_original || 0);
    const noUltimoSync = idsNoUltimoSync.has(id);
    // Os motivos vão inteiros para a tela, com o texto já escrito. A etiqueta
    // sai de `classificarEstado`, que pergunta à MESMA função sobre a MESMA
    // linha (via `publicavel`) — por isso a etiqueta e o texto embaixo dela não
    // têm como discordar.
    //
    // `bruto` e não `v`: `laudo_pericia`, `whatsapp_images` e `origem` são
    // colunas, e é sobre a linha crua que `getEstoque` aplica o mesmo filtro.
    // Esta consulta é `select("*")` direto na tabela, sem `getEstoque`: o
    // bloqueado chega aqui inteiro, que é o que o painel precisa para
    // desbloqueá-lo.
    const bloqueios = bloqueiosDePublicacao(bruto);

    return {
      id,
      marca: v.marca,
      modelo: v.modelo,
      versao: versaoParaExibir(v.modelo, v.versao),
      ano: v.ano ?? null,
      quilometragem: v.quilometragem ?? null,
      preco: promocional > 0 && promocional < cheio ? promocional : cheio || null,
      foto: imagens[0] ?? null,
      fotos,
      estado: classificarEstado(bruto, noUltimoSync),
      noUltimoSync,
      bloqueios,
      tipo: v.tipo ?? "",
      perfisUso: v.perfis_uso ?? [],
      // Da linha crua, não do objeto mapeado: o mapper deixou de devolver
      // `placa` para não serializá-la no HTML público. Aqui a consulta é
      // direta e autenticada, e a busca da tabela procura por placa.
      placa: bruto.placa ?? "",
      destacado: destacados.includes(id),
      visitas: visitasPorVeiculo ? (visitasPorVeiculo[id] ?? 0) : null,
      leads: leadsPorVeiculo[id] ?? 0,
      // O sintoma do bug corrigido em 2026-08-07: override gravado só no JSON
      // é invisível para o servidor, e o site segue anunciando carro vendido.
      // A tabela mostra a divergência na linha; marcar como vendido daqui
      // grava na coluna e resolve.
      divergente: overrides[id]?.vendido === true && !bruto.vendido,
      quickTags: overrides[id]?.quick_tags ?? [],
      // Da linha crua: `first_seen_at` é carimbo de banco, não vem do feed.
      diasEmEstoque: diasEmEstoque(bruto.first_seen_at),
    };
  });

  return (
    <TabelaDeEstoque
      linhas={linhas}
      quickTagsDisponiveis={quickTags.map((t) => ({ id: t.id, nome: t.name }))}
      destacadosIniciais={destacados}
      overridesIniciais={overrides}
      visitasDisponiveis={visitasPorVeiculo !== null}
      podeCriar={podeCriar}
    />
  );
}

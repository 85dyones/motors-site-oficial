import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { ehInvestidor } from "../../lib/permissoes";
import { Rotulo, formatarPreco } from "../../components/modernist/primitivos";
import BotaoSair from "../../components/garagem/BotaoSair";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Área do Investidor — Motors Store",
  description: "Sua posição: carros, aporte, retiradas e saldo.",
  // Área logada, fora de busca — como /garagem, /login e /admin.
  robots: { index: false, follow: false },
};

interface Participacao {
  id: string;
  veiculo_id: number;
  valor_investido: number;
  data_entrada: string;
  observacao: string | null;
}

interface Movimento {
  id: string;
  tipo: "aporte" | "retirada";
  valor: number;
  data: string;
  descricao: string | null;
  veiculo_id: number | null;
}

interface VeiculoResumo {
  id: number;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  ano: number | null;
  vendido: boolean | null;
}

const dataCurta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/**
 * A área do investidor — pedido do dono em 2026-08-22.
 *
 * Quatro respostas, e nada além: em que carros ele entrou, quanto aportou,
 * quanto já retirou e quanto ainda está investido.
 *
 * Toda leitura sai sob a RLS da sessão dele (migração 20260822120000): as
 * policies filtram por `investidor_id = auth.uid()`, então não há parâmetro
 * de investidor em lugar nenhum desta página. Se a policy não deixa, a tela
 * não mostra — é a mesma régua da Garagem.
 *
 * O que esta tela NÃO mostra, de propósito: `preco_compra`, margem e o custo
 * da loja. O investidor vê o dinheiro DELE; o resultado do negócio é outra
 * conversa, e não é a RLS que deveria estar segurando isso sozinha.
 */
export default async function InvestidorPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, full_name")
    .eq("id", user.id)
    .single();

  // Quem não é investidor não tem o que fazer aqui. Sem papel nenhum
  // reconhecido, a porta de saída é a home — nunca um erro cru.
  if (!ehInvestidor(profile)) {
    redirect("/");
  }

  // O `error` é lido em toda consulta pelo mesmo motivo da Garagem: a RLS não
  // devolve erro, devolve vazio — mas uma coluna ausente derruba a query
  // inteira, e isso viraria "você não tem nada investido" na cara do dono do
  // dinheiro, sem log nenhum.
  const [posicaoRes, participacoesRes, movimentosRes] = await Promise.all([
    supabase
      .from("investidor_posicao")
      .select("aporte_total, retirado_total, saldo_investido")
      .maybeSingle(),
    supabase
      .from("investidor_veiculos")
      .select("id, veiculo_id, valor_investido, data_entrada, observacao")
      .order("data_entrada", { ascending: false }),
    supabase
      .from("investidor_movimentos")
      .select("id, tipo, valor, data, descricao, veiculo_id")
      .order("data", { ascending: false }),
  ]);

  const erroDeLeitura =
    posicaoRes.error?.message ??
    participacoesRes.error?.message ??
    movimentosRes.error?.message ??
    null;

  const participacoes = (participacoesRes.data ?? []) as Participacao[];
  const movimentos = (movimentosRes.data ?? []) as Movimento[];

  // Sem movimento nenhum a view não devolve linha. Zero é a resposta certa —
  // "—" faria parecer indisponível o que na verdade ainda não aconteceu.
  const posicao = posicaoRes.data ?? {
    aporte_total: 0,
    retirado_total: 0,
    saldo_investido: 0,
  };

  // Os carros vêm numa segunda consulta: não há FK para `estoque_motors`
  // porque o estoque é sincronizado de fora e some do feed. Participação cujo
  // carro não está mais lá continua na lista, com o número dela — esconder
  // seria esconder dinheiro de quem o colocou.
  let veiculos: Record<string, VeiculoResumo> = {};
  const ids = participacoes.map((p) => p.veiculo_id).filter(Boolean);
  if (ids.length > 0) {
    const { data: linhas } = await supabase
      .from("estoque_motors")
      .select("id, marca, modelo, versao, ano, vendido")
      .in("id", ids);
    veiculos = Object.fromEntries(
      ((linhas ?? []) as VeiculoResumo[]).map((v) => [String(v.id), v]),
    );
  }

  const totalNosCarros = participacoes.reduce(
    (soma, p) => soma + Number(p.valor_investido ?? 0),
    0,
  );

  const numero = "text-[30px] font-extrabold leading-none tracking-[-.03em] tabular-nums";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10 md:px-8 md:py-14">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <Rotulo accent>Área do investidor</Rotulo>
          <h1 className="mt-titulo m-0 text-3xl md:text-4xl">
            {profile?.full_name ?? "Sua posição"}
          </h1>
          <p className="m-0 mt-1 max-w-[560px] text-sm text-mt-neutral-800">
            Sua posição na Motors: os carros em que você entrou na compra, o que
            aportou, o que já retirou e o que segue investido.
          </p>
        </div>
        <BotaoSair />
      </div>

      {erroDeLeitura && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          Não foi possível carregar sua posição agora ({erroDeLeitura}). Fale com a
          Motors — os números não foram alterados.
        </div>
      )}

      {/* Os três números */}
      <div className="grid grid-cols-1 gap-6 border-t-2 border-mt-regua pt-6 sm:grid-cols-3">
        <div className="border-r border-mt-regua-fina pr-5 last:border-r-0">
          <Rotulo>Aporte total</Rotulo>
          <div className={`mt-2.5 ${numero} text-mt-ink`}>
            {formatarPreco(Number(posicao.aporte_total))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-mt-neutral-700">
            Tudo o que você já colocou.
          </p>
        </div>
        <div className="border-r border-mt-regua-fina pr-5 last:border-r-0">
          <Rotulo>Já retirado</Rotulo>
          <div className={`mt-2.5 ${numero} text-mt-neutral-700`}>
            {formatarPreco(Number(posicao.retirado_total))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-mt-neutral-700">
            Somatório das suas retiradas.
          </p>
        </div>
        <div>
          <Rotulo accent>Saldo investido</Rotulo>
          <div className={`mt-2.5 ${numero} text-mt-accent`}>
            {formatarPreco(Number(posicao.saldo_investido))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-mt-neutral-700">
            Aporte menos retiradas — o que segue na operação.
          </p>
        </div>
      </div>

      {/* Os carros */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <Rotulo>Seus carros</Rotulo>
          <span className="ml-auto text-[11px] text-mt-neutral-700">
            {participacoes.length === 0
              ? "Nenhuma participação registrada"
              : `${participacoes.length} carro(s) · ${formatarPreco(totalNosCarros)} alocados`}
          </span>
        </div>

        {participacoes.length === 0 ? (
          <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-8 text-center text-xs text-mt-neutral-600">
            Você ainda não foi incluído na compra de nenhum veículo. Assim que
            entrar em um, ele aparece aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-tabela">
              <thead>
                <tr>
                  <th>Veículo</th>
                  <th>Sua entrada</th>
                  <th>Desde</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {participacoes.map((p) => {
                  const v = veiculos[String(p.veiculo_id)];
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="font-extrabold tracking-[-.01em] text-mt-ink">
                          {v ? `${v.marca ?? ""} ${v.modelo ?? ""}`.trim() || `Veículo ${p.veiculo_id}` : `Veículo ${p.veiculo_id}`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-mt-neutral-700">
                          {v?.versao ?? (v ? "" : "Não está mais no estoque publicado")}
                          {v?.ano ? ` · ${v.ano}` : ""}
                        </div>
                        {p.observacao && (
                          <div className="mt-0.5 text-[11px] text-mt-neutral-600">{p.observacao}</div>
                        )}
                      </td>
                      <td className="mt-num font-semibold text-mt-ink">
                        {formatarPreco(Number(p.valor_investido))}
                      </td>
                      <td className="mt-num text-mt-neutral-700">{dataCurta(p.data_entrada)}</td>
                      <td>
                        <span
                          className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            v?.vendido
                              ? "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800"
                              : "border border-mt-regua-fina text-mt-neutral-700"
                          }`}
                        >
                          {v?.vendido ? "Vendido" : v ? "No pátio" : "Sem registro"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* O extrato */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <Rotulo>Extrato</Rotulo>
          <span className="ml-auto text-[11px] text-mt-neutral-700">
            Aportes e retiradas, do mais recente para o mais antigo
          </span>
        </div>

        {movimentos.length === 0 ? (
          <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-8 text-center text-xs text-mt-neutral-600">
            Nenhum movimento registrado ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Movimento</th>
                  <th>Valor</th>
                  <th>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m) => (
                  <tr key={m.id}>
                    <td className="mt-num text-mt-neutral-700">{dataCurta(m.data)}</td>
                    <td>
                      <span
                        className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          m.tipo === "aporte"
                            ? "border border-mt-regua text-mt-neutral-800"
                            : "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800"
                        }`}
                      >
                        {m.tipo === "aporte" ? "Aporte" : "Retirada"}
                      </span>
                    </td>
                    <td className="mt-num font-semibold text-mt-ink">
                      {/* O sinal é de leitura, não do dado: no banco todo valor
                          é positivo e o sentido mora em `tipo`. */}
                      {m.tipo === "retirada" ? "− " : "+ "}
                      {formatarPreco(Number(m.valor))}
                    </td>
                    <td className="text-mt-neutral-700">{m.descricao ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="border-t border-mt-regua-fina pt-4 text-[11px] leading-relaxed text-mt-neutral-600">
        Os valores são lançados pela Motors. Encontrou divergência? Fale com a
        loja — esta tela é de acompanhamento e não aceita lançamentos.
      </p>
    </div>
  );
}

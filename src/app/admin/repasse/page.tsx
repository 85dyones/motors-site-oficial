import Link from "next/link";
import { redirect } from "next/navigation";
import { validaRepasse } from "../../../lib/edicaoDoRepasse";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../lib/erroDeSchema";
import { ABAS_DO_PAINEL, abaDaUrl, abaInicial, caminhoDoCarroNoPainel, contarPorSituacao } from "../../../lib/painelDoRepasse";
import { papelPadraoPorEmail } from "../../../lib/papelPadrao";
import { ehStaff, perfisDe } from "../../../lib/permissoes";
import { contaDoRepasse, emReais, etiquetaDoRepasse, soParaLojistas, type RepasseDoPainel } from "../../../lib/repasse";
import { repasseDoPainelDaLinha } from "../../../lib/repasseDoPainel";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Repasse — Motors Store",
};

/**
 * `/admin/repasse` (spec §6): os carros por situação. Todo perfil da equipe
 * abre (todos cadastram); o link da lista de inscritos só aparece para quem
 * valida, como no menu.
 */
export default async function RepassesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");
  const valida = validaRepasse(perfisDe(origem));

  const { data, error } = await supabase.from("repasses").select("*").order("updated_at", { ascending: false }).limit(500);
  if (error && ehTabelaOuColunaAusente(error)) {
    return <p className="text-sm text-mt-accent-800">{mensagemDeMigracaoPendente("20260924180000_repasse_fundacao.sql")}</p>;
  }
  const repasses = ((data ?? []) as Record<string, unknown>[]).flatMap((linha) => {
    const r = repasseDoPainelDaLinha(linha);
    return r ? [r] : [];
  });
  const contagem = contarPorSituacao(repasses);
  const { aba } = await searchParams;
  const atual = abaDaUrl(aba, abaInicial(contagem, valida));
  const daAba = repasses.filter((r) => r.situacao === atual);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 border-b-2 border-mt-regua pb-5">
        <div>
          <div className="mt-rotulo">Painel / Repasse</div>
          <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">Carros de repasse</h1>
        </div>
        <div className="ml-auto flex gap-2">
          {valida && (
            <Link href="/admin/repasse/inscritos" className="mt-btn mt-btn-contorno mt-foco px-4 py-2.5 text-[11px]">
              Lista do repasse
            </Link>
          )}
          <Link href="/admin/repasse/novo" className="mt-btn mt-btn-primario mt-foco px-4 py-2.5 text-[11px]">
            Cadastrar carro
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Situação">
        {ABAS_DO_PAINEL.map(({ situacao, rotulo }) => (
          <Link
            key={situacao}
            href={`/admin/repasse?aba=${situacao}`}
            aria-current={situacao === atual ? "page" : undefined}
            className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.06em] no-underline ${
              situacao === atual ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua-fina text-mt-neutral-800"
            }`}
          >
            {rotulo} <span className="tabular-nums">{contagem[situacao]}</span>
          </Link>
        ))}
      </nav>

      {daAba.length === 0 ? (
        <p className="text-sm text-mt-neutral-700">Nenhum carro nesta situação.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-mt-regua-fina">
          {daAba.map((r) => (
            <LinhaDoRepasse key={r.id} repasse={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaDoRepasse({ repasse: r }: { repasse: RepasseDoPainel }) {
  const conta = contaDoRepasse(r);
  return (
    <li className="flex flex-wrap items-center gap-4 py-3 text-sm">
      <Link href={caminhoDoCarroNoPainel(r.id)} className="font-bold underline">
        {[r.marca, r.modelo, r.versao, r.ano_modelo].filter(Boolean).join(" ")}
      </Link>
      <span className="mt-rotulo">{etiquetaDoRepasse(r)}</span>
      {r.situacao === "publicado" && <span className="text-xs">{soParaLojistas(r) ? "Só para lojistas" : "Aberto a todos"}</span>}
      <span className="ml-auto tabular-nums">{emReais(r.preco)}</span>
      {conta.abaixoDaFipe !== null && conta.abaixoDaFipe > 0 && (
        <span className="text-xs tabular-nums text-mt-neutral-700">{emReais(conta.abaixoDaFipe)} abaixo da FIPE</span>
      )}
    </li>
  );
}

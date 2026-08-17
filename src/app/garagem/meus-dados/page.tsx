import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { ehStaff } from "../../../lib/permissoes";
import BotaoImprimir from "../../../components/garagem/BotaoImprimir";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Meus dados — Garagem Motors",
  robots: { index: false, follow: false },
};

/**
 * A exportação do §6.3-D — "exportar tudo em PDF".
 *
 * É uma página feita para imprimir, não um gerador de PDF: o navegador já
 * imprime em PDF em toda plataforma, e uma biblioteca de PDF no servidor
 * custaria dependência, tempo de build e um segundo lugar onde o layout pode
 * divergir do que o cliente vê. O botão chama `window.print()` e pronto.
 *
 * O §6.3-E pede que o histórico seja **compartilhável**: "o cliente pode usar
 * para revender por conta própria, e isso é bom". Por isso a página é um
 * documento inteiro e legível fora de contexto — com data de emissão, para
 * quem receber saber de quando é.
 */
export default async function MeusDadosPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/garagem");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (ehStaff(profile?.role)) redirect("/admin");

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome, email, telefone_e164, cpf_cnpj, cep, data_nascimento, consentimento_canais, consentimento_lgpd_em, created_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!cliente) redirect("/garagem");

  const { data: veiculos } = await supabase
    .from("veiculos_vendidos")
    .select(
      `id, placa, marca, modelo, versao, ano_fabricacao, ano_modelo, chassi,
       data_venda, km_na_venda,
       contrato:contratos_ciclo ( plano, garantia_meses, garantia_fim ),
       manutencoes ( numero_revisao, data_servico, km_registrado, origem_registro,
                     confirmada_em, recusada_em, dentro_da_janela, observacoes ),
       leituras_odometro ( km, origem, registrada_em )`,
    )
    .eq("cliente_id", cliente.id)
    .order("data_venda", { ascending: false });

  const lista = (veiculos ?? []) as any[];
  const emitidoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const canais = (cliente.consentimento_canais ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto w-full max-w-[760px] bg-white px-6 py-10 font-modernist text-[#201e1d] print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden">
        <BotaoImprimir />
      </div>

      <header className="border-b-2 border-[#201e1d] pb-4">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-2 shrink-0 bg-[#c8412f]" aria-hidden="true" />
          <span className="text-[17px] font-extrabold tracking-[.02em]">
            MOTORS STORE
          </span>
        </div>
        <h1 className="m-0 mt-4 text-[26px] font-extrabold tracking-[-.02em]">
          Meus dados e histórico do veículo
        </h1>
        <p className="m-0 mt-2 text-[12px] text-[#6d6968]">
          Emitido em {emitidoEm} · Garagem Motors · motorsstore.com.br
        </p>
      </header>

      {/* ---- cadastro ---- */}
      <section className="mt-8">
        <h2 className="m-0 text-[11px] font-bold uppercase tracking-[.14em] text-[#c8412f]">
          Cadastro
        </h2>
        <dl className="m-0 mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
          <Campo rotulo="Nome" valor={cliente.nome} />
          <Campo rotulo="Documento" valor={cliente.cpf_cnpj} />
          <Campo rotulo="Telefone" valor={cliente.telefone_e164} />
          <Campo rotulo="E-mail" valor={cliente.email} />
          <Campo rotulo="CEP" valor={cliente.cep} />
          <Campo rotulo="Nascimento" valor={dataBr(cliente.data_nascimento)} />
          <Campo rotulo="Cliente desde" valor={dataBr(cliente.created_at)} />
          <Campo rotulo="Consentimento LGPD" valor={dataBr(cliente.consentimento_lgpd_em)} />
          <Campo
            rotulo="Avisos por WhatsApp"
            valor={canais.whatsapp === true ? "autorizado" : "não autorizado"}
          />
          <Campo
            rotulo="Avisos por e-mail"
            valor={canais.email === true ? "autorizado" : "não autorizado"}
          />
        </dl>
      </section>

      {/* ---- veículos ---- */}
      {lista.map((v) => {
        const manutencoes = [...(v.manutencoes ?? [])].sort((a: any, b: any) =>
          a.data_servico < b.data_servico ? 1 : -1,
        );
        const leituras = [...(v.leituras_odometro ?? [])].sort((a: any, b: any) =>
          a.registrada_em < b.registrada_em ? 1 : -1,
        );
        return (
          <section key={v.id} className="mt-8 break-inside-avoid">
            <h2 className="m-0 text-[11px] font-bold uppercase tracking-[.14em] text-[#c8412f]">
              Veículo
            </h2>
            <h3 className="m-0 mt-2 text-[18px] font-extrabold tracking-[-.015em]">
              {[v.marca, v.modelo, v.versao].filter(Boolean).join(" ")} {v.ano_modelo}
            </h3>
            <dl className="m-0 mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
              <Campo rotulo="Placa" valor={v.placa} />
              <Campo rotulo="Chassi" valor={v.chassi} />
              <Campo rotulo="Ano fab./mod." valor={`${v.ano_fabricacao}/${v.ano_modelo}`} />
              <Campo rotulo="Data da compra" valor={dataBr(v.data_venda)} />
              <Campo rotulo="KM de saída" valor={`${v.km_na_venda.toLocaleString("pt-BR")} km`} />
              {v.contrato && (
                <>
                  <Campo rotulo="Plano Motors Ciclo" valor={v.contrato.plano} />
                  <Campo
                    rotulo="Garantia"
                    valor={`${v.contrato.garantia_meses} meses · até ${dataBr(v.contrato.garantia_fim)}`}
                  />
                </>
              )}
            </dl>

            <h4 className="m-0 mt-5 text-[12px] font-extrabold uppercase tracking-[.1em]">
              Diário de bordo
            </h4>
            {manutencoes.length === 0 ? (
              <p className="m-0 mt-2 text-[13px] text-[#6d6968]">Sem lançamentos.</p>
            ) : (
              <table className="mt-2 w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#201e1d] text-left">
                    <th className="py-1.5 pr-3 font-semibold">Data</th>
                    <th className="py-1.5 pr-3 font-semibold">Revisão</th>
                    <th className="py-1.5 pr-3 font-semibold">KM</th>
                    <th className="py-1.5 pr-3 font-semibold">Origem</th>
                    <th className="py-1.5 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {manutencoes.map((m: any, i: number) => (
                    <tr key={i} className="border-b border-[#e2e0e0]">
                      <td className="py-1.5 pr-3">{dataBr(m.data_servico)}</td>
                      <td className="py-1.5 pr-3">{m.numero_revisao ? `${m.numero_revisao}ª` : "—"}</td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {m.km_registrado?.toLocaleString("pt-BR")}
                      </td>
                      <td className="py-1.5 pr-3">{rotuloOrigem(m.origem_registro)}</td>
                      <td className="py-1.5">
                        {m.confirmada_em
                          ? m.dentro_da_janela === false
                            ? "verificada (fora da janela)"
                            : "verificada"
                          : m.recusada_em
                            ? "não validada"
                            : "aguardando verificação"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="m-0 mt-2 text-[11px] leading-relaxed text-[#6d6968]">
              Só a revisão <strong>verificada pela loja</strong> conta como procedência —
              a verificação é feita contra a foto da etiqueta de troca de óleo.
            </p>

            <h4 className="m-0 mt-5 text-[12px] font-extrabold uppercase tracking-[.1em]">
              Registros de quilometragem
            </h4>
            {leituras.length === 0 ? (
              <p className="m-0 mt-2 text-[13px] text-[#6d6968]">Sem registros.</p>
            ) : (
              <ul className="m-0 mt-2 list-none p-0 text-[12px]">
                {leituras.map((l: any, i: number) => (
                  <li key={i} className="border-b border-[#e2e0e0] py-1.5">
                    <span className="tabular-nums font-semibold">
                      {l.km.toLocaleString("pt-BR")} km
                    </span>{" "}
                    · {dataBr(l.registrada_em)} · {rotuloLeitura(l.origem)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <footer className="mt-10 border-t border-[#e2e0e0] pt-4 text-[11px] leading-relaxed text-[#6d6968]">
        Documento emitido pela Garagem Motors a pedido do titular dos dados. A Motors
        Store não guarda traçado de localização nem dado de telemetria deste veículo.
        Para corrigir qualquer informação, fale com a loja.
      </footer>
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#e2e0e0] py-1">
      <dt className="text-[#6d6968]">{rotulo}</dt>
      <dd className="m-0 text-right font-semibold">{valor && String(valor).trim() ? valor : "—"}</dd>
    </div>
  );
}

const dataBr = (iso: string | null | undefined) =>
  iso
    ? new Date(String(iso).length <= 10 ? `${iso}T12:00:00Z` : String(iso)).toLocaleDateString("pt-BR")
    : "—";

const rotuloOrigem = (o: string) =>
  o === "cliente" ? "registro seu" : o === "parceiro" ? "oficina parceira" : "loja";

const rotuloLeitura = (o: string) =>
  o === "venda"
    ? "KM de saída na compra"
    : o === "revisao"
      ? "verificado na revisão"
      : o === "vistoria"
        ? "verificado em vistoria"
        : "informado por você";

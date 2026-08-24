"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANO_DE_CONTAS_REVENDA } from "@/lib/planoContasData";

/**
 * O plano de contas de revenda, para consulta.
 *
 * Esta tela se chamava "Cadastros auxiliares" e guardava duas coisas sem
 * parentesco nenhum: a árvore contábil e uma lista de parceiros comerciais.
 *
 * Em 2026-08-24 o dono foi direto ao ponto: *"hoje temos os cadastros
 * auxiliares, mas não tá legal, o revenda tem uma área de clientes sejam
 * internos ou externos, fornecedores... pra organizar tudo e termos como
 * gerenciar"*. Os parceiros saíram daqui para /admin/clientes, onde
 * encontraram os outros três cadastros de gente da casa — clientes do Ciclo,
 * rede de serviço e investidores.
 *
 * O que sobrou é o que a tela sempre foi de verdade: a estrutura oficial que
 * todo lançamento e todo DRE usam. Ela é dado FIXO, versionado em código
 * (`planoContasData.ts`) — não há o que cadastrar aqui, e por isso não há
 * botão de novo. Um formulário para editar a árvore contábil seria oferecer
 * ao operador a chance de desalinhar o balanço.
 */
export default function FinanceCadastros() {
  const [busca, setBusca] = useState("");

  const filtrado = PLANO_DE_CONTAS_REVENDA.filter((c) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase().trim();
    return c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q);
  });

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      <div className="flex select-none flex-col items-start justify-between gap-4 border border-mt-regua-fina bg-mt-surface p-6 md:flex-row md:items-center">
        <div>
          <h1 className="text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
            Plano de contas de revenda
          </h1>
          <p className="mt-1 text-xs text-mt-neutral-800">
            A hierarquia oficial usada em todos os lançamentos e nos relatórios de
            DRE. Estrutura fixa — consulta, não cadastro.
          </p>
        </div>
        <span className="border border-mt-regua-fina bg-mt-bg px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-mt-neutral-700">
          {PLANO_DE_CONTAS_REVENDA.length} contas
        </span>
      </div>

      {/* O aviso de mudança de casa. Ele fica aqui porque quem tinha o caminho
          de cor volta a esta tela procurando fornecedor — e um item que
          simplesmente sumiu do menu parece um item que quebrou. */}
      <div className="border border-mt-regua-fina bg-mt-bg px-4 py-3 text-xs text-mt-neutral-800">
        Procurando <strong className="font-bold text-mt-ink">fornecedores e clientes</strong>?
        Eles saíram daqui em 24/08 e agora ficam em{" "}
        <Link href="/admin/clientes" className="font-bold text-mt-accent hover:underline">
          Clientes e fornecedores
        </Link>
        , junto com quem comprou na loja, a rede de serviço e os investidores.
      </div>

      <div className="flex flex-col gap-6 border border-mt-regua-fina bg-mt-surface p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-mt-regua-fina pb-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-mt-ink">
              Estrutura do plano de contas
            </h3>
            <p className="mt-0.5 text-[10px] text-mt-neutral-700">
              Só as contas de nível folha aceitam lançamento — a coluna da direita diz
              quais.
            </p>
          </div>

          <input
            type="text"
            placeholder="Buscar código ou nome (ex: 003.005.006)…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-10 max-w-xs border border-mt-regua-fina bg-mt-bg px-3.5 font-mono text-xs text-mt-ink outline-none focus:border-mt-accent"
          />
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-mt-regua-fina font-bold uppercase tracking-wider text-mt-neutral-700">
                <th className="pb-3 pl-2">Código</th>
                <th className="pb-3">Nome da conta / grupo</th>
                <th className="pb-3">Nível</th>
                <th className="pb-3">Tipo</th>
                <th className="pb-3 pr-2 text-right">Lançamento?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mt-regua-fina">
              {filtrado.map((c) => (
                <tr
                  key={c.codigo}
                  className={`transition-colors hover:bg-mt-accent-100 ${c.nivel === 1 ? "bg-mt-accent-100 font-bold" : ""}`}
                >
                  <td className="py-2.5 pl-2 font-bold text-mt-accent">{c.codigo}</td>
                  <td
                    className="py-2.5 text-mt-ink"
                    style={{ paddingLeft: `${(c.nivel - 1) * 16 + 8}px` }}
                  >
                    {c.nivel === 1 ? <strong>{c.nome}</strong> : c.nome}
                  </td>
                  <td className="py-2.5 text-mt-neutral-700">Nível {c.nivel}</td>
                  <td className="py-2.5">
                    <span className="border border-mt-regua-fina bg-mt-bg px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-mt-neutral-800">
                      {c.tipo}
                    </span>
                  </td>
                  <td className="py-2.5 pr-2 text-right">
                    <span
                      className={`px-2 py-0.5 text-[9px] font-extrabold uppercase ${
                        c.permiteLancamento
                          ? "border border-mt-regua-fina bg-mt-surface text-mt-accent-800"
                          : "border border-mt-regua-fina bg-mt-bg text-mt-neutral-600"
                      }`}
                    >
                      {c.permiteLancamento ? "SIM" : "NÃO"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtrado.length === 0 && (
          <div className="py-8 text-center text-xs text-mt-neutral-700">
            Nenhuma conta com “{busca}”.
          </div>
        )}
      </div>
    </div>
  );
}

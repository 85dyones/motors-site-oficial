import {
  ROTULO_DO_AFROUXADO,
  ROTULO_DO_LUGAR,
  ROTULO_DO_MODO,
  lerPerfilDoLead,
} from "../../lib/perfilDoLead";

/**
 * O que o cliente respondeu ao Garagem Match Profiler, dentro do card do lead.
 *
 * Até 25/09/2026 o card de um lead do Profiler mostrava só a mensagem do
 * WhatsApp. Orçamento, quem vai no carro, o jeito, o câmbio, o que não pode
 * faltar, os filtros que o cliente aceitou tirar e os carros que o site
 * mostrou iam só para o n8n, e o consultor refazia no WhatsApp o questionário
 * que o cliente tinha acabado de responder. Agora vêm do próprio lead
 * (`leads.perfil`, ver `lib/perfilDoLead.ts`).
 *
 * Mesma linguagem visual de `BlocoDaAvaliacao`, e pelo mesmo motivo recolhido
 * por padrão: o card é pequeno e o kanban tem muitos. O resumo fechado diz o
 * orçamento e quantos carros o site mostrou, que é o que decide se vale abrir.
 *
 * ---------------------------------------------------------------------------
 * O que o card NÃO faz
 * ---------------------------------------------------------------------------
 * - Não adivinha resposta. `jeitos: []` é "tanto faz" OU pergunta pulada, e o
 *   gravado não distingue os dois; a linha some em vez de escolher um.
 * - Não liga o carro ao editor do estoque. Não há no painel um ajudante que
 *   monte esse link, e o id gravado é o da tela do cliente no envio — o carro
 *   pode ter sido vendido desde então. O nome e o preço bastam para o
 *   consultor achar no pátio.
 * - Não trata os carros como estoque de agora: a nota do rodapé diz que são os
 *   da tela do cliente, como "FIPE no site" diz no bloco da avaliação.
 *
 * Sem estado e sem `onClick`: é só leitura. Lê o jsonb por `lerPerfilDoLead`,
 * que devolve `null` para qualquer forma torta — e aí o bloco não aparece, em
 * vez de derrubar o kanban.
 */

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "3 carros passavam em tudo na faixa", no singular e no zero também. */
function quantosNaFaixa(n: number): string {
  if (n === 0) return "Nenhum carro passava em tudo na faixa";
  if (n === 1) return "1 carro passava em tudo na faixa";
  return `${n.toLocaleString("pt-BR")} carros passavam em tudo na faixa`;
}

export default function BlocoDoPerfil({ perfil }: { perfil: unknown }) {
  const p = lerPerfilDoLead(perfil);
  if (!p) return null;

  const { leva, jeitos, cambio, nao_pode_faltar } = p.perfil;
  // O motor escreve a faixa de preço como primeiro filtro, com o mesmo texto
  // do orçamento. Repetida na linha de baixo, é ruído.
  const filtros = p.filtros.filter((f) => f !== p.orcamento);

  // POR MÊS: a parcela e a entrada são o que o CLIENTE disse — a entrada
  // inclui o que ele espera da troca, e é o consultor quem avalia o carro.
  const pm = p.por_mes;
  const porMes = pm
    ? [
        pm.parcela !== null ? `até ${reais(pm.parcela)}/mês` : "",
        pm.prazo !== null ? `em ${pm.prazo}×` : "",
        pm.entrada !== null ? (pm.entrada > 0 ? `entrada ${reais(pm.entrada)} (estimativa dele)` : "sem entrada") : "",
        pm.ocupacao,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const linhas: [string, string][] = [
    ["Orçamento", p.orcamento],
    ["Por mês", porMes],
    ["Troca", pm?.troca ? "Tem carro para dar na troca — avaliar" : ""],
    ["Quem vai", leva],
    ["Jeito", jeitos.join(", ")],
    ["Câmbio", cambio],
    ["Não pode faltar", nao_pode_faltar.join(", ")],
    ["Prazo", p.prazo],
    ["Filtros", filtros.join(" · ")],
    ["Aceitou tirar", p.afrouxados.map((f) => ROTULO_DO_AFROUXADO[f]).join(", ")],
  ];

  const nCarros = p.carros.length;

  return (
    <details className="mt-2 border-t border-mt-regua-fina pt-2">
      <summary className="mt-foco cursor-pointer text-[10px] font-semibold uppercase tracking-[.08em] text-mt-neutral-700 hover:text-mt-accent">
        Perfil do Profiler
        <span className="font-normal normal-case tracking-normal tabular-nums">
          {" · "}
          {p.orcamento || "sem orçamento"}
          {nCarros > 0 ? ` · ${nCarros} ${nCarros === 1 ? "carro" : "carros"}` : ""}
        </span>
      </summary>

      {p.modo && (
        <p className="m-0 mt-1.5 text-[11px] font-semibold leading-snug text-mt-ink">{ROTULO_DO_MODO[p.modo]}</p>
      )}

      <dl className="m-0 mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug">
        {linhas.map(([rotulo, valor]) =>
          valor ? (
            <div key={rotulo} className="contents">
              <dt className="text-mt-neutral-600">{rotulo}</dt>
              <dd className="m-0 text-mt-ink">{valor}</dd>
            </div>
          ) : null,
        )}
      </dl>

      {nCarros > 0 && (
        <ul
          className="m-0 mt-1.5 list-none p-0 text-[10px] leading-snug text-mt-neutral-800"
          aria-label="Carros que o site mostrou"
        >
          {p.carros.map((c, i) => (
            <li key={`${i}-${c.nome}`} className="border-b border-mt-regua-fina py-1 last:border-b-0">
              <span className="block text-[11px] text-mt-ink">
                <span className="font-semibold">{c.nome}</span>
                {c.preco ? <span className="tabular-nums">{` · ${reais(c.preco)}`}</span> : null}
                {c.parcela ? <span className="tabular-nums">{` · ≈ ${reais(c.parcela)}/mês`}</span> : null}
                {c.lugar ? <span className="text-mt-neutral-600">{` · ${ROTULO_DO_LUGAR[c.lugar]}`}</span> : null}
              </span>
              {c.manchete && <span className="block">{c.manchete}</span>}
              {c.pesa_contra && (
                <span className="block">
                  <span className="font-semibold">Pesa contra:</span> {c.pesa_contra}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {p.na_faixa !== null && (
        <p className="m-0 mt-1.5 text-[10px] leading-snug text-mt-neutral-700 tabular-nums">
          {quantosNaFaixa(p.na_faixa)}
        </p>
      )}

      {p.aiQuery && (
        <p className="m-0 mt-1.5 border-l-2 border-mt-regua pl-2 text-[11px] leading-snug text-mt-neutral-800">
          “{p.aiQuery}”
        </p>
      )}

      <p className="m-0 mt-1.5 text-[10px] leading-snug text-mt-neutral-600">
        O que o cliente respondeu no site. Carros e preços são os da tela dele
        no envio; confira o pátio antes de oferecer.
      </p>
    </details>
  );
}

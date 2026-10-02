import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { checklistDoVeiculo } from "../../lib/checklistDoVeiculo";
import { bloqueiosDePublicacao } from "../../lib/coerenciaDoCadastro";
import {
  EXPLICACAO_DO_ESTADO_CADASTRO,
  ROTULO_DO_ESTADO_CADASTRO,
  normalizarEstadoCadastro,
} from "../../lib/estadoDoCadastro";
import { fotosDoVeiculo } from "../../lib/fotosDoVeiculo";
import { NOME_DO_CAMPO, resumir, type LinhaDeHistorico } from "../../lib/historicoDoVeiculo";
import { ddmmEmCuritiba } from "../../lib/horarioDaLoja";
import { PERFIS_DE_USO } from "../../lib/perfisDeUso";
import { podeGravarCampo, type Perfil } from "../../lib/permissoes";
import { descontoPct, precoEfetivo, temPromocao } from "../../lib/precoPromocional";
import { modeloEVersaoParaExibir } from "../../lib/estoqueTabela";
import { getVeiculoPdpUrl, mapVeiculoDbToVeiculo } from "../../lib/supabase";
import { podeEditarOVeiculo } from "../../lib/veiculoNoPainel";

/**
 * A visão do veículo no painel: o cadastro inteiro em texto, sem um campo
 * sequer. Pedido do dono em 01/10: "não temos a visualização apenas do
 * cadastro dos veículos, estão em lista ou podem ser editados, assim como no
 * repasse". É o arranjo de `VisaoDoRepasse`: abrir mostra o carro, editar é
 * um botão.
 *
 * As portas são as do editor. O preço de compra, a margem e a linha deles no
 * checklist e no histórico só existem para quem vê custo: o campo não é
 * desenhado, e por não estar no HTML também não vaza. "Editar" só aparece
 * para quem grava algum campo do painel. Publicar e arquivar continuam no
 * editor, onde a trava das fotos está à vista.
 *
 * Campo em branco é "Não informado", e não "Não tem": vazio no cadastro não
 * é afirmação sobre o carro.
 */

const NAO_INFORMADO = "Não informado";
const EM_BRANCO = "Em branco.";

export interface VeiculoDaVisao {
  id: number | string;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  modelo_override?: string | null;
  versao_override?: string | null;
  ano: number | null;
  ano_fabricacao: number | null;
  quilometragem: number | null;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
  cor_interna: string | null;
  motor: string | null;
  placa: string | null;
  donos_anteriores: number | null;
  garantia_fabrica: string | null;
  tipo: string | null;
  perfis_uso: string[] | null;
  origem?: string | null;
  preco_original: number | null;
  preco_promocional: number | null;
  preco_compra?: number | null;
  status_tag: string | null;
  em_preparacao?: boolean | null;
  previsao_chegada_em?: string | null;
  vendido: boolean | null;
  estado_cadastro?: string | null;
  pericia: string | null;
  laudo_pericia: string | null;
  opcionais: string | null;
  descricao: string | null;
  descricao_seo: string | null;
  whatsapp_images: string[] | null;
  web_full_images: string[] | null;
  created_at: string | null;
}

const brl = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const texto = (v: string | null | undefined) => (v && v.trim() ? v.trim() : NAO_INFORMADO);

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3 border-t-2 border-mt-regua pt-5">
      <h2 id={`${id}-titulo`} className="mt-rotulo m-0">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Linhas({ linhas }: { linhas: Array<[string, string]> }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {linhas.map(([rotulo, valor]) => (
        <Fragment key={rotulo}>
          <dt className="font-semibold">{rotulo}</dt>
          <dd className="m-0 text-mt-neutral-800">{valor}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Paragrafos({ valor }: { valor: string | null }) {
  if (!valor || !valor.trim()) return <p className="m-0 text-sm text-mt-neutral-700">{EM_BRANCO}</p>;
  return (
    <div className="flex max-w-prose flex-col gap-2 text-sm leading-relaxed text-mt-neutral-800">
      {valor
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="m-0 whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}

export default function VisaoDoVeiculo({
  veiculo: v,
  perfis,
  visitas30Dias,
  historico,
  agora,
}: {
  veiculo: VeiculoDaVisao;
  perfis: Perfil[];
  /** `null` = GA4 não configurado ou indisponível. Nunca confundir com zero. */
  visitas30Dias: number | null;
  /** `null` = a leitura do histórico falhou ou a tabela não existe. */
  historico: LinhaDeHistorico[] | null;
  agora: Date;
}) {
  const podeVerCusto = podeGravarCampo(perfis, "preco_compra");
  const estado = normalizarEstadoCadastro(v.estado_cadastro);
  const fotos = fotosDoVeiculo(v.whatsapp_images, v.web_full_images);
  // Os nomes saem do mesmo mapper da tabela e do site (grafia da casa, e a
  // correção de modelo e versão do painel): o cadastro guarda tudo em
  // minúsculas e com a versão colada no modelo, e era assim que a visão
  // mostrava ("chevrolet vectra hatch gt-x 2.0 8v 4p", conferido em 02/10).
  //
  // O mapper preenche o que falta ("Sem Marca", "Sem Modelo", versão
  // "Padrão"), porque o site não pode sair com buraco. Aqui o buraco é
  // informação: o valor mapeado só entra quando o cadastro tem o campo, e o
  // que está vazio segue "Não informado".
  const exibido = mapVeiculoDbToVeiculo(v);
  const tem = (...campos: Array<string | null | undefined>) => campos.some((c) => Boolean(c?.trim()));
  const marca = tem(v.marca) ? exibido.marca : "";
  const par = modeloEVersaoParaExibir(
    tem(v.modelo, v.modelo_override) ? exibido.modelo : "",
    tem(v.versao, v.versao_override) ? exibido.versao : "",
  );
  const modelo = par.modelo;
  const versao = par.versao;
  const nome = [marca, modelo].filter(Boolean).join(" ") || `Veículo ${v.id}`;

  const checklist = checklistDoVeiculo(v, { totalDeFotos: fotos.length, podeVerCusto });
  const concluidos = checklist.filter((c) => c.ok).length;
  const bloqueios = bloqueiosDePublicacao(v).filter((b) => b.bloqueia);

  const diasEmEstoque = v.created_at
    ? Math.max(0, Math.floor((agora.getTime() - new Date(v.created_at).getTime()) / 86_400_000))
    : null;

  const promocao = temPromocao(v.preco_promocional, v.preco_original);
  const efetivo = precoEfetivo(v.preco_promocional, v.preco_original);
  const margem = podeVerCusto && v.preco_compra && efetivo ? efetivo - Number(v.preco_compra) : null;
  const previsao = ddmmEmCuritiba(v.previsao_chegada_em);
  const perfisDeUso = (v.perfis_uso ?? [])
    .map((slug) => PERFIS_DE_USO.find((p) => p.slug === slug)?.nome ?? slug)
    .join(", ");

  // Carro publicado que a régua tira da vitrine não tem página para abrir.
  const urlNoSite =
    estado === "publicado" && bloqueios.length === 0 && v.marca && modelo
      ? getVeiculoPdpUrl(exibido)
      : null;

  const carro: Array<[string, string]> = [
    ["Marca", texto(marca)],
    ["Modelo", modelo || NAO_INFORMADO],
    ["Versão", versao || NAO_INFORMADO],
    ["Ano (fabricação/modelo)", [v.ano_fabricacao, v.ano].filter(Boolean).join("/") || NAO_INFORMADO],
    ["Quilometragem", v.quilometragem != null ? `${v.quilometragem.toLocaleString("pt-BR")} km` : NAO_INFORMADO],
    ["Câmbio", texto(exibido.cambio)],
    ["Combustível", texto(exibido.combustivel)],
    ["Cor", texto(exibido.cor)],
    ["Cor interna", texto(v.cor_interna)],
    ["Motor", texto(v.motor)],
    ["Placa", texto(v.placa)],
    ["Donos anteriores", v.donos_anteriores != null ? String(v.donos_anteriores) : NAO_INFORMADO],
    ["Garantia de fábrica", texto(v.garantia_fabrica)],
    ["Carroceria", texto(v.tipo)],
    ["Para que serve", perfisDeUso || NAO_INFORMADO],
    ["Origem do cadastro", v.origem === "painel" ? "Cadastrado no painel" : "Importado do RevendaMais"],
  ];

  const preco: Array<[string, string]> = [
    ["Preço anunciado", brl(v.preco_original)],
    [
      "Promoção",
      promocao
        ? `por ${brl(v.preco_promocional)} (${Math.round(descontoPct(v.preco_promocional, v.preco_original) ?? 0)}% de desconto)`
        : "Sem promoção",
    ],
    ...(podeVerCusto
      ? ([
          ["Preço de compra", v.preco_compra ? brl(v.preco_compra) : NAO_INFORMADO],
          [
            "Margem",
            margem !== null && efetivo
              ? `${brl(margem)} (${((margem / efetivo) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do preço que entra)`
              : "Sem preço de compra, a margem não fecha",
          ],
        ] as Array<[string, string]>)
      : []),
    ["Tag de destaque", v.status_tag?.trim() || "Sem tag"],
    ["Disponibilidade", v.vendido ? "Vendido" : "Disponível"],
    ["Em preparação", v.em_preparacao ? `Sim${previsao ? `, chega ao pátio em ${previsao}` : ""}` : "Não"],
  ];

  const opcionais = (v.opcionais ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div>
          <Link
            href="/admin/estoque"
            className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 no-underline hover:text-mt-accent"
          >
            ← ESTOQUE
          </Link>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
            <h1 className="mt-titulo m-0 text-2xl md:text-3xl">{nome}</h1>
            {podeEditarOVeiculo(perfis) && (
              <Link href={`/admin/estoque/${v.id}/editar`} className="mt-btn mt-btn-primario mt-foco px-5 py-2.5 text-[11px]">
                Editar
              </Link>
            )}
          </div>
          <p className="m-0 mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="mt-rotulo" title={EXPLICACAO_DO_ESTADO_CADASTRO[estado]}>
              {ROTULO_DO_ESTADO_CADASTRO[estado]}
            </span>
            {v.vendido && <span className="font-bold">Vendido</span>}
            <span className="text-mt-neutral-700">
              cód. {v.id}
              {v.placa ? ` · placa ${v.placa}` : ""}
            </span>
            {urlNoSite && (
              <a href={urlNoSite} target="_blank" rel="noreferrer" className="underline">
                Ver no site <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            )}
          </p>
          {bloqueios.length > 0 && (
            <div className="m-0 mt-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2 text-xs text-mt-accent-800">
              <p className="m-0 font-bold">Fora da vitrine. Este veículo não aparece no site enquanto:</p>
              <ul className="m-0 mt-1 list-disc pl-4">
                {bloqueios.map((b) => (
                  <li key={b.id}>{b.texto}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <dl className="m-0 grid grid-cols-2 gap-y-3 text-xs sm:grid-cols-4">
          {(
            [
              ["Dias em estoque", diasEmEstoque !== null ? String(diasEmEstoque) : "—"],
              ["Fotos", String(fotos.length)],
              ["Checklist", `${concluidos}/${checklist.length}`],
              ["Visitas (30 dias)", visitas30Dias === null ? "—" : visitas30Dias.toLocaleString("pt-BR")],
            ] as Array<[string, string]>
          ).map(([rotulo, valor]) => (
            <div key={rotulo} className="flex flex-col gap-1">
              <dt className="mt-rotulo">{rotulo}</dt>
              <dd className="m-0 text-xl font-extrabold tabular-nums">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Secao id="fotos" titulo="Fotos">
        {fotos.length === 0 ? (
          <p className="m-0 text-sm text-mt-neutral-700">Nenhuma foto ainda.</p>
        ) : (
          <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0">
            {fotos.map((f, i) => (
              <li key={`${i}-${f.web}`} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do painel */}
                <img src={f.web} alt={`${nome}, foto ${i + 1}${i === 0 ? " (capa)" : ""}`} loading="lazy" className="h-24 w-32 object-cover" />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao id="o-carro" titulo="O carro">
        <Linhas linhas={carro} />
      </Secao>

      <Secao id="preco" titulo={podeVerCusto ? "Preço e margem" : "Preço e destaque"}>
        <Linhas linhas={preco} />
      </Secao>

      <Secao id="pericia" titulo="Perícia e laudo">
        <Linhas linhas={[["Perícia", texto(v.pericia)]]} />
        <Paragrafos valor={v.laudo_pericia} />
      </Secao>

      <Secao id="opcionais" titulo="Opcionais">
        {opcionais.length === 0 ? (
          <p className="m-0 text-sm text-mt-neutral-700">{EM_BRANCO}</p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {opcionais.map((o, i) => (
              <li key={`${o}-${i}`} className="border border-mt-regua px-2.5 py-1.5 text-[11px]">
                {o}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao id="textos" titulo="Textos">
        <h3 className="m-0 text-xs font-bold">Descrição do anúncio</h3>
        <Paragrafos valor={v.descricao} />
        <h3 className="m-0 mt-2 text-xs font-bold">Descrição para portais e busca</h3>
        <Paragrafos valor={v.descricao_seo} />
      </Secao>

      <Secao id="checklist" titulo="Checklist de publicação">
        <ul className="m-0 flex list-none flex-col divide-y divide-mt-regua-fina p-0">
          {checklist.map((c) => (
            <li key={c.l} className="flex flex-wrap items-baseline justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{c.l}</span>
                <span className="text-xs text-mt-neutral-700">{c.d}</span>
              </span>
              <span className={`text-[11px] font-extrabold tracking-[.08em] ${c.ok ? "text-mt-neutral-700" : "text-mt-accent-800"}`}>
                {c.estado}
              </span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao id="historico" titulo="Histórico">
        {historico === null ? (
          <p className="m-0 text-sm text-mt-neutral-700">Não foi possível ler o histórico agora.</p>
        ) : historico.length === 0 ? (
          <p className="m-0 text-sm text-mt-neutral-700">Nenhuma alteração registrada ainda.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-mt-regua-fina p-0">
            {historico.map((h) => (
              <li key={h.id} className="py-2.5 text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{NOME_DO_CAMPO[h.campo] ?? h.campo}</span>
                  <span className="ml-auto flex-none tabular-nums text-mt-neutral-700">
                    {new Date(h.registrado_em).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mt-1 leading-snug text-mt-neutral-800">
                  <span className="text-mt-neutral-600 line-through">{resumir(h.valor_anterior, h.campo)}</span>
                  <span className="mx-1.5 text-mt-neutral-500" aria-hidden="true">
                    →
                  </span>
                  <span className="sr-only"> para </span>
                  <span className="font-semibold">{resumir(h.valor_novo, h.campo)}</span>
                </div>
                {h.autor_nome && <div className="mt-0.5 text-mt-neutral-700">{h.autor_nome}</div>}
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { podeGravarCampo, type Perfil } from "../../lib/permissoes";
import { CARROCERIAS } from "../../lib/classificacaoVeiculo";
import { PERFIS_DE_USO } from "../../lib/perfisDeUso";
import { bloqueiosDePublicacao, MINIMO_DE_FOTOS } from "../../lib/coerenciaDoCadastro";
import {
  validarCadastroDeVeiculo,
  numeroOuNulo,
  MODALIDADES_DO_CADASTRO,
  ROTULO_DA_MODALIDADE,
  type ModalidadeDoCadastro,
  type ProblemaDoCadastro,
} from "../../lib/cadastroDeVeiculo";

/**
 * Cadastro nativo de veículo — o carro que não veio do RevendaMais.
 *
 * ---------------------------------------------------------------------------
 * Quem abre, quando, e que decisão sai daqui
 * ---------------------------------------------------------------------------
 * **Quem:** Admin ou Comercial — a mesma linha da A17 que decide publicar
 * ("Publicar ou despublicar veículo"). Marketing não cadastra: ele trata foto
 * e texto do que já existe, não decide que carro a loja tem.
 *
 * **Quando:** no minuto em que um carro entra no pátio sem anúncio no
 * RevendaMais — troca na compra, repasse, consignado. Antes disso ele não
 * existe para o painel: não aparece na tabela A6, não tem editor, não pode ser
 * vendido pela tela do Ciclo.
 *
 * **Que decisão sai:** o veículo passa a existir com identidade própria (id na
 * faixa 900.000.001+, `origem = painel`) e o sync do RevendaMais nunca mais o
 * altera — a trava é do banco, migração 20260829130000. Sai também a primeira
 * leitura de margem: com o preço de compra lançado, a diferença aparece aqui,
 * ao vivo, antes de salvar.
 *
 * ---------------------------------------------------------------------------
 * O que esta tela NÃO faz, de propósito
 * ---------------------------------------------------------------------------
 * **Foto.** Não há upload aqui — o armazenamento próprio é a entrega seguinte.
 * O veículo nasce sem nenhuma, e a régua que já existe decide o resto: abaixo
 * de {MINIMO_DE_FOTOS} fotos ele não entra na vitrine, no feed de anúncios nem
 * no sitemap (`bloqueiosDePublicacao`). Nenhum filtro novo foi escrito para
 * isso, e a tela mostra a pendência com a mesma função que o editor A15 usa,
 * para as duas nunca discordarem.
 *
 * **Preço depois da criação.** O editor A15 mostra o preço como campo do feed,
 * não editável — o que é verdade para carro do RevendaMais e passa a ser uma
 * limitação para o nativo. Corrigir isso é decidir a alçada de 5% da A17, que
 * é outra entrega; aqui o preço é digitado uma vez, na criação.
 */

/** O formulário guarda texto; a conversão para número acontece no envio. */
interface Rascunho {
  marca: string;
  modelo: string;
  versao: string;
  ano: string;
  ano_fabricacao: string;
  quilometragem: string;
  preco: string;
  cambio: string;
  combustivel: string;
  cor: string;
  placa: string;
  chassi: string;
  renavam: string;
  /** A porta de entrada (spec 10) — vira `veiculo_entradas` no núcleo. */
  modalidade: string;
  motor: string;
  cor_interna: string;
  donos_anteriores: string;
  garantia_fabrica: string;
  preco_compra: string;
  tipo: string;
  perfis_uso: string[];
  descricao: string;
  descricao_seo: string;
  opcionais: string;
  laudo_pericia: string;
  status_tag: string;
}

const vazio: Rascunho = {
  marca: "",
  modelo: "",
  versao: "",
  ano: "",
  ano_fabricacao: "",
  quilometragem: "",
  preco: "",
  cambio: "",
  combustivel: "",
  cor: "",
  placa: "",
  chassi: "",
  renavam: "",
  modalidade: "compra_direta",
  motor: "",
  cor_interna: "",
  donos_anteriores: "",
  garantia_fabrica: "",
  preco_compra: "",
  tipo: "",
  perfis_uso: [],
  descricao: "",
  descricao_seo: "",
  opcionais: "",
  laudo_pericia: "",
  status_tag: "",
};

/**
 * Sugestões de câmbio e combustível — as formas que o SITE já sabe ler.
 *
 * `datalist`, não `select`: o feed traz "Automático ZF8" e "Diesel (Híbrido
 * Leve)", e uma lista fechada obrigaria a jogar essa informação fora. O que as
 * sugestões garantem é o começo da string, que é o que `car-match.ts` casa
 * (`includes("autom")`, `includes("diesel")`) e o que o destaque rápido
 * "Câmbio automático" compara.
 */
const CAMBIOS = ["Automático", "Manual"];
const COMBUSTIVEIS = ["Flex", "Gasolina", "Diesel", "Elétrico", "Híbrido"];

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const campoCaixa = "mt-campo-caixa mt-foco";

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t-2 border-mt-regua pt-5">
      <div className="mt-rotulo">{titulo}</div>
      {descricao ? (
        <p className="m-0 mb-4 mt-1 max-w-[68ch] text-[11px] leading-relaxed text-mt-neutral-600">
          {descricao}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}

function Campo({
  id,
  rotulo,
  problema,
  dica,
  children,
}: {
  id: string;
  rotulo: string;
  problema?: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={rotuloCampo} htmlFor={id}>
        {rotulo}
      </label>
      {children}
      {problema ? (
        <p className="m-0 text-[11px] font-semibold text-mt-accent">{problema}</p>
      ) : dica ? (
        <p className="m-0 text-[11px] leading-snug text-mt-neutral-500">{dica}</p>
      ) : null}
    </div>
  );
}

export default function CadastroDeVeiculo({ perfil }: { perfil: Perfil[] }) {
  /** "Tudo que for negado some da interface, não fica cinza" — regra do A17.
   *  Campo que este perfil não grava não é desenhado e não entra no corpo do
   *  POST: mandar um campo proibido faria a rota devolver 403 e derrubaria o
   *  cadastro inteiro, inclusive o que a pessoa podia preencher. */
  const podeGravar = (campo: string) => podeGravarCampo(perfil, campo);

  const [v, setV] = useState<Rascunho>(vazio);
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState("");
  const [problemasDoServidor, setProblemasDoServidor] = useState<ProblemaDoCadastro[]>([]);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [criado, setCriado] = useState<{
    id: number | string;
    marca: string | null;
    modelo: string | null;
    laudo_pericia: string | null;
    whatsapp_images: unknown;
  } | null>(null);

  const set = <K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));

  const problemas = useMemo(
    () => validarCadastroDeVeiculo(v as unknown as Record<string, unknown>),
    [v],
  );
  const podeSalvar = problemas.length === 0;

  // Erro de campo só depois da primeira tentativa: apontar tudo em vermelho num
  // formulário em branco é ruído, não ajuda. Mesma régua da tela A19.
  const problemaDe = (campo: string): string | undefined => {
    const doServidor = problemasDoServidor.find((p) => p.campo === campo)?.mensagem;
    if (!tentouEnviar) return doServidor;
    return problemas.find((p) => p.campo === campo)?.mensagem ?? doServidor;
  };

  /* Margem bruta projetada, recalculada a cada tecla — o mesmo cálculo e a
     mesma ressalva do editor A15: preço anunciado menos preço de compra, sem
     preparação, documentação nem custo de pátio. Sai junto com o custo por
     NÃO-renderização, não por CSS: a margem é o custo por subtração, e um
     `hidden` deixaria o valor no HTML de quem não pode vê-lo. */
  const preco = numeroOuNulo(v.preco);
  const compra = numeroOuNulo(v.preco_compra);
  const margem = preco !== null && compra !== null ? preco - compra : null;
  const margemPct = margem !== null && preco ? (margem / preco) * 100 : null;

  /* O que vai estar pendente no minuto seguinte ao cadastro. Mesma função que
     filtra a vitrine e que o editor A15 desenha — a tela não repete a régua,
     ela pergunta. `whatsapp_images: []` porque é assim que o veículo nasce:
     esta entrega não sobe foto. */
  const pendencias = useMemo(
    () =>
      bloqueiosDePublicacao({
        laudo_pericia: v.laudo_pericia,
        whatsapp_images: [],
        origem: "painel",
      }),
    [v.laudo_pericia],
  );

  const enviar = async () => {
    setTentouEnviar(true);
    setErroGeral("");
    setProblemasDoServidor([]);
    if (!podeSalvar) return;

    setEnviando(true);
    try {
      // Campo vazio não viaja: o que a pessoa não preencheu não vira string
      // vazia no banco, e um campo a menos no corpo é um campo a menos para o
      // gate da matriz recusar.
      const corpo: Record<string, unknown> = {};
      const texto = (campo: keyof Rascunho) => {
        const valor = String(v[campo] ?? "").trim();
        if (valor !== "") corpo[campo] = valor;
      };
      const numero = (campo: keyof Rascunho) => {
        const n = numeroOuNulo(v[campo]);
        if (n !== null) corpo[campo] = n;
      };

      // Identidade — sempre enviada por quem chegou até aqui: o gate da rota já
      // decidiu que este perfil cadastra veículo.
      (["marca", "modelo", "versao", "cambio", "combustivel", "cor"] as const).forEach(texto);
      (["ano", "ano_fabricacao", "quilometragem", "preco"] as const).forEach(numero);

      // A porta de entrada vai SEMPRE: ela não é campo de `estoque_motors` e
      // sim o que a rota usa para registrar a aquisição no núcleo. Sem ela, o
      // padrão do banco é compra direta — e carro de terceiro entraria como
      // nosso, que é justamente o que as constraints da spec 10 impedem.
      corpo.modalidade = v.modalidade;

      // Ficha própria e documento — cada um só se a matriz deixar. `renavam`
      // acompanha o chassi: os dois são documento do veículo e a mesma linha
      // da A17 os governa.
      for (const campo of ["placa", "chassi", "renavam", "motor", "cor_interna", "garantia_fabrica"] as const) {
        if (podeGravar(campo === "renavam" ? "chassi" : campo)) texto(campo);
      }
      for (const campo of ["descricao", "descricao_seo", "opcionais", "laudo_pericia", "status_tag", "tipo"] as const) {
        if (podeGravar(campo)) texto(campo);
      }
      if (podeGravar("donos_anteriores")) numero("donos_anteriores");
      if (podeGravar("preco_compra")) numero("preco_compra");
      if (podeGravar("perfis_uso") && v.perfis_uso.length > 0) {
        corpo.perfis_uso = v.perfis_uso;
      }

      const res = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroGeral(data.error ?? "Não foi possível cadastrar o veículo.");
        setProblemasDoServidor(data.problemas ?? []);
        return;
      }
      setCriado(data.veiculo);
    } catch {
      setErroGeral("Falha de rede. O veículo NÃO foi cadastrado — tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  // -------------------------------------------------------------------------
  // Depois de gravar: o código gerado e o que falta para o carro ir à vitrine
  // -------------------------------------------------------------------------
  if (criado) {
    const bloqueios = bloqueiosDePublicacao({
      laudo_pericia: criado.laudo_pericia,
      whatsapp_images: criado.whatsapp_images,
      origem: "painel",
    });
    const nome = [criado.marca, criado.modelo].filter(Boolean).join(" ") || "Veículo";

    return (
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <div className="border-b-2 border-mt-regua pb-5">
          <div className="mt-rotulo mt-rotulo-accent">Veículo cadastrado</div>
          <h1 className="mt-titulo mt-2 text-2xl md:text-3xl">{nome}</h1>
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-mt-neutral-800">
            Código <strong className="tabular-nums">{criado.id}</strong>. Ele já aparece na tabela
            de estoque e tem editor próprio. O sync do RevendaMais não altera este veículo — a
            trava é do banco, não de configuração.
          </p>
        </div>

        {/* O carro NASCE RASCUNHO — trigger da migração 20260830120000, e vale
            igual para o que vem do RevendaMais. Dizer isto aqui não é detalhe:
            a versão anterior desta tela prometia que "o veículo entra na
            vitrine no próximo carregamento da página" assim que as pendências
            fossem resolvidas, e a partir de 30/08 isso ficou falso — falta o
            ato de publicar. Quem cadastrou sairia daqui esperando um carro no
            ar que nunca apareceria. */}
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3.5">
          <div className="mt-rotulo mb-2">Nasce como rascunho</div>
          <p className="m-0 text-xs leading-relaxed text-mt-neutral-800">
            Só o painel enxerga este veículo. Ele vai à vitrine quando alguém com a alçada de
            publicação clicar em <strong>Publicar</strong> — no editor ou na tabela de estoque.
            Importação nenhuma publica sozinha, e este cadastro também não.
          </p>
        </div>

        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3.5">
          <div className="mt-rotulo mb-2">
            {bloqueios.some((b) => b.bloqueia) ? "Falta para poder publicar" : "Pendências"}
          </div>
          {bloqueios.length === 0 ? (
            <p className="m-0 text-xs leading-relaxed text-mt-accent-800">
              Nada pendente — o veículo já pode ser publicado.
            </p>
          ) : (
            <ul className="m-0 list-disc pl-4 text-xs leading-relaxed text-mt-accent-800">
              {bloqueios.map((b) => (
                <li key={b.id}>
                  {b.texto}
                  {b.bloqueia ? "" : " (pendência — não tira do ar)"}
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 mt-2 text-[11px] leading-relaxed text-mt-accent-800">
            O upload de fotos entra na próxima entrega, com armazenamento próprio. Até lá o
            veículo fica visível só aqui no painel.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/estoque/${criado.id}`}
            className="mt-btn mt-btn-primario mt-foco px-5 py-3 text-[11px] no-underline"
          >
            Abrir no editor
          </Link>
          <Link
            href="/admin/estoque"
            className="mt-btn mt-btn-contorno mt-foco px-5 py-3 text-[11px] no-underline"
          >
            Voltar ao estoque
          </Link>
          <button
            type="button"
            onClick={() => {
              setV(vazio);
              setCriado(null);
              setTentouEnviar(false);
              setErroGeral("");
              setProblemasDoServidor([]);
            }}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-5 py-3 text-[11px]"
          >
            Cadastrar outro
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // O formulário
  // -------------------------------------------------------------------------
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div className="border-b-2 border-mt-regua pb-5">
        <Link
          href="/admin/estoque"
          className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 no-underline hover:text-mt-accent"
        >
          ← ESTOQUE
        </Link>
        <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">Novo veículo</h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-mt-neutral-800">
          Para o carro que <strong>não veio do RevendaMais</strong> — troca na compra, repasse,
          consignado. O que for digitado aqui é nosso: o sync não sobrescreve veículo cadastrado
          no painel, e não há próximo ciclo para desfazer a correção.
        </p>
      </div>

      {erroGeral && (
        <div
          role="alert"
          className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800"
        >
          {erroGeral}
        </div>
      )}

      <Secao
        titulo="Como o carro entrou"
        descricao="A porta de entrada fica registrada na história do veículo — é ela que diz se o carro é da loja ou de terceiro. Troca não aparece aqui porque depende da venda que a gerou; ela entra quando o registro de venda existir."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo
            id="c-modalidade"
            rotulo="Porta de entrada *"
            dica="Consignação e parceria são carro de terceiro: o custo não entra como nosso."
          >
            <select
              id="c-modalidade"
              value={v.modalidade}
              onChange={(e) => set("modalidade", e.target.value)}
              className={campoCaixa}
            >
              {MODALIDADES_DO_CADASTRO.map((m) => (
                <option key={m} value={m}>
                  {ROTULO_DA_MODALIDADE[m]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </Secao>

      <Secao
        titulo="Identificação · obrigatório"
        descricao="Marca, modelo, ano, preço, quilometragem e chassi. Os cinco primeiros são o mínimo que a vitrine precisa ler; o chassi é a identidade do veículo no sistema — é por ele que o mesmo carro não entra duas vezes, e é o que a escrituração no RENAVE vai pedir."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo id="c-marca" rotulo="Marca *" problema={problemaDe("marca")}>
            <input
              id="c-marca"
              value={v.marca}
              placeholder="Volkswagen"
              onChange={(e) => set("marca", e.target.value)}
              className={campoCaixa}
              autoComplete="off"
            />
          </Campo>
          <Campo id="c-modelo" rotulo="Modelo *" problema={problemaDe("modelo")}>
            <input
              id="c-modelo"
              value={v.modelo}
              placeholder="Nivus"
              onChange={(e) => set("modelo", e.target.value)}
              className={campoCaixa}
              autoComplete="off"
            />
          </Campo>
          <Campo
            id="c-versao"
            rotulo="Versão"
            dica="Só o que o modelo não diz — ela vira a segunda linha do título."
          >
            <input
              id="c-versao"
              value={v.versao}
              placeholder="Highline 1.0 TSI"
              onChange={(e) => set("versao", e.target.value)}
              className={campoCaixa}
              autoComplete="off"
            />
          </Campo>
          <Campo
            id="c-preco"
            rotulo="Preço anunciado *"
            problema={problemaDe("preco")}
            dica="Em reais, sem centavos."
          >
            <input
              id="c-preco"
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              value={v.preco}
              placeholder="118900"
              onChange={(e) => set("preco", e.target.value)}
              className={`${campoCaixa} text-lg font-extrabold tabular-nums`}
            />
          </Campo>
          <Campo id="c-ano" rotulo="Ano do modelo *" problema={problemaDe("ano")}>
            <input
              id="c-ano"
              type="number"
              inputMode="numeric"
              value={v.ano}
              placeholder="2023"
              onChange={(e) => set("ano", e.target.value)}
              className={`${campoCaixa} tabular-nums`}
            />
          </Campo>
          <Campo
            id="c-ano-fab"
            rotulo="Ano de fabricação"
            problema={problemaDe("ano_fabricacao")}
            dica="Em branco, o site mostra só o ano do modelo."
          >
            <input
              id="c-ano-fab"
              type="number"
              inputMode="numeric"
              value={v.ano_fabricacao}
              placeholder="2022"
              onChange={(e) => set("ano_fabricacao", e.target.value)}
              className={`${campoCaixa} tabular-nums`}
            />
          </Campo>
          <Campo id="c-km" rotulo="Quilometragem *" problema={problemaDe("quilometragem")}>
            <input
              id="c-km"
              type="number"
              min={0}
              inputMode="numeric"
              value={v.quilometragem}
              placeholder="38400"
              onChange={(e) => set("quilometragem", e.target.value)}
              className={`${campoCaixa} tabular-nums`}
            />
          </Campo>
          <Campo id="c-cor" rotulo="Cor">
            <input
              id="c-cor"
              value={v.cor}
              placeholder="Cinza Platinum"
              onChange={(e) => set("cor", e.target.value)}
              className={campoCaixa}
              autoComplete="off"
            />
          </Campo>
          <Campo id="c-cambio" rotulo="Câmbio">
            <input
              id="c-cambio"
              list="lista-cambio"
              value={v.cambio}
              placeholder="Automático"
              onChange={(e) => set("cambio", e.target.value)}
              className={campoCaixa}
              autoComplete="off"
            />
            <datalist id="lista-cambio">
              {CAMBIOS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>
          <Campo id="c-combustivel" rotulo="Combustível">
            <input
              id="c-combustivel"
              list="lista-combustivel"
              value={v.combustivel}
              placeholder="Flex"
              onChange={(e) => set("combustivel", e.target.value)}
              className={campoCaixa}
              autoComplete="off"
            />
            <datalist id="lista-combustivel">
              {COMBUSTIVEIS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>
        </div>
      </Secao>

      {/* Preço de compra e margem — some inteira para quem não vê custo. */}
      {podeGravar("preco_compra") && (
        <Secao
          titulo="Custo e margem"
          descricao="A margem é recalculada enquanto você digita. Bruta: preço anunciado menos o de compra, sem preparação, documentação nem custo de pátio."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              id="c-compra"
              rotulo="Preço de compra · nosso"
              dica="Sem ele a margem por veículo não fecha."
            >
              <input
                id="c-compra"
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                value={v.preco_compra}
                placeholder="102000"
                onChange={(e) => set("preco_compra", e.target.value)}
                className={`${campoCaixa} border-mt-accent text-lg font-extrabold tabular-nums`}
              />
            </Campo>
          </div>

          <div className="mt-4 border border-mt-regua-fina bg-mt-surface px-4 py-3">
            {[
              { l: "Preço anunciado", v: preco, sinal: "" },
              { l: "Preço de compra", v: compra, sinal: "−" },
            ].map((linha) => (
              <div key={linha.l} className="flex items-baseline gap-3 py-1 text-[12px]">
                <span className="text-mt-neutral-700">{linha.l}</span>
                <span className="ml-auto tabular-nums text-mt-ink">
                  {linha.v === null ? "—" : `${linha.sinal}${brl(linha.v)}`}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-baseline gap-3 border-t border-mt-regua-fina pt-2">
              <span className="text-sm font-semibold text-mt-ink">Margem bruta projetada</span>
              <span
                className={`ml-auto text-xl font-extrabold tabular-nums tracking-[-.03em] ${
                  margem === null
                    ? "text-mt-neutral-500"
                    : margem >= 0
                      ? "text-mt-accent-800"
                      : "text-mt-accent"
                }`}
              >
                {margem === null
                  ? "—"
                  : `${brl(margem)} · ${margemPct!.toFixed(1).replace(".", ",")}%`}
              </span>
            </div>
          </div>
        </Secao>
      )}

      {/* Documentação — dado interno, nunca aparece no site. */}
      {(podeGravar("placa") || podeGravar("chassi")) && (
        <Secao
          titulo="Documentação · interno"
          descricao="Não aparece no site em lugar nenhum. Sem chassi não há NF-e, RENAVE nem fechamento de venda do Ciclo — e o carro que não veio do feed não tem quem o traga."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {podeGravar("placa") && (
              <Campo id="c-placa" rotulo="Placa" problema={problemaDe("placa")}>
                <input
                  id="c-placa"
                  value={v.placa}
                  placeholder="ABC1D23"
                  onChange={(e) => set("placa", e.target.value.toUpperCase())}
                  className={`${campoCaixa} font-mono`}
                  autoComplete="off"
                />
              </Campo>
            )}
            {podeGravar("chassi") && (
              <Campo
                id="c-chassi"
                rotulo="Chassi *"
                problema={problemaDe("chassi")}
                dica="17 caracteres, como está no documento. É a identidade do veículo: sem ele o cadastro não é concluído, e é por ele que o mesmo carro não entra duas vezes."
              >
                <input
                  id="c-chassi"
                  value={v.chassi}
                  placeholder="9BWZZZ377VT004251"
                  onChange={(e) => set("chassi", e.target.value.toUpperCase())}
                  className={`${campoCaixa} font-mono`}
                  autoComplete="off"
                />
              </Campo>
            )}
            {podeGravar("chassi") && (
              <Campo
                id="c-renavam"
                rotulo="Renavam"
                dica="Opcional aqui, exigido na escrituração. Não se repete entre veículos."
              >
                <input
                  id="c-renavam"
                  value={v.renavam}
                  placeholder="00123456789"
                  inputMode="numeric"
                  onChange={(e) => set("renavam", e.target.value.replace(/\D/g, ""))}
                  className={`${campoCaixa} font-mono tabular-nums`}
                  autoComplete="off"
                />
              </Campo>
            )}
            {podeGravar("motor") && (
              <Campo id="c-motor" rotulo="Motor">
                <input
                  id="c-motor"
                  value={v.motor}
                  placeholder="1.0 TSI · 128 cv"
                  onChange={(e) => set("motor", e.target.value)}
                  className={campoCaixa}
                  autoComplete="off"
                />
              </Campo>
            )}
            {podeGravar("cor_interna") && (
              <Campo id="c-cor-interna" rotulo="Cor interna">
                <input
                  id="c-cor-interna"
                  value={v.cor_interna}
                  placeholder="Preto"
                  onChange={(e) => set("cor_interna", e.target.value)}
                  className={campoCaixa}
                  autoComplete="off"
                />
              </Campo>
            )}
            {podeGravar("donos_anteriores") && (
              <Campo id="c-donos" rotulo="Donos anteriores">
                <input
                  id="c-donos"
                  type="number"
                  min={0}
                  value={v.donos_anteriores}
                  onChange={(e) => set("donos_anteriores", e.target.value)}
                  className={`${campoCaixa} tabular-nums`}
                />
              </Campo>
            )}
            {podeGravar("garantia_fabrica") && (
              <Campo id="c-garantia" rotulo="Garantia de fábrica">
                <input
                  id="c-garantia"
                  value={v.garantia_fabrica}
                  placeholder="Até 03/2027"
                  onChange={(e) => set("garantia_fabrica", e.target.value)}
                  className={campoCaixa}
                  autoComplete="off"
                />
              </Campo>
            )}
          </div>
        </Secao>
      )}

      {podeGravar("tipo") && (
        <Secao
          titulo="Classificação"
          descricao="Carroceria alimenta os filtros e o hub do site. Cada perfil marcado coloca o veículo na vitrine daquele uso — marque quantos couberem."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo id="c-tipo" rotulo="Carroceria">
              {/* Lista fechada, como no editor A15: texto livre foi o que fez o
                  feed usar "Hatch" de lixeira, Kombi e Bongo incluídos. */}
              <select
                id="c-tipo"
                value={v.tipo}
                onChange={(e) => set("tipo", e.target.value)}
                className={campoCaixa}
              >
                <option value="">— sem carroceria —</option>
                {CARROCERIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="mt-4">
            <div className={rotuloCampo}>Para que este carro serve</div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {PERFIS_DE_USO.map((p) => {
                const marcado = v.perfis_uso.includes(p.slug);
                return (
                  <label
                    key={p.slug}
                    className="mt-foco flex cursor-pointer items-center gap-2 text-[12px] text-mt-ink"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => {
                        // Ordem canônica, não a dos cliques — igual ao editor.
                        const proximos = PERFIS_DE_USO.filter((x) =>
                          x.slug === p.slug ? !marcado : v.perfis_uso.includes(x.slug),
                        ).map((x) => x.slug);
                        set("perfis_uso", proximos);
                      }}
                      className="h-3.5 w-3.5 accent-mt-accent"
                    />
                    {p.nome}
                  </label>
                );
              })}
            </div>
          </div>
        </Secao>
      )}

      {podeGravar("descricao") && (
        <Secao
          titulo="Texto do anúncio"
          descricao="Tudo opcional agora — o editor A15 abre os mesmos campos depois. O laudo cautelar aparece na ficha e é cobrado no checklist de publicação."
        >
          <div className="flex flex-col gap-4">
            <Campo id="c-descricao" rotulo="Descrição editorial">
              <textarea
                id="c-descricao"
                rows={4}
                value={v.descricao}
                placeholder="Texto que abre a página do veículo."
                onChange={(e) => set("descricao", e.target.value)}
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
            </Campo>
            <Campo
              id="c-opcionais"
              rotulo="Opcionais"
              dica="Separados por vírgula — os primeiros aparecem no card do catálogo."
            >
              <textarea
                id="c-opcionais"
                rows={3}
                value={v.opcionais}
                placeholder="Teto solar, Bancos de couro, Câmera 360…"
                onChange={(e) => set("opcionais", e.target.value)}
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
            </Campo>
            <Campo
              id="c-laudo"
              rotulo="Laudo cautelar"
              dica="O selo de perícia aprovada no site depende da perícia, não deste texto."
            >
              <textarea
                id="c-laudo"
                rows={3}
                value={v.laudo_pericia}
                placeholder="Ex: Laudo cautelar aprovado. Pintura original, sem retoques."
                onChange={(e) => set("laudo_pericia", e.target.value)}
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
            </Campo>
          </div>
        </Secao>
      )}

      {/* Fotos: o que esta entrega não faz, dito na interface em vez de
          simulado — a régua da casa. */}
      <Secao titulo="Fotos">
        <div className="border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
          <p className="m-0 text-xs leading-relaxed text-mt-neutral-800">
            <strong>Não há upload de foto nesta tela.</strong> Ele entra na próxima entrega, com
            armazenamento próprio — as fotos de vitrine vêm da sessão fotográfica e sobem por
            aqui, no desktop; as internas de avaria e vistoria são do aplicativo de pátio.
          </p>
          <p className="m-0 mt-2 text-xs leading-relaxed text-mt-neutral-800">
            Enquanto o veículo tiver menos de <strong>{MINIMO_DE_FOTOS} fotos</strong>, ele fica
            visível só no painel: não entra na vitrine, no feed de anúncios nem no sitemap. Isso
            já vale para todo o estoque — não é regra nova deste cadastro.
          </p>
          {pendencias.length > 0 && (
            <ul className="m-0 mt-2.5 list-disc pl-4 text-[11px] leading-relaxed text-mt-neutral-700">
              {pendencias.map((p) => (
                <li key={p.id}>
                  {p.texto}
                  {p.bloqueia ? "" : " (pendência — não tira do ar)"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Secao>

      {tentouEnviar && problemas.length > 0 && (
        <div role="alert" className="border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
          <p className="m-0 text-[13px] font-bold text-mt-ink">
            Falta {problemas.length === 1 ? "1 campo" : `${problemas.length} campos`} para
            cadastrar:
          </p>
          <ul className="m-0 mt-1.5 list-disc pl-5 text-[12px] text-mt-neutral-700">
            {problemas.map((p) => (
              <li key={`${p.campo}-${p.mensagem}`}>{p.mensagem}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 border-t-2 border-mt-regua pt-5 pb-10">
        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          className="mt-btn mt-btn-primario mt-foco cursor-pointer px-6 py-3.5 text-[11px] disabled:opacity-45"
        >
          {enviando ? "Cadastrando…" : "Cadastrar veículo"}
        </button>
        <Link
          href="/admin/estoque"
          className="mt-btn mt-btn-contorno mt-foco px-5 py-3.5 text-[11px] no-underline"
        >
          Cancelar
        </Link>
        <span className="text-[11px] text-mt-neutral-500">
          {podeSalvar ? "Pronto para cadastrar." : "Campos obrigatórios pendentes."}
        </span>
      </div>
    </div>
  );
}

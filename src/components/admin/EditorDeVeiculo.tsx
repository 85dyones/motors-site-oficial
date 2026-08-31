"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { podeGravarCampo, type Perfil } from "../../lib/permissoes";
import { CARROCERIAS } from "../../lib/classificacaoVeiculo";
import { PERFIS_DE_USO } from "../../lib/perfisDeUso";
import {
  descontoPct,
  precoEfetivo,
  recusaDaPromocao,
  temPromocao,
} from "../../lib/precoPromocional";
import { recusaPorPisoDeCusto } from "../../lib/pisoDePreco";
import {
  MINIMO_DE_FOTOS,
  bloqueiosDePublicacao,
  divergenciaDeCarroceria,
} from "../../lib/coerenciaDoCadastro";
import {
  CAMPO_DO_ESTADO,
  EXPLICACAO_DO_ESTADO_CADASTRO,
  ROTULO_DA_ACAO,
  ROTULO_DO_ESTADO_CADASTRO,
  acoesDoEstado,
  normalizarEstadoCadastro,
  ESTADO_APOS_ACAO,
} from "../../lib/estadoDoCadastro";
import { fotosDoVeiculo } from "../../lib/fotosDoVeiculo";
import GaleriaDeFotos from "./GaleriaDeFotos";

/**
 * Tela A15 do design doc — editor de veículo.
 *
 * Antes disto, editar um carro era rolar até ele numa lista de 88 cards e
 * mexer nos campos ali mesmo. O doc pede tela dedicada, com abas e o
 * checklist de publicação sempre à vista — é o que esta é. Desde 2026-08-08 a
 * lista de cards não existe mais: quem lista é a tabela A6
 * (`/admin/estoque`), e é dela que se chega aqui.
 *
 * O que o doc desenha e NÃO está aqui, por não haver fonte:
 *
 * - **Visitas na página.** Vêm do GA4 por caminho, e a leitura hoje é feita em
 *   lote na tabela A6; por veículo, entra quando houver credencial garantida
 *   em produção.
 * - **Marca d'água nas fotos.** Depende de arte definida com o dono; o envio,
 *   a ordem e a capa já estão aqui desde 2026-08-30 (bucket próprio, migração
 *   F0-p) — para o veículo cadastrado no painel. No carro do RevendaMais as
 *   imagens continuam do feed e sobrescritas a cada sync, e a aba diz isso.
 * - **Enviar para revisão.** É a tela A16, ainda não construída. O que passou a
 *   existir em 2026-08-30 é o outro lado dela: **publicar e arquivar**, no
 *   cabeçalho. Quem abre esta tela é quem vai finalizar um rascunho vindo da
 *   importação — a decisão que sai daqui é "este carro vai ao ar", e ela é um
 *   botão próprio, não um efeito de salvar.
 *
 * Cada um aparece nomeado na interface em vez de simulado — a régua da casa.
 */

interface VeiculoDb {
  id: number | string;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  ano: number | null;
  ano_fabricacao: number | null;
  quilometragem: number | null;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
  preco: number | null;
  preco_original: number | null;
  /**
   * O "por" do de/por. Zero (ou nulo) significa sem promoção — é o vocabulário
   * que o banco e a PDP já usam. Editável em veículo de QUALQUER origem desde
   * 2026-08-31: promoção é decisão da loja, não do RevendaMais. Ver
   * `lib/precoPromocional.ts`.
   */
  preco_promocional: number | null;
  /** Galeria da ficha, `og:image` e feed dos portais. JPEG quando é nossa. */
  whatsapp_images: string[] | null;
  /** Card do catálogo, hero e vitrine. WebP quando é nossa. */
  web_full_images: string[] | null;
  /** Capa de queda do mapper quando os dois arrays estão vazios. */
  url_imagem: string | null;
  pericia: string | null;
  descricao: string | null;
  descricao_seo: string | null;
  laudo_pericia: string | null;
  opcionais: string | null;
  tipo: string | null;
  perfil_uso: string | null;
  perfis_uso: string[] | null;
  status_tag: string | null;
  status_tag_color: string | null;
  vendido: boolean | null;
  /**
   * A decisão da loja sobre este carro — `rascunho`, `publicado`, `arquivado`
   * (migração 20260830120000). Opcional para o editor não quebrar com linha
   * antiga em cache; `normalizarEstadoCadastro` a trata como rascunho, que é o
   * único dos três que não afirma nada sobre o site.
   */
  estado_cadastro?: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  placa: string | null;
  motor: string | null;
  cor_interna: string | null;
  modelo_override: string | null;
  versao_override: string | null;
  donos_anteriores: number | null;
  garantia_fabrica: string | null;
  preco_compra: number | null;
  /**
   * `sync` (RevendaMais) ou `painel` (cadastro nativo, migração
   * 20260829130000). Decide se o preço anunciado é campo ou texto: só o
   * veículo do painel pode ser reprecificado, porque só nele o sync não passa
   * por cima. Opcional para o editor não quebrar com linha antiga em cache.
   */
  origem?: string | null;
}

type Aba = "fotos" | "ficha" | "opcionais" | "preco" | "texto";

interface LinhaDeHistorico {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  autor_nome: string | null;
  registrado_em: string;
}

/** Rótulo legível para o nome de coluna que o histórico grava. */
const NOME_DO_CAMPO: Record<string, string> = {
  placa: "Placa",
  motor: "Motor",
  cor_interna: "Cor interna",
  modelo_override: "Modelo",
  versao_override: "Versão",
  donos_anteriores: "Donos anteriores",
  garantia_fabrica: "Garantia de fábrica",
  preco_compra: "Preço de compra",
  preco: "Preço efetivo",
  preco_original: "Preço anunciado",
  preco_promocional: "Preço promocional",
  descricao: "Descrição",
  descricao_seo: "Descrição para portais",
  laudo_pericia: "Laudo cautelar",
  opcionais: "Opcionais",
  status_tag: "Tag de destaque",
  status_tag_color: "Cor da tag",
  vendido: "Disponibilidade",
  // A trilha de quem pôs no ar e quem tirou. `aplicarNosVeiculos` já registra
  // autor e horário de qualquer campo — sem o rótulo, a linha sairia como
  // "estado_cadastro" no meio de uma lista em português.
  estado_cadastro: "Publicação",
  tipo: "Carroceria",
  perfil_uso: "Perfil de uso",
  perfis_uso: "Para que serve",
  whatsapp_images: "Fotos (galeria e anúncio)",
  web_full_images: "Fotos (card e vitrine)",
  url_imagem: "Foto de capa",
};

/** Colunas cujo valor é lista de URL — o histórico conta, não transcreve. */
const CAMPOS_DE_LISTA_DE_FOTO = new Set(["whatsapp_images", "web_full_images"]);

/** Encurta valor longo (descrição, opcionais) para caber na linha. */
const resumir = (v: string | null, campo?: string) => {
  if (v === null || v === "") return "vazio";
  if (v === "true") return "vendido";
  if (v === "false") return "disponível";
  // Array de URL vira "12 fotos". `aplicarNosVeiculos` grava o valor com
  // `String(array)`, o que produz 1.700 caracteres de URL colados por vírgula:
  // transcrever isso na trilha não conta nada a ninguém, e o que importa
  // ("eram 6, ficaram 12") cabe em duas palavras.
  if (campo && CAMPOS_DE_LISTA_DE_FOTO.has(campo)) {
    const n = v.split(",").filter((u) => u.trim() !== "").length;
    return n === 1 ? "1 foto" : `${n} fotos`;
  }
  return v.length > 40 ? v.slice(0, 40) + "…" : v;
};

const brl = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const campoCaixa =
  "mt-campo-caixa mt-foco";

export default function EditorDeVeiculo({
  inicial,
  visitas30Dias,
  perfil,
}: {
  inicial: VeiculoDb;
  /** `null` = GA4 não configurado ou indisponível. Nunca confundir com zero. */
  visitas30Dias: number | null;
  /** TODOS os papéis de quem abriu a tela (multi-papel, 2026-08-19) —
   *  `podeGravarCampo` soma: quem é comercial E financeiro grava o que
   *  qualquer um dos dois grava. Governa o que aparece e o que é enviado. */
  perfil: Perfil[];
}) {
  /** "Tudo que for negado some da interface, não fica cinza" — regra do doc
   *  A17. Campo que este perfil não grava não é desenhado, e por isso também
   *  não entra no corpo do PATCH: mandar um campo proibido faria a rota
   *  devolver 403 e derrubaria o salvamento inteiro, inclusive o que a pessoa
   *  podia mesmo alterar. */
  const podeGravar = (campo: string) => podeGravarCampo(perfil, campo);
  const [aba, setAba] = useState<Aba>("fotos");
  const [v, setV] = useState<VeiculoDb>(inicial);
  const [salvo, setSalvo] = useState<VeiculoDb>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [historico, setHistorico] = useState<LinhaDeHistorico[]>([]);
  const [migracaoPendente, setMigracaoPendente] = useState(false);

  const carregarHistorico = useCallback(async () => {
    try {
      const res = await fetch(`/api/estoque/${inicial.id}/historico`);
      const d = await res.json();
      setHistorico(d.historico ?? []);
      setMigracaoPendente(Boolean(d.migracaoPendente));
    } catch {
      /* histórico é informativo: falha nele não atrapalha a edição */
    }
  }, [inicial.id]);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  const sujo = JSON.stringify(v) !== JSON.stringify(salvo);
  const set = <K extends keyof VeiculoDb>(campo: K, valor: VeiculoDb[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));

  /* O nome contradiz a carroceria salva? Só diagnóstico — ver
     `lib/coerenciaDoCadastro.ts`, que nunca escreve. */
  const divergencia = useMemo(
    () => divergenciaDeCarroceria({ marca: v.marca, modelo: v.modelo, versao: v.versao, tipo: v.tipo }),
    [v.marca, v.modelo, v.versao, v.tipo],
  );

  /* As duas colunas de foto, pareadas por índice — `whatsapp_images[3]` e
     `web_full_images[3]` são a mesma fotografia. É o pareamento que faz "a
     primeira é a capa" valer nas duas ao mesmo tempo; a contagem continua
     saindo daqui, como sempre saiu. */
  const fotos = useMemo(
    () => fotosDoVeiculo(v.whatsapp_images, v.web_full_images),
    [v.whatsapp_images, v.web_full_images],
  );

  /* A galeria grava sozinha (ver `GaleriaDeFotos`). As duas atualizações são
     obrigatórias e por motivos diferentes: `setV` redesenha o checklist e o
     aviso de "fora da vitrine" na hora, e `setSalvo` impede que a tela fique
     marcada como "Não salvo" por uma alteração que já está no banco — o que
     faria o botão Salvar reenviar fotos e poluir o histórico. */
  const aoGravarFotos = useCallback(
    (colunas: { whatsapp_images: string[]; web_full_images: string[]; url_imagem: string | null }) => {
      setV((atual) => ({ ...atual, ...colunas }));
      setSalvo((atual) => ({ ...atual, ...colunas }));
    },
    [],
  );

  const diasEmEstoque = useMemo(() => {
    if (!v.created_at) return null;
    const d = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86400000);
    return d >= 0 ? d : null;
  }, [v.created_at]);

  const fichaPropriaCompleta = Boolean(
    v.placa && v.motor && v.cor_interna && v.donos_anteriores !== null && v.garantia_fabrica,
  );

  /** Checklist de publicação — os itens do doc que temos como verificar. */
  const checklist = [
    {
      // O número vem da constante, não da mão: `MINIMO_DE_FOTOS` é a mesma
      // régua que `bloqueiosDePublicacao` aplica e que `getEstoque` usa para
      // filtrar a vitrine. Escrito à mão, um dia mudaria num lugar só e a tela
      // passaria a discordar do site sobre por que o carro sumiu.
      l: `${MINIMO_DE_FOTOS} fotos — bloqueia a publicação`,
      d: "Frente, traseira, laterais, interior, painel e porta-malas.",
      ok: fotos.length >= MINIMO_DE_FOTOS,
      estado:
        fotos.length >= MINIMO_DE_FOTOS ? "OK" : `FALTAM ${MINIMO_DE_FOTOS - fotos.length}`,
    },
    {
      l: "Ficha própria completa",
      d: "Placa, motor, cor interna, donos anteriores e garantia.",
      ok: fichaPropriaCompleta,
      estado: fichaPropriaCompleta ? "OK" : "PENDENTE",
    },
    // O laudo saiu do checklist em 29/08. Ele acusava PENDENTE em 33 dos 34
    // publicados, sobre uma premissa errada: 100% do pátio é periciado, e
    // `laudo_pericia` guarda APONTAMENTOS pontuais. Vazio é o melhor caso, não
    // uma falta — e checklist que fica vermelho no carro impecável ensina a
    // ignorar o checklist.
    {
      l: "Texto do anúncio revisado",
      d: "Descrição editorial que abre a página do veículo.",
      ok: Boolean(v.descricao),
      estado: v.descricao ? "OK" : "PENDENTE",
    },
    {
      l: "Opcionais preenchidos",
      d: "Os primeiros aparecem no card do catálogo.",
      ok: Boolean(v.opcionais),
      estado: v.opcionais ? "OK" : "PENDENTE",
    },
    // Só para quem vê custo: "PENDENTE" aqui já contaria a quem não pode ver
    // que o preço de compra está (ou não) lançado.
    ...(podeGravarCampo(perfil, "preco_compra")
      ? [
          {
            l: "Preço de compra lançado",
            d: "Sem ele a margem por veículo não fecha.",
            ok: v.preco_compra !== null && v.preco_compra !== undefined,
            estado: v.preco_compra ? "OK" : "PENDENTE",
          },
        ]
      : []),
    {
      l: "Carroceria e perfil",
      d: "Alimentam os filtros e a curadoria do site.",
      ok: Boolean(v.tipo && (v.perfis_uso ?? []).length > 0),
      estado: v.tipo && (v.perfis_uso ?? []).length > 0 ? "OK" : "PENDENTE",
    },
  ];
  const concluidos = checklist.filter((c) => c.ok).length;

  /* O que tira este carro do ar agora. Mesma função que `getEstoque` usa para
     filtrar, para a tela e o site nunca discordarem sobre o motivo.

     `.filter(bloqueia)` porque a lista PODE trazer pendência que não tira do
     ar. Hoje não traz — o laudo, que era o único caso, saiu da régua em 29/08 —
     mas o filtro fica: sem ele, o segundo motivo que alguém acrescentar passa a
     dizer "fora da vitrine" sobre um carro que está no ar.

     `laudo_pericia` saiu daqui junto com a regra. A origem fica, e é ela que
     escolhe entre "suba as fotos pelo painel" e "as fotos vêm do RevendaMais":
     sem ela a tela mandava o operador esperar um feed que nunca vai trazer foto
     do carro que ele mesmo cadastrou. */
  const bloqueios = useMemo(
    () =>
      bloqueiosDePublicacao({
        whatsapp_images: v.whatsapp_images,
        origem: v.origem,
      }).filter((b) => b.bloqueia),
    [v.whatsapp_images, v.origem],
  );

  /* ------------------------------------------------------------------------
   * Publicar e arquivar — a decisão, separada da edição
   * ------------------------------------------------------------------------
   * Não entra no `salvar()` de propósito. Salvar é "guardei o que digitei";
   * publicar é "este carro passa a existir para o cliente". Misturar os dois
   * faria alguém pôr carro no ar ao corrigir uma vírgula na descrição — e faria
   * o botão Salvar exigir a linha "Publicar ou despublicar" da A17 de quem só
   * queria escrever texto.
   */
  const estadoCadastro = normalizarEstadoCadastro(v.estado_cadastro);
  const podeDecidirPublicacao = podeGravar(CAMPO_DO_ESTADO);
  const [mudandoEstado, setMudandoEstado] = useState(false);

  const decidirPublicacao = async (acao: "publicar" | "arquivar") => {
    const destino = ESTADO_APOS_ACAO[acao];
    setMudandoEstado(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch(`/api/estoque/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [CAMPO_DO_ESTADO]: destino }),
      });
      const data = await res.json().catch(() => ({}));
      // 422 é a régua de fotos: a rota devolve o motivo escrito, e é ele que
      // aparece — não um "falha ao salvar" que mandaria abrir a aba de fotos
      // por adivinhação.
      if (!res.ok) throw new Error(data.error || "Falha ao mudar o estado do cadastro");

      /* Os dois `set` são obrigatórios e por motivos diferentes: `setV`
         redesenha a etiqueta e os botões na hora, `setSalvo` impede que a tela
         fique marcada como "Não salvo" por algo que já está no banco. Mesma
         dupla que a galeria de fotos usa. */
      setV((atual) => ({ ...atual, estado_cadastro: destino }));
      setSalvo((atual) => ({ ...atual, estado_cadastro: destino }));
      setAviso(
        destino === "publicado"
          ? "Publicado — o veículo passa a aparecer na vitrine."
          : "Arquivado — o veículo sai do ar. Só volta se alguém publicar de novo.",
      );
      carregarHistorico();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setMudandoEstado(false);
    }
  };

  /**
   * A promoção sendo editada — recusa e tamanho do desconto, para a tela dizer
   * o que está fazendo antes de o operador salvar. A régua é a mesma do
   * servidor (`lib/precoPromocional.ts`): a tela é conveniência, o gate de
   * verdade está em `aplicarNosVeiculos`.
   */
  const promocao = {
    recusa:
      recusaDaPromocao(v.preco_promocional, v.preco_original) ??
      // O piso de custo entra na MESMA linha de recusa do campo: para quem
      // opera, "não posso salvar isto" é uma coisa só, venha do de/por ou do
      // chão. `podeVerCusto` espelha o que a tela já mostra — se a seção de
      // custo está visível, o valor não é segredo para esta pessoa.
      recusaPorPisoDeCusto(
        precoEfetivo(v.preco_promocional, v.preco_original),
        v.preco_compra,
        { podeVerCusto: podeGravar("preco_compra") },
      ),
    pct: descontoPct(v.preco_promocional, v.preco_original),
    ativa: temPromocao(v.preco_promocional, v.preco_original),
  };

  /**
   * Margem contra o preço EFETIVO, não contra o de tabela.
   *
   * Até 2026-08-31 a conta era `preco_original - preco_compra`, e o preço
   * promocional não existia como campo do painel — então a distinção não
   * aparecia. Com a promoção editável aqui, manter a conta antiga faria esta
   * tela se contradizer: mostraria "de 85.000 por 69.900" três centímetros
   * acima de uma margem calculada sobre 85.000, que é dinheiro que a loja não
   * vai receber. Quem decide desconto precisa ver o que ele custa.
   */
  const precoQueEntra = precoEfetivo(v.preco_promocional, v.preco_original);
  const margem =
    v.preco_compra && precoQueEntra ? precoQueEntra - Number(v.preco_compra) : null;
  const margemPct = margem !== null && precoQueEntra ? (margem / precoQueEntra) * 100 : null;

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const tudo: Record<string, unknown> = {
        placa: v.placa,
        motor: v.motor,
        cor_interna: v.cor_interna,
        donos_anteriores: v.donos_anteriores,
        garantia_fabrica: v.garantia_fabrica,
        preco_compra: v.preco_compra,
        descricao: v.descricao,
        descricao_seo: v.descricao_seo,
        laudo_pericia: v.laudo_pericia,
        opcionais: v.opcionais,
        status_tag: v.status_tag,
        status_tag_color: v.status_tag_color,
        vendido: v.vendido,
        tipo: v.tipo,
        perfis_uso: v.perfis_uso,
        // Promoção vai em toda origem — é o campo novo de 31/08.
        preco_promocional: v.preco_promocional,
        // Preço de tabela só do nativo, espelhando a condição do campo lá em
        // baixo. Mandá-lo num carro do sync não faria mal (o servidor descarta
        // em `camposGravaveis`), mas mandaria um campo que a tela mostrou como
        // texto fixo — e um dia alguém leria isso como permissão.
        ...(v.origem === "painel"
          ? { preco: v.preco, preco_original: v.preco_original }
          : {}),
      };
      const corpo = Object.fromEntries(
        Object.entries(tudo).filter(([campo]) => podeGravar(campo)),
      );

      const res = await fetch(`/api/estoque/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      setSalvo(v);
      setAviso(
        data.mudancasRegistradas > 0
          ? `Salvo — ${data.mudancasRegistradas} alteração(ões) no histórico.`
          : "Salvo — nada havia mudado.",
      );
      carregarHistorico();
      setTimeout(() => setAviso(""), 4000);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const abas: Array<{ id: Aba; l: string; nota: string; alerta?: boolean }> = [
    { id: "fotos", l: "Fotos e mídia", nota: String(fotos.length) },
    { id: "ficha", l: "Ficha técnica", nota: fichaPropriaCompleta ? "COMPLETA" : "PENDENTE", alerta: !fichaPropriaCompleta },
    { id: "opcionais", l: "Opcionais", nota: v.opcionais ? "OK" : "VAZIO", alerta: !v.opcionais },
    {
      id: "preco",
      l: podeGravar("preco_compra") ? "Preço e margem" : "Preço e destaque",
      // Sem direito a custo, a aba não anuncia estado nenhum — o "PENDENTE"
      // era leitura indireta do preço de compra.
      nota: podeGravar("preco_compra") ? (v.preco_compra ? "OK" : "PENDENTE") : "",
      alerta: podeGravar("preco_compra") ? !v.preco_compra : false,
    },
    { id: "texto", l: "Texto e SEO", nota: v.descricao ? "OK" : "VAZIO", alerta: !v.descricao },
  ];

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho do veículo */}
      <div className="flex flex-wrap items-start gap-5 border-b-2 border-mt-regua pb-5">
        <div className="h-[82px] w-[132px] flex-none overflow-hidden border border-mt-regua-fina bg-mt-surface">
          {fotos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotos[0].web} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-mt-neutral-500">
              SEM FOTO
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Link
            href="/admin/estoque"
            className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 hover:text-mt-accent"
          >
            ← ESTOQUE
          </Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h1 className="mt-titulo text-2xl md:text-3xl">
              {v.marca} {v.modelo}
            </h1>
            {/* A etiqueta lia `v.vendido ? "VENDIDO" : "PUBLICADO"` — e
                escrevia PUBLICADO sobre todo carro que não estivesse vendido,
                inclusive o rascunho recém-cadastrado que o site nunca mostrou.
                Agora sai da coluna que decide. `vendido` continua ao lado, como
                o dado ortogonal que ele é: um carro pode estar publicado E
                vendido (é assim que a carência de SEO funciona). */}
            <span
              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                estadoCadastro === "publicado"
                  ? "border border-mt-regua text-mt-neutral-700"
                  : "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800"
              }`}
              title={EXPLICACAO_DO_ESTADO_CADASTRO[estadoCadastro]}
            >
              {ROTULO_DO_ESTADO_CADASTRO[estadoCadastro].toUpperCase()}
            </span>
            {v.vendido && (
              <span className="border border-mt-ink bg-mt-ink px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-mt-bg">
                VENDIDO
              </span>
            )}
          </div>
          <div className="mt-1.5 text-xs text-mt-neutral-700">
            cód. {v.id} · {v.versao || "sem versão"} · {v.ano || "—"}
            {v.quilometragem ? ` · ${v.quilometragem.toLocaleString("pt-BR")} km` : ""}
            {v.placa ? ` · placa ${v.placa}` : ""}
            {diasEmEstoque !== null ? ` · ${diasEmEstoque} dias em estoque` : ""}
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-3">
          {sujo && (
            <span className="text-[11px] font-semibold text-mt-accent-800">Não salvo</span>
          )}

          {/* Publicar e arquivar SOMEM para quem não tem a linha da A17 — a
              régua do doc é esconder o que é negado, não deixar cinza. A rota
              recusa igual, pela matriz de campo.

              O botão Publicar fica DESABILITADO enquanto houver bloqueio de
              material, e o motivo já está escrito logo abaixo, no checklist
              ("Fora da vitrine. Este veículo não aparece no site enquanto:").
              Publicar mesmo assim gravaria `publicado` num carro que o
              `getEstoque` cortaria em seguida — o painel e o site voltariam a
              discordar, com a agravante de alguém ter clicado achando que
              resolveu. */}
          {podeDecidirPublicacao &&
            acoesDoEstado(estadoCadastro).map((acao) => {
              const travado = acao === "publicar" && bloqueios.length > 0;
              return (
                <button
                  key={acao}
                  onClick={() => decidirPublicacao(acao)}
                  disabled={mudandoEstado || travado}
                  title={
                    travado
                      ? `Falta ${bloqueios.map((b) => b.texto).join("; ")}`
                      : undefined
                  }
                  className={`mt-btn mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-45 ${
                    acao === "publicar" ? "mt-btn-primario" : "mt-btn-contorno"
                  }`}
                >
                  {mudandoEstado ? "…" : ROTULO_DA_ACAO[acao]}
                </button>
              );
            })}

          <button
            onClick={() => setV(salvo)}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-45"
          >
            Descartar
          </button>
          {/* Preço recusado trava o Salvar INTEIRO, e não só o campo: o PATCH
              é um só, e o servidor recusaria tudo com 422. Deixar o botão vivo
              faria o operador perder também o texto e os opcionais que digitou
              na mesma sessão. O `title` diz o motivo, porque botão desabilitado
              sem explicação é o que faz alguém concluir que a tela quebrou. */}
          <button
            onClick={salvar}
            disabled={!sujo || salvando || promocao.recusa !== null}
            title={promocao.recusa ?? undefined}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[11px] disabled:opacity-45"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          {aviso}
        </div>
      )}

      {/* Régua de status */}
      <div className="grid select-none grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-4">
        {[
          { l: "Dias em estoque", v: diasEmEstoque !== null ? String(diasEmEstoque) : "—", nota: v.created_at ? "desde a entrada no feed" : "sem data de entrada" },
          {
            l: "Fotos",
            v: String(fotos.length),
            nota:
              fotos.length >= MINIMO_DE_FOTOS
                ? "acima do mínimo"
                : `mínimo de ${MINIMO_DE_FOTOS}`,
          },
          { l: "Checklist", v: `${concluidos}/${checklist.length}`, nota: concluidos === checklist.length ? "pronto para publicar" : "itens pendentes" },
          {
            l: "Visitas na página",
            v: visitas30Dias === null ? "—" : visitas30Dias.toLocaleString("pt-BR"),
            nota: visitas30Dias === null ? "GA4 sem credencial de leitura" : "últimos 30 dias",
          },
        ].map((k) => (
          <div
            key={k.l}
            className="flex flex-col gap-2 border-b border-mt-regua-fina py-4 pr-5 lg:border-b-0 lg:border-r lg:pl-5 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
          >
            <span className="mt-rotulo">{k.l}</span>
            <span className="text-2xl font-extrabold tracking-[-.03em] tabular-nums">{k.v}</span>
            <span className="text-[11px] leading-tight text-mt-neutral-700">{k.nota}</span>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="flex flex-wrap border-b-2 border-mt-regua">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`mt-foco flex cursor-pointer items-center gap-2 border-r border-mt-regua-fina px-5 py-3.5 text-[12px] font-extrabold uppercase tracking-[.08em] ${
              aba === a.id ? "bg-mt-ink text-mt-bg" : "text-mt-neutral-700 hover:text-mt-ink"
            }`}
          >
            {a.l}
            <span
              className={`text-[10px] font-semibold ${
                aba === a.id
                  ? "text-mt-neutral-400"
                  : a.alerta
                    ? "text-mt-accent"
                    : "text-mt-neutral-600"
              }`}
            >
              {a.nota}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-8 xl:flex-row">
        <div className="min-w-0 flex-1 xl:border-r xl:border-mt-regua-fina xl:pr-7">
          {aba === "fotos" && (
            <GaleriaDeFotos
              estoqueId={v.id}
              fotos={fotos}
              origem={v.origem}
              /* A linha "Adicionar e reordenar fotos" da A17 — Admin,
                 Marketing e Comercial. Perguntar por uma das colunas basta:
                 as três apontam para a mesma linha da matriz. */
              podeEditar={podeGravar("whatsapp_images")}
              aoGravar={aoGravarFotos}
            />
          )}

          {aba === "ficha" && (
            <>
              <div className="mt-rotulo mb-3">Ficha própria · preenchida por nós</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { campo: "placa" as const, l: "Placa", ph: "ABC1D23", up: true },
                  { campo: "motor" as const, l: "Motor", ph: "2.0 turbo · 249 cv" },
                  { campo: "cor_interna" as const, l: "Cor interna", ph: "Ebony" },
                  { campo: "garantia_fabrica" as const, l: "Garantia de fábrica", ph: "Até 03/2027" },
                ].filter((c) => podeGravar(c.campo)).map((c) => (
                  <div key={c.campo} className="flex flex-col gap-1.5">
                    <label className={rotuloCampo} htmlFor={`f-${c.campo}`}>{c.l}</label>
                    <input
                      id={`f-${c.campo}`}
                      value={(v[c.campo] as string) ?? ""}
                      placeholder={c.ph}
                      onChange={(e) =>
                        set(c.campo, (c.up ? e.target.value.toUpperCase() : e.target.value) as any)
                      }
                      className={campoCaixa}
                    />
                  </div>
                ))}
                {podeGravar("donos_anteriores") && (
                  <div className="flex flex-col gap-1.5">
                    <label className={rotuloCampo} htmlFor="f-donos">Donos anteriores</label>
                    <input
                      id="f-donos"
                      type="number"
                      min={0}
                      value={v.donos_anteriores ?? ""}
                      onChange={(e) =>
                        set("donos_anteriores", e.target.value === "" ? null : Number(e.target.value))
                      }
                      className={campoCaixa}
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 border-t-2 border-mt-regua pt-4">
                <div className="mt-rotulo mb-3">Do feed · sobrescrito a cada sync</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Marca", v.marca],
                    ["Ano", v.ano ? String(v.ano) : null],
                    ["KM", v.quilometragem ? v.quilometragem.toLocaleString("pt-BR") : null],
                    ["Câmbio", v.cambio],
                    ["Combustível", v.combustivel],
                    ["Cor externa", v.cor],
                  ].map(([l, valor]) => (
                    <span
                      key={l as string}
                      className="inline-flex items-center gap-1.5 border border-mt-regua-fina bg-mt-bg px-2.5 py-1.5 text-[11px] text-mt-neutral-800"
                      title="Campo do feed — editar aqui seria perdido no próximo sync"
                    >
                      <span className="font-semibold uppercase tracking-[.08em] text-mt-neutral-600">
                        {l}
                      </span>
                      {valor || <span className="text-mt-neutral-500">—</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* Modelo e versão — os dois únicos campos do feed que dá para
                  corrigir, e por um caminho próprio.

                  Editar as colunas `modelo` e `versao` seria desfeito no
                  próximo ciclo do n8n: as duas estão entre as 22 que o
                  sincronizador manda. `modelo_override` e `versao_override`
                  (migração 20260826150000) o sync não conhece, e é isso que
                  faz a correção durar.

                  ⚠️ Mexer aqui MUDA A URL da ficha e o hub de modelo. Não é
                  cosmético: a rota já responde 301 do endereço antigo para o
                  novo, mas link externo antigo passa a dar um salto a mais. */}
              <div className="mt-6 border-t-2 border-mt-regua pt-4">
                <div className="mt-rotulo mb-1">Nome do veículo · corrige o que o feed erra</div>
                <p className="m-0 mb-3 max-w-[62ch] text-[11px] leading-relaxed text-mt-neutral-600">
                  Em branco, vale o que o RevendaMais mandou. Preenchido, vale o
                  que está aqui — e muda a URL da ficha e o agrupamento do hub
                  de modelo. Use quando o feed colar a versão inteira no campo
                  de modelo.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    {
                      campo: "modelo_override" as const,
                      l: "Modelo",
                      doFeed: v.modelo,
                      ph: "Ka",
                    },
                    {
                      campo: "versao_override" as const,
                      l: "Versão",
                      doFeed: v.versao,
                      ph: "Sedan 1.0 SE Flex 4p",
                    },
                  ].filter((c) => podeGravar(c.campo)).map((c) => (
                    <div key={c.campo} className="flex flex-col gap-1.5">
                      <label className={rotuloCampo} htmlFor={`f-${c.campo}`}>{c.l}</label>
                      <input
                        id={`f-${c.campo}`}
                        value={(v[c.campo] as string) ?? ""}
                        placeholder={c.ph}
                        onChange={(e) => set(c.campo, e.target.value)}
                        className={campoCaixa}
                      />
                      <span className="text-[10px] leading-snug text-mt-neutral-500">
                        No feed: {c.doFeed || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 border-t-2 border-mt-regua pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className={rotuloCampo} htmlFor="f-tipo">Carroceria</label>
                  {/* Lista fechada, não texto livre: era `<input>`, e o feed já
                      prova o que texto livre vira — "Hatch" em 20 dos 36
                      veículos, inclusive duas Kombi e um Bongo. Digitar
                      "Perúa" ou "sedã" criaria carroceria que nenhum hub
                      conhece. A lista em lote (`TabelaDeEstoque`) sempre foi
                      um `<select>`; esta tela é que divergia. */}
                  <select
                    id="f-tipo"
                    value={v.tipo ?? ""}
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
                  {divergencia && (
                    /* Alerta, nunca bloqueio. O dono conhece o carro; a tabela
                       conhece o nome. Ele classificou a Saveiro Robust como
                       Utilitário de propósito, e um detector que reclamasse da
                       escolha dele seria desligado na primeira semana. */
                    <p className="m-0 border-l-[3px] border-mt-accent bg-mt-accent-100 px-2.5 py-2 text-[11px] leading-snug text-mt-accent-800">
                      Está <strong>{divergencia.atual}</strong>, mas o nome diz
                      que {divergencia.porque}. Esperado:{" "}
                      <strong>{divergencia.aceitaveis.join(" ou ")}</strong>.
                    </p>
                  )}
                </div>
              </div>

              {/* Para que o carro serve — vários, porque ele é várias coisas.

                  Era um campo de texto com UM valor, e o vocabulário antigo
                  tinha três rótulos dizendo quase a mesma coisa (19 dos 38
                  carros) mais quatro que não existiam em veículo nenhum.
                  Escolher um valor só obrigava a decidir qual verdade contar
                  sobre um HB20 que é urbano, econômico e primeiro carro.

                  Cada perfil marcado vira uma vitrine `/estoque/{slug}`. */}
              <div className="mt-6 border-t-2 border-mt-regua pt-4">
                <div className="mt-rotulo mb-1">Para que este carro serve</div>
                <p className="m-0 mb-3 max-w-[62ch] text-[11px] leading-relaxed text-mt-neutral-600">
                  Marque quantos couberem — um carro costuma servir para mais de
                  uma coisa. Cada marcação coloca o veículo na vitrine daquele
                  uso.
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  {PERFIS_DE_USO.map((perfil) => {
                    const marcado = (v.perfis_uso ?? []).includes(perfil.slug);
                    return (
                      <label
                        key={perfil.slug}
                        className="mt-foco flex cursor-pointer items-center gap-2 text-[12px] text-mt-ink"
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => {
                            const atuais = v.perfis_uso ?? [];
                            // Reordena pela lista canônica em vez de empurrar
                            // no fim: assim a ordem gravada não depende da
                            // ordem dos cliques, e o histórico não registra
                            // mudança quando só a ordem mudou.
                            const proximos = PERFIS_DE_USO.filter((p) =>
                              p.slug === perfil.slug ? !marcado : atuais.includes(p.slug),
                            ).map((p) => p.slug);
                            set("perfis_uso", proximos as any);
                          }}
                          className="h-3.5 w-3.5 accent-mt-accent"
                        />
                        {perfil.nome}
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {aba === "opcionais" && (
            <>
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <div className="mt-rotulo">Opcionais e equipamentos</div>
                <span className="ml-auto text-[11px] text-mt-neutral-700">
                  separados por vírgula · os primeiros aparecem no card
                </span>
              </div>
              <textarea
                rows={5}
                value={v.opcionais ?? ""}
                onChange={(e) => set("opcionais", e.target.value)}
                placeholder="Teto solar, Bancos de couro, Câmera 360, Piloto adaptativo…"
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
              {v.opcionais && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.opcionais
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean)
                    .map((o, i) => (
                      <span
                        key={o + i}
                        className="inline-flex items-center gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[11px] text-mt-ink"
                      >
                        <span className="h-2 w-2 flex-none bg-mt-ink" />
                        {o}
                      </span>
                    ))}
                </div>
              )}
              <p className="mt-4 text-[11px] leading-relaxed text-mt-neutral-700">
                O doc agrupa os opcionais em Conforto, Segurança, Tecnologia e Exterior. O
                agrupamento exige um catálogo de opcionais que ainda não existe — hoje o campo
                é texto livre, e os chips acima são a leitura dele.
              </p>
            </>
          )}

          {aba === "preco" && (
            <>
              <div className="mt-rotulo mb-3">Preço e margem</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* O preço anunciado é do FEED — editá-lo num carro do
                    RevendaMais seria desfeito no ciclo seguinte, em silêncio.
                    No veículo que nasceu aqui (migração 20260829130000) esse
                    motivo não existe: a trava impede o sync de tocá-lo, então
                    o campo é editável. Sem isto, a loja cadastra um carro e
                    não consegue mais corrigir o preço. */}
                {v.origem === "painel" && podeGravar("preco") ? (
                  <div className="flex flex-col gap-1.5">
                    <label className={rotuloCampo} htmlFor="f-preco">
                      Preço anunciado · deste painel
                    </label>
                    <input
                      id="f-preco"
                      type="number"
                      min={0}
                      value={v.preco_original ?? ""}
                      placeholder="Ex: 118900"
                      onChange={(e) => {
                        const valor = e.target.value === "" ? null : Number(e.target.value);
                        // As duas colunas andam juntas: o mapper público lê
                        // `preco_original` e a ordenação da vitrine lê `preco`.
                        set("preco_original", valor);
                        set("preco", valor);
                      }}
                      className={`${campoCaixa} border-mt-accent text-lg font-extrabold`}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className={rotuloCampo}>
                      {v.origem === "painel" ? "Preço anunciado" : "Preço anunciado · do feed"}
                    </span>
                    <div className="border border-mt-regua-fina bg-mt-surface px-3 py-2.5 text-lg font-extrabold tabular-nums tracking-[-.03em] text-mt-neutral-700">
                      {v.preco_original ? brl(v.preco_original) : "—"}
                    </div>
                  </div>
                )}
                {/* Promoção vale para veículo de qualquer origem — inclusive o
                    importado. A trava total do sync (F0-q) tirou do RevendaMais
                    a capacidade de reescrever a coluna, e em 31/08 os 104
                    veículos da base eram do sync: restringi-la ao nativo, como
                    o preço acima, entregaria um campo que não serviria a carro
                    nenhum. */}
                {podeGravar("preco_promocional") && (
                  <div className="flex flex-col gap-1.5">
                    <label className={rotuloCampo} htmlFor="f-promo">
                      Preço promocional · o &quot;por&quot;
                    </label>
                    <input
                      id="f-promo"
                      type="number"
                      min={0}
                      value={v.preco_promocional ? v.preco_promocional : ""}
                      placeholder="Em branco = sem promoção"
                      onChange={(e) => {
                        const valor = e.target.value === "" ? 0 : Number(e.target.value);
                        // Zero, e não null: é assim que o banco e a PDP dizem
                        // "sem promoção" (`hasDiscount` testa `> 0`). Gravar
                        // null faria o campo parecer não-preenchido em vez de
                        // deliberadamente vazio.
                        set("preco_promocional", valor);
                      }}
                      className={`${campoCaixa} ${
                        promocao.recusa ? "border-red-500" : "border-mt-accent"
                      } text-lg font-extrabold`}
                    />
                    {promocao.recusa ? (
                      <span className="text-[11px] font-semibold text-red-600">
                        {promocao.recusa}
                      </span>
                    ) : promocao.pct !== null ? (
                      <span className="text-[11px] text-mt-neutral-800">
                        {`Desconto de ${promocao.pct.toFixed(1)}% — a ficha mostra "de ${brl(
                          v.preco_original,
                        )} por ${brl(v.preco_promocional)}".`}
                      </span>
                    ) : (
                      <span className="text-[11px] text-mt-neutral-700">
                        Sem promoção. A ficha mostra só o preço anunciado.
                      </span>
                    )}
                  </div>
                )}
                {podeGravar("preco_compra") && (
                  <div className="flex flex-col gap-1.5">
                    <label className={rotuloCampo} htmlFor="f-compra">
                      Preço de compra · nosso
                    </label>
                    <input
                      id="f-compra"
                      type="number"
                      min={0}
                      value={v.preco_compra ?? ""}
                      placeholder="Ex: 248000"
                      onChange={(e) =>
                        set("preco_compra", e.target.value === "" ? null : Number(e.target.value))
                      }
                      className={`${campoCaixa} border-mt-accent text-lg font-extrabold`}
                    />
                  </div>
                )}
              </div>

              {/* Margem sai junto com o custo, e por não-renderização, não por
                  CSS: ela é o custo por subtração, e um `hidden` deixaria o
                  valor no HTML para quem abrir o código-fonte. */}
              {podeGravar("preco_compra") && (
                <>
                  <div className="mt-5 flex flex-wrap items-baseline gap-3 border-t-2 border-mt-regua pt-4">
                    <span className="text-sm text-mt-neutral-800">
                      Margem bruta projetada
                      {promocao.ativa && (
                        <span className="ml-1.5 text-[11px] font-semibold text-mt-accent">
                          sobre o preço promocional
                        </span>
                      )}
                    </span>
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
                  <p className="mt-2 text-[11px] leading-relaxed text-mt-neutral-700">
                    Bruta: {promocao.ativa ? "preço promocional" : "preço anunciado"} menos
                    o de compra. Não inclui preparação,
                    documentação nem custo de pátio — esses entram quando o novo
                    financeiro (razão por veículo) estiver no ar; o painel antigo de
                    margem foi aposentado em 2026-08-28.
                  </p>
                </>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 border-t-2 border-mt-regua pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className={rotuloCampo} htmlFor="f-tag">Tag de destaque</label>
                  <input
                    id="f-tag"
                    value={v.status_tag ?? ""}
                    placeholder="ÚNICO DONO"
                    onChange={(e) => set("status_tag", e.target.value)}
                    className={campoCaixa}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className={rotuloCampo}>Disponibilidade</span>
                  <div className="mt-seg">
                    {[
                      [false, "Disponível"],
                      [true, "Vendido"],
                    ].map(([valor, rotulo]) => (
                      <label key={String(valor)} className="mt-seg-opt">
                        <input
                          type="radio"
                          name="disponibilidade"
                          checked={Boolean(v.vendido) === valor}
                          onChange={() => set("vendido", valor as boolean)}
                        />
                        <span>{rotulo as string}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {aba === "texto" && (
            <>
              <div className="mt-rotulo mb-3">Descrição editorial</div>
              <textarea
                rows={7}
                value={v.descricao ?? ""}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="Texto que abre a página do veículo."
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
              <div className="mt-rotulo mb-3 mt-6">Descrição para portais e busca</div>
              <textarea
                rows={3}
                value={v.descricao_seo ?? ""}
                onChange={(e) => set("descricao_seo", e.target.value)}
                placeholder="Frase curta do anúncio: o que diferencia este carro, sem depender do contexto da página."
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
              <p className="mt-3 text-[11px] leading-relaxed text-mt-neutral-700">
                Vai para o feed dos portais e para a descrição que aparece na busca do Google.
                Vazio, o site usa a descrição editorial acima — e só na falta das duas cai numa
                frase genérica. O Google mostra cerca de 155 caracteres.
                {v.descricao_seo ? ` Atual: ${v.descricao_seo.length}.` : ""}
              </p>

              <div className="mt-rotulo mb-3 mt-6">Laudo cautelar</div>
              <textarea
                rows={5}
                value={v.laudo_pericia ?? ""}
                onChange={(e) => set("laudo_pericia", e.target.value)}
                placeholder="Ex: Laudo cautelar aprovado. Pintura original, sem retoques."
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
              <p className="mt-3 text-[11px] leading-relaxed text-mt-neutral-700">
                O laudo só acende o selo de perícia aprovada no site quando o próprio feed traz
                a perícia como aprovada — texto aqui não liga selo, para não afirmar ao cliente
                algo que a vistoria não disse.
              </p>
            </>
          )}
        </div>

        {/* Checklist */}
        <div className="w-full flex-none xl:w-[340px]">
          <div className="mt-rotulo mt-rotulo-accent mb-3">Checklist de publicação</div>

          {/* O estado, dito antes dos itens. Desde 2026-08-27 o item de fotos
              não é conselho: abaixo de 8, o carro sai da vitrine, do feed do
              Ads e do índice de busca. A ficha continua respondendo — quem tem
              o link não bate em 404 — e voltar ao ar é só subir as fotos que
              faltam no RevendaMais. */}
          {/* Decisão da loja e pendência de material são coisas diferentes, e
              a tela diz as duas sem misturá-las. Rascunho e arquivado se
              resolvem com um clique de quem tem a alçada; o bloqueio de fotos
              não se resolve com clique nenhum. */}
          {estadoCadastro !== "publicado" && (
            <div className="mb-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2.5 text-[11px] leading-snug text-mt-accent-800">
              <strong>{ROTULO_DO_ESTADO_CADASTRO[estadoCadastro]}.</strong>{" "}
              {estadoCadastro === "rascunho"
                ? "Só o painel enxerga este veículo. Ele vai ao ar quando alguém publicar — nunca por importação."
                : "Este veículo saiu do estoque e não aparece no site. Não volta sozinho."}
              {/* Só no rascunho: em "arquivado" a frase vinha logo depois de
                  "não volta sozinho" e as duas juntas se contradiziam na
                  leitura. Ali o que interessa é que voltar é decisão, não
                  material — e o botão Publicar já está à mão para quem decidir. */}
              {estadoCadastro === "rascunho" && podeDecidirPublicacao && bloqueios.length === 0 && (
                <> Está pronto para publicar.</>
              )}
            </div>
          )}

          {bloqueios.length > 0 && (
            <div className="mb-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2.5 text-[11px] leading-snug text-mt-accent-800">
              <strong>Fora da vitrine.</strong> Este veículo não aparece no site
              nem no feed de anúncios enquanto:
              <ul className="m-0 mt-1.5 list-disc pl-4">
                {bloqueios.map((b) => (
                  <li key={b.id}>{b.texto}</li>
                ))}
              </ul>
              {estadoCadastro === "rascunho" && (
                <p className="m-0 mt-1.5">Publicar fica travado até isso resolver.</p>
              )}
            </div>
          )}
          {checklist.map((c) => (
            <div key={c.l} className="flex gap-3 border-b border-mt-regua-fina py-2.5">
              <span
                className={`mt-0.5 h-3.5 w-3.5 flex-none border-2 ${
                  c.ok ? "border-mt-ink bg-mt-ink" : "border-mt-accent bg-transparent"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-${c.ok ? "semibold" : "extrabold"}`}>{c.l}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-mt-neutral-700">{c.d}</div>
              </div>
              <span
                className={`flex-none text-[9px] font-bold uppercase tracking-wider ${
                  c.ok ? "text-mt-neutral-600" : "text-mt-accent"
                }`}
              >
                {c.estado}
              </span>
            </div>
          ))}
          <div className="mt-3 flex items-baseline gap-2 border-t-2 border-mt-regua pt-3">
            <span className="text-[13px] font-extrabold">
              {concluidos} de {checklist.length} concluídos
            </span>
            {concluidos < checklist.length && (
              <span className="ml-auto text-[11px] text-mt-neutral-700">
                faltam {checklist.length - concluidos}
              </span>
            )}
          </div>

          {/* Histórico deste veículo */}
          <div className="mt-6 border-t-2 border-mt-regua pt-4">
            <div className="mt-rotulo mb-3">Histórico deste veículo</div>
            {migracaoPendente ? (
              <p className="text-[11px] leading-relaxed text-mt-neutral-700">
                A tabela de histórico ainda não existe no banco. Aplique a migração{" "}
                <code className="text-mt-ink">20260807190000_historico_veiculo.sql</code> para
                começar a registrar quem mudou o quê.
              </p>
            ) : historico.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-mt-neutral-700">
                Nenhuma alteração registrada ainda. A partir de agora, cada campo salvo aqui
                entra nesta lista com autor e horário.
              </p>
            ) : (
              historico.map((h) => (
                <div key={h.id} className="border-b border-mt-regua-fina py-2.5 text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-mt-ink">
                      {NOME_DO_CAMPO[h.campo] ?? h.campo}
                    </span>
                    <span className="ml-auto flex-none text-[11px] tabular-nums text-mt-neutral-700">
                      {new Date(h.registrado_em).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 leading-snug text-mt-neutral-800">
                    <span className="text-mt-neutral-600 line-through">
                      {resumir(h.valor_anterior, h.campo)}
                    </span>
                    <span className="mx-1.5 text-mt-neutral-500">→</span>
                    <span className="font-semibold">{resumir(h.valor_novo, h.campo)}</span>
                  </div>
                  {h.autor_nome && (
                    <div className="mt-0.5 text-[11px] text-mt-neutral-700">{h.autor_nome}</div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-6 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
            <div className="mt-rotulo mb-2">Ainda sem fonte</div>
            <p className="text-xs leading-relaxed text-mt-neutral-800">
              <strong>Visitas na página</strong> dependem da leitura do GA4 — a coleta já
              acontece no site, falta a credencial de serviço para o painel consultar. O envio
              para revisão é a tela A16.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

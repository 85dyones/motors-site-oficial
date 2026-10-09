/**
 * Primitivos do sistema Modernist (redesign 2026).
 *
 * São as peças que se repetem em várias telas do design doc. O que aparece
 * uma vez só fica na própria tela — aqui entra só o que se repete.
 *
 * Regras do sistema que estes componentes carregam:
 * · zero arredondamento
 * · régua de 2px separa seção, de 1px separa item
 * · foto sangra na célula, sem moldura
 * · vermelho só onde há decisão
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { Veiculo } from "../../types";
import { modeloEVersaoParaExibir } from "../../lib/estoqueTabela";
import FotoPropriaDoCard from "./FotoPropriaDoCard";
import FotoOtimizadaDoCard from "./FotoOtimizadaDoCard";
import SinalDeAbertura from "./SinalDeAbertura";
import { ehFotoPropria } from "../../lib/fotosDoVeiculo";
import FaixaEmPreparacao from "./FaixaEmPreparacao";

/* ────────────────────────────────────────────────────────────────────────
   Rótulo em versalete — o marcador tipográfico do sistema
   ──────────────────────────────────────────────────────────────────────── */

export function Rotulo({
  children,
  accent = false,
  className = "",
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`mt-rotulo ${accent ? "mt-rotulo-accent" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Cabeçalho de seção — numeração, título e ação à direita
   ──────────────────────────────────────────────────────────────────────── */

export function CabecalhoSecao({
  numero,
  titulo,
  acao,
  className = "",
}: {
  /** Ex.: "01 — ESTOQUE SELECIONADO" */
  numero?: string;
  titulo: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      /* `mt-cabecalho-secao`: a régua se desenha com a rolagem onde o
         navegador sabe (modernist.css, "movimento com função"). A borda fica
         aqui mesmo assim: é ela que aparece onde não sabe. */
      className={`mt-cabecalho-secao flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-4 ${className}`}
    >
      <div>
        {numero && <div className="mt-secao-numero mb-2.5">{numero}</div>}
        <h2 className="mt-titulo m-0 text-3xl md:text-[46px]">{titulo}</h2>
      </div>
      {acao}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Etiqueta sobre foto
   ──────────────────────────────────────────────────────────────────────── */

export function Etiqueta({
  children,
  accent = false,
  className = "",
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <span className={`mt-etiqueta ${accent ? "mt-etiqueta-accent" : ""} ${className}`}>
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Seta — usada nos botões e links de avanço
   ──────────────────────────────────────────────────────────────────────── */

export function Seta({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

export function IconeWhatsApp({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Link em régua vermelha — "VER OS 75 VEÍCULOS →"
   ──────────────────────────────────────────────────────────────────────── */

export function LinkRegua({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`mt-link-regua mt-foco ${className}`}>
      {children}
      <span className="mt-link-regua-seta text-mt-accent">
        <Seta size={15} />
      </span>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Estatísticas em régua — o trio "75 · 12 · 100%" do hero
   ──────────────────────────────────────────────────────────────────────── */

export function EstatisticasRegua({
  itens,
  inverso = false,
  desenhar = false,
  className = "",
}: {
  /** `valor` aceita nó: a capa passa um número que conta (`NumeroQueConta`). */
  itens: { valor: ReactNode; rotulo: string; accent?: boolean }[];
  /** Sobre fundo escuro */
  inverso?: boolean;
  /**
   * A régua de cima se desenha da esquerda para a direita ao carregar — só a
   * da capa da home (tarefa 3.7), que é a única que entra animada sem esperar
   * a rolagem. Com movimento reduzido ela já aparece inteira
   * (`.mt-regua-desenha`, modernist.css).
   */
  desenhar?: boolean;
  className?: string;
}) {
  /* `--regua-pt` e `--regua-valor` são pontos de ajuste opcionais: quem monta
     a régua num espaço apertado (o hero da home, que precisa caber na altura
     da janela) define as vars num ancestral e elas chegam aqui por herança.
     Sem ninguém definindo, valem os fallbacks abaixo.

     O fallback do valor é um `clamp`, e não os 34px do design, porque quem
     não define a var é a régua de /sobre, que roda na largura toda do
     telefone: em 375px cada coluna fica com ~100px e "3 MESES" a 34px pede
     165px. O número vazava na coluna vizinha e a régua lia "100%FIPE". O
     `clamp` chega nos 34px do design a partir de ~654px de viewport, então
     no desktop nada muda; ele só encolhe onde encolher é o que faz o texto
     caber. Quem define a var (o hero) não é afetado.

     O `gap-x` é o respiro entre colunas. Sem ele as colunas são `flex-1`
     coladas uma na outra e os valores se encostam — mesmo problema das
     réguas com regra vertical, aqui sem a regra para disfarçar. */
  return (
    <div
      className={`relative flex gap-x-4 border-t-2 pt-[var(--regua-pt,16px)] ${
        desenhar ? "border-transparent" : inverso ? "border-mt-inverso-regua" : "border-mt-regua"
      } ${className}`}
    >
      {desenhar && (
        <span
          aria-hidden="true"
          className={`mt-regua-desenha absolute inset-x-0 -top-0.5 h-0.5 ${
            inverso ? "bg-mt-inverso-regua" : "bg-mt-regua"
          }`}
        />
      )}
      {itens.map((item) => (
        <div key={item.rotulo} className="min-w-0 flex-1">
          <div
            className={`text-[length:var(--regua-valor,clamp(19px,5.2vw,34px))] font-extrabold leading-none ${
              // O número em destaque é identidade, não ação: cobre (29/09). No
              // fundo escuro, o cobre do logo; no claro, o de texto.
              item.accent
                ? inverso
                  ? "text-mt-cobre-marca"
                  : "text-mt-cobre"
                : inverso
                  ? "text-mt-inverso"
                  : "text-mt-ink"
            }`}
          >
            {item.valor}
          </div>
          <div
            className={`mt-1 text-[11px] font-semibold tracking-[.14em] ${
              inverso ? "text-mt-inverso-suave" : "text-mt-neutral-600"
            }`}
          >
            {item.rotulo}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Card de veículo

   O card do sistema não tem moldura nem sombra: a foto sangra na célula e
   uma régua de 2px separa a foto dos dados. É o mesmo card na home, no
   catálogo e nas landings de destaque — só muda a densidade.
   ──────────────────────────────────────────────────────────────────────── */

export type DensidadeCard = "destaque" | "catalogo";

export function CardVeiculo({
  veiculo,
  href,
  densidade = "catalogo",
  etiqueta,
  parcela,
  contagemFotos,
  kmEmDestaque = false,
  prioridade = false,
  inverso = false,
}: {
  veiculo: Veiculo;
  href: string;
  densidade?: DensidadeCard;
  /** Selo sobre a foto — "BLINDADO", "ÚNICO DONO"… */
  etiqueta?: string;
  /** Ex.: "48× R$ 15.980" */
  parcela?: string;
  /** Ex.: "42 fotos" */
  contagemFotos?: string;
  /** Pinta a quilometragem de vermelho — usado na landing de baixa km */
  kmEmDestaque?: boolean;
  prioridade?: boolean;
  /**
   * Sobre fundo escuro (o resultado do Profiler, em /carro-perfeito). O card
   * fixa cores de texto desde a 3.4 — tinta nos valores, cobre na marca —, e
   * no escuro elas somem: a tinta ficava a 1,04:1. Aqui cada uma troca pela
   * versão do fundo escuro, como em `EstatisticasRegua`.
   */
  inverso?: boolean;
}) {
  const grande = densidade === "destaque";
  // As cores que mudam no fundo escuro, num lugar só.
  const cor = inverso
    ? {
        marca: "text-mt-cobre-marca",
        apoio: "text-mt-inverso-suave",
        valor: "text-mt-inverso",
        regua: "border-mt-inverso-regua",
        fina: "border-mt-inverso-regua-fina",
        kmDestaque: "text-mt-accent-inverso",
      }
    : {
        marca: "text-mt-cobre",
        apoio: "text-mt-neutral-600",
        valor: "text-mt-ink",
        regua: "border-mt-regua",
        fina: "border-mt-regua-fina",
        kmDestaque: "text-mt-accent-800",
      };
  const foto = veiculo.web_full_images?.[0] ?? veiculo.whatsapp_images?.[0];

  // O feed embute a versão na cauda do modelo — sem o corte, o título do
  // card estoura e a linha de versão vira eco (ver lib/estoqueTabela).
  const { modelo: modeloExibido, versao: versaoExibida } = modeloEVersaoParaExibir(
    veiculo.modelo,
    veiculo.versao,
  );

  const temDesconto =
    veiculo.preco_promocional > 0 &&
    veiculo.preco_promocional < veiculo.preco_original;
  const precoAtivo = temDesconto ? veiculo.preco_promocional : veiculo.preco_original;
  const periciaAprovada = veiculo.pericia === "PERÍCIA APROVADA";

  return (
    // `min-w-0`: com a versão em uma linha só (`truncate`, abaixo), a largura
    // mínima do card passaria a ser a versão inteira. Nas grades de coluna
    // `auto` (ficha, Profiler, repasse) uma versão longa alargaria a grade no
    // celular em vez de cortar com reticências. Apontado pelo qa-guardian.
    <Link
      href={href}
      className={`group mt-card mt-foco flex min-w-0 flex-col no-underline ${inverso ? "text-mt-inverso" : ""}`}
    >
      {/* `overflow-hidden` por causa do zoom leve da foto no mouse
          (`.mt-card-foto`, 30/09): a foto cresce dentro da moldura, sem
          vazar sobre o texto. */}
      <div className="relative aspect-[4/3] overflow-hidden bg-mt-neutral-300">
        {foto ? (
          /* Foto sem moldura e em cores — exceção deliberada ao P&B do
             sistema, porque cor é argumento de venda em carro.

             `next/image` desde 2026-08-25. Era um `<img>` cru com
             `eslint-disable`: sem WebP/AVIF, sem `srcset` e sem `sizes`, com o
             arquivo vindo do S3 do RevendaMais em tamanho cheio. Cada card
             baixava a foto de desktop mesmo no celular, e o §2.2.5 do plano de
             aquisição é direto sobre isso — "em site de estoque, o vilão do LCP
             é sempre a galeria de fotos". A ficha já usava `next/image`; só o
             card tinha ficado de fora, e ele aparece na home, no catálogo, nas
             landings, nos hubs e nas páginas de bairro.

             O `sizes` é o que faz a otimização valer: sem ele o Next serve o
             maior candidato do srcset em qualquer viewport, e o ganho vira
             zero. As três medidas são as grades reais em que este card vive —
             uma coluna no celular, duas no tablet, três no desktop.

             ⚠️ `unoptimized` SÓ para a foto que é nossa (2026-08-30, storage
             próprio F0-p). Não é preferência estética, são duas medições:

             1. **A cota já estourou.** `/_next/image` respondeu 402 em
                produção — quota de otimização da Vercel, contada por imagem de
                ORIGEM. O card é a superfície que mais consome: ele desenha
                todo veículo na home, no catálogo, nas landings, nos hubs e nas
                páginas de bairro. Com o storage próprio o inventário de fotos
                cresce, e mandá-lo inteiro pelo otimizador é comprar de volta o
                mesmo 402.
             2. **Não há o que otimizar.** A foto nossa já sai tratada do
                envio: 1280px no lado maior, WebP, ~90 KB
                (`imageProcessor.processarFotoDeVeiculo`), servida pelo CDN do
                Supabase. O otimizador cortaria pouco e cobraria por isso.

             O que vem do **carro57 continua otimizado** — `ehFotoPropria`
             devolve `false` para qualquer URL fora do bucket `veiculos`, então
             a prop é `false` para 100% do estoque de hoje e este bloco segue
             se comportando exatamente como antes para ele. Lá a otimização
             ainda paga: o RevendaMais entrega o arquivo em tamanho cheio, sem
             `srcset` e sem WebP, e é esse o defeito que o `next/image` veio
             corrigir em 2026-08-25.

             A PDP tem `srcset` também para a foto nossa: lá a fonte é
             `whatsapp_images` (1600px) e a mesma foto vai de miniatura de 240px
             à tela cheia. Desde 09/10 o `srcset` escolhe entre as duas versões
             gravadas no envio (`FotoDaFicha`).

             ⚠️ De 29/09 a 09/10 a foto nossa teve `srcset` pelo
             redimensionamento do Storage do Supabase — e a cota dele (100
             fotos de origem por mês no Pro) acabava no primeiro dia. Desde
             09/10 `FotoPropriaDoCard` serve a versão `web` gravada no envio
             (1280px, ~90 KB), sem transformação nenhuma; ver
             `urlDaVersaoGravada`. O item 1 acima continua valendo: nada disso
             passa pelo `/_next/image`. */
          ehFotoPropria(foto) ? (
            <FotoPropriaDoCard
              src={foto}
              alt={`${veiculo.marca} ${veiculo.modelo} ${veiculo.versao}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={prioridade}
              fetchPriority={prioridade ? "high" : "auto"}
              loading={prioridade ? "eager" : "lazy"}
              className="mt-card-foto object-cover"
            />
          ) : (
            <FotoOtimizadaDoCard
              src={foto}
              alt={`${veiculo.marca} ${veiculo.modelo} ${veiculo.versao}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={prioridade}
              fetchPriority={prioridade ? "high" : "auto"}
              loading={prioridade ? "eager" : "lazy"}
              className="mt-card-foto object-cover"
            />
          )
        ) : null}
        {/* O canto de cima é do SELO de perícia, sempre o mesmo canto
            (tarefa 3.4, "ficha de perícia"): grafite com o ponto no cobre do
            logo, o mesmo desenho do selo da ficha. Só com a perícia aprovada
            pela régua de `formatPericia` ("PERÍCIA APROVADA", a mesma do
            laudo publicado) — mais estrita que o selo da ficha, que acende
            com qualquer valor fora de "análise". A
            etiqueta da vitrine ("BLINDADO", "ÚNICO DONO") vem logo abaixo. */}
        {(periciaAprovada || etiqueta) && (
          <div className="pointer-events-none absolute left-0 top-0 flex flex-col items-start">
            {periciaAprovada && (
              <span
                data-selo="pericia"
                className="mt-selo-pericia flex items-center gap-1.5 bg-mt-inverso-fundo px-2 py-1.5 text-[11px] font-extrabold tracking-[.12em] text-mt-inverso"
              >
                <span className="h-1.5 w-1.5 bg-mt-cobre-marca" aria-hidden="true" />
                PERÍCIA APROVADA
              </span>
            )}
            {etiqueta && <Etiqueta className="text-[11px]">{etiqueta}</Etiqueta>}
          </div>
        )}
        {/* Carro em preparação: canto de baixo, à esquerda — o de cima é da
            etiqueta e o da direita é da contagem de fotos. */}
        <FaixaEmPreparacao
          veiculo={veiculo}
          className="absolute bottom-0 left-0 px-2 py-1 text-[11px]"
        />
        <SinalDeAbertura />
        {contagemFotos && (
          <span className="pointer-events-none absolute bottom-0 right-0 bg-[rgba(20,18,18,.82)] px-2 py-1 text-[11px] font-semibold text-mt-inverso">
            {contagemFotos}
          </span>
        )}
      </div>

      <div className={`mt-3 border-t-2 pt-2.5 ${cor.regua}`}>
        {/* Marca em cobre à esquerda, código do veículo à direita: o cliente
            cita o código no WhatsApp e o vendedor acha o carro na hora. */}
        <div className="flex items-baseline justify-between gap-3">
          <div
            className={`shrink-0 font-semibold uppercase tracking-[.12em] ${cor.marca} ${
              grande ? "text-xs" : "text-[11px]"
            }`}
          >
            {veiculo.marca}
          </div>
          {veiculo.id && (
            <div
              data-linha="codigo"
              className={`min-w-0 truncate text-[11px] tabular-nums tracking-[.02em] ${cor.apoio}`}
            >
              cód. {veiculo.id}
            </div>
          )}
        </div>
        <div
          className={`mt-0.5 font-extrabold leading-tight tracking-[-.02em] ${
            grande ? "text-[22px]" : "text-[19px]"
          }`}
        >
          {modeloExibido}
        </div>
        {/* A linha da versão existe SEMPRE, mesmo vazia (revisão de UI de
            29/09). Sem versão — a F-250 do estoque daquele dia —, ano, km e
            preço subiam uma linha em relação aos vizinhos, e o preço fora da
            linha é o que o olho pega primeiro numa grade de três. Uma linha
            só, com reticências: a versão inteira está na ficha, a um clique. */}
        <div
          data-linha="versao"
          className={`min-h-[1.45em] truncate leading-[1.45] ${inverso ? "text-mt-inverso-suave" : "text-mt-neutral-700"} ${grande ? "text-[13px]" : "text-xs"}`}
        >
          {versaoExibida || "\u00a0"}
        </div>

        {/* Ano, km e câmbio em três colunas com régua — o vocabulário de laudo
            (tarefa 3.4). Algarismos de largura fixa: os números se alinham de
            um card para o outro. O rótulo diz a unidade, então o km sai sem
            o "km". */}
        <dl className={`m-0 mt-2 grid grid-cols-3 border-t ${cor.fina}`}>
          {[
            { rotulo: "ANO", valor: String(veiculo.ano ?? ""), destaque: false },
            {
              rotulo: "KM",
              valor: veiculo.quilometragem.toLocaleString("pt-BR"),
              destaque: kmEmDestaque,
            },
            { rotulo: "CÂMBIO", valor: veiculo.cambio || "—", destaque: false },
          ].map((coluna, i) => (
            <div
              key={coluna.rotulo}
              className={`min-w-0 pt-2 ${i > 0 ? `border-l pl-2.5 ${cor.fina}` : ""}`}
            >
              <dt className={`text-[11px] font-semibold tracking-[.14em] ${cor.apoio}`}>
                {coluna.rotulo}
              </dt>
              <dd
                className={`m-0 mt-1 truncate tabular-nums ${grande ? "text-sm" : "text-[13px]"} ${
                  coluna.destaque ? `font-semibold ${cor.kmDestaque}` : `font-medium ${cor.valor}`
                }`}
              >
                {coluna.valor}
              </dd>
            </div>
          ))}
        </dl>

        {/* `flex-wrap`: na grade de três colunas ao lado dos filtros, entre
            1024 e ~1120 px, o card fica com ~194 px e preço mais convite não
            cabem numa linha. O convite desce em vez de passar por cima. */}
        <div className={`mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5 border-t pt-2.5 ${cor.fina}`}>
          <div className="min-w-0">
            <div
              className={`font-extrabold tracking-[-.03em] tabular-nums ${
                grande ? "text-[28px]" : "text-[23px]"
              }`}
            >
              {formatarPreco(precoAtivo)}
            </div>
            {parcela && (
              <div
                className={`mt-0.5 tabular-nums ${cor.apoio} ${grande ? "text-xs" : "text-[11px]"}`}
              >
                {parcela}
              </div>
            )}
          </div>
          {/* O card inteiro já é o link; isto é só o convite visível, com a
              régua de ação — a única ferrugem do card. No mouse a régua se
              redesenha e a seta anda (`.mt-convite`, modernist.css). */}
          <span
            aria-hidden="true"
            className={`mt-convite mb-1 shrink-0 border-b-2 border-mt-accent pb-1 text-[11px] font-extrabold tracking-[.1em] ${cor.valor} group-hover:text-mt-accent`}
          >
            VER CARRO <span className="mt-convite-seta">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Formatadores

   Espelham `formatPrice`/`formatKm` de HeroSection, mas sem arrastar o
   componente inteiro para dentro dos primitivos.
   ──────────────────────────────────────────────────────────────────────── */

export function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatarKm(valor: number): string {
  if (valor === 0) return "0 km";
  return `${valor.toLocaleString("pt-BR")} km`;
}

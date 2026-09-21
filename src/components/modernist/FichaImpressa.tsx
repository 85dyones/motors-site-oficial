"use client";

import { useSyncExternalStore } from "react";
import type { CompanySettings, Veiculo } from "../../types";
import type { QrDaFicha } from "../../lib/qrDaFicha";
import { telefoneVisivel } from "../../lib/whatsapp";

/**
 * A ficha impressa do veículo — uma folha A4, e só ela.
 *
 * Porte do `Ficha Impressa.dc.html` (projeto Claude Design
 * `74ffa2a9-…`, sistema Modernist). O desenho é uma página só: cabeçalho,
 * identidade e preço, foto grande com três miniaturas, matriz de
 * especificações ao lado do descritivo, faixa do laudo e rodapé com o QR.
 *
 * Três decisões do porte que valem registro:
 *
 * 1. **As medidas continuam em `cqw`.** O desenho mede tudo em porcentagem da
 *    largura da própria folha, com `container-type: size` na página — é o que
 *    faz a tela ser proporcionalmente igual ao papel. Trocar por `mm` ou `pt`
 *    entregaria a mesma folha impressa e uma pré-visualização diferente.
 *
 * 2. **Cor vem de token, não do hexadecimal do desenho.** O `#C83F00` do
 *    arquivo é exatamente o `--brand-primary` que o `ThemeContext` já serve;
 *    escrever o hexadecimal aqui quebraria a troca de paleta pelo painel e
 *    contraria o próprio sistema ("never hard-code a hex the tokens carry").
 *
 * 3. **O que o dado não sustenta não é impresso.** A faixa do laudo só sai
 *    quando `cautelar_100` é verdadeiro, e o ano sai sozinho porque a base
 *    guarda um `ano` só — o desenho mostra "2025 / 2025", que exigiria um ano
 *    de modelo que esta loja não tem cadastrado.
 */

/**
 * Data da emissão — só depois da hidratação (React #418).
 *
 * A ficha é ISR (`revalidate = 3600`): o HTML sai com a data calculada no
 * SERVIDOR, em UTC, presa ao momento do build ou da regeneração. Um aparelho
 * em fuso adiantado (ex.: Pacific/Kiritimati, UTC+14) já vê outro dia
 * enquanto o HTML ainda carrega o de ontem — o texto que o servidor mandou
 * diverge do que o cliente calcularia, e o React descarta a árvore inteira
 * em vez de só corrigir o texto. Reproduzido em produção: o erro aparece com
 * o relógio do Chromium em `Pacific/Kiritimati` e some com `America/Sao_Paulo`.
 *
 * `useSyncExternalStore` com `getServerSnapshot` retornando `null` evita a
 * divergência: o servidor renderiza sem a linha, a hidratação bate (`null`
 * dos dois lados) sem erro, e só DEPOIS dela o valor real do cliente
 * aparece — sem reescrever a árvore que o servidor gerou.
 */
const semAssinatura = () => () => {};

function EmitidaEm({ cidade }: { cidade: string }) {
  const hoje = useSyncExternalStore(
    semAssinatura,
    () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    () => null,
  );
  if (!hoje) return null;
  return (
    <span style={{ fontSize: "1.385cqw", letterSpacing: ".06em", color: "var(--mt-neutral-600)", lineHeight: 1 }}>
      Emitida em {hoje} · {cidade}
    </span>
  );
}

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatarKm(valor: number): string {
  if (valor === 0) return "Sem uso (0 km)";
  return `${valor.toLocaleString("pt-BR")} km`;
}

/** O descritivo do painel aceita HTML; no papel vai texto puro. */
function textoPuro(bruto: string | undefined | null): string {
  if (!bruto) return "";
  return bruto
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Quatro linhas" é o tamanho do bloco no desenho, não uma contagem exata —
 * o texto de referência tem ~400 caracteres.
 *
 * O descritivo que vem do feed passa de 1.500 e estoura a folha: empurra a
 * foto grande para altura zero e joga a matriz por cima das miniaturas.
 * Corta no fim de frase mais próximo do teto, para não terminar no meio de
 * uma palavra.
 */
function resumo(texto: string, teto = 420): string {
  if (texto.length <= teto) return texto;
  const corte = texto.slice(0, teto);
  const fimDeFrase = Math.max(
    corte.lastIndexOf(". "),
    corte.lastIndexOf("! "),
    corte.lastIndexOf("? "),
  );
  if (fimDeFrase > teto * 0.6) return corte.slice(0, fimDeFrase + 1);
  const espaco = corte.lastIndexOf(" ");
  return `${corte.slice(0, espaco > 0 ? espaco : teto).trim()}…`;
}

const ROTULO = {
  fontSize: "1.231cqw",
  fontWeight: 600,
  letterSpacing: ".14em",
  color: "var(--mt-neutral-600)",
  lineHeight: 1,
} as const;

const VALOR = { fontSize: "2cqw", fontWeight: 800, lineHeight: 1.15 } as const;

const TITULO_DE_BLOCO = {
  fontSize: "1.385cqw",
  fontWeight: 800,
  letterSpacing: ".18em",
  color: "var(--mt-accent)",
  lineHeight: 1,
} as const;

export interface FichaImpressaProps {
  veiculo: Veiculo;
  empresa: CompanySettings;
  /** Fotos já resolvidas pela PDP — a primeira é a grande, as três seguintes as miniaturas. */
  fotos: string[];
  qr: QrDaFicha | null;
  modeloExibido: string;
  versaoExibida: string;
  /** O código curto que a loja usa para achar o carro no pátio. */
  codigo: string;
}

export default function FichaImpressa({
  veiculo,
  empresa,
  fotos,
  qr,
  modeloExibido,
  versaoExibida,
  codigo,
}: FichaImpressaProps) {
  const temDesconto =
    veiculo.preco_promocional > 0 && veiculo.preco_promocional < veiculo.preco_original;
  const preco = temDesconto ? veiculo.preco_promocional : veiculo.preco_original;

  const subtitulo = [
    versaoExibida,
    String(veiculo.ano),
    veiculo.cor,
    formatarKm(veiculo.quilometragem),
  ]
    .filter(Boolean)
    .join(" · ");

  /* A matriz é fixa no desenho; aqui a célula sem dado sai fora em vez de
     imprimir um travessão que não informa nada. */
  const especificacoes = [
    ["MARCA", veiculo.marca],
    ["MODELO", modeloExibido],
    ["ANO", String(veiculo.ano)],
    ["QUILOMETRAGEM", formatarKm(veiculo.quilometragem)],
    ["TRANSMISSÃO", veiculo.cambio],
    ["COMBUSTÍVEL", veiculo.combustivel],
    ["COR EXTERNA", veiculo.cor],
    ["CARROCERIA", veiculo.tipo ?? ""],
  ].filter(([, valor]) => Boolean(valor && String(valor).trim()));

  const descritivo = resumo(textoPuro(veiculo.descricao) || textoPuro(veiculo.descricao_seo));
  const miniaturas = fotos.slice(1, 4);

  return (
    <section
      id="ficha-impressa"
      aria-hidden="true"
      style={{
        display: "none",
        flexDirection: "column",
        aspectRatio: "210 / 297",
        minHeight: 0,
        overflow: "hidden",
        containerType: "size",
        padding: "6.19%",
        background: "#ffffff",
        color: "var(--mt-ink)",
        fontFamily: "Archivo, system-ui, sans-serif",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "3.692cqw",
          paddingBottom: "1.538cqw",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.385cqw" }}>
          <span style={{ display: "block", width: "1.231cqw", height: "4cqw", background: "var(--mt-accent)" }} />
          <span style={{ display: "flex", flexDirection: "column", gap: "0.615cqw" }}>
            <span
              style={{
                fontSize: "2.923cqw",
                fontWeight: 800,
                letterSpacing: ".02em",
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              {empresa.name}
            </span>
            <span
              style={{
                fontSize: "1.308cqw",
                fontWeight: 600,
                letterSpacing: ".2em",
                color: "var(--mt-neutral-600)",
                lineHeight: 1,
              }}
            >
              FICHA TÉCNICA DE SHOWROOM
            </span>
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.615cqw",
            textAlign: "right",
          }}
        >
          <span
            style={{
              fontSize: "1.385cqw",
              fontWeight: 800,
              letterSpacing: ".16em",
              color: "var(--mt-accent)",
              lineHeight: 1,
            }}
          >
            COD. {codigo}
          </span>
          <EmitidaEm cidade="Curitiba/PR" />
        </div>
      </header>

      <div style={{ borderTop: "2px solid var(--mt-ink)" }} />

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "4.308cqw",
          padding: "2.154cqw 0 2.462cqw",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.923cqw", minWidth: 0 }}>
          <span
            style={{
              fontSize: "1.538cqw",
              fontWeight: 800,
              letterSpacing: ".2em",
              color: "var(--mt-neutral-600)",
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            {veiculo.marca}
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: "4.923cqw",
              fontWeight: 800,
              letterSpacing: "-.035em",
              lineHeight: 0.94,
              color: "var(--mt-ink)",
            }}
          >
            {modeloExibido}
          </h1>
          <span
            style={{
              fontSize: "1.846cqw",
              fontWeight: 600,
              letterSpacing: ".01em",
              color: "var(--mt-neutral-700)",
              lineHeight: 1.3,
              textWrap: "pretty",
            }}
          >
            {subtitulo}
          </span>
        </div>
        {preco > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "0.769cqw",
              flexShrink: 0,
              borderLeft: "2px solid var(--mt-ink)",
              paddingLeft: "3.077cqw",
            }}
          >
            <span
              style={{
                fontSize: "1.385cqw",
                fontWeight: 800,
                letterSpacing: ".18em",
                color: "var(--mt-neutral-600)",
                lineHeight: 1,
              }}
            >
              PREÇO À VISTA
            </span>
            {temDesconto && (
              <span
                style={{
                  fontSize: "1.692cqw",
                  fontWeight: 600,
                  color: "var(--mt-neutral-600)",
                  textDecoration: "line-through",
                  lineHeight: 1,
                }}
              >
                De {formatarPreco(veiculo.preco_original)}
              </span>
            )}
            <span
              style={{
                fontSize: "5.231cqw",
                fontWeight: 800,
                letterSpacing: "-.04em",
                lineHeight: 1,
                color: "var(--mt-accent)",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatarPreco(preco)}
            </span>
          </div>
        )}
      </div>

      {/* O bloco de fotos é o que cede espaço: `flex:1` deixa ele encolher
          quando o descritivo cresce, e é assim que a folha nunca vira duas. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "0.8%" }}>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            overflow: "hidden",
            background: "var(--mt-surface)",
          }}
        >
          {fotos[0] && (
            /* `<img>` cru: o `srcset` do next/image não serve à impressora.
               Mesma exceção que o bloco de impressão anterior já abria. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={fotos[0]}
              alt={`${veiculo.marca} ${modeloExibido}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>
        {miniaturas.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.8%" }}>
            {miniaturas.map((foto, i) => (
              <div
                key={foto}
                style={{
                  aspectRatio: "16 / 9",
                  position: "relative",
                  overflow: "hidden",
                  background: "var(--mt-surface)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={foto}
                  alt={`${veiculo.marca} ${modeloExibido} — foto ${i + 2}`}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 1fr",
          gap: "4cqw",
          paddingTop: "2.462cqw",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.231cqw" }}>
          <span style={TITULO_DE_BLOCO}>MATRIZ DE ESPECIFICAÇÕES</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: "3.077cqw",
              borderTop: "2px solid var(--mt-ink)",
            }}
          >
            {especificacoes.map(([rotulo, valor]) => (
              <div
                key={rotulo}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.308cqw",
                  padding: "0.769cqw 0",
                  borderBottom: "1px solid var(--mt-regua-fina)",
                }}
              >
                <span style={ROTULO}>{rotulo}</span>
                <span
                  style={{
                    ...VALOR,
                    fontVariantNumeric: /\d/.test(valor) ? "tabular-nums" : undefined,
                  }}
                >
                  {valor}
                </span>
              </div>
            ))}
          </div>
        </div>

        {descritivo && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.231cqw" }}>
            <span style={TITULO_DE_BLOCO}>O VEÍCULO EM QUATRO LINHAS</span>
            <p
              style={{
                margin: 0,
                fontSize: "1.692cqw",
                lineHeight: 1.55,
                color: "var(--mt-ink)",
                textWrap: "pretty",
              }}
            >
              {descritivo}
            </p>
          </div>
        )}
      </div>

      {/* A faixa afirma um fato sobre o carro; só sai quando o cadastro o
          sustenta. Carro sem cautelar 100% imprime a folha sem ela. */}
      {veiculo.cautelar_100 && (
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            marginTop: "1.846cqw",
            background: "var(--mt-ink)",
            color: "var(--mt-bg)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "1.538cqw 2.154cqw",
              background: "var(--mt-accent)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: "1.692cqw", fontWeight: 800, letterSpacing: ".14em", lineHeight: 1.1 }}>
              LAUDO CAUTELAR
              <br />
              100% APROVADO
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "0.462cqw",
              padding: "1.538cqw 2.462cqw",
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: "1.385cqw", fontWeight: 800, letterSpacing: ".16em", color: "#ffffff" }}>
              HISTÓRICO LIVRE DE SINISTRO E LEILÃO
            </span>
            <span
              style={{
                fontSize: "1.538cqw",
                lineHeight: 1.4,
                color: "var(--mt-neutral-300)",
                textWrap: "pretty",
              }}
            >
              Estrutura, chassi e histórico auditados por empresa credenciada junto ao Detran. O laudo
              completo fica disponível para consulta na loja.
            </span>
          </div>
        </div>
      )}

      <footer
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "3.692cqw",
          marginTop: "auto",
          paddingTop: "1.538cqw",
          borderTop: "2px solid var(--mt-ink)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.615cqw", minWidth: 0 }}>
          <span
            style={{
              fontSize: "1.538cqw",
              fontWeight: 800,
              letterSpacing: ".14em",
              textTransform: "uppercase",
            }}
          >
            {empresa.name} · Bacacheri
          </span>
          <span style={{ fontSize: "1.462cqw", lineHeight: 1.45, color: "var(--mt-neutral-700)" }}>
            {empresa.address} · CNPJ {empresa.cnpj}
            <br />
            {/* O número sai de `telefoneVisivel`, o mesmo que alimenta os links
                de WhatsApp: rótulo impresso e link clicado não podem divergir
                (trava em `tests/nap-unico.test.ts`). */}
            Telefone e WhatsApp {telefoneVisivel(empresa)} · {empresa.hours.replace(/\n/g, " · ")}
            <br />
            Valores sujeitos a alteração sem aviso prévio e à aprovação de crédito. Esta ficha não é
            proposta comercial.
          </span>
        </div>
        {qr && (
          <div style={{ display: "flex", alignItems: "center", gap: "1.538cqw", flexShrink: 0 }}>
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "0.308cqw",
                textAlign: "right",
              }}
            >
              <span
                style={{
                  fontSize: "1.308cqw",
                  fontWeight: 800,
                  letterSpacing: ".14em",
                  color: "var(--mt-accent)",
                }}
              >
                FICHA COMPLETA
              </span>
              <span style={{ fontSize: "1.385cqw", lineHeight: 1.35, color: "var(--mt-neutral-700)" }}>
                Todas as fotos, vídeo e
                <br />
                simulação de financiamento
              </span>
            </span>
            {/* O QR nasce do `pdpUrl` desta ficha, vetorial — ver `lib/qrDaFicha`. */}
            <svg
              viewBox={`0 0 ${qr.lado} ${qr.lado}`}
              style={{ width: "9.538cqw", height: "9.538cqw", display: "block", color: "var(--mt-ink)" }}
              shapeRendering="crispEdges"
              role="img"
              aria-label="Código QR com o endereço deste anúncio no site"
            >
              <path d={qr.d} fill="currentColor" />
            </svg>
          </div>
        )}
      </footer>
    </section>
  );
}

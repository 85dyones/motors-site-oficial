import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getVeiculoById } from "../../../../lib/supabase";
import { getCachedSettings } from "../../../../lib/settings";
import DEFAULT_COMPANY_SETTINGS from "../../../../lib/companySettings.json";
import { modeloEVersaoParaExibir } from "../../../../lib/estoqueTabela";
import { publicacaoDoVeiculo } from "../../../../lib/publicacaoDaFicha";
import {
  ALTURA_CARD,
  ID_DA_PREVIA,
  LARGURA_CARD,
  caminhoDaPreviaDaFicha,
  fotoDaPreviaDoVeiculo,
  fotoPodeVirarPrevia,
  periciaAprovadaNaPrevia,
  previaDaFotoDoVeiculo,
  versaoDaPreviaDaFicha,
  type RotuloDaPrevia,
} from "../../../../lib/compartilhamento";
import { APOIO, ACENTO, COBRE_DA_MARCA, PAPEL, TINTA, carregarArchivo, carregarLogo } from "../../recursos";

/**
 * A prévia da ficha no WhatsApp, montada: foto do carro à esquerda, a
 * identificação dele à direita, sobre a tinta do card gerado de `/og`. O que
 * entra e o que fica de fora (o preço) está explicado em `previaDaFicha`
 * (`lib/compartilhamento.ts`).
 *
 * Sai em JPEG, e não no PNG que o `ImageResponse` devolve: uma foto em PNG de
 * 1200×630 passa de 1 MB, e o servidor do WhatsApp Web/Desktop desiste de
 * `og:image` acima de ~300 KB (o achado de 23/09 em `/og/foto`).
 *
 * Mora em `/og/`, não em `/api/`: o `robots.ts` bloqueia `/api/` e o crawler
 * do Facebook, que monta a prévia do WhatsApp, obedece.
 */
export const runtime = "nodejs";

/** A foto ocupa 780 px: de uma capa 4:3, o recorte perde só as bordas. */
const LARGURA_DA_FOTO = 780;
const LARGURA_DO_TEXTO = LARGURA_CARD - LARGURA_DA_FOTO;

function cortar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
}

/** Corpo do modelo pelo comprimento: nome curto grande, nome longo cabe. */
function corpoDoModelo(modelo: string): number {
  if (modelo.length <= 12) return 64;
  if (modelo.length <= 20) return 52;
  return 42;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pedido = new URL(request.url);
  // Qualquer falha cai no card gerado: prévia genérica é melhor que nenhuma.
  const cardGerado = () => Response.redirect(new URL("/og", request.url), 302);

  if (!ID_DA_PREVIA.test(id)) return cardGerado();

  let veiculo: Awaited<ReturnType<typeof getVeiculoById>> = null;
  try {
    veiculo = await getVeiculoById(id);
  } catch {
    return cardGerado();
  }
  if (!veiculo) return cardGerado();

  // Carro arquivado (a ficha já o manda para o hub do modelo) não ganha peça.
  // O vendido na carência e o indisponível ganham, com o selo da ficha.
  let rotulo: RotuloDaPrevia = null;
  try {
    const publicacao = await publicacaoDoVeiculo(veiculo);
    if (publicacao.arquivar) return cardGerado();
    rotulo = publicacao.indisponivel ? publicacao.rotulo : null;
  } catch {
    return cardGerado();
  }

  // Só o endereço canônico, exato, é desenhado. `v` errada, parâmetro a mais
  // ou id escrito de outro jeito vão para ele: variar a URL não força outra
  // rasterização. O `Response.redirect` sai sem `Cache-Control`, então a borda
  // não guarda o redirecionamento.
  const canonico = caminhoDaPreviaDaFicha(String(veiculo.id), versaoDaPreviaDaFicha(veiculo, rotulo));
  if (`${pedido.pathname}${pedido.search}` !== canonico) {
    return Response.redirect(new URL(canonico, request.url), 302);
  }

  const foto = fotoDaPreviaDoVeiculo(veiculo);
  if (!fotoPodeVirarPrevia(foto)) return cardGerado();

  try {
    const resposta = await fetch(foto, { signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) throw new Error(`foto respondeu ${resposta.status}`);
    // O rasterizador não lê WebP: a capa vai em JPEG, já no tamanho da coluna.
    const fotoJpeg = await sharp(Buffer.from(await resposta.arrayBuffer()))
      .rotate()
      .resize(LARGURA_DA_FOTO, ALTURA_CARD, { fit: "cover", position: "centre" })
      .jpeg({ quality: 86 })
      .toBuffer();

    let empresa: { name?: string; logoUrl?: string } = DEFAULT_COMPANY_SETTINGS;
    try {
      const { companySettings } = await getCachedSettings();
      if (companySettings) empresa = companySettings;
    } catch {
      // Fallback local: a prévia não depende do banco de configurações.
    }
    const nomeDaLoja = empresa?.name?.trim() || "Motors Store";
    const [logo, fontes] = await Promise.all([carregarLogo(empresa?.logoUrl), carregarArchivo()]);

    const { modelo, versao: versaoExibida } = modeloEVersaoParaExibir(veiculo.modelo, veiculo.versao ?? "");
    const modeloNaTela = cortar(modelo, 34);
    const versaoNaTela = cortar(versaoExibida, 44);
    const km = Number(veiculo.quilometragem);
    const anoEKm = [
      String(veiculo.ano ?? "").trim(),
      // Espaço fixo: "km" não desce sozinho para a linha de baixo.
      Number.isFinite(km) && km > 0 ? `${km.toLocaleString("pt-BR")}\u00a0km` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    // Um selo só, no alto: o de venda vence o de perícia, como na ficha.
    const selo = rotulo ?? (periciaAprovadaNaPrevia(veiculo) ? "PERÍCIA APROVADA" : null);

    const png = new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundColor: TINTA,
            fontFamily: "Archivo",
          }}
        >
          <img
            src={`data:image/jpeg;base64,${fotoJpeg.toString("base64")}`}
            width={LARGURA_DA_FOTO}
            height={ALTURA_CARD}
            style={{ width: LARGURA_DA_FOTO, height: ALTURA_CARD, objectFit: "cover" }}
            alt=""
          />
          <div
            style={{
              width: LARGURA_DO_TEXTO,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "48px 44px",
            }}
          >
            <div style={{ display: "flex" }}>
              {logo ? (
                <img src={logo} height={52} style={{ height: 52, objectFit: "contain" }} alt="" />
              ) : (
                <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: PAPEL }}>{nomeDaLoja}</div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {selo ? (
                <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
                  <div style={{ display: "flex", width: 12, height: 12, backgroundColor: rotulo ? ACENTO : COBRE_DA_MARCA }} />
                  <div
                    style={{
                      display: "flex",
                      marginLeft: 12,
                      fontSize: 19,
                      fontWeight: 600,
                      letterSpacing: "0.16em",
                      color: PAPEL,
                    }}
                  >
                    {selo}
                  </div>
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  fontSize: 21,
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  color: COBRE_DA_MARCA,
                }}
              >
                {cortar(veiculo.marca, 24).toUpperCase()}
              </div>
              <div
                style={{
                  display: "flex",
                  marginTop: 8,
                  fontSize: corpoDoModelo(modeloNaTela),
                  fontWeight: 800,
                  lineHeight: 1.02,
                  letterSpacing: "-0.03em",
                  color: PAPEL,
                }}
              >
                {modeloNaTela}
              </div>
              {versaoNaTela ? (
                <div style={{ display: "flex", marginTop: 10, fontSize: 24, fontWeight: 600, lineHeight: 1.2, color: APOIO }}>
                  {versaoNaTela}
                </div>
              ) : null}
              {anoEKm ? (
                <div style={{ display: "flex", marginTop: 22, fontSize: 30, fontWeight: 800, color: PAPEL }}>{anoEKm}</div>
              ) : null}
            </div>

            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 48, height: 6, backgroundColor: ACENTO }} />
              <div
                style={{
                  display: "flex",
                  marginLeft: 18,
                  fontSize: 19,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  color: APOIO,
                }}
              >
                CURITIBA · PARANÁ
              </div>
            </div>
          </div>
        </div>
      ),
      { width: LARGURA_CARD, height: ALTURA_CARD, ...(fontes ? { fonts: fontes } : {}) },
    );

    const jpeg = await sharp(Buffer.from(await png.arrayBuffer()))
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    // A `v` muda quando o carro muda: a peça completa pode ficar na borda. A
    // que saiu sem a fonte ou sem o logo (falha passageira de rede) fica
    // cinco minutos, para a próxima tentativa sair inteira.
    const completa = fontes !== null && logo !== null;
    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": completa
          ? "public, max-age=604800, s-maxage=2592000, immutable"
          : "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    console.warn("[OG] a prévia da ficha não foi montada, vai a foto sozinha:", err);
    // A foto sozinha, como era antes de 30/09.
    return Response.redirect(new URL(previaDaFotoDoVeiculo(foto).url, request.url), 302);
  }
}

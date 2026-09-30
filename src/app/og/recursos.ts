import { readFile } from "fs/promises";
import path from "path";
import { imagemServivelComoPrevia } from "../../lib/compartilhamento";

/**
 * O que os cards gerados de `/og` compartilham: a paleta fixa, a fonte e o
 * logo. Sai de `route.tsx` desde 30/09, quando a prévia da ficha
 * (`/og/ficha/[id]`) passou a usar os mesmos três. Um arquivo de rota do Next
 * só pode exportar os handlers, por isso o módulo à parte.
 */

export const TINTA = "#201e1d";
export const ACENTO = "#ec3013";
export const PAPEL = "#f3f2f2";
/** O cinza de apoio sobre a tinta, o mesmo do rodapé do card. */
export const APOIO = "#a8a3a1";
/** O cobre do logo (`--mt-cobre-marca`), o ponto do selo de perícia. */
export const COBRE_DA_MARCA = "#b29172";

/**
 * Archivo, a mesma tipografia do site, para o card não sair em outra voz.
 *
 * `next/og` embute uma fonte de peso único: sem isto o `fontWeight: 800` do
 * título não tem efeito nenhum e o card sai numa regular fina, que é o oposto
 * do título apertado e pesado do design.
 *
 * Vai à rede uma vez por instância e guarda em memória. Falhou — rede fora,
 * Google bloqueado — o card sai na fonte padrão: mais fraco, mas correto.
 * Nunca deixa a geração morrer por causa de fonte.
 */
let cacheDeFontes: Array<{ name: string; data: ArrayBuffer; weight: 600 | 800 }> | null =
  null;

export async function carregarArchivo() {
  if (cacheDeFontes) return cacheDeFontes;

  try {
    const pesos: Array<600 | 800> = [600, 800];
    const carregadas = await Promise.all(
      pesos.map(async (weight) => {
        const css = await fetch(
          `https://fonts.googleapis.com/css2?family=Archivo:wght@${weight}`,
          // Sem User-Agent moderno o Google devolve TrueType em vez de WOFF2,
          // que é o único formato que o rasterizador lê.
          { headers: { "User-Agent": "Mozilla/4.0" } }
        ).then((r) => r.text());

        const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
        if (!url) throw new Error("URL da fonte não encontrada no CSS");

        const data = await fetch(url).then((r) => r.arrayBuffer());
        return { name: "Archivo", data, weight };
      })
    );

    cacheDeFontes = carregadas;
    return cacheDeFontes;
  } catch (err) {
    console.warn("[OG] Archivo indisponível, usando a fonte padrão:", err);
    return null;
  }
}

/**
 * O logo como data URI, ou `null` se não der para carregar.
 *
 * Nunca deixa a geração falhar: card sem logo ainda é um card legível com o
 * nome da loja: card nenhum é uma prévia sem imagem.
 */
export async function carregarLogo(logoUrl?: string): Promise<string | null> {
  // O logo do painel é convertido para WebP no upload, e satori não rasteriza
  // WebP. Quando for esse o caso caímos no PNG do repositório de propósito.
  if (logoUrl && imagemServivelComoPrevia(logoUrl)) {
    try {
      const resposta = await fetch(logoUrl);
      if (resposta.ok) {
        const tipo = resposta.headers.get("content-type") || "image/png";
        const bytes = Buffer.from(await resposta.arrayBuffer());
        return `data:${tipo};base64,${bytes.toString("base64")}`;
      }
    } catch {
      // Segue para o logo local.
    }
  }

  try {
    const arquivo = await readFile(path.join(process.cwd(), "public/logo.png"));
    return `data:image/png;base64,${arquivo.toString("base64")}`;
  } catch {
    return null;
  }
}

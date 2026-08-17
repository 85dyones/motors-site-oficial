import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUCKET_DO_DIARIO,
  LADO_MAXIMO,
  TAMANHO_MAXIMO_BYTES,
  caminhoDaFoto,
  validarFoto,
  urlDaFoto,
  ehCaminhoDoBucket,
} from "../src/lib/ciclo/foto";

/**
 * A foto da etiqueta — fase 2 da Garagem (manual v1.1 §5.7, Emenda 01).
 *
 * A foto é a PROVA do carimbo: é ela que separa "o cliente disse que fez" de
 * "a revisão virou procedência". Duas coisas não podem derivar:
 *
 *   1. O bucket é privado e o caminho começa pelo veículo — é o primeiro
 *      segmento que a RLS lê para decidir de quem é a pasta. Mudar o formato
 *      do caminho sem mudar a policy abre ou tranca todo mundo.
 *   2. O upload é DIRETO do navegador. Se um dia alguém roteá-lo pelo Next,
 *      a foto de celular passa do limite de corpo da Vercel e o erro aparece
 *      no pior momento — de pé, ao lado do carro, no 4G.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

const migracao = ler("supabase", "migrations", "20260815210000_storage_do_diario_de_bordo.sql");
const rotaFoto = ler("src", "app", "api", "ciclo", "foto", "route.ts");
const rotaRevisoes = ler("src", "app", "api", "garagem", "revisoes", "route.ts");
const componente = ler("src", "components", "garagem", "GaragemVeiculo.tsx");
const filaAdmin = ler("src", "components", "admin", "FilaDeVerificacao.tsx");

describe("o caminho do arquivo é a régua da RLS", () => {
  it("o primeiro segmento é sempre o veículo", () => {
    const vv = "11111111-2222-4333-8444-555555555555";
    const caminho = caminhoDaFoto(vv, "atual", "IMG_0421.HEIC");
    expect(caminho.startsWith(`${vv}/`)).toBe(true);
    expect((caminho.match(/\//g) ?? []).length).toBe(1);
  });

  it("a policy lê exatamente esse primeiro segmento, comparando TEXTO", () => {
    expect(migracao).toContain("(storage.foldername(name))[1] in (");
    expect(migracao).toContain("select vv.id::text");
    // Cast para uuid dentro da policy estouraria com pasta de nome estranho —
    // e erro em policy derruba a requisição inteira.
    expect(migracao).not.toMatch(/foldername\(name\)\)\[1\]::uuid/);
  });

  it("extensão estranha não vira caminho estranho", () => {
    const vv = "11111111-2222-4333-8444-555555555555";
    expect(caminhoDaFoto(vv, "atual", "foto.jp g/../../etc")).toMatch(/\.jpg$/);
    expect(caminhoDaFoto(vv, "atual", "semextensao")).toMatch(/\.[a-z0-9]+$/);
    expect(caminhoDaFoto(vv, "atual", "x.png")).toMatch(/\.png$/);
  });

  it("dois envios seguidos não colidem", () => {
    const vv = "11111111-2222-4333-8444-555555555555";
    expect(caminhoDaFoto(vv, "atual", "a.jpg")).not.toBe(caminhoDaFoto(vv, "atual", "a.jpg"));
  });
});

describe("o bucket é privado, e as policies dizem quem entra", () => {
  it("nasce privado e assim permanece mesmo se a migração rodar de novo", () => {
    expect(migracao).toContain("'diario-de-bordo', 'diario-de-bordo', false");
    expect(migracao).toContain("on conflict (id) do update");
    expect(migracao).toContain("set public             = false");
  });

  it("cliente escreve e lê a própria pasta; não apaga nada", () => {
    expect(migracao).toContain("create policy diario_cliente_envia");
    expect(migracao).toContain("create policy diario_cliente_le");
    // Prova enviada não se reescreve — mesma regra de `manutencoes`.
    expect(migracao).not.toContain("diario_cliente_apaga");
    expect(migracao).not.toContain("diario_cliente_atualiza");
  });

  it("a equipe lê tudo, porque é quem verifica", () => {
    expect(migracao).toContain("create policy diario_staff_le");
    expect(migracao).toContain("public.is_staff(auth.uid())");
  });

  it("a autoconferência prova os dois lados contra o banco real", () => {
    for (const cenario of [
      "o cliente não conseguiu enviar para a própria pasta",
      "cliente enviou foto para a pasta de outro cliente",
      "cliente enxergou foto de veículo alheio",
      "bucket não existe ou está público",
    ]) {
      expect(migracao, `cenário ausente: ${cenario}`).toContain(cenario);
    }
    // storage.objects recusa DELETE direto: a limpeza é por subtransação.
    expect(migracao).toContain("protect_delete");
    expect(migracao).toContain("ZZ999");
  });
});

describe("o envio", () => {
  it("vai direto do navegador para o Storage, sob a sessão do cliente", () => {
    expect(componente).toContain("createBrowserSupabaseClient");
    expect(componente).toContain(`.from(BUCKET_DO_DIARIO)`);
    expect(componente).toContain(".upload(");
    // O motivo, para quem for mexer: o limite de corpo da Vercel.
    expect(componente).toContain("4,5 MB");
  });

  it("a rota recebe CAMINHO, nunca URL de fora", () => {
    // Aceitar URL externa aqui deixaria o cliente apontar a prova para um
    // servidor que ele controla.
    expect(rotaRevisoes).toContain("ehCaminhoDoBucket");
    expect(rotaRevisoes).toContain("Envie a foto pelo próprio formulário");
    // E o caminho tem que ser da pasta do veículo daquele registro.
    expect(rotaRevisoes).toContain("Foto não confere com o veículo");
  });

  it("valida tamanho e tipo antes de tentar", () => {
    expect(validarFoto({ type: "application/pdf", size: 1000 })).not.toBeNull();
    expect(validarFoto({ type: "image/jpeg", size: TAMANHO_MAXIMO_BYTES + 1 })).not.toBeNull();
    expect(validarFoto({ type: "image/jpeg", size: 500_000 })).toBeNull();
    expect(validarFoto({ type: "image/heic", size: 500_000 })).toBeNull();
  });

  it("o limite do código não passa do limite do bucket", () => {
    const doBucket = Number(migracao.match(/(\d+),\s+--\s*15 MB/)?.[1] ?? 0);
    expect(doBucket).toBeGreaterThan(0);
    expect(TAMANHO_MAXIMO_BYTES).toBeLessThanOrEqual(doBucket);
  });

  it("a redução acontece antes do envio, e o EXIF é respeitado", () => {
    const foto = ler("src", "lib", "ciclo", "foto.ts");
    expect(foto).toContain('imageOrientation: "from-image"');
    expect(LADO_MAXIMO).toBeGreaterThanOrEqual(1200);
    // Falha do preparo devolve o original: foto grande que sobe é melhor que
    // foto perfeita que não existe.
    expect(foto).toContain("return arquivo;");
  });

  it("lançar sem foto continua possível — é a fila que resolve", () => {
    expect(rotaRevisoes).toContain("caminhoFoto || null");
    expect(componente).toContain("Dá para lançar sem a foto");
  });
});

describe("a leitura", () => {
  it("é por URL assinada e curta, com a sessão de quem pede", () => {
    expect(rotaFoto).toContain("createSignedUrl");
    expect(rotaFoto).toContain("300");
    expect(rotaFoto).not.toContain("createAdminSupabaseClient");
    expect(rotaFoto).toContain("no-store");
  });

  it("caminho malicioso não passa", () => {
    expect(rotaFoto).toContain('caminho.includes("..")');
    expect(rotaFoto).toContain('caminho.startsWith("/")');
  });

  it("sem direito é 404, não 403 — não conta a estranho que a foto existe", () => {
    expect(rotaFoto).toContain('status: 404');
    expect(rotaFoto).toContain("Foto não encontrada");
  });

  it("as duas origens da coluna convivem: URL externa e caminho do bucket", () => {
    expect(urlDaFoto("https://exemplo.invalido/e.jpg")).toBe("https://exemplo.invalido/e.jpg");
    expect(urlDaFoto("uuid/atual-1.jpg")).toBe("/api/ciclo/foto?caminho=uuid%2Fatual-1.jpg");
    expect(urlDaFoto(null)).toBeNull();
    expect(urlDaFoto("   ")).toBeNull();
    expect(ehCaminhoDoBucket("uuid/x.jpg")).toBe(true);
    expect(ehCaminhoDoBucket("http://x/y.jpg")).toBe(false);
  });

  it("a fila da loja abre a foto pelo mesmo caminho — senão o link quebra", () => {
    // Com o bucket privado, href direto para a coluna daria 400 do Storage.
    expect(filaAdmin).toContain("urlDaFoto(r.url_etiqueta_atual)");
    expect(filaAdmin).toContain("urlDaFoto(r.url_etiqueta_anterior)");
    expect(filaAdmin).not.toMatch(/href=\{r\.url_etiqueta/);
  });

  it("o cliente também vê a própria prova no diário", () => {
    expect(componente).toContain("urlDaFoto(m.url_etiqueta_atual)");
    expect(componente).toContain("ver a foto");
  });

  it("o bucket tem um nome só, e ele vem do módulo", () => {
    expect(BUCKET_DO_DIARIO).toBe("diario-de-bordo");
    expect(migracao).toContain("'diario-de-bordo'");
    expect(rotaFoto).toContain("BUCKET_DO_DIARIO");
    expect(componente).toContain("BUCKET_DO_DIARIO");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  anuncioNoXml,
  fotosDoAnuncio,
  type FotoDoFeed,
} from "../src/lib/feedRevendaMais";
import {
  MARGEM_FORA_DO_FEED_MS,
  ancoraDoFeed,
  diasForaDoFeed,
} from "../src/lib/estoqueTabela";
import { colunasDasFotos } from "../src/lib/fotosDoVeiculo";
import { bloqueiosDePublicacao, MINIMO_DE_FOTOS } from "../src/lib/coerenciaDoCadastro";

/**
 * ===========================================================================
 * O impasse da foto do carro do feed — e a saída por ato de gente
 * ===========================================================================
 *
 * Medido em produção em 2026-09-15, contra o feed real:
 *
 *   Nissan Versa 1.6 Advance CVT (8454320)  17 fotos no feed, `[""]` no banco
 *   Hyundai HB20 1.0 Sense       (8440742)  15 fotos no feed, `[""]` no banco
 *
 * Os dois entraram no RevendaMais ANTES de a loja subir as fotos. O sync os
 * inseriu sem foto nenhuma e nunca mais conseguiu completá-los: desde a
 * migração `20260830120000` a trava do banco é uma allowlist de seis colunas
 * (`preco`, `preco_original`, `preco_promocional`, `last_seen_at`, `portas`,
 * `opcionais`) e foto não está nela — a gravação do robô é descartada em
 * silêncio, de seis em seis horas. Do outro lado, `GaleriaDeFotos` recusava o
 * envio pelo painel por ser carro do feed.
 *
 * Com as duas portas fechadas, os carros ficaram abaixo do mínimo de fotos,
 * presos em `rascunho`, invisíveis no site por uma semana — e o painel ainda
 * mandava o operador esperar pelo feed.
 *
 * Estes testes cobram as duas metades da saída: ler o feed direito, e só
 * quando alguém pede.
 */

const RAIZ = join(__dirname, "..");

/**
 * O arquivo SEM os comentários.
 *
 * Estes arquivos explicam muito — e é o que se quer —, mas a prova de uma
 * trava tem de recair sobre o que roda. Medindo o texto inteiro, um comentário
 * que cita `last_seen_at` para dizer "não se toca nisto" reprovaria a trava que
 * ele documenta; pior, uma asserção positiva passaria por uma frase que
 * ninguém executa.
 */
function semComentarios(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const rota = semComentarios("src/app/api/estoque/[id]/fotos-do-feed/route.ts");
const modulo = semComentarios("src/lib/feedRevendaMais.ts");

/** Um `<AD>` no formato exato do RevendaMais — plano, sem quebra de linha. */
function anuncio(id: number, fotos: number, extras = ""): string {
  const imagens = Array.from(
    { length: fotos },
    (_, i) => `<IMAGE_URL>https://s3.carro57.com.br/FC/9037/${id}_${i}_O_a${i}.jpeg</IMAGE_URL>`,
  ).join("");
  const grandes = Array.from(
    { length: fotos },
    (_, i) =>
      `<IMAGE_URL_LARGE>https://s3.carro57.com.br/FC/9037/${id}_${i}_W_a${i}.jpeg</IMAGE_URL_LARGE>`,
  ).join("");
  return (
    `<AD><ID>${id}</ID><TITLE>carro ${id}</TITLE>${extras}` +
    `<IMAGES>${imagens}</IMAGES><IMAGES_LARGE>${grandes}</IMAGES_LARGE></AD>`
  );
}

const feed = (...ads: string[]) => `<?xml version="1.0" encoding="UTF-8"?><ADS>${ads.join("")}</ADS>`;

describe("achar o anúncio dentro do feed", () => {
  it("acha pelo id, e devolve null para quem não está lá", () => {
    const xml = feed(anuncio(8454320, 3), anuncio(8440742, 2));
    expect(anuncioNoXml(xml, 8454320)).toContain("<ID>8454320</ID>");
    expect(anuncioNoXml(xml, "8440742")).toContain("<ID>8440742</ID>");
    expect(anuncioNoXml(xml, 9999999)).toBeNull();
  });

  it("NÃO casa id por prefixo nem por sufixo", () => {
    // `845432` dentro de `8454320` traria a ficha do vizinho para dentro do
    // carro errado — e a galeria trocada é o tipo de defeito que ninguém liga
    // à importação de três minutos antes.
    const xml = feed(anuncio(8454320, 3));
    expect(anuncioNoXml(xml, 845432)).toBeNull();
    expect(anuncioNoXml(xml, 84543200)).toBeNull();
  });

  it("id que não é número não vira busca", () => {
    const xml = feed(anuncio(8454320, 1));
    for (const torto of ["", "  ", "8454320; drop", "../8454320", "abc"]) {
      expect(anuncioNoXml(xml, torto), torto).toBeNull();
    }
  });

  it("as fotos saem SÓ do bloco do próprio anúncio", () => {
    // O recorte por `<AD>` é o que impede isso. Uma expressão solta sobre o
    // documento inteiro devolveria as 3 + as 2 na ficha do primeiro carro.
    const xml = feed(anuncio(8454320, 3), anuncio(8440742, 2));
    expect(fotosDoAnuncio(anuncioNoXml(xml, 8454320)!)).toHaveLength(3);
    expect(fotosDoAnuncio(anuncioNoXml(xml, 8440742)!)).toHaveLength(2);
  });
});

describe("as fotos do anúncio, pareadas", () => {
  it("`_O_` vai para o zap e `_W_` para o web, na ordem do feed", () => {
    const fotos = fotosDoAnuncio(anuncioNoXml(feed(anuncio(8454320, 3)), 8454320)!);
    expect(fotos).toHaveLength(3);
    // O par de índice é o que faz "a primeira é a capa" valer nas duas colunas.
    fotos.forEach((f: FotoDoFeed, i: number) => {
      expect(f.zap).toContain(`_${i}_O_`);
      expect(f.web).toContain(`_${i}_W_`);
    });
  });

  it("anúncio sem foto devolve lista vazia, e não uma foto vazia", () => {
    // O defeito que criou os três rascunhos de setembro: o nó do n8n monta
    // `[carro.IMAGES?.IMAGE_URL || '']`, que vira `[""]` — uma string vazia
    // que parece uma foto. Aqui a ausência é ausência.
    const semFoto = `<AD><ID>8464513</ID><TITLE>toro</TITLE></AD>`;
    expect(fotosDoAnuncio(anuncioNoXml(feed(semFoto), 8464513)!)).toEqual([]);
  });

  it("tag vazia no meio da lista não vira foto", () => {
    const comBuraco =
      `<AD><ID>1</ID><IMAGES><IMAGE_URL>https://s3/a.jpg</IMAGE_URL>` +
      `<IMAGE_URL></IMAGE_URL><IMAGE_URL>https://s3/b.jpg</IMAGE_URL></IMAGES></AD>`;
    const fotos = fotosDoAnuncio(anuncioNoXml(feed(comBuraco), 1)!);
    expect(fotos).toHaveLength(2);
    expect(fotos.every((f) => f.zap && f.web)).toBe(true);
  });

  it("lista desemparelhada reaproveita a variante que existe", () => {
    // Meia resolução certa é melhor que buraco na galeria — e melhor que
    // `undefined` no `src`, que na ficha vira imagem quebrada.
    const torto =
      `<AD><ID>1</ID><IMAGES><IMAGE_URL>https://s3/a_O.jpg</IMAGE_URL>` +
      `<IMAGE_URL>https://s3/b_O.jpg</IMAGE_URL></IMAGES>` +
      `<IMAGES_LARGE><IMAGE_URL_LARGE>https://s3/a_W.jpg</IMAGE_URL_LARGE></IMAGES_LARGE></AD>`;
    const fotos = fotosDoAnuncio(anuncioNoXml(feed(torto), 1)!);
    expect(fotos).toHaveLength(2);
    expect(fotos[1]).toEqual({ zap: "https://s3/b_O.jpg", web: "https://s3/b_O.jpg" });
  });

  it("desescapa a URL — `&amp;` na query devolveria 404", () => {
    const comEntidade =
      `<AD><ID>1</ID><IMAGES>` +
      `<IMAGE_URL>https://s3/f.jpg?w=800&amp;h=600</IMAGE_URL></IMAGES></AD>`;
    const fotos = fotosDoAnuncio(anuncioNoXml(feed(comEntidade), 1)!);
    expect(fotos[0].zap).toBe("https://s3/f.jpg?w=800&h=600");
  });
});

describe("a costura: o que vem do feed destrava a publicação", () => {
  /* O teste-âncora desta entrega. Reproduz o Nissan Versa: a linha do banco
     com `[""]`, a galeria do feed com 17 fotos, e a régua de publicação antes
     e depois. Sem esta passagem, a entrega inteira é encanamento sem efeito. */
  const noBanco = { whatsapp_images: [""], origem: "sync" };

  it("a linha travada conta ZERO foto e está bloqueada", () => {
    const motivos = bloqueiosDePublicacao(noBanco);
    expect(motivos.some((m) => m.bloqueia)).toBe(true);
    // `[""]` não é uma foto: a mensagem tem de dizer 0, senão o operador
    // procura na tela a foto que o painel diz existir.
    expect(motivos[0].texto).toContain(`0 de ${MINIMO_DE_FOTOS}`);
  });

  it("depois da importação, o mesmo carro passa na régua", () => {
    const doFeed = fotosDoAnuncio(anuncioNoXml(feed(anuncio(8454320, 17)), 8454320)!);
    const colunas = colunasDasFotos(doFeed);

    expect(colunas.whatsapp_images).toHaveLength(17);
    expect(colunas.web_full_images).toHaveLength(17);
    // A capa é a primeira, e é o JPEG — o mesmo contrato da foto subida pelo
    // painel. Duas regras de capa fariam o `og:image` discordar do card.
    expect(colunas.url_imagem).toBe(doFeed[0].zap);

    const depois = bloqueiosDePublicacao({ ...noBanco, whatsapp_images: colunas.whatsapp_images });
    expect(depois.some((m) => m.bloqueia)).toBe(false);
  });
});

describe("a rota de importação — as travas escritas", () => {
  it("é POST e não aceita a lista pelo corpo", () => {
    expect(rota).toContain("export async function POST");
    // A rota vai à fonte. Aceitar URL do navegador abriria na galeria do carro
    // do feed a porta que `camposGravaveis` fecha para `origem = 'sync'`.
    expect(rota).not.toContain("await request.json()");
    expect(rota).toContain("buscarFotosNoFeed(id)");
  });

  it("exige sessão, equipe e a linha da A17 das fotos", () => {
    expect(rota).toContain("supabase.auth.getUser()");
    expect(rota).toContain("ehStaff(profile)");
    expect(rota).toContain("campoNegadoAoPerfil(perfisDe(profile), [...CAMPOS_DE_FOTO])");
  });

  it("lê a origem do BANCO e recusa o veículo do painel", () => {
    // Do banco, nunca do corpo: senão bastaria mandar `origem:"sync"` para a
    // rota ir procurar no RevendaMais um carro que nasceu aqui.
    expect(rota).toMatch(/\.select\("id, origem"\)/);
    expect(rota).toContain('linha.origem === "painel"');
  });

  it("grava por `aplicarNosVeiculos`, e não direto na tabela", () => {
    // É o que põe as três colunas no histórico do veículo com nome e hora —
    // importar foto é ato de gente e fica registrado como tal.
    expect(rota).toContain("aplicarNosVeiculos(");
    expect(rota).not.toMatch(/\.from\("estoque_motors"\)\s*\.update\(/);
  });

  it("NÃO toca em `last_seen_at`", () => {
    // O carimbo é a assinatura do robô, e é um dos dois sinais que a trava usa
    // para reconhecê-lo. Movê-lo aqui faria a importação se disfarçar de sync —
    // e a própria trava descartaria a gravação que esta rota existe para fazer.
    expect(rota).not.toContain("last_seen_at");
  });

  it("os três desfechos do feed têm mensagens diferentes", () => {
    // "saiu do RevendaMais" e "está lá sem foto" pedem ações opostas do
    // operador. Uma mensagem só mandaria metade deles esperar para sempre.
    expect(rota).toContain('achado.tipo === "fora-do-feed"');
    expect(rota).toContain('achado.tipo === "sem-fotos"');
    expect(modulo).toContain('tipo: "achou"');
  });

  it("o endereço do feed não vai para o bundle público", () => {
    // O hash na URL é a credencial do feed. Com `NEXT_PUBLIC_` ela iria para o
    // JavaScript que o site serve a qualquer visitante.
    expect(modulo).toContain("process.env.REVENDAMAIS_FEED_URL");
    expect(modulo).not.toContain("NEXT_PUBLIC_REVENDAMAIS");
    // E sem a variável a resposta NOMEIA o que falta, em vez de falhar calada.
    expect(modulo).toContain("REVENDAMAIS_FEED_URL não está configurada");
  });
});

describe("o aviso de fora do feed", () => {
  const HORA = 60 * 60 * 1000;
  const emT = (t: number) => new Date(t).toISOString();

  /* A âncora é o carimbo mais recente da TABELA, nunca o relógio de parede:
     se o n8n parar, o relógio acusaria o estoque inteiro de ter saído do feed,
     quando quem saiu do ar foi o robô. */
  it("a âncora é o carimbo mais recente, e ignora linha sem carimbo", () => {
    const agora = Date.now();
    expect(
      ancoraDoFeed([
        { last_seen_at: emT(agora - 50 * HORA) },
        { last_seen_at: emT(agora) },
        { last_seen_at: null },
        { last_seen_at: "não é data" },
      ]),
    ).toBe(new Date(emT(agora)).getTime());

    expect(ancoraDoFeed([])).toBeNull();
    expect(ancoraDoFeed([{ last_seen_at: null }])).toBeNull();
  });

  it("quem veio no ciclo mais recente não acusa nada", () => {
    const ancora = Date.now();
    expect(diasForaDoFeed({ last_seen_at: emT(ancora), origem: "sync" }, ancora)).toBeNull();
  });

  it("um ciclo perdido é rotina, não aviso", () => {
    // O cron roda de 6 em 6 h. Acusar no primeiro ciclo perdido transformaria
    // uma coleta que morreu no meio em dezenas de acusações falsas — que é o
    // defeito pelo qual `fora_do_feed` foi removido como estado em 30/08.
    const ancora = Date.now();
    for (const horas of [6, 12, 23]) {
      expect(
        diasForaDoFeed({ last_seen_at: emT(ancora - horas * HORA), origem: "sync" }, ancora),
        `${horas}h`,
      ).toBeNull();
    }
  });

  it("quatro ciclos seguidos sem aparecer viram aviso, em dias", () => {
    const ancora = Date.now();
    expect(MARGEM_FORA_DO_FEED_MS).toBe(24 * HORA);
    expect(
      diasForaDoFeed({ last_seen_at: emT(ancora - 24 * HORA), origem: "sync" }, ancora),
    ).toBe(1);
    // O fantasma mais velho medido em produção em 15/09: 16 dias publicado
    // no site depois de ter saído do RevendaMais.
    expect(
      diasForaDoFeed({ last_seen_at: emT(ancora - 16 * 24 * HORA), origem: "sync" }, ancora),
    ).toBe(16);
  });

  it("o veículo do painel nunca é cobrado de estar no feed", () => {
    // Ele nasce com `last_seen_at` nulo de propósito: nunca esteve em feed
    // nenhum. Acusá-lo mandaria o operador procurar um anúncio que não existe.
    const ancora = Date.now();
    expect(diasForaDoFeed({ last_seen_at: null, origem: "painel" }, ancora)).toBeNull();
    expect(
      diasForaDoFeed({ last_seen_at: emT(ancora - 30 * 24 * HORA), origem: "painel" }, ancora),
    ).toBeNull();
  });

  it("sem âncora, ninguém é acusado", () => {
    expect(diasForaDoFeed({ last_seen_at: emT(Date.now()), origem: "sync" }, null)).toBeNull();
  });

  it("sync parado não acusa o estoque inteiro", () => {
    // O caso que motivou medir contra a tabela: se o robô morrer hoje, daqui a
    // um mês todos os carros continuam à MESMA distância da âncora — zero.
    // Contra `Date.now()`, o estoque inteiro apareceria "fora do feed há 30
    // dias" e a loja arquivaria carros que tem no pátio.
    const paradoHaUmMes = Date.now() - 30 * 24 * HORA;
    const linhas = [
      { last_seen_at: emT(paradoHaUmMes), origem: "sync" },
      { last_seen_at: emT(paradoHaUmMes - HORA), origem: "sync" },
    ];
    const ancora = ancoraDoFeed(linhas);
    for (const l of linhas) expect(diasForaDoFeed(l, ancora)).toBeNull();
  });
});

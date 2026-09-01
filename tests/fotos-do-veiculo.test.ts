import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import GaleriaDeFotos from "../src/components/admin/GaleriaDeFotos";
import EditorDeVeiculo from "../src/components/admin/EditorDeVeiculo";
import {
  BUCKET_DE_FOTOS,
  EXTENSAO_DA_VARIANTE,
  MIMES_DO_BUCKET,
  PREFIXO_PUBLICO,
  TAMANHO_MAXIMO_BYTES,
  caminhoDaFoto,
  caminhoDaUrlPublica,
  colunasDasFotos,
  ehFotoPropria,
  fotosDoVeiculo,
  moverFoto,
  novoLote,
  validarFoto,
} from "../src/lib/fotosDoVeiculo";
import {
  CAMPOS_DE_FOTO,
  CAMPOS_NOSSOS,
  camposGravaveis,
  extrairCamposNossos,
} from "../src/lib/estoqueEscrita";
import { ACAO_DO_CAMPO_DE_VEICULO, campoNegadoAoPerfil, podeFazer } from "../src/lib/permissoes";
import {
  FOTOS_DA_FICHA_COMPLETA,
  MINIMO_DE_FOTOS,
  bloqueiosDePublicacao,
} from "../src/lib/coerenciaDoCadastro";
import { LADO_DA_VARIANTE, MIME_DA_VARIANTE } from "../src/lib/imageProcessor";

/**
 * Upload de fotos do veículo no /admin, servindo do storage próprio (F0-p).
 *
 * O que este arquivo trava — cada item é uma coisa que, se derivar, quebra em
 * produção sem erro visível:
 *
 *   1. **O caminho é `{estoque_id}/`.** A pasta é o veículo, como no diário.
 *      A migração fixou o desenho; código que mude o formato desalinha o
 *      arquivo do carro a que ele pertence.
 *   2. **O bucket é `veiculos`, público na LEITURA e fechado na escrita.**
 *      Fechar a leitura mataria o card do WhatsApp (URL assinada expira);
 *      abrir a escrita repetiria a AUDITORIA §3.4.
 *   3. **A escrita exige gate de papel.** As três colunas têm linha na matriz
 *      A17 — campo sem linha é negado, e o operador tomaria 403 sem explicação.
 *   4. **As URLs vão para as colunas que o site JÁ lê.** Coluna nova seria
 *      invisível para vitrine, feed e og:image.
 *   5. **A régua de publicação continua vindo de `MINIMO_DE_FOTOS`.** Número
 *      escrito à mão na tela faria o painel discordar do site sobre por que o
 *      carro sumiu.
 */

const raiz = join(__dirname, "..");
/**
 * Lê normalizando a quebra de linha.
 *
 * O repositório guarda LF e o checkout no Windows entrega CRLF: asserção que
 * ancora em `\n` passa numa máquina e falha na outra, sem nada a ver com o
 * código. Normalizar na leitura é o que torna estas travas portáteis.
 */
const ler = (...p: string[]) =>
  readFileSync(join(raiz, ...p), "utf-8").replace(/\r\n/g, "\n");

const migracao = ler("supabase", "migrations", "20260829180000_f0p_storage_das_fotos_do_veiculo.sql");
const galeria = ler("src", "components", "admin", "GaleriaDeFotos.tsx");
const editor = ler("src", "components", "admin", "EditorDeVeiculo.tsx");
const rotaEstoque = ler("src", "app", "api", "estoque", "[id]", "route.ts");
const card = ler("src", "components", "modernist", "primitivos.tsx");
const configNext = ler("next.config.ts");

/** Uma foto de teste, já no formato das colunas. */
const url = (n: number, variante: "web" | "zap") =>
  `https://zwbqmzgnagfeqinqkolp.supabase.co${PREFIXO_PUBLICO}8100652/lote${n}-${variante}.${EXTENSAO_DA_VARIANTE[variante]}`;

const foto = (n: number) => ({ zap: url(n, "zap"), web: url(n, "web") });

// ---------------------------------------------------------------------------

describe("o caminho é `{estoque_id}/` — a pasta é o veículo", () => {
  it("o primeiro segmento é o id do veículo, e só há um nível", () => {
    const caminho = caminhoDaFoto(8100652, "abc123-xy9z", "zap");
    expect(caminho.startsWith("8100652/")).toBe(true);
    expect((caminho.match(/\//g) ?? []).length).toBe(1);
  });

  it("a migração fixa esse mesmo desenho", () => {
    expect(migracao).toContain("`{estoque_id}/arquivo`");
    expect(migracao).toContain("a pasta\n--    é o veículo");
  });

  it("id que não é número não vira caminho — nem com `..` dentro", () => {
    // `estoque_motors.id` é integer (levantamento §2.1). Qualquer outra coisa
    // chegou pela URL e não é para virar pasta.
    for (const id of ["..", "../outro", "8100652/../9", "abc", ""]) {
      expect(() => caminhoDaFoto(id, "abc123", "zap"), id).toThrow();
    }
  });

  it("lote com barra ou ponto também é recusado", () => {
    expect(() => caminhoDaFoto(8100652, "a/b", "zap")).toThrow();
    expect(() => caminhoDaFoto(8100652, "..", "zap")).toThrow();
  });

  it("dois lotes seguidos não colidem", () => {
    expect(novoLote()).not.toBe(novoLote());
    expect(novoLote()).toMatch(/^[a-z0-9-]+$/);
  });

  it("as duas versões da MESMA foto compartilham o lote e só mudam o sufixo", () => {
    // É o que permite apagar o par sem adivinhar qual `web` é de qual `zap`.
    const lote = "abc123-xy9z";
    expect(caminhoDaFoto(8100652, lote, "web")).toBe("8100652/abc123-xy9z-web.webp");
    expect(caminhoDaFoto(8100652, lote, "zap")).toBe("8100652/abc123-xy9z-zap.jpg");
  });
});

describe("o bucket é `veiculos`: público na leitura, fechado na escrita", () => {
  it("o nome do bucket tem uma fonte só, e o código a usa", () => {
    expect(BUCKET_DE_FOTOS).toBe("veiculos");
    expect(migracao).toContain("'veiculos', 'veiculos', true");
    expect(galeria).toContain("BUCKET_DE_FOTOS");
    // Nunca o literal solto: é assim que um bucket vira dois por engano.
    expect(galeria).not.toMatch(/\.from\(\s*["'`]veiculos["'`]\s*\)/);
  });

  it("público é a LEITURA — o card do WhatsApp não assina URL", () => {
    expect(migracao).toContain("create policy veiculos_leitura_publica");
    expect(migracao).toContain("for select to anon, authenticated");
    // E a autoconferência da própria migração cobra isso do banco.
    expect(migracao).toContain("o card do WhatsApp não assina URL");
  });

  it("enviar, substituir e apagar exigem `is_staff`", () => {
    for (const policy of ["veiculos_staff_envia", "veiculos_staff_atualiza", "veiculos_staff_apaga"]) {
      expect(migracao, policy).toContain(`create policy ${policy}`);
    }
    // Três policies de escrita, três `is_staff` — nenhuma passa com `true`.
    const comStaff = migracao.match(/public\.is_staff\(auth\.uid\(\)\)/g) ?? [];
    expect(comStaff.length).toBeGreaterThanOrEqual(4);
    expect(migracao).toContain("policy(ies) de escrita alcançam anon");
  });

  it("o limite do código não passa do limite do bucket", () => {
    const doBucket = Number(migracao.match(/(\d+),\s+--\s*15 MB/)?.[1] ?? 0);
    expect(doBucket).toBeGreaterThan(0);
    expect(TAMANHO_MAXIMO_BYTES).toBeLessThanOrEqual(doBucket);
  });

  it("os mimes do código são os mimes do bucket", () => {
    for (const mime of MIMES_DO_BUCKET) {
      expect(migracao, mime).toContain(`'${mime}'`);
    }
    // E o que o tratamento produz está dentro da lista — senão o Storage
    // recusaria o arquivo depois de o operador esperar o upload inteiro.
    for (const variante of ["web", "zap"] as const) {
      expect(MIMES_DO_BUCKET as readonly string[]).toContain(MIME_DA_VARIANTE[variante]);
    }
  });
});

describe("o envio vai direto do navegador para o Storage", () => {
  it("usa a sessão do operador, e não a chave de serviço", () => {
    expect(galeria).toContain("createBrowserSupabaseClient");
    expect(galeria).toContain(".upload(");
    expect(galeria).not.toContain("createAdminSupabaseClient");
    expect(galeria).not.toContain("SERVICE_ROLE");
  });

  it("o motivo está escrito, para quem for mexer", () => {
    // Rotear pelo Next devolveria 413 na foto de câmera, e o erro apareceria
    // depois de minutos de upload.
    expect(galeria).toContain("4,5 MB");
  });

  it("o arquivo não passa por rota nenhuma — a rota grava só o vínculo", () => {
    // Contraprova: se alguém criar um `FormData` aqui, o arquivo voltou a
    // trafegar pela função serverless.
    expect(galeria).not.toContain("FormData");
    expect(galeria).toContain('method: "PATCH"');
    expect(galeria).toContain("/api/estoque/");
  });

  it("valida tamanho e tipo antes de tentar", () => {
    expect(validarFoto({ type: "application/pdf", size: 1000, name: "x.pdf" })).not.toBeNull();
    expect(validarFoto({ type: "image/jpeg", size: TAMANHO_MAXIMO_BYTES + 1, name: "g.jpg" })).not.toBeNull();
    expect(validarFoto({ type: "image/jpeg", size: 500_000, name: "ok.jpg" })).toBeNull();
    // HEIC de iPhone passa na entrada: o tratamento transcodifica antes de subir.
    expect(validarFoto({ type: "image/heic", size: 500_000, name: "IMG_1.HEIC" })).toBeNull();
  });
});

describe("o tratamento acontece aqui, não no Supabase", () => {
  it("não existe transformação de imagem do Storage no código", () => {
    // A transformação do Supabase cobra por "origin image"; o repositório já
    // tem `imageProcessor`. É a decisão escrita na própria migração.
    expect(galeria).not.toContain("/render/image/");
    expect(galeria).not.toMatch(/transform:\s*\{/);
    expect(migracao).toContain("cobra por \"origin image\"");
  });

  it("gera as duas versões que as colunas pedem, em formatos diferentes", () => {
    // JPEG para quem é lido por scraper de fora (og:image, feed dos portais);
    // WebP para quem é lido pelo navegador (card, hero, vitrine).
    expect(MIME_DA_VARIANTE.zap).toBe("image/jpeg");
    expect(MIME_DA_VARIANTE.web).toBe("image/webp");
    expect(EXTENSAO_DA_VARIANTE.zap).toBe("jpg");
    expect(EXTENSAO_DA_VARIANTE.web).toBe("webp");
    // A galeria (`zap`) é ampliada até a tela cheia; o card (`web`) não.
    expect(LADO_DA_VARIANTE.zap).toBeGreaterThan(LADO_DA_VARIANTE.web);
    expect(LADO_DA_VARIANTE.web).toBeGreaterThanOrEqual(1024);
  });

  it("o EXIF é respeitado — carro não entra deitado na vitrine", () => {
    const processador = ler("src", "lib", "imageProcessor.ts");
    expect(processador).toContain('imageOrientation: "from-image"');
    // E nunca amplia: foto menor que o alvo é recomprimida, não esticada.
    expect(processador).toContain("Math.min(1,");
  });
});

describe("as URLs vão para as colunas que o site JÁ lê", () => {
  it("são exatamente as três colunas do contrato de leitura", () => {
    expect([...CAMPOS_DE_FOTO]).toEqual(["whatsapp_images", "web_full_images", "url_imagem"]);
  });

  it("`colunasDasFotos` devolve as três, pareadas por índice", () => {
    const colunas = colunasDasFotos([foto(1), foto(2), foto(3)]);
    expect(colunas.whatsapp_images).toEqual([url(1, "zap"), url(2, "zap"), url(3, "zap")]);
    expect(colunas.web_full_images).toEqual([url(1, "web"), url(2, "web"), url(3, "web")]);
    // `url_imagem` é o degrau de queda do mapper quando os arrays estão vazios.
    expect(colunas.url_imagem).toBe(url(1, "zap"));
  });

  it("a capa é a PRIMEIRA das duas colunas ao mesmo tempo", () => {
    // O mapper usa `[0]`: o card lê `web_full_images[0]`, o og:image lê
    // `whatsapp_images[0]`. Se as listas se desalinhassem, as duas superfícies
    // mostrariam fotos diferentes do mesmo carro.
    const reordenadas = moverFoto([foto(1), foto(2), foto(3)], 2, 0);
    const colunas = colunasDasFotos(reordenadas);
    expect(colunas.whatsapp_images[0]).toBe(url(3, "zap"));
    expect(colunas.web_full_images[0]).toBe(url(3, "web"));
    expect(colunas.url_imagem).toBe(url(3, "zap"));
  });

  it("sem foto, as três colunas ficam vazias — e não com a capa velha", () => {
    const colunas = colunasDasFotos([]);
    expect(colunas.whatsapp_images).toEqual([]);
    expect(colunas.web_full_images).toEqual([]);
    expect(colunas.url_imagem).toBeNull();
  });

  it("nenhuma coluna nova foi inventada — o corpo do PATCH tem só as três", () => {
    // O contrato de leitura do site é `docs/levantamento-atual.md` §2.1.
    // Coluna nova aqui seria invisível para vitrine, feed XML e og:image, e o
    // `extrairCamposNossos` da rota a descartaria em silêncio.
    expect(Object.keys(colunasDasFotos([foto(1)])).sort()).toEqual(
      [...CAMPOS_DE_FOTO].sort(),
    );
    // E o que viaja no corpo é exatamente o retorno dessa função — nada
    // montado à mão ao lado dela.
    expect(galeria).toContain("const colunas = colunasDasFotos(novas)");
    expect(galeria).toContain("body: JSON.stringify(colunas)");
  });

  it("o pareamento aguenta as duas colunas com tamanhos diferentes", () => {
    // Acontece no feed: há linha com um array cheio e o outro vazio.
    const so_zap = fotosDoVeiculo(["a.jpg", "b.jpg"], []);
    expect(so_zap).toEqual([
      { zap: "a.jpg", web: "a.jpg" },
      { zap: "b.jpg", web: "b.jpg" },
    ]);
    const so_web = fotosDoVeiculo(null, ["c.jpg"]);
    expect(so_web).toEqual([{ zap: "c.jpg", web: "c.jpg" }]);
    // Lixo na coluna jsonb não vira foto fantasma.
    expect(fotosDoVeiculo([null, "", "d.jpg"], undefined)).toEqual([
      { zap: "d.jpg", web: "d.jpg" },
    ]);
    expect(fotosDoVeiculo("não é array", 42)).toEqual([]);
  });

  it("reordenar com índice fora da lista devolve a lista intacta", () => {
    const original = [foto(1), foto(2)];
    expect(moverFoto(original, 5, 0)).toEqual(original);
    expect(moverFoto(original, 0, -1)).toEqual(original);
    expect(moverFoto(original, 1, 1)).toEqual(original);
  });
});

describe("a escrita exige gate de papel", () => {
  it("as três colunas têm linha na matriz A17 — campo sem linha é negado", () => {
    const semLinha = CAMPOS_DE_FOTO.filter((c) => !ACAO_DO_CAMPO_DE_VEICULO[c]);
    expect(semLinha, "Coluna de foto sem linha na A17: " + semLinha.join(", ")).toEqual([]);
    for (const campo of CAMPOS_DE_FOTO) {
      expect(ACAO_DO_CAMPO_DE_VEICULO[campo], campo).toBe("Adicionar e reordenar fotos");
    }
  });

  it("Marketing é o dono natural; Gestor e Financeiro não mexem", () => {
    expect(podeFazer("marketing", "Adicionar e reordenar fotos")).toBe("faz");
    expect(podeFazer("comercial", "Adicionar e reordenar fotos")).toBe("faz");
    expect(podeFazer("admin", "Adicionar e reordenar fotos")).toBe("faz");
    for (const perfil of ["gestor", "financeiro"] as const) {
      expect(campoNegadoAoPerfil(perfil, ["whatsapp_images"])?.campo, perfil).toBe(
        "whatsapp_images",
      );
    }
  });

  it("a rota que grava confere staff, papel e origem — não só a sessão", () => {
    expect(rotaEstoque).toContain("ehStaff(profile)");
    expect(rotaEstoque).toContain("campoNegadoAoPerfil(perfil");
    expect(rotaEstoque).toContain("extrairCamposNossos(body, linha?.origem)");
    // A origem é lida do BANCO. Confiar no corpo deixaria qualquer um mandar
    // `origem:"painel"` e escrever foto num carro do feed.
    expect(rotaEstoque).toContain("Lido do BANCO, nunca do corpo");
  });

  it("a interface esconde o que o perfil não grava, em vez de desabilitar", () => {
    expect(editor).toContain('podeGravar("whatsapp_images")');
    expect(galeria).toContain("podeEditar");
  });
});

describe("foto só é gravável no veículo que o sync não toca", () => {
  it("`origem = painel` abre as três colunas", () => {
    const doPainel = camposGravaveis("painel");
    for (const campo of CAMPOS_DE_FOTO) {
      expect(doPainel, campo).toContain(campo);
    }
  });

  it("`origem = sync` (e ausente) mantém as três fora", () => {
    // O sincronizador reescreve essas colunas a cada 6 h. Deixar o painel
    // gravar nelas num carro do feed produziria o pior defeito possível: o
    // carro chega a 8 fotos, entra na vitrine, e no ciclo seguinte some — sem
    // erro em lugar nenhum.
    for (const origem of ["sync", null, undefined, "qualquer"]) {
      for (const campo of CAMPOS_DE_FOTO) {
        expect(camposGravaveis(origem), `${origem}/${campo}`).not.toContain(campo);
      }
    }
  });

  it("as colunas de foto NÃO entraram em CAMPOS_NOSSOS", () => {
    // `CAMPOS_NOSSOS` é a lista que o sincronizador não conhece, e é ela que a
    // rota de LOTE usa. Foto entrando ali abriria escrita em massa nas colunas
    // do feed, para veículo de qualquer origem.
    for (const campo of CAMPOS_DE_FOTO) {
      expect(CAMPOS_NOSSOS as readonly string[], campo).not.toContain(campo);
    }
  });

  it("a tela explica o motivo em vez de só desabilitar o botão", () => {
    expect(galeria).toContain("reescritas a cada sincronização");
    expect(galeria).toContain("Suba as fotos no RevendaMais");
  });
});

describe("a costura: o que a galeria manda é o que a rota grava", () => {
  /* O seam entre componente e rota é onde este tipo de entrega costuma morrer
     em silêncio — o corpo sai correto e `extrairCamposNossos` o descarta, sem
     erro, e a foto some sem ninguém saber por quê (foi assim que o override
     que só vivia no JSON deixou "vendido" sem efeito). Aqui o corpo REAL passa
     pelos dois filtros da rota. */
  const corpo = colunasDasFotos([foto(1), foto(2)]);

  it("no veículo do painel, as três colunas atravessam inteiras", () => {
    const passou = extrairCamposNossos(corpo, "painel");
    expect(Object.keys(passou).sort()).toEqual([...CAMPOS_DE_FOTO].sort());
    expect(passou.url_imagem).toBe(url(1, "zap"));
    expect(passou.whatsapp_images).toHaveLength(2);
  });

  it("no veículo do feed, nenhuma atravessa — e sem erro nenhum", () => {
    // Silêncio é o comportamento certo AQUI porque a tela nem oferece o botão;
    // o que não pode é a coluna passar e o sync desfazer depois.
    expect(extrairCamposNossos(corpo, "sync")).toEqual({});
    expect(extrairCamposNossos(corpo)).toEqual({});
  });

  it("Marketing atravessa o gate de papel com esse mesmo corpo", () => {
    expect(campoNegadoAoPerfil("marketing", Object.keys(corpo))).toBeNull();
    expect(campoNegadoAoPerfil("comercial", Object.keys(corpo))).toBeNull();
    expect(campoNegadoAoPerfil("financeiro", Object.keys(corpo))).not.toBeNull();
  });

  it("o botão Salvar do editor NÃO reenvia as fotos", () => {
    // A galeria grava sozinha. Se o corpo do Salvar levasse as colunas junto,
    // cada clique reescreveria a mesma lista e o histórico do veículo viraria
    // uma pilha de "12 fotos → 12 fotos".
    const corpoDoSalvar = editor.slice(
      editor.indexOf("const tudo: Record<string, unknown> = {"),
      editor.indexOf("const corpo = Object.fromEntries("),
    );
    expect(corpoDoSalvar.length).toBeGreaterThan(100);
    for (const campo of CAMPOS_DE_FOTO) {
      expect(corpoDoSalvar, `${campo} viajaria no Salvar`).not.toContain(`${campo}:`);
    }
  });
});

describe("remover apaga do storage E da coluna, nessa ordem", () => {
  it("a policy de delete existe", () => {
    expect(migracao).toContain("create policy veiculos_staff_apaga");
    expect(migracao).toContain("for delete to authenticated");
    // E, ao contrário do diário, aqui NÃO há `protect_delete`: foto de anúncio
    // é material de marketing, trocar a tremida é trabalho normal.
    expect(migracao).toContain("ao contrário do diário de bordo");
  });

  it("a coluna é gravada ANTES de o arquivo sair do bucket", () => {
    // Apagar primeiro deixaria a vitrine apontando para arquivo inexistente.
    const posGravou = galeria.indexOf("aoGravar(colunas)");
    const posRemoveu = galeria.indexOf(".remove(caminhos)");
    expect(posGravou).toBeGreaterThan(-1);
    expect(posRemoveu).toBeGreaterThan(posGravou);
    expect(galeria).toContain("arquivo órfão no bucket");
  });

  it("a URL que o SDK monta é a URL que sabemos desmontar", () => {
    /* O elo mais frágil da faxina: a coluna guarda URL, o Storage apaga por
       CAMINHO, e quem faz a volta é `PREFIXO_PUBLICO` — uma string escrita à
       mão contra um formato que o SDK decide. Se o Supabase mudar o endereço
       público, `caminhoDaUrlPublica` devolve `null` em silêncio, a faxina para
       de achar arquivo e o bucket enche de órfão sem nenhum erro. Aqui a volta
       é provada contra o SDK de verdade, não contra a suposição. */
    const cliente = createClient("https://zwbqmzgnagfeqinqkolp.supabase.co", "anon-de-teste");
    for (const caminho of ["8100652/abc-zap.jpg", "900000001/xyz-web.webp"]) {
      const publica = cliente.storage.from(BUCKET_DE_FOTOS).getPublicUrl(caminho).data.publicUrl;
      expect(caminhoDaUrlPublica(publica), publica).toBe(caminho);
      expect(ehFotoPropria(publica)).toBe(true);
    }
  });

  it("só apaga o que é nosso — URL do carro57 não vira caminho", () => {
    expect(caminhoDaUrlPublica(url(1, "zap"))).toBe("8100652/lote1-zap.jpg");
    expect(caminhoDaUrlPublica("https://s3.carro57.com.br/mt/1/foto.jpg")).toBeNull();
    expect(caminhoDaUrlPublica(null)).toBeNull();
    expect(caminhoDaUrlPublica("")).toBeNull();
    // Querystring e escape não confundem o caminho de volta.
    expect(caminhoDaUrlPublica(url(1, "web") + "?t=2")).toBe("8100652/lote1-web.webp");
  });
});

describe("a régua de publicação continua vindo de `MINIMO_DE_FOTOS`", () => {
  it("a tela não escreve o número à mão", () => {
    expect(galeria).toContain("MINIMO_DE_FOTOS");
    expect(editor).toContain("MINIMO_DE_FOTOS");
    // O `8` literal saiu do checklist e da régua de status do editor.
    expect(editor).not.toContain("fotos.length >= 8");
    expect(editor).not.toContain("8 fotos — bloqueia");
    expect(editor).not.toContain('"mínimo de 8"');
  });

  it("o checklist tem os DOIS degraus de foto, cada um na sua constante", () => {
    // Um degrau só esconderia metade da régua: ou o operador não saberia que o
    // carro JÁ pode ir ao ar, ou não saberia que ainda deve fotos.
    const publica = "l: `${MINIMO_DE_FOTOS} fotos — libera a publicação`";
    const completa = "l: `${FOTOS_DA_FICHA_COMPLETA} fotos — ficha completa`";
    expect(editor).toContain(publica);
    expect(editor).toContain(completa);
    // E cada rótulo tem de estar no MESMO item que a sua condição: rótulo de um
    // degrau com o `ok` do outro passaria despercebido, e a tela acusaria a
    // faixa errada sem nunca quebrar.
    const itemDe = (rotulo: string) =>
      editor.slice(editor.indexOf(rotulo), editor.indexOf(rotulo) + 250);
    expect(itemDe(publica)).toContain("ok: fotos.length >= MINIMO_DE_FOTOS");
    expect(itemDe(completa)).toContain("ok: fotos.length >= FOTOS_DA_FICHA_COMPLETA");
    // O segundo diz, na própria linha, que não tira o carro do ar — sem isso
    // ele é lido como bloqueio e o operador segura a publicação por engano.
    expect(editor).toContain("Não segura o carro fora do ar.");
  });

  it("quantas faltam sai da mesma função que filtra a vitrine", () => {
    // Uma foto a menos que a régua — o motivo tem de dizer exatamente isso.
    const abaixoDaPorta = Array.from({ length: MINIMO_DE_FOTOS - 1 }, (_, i) => url(i, "zap"));
    const motivos = bloqueiosDePublicacao({
      whatsapp_images: abaixoDaPorta,
      origem: "painel",
    });
    const poucas = motivos.find((m) => m.id === "poucas-fotos");
    expect(poucas?.bloqueia).toBe(true);
    expect(poucas?.texto).toContain(`${MINIMO_DE_FOTOS - 1} de ${MINIMO_DE_FOTOS}`);
    // No veículo nativo o texto manda subir pelo painel — não esperar o feed.
    expect(poucas?.texto).toContain("suba as fotos pelo painel");
  });

  it("cumprida a porta, o bloqueio some — e vira pendência até a ficha", () => {
    const noMinimo = Array.from({ length: MINIMO_DE_FOTOS }, (_, i) => url(i, "zap"));
    const motivos = bloqueiosDePublicacao({ whatsapp_images: noMinimo });
    expect(motivos.some((m) => m.id === "poucas-fotos")).toBe(false);
    // Some o bloqueio, NÃO a cobrança: é o degrau que a decisão de 01/09 criou.
    expect(motivos.find((m) => m.id === "fotos-incompletas")?.bloqueia).toBe(false);

    const completa = Array.from({ length: FOTOS_DA_FICHA_COMPLETA }, (_, i) => url(i, "zap"));
    expect(bloqueiosDePublicacao({ whatsapp_images: completa })).toEqual([]);
  });

  it("o editor passa a origem para o bloqueio — senão o texto mente", () => {
    // A origem escolhe entre "suba as fotos pelo painel" e "as fotos vêm do
    // RevendaMais". Sem ela a tela manda o operador esperar um feed que nunca
    // vai trazer foto do carro que ele mesmo cadastrou.
    const i = editor.indexOf("bloqueiosDePublicacao({");
    expect(i).toBeGreaterThan(-1);
    expect(editor.slice(i, i + 600)).toContain("origem: v.origem");
  });

  it("a nota do contador distingue os TRÊS estados", () => {
    // Duas frases para três situações fariam o carro de cinco fotos ler
    // "mínimo para publicar" — dizendo que está fora do ar quem já está dentro.
    // A do meio é a que a decisão de 01/09 criou.
    expect(editor).toContain('? "ficha completa"');
    expect(editor).toContain("no ar — faltam ${FOTOS_DA_FICHA_COMPLETA - fotos.length} para a ficha");
    expect(editor).toContain("mínimo de ${MINIMO_DE_FOTOS} para publicar");
  });
});

describe("o checklist do editor — medido no DOM, não no código-fonte", () => {
  /* Mesmo recurso da aba de fotos acima: `renderToStaticMarkup` executa hooks e
     JSX de verdade, sem jsdom. Aqui isso importa mais do que lá — os dois
     degraus de foto são a mudança de 01/09, e é exatamente na tela que eles
     podem discordar do site sobre o carro estar no ar. */
  const editorDe = (fotos: number) =>
    renderToStaticMarkup(
      createElement(EditorDeVeiculo as never, {
        inicial: {
          id: 8429524,
          marca: "volkswagen",
          modelo: "spacefox",
          versao: "1.6 8v trend totalflex 4p",
          ano_fabricacao: 2012,
          ano_modelo: 2013,
          preco: 39900,
          estado_cadastro: "publicado",
          origem: "revendamais",
          whatsapp_images: Array.from({ length: fotos }, (_, i) => url(i, "zap")),
        } as never,
        visitas30Dias: null,
        perfil: ["admin"] as never,
      }),
    );

  const semTag = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  /** O selo do item — o primeiro que aparece DEPOIS do rótulo, que é a ordem
   *  em que a linha é desenhada. Ler o item inteiro em vez do documento é o
   *  que impede o selo de um degrau de responder pelo outro. */
  const seloDe = (html: string, rotulo: string) => {
    const texto = semTag(html);
    const i = texto.indexOf(rotulo);
    if (i < 0) return `<AUSENTE: ${rotulo}>`;
    return texto.slice(i).match(/OK|PENDENTE|FALTAM \d+/)?.[0] ?? "<SEM SELO>";
  };

  const LIBERA = "fotos — libera a publicação";
  const COMPLETA = "fotos — ficha completa";

  it("cinco fotos: no ar E devendo — um OK e uma pendência", () => {
    // O caso real que abriu a mudança: o SpaceFox 8429524 tem cinco.
    const html = editorDe(5);
    expect(seloDe(html, LIBERA)).toBe("OK");
    expect(seloDe(html, COMPLETA)).toBe(`FALTAM ${FOTOS_DA_FICHA_COMPLETA - 5}`);
    // E a faixa NÃO acusa bloqueio: dizer "fora da vitrine" sobre um carro que
    // o cliente está vendo é o erro que esta régua de dois degraus pode causar.
    expect(semTag(html)).not.toContain("Fora da vitrine");
  });

  it("abaixo da porta: o primeiro degrau cobra, e a faixa avisa", () => {
    const html = editorDe(MINIMO_DE_FOTOS - 1);
    expect(seloDe(html, LIBERA)).toBe("FALTAM 1");
    expect(seloDe(html, COMPLETA)).toBe(`FALTAM ${FOTOS_DA_FICHA_COMPLETA - MINIMO_DE_FOTOS + 1}`);
    expect(semTag(html)).toContain("Fora da vitrine");
  });

  it("ficha completa: os dois degraus cumpridos, nada pendente de foto", () => {
    const html = editorDe(FOTOS_DA_FICHA_COMPLETA);
    expect(seloDe(html, LIBERA)).toBe("OK");
    expect(seloDe(html, COMPLETA)).toBe("OK");
    expect(semTag(html)).not.toContain("Fora da vitrine");
  });
});

describe("a aba desenhada — medida no DOM, não no código-fonte", () => {
  /* Ler o `.tsx` como texto prova que a linha existe; não prova que ela
     aparece. Aqui a aba é renderizada de verdade e as asserções olham a saída
     — que é o que o operador vê. Sem jsdom no projeto: `renderToStaticMarkup`
     executa o componente, os hooks de estado e o JSX inteiro. */
  const desenhar = (props: Partial<Parameters<typeof GaleriaDeFotos>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(GaleriaDeFotos, {
        estoqueId: 900000001,
        fotos: [],
        origem: "painel",
        podeEditar: true,
        aoGravar: () => {},
        ...props,
      }),
    );

  // Os dois fixtures deixaram de ser um só em 2026-09-01. Enquanto publicar e
  // "ficha completa" eram o mesmo noMinimo, um array bastava — e ele se chamava
  // `noMinimo`, nome que passou a mentir quando a porta virou quatro.
  const noMinimo = Array.from({ length: MINIMO_DE_FOTOS }, (_, i) => foto(i));
  const fichaCompleta = Array.from({ length: FOTOS_DA_FICHA_COMPLETA }, (_, i) => foto(i));

  it("veículo nativo e vazio: diz quantas faltam e oferece o envio", () => {
    const html = desenhar();
    expect(html).toContain(`Faltam ${MINIMO_DE_FOTOS} de ${MINIMO_DE_FOTOS}`);
    expect(html).toContain("Enviar fotos");
    expect(html).toContain('type="file"');
    expect(html).toContain("Nenhuma foto neste veículo");
    // Números em tabular-nums — a régua da casa para dígito em coluna.
    expect(html).toMatch(/tabular-nums[^>]*>Faltam/);
  });

  it("uma a menos que a régua: a conta bate com a função", () => {
    const html = desenhar({ fotos: noMinimo.slice(0, MINIMO_DE_FOTOS - 1) });
    expect(html).toContain(`Faltam 1 de ${MINIMO_DE_FOTOS}`);
  });

  it("no mínimo exato: já está no ar, e a barra diz isso", () => {
    // A borda que a decisão de 01/09 criou. O aviso não pode mais dizer só
    // "cumprido": o carro está publicado E ainda deve fotos, e é a primeira
    // frase que precisa contar a boa notícia.
    const html = desenhar({ fotos: noMinimo });
    // `Faltam N de M` é o formato da porta fechada: some assim que ela
    // abre. Anular pelo número seria frágil — em quatro e oito, os dois
    // avisos começariam com o mesmo `Faltam 4`.
    expect(html).not.toMatch(/Faltam d+ de /);
    expect(html).toContain("No ar com");
    expect(html).toContain(`Faltam ${FOTOS_DA_FICHA_COMPLETA - MINIMO_DE_FOTOS} para a ficha`);
  });

  it("ficha completa: o aviso vira confirmação, sem número à mão", () => {
    const html = desenhar({ fotos: fichaCompleta });
    expect(html).not.toContain("Faltam");
    expect(html).toContain("ficha completa");
  });

  it("a capa é marcada, e só a primeira", () => {
    const html = desenhar({ fotos: [foto(1), foto(2), foto(3)] });
    expect((html.match(/>CAPA</g) ?? []).length).toBe(1);
    // A miniatura mostra a versão `web`; a `zap` é do site, não do painel.
    expect(html).toContain(url(1, "web"));
    expect(html).not.toContain(url(1, "zap"));
  });

  it("reordenar e remover aparecem por foto — e a primeira não volta", () => {
    const html = desenhar({ fotos: [foto(1), foto(2)] });
    expect(html).toContain("Mover a foto 1 para frente");
    expect(html).toContain("Mover a foto 2 para trás");
    expect(html).toContain("Remover a foto 1");
    // "Usar como capa" só na que ainda não é capa.
    expect(html).toContain("Usar a foto 2 como capa");
    expect(html).not.toContain("Usar a foto 1 como capa");
    // O primeiro item não oferece "para trás" ativo, nem o último "para frente".
    expect(html).toMatch(/disabled=""[^>]*aria-label="Mover a foto 1 para trás"/);
  });

  it("veículo do feed: sem envio, e com o motivo escrito", () => {
    const html = desenhar({ origem: "sync", fotos: [foto(1)] });
    expect(html).not.toContain("Enviar fotos");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Remover a foto 1");
    expect(html).toContain("reescritas a cada sincronização");
    expect(html).toContain("Suba as fotos no RevendaMais");
    // A contagem e a régua continuam visíveis: a aba informa mesmo sem editar.
    expect(html).toContain(`Faltam ${MINIMO_DE_FOTOS - 1} de ${MINIMO_DE_FOTOS}`);
  });

  it("perfil sem a linha da A17: vê as fotos, não os controles", () => {
    const html = desenhar({ podeEditar: false, fotos: [foto(1)] });
    expect(html).not.toContain("Enviar fotos");
    expect(html).not.toContain("Remover a foto 1");
    // O negado SOME e é explicado — não fica cinza (regra do doc A17).
    expect(html).toContain("Seu perfil vê as fotos e não as altera");
    expect(html).toContain(url(1, "web"));
  });
});

describe("o site continua servindo as fotos", () => {
  it("`next.config.ts` autoriza o host do Supabase", () => {
    expect(configNext).toContain('hostname: "*.supabase.co"');
    // E o carro57 continua lá — esta entrega ADICIONA uma origem.
    expect(configNext).toContain('hostname: "s3.carro57.com.br"');
  });

  it("o card pula o otimizador SÓ na foto nossa", () => {
    expect(card).toContain("unoptimized={ehFotoPropria(foto)}");
    // O `next/image` e o `sizes` continuam — é o que faz a foto do carro57
    // valer a pena otimizar (`tests/rodape-e-imagens.test.ts` também cobra).
    expect(card).toMatch(/import Image from "next\/image"/);
    expect(card).toMatch(/sizes="\(max-width: 640px\) 100vw/);
    // O motivo escrito: a cota da Vercel já respondeu 402 em produção.
    expect(card).toContain("402");
  });

  it("`ehFotoPropria` é falso para tudo que não é do bucket `veiculos`", () => {
    expect(ehFotoPropria(url(1, "web"))).toBe(true);
    expect(ehFotoPropria("https://s3.carro57.com.br/mt/1/foto.jpg")).toBe(false);
    expect(ehFotoPropria("https://images.unsplash.com/photo-1.jpg")).toBe(false);
    expect(ehFotoPropria("/logo.png")).toBe(false);
    expect(ehFotoPropria(null)).toBe(false);
    // Outro bucket do mesmo projeto também é `false`: o diário nunca aparece
    // em vitrine, e casar só pelo host o incluiria.
    expect(
      ehFotoPropria("https://zwbqmzgnagfeqinqkolp.supabase.co/storage/v1/object/public/diario-de-bordo/x.jpg"),
    ).toBe(false);
  });
});

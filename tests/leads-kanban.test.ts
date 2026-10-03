import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ETAPAS_PADRAO, ehTipoDeDesfecho, type EtapaDoFunil } from "../src/lib/funil";
import {
  SEM_DONO,
  criarMover,
  filtrarPorResponsavel,
  iniciais,
  opcoesDeResponsavel,
  opcaoSemResponsavel,
  opcoesDoCard,
} from "../src/lib/leadsKanban";
import { lerCodigo } from "./fonte";

describe("opções de responsável no card (23/09)", () => {
  // A lista que a rota devolve já é só o Comercial ativo (`atendentesDoFluxo`).
  const comercial = ["Dyones Oliveira", "Rodrigo Naumowicz"];

  it("oferece só o comercial", () => {
    expect(opcoesDoCard(comercial, "Rodrigo Naumowicz")).toEqual([
      { nome: "Dyones Oliveira", fora: false },
      { nome: "Rodrigo Naumowicz", fora: false },
    ]);
  });

  it("o dono atual de fora aparece marcado, para não sumir da tela", () => {
    expect(opcoesDoCard(comercial, "Igor Alves")).toEqual([
      { nome: "Dyones Oliveira", fora: false },
      { nome: "Igor Alves", fora: true },
      { nome: "Rodrigo Naumowicz", fora: false },
    ]);
  });

  it("dono antigo de OUTRO card não entra neste — era o 'Dyo Paulino' em todo lead", () => {
    expect(opcoesDoCard(comercial, null).map((o) => o.nome)).toEqual(comercial);
  });
});

/**
 * Kanban de leads — responsável, anotações e arrastar (pacote 1 da tela A8).
 *
 * A tela roda atrás de login, então nada aqui é verificável no navegador sem
 * credencial. O que dá para segurar é o que quebra em silêncio: um lead que
 * some do filtro porque o consultor saiu da empresa, e o arrastar que só
 * "não acontece" quando o link do telefone rouba o gesto.
 */

// ⚠️ Normaliza CRLF na leitura. O repo guarda LF, mas o checkout com
// `core.autocrlf=true` (Windows) materializa `\r\n` — e o removedor de
// comentários logo abaixo casa linha a linha com `/^\s*\/\/.*$/`, onde `.` não
// come `\r` e `$` só fecha depois dele. O `//` não é removido.
//
// Medido neste arquivo em 2026-08-31: **32 comentários sobrevivem** ao strip
// sob CRLF, contra zero sob LF. Como as asserções abaixo medem distância entre
// dois trechos, comentário sobrevivente as envenena das duas formas — a
// positiva falha por estourar a janela, e a NEGATIVA passa com mais folga,
// que é o jeito silencioso de um teste deixar de proteger.
const kanban = readFileSync(
  join(__dirname, "..", "src", "components", "admin", "LeadsKanban.tsx"),
  "utf-8",
).replace(/\r\n/g, "\n");

/**
 * O mesmo arquivo sem comentários.
 *
 * Necessário porque os comentários deste componente citam o próprio código
 * que eles explicam. Uma asserção contra o texto cru passava mesmo com o
 * atributo apagado do JSX — casava com o comentário. Teste que não pode
 * falhar não é teste.
 */
const codigo = kanban
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");
const rota = readFileSync(
  join(__dirname, "..", "src", "app", "api", "leads", "gerenciar", "route.ts"),
  "utf-8"
);

// Desde 03/10/2026 (gestão do lead) a tela é o quadro MAIS as peças que
// saíram dele: o card enxuto, a linha de controles, a lista de fechados e os
// blocos do detalhe. Cada regra abaixo é lida no arquivo em que foi morar.
const card = lerCodigo("src/components/admin/CardDoLead.tsx");
const controles = lerCodigo("src/components/admin/ControlesDoFunil.tsx");
const listaDeFechados = lerCodigo("src/components/admin/FechadosDoFunil.tsx");
const detalhe = lerCodigo("src/components/admin/DetalheDoLead.tsx");
const cabecalhoDoLead = lerCodigo("src/components/admin/lead/CabecalhoDoLead.tsx");
const dadosDoNegocio = lerCodigo("src/components/admin/lead/DadosDoNegocio.tsx");
const rotaDoDetalhe = lerCodigo("src/app/api/leads/[id]/route.ts");

describe("iniciais", () => {
  it("usa primeira e última palavra", () => {
    // "JP", não "JS": é o que distingue dois consultores de mesmo primeiro
    // nome, que é o caso que importa numa equipe pequena.
    expect(iniciais("João Silva Pereira")).toBe("JP");
  });

  it("aguenta nome de uma palavra só", () => {
    expect(iniciais("Ana")).toBe("A");
  });

  it("não quebra com espaço sobrando nem string vazia", () => {
    expect(iniciais("  Maria   Souza  ")).toBe("MS");
    expect(iniciais("")).toBe("");
    expect(iniciais("   ")).toBe("");
  });
});

describe("filtrarPorResponsavel", () => {
  const leads = [
    { responsavel: "Ana" },
    { responsavel: null },
    { responsavel: "Bruno" },
    { responsavel: null },
  ];

  it("filtro vazio devolve tudo", () => {
    expect(filtrarPorResponsavel(leads, "")).toHaveLength(4);
  });

  it("filtra por nome", () => {
    expect(filtrarPorResponsavel(leads, "Ana")).toEqual([{ responsavel: "Ana" }]);
  });

  it("acha os que ninguém pegou", () => {
    expect(filtrarPorResponsavel(leads, SEM_DONO)).toHaveLength(2);
  });

  it("o sentinela não colide com nome de gente", () => {
    // Começa com espaço de propósito. Se alguém trocar por "sem-dono", um
    // consultor cadastrado com esse nome sequestraria o filtro.
    expect(SEM_DONO.startsWith(" ")).toBe(true);
    expect(filtrarPorResponsavel([{ responsavel: "sem-dono" }], SEM_DONO)).toEqual([]);
  });
});

describe("opcoesDeResponsavel", () => {
  it("junta cadastrados com quem já está gravado nos leads", () => {
    // `responsavel` é texto, não FK: quem sai da empresa some do cadastro mas
    // continua nos leads antigos. Sem a união, esses leads sumiriam do filtro
    // sem explicação nenhuma na tela.
    const opcoes = opcoesDeResponsavel(["Ana", "Bruno"], [{ responsavel: "Carla (ex)" }]);
    expect(opcoes).toEqual(["Ana", "Bruno", "Carla (ex)"]);
  });

  it("não repete nem lista vazio", () => {
    expect(opcoesDeResponsavel(["Ana", ""], [{ responsavel: "Ana" }, { responsavel: null }])).toEqual(["Ana"]);
  });

  it("ordena em português", () => {
    expect(opcoesDeResponsavel(["Ávila", "Bruno", "Ana"], [])).toEqual(["Ana", "Ávila", "Bruno"]);
  });
});

describe("a tela", () => {
  it("mantém as setas ao lado do arrastar", () => {
    // Arrastar nativo não funciona no toque nem no teclado, e esta tela roda
    // no tablet de balcão. Se as setas saírem, o tablet perde a única forma
    // de mover lead — e não dá erro, some a capacidade.
    expect(card).toContain("Avançar ${l.nome} uma etapa");
    expect(card).toContain("Voltar ${l.nome} uma etapa");
    expect(card).toMatch(/<div\s+draggable\s/);
    expect(codigo).toContain("onDrop");
    // As setas do card chamam o mesmo `mover` do arrasto.
    expect(codigo).toContain("aoVoltar={() => mover(l.id, colunasVisiveis[i - 1].chave)}");
    expect(codigo).toContain("aoAvancar={() => mover(l.id, colunasVisiveis[i + 1].chave)}");
  });

  it("a barra de slide ENTRA sem tirar as outras duas formas de navegar", () => {
    // 2026-08-28, pedido do dono: *"uma barra de slide seria ideal além das
    // setas"*. "Além", não "no lugar de" — e é fácil um refactor futuro achar
    // que a barra tornou as setas redundantes. São gestos diferentes: a barra
    // move a VISTA, as setas movem o LEAD.
    expect(codigo).toMatch(/type="range"/);
    expect(codigo).toContain("Percorrer o funil");
    // O trilho de etapas clicável saiu no desenho de 23/09 (tela em 03/10): a
    // linha de controles ficou com a busca, o escopo, a vista e os filtros. A
    // barra e as setas ficam.
    expect(codigo).not.toContain("irParaEtapa");
    expect(codigo).toContain("aoAvancar=");
  });

  it("a barra some quando o quadro cabe na tela", () => {
    // Controle que não controla nada é ruído — e ruído numa tela de balcão
    // ensina a ignorar o resto dela.
    expect(codigo).toMatch(/\{rolavel && \(/);
  });

  it("impede o link do telefone de roubar o arrasto", () => {
    // Sem `draggable={false}` no <a>, o navegador arrasta o link em vez do
    // card e o drop nunca dispara. Falha muda: o card só não se move.
    //
    // Desde 2026-08-28 o link sai de `linkDeConversa()` (lib/funil.ts) em vez
    // de ser montado aqui, mas a armadilha é a mesma: é uma âncora dentro de
    // um elemento arrastável.
    //
    // A asserção já foi `href={conversa}[\s\S]{0,400}draggable={false}`.
    //
    // Ela falhava no Windows, e a primeira leitura disto — de que a janela de
    // 400 tinha ficado apertada — estava ERRADA: foi medida no arquivo cru, e
    // não no `codigo` sem comentários, que é contra o que a asserção roda. Com
    // LF a distância real é 201, folgada. Quem a levava a 439 era o CRLF
    // quebrando o removedor de comentários — conserto na leitura, lá em cima.
    //
    // A asserção mudou mesmo assim, e não por causa daquele engano: medir
    // proximidade em caracteres não afirma o que interessa. Mutação provou que
    // a janela de 400 aceitaria `draggable={false}` colocado DEPOIS do `>`,
    // fora da tag, onde não faz efeito nenhum. O que importa é os dois estarem
    // na MESMA tag de abertura, e é isso que se afirma agora.
    // Desde 03/10 a âncora mora em `CardDoLead`.
    expect(card.indexOf("href={conversa}")).toBeGreaterThan(-1);
    const daAncora = card.slice(card.indexOf("href={conversa}"));
    // O `>` que fecha a tag é o que abre uma linha. Não dá para usar `[^>]*`
    // nem parar no primeiro `>`: `onClick={() => ...}` tem um dentro.
    const atributos = daAncora.slice(0, daAncora.search(/\n\s*>/));
    expect(atributos).toContain("draggable={false}");
  });

  it("o botão de WhatsApp registra o contato, não só abre a conversa", () => {
    // É a parte invisível do atalho e a razão de ele existir: sem registrar,
    // o vendedor que acabou de falar com o cliente recebe, uma hora depois,
    // um alerta cobrando que fale com o cliente. Dois desses e ninguém lê
    // mais alerta nenhum.
    expect(codigo).toContain("falarNoWhatsApp");
    expect(codigo).toMatch(/contato: "whatsapp"/);
    // E a mensagem já vai escrita — o pedido era um atalho para FALAR.
    expect(card).toContain("mensagemParaCliente");
    // O link do card chama o registro, e não só abre a conversa.
    expect(codigo).toContain("aoConversar={falarNoWhatsApp}");
    expect(card).toContain("aoConversar(l);");
    // No detalhe, o mesmo: abrir a conversa registra o contato.
    expect(detalhe).toMatch(/aoConversar=\{\(\) => \{\s*void gravar\(\{ contato: "whatsapp" \}\);/);
  });

  it("mover pede motivo em TODA etapa terminal, e grava direto nas abertas", () => {
    // Executado, não lido.
    //
    // A versão anterior deste teste cobrava a GRAFIA da guarda,
    //   `tipo === "ganho" || etapa.tipo === "perdido"`,
    // e congelou aqui a lista de dois desfechos do dia em que foi escrita. Em
    // 2026-08-28 entrou o terceiro — `descartado` —, os botões de descarte
    // passaram reto para `salvar`, a caixa nunca abriu e todo descarte chegou
    // ao banco sem motivo. O teste não só parou de proteger: passou a EXIGIR o
    // defeito, e a correção o deixava vermelho.
    //
    // Toda asserção sobre o TEXTO de um `if` prova aquele `if` e mais nada.
    // Agora o gesto mora em `criarMover` e o teste o CHAMA com uma etapa de
    // cada tipo: degrau novo em qualquer lugar da função roda aqui.
    const lead = { id: "lead-1" };

    for (const destino of ETAPAS_PADRAO) {
      const pediram: EtapaDoFunil[] = [];
      const gravaram: Record<string, unknown>[] = [];
      const mover = criarMover({
        etapas: ETAPAS_PADRAO,
        leads: [lead],
        pedirMotivo: (_l, etapa) => pediram.push(etapa),
        gravar: (_id, campos) => gravaram.push(campos),
      });

      mover(lead.id, destino.chave);

      if (ehTipoDeDesfecho(destino.tipo)) {
        expect(pediram.map((e) => e.chave), `${destino.chave} não pediu motivo`).toEqual([
          destino.chave,
        ]);
        expect(gravaram, `${destino.chave} gravou sem motivo`).toEqual([]);
      } else {
        expect(pediram, `${destino.chave} abriu a caixa à toa`).toEqual([]);
        expect(gravaram).toEqual([{ situacao: destino.chave }]);
      }
    }

    // O descarte é o caso que a lista de dois esquecia. Ele está na semente
    // (`ETAPAS_PADRAO`); se sair de lá, o laço acima deixa de prová-lo calado.
    expect(ETAPAS_PADRAO.map((e) => e.tipo)).toContain("descartado");
  });

  it("mover não faz nada quando o lead ou a etapa não existem", () => {
    const pediram: unknown[] = [];
    const gravaram: unknown[] = [];
    const mover = criarMover({
      etapas: ETAPAS_PADRAO,
      leads: [{ id: "lead-1" }],
      pedirMotivo: (...a) => pediram.push(a),
      gravar: (...a) => gravaram.push(a),
    });

    mover("lead-1", "etapa_que_nao_existe");
    mover("lead-fantasma", "novo");

    expect(pediram).toEqual([]);
    expect(gravaram).toEqual([]);
  });

  it("a tela monta o gesto em vez de reimplementá-lo", () => {
    // O que sobrou de asserção de fonte. Ela não prova a REGRA — isso é o
    // teste acima. Ela impede o único movimento que devolveria a regra ao
    // componente, onde ela volta a ser testável só por leitura: se `mover`
    // gravasse direto, o card chegaria em "Perdido" sem motivo e o relatório
    // nasceria vazio, que é o destino de todo campo opcional de CRM.
    const bloco = codigo.slice(
      codigo.indexOf("const mover"),
      codigo.indexOf("const confirmarDesfecho"),
    );
    expect(bloco).toContain("criarMover({");
    expect(bloco).toContain("pedirMotivo:");
    expect(bloco).toContain("setFechando");
    expect(
      bloco,
      "a decisão voltou para dentro do componente",
    ).not.toMatch(/ehTipoDeDesfecho|[!=]==\s*"(aberta|ganho|perdido|descartado)"/);
  });

  it("as colunas vêm do banco, com o funil fixo só como rede de segurança", () => {
    // O `const ETAPAS` que morava aqui era metade da razão de o funil não ser
    // editável. Se ele voltar, a tela para de refletir o que o dono configurou
    // e ninguém percebe — as colunas continuam aparecendo, só que erradas.
    expect(codigo).not.toMatch(/const ETAPAS(_|:| =)/);
    expect(codigo).toContain("setEtapas(d.etapas?.length ? ordenarEtapas(d.etapas) : ETAPAS_PADRAO)");
  });

  it("coluna arquivada com lead dentro continua na tela", () => {
    // Desativar uma etapa que ainda guarda cards os faria sumir sem erro
    // nenhum. `etapasDoQuadro` (que chama `etapasVisiveis` por dentro) é quem
    // garante isso, e a tela precisa usá-la em vez de filtrar por `ativa` na
    // mão.
    expect(codigo).toContain("etapasDoQuadro(etapas, emAberto)");
    expect(codigo).not.toMatch(/etapas\.filter\(\(e\) => e\.ativa\)/);
  });

  it("os desfechos são BOTÃO, não coluna", () => {
    // 2026-08-28, segunda rodada: *"não precisa de uma aba de ganho ou
    // perdido, só um botão para destinar"*. O quadro desenha `colunasVisiveis`
    // (só etapas abertas) e os botões vêm de `destinos` — se alguém religar as
    // colunas terminais, o quadro volta a ter colunas que só crescem.
    // Desde 03/10 os botões moram no cabeçalho do detalhe.
    expect(cabecalhoDoLead).toContain("const destinos = destinosDoNegocio(etapas);");
    // E os botões não podem voltar a sair das colunas do quadro.
    expect(codigo).not.toMatch(/colunasVisiveis[\s\S]{0,80}tipo === "ganho"/);
    expect(codigo).toContain("const colunasVisiveis = useMemo(() => etapasDoQuadro(etapas, emAberto)");
  });

  it("descartar não fica na mesma fileira de fechar o negócio", () => {
    // Terceira rodada, no mesmo dia: *"precisamos ter a opção de encerrar como
    // 'não é uma oportunidade de negócio'"*. Se ele virar mais um botão ao
    // lado de Perdido, o erro fácil é marcar spam como perda — que é o erro
    // que o terceiro tipo existe para evitar, porque perda derruba a taxa de
    // conversão da loja.
    expect(cabecalhoDoLead).toContain("const fecham = destinos.filter((e) => !ehDescarte(e.tipo));");
    expect(cabecalhoDoLead).toContain("const descartam = destinos.filter((e) => ehDescarte(e.tipo));");
    expect(cabecalhoDoLead).toContain("{fecham.map((e) => (");
    expect(cabecalhoDoLead).toContain("{descartam.map((e) => (");
    // E os dois passam pelo gesto que pede o motivo.
    expect(detalhe).toContain("pedirMotivo: (_lead, etapa) => setFechando(etapa),");
  });

  it("o lead fechado sai do quadro e ganha endereço", () => {
    // "Sem coluna" não pode virar "o card sumiu": é a falha muda que este
    // projeto persegue. O quadro filtra por `emAberto`, e a lista de fechados
    // mostra motivo, observação e o caminho de volta.
    expect(codigo).toContain("noEscopo.filter((l) => !l.desfecho)");
    expect(controles).toContain("Fechados ({fechados})");
    expect(codigo).toContain("fechados={fechados.length}");
    expect(codigo).toContain("const reabrir = useCallback");
    expect(codigo).toContain("aoReabrir={reabrir}");
    // A observação que o dono pediu aparece na lista, não só no formulário.
    expect(listaDeFechados).toContain("l.desfecho_nota");
  });

  it("autoriza o drop com preventDefault no dragOver", () => {
    // Sem isto o navegador recusa o drop, silenciosamente.
    expect(codigo).toMatch(/onDragOver[\s\S]{0,200}preventDefault/);
  });

  it("os dados de texto do negócio gravam ao sair do campo, não a cada tecla", () => {
    // A anotação única do card deu lugar ao registro de interação (03/10). O
    // que continua gravando sozinho são os dados do negócio, e pela mesma
    // razão de sempre: salvar a cada tecla seria uma requisição por letra.
    expect(dadosDoNegocio).toContain('onBlur={aoSair("email", lead.email)}');
    expect(dadosDoNegocio).toContain('onBlur={aoSair("carro_na_troca", lead.carro_na_troca)}');
    expect(dadosDoNegocio).not.toMatch(/onChange=\{[^}]*(email|carro_na_troca)/);
    // E a anotação solta não voltou para o quadro.
    expect(kanban).not.toMatch(/onChange=\{[^}]*observacoes/);
  });

  it("recarrega do servidor quando a gravação falha", () => {
    // Restaurar um retrato local desfaria o trabalho de outro consultor que
    // mexeu na fila no meio do caminho.
    //
    // Desde 25/09 a releitura passa por `falhou`, que relê ANTES de mostrar o
    // erro — na ordem inversa, `carregar` apagava a mensagem. O efeito na tela
    // está em `etiquetas-do-lead-fiacao.test.ts` ("gravação recusada").
    const bloco = codigo.slice(codigo.indexOf("const salvar"), codigo.indexOf("const mover"));
    const recuperacao = codigo.slice(codigo.indexOf("const falhou"), codigo.indexOf("const salvar"));
    expect(bloco).toContain("falhou(");
    expect(recuperacao).toMatch(/carregar\(\)\.finally\(\(\) => setErro\(mensagem\)\)/);
    expect(bloco).not.toContain("setLeads(anterior)");
    // O detalhe segue o mesmo padrão: relê o lead e só depois mostra o erro.
    expect(detalhe).toMatch(/recarregar\(\)\.finally\(\(\) => setErro\(mensagem\)\)/);
  });

  it("reler a fila não desmonta a tela: só a primeira leitura troca tudo por 'Carregando'", () => {
    // Com a busca ao digitar e a gaveta aberta, trocar a tela inteira por um
    // aviso apagaria o campo de busca e o que estava sendo escrito no detalhe.
    expect(codigo).toContain("if (primeiraCarga) {");
    expect(codigo).not.toMatch(/if \(carregando\) \{?\s*return/);
  });
});

describe("a rota", () => {
  it("devolve os atendentes junto com os leads", () => {
    // `/api/users` exige Admin, e quem atende lead é Comercial — sem isto o
    // seletor de responsável ficaria vazio justamente para quem o usa.
    expect(rota).toContain("atendentes");
    // Desde 2026-09-23 a lista é a régua `recebeLead` (comercial em qualquer
    // posição de `papeis`, conta ativa) — o comportamento é executado em
    // `tests/responsavel-do-lead.test.ts`. O filtro antigo olhava só o papel
    // principal e punha admin sem comercial na lista.
    expect(rota).toContain("atendentesDoFluxo(");
    expect(rota).not.toContain('.in("role", ["admin", "comercial"])');
  });

  it("só devolve atendentes depois da checagem de permissão", () => {
    const posPermissao = rota.indexOf("Ver e mover leads no kanban");
    const posAtendentes = rota.indexOf("let atendentes");
    expect(posPermissao).toBeGreaterThan(-1);
    expect(posAtendentes).toBeGreaterThan(posPermissao);
  });

  it("mantém Marketing no agregado, sem nome de pessoa", () => {
    // O bloco do agregado sai ANTES da leitura da fila (a que traz pessoas).
    const inicio = rota.indexOf("if (!podeVer) {");
    const fim = rota.indexOf("// `created_at`, não `criado_em`");
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    const agregado = rota.slice(inicio, fim);
    expect(agregado).toContain("somenteAgregado");
    expect(agregado).not.toContain("nome");
    // A contagem é da loja: chave de serviço, só a coluna da etapa.
    expect(agregado).toContain('lerLeadsDaLoja<{ situacao: string }>(passe, ["situacao"]');
    expect(agregado).not.toContain("supabase.from(");
  });
});

/**
 * Só o Administrador deixa um lead sem responsável (decisão do dono,
 * 03/10/2026). O select do card não oferece a opção vazia a mais ninguém.
 */
describe("a opção 'Sem responsável' do select do card (03/10)", () => {
  it("o Admin a escolhe, com ou sem dono no lead", () => {
    expect(opcaoSemResponsavel(true, "Ana")).toBe("oferece");
    expect(opcaoSemResponsavel(true, null)).toBe("oferece");
  });

  it("para quem não é Admin, o lead com dono não tem a opção", () => {
    expect(opcaoSemResponsavel(false, "Ana")).toBe("nao");
  });

  it("lead sem dono à vista de quem não é Admin: a opção só mostra o valor", () => {
    // Não deveria acontecer (o servidor não entrega esse lead), mas sem a
    // opção o select exibiria o primeiro nome da lista como se fosse o dono.
    expect(opcaoSemResponsavel(false, null)).toBe("so-mostra");
    expect(opcaoSemResponsavel(false, "")).toBe("so-mostra");
    expect(opcaoSemResponsavel(false, "   ")).toBe("so-mostra");
  });

  it("o card pergunta à régua do escopo e só pinta a opção quando ela deixa", () => {
    // Desde 03/10 o select mora no cabeçalho do detalhe, e quem diz se a
    // pessoa pode tirar o dono é a rota do detalhe, pela mesma régua.
    expect(rotaDoDetalhe).toContain("podeRemoverResponsavel");
    expect(detalhe).toContain("podeTirarDono={dados.podeRemoverResponsavel}");
    const opcao = cabecalhoDoLead.indexOf('{opcaoSemResponsavel(podeTirarDono, lead.responsavel) !== "nao" && (');
    expect(opcao).toBeGreaterThan(-1);
    const trecho = cabecalhoDoLead.slice(opcao, opcao + 260);
    expect(trecho).toContain('<option value="" disabled={!podeTirarDono}>');
    expect(trecho).toContain("Sem responsável");
    // A opção vazia do select de responsável não existe fora desse guarda,
    // e o quadro não tem mais select de responsável nenhum.
    expect(cabecalhoDoLead.match(/<option value=""[^>]*>\s*Sem responsável/g)).toHaveLength(1);
    expect(codigo).not.toContain("<select");
    expect(card).not.toContain("<select");
  });

  it("a recusa da rota aparece na tela pelo caminho de sempre", () => {
    expect(codigo).toContain('throw new Error(d.error || "Falha ao salvar");');
    expect(codigo).toContain("falhou(e.message);");
    // A troca de responsável sai do detalhe, pelo mesmo caminho.
    expect(detalhe).toContain('if (!res.ok) throw new Error(d.error || "Falha ao salvar");');
    expect(detalhe).toContain('falhou(e instanceof Error ? e.message : "Falha ao salvar");');
    expect(rota).toContain("return NextResponse.json({ error: AVISO_DE_RESPONSAVEL_OBRIGATORIO }, { status: 403 });");
  });
});

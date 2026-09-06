import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ETAPAS_PADRAO,
  ehTipoDeDesfecho,
  type EtapaDoFunil,
} from "../src/lib/funil";
import { criarMover } from "../src/lib/leadsKanban";
import {
  SEM_DONO,
  filtrarPorResponsavel,
  iniciais,
  opcoesDeResponsavel,
} from "../src/lib/leadsKanban";

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
    expect(kanban).toContain("Avançar ${l.nome} uma etapa");
    expect(kanban).toContain("Voltar ${l.nome} uma etapa");
    expect(codigo).toContain("draggable");
    expect(codigo).toContain("onDrop");
  });

  it("a barra de slide ENTRA sem tirar as outras duas formas de navegar", () => {
    // 2026-08-28, pedido do dono: *"uma barra de slide seria ideal além das
    // setas"*. "Além", não "no lugar de" — e é fácil um refactor futuro achar
    // que a barra tornou as setas redundantes. São gestos diferentes: a barra
    // move a VISTA, as setas movem o LEAD.
    expect(codigo).toMatch(/type="range"/);
    expect(codigo).toContain("Percorrer o funil");
    // O trilho de etapas: clicar num nome leva a coluna para a vista.
    expect(codigo).toContain("irParaEtapa");
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
    const daAncora = codigo.slice(codigo.indexOf("href={conversa}"));
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
    expect(codigo).toContain("mensagemParaCliente");
  });

  it("mover pede motivo em TODA etapa terminal, e grava direto nas abertas", () => {
    // Executado, não lido — e é a terceira versão deste teste.
    //
    // A primeira cobrava a GRAFIA da guarda e, quando `descartado` entrou em
    // 2026-08-28, passou a EXIGIR o defeito: a correção a deixava vermelha.
    // A segunda cobrava a condição inteira do `if`, e a revisão de 06/09 a
    // furou de três jeitos que não tocam naquela linha — um `if` a mais
    // antes da guarda, uma exceção depois dela, e a cadeia `else if`.
    //
    // Toda asserção sobre o TEXTO de um `if` prova aquele `if` e mais nada.
    // Agora o gesto mora em `criarMover` e o teste o CHAMA: degrau novo em
    // qualquer lugar da função roda aqui.
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
    // Se `mover` gravasse direto, o card chegaria em "Perdido" sem motivo e o
    // relatório nasceria vazio — que é o destino de todo campo opcional de
    // CRM. A caixa é o que torna o motivo obrigatório na prática.
    //
    // A asserção mudou em 2026-09-05, e a versão anterior é a história desta
    // linha: ela cobrava a GRAFIA da guarda,
    //   `tipo === "ganho" || etapa.tipo === "perdido"`,
    // e com isso congelou aqui a lista de dois desfechos do dia em que foi
    // escrita. Em 2026-08-28 entrou o terceiro — `descartado` —, a lista
    // deixou de conhecer o destino que os botões de descarte usam, e o card
    // passava reto para `salvar`: a caixa nunca abria e os seis motivos de
    // descarte chegavam ao banco como nulo. O teste não só parou de proteger;
    // ele passou a EXIGIR o defeito, e a correção o deixava vermelho.
    //
    // O que se afirma agora é a condição INTEIRA, e a versão do meio-dia
    // também não bastava: ela proibia a grafia velha e exigia o predicado
    // presente, e a revisão furou as duas com
    //   `ehTipoDeDesfecho(etapa.tipo) && !ehDescarte(etapa.tipo)`
    // — que restaura o defeito palavra por palavra e satisfaz as duas. Toda
    // proibição de grafia é uma lista do que já se viu. A igualdade fecha, e
    // de quebra a falha mostra no que a guarda se transformou.
    // O que sobrou de asserção de fonte. Ela não prova mais a REGRA — isso é
    // o teste acima. Ela impede o único movimento que devolveria a regra ao
    // componente, onde ela volta a ser inauditável.
    const bloco = codigo.slice(
      codigo.indexOf("const mover"),
      codigo.indexOf("const confirmarDesfecho"),
    );
    expect(bloco).toContain("criarMover({");
    expect(bloco).toContain("pedirMotivo:");
    expect(
      bloco,
      "a decisão voltou para dentro do componente",
    ).not.toMatch(/ehTipoDeDesfecho|===\s*"(aberta|ganho|perdido|descartado)"/);
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
    expect(codigo).toContain("const destinos = useMemo(() => destinosDoNegocio(etapas)");
    // E os botões não podem voltar a sair das colunas do quadro.
    expect(codigo).not.toMatch(/colunasVisiveis[\s\S]{0,80}tipo === "ganho"/);
  });

  it("descartar não fica na mesma fileira de fechar o negócio", () => {
    // Terceira rodada, no mesmo dia: *"precisamos ter a opção de encerrar como
    // 'não é uma oportunidade de negócio'"*. Se ele virar mais um botão ao
    // lado de Perdido, o erro fácil é marcar spam como perda — que é o erro
    // que o terceiro tipo existe para evitar, porque perda derruba a taxa de
    // conversão da loja.
    expect(codigo).toContain("const fecham = useMemo");
    expect(codigo).toContain("const descartam = useMemo");
    expect(codigo).toContain("{fecham.map((e) => (");
    expect(codigo).toContain("{descartam.map((e) => (");
  });

  it("o lead fechado sai do quadro e ganha endereço", () => {
    // "Sem coluna" não pode virar "o card sumiu": é a falha muda que este
    // projeto persegue. O quadro filtra por `emAberto`, e a lista de fechados
    // mostra motivo, observação e o caminho de volta.
    expect(codigo).toContain("leads.filter((l) => !l.desfecho)");
    expect(codigo).toContain("Fechados ({fechados.length})");
    expect(codigo).toContain("const reabrir = useCallback");
    // A observação que o dono pediu aparece na lista, não só no formulário.
    expect(codigo).toContain("l.desfecho_nota");
  });

  it("autoriza o drop com preventDefault no dragOver", () => {
    // Sem isto o navegador recusa o drop, silenciosamente.
    expect(codigo).toMatch(/onDragOver[\s\S]{0,200}preventDefault/);
  });

  it("grava anotação ao sair do campo, não a cada tecla", () => {
    expect(codigo).toContain("onBlur");
    expect(kanban).not.toMatch(/onChange=\{[^}]*observacoes/);
  });

  it("recarrega do servidor quando a gravação falha", () => {
    // Restaurar um retrato local desfaria o trabalho de outro consultor que
    // mexeu na fila no meio do caminho.
    const bloco = codigo.slice(codigo.indexOf("const salvar"), codigo.indexOf("const mover"));
    expect(bloco).toContain("carregar()");
    expect(bloco).not.toContain("setLeads(anterior)");
  });
});

describe("a rota", () => {
  it("devolve os atendentes junto com os leads", () => {
    // `/api/users` exige Admin, e quem atende lead é Comercial — sem isto o
    // seletor de responsável ficaria vazio justamente para quem o usa.
    expect(rota).toContain("atendentes");
    expect(rota).toContain('.in("role", ["admin", "comercial"])');
  });

  it("só devolve atendentes depois da checagem de permissão", () => {
    const posPermissao = rota.indexOf("Ver e mover leads no kanban");
    const posAtendentes = rota.indexOf("let atendentes");
    expect(posPermissao).toBeGreaterThan(-1);
    expect(posAtendentes).toBeGreaterThan(posPermissao);
  });

  it("mantém Marketing no agregado, sem nome de pessoa", () => {
    const agregado = rota.slice(rota.indexOf("if (!podeVer)"), rota.indexOf("let atendentes"));
    expect(agregado).toContain("somenteAgregado");
    expect(agregado).not.toContain("nome");
  });
});

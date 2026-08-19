import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mensagemDoVendedor } from "../src/app/api/ciclo/vendas-incompletas/route";

/**
 * Pacote 2 — completude do registro da venda (manual §3.2, meta §9 ≥ 80%).
 *
 * O que este teste protege não é a aritmética do ranking: é a régua. Um
 * indicador que compara pessoas precisa medir a mesma coisa amanhã, e precisa
 * medir só o que a pessoa medida consegue mudar.
 */

const raiz = join(__dirname, "..");

/**
 * Fonte sem comentários.
 *
 * Asserção de AUSÊNCIA sobre o arquivo inteiro casa com a própria prosa que
 * explica a decisão — e aí o teste falha justamente quando alguém documenta
 * bem. O que interessa é o que o código faz, não o que o comentário menciona.
 */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const rota = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "vendas-incompletas", "route.ts"),
  "utf-8",
);
const componente = readFileSync(
  join(raiz, "src", "components", "admin", "PainelDeCompletude.tsx"),
  "utf-8",
);
const painel = readFileSync(
  join(raiz, "src", "app", "admin", "ciclo", "completude", "page.tsx"),
  "utf-8",
);
const rotaPainel = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "completude", "route.ts"),
  "utf-8",
);
const migracao = readFileSync(
  join(raiz, "supabase", "migrations", "20260819140000_completude_da_venda.sql"),
  "utf-8",
);

describe("o vendedor deixa de ser texto livre", () => {
  it("a venda aponta para quem autentica, não para uma grafia", () => {
    // "João", "joão" e "João Silva" seriam três pessoas num ranking por texto.
    expect(migracao).toContain("add column if not exists vendedor_id uuid references public.profiles(id)");
  });

  it("a atribuição é observada da sessão, não digitada", () => {
    expect(migracao).toContain("new.vendedor_id := coalesce(new.vendedor_id, auth.uid())");
    // `coalesce`, nunca sobrescrita: o mutirão da base histórica (§3.3) insere
    // vendas antigas, e o operador do mutirão não pode virar o vendedor delas.
    expect(migracao).not.toContain("new.vendedor_id := auth.uid()");
  });

  it("a coluna de texto sobrevive, para a base histórica", () => {
    // Vendas de 2023 não têm profile para apontar.
    expect(migracao).not.toMatch(/drop column .*vendedor\b/);
  });
});

describe("a régua da completude", () => {
  it("mede os cinco campos que o formulário deixa passar", () => {
    for (const campo of ["vendedor", "versao", "cep", "data_nascimento", "consentimento_canais"]) {
      expect(migracao).toContain(`'${campo}'`);
    }
  });

  it("não mede o que o Comercial não enxerga", () => {
    // `custo_aquisicao` é escondido do Comercial pela matriz de permissões.
    // Cobrar no ranking um campo invisível na tela é armadilha, não indicador.
    expect(migracao).not.toMatch(/case when .*custo_aquisicao/);
  });

  it("não mede os obrigatórios do §3.1 — eles são constantes", () => {
    // `fechar_venda_ciclo` já recusa a venda sem eles; medir daria sempre 100%.
    for (const bloqueado of ["km_na_venda", "valor_venda", "consentimento_lgpd"]) {
      expect(migracao).not.toMatch(new RegExp(`case when [^\\n]*${bloqueado}[^\\n]*then`));
    }
  });

  it("sem canal consentido conta como pendência", () => {
    // É a pendência mais cara: o cliente nunca recebe nada e o motor o
    // suprime com `sem_canal_consentido`, em silêncio.
    expect(migracao).toContain("consentimento_canais->>'whatsapp'");
    expect(migracao).toContain("consentimento_canais->>'sms'");
  });
});

describe("o corte de acesso", () => {
  it("a view exige staff no próprio corpo", () => {
    // View comum não respeita RLS: sem este WHERE, um cliente logado leria a
    // base de vendas inteira. Mesmo padrão de `vw_ciclo_estado_painel`.
    expect(migracao).toContain("where public.is_staff(auth.uid())");
    expect(migracao).toContain("revoke all on public.vw_vendas_incompletas from anon, authenticated");
  });

  it("a migração prova o corte contra o banco, não no texto", () => {
    expect(migracao).toContain("ACEITE FALHOU: a view devolveu linha sem sessão de staff");
  });
});

describe("o ranking", () => {
  it("a janela é parâmetro — nenhum período inventado", () => {
    // O manual não dá um período. Cravar 30 ou 90 dias aqui seria número
    // inventado (CLAUDE.md); `null` = tudo, e a tela escolhe.
    expect(migracao).toContain("p_desde date default null");
    expect(migracao).toContain("p_ate   date default null");
  });

  it("mede campos preenchidos, não vendas perfeitas", () => {
    // Uma venda a que falta 1 campo de 5 vale 0,8 — tratar "quase completo"
    // como "incompleto" apagaria o progresso que o §9 quer enxergar.
    expect(migracao).toContain("1 - sum(cardinality(b.pendencias))::numeric / (count(*) * 5)");
  });
});

describe("a rotina noturna", () => {
  it("a chave de serviço enxerga a view — senão a rotina nasce muda", () => {
    // `is_staff(auth.uid())` é false para a chave de serviço, que não tem uid.
    // Sem o reconhecimento do service_role, a rota devolveria lista VAZIA SEM
    // ERRO: indistinguível de "está tudo completo". É o defeito que fez a
    // consulta de margens somar zero por semanas em 2026-08-12.
    expect(migracao).toContain("or current_user = 'service_role'");
    expect(migracao).toContain("ACEITE FALHOU: service_role não enxerga a view");
  });

  it("a mensagem diz o que falta, em português de gente", () => {
    const texto = mensagemDoVendedor("Ana Paula Ribeiro", [
      { cliente_nome: "José Carlos", placa: "ABC1D23", pendencias: ["cep", "consentimento_canais"] },
    ]);
    // Primeiro nome, como a loja fala com a equipe.
    expect(texto).toContain("Oi, Ana.");
    // Nome de campo do banco não vaza para o WhatsApp de ninguém.
    expect(texto).not.toContain("consentimento_canais");
    expect(texto).toContain("consentimento de canal");
    expect(texto).toContain("CEP do cliente");
    expect(texto).toContain("José Carlos");
  });

  it("a mensagem cutuca sem expor ranking", () => {
    // Cutucar não é cobrar. Mandar posição no ranking por WhatsApp é como um
    // indicador honesto vira número maquiado — então o texto entregue ao
    // vendedor não carrega posição, nota nem comparação com colega.
    const texto = mensagemDoVendedor("Ana", [
      { cliente_nome: "José", placa: null, pendencias: ["cep"] },
    ]);
    expect(texto).not.toMatch(/posi[çc][ãa]o|ranking|lugar|%|melhor|pior/i);
  });

  it("o plural muda com a quantidade", () => {
    const uma = mensagemDoVendedor("Ana", [
      { cliente_nome: "José", placa: null, pendencias: ["cep"] },
    ]);
    const duas = mensagemDoVendedor("Ana", [
      { cliente_nome: "José", placa: null, pendencias: ["cep"] },
      { cliente_nome: "Maria", placa: null, pendencias: ["versao"] },
    ]);
    expect(uma).toContain("um registro de venda pela metade");
    expect(duas).toContain("2 registros de venda pela metade");
  });

  it("venda sem vendedor não é cobrada de ninguém", () => {
    // A falta de atribuição É uma pendência; mandá-la para alguém seria
    // cobrar a pessoa errada.
    expect(rota).toContain("sem_atribuicao");
  });

  it("vendedor sem telefone sai no relatório, não some", () => {
    expect(rota).toContain("sem_telefone");
    expect(rota).toContain("vendedor sem telefone em profiles");
  });

  it("não tem cron próprio — view não precisa de agendamento", () => {
    // Quem acorda é o workflow do n8n. Uma view está sempre fresca.
    expect(rota).not.toContain("cron.schedule");
  });
});

describe("o painel (A-completude)", () => {
  it("o gate é o mesmo da rota — Admin e Comercial", () => {
    // O vendedor precisa enxergar a própria completude para poder corrigi-la.
    expect(painel).toContain('"Fechar venda do Ciclo"');
    expect(rotaPainel).toContain('"Fechar venda do Ciclo"');
  });

  it("a meta exibida é a do §9, não um número escolhido na tela", () => {
    expect(componente).toContain("const META = 0.8");
  });

  it("ranking sem pódio", () => {
    // Placar com medalha faz gente preencher qualquer coisa para subir.
    //
    // Medido SEM comentários: um `not.toMatch` sobre o arquivo inteiro casa
    // com a própria prosa que explica a decisão, e passa a falhar justamente
    // quando alguém documenta bem. O que interessa é o que a tela renderiza.
    expect(semComentarios(componente)).not.toMatch(/🥇|🏆|medalha|pódio|podio|1º lugar/i);
  });

  it("base pequena é sinalizada em vez de comparada em silêncio", () => {
    // Com poucas vendas, uma venda incompleta despenca o percentual.
    expect(componente).toContain("MINIMO_PARA_COMPARAR");
    expect(componente).toContain("base pequena");
  });

  it("venda sem vendedor fica fora do ranking, com o motivo escrito", () => {
    expect(componente).toContain("Vendas sem vendedor atribuído");
    expect(componente).toContain("cobrar a pessoa errada");
  });

  it("base vazia explica, em vez de mostrar zero", () => {
    // Zero diria "todo mundo é péssimo"; a verdade é que não há o que medir.
    expect(componente).toContain("Nenhuma venda registrada ainda");
  });

  it("a tela assume o erro em vez de mostrar painel vazio", () => {
    // Erro de leitura virando "está tudo completo" é o mesmo defeito que a
    // Garagem tinha ao dizer "não há veículo" quando a consulta falhava.
    expect(componente).toContain("PAINEL INDISPONÍVEL");
    expect(componente).toContain("Tentar de novo");
  });

  it("nome de campo do banco não aparece na tela", () => {
    expect(componente).toContain("NOME_DA_PENDENCIA");
    expect(componente).toContain('cep: "CEP"');
  });
});

# Consulta de placa

`/admin/consulta-placa` — o retrato de um carro oferecido à loja, para compra
ou na troca. Pedido do dono em 06/10/2026.

## O que a tela responde

1. **Pode comprar?** A faixa do topo: *Não comprar como está*, *Comprar só com
   ressalvas* ou *Sem impedimento na consulta*. Forma, cor e texto.
2. **O que foi conferido?** O quadro de dez checagens, na ordem em que a loja
   reprova: leilão, sinistro, financiamento, roubo e furto, bloqueio judicial,
   restrições do Detran, débitos, donos anteriores, numeração do chassi e
   recall. Bloco que não veio aparece como *Não conferido*, nunca como *Ok*.
3. **Por quanto?** A faixa de compra, pela curva de deságio vigente
   (`parametros_avaliacao`), recalculada com o km e o estado informados.
4. **Para onde vai o preço?** A FIPE mês a mês, a faixa de compra em cada mês
   e três meses de projeção pelo ritmo dos últimos seis.

O veredito é o dos registros. Vistoria e perícia cautelar continuam valendo.

## De onde vem cada dado

| Dado | Fonte | Custo |
|---|---|---|
| Cadastro, gravame, leilão, sinistro, roubo e furto, débitos, restrições, série da FIPE | APIBrasil, produto "Veículos Total" | cobrado por consulta |
| Empresa que comprou o carro zero (pelo CNPJ de faturamento) | BrasilAPI | sem custo |
| FIPE do mês conferida na tabela pública (pelo código FIPE) | BrasilAPI | sem custo |
| Ano e origem pelo chassi | conta local | sem custo |
| Faixa de compra | curva de deságio da loja | sem custo |

A parte sem custo nunca derruba a consulta: o que falhar aparece em
"Consultas sem custo que não vieram".

## O que protege o saldo

- Placa já consultada reabre do banco, sem custo. A tela procura primeiro lá.
- Placa nova pede confirmação antes de gastar.
- Uma chamada por consulta, sem nova tentativa. Em estouro de prazo a tela
  avisa que a consulta pode ter sido cobrada.
- Tabela ausente ou token faltando são descobertos antes de pagar.
- Consulta paga que não pôde ser gravada volta na tela mesmo assim, com aviso,
  e entra na fila de erros (`consulta-de-placa-nao-gravada`).
- Saldo zerado avisa pelo WhatsApp (`apibrasil-sem-saldo`).

## Dado pessoal

A resposta do fornecedor traz nome e CPF de proprietário e de financiado. Não
são gravados nem devolvidos à tela: o retrato é montado por lista positiva
(`src/lib/consultaDePlaca.ts`) e a tabela recusa as chaves
(`consultas_de_placa_sem_dado_pessoal`). Ficam só contagens.

## Quem usa

Administrador, Gestor e Comercial: linha "Consultar placa de veículo (consulta
paga)" da matriz. Trilho, página, rota e RLS cobram a mesma régua.

## Para ligar

1. Aplicar a migração `20261006180000_consultas_de_placa`.
2. Na Vercel, `APIBRASIL_TOKEN` em Production. Em Preview e Development,
   também `APIBRASIL_HOMOLOGACAO=1`: o fornecedor responde com um carro de
   exemplo e não cobra.

## O que ainda não está aqui

- **Triagem barata antes da consulta completa** (FIPE por placa + leilão). Os
  dois produtos existem na APIBrasil, mas o formato da resposta deles só dá
  para conferir com o token em mãos.
- **Base estadual do Paraná.** Na comparação de 06/10 a placa do PR voltou sem
  esse bloco. A tela mostra a falta; a fonte para cobri-la está por decidir.
- **Registro da decisão** (aprovado ou recusado, com motivo) por avaliação.

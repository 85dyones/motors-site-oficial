# Bloco "Resultado da perícia" — ficha do veículo

Destrava a Onda 1. As oito peças, a `/avaliacao`, o hub e o schema afirmam que o resultado da perícia está publicado na ficha.

---

## A decisão que originou isso

O laudo cautelar em PDF **não vai para o site**. Ele traz nome, CPF, endereço do proprietário anterior e a placa — dado pessoal de um terceiro que não consentiu com a publicação e que não tem relação nenhuma com o site.

O que vai para o site é **o resultado técnico**: achados sobre o veículo, não sobre uma pessoa.

Isso não enfraquece o diferencial. Fortalece, por três motivos:

- **É legível.** PDF em celular é ruim. Bloco estruturado é escaneável em cinco segundos
- **É indexável.** O Google lê o bloco e não lê bem o PDF. O conteúdo passa a trabalhar em busca
- **É comparável.** O comprador consegue confrontar dois carros do estoque no mesmo formato

E dizer **por que** o laudo completo não está publicado é, por si só, um sinal de seriedade. Uma loja que explica que não publica o CPF de terceiro demonstra mais cuidado do que uma que publica tudo sem pensar.

> Não é parecer jurídico. A decisão de publicar ou não qualquer campo deve passar por quem responde pela adequação à LGPD na empresa.

---

## O que o bloco mostra

### Cabeçalho

- **Perícia cautelar independente** — rótulo
- **Data** da realização
- **Empresa** que executou
- **Número do laudo** — permite ao comprador conferir autenticidade direto com a empresa
- **Resultado**: `Sem apontamento` · `Com apontamento`

### Os três eixos, com status

| Eixo | O que mostra |
|---|---|
| **Identificação** | Confere / Divergência encontrada |
| **Estrutura** | Sem reparo relevante / Reparo identificado / Comprometimento estrutural |
| **Histórico** | Sem ocorrência / Ocorrência encontrada |

### Apontamentos

Quando houver, cada um descrito em uma linha: onde, o quê, e a classificação (estético ou estrutural).

Exemplo de redação:
> *Repintura identificada no paralama dianteiro direito. Painel não estrutural. Espessura fora do padrão de fábrica, sem indício de reparo em longarina ou coluna.*

### Nota de rodapé do bloco, fixa

> O laudo completo fica disponível para leitura no showroom, antes da assinatura. Não publicamos o documento na íntegra porque ele contém dados pessoais do proprietário anterior.

---

## O que NUNCA entra no bloco

- Nome, CPF, RG ou endereço de qualquer proprietário, anterior ou atual
- Placa do veículo
- Chassi completo — se for exibir, apenas os últimos dígitos
- Qualquer assinatura ou dado de contato constante do laudo
- Fotos do laudo em que apareçam documentos, pessoas ou o endereço onde o veículo estava

> Fotos técnicas do veículo — detalhe de solda, medição de espessura, etiqueta — podem entrar, **desde que passem por conferência de que não capturam documento, rosto ou placa legível**.

---

## Implementação

**Origem do dado.** O resultado estruturado precisa existir como campo no ERP, não como PDF anexado. Ou seja: alguém transcreve o laudo para campos estruturados na entrada do veículo. É trabalho manual por carro — mas é trabalho que já está sendo feito de forma informal na avaliação, e vira registro.

**Bônus relevante:** esse mesmo registro é o que falta para a peça 8 ganhar contagem por motivo na segunda edição. Um trabalho, dois resultados.

**Modelo de dados sugerido:**

```
pericia_resultado
  veiculo_id
  data_pericia
  empresa
  laudo_numero
  resultado              enum: sem_apontamento | com_apontamento
  eixo_identificacao     enum: confere | divergencia
  eixo_estrutura         enum: sem_reparo | reparo_identificado | comprometimento
  eixo_historico         enum: sem_ocorrencia | ocorrencia
  apontamentos[]         { local, descricao, tipo: estetico | estrutural }
```

**Veículos sem registro.** Enquanto o estoque não estiver todo transcrito, o bloco não renderiza para o veículo — nunca renderiza vazio nem com "não informado". Ausência silenciosa é melhor que lacuna visível.

**Quando o carro vende.** O bloco acompanha a rota da ficha e o tratamento de veículo vendido.

---

## Schema

O resultado pode entrar no nó `Car` como `additionalProperty`, o que torna a informação legível por máquina — inclusive por assistente de IA:

```json
"additionalProperty": [
  { "@type": "PropertyValue", "name": "Perícia cautelar independente", "value": "Realizada em 2026-08-14" },
  { "@type": "PropertyValue", "name": "Resultado da perícia", "value": "Sem apontamento" },
  { "@type": "PropertyValue", "name": "Identificação", "value": "Confere" },
  { "@type": "PropertyValue", "name": "Estrutura", "value": "Sem reparo relevante" },
  { "@type": "PropertyValue", "name": "Histórico", "value": "Sem ocorrência" }
]
```

---

## Linkagem (regra R3)

| Elemento do bloco | Destino |
|---|---|
| "Perícia cautelar independente" | `/guias/laudo-cautelar-carro-usado` |
| "Com apontamento" | `/guias/resultados-laudo-cautelar` |
| Eixo Histórico com ocorrência | `/guias/consultar-carro-leilao-sinistro` |
| Eixo Identificação | `/guias/chassi-remarcado` |
| Nota sobre o que a perícia não cobre | `/garantia` |

Isso resolve sozinho boa parte da R4 — a ficha deixa de ser beco sem saída.

---

## Os outros dois diferenciais, sem nenhum dado pessoal

O bloco é o diferencial por veículo. Há outros dois, já prontos ou quase:

**1. O levantamento agregado.** A peça 8 publica 57 avaliados, 10 comprados, e a distribuição das recusas. É dado exclusivamente operacional, sem qualquer dado pessoal, e é o que nenhuma revenda do país publica.

**2. O critério publicado como padrão.** Uma página que lista, de forma fixa, o que faz um carro ser recusado. Deixa de ser discurso e vira compromisso que o comprador pode cobrar. Zero exposição de dado — é sobre a própria política, não sobre carros ou pessoas.

Os três juntos sustentam o posicionamento sem publicar uma única linha de dado de terceiro.

---

## Checklist

- [ ] Campos criados no ERP e transcrição definida como etapa da entrada do veículo
- [ ] Conferência de que nenhum campo do bloco contém dado pessoal
- [ ] Revisão das fotos técnicas: sem documento, rosto ou placa legível
- [ ] Bloco não renderiza para veículo sem registro
- [ ] Nota de rodapé fixa presente
- [ ] Links da R3 implementados
- [ ] `additionalProperty` no `Car`
- [ ] Equipe de vendas preparada para conversar sobre apontamento em vez de contornar
- [ ] Validação com quem responde pela LGPD na empresa

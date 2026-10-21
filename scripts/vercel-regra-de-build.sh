#!/usr/bin/env bash
# A regra de builds da Vercel (2026-10-21). Pedido do dono: "precisamos desta
# regra, já temos uma cobrança absurda extra este mês".
#
# Na semana de 14 a 21/10, 84 de cada 100 deploys foram prévias de branch —
# cada push num branch de trabalho virava um build pago (Build CPU Minutes),
# que ninguém abria. A regra:
#
#   - `main` (o site no ar) sempre constrói;
#   - deploy sem branch (CLI, manual) constrói;
#   - branch de trabalho só constrói quando o commit pede: `[preview]` (ou
#     `[previa]`/`[prévia]`) na mensagem.
#
# Convenção da Vercel para o `ignoreCommand` (vercel.json): sair com 0 PULA o
# build; sair com 1 CONSTRÓI. O job `deploy-vercel` do CI roda este mesmo
# arquivo (com BRANCH e MENSAGEM) para não esperar um deploy que não vem.
ref="${VERCEL_GIT_COMMIT_REF:-${BRANCH:-}}"
mensagem="${VERCEL_GIT_COMMIT_MESSAGE:-${MENSAGEM:-}}"

if [ -z "$ref" ]; then
  echo "Deploy sem branch (CLI ou manual): constrói."
  exit 1
fi
if [ "$ref" = "main" ]; then
  echo "main: constrói (o site no ar)."
  exit 1
fi
case "$mensagem" in
  *"[preview]"* | *"[previa]"* | *"[prévia]"*)
    echo "O commit pediu prévia em $ref: constrói."
    exit 1
    ;;
esac
echo "Branch $ref sem [preview] no commit: prévia pulada (regra de builds, scripts/vercel-regra-de-build.sh)."
exit 0

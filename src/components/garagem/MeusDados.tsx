"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rotulo } from "../modernist/primitivos";

/**
 * "Meus dados" — manual v1.1 §6.3-D.
 *
 * O bloco existe para transformar obrigação de LGPD em prova de que não há
 * nada escondido: o cliente vê exatamente o que a Motors tem sobre ele e
 * decide por qual canal quer ser avisado.
 *
 * **O que NÃO aparece, e por quê.** O §6.3-D lista cinco categorias; duas —
 * localização e telemetria de condução — a própria v1.1 manda esconder
 * enquanto não houver provedor contratado, porque "chave que não liga nada é
 * ruído, e sugere um rastreamento que não existe". A terceira, "registro de
 * KM entre revisões", controla um lembrete mensal que ainda não existe no
 * motor de gatilhos — pela mesma régua, não vira botão agora. Sobram a
 * comunicação por canal (que tem efeito imediato) e o histórico de
 * manutenção, que é sempre ativo e por isso é informação, não chave.
 */

export interface DadosDoCliente {
  nome: string;
  email: string | null;
  telefone_e164: string;
  cpf_cnpj: string;
  consentimento_canais: Record<string, unknown> | null;
}

/** "12345678909" → "123.***.**9-09" mascarado no meio. */
function mascararDocumento(valor: string): string {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length < 5) return "—";
  return `${digitos.slice(0, 3)}.***.***-${digitos.slice(-2)}`;
}

function telefoneBr(e164: string): string {
  const d = (e164 ?? "").replace(/\D/g, "");
  const sem55 = d.startsWith("55") ? d.slice(2) : d;
  if (sem55.length < 10) return e164 ?? "—";
  const ddd = sem55.slice(0, 2);
  const resto = sem55.slice(2);
  const meio = resto.length > 8 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

export default function MeusDados({ cliente }: { cliente: DadosDoCliente }) {
  const canais = cliente.consentimento_canais ?? {};
  const router = useRouter();
  const [whatsapp, setWhatsapp] = useState(canais.whatsapp === true);
  const [email, setEmail] = useState(canais.email === true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const mudou = whatsapp !== (canais.whatsapp === true) || email !== (canais.email === true);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/garagem/consentimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp, email }),
      });
      const json = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(json?.error ?? "Não deu para salvar agora.");
        return;
      }
      setAviso(
        !whatsapp && !email
          ? "Salvo. Você não vai mais receber avisos — nem de revisão. Seu programa continua igual; é só a comunicação que para."
          : "Preferências salvas.",
      );
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  const linhaClasse =
    "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-mt-regua-fina py-2.5 last:border-0";

  return (
    <section className="flex flex-col gap-6 border border-mt-regua-fina bg-mt-surface p-6">
      <div className="border-b border-mt-regua-fina pb-4">
        <Rotulo className="text-[10px] tracking-[.14em]">MEUS DADOS</Rotulo>
        <h2 className="m-0 mt-2 text-[19px] font-extrabold tracking-[-.015em] text-mt-ink">
          O que a Motors tem sobre você
        </h2>
        <p className="m-0 mt-2 text-[12px] leading-relaxed text-mt-neutral-700">
          Tudo o que está guardado no seu cadastro está listado aqui. Para corrigir
          qualquer um destes campos, fale com a loja — o cadastro é o registro da sua
          compra, e a alteração passa pela equipe.
        </p>
      </div>

      <div className="text-[13px]">
        <div className={linhaClasse}>
          <span className="text-mt-neutral-700">Nome</span>
          <span className="font-semibold text-mt-ink">{cliente.nome}</span>
        </div>
        <div className={linhaClasse}>
          <span className="text-mt-neutral-700">Documento</span>
          <span className="font-mono font-semibold text-mt-ink">
            {mascararDocumento(cliente.cpf_cnpj)}
          </span>
        </div>
        <div className={linhaClasse}>
          <span className="text-mt-neutral-700">Telefone</span>
          <span className="font-semibold text-mt-ink">{telefoneBr(cliente.telefone_e164)}</span>
        </div>
        <div className={linhaClasse}>
          <span className="text-mt-neutral-700">E-mail</span>
          <span className="font-semibold text-mt-ink">{cliente.email ?? "—"}</span>
        </div>
        <div className={linhaClasse}>
          <span className="text-mt-neutral-700">Histórico de manutenção</span>
          <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">
            sempre ativo · sustenta a procedência
          </span>
        </div>
      </div>

      {/* ---- as chaves ---- */}
      <div className="border-t border-mt-regua-fina pt-4">
        <h3 className="m-0 text-[13px] font-extrabold uppercase tracking-[.08em] text-mt-ink">
          Como a gente fala com você
        </h3>
        <p className="m-0 mt-2 text-[12px] leading-relaxed text-mt-neutral-700">
          Desligar não muda nada no seu programa nem na procedência do carro — só para
          o aviso naquele canal.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <Chave
            id="canal-whatsapp"
            rotulo="WhatsApp"
            descricao="Lembrete da janela de revisão e confirmação quando a loja verifica"
            ligado={whatsapp}
            onChange={setWhatsapp}
          />
          <Chave
            id="canal-email"
            rotulo="E-mail"
            descricao="O link de acesso a esta garagem chega por aqui, sempre — mesmo desligado"
            ligado={email}
            onChange={setEmail}
          />
        </div>

        {aviso && (
          <p className="m-0 mt-3 border-l-2 border-mt-ink bg-mt-bg p-3 text-[13px] text-mt-ink">
            {aviso}
          </p>
        )}
        {erro && (
          <p role="alert" className="m-0 mt-3 border-l-2 border-mt-accent bg-mt-bg p-3 text-[13px] text-mt-ink">
            {erro}
          </p>
        )}

        <button
          type="button"
          onClick={salvar}
          disabled={salvando || !mudou}
          className="mt-foco mt-4 bg-mt-accent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-40"
        >
          {salvando ? "Salvando…" : "Salvar preferências"}
        </button>
      </div>

      {/* ---- a exportação ---- */}
      <div className="border-t border-mt-regua-fina pt-4">
        <h3 className="m-0 text-[13px] font-extrabold uppercase tracking-[.08em] text-mt-ink">
          Levar meus dados
        </h3>
        <p className="m-0 mt-2 text-[12px] leading-relaxed text-mt-neutral-700">
          Uma página com tudo: seu cadastro, seus veículos e o histórico completo de
          manutenção. Dá para salvar em PDF ou imprimir — e para mostrar a quem for
          comprar o carro de você.
        </p>
        <a
          href="/garagem/meus-dados"
          className="mt-foco mt-3 inline-block border border-mt-regua-fina px-4 py-2 text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700 transition-colors hover:border-mt-accent hover:text-mt-ink"
        >
          Abrir versão para imprimir
        </a>
      </div>
    </section>
  );
}

function Chave({
  id,
  rotulo,
  descricao,
  ligado,
  onChange,
}: {
  id: string;
  rotulo: string;
  descricao: string;
  ligado: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 border border-mt-regua-fina bg-mt-bg p-3"
    >
      <input
        id={id}
        type="checkbox"
        checked={ligado}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-foco mt-0.5 h-4 w-4 shrink-0 accent-mt-accent"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-mt-ink">{rotulo}</span>
        <span className="text-[11px] leading-snug text-mt-neutral-600">{descricao}</span>
      </span>
    </label>
  );
}

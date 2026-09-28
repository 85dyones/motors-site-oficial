"use client";

import { useEffect, useState } from "react";
import {
  consultarValor,
  listarAnos,
  listarMarcas,
  listarModelos,
  type Buscar,
  type OpcaoFipe,
  type ValorFipe,
} from "../../../lib/consultaFipe";

/**
 * A cascata da FIPE no navegador, como a /avaliacao faz (spec §6). O valor
 * volta para o editor, que o deixa editável; o mês vem da API.
 */
export default function ConsultaFipeDoRepasse({
  podeEditar,
  aoEscolher,
  buscar,
}: {
  podeEditar: boolean;
  aoEscolher: (valor: ValorFipe) => void;
  /** Só para teste; em produção, `fetch`. */
  buscar?: Buscar;
}) {
  const [marcas, setMarcas] = useState<OpcaoFipe[]>([]);
  const [modelos, setModelos] = useState<OpcaoFipe[]>([]);
  const [anos, setAnos] = useState<OpcaoFipe[]>([]);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [estado, setEstado] = useState<"parado" | "buscando" | "erro">("parado");

  useEffect(() => {
    if (!podeEditar) return;
    let vivo = true;
    listarMarcas("carros", buscar)
      .then((lista) => {
        if (vivo) setMarcas(lista);
      })
      .catch(() => {
        if (vivo) setEstado("erro");
      });
    return () => {
      vivo = false;
    };
  }, [podeEditar, buscar]);

  if (!podeEditar) return null;

  async function escolherMarca(codigo: string) {
    setMarca(codigo);
    setModelo("");
    setModelos([]);
    setAnos([]);
    if (!codigo) return;
    setEstado("buscando");
    try {
      setModelos(await listarModelos("carros", codigo, buscar));
      setEstado("parado");
    } catch {
      setEstado("erro");
    }
  }

  async function escolherModelo(codigo: string) {
    setModelo(codigo);
    setAnos([]);
    if (!codigo) return;
    setEstado("buscando");
    try {
      setAnos(await listarAnos("carros", marca, codigo, buscar));
      setEstado("parado");
    } catch {
      setEstado("erro");
    }
  }

  async function escolherAno(codigo: string) {
    if (!codigo) return;
    setEstado("buscando");
    try {
      const valor = await consultarValor("carros", marca, modelo, codigo, buscar);
      if (!valor) {
        setEstado("erro");
        return;
      }
      aoEscolher(valor);
      setEstado("parado");
    } catch {
      setEstado("erro");
    }
  }

  const caixa = "mt-campo-caixa mt-foco";
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 md:grid-cols-3">
        <select aria-label="Marca na FIPE" className={caixa} value={marca} onChange={(e) => void escolherMarca(e.target.value)}>
          <option value="">Marca</option>
          {marcas.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nome}
            </option>
          ))}
        </select>
        <select aria-label="Modelo na FIPE" className={caixa} value={modelo} disabled={modelos.length === 0} onChange={(e) => void escolherModelo(e.target.value)}>
          <option value="">Modelo</option>
          {modelos.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nome}
            </option>
          ))}
        </select>
        <select aria-label="Ano na FIPE" className={caixa} defaultValue="" disabled={anos.length === 0} onChange={(e) => void escolherAno(e.target.value)}>
          <option value="">Ano</option>
          {anos.map((a) => (
            <option key={a.codigo} value={a.codigo}>
              {a.nome}
            </option>
          ))}
        </select>
      </div>
      {estado === "buscando" && <p className="text-[11px] text-mt-neutral-700">Consultando a FIPE…</p>}
      {estado === "erro" && (
        <p className="text-[11px] text-mt-accent-800">A FIPE não respondeu. Tente de novo ou digite o valor.</p>
      )}
    </div>
  );
}

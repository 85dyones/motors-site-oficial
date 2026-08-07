"use client";

import { useState } from "react";
import { readFileWithEncodingAutoDetect, sanitizeTextEncoding } from "@/lib/encodingUtils";

interface ImportadorRevendaMaisProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportadorRevendaMais({ isOpen, onClose, onSuccess }: ImportadorRevendaMaisProps) {
  const [fileContent, setFileContent] = useState("");
  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setResultMessage("");

    try {
      const text = await readFileWithEncodingAutoDetect(file);
      setFileContent(text);
      parseCSV(text);
    } catch (err) {
      setError("Erro ao ler o arquivo.");
    }
  };

  const parseCSV = (text: string) => {
    try {
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        setError("O arquivo selecionado está vazio ou contém apenas o cabeçalho.");
        return;
      }

      const items: any[] = [];
      const delimiter = text.includes(";") ? ";" : ",";

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
        if (cols.length >= 3) {
          const desc = sanitizeTextEncoding(cols[0]);
          const valStr = cols[1].replace("R$", "").replace(/\./g, "").replace(",", ".");
          const val = parseFloat(valStr) || 0;
          const tipoStr = (cols[2] || "").toLowerCase();
          const tipo = tipoStr.includes("rec") || tipoStr.includes("ent") ? "receber" : "pagar";
          const venc = cols[3] || new Date().toISOString().split("T")[0];
          const part = sanitizeTextEncoding(cols[4] || "RevendaMais");
          const codPlano = cols[5] || "";

          if (desc && val > 0) {
            items.push({
              descricao: desc,
              valor: val,
              tipo,
              data_vencimento: venc,
              fornecedor_cliente: part,
              categoria_codigo: codPlano,
            });
          }
        }
      }

      setParsedItems(items);
      if (items.length === 0) {
        setError("Não foi possível extrair lançamentos válidos do arquivo CSV.");
      }
    } catch (err) {
      setError("Erro ao analisar formato do arquivo CSV/Excel.");
    }
  };

  const handleImportSubmit = async () => {
    if (parsedItems.length === 0) {
      setError("Selecione um arquivo CSV com dados válidos.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/financeiro/importar-revenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: parsedItems }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResultMessage(`✅ ${data.insertedCount} contas importadas do RevendaMais com sucesso!`);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      } else {
        setError(data.error || "Erro ao importar lote.");
      }
    } catch (err: any) {
      setError("Erro de rede ao enviar importação.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-mt-inverso-fundo/80 flex items-center justify-center p-4 select-none">
      <div className="bg-mt-surface border border-mt-regua-fina max-w-xl w-full p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📥</span>
            <div>
              <h3 className="text-sm font-extrabold text-mt-ink uppercase tracking-wider">
                Importador por Lote — RevendaMais
              </h3>
              <p className="text-[10px] text-mt-neutral-700 uppercase">Sincronização de Contas a Pagar & Receber</p>
            </div>
          </div>
          <button onClick={onClose} className="text-mt-neutral-700 hover:text-mt-ink text-lg font-bold p-1 cursor-pointer">
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-4 py-2.5">
            {error}
          </div>
        )}

        {resultMessage && (
          <div className="bg-mt-surface border border-mt-regua-fina text-mt-accent-800 text-xs px-4 py-2.5 font-bold">
            {resultMessage}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="bg-mt-bg border border-dashed border-mt-regua-fina p-6 text-center flex flex-col items-center gap-2">
            <span className="text-3xl">📄</span>
            <span className="text-xs font-bold text-mt-ink">
              Selecione o arquivo CSV exportado do RevendaMais
            </span>
            <span className="text-[10px] text-mt-neutral-700">
              Formato aceito: Descrição; Valor; Tipo; Vencimento (AAAA-MM-DD); Fornecedor; CódigoPlano
            </span>

            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="mt-2 text-xs text-mt-neutral-700 file:mr-3 file:py-2 file:px-4 file:border-0 file:text-xs file:font-bold file:bg-mt-accent file:text-white cursor-pointer"
            />
          </div>

          {parsedItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-mt-accent-800 uppercase tracking-wider">
                Pré-visualização: {parsedItems.length} lançamentos encontrados
              </span>
              <div className="max-h-40 overflow-y-auto border border-mt-regua-fina divide-y divide-mt-regua-fina bg-mt-bg p-2 font-mono text-[10px]">
                {parsedItems.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1 px-2 text-mt-ink">
                    <span className="truncate max-w-[200px]">{item.descricao}</span>
                    <span className="text-mt-neutral-700">{item.data_vencimento}</span>
                    <span className={item.tipo === "receber" ? "text-mt-accent-800 font-bold" : "text-mt-accent font-bold"}>
                      R$ {item.valor.toFixed(2)}
                    </span>
                  </div>
                ))}
                {parsedItems.length > 10 && (
                  <div className="text-center py-1 text-[9px] text-mt-neutral-700 font-sans">
                    ... e mais {parsedItems.length - 10} lançamentos
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-mt-regua-fina mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-mt-bg border border-mt-regua-fina text-mt-neutral-700 text-xs font-bold uppercase hover:bg-mt-accent-100 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isLoading || parsedItems.length === 0}
              onClick={handleImportSubmit}
              className="px-6 py-2.5 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-xs font-extrabold uppercase tracking-wider transition-all  cursor-pointer disabled:opacity-50"
            >
              {isLoading ? "Importando..." : `📥 Importar ${parsedItems.length} Contas`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

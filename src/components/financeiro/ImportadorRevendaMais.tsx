"use client";

import { useState } from "react";

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setResultMessage("");
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result as string;
      setFileContent(text);
      parseCSV(text);
    };

    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    try {
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        setError("O arquivo selecionado está vazio ou contém apenas o cabeçalho.");
        return;
      }

      // Expected headers: Descrição, Valor, Tipo (pagar/receber), Vencimento (YYYY-MM-DD), Fornecedor/Cliente, CodigoPlano
      const items: any[] = [];
      const delimiter = text.includes(";") ? ";" : ",";

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
        if (cols.length >= 3) {
          const desc = cols[0];
          const valStr = cols[1].replace("R$", "").replace(".", "").replace(",", ".");
          const val = parseFloat(valStr) || 0;
          const tipoStr = (cols[2] || "").toLowerCase();
          const tipo = tipoStr.includes("rec") || tipoStr.includes("ent") ? "receber" : "pagar";
          const venc = cols[3] || new Date().toISOString().split("T")[0];
          const part = cols[4] || "RevendaMais";
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fadeIn">
      <div className="bg-brand-card border border-brand-border/60 rounded-3xl max-w-xl w-full p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-brand-border/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📥</span>
            <div>
              <h3 className="text-sm font-extrabold text-brand-text uppercase tracking-wider">
                Importador por Lote — RevendaMais
              </h3>
              <p className="text-[10px] text-brand-text/70 uppercase">Sincronização de Contas a Pagar & Receber</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brand-text/50 hover:text-brand-text text-lg font-bold p-1 cursor-pointer">
            ✕
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-2.5 rounded-xl">
            {error}
          </div>
        )}

        {resultMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs px-4 py-2.5 rounded-xl font-bold">
            {resultMessage}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="bg-brand-bg/60 border border-dashed border-brand-border rounded-2xl p-6 text-center flex flex-col items-center gap-2">
            <span className="text-3xl">📄</span>
            <span className="text-xs font-bold text-brand-text">
              Selecione o arquivo CSV exportado do RevendaMais
            </span>
            <span className="text-[10px] text-brand-text/60">
              Formato aceito: Descrição; Valor; Tipo; Vencimento (AAAA-MM-DD); Fornecedor; CódigoPlano
            </span>

            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="mt-2 text-xs text-brand-text/70 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-primary file:text-white cursor-pointer"
            />
          </div>

          {parsedItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                Pré-visualização: {parsedItems.length} lançamentos encontrados
              </span>
              <div className="max-h-40 overflow-y-auto border border-brand-border/40 rounded-xl divide-y divide-brand-border/30 bg-brand-bg/40 p-2 font-mono text-[10px]">
                {parsedItems.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1 px-2 text-brand-text">
                    <span className="truncate max-w-[200px]">{item.descricao}</span>
                    <span className="text-brand-text/60">{item.data_vencimento}</span>
                    <span className={item.tipo === "receber" ? "text-emerald-500 font-bold" : "text-red-500 font-bold"}>
                      R$ {item.valor.toFixed(2)}
                    </span>
                  </div>
                ))}
                {parsedItems.length > 10 && (
                  <div className="text-center py-1 text-[9px] text-brand-text/50 font-sans">
                    ... e mais {parsedItems.length - 10} lançamentos
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-brand-border/40 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-brand-bg border border-brand-border text-brand-text/70 text-xs font-bold uppercase rounded-xl hover:bg-brand-primary/10 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isLoading || parsedItems.length === 0}
              onClick={handleImportSubmit}
              className="px-6 py-2.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? "Importando..." : `📥 Importar ${parsedItems.length} Contas`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

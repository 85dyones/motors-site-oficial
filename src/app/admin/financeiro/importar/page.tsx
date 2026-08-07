"use client";

import { useState } from "react";
import FinanceHeaderNav from "@/components/financeiro/FinanceHeaderNav";
import { readFileWithEncodingAutoDetect, sanitizeTextEncoding } from "@/lib/encodingUtils";

interface ImportItem {
  descricao: string;
  valor: number;
  tipo: "pagar" | "receber";
  data_vencimento: string;
  fornecedor_cliente?: string;
  categoria_codigo?: string;
  veiculo_id?: string;
  observacoes?: string;
}

export default function ImportarRevendaPage() {
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<"csv" | "xml">("csv");
  const [parsedItems, setParsedItems] = useState<ImportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [error, setError] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setResultMessage("");
    setFileName(file.name);

    const isXml = file.name.toLowerCase().endsWith(".xml");
    setFileType(isXml ? "xml" : "csv");

    try {
      const text = await readFileWithEncodingAutoDetect(file);
      setFileContent(text);
      if (isXml) {
        parseXML(text);
      } else {
        parseCSV(text);
      }
    } catch (err) {
      setError("Erro ao ler o arquivo. Verifique se o formato está correto.");
    }
  };

  const parseXML = (xmlText: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const items: ImportItem[] = [];

      // Try NFe format (<infNfe>)
      const nfeProc = xmlDoc.getElementsByTagName("infNfe")[0] || xmlDoc.getElementsByTagName("NFe")[0];
      if (nfeProc) {
        const emitName = sanitizeTextEncoding(xmlDoc.getElementsByTagName("xNome")[0]?.textContent || "Fornecedor NFe");
        const totalValStr = xmlDoc.getElementsByTagName("vNF")[0]?.textContent || xmlDoc.getElementsByTagName("vPag")[0]?.textContent || "0";
        const totalVal = parseFloat(totalValStr) || 0;
        const dhEmi = xmlDoc.getElementsByTagName("dhEmi")[0]?.textContent || xmlDoc.getElementsByTagName("dEmi")[0]?.textContent;
        const dateStr = dhEmi ? dhEmi.substring(0, 10) : new Date().toISOString().split("T")[0];

        // Extract products or general line
        const prods = xmlDoc.getElementsByTagName("det");
        if (prods.length > 0) {
          for (let i = 0; i < prods.length; i++) {
            const xProd = sanitizeTextEncoding(prods[i].getElementsByTagName("xProd")[0]?.textContent || "Produto/Peça NFe");
            const vProdStr = prods[i].getElementsByTagName("vProd")[0]?.textContent || "0";
            const vProd = parseFloat(vProdStr) || 0;
            if (vProd > 0) {
              items.push({
                descricao: `NFe: ${xProd}`,
                valor: vProd,
                tipo: "pagar",
                data_vencimento: dateStr,
                fornecedor_cliente: emitName,
                categoria_codigo: "003.005.006.016", // Default: PEÇAS E MANUTENÇÃO
                observacoes: "Importado via XML de NFe do RevendaMais",
              });
            }
          }
        } else if (totalVal > 0) {
          items.push({
            descricao: `NFe Fornecedor: ${emitName}`,
            valor: totalVal,
            tipo: "pagar",
            data_vencimento: dateStr,
            fornecedor_cliente: emitName,
            categoria_codigo: "003.005.006.016",
            observacoes: "Importado via XML do RevendaMais",
          });
        }
      } else {
        // Generic XML parsing
        const contaNodes = xmlDoc.getElementsByTagName("conta") || xmlDoc.getElementsByTagName("lancamento");
        for (let i = 0; i < contaNodes.length; i++) {
          const desc = sanitizeTextEncoding(contaNodes[i].getElementsByTagName("descricao")[0]?.textContent || "Lançamento XML");
          const val = parseFloat(contaNodes[i].getElementsByTagName("valor")[0]?.textContent || "0") || 0;
          const venc = contaNodes[i].getElementsByTagName("vencimento")[0]?.textContent || new Date().toISOString().split("T")[0];
          const part = sanitizeTextEncoding(contaNodes[i].getElementsByTagName("parceiro")[0]?.textContent || "RevendaMais");

          if (val > 0) {
            items.push({
              descricao: desc,
              valor: val,
              tipo: "pagar",
              data_vencimento: venc,
              fornecedor_cliente: part,
            });
          }
        }
      }

      setParsedItems(items);
      if (items.length === 0) {
        setError("Não foi possível identificar lançamentos válidos na estrutura do arquivo XML.");
      }
    } catch (err) {
      setError("Erro ao analisar a estrutura do arquivo XML.");
    }
  };

  const parseCSV = (text: string) => {
    try {
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        setError("O arquivo CSV está vazio ou contém apenas o cabeçalho.");
        return;
      }

      const items: ImportItem[] = [];
      const delimiter = text.includes(";") ? ";" : ",";

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
        if (cols.length >= 2) {
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
      setError("Erro ao processar arquivo CSV.");
    }
  };

  const handleImportSubmit = async () => {
    if (parsedItems.length === 0) {
      setError("Selecione um arquivo válido para importação.");
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
        setResultMessage(`✅ ${data.insertedCount} lançamentos importados com sucesso para o Financeiro!`);
        setParsedItems([]);
        setFileName("");
      } else {
        setError(data.error || "Erro ao efetuar importação em lote.");
      }
    } catch (err: any) {
      setError("Erro de conexão ao processar importação.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFixEncoding = async () => {
    setIsLoading(true);
    setError("");
    setResultMessage("Corrigindo acentuação de lançamentos antigos no banco...");
    try {
      const res = await fetch("/api/financeiro/corrigir-caracteres", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResultMessage(data.message || "Acentuação de lançamentos corrigida com sucesso!");
      } else {
        setError(`Erro ao corrigir: ${data.error}`);
      }
    } catch (err: any) {
      setError(`Erro de conexão: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadSampleCSV = () => {
    const csvContent = "Descricao;Valor;Tipo;Vencimento;FornecedorCliente;CodigoPlano\n" +
      "COMPRA DE PEÇAS FREIO TRACKER;1450.00;pagar;2026-08-10;AutoPeças Curitiba;003.005.006.016\n" +
      "LAVACAR E POLIMENTO PREPARAÇÃO;350.00;pagar;2026-08-12;Lavacar Bacacheri;002.001.001.003\n" +
      "VENDA DE VEICULO COROLLA XEI;118000.00;receber;2026-08-15;Cliente João Silva;003.001.001.001\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "modelo_importacao_revendamais.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <FinanceHeaderNav />

      {/* Header Banner */}
      <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none">
        <div>
          <div className="flex flex-col gap-1.5">
            <span className="mt-rotulo mt-rotulo-accent">Importação</span>
            <h1 className="text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
              Central de importação RevendaMais (CSV & XML)
            </h1>
          </div>
          <p className="text-xs text-mt-neutral-800 mt-1 max-w-2xl">
            Importe em lote arquivos exportados do **RevendaMais** (planilhas CSV, Excel ou XMLs de NFe). Todos os lançamentos serão automaticamente categorizados no **Plano de Contas Oficial de Revenda de Veículos**.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={downloadSampleCSV}
            className="px-4 py-2.5 bg-mt-bg border border-mt-regua-fina hover:border-mt-accent text-mt-accent font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap"
          >
            
            <span>Baixar Planilha Modelo (.CSV)</span>
          </button>

          <button
            onClick={handleFixEncoding}
            title="Corrigir acentuação em contas antigas já salvas no banco"
            className="px-4 py-2.5 bg-mt-accent-100 border border-mt-accent-300 hover:bg-mt-accent-100 text-mt-accent-800 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap"
          >
            
            <span>Corrigir Acentuação de Registros Antigos</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-mt-accent-100 border border-mt-accent-300 text-mt-accent text-xs px-5 py-4 font-semibold">
          {error}
        </div>
      )}

      {resultMessage && (
        <div className="bg-mt-surface border border-mt-regua-fina text-mt-accent-800 text-xs px-5 py-4 font-bold animate-bounce">
          {resultMessage}
        </div>
      )}

      {/* Upload Drag & Drop Area */}
      <div className="bg-mt-surface border border-mt-regua-fina p-8 flex flex-col items-center justify-center text-center gap-4 border-dashed hover:border-mt-accent transition-all select-none">
        <div className="h-16 w-16 bg-mt-accent-100 border border-mt-accent-300 flex items-center justify-center text-2xl text-mt-accent">
          {fileType === "xml" ? "XML" : "CSV"}
        </div>

        <div>
          <h3 className="text-sm font-extrabold text-mt-ink uppercase tracking-wide">
            {fileName ? `Arquivo Selecionado: ${fileName}` : "Arraste seu arquivo CSV ou XML do RevendaMais aqui"}
          </h3>
          <p className="text-xs text-mt-neutral-700 mt-1">
            Suporta planilhas exportadas do RevendaMais ou arquivos XML de Nota Fiscal Eletrônica (NFe/NFSe).
          </p>
        </div>

        <label className="px-6 py-3 bg-mt-accent hover:bg-mt-accent-hover text-mt-inverso text-xs font-extrabold uppercase tracking-wider cursor-pointer transition-all ">
          <span>Escolher Arquivo no Computador</span>
          <input
            type="file"
            accept=".csv,.xml,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Parsed items table */}
      {parsedItems.length > 0 && (
        <div className="bg-mt-surface border border-mt-regua-fina p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-mt-regua-fina pb-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase text-mt-accent-800 tracking-wider">
                Pré-visualização do Lote — {parsedItems.length} lançamentos identificados
              </h3>
              <p className="text-[10px] text-mt-neutral-700 mt-0.5">Confira os valores antes de efetuar a gravação no banco de dados.</p>
            </div>
            <button
              onClick={handleImportSubmit}
              disabled={isLoading}
              className="px-6 py-3 bg-mt-ink hover:bg-mt-neutral-800 text-mt-inverso font-extrabold text-xs uppercase tracking-wider transition-all  cursor-pointer disabled:opacity-50"
            >
              {isLoading ? "Processando..." : `Confirmar e importar ${parsedItems.length} Contas`}
            </button>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-mt-regua-fina text-mt-neutral-700 font-bold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Descrição</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3">Vencimento</th>
                  <th className="pb-3">Fornecedor / Cliente</th>
                  <th className="pb-3 pr-2 text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mt-regua-fina">
                {parsedItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-mt-accent-100 transition-colors">
                    <td className="py-3 pl-2 font-bold text-mt-ink">{item.descricao}</td>
                    <td className="py-3">
                      <span
                        className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 border ${
                          item.tipo === "receber"
                            ? "bg-mt-surface text-mt-accent-800 border-mt-regua-fina"
                            : "bg-mt-accent-100 text-mt-accent border-mt-accent-300"
                        }`}
                      >
                        {item.tipo}
                      </span>
                    </td>
                    <td className="py-3 text-mt-neutral-800">{item.data_vencimento}</td>
                    <td className="py-3 text-mt-neutral-800">{item.fornecedor_cliente || "Geral"}</td>
                    <td
                      className={`py-3 pr-2 text-right font-extrabold ${
                        item.tipo === "receber" ? "text-mt-accent-800" : "text-mt-accent"
                      }`}
                    >
                      R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";

interface ImportResult {
  imported: number;
  skipped: number;
  importedTickers: string[];
  skippedTickers: string[];
  errors: string[];
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "idle" | "loading" | "preview" | "importing" | "success" | "error";

const BORDER = "#1e2d3d";
const BG_SECONDARY = "#111827";
const BG_TERTIARY = "#1a2234";
const ACCENT = "#00d4aa";
const TEXT_PRIMARY = "#e2e8f0";
const TEXT_SECONDARY = "#94a3b8";
const POSITIVE = "#10b981";
const NEGATIVE = "#ef4444";

export default function ImportModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [pasteValue, setPasteValue] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [detectedBroker, setDetectedBroker] = useState<string | null>(null);
  // Hold onto pending files/paste so confirm can re-submit without preview
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPaste, setPendingPaste] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function detectBroker(content: string, filename?: string): string {
    try {
      const data = JSON.parse(content);
      if (data?.BrokerageTransactions) return "Schwab JSON";
    } catch {}
    const lower = filename?.toLowerCase() ?? "";
    if (lower.includes("schwab")) return "Schwab";
    if (lower.includes("robinhood")) return "Robinhood";
    return "Unknown format";
  }

  async function submitOne(
    content: string,
    filename: string | undefined,
    previewMode: boolean
  ): Promise<ImportResult> {
    const url = previewMode ? "/api/import?preview=true" : "/api/import";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        ...(filename ? { "x-filename": filename } : {}),
      },
      body: content,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Import failed");
    return json as ImportResult;
  }

  async function runFiles(files: File[], previewMode: boolean): Promise<ImportResult> {
    let totalImported = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];
    const allImportedTickers = new Set<string>();
    const allSkippedTickers = new Set<string>();
    for (const file of files) {
      const content = await file.text();
      if (files.length === 1) setDetectedBroker(detectBroker(content, file.name));
      const r = await submitOne(content, file.name, previewMode);
      totalImported += r.imported;
      totalSkipped += r.skipped;
      allErrors.push(...r.errors);
      (r.importedTickers ?? []).forEach((t: string) => allImportedTickers.add(t));
      (r.skippedTickers ?? []).forEach((t: string) => allSkippedTickers.add(t));
    }
    return {
      imported: totalImported,
      skipped: totalSkipped,
      importedTickers: [...allImportedTickers].sort(),
      skippedTickers: [...allSkippedTickers].sort(),
      errors: allErrors,
    };
  }

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setStep("loading");
    setDetectedBroker(files.length > 1 ? `${files.length} files` : detectBroker("", files[0].name));
    setPendingFiles(files);
    try {
      const r = await runFiles(files, true);
      setPreview(r);
      setStep("preview");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStep("error");
    }
  }

  async function handlePaste(content: string) {
    setStep("loading");
    setDetectedBroker(detectBroker(content));
    setPendingPaste(content);
    try {
      const r = await submitOne(content, undefined, true);
      r.importedTickers ??= [];
      r.skippedTickers ??= [];
      setPreview(r);
      setStep("preview");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStep("error");
    }
  }

  async function confirmImport() {
    setStep("importing");
    try {
      let r: ImportResult;
      if (pendingFiles.length) {
        r = await runFiles(pendingFiles, false);
      } else {
        r = await submitOne(pendingPaste, undefined, false);
        r.importedTickers ??= [];
        r.skippedTickers ??= [];
      }
      setResult(r);
      setStep("success");
      if (r.imported > 0) {
        window.dispatchEvent(new Event("transactions-updated"));
        onSuccess();
      }
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStep("error");
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFiles(files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  function reset() {
    setStep("idle");
    setPasteValue("");
    setPreview(null);
    setResult(null);
    setErrorMsg("");
    setDetectedBroker(null);
    setPendingFiles([]);
    setPendingPaste("");
  }

  const isWorking = step === "loading" || step === "importing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl flex flex-col"
        style={{
          backgroundColor: BG_SECONDARY,
          border: `1px solid ${BORDER}`,
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <h2 className="font-medium text-base" style={{ color: TEXT_PRIMARY }}>
            Import Transactions
          </h2>
          <button
            onClick={onClose}
            className="text-lg leading-none transition-opacity hover:opacity-60"
            style={{ color: TEXT_SECONDARY }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">

          {/* ── Idle ── */}
          {step === "idle" && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg flex flex-col items-center justify-center gap-2 py-8 cursor-pointer transition-colors"
                style={{
                  border: `2px dashed ${dragOver ? ACCENT : BORDER}`,
                  backgroundColor: dragOver ? "#00d4aa0d" : BG_TERTIARY,
                }}
              >
                <span className="text-2xl">📂</span>
                <p className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>
                  Drop file here or click to browse
                </p>
                <p className="text-xs" style={{ color: TEXT_SECONDARY }}>
                  Supports Schwab JSON and Robinhood CSV · select multiple files at once
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) handleFiles(files);
                  }}
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
                <span className="text-xs" style={{ color: TEXT_SECONDARY }}>or paste JSON</span>
                <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
              </div>

              <textarea
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                placeholder="Paste Schwab JSON export here..."
                rows={6}
                className="rounded-lg p-3 text-xs font-mono resize-none outline-none w-full"
                style={{
                  backgroundColor: BG_TERTIARY,
                  border: `1px solid ${BORDER}`,
                  color: TEXT_PRIMARY,
                }}
              />

              <button
                disabled={!pasteValue.trim()}
                onClick={() => handlePaste(pasteValue.trim())}
                className="rounded-lg py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ backgroundColor: ACCENT, color: "#0a0e1a" }}
              >
                Preview Import
              </button>
            </>
          )}

          {/* ── Loading / Importing spinner ── */}
          {isWorking && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: BORDER, borderTopColor: ACCENT }}
              />
              <p className="text-sm" style={{ color: TEXT_SECONDARY }}>
                {step === "importing"
                  ? "Importing…"
                  : `${detectedBroker ? `Detected: ${detectedBroker} · ` : ""}Checking…`}
              </p>
            </div>
          )}

          {/* ── Preview ── */}
          {step === "preview" && preview && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col items-center gap-2 text-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                  style={{ backgroundColor: "#00d4aa20" }}
                >
                  👀
                </div>
                <p className="font-medium text-base" style={{ color: TEXT_PRIMARY }}>
                  Review before importing
                </p>
                {detectedBroker && (
                  <p className="text-xs" style={{ color: TEXT_SECONDARY }}>{detectedBroker}</p>
                )}
              </div>

              {preview.importedTickers.length > 0 ? (
                <div
                  className="rounded-lg p-3 w-full"
                  style={{ backgroundColor: BG_TERTIARY, border: `1px solid ${BORDER}` }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: POSITIVE }}>
                    ↑ {preview.imported} new transactions — {preview.importedTickers.length} ticker{preview.importedTickers.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.importedTickers.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded text-xs font-mono font-medium"
                        style={{ backgroundColor: "#10b98118", color: POSITIVE, border: "1px solid #10b98130" }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-lg p-3 text-center text-sm"
                  style={{ backgroundColor: BG_TERTIARY, border: `1px solid ${BORDER}`, color: TEXT_SECONDARY }}
                >
                  No new transactions — all {preview.skipped} already in DB
                </div>
              )}

              {preview.skippedTickers.length > 0 && (
                <div
                  className="rounded-lg p-3 w-full"
                  style={{ backgroundColor: BG_TERTIARY, border: `1px solid ${BORDER}` }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: TEXT_SECONDARY }}>
                    ↷ {preview.skipped} already in DB — {preview.skippedTickers.length} ticker{preview.skippedTickers.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.skippedTickers.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ backgroundColor: "#ffffff08", color: TEXT_SECONDARY, border: `1px solid ${BORDER}` }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 w-full mt-1">
                <button
                  onClick={reset}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: BG_TERTIARY, color: TEXT_PRIMARY, border: `1px solid ${BORDER}` }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  disabled={preview.imported === 0}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ backgroundColor: ACCENT, color: "#0a0e1a" }}
                >
                  {preview.imported === 0 ? "Nothing to import" : `Confirm Import (${preview.imported})`}
                </button>
              </div>
            </div>
          )}

          {/* ── Success ── */}
          {step === "success" && result && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col items-center gap-2 text-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                  style={{ backgroundColor: "#10b98120" }}
                >
                  ✓
                </div>
                <p className="font-medium text-base" style={{ color: POSITIVE }}>
                  Import complete
                </p>
                {detectedBroker && (
                  <p className="text-xs" style={{ color: TEXT_SECONDARY }}>{detectedBroker}</p>
                )}
              </div>

              {result.importedTickers.length > 0 && (
                <div
                  className="rounded-lg p-3 w-full"
                  style={{ backgroundColor: BG_TERTIARY, border: `1px solid ${BORDER}` }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: POSITIVE }}>
                    ↑ {result.imported} imported — {result.importedTickers.length} ticker{result.importedTickers.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.importedTickers.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded text-xs font-mono font-medium"
                        style={{ backgroundColor: "#10b98118", color: POSITIVE, border: "1px solid #10b98130" }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.skippedTickers.length > 0 && (
                <div
                  className="rounded-lg p-3 w-full"
                  style={{ backgroundColor: BG_TERTIARY, border: `1px solid ${BORDER}` }}
                >
                  <p className="text-xs font-medium mb-2" style={{ color: TEXT_SECONDARY }}>
                    ↷ {result.skipped} already in DB — {result.skippedTickers.length} ticker{result.skippedTickers.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.skippedTickers.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ backgroundColor: "#ffffff08", color: TEXT_SECONDARY, border: `1px solid ${BORDER}` }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 w-full mt-1">
                <button
                  onClick={reset}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: BG_TERTIARY, color: TEXT_PRIMARY, border: `1px solid ${BORDER}` }}
                >
                  Import more
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: ACCENT, color: "#0a0e1a" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {step === "error" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                style={{ backgroundColor: "#ef444420" }}
              >
                ✕
              </div>
              <div>
                <p className="font-medium text-base" style={{ color: NEGATIVE }}>
                  Import failed
                </p>
                <p className="text-xs mt-2 font-mono" style={{ color: TEXT_SECONDARY }}>
                  {errorMsg}
                </p>
              </div>
              <button
                onClick={reset}
                className="w-full rounded-lg py-2.5 text-sm font-medium"
                style={{ backgroundColor: BG_TERTIARY, color: TEXT_PRIMARY, border: `1px solid ${BORDER}` }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

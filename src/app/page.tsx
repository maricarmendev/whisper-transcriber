"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Model = "tiny" | "base" | "small";

type FileStatus = "pending" | "processing" | "done" | "error";

type FileItem = {
  id: string;
  file: File;
  status: FileStatus;
  transcription?: string;
  error?: string;
};

const MODEL_OPTIONS: { value: Model; label: string; hint: string }[] = [
  { value: "tiny", label: "tiny", hint: "más rápido, menos preciso" },
  { value: "base", label: "base", hint: "balance recomendado" },
  { value: "small", label: "small", hint: "más preciso, más lento" },
];

const STATUS_META: Record<
  FileStatus,
  { label: string; dot: string; text: string }
> = {
  pending: {
    label: "Pendiente",
    dot: "bg-zinc-300 dark:bg-zinc-700",
    text: "text-zinc-500 dark:text-zinc-400",
  },
  processing: {
    label: "Procesando",
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
  },
  done: {
    label: "Listo",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    label: "Error",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
  },
};

const ACCEPTED_EXTENSIONS = [".ogg", ".mp3", ".m4a", ".wav", ".webm"] as const;
const ACCEPT_ATTR = `${ACCEPTED_EXTENSIONS.join(",")},audio/*`;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function stripExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export default function Home() {
  const [model, setModel] = useState<Model>("base");
  const [items, setItems] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: FileItem[] = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
    }));
    setItems((prev) => [...prev, ...next]);
  }, []);

  function patchItem(id: string, patch: Partial<FileItem>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }

  async function transcribeAll() {
    if (isProcessing) return;
    setIsProcessing(true);

    const pending = items.filter((it) => it.status === "pending");

    for (const item of pending) {
      patchItem(item.id, { status: "processing", error: undefined });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const form = new FormData();
        form.append("file", item.file);
        form.append("model", model);
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          transcription?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        patchItem(item.id, {
          status: "done",
          transcription: data.transcription ?? "",
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          patchItem(item.id, { status: "pending", error: undefined });
          break;
        }
        const message =
          err instanceof Error ? err.message : "Error desconocido";
        patchItem(item.id, { status: "error", error: message });
      } finally {
        abortRef.current = null;
      }
    }

    setIsProcessing(false);
  }

  function cancelProcessing() {
    abortRef.current?.abort();
  }

  function clearAll() {
    setItems([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function downloadOne(item: FileItem) {
    if (!item.transcription) return;
    downloadText(`${stripExt(item.file.name)}.txt`, item.transcription);
  }

  function downloadAllCombined() {
    const done = items.filter((it) => it.status === "done" && it.transcription);
    if (done.length === 0) return;
    const combined = done
      .map((it) => `===== ${it.file.name} =====\n${it.transcription}`)
      .join("\n\n");
    downloadText("transcripciones.txt", combined);
  }

  async function copyOne(item: FileItem) {
    if (!item.transcription) return;
    try {
      await navigator.clipboard.writeText(item.transcription);
      setCopiedId(item.id);
    } catch {
      // clipboard may be unavailable; silently ignore
    }
  }

  useEffect(() => {
    if (!copiedId) return;
    const t = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(t);
  }, [copiedId]);

  const pendingCount = items.filter((it) => it.status === "pending").length;
  const doneCount = items.filter((it) => it.status === "done").length;
  const processingCount = items.filter(
    (it) => it.status === "processing",
  ).length;
  const errorCount = items.filter((it) => it.status === "error").length;
  const hasPending = pendingCount > 0;
  const hasDone = doneCount > 0;

  function onDropZoneClick() {
    if (isProcessing) return;
    fileInputRef.current?.click();
  }

  function onDragOver(e: React.DragEvent) {
    if (isProcessing) return;
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing) return;
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-12">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <path d="M12 18v4" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Whisper Transcriber
            </h1>
          </div>

          <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Sube audios (WhatsApp .ogg, .mp3, .m4a, .wav, .webm) y obtén su
            transcripción en español. El procesamiento ocurre en serie.
          </p>
        </header>

        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
              Modelo
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
              {MODEL_OPTIONS.find((m) => m.value === model)?.hint}
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label="Modelo de Whisper"
            className="inline-flex w-full rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {MODEL_OPTIONS.map((opt) => {
              const selected = model === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setModel(opt.value)}
                  disabled={isProcessing}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
            Archivos
          </h2>
          <button
            type="button"
            onClick={onDropZoneClick}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            disabled={isProcessing}
            className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isDragging
                ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-3 h-6 w-6 text-zinc-400 dark:text-zinc-500"
              aria-hidden
            >
              <path d="M12 16V4" />
              <path d="m6 10 6-6 6 6" />
              <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
            </svg>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Arrastrá audios aquí o hacé clic para seleccionar
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              .ogg · .mp3 · .m4a · .wav · .webm · hasta 100 MB
            </p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
            disabled={isProcessing}
            className="sr-only"
          />
        </section>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={transcribeAll}
            disabled={isProcessing || !hasPending}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isProcessing ? (
              <>
                <Spinner className="h-3.5 w-3.5" />
                Procesando…
              </>
            ) : (
              <>
                Transcribir
                {hasPending && (
                  <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs font-medium dark:bg-zinc-900/15">
                    {pendingCount}
                  </span>
                )}
              </>
            )}
          </button>

          {isProcessing && (
            <button
              type="button"
              onClick={cancelProcessing}
              className="text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
            >
              Cancelar
            </button>
          )}

          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              onClick={downloadAllCombined}
              disabled={!hasDone}
              className="text-sm text-zinc-600 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Descargar todo
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={isProcessing || items.length === 0}
              className="text-sm text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-500 dark:hover:text-zinc-100"
            >
              Limpiar
            </button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="mb-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
            <span>
              {items.length} archivo{items.length === 1 ? "" : "s"}
            </span>
            <span aria-hidden>·</span>
            <span>
              {doneCount} listo{doneCount === 1 ? "" : "s"}
            </span>
            {processingCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="text-blue-600 dark:text-blue-400">
                  {processingCount} procesando
                </span>
              </>
            )}
            {errorCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="text-rose-600 dark:text-rose-400">
                  {errorCount} con error
                </span>
              </>
            )}
          </div>
        )}

        <section className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
              Todavía no hay archivos.
            </p>
          ) : (
            items.map((item) => {
              const meta = STATUS_META[item.status];
              return (
                <article
                  key={item.id}
                  className="rounded-lg border border-zinc-200 bg-white transition-colors dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="relative flex h-2 w-2 shrink-0"
                      aria-hidden
                    >
                      <span
                        className={`absolute inline-flex h-full w-full rounded-full ${meta.dot} ${
                          item.status === "processing"
                            ? "animate-ping opacity-75"
                            : ""
                        }`}
                      />
                      <span
                        className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`}
                      />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100"
                        title={item.file.name}
                      >
                        {item.file.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
                        <span className={meta.text}>{meta.label}</span>
                        <span aria-hidden>·</span>
                        <span>{formatBytes(item.file.size)}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {item.status === "done" && (
                        <>
                          <IconButton
                            label={
                              copiedId === item.id ? "Copiado" : "Copiar texto"
                            }
                            onClick={() => copyOne(item)}
                          >
                            {copiedId === item.id ? (
                              <CheckIcon />
                            ) : (
                              <CopyIcon />
                            )}
                          </IconButton>
                          <IconButton
                            label="Descargar .txt"
                            onClick={() => downloadOne(item)}
                          >
                            <DownloadIcon />
                          </IconButton>
                        </>
                      )}
                      {!isProcessing && (
                        <IconButton
                          label="Quitar"
                          onClick={() => removeItem(item.id)}
                        >
                          <XIcon />
                        </IconButton>
                      )}
                    </div>
                  </div>

                  {item.status === "done" && item.transcription && (
                    <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-900">
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                        {item.transcription}
                      </pre>
                    </div>
                  )}

                  {item.status === "error" && item.error && (
                    <div className="border-t border-rose-100 bg-rose-50/50 px-4 py-2.5 text-xs text-rose-700 dark:border-rose-950 dark:bg-rose-950/30 dark:text-rose-300">
                      {item.error}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
    >
      {children}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M12 4v12" />
      <path d="m6 14 6 6 6-6" />
      <path d="M4 20h16" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

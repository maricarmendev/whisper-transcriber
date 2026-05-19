"use client";

import { useRef, useState } from "react";

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
  { value: "tiny", label: "tiny", hint: "Más rápido, menos preciso" },
  { value: "base", label: "base", hint: "Balance recomendado" },
  { value: "small", label: "small", hint: "Más preciso, más lento" },
];

const STATUS_BADGE: Record<FileStatus, { emoji: string; label: string; cls: string }> = {
  pending: { emoji: "⏳", label: "Pendiente", cls: "text-zinc-500" },
  processing: { emoji: "⚙️", label: "Procesando", cls: "text-blue-600 dark:text-blue-400" },
  done: { emoji: "✅", label: "Listo", cls: "text-green-600 dark:text-green-400" },
  error: { emoji: "❌", label: "Error", cls: "text-red-600 dark:text-red-400" },
};

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const next: FileItem[] = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
    }));
    setItems((prev) => [...prev, ...next]);
  }

  function patchItem(id: string, patch: Partial<FileItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function transcribeAll() {
    if (isProcessing) return;
    setIsProcessing(true);

    // Snapshot the pending items so new uploads mid-run don't get picked up.
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
        const data = (await res.json()) as { transcription?: string; error?: string };
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
        const message = err instanceof Error ? err.message : "Error desconocido";
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

  const hasPending = items.some((it) => it.status === "pending");
  const hasDone = items.some((it) => it.status === "done");

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Whisper Transcriber
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Subí varios audios (WhatsApp .ogg, .mp3, .m4a, .wav, .webm) y obtené su transcripción en
            español. El procesamiento ocurre en serie.
          </p>
        </header>

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Modelo</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            {MODEL_OPTIONS.map((opt) => {
              const selected = model === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex-1 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
                    selected
                      ? "border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={opt.value}
                    checked={selected}
                    onChange={() => setModel(opt.value)}
                    disabled={isProcessing}
                    className="sr-only"
                  />
                  <div className="font-medium">{opt.label}</div>
                  <div
                    className={`text-xs ${
                      selected
                        ? "text-zinc-300 dark:text-zinc-600"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {opt.hint}
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Archivos</h2>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".ogg,.mp3,.m4a,.wav,.webm,audio/*"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={isProcessing}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-50 hover:file:bg-zinc-700 disabled:opacity-50 dark:text-zinc-300 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-300"
          />
        </section>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={transcribeAll}
            disabled={isProcessing || !hasPending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isProcessing ? "Procesando…" : "Transcribir todo"}
          </button>
          {isProcessing && (
            <button
              type="button"
              onClick={cancelProcessing}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={downloadAllCombined}
            disabled={!hasDone}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Descargar todo combinado
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={isProcessing || items.length === 0}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Limpiar
          </button>
        </div>

        <section className="flex flex-col gap-3">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              Todavía no hay archivos. Seleccioná algunos arriba.
            </p>
          ) : (
            items.map((item) => {
              const badge = STATUS_BADGE[item.status];
              return (
                <article
                  key={item.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${badge.cls}`}>
                          <span aria-hidden>{badge.emoji}</span> {badge.label}
                        </span>
                      </div>
                      <div
                        className="mt-1 truncate text-sm text-zinc-900 dark:text-zinc-100"
                        title={item.file.name}
                      >
                        {item.file.name}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500">
                        {formatBytes(item.file.size)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {item.status === "done" && (
                        <button
                          type="button"
                          onClick={() => downloadOne(item)}
                          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                        >
                          Descargar .txt
                        </button>
                      )}
                      {!isProcessing && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-md border border-transparent px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>

                  {item.status === "done" && item.transcription && (
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                      {item.transcription}
                    </pre>
                  )}

                  {item.status === "error" && item.error && (
                    <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                      {item.error}
                    </p>
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

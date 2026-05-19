"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  IconButton,
  MicIcon,
  Spinner,
  UploadIcon,
  XIcon,
} from "@/components/icons";
import { useTranscriber, type FileItem, type FileStatus } from "@/hooks/use-transcriber";
import { formatBytes } from "@/lib/format";
import {
  ACCEPT_ATTR,
  MAX_BYTES_LABEL,
  MODELS,
  type Model,
} from "@/lib/whisper";

const MODEL_HINTS: Record<Model, string> = {
  tiny: "más rápido, menos preciso",
  base: "balance recomendado",
  small: "más preciso, más lento",
};

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

export default function Home() {
  const {
    model,
    setModel,
    items,
    counts,
    isProcessing,
    addFiles,
    removeItem,
    clearAll,
    cancel,
    transcribeAll,
    downloadOne,
    downloadAllCombined,
  } = useTranscriber();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copiedId) return;
    const t = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(t);
  }, [copiedId]);

  async function copyOne(item: FileItem) {
    if (!item.transcription) return;
    try {
      await navigator.clipboard.writeText(item.transcription);
      setCopiedId(item.id);
    } catch {
      // clipboard may be unavailable; silently ignore
    }
  }

  function handleClearAll() {
    clearAll();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const hasPending = counts.pending > 0;
  const hasDone = counts.done > 0;

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Header />

        <ModelSelector
          model={model}
          onChange={setModel}
          disabled={isProcessing}
        />

        <UploadZone
          inputRef={fileInputRef}
          disabled={isProcessing}
          onFiles={addFiles}
        />

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
                    {counts.pending}
                  </span>
                )}
              </>
            )}
          </button>

          {isProcessing && (
            <button
              type="button"
              onClick={cancel}
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
              onClick={handleClearAll}
              disabled={isProcessing || items.length === 0}
              className="text-sm text-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-500 dark:hover:text-zinc-100"
            >
              Limpiar
            </button>
          </div>
        </div>

        {items.length > 0 && (
          <FilesSummary total={items.length} counts={counts} />
        )}

        <section className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
              Todavía no hay archivos.
            </p>
          ) : (
            items.map((item) => (
              <FileCard
                key={item.id}
                item={item}
                isProcessing={isProcessing}
                copied={copiedId === item.id}
                onCopy={() => copyOne(item)}
                onDownload={() => downloadOne(item)}
                onRemove={() => removeItem(item.id)}
              />
            ))
          )}
        </section>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="mb-12">
      <div className="flex items-center gap-2">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800">
          <MicIcon />
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
  );
}

function ModelSelector({
  model,
  onChange,
  disabled,
}: {
  model: Model;
  onChange: (m: Model) => void;
  disabled: boolean;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
          Modelo
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          {MODEL_HINTS[model]}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label="Modelo de Whisper"
        className="inline-flex w-full rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {MODELS.map((value) => {
          const selected = model === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(value)}
              disabled={disabled}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function UploadZone({
  inputRef,
  disabled,
  onFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onFiles: (list: FileList | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function onClick() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function onDragOver(e: React.DragEvent) {
    if (disabled) return;
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
    if (disabled) return;
    onFiles(e.dataTransfer.files);
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
        Archivos
      </h2>
      <button
        type="button"
        onClick={onClick}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        disabled={disabled}
        className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isDragging
            ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
            : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
        }`}
      >
        <UploadIcon />
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Arrastrá audios aquí o hacé clic para seleccionar
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          .ogg · .mp3 · .m4a · .wav · .webm · hasta {MAX_BYTES_LABEL}
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
        disabled={disabled}
        className="sr-only"
      />
    </section>
  );
}

function FilesSummary({
  total,
  counts,
}: {
  total: number;
  counts: Record<FileStatus, number>;
}) {
  return (
    <div className="mb-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
      <span>
        {total} archivo{total === 1 ? "" : "s"}
      </span>
      <span aria-hidden>·</span>
      <span>
        {counts.done} listo{counts.done === 1 ? "" : "s"}
      </span>
      {counts.processing > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-blue-600 dark:text-blue-400">
            {counts.processing} procesando
          </span>
        </>
      )}
      {counts.error > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="text-rose-600 dark:text-rose-400">
            {counts.error} con error
          </span>
        </>
      )}
    </div>
  );
}

function FileCard({
  item,
  isProcessing,
  copied,
  onCopy,
  onDownload,
  onRemove,
}: {
  item: FileItem;
  isProcessing: boolean;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const meta = STATUS_META[item.status];

  return (
    <article className="rounded-lg border border-zinc-200 bg-white transition-colors dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${meta.dot} ${
              item.status === "processing" ? "animate-ping opacity-75" : ""
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
                label={copied ? "Copiado" : "Copiar texto"}
                onClick={onCopy}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
              <IconButton label="Descargar .txt" onClick={onDownload}>
                <DownloadIcon />
              </IconButton>
            </>
          )}
          {!isProcessing && (
            <IconButton label="Quitar" onClick={onRemove}>
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
}

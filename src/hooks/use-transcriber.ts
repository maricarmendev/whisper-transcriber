"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Model } from "@/lib/whisper";
import { downloadText, stripExt } from "@/lib/format";

export type FileStatus = "pending" | "processing" | "done" | "error";

export type FileItem = {
  id: string;
  file: File;
  status: FileStatus;
  transcription?: string;
  error?: string;
};

type TranscribeResponse = { transcription?: string; error?: string };

type Counts = Record<FileStatus, number>;
const ZERO_COUNTS: Counts = { pending: 0, processing: 0, done: 0, error: 0 };

export function useTranscriber(initialModel: Model = "base") {
  const [model, setModel] = useState<Model>(initialModel);
  const [items, setItems] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const counts = useMemo<Counts>(
    () =>
      items.reduce<Counts>(
        (acc, it) => ({ ...acc, [it.status]: acc[it.status] + 1 }),
        ZERO_COUNTS,
      ),
    [items],
  );

  const patchItem = useCallback((id: string, patch: Partial<FileItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: FileItem[] = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
    }));
    setItems((prev) => [...prev, ...next]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const transcribeAll = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    // Snapshot pending items at start; new uploads during this run wait for the
    // next invocation.
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
        const data = (await res.json()) as TranscribeResponse;
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
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
  }, [isProcessing, items, model, patchItem]);

  const downloadOne = useCallback((item: FileItem) => {
    if (!item.transcription) return;
    downloadText(`${stripExt(item.file.name)}.txt`, item.transcription);
  }, []);

  const downloadAllCombined = useCallback(() => {
    const done = items.filter((it) => it.status === "done" && it.transcription);
    if (done.length === 0) return;
    const combined = done
      .map((it) => `===== ${it.file.name} =====\n${it.transcription}`)
      .join("\n\n");
    downloadText("transcripciones.txt", combined);
  }, [items]);

  return {
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
  };
}

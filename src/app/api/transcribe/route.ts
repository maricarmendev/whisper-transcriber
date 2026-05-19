import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nodewhisper } from "nodejs-whisper";
import { MAX_BYTES, MAX_BYTES_LABEL, isModel } from "@/lib/whisper";

export const runtime = "nodejs";
export const maxDuration = 300;

async function safeUnlink(p: string) {
  try {
    await fs.unlink(p);
  } catch {
    // file may not exist
  }
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const model = formData.get("model");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing 'file'" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `File too large (max ${MAX_BYTES_LABEL})` },
      { status: 413 },
    );
  }
  if (!isModel(model)) {
    return Response.json({ error: "Invalid 'model'" }, { status: 400 });
  }

  const tmpDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  const ext = path.extname(file.name) || ".bin";
  const uuid = randomUUID();
  const audioPath = path.join(tmpDir, `${uuid}${ext}`);
  const wavPath = path.join(tmpDir, `${uuid}.wav`);

  // nodejs-whisper doesn't return the output path; whisper-cli with `-otxt`
  // writes to `${input}.txt`, where input is either the converted wav or the
  // original audio. Probe the known patterns in order of likelihood.
  const candidateTxtPaths = [
    `${wavPath}.txt`,
    path.join(tmpDir, `${uuid}.txt`),
    `${audioPath}.txt`,
  ];

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(audioPath, buffer);

    await nodewhisper(audioPath, {
      modelName: model,
      autoDownloadModelName: model,
      whisperOptions: {
        outputInText: true,
        language: "es",
      },
    });

    let transcription: string | null = null;
    for (const candidate of candidateTxtPaths) {
      try {
        transcription = await fs.readFile(candidate, "utf8");
        break;
      } catch {
        // try next
      }
    }

    if (transcription === null) {
      return Response.json(
        { error: "Transcription file not found after running whisper" },
        { status: 500 },
      );
    }

    return Response.json({ transcription: transcription.trim() });
  } catch (err) {
    console.error("[transcribe] failed:", err);
    return Response.json(
      { error: "Internal transcription error" },
      { status: 500 },
    );
  } finally {
    await Promise.all([
      safeUnlink(audioPath),
      safeUnlink(wavPath),
      ...candidateTxtPaths.map(safeUnlink),
    ]);
  }
}

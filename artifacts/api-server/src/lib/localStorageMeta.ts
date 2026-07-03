import { promises as fs } from "fs";
import path from "path";

export interface LocalObjectAcl {
  owner: string;
  visibility: "public" | "private";
}

export interface LocalObjectMeta {
  contentType?: string;
  acl?: LocalObjectAcl;
}

function metaPath(absolutePath: string): string {
  return `${absolutePath}.meta.json`;
}

export async function readLocalObjectMeta(absolutePath: string): Promise<LocalObjectMeta> {
  try {
    const raw = await fs.readFile(metaPath(absolutePath), "utf-8");
    return JSON.parse(raw) as LocalObjectMeta;
  } catch {
    return {};
  }
}

export async function writeLocalObjectMeta(
  absolutePath: string,
  meta: LocalObjectMeta,
): Promise<void> {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(metaPath(absolutePath), JSON.stringify(meta), "utf-8");
}

export async function deleteLocalObjectMeta(absolutePath: string): Promise<void> {
  await fs.rm(metaPath(absolutePath), { force: true });
}

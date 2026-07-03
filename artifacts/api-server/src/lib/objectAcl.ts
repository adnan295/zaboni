import { File } from "@google-cloud/storage";
import { readLocalObjectMeta, writeLocalObjectMeta } from "./localStorageMeta";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

/**
 * A handle to a stored object that abstracts over the two supported backends:
 * - "gcs": a Google Cloud Storage `File` (Replit Object Storage sidecar, or a real GCS bucket)
 * - "local": a file on the VPS's local disk, with a sidecar `.meta.json` for ACL/content-type
 */
export type StorageObjectHandle =
  | { kind: "gcs"; file: File }
  | { kind: "local"; absolutePath: string; relativePath: string };

export async function setObjectAclPolicy(
  handle: StorageObjectHandle,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  if (handle.kind === "local") {
    const meta = await readLocalObjectMeta(handle.absolutePath);
    meta.acl = aclPolicy;
    await writeLocalObjectMeta(handle.absolutePath, meta);
    return;
  }

  const [exists] = await handle.file.exists();
  if (!exists) {
    throw new Error(`Object not found: ${handle.file.name}`);
  }

  await handle.file.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy),
    },
  });
}

export async function getObjectAclPolicy(
  handle: StorageObjectHandle,
): Promise<ObjectAclPolicy | null> {
  if (handle.kind === "local") {
    const meta = await readLocalObjectMeta(handle.absolutePath);
    return meta.acl ?? null;
  }

  const [metadata] = await handle.file.getMetadata();
  const raw = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!raw) return null;
  return JSON.parse(raw as string);
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: StorageObjectHandle;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const policy = await getObjectAclPolicy(objectFile);
  if (!policy) return false;

  if (policy.visibility === "public" && requestedPermission === ObjectPermission.READ) {
    return true;
  }

  return !!userId && policy.owner === userId;
}

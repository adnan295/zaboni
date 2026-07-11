import { customFetch } from "@workspace/api-client-react";

type UploadUrlResponse = { uploadURL: string; objectPath: string };

function contentTypeFor(filename: string): string {
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : "jpg";
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/**
 * Upload a local image (e.g. from expo-image-picker) to object storage and
 * return its objectPath.
 *
 * Reads the file as a Blob and PUTs it to the presigned/relative upload URL.
 * Kept dependency-free (no native modules) so it can never affect app startup.
 */
export async function uploadImageToStorage(
  localUri: string,
  fallbackName = "upload.jpg",
): Promise<string> {
  const filename = localUri.split("/").pop() ?? fallbackName;
  const contentType = contentTypeFor(filename);

  const blob = await (await fetch(localUri)).blob();
  const size = blob.size > 0 ? blob.size : 1;

  const { uploadURL, objectPath } = await customFetch<UploadUrlResponse>(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filename, size, contentType }),
    },
  );

  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!res.ok) throw new Error("فشل رفع الصورة");
  return objectPath;
}

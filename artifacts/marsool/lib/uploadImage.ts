import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { customFetch } from "@workspace/api-client-react";

type UploadUrlResponse = { uploadURL: string; objectPath: string };

function contentTypeFor(filename: string): string {
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : "jpg";
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

async function requestUploadUrl(
  name: string,
  size: number,
  contentType: string,
): Promise<UploadUrlResponse> {
  return customFetch<UploadUrlResponse>("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, size, contentType }),
  });
}

/**
 * Upload a local image (e.g. from expo-image-picker) to object storage and
 * return its objectPath.
 *
 * On native we stream the file with expo-file-system's `uploadAsync`
 * (BINARY_CONTENT). The previous `fetch(uri).blob()` + PUT approach is
 * unreliable on Android — the file-backed Blob often serializes to an empty
 * request body, so the receipt/avatar upload silently fails. `uploadAsync`
 * reads the file natively and sets Content-Length correctly on both platforms.
 *
 * On web there is no native file layer, so we keep the blob approach (which
 * works there).
 */
export async function uploadImageToStorage(
  localUri: string,
  fallbackName = "upload.jpg",
): Promise<string> {
  const filename = localUri.split("/").pop() ?? fallbackName;
  const contentType = contentTypeFor(filename);

  if (Platform.OS === "web") {
    const blob = await (await fetch(localUri)).blob();
    const size = blob.size > 0 ? blob.size : 1;
    const { uploadURL, objectPath } = await requestUploadUrl(filename, size, contentType);
    const res = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!res.ok) throw new Error("فشل رفع الصورة");
    return objectPath;
  }

  // Size is only advisory metadata for the presign request; the server
  // validates the real bytes on access. Fall back to 1 if it can't be read.
  let size = 1;
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists && typeof info.size === "number" && info.size > 0) {
      size = info.size;
    }
  } catch {
    // ignore — keep advisory size of 1
  }

  const { uploadURL, objectPath } = await requestUploadUrl(filename, size, contentType);

  const result = await FileSystem.uploadAsync(uploadURL, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error("فشل رفع الصورة");
  }
  return objectPath;
}

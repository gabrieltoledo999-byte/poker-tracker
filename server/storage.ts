import { createHash } from "node:crypto";

import { ENV } from "./_core/env";

type StorageConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function getStorageConfig(): StorageConfig {
  const cloudName = ENV.cloudinaryCloudName.trim();
  const apiKey = ENV.cloudinaryApiKey.trim();
  const apiSecret = ENV.cloudinaryApiSecret.trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary não configurado: defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET."
    );
  }

  return { cloudName, apiKey, apiSecret };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function normalizePublicId(relKey: string): string {
  return normalizeKey(relKey).replace(/\.[^.]+$/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function buildCloudinaryUploadUrl(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
}

function buildCloudinaryAssetUrl(cloudName: string, publicId: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { cloudName, apiKey, apiSecret } = getStorageConfig();
  const key = normalizeKey(relKey);
  const publicId = normalizePublicId(key);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sha1(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);
  const uploadUrl = buildCloudinaryUploadUrl(cloudName);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("public_id", publicId);
  formData.append("signature", signature);
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const payload = await response.json();
  const url = payload.secure_url || payload.url;
  if (!url) {
    throw new Error("Cloudinary não retornou a URL da imagem enviada.");
  }
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const key = normalizeKey(relKey);
  const { cloudName } = getStorageConfig();
  return {
    key,
    url: buildCloudinaryAssetUrl(cloudName, normalizePublicId(key)),
  };
}

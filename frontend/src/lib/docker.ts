/** Limits of Docker image jobs; the backend checks the same ones. */
export const DOCKER_LIMITS = {
  /** Largest .tar that can be uploaded: 2 GB. */
  maxArchiveBytes: 2 * 1024 ** 3,
  maxImageLength: 255,
  maxCommandLength: 1000,
} as const;

/**
 * Image references as Docker writes them:
 * [registry[:port]/]name[/more/names][:tag][@sha256:digest]
 * e.g. "ubuntu:24.04", "nvidia/cuda:12.4.1-base-ubuntu22.04", "ghcr.io/user/app:1.0".
 */
const IMAGE_REFERENCE =
  /^(?:[a-z0-9.-]+(?::\d+)?\/)?[a-z0-9]+(?:[._-]+[a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-]+[a-z0-9]+)*)*(?::[\w][\w.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;

export function isValidImageReference(reference: string): boolean {
  const value = reference.trim();
  return (
    value.length > 0 && value.length <= DOCKER_LIMITS.maxImageLength && IMAGE_REFERENCE.test(value)
  );
}

/** Checks a file chosen to upload; returns the problem to show, or null if it is fine. */
export function checkArchive(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith('.tar')) {
    return 'Upload the .tar created with "docker save -o image.tar image:tag"';
  }
  if (file.size === 0) return 'The file is empty';
  if (file.size > DOCKER_LIMITS.maxArchiveBytes) {
    return `The image is too big (maximum ${formatBytes(DOCKER_LIMITS.maxArchiveBytes)})`;
  }
  return null;
}

/** 1536 → "1.5 KB", 734003200 → "700 MB". */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : Number(value.toFixed(1))} ${units[unit]}`;
}

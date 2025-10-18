import type { ImageAttachment } from "@/components/ImageAttachments";

/**
 * Generates a unique ID for an image attachment
 */
export function generateImageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Detects MIME type from file extension as fallback
 */
function getMimeTypeFromExtension(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
  };
  return mimeTypes[ext || ""] || "image/png";
}

/**
 * Converts a File to an ImageAttachment with a base64 data URL
 */
export async function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  // Use file.type if available, otherwise infer from extension
  const mediaType = file.type || getMimeTypeFromExtension(file.name);

  return {
    id: generateImageId(),
    url: dataUrl,
    mediaType,
  };
}

/**
 * Extracts image files from clipboard items
 */
export function extractImagesFromClipboard(items: DataTransferItemList): File[] {
  const imageFiles: File[] = [];

  for (const item of Array.from(items)) {
    if (item?.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        imageFiles.push(file);
      }
    }
  }

  return imageFiles;
}

/**
 * Extracts image files from drag and drop DataTransfer
 */
export function extractImagesFromDrop(dataTransfer: DataTransfer): File[] {
  const imageFiles: File[] = [];

  for (const file of Array.from(dataTransfer.files)) {
    if (file.type.startsWith("image/")) {
      imageFiles.push(file);
    }
  }

  return imageFiles;
}

/**
 * Processes multiple image files and converts them to attachments
 */
export async function processImageFiles(files: File[]): Promise<ImageAttachment[]> {
  return await Promise.all(files.map(fileToImageAttachment));
}

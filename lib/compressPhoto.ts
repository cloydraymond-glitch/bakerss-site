const DEFAULT_MAX_DIMENSION = 1920;
const DEFAULT_QUALITY = 0.78;

/**
 * Resize a camera photo before upload so mobile browsers do not keep a
 * full-resolution image in memory/network buffers longer than necessary.
 * The returned file is JPEG unless the source could not be decoded.
 */
export async function compressPhotoForUpload(
  file: File,
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_QUALITY,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);

    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const largestSide = Math.max(originalWidth, originalHeight);
    const scale = largestSide > maxDimension ? maxDimension / largestSide : 1;
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    // Release the backing canvas as soon as the encoded Blob exists.
    canvas.width = 1;
    canvas.height = 1;

    if (!blob) return file;

    // If compression somehow makes a small source larger, keep the source.
    if (scale === 1 && blob.size >= file.size) return file;

    const originalBaseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${originalBaseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Photo compression failed; uploading original file.", error);
    return file;
  } finally {
    bitmap?.close();
  }
}

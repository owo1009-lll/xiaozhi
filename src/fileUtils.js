export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImageFileToDataUrl(file, { maxWidth = 1280, maxHeight = 1280, quality = 0.82 } = {}) {
  const originalDataUrl = await fileToDataUrl(file);
  if (typeof document === "undefined") {
    return originalDataUrl;
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const targetWidth = Math.max(1, Math.round(image.width * scale));
      const targetHeight = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(originalDataUrl);
        return;
      }
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(originalDataUrl);
      }
    };
    image.onerror = () => resolve(originalDataUrl);
    image.src = originalDataUrl;
  });
}

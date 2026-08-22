import SparkMD5 from 'spark-md5';
export async function md5Hash(file: File): Promise<string> {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB
    const spark = new SparkMD5.ArrayBuffer();
    let offset = 0

    while (offset < file.size) {
        const chunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
        spark.append(chunk);
        offset += CHUNK_SIZE;
    }

    return spark.end();
}
function getImageMetadata(file: File): Promise<{width: number, height: number}> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
  
      const cleanup = () => URL.revokeObjectURL(objectUrl);
  
      image.onload = () => {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        cleanup();
  
        if (width <= 0 || height <= 0) {
          reject(new Error("Could not read image dimensions."));
          return;
        }
  
        resolve({ width, height });
      };
  
      image.onerror = () => {
        cleanup();
        reject(new Error("Could not read image dimensions."));
      };
  
      image.src = objectUrl;
    });
  }
  
  function getVideoMetadata(file: File): Promise<{width: number, height: number, length: number}> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
  
      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(objectUrl);
      };
  
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        const length = video.duration;
        cleanup();
  
        if (
          width <= 0 ||
          height <= 0 ||
          !Number.isFinite(length) ||
          length <= 0
        ) {
          reject(new Error("Could not read video metadata."));
          return;
        }
  
        resolve({ width, height, length });
      };
  
      video.onerror = () => {
        cleanup();
        reject(new Error("Could not read video metadata."));
      };
  
      video.src = objectUrl;
    });
}

export type PresignFileInput = {
    filename: string;
    mime: string;
    byte_size: number;
    checksum: string;
    metadata: {
        width: number;
        height: number;
        duration?: number;
    }
}

export async function getFileMetadata(file: File): Promise<PresignFileInput> {
    const kind = file.type.split('/')[0];
    if (kind !== 'image' && kind !== 'video') {
        throw new Error('Only videos and images are supported');
    }

    const checksum = await md5Hash(file);
    let metadata = null;
    if (kind === 'image') {
        metadata = await getImageMetadata(file);
    } else if (kind === 'video') {
        metadata = await getVideoMetadata(file);
    } else {
        throw new Error('Invalid file type');
    }
    return {
        filename: file.name, 
        mime: file.type,
        byte_size: file.size,
        checksum,
        metadata: metadata as {width: number, height: number, duration?: number},
    }
}
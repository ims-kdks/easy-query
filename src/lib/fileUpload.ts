import {
  isFileSystemAccessSupported,
  storeFileHandle,
} from "$lib/fileHandleStore";

export const SUPPORTED_DATA_FILE_EXTENSIONS = [
  ".csv",
  ".tsv",
  ".parquet",
  ".json",
  ".jsonl",
];

export const SUPPORTED_DATA_FILE_ACCEPT =
  SUPPORTED_DATA_FILE_EXTENSIONS.join(",");

const supportedDataFileExtensionSet = new Set<string>(
  SUPPORTED_DATA_FILE_EXTENSIONS,
);

type DataTransferItemWithFileSystemHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

export function isSupportedDataFileName(fileName: string): boolean {
  const extension = `.${fileName.split(".").pop()?.toLowerCase() ?? ""}`;
  return supportedDataFileExtensionSet.has(extension);
}

export function isFileDragEvent(event: DragEvent): boolean {
  const dataTypes = event.dataTransfer?.types;
  if (!dataTypes) return false;

  return Array.from(dataTypes).includes("Files");
}

export function partitionSupportedDataFiles(files: File[]): {
  supportedFiles: File[];
  skippedCount: number;
} {
  const supportedFiles = files.filter((file) =>
    isSupportedDataFileName(file.name),
  );

  return {
    supportedFiles,
    skippedCount: files.length - supportedFiles.length,
  };
}

export async function storeDroppedFileHandles(
  dataTransfer: DataTransfer | null,
): Promise<void> {
  if (!dataTransfer || !isFileSystemAccessSupported()) {
    return;
  }

  const items = Array.from(dataTransfer.items ?? []);
  if (items.length === 0) {
    return;
  }

  // `getAsFileSystemHandle` is Chromium-only for drag-and-drop items.
  const hasHandleSupport = items.some(
    (item) =>
      typeof (item as DataTransferItemWithFileSystemHandle)
        .getAsFileSystemHandle === "function",
  );
  if (!hasHandleSupport) {
    return;
  }

  for (const item of items) {
    if (item.kind !== "file") {
      continue;
    }

    const getAsFileSystemHandle = (item as DataTransferItemWithFileSystemHandle)
      .getAsFileSystemHandle;
    if (typeof getAsFileSystemHandle !== "function") {
      continue;
    }

    try {
      const handle = await getAsFileSystemHandle.call(item);
      if (!handle || handle.kind !== "file") {
        continue;
      }
      if (!isSupportedDataFileName(handle.name)) {
        continue;
      }

      await storeFileHandle(handle as FileSystemFileHandle);
    } catch (error) {
      console.warn("Failed to store dropped file handle:", error);
    }
  }
}

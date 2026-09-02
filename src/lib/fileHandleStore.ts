/**
 * IndexedDB-based storage for FileSystemFileHandle objects.
 * Allows restoring previously opened files across browser sessions.
 *
 * Note: Only works in Chromium browsers (Chrome, Edge, Opera).
 * Firefox and Safari do not support the File System Access API.
 */

// Type declarations for File System Access API (not in standard TypeScript DOM types)
declare global {
  interface FileSystemFileHandle {
    queryPermission(options: {
      mode: "read" | "readwrite";
    }): Promise<PermissionState>;
    requestPermission(options: {
      mode: "read" | "readwrite";
    }): Promise<PermissionState>;
    isSameEntry?(other: FileSystemFileHandle): Promise<boolean>;
  }

  interface Window {
    showOpenFilePicker(options?: {
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle[]>;
  }
}

const DB_NAME = "csv-studio-file-handles";
const DB_VERSION = 1;
const STORE_NAME = "fileHandles";

interface StoredFileHandle {
  id: string;
  handle: FileSystemFileHandle;
  fileName: string;
  storedAt: number;
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return "showOpenFilePicker" in window;
}

/**
 * Open the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

async function isSameHandle(
  left: FileSystemFileHandle,
  right: FileSystemFileHandle,
): Promise<boolean> {
  if (typeof left.isSameEntry !== "function") {
    return false;
  }

  try {
    return await left.isSameEntry(right);
  } catch {
    return false;
  }
}

async function findMatchingHandleIds(
  handle: FileSystemFileHandle,
): Promise<string[]> {
  const storedHandles = await getStoredFileHandles();
  const matchingIds: string[] = [];

  for (const entry of storedHandles) {
    if (await isSameHandle(entry.handle, handle)) {
      matchingIds.push(entry.id);
    }
  }

  return matchingIds;
}

/**
 * Store a file handle in IndexedDB
 */
export async function storeFileHandle(
  handle: FileSystemFileHandle,
): Promise<string> {
  const matchingIds = await findMatchingHandleIds(handle);
  const id = matchingIds[0] ?? `file_${Date.now()}_${handle.name}`;

  // Keep only one record per handle.
  for (const duplicateId of matchingIds.slice(1)) {
    await removeFileHandle(duplicateId);
  }

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const entry: StoredFileHandle = {
      id,
      handle,
      fileName: handle.name,
      storedAt: Date.now(),
    };

    const request = store.put(entry);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(id);

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Get all stored file handles
 */
export async function getStoredFileHandles(): Promise<StoredFileHandle[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Remove a file handle from storage
 */
export async function removeFileHandle(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    transaction.oncomplete = () => db.close();
  });
}

/**
 * Remove a file handle by file name
 */
export async function removeFileHandleByName(fileName: string): Promise<void> {
  const handles = await getStoredFileHandles();
  const matching = handles.filter((h) => h.fileName === fileName);

  for (const entry of matching) {
    await removeFileHandle(entry.id);
  }
}

/**
 * Get file from handle if permission is already granted.
 * Does NOT request permission (requires user activation).
 * Use this for auto-restore on page load.
 */
export async function getFileFromHandleIfGranted(
  handle: FileSystemFileHandle,
): Promise<File | null> {
  try {
    const permission = await handle.queryPermission({ mode: "read" });

    if (permission === "granted") {
      return await handle.getFile();
    }

    // Permission not granted - return null (don't request, requires user gesture)
    return null;
  } catch (error) {
    console.error("Error getting file from handle:", error);
    return null;
  }
}

/**
 * Request permission for a stored file handle and get the File object.
 * MUST be called from a user gesture (click handler, etc.)
 */
export async function getFileFromHandleWithPermission(
  handle: FileSystemFileHandle,
): Promise<File | null> {
  try {
    // Check current permission state
    const permission = await handle.queryPermission({ mode: "read" });

    if (permission === "granted") {
      return await handle.getFile();
    }

    // Request permission (requires user activation)
    const newPermission = await handle.requestPermission({ mode: "read" });

    if (newPermission === "granted") {
      return await handle.getFile();
    }

    return null;
  } catch (error) {
    console.error("Error getting file from handle:", error);
    return null;
  }
}

/**
 * Get stored file handles that need permission re-granting.
 * Returns handles where permission is not yet granted.
 */
export async function getPendingFileHandles(): Promise<StoredFileHandle[]> {
  const handles = await getStoredFileHandles();
  const pending: StoredFileHandle[] = [];

  for (const entry of handles) {
    try {
      const permission = await entry.handle.queryPermission({ mode: "read" });
      if (permission !== "granted") {
        pending.push(entry);
      }
    } catch {
      // Handle is invalid, skip it
    }
  }

  return pending;
}

/**
 * Open file picker using File System Access API
 * Returns file handles that can be stored for later use
 */
export async function openFilePicker(): Promise<
  { file: File; handle: FileSystemFileHandle }[]
> {
  if (!isFileSystemAccessSupported()) {
    return [];
  }

  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      types: [
        {
          description: "Data files",
          accept: {
            "text/csv": [".csv"],
            "text/tab-separated-values": [".tsv"],
            "application/vnd.apache.parquet": [".parquet"],
            "application/json": [".json", ".jsonl"],
            "application/x-ndjson": [".jsonl"],
          },
        },
      ],
    });

    const results: { file: File; handle: FileSystemFileHandle }[] = [];

    for (const handle of handles) {
      const file = await handle.getFile();
      results.push({ file, handle });
    }

    return results;
  } catch (error) {
    // User cancelled the picker
    if (error instanceof Error && error.name === "AbortError") {
      return [];
    }
    throw error;
  }
}

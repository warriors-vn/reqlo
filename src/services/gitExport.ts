import { db, type Collection, type Folder } from "@/services/db";
import { sanitizeRequestForExport } from "@/services/portability";
import { buildZip } from "@/services/zip";

export interface GitExportFile {
  path: string;
  content: string;
}

// Ambient File System Access API surface — TypeScript's bundled dom lib ships
// FileSystemDirectoryHandle but not the `showDirectoryPicker` entry point yet.
interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

function dedupe(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export async function buildCollectionFileTree(collection: Collection): Promise<GitExportFile[]> {
  const [folders, rawRequests] = await Promise.all([
    db.folders.where("collectionId").equals(collection.id).toArray(),
    db.requests.where("collectionId").equals(collection.id).toArray(),
  ]);
  folders.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  rawRequests.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const requests = await Promise.all(rawRequests.map(sanitizeRequestForExport));

  const files: GitExportFile[] = [
    {
      path: "_collection.json",
      content:
        JSON.stringify(
          {
            id: collection.id,
            name: collection.name,
            position: collection.position,
            createdAt: collection.createdAt,
          },
          null,
          2,
        ) + "\n",
    },
  ];

  const childrenByParent = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const list = childrenByParent.get(folder.parentFolderId) ?? [];
    list.push(folder);
    childrenByParent.set(folder.parentFolderId, list);
  }

  const dirPathById = new Map<string, string>();

  function assignDirs(parentId: string | null, parentPath: string) {
    const used = new Set<string>();
    const kids = (childrenByParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    for (const folder of kids) {
      const name = dedupe(slugify(folder.name), used);
      used.add(name);
      const dirPath = parentPath ? `${parentPath}/${name}` : name;
      dirPathById.set(folder.id, dirPath);
      files.push({
        path: `${dirPath}/_folder.json`,
        content:
          JSON.stringify(
            {
              id: folder.id,
              name: folder.name,
              position: folder.position,
              createdAt: folder.createdAt,
            },
            null,
            2,
          ) + "\n",
      });
      assignDirs(folder.id, dirPath);
    }
  }
  assignDirs(null, "");

  const usedNamesByDir = new Map<string, Set<string>>();
  for (const request of requests) {
    const dirPath = request.folderId ? (dirPathById.get(request.folderId) ?? "") : "";
    const used = usedNamesByDir.get(dirPath) ?? new Set<string>();
    usedNamesByDir.set(dirPath, used);
    const name = dedupe(slugify(request.name || "untitled"), used);
    used.add(name);
    const filePath = dirPath ? `${dirPath}/${name}.json` : `${name}.json`;
    files.push({ path: filePath, content: JSON.stringify(request, null, 2) + "\n" });
  }

  return files;
}

export function supportsDirectoryExport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function"
  );
}

/** Returns true if files were written, false if the user cancelled the picker (caller should fall back to ZIP). */
export async function writeFilesToDirectory(files: GitExportFile[]): Promise<boolean> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return false;

  let root: FileSystemDirectoryHandle;
  try {
    root = await picker({ mode: "readwrite" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    throw error;
  }

  for (const file of files) {
    const segments = file.path.split("/");
    const fileName = segments.pop()!;
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file.content);
    await writable.close();
  }
  return true;
}

export function downloadZip(files: GitExportFile[], zipName: string, rootDirName: string) {
  const prefixed = files.map((file) => ({ ...file, path: `${rootDirName}/${file.path}` }));
  const blob = buildZip(prefixed);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

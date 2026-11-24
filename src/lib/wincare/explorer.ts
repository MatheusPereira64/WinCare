/**
 * Ponte do explorador de armazenamento (mapa do disco, busca, duplicados,
 * fotos parecidas, arquivos esquecidos, análises salvas e exportação).
 *
 * No app desktop chama o processo principal (só ids e escolhas de lista); no
 * navegador usa dados simulados de explorerDemo.ts.
 */
import { getNative } from "./bridge";
import * as demo from "./explorerDemo";

export type FileCategory =
  | "all"
  | "video"
  | "image"
  | "audio"
  | "document"
  | "archive"
  | "installer"
  | "diskImage"
  | "other";

export interface DriveOption {
  letter: string;
  totalBytes: number;
  freeBytes: number;
}

export interface ScanStatus {
  ok: boolean;
  reason?: string;
  state: "idle" | "scanning" | "done" | "error" | "cancelled";
  kind?: "drive" | "folder";
  root?: string;
  label?: string;
  startedAt?: number;
  finishedAt?: number;
  progress?: { files: number; dirs: number; bytes: number; current: string };
  error?: string | null;
  drives: DriveOption[];
  rootId?: string;
  totalBytes?: number;
  fileCount?: number;
  dirCount?: number;
  skipped?: number;
  truncated?: boolean;
}

export interface TreeChild {
  id: string;
  kind: "dir" | "file" | "rest";
  name: string;
  sizeBytes: number;
  fileCount?: number;
  modifiedAt?: number;
  category?: FileCategory;
}

export interface TreeLevel {
  ok: boolean;
  reason?: string;
  node: { id: string; name: string; path: string; sizeBytes: number; fileCount: number };
  breadcrumb: { id: string; name: string }[];
  children: TreeChild[];
}

export interface FoundFile {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
  category: FileCategory;
  deletable: boolean;
}

export interface FindFilters {
  category: FileCategory;
  size: "any" | "10mb" | "100mb" | "500mb" | "1gb" | "5gb";
  age: "any" | "30d" | "180d" | "1y" | "2y";
  sort: "size" | "oldest";
}

export interface FindResult {
  ok: boolean;
  reason?: string;
  total: number;
  totalBytes: number;
  items: FoundFile[];
}

export interface TrashResult {
  ok: boolean;
  reason?: string;
  removed: number;
  freedBytes: number;
  failed: { id: string; name: string; reason: string }[];
}

export interface DuplicateFile {
  id: string;
  name: string;
  path: string;
  modifiedAt: number;
}

export interface DuplicateGroup {
  id: string;
  sizeBytes: number;
  wastedBytes: number;
  files: DuplicateFile[];
}

export interface JobProgress {
  done: number;
  total: number;
  bytes?: number;
}

export interface DuplicatesState {
  ok?: boolean;
  reason?: string;
  state: "idle" | "running" | "done" | "error";
  progress?: JobProgress;
  error?: string;
  groups: DuplicateGroup[];
  wastedBytes?: number;
}

export interface SimilarPhoto {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
  thumbnail: string;
}

export interface PhotosState {
  ok?: boolean;
  reason?: string;
  state: "idle" | "running" | "done" | "error";
  progress?: JobProgress;
  error?: string;
  groups: { id: string; photos: SimilarPhoto[] }[];
}

export interface ForgottenItem {
  id: string;
  name: string;
  path: string;
  where: string;
  sizeBytes: number;
  modifiedAt: number;
  category: FileCategory;
}

export type ForgottenAge = "90d" | "180d" | "1y";

export interface ForgottenResult {
  ok: boolean;
  reason?: string;
  age: ForgottenAge;
  installers: ForgottenItem[];
  oldDownloads: ForgottenItem[];
  installersBytes: number;
  oldDownloadsBytes: number;
}

export interface SnapshotMeta {
  id: string;
  root: string;
  label: string;
  createdAt: number;
  totalBytes: number;
  fileCount: number;
}

export interface SnapshotDiffRow {
  path: string;
  before: number;
  after: number;
  delta: number;
}

export interface SnapshotComparison {
  ok: boolean;
  reason?: string;
  before: SnapshotMeta;
  after: SnapshotMeta;
  sameRoot: boolean;
  deltaBytes: number;
  grew: SnapshotDiffRow[];
  shrank: SnapshotDiffRow[];
}

export type ExportFormat = "xlsx" | "csv" | "pdf" | "html" | "txt";

export interface ExportColumn {
  key: string;
  label: string;
  type?: "text" | "number" | "bytes" | "date";
}

export interface ExportPayload {
  format: ExportFormat;
  title: string;
  fileName?: string;
  columns: ExportColumn[];
  rows: Record<string, string | number | null | undefined>[];
}

export interface ExplorerBridge {
  storageScanStart?: (options: {
    target: "drive" | "folder";
    drive?: string;
  }) => Promise<ScanStatus>;
  storageScanStatus?: () => Promise<ScanStatus>;
  storageScanCancel?: () => Promise<{ ok: boolean }>;
  storageChildren?: (id?: string) => Promise<TreeLevel>;
  storageFind?: (filters: FindFilters) => Promise<FindResult>;
  storageOwners?: (ids: string[]) => Promise<{ ok: boolean; owners: Record<string, string> }>;
  storageReveal?: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  storageTrash?: (ids: string[], source: string) => Promise<TrashResult>;
  storageDuplicatesStart?: (minSize: string) => Promise<DuplicatesState>;
  storageDuplicates?: () => Promise<DuplicatesState>;
  storagePhotosStart?: () => Promise<PhotosState>;
  storagePhotos?: () => Promise<PhotosState>;
  storageForgotten?: (age: ForgottenAge) => Promise<ForgottenResult>;
  storageSnapshots?: () => Promise<{ ok: boolean; items: SnapshotMeta[] }>;
  storageSnapshotSave?: () => Promise<{ ok: boolean; reason?: string; snapshot?: SnapshotMeta }>;
  storageSnapshotDelete?: (id: string) => Promise<{ ok: boolean; reason?: string }>;
  storageSnapshotCompare?: (a: string, b: string) => Promise<SnapshotComparison>;
  exportTable?: (
    payload: ExportPayload,
  ) => Promise<{ ok: boolean; reason?: string; path?: string }>;
}

const native = () => getNative() as (ReturnType<typeof getNative> & ExplorerBridge) | null;

export const scanStart = (options: { target: "drive" | "folder"; drive?: string }) =>
  native()?.storageScanStart?.(options) ?? demo.scanStart(options);
export const scanStatus = () => native()?.storageScanStatus?.() ?? demo.scanStatus();
export const scanCancel = () => native()?.storageScanCancel?.() ?? demo.scanCancel();
export const treeLevel = (id?: string) => native()?.storageChildren?.(id) ?? demo.treeLevel(id);
export const findFiles = (filters: FindFilters) =>
  native()?.storageFind?.(filters) ?? demo.findFiles(filters);
export const fileOwners = (ids: string[]) => native()?.storageOwners?.(ids) ?? demo.fileOwners(ids);
export const revealItem = (id: string) =>
  native()?.storageReveal?.(id) ?? Promise.resolve({ ok: true });
export const trashItems = (ids: string[], source: string) =>
  native()?.storageTrash?.(ids, source) ?? demo.trash(ids);
export const duplicatesStart = (minSize: string) =>
  native()?.storageDuplicatesStart?.(minSize) ?? demo.duplicatesStart();
export const duplicatesStatus = () => native()?.storageDuplicates?.() ?? demo.duplicatesStatus();
export const photosStart = () => native()?.storagePhotosStart?.() ?? demo.photosStart();
export const photosStatus = () => native()?.storagePhotos?.() ?? demo.photosStatus();
export const forgottenFiles = (age: ForgottenAge) =>
  native()?.storageForgotten?.(age) ?? demo.forgotten(age);
export const listSnapshots = () => native()?.storageSnapshots?.() ?? demo.listSnapshots();
export const saveSnapshot = () => native()?.storageSnapshotSave?.() ?? demo.saveSnapshot();
export const deleteSnapshot = (id: string) =>
  native()?.storageSnapshotDelete?.(id) ?? demo.deleteSnapshot(id);
export const compareSnapshots = (a: string, b: string) =>
  native()?.storageSnapshotCompare?.(a, b) ?? demo.compareSnapshots(a, b);

/** Exporta uma tabela. No navegador baixa um CSV (os outros formatos precisam do app). */
export async function exportTable(
  payload: ExportPayload,
): Promise<{ ok: boolean; reason?: string; path?: string }> {
  const bridge = native();
  if (bridge?.exportTable) return bridge.exportTable(payload);
  return demo.exportInBrowser(payload);
}

export const CATEGORY_LABEL: Record<FileCategory, string> = {
  all: "Tudo",
  video: "Vídeos",
  image: "Imagens",
  audio: "Músicas e áudio",
  document: "Documentos",
  archive: "Compactados",
  installer: "Instaladores",
  diskImage: "Imagens de disco",
  other: "Outros",
};

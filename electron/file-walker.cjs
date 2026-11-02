const fs = require("fs");
const path = require("path");

/* Pastas de cache e Temp chegam a centenas de milhares de arquivos. */
const STAT_BATCH = 128;

/** Percorre em lotes paralelos sem seguir symlinks ou junctions. */
async function forEachInBatches(items, visit) {
  for (let i = 0; i < items.length; i += STAT_BATCH) {
    await Promise.all(items.slice(i, i + STAT_BATCH).map(visit));
  }
}

const safeReaddir = (dir) => fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
const safeLstat = (target) => fs.promises.lstat(target).catch(() => null);

/** Mede arquivos/pastas e guarda os maiores como amostra. */
async function measurePaths(paths, { sampleLimit = 0 } = {}) {
  let sizeBytes = 0;
  let fileCount = 0;
  const samples = [];

  const addFile = (filePath, size) => {
    sizeBytes += size;
    fileCount += 1;
    if (!sampleLimit) return;
    samples.push({ path: filePath, sizeBytes: size });
    if (samples.length > sampleLimit * 4) {
      samples.sort((a, b) => b.sizeBytes - a.sizeBytes);
      samples.length = sampleLimit;
    }
  };

  const visitDir = async (dir) => {
    const entries = await safeReaddir(dir);
    const files = [];
    const dirs = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) dirs.push(full);
      else if (entry.isFile()) files.push(full);
    }
    await forEachInBatches(files, async (file) => {
      const stat = await safeLstat(file);
      if (stat) addFile(file, stat.size);
    });
    for (const child of dirs) await visitDir(child);
  };

  for (const target of paths) {
    const stat = await safeLstat(target);
    if (!stat || stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) await visitDir(target);
    else if (stat.isFile()) addFile(target, stat.size);
  }

  samples.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return { sizeBytes, fileCount, samples: samples.slice(0, sampleLimit) };
}

/**
 * Apaga o conteúdo dos caminhos: arquivos bloqueados são pulados e contados.
 * Pastas-alvo são mantidas; `olderThanMs` preserva arquivos recentes.
 */
async function removePaths(paths, { olderThanMs = 0, dryRun = false } = {}) {
  const cutoff = olderThanMs ? Date.now() - olderThanMs : 0;
  const totals = { freedBytes: 0, removed: 0, skipped: 0 };

  const removeFile = async (target) => {
    const stat = await safeLstat(target);
    if (!stat || stat.isSymbolicLink()) return;
    if (cutoff && stat.mtimeMs > cutoff) {
      totals.skipped += 1;
      return;
    }
    try {
      if (!dryRun) await fs.promises.unlink(target);
      totals.freedBytes += stat.size;
      totals.removed += 1;
    } catch {
      totals.skipped += 1;
    }
  };

  const clearDir = async (dir) => {
    const entries = await safeReaddir(dir);
    const files = [];
    const dirs = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) dirs.push(full);
      else if (entry.isFile()) files.push(full);
    }
    await forEachInBatches(files, removeFile);
    for (const child of dirs) {
      await clearDir(child);
      if (!dryRun) await fs.promises.rmdir(child).catch(() => {});
    }
  };

  for (const target of paths) {
    const stat = await safeLstat(target);
    if (!stat || stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) await clearDir(target);
    else await removeFile(target);
  }
  return totals;
}

module.exports = { measurePaths, removePaths };

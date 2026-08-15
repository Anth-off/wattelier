import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';

const MAGIC = Buffer.from('WTLRBKP1');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;
const MANIFEST_LIMIT = 1024 * 1024;
const ALLOWED_FILES = new Set(['elec.db', 'desktop-preferences.json']);
const SCRYPT_OPTIONS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

/** @typedef {{ name: string, size: number, sha256: string }} MigrationFile */
/** @typedef {{ format: string, schemaVersion: number, createdAt: string, appVersion: string, sourceMode: 'portable' | 'installed', files: MigrationFile[] }} MigrationManifest */

/** @param {string} passphrase */
function validatePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256) {
    throw new Error('Le mot de passe doit contenir entre 12 et 256 caractères.');
  }
}

/** @param {string} passphrase @param {Buffer} salt */
function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32, SCRYPT_OPTIONS);
}

/** @param {Date} now */
function timestamp(now) {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** @param {string} dataDirectory @param {Date} now */
function uniqueBackupPath(dataDirectory, now) {
  const base = `${dataDirectory}-before-import-${timestamp(now)}`;
  let candidate = base;
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** @param {string} filename */
async function hashFile(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

/** @param {import('node:fs/promises').FileHandle} handle @param {string} filename @param {number} position */
async function appendFile(handle, filename, position) {
  let offset = position;
  for await (const chunk of fs.createReadStream(filename)) {
    await handle.write(chunk, 0, chunk.length, offset);
    offset += chunk.length;
  }
  return offset;
}

/** @param {{ directory: string, manifest: MigrationManifest, destination: string }} options */
async function createPlainPayload({ directory, manifest, destination }) {
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (manifestBytes.length > MANIFEST_LIMIT)
    throw new Error('Manifest de sauvegarde trop volumineux.');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(manifestBytes.length);
  const handle = await fs.promises.open(destination, 'wx', 0o600);
  try {
    await handle.write(length, 0, length.length, 0);
    await handle.write(manifestBytes, 0, manifestBytes.length, length.length);
    let position = length.length + manifestBytes.length;
    for (const file of manifest.files) {
      position = await appendFile(handle, path.join(directory, file.name), position);
    }
  } finally {
    await handle.close();
  }
}

/** @param {{ source: string, destination: string, passphrase: string }} options */
async function encryptPayload({ source, destination, passphrase }) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.concat([MAGIC, salt, iv]));
  const header = Buffer.concat([MAGIC, salt, iv, Buffer.alloc(TAG_BYTES)]);
  await fs.promises.writeFile(destination, header, { mode: 0o600, flag: 'wx' });
  await pipeline(
    fs.createReadStream(source),
    zlib.createBrotliCompress(),
    cipher,
    fs.createWriteStream(destination, { flags: 'r+', start: HEADER_BYTES }),
  );
  const handle = await fs.promises.open(destination, 'r+');
  try {
    await handle.write(cipher.getAuthTag(), 0, TAG_BYTES, MAGIC.length + SALT_BYTES + IV_BYTES);
  } finally {
    await handle.close();
    key.fill(0);
  }
}

/** @param {{ source: string, destination: string, passphrase: string }} options */
async function decryptPayload({ source, destination, passphrase }) {
  const handle = await fs.promises.open(source, 'r');
  const header = Buffer.alloc(HEADER_BYTES);
  try {
    const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);
    if (bytesRead !== HEADER_BYTES || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('Ce fichier n’est pas une sauvegarde Wattelier valide.');
    }
  } finally {
    await handle.close();
  }
  const salt = header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = header.subarray(MAGIC.length + SALT_BYTES, MAGIC.length + SALT_BYTES + IV_BYTES);
  const tag = header.subarray(MAGIC.length + SALT_BYTES + IV_BYTES, HEADER_BYTES);
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.concat([MAGIC, salt, iv]));
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      fs.createReadStream(source, { start: HEADER_BYTES }),
      decipher,
      zlib.createBrotliDecompress(),
      fs.createWriteStream(destination, { mode: 0o600, flags: 'wx' }),
    );
  } catch {
    throw new Error('Mot de passe incorrect ou sauvegarde endommagée.');
  } finally {
    key.fill(0);
  }
}

/** @param {import('node:fs/promises').FileHandle} handle */
async function readManifest(handle) {
  const lengthBytes = Buffer.alloc(4);
  const lengthRead = await handle.read(lengthBytes, 0, 4, 0);
  if (lengthRead.bytesRead !== 4) throw new Error('Sauvegarde incomplète.');
  const length = lengthBytes.readUInt32BE();
  if (length < 2 || length > MANIFEST_LIMIT) throw new Error('Manifest de sauvegarde invalide.');
  const bytes = Buffer.alloc(length);
  const manifestRead = await handle.read(bytes, 0, length, 4);
  if (manifestRead.bytesRead !== length) throw new Error('Sauvegarde incomplète.');
  /** @type {MigrationManifest} */
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Manifest de sauvegarde invalide.');
  }
  if (
    manifest?.format !== 'wattelier-server-backup' ||
    manifest?.schemaVersion !== 1 ||
    typeof manifest.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    typeof manifest.appVersion !== 'string' ||
    manifest.appVersion.length > 100 ||
    !['portable', 'installed'].includes(manifest.sourceMode) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 2
  ) {
    throw new Error('Version de sauvegarde non prise en charge.');
  }
  const names = new Set();
  for (const file of manifest.files) {
    if (
      !file ||
      !ALLOWED_FILES.has(file.name) ||
      names.has(file.name) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error('Contenu de sauvegarde invalide.');
    }
    names.add(file.name);
  }
  if (![...ALLOWED_FILES].every((name) => names.has(name))) {
    throw new Error('Sauvegarde incomplète.');
  }
  return { manifest, dataOffset: 4 + length };
}

/** @param {{ source: string, destination: string }} options */
async function extractPayload({ source, destination }) {
  const handle = await fs.promises.open(source, 'r');
  try {
    const { manifest, dataOffset } = await readManifest(handle);
    const totalExpected = manifest.files.reduce((total, file) => total + file.size, dataOffset);
    const actualSize = (await handle.stat()).size;
    if (actualSize !== totalExpected) throw new Error('Taille de sauvegarde incohérente.');
    let position = dataOffset;
    for (const file of manifest.files) {
      const target = path.join(destination, file.name);
      if (file.size === 0) {
        await fs.promises.writeFile(target, '', { mode: 0o600, flag: 'wx' });
      } else {
        await pipeline(
          fs.createReadStream(source, { start: position, end: position + file.size - 1 }),
          fs.createWriteStream(target, { mode: 0o600, flags: 'wx' }),
        );
      }
      if ((await hashFile(target)) !== file.sha256) {
        throw new Error(`Le fichier ${file.name} est endommagé.`);
      }
      position += file.size;
    }
    return manifest;
  } finally {
    await handle.close();
  }
}

/** @param {string} filename */
function verifyDatabase(filename) {
  const database = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error('La base de données de la sauvegarde est endommagée.');
    const hasSettings = database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
      .get();
    if (!hasSettings)
      throw new Error('La sauvegarde ne contient pas une base Wattelier compatible.');
  } finally {
    database.close();
  }
}

/** Crée une archive chiffrée sans inclure les journaux ni les données client liées à Windows. */
/** @param {{ destination: string, passphrase: string, dataDirectory: string, preferencesPath: string, appVersion: string, portable: boolean, backupDatabase: (destination: string) => Promise<unknown>, now?: Date }} options */
export async function exportServerMigration({
  destination,
  passphrase,
  dataDirectory,
  preferencesPath,
  appVersion,
  portable,
  backupDatabase,
  now = new Date(),
}) {
  validatePassphrase(passphrase);
  const parent = path.dirname(dataDirectory);
  await fs.promises.mkdir(parent, { recursive: true });
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(parent, '.wattelier-export-'));
  const temporaryDestination = `${destination}.tmp-${process.pid}`;
  try {
    const snapshot = path.join(temporaryDirectory, 'elec.db');
    await backupDatabase(snapshot);
    verifyDatabase(snapshot);
    const preferences = JSON.parse(await fs.promises.readFile(preferencesPath, 'utf8'));
    await fs.promises.writeFile(
      path.join(temporaryDirectory, 'desktop-preferences.json'),
      `${JSON.stringify({ automaticUpdates: Boolean(preferences.automaticUpdates), mode: 'server' }, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    const files = [];
    for (const name of ALLOWED_FILES) {
      const filename = path.join(temporaryDirectory, name);
      files.push({
        name,
        size: (await fs.promises.stat(filename)).size,
        sha256: await hashFile(filename),
      });
    }
    /** @type {MigrationManifest} */
    const manifest = {
      format: 'wattelier-server-backup',
      schemaVersion: 1,
      createdAt: now.toISOString(),
      appVersion: String(appVersion),
      sourceMode: portable ? 'portable' : 'installed',
      files,
    };
    const plain = path.join(temporaryDirectory, 'payload.bin');
    await createPlainPayload({ directory: temporaryDirectory, manifest, destination: plain });
    await encryptPayload({ source: plain, destination: temporaryDestination, passphrase });
    await fs.promises.rm(destination, { force: true });
    await fs.promises.rename(temporaryDestination, destination);
    return { destination, createdAt: manifest.createdAt, appVersion: manifest.appVersion };
  } finally {
    await fs.promises.rm(temporaryDestination, { force: true });
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Déchiffre et valide une archive dans un dossier d’attente, sans toucher aux données actives. */
/** @param {{ source: string, passphrase: string, stagingDirectory: string }} options */
export async function stageServerMigration({ source, passphrase, stagingDirectory }) {
  validatePassphrase(passphrase);
  const parent = path.dirname(stagingDirectory);
  await fs.promises.mkdir(parent, { recursive: true });
  await fs.promises.rm(stagingDirectory, { recursive: true, force: true });
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(parent, '.wattelier-import-'));
  try {
    const plain = path.join(temporaryDirectory, 'payload.bin');
    await decryptPayload({ source, destination: plain, passphrase });
    const extracted = path.join(temporaryDirectory, 'extracted');
    await fs.promises.mkdir(extracted);
    const manifest = await extractPayload({ source: plain, destination: extracted });
    verifyDatabase(path.join(extracted, 'elec.db'));
    JSON.parse(
      await fs.promises.readFile(path.join(extracted, 'desktop-preferences.json'), 'utf8'),
    );
    await fs.promises.rm(stagingDirectory, { recursive: true, force: true });
    await fs.promises.rename(extracted, stagingDirectory);
    return {
      createdAt: manifest.createdAt,
      appVersion: manifest.appVersion,
      sourceMode: manifest.sourceMode,
    };
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/** @param {string} markerPath */
export function requestServerMigration(markerPath) {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, 'restore\n', { mode: 0o600 });
}

/** @param {string} markerPath @param {string} stagingDirectory */
export function cancelServerMigration(markerPath, stagingDirectory) {
  fs.rmSync(markerPath, { force: true });
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
}

/** Applique l’import au redémarrage et restaure les anciennes données si le déplacement échoue. */
/** @param {{ markerPath: string, stagingDirectory: string, dataDirectory: string, now?: Date }} options */
export function performPendingServerMigration({
  markerPath,
  stagingDirectory,
  dataDirectory,
  now = new Date(),
}) {
  if (!fs.existsSync(markerPath)) return { requested: false, backupPath: null };
  if (!fs.existsSync(path.join(stagingDirectory, 'elec.db'))) {
    cancelServerMigration(markerPath, stagingDirectory);
    throw new Error(
      'La restauration préparée est introuvable. Les données actuelles sont intactes.',
    );
  }
  const backupPath = fs.existsSync(dataDirectory) ? uniqueBackupPath(dataDirectory, now) : null;
  try {
    if (backupPath) fs.renameSync(dataDirectory, backupPath);
    fs.renameSync(stagingDirectory, dataDirectory);
    fs.rmSync(markerPath, { force: true });
    return { requested: true, backupPath };
  } catch (error) {
    if (backupPath && fs.existsSync(backupPath) && !fs.existsSync(dataDirectory)) {
      fs.renameSync(backupPath, dataDirectory);
    }
    cancelServerMigration(markerPath, stagingDirectory);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `La restauration a échoué ; les données précédentes ont été conservées. ${message}`,
      { cause: error },
    );
  }
}

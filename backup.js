// backup.js
// Local file backups (no passphrase). Works on native + web.
//
// Exports:
// - backupNow(email)
// - exportLatestBackup(email)
// - restoreFromFile(_unusedPassphraseOrNull, onSnapshot)
// - enableAutoBackup(email, enabled)
// - getAutoBackupEnabled(email)
// - isBackupConfigured(email)
// - getLatestBackupInfo(email)
//
// Notes:
// • On native (Android/iOS) we store a JSON file in the app's document directory
//   and share/export via the system share sheet.
// • On web, we keep the latest snapshot in AsyncStorage and trigger browser download
//   for "export", and use a hidden <input type="file"> for "restore".
// • Snapshot payload includes: entries, phase, selectedDate, weekStartDay.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

// ---------- Keys & helpers ----------
const NS = "@nextstep";
const storageKey = (email, name) => `${NS}/${email || "local"}/${name}`;
const keyAuto = (email) => `${NS}/${email || "local"}/backup/auto`;
const keyLatestMeta = (email) => `${NS}/${email || "local"}/backup/latestMeta`;
const keyLatestBlob = (email) => `${NS}/${email || "local"}/backup/latestBlob`;

// Directory for native backups
const BACKUP_DIR = FileSystem.documentDirectory
  ? FileSystem.documentDirectory + "NextStepBackups"
  : null;

const sanitizeFilePart = (s) => (String(s || "").trim().toLowerCase().replace(/[^\w.-]/g, "_") || "local");
const nowISO = () => new Date().toISOString();

const safeParse = (s) => {
  try { return JSON.parse(s); } catch { return null; }
};

async function ensureDirNative() {
  if (Platform.OS === "web" || !BACKUP_DIR) return null;
  try {
    const info = await FileSystem.getInfoAsync(BACKUP_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
    }
    return BACKUP_DIR;
  } catch {
    return BACKUP_DIR;
  }
}

function makeSnapshot(email, rawEntries, rawPhase, rawDate, rawWeekStartDay) {
  const entries = rawEntries ? safeParse(rawEntries) || {} : {};
  const phase = Number(rawPhase) || 1;
  const selectedDate = rawDate || "";
  const weekStartDay = Number(rawWeekStartDay) || 0;

  return {
    version: 1,
    email: email || "local",
    createdAt: nowISO(),
    payload: { entries, phase, selectedDate, weekStartDay },
  };
}

async function readCoreState(email) {
  const [e, p, d, w] = await Promise.all([
    AsyncStorage.getItem(storageKey(email, "entries")),
    AsyncStorage.getItem(storageKey(email, "phase")),
    AsyncStorage.getItem(storageKey(email, "date")),
    AsyncStorage.getItem(storageKey(email, "weekStartDay")),
  ]);
  return { e, p, d, w };
}

async function writeLatestMeta(email, meta) {
  await AsyncStorage.setItem(keyLatestMeta(email), JSON.stringify(meta));
}
async function writeLatestBlob(email, snapshot) {
  await AsyncStorage.setItem(keyLatestBlob(email), JSON.stringify(snapshot));
}
async function readLatestMeta(email) {
  const raw = await AsyncStorage.getItem(keyLatestMeta(email));
  return raw ? safeParse(raw) : null;
}
async function readLatestBlob(email) {
  const raw = await AsyncStorage.getItem(keyLatestBlob(email));
  return raw ? safeParse(raw) : null;
}

// ---------- Public API ----------

/**
 * Create/refresh a backup snapshot for the given user.
 * On native: writes to a file under app documents.
 * On web: stores the latest snapshot JSON in AsyncStorage (for export).
 * Returns { createdAt, uri? }.
 */
export async function backupNow(email) {
  const { e, p, d, w } = await readCoreState(email);
  const snapshot = makeSnapshot(email, e, p, d, w);
  const json = JSON.stringify(snapshot);

  // Always store the latest snapshot blob for quick access (web + native)
  await writeLatestBlob(email, snapshot);

  if (Platform.OS !== "web" && BACKUP_DIR) {
    await ensureDirNative();
    const fileName = `${sanitizeFilePart(email)}_latest.json`;
    const uri = `${BACKUP_DIR}/${fileName}`;
    await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
    const meta = { createdAt: snapshot.createdAt, uri };
    await writeLatestMeta(email, meta);
    return meta;
  } else {
    // Web: no native FS path; just record meta
    const meta = { createdAt: snapshot.createdAt, uri: null };
    await writeLatestMeta(email, meta);
    return meta;
  }
}

/**
 * Export the most recent backup.
 * - Native: opens share sheet with the JSON file.
 * - Web: triggers a file download for the JSON.
 */
export async function exportLatestBackup(email) {
  let meta = await readLatestMeta(email);
  let snap = await readLatestBlob(email);

  // If nothing to export yet, create a fresh backup first.
  if (!meta || !snap) {
    meta = await backupNow(email);
    snap = await readLatestBlob(email);
  }

  const json = JSON.stringify(snap, null, 2);

  if (Platform.OS === "web") {
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitizeFilePart(email)}_nextstep_backup_${new Date(snap.createdAt).toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      // Best-effort fallback
      alert("Unable to trigger download in this browser.");
      console.warn("exportLatestBackup web error:", e);
    }
    return meta;
  }

  // Native: share the on-disk file if we have it, otherwise share a temp file.
  let uri = meta?.uri;
  try {
    if (!uri) {
      // Write a temp file if somehow uri missing
      await ensureDirNative();
      const tmpName = `${sanitizeFilePart(email)}_export_${Date.now()}.json`;
      uri = `${BACKUP_DIR}/${tmpName}`;
      await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });
    }
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing is not available on this device.");
    }
    await Sharing.shareAsync(uri, {
      mimeType: "application/json",
      dialogTitle: "Export Next Step backup",
      UTI: "public.json",
    });
    return meta;
  } catch (e) {
    console.warn("exportLatestBackup native error:", e?.message || e);
    // Fallback: share the in-memory JSON by writing to a temp file
    try {
      await ensureDirNative();
      const tmpName = `${sanitizeFilePart(email)}_export_${Date.now()}.json`;
      const tmpUri = `${BACKUP_DIR}/${tmpName}`;
      await FileSystem.writeAsStringAsync(tmpUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tmpUri, {
          mimeType: "application/json",
          dialogTitle: "Export Next Step backup",
          UTI: "public.json",
        });
      }
    } catch {}
    return meta;
  }
}

/**
 * Restore from a user-picked JSON file and pass the parsed snapshot
 * to `onSnapshot(snapshot)` for the caller to write into app storage.
 * The first argument is ignored (kept for backward compatibility).
 */
export async function restoreFromFile(_unused, onSnapshot) {
  if (Platform.OS === "web") {
    // Build a temporary hidden <input type="file"> picker
    const pickFile = () =>
      new Promise((resolve, reject) => {
        try {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "application/json,.json";
          input.style.display = "none";
          input.onchange = async () => {
            const f = input.files && input.files[0];
            if (!f) {
              reject(new Error("No file selected."));
              return;
            }
            try {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error("Failed to read file."));
              reader.readAsText(f);
            } catch (err) { reject(err); }
          };
          document.body.appendChild(input);
          input.click();
          // Clean-up after a short delay
          setTimeout(() => {
            try { document.body.removeChild(input); } catch {}
          }, 2000);
        } catch (e) { reject(e); }
      });

    const content = await pickFile();
    const snap = safeParse(String(content || ""));
    if (!snap || !snap.payload) throw new Error("Invalid backup file.");
    // Update "latest" cache on web
    await writeLatestBlob(snap.email || "local", snap);
    await writeLatestMeta(snap.email || "local", { createdAt: snap.createdAt || nowISO(), uri: null });
    if (typeof onSnapshot === "function") await onSnapshot(snap);
    return true;
  }

  // Native: use DocumentPicker
  const res = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (res.canceled) return false;

  const file = res.assets && res.assets[0];
  if (!file?.uri) throw new Error("No file selected.");

  const json = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
  const snap = safeParse(json);
  if (!snap || !snap.payload) throw new Error("Invalid backup file.");

  // Cache latest snapshot & meta
  await writeLatestBlob(snap.email || "local", snap);
  await writeLatestMeta(snap.email || "local", {
    createdAt: snap.createdAt || nowISO(),
    uri: null, // unknown, since we restored from a picked file
  });

  if (typeof onSnapshot === "function") await onSnapshot(snap);
  return true;
}

/** Enable/disable auto-backup for this user. */
export async function enableAutoBackup(email, enabled) {
  await AsyncStorage.setItem(keyAuto(email), enabled ? "1" : "0");
}

/** Read auto-backup flag for this user. */
export async function getAutoBackupEnabled(email) {
  const v = await AsyncStorage.getItem(keyAuto(email));
  return v === "1";
}

/**
 * Whether backup is "configured".
 * In passphrase-free mode, consider it configured if auto-backup is on
 * OR if a latest snapshot exists.
 */
export async function isBackupConfigured(email) {
  const [auto, meta, blob] = await Promise.all([
    getAutoBackupEnabled(email),
    readLatestMeta(email),
    readLatestBlob(email),
  ]);
  return !!(auto || meta || blob);
}

/** Last backup info: { createdAt, uri? } or null */
export async function getLatestBackupInfo(email) {
  const meta = await readLatestMeta(email);
  return meta || null;
}

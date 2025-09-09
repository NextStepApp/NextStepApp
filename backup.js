// backup.js — plain JSON backups (no passphrase), local-only

import * as FileSystem from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const APP_NS = "@nextstep";
const BACKUP_DIR = FileSystem.documentDirectory + "backups/";
const META_KEY = (email) => `${APP_NS}/${email}/lastBackupMeta`;
const AUTO_KEY = (email) => `${APP_NS}/${email}/autoBackupEnabled`;

const ensureBackupDir = async () => {
  try {
    const info = await FileSystem.getInfoAsync(BACKUP_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
    }
  } catch (e) {
    console.warn("ensureBackupDir error:", e);
    throw e;
  }
};

const sanitize = (s) =>
  String(s || "local").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);

const nowIso = () => new Date().toISOString();

async function readUserState(email) {
  const base = `${APP_NS}/${email || "local"}`;
  const [entries, phase, date, weekStartDay] = await Promise.all([
    AsyncStorage.getItem(`${base}/entries`),
    AsyncStorage.getItem(`${base}/phase`),
    AsyncStorage.getItem(`${base}/date`),
    AsyncStorage.getItem(`${base}/weekStartDay`),
  ]);
  return {
    entries: entries ? JSON.parse(entries) : {},
    phase: phase ? Number(phase) : 1,
    selectedDate: date || "",
    weekStartDay: weekStartDay ? Number(weekStartDay) : 0,
  };
}

async function writeLatestMeta(email, meta) {
  try {
    await AsyncStorage.setItem(META_KEY(email), JSON.stringify(meta));
  } catch {}
}

async function scanLatestBackup(email) {
  // Fallback: scan the directory for the newest matching file
  try {
    const files = await FileSystem.readDirectoryAsync(BACKUP_DIR);
    const prefix = `backup-${sanitize(email)}-`;
    const mine = files
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .map((f) => ({
        uri: BACKUP_DIR + f,
        createdAt: Number(f.replace(prefix, "").replace(".json", "")) || 0,
        name: f,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    return mine[0] || null;
  } catch {
    return null;
  }
}

/** Create a plain JSON backup file for this user (no encryption). */
export async function backupNow(email) {
  await ensureBackupDir();
  const payload = await readUserState(email);
  const snapshot = {
    version: 1,
    email: email || "local",
    createdAt: Date.now(),
    createdAtIso: nowIso(),
    payload,
  };
  const fname = `backup-${sanitize(email)}-${snapshot.createdAt}.json`;
  const uri = BACKUP_DIR + fname;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(snapshot, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const meta = { uri, createdAt: snapshot.createdAt, name: fname };
  await writeLatestMeta(email, meta);
  return meta;
}

/** Return info about the latest backup if present. */
export async function getLatestBackupInfo(email) {
  try {
    const s = await AsyncStorage.getItem(META_KEY(email));
    if (s) return JSON.parse(s);
  } catch {}
  // Fallback to scanning the directory
  return await scanLatestBackup(email);
}

/** Export the latest backup using the OS share sheet. */
export async function exportLatestBackup(email) {
  const info = await getLatestBackupInfo(email);
  if (!info || !info.uri) {
    throw new Error("No backup to export yet. Create one first.");
  }
  const shareAvailable = await Sharing.isAvailableAsync();
  if (!shareAvailable) {
    // As a fallback, just return the path so caller can show it to the user
    throw new Error(
      `Sharing is not available on this device. File is at:\n${info.uri}`
    );
  }
  await Sharing.shareAsync(info.uri, {
    dialogTitle: "Export Next Step backup",
    UTI: "public.json",
    mimeType: "application/json",
  });
  return info;
}

/**
 * Restore from a user-picked backup file (no passphrase).
 * onLoaded(snapshot) is called with the parsed JSON object.
 */
export async function restoreFromFile(_unusedPassphrase, onLoaded) {
  // Support both new and old DocumentPicker return shapes
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
    multiple: false,
  });

  // New API (SDK 50+): { assets, canceled }
  let uri = null;
  if (result?.canceled) {
    throw new Error("Restore canceled.");
  }
  if (Array.isArray(result?.assets) && result.assets.length > 0) {
    uri = result.assets[0].uri;
  }
  // Old API (type: "success")
  if (!uri && result?.type === "success") {
    uri = result.uri;
  }
  if (!uri) throw new Error("Could not read the selected file.");

  const raw = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  let snapshot = null;
  try {
    snapshot = JSON.parse(raw);
  } catch (e) {
    throw new Error("Selected file is not valid JSON.");
  }
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Backup file format is invalid.");
  }
  if (!snapshot.email || !snapshot.payload) {
    throw new Error("Backup file is missing required fields.");
  }

  if (typeof onLoaded === "function") {
    await onLoaded(snapshot);
  }
  return snapshot;
}

/** Auto-backup flags (UI toggle only; scheduling is up to the app). */
export async function enableAutoBackup(email, enabled) {
  await AsyncStorage.setItem(AUTO_KEY(email), JSON.stringify(!!enabled));
  // You can optionally trigger an immediate backup when enabling:
  // if (enabled) { try { await backupNow(email); } catch {} }
  return true;
}

export async function getAutoBackupEnabled(email) {
  const s = await AsyncStorage.getItem(AUTO_KEY(email));
  return s ? JSON.parse(s) : false;
}

/**
 * isBackupConfigured:
 * With passphrase-less backups, we consider the user "configured" if:
 *  - they have at least one backup file, OR
 *  - auto-backup is turned on.
 */
export async function isBackupConfigured(email) {
  const [latest, auto] = await Promise.all([
    getLatestBackupInfo(email),
    getAutoBackupEnabled(email),
  ]);
  return !!(latest || auto);
}

// localAuth.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCOUNTS_KEY = "@nextstep/accounts";           // JSON array of emails/usernames
const CURRENT_USER_KEY = "@nextstep/currentUser";    // the active email/username

const normalize = (s) => String(s || "").trim().toLowerCase();

async function getAccounts() {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setAccounts(list) {
  try {
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {}
}

export async function listLocalAccounts() {
  return await getAccounts();
}

export async function currentUserLocal() {
  const email = await AsyncStorage.getItem(CURRENT_USER_KEY);
  return email ? { email } : null;
}

export async function signOutLocal() {
  await AsyncStorage.removeItem(CURRENT_USER_KEY);
  return true;
}

/**
 * Passwordless "sign in": choose a username/email.
 * - If it exists, switch to it.
 * - If it doesn't, create it and switch to it.
 */
export async function signInLocal(emailOrUsername) {
  const email = normalize(emailOrUsername);
  if (!email) throw new Error("Please enter a username (e.g., your email).");

  const accounts = await getAccounts();
  if (!accounts.includes(email)) {
    accounts.push(email);
    await setAccounts(accounts);
  }
  await AsyncStorage.setItem(CURRENT_USER_KEY, email);
  return { email };
}

/** Alias kept for compatibility */
export async function signUpLocal(emailOrUsername /* ignored password */) {
  return signInLocal(emailOrUsername);
}

/** No-op placeholders kept for compatibility with older code */
export async function setPasswordDirect() { return true; }
export async function changePasswordLocal() { return true; }

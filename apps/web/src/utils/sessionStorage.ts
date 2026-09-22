const tokenKey = "task-workspace-token";

export function readSessionToken(): string | null {
  try {
    return sessionStorage.getItem(tokenKey);
  } catch {
    return null;
  }
}

export function saveSessionToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(tokenKey, token);
    else sessionStorage.removeItem(tokenKey);
  } catch {
    // The current in-memory session still works when browser storage is disabled.
  }
}

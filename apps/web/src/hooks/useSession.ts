import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../errors/ApiError";
import type { UserResponse } from "../models/dto/responses/UserResponse";
import { ApiClient } from "../services/ApiClient";
import { UserService } from "../services/UserService";
import { errorMessage } from "../utils/errorMessage";
import { readSessionToken, saveSessionToken } from "../utils/sessionStorage";

export function useSession() {
  const [token, setToken] = useState(readSessionToken);
  const activeToken = useRef(token);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const signOut = useCallback(() => {
    activeToken.current = null;
    saveSessionToken(null);
    setToken(null);
    setUser(null);
    setError(null);
    setLoading(false);
  }, []);

  const expire = useCallback(() => {
    if (activeToken.current !== token) return;
    signOut();
    setError("Your session has expired. Please sign in again.");
  }, [signOut, token]);

  useEffect(() => {
    if (!token || user) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    new UserService(new ApiClient(token))
      .profile(controller.signal)
      .then(({ user: profile }) => {
        if (!controller.signal.aborted) {
          setUser(profile);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 401) expire();
        else setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, user, attempt, expire]);

  async function signIn(email: string, password: string): Promise<void> {
    const { token: nextToken } = await new UserService(new ApiClient()).login(
      email,
      password,
    );
    const { user: profile } = await new UserService(
      new ApiClient(nextToken),
    ).profile();
    saveSessionToken(nextToken);
    activeToken.current = nextToken;
    setUser(profile);
    setToken(nextToken);
    setError(null);
  }

  function retry() {
    setAttempt((current) => current + 1);
  }

  return { token, user, loading, error, signIn, signOut, expire, retry };
}

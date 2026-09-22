import { useState, type FormEvent } from "react";
import { ApiClient } from "../services/ApiClient";
import { UserService } from "../services/UserService";
import { errorMessage } from "../utils/errorMessage";

const userService = new UserService(new ApiClient());

interface AuthPanelProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  sessionError: string | null;
}

export function AuthPanel({ onSignIn, sessionError }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await userService.register(username, email, password);
        setMode("login");
        setPassword("");
        setNotice("Account created. Sign in with your new password.");
      } else {
        await onSignIn(email, password);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setPassword("");
  }

  return (
    <section className="panel auth-panel" aria-label="Account">
      <div className="tabs" aria-label="Account action">
        <button
          className={mode === "login" ? "active" : ""}
          type="button"
          disabled={submitting}
          onClick={() => changeMode("login")}
        >
          Sign in
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          type="button"
          disabled={submitting}
          onClick={() => changeMode("register")}
        >
          Register
        </button>
      </div>
      <form onSubmit={submit}>
        <fieldset className="stack" disabled={submitting}>
          {mode === "register" && (
            <label>
              Username
              <input
                required
                maxLength={50}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
              />
            </label>
          )}
          <label>
            Email
            <input
              required
              type="email"
              maxLength={255}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              minLength={mode === "register" ? 8 : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
          {mode === "register" && (
            <p className="hint">
              Use at least 8 characters (at most 72 UTF-8 bytes).
            </p>
          )}
          {(error || sessionError) && (
            <p className="error" role="alert">
              {error || sessionError}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <button className="primary">
            {submitting
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </fieldset>
      </form>
    </section>
  );
}

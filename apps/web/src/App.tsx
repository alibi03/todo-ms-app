import { AuthPanel } from "./components/AuthPanel";
import { Dashboard } from "./components/Dashboard";
import { useSession } from "./hooks/useSession";

export function App() {
  const session = useSession();

  if (session.loading) {
    return (
      <main className="centered">
        <p role="status">Restoring your session…</p>
      </main>
    );
  }
  if (session.token && !session.user) {
    return (
      <main className="centered">
        <section className="panel auth-panel stack">
          <h1>Unable to load your account</h1>
          <p role="alert">{session.error}</p>
          <button className="primary" onClick={session.retry}>
            Try again
          </button>
          <button className="secondary" onClick={session.signOut}>
            Sign out
          </button>
        </section>
      </main>
    );
  }
  if (session.user && session.token) {
    return (
      <Dashboard
        key={session.token}
        user={session.user}
        token={session.token}
        onSignOut={session.signOut}
        onSessionExpired={session.expire}
      />
    );
  }
  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <p className="eyebrow">Task workspace</p>
        <h1>Tasks in one place.</h1>
        <p>Manage your tasks and keep track of assignments.</p>
      </section>
      <AuthPanel onSignIn={session.signIn} sessionError={session.error} />
    </main>
  );
}

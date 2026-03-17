"use client";

import { useState } from "react";

function apiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
}

async function apiFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    const e = new Error(msg);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setOk("");
    setLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("toutbet_auth", JSON.stringify(data));
      }
      setOk("Connexion réussie. Vous pouvez revenir à l'écran principal.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authContainer">
      <h1>Connexion</h1>
      <p className="muted">Accédez à votre compte ToutBet.</p>

      {error ? <div className="error">{error}</div> : null}
      {ok ? <div className="ok">{ok}</div> : null}

      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@example.com"
          />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
          />
        </div>
        <div className="btnRow">
          <button className="btn btnPrimary" type="submit" disabled={loading}>
            Se connecter
          </button>
        </div>
      </form>

      <p className="muted" style={{ marginTop: 16 }}>
        Pas encore de compte ? Rendez-vous sur la page d&apos;inscription.
      </p>
    </div>
  );
}


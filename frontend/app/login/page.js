"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/auth";
import { useAuth } from "../providers";

export default function LoginPage() {
  const router = useRouter();
  const { token, setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAlreadyConnected, setIsAlreadyConnected] = useState(false);

  useEffect(() => {
    setIsAlreadyConnected(Boolean(token));
  }, [token]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setAuth(data);
      router.replace("/");
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
      {isAlreadyConnected ? (
        <div className="ok" style={{ marginBottom: 12 }}>
          Vous êtes déjà connecté. <Link href="/">Continuer vers l&apos;application</Link>
        </div>
      ) : null}

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
      <p className="muted" style={{ marginTop: 8 }}>
        <Link href="/">Retour à l&apos;accueil</Link>
      </p>
    </div>
  );
}


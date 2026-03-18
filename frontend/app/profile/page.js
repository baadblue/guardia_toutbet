"use client";

import { useState } from "react";
import {
  apiFetch,
  setStoredAuth,
} from "../lib/auth";
import { useAuth } from "../providers";

export default function ProfilePage() {
  const { auth, token, user, logout, setAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  function updateStoredBalance(nextBalance) {
    if (!auth?.user) return;
    const updated = {
      ...auth,
      user: {
        ...auth.user,
        balance: nextBalance,
      },
    };
    setAuth(updated);
    setStoredAuth(updated);
  }

  async function submitWalletAction(path, amount) {
    setError("");
    setOk("");
    setLoading(true);
    try {
      const data = await apiFetch(path, {
        token,
        method: "POST",
        body: { amount: Number(amount) },
      });
      updateStoredBalance(data?.user?.balance);
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function onDeposit(e) {
    e.preventDefault();
    try {
      await submitWalletAction("/api/wallet/deposit", depositAmount);
      setDepositAmount("");
      setOk("Compte alimenté avec succès.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function onWithdraw(e) {
    e.preventDefault();
    try {
      await submitWalletAction("/api/wallet/withdraw", withdrawAmount);
      setWithdrawAmount("");
      setOk("Retrait simulé avec succès.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      {error ? <div style={{ marginTop: 16 }} className="error">{error}</div> : null}
      {ok ? <div style={{ marginTop: 16 }} className="ok">{ok}</div> : null}

      {!user ? (
        <div style={{ marginTop: 16 }} className="card">
          <div className="cardBody">
            <p className="muted">
              Connecte-toi pour accéder aux opérations de portefeuille.
            </p>
          </div>
        </div>
      ) : (
        <div className="row" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="cardHeader">
              <h2>Informations du compte</h2>
              <button className="btn btnDanger" onClick={logout} disabled={loading}>
                Déconnexion
              </button>
            </div>
            <div className="cardBody">
              <div className="kpi">
                <span className="pill">
                  Email: <strong>{user.email}</strong>
                </span>
                <span className="pill">
                  ID: <strong>{user.id}</strong>
                </span>
                <span className="pill">
                  Solde: <strong>{String(user.balance ?? "0")}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">
              <h2>Portefeuille</h2>
              <span className="muted">Gérez votre solde.</span>
            </div>
            <div className="cardBody">
              <form onSubmit={onDeposit}>
                <div className="field">
                  <label>Alimenter mon compte</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Ex: 50"
                  />
                </div>
                <div className="btnRow">
                  <button className="btn btnPrimary" type="submit" disabled={loading || !token}>
                    Déposer
                  </button>
                </div>
              </form>

              <form style={{ marginTop: 16 }} onSubmit={onWithdraw}>
                <div className="field">
                  <label>Retirer mes gains</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Ex: 20"
                  />
                </div>
                <div className="btnRow">
                  <button className="btn" type="submit" disabled={loading || !token}>
                    Retirer
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

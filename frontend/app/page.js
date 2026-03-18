"use client";

import { useEffect, useMemo, useState } from "react";
import {
  apiBase,
  apiFetch,
  clearStoredAuth,
  getStoredAuth,
  setStoredAuth,
} from "./lib/auth";

export default function Page() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const token = auth?.token || "";
  const user = auth?.user || null;

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored?.token) setAuth(stored);
  }, []);

  const [betTitle, setBetTitle] = useState("");
  const [minStake, setMinStake] = useState(10);
  const [invitedEmails, setInvitedEmails] = useState("");

  const [betId, setBetId] = useState("");
  const [wagerAmount, setWagerAmount] = useState(25);

  const [closeBetId, setCloseBetId] = useState("");
  const [winnerIds, setWinnerIds] = useState("");

  const [lastBet, setLastBet] = useState(null);
  const [lastTx, setLastTx] = useState(null);
  const [lastClose, setLastClose] = useState(null);

  const winners = useMemo(() => {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return winnerIds
      .split(",")
      .map((s) =>
        s
          .replace(/\u00A0/g, " ")
          .replace(/\u200B/g, "")
          .trim()
          .replace(/^[{[(<"']+/, "")
          .replace(/[})\]>\"']+$/, "")
          .trim()
      )
      .filter(Boolean)
      .filter((s) => uuidRe.test(s));
  }, [winnerIds]);

  function onLogout() {
    setAuth(null);
    clearStoredAuth();
    setOk("Déconnecté.");
    setError("");
  }

  async function onCreateBet(e) {
    e.preventDefault();
    setError("");
    setOk("");
    setLoading(true);
    try {
      const data = await apiFetch("/bets", {
        token,
        method: "POST",
        body: {
          title: betTitle,
          minStake: Number(minStake),
          invitedEmails: invitedEmails
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        },
      });
      setLastBet(data);
      setOk(`Pari créé (#${data.id}).`);
      setBetId(String(data.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onPlaceWager(e) {
    e.preventDefault();
    setError("");
    setOk("");
    setLoading(true);
    try {
      const id = String(betId).trim();
      const data = await apiFetch(`/bets/${id}/wagers`, {
        token,
        method: "POST",
        body: { amount: Number(wagerAmount) },
      });
      setLastTx(data);
      setOk("Mise enregistrée.");
      if (auth?.user && data?.user?.balance != null) {
        const updated = { ...auth, user: { ...auth.user, balance: data.user.balance } };
        setAuth(updated);
        setStoredAuth(updated);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onCloseBet(e) {
    e.preventDefault();
    setError("");
    setOk("");
    setLoading(true);
    try {
      const id = String(closeBetId).trim();
      const data = await apiFetch(`/bets/${id}/close`, {
        token,
        method: "POST",
        body: { winnerUserIds: winners },
      });
      setLastClose(data);
      setOk("Pari clôturé et gains redistribués.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="header">
        <div className="brand">
          <strong>ToutBet MVP</strong>
          <span className="muted">
            Next.js UI → API {apiBase()}
          </span>
        </div>
        <div className="btnRow">
          {user ? (
            <>
              <span className="pill">
                Connecté: <strong>{user.email}</strong>
              </span>
              <span className="pill">
                Solde: <strong>{String(user.balance ?? "0")}</strong>
              </span>
              <span className="pill">
                ID utilisateur: <strong>{user.id}</strong>
              </span>
              <button className="btn btnDanger" onClick={onLogout} disabled={loading}>
                Se déconnecter
              </button>
            </>
          ) : (
            <>
              <span className="pill">Non connecté</span>
              <a href="/login" className="btn btnPrimary">
                Se connecter
              </a>
              <a href="/register" className="btn">
                Créer un compte
              </a>
            </>
          )}
        </div>
      </div>

      {error ? <div style={{ marginTop: 16 }} className="error">{error}</div> : null}
      {ok ? <div style={{ marginTop: 16 }} className="ok">{ok}</div> : null}

      <div className="row">
        <div className="card">
          <div className="cardHeader">
            <h2>Créer un pari</h2>
            <span className="muted">Définir un pari et inviter des participants.</span>
          </div>
          <div className="cardBody">
            <form onSubmit={onCreateBet}>
              <div className="field">
                <label>Titre</label>
                <input
                  value={betTitle}
                  onChange={(e) => setBetTitle(e.target.value)}
                  placeholder="Match PSG - OM"
                />
              </div>
              <div className="field">
                <label>Mise min</label>
                <input type="number" value={minStake} onChange={(e) => setMinStake(e.target.value)} />
              </div>
              <div className="field">
                <label>Invités (emails séparés par virgule)</label>
                <input
                  value={invitedEmails}
                  onChange={(e) => setInvitedEmails(e.target.value)}
                  placeholder="bob@example.com, carol@example.com"
                />
                <div className="muted">
                  Les invitations sont vérifiées côté backend à partir des emails.
                </div>
              </div>
              <div className="btnRow">
                <button className="btn btnPrimary" type="submit" disabled={loading || !token}>
                  Créer le pari
                </button>
                {!token ? <span className="muted">Connecte-toi d’abord.</span> : null}
              </div>
            </form>

            {lastBet ? (
              <div style={{ marginTop: 12 }}>
                <div className="kpi">
                  <span className="pill">Bet ID: <strong>{lastBet.id}</strong></span>
                  <span className="pill">Status: <strong>{lastBet.status}</strong></span>
                  <span className="pill">Min: <strong>{String(lastBet.minStake)}</strong></span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card">
          <div className="cardHeader">
            <h2>Placer une mise</h2>
            <span className="muted">Participer à un pari pour lequel vous avez été invité.</span>
          </div>
          <div className="cardBody">
            <form onSubmit={onPlaceWager}>
              <div className="field">
                <label>Bet ID</label>
                <input value={betId} onChange={(e) => setBetId(e.target.value)} placeholder="ex: 1" />
              </div>
              <div className="field">
                <label>Montant</label>
                <input type="number" value={wagerAmount} onChange={(e) => setWagerAmount(e.target.value)} />
                <div className="muted">
                  La mise doit être valide et votre participation autorisée pour ce pari.
                </div>
              </div>
              <div className="btnRow">
                <button className="btn btnPrimary" type="submit" disabled={loading || !token}>
                  Placer la mise
                </button>
              </div>
            </form>

            {lastTx ? (
              <div style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Transaction</th>
                      <th>Type</th>
                      <th>Montant</th>
                      <th>Balance après</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>#{lastTx.transaction?.id}</td>
                      <td>{lastTx.transaction?.type}</td>
                      <td>{String(lastTx.transaction?.amount)}</td>
                      <td>{String(lastTx.transaction?.balanceAfter)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h2>Clôturer un pari</h2>
            <span className="muted">Sélectionner les gagnants et distribuer les gains.</span>
          </div>
          <div className="cardBody">
            <form onSubmit={onCloseBet}>
              <div className="field">
                <label>Bet ID</label>
                <input value={closeBetId} onChange={(e) => setCloseBetId(e.target.value)} placeholder="ex: 1" />
              </div>
              <div className="field">
                <label>Winners (IDs séparés par virgule)</label>
                <input
                  value={winnerIds}
                  onChange={(e) => setWinnerIds(e.target.value)}
                  placeholder="uuid1, uuid2"
                />
                <div className="muted">
                  Commission 5% appliquée. Payouts proportionnels aux mises des gagnants.
                </div>
              </div>
              <div className="btnRow">
                <button className="btn btnPrimary" type="submit" disabled={loading || !token}>
                  Clôturer et redistribuer
                </button>
              </div>
            </form>

            {lastClose ? (
              <div style={{ marginTop: 12 }}>
                <div className="kpi">
                  <span className="pill">Total pot: <strong>{String(lastClose.totalPot)}</strong></span>
                  <span className="pill">Commission: <strong>{String(lastClose.commission)}</strong></span>
                  <span className="pill">Distribuable: <strong>{String(lastClose.distributable)}</strong></span>
                </div>
                <div style={{ marginTop: 10 }} className="muted">
                  Payouts:
                </div>
                <table className="table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(lastClose.payoutResults || []).map((p) => (
                      <tr key={p.userId}>
                        <td>{p.userId}</td>
                        <td>{p.payoutAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }} className="muted">
        Pour jouer dans des conditions proches de la production, utilisez des comptes distincts pour le créateur du pari et les participants.
      </div>
    </>
  );
}


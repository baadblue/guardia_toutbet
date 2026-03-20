"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, setStoredAuth } from "../lib/auth";
import { useAuth } from "../providers";

function visibilityLabel(visibility) {
  return visibility === "PUBLIC" ? "Public" : "Privé";
}

export default function BetsPage() {
  const { token, user, setAuth } = useAuth();

  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [wagerAmounts, setWagerAmounts] = useState({});

  const isVerified = Boolean(user?.isVerified);

  const wagerAmountFor = useMemo(() => {
    return (betId) => wagerAmounts[betId] ?? "";
  }, [wagerAmounts]);

  useEffect(() => {
    if (!token) {
      setBets([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch("/bets", { token });
        if (cancelled) return;
        setBets(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onPlaceWager(bet) {
    setError("");
    setOk("");
    setLoading(true);
    try {
      const raw = wagerAmountFor(bet.id);
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Veuillez saisir un montant strictement positif.");
        return;
      }

      if (bet.visibility === "PUBLIC" && !isVerified) {
        setError(
          "Vous devez faire vérifier votre compte pour participer aux paris publics."
        );
        return;
      }

      const data = await apiFetch(`/bets/${bet.id}/wagers`, {
        token,
        method: "POST",
        body: { amount },
      });

      if (user && data?.user?.balance != null) {
        const updated = { token, user: { ...user, balance: data.user.balance } };
        setAuth(updated);
        setStoredAuth(updated);
      }

      setOk("Mise enregistrée.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error ? (
        <div style={{ marginTop: 16 }} className="error">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div style={{ marginTop: 16 }} className="ok">
          {ok}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="cardHeader">
            <h2>Paris disponibles</h2>
            <span className="muted">Publics et privés (sur invitation).</span>
          </div>
          <div className="cardBody">
            {loading && bets.length === 0 ? (
              <div className="muted">Chargement...</div>
            ) : bets.length === 0 ? (
              <div className="muted">Aucun pari disponible pour le moment.</div>
            ) : (
              <div className="cards">
                {bets.map((bet) => (
                  <div key={bet.id} className="betCard">
                    <div className="betCardTop">
                      <div className="betCardTitle">{bet.title || "Pari"}</div>
                      <span className="pill">
                        {visibilityLabel(bet.visibility)}{" "}
                      </span>
                    </div>

                    <div className="betCardMeta">
                      <span className="pill">
                        Participants{" "}
                        <strong>{Number(bet.participantsCount ?? 0)}</strong>
                      </span>
                      <span className="pill">
                        Mise min{" "}
                        <strong>
                          {bet.minStake != null ? String(bet.minStake) : "—"}
                        </strong>
                      </span>
                    </div>

                    <div className="btnRow" style={{ marginTop: 12 }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={wagerAmountFor(bet.id)}
                        onChange={(e) =>
                          setWagerAmounts((prev) => ({
                            ...prev,
                            [bet.id]: e.target.value,
                          }))
                        }
                        placeholder="Montant"
                      />
                      <button
                        className="btn btnPrimary"
                        type="button"
                        onClick={() => onPlaceWager(bet)}
                        disabled={loading || bet.status === "CLOSED"}
                      >
                        Miser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}


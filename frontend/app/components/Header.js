"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../providers";

function NavLink({ href, children, className = "btn" }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link href={href} className={`${className} ${isActive ? "btnActive" : ""}`.trim()}>
      {children}
    </Link>
  );
}

export default function Header() {
  const { user, userEmail, balance, logout } = useAuth();

  return (
    <div className="header">
      <div className="brand">
        <strong>ToutBet</strong>
        <span className="muted">Paris entre particuliers</span>
      </div>

      <div className="btnRow">
        {user ? (
          <>
            <NavLink href="/" className="btn">
              Accueil
            </NavLink>
            <NavLink href="/profile" className="btn">
              Mon Profil
            </NavLink>

            <span className="pill">
              <span className="muted">Solde</span> <strong>{String(balance ?? "0")}</strong>
            </span>
            <span className="pill">
              <span className="muted">Email</span> <strong>{userEmail}</strong>
            </span>

            <button className="btn btnDanger" onClick={logout}>
              Déconnexion
            </button>
          </>
        ) : (
          <>
            <NavLink href="/login" className="btn btnPrimary">
              Connexion
            </NavLink>
            <NavLink href="/register" className="btn">
              Inscription
            </NavLink>
          </>
        )}
      </div>
    </div>
  );
}


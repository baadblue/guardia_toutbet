import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "ToutBet MVP",
  description: "Interface MVP (Next.js) pour l'API ToutBet",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <div className="container">
          <div className="btnRow" style={{ marginBottom: 14 }}>
            <Link href="/" className="btn">Accueil</Link>
            <Link href="/profile" className="btn">Profil</Link>
            <Link href="/login" className="btn">Connexion</Link>
            <Link href="/register" className="btn">Inscription</Link>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}


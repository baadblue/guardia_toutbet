import "./globals.css";

export const metadata = {
  title: "ToutBet MVP",
  description: "Interface MVP (Next.js) pour l'API ToutBet",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}


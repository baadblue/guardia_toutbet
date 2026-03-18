import "./globals.css";
import { AuthProvider } from "./providers";
import Header from "./components/Header";

export const metadata = {
  title: "ToutBet MVP",
  description: "Interface MVP (Next.js) pour l'API ToutBet",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <div className="container">
            <Header />
            <div style={{ height: 14 }} />
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}


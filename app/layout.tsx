import "./globals.css";
import AuthenticatedShell from "../components/AuthenticatedShell";

export const metadata = {
  title: "Bakerss OS",
  description: "Bakerss Property Services LLC Operations Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthenticatedShell>{children}</AuthenticatedShell>
      </body>
    </html>
  );
}
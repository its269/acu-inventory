import "./globals.css";

export const metadata = {
  title: "KGS PURCHASING",
  description: "Sign in to your account",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/kelin-logo.png" type="image/png" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

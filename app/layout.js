import "./globals.css";

export const metadata = {
  title: "KGS PURCHASING",
  description: "Sign in to your account",
  icons: {
    icon: "/KELIN LOGO-01.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Sign In",
  description: "Sign in to your account",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ritual Predict",
  description: "A self-resolving prediction market on Ritual Chain",
  icons: { icon: "/ritual-predict.png" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar__inner">
            <div className="brand">
              <Image src="/ritual-predict.png" alt="" width={36} height={36} priority />
              <div>
                <strong>Ritual Predict</strong>
                <span>Ritual Chain testnet</span>
              </div>
            </div>
            <div id="wallet-slot" />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

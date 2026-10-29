import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Newsreader } from "next/font/google";
import { Header } from "@/components/Header";
import { MessagesProvider } from "@/components/Messages";
import { NotificationsProvider } from "@/components/Notifications";
import { Providers } from "@/components/Providers";
import { Rail } from "@/components/Rail";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], weight: ["400", "500"], variable: "--font-serif", display: "swap" });
const sans = Libre_Franklin({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "listener", template: "%s · listener" },
  description: "Rate and review albums and songs, and see what your friends are listening to.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the saved Paper/Evening choice before first paint so the page never flashes the wrong theme.
const themeScript = `try{var l=localStorage.getItem("listener-look");document.documentElement.dataset.look=l==="dark"||l==="system"?l:"light"}catch(e){document.documentElement.dataset.look="light"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`} data-look="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Providers>
          <NotificationsProvider>
            <MessagesProvider>
              <Rail />
              <Header />
              <main className="wrap">{children}</main>
            </MessagesProvider>
          </NotificationsProvider>
        </Providers>
      </body>
    </html>
  );
}

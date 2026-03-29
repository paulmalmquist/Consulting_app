import localFont from "next/font/local";

export const mandaloreCommand = localFont({
  src: [
    {
      path: "../app/fonts/mandalore/mandaloretitle.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../app/fonts/mandalore/mandalorecond.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../app/fonts/mandalore/mandalore.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-command",
  display: "swap",
});

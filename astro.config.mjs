import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";
import { sidebar } from "./src/sidebar.ts";

// Frozen after wave 0.
export default defineConfig({
  site: "https://docs.codexsuite.app",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "Codex documentation",
      description: "Install Codex, learn every screen, connect agents and take a book from idea to print.",
      logo: {
        light: "./public/brand/codex-logo-on-light.svg",
        dark: "./public/brand/codex-logo-on-dark.svg",
        alt: "Codex",
        replacesTitle: true,
      },
      favicon: "/brand/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/codexsuite/docs" },
      ],
      customCss: [
        "@fontsource/inter/400.css",
        "@fontsource/inter/500.css",
        "@fontsource/inter/600.css",
        "@fontsource/inter/700.css",
        "./src/styles/tokens.css",
        "./src/styles/brand.css",
      ],
      sidebar,
      plugins: [
        starlightLinksValidator({
          errorOnRelativeLinks: true,
          errorOnInvalidHashes: true,
          errorOnLocalLinks: true,
        }),
      ],
    }),
  ],
});

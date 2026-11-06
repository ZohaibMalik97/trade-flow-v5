import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/** For the single-file build: embed favicons as data URIs instead of /brand/ paths. */
function inlineFavicons(): Plugin {
  const data = (f: string) => `data:image/png;base64,${readFileSync(new URL(`./public/brand/${f}`, import.meta.url)).toString('base64')}`
  return {
    name: 'inline-favicons',
    transformIndexHtml: (html) =>
      html.replace(/href="\/brand\/(favicon-\d+\.png)"/g, (_m, f: string) => `href="${data(f)}"`),
  }
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // Development: the SPA calls /api/v1 on its own origin and Vite forwards to the ASP.NET Core API, so the
    // HttpOnly refresh cookie is first-party (SameSite=Strict/Lax works) and no CORS is needed.
    server: { proxy: { '/api': { target: env.TRADEFLOW_API_PROXY_TARGET || 'http://localhost:5180', changeOrigin: false, secure: false } } },
    plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile(), inlineFavicons()] : [])],
    define: single ? { 'import.meta.env.VITE_SINGLE_FILE': JSON.stringify('true') } : {},
    build: single ? { outDir: 'dist-single', copyPublicDir: false, assetsInlineLimit: 100_000_000 } : {},
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})

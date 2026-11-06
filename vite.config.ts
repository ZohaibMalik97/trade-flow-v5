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
  // The browser calls the API directly. API_TARGET=local|prod picks LOCAL_API_URL or PROD_API_URL
  // (see .env / .env.local); VITE_API_BASE_URL, if set, overrides both.
  const target = env.API_TARGET === 'prod' ? 'prod' : 'local'
  const apiHost = (target === 'prod' ? env.PROD_API_URL : env.LOCAL_API_URL)?.replace(/\/$/, '')
  const apiBase = env.VITE_API_BASE_URL || (apiHost ? `${apiHost}/api/v1` : '/api/v1')
  console.log(`[vite] API (${target}) → ${apiBase}`)
  return {
    plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile(), inlineFavicons()] : [])],
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBase),
      ...(single ? { 'import.meta.env.VITE_SINGLE_FILE': JSON.stringify('true') } : {}),
    },
    build: single ? { outDir: 'dist-single', copyPublicDir: false, assetsInlineLimit: 100_000_000 } : {},
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})

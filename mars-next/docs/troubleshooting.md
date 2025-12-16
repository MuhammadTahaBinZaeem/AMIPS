# Troubleshooting

## npm installation failures on Windows
If `npm install` ends with cleanup errors like `EPERM: operation not permitted` on `node_modules` directories (for example `@babel` or `sucrase`), Windows file locks are usually preventing npm from removing folders. Try the following steps:

1. Close any running dev servers, editors, or terminals that might be holding open files inside the repository.
2. Run the new cleanup helper to forcefully remove dependencies and build artifacts using `rimraf`, which copes well with long Windows paths:
   ```bash
   npm run clean:modules
   ```
3. Reinstall dependencies:
   ```bash
   npm install
   ```
4. If locks persist, reboot or run the commands in an elevated PowerShell prompt to ensure no background process is keeping files in `node_modules`.

## Deprecated `boolean@3.2.0` warning
The install may print a deprecation warning for `boolean@3.2.0`. This comes from Electron's optional proxy helper (`global-agent`) and does not block installs or builds. After cleaning with the steps above, the warning can be safely ignored until upstream packages drop the dependency.

## TLS handshake errors when starting Electron
Some Windows environments inject custom certificates that can cause repeated messages like `ssl_client_socket_impl.cc(878) handshake failed` when launching `npm run dev`. The dev server prefers HTTP where possible and now instructs Electron to allow insecure localhost certificates when `VITE_DEV_SERVER_URL` uses HTTPS. If the errors persist, override the dev server URL to use HTTP explicitly:

```bash
set VITE_DEV_SERVER_URL=http://localhost:5173
npm run dev
```

## Blank black window when launching the desktop app
If the Electron window opens but appears as a solid black screen, the renderer bundle or the pseudo-instruction table could not be loaded:

- Confirm the React renderer is available:
  - Development: run the dev stack with `npm run dev`, which starts the Vite server on `http://localhost:5173` (or the `VITE_DEV_SERVER_URL` override).
  - Production: build the renderer with `npm run build` so `dist/renderer/index.html` exists before launching Electron.
- Ensure a pseudo-op table is present: keep `PseudoOps.txt` (or `PseudoOps.json`) in the repo root or `config/` so the assembler can initialise correctly. The bundled copy under `resources/` will be used if no override is provided.

The Electron main process falls back to an inline error page when it cannot find the renderer bundle, but its dark colour scheme can look like an empty black window if CSS fails to load. Serving the dev renderer or building the production bundle restores the UI.

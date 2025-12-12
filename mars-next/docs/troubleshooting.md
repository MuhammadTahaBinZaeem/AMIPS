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

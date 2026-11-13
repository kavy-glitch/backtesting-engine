# Troubleshooting

Always start with: `docker compose ps` and `docker compose logs --tail=80 api` (also `db`, `web`).

| Symptom | Cause and fix |
|---|---|
| `error during connect … docker daemon is not running` / `failed to connect to the docker API` | Start **Docker Desktop** and wait for "Engine running". If it won't start, enable **WSL 2** (`wsl --install`, then reboot) and virtualisation in the BIOS. |
| `required variable MYSQL_ROOT_PASSWORD is missing a value` (or `PBE_DB_PASSWORD`, `PBE_READONLY_PASSWORD`) | You have no `.env`, or a value is empty. `Copy-Item .env.example .env` and set the three passwords. **Invalid environment variables** show up exactly like this at `docker compose up`. |
| `port is already allocated` / `bind: Only one usage of each socket address` | Another program uses 8080, 8000 or 3307. Find it: `netstat -ano \| findstr :8080`. Either stop it or change `PBE_WEB_PORT`, `PBE_API_PORT`, `PBE_DB_HOST_PORT` in `.env`, then `docker compose up -d`. (If you change the web port, add the new origin to `PBE_CORS_ORIGINS` when you use the API directly from a browser.) |
| API container restarts / `Access denied for user` / the app shows "database not reachable" | Passwords in `.env` changed **after** the database volume was created (MySQL stores them on first start). Reset: `docker compose down -v` then `docker compose up --build -d` (this deletes saved backtests and imported data). |
| `db` is `unhealthy` or restarts | `docker compose logs db`. Common causes: out of disk space; a half-initialised volume (use `down -v`); on Windows an `02_security.sh` with CRLF line endings (the repo's `.gitattributes` forces LF; if you edited it in a Windows editor, convert to LF). |
| Status pill says **API offline** / "Cannot reach the server" | `docker compose ps` — is `api` healthy? Wait ~30 s after start. `docker compose logs api`. Open http://localhost:8000/api/v1/health. |
| Status pill says **Degraded: database** or **engine** | `database`: see the passwords row above. `engine`: the engine binary is missing in the image: `docker compose build --no-cache api` and read the build log for the CMake step. |
| Browser console shows **CORS error** | Only happens when the page origin is not in `PBE_CORS_ORIGINS` (e.g. you opened the app on a different port or host). Add it (comma separated) in `.env` and `docker compose up -d`. Through http://localhost:8080 there is no CORS involved (same origin via nginx). |
| "No candles for X in the selected period" / empty dropdowns | No market data loaded. *Market data* page → fetch a ticker, import a CSV, or load the demo set: `docker compose exec api python -m scripts.load_demo_data`. |
| Yahoo fetch fails: `No data returned`, `Too Many Requests`, timeout | Check the ticker (`RELIANCE.NS`, not `RELIANCE`), the dates and your internet connection; Yahoo rate-limits and changes without notice. Retry later, or import a CSV, or use the synthetic data. |
| CSV rejected | The error lists the row numbers. Header must contain `Date,Open,High,Low,Close,Volume`; dates `YYYY-MM-DD`; no empty or non-numeric cells; `High ≥ Open, Close, Low`; no duplicate dates. |
| `SMA Crossover needs at least N candles …` | The selected period is too short for the indicator periods. Widen the dates or use smaller periods. |
| Changed `database/schema.sql` but nothing changes | MySQL only runs the init scripts on a **new** volume: `docker compose down -v && docker compose up --build -d`. |
| `web` build fails: `npm ci` / TypeScript errors | `docker compose build --no-cache web` and read the first error. The Dockerfile uses Node 22 and the pinned `package-lock.json`; do not delete the lock file. |
| `api` build fails in the CMake step | Needs internet only for the apt packages (`build-essential`, `cmake`). Behind a proxy, configure Docker Desktop's proxy settings. |
| Tests fail | `docker compose --profile test run --rm tests` needs the `db` service healthy (it starts it). It creates/drops its own `pbe_test` database. Engine tests: `docker build --target engine-tests -f backend/Dockerfile .` downloads GoogleTest from GitHub (needs internet). Read the first failing assertion, not the last line. |
| Page is blank after an update | Hard refresh (Ctrl+F5); `docker compose up --build -d web` to rebuild the front end. |
| Everything is slow on first run | The first `up --build` downloads base images and compiles C++; later starts take seconds. |

### Running without Docker: common problems

* `mysql` not found → add MySQL's `bin` folder to `PATH`.
* `engine.exe` not found by the API → set `PBE_ENGINE_PATH` to its full path (the `Release` sub-folder with Visual Studio generators).
* `'cmake' is not recognized` → install CMake and reopen PowerShell.
* `ModuleNotFoundError` → the virtual environment is not active (`.\.venv\Scripts\Activate.ps1`) or `pip install -r requirements.txt` was not run.
* PowerShell blocks `Activate.ps1` → `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

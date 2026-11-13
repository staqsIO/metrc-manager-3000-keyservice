# metrc-manager-3000-keyservice

A small service that holds one shared OpenRouter API key, encrypted at rest in Postgres, and serves it to your platform instances. Rotate the key in one place; consumers cache it for 5 minutes.

## When to use it

Use it when several platform instances share one OpenRouter key and you want to rotate it centrally. With a single instance, skip this service and paste the key in the platform's LLM provider settings.

## API

All endpoints except health require `Authorization: Bearer <KEY_SERVICE_API_KEY>`.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/openrouter-key` | Bearer | Returns the active OpenRouter key |
| POST | `/api/refresh` | Bearer | Drops the cache and reloads the key from the database |
| GET | `/api/health` | none | Reports the cached key state (may lag a DB outage by up to the 5-minute cache); not a live DB check |

Error responses are generic. Only decryption failures (`DecryptError`) return details to clients; other errors are logged server-side only.

## Set or rotate the key

Pass the key on stdin (`-`) so it does not land in your shell history:

```bash
printf '%s' "$NEW_KEY" | docker compose run --rm -T keyservice node cli.js set-key openrouter -
docker compose run --rm keyservice node cli.js list openrouter
```

If you type it interactively, run the command, paste the key, then press Ctrl-D.

After `set-key`, running services keep serving the cached key for up to 5 minutes. To apply it immediately, `POST /api/refresh` with the bearer token.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `KEY_SERVICE_API_KEY` | yes | Bearer token clients send. Generate with `openssl rand -hex 32` |
| `KEYSERVICE_DATABASE_URL` | yes | Postgres connection string |
| `KEYSERVICE_ENCRYPTION_KEY` | yes | Encrypts stored keys. Generate with `openssl rand -hex 32`; never change it after storing keys |
| `PORT` | no | Listen port, default `3001` |
| `ALLOWED_ORIGINS` | no | Comma-separated browser origins allowed via CORS; empty means none |

See `.env.example`.

## Connecting the platform

Super Admin, then LLM Providers, then OpenRouter. Set Key service URL to `http://keyservice:3001` and enter the `KEY_SERVICE_API_KEY` value as the token.

## Security notes

- The bearer token is compared in constant time.
- Keys are encrypted at rest with `KEYSERVICE_ENCRYPTION_KEY`.
- CORS is off by default; enable origins explicitly with `ALLOWED_ORIGINS`.
- Only `DecryptError` details are returned to clients.

## Development

```bash
npm ci
TEST_POSTGRES_URL=postgresql://postgres:pw@localhost:5432/postgres npm test
```

Store tests need a reachable Postgres via `TEST_POSTGRES_URL`.

## Contributors

Created by [Staqs](https://github.com/staqsIO), [Waev Tech](https://github.com/waevtech) and [UMB Advisors](https://github.com/UMB-Advisors). See the [root repository](https://github.com/staqsIO/metrc-manager-3000#contributors) for details.

## License

MIT. See `LICENSE`.

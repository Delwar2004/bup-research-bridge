# BUP Research Bridge API

Node.js and Express implementation of `docs/api/API_CONTRACT.md`. PostgreSQL is the only datastore. This package does not change the schema or the contract.

## Requirements

- Node.js 20 or newer
- PostgreSQL with the migrations in `database/migrations` applied

## Setup

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
```

Set `DATABASE_URL` and a `JWT_SECRET` of at least 32 characters in `.env`. Do not commit `.env`.

The first administrator is not created by a public endpoint. After migrations:

```bash
ADMIN_FULL_NAME="Platform Admin" ADMIN_EMAIL="admin@bup.edu.bd" ADMIN_PASSWORD="change-this-password" npm run create-admin
```

## Run

```bash
npm start
```

The API is served at `http://localhost:3000/api/v1`.

## Tests

Tests use `DATABASE_URL` when it is already set. Otherwise they use a local database named `bup_research_bridge_test` and apply the repository migrations themselves.

```bash
npm test
```

## Layout

`src/routes` exposes the contract paths. Controllers are the route handlers in that file. `src/services` holds rules and transactions. `src/repositories` holds parameterized SQL. Passwords are bcrypt hashes. Access tokens are JWTs. Refresh tokens are stored only as SHA-256 hashes in `refresh_tokens`.

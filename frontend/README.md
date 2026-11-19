# Gather frontend

React event discovery and registration frontend backed by the Flask API at
`https://dash-o5vo.onrender.com`.

## Run locally

Install Node.js 22.12 or newer, then run `npm install` and `npm run dev` from
this folder. The API base URL is read from `local.env` and can be changed there.

The app loads events from `GET /api/events`. A visitor can register with an
email address only; no password or sign-in is used. The email maps to a user
record through `POST /api/users`, then the app creates a registration through
`POST /api/registrations`. The visitor's user ID stays in this browser's local
storage so “My registrations” can load without a login flow.

The `design` folder mentioned for the visual reference was not present in the
workspace. The interface uses the lavender and orange colors from the API
reference screenshot instead.

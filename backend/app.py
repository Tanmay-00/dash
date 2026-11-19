import os
from uuid import UUID

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from postgrest import APIError
from supabase import Client, create_client

load_dotenv()

app = Flask(__name__)

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
supabase: Client | None = (
    create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None
)


@app.after_request
def enable_cors(response):
    """Allow browser clients from any origin to call this API."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


def database():
    if supabase is None:
        return None, (jsonify(error="Database is not configured"), 503)
    return supabase, None


def valid_uuid(value):
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError):
        return None


def db_error(error):
    # PostgREST provides useful status codes for common cases (such as unique
    # constraint violations); avoid returning database details to API clients.
    code = getattr(error, "code", None)
    if code == "23505":
        return jsonify(error="Registration already exists"), 409
    if code == "23503":
        return jsonify(error="Referenced user or event does not exist"), 400
    return jsonify(error="Database request failed"), 500


@app.get("/")
def index():
    return jsonify(message="Events API", endpoints=[
        "/api/events", "/api/events/<id>", "/api/registrations",
        "/api/me/registrations?user_id=<uuid>",
        "/api/events/<id>/registrations?user_id=<uuid>",
    ])


@app.get("/api/events")
def list_events():
    client, error = database()
    if error:
        return error
    try:
        result = client.table("events").select("*").execute()
        return jsonify(result.data), 200
    except APIError as exc:
        return db_error(exc)


@app.get("/api/events/<event_id>")
def get_event(event_id):
    event_id = valid_uuid(event_id)
    if not event_id:
        return jsonify(error="Invalid event id"), 400
    client, error = database()
    if error:
        return error
    try:
        result = client.table("events").select("*").eq("id", event_id).maybe_single().execute()
        if not result.data:
            return jsonify(error="Event not found"), 404
        return jsonify(result.data), 200
    except APIError as exc:
        return db_error(exc)


@app.post("/api/registrations")
def create_registration():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Request body must be a JSON object"), 400

    user_id = valid_uuid(payload.get("user_id"))
    event_id = valid_uuid(payload.get("event_id"))
    if not user_id or not event_id:
        return jsonify(error="user_id and event_id must be valid UUIDs"), 400

    client, error = database()
    if error:
        return error
    try:
        event_result = (
            client.table("events").select("id,capacity,status")
            .eq("id", event_id).maybe_single().execute()
        )
        event = event_result.data
        if not event:
            return jsonify(error="Event not found"), 404
        if event.get("status", "").lower() not in ("open", "published", "active"):
            return jsonify(error="Event is not open for registration"), 409

        # The unique (user_id, event_id) constraint should also be present in
        # the database to make duplicate prevention safe under concurrent calls.
        existing = (
            client.table("registrations").select("id")
            .eq("user_id", user_id).eq("event_id", event_id).limit(1).execute()
        )
        if existing.data:
            return jsonify(error="User is already registered for this event"), 409

        capacity = event.get("capacity")
        if capacity is not None:
            count_result = (
                client.table("registrations").select("id", count="exact")
                .eq("event_id", event_id).execute()
            )
            if (count_result.count or 0) >= capacity:
                return jsonify(error="Event is at capacity"), 409

        inserted = (
            client.table("registrations")
            .insert({"user_id": user_id, "event_id": event_id})
            .execute()
        )
        return jsonify(inserted.data[0] if inserted.data else {}), 201
    except APIError as exc:
        return db_error(exc)


@app.get("/api/me/registrations")
def my_registrations():
    # With authentication intentionally disabled, callers specify which
    # user's registrations they want; user_id is not an identity assertion.
    user_id = valid_uuid(request.args.get("user_id"))
    if not user_id:
        return jsonify(error="A valid user_id query parameter is required"), 400
    client, error = database()
    if error:
        return error
    try:
        result = (
            client.table("registrations").select("*")
            .eq("user_id", user_id).execute()
        )
        return jsonify(result.data), 200
    except APIError as exc:
        return db_error(exc)


@app.get("/api/events/<event_id>/registrations")
def event_registrations(event_id):
    event_id = valid_uuid(event_id)
    user_id = valid_uuid(request.args.get("user_id"))
    if not event_id:
        return jsonify(error="Invalid event id"), 400
    if not user_id:
        return jsonify(error="A valid user_id query parameter is required"), 400
    client, error = database()
    if error:
        return error
    try:
        event_result = (
            client.table("events").select("organizer_id")
            .eq("id", event_id).maybe_single().execute()
        )
        event = event_result.data
        if not event:
            return jsonify(error="Event not found"), 404
        # This is a caller-supplied ID check, not authentication. Anyone can
        # claim the organizer's UUID while the API has no identity mechanism.
        if event.get("organizer_id") != user_id:
            return jsonify(error="Only the event organizer can view registrations"), 403
        result = (
            client.table("registrations").select("*")
            .eq("event_id", event_id).execute()
        )
        return jsonify(result.data), 200
    except APIError as exc:
        return db_error(exc)


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true")

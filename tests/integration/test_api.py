"""
Integration tests for the FastAPI application.
Tests the full HTTP layer with a real database (temp dir, not in-memory).
Ollama calls are not made — no GPU required.
"""
import json
import datetime
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import backend.config as cfg_mod
    tmp = tmp_path_factory.mktemp("integration")

    config = {
        "models": {"study":"mock","coding":"mock","general":"mock","embed":"mock"},
        "user":   {"name":"TestUser","brief":"Testing.","city":"Amsterdam","timezone":"Europe/Amsterdam"},
        "news":   {"sources": []},
        "apps":   {},
        "server": {"host":"127.0.0.1","port":17777},
        "data_dir": str(tmp / "data"),
    }
    (tmp / "config.json").write_text(json.dumps(config))
    (tmp / "data").mkdir()

    cfg_mod.CONFIG_PATH  = tmp / "config.json"
    cfg_mod.PROJECT_ROOT = tmp

    from backend.app import create_app
    return TestClient(create_app())


@pytest.fixture(scope="module")
def auth_client(client):
    resp = client.post("/api/unlock", json={"password": "integration-test-pw"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    return client


# ── Auth ───────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_status_endpoint_exists(self, client):
        assert client.get("/api/status").status_code == 200

    def test_unlock_fresh_db(self, client):
        resp = client.post("/api/unlock", json={"password": "integration-test-pw"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_wrong_password_rejected(self, auth_client):
        auth_client.post("/api/journal", json={"content": "seed"})
        resp = auth_client.post("/api/unlock", json={"password": "wrong"})
        assert resp.status_code == 401

    def test_lock_then_relock(self, auth_client):
        assert auth_client.post("/api/lock").status_code == 200
        auth_client.post("/api/unlock", json={"password": "integration-test-pw"})


# ── Profile ────────────────────────────────────────────────────────────────────

class TestProfile:
    def test_get_profile(self, auth_client):
        resp = auth_client.get("/api/profile")
        assert resp.status_code == 200
        assert resp.json()["name"] == "TestUser"

    def test_update_profile(self, auth_client):
        resp = auth_client.put("/api/profile", json={"name": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["user"]["name"] == "Updated"
        auth_client.put("/api/profile", json={"name": "TestUser"})


# ── App system ─────────────────────────────────────────────────────────────────

class TestAppSystem:
    def test_list_apps_returns_all(self, auth_client):
        resp = auth_client.get("/api/apps")
        assert resp.status_code == 200
        apps = resp.json()
        ids  = {a["id"] for a in apps}
        # Core apps
        for expected in ["chat", "history", "models", "profile"]:
            assert expected in ids
        # Optional apps
        for expected in ["fitness", "reminders", "news", "projects", "journal", "calendar"]:
            assert expected in ids

    def test_core_app_cannot_be_disabled(self, auth_client):
        resp = auth_client.put("/api/apps/chat", json={"enabled": False})
        assert resp.status_code == 400

    def test_disable_and_enable_optional_app(self, auth_client):
        # Disable fitness
        resp = auth_client.put("/api/apps/fitness", json={"enabled": False})
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

        # Check it shows as disabled
        apps   = auth_client.get("/api/apps").json()
        fitness = next(a for a in apps if a["id"] == "fitness")
        assert fitness["enabled"] is False

        # Re-enable
        resp = auth_client.put("/api/apps/fitness", json={"enabled": True})
        assert resp.status_code == 200
        assert resp.json()["enabled"] is True

    def test_unknown_app_returns_404(self, auth_client):
        assert auth_client.put("/api/apps/nonexistent_xyz", json={"enabled": True}).status_code == 404

    def test_optional_apps_default_to_enabled(self, auth_client):
        apps = auth_client.get("/api/apps").json()
        for app in apps:
            if not app["core"] and app["id"] not in ("news",):
                # All optional apps should default to enabled on a fresh config
                assert app["enabled"] is True, f"{app['id']} should default to enabled"


# ── Reminders ──────────────────────────────────────────────────────────────────

class TestReminders:
    def test_create_list_delete(self, auth_client):
        resp = auth_client.post("/api/reminders", json={"title": "Test", "due_date": "2030-12-31"})
        assert resp.status_code == 200
        rid  = resp.json()["id"]

        assert any(r["id"] == rid for r in auth_client.get("/api/reminders").json())

        auth_client.delete(f"/api/reminders/{rid}")
        assert not any(r["id"] == rid for r in auth_client.get("/api/reminders").json())

    def test_mark_done(self, auth_client):
        rid = auth_client.post("/api/reminders", json={"title":"Done","due_date":"2030-12-31"}).json()["id"]
        auth_client.patch(f"/api/reminders/{rid}/done")
        assert not any(r["id"] == rid for r in auth_client.get("/api/reminders").json())


# ── Fitness ────────────────────────────────────────────────────────────────────

class TestFitness:
    def test_log_and_retrieve(self, auth_client):
        today = datetime.date.today().isoformat()
        resp  = auth_client.post("/api/fitness", json={"date":today,"calories":2100,"weight":75.5,"workout":"chest"})
        assert resp.status_code == 200

        entries = auth_client.get("/api/fitness?period=month").json()
        entry   = next((e for e in entries if e["date"] == today), None)
        assert entry is not None
        assert entry["calories"] == 2100
        assert entry["weight"]   == 75.5
        assert "chest" in entry["workout"]


# ── Projects ───────────────────────────────────────────────────────────────────

class TestProjects:
    def test_create_list(self, auth_client):
        pid = auth_client.post("/api/projects", json={"name":"P","description":"D","color":"#00c8f0"}).json()["id"]
        assert any(p["id"] == pid for p in auth_client.get("/api/projects").json())

    def test_add_text_file_read_back(self, auth_client):
        pid    = auth_client.post("/api/projects", json={"name":"FP","description":""}).json()["id"]
        fid    = auth_client.post(f"/api/projects/{pid}/files/text",
                                   json={"filename":"notes.md","content":"hello","mime_type":"text/plain"}).json()["id"]
        read   = auth_client.get(f"/api/projects/{pid}/files/{fid}/content").json()
        assert read["content"]  == "hello"
        assert read["filename"] == "notes.md"

    def test_edit_file(self, auth_client):
        pid = auth_client.post("/api/projects", json={"name":"EP","description":""}).json()["id"]
        fid = auth_client.post(f"/api/projects/{pid}/files/text",
                                json={"filename":"e.md","content":"original"}).json()["id"]
        auth_client.put(f"/api/projects/{pid}/files/{fid}/content", json={"content":"updated"})
        assert auth_client.get(f"/api/projects/{pid}/files/{fid}/content").json()["content"] == "updated"

    def test_delete_project(self, auth_client):
        pid = auth_client.post("/api/projects", json={"name":"Del","description":""}).json()["id"]
        auth_client.delete(f"/api/projects/{pid}")
        assert not any(p["id"] == pid for p in auth_client.get("/api/projects").json())


# ── News sources ───────────────────────────────────────────────────────────────

class TestNewsSources:
    def test_add_delete(self, auth_client):
        auth_client.post("/api/news-sources", json={
            "id":"test_src","name":"Test","country":"World",
            "url":"https://example.com/rss","enabled":True,
        })
        auth_client.delete("/api/news-sources/test_src")
        assert not any(s["id"] == "test_src" for s in auth_client.get("/api/news-sources").json())


# ── Calendar ───────────────────────────────────────────────────────────────────

class TestCalendar:
    def test_create_and_get_task(self, auth_client):
        today = datetime.date.today().isoformat()
        resp  = auth_client.post("/api/calendar/tasks", json={
            "title":"Study OS","description":"Chapter 4",
            "date": today,"start_time":"10:00",
            "duration_minutes":90,"level":"high","group_id":None,
        })
        assert resp.status_code == 200
        assert resp.json()["id"] is not None

        day = auth_client.get(f"/api/calendar/items?date={today}").json()
        assert any(t["title"] == "Study OS" for t in day["tasks"])

    def test_toggle_task_done(self, auth_client):
        today = datetime.date.today().isoformat()
        tid   = auth_client.post("/api/calendar/tasks", json={
            "title":"Toggle me","description":"","date":today,
            "level":"low","group_id":None,
        }).json()["id"]

        resp = auth_client.patch(f"/api/calendar/tasks/{tid}/done")
        assert resp.status_code == 200
        assert resp.json()["done"] is True

        # Toggle back
        resp = auth_client.patch(f"/api/calendar/tasks/{tid}/done")
        assert resp.json()["done"] is False

    def test_update_task(self, auth_client):
        today = datetime.date.today().isoformat()
        tid   = auth_client.post("/api/calendar/tasks", json={
            "title":"Original","description":"","date":today,"level":"low","group_id":None,
        }).json()["id"]

        auth_client.put(f"/api/calendar/tasks/{tid}", json={
            "title":"Updated","description":"edited","date":today,
            "start_time":None,"duration_minutes":0,"level":"high","group_id":None,
        })
        day = auth_client.get(f"/api/calendar/items?date={today}").json()
        assert any(t["title"] == "Updated" for t in day["tasks"])

    def test_delete_task(self, auth_client):
        today = datetime.date.today().isoformat()
        tid   = auth_client.post("/api/calendar/tasks", json={
            "title":"Delete me","description":"","date":today,"level":"low","group_id":None,
        }).json()["id"]
        auth_client.delete(f"/api/calendar/tasks/{tid}")
        day = auth_client.get(f"/api/calendar/items?date={today}").json()
        assert not any(t["id"] == tid for t in day["tasks"])

    def test_create_event(self, auth_client):
        today    = datetime.date.today().isoformat()
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        resp     = auth_client.post("/api/calendar/events", json={
            "title":"Night event","description":"","start_date":today,
            "start_time":"23:00","end_date":tomorrow,"end_time":"01:00","level":"mid",
        })
        assert resp.status_code == 200
        eid = resp.json()["id"]

        day = auth_client.get(f"/api/calendar/items?date={today}").json()
        assert any(e["id"] == eid for e in day["events"])

    def test_delete_event(self, auth_client):
        today = datetime.date.today().isoformat()
        eid   = auth_client.post("/api/calendar/events", json={
            "title":"Del event","description":"","start_date":today,
            "start_time":"12:00","level":"low",
        }).json()["id"]
        auth_client.delete(f"/api/calendar/events/{eid}")
        day = auth_client.get(f"/api/calendar/items?date={today}").json()
        assert not any(e["id"] == eid for e in day["events"])

    def test_month_view_includes_tasks(self, auth_client):
        today = datetime.date.today()
        auth_client.post("/api/calendar/tasks", json={
            "title":"Month test","description":"","date":today.isoformat(),"level":"low","group_id":None,
        })
        resp = auth_client.get(f"/api/calendar/month?year={today.year}&month={today.month}")
        assert resp.status_code == 200
        data = resp.json()
        assert today.isoformat() in data
        assert any(t["title"] == "Month test" for t in data[today.isoformat()]["tasks"])

    def test_groups_crud(self, auth_client):
        # Create
        resp = auth_client.post("/api/calendar/groups", json={"name":"Study","color":"#3d8ef5"})
        assert resp.status_code == 200
        gid  = resp.json()["id"]

        # List
        groups = auth_client.get("/api/calendar/groups").json()
        assert any(g["id"] == gid for g in groups)

        # Update
        auth_client.put(f"/api/calendar/groups/{gid}", json={"name":"Study Updated","color":"#00c8f0"})
        groups = auth_client.get("/api/calendar/groups").json()
        assert any(g["name"] == "Study Updated" for g in groups)

        # Delete
        auth_client.delete(f"/api/calendar/groups/{gid}")
        groups = auth_client.get("/api/calendar/groups").json()
        assert not any(g["id"] == gid for g in groups)

    def test_calendar_settings_get_and_update(self, auth_client):
        resp = auth_client.get("/api/calendar/settings")
        assert resp.status_code == 200
        settings = resp.json()
        assert "context_days_before" in settings
        assert "context_days_ahead"  in settings

        resp = auth_client.put("/api/calendar/settings",
                               json={"context_days_before": 14, "context_days_ahead": 60})
        assert resp.status_code == 200
        assert resp.json()["context_days_before"] == 14
        assert resp.json()["context_days_ahead"]  == 60

        # Restore defaults
        auth_client.put("/api/calendar/settings",
                        json={"context_days_before": 7, "context_days_ahead": 30})

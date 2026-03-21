"""
Integration tests for the FastAPI application.
Tests the full HTTP layer with a real (in-memory) database.
Ollama calls are mocked so no GPU is required in CI.
"""
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    """
    Creates a TestClient with a temporary config and data directory.
    Patches Ollama so no model needs to be running.
    """
    import backend.config as cfg_mod
    tmp = tmp_path_factory.mktemp("integration")

    config = {
        "models": {"study": "mock", "coding": "mock", "general": "mock", "embed": "mock"},
        "user":   {"name": "TestUser", "brief": "Testing.", "city": "Amsterdam", "timezone": "Europe/Amsterdam"},
        "news":   {"sources": []},
        "server": {"host": "127.0.0.1", "port": 17777},
        "data_dir": str(tmp / "data"),
    }
    (tmp / "config.json").write_text(json.dumps(config))
    (tmp / "data").mkdir()

    cfg_mod.CONFIG_PATH  = tmp / "config.json"
    cfg_mod.PROJECT_ROOT = tmp

    from backend.app import create_app
    app = create_app()
    return TestClient(app)


@pytest.fixture(scope="module")
def auth_client(client):
    """Returns a client that has already unlocked with a test password."""
    resp = client.post("/api/unlock", json={"password": "integration-test-pw"})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    return client


class TestAuth:
    def test_status_returns_unlocked_false_initially(self, client):
        resp = client.get("/api/status")
        assert resp.status_code == 200

    def test_unlock_succeeds_with_any_password_on_fresh_db(self, client):
        resp = client.post("/api/unlock", json={"password": "integration-test-pw"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_wrong_password_rejected_on_existing_db(self, auth_client):
        # First add some data so the DB has encrypted content to validate against
        auth_client.post("/api/journal", json={"content": "test entry"})
        # Now try wrong password
        resp = auth_client.post("/api/unlock", json={"password": "wrong-password"})
        assert resp.status_code == 401

    def test_lock_works(self, auth_client):
        resp = auth_client.post("/api/lock")
        assert resp.status_code == 200
        # Re-unlock for remaining tests
        auth_client.post("/api/unlock", json={"password": "integration-test-pw"})


class TestProfile:
    def test_get_profile_returns_user_data(self, auth_client):
        resp = auth_client.get("/api/profile")
        assert resp.status_code == 200
        assert resp.json()["name"] == "TestUser"

    def test_update_profile_name(self, auth_client):
        resp = auth_client.put("/api/profile", json={"name": "UpdatedName"})
        assert resp.status_code == 200
        assert resp.json()["user"]["name"] == "UpdatedName"
        # Restore
        auth_client.put("/api/profile", json={"name": "TestUser"})


class TestReminders:
    def test_create_and_list_reminder(self, auth_client):
        resp = auth_client.post("/api/reminders", json={"title": "Test reminder", "due_date": "2030-12-31"})
        assert resp.status_code == 200
        rid = resp.json()["id"]

        reminders = auth_client.get("/api/reminders").json()
        assert any(r["id"] == rid for r in reminders)

    def test_mark_reminder_done(self, auth_client):
        resp = auth_client.post("/api/reminders", json={"title": "Done test", "due_date": "2030-12-31"})
        rid  = resp.json()["id"]
        auth_client.patch(f"/api/reminders/{rid}/done")
        reminders = auth_client.get("/api/reminders").json()
        assert not any(r["id"] == rid for r in reminders)

    def test_delete_reminder(self, auth_client):
        resp = auth_client.post("/api/reminders", json={"title": "Delete me", "due_date": "2030-12-31"})
        rid  = resp.json()["id"]
        auth_client.delete(f"/api/reminders/{rid}")
        reminders = auth_client.get("/api/reminders").json()
        assert not any(r["id"] == rid for r in reminders)


class TestFitness:
    def test_log_and_retrieve_fitness(self, auth_client):
        import datetime
        # Use today so the entry always falls within the default 30-day window
        today = datetime.date.today().isoformat()
        resp = auth_client.post("/api/fitness", json={"date": today, "calories": 2100, "weight": 75.5, "workout": "chest"})
        assert resp.status_code == 200
        entries = auth_client.get("/api/fitness?period=month").json()
        entry   = next((e for e in entries if e["date"] == today), None)
        assert entry is not None
        assert entry["calories"] == 2100
        assert entry["weight"]   == 75.5
        assert "chest" in entry["workout"]


class TestProjects:
    def test_create_and_list_project(self, auth_client):
        resp = auth_client.post("/api/projects", json={"name": "Test Project", "description": "A test", "color": "#00c8f0"})
        assert resp.status_code == 200
        pid = resp.json()["id"]

        projects = auth_client.get("/api/projects").json()
        assert any(p["id"] == pid for p in projects)

    def test_add_text_file_and_read_back(self, auth_client):
        resp = auth_client.post("/api/projects", json={"name": "File Test", "description": ""})
        pid  = resp.json()["id"]

        content = "This is my lecture note content."
        f_resp  = auth_client.post(f"/api/projects/{pid}/files/text",
                                    json={"filename": "notes.md", "content": content, "mime_type": "text/plain"})
        assert f_resp.status_code == 200
        fid = f_resp.json()["id"]

        read = auth_client.get(f"/api/projects/{pid}/files/{fid}/content").json()
        assert read["content"]  == content
        assert read["filename"] == "notes.md"

    def test_edit_file_content(self, auth_client):
        resp = auth_client.post("/api/projects", json={"name": "Edit Test", "description": ""})
        pid  = resp.json()["id"]

        f_resp = auth_client.post(f"/api/projects/{pid}/files/text",
                                   json={"filename": "edit.md", "content": "original"})
        fid = f_resp.json()["id"]

        auth_client.put(f"/api/projects/{pid}/files/{fid}/content", json={"content": "updated content"})
        read = auth_client.get(f"/api/projects/{pid}/files/{fid}/content").json()
        assert read["content"] == "updated content"

    def test_delete_project_removes_files(self, auth_client):
        resp = auth_client.post("/api/projects", json={"name": "Delete Test", "description": ""})
        pid  = resp.json()["id"]
        auth_client.post(f"/api/projects/{pid}/files/text",
                          json={"filename": "f.txt", "content": "data"})

        auth_client.delete(f"/api/projects/{pid}")
        projects = auth_client.get("/api/projects").json()
        assert not any(p["id"] == pid for p in projects)


class TestNewsSources:
    def test_add_news_source(self, auth_client):
        resp = auth_client.post("/api/news-sources", json={
            "id": "test_feed", "name": "Test Feed",
            "country": "World", "url": "https://example.com/rss", "enabled": True,
        })
        assert resp.status_code == 200

    def test_toggle_news_source(self, auth_client):
        sources = auth_client.get("/api/news-sources").json()
        if not sources:
            auth_client.post("/api/news-sources", json={
                "id": "toggle_feed", "name": "Toggle Feed",
                "country": "World", "url": "https://example.com/rss", "enabled": True,
            })
            sources = auth_client.get("/api/news-sources").json()

        updated = [{**s, "enabled": not s["enabled"]} for s in sources]
        resp    = auth_client.put("/api/news-sources", json={"sources": updated})
        assert resp.status_code == 200

    def test_delete_news_source(self, auth_client):
        auth_client.post("/api/news-sources", json={
            "id": "delete_feed", "name": "Delete Feed",
            "country": "World", "url": "https://example.com/rss", "enabled": True,
        })
        resp = auth_client.delete("/api/news-sources/delete_feed")
        assert resp.status_code == 200
        sources = auth_client.get("/api/news-sources").json()
        assert not any(s["id"] == "delete_feed" for s in sources)

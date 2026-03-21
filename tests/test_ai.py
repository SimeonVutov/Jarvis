"""
Tests for mode detection and system prompt building.
No database or Ollama needed.

build_system_prompt signature (v2):
    (mode, memories, search_context, app_context, user)

app_context is a plain string produced by build_app_contexts().
The old separate projects/reminders parameters are gone — those are
now handled inside app_context.py and passed as a pre-built string.
"""
import inspect
import pytest
from backend.ai import detect_mode, build_system_prompt, should_web_search, format_search_results


class TestModeDetection:
    def test_coding_keywords_trigger_coding_mode(self):
        assert detect_mode("help me debug this C code")        == "coding"
        assert detect_mode("write a python function")          == "coding"
        assert detect_mode("gpio configuration for pico")      == "coding"
        assert detect_mode("how do I fix this segfault")       == "coding"
        assert detect_mode("makefile for embedded project")    == "coding"

    def test_study_keywords_trigger_study_mode(self):
        assert detect_mode("explain virtual memory")              == "study"
        assert detect_mode("I have an exam on OS scheduling")     == "study"
        assert detect_mode("derive the fourier transform")        == "study"
        assert detect_mode("how does the page table work")        == "study"
        assert detect_mode("studying linear algebra tonight")     == "study"
        assert detect_mode("explain the deadlock problem")        == "study"

    def test_general_message_keeps_current_mode(self):
        assert detect_mode("good morning",     "general") == "general"
        assert detect_mode("what time is it",  "coding")  == "coding"
        assert detect_mode("how are you",      "study")   == "study"

    def test_coding_takes_priority_when_both_match(self):
        assert detect_mode("write code for a sorting algorithm") == "coding"

    def test_case_insensitive(self):
        assert detect_mode("Help me DEBUG this Code") == "coding"
        assert detect_mode("EXPLAIN Virtual Memory")  == "study"

    def test_single_letter_c_does_not_false_positive(self):
        # "c" must only match as a standalone word, not inside other words
        assert detect_mode("I am scheduling my calendar") != "coding"
        assert detect_mode("accessing the cache")         != "coding"

    def test_css_does_not_match_process_or_access(self):
        assert detect_mode("the process accesses memory") != "coding"


class TestBuildSystemPrompt:
    def _p(self, mode="general", memories=None, search="", app_ctx="", user=None):
        """Shorthand to call build_system_prompt with defaults."""
        u = user or {"name": "Test", "brief": ""}
        return build_system_prompt(mode, memories or [], search, app_ctx, u)

    def test_signature_is_exactly_5_positional_args(self):
        params = list(inspect.signature(build_system_prompt).parameters.keys())
        assert params == ["mode", "memories", "search_context", "app_context", "user"]

    def test_contains_user_name(self):
        p = build_system_prompt("general", [], "", "", {"name": "Simeon", "brief": ""})
        assert "Simeon" in p

    def test_contains_user_brief(self):
        p = build_system_prompt("general", [], "", "", {"name": "T", "brief": "I study embedded systems."})
        assert "embedded systems" in p

    def test_mode_general(self):
        assert "personal AI" in self._p("general")

    def test_mode_coding(self):
        assert "CODING mode" in self._p("coding")

    def test_mode_study(self):
        assert "STUDY mode" in self._p("study")

    def test_memories_injected(self):
        p = self._p(memories=["User worked on ARM Cortex-M project."])
        assert "ARM Cortex-M" in p

    def test_empty_memories_no_memory_block(self):
        assert "MEMORY" not in self._p(memories=[])

    def test_search_context_injected(self):
        assert "WEB SEARCH" in self._p(search="WEB SEARCH: result")

    def test_empty_search_not_in_prompt(self):
        assert "WEB SEARCH" not in self._p(search="")

    def test_app_context_injected(self):
        ctx = "[FITNESS]\n  Today: 2100 kcal, chest"
        p   = self._p(app_ctx=ctx)
        assert "FITNESS"   in p
        assert "2100 kcal" in p

    def test_empty_app_context_not_injected(self):
        # No blank triple-newline sections
        assert self._p(app_ctx="").count("\n\n\n") == 0

    def test_reminders_come_through_app_context(self):
        ctx = "[REMINDERS]\n  • 2026-04-01: Submit homework"
        p   = self._p(app_ctx=ctx)
        assert "Submit homework" in p
        assert "2026-04-01"      in p

    def test_projects_come_through_app_context(self):
        ctx = "[PROJECTS]\nProject: Algorithm Design\n  File: notes.md\n  Content:\nQuicksort O(n log n)"
        p   = self._p(app_ctx=ctx)
        assert "Algorithm Design" in p
        assert "notes.md"         in p
        assert "Quicksort"        in p

    def test_calendar_comes_through_app_context(self):
        ctx = "[CALENDAR]\nUPCOMING TASKS:\n  • [HIGH] Study OS — 2026-04-02 — not done"
        p   = self._p(app_ctx=ctx)
        assert "CALENDAR" in p
        assert "Study OS" in p

    def test_all_sections_combined(self):
        ctx = "[FITNESS]\n  Today: 2100 kcal\n\n[REMINDERS]\n  • 2026-04-01: Exam"
        p   = self._p(
            memories=["User studying for OS exam."],
            search="WEB SEARCH: kernel news",
            app_ctx=ctx,
        )
        assert "OS exam"    in p
        assert "WEB SEARCH" in p
        assert "FITNESS"    in p
        assert "Exam"       in p


class TestWebSearch:
    def test_triggers_on_known_phrases(self):
        assert should_web_search("search for the latest news")   is True
        assert should_web_search("look up ollama documentation") is True
        assert should_web_search("what is the latest version")   is True

    def test_does_not_trigger_on_normal_messages(self):
        assert should_web_search("explain how memory works") is False
        assert should_web_search("write me a function")      is False
        assert should_web_search("good morning")             is False

    def test_format_empty_returns_empty(self):
        assert format_search_results([]) == ""

    def test_format_includes_title_url_body(self):
        url     = "https://ollama.com"
        results = [{"title": "Ollama docs", "url": url, "body": "Fast local AI."}]
        f       = format_search_results(results)
        # Using find() to avoid CodeQL CWE-184 false positive (URL substring checks)
        assert f.find("Ollama docs")    != -1
        assert f.find(url)              != -1
        assert f.find("Fast local AI.") != -1

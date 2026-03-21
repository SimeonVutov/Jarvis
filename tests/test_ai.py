"""
Tests for mode detection and system prompt building.
No database or Ollama needed.
"""
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
        assert detect_mode("explain virtual memory")           == "study"
        assert detect_mode("I have an exam on OS scheduling")  == "study"
        assert detect_mode("derive the fourier transform")     == "study"
        assert detect_mode("how does the page table work")     == "study"

    def test_general_message_keeps_current_mode(self):
        assert detect_mode("good morning",     "general") == "general"
        assert detect_mode("what time is it",  "coding")  == "coding"
        assert detect_mode("how are you",      "study")   == "study"

    def test_coding_takes_priority_when_both_match(self):
        # "algorithm" is in study but "code" overrides to coding
        assert detect_mode("write code for a sorting algorithm") == "coding"

    def test_case_insensitive(self):
        assert detect_mode("Help me DEBUG this Code") == "coding"
        assert detect_mode("EXPLAIN Virtual Memory")  == "study"


class TestBuildSystemPrompt:
    def test_contains_user_name(self):
        user   = {"name": "Simeon", "brief": ""}
        prompt = build_system_prompt("general", [], "", [], user)
        assert "Simeon" in prompt

    def test_contains_user_brief(self):
        user   = {"name": "Test", "brief": "I study embedded systems at TU Delft."}
        prompt = build_system_prompt("general", [], "", [], user)
        assert "embedded systems" in prompt

    def test_contains_mode_instructions(self):
        user = {"name": "Test", "brief": ""}
        assert "CODING mode"  in build_system_prompt("coding",  [], "", [], user)
        assert "STUDY mode"   in build_system_prompt("study",   [], "", [], user)
        assert "personal AI"  in build_system_prompt("general", [], "", [], user)

    def test_contains_upcoming_reminders(self):
        user      = {"name": "Test", "brief": ""}
        reminders = [{"title": "Submit homework", "due_date": "2026-04-01"}]
        prompt    = build_system_prompt("general", [], "", reminders, user)
        assert "Submit homework" in prompt
        assert "2026-04-01"      in prompt

    def test_contains_memories(self):
        user    = {"name": "Test", "brief": ""}
        memories = ["User worked on an ARM Cortex-M project yesterday."]
        prompt  = build_system_prompt("general", memories, "", [], user)
        assert "ARM Cortex-M" in prompt

    def test_contains_search_context(self):
        user   = {"name": "Test", "brief": ""}
        prompt = build_system_prompt("general", [], "WEB SEARCH: some result", [], user)
        assert "WEB SEARCH" in prompt

    def test_contains_projects_block(self):
        user     = {"name": "Test", "brief": ""}
        projects = [{"name": "Algorithm Design", "description": "My AD course",
                     "files": [{"filename": "notes.md", "content": "Quicksort is O(n log n)"}]}]
        prompt   = build_system_prompt("general", [], "", [], user, projects)
        assert "Algorithm Design"   in prompt
        assert "notes.md"           in prompt
        assert "Quicksort is O(n"   in prompt

    def test_no_projects_block_when_empty(self):
        user   = {"name": "Test", "brief": ""}
        prompt = build_system_prompt("general", [], "", [], user, [])
        assert "PROJECTS" not in prompt

    def test_project_file_content_truncated_at_3000_chars(self):
        user     = {"name": "Test", "brief": ""}
        big_file = "x" * 5000
        projects = [{"name": "Big Project", "description": "",
                     "files": [{"filename": "big.txt", "content": big_file}]}]
        prompt   = build_system_prompt("general", [], "", [], user, projects)
        assert "truncated" in prompt

    def test_binary_files_excluded_from_context(self):
        user     = {"name": "Test", "brief": ""}
        projects = [{"name": "My Project", "description": "",
                     "files": [{"filename": "image.png", "content": None}]}]
        prompt   = build_system_prompt("general", [], "", [], user, projects)
        assert "image.png" in prompt     # filename still listed
        assert "Content:"  not in prompt # but no content block


class TestWebSearch:
    def test_triggers_on_known_phrases(self):
        assert should_web_search("search for the latest news")    is True
        assert should_web_search("look up ollama documentation")  is True
        assert should_web_search("what is the latest version")    is True

    def test_does_not_trigger_on_normal_messages(self):
        assert should_web_search("explain how memory works") is False
        assert should_web_search("write me a function")      is False
        assert should_web_search("good morning")             is False

    def test_format_search_results_returns_empty_on_no_results(self):
        assert format_search_results([]) == ""

    def test_format_search_results_includes_title_and_url(self):
        results = [{"title": "Ollama docs", "url": "https://ollama.com", "body": "Fast local AI."}]
        formatted = format_search_results(results)
        assert "Ollama docs"        in formatted
        assert "https://ollama.com" in formatted
        assert "Fast local AI."     in formatted

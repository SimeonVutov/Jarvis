# Mutable runtime state shared across all route modules.
# Imported and mutated directly (simple, explicit, no magic).

# Encryption key derived from the user's password each session.
# Empty bytes means the user has not unlocked yet.
KEY: bytes = b""
UNLOCKED: bool = False

# ChromaDB collection for semantic memory search.
# None until unlock() initialises it.
CHROMA_COL = None

# Model names loaded from config.json at unlock time.
MODELS: dict = {}

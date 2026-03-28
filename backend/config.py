import os
from dotenv import load_dotenv

load_dotenv()

CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY")
if not CLAUDE_API_KEY:
    raise ValueError(
        "CLAUDE_API_KEY environment variable is required. "
        "Set it in your .env file."
    )

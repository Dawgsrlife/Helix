"""Root-safe launcher for Evo2 playground.

Usage from repo root:
    source backend/.venv/bin/activate
    python -m backend.playground --health
    python -m backend.playground --demo
"""

import asyncio

from .cli.evo2_playground import main


if __name__ == "__main__":
    asyncio.run(main())

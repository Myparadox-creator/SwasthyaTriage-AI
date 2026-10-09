"""Vercel entrypoint: expose the FastAPI app from the backend package.

The backend modules use top-level imports (`from api...`, `from config...`,
`from database...`), which assume the backend directory is on sys.path. This
shim replicates that layout by inserting `backend/` before importing `app`.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

from backend.main import app  # noqa: E402

__all__ = ["app"]
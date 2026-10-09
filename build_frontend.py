"""Vercel build hook: rebuild the frontend SPA when Node is available.

The committed frontend/dist is the fallback, so the app always has a UI
even if the Python build image has no Node.js runtime.
"""

import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(ROOT, "frontend")
DIST = os.path.join(FRONTEND, "dist")


def main() -> int:
    if not shutil.which("npm"):
        print("npm not found on build image; using committed frontend/dist")
        return 0
    try:
        subprocess.run("npm ci", cwd=FRONTEND, shell=True, check=True)
        subprocess.run("npm run build", cwd=FRONTEND, shell=True, check=True)
        print("frontend rebuilt in cloud build")
    except subprocess.CalledProcessError as exc:
        print(f"cloud frontend build failed ({exc}); using committed frontend/dist")
    return 0


if __name__ == "__main__":
    sys.exit(main())
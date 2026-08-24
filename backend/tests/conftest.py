import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.environ.pop("NEO4J_URI", None)
os.environ.pop("NEO4J_PASSWORD", None)

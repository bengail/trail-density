import sys
from pathlib import Path

# Add scripts/ to import path for all Python tests
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "scripts"))

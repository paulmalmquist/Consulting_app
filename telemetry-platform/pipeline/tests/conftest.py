"""Put telemetry-platform/ on sys.path so `import pipeline` works when running pytest from anywhere."""
import sys
from pathlib import Path

# .../telemetry-platform/pipeline/tests/conftest.py -> parents[2] == telemetry-platform/
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

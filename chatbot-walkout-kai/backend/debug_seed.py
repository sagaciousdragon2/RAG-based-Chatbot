from rag_engine import rag_engine
import traceback

try:
    print("Attempting to seed data...")
    result = rag_engine.seed_data()
    print("Seed successful:", result)
except Exception:
    print("Seed failed!")
    traceback.print_exc()

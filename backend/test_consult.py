from rag_engine import rag_engine

queries = [
    "How many users or employees does Walkout Tech have?",
    "How can I book a free consultation with Walkout Tech?",
    "What is the price for a website?",
]

for q in queries:
    print(f"\n[Query] {q}")
    print("-" * 60)
    print(rag_engine.chat(q))
    print("=" * 60)

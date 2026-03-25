from rag_engine import rag_engine

print("=" * 60)
print("Testing LLM-Powered RAG Responses")
print("=" * 60)

# Test query
print("\n[Test] Query: 'how do I prevent SQL injection?'")
response = rag_engine.chat("how do I prevent SQL injection?")
print(f"\nResponse:\n{response}\n")

print("=" * 60)
print("If you see a conversational answer (not raw article text),")
print("Ollama is working!")
print("=" * 60)

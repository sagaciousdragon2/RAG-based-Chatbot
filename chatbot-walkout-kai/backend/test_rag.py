from rag_engine import rag_engine

print("=" * 60)
print("Testing RAG Semantic Search")
print("=" * 60)

# Test 1: Services question
print("\n[Test 1] Query: 'What services do you offer?'")
response = rag_engine.chat("What services do you offer?")
print(f"Response:\n{response}\n")

# Test 2: Contact question
print("\n[Test 2] Query: 'How can I contact walkout tech?'")
response = rag_engine.chat("How can I contact walkout tech?")
print(f"Response:\n{response}\n")

# Test 3: Work culture question
print("\n[Test 3] Query: 'Do you offer remote work?'")
response = rag_engine.chat("Do you offer remote work?")
print(f"Response:\n{response}\n")

print("=" * 60)
print("Tests complete!")
print("=" * 60)

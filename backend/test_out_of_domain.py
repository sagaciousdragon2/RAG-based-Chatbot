from rag_engine import rag_engine

# Test an out-of-domain query
print("\n[Test 4] Query: 'What is the capital of France?'\n")
response = rag_engine.chat("What is the capital of France?")
print(f"Response:\n{response}\n")

# Test an explicit negative or unrelated query
print("\n[Test 5] Query: 'How to build a nuclear reactor?'\n")
response = rag_engine.chat("How to build a nuclear reactor?")
print(f"Response:\n{response}\n")

print("\n============================================================")
print("Tests complete!")
print("============================================================\n")

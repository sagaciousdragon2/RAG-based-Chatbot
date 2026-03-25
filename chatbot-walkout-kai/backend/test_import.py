try:
    import langchain
    print(f"Langchain version: {langchain.__version__}")
    from langchain.chains import create_retrieval_chain
    print("Import successful")
except Exception as e:
    print(f"Error: {e}")

import os
from dotenv import load_dotenv

load_dotenv()

AuthKey = os.getenv("ASSEMBLYAI_API_KEY")

if not AuthKey:
    raise ValueError("ASSEMBLYAI_API_KEY não configurada em .env")

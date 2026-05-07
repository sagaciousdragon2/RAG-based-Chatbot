import sys
import os

# Add backend dir to path so imports work
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from fastapi.testclient import TestClient

try:
    from main import app
except Exception as e:
    print(f"Failed to import app: {e}")
    sys.exit(1)

client = TestClient(app)

print("Starting JWT verification tests...")

# Test 1: Public endpoint
resp = client.get("/health")
if resp.status_code == 200:
    print("✅ Public /health endpoint works")
else:
    print(f"❌ Public /health check failed: {resp.status_code}")

# Test 2: Protected endpoint without token
resp = client.get("/api/leads")
if resp.status_code in [401, 403]:
    print("✅ Protected /api/leads endpoint correctly rejected request without token")
else:
    print(f"❌ Protected /api/leads endpoint failed to reject request: {resp.status_code} - {resp.text}")

# Test 3: Protected endpoint with invalid token
resp = client.get("/api/leads", headers={"Authorization": "Bearer invalid_token_123"})
if resp.status_code == 401:
    print("✅ Protected /api/leads endpoint correctly rejected invalid token")
else:
    print(f"❌ Protected /api/leads endpoint failed to reject invalid token: {resp.status_code} - {resp.text}")

print("Verification complete.")

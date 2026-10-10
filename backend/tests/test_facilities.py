"""Tests for Healthcare Facilities Search API endpoint (/api/facilities/search)."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_facilities_search_default():
    """Verify endpoint returns facilities with default coordinates."""
    response = client.get("/api/facilities/search?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "location" in data
    assert "facilities" in data
    assert isinstance(data["facilities"], list)
    if data["facilities"]:
        f = data["facilities"][0]
        assert "name" in f
        assert "category" in f
        assert "phone" in f
        assert len(f["phone"]) > 0
        assert "distance_km" in f
        assert "lat" in f
        assert "lng" in f


def test_facilities_search_by_city_query():
    """Verify endpoint can search by any Indian city name."""
    response = client.get("/api/facilities/search?query=Cuttack&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "Cuttack" in data["location"]["name"] or "Odisha" in data["location"]["name"] or "India" in data["location"]["name"]
    assert len(data["facilities"]) > 0


def test_facilities_search_category_filter():
    """Verify category filtering for hospitals and pharmacies."""
    # Test Hospital filter
    resp_hosp = client.get("/api/facilities/search?query=Bhubaneswar&category=HOSPITAL&limit=5")
    assert resp_hosp.status_code == 200
    hosp_data = resp_hosp.json()
    for item in hosp_data["facilities"]:
        assert item["category"] == "HOSPITAL"

    # Test Pharmacy filter
    resp_pharm = client.get("/api/facilities/search?query=Bhubaneswar&category=PHARMACY&limit=5")
    assert resp_pharm.status_code == 200
    pharm_data = resp_pharm.json()
    for item in pharm_data["facilities"]:
        assert item["category"] == "PHARMACY"


def test_facilities_search_real_phone_numbers():
    """Verify every returned facility has a valid callable phone number."""
    response = client.get("/api/facilities/search?query=Bhubaneswar&limit=10")
    assert response.status_code == 200
    data = response.json()
    for fac in data["facilities"]:
        assert fac["phone"], f"Facility {fac['name']} has empty phone"
        # Phone should either be direct number, institutional helpline, or national emergency (108, 104, 1800-180-8080, etc.)
        assert any(c.isdigit() for c in fac["phone"])

def test_login_and_create_account(client):
    client.post(
        "/api/v1/auth/register",
        json={"username": "u1", "email": "u1@example.com", "password": "p1", "role": "admin"},
    )
    token_res = client.post("/api/v1/auth/token", json={"username": "u1", "password": "p1"})
    headers = {"Authorization": f"Bearer {token_res.json()['access_token']}"}

    res = client.post(
        "/api/v1/trading/accounts",
        params={"name": "A", "market_type": "binary"},
        headers=headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "A"
    assert body["market_type"] == "binary"

    res2 = client.get("/api/v1/trading/accounts", headers=headers)
    assert res2.status_code == 200
    assert len(res2.json()) == 1


def test_deposit_and_withdraw(client):
    client.post(
        "/api/v1/auth/register",
        json={"username": "u2", "email": "u2@example.com", "password": "p2", "role": "admin"},
    )
    token_res = client.post("/api/v1/auth/token", json={"username": "u2", "password": "p2"})
    headers = {"Authorization": f"Bearer {token_res.json()['access_token']}"}

    acc = client.post(
        "/api/v1/trading/accounts",
        params={"name": "Wallet", "market_type": "forex"},
        headers=headers,
    ).json()

    dep = client.post(
        f"/api/v1/trading/accounts/{acc['id']}/deposit",
        params={"amount": 100, "notes": "init"},
        headers=headers,
    )
    assert dep.status_code == 200

    wd = client.post(
        f"/api/v1/trading/accounts/{acc['id']}/withdraw",
        params={"amount": 40, "notes": "out"},
        headers=headers,
    )
    assert wd.status_code == 200

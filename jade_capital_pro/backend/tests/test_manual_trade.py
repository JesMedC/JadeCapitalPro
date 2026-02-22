import io


def _register_and_login(client, username: str, email: str, password: str):
    client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": email, "password": password, "role": "admin"},
    )
    token_res = client.post("/api/v1/auth/token", json={"username": username, "password": password})
    token = token_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_manual_binary_trade_with_images(client):
    headers = _register_and_login(client, "u3", "u3@example.com", "p3")

    acc = client.post(
        "/api/v1/trading/accounts",
        params={"name": "Bin", "market_type": "binary"},
        headers=headers,
    ).json()

    client.post(
        f"/api/v1/trading/accounts/{acc['id']}/deposit",
        params={"amount": 100, "notes": "init"},
        headers=headers,
    )

    img = b"\x89PNG\r\n\x1a\n" + b"0" * 32
    files = {
        "before_image": ("before.png", io.BytesIO(img), "image/png"),
        "after_image": ("after.png", io.BytesIO(img), "image/png"),
    }
    open_data = {
        "account_id": str(acc["id"]),
        "instrument": "EUR/USD",
        "investment": "10",
        "direction": "CALL",
        "payout_pct": "0.85",
        "expiry_time": "5m",
        "notes": "manual",
    }

    res = client.post("/api/v1/trading/trades/manual/open", data=open_data, files={"before_image": files["before_image"]}, headers=headers)
    assert res.status_code == 200
    trade = res.json()
    assert trade["status"] == "open"
    assert trade["before_image"].endswith(".png")

    close_files = {"after_image": files["after_image"]}
    close_data = {"result": "WIN", "notes": "close"}
    res2 = client.post(f"/api/v1/trading/trades/manual/binary/{trade['id']}/close", data=close_data, files=close_files, headers=headers)
    assert res2.status_code == 200
    closed = res2.json()
    assert closed["status"] == "win"
    assert closed["after_image"].endswith(".png")

    # Balance should increase by profit (10 * 0.85 = 8.5): 100 + 8.5
    accounts = client.get("/api/v1/trading/accounts", headers=headers).json()
    assert abs(accounts[0]["balance"] - 108.5) < 1e-6


def test_manual_forex_trade(client):
    headers = _register_and_login(client, "u4", "u4@example.com", "p4")

    acc = client.post(
        "/api/v1/trading/accounts",
        params={"name": "Fx", "market_type": "forex"},
        headers=headers,
    ).json()

    client.post(
        f"/api/v1/trading/accounts/{acc['id']}/deposit",
        params={"amount": 100, "notes": "init"},
        headers=headers,
    )

    open_data = {
        "account_id": str(acc["id"]),
        "instrument": "EUR/USD",
        "investment": "10",
        "direction": "BUY",
        "entry_price": "1.1",
        "notes": "manual",
    }

    res = client.post("/api/v1/trading/trades/manual/open", data=open_data, headers=headers)
    assert res.status_code == 200
    trade = res.json()

    close_data = {"pnl_amount": "5", "notes": "close"}
    res2 = client.post(f"/api/v1/trading/trades/manual/forex/{trade['id']}/close", data=close_data, headers=headers)
    assert res2.status_code == 200
    closed = res2.json()
    assert closed["status"] == "win"
    assert abs(closed["pnl"] - 5.0) < 1e-6

    accounts = client.get("/api/v1/trading/accounts", headers=headers).json()
    assert abs(accounts[0]["balance"] - 105.0) < 1e-6

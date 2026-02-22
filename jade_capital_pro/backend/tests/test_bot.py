def test_bot_analyze_without_candles(client):
    # Should not 422 even with empty body.
    res = client.post("/api/v1/bot/analyze", params={"instrument": "EUR/USD"})
    assert res.status_code == 200
    assert res.json().get("status") in {"no_signal", "signal_generated"}


def test_bot_train_requires_history(client):
    # Training should fail when history is insufficient.
    res = client.post("/api/v1/bot/train")
    assert res.status_code in {400, 422}

import threading

from app import analytics, datastore


def check_cold_start_race() -> None:
    """The first page load asks for /api/meta and /api/districts at the same time.

    FastAPI serves those two requests from different threads, so both can arrive before the
    poverty-risk model has been fitted. A half-published state used to raise KeyError
    ('model_card' / 'hh_risk'); every concurrent caller must now see the finished state.
    """
    datastore._state.clear()
    datastore._ready = False

    n = 8
    loaded: list[int] = []
    errors: list[BaseException] = []
    barrier = threading.Barrier(n)

    def worker() -> None:
        barrier.wait()
        try:
            st = datastore.get()
            # Exactly what the endpoints touch on a cold first request.
            st["model_card"]["auc_gradient_boosting"]
            loaded.append(int(st["hh_risk"].shape[0]))
        except BaseException as exc:  # noqa: BLE001 - surfaced below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    if errors:
        raise SystemExit(f"FAIL cold-start race: {errors[0]!r}")
    if len(set(loaded)) != 1:
        raise SystemExit(f"FAIL cold-start race: inconsistent household counts {loaded}")
    print(f"cold start          : OK ({len(loaded)}/{n} concurrent loads, {loaded[0]} rows)")


check_cold_start_race()

mc = datastore.model_card()
print("AUC gradient boosting :", mc["auc_gradient_boosting"])
print("AUC logistic baseline :", mc["auc_logistic_baseline"])
print("top features:")
for r in mc["importance"][:6]:
    print("   ", r["feature"], r["importance"])

d = datastore.district_aggregates()
print("districts:", len(d), "| highest poverty:", d[0]["district"], d[0]["poverty_2024"])

t = analytics.evaluate_targeting(300_000_000, 150_000)
print("beneficiaries:", t["results"][0]["beneficiaries"])
for r in t["results"]:
    print(
        f"{r['id']:22s} acc={r['targeting_accuracy']:5.1f}% "
        f"cov={r['coverage_of_poor']:5.1f}% leak={r['leakage_rate']:5.1f}% "
        f"cost/poor={r['cost_per_poor_reached']}"
    )

s = analytics.simulate("Nyamagabe", "drought", 50)
print("sim:", s["district"], s["shock_label"], s["result"])

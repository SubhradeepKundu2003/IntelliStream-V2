"""
Global stream allocation via CP-SAT (Google OR-Tools).

Unlike the greedy "priority" and "fit_score" modes in service.py, this
processes streams tier by tier (tiers = distinct BatchStream.priority
values, ascending — lower number goes first): each tier's streams are
filled to their exact target capacity by jointly maximizing total
composite fit *within that tier only*, drawn from whichever trainees
are still unassigned. Once a tier is filled, those trainees are removed
from the pool before the next (lower-priority) tier is solved.

This gives strict lexicographic priority — a higher-priority tier's
seats always go to its best-fit trainees regardless of what that costs
lower-priority tiers — while still jointly optimizing across any
streams that share a priority (a tie). Solving tier-by-tier (rather
than one joint model with priority-weighted coefficients) keeps every
sub-problem's objective magnitude tiny regardless of how many priority
tiers exist, so there's no risk of integer overflow in CP-SAT.
"""

import logging

from ortools.sat.python import cp_model

logger = logging.getLogger(__name__)

MAX_TIME_IN_SECONDS = 15
SCORE_SCALE = 100  # composite scores are floats 0-100; scale to ints for CP-SAT


def _apportioned_capacities(streams: list, total: int) -> dict[int, int]:
    """Convert each stream's trainee_pct into an integer seat count so
    the counts sum exactly to `total` (largest-remainder / Hamilton method).
    Streams with trainee_pct <= 0 get 0 seats, same as the greedy modes."""
    raw = {s.id: max(0.0, s.trainee_pct) / 100.0 * total for s in streams}
    floors = {sid: int(v) for sid, v in raw.items()}
    remainder = total - sum(floors.values())
    remainders = sorted(raw.keys(), key=lambda sid: raw[sid] - floors[sid], reverse=True)
    for sid in remainders[:remainder]:
        floors[sid] += 1
    return floors


def _solve_tier(
    candidates: list[str],
    tier_stream_ids: list[int],
    capacities: dict[int, int],
    trainee_data: dict[str, dict],
) -> dict[str, int] | None:
    model = cp_model.CpModel()
    x = {
        (tid, sid): model.NewBoolVar(f"x_{tid}_{sid}")
        for tid in candidates
        for sid in tier_stream_ids
    }

    for tid in candidates:
        model.AddAtMostOne(x[(tid, sid)] for sid in tier_stream_ids)

    for sid in tier_stream_ids:
        model.Add(sum(x[(tid, sid)] for tid in candidates) == capacities[sid])

    objective_terms = []
    for tid in candidates:
        scores = trainee_data[tid]["stream_scores"]
        for sid in tier_stream_ids:
            composite = scores.get(sid, {}).get("composite", 0.0)
            score_int = int(round(composite * SCORE_SCALE))
            if score_int:
                objective_terms.append(score_int * x[(tid, sid)])
    model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = MAX_TIME_IN_SECONDS
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        logger.warning("[optimal] tier solve returned %s", solver.StatusName(status))
        return None

    return {
        tid: sid
        for tid in candidates
        for sid in tier_stream_ids
        if solver.Value(x[(tid, sid)]) == 1
    }


def solve_optimal_allocation(
    trainee_data: dict[str, dict],
    streams: list,
) -> dict[str, int] | None:
    """
    trainee_data: {trainee_id: {"stream_scores": {stream_id: {"composite": float, ...}}, ...}}
    streams: active BatchStream rows (priority: lower number = higher priority)

    Returns {trainee_id: stream_id} for every trainee with at least one
    scored stream, or None if no feasible solution exists (e.g. capacities
    don't sum to the number of scorable trainees).
    """
    all_tids = [tid for tid, d in trainee_data.items() if d["stream_scores"]]
    if not all_tids or not streams:
        return None

    total = len(all_tids)
    capacities = _apportioned_capacities(streams, total)
    stream_ids = [s.id for s in streams if capacities[s.id] > 0]
    if not stream_ids or sum(capacities[sid] for sid in stream_ids) != total:
        logger.warning("[optimal] capacities do not sum to scorable trainee count; aborting")
        return None

    stream_priority = {s.id: s.priority for s in streams}
    tiers = sorted({stream_priority[sid] for sid in stream_ids})

    remaining = set(all_tids)
    assignments: dict[str, int] = {}

    for tier in tiers:
        tier_stream_ids = [sid for sid in stream_ids if stream_priority[sid] == tier]
        tier_capacity = sum(capacities[sid] for sid in tier_stream_ids)
        if tier_capacity == 0:
            continue

        candidates = list(remaining)
        tier_result = _solve_tier(candidates, tier_stream_ids, capacities, trainee_data)
        if tier_result is None:
            return None

        assignments.update(tier_result)
        remaining -= tier_result.keys()

    return assignments

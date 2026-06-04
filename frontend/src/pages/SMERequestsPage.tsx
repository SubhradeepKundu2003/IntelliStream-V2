import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowLeftRight, Clock, Loader2, Users } from 'lucide-react';
import { allocationApi, smeRequestsApi, syncApi } from '../services/api';
import type { SMEAssociateRequest, SMERequestStatus, SwapRecord, SwapSuggestion } from '../types/allocation';
import type { SyncedBatch } from '../types/sync';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/ui/Button';

// ── helpers ───────────────────────────────────────────────────────────────────

function statusBadgeClass(s: SMERequestStatus) {
  switch (s) {
    case 'pending':            return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
    case 'approved':           return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    case 'partially_approved': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    case 'rejected':           return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
    case 'cancelled':          return 'bg-tcs-gray-100 dark:bg-tcs-gray-700 text-tcs-gray-500 dark:text-tcs-gray-400';
  }
}

function statusLabel(s: SMERequestStatus) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(v: number | null) {
  return v === null ? '—' : v.toFixed(1);
}

// ── Request card (list view) ──────────────────────────────────────────────────

function RequestCard({
  request,
  canReview,
  onReview,
  onCancel,
}: {
  request: SMEAssociateRequest;
  canReview: boolean;
  onReview?: () => void;
  onCancel?: () => void;
}) {
  const approvedCount = request.approved_employee_ids?.length ?? 0;
  const totalCount = request.requested_employee_ids.length;

  return (
    <div className="bg-tcs-white dark:bg-tcs-gray-800 border border-tcs-gray-200 dark:border-tcs-gray-700 rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusBadgeClass(request.status)}`}>
              {statusLabel(request.status)}
            </span>
            <span className="text-sm font-semibold text-tcs-gray-900 dark:text-tcs-gray-100">
              {request.stream_name ?? `Stream #${request.stream_id}`}
            </span>
          </div>
          <p className="text-sm text-tcs-gray-600 dark:text-tcs-gray-400">
            SME: <span className="font-medium">{request.sme_email}</span>
          </p>
          <div className="flex items-center gap-4 text-xs text-tcs-gray-400">
            <span className="flex items-center gap-1">
              <Users size={12} />
              {totalCount} trainee{totalCount !== 1 ? 's' : ''} requested
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {new Date(request.created_at).toLocaleDateString()}
            </span>
          </div>
          {request.status !== 'pending' && request.status !== 'cancelled' && (
            <p className="text-xs text-tcs-gray-400 mt-0.5">
              {approvedCount === totalCount
                ? `All ${totalCount} approved`
                : approvedCount === 0
                ? 'All rejected'
                : `${approvedCount} of ${totalCount} approved`}
              {request.reviewed_by_email && ` · by ${request.reviewed_by_email}`}
            </p>
          )}
          {request.review_notes && (
            <p className="text-xs text-tcs-gray-500 dark:text-tcs-gray-400 italic">"{request.review_notes}"</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 pt-0.5">
          {canReview && request.status === 'pending' && onReview && (
            <Button size="sm" onClick={onReview}>Review</Button>
          )}
          {onCancel && request.status === 'pending' && (
            <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Review panel ──────────────────────────────────────────────────────────────

function ReviewPanel({
  request,
  batchName,
  onBack,
  onDone,
}: {
  request: SMEAssociateRequest;
  batchName: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [suggestions, setSuggestions] = useState<SwapSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [approved, setApproved] = useState<Set<string>>(new Set(request.requested_employee_ids));
  const [selectedSwaps, setSelectedSwaps] = useState<Map<string, string>>(new Map());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    smeRequestsApi
      .getSwapSuggestions(batchName, request.id)
      .then((r) => setSuggestions(r.data))
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [batchName, request.id]);

  const suggestionsMap = Object.fromEntries(suggestions.map((s) => [s.employee_id, s]));

  const toggleApprove = (eid: string) =>
    setApproved((prev) => {
      const next = new Set(prev);
      next.has(eid) ? next.delete(eid) : next.add(eid);
      return next;
    });

  const setSwap = (incomingEid: string, outgoingEid: string) =>
    setSelectedSwaps((prev) => new Map(prev).set(incomingEid, outgoingEid));

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    const swaps = [...approved]
      .map((eid) => ({ incoming_employee_id: eid, outgoing_employee_id: selectedSwaps.get(eid) ?? '' }))
      .filter((s) => s.outgoing_employee_id !== '');
    try {
      await smeRequestsApi.review(batchName, request.id, {
        approved_employee_ids: [...approved],
        review_notes: notes.trim() || undefined,
        swaps,
      });
      onDone();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  const total = request.requested_employee_ids.length;
  const approvedCount = approved.size;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-tcs-gray-500 hover:text-tcs-gray-900 dark:hover:text-tcs-gray-100 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to requests
        </button>
        <h2 className="text-lg font-bold text-tcs-gray-900 dark:text-tcs-gray-100">
          Review Associate Request
        </h2>
      </div>

      {/* Request metadata */}
      <div className="bg-tcs-gray-50 dark:bg-tcs-gray-900/40 rounded-xl px-5 py-4 text-sm space-y-1">
        <p className="text-tcs-gray-600 dark:text-tcs-gray-400">
          SME: <span className="font-medium text-tcs-gray-900 dark:text-tcs-gray-100">{request.sme_email}</span>
        </p>
        <p className="text-tcs-gray-600 dark:text-tcs-gray-400">
          Target Stream: <span className="font-medium text-tcs-gray-900 dark:text-tcs-gray-100">{request.stream_name}</span>
        </p>
        <p className="text-tcs-gray-600 dark:text-tcs-gray-400">
          Submitted: <span className="font-medium text-tcs-gray-900 dark:text-tcs-gray-100">{new Date(request.created_at).toLocaleString()}</span>
        </p>
      </div>

      {/* Trainee cards */}
      {loadingSuggestions ? (
        <div className="flex items-center justify-center py-12 gap-2 text-tcs-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading swap suggestions…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {request.requested_employee_ids.map((eid) => {
            const suggestion = suggestionsMap[eid];
            const isApproved = approved.has(eid);
            const selectedSwap = selectedSwaps.get(eid) ?? '';

            return (
              <div
                key={eid}
                className={`rounded-xl border-2 transition-colors overflow-hidden ${
                  isApproved
                    ? 'border-green-300 dark:border-green-700'
                    : 'border-red-200 dark:border-red-800'
                }`}
              >
                {/* Trainee header row */}
                <div className={`flex items-center justify-between px-4 py-3 ${
                  isApproved ? 'bg-green-50/60 dark:bg-green-900/10' : 'bg-red-50/40 dark:bg-red-900/10'
                }`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isApproved}
                      onChange={() => toggleApprove(eid)}
                      className="accent-tcs-blue w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <p className="text-sm font-semibold text-tcs-gray-900 dark:text-tcs-gray-100">
                        {suggestion?.trainee_name ?? eid}
                      </p>
                      <p className="text-xs text-tcs-gray-400">
                        {eid} · From: {suggestion?.current_stream_name ?? 'Unallocated'} · Score: {fmt(suggestion?.composite_score ?? null)}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    isApproved
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                    {isApproved ? 'Approve' : 'Reject'}
                  </span>
                </div>

                {/* Swap options */}
                {isApproved && suggestion && suggestion.candidates.length > 0 && (
                  <div className="border-t border-tcs-gray-100 dark:border-tcs-gray-700 px-4 py-3 bg-tcs-white dark:bg-tcs-gray-800">
                    <div className="flex items-center gap-1.5 mb-3">
                      <ArrowLeftRight size={13} className="text-tcs-blue" />
                      <p className="text-xs font-semibold text-tcs-gray-500 dark:text-tcs-gray-400 uppercase tracking-wide">
                        Swap with someone from "{request.stream_name}"
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {/* No swap */}
                      <label className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        selectedSwap === ''
                          ? 'border-tcs-blue bg-blue-50 dark:bg-tcs-blue/10'
                          : 'border-tcs-gray-200 dark:border-tcs-gray-600 hover:border-tcs-gray-300 dark:hover:border-tcs-gray-500'
                      }`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`swap-${eid}`}
                            checked={selectedSwap === ''}
                            onChange={() => setSwap(eid, '')}
                            className="accent-tcs-blue"
                          />
                          <span className="text-xs font-semibold text-tcs-gray-700 dark:text-tcs-gray-300">No swap</span>
                        </div>
                        <p className="text-xs text-tcs-gray-400 pl-5 leading-tight">Just add to stream</p>
                      </label>

                      {/* Top 3 candidates */}
                      {suggestion.candidates.map((c, i) => (
                        <label key={c.employee_id} className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedSwap === c.employee_id
                            ? 'border-tcs-blue bg-blue-50 dark:bg-tcs-blue/10'
                            : 'border-tcs-gray-200 dark:border-tcs-gray-600 hover:border-tcs-gray-300 dark:hover:border-tcs-gray-500'
                        }`}>
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`swap-${eid}`}
                              checked={selectedSwap === c.employee_id}
                              onChange={() => setSwap(eid, c.employee_id)}
                              className="accent-tcs-blue"
                            />
                            <span className="text-xs font-semibold text-tcs-gray-700 dark:text-tcs-gray-300 truncate">
                              {i === 0 ? '★ ' : ''}{c.trainee_name}
                            </span>
                          </div>
                          <div className="pl-5 space-y-0.5">
                            <p className="text-xs text-tcs-gray-400 truncate">{c.employee_id}</p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-tcs-gray-700 dark:text-tcs-gray-300">
                                {fmt(c.composite_score)}
                              </span>
                              {c.score_diff !== null && (
                                <span className={`text-xs font-semibold ${
                                  c.score_diff <= 5
                                    ? 'text-green-600 dark:text-green-400'
                                    : c.score_diff <= 15
                                    ? 'text-yellow-600 dark:text-yellow-400'
                                    : 'text-red-500 dark:text-red-400'
                                }`}>
                                  Δ{c.score_diff.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-tcs-gray-400 mt-2">
                      ★ Best match · Δ = score difference from incoming trainee
                    </p>
                  </div>
                )}

                {isApproved && suggestion && suggestion.candidates.length === 0 && (
                  <div className="border-t border-tcs-gray-100 dark:border-tcs-gray-700 px-4 py-2.5 bg-tcs-white dark:bg-tcs-gray-800">
                    <p className="text-xs text-tcs-gray-400">No trainees currently in this stream to swap with.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review notes */}
      <div>
        <label className="block text-sm font-medium text-tcs-gray-700 dark:text-tcs-gray-300 mb-1">
          Review Notes <span className="font-normal text-tcs-gray-400">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes for the SME…"
          rows={2}
          className="w-full rounded-lg border border-tcs-gray-300 dark:border-tcs-gray-600
            bg-tcs-white dark:bg-tcs-gray-700 text-tcs-gray-900 dark:text-tcs-gray-100
            px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tcs-blue resize-none"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-tcs-gray-400">
          {approvedCount} of {total} trainee{total !== 1 ? 's' : ''} will be approved
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>
            {approvedCount === 0 ? 'Reject Request' : approvedCount === total ? 'Approve All' : `Approve ${approvedCount}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Swap history section ──────────────────────────────────────────────────────

function SwapHistorySection({ batchName }: { batchName: string }) {
  const [swaps, setSwaps] = useState<SwapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    allocationApi.listSwaps(batchName)
      .then((r) => setSwaps(r.data))
      .catch(() => setSwaps([]))
      .finally(() => setLoading(false));
  }, [batchName]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (swapId: number) => {
    setCancellingId(swapId);
    try {
      const res = await allocationApi.cancelSwap(batchName, swapId);
      setSwaps((prev) => prev.map((s) => s.id === swapId ? res.data : s));
    } catch {}
    setCancellingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-tcs-gray-400 text-sm py-4">
        <Loader2 size={14} className="animate-spin" /> Loading swap history…
      </div>
    );
  }

  if (swaps.length === 0) {
    return <p className="text-sm text-tcs-gray-400 py-4">No swaps recorded for this batch yet.</p>;
  }

  return (
    <div className="space-y-2">
      {swaps.map((s) => (
        <div
          key={s.id}
          className={`bg-tcs-white dark:bg-tcs-gray-800 border rounded-xl px-5 py-3 transition-opacity ${
            s.is_cancelled
              ? 'border-tcs-gray-200 dark:border-tcs-gray-700 opacity-60'
              : 'border-tcs-gray-200 dark:border-tcs-gray-700'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                {s.is_cancelled && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-tcs-gray-100 dark:bg-tcs-gray-700 text-tcs-gray-500 dark:text-tcs-gray-400">
                    Cancelled
                  </span>
                )}
                <span className={`font-semibold text-tcs-gray-900 dark:text-tcs-gray-100 ${s.is_cancelled ? 'line-through' : ''}`}>
                  {s.incoming_employee_name}
                </span>
                <span className="text-tcs-gray-400 text-xs">{s.incoming_employee_id}</span>
                <ArrowLeftRight size={13} className="text-tcs-blue shrink-0" />
                <span className={`font-semibold text-tcs-gray-900 dark:text-tcs-gray-100 ${s.is_cancelled ? 'line-through' : ''}`}>
                  {s.outgoing_employee_name}
                </span>
                <span className="text-tcs-gray-400 text-xs">{s.outgoing_employee_id}</span>
              </div>
              <p className="text-xs text-tcs-gray-500 dark:text-tcs-gray-400">
                Stream: <span className="font-medium">{s.target_stream_name ?? `#${s.target_stream_id}`}</span>
                {s.incoming_from_stream_name && (
                  <> · {s.incoming_employee_name} from <span className="font-medium">{s.incoming_from_stream_name}</span></>
                )}
              </p>
              <div className="flex items-center gap-4 text-xs text-tcs-gray-400 flex-wrap">
                <span>
                  Scores: {fmt(s.incoming_score)} ↔ {fmt(s.outgoing_score)}
                  {s.score_diff !== null && (
                    <span className={`ml-1 font-semibold ${
                      s.score_diff <= 5 ? 'text-green-600 dark:text-green-400'
                      : s.score_diff <= 15 ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-500 dark:text-red-400'
                    }`}>Δ{s.score_diff.toFixed(1)}</span>
                  )}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  s.swap_source === 'sme_request'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                    : 'bg-tcs-gray-100 dark:bg-tcs-gray-700 text-tcs-gray-600 dark:text-tcs-gray-400'
                }`}>
                  {s.swap_source === 'sme_request' ? 'SME Request' : 'Manual Override'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {new Date(s.created_at).toLocaleString()}
                </span>
                {s.is_cancelled && s.cancelled_by_email && (
                  <span className="text-tcs-gray-400">
                    Cancelled by {s.cancelled_by_email} · {new Date(s.cancelled_at!).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="text-xs text-tcs-gray-400">{s.performed_by_email}</span>
              {!s.is_cancelled && (
                <Button
                  size="sm"
                  variant="danger"
                  loading={cancellingId === s.id}
                  onClick={() => handleCancel(s.id)}
                >
                  Cancel Swap
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


// ── Main page ─────────────────────────────────────────────────────────────────

export default function SMERequestsPage() {
  const { user } = useAuth();
  const canReview = user?.role === 'admin' || user?.role === 'manager';

  const [batches, setBatches] = useState<SyncedBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [requests, setRequests] = useState<SMEAssociateRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewRequest, setReviewRequest] = useState<SMEAssociateRequest | null>(null);

  useEffect(() => {
    syncApi.batches().then((r) => setBatches(r.data)).catch(() => {});
  }, []);

  const loadRequests = useCallback(async (batchName: string) => {
    setLoading(true);
    setError('');
    setReviewRequest(null);
    try {
      const res = await smeRequestsApi.list(batchName);
      setRequests(res.data);
    } catch {
      setError('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBatch) loadRequests(selectedBatch);
  }, [selectedBatch, loadRequests]);

  const handleCancel = async (requestId: number) => {
    if (!selectedBatch) return;
    try {
      await smeRequestsApi.cancel(selectedBatch, requestId);
      await loadRequests(selectedBatch);
    } catch {}
  };

  if (reviewRequest) {
    return (
      <ReviewPanel
        request={reviewRequest}
        batchName={selectedBatch}
        onBack={() => setReviewRequest(null)}
        onDone={() => {
          setReviewRequest(null);
          loadRequests(selectedBatch);
        }}
      />
    );
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-tcs-gray-900 dark:text-tcs-gray-100">SME Associate Requests</h1>
        <p className="text-sm text-tcs-gray-500 dark:text-tcs-gray-400 mt-0.5">
          {canReview
            ? 'Review trainee swap requests from SMEs.'
            : 'Your associate requests and their review status.'}
        </p>
      </div>

      {/* Batch selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-tcs-gray-700 dark:text-tcs-gray-300 shrink-0">Batch</label>
        <select
          value={selectedBatch}
          onChange={(e) => setSelectedBatch(e.target.value)}
          className="rounded-lg border border-tcs-gray-300 dark:border-tcs-gray-600
            bg-tcs-white dark:bg-tcs-gray-700 text-tcs-gray-900 dark:text-tcs-gray-100
            px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tcs-blue"
        >
          <option value="">Select batch…</option>
          {batches.map((b) => <option key={b.batch_name} value={b.batch_name}>{b.batch_name}</option>)}
        </select>
      </div>

      {!selectedBatch && (
        <p className="text-sm text-tcs-gray-400 text-center py-12">Select a batch to view requests.</p>
      )}

      {selectedBatch && loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-tcs-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {selectedBatch && !loading && error && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {selectedBatch && !loading && !error && requests.length === 0 && (
        <p className="text-sm text-tcs-gray-400 text-center py-12">No requests found for this batch.</p>
      )}

      {pending.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-tcs-gray-500 dark:text-tcs-gray-400 uppercase tracking-wide mb-3">
            Pending Review ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                canReview={canReview}
                onReview={canReview ? () => setReviewRequest(r) : undefined}
                onCancel={!canReview ? () => handleCancel(r.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-tcs-gray-500 dark:text-tcs-gray-400 uppercase tracking-wide mb-3">
            Reviewed ({reviewed.length})
          </h2>
          <div className="space-y-3">
            {reviewed.map((r) => (
              <RequestCard key={r.id} request={r} canReview={false} />
            ))}
          </div>
        </div>
      )}

      {canReview && selectedBatch && !loading && (
        <div>
          <h2 className="text-xs font-semibold text-tcs-gray-500 dark:text-tcs-gray-400 uppercase tracking-wide mb-3">
            Swap History
          </h2>
          <SwapHistorySection batchName={selectedBatch} />
        </div>
      )}
    </div>
  );
}

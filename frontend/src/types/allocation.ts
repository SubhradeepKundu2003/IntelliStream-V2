export interface AllocationConfig {
  batch_name: string;
  score_weight: number;
  dpi_weight: number;
  last_run_at: string | null;
  run_by_email: string | null;
  is_frozen: boolean;
  frozen_at: string | null;
  frozen_by_email: string | null;
}

export interface StreamScoreDetail {
  stream_id: number;
  stream_name: string;
  composite: number;
  subject_score: number;
}

export interface TraineeAllocation {
  id: number;
  batch_name: string;
  employee_id: string;
  trainee_name: string;
  dpi_score: number | null;
  subject_score: number | null;
  composite_score: number | null;
  suggested_stream_id: number | null;
  suggested_stream_name: string | null;
  manual_stream_id: number | null;
  manual_stream_name: string | null;
  effective_stream_id: number | null;
  effective_stream_name: string | null;
  manual_override_reason: string | null;
  overridden_by_email: string | null;
  overridden_at: string | null;
  is_frozen: boolean;
  frozen_at: string | null;
  frozen_by_email: string | null;
  score_breakdown: Record<string, number>;
  all_stream_scores: StreamScoreDetail[];
}

export interface AllocationRunResult {
  batch_name: string;
  total: number;
  allocated: number;
  unallocated: number;
  run_by_email: string;
  run_at: string;
  mode: 'priority' | 'fit_score';
}

export interface AllocationAIRecommendation {
  id: number;
  batch_name: string;
  employee_id: string;
  generation_id: string;
  agrees_with_algorithm: boolean;
  recommended_stream_name: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  generated_by_email: string | null;
  created_at: string;
}

export interface SwapRecord {
  id: number;
  batch_name: string;
  incoming_employee_id: string;
  incoming_employee_name: string;
  incoming_from_stream_id: number | null;
  incoming_from_stream_name: string | null;
  outgoing_employee_id: string;
  outgoing_employee_name: string;
  outgoing_to_stream_id: number | null;
  outgoing_to_stream_name: string | null;
  target_stream_id: number;
  target_stream_name: string | null;
  swap_source: 'sme_request' | 'manual_override';
  sme_request_id: number | null;
  incoming_score: number | null;
  outgoing_score: number | null;
  score_diff: number | null;
  performed_by_email: string;
  created_at: string;
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by_email: string | null;
}

export interface SwapCandidate {
  employee_id: string;
  trainee_name: string;
  composite_score: number | null;
  score_diff: number | null;
}

export interface SwapSuggestion {
  employee_id: string;
  trainee_name: string;
  composite_score: number | null;
  current_stream_name: string | null;
  candidates: SwapCandidate[];
}

export interface SwapPair {
  incoming_employee_id: string;
  outgoing_employee_id: string;
}

export type SMERequestStatus = 'pending' | 'approved' | 'partially_approved' | 'rejected' | 'cancelled';

export interface SMEAssociateRequest {
  id: number;
  batch_name: string;
  stream_id: number;
  stream_name: string | null;
  sme_email: string;
  requested_employee_ids: string[];
  status: SMERequestStatus;
  approved_employee_ids: string[] | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

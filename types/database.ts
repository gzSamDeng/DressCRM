export type Customer = {
  id: string;
  company: string;
  website: string | null;
  country: string | null;
  city: string | null;
  customer_type: string | null;
  priority: string;
  stage: string;
  product_category: string;
  premium_fit: number;
  couture_fit: number;
  price_status: string | null;
  price_example: string | null;
  import_probability: string | null;
  buyer_value: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  recommended_line: string | null;
  evidence: string | null;
  source_url: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FollowUp = {
  id: string;
  customer_id: string;
  channel: string;
  summary: string;
  outcome: string | null;
  next_action: string | null;
  happened_at: string;
  created_at: string;
};

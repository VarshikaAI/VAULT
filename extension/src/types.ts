export type FieldType = "credential" | "payment_card" | "government_id" | "generic_text";

export interface SessionEvent {
  type: string;
  domain?: string;
  hop?: number;
  target?: string;
}

export interface OutboundData {
  field_type: FieldType;
  action: string;
}

export interface AnalyzeRequest {
  redirect_chain: string[];
  session_events: SessionEvent[];
  outbound_data?: OutboundData;
  user_privacy_preference: string;
}

export interface AnalyzeResponse {
  verdict: "ALLOW" | "WARN" | "BLOCK";
  reason: string;
  cached: boolean;
}

export type BridgeMessage =
  | {
      kind: "sensitive_api";
      api: "clipboard_read" | "clipboard_write" | "canvas_fingerprint";
    }
  | {
      kind: "field_focus";
      fieldType: FieldType;
    }
  | {
      kind: "field_submit";
      fieldType: FieldType;
    };
    
export interface TabSession {
  redirectChain: string[];
  events: SessionEvent[];
}

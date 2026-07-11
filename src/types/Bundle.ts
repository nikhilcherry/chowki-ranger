export interface Bundle {
  id: string;            // Unique identifier (e.g. "bundle-123" or "pkg-456")
  senderId: string;      // Source hiking node (e.g. "checkpoint-3" or "hiker-alpha")
  timestamp: number;     // Time generated
  message: string;       // Text content (e.g. "Injured ankle, cannot walk. Requesting transport.")
  latitude: number;      // Coordinates of incident
  longitude: number;
  urgency: 'low' | 'medium' | 'high' | 'critical' | 'sos';
}

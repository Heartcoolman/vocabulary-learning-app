# amas-data-pipeline Specification

## Purpose

TBD - created by archiving change add-amas-original-algorithms. Update Purpose after archive.

## Requirements

### Requirement: ProcessOptions Extension for Visual Fatigue

The data pipeline SHALL transport extended visual fatigue metrics via `ProcessOptions` for TFM consumption.

#### ProcessOptions Structure

```rust
pub struct ProcessOptions {
    // ... existing fields ...
    pub visual_fatigue_score: Option<f64>,
    pub visual_fatigue_confidence: Option<f64>,

    // NEW: Extended visual fatigue raw metrics for TFM
    pub visual_fatigue_raw: Option<VisualFatigueRawMetrics>,
}

pub struct VisualFatigueRawMetrics {
    pub perclos: Option<f64>,              // [0, 1]
    pub blink_rate: Option<f64>,           // per minute
    pub eye_aspect_ratio: Option<f64>,     // EAR, typically [0.1, 0.5]
    pub squint_intensity: Option<f64>,     // [0, 1]
    pub gaze_off_screen_ratio: Option<f64>,// [0, 1]
    pub avg_blink_duration: Option<f64>,   // ms
    pub head_stability: Option<f64>,       // [0, 1]
    pub yawn_count: Option<i32>,           // count
    pub confidence: f64,                   // detection confidence [0, 1]
    pub timestamp_ms: i64,                 // collection timestamp
}
```

#### Route Layer Responsibility

`routes/amas.rs` SHALL:

1. Query `visual_fatigue_records` by sessionId within 30-second window
2. Map DB row fields to `VisualFatigueRawMetrics` struct
3. Pass via `ProcessOptions.visual_fatigue_raw`

### Requirement: SessionId Propagation

The data pipeline SHALL ensure sessionId consistency between visual fatigue metrics and learning events.

#### Scenario: Frontend sessionId inclusion

- **WHEN** frontend sends visual fatigue metrics
- **THEN** request SHALL include sessionId matching current learning session
- **AND** sessionId SHALL be non-empty string

#### Scenario: Backend sessionId correlation

- **WHEN** AMAS processes learning event with sessionId
- **THEN** backend SHALL query visual_fatigue_records by sessionId
- **AND** most recent record within 30-second window SHALL be used

#### Scenario: Missing sessionId handling

- **WHEN** visual fatigue metrics arrive without sessionId
- **THEN** metrics SHALL still be stored (with NULL sessionId)
- **AND** correlation SHALL fall back to user_id + timestamp matching

### Requirement: Extended Visual Fields Transport

The data pipeline SHALL support extended biometric fields from frontend to backend.

#### Scenario: Field extraction in frontend

- **WHEN** face detection API provides extended metrics
- **THEN** frontend SHALL extract and include in visual fatigue payload:
  - `eyeAspectRatio` (EAR)
  - `avgBlinkDuration` (ms)
  - `headStability` (0-1)
  - `squintIntensity` (0-1)
  - `gazeOffScreenRatio` (0-1)

#### Scenario: API detection fallback

- **WHEN** face detection API does not support extended fields
- **THEN** frontend SHALL send only core fields
- **AND** extended fields SHALL be omitted (not sent as null/0)

### Requirement: Quit Event Transport

The data pipeline SHALL support quit event signals from frontend to AMAS engine.

#### API Extension

Quit signal SHALL be transported via `ProcessEventRequest.is_quit` field (NOT a separate endpoint):

```rust
pub struct ProcessEventRequest {
    // ... existing fields ...

    /// Explicit quit signal from frontend
    #[serde(default)]
    pub is_quit: bool,
}
```

#### Scenario: Explicit quit event

- **WHEN** user closes learning session or navigates away
- **THEN** frontend SHALL send final event with `is_quit: true`
- **AND** sessionId SHALL match the closing session

#### Scenario: Backend quit signal propagation

- **WHEN** backend receives event with `is_quit: true`
- **THEN** AMAS engine SHALL pass is_quit=true to MDS and TFM
- **AND** subsequent events in new session SHALL have is_quit=false

#### Scenario: Timeout-based quit inference

- **WHEN** event arrives with `is_quit: false`
- **AND** gap since last event exceeds 30 minutes
- **THEN** route layer SHALL infer `is_quit = true` for this event
- **AND** pass inferred value to engine

### Requirement: Real-time Visual Fatigue Sync

The data pipeline SHALL minimize latency between visual fatigue detection and AMAS consumption.

#### Scenario: Freshness requirement

- **WHEN** AMAS processes learning event
- **THEN** visual fatigue data SHALL be from within last 30 seconds
- **AND** stale data (>30 seconds) SHALL be ignored

#### Scenario: In-memory cache

- **WHEN** visual fatigue metrics are received
- **THEN** latest values SHALL be cached in-memory per user
- **AND** AMAS SHALL read from cache for low-latency access

#### Scenario: Cache invalidation

- **WHEN** visual fatigue data is older than 60 seconds
- **THEN** cache entry SHALL be invalidated
- **AND** AMAS SHALL treat visual fatigue as unavailable

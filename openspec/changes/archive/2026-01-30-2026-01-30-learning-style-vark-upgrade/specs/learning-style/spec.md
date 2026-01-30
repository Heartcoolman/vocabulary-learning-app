# Learning Style Capability - VARK Upgrade Delta

## MODIFIED Requirements

### Requirement: Learning Style Model Dimensions

The learning style model is upgraded from VAK (3 dimensions) to VARK (4 dimensions).

**Before:** Visual, Auditory, Kinesthetic (3 dimensions)
**After:** Visual, Auditory, Reading, Kinesthetic (4 dimensions)

#### Scenario: VARK score normalization

- **Given** a user with interaction history
- **When** the system calculates learning style scores
- **Then** the four dimension scores (V, A, R, K) must sum to 1.0

#### Scenario: Reading dimension inference from dwellTime

- **Given** a user interaction with dwellTime > 5000ms and no audio playback
- **When** the system computes the reading score
- **Then** the reading score is calculated as: `min(1.0, (dwellTime - 5000) / 10000)`

#### Scenario: Reading dimension with audio playback

- **Given** a user interaction with dwellTime > 5000ms and audioPlayCount > 0
- **When** the system computes the reading score
- **Then** the reading score is reduced by 50% (audio_factor = 0.5)

---

### Requirement: Multimodal Style Detection

The system uses variance-based detection for multimodal learning style.

**Before:** `mixed` style when max score < 0.4
**After:** `multimodal` style when variance(V, A, R, K) < 0.01

#### Scenario: Multimodal detection with uniform distribution

- **Given** a user with scores V=0.26, A=0.24, R=0.25, K=0.25
- **When** the system determines the dominant style
- **Then** the style is classified as `multimodal`

#### Scenario: Dominant style detection

- **Given** a user with scores V=0.45, A=0.20, R=0.25, K=0.10
- **When** the system determines the dominant style
- **Then** the style is classified as `visual`

---

### Requirement: Backward Compatibility

API responses include both new and legacy style fields.

#### Scenario: Legacy client compatibility

- **Given** the system calculates style = `reading`
- **When** the API returns the learning style profile
- **Then** the response includes `styleLegacy = "mixed"`

#### Scenario: Legacy client compatibility for multimodal

- **Given** the system calculates style = `multimodal`
- **When** the API returns the learning style profile
- **Then** the response includes `styleLegacy = "mixed"`

#### Scenario: Direct style mapping

- **Given** the system calculates style = `visual`
- **When** the API returns the learning style profile
- **Then** the response includes `styleLegacy = "visual"`

---

## ADDED Requirements

### Requirement: ML-based Learning Style Prediction

The system supports online SGD-based ML model for learning style prediction.

#### Scenario: Cold start behavior

- **Given** a user with fewer than 50 interactions
- **When** the system calculates learning style
- **Then** the rule engine is used (model_type = "rule_engine")

#### Scenario: ML model activation

- **Given** a user with 50 or more interactions
- **When** the system calculates learning style
- **Then** the ML model is used (model_type = "ml_sgd")

#### Scenario: Model update on interaction

- **Given** a user submits an answer
- **When** the interaction is recorded
- **Then** the VARK ML model weights are updated incrementally

#### Scenario: Time-weighted learning

- **Given** a user interaction from 14 days ago
- **When** the model processes the interaction
- **Then** the interaction weight is reduced to approximately 0.37 (exp(-1))

---

### Requirement: VARK Interaction Data Collection

The system collects detailed interaction data for VARK analysis.

#### Scenario: Image interaction tracking

- **Given** a user views or zooms an image
- **When** the answer is submitted
- **Then** imageViewCount and imageZoomCount are recorded

#### Scenario: Audio interaction tracking

- **Given** a user plays audio pronunciation
- **When** the answer is submitted
- **Then** audioPlayCount and audioReplayCount are recorded

#### Scenario: Note taking tracking

- **Given** a user writes a note or annotation
- **When** the answer is submitted
- **Then** noteWriteCount is incremented

---

### Requirement: Confidence Calibration

Learning style confidence is calculated with bounded output.

#### Scenario: Confidence bounds

- **Given** any learning style calculation
- **When** confidence is computed
- **Then** the confidence value is in range [0, 0.95]

#### Scenario: Sample-based confidence

- **Given** a user with 100 interactions
- **When** confidence is computed
- **Then** sample_confidence contributes 0.5 to total confidence

#### Scenario: Score-gap confidence

- **Given** scores with max=0.45 and second_max=0.25
- **When** model_confidence is computed
- **Then** model_confidence = 0.20

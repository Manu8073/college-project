# NETRA — Shared Event Contract

All modules in the NETRA application (both frontend and backend) use a standardized event shape for communication. This allows different team members to build their modules independently while guaranteeing compatibility.

## Event Shape

Every event must be a JSON object with this structure:

```json
{
  "id": "unique-id",
  "source": "detection | navigation | ocr | shell",
  "type": "obstacle | navigation | text | system",
  "priority": "low | medium | high | critical",
  "timestamp": "ISO timestamp",
  "payload": {}
}
```

### Fields:

*   **`id`** (`string`): A unique UUID for the event. If not provided by the frontend, the backend will generate one.
*   **`source`** (`string`): The module that emitted the event. Must be one of: `"detection"`, `"navigation"`, `"ocr"`, `"shell"`.
*   **`type`** (`string`): The semantic category of the event. Must be one of: `"obstacle"`, `"navigation"`, `"text"`, `"system"`.
*   **`priority`** (`string`): How urgently the system should handle/speak the event. Must be one of: `"low"`, `"medium"`, `"high"`, `"critical"`.
*   **`timestamp`** (`string`): An ISO 8601 date-time string (e.g., `"2025-01-01T00:00:00Z"`).
*   **`payload`** (`object`): Event-specific data. The schema for this object depends on the `type`.

## Example Payloads

### 1. Obstacle Detection (`type: "obstacle"`)
*Emitted by Member 1's Detection Module.*

```json
{
  "label": "person",
  "confidence": 0.92,
  "direction": "left",
  "distance": "2m"
}
```

### 2. Navigation Instruction (`type: "navigation"`)
*Emitted by Member 2's Navigation Module.*

```json
{
  "instruction": "Turn right in 50 meters",
  "distance": "50m",
  "heading": "NE"
}
```

### 3. OCR Text (`type: "text"`)
*Emitted by Member 3's OCR Module.*

```json
{
  "text": "STOP",
  "confidence": 0.97,
  "language": "en"
}
```

### 4. System Status (`type: "system"`)
*Emitted by Member 4's Shell Module.*

```json
{
  "message": "NETRA system initialized."
}
```

## Backend Validation
The backend `POST /api/events` endpoint strictly validates these fields. Invalid events will receive a `400 Bad Request` error.



┌─────────────────┐
│ Smart Contracts │
└───────▲─────────┘
        │ Websocket log subscription
┌───────┴─────────┐
│ Backend Listener│   ← parses events, JSONL storage
└───────▲─────────┘
        │ HTTP responses (JSON)
┌───────┴─────────┐
│     API Server  │  ← /events/recent, etc.
└───────▲─────────┘
        │ fetch() from React
┌───────┴─────────┐
│     Frontend    │
└─────────────────┘



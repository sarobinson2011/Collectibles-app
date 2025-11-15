# Collectibles Platform — Backend System Design

## Overview

This backend forms the **indexing and data layer** for the Collectibles Platform.  
It listens to on-chain events emitted by the Registry, NFT, and Marketplace contracts, processes them, and writes structured data for off-chain access (via logs, and later a database + API).

The backend is implemented entirely in **TypeScript (Node.js)** and designed for **modularity, hot reloading**, and **future scalability**.

---

## Directory Structure

backend/
├── src/
│ ├── config/
│ │ └── env.ts              <--  Environment configuration & validation
│ ├── infra/
│ │ ├── logger.ts           <--  Logging subsystem
│ │ └── files.ts            <--  JSONL file writer
│ ├── contracts/
│ │ └── abi.ts              <--  Contract ABIs (for event parsing)
│ └── index.ts              <--  Main runtime entrypoint (event listener)
├── nodemon.json            <--  Hot-reload dev configuration
├── package.json            <--  Dependencies & npm scripts
└── .env                    <--  Runtime configuration

---

## System Layers Overview

| Layer                 | Folder                             | Responsibility                                      |
| --------------------- | ---------------------------------- | --------------------------------------------------- |
| **Configuration**     | `config/`                          | Load and validate environment variables             |
| **Infrastructure**    | `infra/`                           | Logging, file persistence, and later DB connections |
| **Contracts**         | `contracts/`                       | Define ABIs and event schemas                       |
| **Application Logic** | `index.ts` (and later `services/`) | Event listening, parsing, and routing               |
| **Interface**         | `api/` (future)                    | Serve data to frontend or external clients          |

---

## How It All Works (Runtime Flow)

1. The backend starts up and loads the .env configuration.
2. It connects to the Arbitrum Sepolia WebSocket RPC.
3. It subscribes to all logs from:
    - Collectible Registry
    - Collectible NFT
    - Collectible Market

4. Each time an event fires:
    - It’s written immediately to raw_logs.jsonl.
    - After a few block confirmations, it’s parsed using the ABI.
    - Parsed data is appended to collectible_log.jsonl.

5. These .jsonl files can be replayed, indexed, or loaded into a DB at any time.

This event-driven model is efficient, resilient, and chain-agnostic.

---

## Example Log Flow

Console:

[info] Backend starting
[info] Listeners attached {"latest": 12345678}
[info] event registry CollectibleRegistered block=12345700

collectible_log.jsonl entry:

{"t":1731368200000,"contract":"registry","event":"CollectibleRegistered","args":{"rfidHash":"0xabc...","owner":"0xF8f..."},"tx":"0x123...","block":12345700}

---

## Mental Model Summary

    * infra/ — foundational building blocks (logging, file I/O).
    * config/ — environment and setup logic.
    * contracts/ — defines how to interpret blockchain events.
    * index.ts — orchestration layer that ties everything together.

Everything above is modular — easy to expand into a full indexing and analytics backend.

---

## Future Architecture Diagram

flowchart TD
    A[Arbitrum Sepolia Network] -->|Events| B[WebSocket Provider]
    B -->|Raw Logs| C[Indexer (index.ts)]
    C --> D[File Storage (.jsonl)]
    C -->|Parse w/ ABIs| E[Structured Domain Events]
    E --> F[(SQLite / Postgres)]
    F --> G[API Layer (Express)]
    G --> H[Frontend Marketplace UI]

---

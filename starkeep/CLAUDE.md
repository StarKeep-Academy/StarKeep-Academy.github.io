# Starkeep Academy — Claude Code Instructions

## Scope
You are working exclusively on the Starkeep Academy platform.
The parent directory may contain a separate landing page — ignore it entirely.

## Read These First
Before writing any code, read in this order:
1. docs/STARKEEP_CONTEXT.md — all domain knowledge and vocabulary
2. docs/DECISIONS.md — every locked architectural decision
3. docs/API_CONTRACT.md — authoritative API shapes
4. docs/STARMAP_SPEC.md — Star Map feature spec (as amended by DEC-013)
5. For frontend-web/ work specifically: docs/WEB_FRONTEND_ARCHITECTURE.md and docs/FRONTEND_API_INTEGRATION.md

## Project Structure
- backend/        Django + DRF (starkeep-api)
- starkeep_ai/    FastAPI AI microservice (starkeep-ai)
- frontend/       React Native + Expo Router (starkeep-app) — targets iOS + Android
- frontend-web/   Vanilla JS + Three.js web client (DEC-005 amendment) — targets web; separate codebase from frontend/, same Django backend
- docs/           Source of truth — check here before deciding anything

## Rules (Non-Negotiable)
1. Never import `lux` from another app — use Django signals (DEC-009)
2. Never rename VR-stable API fields — add only (DEC-006)
3. All design values in frontend/ come from frontend/design-system/tokens.ts — frontend-web/ has no equivalent shared token source yet, don't assume one exists
4. LVM formula lives only in backend/apps/lux/scoring.py
5. Feature folders mirror backend apps 1:1
6. Check docs/DECISIONS.md before any architectural choice

## Current Phase
Phase 4 Complete — Star Map read + write (milestones/constellations from API; create, edit, submit, evidence upload, edge-graph + coordinate persistence)
Next: Phase 5 — Avatar (full Image 7 profile)

## Stack
- Backend: Django 5, DRF, Django Channels, PostgreSQL, Redis
- AI: FastAPI (mock provider in v1)
- Mobile (frontend/): React Native + Expo Router, TanStack Query, Zustand
- Web (frontend-web/): Vanilla JS + Three.js, no bundler/framework (DEC-005 amendment)
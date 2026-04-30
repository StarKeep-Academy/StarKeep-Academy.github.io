# Starkeep Academy — Claude Code Instructions

## Scope
You are working exclusively on the Starkeep Academy platform.
The parent directory may contain a separate landing page — ignore it entirely.

## Read These First
Before writing any code, read in this order:
1. docs/STARKEEP_CONTEXT.md — all domain knowledge and vocabulary
2. docs/DECISIONS.md — every locked architectural decision
3. docs/API_CONTRACT.md — authoritative API shapes

## Project Structure
- backend/        Django + DRF (starkeep-api)
- starkeep_ai/    FastAPI AI microservice (starkeep-ai)
- frontend/       React Native + Expo Router (starkeep-app)
- docs/           Source of truth — check here before deciding anything

## Rules (Non-Negotiable)
1. Never import `lux` from another app — use Django signals (DEC-009)
2. Never rename VR-stable API fields — add only (DEC-006)
3. All design values come from frontend/design-system/tokens.ts
4. LVM formula lives only in backend/apps/lux/scoring.py
5. Feature folders mirror backend apps 1:1
6. Check docs/DECISIONS.md before any architectural choice

## Current Phase
Phase 2 Complete — Shell (radial nav menu, all route stubs, home buttons)
Next: Phase 3 — Star Map (read: milestones + constellations from API)

## Stack
- Backend: Django 5, DRF, Django Channels, PostgreSQL, Redis
- AI: FastAPI (mock provider in v1)
- Frontend: React Native + Expo Router, TanStack Query, Zustand
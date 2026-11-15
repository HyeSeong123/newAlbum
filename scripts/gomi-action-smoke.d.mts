import type { Page } from '@playwright/test';
export type PaintedReaction = { source: 'on-device' | 'nonverbal'; line: string; elapsedMs: number;
  responseId?: string; previousResponseId?: string | null; affection?: number; inferenceRequested?: boolean };
export function pressAndPaint(page: Page, selector: string): Promise<PaintedReaction>;
export function assertOwnTimings(records: unknown[], targetMs?: number): Record<string, number>;
export function assertQuietReactions(records: unknown[], targetMs?: number): { samples: number; maxMs: number | null };
export function assertOwnAssets(proof: unknown, expected: unknown): void;
export function verifyInstalledGomiAction(page: Page, output?: string, options?: { offline?: boolean }): Promise<Record<string, unknown>>;

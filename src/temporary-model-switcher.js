import { config } from './config.js';
import { getFallbackModel } from './fallback-config.js';
import { logger } from './utils/logger.js';

const activeSwitches = new Map();
const DEFAULT_SWITCH_DURATION_MS = 5 * 60 * 60 * 1000;

function getSwitchConfig() {
    return config?.temporaryClaudeToGeminiSwitch || {};
}

export function isClaudeModel(modelId) {
    return typeof modelId === 'string' && modelId.toLowerCase().includes('claude');
}

export function isGeminiModel(modelId) {
    return typeof modelId === 'string' && modelId.toLowerCase().includes('gemini');
}

function getSwitchDurationMs() {
    const configured = getSwitchConfig().durationMs;
    return typeof configured === 'number' && configured > 0 ? configured : DEFAULT_SWITCH_DURATION_MS;
}

function cleanupExpiredSwitch(modelId, now = Date.now()) {
    const entry = activeSwitches.get(modelId);
    if (!entry) return null;
    if (entry.expiresAt > now) return entry;

    activeSwitches.delete(modelId);
    logger.info(`[ModelSwitch] Temporary switch expired for ${modelId}; routing restored to Claude`);
    return null;
}

export function resolveTemporaryModel(modelId, now = Date.now()) {
    const enabled = getSwitchConfig().enabled !== false;
    if (!enabled || !isClaudeModel(modelId)) {
        return {
            originalModel: modelId,
            model: modelId,
            switched: false,
            expiresAt: null
        };
    }

    const entry = cleanupExpiredSwitch(modelId, now);
    if (!entry) {
        return {
            originalModel: modelId,
            model: modelId,
            switched: false,
            expiresAt: null
        };
    }

    return {
        originalModel: modelId,
        model: entry.fallbackModel,
        switched: true,
        expiresAt: entry.expiresAt,
        activatedAt: entry.activatedAt,
        reason: entry.reason
    };
}

export function activateTemporaryClaudeToGeminiSwitch(modelId, reason = 'All Claude accounts exhausted', now = Date.now()) {
    const enabled = getSwitchConfig().enabled !== false;
    if (!enabled || !isClaudeModel(modelId)) return null;

    const fallbackModel = getFallbackModel(modelId);
    if (!isGeminiModel(fallbackModel)) return null;

    const durationMs = getSwitchDurationMs();
    const existing = cleanupExpiredSwitch(modelId, now);
    activeSwitches.set(modelId, {
        fallbackModel,
        activatedAt: now,
        expiresAt: now + durationMs,
        reason
    });

    if (existing?.fallbackModel === fallbackModel && existing.expiresAt > now) {
        logger.warn(`[ModelSwitch] Refreshed temporary switch ${modelId} -> ${fallbackModel} for ${Math.round(durationMs / 3600000)}h (${reason})`);
    } else {
        logger.warn(`[ModelSwitch] Activated temporary switch ${modelId} -> ${fallbackModel} for ${Math.round(durationMs / 3600000)}h (${reason})`);
    }

    return fallbackModel;
}

export function clearTemporaryModelSwitch(modelId) {
    activeSwitches.delete(modelId);
}

function summarizeUsageHistory(history = {}) {
    let total = 0;
    let today = 0;
    let thisHour = 0;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);

    Object.entries(history).forEach(([iso, hourData]) => {
        const timestamp = new Date(iso);
        const hourTotal = hourData?._total || hourData?.total || 0;
        total += hourTotal;

        if (timestamp >= todayStart) {
            today += hourTotal;
        }
        if (timestamp.getTime() === currentHour.getTime()) {
            thisHour = hourTotal;
        }
    });

    return { total, today, thisHour };
}

function buildUsageSummary(accounts = [], history = {}) {
    const requests = summarizeUsageHistory(history);
    const accountsByTier = { free: 0, pro: 0, ultra: 0, unknown: 0 };
    const detectedBySource = { paidTier: 0, currentTier: 0, allowedTiers: 0, unknown: 0 };
    let requestsPerMinuteCap = 0;
    let requestsPerDayCap = 0;
    let tierSignalMismatchCount = 0;

    accounts.forEach(account => {
        const subscription = account.subscription || {};
        const tier = accountsByTier[subscription.tier] !== undefined ? subscription.tier : 'unknown';
        accountsByTier[tier]++;

        const source = detectedBySource[subscription.tierSource] !== undefined
            ? subscription.tierSource
            : 'unknown';
        detectedBySource[source]++;

        const quotaLimits = subscription.quotaLimits || {};
        if (Number.isFinite(quotaLimits.requestsPerMinute)) {
            requestsPerMinuteCap += quotaLimits.requestsPerMinute;
        }
        if (Number.isFinite(quotaLimits.requestsPerDay)) {
            requestsPerDayCap += quotaLimits.requestsPerDay;
        }

        const paidTierId = subscription.tierSignals?.paidTierId;
        const currentTierId = subscription.tierSignals?.currentTierId;
        if (paidTierId && currentTierId && paidTierId !== currentTierId) {
            tierSignalMismatchCount++;
        }
    });

    return {
        requests,
        officialQuota: {
            requestsPerMinuteCap,
            requestsPerDayCap
        },
        accountsByTier,
        tierDetection: {
            detectedBySource,
            tierSignalMismatchCount
        },
        trackedScope: 'local_proxy_requests_only'
    };
}

export {
    summarizeUsageHistory,
    buildUsageSummary
};

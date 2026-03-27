/**
 * Temporary Claude -> Gemini switch tests
 */

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         TEMPORARY CLAUDE TO GEMINI SWITCH TESTS              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const {
        resolveTemporaryModel,
        activateTemporaryClaudeToGeminiSwitch,
        clearTemporaryModelSwitch
    } = await import('../src/temporary-model-switcher.js');

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (error) {
            console.log(`✗ ${name}`);
            console.log(`  Error: ${error.message}`);
            failed++;
        }
    }

    function assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
        }
    }

    function assertTrue(value, message = '') {
        if (!value) {
            throw new Error(message || 'Expected true but got false');
        }
    }

    clearTemporaryModelSwitch('claude-sonnet-4-6-thinking');

    test('resolveTemporaryModel returns original Claude model when no switch is active', () => {
        const result = resolveTemporaryModel('claude-sonnet-4-6-thinking', 1000);
        assertEqual(result.model, 'claude-sonnet-4-6-thinking');
        assertEqual(result.switched, false);
    });

    test('activateTemporaryClaudeToGeminiSwitch maps Claude Sonnet to Gemini fallback', () => {
        const switchedTo = activateTemporaryClaudeToGeminiSwitch(
            'claude-sonnet-4-6-thinking',
            'quota exhausted',
            2000
        );
        assertEqual(switchedTo, 'gemini-3-flash');

        const resolved = resolveTemporaryModel('claude-sonnet-4-6-thinking', 2001);
        assertEqual(resolved.model, 'gemini-3-flash');
        assertTrue(resolved.switched, 'Expected active temporary switch');
    });

    test('temporary switch expires after configured window and routes back to Claude', () => {
        const sixHoursLater = 2000 + 6 * 60 * 60 * 1000;
        const resolved = resolveTemporaryModel('claude-sonnet-4-6-thinking', sixHoursLater);
        assertEqual(resolved.model, 'claude-sonnet-4-6-thinking');
        assertEqual(resolved.switched, false);
    });

    test('non-Claude models do not activate a temporary switch', () => {
        const switchedTo = activateTemporaryClaudeToGeminiSwitch('gemini-3-flash', 'should ignore', 3000);
        assertEqual(switchedTo, null);
    });

    console.log(`\nPassed: ${passed}`);
    console.log(`Failed: ${failed}`);

    process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});

<?php
/**
 * Standalone tests for Wake-on-LAN Plus functions.
 * Run with: php tests/test_functions.php
 */

// Bootstrap: start a session and load the modules under test
$_SESSION = [];
session_status() === PHP_SESSION_NONE && session_start();

require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/functions.php';

$passed = 0;
$failed = 0;

function assert_equals($expected, $actual, $label) {
    global $passed, $failed;
    if ($expected === $actual) {
        $passed++;
        echo "  PASS: $label\n";
    } else {
        $failed++;
        echo "  FAIL: $label\n";
        echo "    Expected: " . var_export($expected, true) . "\n";
        echo "    Actual:   " . var_export($actual, true) . "\n";
    }
}

function assert_true($value, $label) {
    assert_equals(true, $value, $label);
}

function assert_false($value, $label) {
    assert_equals(false, $value, $label);
}

function assert_not_empty($value, $label) {
    global $passed, $failed;
    if (!empty($value)) {
        $passed++;
        echo "  PASS: $label\n";
    } else {
        $failed++;
        echo "  FAIL: $label (value was empty)\n";
    }
}

function assert_contains($haystack, $needle, $label) {
    global $passed, $failed;
    if (strpos($haystack, $needle) !== false) {
        $passed++;
        echo "  PASS: $label\n";
    } else {
        $failed++;
        echo "  FAIL: $label\n";
        echo "    '$needle' not found in '$haystack'\n";
    }
}

// ============================================================
echo "=== safeGet() ===\n";
// ============================================================

$data = ['key1' => 'value1', 'key2' => 0, 'key3' => null];

assert_equals('value1', safeGet($data, 'key1', 'default'), 'Returns existing value');
assert_equals('default', safeGet($data, 'missing', 'default'), 'Returns default for missing key');
assert_equals(0, safeGet($data, 'key2', 'default'), 'Returns 0 without falling back to default');
assert_equals(null, safeGet($data, 'key3', 'default'), 'Returns null for null value (isset returns false)');

// ============================================================
echo "\n=== generateCsrfToken() ===\n";
// ============================================================

// Clear any existing token
unset($_SESSION['csrf_token']);

$token1 = generateCsrfToken();
assert_not_empty($token1, 'Generates a non-empty token');
assert_equals(64, strlen($token1), 'Token is 64 hex chars (32 bytes)');

$token2 = generateCsrfToken();
assert_equals($token1, $token2, 'Returns same token on subsequent calls within session');

// ============================================================
echo "\n=== validateCsrfToken() ===\n";
// ============================================================

assert_true(validateCsrfToken($token1), 'Validates correct token');
assert_false(validateCsrfToken('invalid_token'), 'Rejects invalid token');
assert_false(validateCsrfToken(''), 'Rejects empty string');

// ============================================================
echo "\n=== checkRateLimit() ===\n";
// ============================================================

// Clear rate limit data
foreach (array_keys($_SESSION) as $key) {
    if (strpos($key, 'rate_limit_') === 0) unset($_SESSION[$key]);
}

assert_true(checkRateLimit('test_action', 3, 60), 'First request is allowed');
assert_true(checkRateLimit('test_action', 3, 60), 'Second request is allowed');
assert_true(checkRateLimit('test_action', 3, 60), 'Third request is allowed (at limit)');
assert_false(checkRateLimit('test_action', 3, 60), 'Fourth request is blocked (over limit)');

// Different action should have its own bucket
assert_true(checkRateLimit('other_action', 3, 60), 'Different action has separate limit');

// Test window expiry by manipulating timestamps
$_SESSION['rate_limit_expiry_test'] = [time() - 120, time() - 120, time() - 120];
assert_true(checkRateLimit('expiry_test', 3, 60), 'Expired entries are cleaned up');

// ============================================================
echo "\n=== wakeOnLan() - validation ===\n";
// ============================================================

// Test with invalid MAC
$debug = [];
$result = wakeOnLan('XX:XX:XX:XX:XX:XX', '192.168.1.1', '24', '9', $debug);
assert_contains($result, 'Invalid MAC-address', 'Rejects invalid MAC address');

// Test with empty MAC
$result = wakeOnLan('', '192.168.1.1', '24', '9', $debug);
assert_contains($result, 'Invalid MAC-address', 'Rejects empty MAC address');

// Test with invalid CIDR
$result = wakeOnLan('AA:BB:CC:DD:EE:FF', '192.168.1.1', '33', '9', $debug);
assert_contains($result, 'Invalid subnet size', 'Rejects CIDR > 32');

$result = wakeOnLan('AA:BB:CC:DD:EE:FF', '192.168.1.1', '-1', '9', $debug);
// -1 gets converted to 0 by intval, which is valid (0-32), but negative stays negative
// Actually intval('-1') = -1, so it should fail
assert_contains($result, 'Invalid subnet size', 'Rejects negative CIDR');

// Test with invalid port
$result = wakeOnLan('AA:BB:CC:DD:EE:FF', '192.168.1.1', '24', '99999', $debug);
assert_contains($result, 'Invalid port', 'Rejects port > 65535');

// Test with unresolvable hostname
$result = wakeOnLan('AA:BB:CC:DD:EE:FF', 'this.host.definitely.does.not.exist.invalid', '24', '9', $debug);
assert_contains($result, 'Cannot resolve hostname', 'Rejects unresolvable hostname');

// Test debug output is populated
$debug = [];
wakeOnLan('AA:BB:CC:DD:EE:FF', '192.168.1.1', '24', '9', $debug);
assert_true(count($debug) > 0, 'Debug output is populated');

// ============================================================
echo "\n=== Summary ===\n";
// ============================================================
$total = $passed + $failed;
echo "$passed/$total tests passed";
if ($failed > 0) {
    echo " ($failed FAILED)";
}
echo "\n";

exit($failed > 0 ? 1 : 0);

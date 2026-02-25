<?php
/**
 * Authentication and CSRF token management.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/**
 * Generate a CSRF token and store it in the session.
 *
 * @return string The CSRF token
 */
function generateCsrfToken()
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Validate a CSRF token against the session token.
 *
 * @param string $token The token to validate
 * @return bool True if valid
 */
function validateCsrfToken($token)
{
    return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

/**
 * Basic Authentication via environment variables.
 * Set WOL_USERNAME and WOL_PASSWORD to enable.
 */
$wolUsername = getenv('WOL_USERNAME');
$wolPassword = getenv('WOL_PASSWORD');
if ($wolUsername && $wolPassword) {
    $authenticated = false;
    if (isset($_SERVER['PHP_AUTH_USER']) && isset($_SERVER['PHP_AUTH_PW'])) {
        if (hash_equals($wolUsername, $_SERVER['PHP_AUTH_USER']) &&
            hash_equals($wolPassword, $_SERVER['PHP_AUTH_PW'])) {
            $authenticated = true;
        }
    }
    if (!$authenticated) {
        header('WWW-Authenticate: Basic realm="Wake-on-LAN"');
        http_response_code(401);
        die('Authentication required.');
    }
}

$csrfToken = generateCsrfToken();

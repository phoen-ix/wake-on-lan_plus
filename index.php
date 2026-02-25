<?php
/**
 * Wake-on-LAN Plus - Entry Point
 *
 * Github https://github.com/phoen-ix/wake-on-lan_plus
 * fork of https://github.com/andishfr/wake-on-lan.php/ from Andreas Schaefer
 * license https://github.com/phoen-ix/wake-on-lan_plus/blob/master/LICENSE MIT License
 */

require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/functions.php';

/**
 * Initialize required variables
 */
$configFilename = __DIR__ . DIRECTORY_SEPARATOR . "config.json";
$requestMethod = $_SERVER["REQUEST_METHOD"];

$isSocketExtensionLoaded = intval(extension_loaded("sockets"));
$isDebugEnabled = intval(safeGet($_GET, "debug", false));
$ajaxOperation = safeGet($_POST, "aop", safeGet($_GET, "aop", ""));

// Configurable rate limits via environment variables (with defaults)
$rateLimitConfigSet = intval(getenv('WOL_RATE_LIMIT_CONFIG_SET') ?: 10);
$rateLimitHostCheck = intval(getenv('WOL_RATE_LIMIT_HOST_CHECK') ?: 30);
$rateLimitHostWakeup = intval(getenv('WOL_RATE_LIMIT_HOST_WAKEUP') ?: 5);
$rateLimitWindowSecs = intval(getenv('WOL_RATE_LIMIT_WINDOW_SECS') ?: 60);

/**
 * Handle AJAX operations
 */
if ("CONFIG.GET" === $ajaxOperation) {
    $jsonData = [];
    if (file_exists($configFilename)) {
        $jsonString = file_get_contents($configFilename);
        try {
            $jsonData = json_decode($jsonString, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            endWithErrorMessage("Failed to parse configuration file: " . $e->getMessage());
        }
    }
    endWithJsonResponse($jsonData);
} elseif ("CONFIG.SET" === $ajaxOperation && "POST" == $requestMethod) {
    // Rate limit config saves
    if (!checkRateLimit('CONFIG.SET', $rateLimitConfigSet, $rateLimitWindowSecs)) {
        http_response_code(429);
        die("Too many requests. Please try again later.");
    }

    // Validate CSRF token
    $requestCsrfToken = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    if (!validateCsrfToken($requestCsrfToken)) {
        http_response_code(403);
        die("CSRF token validation failed.");
    }

    $phpInput = file_get_contents("php://input");
    try {
        $jsonData = json_decode($phpInput, false, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        endWithErrorMessage("Invalid JSON data: " . $e->getMessage());
    }

    // Validate JSON structure: must be an array of host objects
    if (!is_array($jsonData)) {
        endWithErrorMessage("Invalid configuration format: expected an array.");
    }
    foreach ($jsonData as $entry) {
        if (!is_object($entry) || !isset($entry->mac) || !isset($entry->host)) {
            endWithErrorMessage("Invalid configuration entry: each item must have at least 'mac' and 'host' fields.");
        }
    }

    $jsonString = json_encode($jsonData, JSON_PRETTY_PRINT);
    $tmpFile = $configFilename . '.tmp.' . getmypid();
    if (file_put_contents($tmpFile, $jsonString, LOCK_EX) === false || !rename($tmpFile, $configFilename)) {
        @unlink($tmpFile);
        endWithErrorMessage("Cannot write configuration file. Please make sure the web server can write to the folder.");
    }
    $newToken = rotateCsrfToken();
    endWithJsonResponse(["status" => "OK", "csrfToken" => $newToken]);
} elseif ("CONFIG.DOWNLOAD" === $ajaxOperation) {
    $jsonData = [];
    if (file_exists($configFilename)) {
        $jsonString = file_get_contents($configFilename);
        $jsonData = json_decode($jsonString, true);
    }
    endWithJsonResponse($jsonData, "wake-on-lan-" . date("Ymd-His") . ".json");
} elseif ("HOST.CHECK" === $ajaxOperation) {
    // Rate limit host checks
    if (!checkRateLimit('HOST.CHECK', $rateLimitHostCheck, $rateLimitWindowSecs)) {
        http_response_code(429);
        die("Too many requests. Please try again later.");
    }

    $HOST_CHECK_PORTS = ["3389" => "3389 (RDP)", "22" => "22 (SSH)", "80" => "80 (HTTP)", "443" => "443 (HTTPS)", "5938" => "5938 (TeamViewer)",];
    $host = safeGet($_GET, "host", null);
    if (!$host) {
        endWithErrorMessage("Parameter host not set.");
    }
    // Validate host to prevent SSRF: only allow alphanumeric, dots, hyphens, colons (IPv6)
    if (!preg_match('/^[a-zA-Z0-9.\-:]+$/', $host) || strlen($host) > 253) {
        endWithErrorMessage("Invalid host parameter.");
    }
    $responseData = ["error" => false, "isUp" => false];

    $errStr = false;
    $errCode = 0;
    $waitTimeoutInSeconds = 3;

    foreach ($HOST_CHECK_PORTS as $port => $info) {
        if ($responseData["isUp"]) {
            break;
        }
        if ($fp = @fsockopen($host, $port, $errCode, $errStr, $waitTimeoutInSeconds)) {
            fclose($fp);
            $responseData["isUp"] = true;
            $responseData["info"] = $info;
            $responseData["errCode"] = "";
            $responseData["errStr"] = "";
            $responseData["errorPort"] = "";
        } else {
            $responseData["isUp"] = false;
            $responseData["errCode"] = $errCode;
            $responseData["errStr"] = $errStr;
            $responseData["errorPort"] = $port;
        }
    }

    endWithJsonResponse($responseData);
} elseif ("HOST.WAKEUP" === $ajaxOperation && "POST" == $requestMethod) {
    // Rate limit wake-up requests
    if (!checkRateLimit('HOST.WAKEUP', $rateLimitHostWakeup, $rateLimitWindowSecs)) {
        http_response_code(429);
        die("Too many requests. Please try again later.");
    }

    // Validate CSRF token
    $requestCsrfToken = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    if (!validateCsrfToken($requestCsrfToken)) {
        http_response_code(403);
        die("CSRF token validation failed.");
    }

    $responseData = ["error" => false, "data" => ""];

    $phpInput = file_get_contents("php://input");
    $wolData = json_decode($phpInput, true) ?: [];

    $mac = safeGet($wolData, "mac", "");

    $MESSAGE = wakeOnLan($mac, safeGet($wolData, "host", ""), safeGet($wolData, "cidr", ""), safeGet($wolData, "port", ""), $debugOut);

    if ($isDebugEnabled) {
        $responseData["DEBUG"] = $debugOut;
    }

    $newToken = rotateCsrfToken();
    if ($MESSAGE) {
        endWithErrorMessage($MESSAGE);
    } else {
        endWithJsonResponse(["info" => "Magic packet has been sent for <strong>" . htmlspecialchars($mac, ENT_QUOTES, 'UTF-8') . "</strong>. Please wait for the host to come up...", "csrfToken" => $newToken]);
    }
} else {
    if (isset($_GET["aop"])) {
        endWithErrorMessage("Invalid value for aop!");
    }
}

// Security headers for HTML responses
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("X-XSS-Protection: 1; mode=block");
header("Referrer-Policy: strict-origin-when-cross-origin");
?><!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Web based user interface to send wake-on-lan magic packets.">
    <title data-lang-ckey="title">Wake On Lan</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"
          integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/css/all.min.css"
          integrity="sha256-mUZM63G8m73Mcidfrv5E+Y61y7a12O5mW4ezU3bxqW4=" crossorigin="anonymous">
    <link rel="stylesheet" href="assets/style.css">
</head>
<body>

<div id="pageContainer">

    <!-- ========== HEADER ========== -->
    <header class="wol-header">
        <a href="" class="wol-header__brand">
            <div class="wol-header__icon">
                <i class="fas fa-broadcast-tower"></i>
            </div>
            <span class="wol-header__title" data-lang-ckey="title">Wake On Lan</span>
        </a>

        <div class="wol-header__stats" id="hostStats">
            <span class="stat-online" id="statOnline">0</span>
            <span class="stat-sep">online</span>
            <span class="stat-sep">/</span>
            <span id="statTotal">0</span>
            <span class="stat-sep">total</span>
        </div>

        <img id="ajaxLoader"
             src="data:image/gif;base64,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"
             alt="loading..">

        <div class="wol-header__spacer"></div>

        <div class="wol-header__actions">
            <!-- Options Dropdown -->
            <div class="dropdown">
                <button class="wol-icon-btn" id="dropdownOptions" data-bs-toggle="dropdown" aria-expanded="false" title="Options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownOptions">
                    <li><a id="downloadConfig" class="dropdown-item" href="?aop=CONFIG.DOWNLOAD"><i class="fa fa-file-csv"></i> <span data-lang-ckey="download_config">Download Configuration</span></a></li>
                    <li><a id="exportConfig" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#exportModal" href="#"><i class="fa fa-file-export"></i> <span data-lang-ckey="export_config">Export Configuration</span></a></li>
                    <li><a id="importConfig" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#importModal" href="#"><i class="fa fa-file-import"></i> <span data-lang-ckey="import_config">Import Configuration</span></a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a id="loadConfigFromServer" class="dropdown-item" href="#"><i class="fa fa-folder-open"></i> <span data-lang-ckey="load_config">Load Configuration</span></a></li>
                    <li style="display: none;"><a id="saveConfigToServer" class="dropdown-item" href="#"><i class="fa fa-save"></i> <span data-lang-ckey="save_config">Save Configuration</span></a></li>
                </ul>
            </div>

            <!-- Settings Button -->
            <button class="wol-icon-btn" id="openSettings" title="Settings">
                <i class="fas fa-cog"></i>
            </button>
        </div>
    </header>

    <!-- Legacy notification container (hidden, replaced by toast) -->
    <div id="notificationContainer"></div>

    <!-- ========== HOST GRID ========== -->
    <div id="hostGrid"></div>

    <!-- Empty state (shown when no hosts) -->
    <div id="emptyState" class="wol-empty" style="display: none;">
        <div class="wol-empty__icon"><i class="fas fa-network-wired"></i></div>
        <div class="wol-empty__title">No hosts configured</div>
        <div class="wol-empty__text">Add your first network device to start sending magic packets.</div>
    </div>

    <!-- Hidden data table (keeps original structure for getConfiguration) -->
    <table id="hostTable" class="table">
        <thead><tr><th></th><th></th><th></th><th></th><th></th><th></th><th></th></tr></thead>
        <tbody></tbody>
    </table>

</div>

<!-- ========== FLOATING ADD BUTTON ========== -->
<button class="wol-fab" id="fabAddHost" title="Add Host">
    <i class="fas fa-plus"></i>
</button>

<!-- ========== SAVE / CANCEL BAR ========== -->
<div class="wol-save-bar" id="saveBar">
    <span class="wol-save-bar__label">Unsaved changes</span>
    <button id="cancelButton" class="wol-btn wol-btn-danger"><i class="fas fa-times"></i> Cancel</button>
    <button id="saveButton" class="wol-btn wol-btn-success"><i class="fas fa-check"></i> Save</button>
</div>

<!-- ========== TOAST CONTAINER ========== -->
<div id="toastContainer"></div>

<!-- ========== SETTINGS PANEL ========== -->
<div class="wol-settings-overlay" id="settingsOverlay"></div>
<div class="wol-settings-panel" id="settingsPanel">
    <div class="wol-settings__header">
        <span class="wol-settings__title">Settings</span>
        <button class="wol-settings__close" id="closeSettings"><i class="fas fa-times"></i></button>
    </div>
    <div class="wol-settings__body">

        <div class="wol-settings-section">
            <div class="wol-settings-section__title">Appearance</div>
            <div class="wol-setting-row">
                <div>
                    <div class="wol-setting__label">Theme</div>
                </div>
                <select class="wol-settings-select" id="settingTheme">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="auto">Auto</option>
                </select>
            </div>
            <div class="wol-setting-row">
                <div>
                    <div class="wol-setting__label">Compact view</div>
                    <div class="wol-setting__desc">Show hosts as a list</div>
                </div>
                <label class="wol-toggle">
                    <input type="checkbox" id="settingCompact">
                    <span class="wol-toggle__track"></span>
                </label>
            </div>
        </div>

        <div class="wol-settings-section">
            <div class="wol-settings-section__title">Monitoring</div>
            <div class="wol-setting-row">
                <div>
                    <div class="wol-setting__label">Check interval</div>
                    <div class="wol-setting__desc">How often to poll host status</div>
                </div>
                <select class="wol-settings-select" id="settingInterval">
                    <option value="1000">1s</option>
                    <option value="2000" selected>2s</option>
                    <option value="5000">5s</option>
                    <option value="10000">10s</option>
                    <option value="30000">30s</option>
                    <option value="0">Disabled</option>
                </select>
            </div>
            <div class="wol-setting-row">
                <div>
                    <div class="wol-setting__label">Auto-refresh</div>
                    <div class="wol-setting__desc">Load config on page open</div>
                </div>
                <label class="wol-toggle">
                    <input type="checkbox" id="settingAutoRefresh" checked>
                    <span class="wol-toggle__track"></span>
                </label>
            </div>
        </div>

        <div class="wol-settings-section">
            <div class="wol-settings-section__title">Defaults</div>
            <div class="wol-setting-row">
                <div><div class="wol-setting__label">Default port</div></div>
                <input type="number" class="form-control wol-settings-input" id="settingDefaultPort" value="9" min="1" max="65535">
            </div>
            <div class="wol-setting-row">
                <div><div class="wol-setting__label">Default CIDR</div></div>
                <input type="number" class="form-control wol-settings-input" id="settingDefaultCidr" value="24" min="0" max="32">
            </div>
        </div>

        <div class="wol-settings-section">
            <div class="wol-settings-section__title">Notifications</div>
            <div class="wol-setting-row">
                <div>
                    <div class="wol-setting__label">Toast duration</div>
                </div>
                <select class="wol-settings-select" id="settingToastDuration">
                    <option value="3000">3 seconds</option>
                    <option value="5000" selected>5 seconds</option>
                    <option value="10000">10 seconds</option>
                    <option value="0">Persistent</option>
                </select>
            </div>
        </div>

        <div class="wol-settings-section">
            <div class="wol-settings-section__title">Language</div>
            <div class="wol-setting-row">
                <div><div class="wol-setting__label">Display language</div></div>
                <select class="wol-settings-select" id="settingLanguage">
                    <option value="en-US">English</option>
                    <option value="de-DE">Deutsch</option>
                    <option value="es-ES">Espa&ntilde;ol</option>
                </select>
            </div>
        </div>
    </div>
</div>

<!-- ========== FOOTER ========== -->
<footer class="wol-footer">
    <div class="wol-footer__langs">
        <a href="#" data-lang-switch="de-DE"><img id="flag-de" title="Deutsch" alt="Deutsch"
            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABkUlEQVQ4jY3Ty27TQBSA4WOc2AE745mxnbEtobxCN8S5vGIfoizYFMTGkVjwAJUQm4oVrSOExIZ3qPN3EQcqtbkc6duc+XV2I/J8vBd257yJJyKvzuT9OzYajX6uVitmsxl1XbNYLI6q65q6rpnP53ie91F839/EcYxSCq01xpijtNYopYiiCM/z1jIMgtamKVmeM3GOsiwpnij3qoqiKHDOkec5xlp8329EwrCVNEWyHCkKpCz/q6rdzrlegUzcrrUpMhg08ncUtlgDLoPCQVWCm0CWgtWgDZg9DToBNYZxzNfAb+QmDFqsoUtTuszSWU1nTM/S2acMndF0iYI44sofNHIThC2JojMJnda70Bzw4gEZtkjEgyQ9zYPYA3RPgURcyaCRb5/Dll9jtvea7Z1he2dPMGzvE/gT8/7Sb+T7j7CFMZAABtCAPUD3TQLEfPgUNHJ7G24gBlQfnJL0bcz1ddDIZjP8Da+BsDc6Yd+9Yb32v4iIfSsyWU6nF8vp9N1ZqupiKWJWIuP02O88ax4BPEaWLPEaiXwAAAAASUVORK5CYII="></a>
        <a href="#" data-lang-switch="en-US"><img id="flag-en" title="English" alt="English"
            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACqklEQVQ4jY2Ta0iTARSGj1LURAVnWW3ewAxFy4Et5yxvoGQKZd7INDVn6TKvqdiypqGFpCIazghdidOo3ORLx8zmj1SwLdEmkvStUJCCknVBLfvx9kMhSDEfeDhw3sP5ceAQrcdqg95WMrIiIuvNlMvl1nK53HptdnWZd0TRTKS0DXm1vQhKa0ZJQx+EyY2Q3dXCL7EOVfeewylcjrnfWMe4+d1jcvLPMJ8oVMI1uhpxJUrsjZAjtUIFh9DryKzshm2wDHE1aih40XjtGIIRxzCMcIMxyQ1HMXGfkWdYDht6sRVROa04ltGI2IL7EKXQI+FKG4Rn65FcpoT76VoMtPdjediIBf0YFvSv8HPUhKbSawy5B11gD8XfQZS0BX7xtxEjVUCQUIuYSwr4J9YiOlcB3vFK6BQa/BgcxRfdCD4PjOLXywk0F8sY2uN/jj1T2gFemAzpsgfYF3oVmRUdcBAW4nxZG2z9LiNW9hD1tiIMc3yg2+ED3TZvDG8/iBLaxZBnSDbLFZchvVyJnYJ8SMrbQR4SSG90gNwyUFDdDeLE4+36G6JnYowhcjnFBqc0gPjpiEyrA+1OwcmcZpB9EpLyFSCbOESWtOMmeWOI+OgjPvqIBz3xUUQ2DDV19rKDb+agn/wArdEMvWkWWqMZQ6ZZ9BtZDE3NQW18j4/j0/huNMFinMJXgwkrJhYtVbcYelFZwy490sCiegJLZw8sXU9hUa33U5ca890azKs0mO9S41uPFo3ZeQwp9x9gJ4UiGIQiGAICYTjyHwMCYTgswnSAGFWurgzNLK+YN7jPllCPjTGki3KYhdQVSxJnLGbyV81yxqLkH7P+5ktZfCDXDYqj9loiDseF7LhiNy9fsYevQOwhEKzWjVzLeF6+YuLYBZGdneNm37kl/gDsSQH5dAvcewAAAABJRU5ErkJggg=="></a>
        <a href="#" data-lang-switch="es-ES"><img id="flag-es" title="Espa&ntilde;ola" alt="Espa&ntilde;ola"
            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAhNJREFUOE+NkzFoE2EUx3/f3SVparFRoq22SaQHDhZrKJymIgq6ODhadHHsIjgIzlIHNycdBTvc0EgFa4gaECuCDg2FEiklhasQoVZpQVotNuflTr7cHZZWG9/4vu/93v//3vcJdoYAvL/kZWrHmUyEIUb9Cy1j9E8DTzxriy+cGhw8aju/QAgQyu4CPLdZHhOCUnn6iXgEi0OofXVUQBa3EiHduXTgMIb7XMyu5KxsUtdl0i/+H4CEaOSnZoqiXM5ahpHSfVuhAsEmGku1BpGoR9chiOEE1sIGEUxzLgQc3gKQEJvKgyUqTz/hLK+Tu3GEY9fTwXBlowagYprLIeCg7kuXNmwm8jYXvn+jcKtKz/1xTlxZ4K05yfBIIlAh7xECjluGcUD3qZJu8+7OSTrKY8wn2+i8WCLdM8da4RVn7n0EIkEjgWl+lgokIBEokCpsyrdzxLpM3rxI0Gl7nD2/wdcfw5y+OwNEtwP6LcPYt2UGDg8nhzi3Ns78e4XeDw7d1yK8zFxm5NJ0c/rhxkzzS1HMWv1WVpeA8KW6rLKXJBts0o2HR5wVVomTZD3YlLQqeFxYLoqpq9HFbG+0z5YjaA5SQdVcGg2BovjDcj0FVfFoOHJDMuexR/XIX+tFUblJbWCANPVta/7Xj/CbQztMvKYkiO9PaZqWymQyvj9pcbdwwHF+UqvVBFp7tdW7bfkzfwPxEcg6YixgfwAAAABJRU5ErkJggg=="></a>
    </div>
    <a href="https://github.com/phoen-ix/wake-on-lan_plus" target="_blank">GitHub</a>
</footer>

<!-- ========== MODALS ========== -->

<!-- Load Config Choice Modal -->
<div class="modal fade" id="chooseLoadConfigModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="staticBackdropLabel" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="staticBackdropLabel" data-lang-ckey="c_load_configuration">Loading Configuration</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <p data-lang-ckey="c_replace_config">Do you want to <strong>replace</strong> the existing configuration?</p>
                <p data-lang-ckey="c_append_config">Or do you want to <strong>append to</strong> the existing configuration?</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="wol-btn wol-btn-ghost" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="wol-btn wol-btn-danger" data-choice="REPLACE">Replace Existing</button>
                <button type="button" class="wol-btn wol-btn-success" data-choice="APPEND">Append To Existing</button>
            </div>
        </div>
    </div>
</div>

<!-- Import Modal -->
<div class="modal fade" id="importModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="importModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="importModalLabel">Import Configuration</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div id="importJsonErrorContainer"></div>
                <div class="mb-3">
                    <label for="importJson" class="form-label">JSON Configuration</label>
                    <textarea id="importJson" class="form-control" aria-describedby="importJsonHelpBlock" rows="6"></textarea>
                    <div id="importJsonHelpBlock" class="form-text">
                        Paste configuration JSON above and click <strong>Import</strong>.
                    </div>
                </div>
                <div class="mb-3 form-check">
                    <input type="checkbox" class="form-check-input" id="importJsonOverwriteExisting">
                    <label class="form-check-label" for="importJsonOverwriteExisting">Overwrite existing configuration</label>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="wol-btn wol-btn-ghost" data-bs-dismiss="modal">Close</button>
                <button type="button" id="importJsonConfig" class="wol-btn wol-btn-primary">Import</button>
            </div>
        </div>
    </div>
</div>

<!-- Export Modal -->
<div class="modal fade" id="exportModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="exportModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="exportModalLabel">Export Configuration</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label for="exportJson" class="form-label">JSON Configuration</label>
                    <textarea id="exportJson" class="form-control" rows="6"></textarea>
                    <div class="form-text">
                        Copy the JSON above and save it to a file.
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="wol-btn wol-btn-ghost" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<!-- Add Host Modal -->
<div class="modal fade" id="addHostModal" tabindex="-1" aria-labelledby="addHostModalLabel" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="addHostModalLabel"><i class="fas fa-plus" style="margin-right:8px; color:var(--wol-accent);"></i>Add Host</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="wol-form-grid">
                    <div class="form-group full-width">
                        <label for="mac" class="form-label" data-lang-ckey="mac_address">MAC Address</label>
                        <input id="mac" type="text" class="form-control" placeholder="AA-BB-CC-DD-EE-FF" data-lang-pkey="mac_address">
                    </div>
                    <div class="form-group full-width">
                        <label for="host" class="form-label" data-lang-ckey="ip_or_hostname">IP or Hostname</label>
                        <input id="host" type="text" class="form-control" placeholder="192.168.1.100" data-lang-pkey="ip_or_hostname">
                    </div>
                    <div class="form-group">
                        <label for="cidr" class="form-label" data-lang-ckey="subnet">Subnet CIDR</label>
                        <input id="cidr" type="text" class="form-control" placeholder="24" data-lang-pkey="ip_subnet">
                    </div>
                    <div class="form-group">
                        <label for="port" class="form-label" data-lang-ckey="port">Port</label>
                        <input id="port" type="text" class="form-control" placeholder="9" data-lang-pkey="port">
                    </div>
                    <div class="form-group full-width">
                        <label for="comment" class="form-label" data-lang-ckey="comment">Comment</label>
                        <input id="comment" type="text" class="form-control" placeholder="My Server" data-lang-pkey="comment">
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="wol-btn wol-btn-ghost" data-bs-dismiss="modal">Cancel</button>
                <button type="button" id="addHost" class="wol-btn wol-btn-primary"><i class="fas fa-plus"></i> Add Host</button>
            </div>
        </div>
    </div>
</div>


<!-- ========== TEMPLATES ========== -->
<script id="tableRowTemplate" type="text/template">
    <tr data-wol='{{this.dataWol}}'>
        <td class="align-middle"><i class="fa fa-question"></i></td>
        <td class="align-middle">{{this.mac}}</td>
        <td class="align-middle">{{this.host}}</td>
        <td class="align-middle">{{this.cidr}}</td>
        <td class="align-middle">{{this.port}}</td>
        <td class="align-middle">{{this.comment}}</td>
        <td class="align-middle">
            <div class="d-flex flex-row justify-content-end">
                <button type="button" class="btnWakeUpHost btn btn-outline-success btn-sm mx-1"><i class="fa fa-rocket"></i></button>
                <button type="button" class="btnRemoveHost btn btn-outline-danger btn-sm mx-1"><i class="fa fa-trash-alt"></i></button>
            </div>
        </td>
    </tr>
</script>

<script id="textNoSocketExtensionLoaded" type="text/template">
    Sockets extension not loaded! Enable it in php.ini to send magic packets.
</script>

<script id="textConfigSavedSuccessfully" type="text/template">
    Configuration saved successfully.
</script>

<script id="textConfirmUnsavedChanged" type="text/template">
    It looks like you have been editing something. If you leave before saving, your changes will be lost.
</script>

<!-- Pass PHP config to JavaScript -->
<script type="text/javascript">
    window.WOL_CONFIG = <?php echo json_encode([
        'isSocketExtensionLoaded' => $isSocketExtensionLoaded,
        'isDebugEnabled' => $isDebugEnabled,
        'csrfToken' => $csrfToken,
        'baseAddress' => htmlspecialchars($_SERVER["PHP_SELF"], ENT_QUOTES, 'UTF-8'),
    ]); ?>;
</script>

<script src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/dist/umd/popper.min.js"
        integrity="sha384-I7E8VVD/ismYTF4hNIPjVp/Zjvgyol6VFvRkX/vR+Vc4jQkC+hVqc2pM8ODewa9r"
        crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.min.js"
        integrity="sha384-0pUGZvbkm6XF6gxjEnlmuGrJXVbNuzT9qBBavbLwCsOGabYfZo0T0to5eqruptLy"
        crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js"
        integrity="sha256-/xUj+3OJU5yExlq6GSYGSHk7tPXikynS7ogEvDej/m4=" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/jquery-ui-bundle@1.12.1/jquery-ui.min.js"
        integrity="sha256-Pbq2xgNJP86oOUVTdJMo7QWsoY7QYPL0mF5cJ0vj8Xw=" crossorigin="anonymous"></script>

<script src="assets/app.js"></script>

</body>
</html>

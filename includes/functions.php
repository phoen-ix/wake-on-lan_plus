<?php
/**
 * Core functions for Wake-on-LAN Plus.
 */

/**
 * Send a Wake-on-LAN magic packet.
 *
 * @param string $mac  MAC address of the host to wake
 * @param string $ip   Hostname or IP address
 * @param string $cidr Subnet CIDR notation
 * @param string $port UDP port number
 * @param array  &$debugOut Debug output lines (passed by reference)
 *
 * @return bool|string false on success, error message string on failure
 */
function wakeOnLan($mac, $ip, $cidr, $port, &$debugOut)
{
    $wolResult = false;
    $debugOut = [];
    $magicPacket = str_repeat(chr(0xff), 6);

    $debugOut[] = __LINE__ . " : wakeupOnLan('$mac', '$ip', '$cidr', '$port' );";

    if (!extension_loaded("sockets")) {
        $wolResult = "Error: Extension php_sockets is not loaded! You need to enable it in php.ini";
        $debugOut[] = __LINE__ . " : " . $wolResult;
    }

    if (!in_array("udp", stream_get_transports())) {
        $wolResult = "Error: Cannot send magic packet! Transport UDP is not supported on this system.";
        $debugOut[] = __LINE__ . " : " . $wolResult;
    }

    if (!$wolResult) {
        $debugOut[] = __LINE__ . " : Validating mac address: " . $mac;
        $mac = str_replace(":", "-", strtoupper($mac));
        $debugOut[] = __LINE__ . " : MAC = " . $mac;

        if (!preg_match("/([A-F0-9]{2}-){5}([0-9A-F]){2}/", $mac) || strlen($mac) != 17) {
            $wolResult = "Error: Invalid MAC-address: " . $mac;
            $debugOut[] = __LINE__ . " : " . $wolResult;
        }
    }

    if (!$wolResult) {
        $debugOut[] = __LINE__ . " : Creating the magic paket";
        $hwAddress = "";
        foreach (explode("-", $mac) as $addressByte) {
            $hwAddress .= chr(hexdec($addressByte));
        }
        $magicPacket .= str_repeat($hwAddress, 16);
    }

    if (!$wolResult && !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $debugOut[] = __LINE__ . " : Resolving host :" . $ip;
        $tmpIp = gethostbyname($ip);
        if ($ip == $tmpIp) {
            $wolResult = 'Error: Cannot resolve hostname "' . $ip . '".';
            $debugOut[] = __LINE__ . " : " . $wolResult;
        } else {
            $ip = $tmpIp;
        }
    }

    if (!$wolResult && "" != $cidr) {
        $debugOut[] = __LINE__ . " : CIDR is set to " . $cidr . ". Will use broadcast address.";
        $cidr = intval($cidr);
        if ($cidr < 0 || $cidr > 32) {
            $wolResult = "Error: Invalid subnet size of " . $cidr . ". CIDR must be between 0 and 32.";
            $debugOut[] = __LINE__ . " : " . $wolResult;
        } else {
            $netMask = -1 << 32 - (int)$cidr;
            $networkAddress = ip2long($ip) & $netMask;
            $networkSize = pow(2, 32 - $cidr);
            $broadcastAddress = $networkAddress + $networkSize - 1;

            $debugOut[] = __LINE__ . ' : $netMask = ' . long2ip($netMask);
            $debugOut[] = __LINE__ . ' : $networkAddress = ' . long2ip($networkAddress);
            $debugOut[] = __LINE__ . ' : $networkSize = ' . $networkSize;
            $debugOut[] = __LINE__ . ' : $broadcastAddress = ' . long2ip($broadcastAddress);

            $ip = long2ip($broadcastAddress);
        }
    }

    if (!$wolResult && "" != $port) {
        $port = intval($port);
        if ($port < 0 || $port > 65535) {
            $wolResult = "Error: Invalid port value of " . $port . ". Port must be between 1 and 65535.";
            $debugOut[] = __LINE__ . " : " . $wolResult;
        }
    }

    if (!$wolResult && function_exists("socket_create")) {
        $debugOut[] = __LINE__ . " : Calling socket_create(AF_INET, SOCK_DGRAM, SOL_UDP)";
        $socket = @socket_create(AF_INET, SOCK_DGRAM, SOL_UDP);
        if (!$socket) {
            $errno = socket_last_error();
            $wolResult = "Error: " . $errno . " - " . socket_strerror($errno);
            $debugOut[] = __LINE__ . " : " . $wolResult;
        }

        if (!$wolResult) {
            $debugOut[] = __LINE__ . ' : Calling socket_set_option($socket, SOL_SOCKET, SO_BROADCAST, true)';
            $socketResult = socket_set_option($socket, SOL_SOCKET, SO_BROADCAST, true);
            if (0 >= $socketResult) {
                $wolResult = "Error: " . socket_strerror($socketResult);
                $debugOut[] = __LINE__ . " : " . $wolResult;
            }
        }

        if (!$wolResult) {
            $debugOut[] = __LINE__ . " : Sending magic packet using socket-sendto()...";
            $flags = 0;
            $socket_data = socket_sendto($socket, $magicPacket, strlen($magicPacket), $flags, $ip, $port);
            if (!$socket_data) {
                $errno = socket_last_error($socket);
                $wolResult = "Error: " . socket_strerror($errno);
                $debugOut[] = __LINE__ . " : " . $wolResult;
            }
        }

        if (isset($socket) && $socket) {
            socket_close($socket);
            unset($socket);
        }
    } elseif (!$wolResult) {
        $wolResult = "Error: Cannot send magic packet. Neither fsockopen() nor socket_create() is available on this system.";
        $debugOut[] = __LINE__ . " : " . $wolResult;
    }

    if (!$wolResult) {
        $debugOut[] = __LINE__ . " : Done.";
    }

    return $wolResult;
}

/**
 * Safely get a value from an array with a default fallback.
 *
 * @param array  $data    The array to read from
 * @param string $key     The key to look up
 * @param mixed  $default The default value if key is not found
 * @return mixed
 */
function safeGet($data, $key, $default)
{
    return isset($data[$key]) ? $data[$key] : $default;
}

/**
 * End the request with a 500 error message.
 *
 * @param string $message The error message
 */
function endWithErrorMessage($message)
{
    http_response_code(500);
    die("Internal Server Error! " . htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));
}

/**
 * End the request with a JSON response.
 *
 * @param mixed       $responseData The data to encode as JSON
 * @param string|null $filename     Optional filename for Content-Disposition
 */
function endWithJsonResponse($responseData, $filename = null)
{
    if ($responseData) {
        array_walk_recursive($responseData, function (&$value) {
            if (is_string($value)) {
                $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8');
            }
        });
    }

    $jsonString = json_encode($responseData, JSON_PRETTY_PRINT);

    if (!$jsonString) {
        endWithErrorMessage("Cannot convert response data to JSON.");
    }

    header("Content-Length: " . strlen($jsonString));
    header("Content-Type: application/json");
    header("Expires: Mon, 26 Jul 1997 05:00:00 GMT");
    header("Last-Modified: " . gmdate("D, d M Y H:i:s"));
    header("Cache-Control: no-cache, must-revalidate");
    header("Pragma: no-cache");
    header("X-Content-Type-Options: nosniff");
    header("X-Frame-Options: DENY");
    header("X-XSS-Protection: 1; mode=block");
    if ($filename) {
        $safeFilename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
        header('Content-Disposition: attachment; filename="' . $safeFilename . '"');
        header("Content-Transfer-Encoding: binary");
    }
    die($jsonString);
}

/**
 * Session-based rate limiting.
 *
 * @param string $action     The action identifier
 * @param int    $maxRequests Maximum requests allowed in the window
 * @param int    $windowSecs  Time window in seconds
 * @return bool True if the request is allowed, false if rate limited
 */
function checkRateLimit($action, $maxRequests, $windowSecs)
{
    $key = 'rate_limit_' . $action;
    $now = time();

    if (!isset($_SESSION[$key])) {
        $_SESSION[$key] = [];
    }

    // Remove expired entries
    $_SESSION[$key] = array_filter($_SESSION[$key], function ($timestamp) use ($now, $windowSecs) {
        return ($now - $timestamp) < $windowSecs;
    });

    if (count($_SESSION[$key]) >= $maxRequests) {
        return false;
    }

    $_SESSION[$key][] = $now;
    return true;
}

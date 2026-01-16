<?php
/**
 * compat.php
 * - PHP 5.3 호환 유틸 (http_response_code 폴리필, json_encode 옵션 감지)
 */

if (!function_exists('http_response_code')) {
  function http_response_code($code = null) {
    // getter
    if ($code === null) {
      return isset($GLOBALS['__http_response_code']) ? (int)$GLOBALS['__http_response_code'] : 200;
    }

    $code = (int)$code;
    $GLOBALS['__http_response_code'] = $code;

    $texts = array(
      200 => 'OK',
      400 => 'Bad Request',
      404 => 'Not Found',
      405 => 'Method Not Allowed',
      500 => 'Internal Server Error',
    );

    $protocol = (isset($_SERVER['SERVER_PROTOCOL']) && $_SERVER['SERVER_PROTOCOL']) ? $_SERVER['SERVER_PROTOCOL'] : 'HTTP/1.1';
    $text = isset($texts[$code]) ? $texts[$code] : '';
    $statusLine = $text !== '' ? ($protocol . ' ' . $code . ' ' . $text) : ($protocol . ' ' . $code);

    header($statusLine, true, $code);
    return $code;
  }
}

/**
 * PHP 버전에 따라 사용 가능한 JSON 옵션만 적용한 json_encode
 * - PHP 5.3에서는 옵션 상수들이 없어도 문제 없이 동작
 */

/**
 * PHP < 5.6 호환: timing-safe 문자열 비교
 */
if (!function_exists('hash_equals')) {
  function hash_equals($known_string, $user_string) {
    $known_string = (string)$known_string;
    $user_string  = (string)$user_string;
    $len = strlen($known_string);
    if ($len !== strlen($user_string)) return false;
    $res = 0;
    for ($i = 0; $i < $len; $i++) {
      $res |= ord($known_string[$i]) ^ ord($user_string[$i]);
    }
    return $res === 0;
  }
}

function ri_json_encode($data, $pretty = false) {
  $opts = 0;
  if (defined('JSON_UNESCAPED_UNICODE')) $opts |= JSON_UNESCAPED_UNICODE;
  if (defined('JSON_UNESCAPED_SLASHES')) $opts |= JSON_UNESCAPED_SLASHES;
  if ($pretty && defined('JSON_PRETTY_PRINT')) $opts |= JSON_PRETTY_PRINT;
  return json_encode($data, $opts);
}
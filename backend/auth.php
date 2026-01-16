<?php
// auth.php - 간단 세션 로그인/승인 기반 접근제어
// - 사용자 등록 → 관리자 승인(approved=true) 후 제한 기능 사용 가능

require_once __DIR__ . '/compat.php';

function ri_start_session() {
  if (function_exists('session_status') && session_status() === PHP_SESSION_ACTIVE) return;
  if (headers_sent()) return;

  // 안전한 기본값 (HTTPS면 Secure 자동)
  $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

  // PHP 7.3+ : session_set_cookie_params(array)
  if (function_exists('session_set_cookie_params')) {
    // 기존 ini 설정을 최대한 존중하면서 보완
    $params = session_get_cookie_params();
    $lifetime = isset($params['lifetime']) ? $params['lifetime'] : 0;
    $path = isset($params['path']) ? $params['path'] : '/';
    $domain = isset($params['domain']) ? $params['domain'] : '';
    $httponly = true;

    // PHP 7.3 이전은 array 지원이 없을 수 있어 분기
    if (PHP_VERSION_ID >= 70300) {
      session_set_cookie_params(array(
        'lifetime' => $lifetime,
        'path' => $path,
        'domain' => $domain,
        'secure' => $secure,
        'httponly' => $httponly,
        'samesite' => 'Lax'
      ));
    } else {
      // PHP 7.2 이하: SameSite는 path에 붙이는 방식(일부 환경에서만 동작)
      session_set_cookie_params($lifetime, $path . '; samesite=Lax', $domain, $secure, $httponly);
    }
  }

  if (function_exists('session_name')) {
    @session_name('ri_portal_sess');
  }
  @session_start();
}

function ri_data_dir() {
  $dir = __DIR__ . '/data';
  if (!is_dir($dir)) { @mkdir($dir, 0777, true); }
  return $dir;
}

function ri_users_path() {
  return ri_data_dir() . '/users.json';
}

function ri_now_iso() {
  // date('c')는 PHP 5.1+ 지원
  return date('c');
}

function ri_random_hex($len = 32) {
  // PHP 7+: random_bytes, 없으면 mt_rand
  if (function_exists('random_bytes')) {
    return bin2hex(random_bytes((int)ceil($len / 2)));
  }
  $s = '';
  for ($i=0; $i<$len; $i++) { $s .= dechex(mt_rand(0, 15)); }
  return $s;
}

function ri_password_hash_compat($password) {
  $password = (string)$password;
  if (function_exists('password_hash')) {
    return password_hash($password, PASSWORD_DEFAULT);
  }
  $salt = ri_random_hex(16);
  return 'sha256$' . $salt . '$' . hash('sha256', $salt . $password);
}

// bcrypt 해시인지 판별 (PHP <5.5에서도 crypt()로 검증 가능)
function ri_is_bcrypt_hash($hash) {
  $hash = (string)$hash;
  return (preg_match('/^\$2[aby]\$/', $hash) === 1);
}

function ri_password_verify_compat($password, $hash) {
  $password = (string)$password;
  $hash = (string)$hash;
  if (function_exists('password_verify')) {
    return password_verify($password, $hash);
  }

  // PHP 5.3~5.4 등 password_verify가 없을 때도 bcrypt는 crypt()로 검증 가능
  if (ri_is_bcrypt_hash($hash)) {
    $calc = crypt($password, $hash);
    if (!is_string($calc) || $calc === '' || strlen($calc) !== strlen($hash)) return false;
    return hash_equals($hash, $calc);
  }

  if (strpos($hash, 'sha256$') === 0) {
    $parts = explode('$', $hash);
    if (count($parts) === 3) {
      $salt = $parts[1];
      $chk = hash('sha256', $salt . $password);
      return hash_equals($parts[2], $chk);
    }
  }
  return false;
}

// 현재 환경에서 해시를 재생성(마이그레이션)할 필요가 있는지
function ri_password_needs_migration($hash) {
  $hash = (string)$hash;
  // password_verify가 없고, 기존이 bcrypt면 다음 로그인 시 sha256$로 재저장 권장
  return (!function_exists('password_verify') && ri_is_bcrypt_hash($hash));
}

function ri_load_users() {
  $path = ri_users_path();
  if (!file_exists($path)) {
    // 최초 실행: 기본 관리자 생성
    $admin = array(
      'email' => 'admin',
      'name' => '관리자',
      'role' => 'admin',
      'approved' => true,
      'password_hash' => ri_password_hash_compat('admin1234'),
      'created_at' => ri_now_iso(),
      'last_login' => null
    );
    $users = array($admin);
    @file_put_contents($path, ri_json_encode($users, true), LOCK_EX);
    return $users;
  }

  $raw = @file_get_contents($path);
  if ($raw === false) return array();
  $json = json_decode($raw, true);
  return is_array($json) ? $json : array();
}

function ri_save_users($users) {
  $path = ri_users_path();
  return (@file_put_contents($path, ri_json_encode($users, true), LOCK_EX) !== false);
}

function ri_find_user_index_by_email($users, $email) {
  $email = strtolower(trim((string)$email));
  for ($i=0; $i<count($users); $i++) {
    if (!is_array($users[$i])) continue;
    $uEmail = strtolower(trim((string)(isset($users[$i]['email']) ? $users[$i]['email'] : '')));
    if ($uEmail === $email) return $i;
  }
  return -1;
}

function ri_current_user() {
  ri_start_session();
  if (empty($_SESSION['ri_user_email'])) return null;
  $email = (string)$_SESSION['ri_user_email'];
  $users = ri_load_users();
  $idx = ri_find_user_index_by_email($users, $email);
  if ($idx < 0) return null;
  return $users[$idx];
}

function ri_is_logged_in() {
  return ri_current_user() !== null;
}

function ri_is_approved_user() {
  $u = ri_current_user();
  return (is_array($u) && !empty($u['approved']));
}

function ri_is_admin() {
  $u = ri_current_user();
  return (is_array($u) && isset($u['role']) && $u['role'] === 'admin');
}

function ri_auth_status() {
  $u = ri_current_user();
  if (!$u) return array('logged_in'=>false, 'approved'=>false, 'is_admin'=>false, 'user'=>null);
  return array(
    'logged_in' => true,
    'approved' => !empty($u['approved']),
    'is_admin' => (isset($u['role']) && $u['role'] === 'admin'),
    'user' => array(
      'email' => isset($u['email']) ? $u['email'] : '',
      'name' => isset($u['name']) ? $u['name'] : ''
    )
  );
}

function ri_csrf_token() {
  ri_start_session();
  if (empty($_SESSION['ri_csrf'])) {
    $_SESSION['ri_csrf'] = ri_random_hex(40);
  }
  return (string)$_SESSION['ri_csrf'];
}

function ri_csrf_check($token) {
  ri_start_session();
  $t = (string)$token;
  $s = isset($_SESSION['ri_csrf']) ? (string)$_SESSION['ri_csrf'] : '';
  return ($t !== '' && $s !== '' && hash_equals($s, $t));
}

function ri_redirect_home($err = 'badpath') {
  header('Location: ./index.php?err=' . rawurlencode($err));
  exit;
}



function ri_redirect_login($return = '') {
  $url = './login.php';
  if ($return !== '') {
    $url .= '?return=' . rawurlencode($return);
  }
  header('Location: ' . $url);
  exit;
}

function ri_require_login_page() {
  if (!ri_is_logged_in()) {
    $ret = isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : './index.php';
    ri_redirect_login($ret);
  }
}

function ri_require_login_api() {
  if (!ri_is_logged_in()) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(401);
    echo ri_json_encode(array('ok'=>false, 'error'=>'unauthorized', 'message'=>'login required'));
    exit;
  }
}
function ri_require_approved_page() {
  if (!ri_is_approved_user()) {
    // 요구사항: 직접 접근 시 "잘못된 접근 경로"로 메인 이동
    ri_redirect_home('badpath');
  }
}

function ri_require_admin_page() {
  if (!ri_is_admin()) {
    ri_redirect_home('badpath');
  }
}

function ri_require_approved_api() {
  if (!ri_is_approved_user()) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(403);
    echo ri_json_encode(array('ok'=>false, 'error'=>'forbidden', 'message'=>'not approved'));
    exit;
  }
}

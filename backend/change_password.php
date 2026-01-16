<?php
require_once __DIR__ . '/compat.php';
require_once __DIR__ . '/auth.php';
ri_start_session();

header('Content-Type: text/html; charset=utf-8');

// 관리자만 접근
ri_require_admin_page();

$error = '';
$ok = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $csrf = isset($_POST['csrf']) ? (string)$_POST['csrf'] : '';
  if (!ri_csrf_check($csrf)) {
    $error = '보안 토큰이 만료되었습니다. 새로고침 후 다시 시도하세요.';
  } else {
    $current = isset($_POST['current_password']) ? (string)$_POST['current_password'] : '';
    $new1 = isset($_POST['new_password']) ? (string)$_POST['new_password'] : '';
    $new2 = isset($_POST['new_password2']) ? (string)$_POST['new_password2'] : '';

    if ($current === '' || $new1 === '' || $new2 === '') {
      $error = '모든 항목을 입력하세요.';
    } elseif ($new1 !== $new2) {
      $error = '새 비밀번호가 서로 다릅니다.';
    } elseif (strlen($new1) < 8) {
      $error = '새 비밀번호는 8자 이상으로 설정하세요.';
    } else {
      $users = ri_load_users();
      $idx = ri_find_user_index_by_email($users, 'admin');
      if ($idx < 0) {
        $error = 'admin 계정을 찾을 수 없습니다.';
      } else {
        $admin = $users[$idx];
        $hash = isset($admin['password_hash']) ? (string)$admin['password_hash'] : '';
        if (!ri_password_verify_compat($current, $hash)) {
          $error = '현재 비밀번호가 올바르지 않습니다.';
        } else {
          $users[$idx]['password_hash'] = ri_password_hash_compat($new1);
          if (ri_save_users($users)) {
            // 변경 성공 시: 보안상 로그아웃
            $_SESSION = array();
            if (ini_get('session.use_cookies')) {
              $params = session_get_cookie_params();
              setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
            }
            session_destroy();
            $ok = '비밀번호가 변경되었습니다. 다시 로그인하세요.';
          } else {
            $error = '저장에 실패했습니다. data/users.json 쓰기 권한을 확인하세요.';
          }
        }
      }
    }
  }
}

$csrfToken = ri_csrf_token();
?>
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>관리자 비밀번호 변경</title>
  <link rel="stylesheet" href="./assets/styles.css" />
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="logo" aria-hidden="true">R</div>
      <div>
        <h1>비밀번호 변경</h1>
        <p class="sub">관리자 계정 비밀번호를 변경합니다.</p>
      </div>
    </div>

    <div class="top-actions">
      <a class="btn ghost" href="./admin.php" title="관리자 화면">← 관리</a>
      <a class="btn ghost" href="./index.php" title="메인으로">메인</a>
    </div>
  </header>

  <main class="auth-shell">
    <section class="card auth-card">
      <div class="card-head">
        <h2>관리자 비밀번호 변경</h2>
        <span class="meta">8자 이상 권장</span>
      </div>

      <?php if ($error !== '') : ?>
        <div class="alert error"><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
      <?php endif; ?>

      <?php if ($ok !== '') : ?>
        <div class="alert success"><?php echo htmlspecialchars($ok, ENT_QUOTES, 'UTF-8'); ?></div>
        <div class="card-footer">
          <a class="btn" href="./login.php">다시 로그인</a>
        </div>
      <?php else : ?>
        <form method="post" action="./change_password.php" class="card-body" style="display:grid; gap:12px;">
          <input type="hidden" name="csrf" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>" />

          <div class="field">
            <label for="current_password">현재 비밀번호</label>
            <input id="current_password" name="current_password" type="password" required />
          </div>

          <div class="field">
            <label for="new_password">새 비밀번호</label>
            <input id="new_password" name="new_password" type="password" required />
          </div>

          <div class="field">
            <label for="new_password2">새 비밀번호 확인</label>
            <input id="new_password2" name="new_password2" type="password" required />
          </div>

          <div class="auth-actions">
            <button type="submit" class="btn">변경하기</button>
            <a class="btn ghost" href="./admin.php">취소</a>
          </div>
        </form>
      <?php endif; ?>

    </section>
  </main>
</body>
</html>

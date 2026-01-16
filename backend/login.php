<?php
require_once __DIR__ . '/compat.php';
require_once __DIR__ . '/auth.php';
ri_start_session();

header('Content-Type: text/html; charset=utf-8');

$next = isset($_GET['next']) ? (string)$_GET['next'] : '';
$next = preg_match('/^(reports|trends|admin)$/', $next) ? $next : '';

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $email = isset($_POST['email']) ? trim((string)$_POST['email']) : '';
  $password = isset($_POST['password']) ? (string)$_POST['password'] : '';
  $csrf = isset($_POST['csrf']) ? (string)$_POST['csrf'] : '';

  if (!ri_csrf_check($csrf)) {
    $error = '요청이 만료되었습니다. 다시 시도해 주세요.';
  } else if ($email === '' || $password === '') {
    $error = '이메일(또는 아이디)과 비밀번호를 입력해 주세요.';
  } else {
    $users = ri_load_users();
    $idx = ri_find_user_index_by_email($users, $email);
    if ($idx < 0) {
      $error = '계정을 찾을 수 없습니다. 먼저 등록해 주세요.';
    } else {
      $u = $users[$idx];
      $hash = isset($u['password_hash']) ? $u['password_hash'] : '';
      if (!ri_password_verify_compat($password, $hash)) {
        $error = '비밀번호가 올바르지 않습니다.';
      } else if (empty($u['approved'])) {
        $error = '관리자 승인 대기 중입니다. 승인 후 이용 가능합니다.';
      } else {
        // 로그인 성공
        $_SESSION['ri_user_email'] = strtolower(trim((string)$u['email']));
        if (function_exists('session_regenerate_id')) @session_regenerate_id(true);

        // 서버 PHP가 오래된 경우(예: password_verify 없음) 로컬에서 생성된 bcrypt 해시를
        // 다음부터 문제없이 검증할 수 있도록 현재 환경 해시로 마이그레이션
        if (ri_password_needs_migration($hash)) {
          $users[$idx]['password_hash'] = ri_password_hash_compat($password);
        }

        $users[$idx]['last_login'] = ri_now_iso();
        ri_save_users($users);

        if ($next === 'trends') {
          // 제한 페이지 직접 이동은 메인으로 보내야 하므로, 메인에서 버튼으로 이동 유도
          header('Location: ./index.php?msg=login_ok');
        } else if ($next === 'reports') {
          header('Location: ./index.php?view=reports&msg=login_ok');
        } else if ($next === 'admin') {
          header('Location: ./admin.php');
        } else {
          header('Location: ./index.php?msg=login_ok');
        }
        exit;
      }
    }
  }
}

$csrf = ri_csrf_token();
?>
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>로그인 · 지역연구원 통합 포털</title>
  <link rel="stylesheet" href="./assets/styles.css" />
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="logo" aria-hidden="true">R</div>
      <div>
        <h1>로그인</h1>
        <p class="sub">승인된 사용자만 연구보고서·연구 트렌드를 이용할 수 있습니다.</p>
      </div>
    </div>

    <div class="top-actions">
      <a class="btn ghost" href="./index.php" title="메인으로">← 메인</a>
    </div>
  </header>

  <main class="auth-shell">
    <section class="card auth-card">
      <div class="card-head">
        <h2>계정 로그인</h2>
      </div>

      <?php if ($error !== '') : ?>
        <div class="alert error"><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
      <?php endif; ?>

      <form method="post" class="row card-body" style="align-items:stretch;">
        <input type="hidden" name="csrf" value="<?php echo htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8'); ?>" />

        <div class="field grow">
          <label for="email">이메일(또는 아이디)</label>
          <input id="email" name="email" type="text" autocomplete="username" required />
        </div>

        <div class="field grow">
          <label for="password">비밀번호</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>

        <div class="field">
          <label>&nbsp;</label>
          <button class="btn block" type="submit">로그인</button>
        </div>
      </form>

      <hr class="sep" />
      <div class="hint card-footer">
        계정이 없나요? <a href="./register.php">사용자 등록 요청</a>
      </div>
    </section>
  </main>

  <footer class="footer">
    <span>© 통합 포털</span>
  </footer>
</body>
</html>

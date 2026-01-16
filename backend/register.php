<?php
require_once __DIR__ . '/compat.php';
require_once __DIR__ . '/auth.php';
ri_start_session();

header('Content-Type: text/html; charset=utf-8');

$error = '';
$done = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $email = isset($_POST['email']) ? trim((string)$_POST['email']) : '';
  $name = isset($_POST['name']) ? trim((string)$_POST['name']) : '';
  $password = isset($_POST['password']) ? (string)$_POST['password'] : '';
  $csrf = isset($_POST['csrf']) ? (string)$_POST['csrf'] : '';

  if (!ri_csrf_check($csrf)) {
    $error = '요청이 만료되었습니다. 다시 시도해 주세요.';
  } else if ($email === '' || $name === '' || $password === '') {
    $error = '이름, 이메일(또는 아이디), 비밀번호를 모두 입력해 주세요.';
  } else if (strlen($password) < 4) {
    $error = '비밀번호는 4자 이상으로 입력해 주세요.';
  } else {
    $users = ri_load_users();
    $idx = ri_find_user_index_by_email($users, $email);
    if ($idx >= 0) {
      $error = '이미 등록된 계정입니다. 로그인해 주세요.';
    } else {
      $users[] = array(
        'email' => strtolower(trim($email)),
        'name' => $name,
        'role' => 'user',
        'approved' => false,
        'password_hash' => ri_password_hash_compat($password),
        'created_at' => ri_now_iso(),
        'last_login' => null
      );
      if (!ri_save_users($users)) {
        $error = '등록 저장에 실패했습니다(data/users.json 쓰기 권한 확인).';
      } else {
        $done = true;
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
  <title>사용자 등록 · 지역연구원 통합 포털</title>
  <link rel="stylesheet" href="./assets/styles.css" />
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="logo" aria-hidden="true">R</div>
      <div>
        <h1>사용자 등록 요청</h1>
        <p class="sub">등록 후 관리자 승인이 완료되면 연구보고서·연구 트렌드를 이용할 수 있습니다.</p>
      </div>
    </div>
    <div class="top-actions">
      <a class="btn ghost" href="./index.php" title="메인으로">← 메인</a>
      <a class="btn ghost" href="./login.php" title="로그인">로그인</a>
    </div>
  </header>

  <main class="auth-shell">
    <section class="card auth-card">
      <div class="card-head">
        <h2>등록 정보</h2>
        <span class="meta">승인 전까지는 제한 기능을 사용할 수 없습니다.</span>
      </div>

      <?php if ($done) : ?>
        <div class="alert success">
          등록이 완료되었습니다. 관리자 승인 후 로그인해 주세요.
        </div>
      <?php else : ?>
        <?php if ($error !== '') : ?>
          <div class="alert error"><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
        <?php endif; ?>

        <form method="post" class="row card-body" style="align-items:stretch;">
          <input type="hidden" name="csrf" value="<?php echo htmlspecialchars($csrf, ENT_QUOTES, 'UTF-8'); ?>" />

          <div class="field grow">
            <label for="name">이름</label>
            <input id="name" name="name" type="text" required />
          </div>

          <div class="field grow">
            <label for="email">이메일(또는 아이디)</label>
            <input id="email" name="email" type="text" required />
          </div>

          <div class="field grow">
            <label for="password">비밀번호</label>
            <input id="password" name="password" type="password" required />
          </div>

          <div class="field">
            <label>&nbsp;</label>
            <button class="btn block" type="submit">등록 요청</button>
          </div>
        </form>

        <hr class="sep" />
        <div class="hint card-footer">
          등록 후에는 <b>관리자 승인</b>이 필요합니다. 승인 완료 시 로그인 가능합니다.
        </div>
      <?php endif; ?>
    </section>
  </main>

  <footer class="footer">
    <span>© 통합 포털</span>
  </footer>
</body>
</html>

<?php
require_once __DIR__ . '/compat.php';
require_once __DIR__ . '/auth.php';
ri_start_session();
ri_require_admin_page();

header('Content-Type: text/html; charset=utf-8');

$msg = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $csrf = isset($_POST['csrf']) ? (string)$_POST['csrf'] : '';
  if (!ri_csrf_check($csrf)) {
    $error = '요청이 만료되었습니다. 다시 시도해 주세요.';
  } else {
    $action = isset($_POST['action']) ? (string)$_POST['action'] : '';
    $email = isset($_POST['email']) ? (string)$_POST['email'] : '';

    $users = ri_load_users();
    $idx = ri_find_user_index_by_email($users, $email);
    if ($idx < 0) {
      $error = '대상 사용자를 찾을 수 없습니다.';
    } else {
      if ($action === 'approve') {
        $users[$idx]['approved'] = true;
        if (!isset($users[$idx]['role'])) $users[$idx]['role'] = 'user';
        if (ri_save_users($users)) $msg = '승인 처리했습니다.';
        else $error = '저장에 실패했습니다(data/users.json 권한 확인).';
      } else if ($action === 'revoke') {
        // 관리자 계정은 차단 방지
        if (isset($users[$idx]['role']) && $users[$idx]['role'] === 'admin') {
          $error = '관리자 계정은 해제할 수 없습니다.';
        } else {
          $users[$idx]['approved'] = false;
          if (ri_save_users($users)) $msg = '승인 해제했습니다.';
          else $error = '저장에 실패했습니다(data/users.json 권한 확인).';
        }
      }
    }
  }
}

$users = ri_load_users();
$csrf = ri_csrf_token();

function h($s) {
  return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}
?>
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>관리자 · 사용자 승인</title>
  <link rel="stylesheet" href="./assets/styles.css" />
</head>
<body>
  <input class="nav-toggle" type="checkbox" id="navToggle" />
  <div class="app-shell">
    <div class="overlay" onclick="document.getElementById('navToggle').checked=false"></div>

    <aside class="sidebar" aria-label="사이드바">
      <a class="brandmark" href="./index.php" style="text-decoration:none;color:inherit;">
        <div class="logo" aria-hidden="true"></div>
        <div class="title">
          <strong>RI Portal</strong>
          <span>지자체연구원 통합 포털</span>
        </div>
      </a>

      <div class="nav-group">
        <div class="label">메뉴</div>
        <nav class="nav">
          
          <a href="./index.php" class="<?php echo (basename($_SERVER['PHP_SELF'])==='index.php')?'active':''; ?>"><span class="dot" aria-hidden="true"></span>지자체연구기관</a>
          <a href="./national.php" class="<?php echo (basename($_SERVER['PHP_SELF'])==='national.php')?'active':''; ?>"><span class="dot" aria-hidden="true"></span>정부출연연구기관</a>
          <?php if (!empty($auth['is_admin'])): ?>
            <a href="./admin.php" class="<?php echo (basename($_SERVER['PHP_SELF'])==='admin.php')?'active':''; ?>"><span class="dot" aria-hidden="true"></span>관리자</a>
          <?php endif; ?>

        </nav>
      </div>

      <div class="sidebar-footer">
        <div>© <?php echo date('Y'); ?> RI Portal</div>
        <div class="userline">
          <?php if (!empty($auth['logged_in'])): ?>
            <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <?php echo htmlspecialchars(($auth['user']['name'] ? $auth['user']['name'] : $auth['user']['email']), ENT_QUOTES, 'UTF-8'); ?>
            </span>
            <a class="btn ghost" href="./logout.php">로그아웃</a>
          <?php else: ?>
            <span>게스트</span>
            <a class="btn ghost" href="./login.php">로그인</a>
          <?php endif; ?>
        </div>
      </div>
    </aside>

    <div class="shell-main">
      <header class="topbar" role="banner">
        <div class="left">
          <label class="icon-btn" for="navToggle" title="메뉴" aria-label="메뉴 열기">☰</label>
          <div class="page-title">
            <strong>지역연구원 통합 포털</strong>
            <span>관리자</span>
          </div>
        </div>

        <div class="top-actions">
          <button id="themeToggle" class="btn ghost" type="button" aria-label="테마 전환">🌗</button>
          <?php if (!empty($auth['logged_in'])) : ?>
            <?php if (!empty($auth['is_admin'])) : ?>
              <a class="btn ghost" href="./change_password.php" title="비밀번호 변경">비번변경</a>
            <?php endif; ?>
            <span class="user-pill" title="<?php echo htmlspecialchars(($auth['user']['email']), ENT_QUOTES, 'UTF-8'); ?>">
              <?php echo htmlspecialchars(($auth['user']['name'] ? $auth['user']['name'] : $auth['user']['email']), ENT_QUOTES, 'UTF-8'); ?>
            </span>
          <?php else: ?>
            <a class="btn ghost" href="./login.php" title="로그인">로그인</a>
            <a class="btn ghost" href="./register.php" title="등록">등록</a>
          <?php endif; ?>
        </div>
      </header>

      <main class="content">
        <div class="container">
    <section class="card">
      <div class="card-head">
        <h2>승인 대기</h2>
        <span class="meta">approved=false 사용자</span>
      </div>

      <?php if ($msg !== '') : ?>
        <div class="alert success"><?php echo h($msg); ?></div>
      <?php endif; ?>
      <?php if ($error !== '') : ?>
        <div class="alert error"><?php echo h($error); ?></div>
      <?php endif; ?>

      <div class="table-wrap">
        <table class="table" aria-label="승인 대기 사용자">
          <thead>
            <tr>
              <th style="width:240px;">이메일(아이디)</th>
              <th style="width:180px;">이름</th>
              <th>등록일</th>
              <th style="width:140px;">처리</th>
            </tr>
          </thead>
          <tbody>
            <?php
            $hasPending = false;
            foreach ($users as $u) {
              if (!is_array($u)) continue;
              if (!empty($u['approved'])) continue;

              $hasPending = true;
              echo '<tr>';
              echo '<td>' . h(isset($u['email']) ? $u['email'] : '') . '</td>';
              echo '<td>' . h(isset($u['name']) ? $u['name'] : '') . '</td>';
              echo '<td>' . h(isset($u['created_at']) ? $u['created_at'] : '') . '</td>';
              echo '<td>';
              echo '<form method="post" style="margin:0;">';
              echo '<input type="hidden" name="csrf" value="' . h($csrf) . '" />';
              echo '<input type="hidden" name="action" value="approve" />';
              echo '<input type="hidden" name="email" value="' . h(isset($u['email']) ? $u['email'] : '') . '" />';
              echo '<button class="btn small" type="submit">승인</button>';
              echo '</form>';
              echo '</td>';
              echo '</tr>';
            }
            if (!$hasPending) {
              echo '<tr><td colspan="4" class="empty">승인 대기 사용자가 없습니다.</td></tr>';
            }
             ?>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card" style="margin-top:14px;">
      <div class="card-head">
        <h2>승인 완료</h2>
        <span class="meta">approved=true 사용자</span>
      </div>

      <div class="table-wrap">
        <table class="table" aria-label="승인 완료 사용자">
          <thead>
            <tr>
              <th style="width:240px;">이메일(아이디)</th>
              <th style="width:180px;">이름</th>
              <th style="width:120px;">권한</th>
              <th>최근 로그인</th>
              <th style="width:140px;">처리</th>
            </tr>
          </thead>
          <tbody>
            <?php
            $hasApproved = false;
            foreach ($users as $u) {
              if (!is_array($u)) continue;
              if (empty($u['approved'])) continue;

              $hasApproved = true;
              $role = isset($u['role']) ? $u['role'] : 'user';
              echo '<tr>';
              echo '<td>' . h(isset($u['email']) ? $u['email'] : '') . '</td>';
              echo '<td>' . h(isset($u['name']) ? $u['name'] : '') . '</td>';
              echo '<td>' . h($role) . '</td>';
              echo '<td>' . h(isset($u['last_login']) ? $u['last_login'] : '') . '</td>';
              echo '<td>';
              if ($role === 'admin') {
                echo '<span class="meta">-</span>';
              } else {
                echo '<form method="post" style="margin:0;">';
                echo '<input type="hidden" name="csrf" value="' . h($csrf) . '" />';
                echo '<input type="hidden" name="action" value="revoke" />';
                echo '<input type="hidden" name="email" value="' . h(isset($u['email']) ? $u['email'] : '') . '" />';
                echo '<button class="btn ghost small" type="submit">승인 해제</button>';
                echo '</form>';
              }
              echo '</td>';
              echo '</tr>';
            }
            if (!$hasApproved) {
              echo '<tr><td colspan="5" class="empty">승인 완료 사용자가 없습니다.</td></tr>';
            }
             ?>
          </tbody>
        </table>
      </div>

      <details class="notes" style="margin-top:10px;">
        <summary>운영 메모</summary>
        <ul>
          <li>기본 관리자 계정은 최초 실행 시 <code>data/users.json</code>에 자동 생성됩니다.</li>
          <li>운영 전 반드시 기본 관리자 비밀번호를 변경하세요(<a href="./change_password.php">비밀번호 변경</a> 메뉴를 사용).</li>
        </ul>
      </details>
    </section>
  </div>
      </main>

      
    </div>
  </div>
</body>
</html>

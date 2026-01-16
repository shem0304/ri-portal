<?php
require_once __DIR__ . '/compat.php';
require_once __DIR__ . '/auth.php';
ri_start_session();

// 연구보고서 전용 진입점 (로그인 사용자만)
ri_require_login_page();

header('Location: ./index.php?tab=reports');
exit;

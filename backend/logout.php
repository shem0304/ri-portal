<?php
require_once __DIR__ . '/compat.php';
require_once __DIR__ . '/auth.php';
ri_start_session();

// 세션 정리
$_SESSION = array();
if (function_exists('session_destroy')) @session_destroy();

header('Location: ./index.php?msg=logout');
exit;

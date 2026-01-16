<?php
require_once dirname(__DIR__) . '/compat.php';
require_once dirname(__DIR__) . '/auth.php';
ri_start_session();
header('Content-Type: application/json; charset=utf-8');

echo ri_json_encode(ri_auth_status());

<?php
require_once dirname(__DIR__) . '/compat.php';
require_once dirname(__DIR__) . '/auth.php';
ri_start_session();
// api/national_reports.php - 국책연구기관용 보고서 JSON 제공
header('Content-Type: application/json; charset=utf-8');


ri_require_login_api();
$dataDir = dirname(__DIR__) . '/data';
// 국책연구기관 보고서 데이터는 data/nationalreport.json에서 제공
$reportsFile = $dataDir . '/nationalreport.json';

function read_json_file($path, $fallback = array()) {
  if (!file_exists($path)) return $fallback;
  $raw = file_get_contents($path);
  if ($raw === false) return $fallback;
  $json = json_decode($raw, true);
  return is_array($json) ? $json : $fallback;
}

$reports = read_json_file($reportsFile, array());
echo ri_json_encode($reports);

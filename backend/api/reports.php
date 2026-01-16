<?php
require_once dirname(__DIR__) . '/compat.php';
require_once dirname(__DIR__) . '/auth.php';
ri_start_session();
// api/reports.php - 보고서 JSON 제공
header('Content-Type: application/json; charset=utf-8');


ri_require_login_api();
// (읽기 전용) 보고서 데이터는 공개 API로 제공
$dataDir = dirname(__DIR__) . '/data';
$reportsFile = $dataDir . '/reports.json';
$defaultReportsFile = $dataDir . '/allreports_normalized.json';

function read_json_file($path, $fallback = array()) {
  if (!file_exists($path)) return $fallback;
  $raw = file_get_contents($path);
  if ($raw === false) return $fallback;
  $json = json_decode($raw, true);
  return is_array($json) ? $json : $fallback;
}

$reports = file_exists($reportsFile)
  ? read_json_file($reportsFile, array())
  : read_json_file($defaultReportsFile, array());

echo ri_json_encode($reports);

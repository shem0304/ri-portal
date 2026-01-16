<?php
require_once dirname(__DIR__) . '/compat.php';
// api/institutes.php - 기관 목록 제공
header('Content-Type: application/json; charset=utf-8');

$dataDir = dirname(__DIR__) . '/data';
$path = $dataDir . '/institutes.json';

function read_json_file($path, $fallback = array()) {
  if (!file_exists($path)) return $fallback;
  $raw = file_get_contents($path);
  if ($raw === false) return $fallback;
  $json = json_decode($raw, true);
  return is_array($json) ? $json : $fallback;
}

$items = read_json_file($path, array());
echo ri_json_encode($items);
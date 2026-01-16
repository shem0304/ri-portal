<?php
require_once dirname(__DIR__) . '/compat.php';
require_once dirname(__DIR__) . '/auth.php';
ri_start_session();
// api/reports_save.php - 보고서 저장(POST JSON 배열)
header('Content-Type: application/json; charset=utf-8');

// 승인된 사용자만 접근 가능
ri_require_approved_api();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo ri_json_encode(array('ok'=>false,'error'=>'POST only'));
  exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
  http_response_code(400);
  echo ri_json_encode(array('ok'=>false,'error'=>'Invalid JSON array'));
  exit;
}

// 간단 검증/정규화
$out = array();
foreach ($data as $r) {
  if (!is_array($r)) continue;
  $title = trim((string)(isset($r['title']) ? $r['title'] : ''));
  if ($title === '') continue;

  $out[] = array(
    'id' => (isset($r['id']) ? $r['id'] : null),
        'year' => isset($r['year']) ? (int)$r['year'] : null,
        'title' => $title,
        'authors' => (isset($r['authors']) ? $r['authors'] : ''),
        'institute' => (isset($r['institute']) ? $r['institute'] : ''),
        'url' => (isset($r['url']) ? $r['url'] : '')
  );
}

$dataDir = dirname(__DIR__) . '/data';
if (!is_dir($dataDir)) mkdir($dataDir, 0775, true);
$path = $dataDir . '/reports.json';

$ok = file_put_contents($path, ri_json_encode($out, true), LOCK_EX);
if ($ok === false) {
  http_response_code(500);
  echo ri_json_encode(array('ok'=>false,'error'=>'Failed to write data/reports.json (permission?)'));
  exit;
}

echo ri_json_encode(array('ok'=>true,'count'=>count($out)));

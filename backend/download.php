<?php
require_once __DIR__ . '/compat.php';
require_once __DIR__ . '/auth.php';
ri_start_session();
// 전체 프로젝트 다운로드는 관리자만 허용
if (!ri_is_admin()) {
  ri_redirect_home('badpath');
}
// download.php - 현재 프로젝트를 zip으로 내려받기
// 주의: ZipArchive 확장이 필요합니다.

$zipName = 'ri_portal_php.zip';
$tmpZip = sys_get_temp_dir() . DIRECTORY_SEPARATOR . $zipName;

if (!class_exists('ZipArchive')) {
  header('Content-Type: text/plain; charset=utf-8');
  http_response_code(500);
  echo "ZipArchive 확장이 없어 zip 생성이 불가합니다. 서버에 php-zip(또는 zip) 확장을 설치해 주세요.";
  exit;
}

$root = __DIR__;

$zip = new ZipArchive();
if ($zip->open($tmpZip, ZipArchive::OVERWRITE | ZipArchive::CREATE) !== true) {
  header('Content-Type: text/plain; charset=utf-8');
  http_response_code(500);
  echo "임시 zip 생성 실패: {$tmpZip}";
  exit;
}

$exclude = array(
  realpath($tmpZip),
);

$it = new RecursiveIteratorIterator(
  new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
  RecursiveIteratorIterator::LEAVES_ONLY
);

foreach ($it as $file) {
  $path = $file->getRealPath();
  if (!$path) continue;
  if (in_array($path, $exclude, true)) continue;

  // 루트 기준 상대경로로 넣기
  $rel = ltrim(str_replace($root, '', $path), DIRECTORY_SEPARATOR);

  // 서버 저장 데이터는 포함하되, 필요하면 여기서 제외하세요.
  $zip->addFile($path, $rel);
}

$zip->close();

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $zipName . '"');
header('Content-Length: ' . filesize($tmpZip));
readfile($tmpZip);

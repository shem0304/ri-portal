<?php
// React UI 엔트리
// 1) frontend에서 npm run build 후 생성되는 dist/ 폴더를 backend/react/dist 로 복사하세요.
// 2) 그 다음 http://<server>/react/ 로 접속하면 React UI가 뜹니다.

$dist = __DIR__ . '/dist';
$index = $dist . '/index.html';

if (!file_exists($index)) {
  header('Content-Type: text/plain; charset=utf-8');
  echo "React dist가 없습니다.\n\n";
  echo "1) cd frontend && npm install && npm run build\n";
  echo "2) 생성된 frontend/dist를 backend/react/dist로 복사\n";
  echo "3) /react/로 접속\n";
  exit;
}

// 정적 파일은 웹서버(nginx/apache)에서 직접 서빙하는 것이 가장 좋습니다.
// 개발/간단 배포를 위해 index.html만 PHP로 전달합니다.
header('Content-Type: text/html; charset=utf-8');
readfile($index);

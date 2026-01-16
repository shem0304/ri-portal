# 지역연구원 통합 포털 (PHP 버전)

이 패키지는 기존 정적 파일을 PHP 기반으로 옮겨,
- 페이지 확장자를 `.php`로 변경
- 보고서 데이터는 `/api/reports.php`로 제공(서버 데이터)
- CSV/JSON 가져오기는 `/api/reports_save.php`로 저장(파일 기반)
- `download.php`로 현재 사이트를 ZIP으로 내려받을 수 있게 구성했습니다.

## 실행(개발용)
PHP 내장서버:
```bash
php -S 127.0.0.1:8000 -t .
```
브라우저:
- http://127.0.0.1:8000/index.php

## 데이터 위치
- 기관 목록: `data/institutes.json` (직접 편집)
- 기본 보고서: `data/allreports_normalized.json` (제공 파일)
- 서버 저장 보고서: `data/reports.json` (가져오기를 하면 생성)

## ZIP 다운로드
- `download.php` 접속 시 ZIP 스트림을 내려줍니다.
- 서버에 ZipArchive 확장이 필요합니다(리눅스에선 보통 php-zip 패키지).

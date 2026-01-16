<?php
require_once __DIR__ . '/compat.php';
require_once __DIR__ . '/auth.php';
ri_start_session();
// index.php (PHP 버전)
// - data/institutes.json / data/reports.json 을 읽어 프론트에 주입
// - 기본 보고서 데이터는 data/allreports_normalized.json
header('Content-Type: text/html; charset=utf-8');
$dataDir = __DIR__ . '/data';
$institutesFile = $dataDir . '/national_institutes.json';
$reportsFile = $dataDir . '/reports.json';
$defaultReportsFile = $dataDir . '/nationalreport.json';

// 정부 보도자료 수집 디버그(요청/응답 상태 기록)
$__GOV_FETCH_DEBUG = array();

function read_json_file($path, $fallback = array()) {
  if (!file_exists($path)) return $fallback;
  $raw = file_get_contents($path);
  if ($raw === false) return $fallback;
  $json = json_decode($raw, true);
  return is_array($json) ? $json : $fallback;
}

$institutes = read_json_file($institutesFile, array());
// national_institutes.json은 {updated_at, sources, nst:[], nrc:[]} 구조일 수 있어 리스트로 평탄화
if (!empty($institutes) && array_keys($institutes) !== range(0, count($institutes) - 1)) {
  $flat = array();

  if (!empty($institutes['nst']) && is_array($institutes['nst'])) {
    foreach ($institutes['nst'] as $it) {
      $flat[] = array(
        'name' => (string)(isset($it['name']) ? $it['name'] : ''),
        'region' => 'NST',
        'url' => (string)(isset($it['url']) ? $it['url'] : '')
      );
    }
  }

  if (!empty($institutes['nrc']) && is_array($institutes['nrc'])) {
    foreach ($institutes['nrc'] as $it) {
      $flat[] = array(
        'name' => (string)(isset($it['name']) ? $it['name'] : ''),
        'region' => 'NRC',
        'url' => (string)(isset($it['url']) ? $it['url'] : '')
      );
    }
  }

  $institutes = $flat;
}

$reports = read_json_file($reportsFile, null);
if ($reports === null) $reports = read_json_file($defaultReportsFile, array());

// 최신 정부 보도자료(정책브리핑) 5건을 가져옵니다.
// - 모바일 리스트 페이지(HTML)에서 제목/일자/부처명을 파싱
// - 과도한 외부 호출을 피하기 위해 짧은 캐시(TTL)를 사용
function http_get_text($url, $timeoutSeconds = 6) {
  // 공용 User-Agent/헤더 (korea.kr 측에서 비-브라우저 UA를 400으로 돌려주는 경우가 있어 브라우저 UA 사용)
  $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  $headers = "User-Agent: {$ua}\r\n" .
             "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n" .
             "Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7\r\n" .
             "Connection: close\r\n";

  global $__GOV_FETCH_DEBUG;

  // 0) 환경 점검: URL wrapper가 꺼져 있으면 fopen/file_get_contents는 절대 동작하지 않습니다.
  $allowUrl = ini_get('allow_url_fopen');
  $wrappers = function_exists('stream_get_wrappers') ? stream_get_wrappers() : array();
  $hasHttpsWrapper = is_array($wrappers) ? in_array('https', $wrappers) : false;
  if (!$allowUrl || !$hasHttpsWrapper) {
    $__GOV_FETCH_DEBUG[] = array(
      'url' => $url,
      'method' => 'env',
      'allow_url_fopen' => $allowUrl ? 1 : 0,
      'https_wrapper' => $hasHttpsWrapper ? 1 : 0,
      'note' => 'URL wrapper 비활성: php.ini에서 allow_url_fopen=On 및 openssl 활성/https wrapper 확인 필요'
    );
  }

  // https wrapper가 없으면 file_get_contents("https://...")는 환경상 절대 성공하지 않습니다.
  // (Windows 로컬에서 "No such file or directory"로 보이는 경우가 있어 조기 반환)
  $isHttpsUrl = (is_string($url) && stripos($url, 'https://') === 0);
  if ($isHttpsUrl && !$hasHttpsWrapper) {
    // cURL이 있으면 cURL로 계속 시도(아래 블록). cURL도 없으면 바로 실패 처리.
    if (!function_exists('curl_init')) {
      $__GOV_FETCH_DEBUG[] = array(
        'url' => $url,
        'method' => 'env',
        'allow_url_fopen' => $allowUrl ? 1 : 0,
        'https_wrapper' => 0,
        'ok' => false,
        'note' => 'PHP https wrapper(OPENSSL)와 php-curl이 모두 비활성이라 외부 HTTPS를 가져올 수 없습니다. php.ini에서 extension=openssl 및 extension=curl 활성화 후 서버 재시작 필요'
      );
      return null;
    }
  }

  // 1) file_get_contents(SSL 검증 ON) → 실패 시 file_get_contents(검증 OFF) 재시도
  $fetch_by_fopen = function($verifyPeer) use ($url, $timeoutSeconds, $headers) {
    $ctx = stream_context_create(array(
      'http' => array(
        'timeout' => $timeoutSeconds,
        'header' => $headers,
        'ignore_errors' => true
      ),
      'ssl' => array(
        'verify_peer' => $verifyPeer,
        'verify_peer_name' => $verifyPeer,
        'allow_self_signed' => !$verifyPeer,
        // 일부 Windows 환경에서 SNI가 문제될 때를 대비
        'SNI_enabled' => true
      )
    ));

    // 이전 응답 헤더/에러 흔적을 최소화
    $body = @file_get_contents($url, false, $ctx);
    $err  = error_get_last();
    $statusCode = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
      foreach ($http_response_header as $h) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/i', $h, $m)) { $statusCode = intval($m[1]); break; }
      }
    }
    return array($body, $statusCode, $err);
  };

  // SSL 검증 ON
  $res = $fetch_by_fopen(true);
  $body = $res[0];
  $__GOV_FETCH_DEBUG[] = array(
    'url' => $url,
    'method' => 'fopen',
    'ssl_verify' => 1,
    'http_code' => intval($res[1]),
    'bytes' => is_string($body) ? strlen($body) : 0,
    'ok' => (is_string($body) && strlen($body) > 0),
    'error' => $res[2]
  );
  if (is_string($body) && strlen($body) > 0) return $body;

  // SSL 검증 OFF (로컬/개발 환경에서 CA 번들 부재로 실패하는 케이스 대응)
  $res2 = $fetch_by_fopen(false);
  $body2 = $res2[0];
  $__GOV_FETCH_DEBUG[] = array(
    'url' => $url,
    'method' => 'fopen',
    'ssl_verify' => 0,
    'http_code' => intval($res2[1]),
    'bytes' => is_string($body2) ? strlen($body2) : 0,
    'ok' => (is_string($body2) && strlen($body2) > 0),
    'error' => $res2[2]
  );
  if (is_string($body2) && strlen($body2) > 0) return $body2;

  // 2) cURL (확장 설치된 환경이면 더 안정적)
  if (!function_exists('curl_init')) {
    $__GOV_FETCH_DEBUG[] = array(
      'url' => $url,
      'method' => 'curl',
      'ok' => false,
      'note' => 'php-curl 미설치/비활성. Windows 로컬이면 php.ini에서 extension=curl 활성 권장'
    );
    return null;
  }

  $try = function($verifyPeer) use ($url, $timeoutSeconds, $ua) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $timeoutSeconds);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeoutSeconds);
    curl_setopt($ch, CURLOPT_USERAGENT, $ua);
    curl_setopt($ch, CURLOPT_ENCODING, ''); // gzip/deflate 자동 처리
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
      'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control: no-cache',
      'Pragma: no-cache'
    ));
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $verifyPeer);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $verifyPeer ? 2 : 0);
    $out = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_errno($ch);
    curl_close($ch);

    // 디버그 기록 (cURL)
    global $__GOV_FETCH_DEBUG;
    $__GOV_FETCH_DEBUG[] = array(
      'url' => $url,
      'method' => 'curl',
      'ssl_verify' => $verifyPeer ? 1 : 0,
      'http_code' => $code,
      'curl_errno' => $err,
      'bytes' => is_string($out) ? strlen($out) : 0,
      'ok' => (is_string($out) && strlen($out) > 0)
    );

    // 200이 아니어도 본문이 있으면(일부 서버 400 + body 등) 일단 반환
    if (is_string($out) && strlen($out) > 0 && ($code >= 200 && $code < 500)) return $out;

    // SSL 문제로 실패한 경우 재시도 유도
    if ($err && !$verifyPeer) return null;
    return null;
  };

  $out = $try(true);
  if (is_string($out) && strlen($out) > 0) return $out;

  // 3) SSL 인증서 체인 문제로 실패하는 환경 대응 (최후의 수단)
  $out = $try(false);
  if (is_string($out) && strlen($out) > 0) return $out;

  return null;
}

function normalize_korea_date($dateStr) {
  // 입력: 2025.1.7 또는 2025.01.07 → 출력: 2025.01.07
  $parts = explode('.', trim($dateStr));
  if (count($parts) < 3) return trim($dateStr);
  $y = $parts[0];
  $m = str_pad(preg_replace('/\D/', '', $parts[1]), 2, '0', STR_PAD_LEFT);
  $d = str_pad(preg_replace('/\D/', '', $parts[2]), 2, '0', STR_PAD_LEFT);
  return $y . '.' . $m . '.' . $d;
}


function parse_pressrelease_html($html, $limit = 5, $baseUrl = 'https://m.korea.kr') {
  $items = array();

  // 디버그: 실행 시작
  global $__GOV_FETCH_DEBUG;
  $__GOV_FETCH_DEBUG[] = array('stage' => 'start', 'ts' => date('c'));
  if (!is_string($html) || $html === '') return $items;

  // 보도자료 링크(pressRelease* + newsId=)를 먼저 찾고, 주변 블록(<li> 또는 <tr>)에서 날짜/부처명을 보강 추출
  $re = '/<a\b[^>]*href=["\']([^"\']*(?:pressRelease|pressrelease)[^"\']*newsId=\d+[^"\']*)["\'][^>]*>(.*?)<\/a>/isu';

  if (!preg_match_all($re, $html, $ms, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
    return $items;
  }

  foreach ($ms as $m) {
    $href = trim($m[1][0]);
    $aHtml = $m[2][0];
    $offset = $m[0][1];

    $title = trim(preg_replace('/\s+/u', ' ', strip_tags(html_entity_decode($aHtml, ENT_QUOTES | ENT_HTML5, 'UTF-8'))));
    if ($href === '' || $title === '') continue;

    // 주변 블록 추출: <li> ... </li> 우선, 없으면 <tr> ... </tr>, 그래도 없으면 주변 1200byte
    $block = '';
    $before = substr($html, 0, $offset);
    $liStart = strripos($before, '<li');
    $liEnd = stripos($html, '</li>', $offset);
    if ($liStart !== false && $liEnd !== false && $liEnd > $offset) {
      $block = substr($html, $liStart, ($liEnd - $liStart) + 5);
    } else {
      $trStart = strripos($before, '<tr');
      $trEnd = stripos($html, '</tr>', $offset);
      if ($trStart !== false && $trEnd !== false && $trEnd > $offset) {
        $block = substr($html, $trStart, ($trEnd - $trStart) + 5);
      } else {
        $start = max(0, $offset - 400);
        $block = substr($html, $start, 1200);
      }
    }

    $blockText = trim(preg_replace('/\s+/u', ' ', strip_tags(html_entity_decode($block, ENT_QUOTES | ENT_HTML5, 'UTF-8'))));

    // 날짜/부처명 추출: ".... 2026.01.07 산림청" 형태 또는 "2026.01.07산림청" 형태 대응
    $date = '';
    $dept = '';

    if (preg_match('/(\d{4}\.\d{1,2}\.\d{1,2})/u', $blockText, $dm)) {
      $date = normalize_korea_date($dm[1]);

      // 날짜 뒤쪽에서 부처명 후보: 날짜 다음 토큰(공백 유무 무관)
      if (preg_match('/' . preg_quote($dm[1], '/') . '\s*([^\s\|\·\•\(\)\[\]]{2,})/u', $blockText, $mm)) {
        $dept = trim($mm[1]);
      } else if (preg_match('/' . preg_quote($dm[1], '/') . '([^\s]{2,})/u', $blockText, $mm2)) {
        $dept = trim($mm2[1]);
      }
    }

    // 날짜가 없으면 해당 항목 스킵 (요구사항: 일자 표시)
    if ($date === '') continue;

    // 절대 URL로 변환
    if (!preg_match('/^https?:\/\//i', $href)) {
      $baseHost = $baseUrl;
      if (strpos($href, '/') === 0) $href = $baseHost . $href;
      else $href = rtrim($baseHost, '/') . '/briefing/' . $href;
    }

    $items[] = array('date' => $date, 'title' => $title, 'dept' => $dept, 'url' => $href);
    if (count($items) >= $limit) break;
  }

  return $items;
}

function parse_pressrelease_rss($xml, $limit = 5) {
  $items = array();
  if (!is_string($xml) || $xml === '') return $items;

  // item 블록 단위로 파싱 (SimpleXML 없이)
  if (!preg_match_all('/<item\b[^>]*>(.*?)<\/item>/isu', $xml, $ms)) return $items;

  foreach ($ms[1] as $block) {
    $title = '';
    $link  = '';
    $dept  = '';
    $date  = '';

    if (preg_match('/<title\b[^>]*>(.*?)<\/title>/isu', $block, $m)) {
      $title = trim(strip_tags(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }
    if (preg_match('/<link\b[^>]*>(.*?)<\/link>/isu', $block, $m)) {
      $link = trim(strip_tags($m[1]));
    } elseif (preg_match('/<guid\b[^>]*>(.*?)<\/guid>/isu', $block, $m)) {
      $link = trim(strip_tags($m[1]));
    }
    if (preg_match('/<pubDate\b[^>]*>(.*?)<\/pubDate>/isu', $block, $m)) {
      $ts = strtotime(trim(strip_tags($m[1])));
      if ($ts) $date = date('Y.m.d', $ts);
    } elseif (preg_match('/<dc:date\b[^>]*>(.*?)<\/dc:date>/isu', $block, $m)) {
      $ts = strtotime(trim(strip_tags($m[1])));
      if ($ts) $date = date('Y.m.d', $ts);
    }

    // 부처명은 category 또는 dc:creator에 있는 경우가 많아 우선순위로 탐색
    if (preg_match_all('/<category\b[^>]*>(.*?)<\/category>/isu', $block, $cats) && !empty($cats[1])) {
      // 여러 개면 마지막 값을 우선 사용
      $dept = trim(strip_tags(html_entity_decode(end($cats[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }
    if ($dept === '' && preg_match('/<dc:creator\b[^>]*>(.*?)<\/dc:creator>/isu', $block, $m)) {
      $dept = trim(strip_tags(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    if ($title === '' || $link === '') continue;
    if ($date === '') $date = '';

    $items[] = array('date' => $date, 'title' => $title, 'dept' => $dept, 'url' => $link);
    if (count($items) >= $limit) break;
  }
  return $items;
}

function fetch_latest_gov_pressreleases($limit = 5) {
  $cacheFile = __DIR__ . '/data/cache_gov_pressreleases.json';
  $ttl = 600; // 10분

  // 캐시 사용 (가능하면)
  if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $ttl)) {
    $raw = @file_get_contents($cacheFile);
    $data = $raw ? json_decode($raw, true) : null;
    if (is_array($data)) return array_slice($data, 0, $limit);
  }

  $items = array();

  // 1) 모바일 보도자료 목록 (현재 UI와 가장 잘 맞음)
  $html = http_get_text('https://m.korea.kr/briefing/pressReleaseDetailList.do', 8);
  $items = parse_pressrelease_html($html, $limit, 'https://m.korea.kr');

  // 2) PC 보도자료 목록(대체 경로)
  if (empty($items)) {
    $html2 = http_get_text('https://korea.kr/briefing/pressReleaseList.do', 8);
    // PC 페이지도 동일한 링크/텍스트 패턴이 많아 같은 파서 재사용
    $items = parse_pressrelease_html($html2, $limit, 'https://www.korea.kr');
  }

  // 3) RSS (최후 대체, 일부 환경에서 HTML 차단 시)
  if (empty($items)) {
    $rss = http_get_text('https://www.korea.kr/rss/pressrelease.xml', 8);
    $items = parse_pressrelease_rss($rss, $limit);
  }
  // 디버그: 마지막 외부 요청 상태를 파일로 남김(쓰기 권한 없으면 대체 경로 사용)
  global $__GOV_FETCH_DEBUG;
  $debugPath = __DIR__ . '/data/last_gov_fetch_debug.json';
  $debugDir  = dirname($debugPath);
  if (!is_dir($debugDir)) { @mkdir($debugDir, 0777, true); }

  // PHP 5.3~ 호환: JSON 옵션 상수가 없을 수 있으므로 compat.php의 ri_json_encode 사용
  $debugJson = ri_json_encode($__GOV_FETCH_DEBUG, true);
  $finalDebugPath = $debugPath;
  $wrote = false;

  if (is_string($debugJson)) {
    $wrote = (@file_put_contents($debugPath, $debugJson, LOCK_EX) !== false);
    if (!$wrote) {
      $e = error_get_last();
      if ($e) $__GOV_FETCH_DEBUG[] = array('debug_write_error' => $e);

      // data 폴더 쓰기 실패 시 임시 폴더로 저장
      $tmpPath = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'ri_portal_last_gov_fetch_debug.json';
      $wrote = (@file_put_contents($tmpPath, $debugJson, LOCK_EX) !== false);
      if ($wrote) $finalDebugPath = $tmpPath;
    }
  }

  $__GOV_FETCH_DEBUG[] = array('debug_written' => $wrote ? 1 : 0, 'debug_path' => $finalDebugPath);

  // 네트워크 실패 시: 오래된 캐시라도 있으면 사용
  if (empty($items) && file_exists($cacheFile)) {
    $raw = @file_get_contents($cacheFile);
    $data = $raw ? json_decode($raw, true) : null;
    if (is_array($data)) return array_slice($data, 0, $limit);
  }

  // 캐시 저장 (쓰기 권한 없으면 조용히 무시)
  if (!empty($items)) {
    // PHP 5.3~ 호환: JSON 옵션 상수가 없을 수 있으므로 compat.php의 ri_json_encode 사용
    @file_put_contents($cacheFile, ri_json_encode($items, false));
  }

  return $items;
}

$govPress = fetch_latest_gov_pressreleases(5);

// 정부 보도자료 실시간 가져오기 환경 점검(HTTPS wrapper 또는 cURL 필요)
$__wr = function_exists('stream_get_wrappers') ? stream_get_wrappers() : array();
$__hasHttps = is_array($__wr) ? in_array('https', $__wr) : false;
$__hasCurl  = function_exists('curl_init');
$govPressEnvError = (!$__hasHttps && !$__hasCurl)
  ? '현재 PHP 환경에서 HTTPS 요청을 할 수 없습니다(https wrapper/OpenSSL 및 cURL 모두 비활성). php.ini에서 extension=openssl, extension=curl 활성화 후 서버를 재시작하세요.'
  : '';

$auth = ri_auth_status();
$canRestricted = !empty($auth['approved']);
$view = isset($_GET['view']) ? (string)$_GET['view'] : '';
$tab = isset($_GET['tab']) ? (string)$_GET['tab'] : '';
if ($tab === '') {
  if ($view === 'reports') $tab = 'reports';
  elseif ($view === 'trends') $tab = 'trends';
  else $tab = 'institutes';
}

// 로그인 필요 탭 강제
if (($tab === 'reports' || $tab === 'trends') && !ri_is_logged_in()) {
  $ret = isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : './index.php';
  ri_redirect_login($ret);
}
// 연구보고서/연구트렌드는 로그인 사용자만 조회 가능

// Enterprise UI: page context for sidebar/header
$__page_key = $tab;
$__page_title = ($tab === 'reports') ? '연구보고서' : (($tab === 'trends') ? '연구 트렌드' : '기관');
$__page_sub = '지자체연구원 통합 포털';
$__nav_reports_class = '';
$__nav_trends_class  = '';

$view = ($view === 'reports') ? 'reports' : $view;
$defaultView = $tab;
$flash = array(
  'msg' => isset($_GET['msg']) ? (string)$_GET['msg'] : '',
  'err' => isset($_GET['err']) ? (string)$_GET['err'] : ''
);

$boot = array(
  'institutes' => $institutes,
  'reportsCount' => is_array($reports) ? count($reports) : 0,
  'auth' => $auth,
  'defaultView' => $defaultView,
  'flash' => $flash,
  'api' => array(
    'reports' => './api/national_reports.php',
    'reportsSave' => './api/reports_save.php',
    'institutes' => './api/institutes.php',
    'downloadZip' => './download.php'
  )
);
?>
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>정부출연연구기관 · 지자체연구원 통합 포털</title>
  <link rel="stylesheet" href="./assets/styles.css" />
</head>
<body>
  <input class="nav-toggle" type="checkbox" id="navToggle" />
  <div class="app-shell">
    <div class="overlay" onclick="document.getElementById('navToggle').checked=false"></div>

    <aside class="sidebar" aria-label="사이드바">
      <a class="brandmark" href="./index.php" style="text-decoration:none;color:inherit;">
        <div class="logo" aria-hidden="true"></div>
        <div class="title">
          <strong>RI Portal</strong>
          <span>지자체연구원 통합 포털</span>
        </div>
      </a>

      <div class="nav-group">
        <div class="label">메뉴</div>
        <nav class="nav">
          
          <a href="./index.php" class="<?php echo (basename($_SERVER['PHP_SELF'])==='index.php')?'active':''; ?>"><span class="dot" aria-hidden="true"></span>지자체연구기관</a>
          <a href="./national.php" class="<?php echo (basename($_SERVER['PHP_SELF'])==='national.php')?'active':''; ?>"><span class="dot" aria-hidden="true"></span>정부출연연구기관</a>
          <?php if (!empty($auth['is_admin'])): ?>
            <a href="./admin.php" class="<?php echo (basename($_SERVER['PHP_SELF'])==='admin.php')?'active':''; ?>"><span class="dot" aria-hidden="true"></span>관리자</a>
          <?php endif; ?>

        </nav>
      </div>

      <div class="sidebar-footer">
        <div>© <?php echo date('Y'); ?> RI Portal</div>
        <div class="userline">
          <?php if (!empty($auth['logged_in'])): ?>
            <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <?php echo htmlspecialchars(($auth['user']['name'] ? $auth['user']['name'] : $auth['user']['email']), ENT_QUOTES, 'UTF-8'); ?>
            </span>
            <a class="btn ghost" href="./logout.php">로그아웃</a>
          <?php else: ?>
            <span>게스트</span>
            <a class="btn ghost" href="./login.php">로그인</a>
          <?php endif; ?>
        </div>
      </div>
    </aside>

    <div class="shell-main">
      <header class="topbar" role="banner">
        <div class="left">
          <label class="icon-btn" for="navToggle" title="메뉴" aria-label="메뉴 열기">☰</label>
          <div class="page-title">
            <strong><?php echo htmlspecialchars($__page_sub, ENT_QUOTES, 'UTF-8'); ?></strong>
            <span><?php echo htmlspecialchars($__page_title, ENT_QUOTES, 'UTF-8'); ?></span>
          </div>
        </div>

        <div class="top-actions">
          <button id="themeToggle" class="btn ghost" type="button" aria-label="테마 전환">🌗</button>
          <?php if (!empty($auth['logged_in'])) : ?>
            <?php if (!empty($auth['is_admin'])) : ?>
              <a class="btn ghost" href="./change_password.php" title="비밀번호 변경">비번변경</a>
            <?php endif; ?>
            <span class="user-pill" title="<?php echo htmlspecialchars(($auth['user']['email']), ENT_QUOTES, 'UTF-8'); ?>">
              <?php echo htmlspecialchars(($auth['user']['name'] ? $auth['user']['name'] : $auth['user']['email']), ENT_QUOTES, 'UTF-8'); ?>
            </span>
          <?php else: ?>
            <a class="btn ghost" href="./login.php" title="로그인">로그인</a>
            <a class="btn ghost" href="./register.php" title="등록">등록</a>
          <?php endif; ?>
        </div>
      </header>

      <main class="content">
        <div class="container">
    <section class="tabs card">
      <button class="tab active" type="button" id="tabInstitutes" aria-controls="institutesView" aria-selected="true">기관</button>
      <button class="tab" type="button" id="tabReports" aria-controls="reportsView" aria-selected="false">연구보고서</button>
      <button class="tab" type="button" id="tabTrends" aria-controls="trendsView" aria-selected="false">연구 트렌드</button>
      <span class="tab-spacer"></span>
<!--      <button class="btn ghost small" type="button" id="syncReportsBtn">새로고침</button>
      <button class="btn ghost small" type="button" id="importReportsBtn">CSV/JSON 가져오기</button> -->
    </section>

    <!-- 기관 뷰 -->
    <section id="institutesView">
      <section class="controls card">
        <div class="row">
          <div class="field grow">
            <label for="q">검색</label>
            <input id="q" type="search" placeholder="예: 국토연구원, 산업연구원, 연구원 이름…" autocomplete="off" />
          </div>

          <div class="field">
            <label for="region">구분</label>
            <select id="region">
              <option value="ALL">전체</option>
            </select>
          </div>

          <div class="field">
            <label for="viewMode">보기</label>
            <select id="viewMode">
              <option value="ALL">전체</option>
              <option value="FAV">즐겨찾기</option>
            </select>
          </div>

          <div class="field">
            <label>&nbsp;</label>
<!--            <button id="resetBtn" class="btn ghost" type="button">초기화</button> -->
          </div>
        </div>

        <div class="chips" id="chips" aria-label="빠른 필터"></div>
        <div class="hint" id="hint"></div>
      </section>

      <section class="split">
        <section class="card">
          <div class="card-head">
            <h2>목록</h2>
            <span class="meta" id="countMeta"></span>
          </div>
          <div id="grid" class="grid" aria-live="polite"></div>
        </section>

        <aside class="card side">
          <div class="card-head">
            <h2>최신 정부 보도자료</h2>
            <a class="btn ghost small" href="https://www.korea.kr/briefing/pressReleaseList.do" target="_blank" rel="noopener noreferrer">더보기</a>
          </div>
          <div id="govPress" class="recent" aria-label="최신 정부 보도자료 5건">
            <?php if (empty($govPress)) : ?>
              <div class="hint">
                <?php if (!empty($govPressEnvError)) : ?>
                  <?php echo htmlspecialchars($govPressEnvError, ENT_QUOTES, 'UTF-8'); ?>
                  <br />
                <?php endif; ?>
                정부 보도자료를 불러오지 못했습니다. <a href="https://www.korea.kr/briefing/pressReleaseList.do" target="_blank" rel="noopener noreferrer">정책브리핑에서 확인</a>
              </div>
			  <?php if (isset($_GET['debug_gov'])) : ?>
			    <pre class="gov-debug"><?php echo htmlspecialchars(@file_get_contents(__DIR__ . '/data/last_gov_fetch_debug.json') ?: ri_json_encode($__GOV_FETCH_DEBUG, true), ENT_QUOTES, 'UTF-8'); ?></pre>
			  <?php endif; ?>
            <?php else : ?>
              <?php foreach ($govPress as $it) : ?>
                <a href="<?php echo htmlspecialchars($it['url'], ENT_QUOTES, 'UTF-8'); ?>" target="_blank" rel="noopener noreferrer">
                  <span>
                    <?php echo htmlspecialchars($it['title'], ENT_QUOTES, 'UTF-8'); ?>
                    <br />
                    <small><?php echo htmlspecialchars($it['date'], ENT_QUOTES, 'UTF-8'); ?></small>
                  </span>
                  <span class="badge"><?php echo htmlspecialchars($it['dept'], ENT_QUOTES, 'UTF-8'); ?></span>
                </a>
              <?php endforeach; ?>
            <?php endif; ?>
          </div>

          <hr class="sep" />

          <div class="card-head">
            <h2>즐겨찾기</h2>
            <button id="clearFavBtn" class="btn ghost small" type="button">전체 해제</button>
          </div>
          <div id="favList" class="recent"></div>

          <hr class="sep" />
          <details class="notes">
            <summary>메모</summary>
            <ul>
              <li>“열기”는 새 탭으로 사이트를 엽니다.</li>
              <li>별(★)을 누르면 즐겨찾기에 저장됩니다(브라우저 로컬 저장).</li>
              <li>인천연구원 링크는 제공된 URL이 일부 잘려 있어 기본 도메인으로 연결되도록 처리했습니다.</li>
              <li>연구보고서 탭에서 보고서 CSV/JSON을 가져와 목록을 관리할 수 있습니다.</li>
            </ul>
          </details>
        </aside>
      </section>
    </section>

    <!-- 연구보고서 뷰 -->
    <section id="reportsView" class="hidden">
      <?php if (!$canRestricted) : ?>
        <section class="card" style="margin-bottom:14px;">
          <div class="card-head">
            <h2>연구보고서</h2>
            <span class="meta">권한 필요</span>
          </div>
          <div class="hint" style="font-weight:700;">
            등록(관리자 승인)된 사용자만 이용할 수 있습니다.
          </div>
          <div class="row" style="gap:10px;">
            <a class="btn" href="./login.php?next=reports">로그인</a>
            <a class="btn ghost" href="./register.php">등록 요청</a>
          </div>
        </section>
      <?php endif; ?>
      <section class="controls card">
        <div class="row">
          <div class="field grow">
            <label for="rq">검색</label>
            <input id="rq" type="search" placeholder="제목/연구자/기관 검색…" autocomplete="off" />
          </div>

          <div class="field">
            <label for="rInstitute">기관</label>
            <select id="rInstitute">
              <option value="ALL">전체</option>
            </select>
          </div>

          <div class="field">
            <label for="rYear">생산년도</label>
            <select id="rYear">
              <option value="ALL">전체</option>
            </select>
          </div>

          <div class="field">
            <label for="rSort">정렬</label>
            <select id="rSort">
              <option value="YEAR_DESC">연도↓</option>
              <option value="YEAR_ASC">연도↑</option>
              <option value="TITLE_ASC">제목↑</option>
              <option value="INSTITUTE_ASC">기관↑</option>
            </select>
          </div>

          <div class="field">
            <label>&nbsp;</label>
            <button id="rResetBtn" class="btn ghost" type="button">초기화</button>
          </div>
        </div>

        <div class="hint" id="rHint"></div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>연구보고서 목록</h2>
          <div class="inline-actions">
            <span class="meta" id="syncMeta" title="자동 수집 상태"></span>
            <button id="addSampleBtn" class="btn ghost small" type="button">샘플 추가</button>
            <button id="clearReportsBtn" class="btn ghost small" type="button">목록 비우기</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="table" aria-label="연구보고서 목록 테이블">
            <thead>
              <tr>
                <th style="width:110px;">생산년도</th>
                <th>연구제목</th>
                <th style="width:220px;">연구자</th>
                <th style="width:160px;">기관</th>
                <th style="width:120px;">링크</th>
              </tr>
            </thead>
            <tbody id="reportsTbody"></tbody>
          </table>
        </div>

        <div class="empty" id="reportsEmpty"></div>
        <div class="pager" id="pager"></div>
      </section>
    </section>
        <section id="trendsView" class="hidden">
              <section class="controls card">
                <div class="row">
                  <div class="field grow">
                    <label for="t_q">제목 필터(포함 검색)</label>
                    <input id="t_q" type="search" placeholder="예: 청년, 탄소, 교통…" autocomplete="off" />
                  </div>

                  <div class="field">
                    <label for="institute">기관</label>
                    <select id="institute">
                      <option value="ALL">전체</option>
                    </select>
                  </div>

                  <div class="field">
                    <label for="yearFrom">연도(시작)</label>
                    <select id="yearFrom"></select>
                  </div>

                  <div class="field">
                    <label for="yearTo">연도(끝)</label>
                    <select id="yearTo"></select>
                  </div>

                  <div class="field">
                    <label>&nbsp;</label>
                    <button id="t_resetBtn" class="btn ghost" type="button">초기화</button>
                  </div>

                  <div class="field">
                    <label>&nbsp;</label>
                    <button id="exportBtn" class="btn" type="button">내보내기</button>
                  </div>
                </div>
                <div class="hint" id="t_hint"></div>
              </section>

              <section class="kpis">
                <div class="card kpi">
                  <div class="kpi-title">필터 결과</div>
                  <div class="kpi-value" id="kpiCount">-</div>
                  <div class="kpi-sub" id="kpiRange">-</div>
                </div>
                <div class="card kpi">
                  <div class="kpi-title">상위 키워드</div>
                  <div class="kpi-value" id="kpiTopKeyword">-</div>
                  <div class="kpi-sub" id="kpiTopKeywordSub">-</div>
                </div>
                <div class="card kpi">
                  <div class="kpi-title">상위 주제</div>
                  <div class="kpi-value" id="kpiTopTheme">-</div>
                  <div class="kpi-sub" id="kpiTopThemeSub">-</div>
                </div>
              </section>

          <section class="charts-grid">
            <section class="card chart-card">
              <div class="card-head">
                <h2>상위 키워드 (제목 기준)</h2>
                <span class="meta">막대를 클릭하면 관련 제목을 보여줍니다</span>
              </div>
              <div class="chart-wrap"><canvas id="kwChart"></canvas></div>
            </section>

            <section class="card chart-card">
              <div class="card-head">
                <h2>상위 2-그램(연속 단어)</h2>
                <span class="meta">예: “스마트 도시”, “청년 정책”</span>
              </div>
              <div class="chart-wrap"><canvas id="bgChart"></canvas></div>
            </section>

            <section class="card chart-card">
              <div class="card-head">
                <h2>주제 분포 (간단 분류)</h2>
                <span class="meta">키워드 사전 기반(편향 가능)</span>
              </div>
              <div class="chart-wrap"><canvas id="themeChart"></canvas></div>
            </section>

            <section class="card chart-card">
              <div class="card-head">
                <h2>키워드 연도별 추이 (상위 5개)</h2>
                <span class="meta">연도별 100건당 등장 횟수</span>
              </div>
              <div class="chart-wrap"><canvas id="trendChart"></canvas></div>
            </section>

            <section class="card chart-card">
              <div class="card-head">
                <h2>연도별 보고서 발행량</h2>
                <span class="meta" id="volMeta">선택한 조건에서 연도별 보고서 수</span>
              </div>
              <div class="chart-wrap"><canvas id="volChart"></canvas></div>
            </section>

            <section class="card chart-card">
              <div class="card-head">
                <h2>기관별 보고서 발행량 (Top 15)</h2>
                <span class="meta">선택한 조건에서 기관별 보고서 수</span>
              </div>
              <div class="chart-wrap"><canvas id="instChart"></canvas></div>
            </section>

            <section class="card chart-card">
              <div class="card-head">
                <h2>급상승 키워드 (Top 20)</h2>
                <span class="meta" id="riseMeta">-</span>
              </div>
              <div class="chart-wrap"><canvas id="riseChart"></canvas></div>
            </section>

            <section class="card chart-card full">
              <div class="card-head" style="align-items:flex-end; gap:10px;">
                <div>
                  <h2 id="cloudTitle">워드클라우드 (Top 50 키워드)</h2>
                  <span class="meta" id="cloudMeta">-</span>
                </div>
                <div class="inline-actions" style="align-items:flex-end;">
                  <div class="field" style="min-width:140px;">
                    <label for="cloudTopN">표시 개수</label>
                    <input id="cloudTopN" type="number" min="10" max="200" step="1" value="50" inputmode="numeric" />
                  </div>
                </div>
              </div>
              <div class="chart-wrap tall">
                <div id="cloud" style="width:100%; height:100%;"></div>
              </div>
            </section>

            <section class="card chart-card full">
              <div class="card-head">
                <h2>신규·급증 키워드 (버스트)</h2>
                <span class="meta" id="burstMeta">-</span>
              </div>
              <div class="chart-wrap"><canvas id="burstChart"></canvas></div>
              <div class="table-wrap">
                <table class="table" id="burstTable">
                  <thead>
                    <tr>
                      <th style="width:56px;">#</th>
                      <th>키워드</th>
                      <th style="width:110px;">급증 연도</th>
                      <th style="width:120px;">증가(100건당)</th>
                      <th style="width:120px;">초기(100건당)</th>
                      <th style="width:120px;">최근(100건당)</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </section>

            <section class="card chart-card full">
              <div class="card-head">
                <h2>키워드 동시출현 네트워크</h2>
                <span class="meta" id="coocMeta">-</span>
              </div>
              <div class="chart-wrap tall">
                <div id="cooc" style="width:100%; height:100%; overflow: visible;"></div>
              </div>
            </section>

            <section class="card chart-card full">
              <div class="card-head">
                <h2>기관별 키워드 프로파일 (히트맵)</h2>
                <span class="meta" id="heatMeta">-</span>
              </div>
              <div class="chart-wrap xl">
                <div id="instHeatmap" style="width:100%; height:100%;"></div>
              </div>
            </section>
          </section>

              <section class="card" style="margin-top:14px;">
                <div class="card-head">
                  <h2 id="titlesHead">관련 제목</h2>
                  <span class="meta" id="titlesMeta"></span>
                </div>
                <div class="titles" id="titles"></div>
              </section>
        </section>

  </div>
      </div>

      <script>
    // 서버에서 주입된 초기 데이터/엔드포인트 (app.js보다 먼저 정의되어야 함)
    window.__PORTAL_BOOT__ = <?php echo ri_json_encode($boot); ?>;
  </script>
  
  <script src=\"./assets/tabs_legacy.js\"></script>
<script src="./assets/app.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/d3-cloud@1/build/d3.layout.cloud.js"></script>
  <script src="./assets/trendnationalreport.js"></script>
    </div>
  </div>
</body>
</html>
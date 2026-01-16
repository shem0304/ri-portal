# 지역연구원 통합 포털 - React UI 버전(확장)

이 압축파일은 **기존 PHP 백엔드(그대로 유지)** + **React 프론트엔드(Vite + TypeScript)**로 UI를 이관한 패키지입니다.

## 구조
- `backend/` : 기존 PHP 프로젝트
  - 기존 페이지/인증/데이터/API 유지
  - 추가된 API: `backend/api/auth_status.php` (React에서 로그인 상태 확인용)
  - React 엔트리: `backend/react/index.php`
- `frontend/` : React(Vite + TypeScript) UI

## 로컬 실행(권장 흐름)

### 1) PHP 백엔드 실행
```bash
cd backend
php -S 127.0.0.1:8000 -t .
```

### 2) React 개발 서버 실행(프록시)
```bash
cd frontend
npm install
npm run dev
```
- 접속: http://127.0.0.1:5173

> 기본 프록시 대상은 `http://127.0.0.1:8000` 입니다. (환경변수 없이도 동작)
> 다른 주소/포트를 쓰려면 `VITE_PHP_TARGET`을 설정하세요.

#### Windows(CMD)
```bat
set VITE_PHP_TARGET=http://127.0.0.1:8000
npm run dev
```

#### Windows(PowerShell)
```powershell
$env:VITE_PHP_TARGET="http://127.0.0.1:8000"
npm run dev
```

## 빌드 & 간단 배포
```bash
cd frontend
npm install
npm run build
```
그 다음 생성되는 `frontend/dist`를 `backend/react/dist`로 복사:
```bash
rm -rf ../backend/react/dist
cp -r dist ../backend/react/dist
```
이후 PHP 서버를 켠 상태에서:
- http://127.0.0.1:8000/react/

## 로그인/권한
- 보고서/트렌드 API는 기존과 동일하게 로그인(및 승인) 권한을 필요로 합니다.
- React UI는 401 응답을 받으면 `login.php`로 이동합니다.

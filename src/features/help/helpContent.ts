export type HelpScreen = 'Home' | 'Library' | 'Albums' | 'Diary' | 'Memories' | 'People' | 'Characters' | 'Settings';
export type HelpContext = { screen: HelpScreen; tab: 'people' | 'pets'; selection: boolean; selectedCount: number; blocked?: boolean };
export type HelpStep = { id: string; target: HTMLElement; title: string; instruction: string };
type Meaning = { id: string; title?: string; instruction: string };
type Rule = readonly [RegExp, string, string];

const explicitContent: Record<string, { title: string; instruction: string }> = {
  'companion-ai': { title: '친구의 AI 반응', instruction: 'AI를 한 번 준비하면 캐릭터를 터치할 때 기분과 성격, 친밀도와 함께한 행동에 맞춰 새로운 말을 해요. 준비 후에는 인터넷 없이 반응하며, 글을 입력할 필요가 없어요.' },
  'companion-actions': { title: '친구와 함께하기', instruction: '친밀도는 캐릭터에게 직접 말을 걸 때만 하루 한 번 올라요. 깨어 있을 때만 오르며, 잠든 고미를 깨우는 행동은 친밀도가 1씩, 하루 최대 3까지 줄어요. 함께 쉬기는 잠을 지켜 줘요. 화면 속 행동은 실제 GPS 산책이나 음식 섭취를 뜻하지 않아요.' },
  'companion-walk': { title: '함께 산책', instruction: '친구와 산책하는 상황을 상상하며 대화를 나눠요. 실제 이동을 추적하거나 사진 위치를 읽지는 않아요.' },
  'companion-treat': { title: '작은 선물', instruction: '고미에게는 간식을, 식물 친구들에게는 햇살을 선물해요. 실제 물건이나 보상을 소비하지 않아요.' },
  'companion-pet': { title: '쓰다듬기', instruction: '친구의 성격에 따라 다른 반응을 보여요. 친밀도 상승 횟수와 성장 상태는 바꾸지 않아요.' },
  'companion-play': { title: '함께 놀기', instruction: '친구와 짧은 상상 놀이를 해요. 최근 행동과 기분을 기기 안에 기억해요.' },
  'companion-rest': { title: '함께 쉬기', instruction: '친구와 잠깐 쉬면서 활력을 회복해요. 앱의 다른 기록은 변경하지 않아요.' },
  'pet-body-region': { title: '반려동물 영역 지정', instruction: '사진에서 한 마리의 몸 전체를 드래그해 감싸세요. 드래그가 어려우면 여기서 위치와 크기를 백분율로 조절할 수 있어요. 얼굴 영역은 추가 후 인식 결과 수정에서 따로 지정해요.' },
  'pet-kind': { title: '반려동물 종류', instruction: '강아지인지 고양이인지 확인하고 잘못 분류됐다면 바꿔요. 영역 추가 또는 변경 저장을 눌러야 반영돼요.' },
  'pet-view': { title: '촬영 방향', instruction: '정면·측면·뒷모습 등 실제 촬영 방향을 골라요. 뒷모습이나 모름으로 바꾸면 얼굴 영역 선택이 해제돼요. 뒷모습은 체형과 색상을 비교해요.' },
  'pet-add-region': { title: '영역 추가', instruction: '한 마리의 몸 전체를 감싼 영역에서 특징을 추출해 인식 결과를 추가해요. 이 단계에서는 이름을 연결하지 않으며 다음 화면에서 직접 확인해요.' },
  'pet-edit-result': { title: '인식 결과 확인·수정', instruction: '찾은 동물별로 종류·촬영 방향·얼굴 영역과 이름 연결을 확인하고 고칠 수 있어요.' },
  'pet-face-region': { title: '얼굴 영역 지정', instruction: '동물의 몸 테두리 안에서 얼굴을 드래그해 감싸요. 지정 마침은 그리기를 끝내는 동작이며 변경 저장을 눌러야 반영돼요.' },
  'pet-clear-face': { title: '얼굴 영역 해제', instruction: '직접 그린 얼굴 영역을 지워요. 이름과 사진 연결을 해제하는 버튼은 아니에요. 변경 저장 전에는 기존 기록이 유지돼요.' },
  'pet-compare-face': { title: '선택한 얼굴로 후보 비교', instruction: '선택한 얼굴의 특징으로 후보를 다시 계산해요. 같은 반려동물인지 확인한 뒤 이름을 골라 변경 저장을 눌러 주세요.' },
  'pet-compare-body': { title: '뒷모습 체형·색상 다시 비교', instruction: '얼굴 대신 뒷모습의 체형과 색상으로 후보를 다시 비교해요. 같은 반려동물인지 직접 확인한 뒤 저장하세요.' },
  'pet-reject-candidate': { title: '이 후보 제외', instruction: '다른 반려동물로 보이는 후보를 제외하고 즉시 저장해요. 원본 사진이나 같은 사진의 다른 동물은 지우지 않아요. 결과 수정에서 다시 허용할 수 있어요.' },
  'pet-restore-candidates': { title: '제외한 후보 다시 보기', instruction: '이전에 제외한 이름을 다시 비교 후보로 허용해요. 이 변경은 즉시 저장돼요.' },
  'pet-assignment': { title: '인식된 반려동물', instruction: '등록 이름이나 새 이름, 미확인/연결 해제 중에서 골라요. 비슷하게 보이는 후보이므로 같은 동물인지 직접 확인한 뒤 변경 저장을 눌러 주세요.' },
  'pet-save-correction': { title: '변경 저장', instruction: '이 동물의 종류·촬영 방향·얼굴 영역과 선택한 이름 연결을 저장해요. 다른 동물과 원본 사진은 유지돼요.' },
  'pet-not-animal': { title: '반려동물 아님', instruction: '이 인식 결과를 탐지 대상에서 제외하고 이름 연결을 해제해 즉시 저장해요. 사진 자체나 다른 동물은 삭제하지 않아요.' },
  'pet-search-scope': { title: '반려동물 검색 범위', instruction: '전체 사진 또는 선택한 앨범 안에서 연결된 사진과 비슷한 모습을 찾아요. 범위를 골라도 분석은 시작 버튼을 누른 뒤 실행돼요.' },
  'pet-search-start': { title: '사진 찾기 시작', instruction: '연결한 사진을 기준으로 지정한 범위의 사진을 분석하고 비교해요. 발견된 후보는 같은 반려동물인지 직접 확인해야 해요.' },
  'pet-search-stop': { title: '찾기 중단', instruction: '사진 찾기를 멈춰요. 이미 저장한 분석 결과와 기존 사진 연결은 유지돼요.' },
  'entity-photo-choice': { title: '사진 선택', instruction: '사진을 눌러 연결할 항목을 선택하거나 해제해요. 좌우 드래그는 여러 장 선택, 위아래 이동은 스크롤이에요.' },
  'entity-photo-save': { title: '사진 저장', instruction: '선택한 사진을 이 이름에 직접 연결해 저장해요. 자동으로 감지하지 못한 사진도 직접 연결할 수 있어요. AI 감지를 실행하지 않으며 원본 사진은 그대로 유지돼요.' },
  'save-pet-assignment': { title: '이름 지정', instruction: '선택한 인식 결과를 입력하거나 고른 이름에 저장해요. 테두리가 있는 항목은 해당 동물만 연결하고, 미확인 사진은 사진 연결에 이름을 지정해요. 다른 동물과 원본은 유지돼요.' },
};

// These rules describe existing controls, not guesses based on arbitrary button text.
// Order is semantic: specific operations precede broader shared controls.
const rules: readonly Rule[] = [
  [/^인물$/, 'people-tab', '이름을 지정한 사람과 미확인 얼굴을 확인하는 탭이에요. 사진에서 사람을 찾거나 직접 사진을 연결할 수 있어요.'],
  [/^반려동물$/, 'pets-tab', '반려동물 이름과 연결한 사진을 관리하는 탭이에요. 감지한 동물은 직접 확인한 뒤 이름을 지정해요.'],
  [/^미확인 인물 다시 확인$/, 'face-review', '아직 확인하지 않은 얼굴을 등록된 인물과 비교해요. 추천 이름이 맞는지 직접 확인한 뒤 저장하세요.'],
  [/^미확인 인물(?: · \d+)?$/, 'unknown-people', '이름이 정해지지 않은 얼굴을 모아 봐요. 같은 사람의 얼굴을 선택해 이름을 지정할 수 있어요.'],
  [/^미확인 인물 선택$/, 'select-unknown-people', '이름 없는 인물 묶음을 골라요. 하단에서 선택한 묶음의 얼굴 개수를 확인하고, 함께 이름을 지정하거나 얼굴 분류에서 제외할 수 있어요.'],
  [/^다른 (?:인물|반려동물)로 변경$/, 'change-entity', '선택한 사진이나 얼굴을 다른 이름으로 옮기는 창을 열어요. 현재 대상과의 연결만 바뀌며 같은 사진의 다른 사람·반려동물과 원본은 유지돼요.'],
  [/^미확인 상태로 변경$/, 'unidentify-entity', '선택한 대상의 이름 연결을 풀고 미확인 목록으로 옮겨요. 다른 사람·반려동물의 연결과 원본 사진은 유지돼요.'],
  [/^이 (?:인물|반려동물)에서 제외$/, 'exclude-entity-photo', '현재 이름에 연결된 선택한 사진만 제외해요. 같은 사진의 다른 이름 연결과 원본은 유지돼요. 실행 전 확인창에서 취소할 수 있어요.'],
  [/^얼굴 제외$|^선택한 얼굴 제외$/, 'exclude-faces', '선택한 얼굴만 인물 분류에서 제외해요. 같은 사진의 다른 얼굴과 원본은 유지돼요. 확인 후 실행하며 제외 되돌리기로 복구할 수 있어요.'],
  [/^목록 다시 불러오기$/, 'refresh-saved-entities', '이미 저장된 결과를 다시 불러와요. 이름이나 사진 연결을 다시 저장하지 않아요. 조회에 실패하면 이 버튼으로 다시 시도할 수 있어요.'],
  [/^미확인 반려동물$/, 'unknown-pets', '아직 이름을 연결하지 않은 반려동물과 사진을 확인해요. 같은 동물인지 보고 직접 이름을 지정하세요.'],
  [/^인물 추가$/, 'add-person', '사진을 직접 골라 인물 이름에 연결해요. 얼굴을 찾지 못한 사진도 연결할 수 있어요.'],
  [/^반려동물 추가$/, 'add-pet', '이름과 사진을 골라 반려동물을 등록해요. 사진 연결만으로 자동 분석이 시작되지는 않아요.'],
  [/^반려동물 감지$/, 'run-pets', '선택한 사진에서 반려동물을 찾아요. 다른 화면을 봐도 분석은 이어지고, 진행상황 아이콘에서 확인할 수 있어요.'],
  [/사람 찾기|못 찾은 사진 다시 찾기/, 'detect-people', '등록된 사진에서 얼굴을 찾아요. 분석 중 화면을 이동해도 작업은 이어지며 진행상황에서 중단할 수 있어요.'],
  [/^선택한 반려동물 연결$/, 'link-unknown-pet', '선택한 인식 결과를 고른 기존 반려동물에 연결해요. 이름과 사진 기록은 그대로 유지돼요.'],
  [/^새 반려동물 등록$/, 'create-unknown-pet', '선택한 결과에 새 이름을 지정해 등록해요.'],
  [/^반려동물 사진 찾기$/, 'find-pet-photos', '연결한 사진의 특징과 비교해 비슷한 사진을 찾아요. 같은 반려동물인지 확인한 뒤 연결하세요.'],
  [/^사진 연결$/, 'link-photos', '이 이름에 연결할 사진을 고르거나 연결을 해제해요. 원본 사진은 그대로 유지돼요.'],
  [/^이름 변경$|^이름 지정$|^이름·사진 수정$/, 'edit-name', '이름을 입력하거나 등록된 이름을 선택하는 창을 열어요. 저장하기 전까지 기존 이름과 연결은 바뀌지 않아요.'],
  [/^추천 이름으로 저장/, 'save-candidates', '선택한 얼굴을 각각 표시된 추천 이름으로 저장해요. 후보를 바꿨다면 바꾼 이름에 연결돼요.'],
  [/^새 이름으로 등록/, 'save-new-person', '선택한 얼굴을 입력한 새 이름에 함께 연결해요. 얼굴과 이름이 맞는지 먼저 확인하세요.'],
  [/^다른 이름 지정/, 'choose-name', '선택한 얼굴에 지정할 이름을 직접 입력하거나 등록된 이름에서 선택해요.'],
  [/^인식 기준 갱신$|^연결 유지하고 재분석$/, 'refresh-pet', '기존 사진 연결은 유지하면서 등록 사진의 인식 특징을 다시 만들어요. 결과와 이름 연결을 확인하세요.'],
  [/^인물 등록 삭제$/, 'delete-person', '인물의 이름과 직접 연결한 사진 정보를 삭제해요. 얼굴은 미확인 상태로 남고 원본 사진은 보존돼요. 실행 전 확인창이 표시돼요.'],
  [/^반려동물 등록 삭제$/, 'delete-pet', '반려동물 이름과 사진 연결을 삭제해요. 인식 결과는 미확인 상태로 남고 원본 사진은 보존돼요. 실행 전 확인창이 표시돼요.'],
  [/^인물 자동 분류 초기화$/, 'reset-people', '얼굴 분석 정보와 자동 분류를 초기화해요. 직접 연결한 사진과 원본은 유지돼요. 확인창에서 취소할 수 있어요.'],
  [/^얼굴 선택하기$|^얼굴 선택$/, 'select-faces', '얼굴을 여러 개 선택해 같은 사람으로 묶거나 다른 이름으로 옮겨요. 사진 선택과는 구별돼요.'],
  [/^찾은 얼굴 모두 보기$/, 'all-faces', '분석에서 찾은 얼굴을 이름별 목록 대신 한곳에서 확인해요.'],
  [/^대표 사진 변경$/, 'change-cover', '목록의 대표로 보일 사진을 골라요. 원본과 다른 사진 연결은 그대로예요.'],
  [/^사진·영상 가져오기$|^사진 가져오기$/, 'import', '사진과 영상 또는 폴더를 골라 앱에 가져와요. 원본은 그대로 두고 앱에 복사해 보관하므로 저장 공간이 필요해요.'],
  [/^파일 선택$|^사진·영상 선택$|^갤러리에서 선택$|^갤러리 열기$/, 'choose-files', '가져올 사진과 영상을 골라요. Android 갤러리 선택 화면에서 전체 선택과 여러 항목 선택을 사용할 수 있어요.'],
  [/^폴더 선택$/, 'choose-folder', '접근을 허용한 폴더에서 사진과 영상을 가져와요. 취소하면 등록하지 않아요.'],
  [/^가져오기$|^선택하고 가져오기$/, 'start-import', '지금 설정한 방식으로 사진 선택 화면을 열어요. 선택을 마치면 앱에 복사하고 등록해요. 원본은 바뀌지 않아요.'],
  [/^가져오면서 앨범 만들기/, 'import-album', '새로 가져온 사진과 영상을 새 앨범에 함께 담아요. 앨범 제목을 입력해야 해요.'],
  [/^사진 모아보기$/, 'photo-grid', '사진과 영상을 날짜별로 둘러봐요. 사진을 누르면 상세 화면을 열고, 선택 모드에서는 여러 장을 고를 수 있어요.'],
  [/^달력보기$|^달력 보기$|^달력$/, 'calendar', '날짜별 사진과 일정, 메모를 달력에서 확인해요. 사진이 있는 날을 누르면 그날 기록을 볼 수 있어요.'],
  [/^앨범보기$|^앨범 보기$/, 'album-view', '담아 둔 사진을 책 형태의 앨범으로 감상해요.'],
  [/^선택$/, 'select', '여러 항목을 고르는 모드로 바꿔요. 항목을 눌러 선택하고 좌우로 드래그해 여러 개를 고를 수 있어요. 위아래로 밀면 스크롤해요.'],
  [/전체 선택/, 'select-all', '현재 표시된 범위의 항목을 모두 선택해요. 검색이나 필터가 적용됐다면 그 결과를 기준으로 해요. 원래 기능을 실행하려면 도움말을 종료하세요.'],
  [/^선택 해제$/, 'deselect', '현재 선택 표시를 모두 해제해요. 사진이나 연결 정보는 삭제하지 않아요.'],
  [/^선택 취소$|선택 취소$/, 'cancel-selection', '현재 목록이나 상세 화면에서 선택 모드만 끝내요. 선택한 항목을 저장하거나 삭제하지 않아요.'],
  [/^즐겨찾기$/, 'favorite', '이 사진의 하트를 켜거나 꺼요. 즐겨찾기한 사진은 즐겨찾기 모음에서 다시 찾을 수 있어요.'],
  [/^즐겨찾기만$/, 'favorite-filter', '즐겨찾기로 표시한 사진만 목록에 보여줘요. 사진을 삭제하거나 다른 사진의 하트를 바꾸지 않아요.'],
  [/^모든 기록$/, 'all-records', '월별 범위를 풀고 등록된 모든 기록을 살펴봐요.'],
  [/^검색 지우기$/, 'clear-search', '입력한 검색어만 지워요. 저장된 사진이나 기록은 바뀌지 않아요.'],
  [/검색 조건|필터/, 'filters', '종류, 별점, 즐겨찾기 등 찾을 조건을 펼치거나 접어요. 조건을 바꾸면 목록 결과가 달라져요.'],
  [/^지역 일괄 수정$/, 'bulk-region', '선택한 사진의 지역 정보를 한 번에 수정해요. 위치를 바꾸기 전 대상과 지역을 확인하세요.'],
  [/^새 앨범 만들기$|^앨범 만들기$|^새 앨범$|^여행 앨범 만들기$|^이곳의 앨범 만들기$/, 'create-album', '앨범에 담을 사진을 선택하고 제목과 표지를 정해요. 저장하면 선택한 기록을 한 권으로 모아 볼 수 있어요.'],
  [/^그날 다시$/, 'memories-rediscover', '몇 년 전 오늘과 같은 달의 사진을 다시 만나고, 함께 다녀온 여행을 펼쳐봐요.'],
  [/^시간 산책$/, 'memories-timeline', '연도와 월을 펼쳐 그날의 기록을 찾아봐요. 날짜를 모르는 기록도 따로 볼 수 있어요.'],
  [/^추억책 펼치기$/, 'memories-reader', '지금 보고 있는 추억 묶음을 책처럼 넘겨봐요. 사진을 누르면 상세 화면이 열려요.'],
  [/^여행 펼치기$/, 'memories-trip', '이 여행에 담긴 사진과 영상을 날짜순으로 펼쳐봐요. 원본과 앨범은 바뀌지 않아요.'],
  [/^사진 속 장소 찾기$/, 'memories-locations', '이미 등록된 사진의 촬영 위치를 확인해 지도에 표시해요. 원본 파일과 직접 지정한 지역은 유지해요.'],
  [/^모든 추억 보기$/, 'memories-clear-search', '검색어를 지우고 추억을 다시 펼쳐봐요. 등록한 기록은 바뀌지 않아요.'],
  [/^추억 지도$/, 'memories-map', '사진에 남긴 장소를 지도에서 찾아봐요. 지역을 누르면 그곳의 사진과 영상을 펼쳐볼 수 있어요.'],
  [/^장소 미정/, 'memories-unclassified', '촬영 위치가 없거나 확인되지 않은 기록이에요. 기록을 선택해 직접 지역을 지정할 수 있어요.'],
  [/^해외의 추억/, 'memories-overseas', '나라와 도시를 지정해 둔 해외 기록을 모아봐요. 원본 사진의 위치 정보는 바뀌지 않아요.'],
  [/^모든 기록 보기$/, 'memories-region-filters', '이 지역의 종류, 연도, 시군구와 정렬 조건을 초기화해요. 선택한 항목도 해제돼요.'],
  [/^추억 지도 다시 열기$|^이곳의 사진 다시 열기$/, 'memories-reload', '불러오지 못한 지도나 지역 목록을 다시 요청해요. 이미 저장된 기록은 유지해요.'],
  [/^그날 목록$|^여행 목록$|^시간 산책으로$|^추억 지도로$/, 'memories-back', '현재 묶음을 닫고 그 앞의 추억 목록으로 돌아가요. 등록된 기록은 그대로 남아요.'],
  [/^만들기$/, 'save-album', '입력한 제목과 설정으로 선택한 기록을 새 앨범에 담아요. 제목과 사진을 먼저 확인하세요.'],
  [/^앨범 수정$/, 'edit-album', '앨범의 제목, 표지와 담긴 기록을 수정해요. 저장하기 전까지 기존 앨범은 그대로예요.'],
  [/^앨범 저장$/, 'save-album-edit', '현재 편집한 앨범 제목과 설정을 저장해요.'],
  [/^일기 쓰기$|^첫 일기 쓰기$/, 'write-diary', '날짜와 제목, 내용을 입력하는 창을 열어요. 사진과 앨범도 함께 연결할 수 있어요.'],
  [/^일기 저장$/, 'save-diary', '입력한 날짜, 제목, 내용과 첨부 사진을 일기에 저장해요. 필수 항목을 먼저 확인하세요.'],
  [/^일기 수정$/, 'edit-diary', '저장된 일기를 열어 내용을 수정해요. 다시 저장하기 전까지 변경 사항은 확정되지 않아요.'],
  [/^전체 일기$/, 'all-diaries', '선택한 월의 범위를 풀고 모든 일기를 보여줘요.'],
  [/^사진 추가$|^일기 사진 추가$/, 'diary-photo', '일기에 사진을 첨부해요. 한 일기에 최대 여섯 장까지 담을 수 있어요.'],
  [/^앨범 연결 저장$/, 'diary-album', '선택한 일기를 지정한 앨범에 연결하거나 연결을 해제해요.'],
  [/^사진 내보내기$|^내보내기$/, 'export', '선택한 기록을 다른 위치에 저장하는 창을 열어요. 원본을 옮기거나 삭제하지 않아요.'],
  [/^원본 다운로드$/, 'download', '앱에서 보관하는 원본 파일을 기기의 저장 위치로 내보내요. 기존 기록은 그대로예요.'],
  [/^이전 페이지$|^다음 페이지$/, 'pagination', '목록의 다른 페이지로 이동해요. 선택한 항목은 페이지가 바뀌어도 유지돼요.'],
  [/^이전 달$|^다음 달$/, 'month-nav', '바로 앞이나 뒤의 달로 이동해 그 달의 기록을 살펴봐요.'],
  [/^이전$|^다음$/, 'reader-nav', '앞이나 뒤의 사진 또는 앨범 페이지를 살펴봐요. 저장된 내용은 바뀌지 않아요.'],
  [/^닫기$|^취소$|^돌아가기$|^이전 화면으로 돌아가기$/, 'close', '현재 창을 닫고 이전 화면으로 돌아가요. 아직 저장하지 않은 내용이 있다면 먼저 확인하세요.'],
  [/^인물 목록$|^인물별 보기$/, 'people-list', '인물별 목록으로 돌아가요. 저장된 이름과 연결 정보는 그대로예요.'],
  [/^반려동물 목록$/, 'pets-list', '반려동물 목록으로 돌아가요. 등록한 이름과 사진 연결은 그대로예요.'],
  [/^이름 바꾸기$/, 'rename-character', '이 친구의 별명을 바꾸는 입력칸을 열어요. 저장하면 대표 친구의 표시 이름에도 반영되며 성장과 호감도는 유지돼요.'],
  [/^지역 변경$|^지역 지정$/, 'edit-region', '이 사진의 지역을 직접 지정하는 입력칸을 열어요. 국내 시·도와 시·군·구 또는 해외 나라와 도시를 고를 수 있어요.'],
  [/^지역 저장$/, 'save-region', '선택한 지역을 앱의 기록에 저장해요. 원본 파일의 위치 정보는 바뀌지 않아요.'],
  [/^해외 지역$/, 'overseas-region', '국내 지역 대신 나라와 도시를 직접 입력하도록 바꿔요. 지역 저장을 눌러야 반영돼요.'],
  [/^[1-5]점$/, 'photo-rating', '사진의 별점을 저장해요. 별점으로 사진을 다시 찾을 수 있으며 원본 파일은 그대로 유지돼요.'],
  [/^확대 보기$/, 'zoom-viewer', '사진을 크게 보는 창을 열어요. 확대와 이동으로 자세히 살펴보고 닫으면 상세 화면으로 돌아와요.'],
  [/^확대$|^축소$|^사진 전체에 맞추기$|^100%로 복원$/, 'zoom-controls', '사진을 보는 배율을 조절해요. 확대 중에는 사진을 끌어 다른 부분을 살펴볼 수 있으며 원본은 바뀌지 않아요.'],
  [/^확대 보기 닫기$/, 'close-zoom', '확대 창을 닫고 사진 상세 화면으로 돌아가요.'],
  [/^경로 선택$/, 'export-path', '내보낼 파일을 보관할 상위 폴더를 골라요. 아직 파일을 복사하지 않으며 내보내기를 눌러야 실행돼요.'],
  [/^만나보기$/, 'meet-character', '새로 만났거나 성장한 친구를 친구들에서 확인해요. 홈에서 함께할 대표 친구도 직접 선택할 수 있어요.'],
  [/^나중에 보기$/, 'later-character', '이번 알림을 확인하고 닫아요. 발견한 친구와 성장 기록은 친구들에서 다시 볼 수 있어요.'],
  [/^대표로 설정$/, 'main-character', '이 친구를 홈과 도움말의 대표 캐릭터로 선택해요. 이름과 기존 호감도는 그대로 유지돼요.'],
  [/^친구들 보기$/, 'character-book', '발견한 친구의 현재 모습과 이름을 보고 대표 캐릭터를 바꿀 수 있어요. 친구 목록을 보는 것만으로 친밀도는 오르지 않아요.'],
  [/^사진 기록$|^사진 둘러보기$/, 'home-photos', '가져온 사진과 영상을 날짜별로 둘러보는 화면으로 이동해요.'],
  [/^내 앨범$/, 'home-albums', '저장한 앨범을 책 표지 목록에서 골라 볼 수 있어요.'],
  [/^일기장$/, 'home-diary', '일기를 쓰고 지난 기록을 날짜나 검색으로 다시 찾아요.'],
  [/^사람과 반려동물$/, 'home-people', '인물과 반려동물의 이름, 사진 연결과 미확인 항목을 관리해요.'],
  [/^추억$|^다시 찾은 추억$/, 'memories', '등록한 사진을 날짜와 장소 등으로 다시 찾아봐요.'],
  [/^지도$|^추억 지도$/, 'map', '사진의 촬영 위치를 지도에서 살펴봐요. 위치가 없는 사진은 지역 정보를 직접 지정할 수 있어요.'],
  [/^타임라인$/, 'timeline', '시간 순서대로 쌓인 사진 기록을 살펴봐요.'],
  [/^일정 등록$|^일정 추가$/, 'schedule', '날짜에 일정과 메모를 남겨요. 입력한 내용을 확인한 뒤 저장하세요.'],
  [/^설정$/, 'settings', '앱 관리와 등록 목록 관리 화면을 열어요. 데이터를 비우기 전에는 별도로 확인해요.'],
  [/^크게 보기$|^기본 크기$/, 'large-layout', '글자와 조작부의 표시 크기를 바꿔요. 저장된 기록은 바뀌지 않아요.'],
  [/^전체 메뉴$|관리$|메뉴$/, 'more', '이 항목에서 사용할 수 있는 작업 메뉴를 열어요. 도움말을 마친 뒤 메뉴를 열면 실제 가능한 작업을 다시 안내받을 수 있어요.'],
  [/^사진 제목 저장$/, 'save-photo-title', '입력한 사진 제목을 저장해요. 파일 이름과 원본 사진은 바뀌지 않아요.'],
  [/^이어서 분석$/, 'resume-analysis', '대기 중이거나 중단된 분석을 이어서 실행해요. 이미 완료된 결과는 유지돼요.'],
  [/^분석 중단$|^중단$/, 'stop-analysis', '진행 중인 분석을 멈춰요. 완료한 분석 결과는 저장돼 있어요.'],
  [/진행상황 보기/, 'analysis-progress', '진행 중이거나 대기 중인 분석의 상태를 펼쳐요. 중단과 이어서 분석도 여기서 사용할 수 있어요.'],
  [/^저장$|^변경 저장$/, 'save', '현재 창에서 입력하거나 바꾼 내용을 저장해요. 대상과 입력값을 확인한 뒤 눌러 주세요.'],
];

export function controlName(element: HTMLElement): string {
  const labels = (element as HTMLInputElement).labels;
  return (element.getAttribute('aria-label') || element.getAttribute('title')
    || (labels?.length ? Array.from(labels).map(l => l.childNodes[0]?.textContent || '').join(' ') : '')
    || element.textContent || element.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim();
}

function meaning(element: HTMLElement, root: HTMLElement, context: HelpContext): Meaning | undefined {
  const rawName = controlName(element);
  const name = element.closest('.homeShortcuts') ? rawName.replace(/ 열기$/, '') : rawName;
  const explicit = element.dataset.help;
  if (explicit && explicitContent[explicit]) return { id: explicit, ...explicitContent[explicit] };
  const named = Object.entries(explicitContent).find(([id, item]) => item.title === name && !['entity-photo-choice', 'entity-photo-save', 'save-pet-assignment', 'pet-save-correction'].includes(id));
  if (named) return { id: named[0], ...named[1] };
  if (explicit === 'import-files') return { id: explicit, title: '사진·영상', instruction: '기기의 갤러리나 파일 선택 화면에서 사진과 영상을 골라요. 원본은 그대로예요. 촬영 위치를 자동으로 남기려면 촬영 전에 카메라 위치 권한과 위치 태그를 켜야 해요. 이미 찍은 사진에 위치가 없으면 가져올 때 지역을 직접 고를 수 있어요.' };
  if (explicit === 'import-folder') return { id: explicit, title: '폴더', instruction: '선택한 폴더의 사진과 영상을 앱에 가져와요. 폴더 접근 권한을 허용해야 해요.' };
  if (name === '즐겨찾기' && element.closest('.monthRail')) return { id: 'favorite-list', instruction: '하트로 표시한 사진과 영상을 모아 봐요. 다른 사진의 즐겨찾기 상태는 바뀌지 않아요.' };
  if (element.matches('.mediaTile')) return { id: 'media-item', title: context.selection ? '사진 선택' : '사진 상세 보기', instruction: context.selection ? '사진을 눌러 선택하거나 해제해요. 좌우로 드래그해 여러 장을 고르고 위아래로 밀어 스크롤하세요.' : '사진을 누르면 상세 화면이 열려요. 즐겨찾기와 별점, 이름과 사진 연결 정보를 관리할 수 있어요.' };
  if (name === '삭제' || name === '일기 삭제' || name === '앨범 삭제' || name === '모두 비우기') {
    const scope = root.getAttribute('aria-label') || root.querySelector('h2')?.textContent || '';
    const object = name === '모두 비우기' ? '앱에 등록된 전체 사진과 영상' : /일기/.test(name + scope) ? '선택한 일기' : /앨범/.test(name) ? '선택한 앨범' : '선택한 사진과 영상';
    return { id: 'delete', instruction: `${object}의 앱 기록을 삭제해요. 원본 파일은 그대로 남아요. 실제 실행 전 확인창에서 취소할 수 있어요. 도움말 중에는 삭제되지 않아요.` };
  }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)) {
    if (/미확인 얼굴 .* 선택|번째.*선택/.test(name)) return { id: 'item-choice', title: '항목 선택', instruction: '이 항목의 선택 표시를 켜거나 꺼요. 같은 이름으로 저장할 얼굴이나 사진만 골라 주세요.' };
    if (/인물 후보/.test(name)) return { id: 'candidate', title: '추천 이름', instruction: '이 얼굴에 추천된 이름을 확인하거나 다른 후보로 바꿔요. 선택한 뒤 저장해야 연결돼요.' };
    if (/검색/.test(name)) return { id: 'search', title: name, instruction: '이 화면의 기록을 입력한 검색어로 찾아요. 검색어를 지우면 원래 목록을 다시 볼 수 있어요.' };
    if (/정렬/.test(name)) return { id: 'sort', title: name, instruction: '이름이나 날짜 등 목록의 표시 순서를 바꿔요. 저장된 기록은 바뀌지 않아요.' };
    if (/이름/.test(name)) return { id: 'name-field', title: name, instruction: '지정할 이름을 입력하거나 등록된 이름에서 골라요. 저장해야 변경 사항이 적용돼요.' };
    if (/제목/.test(name)) return { id: 'title-field', title: name, instruction: '나중에 알아볼 제목을 입력해요. 입력만으로는 저장되지 않으니 마지막에 저장 버튼을 눌러 주세요.' };
    if (/내용/.test(name)) return { id: 'body-field', title: name, instruction: '기억하고 싶은 이야기를 적어요. 작성한 내용을 남기려면 저장해 주세요.' };
    if (/배율/.test(name)) return { id: 'zoom-range', title: name, instruction: '사진을 보는 배율을 조절해요. 원본 사진의 크기나 품질은 바뀌지 않아요.' };
    if (/폴더명|내보낼 경로/.test(name)) return { id: /폴더명/.test(name) ? 'export-folder-name' : 'export-path-field', title: name, instruction: '복사본을 보관할 폴더명과 상위 경로를 정해요. 내보내기를 눌러야 파일 복사가 실행돼요.' };
    if (/날짜|일기 월|촬영 월|촬영 시작일|촬영 종료일/.test(name)) return { id: 'date-field', title: name, instruction: '달력에서 확인하거나 기록할 날짜를 골라요. 날짜를 바꾼 뒤 현재 화면의 결과를 확인하세요.' };
    if (/날씨|기분/.test(name)) return { id: 'mood-field', title: name, instruction: '이날의 날씨와 기분을 골라 일기와 함께 남길 수 있어요.' };
    if (/앨범/.test(name)) return { id: 'album-field', title: name, instruction: '이 기록을 연결할 앨범을 골라요. 변경 사항은 저장한 뒤 반영돼요.' };
    if (/지역|시·|시군|시도|^나라$|^도시$/.test(name)) return { id: 'region-field', title: name, instruction: '기록에 지정할 지역을 골라요. 촬영 위치가 없을 때 직접 지정할 수 있으며 원본 파일은 수정하지 않아요.' };
  }
  if (/^촬영 방향$|^반려동물 종류$|^인식된 반려동물$/.test(name)) {
    const id = name === '촬영 방향' ? 'pet-view' : name === '반려동물 종류' ? 'pet-kind' : 'pet-assignment';
    return { id, ...explicitContent[id] };
  }
  if (/^사진 선택| 사진 선택$/.test(name)) return { id: 'entity-photo-choice', ...explicitContent['entity-photo-choice'] };
  if (/후보 제외$|^선택한 후보 제외/.test(name)) return { id: 'pet-reject-candidate', ...explicitContent['pet-reject-candidate'] };
  if (/^반려동물 후보 /.test(name)) return { id: 'pet-assignment', ...explicitContent['pet-assignment'] };
  if (/^선택한 사진 연결/.test(name)) return { id: 'pet-connect-selected', instruction: '선택한 후보를 표시된 반려동물 이름에 연결해요. 다른 동물과 원본 사진은 그대로 유지돼요.' };
  if (/^반려동물 선택 |^반려동물 사진 상세보기/.test(name)) return { id: 'unknown-pet-item', title: '미확인 반려동물 사진', instruction: '테두리가 있으면 해당 동물을 확인하고, 미확인 사진이면 사진 연결을 확인해요. 선택 모드에서 골라 이름을 지정할 수 있어요.' };
  if (/^앨범 정보$|^사진 관리 ·/.test(name)) return { id: name.startsWith('앨범 정보') ? 'album-details' : 'album-photos', instruction: '앨범의 제목·표지 정보와 사진 관리 중 편집할 부분을 선택해요. 저장 전까지 기존 앨범은 유지돼요.' };
  if (/^앨범에서 삭제/.test(name)) return { id: 'album-remove-photo', instruction: '선택한 사진을 이 앨범에서만 제외해요. 등록한 사진과 원본 파일은 지우지 않으며 저장을 눌러야 반영돼요.' };
  if (/ 색상$|^직접 색상 선택$/.test(name)) return { id: 'album-color', title: '앨범 표지 색상', instruction: '앨범의 표지 색을 고르거나 직접 지정해요. 사진 자체의 색은 바뀌지 않으며 앨범을 저장해야 반영돼요.' };
  if (/^\d{4}년(?: \d{1,2}월)?$|^날짜 없음$/.test(name)) return { id: 'photo-month', instruction: '이 촬영 시기의 사진을 모아 봐요. 날짜 없음은 촬영 날짜를 읽지 못한 기록을 보여줘요.' };
  const rule = rules.find(([pattern]) => pattern.test(name));
  if (rule) return { id: rule[1], instruction: rule[2] };
  if (/인물.*열기|인물 사진 보기/.test(name)) return { id: 'person-card', title: '인물 사진 보기', instruction: '이 이름에 연결된 사진을 열어요. 상세 화면에서 이름과 사진 연결을 관리할 수 있어요.' };
  if (/반려동물.*열기/.test(name)) return { id: 'pet-card', title: '반려동물 사진 보기', instruction: '이 반려동물에 연결한 사진을 열어요. 이름과 사진 연결을 관리할 수 있어요.' };
  if (/앨범 열기$/.test(name)) return { id: 'album-card', title: '앨범 열기', instruction: '이 앨범을 책처럼 펼쳐요. 이전·다음으로 넘기며 담아 둔 기록을 살펴볼 수 있어요.' };
  if (/에게 말 걸기|와 이야기/.test(name)) return { id: 'character-talk', title: '친구에게 말 걸기', instruction: '친밀도는 친구마다 하루 한 번, 깨어 있을 때 말을 걸면 올라요. 잠든 고미를 계속 깨우면 친밀도가 1씩, 하루 최대 3까지 줄어요. 도움말에서는 친밀도가 변하지 않아요.' };
  return undefined;
}

export function isHelpTarget(element: HTMLElement): boolean {
  return element.isConnected && !element.matches(':disabled, [aria-disabled="true"]')
    && !element.closest('[hidden], [aria-hidden="true"], [data-help-ui], .functionHelpTrigger')
    && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';
}

export function currentHelpRoot(): HTMLElement | null {
  const layers = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"], .actionMenuPanel'))
    .filter(e => !e.closest('[data-help-ui]') && e.getClientRects().length && !e.closest('[hidden], [inert]'));
  return layers.at(-1) ?? document.querySelector<HTMLElement>('.workspace');
}

export function collectHelpSteps(root: HTMLElement, context: HelpContext): HelpStep[] {
  const seen = new Set<string>();
  const elements = root.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]):not([type="file"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"]');
  const result: HelpStep[] = [];
  for (const target of elements) {
    if (!isHelpTarget(target)) continue;
    const value = meaning(target, root, context);
    if (!value || seen.has(value.id)) continue;
    seen.add(value.id);
    const title = value.title || controlName(target);
    const aliases: Record<string, string> = { 'pet-view': '인식 결과 수정', 'pet-add-region': '반려동물 영역 지정', 'unknown-pet-item': '미확인 반려동물', 'entity-photo-save': '사진 연결', 'entity-photo-choice': '사진 연결', 'save-candidates': '미확인 인물 다시 확인' };
    const note = Array.from(root.querySelectorAll<HTMLElement>('[data-help-note]')).find(e => e.dataset.helpNote === (aliases[value.id] || title));
    const localNote = value.id === 'select-all' ? target.closest('.entitySelectionBar')?.querySelector<HTMLElement>('[data-help-note]') : null;
    const complete = ['pet-add-region', 'entity-photo-choice', 'entity-photo-save', 'save-candidates'].includes(value.id);
    const additional = (localNote ?? (!complete ? note : null))?.dataset.helpCopy?.trim();
    if (value.id === 'entity-photo-choice' && root.querySelector('.entityPhotoGrid button:disabled')) value.instruction += ' 얼굴로 이미 연결된 사진은 여기서 해제할 수 없어요.';
    if (value.id === 'select-all' && root.querySelector('.entityPhotoGrid')) value.instruction = '이 선택창의 전체 사진 목록을 선택해요. 다른 페이지의 사진도 포함해요. 얼굴로 이미 연결된 사진은 여기서 해제하지 않아요.';
    result.push({ ...value, target, title, instruction: additional ? `${value.instruction} ${additional}` : value.instruction });
  }
  // Tabs orient the user before list controls/search. Selection tools precede the records.
  const rank = (step: HelpStep) => step.id === 'people-tab' ? -3 : step.id === 'pets-tab' ? -2 : /select-all|deselect/.test(step.id) && context.selection ? -1 : step.id === 'close' ? 2 : 0;
  return result.sort((a, b) => rank(a) - rank(b));
}

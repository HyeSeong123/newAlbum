"""Run the PC training screen on this computer's loopback interface."""

import argparse
from datetime import datetime
import hashlib
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import threading
from urllib.parse import urlsplit
import uuid
import webbrowser

from examples import is_quiet_gomi, normalize_example, parse_examples

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WEB = HERE / 'studio'
RUNS = ROOT / 'local-ai/runs/own-studio'
SIZE_LIMIT = 2 * 1024 * 1024
MODEL_FILES = {'shared': 'model.json', 'dorongi': 'dorongi.json'}
DEFINITIONS = json.loads((ROOT / 'src/features/characters/data/characterDefinitions.json').read_text(encoding='utf-8'))
TRAINABLE = json.loads((ROOT / 'local-ai/characters.json').read_text(encoding='utf-8'))
CHARACTERS = {
    'shared': {row['id']: row['defaultName'] for row in DEFINITIONS
               if row['id'] in TRAINABLE and row['id'] != 'apple'},
    'dorongi': {'apple': next(row['defaultName'] for row in DEFINITIONS if row['id'] == 'apple')},
}
ACTION_LABELS = {key: value['label'] for key, value in json.loads(
    (ROOT / 'local-ai/actions.json').read_text(encoding='utf-8')).items()}
ACTION_LABELS.update({
    'touch': '말 걸기', 'meal': '밥 주기', 'treat': '간식·햇살 선물 주기',
    'first-love-meeting': '첫사랑 이야기 · 첫 만남', 'first-love-letter': '첫사랑 이야기 · 편지',
    'first-love-farewell': '첫사랑 이야기 · 작별', 'straighten-hat': '갓 매만지기 (이전 행동)',
    'training': '훈련하기',
})
for definition in DEFINITIONS:
    for activity in definition.get('specialActivities', {}).values():
        if 'scene' in activity:
            ACTION_LABELS.setdefault(activity['scene']['id'], activity['label'])


def available_actions(target, filename):
    model = json.loads((ROOT / 'src/features/characters/ownAi' / filename).read_text(encoding='utf-8'))
    actions = {character: set() for character in CHARACTERS[target]}
    for key in model['scenes']:
        character, action, *_ = key.split('|')
        if character in actions:
            actions[character].add(action)
    if target == 'dorongi':
        actions['apple'].add('training')
    return {character: sorted(ids, key=lambda name: (name != 'touch', name)) for character, ids in actions.items()}


def model_filename(target):
    if not isinstance(target, str) or target not in MODEL_FILES:
        raise ValueError('학습할 모델을 선택해 주세요.')
    return MODEL_FILES[target]


def recent_runs(directory):
    for path in sorted(directory.glob('*/job.json'), reverse=True):
        try:
            yield json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue


class TrainingJobs:
    def __init__(self, directory):
        self.directory = directory
        self.lock = threading.Lock()
        self.job = next(recent_runs(directory), None)
        if self.job and self.job['status'] in ('starting', 'running', 'stopping'):
            self.job.update(status='interrupted', error='학습 창이 종료됐습니다. 새 학습을 시작해 주세요.')
        self.process = None
        self.thread = None

    def snapshot(self):
        with self.lock:
            return self.job.copy() if self.job else None

    def save(self, directory):
        temporary = directory / 'job.tmp'
        temporary.write_text(json.dumps(self.job, ensure_ascii=False), encoding='utf-8')
        temporary.replace(directory / 'job.json')

    def start(self, target, epochs, rows):
        model_filename(target)
        if type(epochs) is not int or not 1 <= epochs <= 500:
            raise ValueError('학습 반복 횟수는 1~500 사이의 정수로 입력해 주세요.')
        if not isinstance(rows, list) or len(rows) > 5000:
            raise ValueError('추가 학습 예시는 최대 5,000건까지 넣을 수 있습니다.')
        rows = [normalize_example(row, CHARACTERS[target]) for row in rows]
        if any(is_quiet_gomi(row) for row in rows):
            raise ValueError('평소 고미는 친밀도 60 미만에서 말없이 반응합니다. 해당 예시의 친밀도나 몸 상태를 확인해 주세요.')

        with self.lock:
            if self.thread and self.thread.is_alive():
                raise ValueError('학습이 진행 중입니다. 중지하거나 끝날 때까지 기다려 주세요.')
            run_id = datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '-' + uuid.uuid4().hex[:8]
            directory = self.directory / run_id
            directory.mkdir(parents=True)
            command = [sys.executable, '-u', str(HERE / 'train.py'), '--epochs', str(epochs),
                       '--output-dir', str(directory)]
            if target == 'dorongi':
                command.append('--dorongi')
            if rows:
                extras = directory / 'examples.jsonl'
                extras.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows), encoding='utf-8')
                command.extend(['--extra', str(extras)])
            self.job = {'id': run_id, 'target': target, 'status': 'starting', 'epochs': epochs,
                        'epoch': 0, 'loss': None, 'seconds': 0, 'added': len(rows), 'directory': str(directory)}
            self.save(directory)
            self.thread = threading.Thread(target=self.run, args=(command, directory), daemon=True)
            self.thread.start()
            return self.job.copy()

    def run(self, command, directory):
        try:
            with (directory / 'training.log').open('w', encoding='utf-8') as log:
                with self.lock:
                    if self.job['status'] == 'stopping':
                        return
                    process = self.process = subprocess.Popen(
                        command, cwd=ROOT, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        encoding='utf-8', errors='replace',
                    )
                updates = {}
                with process.stdout:
                    for line in process.stdout:
                        log.write(line)
                        log.flush()
                        try:
                            event = json.loads(line)
                        except ValueError:
                            continue
                        if 'epoch' in event:
                            with self.lock:
                                self.job.update(epoch=event['epoch'], loss=event['loss'], seconds=event['seconds'])
                                if self.job['status'] == 'starting':
                                    self.job['status'] = 'running'
                        if event.get('finished'):
                            updates = event
                exit_code = process.wait()
            with self.lock:
                result = directory / MODEL_FILES[self.job['target']]
                if self.job['status'] == 'stopping':
                    return
                if exit_code or not updates or not result.is_file():
                    tail = (directory / 'training.log').read_text(encoding='utf-8').strip().splitlines()
                    self.job.update(status='failed', error=tail[-1] if tail else f'학습 프로세스 종료 코드 {exit_code}')
                    return
                if hashlib.sha256(result.read_bytes()).hexdigest() != updates['sha256']:
                    raise ValueError('학습 결과의 파일 해시가 일치하지 않습니다.')
                self.job.update(status='completed', model=result.name, rows=updates['rows'], bytes=updates['bytes'])
        except (OSError, ValueError) as error:
            with self.lock:
                if self.job['status'] != 'stopping':
                    self.job.update(status='failed', error=str(error))
        finally:
            with self.lock:
                self.process = None
                if self.job['status'] == 'stopping':
                    self.job['status'] = 'stopped'
                self.save(directory)

    def stop(self):
        with self.lock:
            if self.job and self.job['status'] in ('starting', 'running'):
                self.job['status'] = 'stopping'
                if self.process and self.process.poll() is None:
                    try:
                        self.process.terminate()
                    except ProcessLookupError:
                        pass
            return self.job.copy() if self.job else None

    def result(self, target):
        model_filename(target)
        for job in recent_runs(self.directory):
            if job['target'] == target and job['status'] == 'completed':
                file = self.directory / job['id'] / MODEL_FILES[target]
                if file.is_file():
                    return file
        raise ValueError('이 모델의 완료된 학습 결과가 없습니다.')


def compare_line(target, row, candidate):
    standard = ROOT / 'src/features/characters/ownAi' / model_filename(target)
    row = normalize_example(row, CHARACTERS[target], with_reply=False)
    bundled_node = ROOT / '.tools/android-prep/node-v24.22.3-win-x64/node.exe'
    node = str(bundled_node) if bundled_node.is_file() else shutil.which('node')
    if not node or not (ROOT / 'node_modules/typescript').is_dir():
        raise ValueError('대사 시험에는 Node.js와 프로젝트 의존성이 필요합니다. 저장소 루트에서 npm ci를 실행해 주세요.')
    command = [node, str(WEB / 'compare.mjs'), str(standard)]
    if candidate:
        command.append(str(candidate))
    try:
        result = subprocess.run(command, input=json.dumps(row, ensure_ascii=True), encoding='utf-8',
                                capture_output=True, cwd=ROOT, timeout=20, check=True)
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise ValueError('대사 시험을 실행할 수 없습니다. Node.js와 모델 파일을 확인해 주세요.') from error


class StudioHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, value, status=HTTPStatus.OK, content_type='application/json; charset=utf-8', filename=None):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.end_headers()
        if body:
            self.wfile.write(body)

    def local_request(self):
        host = f'127.0.0.1:{self.server.server_port}'
        return self.headers.get('Host') == host and self.headers.get('Origin', f'http://{host}') == f'http://{host}'

    def do_GET(self):
        if not self.local_request():
            self.respond({'error': '로컬 학습 주소로 다시 열어 주세요.'}, HTTPStatus.FORBIDDEN)
            return
        assets = {
            '/': (WEB / 'index.html', 'text/html; charset=utf-8'),
            '/style.css': (WEB / 'style.css', 'text/css; charset=utf-8'),
            '/studio.js': (WEB / 'studio.js', 'text/javascript; charset=utf-8'),
            '/gomi.webp': (ROOT / 'public/characters/gomi/retreat-look-back.webp', 'image/webp'),
        }
        path = urlsplit(self.path).path
        if path in assets:
            file, mime = assets[path]
            self.respond(file.read_bytes(), content_type=mime)
        elif path == '/api/state':
            self.respond({'job': self.server.jobs.snapshot(), 'token': self.server.token,
                          'characters': CHARACTERS, 'labels': ACTION_LABELS, 'actions': self.server.actions,
                          'numpy': self.server.numpy_ready})
        elif path in ('/api/result/shared', '/api/result/dorongi'):
            try:
                result = self.server.jobs.result(path.rsplit('/', 1)[-1])
                self.respond(result.read_bytes(), filename=result.name)
            except (OSError, ValueError) as error:
                self.respond({'error': str(error)}, HTTPStatus.NOT_FOUND)
        else:
            self.respond({'error': '페이지를 찾을 수 없습니다.'}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if (not self.local_request() or self.headers.get('X-Gomgomi-Token') != self.server.token
                or self.headers.get_content_type() != 'application/json'):
            self.respond({'error': '학습 창을 새로고침해 주세요.'}, HTTPStatus.FORBIDDEN)
            return
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= SIZE_LIMIT:
                raise ValueError('한 번에 2MB 이하의 자료를 넣어 주세요.')
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError('입력 형식을 확인해 주세요.')
            target = payload.get('target')
            if self.path == '/api/stop':
                value = self.server.jobs.stop()
            elif self.path == '/api/start':
                if not self.server.numpy_ready:
                    raise ValueError('NumPy를 설치하고 학습 창을 다시 실행해 주세요.')
                value = self.server.jobs.start(target, payload.get('epochs'), payload.get('rows'))
            elif self.path == '/api/import':
                model_filename(target)
                if not isinstance(payload.get('text'), str):
                    raise ValueError('UTF-8 JSONL 파일을 선택해 주세요.')
                value = parse_examples(payload['text'], CHARACTERS[target])
                if not value:
                    raise ValueError('입력한 파일에 학습 예시가 없습니다.')
                value = [normalize_example(row, CHARACTERS[target]) for row in value]
            elif self.path == '/api/example':
                model_filename(target)
                value = normalize_example(payload.get('row'), CHARACTERS[target])
            elif self.path == '/api/compare':
                model_filename(target)
                try:
                    candidate = self.server.jobs.result(target)
                except ValueError:
                    candidate = None
                value = compare_line(target, payload.get('row'), candidate)
            else:
                self.respond({'error': '요청을 찾을 수 없습니다.'}, HTTPStatus.NOT_FOUND)
                return
            self.respond(value)
        except (OSError, ValueError) as error:
            self.respond({'error': str(error)}, HTTPStatus.BAD_REQUEST)


def main():
    parser = argparse.ArgumentParser(description='곰고미 PC 학습실')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1', 0), StudioHandler) as server:
        server.token = secrets.token_urlsafe(32)
        server.jobs = TrainingJobs(RUNS)
        server.numpy_ready = subprocess.run([sys.executable, '-c', 'import numpy'], capture_output=True).returncode == 0
        server.actions = {
            target: available_actions(target, file)
            for target, file in MODEL_FILES.items()
        }
        url = f'http://127.0.0.1:{server.server_port}'
        print(f'곰고미 PC 학습실: {url}', flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            server.jobs.stop()
            if server.jobs.thread:
                server.jobs.thread.join()


if __name__ == '__main__':
    main()

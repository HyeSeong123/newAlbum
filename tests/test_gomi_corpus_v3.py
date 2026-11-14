"""Pure-Python corpus regressions; never opens the independent quality holdout."""
import hashlib
import json
from pathlib import Path
import sys
import re
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'local-ai'))
import build_corpus_v3 as corpus
from core import check_rows, messages_for, normalized, registries


class GomiCorpusV3Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.train, cls.validation, cls.audit = corpus.build_rows()
        cls.original = {row['id']: row for row in corpus.read_originals()}

    def test_clean_draft_and_validation_sizes(self):
        drafts = [r for r in self.train if r['source'] == corpus.DRAFT_SOURCE]
        self.assertEqual(len(drafts), 300)
        self.assertGreaterEqual(len(self.train), 500)
        self.assertLessEqual(len(self.train), 600)
        self.assertEqual(len(self.validation), 36)

    def test_explicit_roles_and_state_on_every_row(self):
        for row in self.train + self.validation:
            with self.subTest(id=row['id']):
                self.assertEqual(row['speaker'], 'gomi')
                self.assertEqual(row['recipient'], 'owner')
                self.assertIsInstance(row['sleeping'], bool)
                self.assertIn('scene', row)
                self.assertTrue(row['scene'].strip())
                self.assertIn(row['authorship'], ['agent-authored-rewrite-v3', 'user-original-verbatim', 'agent-authored-validation-v3'])

    def test_primary_nonphysical_actions_do_not_require_body_parts(self):
        for row in self.train + self.validation:
            if row.get('originalId') or row['action'] not in ['touch', 'rest', 'walk', 'play']:
                continue
            with self.subTest(id=row['id']):
                for token in ['손', '팔', '머리', '귀', '눈', '목줄', '안아', '안고']:
                    self.assertNotIn(token, row['reply'])
                self.assertIsNone(re.search(r'(?<!출)발', row['reply']))

    def test_sleep_disturbance_channels_and_roles_match(self):
        for row in self.train + self.validation:
            if not row['sleeping'] or row.get('originalId'):
                continue
            with self.subTest(id=row['id']):
                self.assertEqual(row['sleeper'], 'gomi')
                self.assertFalse(row['ownerSleeping'])
                self.assertEqual(row['energy'], 1)
                for token in ['손', '팔', '머리', '발', '귀', '안아']:
                    self.assertNotIn(token, row['reply'])
                if row['disturbance'] == 'voice':
                    self.assertEqual(row['action'], 'touch')
                    self.assertNotIn('건드', row['reply'])
                    self.assertNotIn('만지', row['reply'])
                    self.assertIn('부른다', row['scene'])
                elif row['disturbance'] == 'physical-touch':
                    self.assertEqual(row['action'], 'pet')
                    self.assertIn('쓰다듬', row['scene'])
                else:
                    self.assertEqual(row['disturbance'], 'none')
                    self.assertEqual(row['action'], 'rest')
                    self.assertEqual(row['mood'], 'sleepy')

    def test_original_replies_and_hashes_are_exact(self):
        originals = [r for r in self.train if r.get('originalId')]
        self.assertGreaterEqual(len(originals), 200)
        for row in originals:
            original = self.original[row['originalId']]
            self.assertEqual(row['reply'].encode('utf-8'), original['reply'].encode('utf-8'))
            self.assertEqual(row['originalReplySha256'], hashlib.sha256(original['reply'].encode('utf-8')).hexdigest())
            self.assertEqual(row['originalSituation'], original['situation'])

    def test_all_latest_sources_and_direct_cold_hugs_are_present(self):
        retained = {r['originalId']: r for r in self.train if r.get('originalId')}
        latest = [r for r in self.original.values() if r['kind'] == 'user-dialogue-120']
        self.assertEqual(len(latest), 120)
        self.assertTrue(all(r['id'] in retained for r in latest))
        hugs = [r for r in latest if r['section'] == 1 and ('안아' in r['reply'] or '안고' in r['reply'] or '안길' in r['reply'])]
        self.assertGreaterEqual(len(hugs), 6)
        self.assertTrue(all(retained[r['id']]['condition'] in ['cold', 'unwell'] for r in hugs))

    def test_napping_original_has_gomi_as_sleeper(self):
        naps = [r for r in self.train if r.get('originalSituation') == '집사 곁에서 낮잠을 잠']
        self.assertEqual(len(naps), 1)
        self.assertTrue(naps[0]['sleeping'])
        self.assertEqual(naps[0]['sleeper'], 'gomi')
        pillow = [r for r in self.train if r.get('originalKind') == 'user-dialogue-120' and r['originalSection'] == 4]
        self.assertEqual(len(pillow), 30)
        self.assertTrue(all(not r['sleeping'] and r['sleeper'] != 'gomi' for r in pillow))
        sleeping_owner = [r for r in pillow if r['originalSituation'] == '집사가 다시 눈을 감음']
        self.assertEqual(len(sleeping_owner), 1)
        self.assertTrue(sleeping_owner[0]['ownerSleeping'])

    def test_close_pet_keeps_choice_and_boundaries(self):
        close = [r for r in self.train if r['action'] == 'pet' and r['affection'] >= 60 and not r['sleeping'] and not r.get('originalId')]
        self.assertGreaterEqual(sum(r['responseMode'] == 'boundary' for r in close), 8)
        self.assertGreaterEqual(sum(r['responseMode'] == 'limited-permission' for r in close), 4)

    def test_original_and_v2_audits_are_complete(self):
        decisions = self.audit['originalDecisions']
        self.assertEqual({r['id'] for r in decisions}, set(self.original))
        self.assertTrue(all(r['reason'] and r['replySha256'] for r in decisions))
        v2 = corpus.read_jsonl(ROOT / 'local-ai/data/gomi-actions-v2/train.jsonl')
        self.assertEqual({r['id'] for r in self.audit['v2Decisions']}, {r['id'] for r in v2})
        self.assertTrue(all(r['reason'] for r in self.audit['v2Decisions']))

    def test_split_inputs_groups_and_replies_do_not_leak(self):
        chars, actions = registries()
        check_rows(self.train, self.validation, chars, actions)
        for field in ['group', 'reply', 'scene']:
            train = {normalized(r[field]) for r in self.train}
            validation = {normalized(r[field]) for r in self.validation}
            self.assertFalse(train & validation, field)

    def test_builder_refuses_existing_output(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(FileExistsError):
                corpus.write_corpus(Path(directory))

    def test_export_is_traceable_and_has_no_final_test_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'corpus'
            result = corpus.write_corpus(target)
            self.assertEqual(result['trainRows'], len(self.train))
            self.assertEqual(result['validationRows'], 36)
            self.assertFalse((target / 'test.json').exists())
            manifest = json.loads((target / 'manifest.json').read_text(encoding='utf-8'))
            self.assertFalse(manifest['userApproved'])
            self.assertFalse(manifest['qualityApproved'])
            for name, expected in manifest['files'].items():
                self.assertEqual(hashlib.sha256((target / name).read_bytes()).hexdigest(), expected)


if __name__ == '__main__':
    unittest.main()

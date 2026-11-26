import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'local-ai/own'))
from neural import OwnWordNet
from personality import DEFAULT_TRAITS, example_weight, import_profile, validate_profile
from studio_notebook import Notebook
from train import tier


class PersonalityChecks(unittest.TestCase):
    def test_text_and_json_import_validate_without_discarding_unspecified_fields(self):
        original = validate_profile({'description': '조용해요.', 'traits': {'세심함': 9}})
        loaded = import_profile('말투.TXT', '\ufeff무뚝뚝한 친구\n무심함: 8', original)
        self.assertEqual((loaded['description'], loaded['traits']['care'], loaded['traits']['aloofness']), ('무뚝뚝한 친구', 9, 8))
        self.assertEqual(import_profile('traits.json', '{"traits":{"친절함":1}}', loaded)['traits']['kindness'], 1)
        for filename, content in [('x.json', '{"traits":{"친절함":true}}'), ('x.txt', '세심함: 11'), ('x.json', '{}')]:
            with self.assertRaises(ValueError):
                import_profile(filename, content, original)
        self.assertEqual(original['traits']['aloofness'], 5)
        notes = import_profile('참고.md', '매우 다정하지만 무심하지 않다. 꼼꼼한 친구.\n- 세심함: 6', original)
        self.assertEqual((notes['traits']['kindness'], notes['traits']['aloofness'], notes['traits']['care']), (9, 2, 6))

    def test_strength_changes_gradient_and_is_scoped_to_matching_lines_and_character(self):
        profile = {'gomi': {'traits': DEFAULT_TRAITS.copy()}}
        row = {'characterId': 'gomi', 'reply': '고마워.'}
        weights = []
        for level in range(1, 11):
            profile['gomi']['traits']['kindness'] = level
            weights.append(example_weight(row, profile))
        self.assertEqual(weights, sorted(set(weights)))
        self.assertEqual(weights[4], 1)
        self.assertEqual(example_weight({**row, 'characterId': 'apple'}, profile), 1)
        self.assertEqual(example_weight({**row, 'styleTrait': 'care'}, profile), 1)
        model = OwnWordNet(8, 2, embedding=2, hidden=5)
        x = np.zeros((2, 4), dtype=int)
        f = np.ones((2, 1), dtype=int)
        y = np.array([4, 5])
        _, baseline = model.loss_and_gradients(x, f, y)
        _, weighted = model.loss_and_gradients(x, f, y, np.array([weights[-1], 1.]))
        self.assertLess(weighted['output.bias'][4], baseline['output.bias'][4])

    def test_five_levels_and_legacy_model_boundaries(self):
        for char in ['gomi', 'apple', 'potato']:
            values = [tier({'characterId': char, 'affection': a}, True) for a in (19,20,29,30,59,60,89,90,100)]
            self.assertEqual(values, ['distant','reserved','reserved','familiar','familiar','close','close','bonded','bonded'])
        self.assertEqual(tier({'characterId':'apple','affection':95}), 'close')

    def test_reopen_per_character_storage_and_rescore_exact_model_output(self):
        with tempfile.TemporaryDirectory() as path:
            db = Notebook(Path(path))
            db.save_profile('gomi', {'traits': {'kindness': 8}}, 0)
            db.save_draft('shared', [], 0)
            with self.assertRaises(ValueError):
                db.save_profile('gomi', {}, 0)
            with self.assertRaises(ValueError):
                db.save_draft('shared', [], 0)
            scene = {'characterId':'gomi','action':'treat'}
            first = db.generated('run-a', scene, '간식이야?')
            changed = db.generated('run-b', scene, '간식이야?')
            self.assertNotEqual(first['id'], changed['id'])
            for score in range(1, 6):
                db.rate(first['id'], score)
            reopened = Notebook(Path(path))
            self.assertEqual(reopened.history('gomi')[0]['score'], 5)
            self.assertEqual(len(reopened.history('gomi')), 1)
            self.assertFalse(reopened.history('apple'))
            self.assertEqual(reopened.generated('run-a', scene, '간식이야?')['score'], 5)
            self.assertEqual(reopened.profiles()['gomi']['traits']['kindness'], 8)
            self.assertEqual(reopened.drafts()['shared']['revision'], 1)
            with self.assertRaises(ValueError):
                db.rate('unknown', 2)

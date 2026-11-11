import importlib.util
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'local-ai'))


class LocalActionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assert_module = ROOT / 'local-ai/core.py'

    def setUp(self):
        self.assertTrue(self.assert_module.exists(), 'local action input contract is missing')
        import core
        self.core = core
        self.characters = {'gomi': {'name': '고미', 'persona': '고집이 세지만 집사를 좋아한다.'}}
        self.actions = {'pet': {'label': '쓰다듬기', 'description': '집사가 머리를 쓰다듬는다.'}}

    def test_registered_new_action_needs_no_new_code(self):
        self.actions['brush'] = {'label': '빗질하기', 'description': '집사가 털을 빗어 준다.'}
        messages = self.core.messages_for({'characterId': 'gomi', 'action': 'brush', 'affection': 75}, self.characters, self.actions)
        self.assertIn('고집이 세지만 집사를 좋아한다.', messages[0]['content'])
        self.assertIn('빗질하기', messages[1]['content'])
        self.assertIn('집사가 털을 빗어 준다.', messages[1]['content'])
        self.assertNotIn('assistant', [x['role'] for x in messages])

    def test_rejects_unknown_character_action_and_nonfinite_state(self):
        for patch in [{'action': 'unknown'}, {'characterId': 'unknown'}, {'affection': float('nan')}, {'energy': 7}]:
            row = {'characterId': 'gomi', 'action': 'pet', 'affection': 20, **patch}
            with self.assertRaises(ValueError):
                self.core.messages_for(row, self.characters, self.actions)

    def test_sleeping_scene_is_kept_without_inventing_real_events(self):
        result = self.core.messages_for({'characterId': 'gomi', 'action': 'pet', 'sleeping': True, 'mood': 'irritated'}, self.characters, self.actions)
        self.assertIn('수면 중', result[1]['content'])
        self.assertIn('현실 사건을 감지', result[0]['content'])

    def test_quiet_rest_does_not_invent_disturbed_sleep(self):
        result = self.core.messages_for({'characterId': 'gomi', 'action': 'pet', 'sleeping': True, 'mood': 'sleepy'}, self.characters, self.actions)
        self.assertIn('수면 중', result[1]['content'])
        self.assertNotIn('방해받은', result[1]['content'])

    def test_final_checkpoint_keeps_prior_weight_change_evidence(self):
        self.assertTrue(hasattr(self.core, 'training_evidence'), 'finalization must retain checkpoint evidence')
        self.assertEqual(self.core.training_evidence(['lora.A', 'lora.B'], []), ['lora.A', 'lora.B'])
        with self.assertRaises(RuntimeError):
            self.core.training_evidence([], [])

    def test_first_custom_output_can_publish_its_pointer(self):
        with tempfile.TemporaryDirectory() as folder:
            target = pathlib.Path(folder) / 'not-yet-created/runs/latest.json'
            self.core.write_json(target, {'output': 'custom-run'})
            self.assertEqual(self.core.read_json(target), {'output': 'custom-run'})

    def test_legacy_reply_and_source_are_preserved_but_prompt_is_rebuilt(self):
        row = {'id': 'pet-3-0', 'group': 'pet-3', 'kind': 'interaction', 'source': 'frozen-source', 'reply': '조금만 더.', 'prompt': '<|im_start|>system\n옛 프롬프트<|im_end|>\n<|im_start|>user\n옛 행동<|im_end|>\n<|im_start|>assistant\n'}
        converted = self.core.convert_legacy(row)
        self.assertEqual(converted['reply'], '조금만 더.')
        self.assertEqual(converted['source'], 'frozen-source')
        self.assertEqual(converted['characterId'], 'gomi')
        self.assertEqual(converted['action'], 'pet')
        self.assertEqual(converted['affection'], 75)
        self.assertNotIn('prompt', converted)

    def test_split_leakage_and_unregistered_training_action_are_rejected(self):
        row = {'id': 'a', 'group': 'a', 'characterId': 'gomi', 'action': 'pet', 'reply': '좋아.', 'source': 'test'}
        with self.assertRaisesRegex(ValueError, 'overlap'):
            self.core.check_rows([row], [{**row, 'id': 'b', 'group': 'b'}], self.characters, self.actions)
        with self.assertRaises(ValueError):
            self.core.check_rows([{**row, 'action': 'no-such-action'}], [{**row, 'id': 'b', 'group': 'b', 'reply': '쉬자.'}], self.characters, self.actions)

    def test_rejects_oversize_and_repeated_generation_without_canned_replacement(self):
        for line in ['', '가' * 51, '안녕\n설명', '<think>생각</think>안녕', '안녕 안녕 안녕 안녕']:
            self.assertFalse(self.core.valid_reply(line, []))
        self.assertFalse(self.core.valid_reply('손은 살살.', ['손은 살살.']))
        self.assertTrue(self.core.valid_reply('손은 살살. 조금만 더.', []))


if __name__ == '__main__':
    unittest.main()

import json
from pathlib import Path
import sys
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'local-ai'))
import core


class GomiQualityTests(unittest.TestCase):
    def test_curated_corpus_replaces_legacy_instead_of_appending_conflicts(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for split, line in [('train', '살살 해. 잠깐은 괜찮아.'), ('validation', '이번엔 천천히 쓰다듬어.')]:
                row = dict(id=split, group=split, characterId='gomi', action='pet', affection=25 if split == 'train' else 75, reply=line, source='test-fixture')
                (root / (split + '.jsonl')).write_text(json.dumps(row, ensure_ascii=False)+'\n', encoding='utf-8')
            try:
                train, valid, _, _ = core.load_corpus('gomi', corpus=root)
            except TypeError as exc:
                self.fail(f'curated replacement corpus unsupported: {exc}')
            self.assertEqual([x['id'] for x in train], ['train'])
            self.assertEqual([x['id'] for x in valid], ['validation'])

    def test_gomi_action_intent_and_relation_are_in_actual_prompt(self):
        chars, actions = core.registries()
        prompt = core.messages_for(dict(characterId='gomi', action='treat', affection=95), chars, actions)
        self.assertIn('먹었다고', prompt[1]['content'])
        self.assertIn('아주 친밀', prompt[1]['content'])
        self.assertIn('기쁨', core.messages_for(dict(characterId='gomi', action='play', mood='delighted'), chars, actions)[1]['content'])

    def test_sleeping_intent_does_not_push_play_or_eating(self):
        chars, actions = core.registries()
        prompt = core.messages_for(dict(characterId='gomi', action='play', sleeping=True, mood='irritated'), chars, actions)[1]['content']
        self.assertRegex(prompt,'쉬|더 자')
        self.assertNotIn('하고 싶은 놀이에는 적극적', prompt)

    def test_sleep_policy_identifies_sleeper_and_person_to_ask(self):
        chars,actions=core.registries()
        text=core.messages_for(dict(characterId='gomi',action='play',sleeping=True,mood='irritated'),chars,actions)[1]['content']
        self.assertIn('잠을 자는 쪽은 너',text)
        self.assertIn('집사에게 더 자게 해달라',text)

    def test_close_pet_goal_is_specific_but_has_no_fixed_reply(self):
        chars,actions=core.registries()
        text=core.messages_for(dict(characterId='gomi',action='pet',affection=95),chars,actions)[1]['content']
        self.assertIn('조금 더 쓰다듬어 달라',text)

    def test_sleeping_other_character_keeps_its_own_name(self):
        chars,actions=core.registries()
        text=core.messages_for(dict(characterId='potato',action='play',sleeping=True,mood='irritated'),chars,actions)[1]['content']
        self.assertNotIn('너(고미)',text)
        self.assertIn('감자',text)

    def test_sleepy_touch_does_not_invent_quiet_observer(self):
        chars,actions=core.registries()
        text=core.messages_for(dict(characterId='gomi',action='touch',sleeping=True,mood='sleepy',scene='집사가 고미를 살짝 깨웠다.'),chars,actions)[1]['content']
        self.assertNotIn('집사는 깨우지 않고',text)

    def test_clova_export_refuses_missing_mandatory_license(self):
        import export_app
        self.assertTrue(hasattr(export_app,'required_model_license'),'export must validate actual license')
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                export_app.required_model_license(dict(model='naver-hyperclovax/HyperCLOVAX-SEED-Text-Instruct-0.5B',localPath=folder))

    def test_native_prompt_preserves_utf8_and_line_endings_exactly(self):
        import evaluate_gguf
        self.assertTrue(hasattr(evaluate_gguf,'write_native_prompt'),'native tokenization needs exact prompt bytes')
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'prompt.txt'
            evaluate_gguf.write_native_prompt(path,'고미\n집사\n')
            self.assertEqual(path.read_bytes(),b'\xea\xb3\xa0\xeb\xaf\xb8\n\xec\xa7\x91\xec\x82\xac\n')

    def test_epoch_selection_keeps_best_and_first_tie(self):
        self.assertTrue(hasattr(core, 'select_epoch'), 'validation must choose the adapter before test inspection')
        rows = [{'epoch': 1, 'loss': 2.0}, {'epoch': 2, 'loss': 1.0}, {'epoch': 3, 'loss': 1.5}]
        self.assertEqual(core.select_epoch(rows)['epoch'], 2)
        with self.assertRaises(ValueError):
            core.select_epoch([{'epoch': 1, 'loss': float('nan')}])

    def test_qwen2_response_only_loss_matches_standard_masked_causal_loss(self):
        import torch
        from transformers import Qwen2Config, Qwen2ForCausalLM
        sys.path.insert(0,str(ROOT/'scripts/gomi-training'))
        from training_data import response_loss
        torch.manual_seed(4)
        model=Qwen2ForCausalLM(Qwen2Config(vocab_size=32,hidden_size=16,intermediate_size=32,
            num_hidden_layers=1,num_attention_heads=2,num_key_value_heads=1,eos_token_id=2)).eval()
        row=dict(input_ids=[1,3,4,5,2],attention_mask=[1]*5,labels=[-100,-100,-100,5,2])
        reference=model(**{k:torch.tensor([v]) for k,v in row.items()}).loss
        reference.backward()
        expected={n:p.grad.clone() for n,p in model.named_parameters() if p.grad is not None}
        model.zero_grad(set_to_none=True)
        actual=response_loss(model,row,device='cpu')
        torch.testing.assert_close(actual,reference)
        actual.backward()
        for name,param in model.named_parameters():
            if name in expected:
                torch.testing.assert_close(param.grad,expected[name],atol=1e-6,rtol=1e-5)

    def test_selected_llama_response_loss_and_gradients_match_masked_causal_loss(self):
        import torch
        from transformers import LlamaConfig, LlamaForCausalLM
        sys.path.insert(0, str(ROOT/'scripts/gomi-training'))
        from training_data import response_loss
        torch.manual_seed(5)
        model = LlamaForCausalLM(LlamaConfig(vocab_size=32, hidden_size=16,
            intermediate_size=32, num_hidden_layers=1, num_attention_heads=2,
            num_key_value_heads=1, eos_token_id=2)).eval()
        row = dict(input_ids=[1,3,4,5,2], attention_mask=[1]*5,
                   labels=[-100,-100,-100,5,2])
        reference = model(**{k: torch.tensor([v]) for k,v in row.items()}).loss
        reference.backward()
        gradients = {n: p.grad.clone() for n,p in model.named_parameters() if p.grad is not None}
        model.zero_grad(set_to_none=True)
        actual = response_loss(model, row, device='cpu')
        torch.testing.assert_close(actual, reference)
        actual.backward()
        for name, parameter in model.named_parameters():
            if name in gradients:
                torch.testing.assert_close(parameter.grad, gradients[name], atol=1e-6, rtol=1e-5)

if __name__ == '__main__':
    unittest.main()

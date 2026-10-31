import importlib.util
import pathlib
import unittest

MODULE = pathlib.Path(__file__).resolve().parents[1] / 'scripts/gomi-training/training_data.py'


class TrainingDataTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MODULE.exists(), 'training_data.py must implement response-only supervision')
        spec = importlib.util.spec_from_file_location('gomi_training_data', MODULE)
        self.data = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.data)

    def test_masks_prompt_and_supervises_reply_and_eos(self):
        ids, labels = self.data.supervised_tokens([10, 20, 30], [40, 50], 99, 6)
        self.assertEqual(ids, [10, 20, 30, 40, 50, 99])
        self.assertEqual(labels, [-100, -100, -100, 40, 50, 99])

    def test_refuses_truncation_that_would_hide_the_answer(self):
        with self.assertRaisesRegex(ValueError, 'too long'):
            self.data.supervised_tokens([10] * 6, [40], 99, 6)

    def test_rejects_empty_reply(self):
        with self.assertRaisesRegex(ValueError, 'empty'):
            self.data.supervised_tokens([10], [], 99, 6)

    def test_rejects_split_leakage(self):
        row = dict(group='touch-0', prompt='hello', reply='고미야.')
        for other in [dict(row, prompt='other'), dict(row, group='other'), dict(row, group='other', prompt='other')]:
            with self.assertRaisesRegex(ValueError, 'overlap'):
                self.data.validate_splits([row], [other])

    @unittest.skipUnless(importlib.util.find_spec('torch') and importlib.util.find_spec('transformers'), 'optional training environment')
    def test_answer_only_logits_match_standard_loss_and_gradients(self):
        self.assertTrue(hasattr(self.data, 'response_loss'), 'response_loss must avoid full prompt vocabulary logits')
        import torch
        from transformers import Qwen3Config, Qwen3ForCausalLM
        torch.manual_seed(73)
        config = Qwen3Config(vocab_size=16, hidden_size=16, intermediate_size=32,
                             num_hidden_layers=1, num_attention_heads=2, num_key_value_heads=1,
                             head_dim=8, eos_token_id=2, pad_token_id=0, use_cache=False)
        model = Qwen3ForCausalLM(config).eval()
        row = dict(input_ids=[1, 3, 4, 5, 2], labels=[-100, -100, -100, 5, 2], attention_mask=[1] * 5)
        reference = model(**{key: torch.tensor([value]) for key, value in row.items()}).loss
        reference.backward()
        gradients = {name: p.grad.clone() for name, p in model.named_parameters() if p.grad is not None}
        model.zero_grad(set_to_none=True)
        selected = self.data.response_loss(model, row, device='cpu')
        torch.testing.assert_close(reference, selected)
        selected.backward()
        for name, param in model.named_parameters():
            if name in gradients:
                torch.testing.assert_close(gradients[name], param.grad, atol=1e-6, rtol=1e-5)


class EpochSelectionTests(unittest.TestCase):
    def setUp(self):
        path = MODULE.with_name('training_metrics.py')
        self.assertTrue(path.exists(), 'best-epoch selection must be implemented')
        spec = importlib.util.spec_from_file_location('gomi_training_metrics', path)
        self.metrics = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.metrics)

    def test_chooses_best_epoch_instead_of_last_and_keeps_first_tie(self):
        records = [dict(epoch=1, loss=1.2), dict(epoch=2, loss=1.8), dict(epoch=3, loss=1.2)]
        self.assertEqual(self.metrics.best_epoch(records), records[0])
        self.assertEqual(self.metrics.best_epoch([dict(epoch=1, loss=2.0), dict(epoch=2, loss=1.0)])['epoch'], 2)
        self.assertEqual([row['epoch'] for row in records], [1, 2, 3])

    def test_nonfinite_or_empty_metrics_cannot_select_a_model(self):
        for records in [[], [dict(epoch=1, loss=float('nan'))], [dict(epoch=1, loss=float('inf'))]]:
            with self.assertRaises(ValueError):
                self.metrics.best_epoch(records)

    def test_resume_skips_only_saved_updates_including_short_final_batch(self):
        self.assertTrue(hasattr(self.metrics, 'remaining_batches'), 'resume must not repeat saved examples')
        batches = list(self.metrics.remaining_batches(345, 4, 2, 120))
        self.assertEqual(len(batches), 54)
        self.assertEqual(batches[0], (1, 132))
        self.assertEqual(batches[-1], (1, 344))
        self.assertEqual(list(self.metrics.remaining_batches(345, 4, 2, 87))[0], (1, 0))

    def test_resume_rejects_steps_outside_the_run(self):
        self.assertTrue(hasattr(self.metrics, 'remaining_batches'))
        for step in [-1, 174, 175]:
            with self.assertRaises(ValueError):
                list(self.metrics.remaining_batches(345, 4, 2, step))

    def test_initial_adapter_rejects_different_model_or_lora_layout(self):
        self.assertTrue(hasattr(self.metrics, 'validate_initial_adapter'))
        model = 'Qwen/Qwen3-4B-Instruct-2507'
        config = dict(base_model_name_or_path=model, peft_type='LORA', task_type='CAUSAL_LM',
                      r=8, lora_alpha=16, target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj'])
        self.metrics.validate_initial_adapter(config, model)
        for bad in [dict(config, base_model_name_or_path='Qwen/Qwen3-1.7B'), dict(config, r=16),
                    dict(config, target_modules=['q_proj']), dict(config, peft_type='OTHER')]:
            with self.assertRaises(ValueError):
                self.metrics.validate_initial_adapter(bad, model)


if __name__ == '__main__':
    unittest.main()

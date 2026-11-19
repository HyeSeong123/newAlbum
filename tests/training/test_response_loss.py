"""CPU loss/gradient checks; run with tests/training/requirements.txt."""
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[2]


class ResponseLossTests(unittest.TestCase):
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

import importlib.util
from pathlib import Path
import unittest
import numpy as np

source=Path(__file__).resolve().parents[1]/'local-ai/own/neural.py'
spec=importlib.util.spec_from_file_location('own_neural',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class OwnLearningChecks(unittest.TestCase):
    def setUp(self):
        self.model=module.OwnWordNet(10,4,seed=7,embedding=3,hidden=5)
        self.x=np.asarray([[0,1,2,1],[0,3,2,3]],np.int32)
        self.f=np.asarray([[0,1],[2,3]],np.int32)
        self.y=np.asarray([4,5],np.int32)

    def test_manual_gradients_agree_with_independent_finite_differences(self):
        _,gradients=self.model.loss_and_gradients(self.x,self.f,self.y)
        for name,index in [('tokens.weight',(1,1)),('features.weight',(0,1)),
                           ('feature_bias.weight',(0,4)),('hidden.weight',(2,3)),
                           ('hidden.bias',(2,)),('output.weight',(4,2)),('output.bias',(4,))]:
            original=float(self.model.params[name][index]);epsilon=0.001
            self.model.params[name][index]=original+epsilon
            above,_=self.model.loss_and_gradients(self.x,self.f,self.y)
            self.model.params[name][index]=original-epsilon
            below,_=self.model.loss_and_gradients(self.x,self.f,self.y)
            self.model.params[name][index]=original
            self.assertAlmostEqual(float(gradients[name][index]),(above-below)/(2*epsilon),delta=0.002,msg=name)

    def test_own_optimizer_learns_without_loading_a_checkpoint(self):
        before,_=self.model.loss_and_gradients(self.x,self.f,self.y)
        for _ in range(80):
            _,gradients=self.model.loss_and_gradients(self.x,self.f,self.y)
            self.model.step(gradients,0.01)
        after,_=self.model.loss_and_gradients(self.x,self.f,self.y)
        self.assertLess(after,before/2)

if __name__=='__main__':unittest.main()

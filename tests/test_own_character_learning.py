import importlib.util
from pathlib import Path
import unittest
import numpy as np
import sys

source=Path(__file__).resolve().parents[1]/'local-ai/own/neural.py'
spec=importlib.util.spec_from_file_location('own_neural',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
sys.path.insert(0,str(source.parent))
try:
    training_spec=importlib.util.spec_from_file_location('own_training',source.with_name('train.py'))
    training=importlib.util.module_from_spec(training_spec);training_spec.loader.exec_module(training)
finally:
    sys.path.pop(0)

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

class OwnTrainingContextChecks(unittest.TestCase):
    def test_sleepy_and_exhausted_food_have_distinct_learnable_features(self):
        row={'characterId':'gomi','action':'treat','affection':75,'sleeping':True,'energy':1}
        self.assertIn('energy:low',training.features(row))
        self.assertIn('scenario:treat/asleep/normal/low',training.features(row))
        self.assertIn('energy:exhausted',training.features({**row,'energy':0}))
        self.assertNotEqual(training.scene(row),training.scene({**row,'energy':0}))

    def test_sentence_boundary_keeps_the_previous_spoken_word_history(self):
        row={'characterId':'gomi','action':'treat','affection':75,'sleeping':True,'energy':1,'reply':'졸려. 간식은 먹을래.'}
        tok={'<bos>':0,'<eos>':1,'<pad>':2,'<unk>':3,'졸려':4,'.':5,'간식은':6,'먹을래':7}
        fmap={name:index for index,name in enumerate(training.features(row))}
        x,_,y=training.training_examples([row],tok,fmap)
        self.assertEqual(x[list(y).index(6)].tolist(),[0,0,4,5])
        self.assertEqual(y[-1],1)

    def test_learning_support_cannot_share_a_food_scene_with_a_play_invitation(self):
        food={'characterId':'gomi','action':'treat','affection':75,'sleeping':True,'energy':1,'reply':'간식은 먹을래.','meaning':'eat'}
        play={**food,'action':'play','sleeping':False,'energy':3,'reply':'같이 놀자.','meaning':'play'}
        tok={'<bos>':0,'<eos>':1,'<pad>':2,'<unk>':3,'간식은':4,'먹을래':5,'.':6,'같이':7,'놀자':8}
        grammars,scenes=training.learned_support([food,play],tok)
        ids=scenes['gomi|treat|close|asleep|normal|low']
        next_words={word for index in ids for a,b,words in grammars[index] if (a,b)==(0,0) for word in words}
        self.assertEqual(next_words,{4})

if __name__=='__main__':unittest.main()

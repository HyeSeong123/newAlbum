import pathlib
import sys
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'local-ai'))
import core

class GomiSelectionV3Tests(unittest.TestCase):
    def test_continuation_keeps_start_when_every_trained_epoch_regresses(self):
        self.assertTrue(hasattr(core,'select_adapter'),'starting adapter must be an eligible validation candidate')
        start={'epoch':0,'step':0,'loss':1.908345,'adapter':'original'}
        later=[{'epoch':1,'step':102,'loss':1.970688,'adapter':'later'}]
        self.assertEqual(core.select_adapter(later,start),start)

    def test_continuation_can_select_a_trained_improvement(self):
        self.assertTrue(hasattr(core,'select_adapter'),'validation selection API missing')
        start={'epoch':0,'step':0,'loss':2.0,'adapter':'original'}
        later=[{'epoch':1,'step':102,'loss':1.5,'adapter':'improved'}]
        self.assertEqual(core.select_adapter(later,start),later[0])

    def test_close_affection_does_not_force_petting_pleasure(self):
        chars,actions=core.registries()
        content=core.messages_for(dict(characterId='gomi',action='pet',affection=95),chars,actions)[1]['content']
        self.assertNotIn('손길을 좋아한다',content)
        self.assertIn('불편하면',content)

    def test_scene_condition_priority_and_speaker_are_explicit(self):
        chars,actions=core.registries()
        messages=core.messages_for(dict(characterId='gomi',action='scene',affection=95,
            scene='집사가 잠들어 있고 고미는 깨어 있다.'),chars,actions)
        content='\n'.join(x['content'] for x in messages)
        self.assertIn('말하는 쪽은 고미',content)
        self.assertIn('장면의 추위·아픔·수면 상태가 일반 성격보다 우선',content)

if __name__=='__main__':
    unittest.main()

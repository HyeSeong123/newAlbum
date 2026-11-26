"""First-party forward pass, backpropagation and AdamW for the word network.

NumPy supplies matrix arithmetic, not a pretrained model or an AI engine.
The Android app uses its separate first-party TypeScript implementation.
"""
import math
import numpy as np


class OwnWordNet:
    def __init__(self, vocab, feature_count, seed=20261115, embedding=24, hidden=112):
        self.rng=np.random.default_rng(seed)
        self.feature_count=feature_count
        self.params={
            'tokens.weight':self.rng.normal(0,0.5,(vocab,embedding)).astype(np.float32),
            'features.weight':self.rng.normal(0,0.5,(feature_count,embedding)).astype(np.float32),
            'feature_bias.weight':np.zeros((feature_count,vocab),np.float32),
            'hidden.weight':self.rng.normal(0,1/math.sqrt(embedding*5),(hidden,embedding*5)).astype(np.float32),
            'hidden.bias':np.zeros(hidden,np.float32),
            'output.weight':self.rng.normal(0,1/math.sqrt(hidden),(vocab,hidden)).astype(np.float32),
            'output.bias':np.zeros(vocab,np.float32),
        }
        self.first={name:np.zeros_like(value) for name,value in self.params.items()}
        self.second={name:np.zeros_like(value) for name,value in self.params.items()}
        self.steps=0

    def loss_and_gradients(self,x,features,targets,sample_weights=None):
        p=self.params;n=len(x);count=features.shape[1]
        indicator=np.zeros((n,self.feature_count),np.float32)
        np.add.at(indicator,(np.arange(n)[:,None],features),1)
        merged=np.concatenate([p['tokens.weight'][x].reshape(n,-1),indicator@p['features.weight']/count],axis=1)
        hidden=np.tanh(merged@p['hidden.weight'].T+p['hidden.bias'])
        scores=hidden@p['output.weight'].T+p['output.bias']+(indicator@p['feature_bias.weight'])/count
        scores-=scores.max(axis=1,keepdims=True)
        probabilities=np.exp(scores)
        probabilities/=probabilities.sum(axis=1,keepdims=True)
        losses=-np.log(np.maximum(probabilities[np.arange(n),targets],1e-30))
        loss=float(np.average(losses, weights=sample_weights))
        probabilities[np.arange(n),targets]-=1
        delta=probabilities/n if sample_weights is None else probabilities*(sample_weights/sample_weights.sum())[:,None]
        dh=(delta@p['output.weight'])*(1-hidden*hidden)
        dx=dh@p['hidden.weight']
        embedding=p['tokens.weight'].shape[1]
        gradients={
            'output.weight':delta.T@hidden,'output.bias':delta.sum(axis=0),
            'hidden.weight':dh.T@merged,'hidden.bias':dh.sum(axis=0),
            'features.weight':indicator.T@dx[:,-embedding:]/count,
            'feature_bias.weight':indicator.T@delta/count,
            'tokens.weight':np.zeros_like(p['tokens.weight']),
        }
        np.add.at(gradients['tokens.weight'],x.reshape(-1),dx[:,:-embedding].reshape(-1,embedding))
        return loss,gradients

    def step(self,gradients,learning_rate,weight_decay=0.005):
        norm=math.sqrt(sum(float(np.sum(value*value)) for value in gradients.values()))
        clip=min(1.0,1.0/(norm+1e-12));self.steps+=1
        first_correction=1-0.9**self.steps;second_correction=1-0.999**self.steps
        for name,value in self.params.items():
            gradient=gradients[name]*clip
            self.first[name]*=0.9;self.first[name]+=0.1*gradient
            self.second[name]*=0.999;self.second[name]+=0.001*gradient*gradient
            value*=1-learning_rate*weight_decay
            value-=learning_rate*(self.first[name]/first_correction)/(np.sqrt(self.second[name]/second_correction)+1e-8)

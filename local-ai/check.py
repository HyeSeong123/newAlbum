from core import HERE, load_corpus,read_json

if __name__ == '__main__':
    config=read_json(HERE/'preferred-training.json') if (HERE/'preferred-training.json').exists() else {}
    train, validation, characters, actions = load_corpus(corpus=HERE/config['corpus'] if config else None)
    print(dict(train=len(train), validation=len(validation), characters=len(characters), actions=len(actions)))

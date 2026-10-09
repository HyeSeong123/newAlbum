# Test Images

`pet-dog.jpg`: Darknet's public dog detection sample, downloaded from
https://github.com/pjreddie/darknet/blob/master/data/dog.jpg
Used only for local object-detection regression tests, never as application sample data.

`pet-cat.jpg`: Martin Vorel, “A white cat walking towards the photographer”,
14 September 2017, CC0 1.0. Local detection regression only (not training).
Source: https://libreshot.com/white-cat/
License record: https://commons.wikimedia.org/wiki/File:A_white_cat_walking_towards_the_photographer.jpg
Thumbnail: https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c1/A_white_cat_walking_towards_the_photographer.jpg/960px-A_white_cat_walking_towards_the_photographer.jpg

`pet-cat-front.jpg`: FahimHP, “Cat on home”, 30 November 2022, CC0 1.0.
Local detection regression only (not training).
Source and license: https://commons.wikimedia.org/wiki/File:Cat_on_home.jpg
Thumbnail: https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5b/Cat_on_home.jpg/500px-Cat_on_home.jpg

The white-cat fixture is a known detection miss of SSDLite at the configured
0.55 threshold. It remains in the smoke test and its result is reported; no
identity is auto-linked. The positive fixture does not erase this limitation.

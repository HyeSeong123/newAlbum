#include "model_session.h"
#include <cassert>
#include <memory>
#include <stdexcept>
#include <string>

struct Model { int id; };
int freed = 0;
void destroy(Model *value) { if (value) { ++freed; delete value; } }
int main() {
    CompanionModelSession<Model> session(destroy);
    int loads = 0;
    auto load = [&] { return new Model{++loads}; };
    auto *first = session.acquire("shared.gguf", load);
    assert(first && loads == 1 && session.resident());
    // Character identity and each request's context stay outside the shared model key.
    for (const auto *character : {"gomi", "potato", "peach", "gomi"}) {
        (void)character;
        assert(session.acquire("shared.gguf", load) == first);
    }
    assert(loads == 1 && freed == 0);
    session.release();
    assert(!session.resident() && freed == 1);
    assert(session.acquire("shared.gguf", load)->id == 2);
    assert(session.acquire("upgrade.gguf", load)->id == 3 && freed == 2);
    session.release();
    assert(!session.acquire("bad.gguf", [] { return static_cast<Model *>(nullptr); }));
    assert(!session.resident());
    try { session.acquire("oom.gguf", []() -> Model * { throw std::bad_alloc(); }); assert(false); }
    catch (const std::bad_alloc &) { assert(!session.resident()); }
    assert(session.acquire("shared.gguf", load)->id == 4);
    CompanionPhaseDeadline budget(1000);
    assert(!budget.expired(180999));
    assert(budget.expired(181000));
    // A slow first load must not consume the subsequent generation budget.
    budget.beginGeneration(150000);
    assert(!budget.expired(269999));
    assert(budget.expired(270000));
    session.release();
    assert(freed == 4);
}
